from secrets import compare_digest, randbelow, token_urlsafe
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Query, Request, Response
from psycopg.types.json import Jsonb

from backend.api.auth import CurrentUser, Viewer, create_user
from backend.api.errors import ApiError, forbidden, not_found
from backend.api.events import (
    EVENT_CATEGORY,
    build_summary,
    get_counts,
    get_event,
    get_event_status,
    require_organizer,
)
from backend.infrastructure.database import Database, Db, Row
from backend.infrastructure.rate_limits import check_rate_limit
from backend.infrastructure.storage import get_ticket_pdf
from backend.models.schemas import (
    Answer,
    AttendeeCancellation,
    MyTickets,
    Question,
    Registration,
    RegistrationRequest,
    Ticket,
    TicketEvent,
    TicketScope,
)
from backend.services.commands import Command, IdempotencyKey
from backend.services.consent import require_consent
from backend.services.jobs import (
    enqueue_job,
    get_guest_ticket_url,
    queue_email_link,
    queue_ticket_reminders,
)
from backend.services.question_answers import get_answer_label, validate_answers

router = APIRouter(tags=["Билеты"])


def build_ticket(database: Database, ticket: Row, event: Row) -> Ticket:
    summary = build_summary(database, event)
    return Ticket.model_validate(
        {
            **ticket,
            "event": TicketEvent(**summary.model_dump(), category=EVENT_CATEGORY),
        }
    )


def get_category(questions: list[Question], answers: dict[str, Answer]) -> str:
    choice = next(
        (question for question in questions if question.type == "choice"), None
    )
    if choice:
        for option in choice.options or []:
            if option.value == answers.get(choice.id):
                return option.label
    return "Участник"


@router.post("/events/{event_id}/registrations", status_code=201)
def register_for_event(
    event_id: str,
    body: RegistrationRequest,
    database: Db,
    user: Viewer,
    request: Request,
    idempotency_key: IdempotencyKey = None,
) -> Registration:
    event = get_event(database, event_id, lock=True)
    actor = user["id"] if user else f"guest:{body.guest.email if body.guest else ''}"
    command = Command(database, f"register:{event_id}:{actor}", idempotency_key, body)
    if replay := command.replay(Registration):
        get_accessible_ticket(database, replay.ticket.id, user, replay.access_token)
        return replay
    check_rate_limit(request, "register", 30)
    versions = require_consent(body.consent_accepted)
    status = get_event_status(event)
    if status == "draft":
        raise not_found("Мероприятие не найдено")
    if status == "finished":
        raise ApiError(409, "EVENT_FINISHED", "Мероприятие уже завершилось")
    raw_questions = event["questions"]
    assert isinstance(raw_questions, list)
    questions = [Question.model_validate(question) for question in raw_questions]
    answers = validate_answers(questions, body.answers)
    answer_labels = [
        {
            "id": question.id,
            "label": question.label,
            "type": question.type,
            "answer": get_answer_label(question, answers[question.id]),
        }
        for question in questions
        if question.id in answers
    ]

    if (
        user
        and database.execute(
            "SELECT 1 FROM tickets WHERE event_id = %s AND user_id = %s AND status <> 'cancelled'",
            (event_id, user["id"]),
        ).fetchone()
    ):
        raise ApiError(
            409, "ALREADY_REGISTERED", "Вы уже зарегистрированы на это мероприятие"
        )
    if get_counts(database, event_id)["registered_count"] >= event["capacity"]:
        raise ApiError(409, "EVENT_FULL", "Свободных мест нет")

    access_token = None
    if user is None:
        if not body.guest:
            raise ApiError(401, "UNAUTHORIZED", "Войдите или заполните контакты")
        user = create_user(
            database,
            body.guest.full_name,
            body.guest.email,
            phone=body.guest.phone,
            consent_versions=versions,
        )
        access_token = token_urlsafe(32)

    ticket_id = uuid4().hex
    while True:
        ticket = database.execute(
            """INSERT INTO tickets (id, event_id, user_id, code, qr_token, guest_token, holder_name,
                                    holder_email, category, answers, answer_labels, holder_phone,
                                    consent_accepted_at, consent_versions)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now(), %s)
               ON CONFLICT (code) DO NOTHING RETURNING *""",
            (
                ticket_id,
                event_id,
                user["id"],
                f"EVT-{100000 + randbelow(900000)}",
                token_urlsafe(32),
                access_token,
                user["full_name"],
                user["email"],
                get_category(questions, answers),
                Jsonb(answers),
                Jsonb(answer_labels),
                user["phone"],
                Jsonb(versions),
            ),
        ).fetchone()
        if ticket:
            break

    if access_token:
        queue_email_link(
            database,
            user,
            "setup",
            get_guest_ticket_url(str(event["slug"]), ticket_id, access_token),
        )
    else:
        enqueue_job(
            database, "email", {"notification": "registered", "ticket_id": ticket_id}
        )
    queue_ticket_reminders(database, event_id, ticket_id)
    return command.save(
        Registration(
            ticket=build_ticket(database, ticket, event),
            account_created=access_token is not None,
            access_token=access_token,
        )
    )


@router.get("/me/tickets")
def list_tickets(
    database: Db, user: CurrentUser, scope: TicketScope = "upcoming"
) -> MyTickets:
    tickets = database.execute(
        """SELECT tickets.* FROM tickets JOIN events ON events.id = tickets.event_id
           WHERE tickets.user_id = %s ORDER BY events.starts_at, tickets.created_at""",
        (user["id"],),
    ).fetchall()
    events = {
        event["id"]: event
        for event in database.execute(
            "SELECT * FROM events WHERE id IN (SELECT event_id FROM tickets WHERE user_id = %s)",
            (user["id"],),
        ).fetchall()
    }
    active_events = {
        ticket["event_id"] for ticket in tickets if ticket["status"] != "cancelled"
    }
    upcoming, past = [], []
    for ticket in tickets:
        event = events.get(ticket["event_id"])
        if not event:
            continue
        if get_event_status(event) == "finished":
            past.append(ticket)
        elif ticket["status"] != "cancelled":
            upcoming.append(ticket)
        elif ticket["event_id"] not in active_events:
            past.append(ticket)
    selected = upcoming if scope == "upcoming" else reversed(past)
    return MyTickets(
        items=[
            build_ticket(database, ticket, events[ticket["event_id"]])
            for ticket in selected
        ],
        counters={"upcoming": len(upcoming), "past": len(past)},
    )


def get_accessible_ticket(
    database: Database,
    ticket_id: str,
    user: Row | None,
    token: str | None,
    *,
    lock: bool = False,
) -> Row:
    query = (
        "SELECT * FROM tickets WHERE id = %s FOR SHARE"
        if lock
        else "SELECT * FROM tickets WHERE id = %s"
    )
    ticket = database.execute(query, (ticket_id,)).fetchone()
    if not ticket:
        raise not_found("Билет не найден")
    guest_token = ticket["guest_token"]
    if user and ticket["user_id"] == user["id"]:
        return ticket
    if (
        token
        and token.isascii()
        and isinstance(guest_token, str)
        and compare_digest(guest_token, token)
    ):
        return ticket
    raise forbidden("Нет доступа к билету")


@router.get("/tickets/{ticket_id}")
def get_ticket(
    ticket_id: str,
    database: Db,
    user: Viewer,
    token: Annotated[str | None, Query(max_length=128)] = None,
) -> Ticket:
    ticket = get_accessible_ticket(database, ticket_id, user, token)
    return build_ticket(database, ticket, get_event(database, str(ticket["event_id"])))


@router.post("/tickets/{ticket_id}/cancel")
def cancel_ticket(ticket_id: str, database: Db, user: CurrentUser) -> Ticket:
    reference = database.execute(
        "SELECT event_id FROM tickets WHERE id = %s AND user_id = %s",
        (ticket_id, user["id"]),
    ).fetchone()
    if not reference:
        raise not_found("Билет не найден")
    event = get_event(database, reference["event_id"], lock=True)
    return cancel_event_ticket(database, event, ticket_id, user_id=user["id"])


@router.post("/events/{event_id}/attendees/{ticket_id}/cancel")
def cancel_attendee(
    event_id: str, ticket_id: str, database: Db, user: CurrentUser
) -> AttendeeCancellation:
    event = require_organizer(database, event_id, user, lock=True)
    cancel_event_ticket(database, event, ticket_id)
    return AttendeeCancellation(ticket_id=ticket_id, status="cancelled")


def cancel_event_ticket(
    database: Database, event: Row, ticket_id: str, *, user_id: str | None = None
) -> Ticket:
    ticket = database.execute(
        "SELECT * FROM tickets WHERE id = %s AND event_id = %s FOR UPDATE",
        (ticket_id, event["id"]),
    ).fetchone()
    if not ticket or (user_id and ticket["user_id"] != user_id):
        raise not_found("Билет не найден")
    if ticket["status"] == "used":
        raise ApiError(409, "TICKET_USED", "Билет уже использован")
    if ticket["status"] == "cancelled":
        return build_ticket(database, ticket, event)
    updated = database.execute(
        "UPDATE tickets SET status = 'cancelled' WHERE id = %s RETURNING *",
        (ticket_id,),
    ).fetchone()
    assert updated is not None
    return build_ticket(database, updated, event)


@router.get("/tickets/{ticket_id}/pdf", response_class=Response)
def download_ticket(
    ticket_id: str,
    database: Db,
    user: Viewer,
    token: Annotated[str | None, Query(max_length=128)] = None,
) -> Response:
    record = get_accessible_ticket(database, ticket_id, user, token, lock=True)
    ticket = build_ticket(database, record, get_event(database, record["event_id"]))
    return Response(
        get_ticket_pdf(ticket),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{ticket.code}.pdf"',
            "Cache-Control": "no-store",
        },
    )
