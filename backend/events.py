from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import APIRouter
from psycopg.types.json import Jsonb

from .auth import CurrentUser
from .auth import Viewer as ViewerUser
from .database import Database, Db, Row
from .errors import forbidden, invalid, not_found
from .jobs import queue_event_updates
from .schemas import (
    CreateEventRequest,
    EventDetails,
    EventInput,
    EventRole,
    EventSummary,
    EventTab,
    MyEvents,
    PublicEvent,
    Status,
    Viewer,
)

router = APIRouter(tags=["Мероприятия"])
EVENT_CATEGORY = "Мероприятие"


def get_event(database: Database, event_id: str, *, lock: bool = False) -> Row:
    query = (
        "SELECT * FROM events WHERE id = %s FOR UPDATE"
        if lock
        else "SELECT * FROM events WHERE id = %s"
    )
    event = database.execute(query, (event_id,)).fetchone()
    if event is None:
        raise not_found("Мероприятие не найдено")
    return event


def is_volunteer(database: Database, event_id: object, user_id: object) -> bool:
    return (
        database.execute(
            "SELECT 1 FROM volunteers WHERE event_id = %s AND user_id = %s",
            (event_id, user_id),
        ).fetchone()
        is not None
    )


def require_organizer(
    database: Database,
    event_id: str,
    user: Row,
    *,
    lock: bool = False,
    published: bool = False,
) -> Row:
    event = get_event(database, event_id, lock=lock)
    if event["organizer_id"] != user["id"]:
        raise forbidden("Нет прав на это мероприятие")
    if published and not event["published"]:
        raise forbidden("Раздел доступен после публикации мероприятия")
    return event


def get_event_status(event: Row) -> Status:
    if not event["published"]:
        return "draft"
    starts_at = event["starts_at"]
    assert isinstance(starts_at, datetime)
    now = datetime.now(UTC)
    if now >= starts_at + timedelta(hours=4):
        return "finished"
    return "live" if now >= starts_at else "published"


def can_scan_event(event: Row) -> bool:
    return get_event_status(event) in ("published", "live")


def get_event_role(
    database: Database, event: Row, user: Row | None
) -> EventRole | None:
    if not user:
        return None
    if event["organizer_id"] == user["id"]:
        return "organizer"
    if can_scan_event(event) and is_volunteer(database, event["id"], user["id"]):
        return "volunteer"
    return None


def get_counts(database: Database, event_id: object) -> Row:
    counts = database.execute(
        """SELECT count(*) FILTER (WHERE status <> 'cancelled') AS registered_count,
                  count(*) FILTER (WHERE status = 'used') AS checked_in_count
           FROM tickets WHERE event_id = %s""",
        (event_id,),
    ).fetchone()
    assert counts is not None
    return counts


def build_summary(database: Database, event: Row) -> EventSummary:
    return EventSummary.model_validate(
        {
            **event,
            **get_counts(database, event["id"]),
            "status": get_event_status(event),
        }
    )


def build_details(database: Database, event: Row) -> EventDetails:
    return EventDetails.model_validate(
        {
            **event,
            **build_summary(database, event).model_dump(),
            "category": EVENT_CATEGORY,
        }
    )


@router.get("/events/{slug}")
def get_public_event(slug: str, database: Db, user: ViewerUser) -> PublicEvent:
    event = database.execute(
        "SELECT * FROM events WHERE slug = %s AND published", (slug,)
    ).fetchone()
    if not event:
        raise not_found("Мероприятие не найдено")
    ticket = None
    if user:
        ticket = database.execute(
            "SELECT id FROM tickets WHERE event_id = %s AND user_id = %s AND status <> 'cancelled'",
            (event["id"], user["id"]),
        ).fetchone()
    role = get_event_role(database, event, user)
    return PublicEvent(
        event=build_details(database, event),
        viewer=Viewer(
            ticket_id=str(ticket["id"]) if ticket else None,
            is_organizer=role == "organizer",
            is_volunteer=role == "volunteer",
        ),
    )


@router.get("/events/by-id/{event_id}")
def get_organizer_event(event_id: str, database: Db, user: CurrentUser) -> EventDetails:
    return build_details(database, require_organizer(database, event_id, user))


@router.get("/me/events")
def list_events(
    database: Db, user: CurrentUser, tab: EventTab = "organizing"
) -> MyEvents:
    events = database.execute(
        """SELECT events.* FROM events LEFT JOIN volunteers
             ON volunteers.event_id = events.id AND volunteers.user_id = %s
           WHERE organizer_id = %s OR volunteers.user_id IS NOT NULL ORDER BY starts_at""",
        (user["id"], user["id"]),
    ).fetchall()
    groups: dict[EventTab, list[Row]] = {
        "organizing": [],
        "volunteering": [],
        "drafts": [],
    }
    for event in events:
        status = get_event_status(event)
        if event["organizer_id"] == user["id"]:
            groups["drafts" if status == "draft" else "organizing"].append(event)
        elif status in ("published", "live"):
            groups["volunteering"].append(event)
    roles: list[EventRole] = []
    if groups["organizing"] or groups["drafts"]:
        roles.append("organizer")
    if groups["volunteering"]:
        roles.append("volunteer")
    return MyEvents(
        roles=roles,
        items=[build_summary(database, event) for event in groups[tab]],
        counters={name: len(items) for name, items in groups.items()},
    )


def get_event_values(body: EventInput) -> tuple[object, ...]:
    questions = Jsonb(
        [question.model_dump(exclude_none=True) for question in body.questions]
    )
    return (
        body.title,
        body.description,
        body.starts_at,
        body.location,
        body.capacity,
        body.price_type,
        questions,
    )


@router.post("/events", status_code=201)
def create_event(
    body: CreateEventRequest, database: Db, user: CurrentUser
) -> EventDetails:
    event_id = uuid4().hex
    title_slug = "-".join(
        "".join(
            letter if letter.isalnum() else " " for letter in body.title.lower()
        ).split()
    )[:60]
    slug = f"{title_slug or 'event'}-{event_id[:12]}"
    event = database.execute(
        """INSERT INTO events (id, slug, organizer_id, title, description, starts_at, location,
                               capacity, price_type, questions, published)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING *""",
        (event_id, slug, user["id"], *get_event_values(body), body.publish),
    ).fetchone()
    assert event is not None
    return build_details(database, event)


@router.patch("/events/{event_id}")
def update_event(
    event_id: str, body: EventInput, database: Db, user: CurrentUser
) -> EventDetails:
    previous = require_organizer(database, event_id, user, lock=True)
    registered = get_counts(database, event_id)["registered_count"]
    if body.capacity < registered:
        raise invalid(
            "Лимит меньше числа регистраций",
            {"capacity": f"Укажите не меньше {registered} мест"},
        )
    event = database.execute(
        """UPDATE events SET title = %s, description = %s, starts_at = %s, location = %s,
                             capacity = %s, price_type = %s, questions = %s WHERE id = %s RETURNING *""",
        (*get_event_values(body), event_id),
    ).fetchone()
    assert event is not None
    if event["published"] and any(
        event[field] != previous[field] for field in ("title", "starts_at", "location")
    ):
        queue_event_updates(
            database,
            event_id,
            reschedule_reminders=event["starts_at"] != previous["starts_at"],
        )
    return build_details(database, event)


@router.post("/events/{event_id}/publish")
def publish_event(event_id: str, database: Db, user: CurrentUser) -> EventDetails:
    require_organizer(database, event_id, user, lock=True)
    event = database.execute(
        "UPDATE events SET published = true WHERE id = %s RETURNING *", (event_id,)
    ).fetchone()
    assert event is not None
    return build_details(database, event)
