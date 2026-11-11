from datetime import datetime
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    StringConstraints,
    model_validator,
)
from pydantic.alias_generators import to_camel

type Status = Literal["draft", "published", "live", "finished"]
type ScanOutcome = Literal["allowed", "already_used", "invalid"]
type EventRole = Literal["organizer", "volunteer"]
type EventTab = Literal["organizing", "volunteering", "drafts"]
type TicketScope = Literal["upcoming", "past"]
Text = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)
]
Password = Annotated[str, StringConstraints(min_length=8, max_length=256)]
Email = Annotated[EmailStr, AfterValidator(str.lower)]
type QuestionType = Literal[
    "text", "textarea", "email", "tel", "number", "date", "choice", "select", "multiple"
]
OPTION_QUESTION_TYPES = {"choice", "select", "multiple"}
ShortHint = Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)]
AnswerText = Annotated[str, StringConstraints(max_length=4000)]
type Answer = AnswerText | Annotated[list[Text], Field(max_length=50)]


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class EmailRequest(ApiModel):
    email: Email


class LoginRequest(EmailRequest):
    password: Annotated[str, StringConstraints(min_length=1, max_length=256)]


class SignUpRequest(EmailRequest):
    full_name: Text
    password: Password


class EmailLinkRequest(ApiModel):
    token: Text
    password: Password | None = None


class ProfileUpdate(ApiModel):
    full_name: Text | None = None
    email: Email | None = None
    phone: (
        Annotated[str, StringConstraints(strip_whitespace=True, max_length=50)] | None
    ) = None
    organization: (
        Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] | None
    ) = None
    notifications_enabled: bool | None = None


class User(ApiModel):
    id: str
    public_id: str
    full_name: str
    email: str
    phone: str | None
    organization: str | None
    email_verified: bool
    notifications_enabled: bool


class Session(ApiModel):
    token: str
    user: User


class Option(ApiModel):
    value: Text
    label: Text
    hint: ShortHint | None = None


class Question(ApiModel):
    id: Text
    label: Text
    type: QuestionType
    required: bool
    placeholder: ShortHint | None = None
    help: ShortHint | None = None
    options: list[Option] | None = Field(default=None, max_length=50)

    @model_validator(mode="after")
    def validate_options(self) -> "Question":
        if self.type in OPTION_QUESTION_TYPES:
            values = [option.value for option in self.options or []]
            if len(values) < 2 or len(values) != len(set(values)):
                raise ValueError("Укажите минимум два варианта с разными значениями")
        return self


class EventInput(ApiModel):
    title: Text
    description: Annotated[
        str, StringConstraints(strip_whitespace=True, max_length=20000)
    ]
    starts_at: AwareDatetime
    location: Text
    capacity: int = Field(ge=1, le=1_000_000)
    price_type: Literal["free", "paid"]
    questions: list[Question] = Field(max_length=50)

    @model_validator(mode="after")
    def validate_questions(self) -> "EventInput":
        if len({question.id for question in self.questions}) != len(self.questions):
            raise ValueError("Идентификаторы вопросов должны быть уникальны")
        return self


class CreateEventRequest(EventInput):
    publish: bool


class EventSummary(ApiModel):
    id: str
    slug: str
    title: str
    status: Status
    starts_at: datetime
    location: str
    capacity: int
    registered_count: int
    checked_in_count: int


class TicketEvent(EventSummary):
    category: str


class EventSection(ApiModel):
    id: str
    title: str
    time: str


class EventDetails(TicketEvent):
    description: str
    price_type: Literal["free", "paid"]
    cover_url: str | None = None
    sections: list[EventSection] = Field(default_factory=list)
    questions: list[Question]
    organizer_id: str


class Viewer(ApiModel):
    ticket_id: str | None
    is_organizer: bool
    is_volunteer: bool


class PublicEvent(ApiModel):
    event: EventDetails
    viewer: Viewer


class MyEvents(ApiModel):
    roles: list[EventRole]
    items: list[EventSummary]
    counters: dict[EventTab, int]


class GuestContacts(EmailRequest):
    full_name: Text
    phone: Annotated[str, StringConstraints(strip_whitespace=True, max_length=50)]


class RegistrationRequest(ApiModel):
    answers: dict[Text, Answer] = Field(max_length=50)
    guest: GuestContacts | None = None


class Ticket(ApiModel):
    id: str
    code: str
    qr_token: str
    status: Literal["active", "used", "cancelled"]
    holder_name: str
    holder_email: str
    category: str
    zone: str = "Основной вход"
    created_at: datetime
    checked_in_at: datetime | None
    event: TicketEvent


class Registration(ApiModel):
    ticket: Ticket
    account_created: bool
    access_token: str | None = None


class MyTickets(ApiModel):
    items: list[Ticket]
    counters: dict[TicketScope, int]


class DashboardStats(ApiModel):
    registered: int
    capacity: int
    checked_in: int
    not_checked_in: int


class Attendee(ApiModel):
    ticket_id: str
    ticket_code: str
    full_name: str
    email: str
    status: Literal["present", "expected", "cancelled"]
    checked_in_at: datetime | None
    answers: dict[str, Answer]


class Attendees(ApiModel):
    items: list[Attendee]
    total: int
    page: int
    page_size: int


class VolunteerRequest(ApiModel):
    identifier: Text


class Volunteer(ApiModel):
    user_id: str
    public_id: str
    full_name: str
    email: str
    granted_at: datetime


class ScanRequest(ApiModel):
    code: Text


class ScanResult(ApiModel):
    result: ScanOutcome
    reason: str | None = None
    ticket_code: str | None = None
    holder_name: str | None = None
    category: str | None = None
    checked_in_at: datetime | None = None
    checked_in_by: str | None = None


class ScanLogItem(ApiModel):
    id: str
    scanned_at: datetime
    result: ScanOutcome
    holder_name: str | None
    ticket_code: str | None
    note: str


class ScannerInfo(ApiModel):
    event: EventSummary
    viewer_role: Literal["organizer", "volunteer"]
    checked_by_me: int
    recent: list[ScanLogItem]
