from fastapi import APIRouter

from .auth import CurrentUser
from .database import Database, Db, Row
from .errors import forbidden
from .events import build_summary, can_scan_event, get_event, get_event_role
from .schemas import EventRole, ScanLogItem, ScannerInfo, ScanRequest, ScanResult

router = APIRouter(prefix="/events/{event_id}", tags=["Сканер"])


def require_scanner_role(database: Database, event: Row, user: Row) -> EventRole:
    role = get_event_role(database, event, user)
    if not role:
        raise forbidden("Права на сканирование отозваны или не выдавались")
    if not can_scan_event(event):
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
                "checked_in_by": checked_by["full_name"] if checked_by else None,
            }
        )
    checked = database.execute(
        """UPDATE tickets SET status = 'used', checked_in_at = clock_timestamp(), checked_in_by = %s
           WHERE id = %s RETURNING checked_in_at""",
        (user["id"], ticket["id"]),
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


@router.post("/scan", response_model_exclude_none=True)
def scan_ticket(
    event_id: str, body: ScanRequest, database: Db, user: CurrentUser
) -> ScanResult:
    event = get_event(database, event_id, lock=True)
    require_scanner_role(database, event, user)
    ticket = database.execute(
        "SELECT * FROM tickets WHERE qr_token = %s OR code = %s FOR UPDATE",
        (body.code, body.code.upper()),
    ).fetchone()
    result = check_ticket(database, event_id, user, ticket)
    note = result.reason or (
        "Повторное сканирование" if result.result == "already_used" else ""
    )
    database.execute(
        "INSERT INTO scans (event_id, scanned_by, ticket_id, result, note) VALUES (%s, %s, %s, %s, %s)",
        (
            event_id,
            user["id"],
            ticket["id"] if ticket and ticket["event_id"] == event_id else None,
            result.result,
            note,
        ),
    )
    return result
