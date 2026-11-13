from secrets import randbelow, token_urlsafe
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from psycopg.errors import UniqueViolation
from psycopg.sql import SQL, Identifier
from psycopg.types.json import Jsonb
from pwdlib import PasswordHash

from backend.api.errors import ApiError, invalid
from backend.infrastructure.database import Database, Db, Row
from backend.infrastructure.rate_limits import check_rate_limit
from backend.models.schemas import (
    ConsentDocuments,
    EmailLinkRequest,
    EmailRequest,
    LoginRequest,
    ProfileUpdate,
    Session,
    SignUpRequest,
    User,
)
from backend.services.consent import get_consent_documents, require_consent
from backend.services.jobs import (
    enqueue_job,
    get_guest_ticket_url,
    hash_token,
    queue_email_link,
)

router = APIRouter(tags=["Аккаунт"])
password_hash = PasswordHash.recommended()
dummy_hash = password_hash.hash(token_urlsafe(32))
Bearer = Annotated[
    HTTPAuthorizationCredentials | None, Depends(HTTPBearer(auto_error=False))
]


def get_viewer(database: Db, bearer: Bearer) -> Row | None:
    if not bearer:
        return None
    return database.execute(
        """SELECT users.* FROM users JOIN sessions ON sessions.user_id = users.id
           WHERE token_hash = %s AND expires_at > now()""",
        (hash_token(bearer.credentials),),
    ).fetchone()


Viewer = Annotated[Row | None, Depends(get_viewer)]


def require_user(viewer: Viewer) -> Row:
    if viewer is None:
        raise ApiError(401, "UNAUTHORIZED", "Войдите, чтобы продолжить")
    return viewer


CurrentUser = Annotated[Row, Depends(require_user)]


def create_user(
    database: Database,
    name: str,
    email: str,
    *,
    secret: str | None = None,
    phone: str | None = None,
    consent_versions: dict[str, str] | None = None,
) -> Row:
    while True:
        public_id = str(100000 + randbelow(900000))
        user = database.execute(
            """INSERT INTO users (id, public_id, full_name, email, password_hash, phone, consent_accepted_at, consent_versions)
               VALUES (%s, %s, %s, %s, %s, %s, CASE WHEN %s THEN now() END, %s) ON CONFLICT DO NOTHING RETURNING *""",
            (
                uuid4().hex,
                public_id,
                name,
                email,
                secret,
                phone or None,
                consent_versions is not None,
                Jsonb(consent_versions) if consent_versions is not None else None,
            ),
        ).fetchone()
        if user:
            return user
        if database.execute(
            "SELECT 1 FROM users WHERE email = %s", (email,)
        ).fetchone():
            raise ApiError(
                409,
                "EMAIL_TAKEN",
                "На эту почту уже есть аккаунт",
                {"email": "Почта уже зарегистрирована"},
            )


def create_session(database: Database, user: Row) -> Session:
    token = token_urlsafe(32)
    database.execute(
        "DELETE FROM sessions WHERE user_id = %s AND expires_at <= now()", (user["id"],)
    )
    database.execute(
        "INSERT INTO sessions (token_hash, user_id) VALUES (%s, %s)",
        (hash_token(token), user["id"]),
    )
    return Session(token=token, user=User.model_validate(user))


@router.post("/auth/register", status_code=201)
def sign_up(body: SignUpRequest, database: Db, request: Request) -> Session:
    check_rate_limit(request, "signup", 20)
    versions = require_consent(body.consent_accepted)
    user = create_user(
        database,
        body.full_name,
        body.email,
        secret=password_hash.hash(body.password),
        consent_versions=versions,
    )
    queue_email_link(database, user, "verify")
    return create_session(database, user)


@router.post("/auth/login")
def log_in(body: LoginRequest, database: Db, request: Request) -> Session:
    check_rate_limit(request, "log_in", 30)
    check_rate_limit(request, "log_in_email", 15, actor=body.email)
    user = database.execute(
        "SELECT * FROM users WHERE email = %s", (body.email,)
    ).fetchone()
    stored_hash = user["password_hash"] if user else None
    valid = password_hash.verify(body.password, str(stored_hash or dummy_hash))
    if not valid or not user or not stored_hash:
        raise ApiError(401, "INVALID_CREDENTIALS", "Неверная почта или пароль")
    # A concurrent reset may have replaced the password while it was being verified.
    locked = database.execute(
        "SELECT password_hash FROM users WHERE id = %s FOR UPDATE", (user["id"],)
    ).fetchone()
    if not locked or locked["password_hash"] != stored_hash:
        raise ApiError(401, "INVALID_CREDENTIALS", "Неверная почта или пароль")
    return create_session(database, user)


@router.post("/auth/logout", status_code=204)
def log_out(database: Db, bearer: Bearer) -> None:
    if bearer:
        database.execute(
            "DELETE FROM sessions WHERE token_hash = %s",
            (hash_token(bearer.credentials),),
        )


@router.post("/auth/resend-verification", status_code=204)
def resend_verification(body: EmailRequest, database: Db, request: Request) -> None:
    check_rate_limit(request, "resend_verification", 15)
    check_rate_limit(request, "resend_email", 5, actor=body.email)
    user = database.execute(
        "SELECT * FROM users WHERE email = %s FOR UPDATE", (body.email,)
    ).fetchone()
    if not user or user["email_verified"]:
        return
    if user["password_hash"]:
        queue_email_link(database, user, "verify", resend=True)
        return
    ticket = database.execute(
        """SELECT tickets.id, guest_token, events.slug FROM tickets JOIN events ON events.id = tickets.event_id
           WHERE user_id = %s AND guest_token IS NOT NULL AND tickets.status <> 'cancelled'
           ORDER BY tickets.created_at DESC LIMIT 1""",
        (user["id"],),
    ).fetchone()
    url = (
        get_guest_ticket_url(
            str(ticket["slug"]), str(ticket["id"]), str(ticket["guest_token"])
        )
        if ticket
        else None
    )
    queue_email_link(database, user, "setup", url, resend=True)


@router.post("/auth/forgot-password", status_code=204)
def request_password_reset(body: EmailRequest, database: Db, request: Request) -> None:
    check_rate_limit(request, "request_password_reset", 15)
    check_rate_limit(request, "reset_email", 5, actor=body.email)
    user = database.execute(
        "SELECT * FROM users WHERE email = %s FOR UPDATE", (body.email,)
    ).fetchone()
    if user:
        queue_email_link(
            database, user, "reset" if user["password_hash"] else "setup", resend=True
        )


@router.post("/auth/email-link", status_code=204)
def use_email_link(body: EmailLinkRequest, database: Db, request: Request) -> None:
    check_rate_limit(request, "use_email_link", 20)
    token_hash = hash_token(body.token)
    link = database.execute(
        """SELECT email_links.* FROM email_links JOIN users ON users.id = email_links.user_id
           WHERE token_hash = %s AND expires_at > now() FOR UPDATE OF users""",
        (token_hash,),
    ).fetchone()
    if (
        not link
        or not database.execute(
            "DELETE FROM email_links WHERE token_hash = %s RETURNING token_hash",
            (token_hash,),
        ).fetchone()
    ):
        raise invalid("Ссылка недействительна или срок её действия истёк")

    user_id = link["user_id"]
    if link["purpose"] != "verify":
        if not body.password:
            raise invalid("Введите пароль", {"password": "Введите пароль"})
        database.execute(
            "UPDATE users SET password_hash = %s WHERE id = %s",
            (password_hash.hash(body.password), user_id),
        )
        database.execute("DELETE FROM sessions WHERE user_id = %s", (user_id,))
        database.execute("DELETE FROM email_links WHERE user_id = %s", (user_id,))
    else:
        database.execute(
            "DELETE FROM email_links WHERE user_id = %s AND purpose = 'verify'",
            (user_id,),
        )
    database.execute("UPDATE users SET email_verified = true WHERE id = %s", (user_id,))


@router.get("/me")
def get_profile(user: CurrentUser) -> User:
    return User.model_validate(user)


@router.patch("/me")
def update_profile(body: ProfileUpdate, database: Db, user: CurrentUser) -> User:
    changes = body.model_dump(exclude_unset=True)
    for field in ("full_name", "email", "notifications_enabled"):
        if field in changes and changes[field] is None:
            raise invalid("Проверьте поля профиля")
    locked = database.execute(
        "SELECT * FROM users WHERE id = %s FOR UPDATE", (user["id"],)
    ).fetchone()
    if not locked:
        raise ApiError(401, "UNAUTHORIZED", "Войдите, чтобы продолжить")
    if not changes:
        return User.model_validate(locked)

    email_changed = "email" in changes and changes["email"] != locked["email"]
    if email_changed:
        changes["email_verified"] = False
    assignments = SQL(", ").join(
        SQL("{} = %s").format(Identifier(field)) for field in changes
    )
    try:
        updated = database.execute(
            SQL("UPDATE users SET {} WHERE id = %s RETURNING *").format(assignments),
            (*changes.values(), user["id"]),
        ).fetchone()
    except UniqueViolation as error:
        raise invalid(
            "Почта уже используется", {"email": "Почта уже используется"}
        ) from error
    if updated is None:
        raise ApiError(401, "UNAUTHORIZED", "Войдите, чтобы продолжить")
    if email_changed:
        database.execute("DELETE FROM email_links WHERE user_id = %s", (user["id"],))
        queue_email_link(database, updated, "verify")
    return User.model_validate(updated)


@router.delete("/me", status_code=204)
def delete_account(database: Db, user: CurrentUser) -> None:
    database.execute(
        """SELECT id FROM events WHERE organizer_id = %(user)s
           OR id IN (SELECT event_id FROM tickets WHERE user_id = %(user)s OR checked_in_by = %(user)s)
           OR id IN (SELECT event_id FROM volunteers WHERE user_id = %(user)s)
           ORDER BY id FOR UPDATE""",
        {"user": user["id"]},
    ).fetchall()
    database.execute("SELECT 1 FROM users WHERE id = %s FOR UPDATE", (user["id"],))
    tickets = database.execute(
        """SELECT tickets.id FROM tickets JOIN events ON events.id = tickets.event_id
           WHERE tickets.user_id = %s OR events.organizer_id = %s""",
        (user["id"], user["id"]),
    ).fetchall()
    for ticket in tickets:
        enqueue_job(database, "delete_pdf", {"ticket_id": str(ticket["id"])})
    database.execute(
        "DELETE FROM jobs WHERE kind = 'email' AND payload->>'email' = %s",
        (user["email"],),
    )
    database.execute("DELETE FROM users WHERE id = %s", (user["id"],))


@router.get("/auth/consent")
def get_consent() -> ConsentDocuments:
    return get_consent_documents()
