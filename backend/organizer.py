import csv
from io import StringIO
from typing import Annotated

from fastapi import APIRouter, Query, Response

from .auth import CurrentUser
from .database import Db, Row
from .errors import forbidden, invalid, not_found
from .events import can_scan_event, get_counts, is_volunteer, require_organizer
from .question_answers import get_answer_label
from .schemas import (
    Attendee,
    Attendees,
    DashboardStats,
    Question,
    Volunteer,
    VolunteerRequest,
)

router = APIRouter(prefix="/events/{event_id}", tags=["Организатор"])
ATTENDEE_STATUS = {"used": "present", "active": "expected", "cancelled": "cancelled"}


@router.get("/stats")
def get_stats(event_id: str, database: Db, user: CurrentUser) -> DashboardStats:
    event = require_organizer(database, event_id, user, published=True)
    counts = get_counts(database, event_id)
    registered = counts["registered_count"]
    checked_in = counts["checked_in_count"]
    return DashboardStats(
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
) -> Attendees:
    require_organizer(database, event_id, user, published=True)
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
        items=[build_attendee(ticket) for ticket in rows if ticket["id"]],
        total=rows[0]["total"],
        page=page,
        page_size=page_size,
    )


def safe_csv_cell(value: str) -> str:
    if value.startswith(("\t", "\r", "\n")) or value.lstrip().startswith(
        ("=", "+", "-", "@")
    ):
        return "'" + value
    return value


@router.get("/attendees/export", response_class=Response)
def export_attendees(event_id: str, database: Db, user: CurrentUser) -> Response:
    event = require_organizer(database, event_id, user, published=True)
    raw_questions = event["questions"]
    assert isinstance(raw_questions, list)
    questions = [Question.model_validate(question) for question in raw_questions]
    tickets = database.execute(
        "SELECT * FROM tickets WHERE event_id = %s ORDER BY created_at, id", (event_id,)
    ).fetchall()
    headings = {question.id: question.label for question in questions}
    for ticket in tickets:
        for recorded in ticket["answer_labels"]:
            headings.setdefault(recorded["id"], recorded["label"])

    output = StringIO(newline="")
    writer = csv.writer(output, delimiter=";")
    writer.writerow(
        [
            "Билет",
            "ФИО",
            "Email",
            "Статус",
            "Время чекина",
            *map(safe_csv_cell, headings.values()),
        ]
    )
    status_labels = {
        "present": "Присутствует",
        "expected": "Ожидается",
        "cancelled": "Отменён",
    }
    questions_by_id = {question.id: question for question in questions}
    for ticket in tickets:
        attendee = build_attendee(ticket)
        display_answers = {
            question_id: get_answer_label(questions_by_id[question_id], answer)
            for question_id, answer in attendee.answers.items()
            if question_id in questions_by_id
        }
        display_answers.update(
            {recorded["id"]: recorded["answer"] for recorded in ticket["answer_labels"]}
        )
        row = [
            attendee.ticket_code,
            attendee.full_name,
            attendee.email,
            status_labels[attendee.status],
            attendee.checked_in_at.isoformat() if attendee.checked_in_at else "",
            *(display_answers.get(question_id, "") for question_id in headings),
        ]
        writer.writerow(map(safe_csv_cell, row))
    return Response(
        output.getvalue().encode("utf-8-sig"),
        media_type="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="attendees.csv"',
            "Cache-Control": "no-store",
        },
    )


@router.get("/volunteers")
def list_volunteers(event_id: str, database: Db, user: CurrentUser) -> list[Volunteer]:
    require_organizer(database, event_id, user, published=True)
    rows = database.execute(
        """SELECT user_id, public_id, full_name, email, granted_at FROM volunteers
           JOIN users ON users.id = volunteers.user_id WHERE event_id = %s ORDER BY granted_at""",
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
    return Volunteer.model_validate({**target, **volunteer})


@router.delete("/volunteers/{volunteer_id}", status_code=204)
def revoke_volunteer(
    event_id: str, volunteer_id: str, database: Db, user: CurrentUser
) -> None:
    require_organizer(database, event_id, user, lock=True, published=True)
    database.execute(
        "DELETE FROM volunteers WHERE event_id = %s AND user_id = %s",
        (event_id, volunteer_id),
    )
