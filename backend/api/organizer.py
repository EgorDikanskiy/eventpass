from datetime import UTC, datetime
from hashlib import sha256
from typing import Annotated

from fastapi import APIRouter, Query, Response

from backend.api.auth import CurrentUser
from backend.api.errors import ApiError, forbidden, invalid, not_found
from backend.api.events import (
    can_scan_event,
    get_counts,
    is_volunteer,
    require_organizer,
)
from backend.infrastructure.database import Db, Row
from backend.models.schemas import (
    Attendee,
    Attendees,
    DashboardStats,
    Volunteer,
    VolunteerRequest,
)
from backend.services.attendee_export import XLSX_MIME, ExportFormat, render_export

router = APIRouter(prefix="/events/{event_id}", tags=["Организатор"])
ATTENDEE_STATUS = {"used": "present", "active": "expected", "cancelled": "cancelled"}


def get_revision(event: Row) -> str:
    return sha256(f"{event['id']}:{event['attendee_revision']}".encode()).hexdigest()


@router.get("/stats")
def get_stats(event_id: str, database: Db, user: CurrentUser) -> DashboardStats:
    event = require_organizer(database, event_id, user, published=True, share=True)
    counts = get_counts(database, event_id)
    registered = counts["registered_count"]
    checked_in = counts["checked_in_count"]
    return DashboardStats(
        revision=get_revision(event),
        registered=registered,
        capacity=event["capacity"],
        checked_in=checked_in,
        not_checked_in=registered - checked_in,
    )


def build_attendee(ticket: Row) -> Attendee:
    return Attendee.model_validate(
        {
            "ticket_id": ticket["id"],
            "ticket_code": ticket["code"],
            "full_name": ticket["holder_name"],
            "email": ticket["holder_email"],
            "status": ATTENDEE_STATUS[str(ticket["status"])],
            "checked_in_at": ticket["checked_in_at"],
            "answers": ticket["answers"],
        }
    )


@router.get("/attendees")
def list_attendees(
    event_id: str,
    database: Db,
    user: CurrentUser,
    search: Annotated[str, Query(max_length=300)] = "",
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
    revision: Annotated[str | None, Query(max_length=64)] = None,
) -> Attendees:
    event = require_organizer(database, event_id, user, published=True, share=True)
    current_revision = get_revision(event)
    if revision is not None and revision != current_revision:
        raise ApiError(409, "STALE_PAGE", "Список изменился. Обновите первую страницу")
    pattern = (
        "%"
        + search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        + "%"
    )
    rows = database.execute(
        """WITH matching AS (
               SELECT * FROM tickets WHERE event_id = %s AND status <> 'cancelled'
                 AND (holder_name ILIKE %s OR holder_email ILIKE %s OR code ILIKE %s)
           ), selected AS (
               SELECT * FROM matching ORDER BY checked_in_at DESC NULLS LAST, created_at, id
               LIMIT %s OFFSET %s
           )
           SELECT selected.*, totals.total FROM (SELECT count(*) AS total FROM matching) AS totals
           LEFT JOIN selected ON true ORDER BY checked_in_at DESC NULLS LAST, created_at, id""",
        (event_id, pattern, pattern, pattern, page_size, (page - 1) * page_size),
    ).fetchall()
    return Attendees(
        revision=current_revision,
        items=[build_attendee(ticket) for ticket in rows if ticket["id"]],
        total=rows[0]["total"],
        page=page,
        page_size=page_size,
    )


@router.get(
    "/attendees/export",
    response_class=Response,
    responses={
        200: {
            "content": {"text/csv": {}, XLSX_MIME: {}},
        }
    },
)
def export_attendees(
    event_id: str,
    database: Db,
    user: CurrentUser,
    format: ExportFormat = "csv",
) -> Response:
    event = require_organizer(database, event_id, user, published=True, share=True)
    snapshot_at = datetime.now(UTC)
    tickets = database.execute(
        """SELECT tickets.*, COALESCE(tickets.checker_name, users.full_name) AS checker
           FROM tickets LEFT JOIN users ON users.id = tickets.checked_in_by
           WHERE event_id = %s ORDER BY created_at, tickets.id""",
        (event_id,),
    ).fetchall()
    return Response(
        render_export(event, tickets, snapshot_at, format),
        media_type=XLSX_MIME if format == "xlsx" else "text/csv",
        headers={"Content-Disposition": f'attachment; filename="attendees.{format}"'},
    )


def get_volunteer_checkins(database: Db, event_id: str, user_id: str) -> int:
    result = database.execute(
        """SELECT count(*) AS count FROM scans
           WHERE event_id = %s AND scanned_by = %s AND result = 'allowed'""",
        (event_id, user_id),
    ).fetchone()
    assert result is not None
    return result["count"]


@router.get("/volunteers")
def list_volunteers(event_id: str, database: Db, user: CurrentUser) -> list[Volunteer]:
    require_organizer(database, event_id, user, published=True)
    rows = database.execute(
        """SELECT user_id, public_id, full_name, email, granted_at,
                  (SELECT count(*) FROM scans WHERE scans.event_id = volunteers.event_id
                   AND scanned_by = user_id AND result = 'allowed') AS checked_in_count
           FROM volunteers JOIN users ON users.id = volunteers.user_id
           WHERE event_id = %s ORDER BY granted_at, user_id""",
        (event_id,),
    ).fetchall()
    return [Volunteer.model_validate(row) for row in rows]


@router.post("/volunteers", status_code=201)
def grant_volunteer(
    event_id: str, body: VolunteerRequest, database: Db, user: CurrentUser
) -> Volunteer:
    event = require_organizer(database, event_id, user, lock=True, published=True)
    if not can_scan_event(event):
        raise forbidden("Мероприятие завершилось, выдача прав закрыта")
    identifier = body.identifier.removeprefix("#").strip().lower()
    target = database.execute(
        "SELECT * FROM users WHERE public_id = %s OR email = %s",
        (identifier, identifier),
    ).fetchone()
    if not target:
        raise not_found(
            "Пользователь не найден. Попросите его зарегистрироваться в EventPass"
        )
    if target["id"] == user["id"]:
        raise invalid(
            "Организатор уже может сканировать билеты",
            {"identifier": "У организатора уже есть доступ"},
        )
    if is_volunteer(database, event_id, target["id"]):
        raise invalid(
            "Права уже выданы", {"identifier": "Этот пользователь уже волонтёр"}
        )
    volunteer = database.execute(
        "INSERT INTO volunteers (event_id, user_id) VALUES (%s, %s) RETURNING user_id, granted_at",
        (event_id, target["id"]),
    ).fetchone()
    assert volunteer is not None
    return Volunteer.model_validate(
        {
            **target,
            **volunteer,
            "checked_in_count": get_volunteer_checkins(
                database, event_id, target["id"]
            ),
        }
    )


@router.delete("/volunteers/{volunteer_id}", status_code=204)
def revoke_volunteer(
    event_id: str, volunteer_id: str, database: Db, user: CurrentUser
) -> None:
    require_organizer(database, event_id, user, lock=True, published=True)
    database.execute(
        "DELETE FROM volunteers WHERE event_id = %s AND user_id = %s",
        (event_id, volunteer_id),
    )
