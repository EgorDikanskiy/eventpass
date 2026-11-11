from datetime import datetime
from hashlib import sha256
from os import environ
from secrets import token_urlsafe
from urllib.parse import quote, urlencode
from zoneinfo import ZoneInfo

from psycopg.types.json import Jsonb

from .database import Database, Row


def hash_token(token: str) -> str:
    return sha256(token.encode()).hexdigest()


def enqueue_job(database: Database, kind: str, payload: dict[str, str]) -> None:
    database.execute(
        "INSERT INTO jobs (kind, payload) VALUES (%s, %s)", (kind, Jsonb(payload))
    )


def get_frontend_url(path: str) -> str:
    return environ.get("FRONTEND_URL", "http://localhost:5173").rstrip("/") + path


def queue_email_link(
    database: Database,
    user: Row,
    purpose: str,
    ticket_url: str | None = None,
    *,
    resend: bool = False,
) -> None:
    if (
        resend
        and database.execute(
            """SELECT 1 FROM email_links WHERE user_id = %s AND purpose = %s
           AND created_at > now() - interval '1 minute'""",
            (user["id"], purpose),
        ).fetchone()
    ):
        return

    token = token_urlsafe(32)
    database.execute(
        "DELETE FROM email_links WHERE user_id = %s AND expires_at <= now()",
        (user["id"],),
    )
    database.execute(
        "INSERT INTO email_links (token_hash, user_id, purpose) VALUES (%s, %s, %s)",
        (hash_token(token), user["id"], purpose),
    )
    subject = {
        "verify": "Подтвердите почту в EventPass",
        "setup": "Задайте пароль для аккаунта EventPass",
        "reset": "Восстановление пароля EventPass",
    }[purpose]
    link = get_frontend_url(
        "/account-link#" + urlencode({"token": token, "action": purpose})
    )
    body = f"{subject}\n\n{link}\n\nСсылка действует 24 часа."
    if ticket_url:
        subject = "Ваш билет EventPass"
        body = f"Ваш билет: {ticket_url}\n\n{body}"
    enqueue_job(
        database,
        "email",
        {"email": str(user["email"]), "subject": subject, "body": body},
    )


def get_guest_ticket_url(event_slug: str, ticket_id: str, access_token: str) -> str:
    slug = quote(event_slug)
    query = urlencode({"token": access_token, "created": "1"})
    return get_frontend_url(f"/e/{slug}/ticket/{ticket_id}?{query}")


def queue_ticket_reminders(
    database: Database, event_id: object, ticket_id: str | None = None
) -> None:
    database.execute(
        """INSERT INTO jobs (kind, payload, available_at)
           SELECT 'email', jsonb_build_object('notification', 'reminder', 'ticket_id', tickets.id, 'event_id', events.id),
                  events.starts_at - interval '1 day'
           FROM tickets JOIN events ON events.id = tickets.event_id
           WHERE events.id = %s AND tickets.status = 'active'
             AND events.starts_at > now() + interval '1 day'
             AND (%s::text IS NULL OR tickets.id = %s)""",
        (event_id, ticket_id, ticket_id),
    )


def queue_event_updates(
    database: Database, event_id: str, *, reschedule_reminders: bool
) -> None:
    if reschedule_reminders:
        database.execute(
            "DELETE FROM jobs WHERE payload->>'event_id' = %s AND payload->>'notification' = 'reminder'",
            (event_id,),
        )
        queue_ticket_reminders(database, event_id)
    database.execute(
        """INSERT INTO jobs (kind, payload)
           SELECT 'email', jsonb_build_object('notification', 'updated', 'ticket_id', id)
           FROM tickets WHERE event_id = %s AND status = 'active'""",
        (event_id,),
    )


def resolve_ticket_notification(
    database: Database, ticket_id: str, notification: str
) -> dict[str, str] | None:
    ticket = database.execute(
        """SELECT users.email, events.title, events.starts_at, events.location
           FROM tickets JOIN users ON users.id = tickets.user_id JOIN events ON events.id = tickets.event_id
           WHERE tickets.id = %s AND tickets.status = 'active' AND users.notifications_enabled
             AND (%s <> 'reminder' OR events.starts_at > now())""",
        (ticket_id, notification),
    ).fetchone()
    if not ticket:
        return None
    subject = {
        "registered": "Ваш билет EventPass",
        "updated": "Организатор обновил мероприятие",
        "reminder": "Напоминание о мероприятии EventPass",
    }[notification]
    starts_at = ticket["starts_at"]
    assert isinstance(starts_at, datetime)
    starts_at_local = starts_at.astimezone(
        ZoneInfo(environ.get("EVENTPASS_TIMEZONE", "Europe/Moscow"))
    )
    url = get_frontend_url("/tickets?" + urlencode({"ticket": ticket_id}))
    body = f"{ticket['title']}\n{starts_at_local:%d.%m.%Y %H:%M %Z}\n{ticket['location']}\n\nБилет: {url}"
    return {"email": str(ticket["email"]), "subject": subject, "body": body}
