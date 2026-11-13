from datetime import datetime
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    StrictBool,
    StrictInt,
    StringConstraints,
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
    "text",
    "textarea",
    "email",
    "tel",
    "number",
    "date",
    "choice",
    "select",
    "multiple",
    "checkbox",
]
OPTION_QUESTION_TYPES = {"choice", "select", "multiple"}
ShortHint = Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)]
AnswerText = Annotated[str, StringConstraints(max_length=4000)]
type Answer = StrictBool | AnswerText | Annotated[list[Text], Field(max_length=50)]


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class EmailRequest(ApiModel):
    email: Email


class LoginRequest(EmailRequest):
    password: Annotated[str, StringConstraints(min_length=1, max_length=256)]


class SignUpRequest(EmailRequest):
    full_name: Text
    password: Password
    consent_accepted: StrictBool


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
    value: ShortHint = ""
    label: ShortHint = ""
    hint: ShortHint | None = None


class Question(ApiModel):
    id: Text
    label: ShortHint = ""
    type: QuestionType = "text"
    required: bool = False
    placeholder: ShortHint | None = None
    help: ShortHint | None = None
    options: list[Option] | None = Field(default=None, max_length=50)


class EventSection(ApiModel):
    id: Text
    title: ShortHint = ""
    time: ShortHint = ""


class EventInput(ApiModel):
    title: ShortHint = ""
    description: Annotated[
        str, StringConstraints(strip_whitespace=True, max_length=20000)
    ] = ""
    starts_at: AwareDatetime | None = None
    ends_at: AwareDatetime | None = None
    location: ShortHint = ""
    capacity: Annotated[StrictInt, Field(ge=-1_000_000, le=1_000_000)] | None = None
    price_type: Literal["free", "paid"] = "free"
    questions: list[Question] = Field(default_factory=list, max_length=50)
    sections: list[EventSection] = Field(default_factory=list, max_length=50)
    cover_asset_id: Text | None = None


class CreateEventRequest(EventInput):
    publish: bool = False


class EventSummary(ApiModel):
    id: str
    slug: str
    title: str
    status: Status
    starts_at: datetime | None
    ends_at: datetime | None
    effective_ends_at: datetime | None
    finished_at: datetime | None
    location: str
    capacity: int | None
    registered_count: int
    checked_in_count: int


class TicketEvent(EventSummary):
    category: str


class EventDetails(TicketEvent):
    description: str
    price_type: Literal["free", "paid"]
    cover_asset_id: str | None = None
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
    consent_accepted: StrictBool
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
    revision: str
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
    revision: str
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
    checked_in_count: int = 0


class ScanRequest(ApiModel):
    code: Text


class ScanResult(ApiModel):
    result: ScanOutcome
    scan_id: str | None = None
    replayed: bool | None = None
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


class EventCover(ApiModel):
    asset_id: str
    url: str
    mime_type: str
    byte_count: int
    width: int
    height: int


class ConsentDocument(ApiModel):
    url: str | None
    version: str | None


class ConsentDocuments(ApiModel):
    terms: ConsentDocument
    privacy: ConsentDocument


class AttendeeCancellation(ApiModel):
    ticket_id: str
    status: Literal["cancelled"]
