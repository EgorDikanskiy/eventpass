from fastapi import APIRouter, Request

from backend.api.auth import CurrentUser
from backend.api.errors import ApiError, forbidden
from backend.api.events import build_summary, can_scan_event, get_event, is_volunteer
from backend.infrastructure.database import Database, Db, Row
from backend.infrastructure.rate_limits import check_rate_limit
from backend.models.schemas import (
    EventRole,
    ScanLogItem,
    ScannerInfo,
    ScanRequest,
    ScanResult,
)
from backend.services.commands import Command, IdempotencyKey
from backend.services.event_rules import get_event_status

router = APIRouter(prefix="/events/{event_id}", tags=["Сканер"])


def require_scanner_role(
    database: Database, event: Row, user: Row, *, active: bool = True
) -> EventRole:
    if event["organizer_id"] == user["id"]:
        role = "organizer"
    elif is_volunteer(database, event["id"], user["id"]):
        role = "volunteer"
    else:
        raise forbidden("Права на сканирование отозваны или не выдавались")
    if active and not can_scan_event(event):
        if get_event_status(event) == "finished":
            raise ApiError(403, "EVENT_FINISHED", "Мероприятие завершено")
        raise forbidden("Сканер доступен только для действующего мероприятия")
    return role


@router.get("/scanner")
def get_scanner(event_id: str, database: Db, user: CurrentUser) -> ScannerInfo:
    event = get_event(database, event_id)
    role = require_scanner_role(database, event, user)
    logs = database.execute(
        """SELECT scans.id::text AS id, scanned_at, result, holder_name, code AS ticket_code, note
           FROM scans LEFT JOIN tickets ON tickets.id = scans.ticket_id
           WHERE scans.event_id = %s AND scanned_by = %s ORDER BY scans.id DESC LIMIT 5""",
        (event_id, user["id"]),
    ).fetchall()
    checked = database.execute(
        "SELECT count(*) AS total FROM scans WHERE event_id = %s AND scanned_by = %s AND result = 'allowed'",
        (event_id, user["id"]),
    ).fetchone()
    assert checked is not None
    return ScannerInfo(
        event=build_summary(database, event),
        viewer_role=role,
        checked_by_me=checked["total"],
        recent=[ScanLogItem.model_validate(log) for log in logs],
    )


def check_ticket(
    database: Database, event_id: str, user: Row, ticket: Row | None
) -> ScanResult:
    if not ticket:
        return ScanResult(result="invalid", reason="Билет не найден")
    if ticket["event_id"] != event_id:
        return ScanResult(result="invalid", reason="Билет другого мероприятия")
    if ticket["status"] == "cancelled":
        return ScanResult.model_validate(
            {
                **ticket,
                "ticket_code": ticket["code"],
                "result": "invalid",
                "reason": "Регистрация отменена",
            }
        )
    if ticket["status"] == "used":
        checked_by = database.execute(
            "SELECT full_name FROM users WHERE id = %s", (ticket["checked_in_by"],)
        ).fetchone()
        return ScanResult.model_validate(
            {
                **ticket,
                "ticket_code": ticket["code"],
                "result": "already_used",
                "checked_in_by": ticket["checker_name"]
                or (checked_by["full_name"] if checked_by else None),
            }
        )
    checked = database.execute(
        """UPDATE tickets SET status = 'used', checked_in_at = clock_timestamp(), checked_in_by = %s, checker_name = %s
           WHERE id = %s RETURNING checked_in_at""",
        (user["id"], user["full_name"], ticket["id"]),
    ).fetchone()
    assert checked is not None
    return ScanResult.model_validate(
        {
            **ticket,
            **checked,
            "ticket_code": ticket["code"],
            "result": "allowed",
            "checked_in_by": user["full_name"],
        }
    )


@router.post(
    "/scan",
    response_model_exclude_none=True,
    description="Повтор с тем же Idempotency-Key возвращает исходный результат с replayed=true, "
    "без нового прохода. Новый ключ для использованного билета возвращает already_used. "
    "При повторе проверяются текущие права сканера.",
)
def scan_ticket(
    event_id: str,
    body: ScanRequest,
    database: Db,
    user: CurrentUser,
    request: Request,
    idempotency_key: IdempotencyKey = None,
) -> ScanResult:
    event = get_event(database, event_id, lock=True)
    require_scanner_role(database, event, user, active=False)
    command = Command(database, f"scan:{event_id}:{user['id']}", idempotency_key, body)
    if replay := command.replay(ScanResult):
        return replay.model_copy(update={"replayed": True})
    require_scanner_role(database, event, user)
    if len(body.code) < 24:
        check_rate_limit(request, "scan-manual", 60, actor=user["id"])
    ticket = database.execute(
        "SELECT * FROM tickets WHERE event_id = %s AND (qr_token = %s OR code = %s) FOR UPDATE",
        (event_id, body.code, body.code.upper()),
    ).fetchone()
    if ticket is None:
        ticket = database.execute(
            "SELECT event_id FROM tickets WHERE qr_token = %s OR code = %s",
            (body.code, body.code.upper()),
        ).fetchone()
        if ticket and ticket["event_id"] == event_id:
            ticket = None
    result = check_ticket(database, event_id, user, ticket)
    note = result.reason or (
        "Повторное сканирование" if result.result == "already_used" else ""
    )
    scan = database.execute(
        "INSERT INTO scans (event_id, scanned_by, ticket_id, result, note) VALUES (%s, %s, %s, %s, %s) RETURNING id",
        (
            event_id,
            user["id"],
            ticket["id"] if ticket and ticket["event_id"] == event_id else None,
            result.result,
            note,
        ),
    ).fetchone()
    assert scan is not None
    if idempotency_key:
        result.scan_id = str(scan["id"])
    return command.save(result)
