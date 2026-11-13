from datetime import UTC, datetime, timedelta

from backend.api.errors import invalid
from backend.infrastructure.database import Row
from backend.models.schemas import OPTION_QUESTION_TYPES, EventInput, Status


def get_effective_end(event: Row) -> datetime | None:
    return event["ends_at"] or (
        event["starts_at"] + timedelta(hours=4) if event["starts_at"] else None
    )


def get_event_status(event: Row) -> Status:
    if not event["published"]:
        return "draft"
    now = datetime.now(UTC)
    end = get_effective_end(event)
    if event["finished_at"] or (end and now >= end):
        return "finished"
    return "live" if now >= event["starts_at"] else "published"


def validate_event(body: EventInput, *, published: bool, registered: int = 0) -> None:
    errors: dict[str, str] = {}
    if body.ends_at and body.starts_at and body.ends_at <= body.starts_at:
        errors["endsAt"] = "AFTER_START_REQUIRED"
    if published:
        if not body.title:
            errors["title"] = "REQUIRED"
        if not body.description:
            errors["description"] = "REQUIRED"
        if not body.location:
            errors["location"] = "REQUIRED"
        if not body.starts_at:
            errors["startsAt"] = "REQUIRED"
        if body.capacity is None or body.capacity < max(1, registered):
            errors["capacity"] = "INVALID_CAPACITY"
        for index, question in enumerate(body.questions):
            options = question.options or []
            if not question.label:
                errors[f"questions.{index}.label"] = "REQUIRED"
            if question.type in OPTION_QUESTION_TYPES and (
                len(options) < 2
                or any(not option.value or not option.label for option in options)
                or len({option.value for option in options}) != len(options)
            ):
                errors[f"questions.{index}.options"] = "INVALID_OPTIONS"
        for index, section in enumerate(body.sections):
            if not section.title:
                errors[f"sections.{index}.title"] = "REQUIRED"
    for field, items in (("questions", body.questions), ("sections", body.sections)):
        if len({item.id for item in items}) != len(items):
            errors[field] = "DUPLICATE_ID"
    if errors:
        raise invalid("Проверьте данные мероприятия", errors)
