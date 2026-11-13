import csv
from datetime import datetime
from io import BytesIO, StringIO
from typing import Literal

from openpyxl import Workbook
from openpyxl.cell import WriteOnlyCell
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
from openpyxl.worksheet._write_only import WriteOnlyWorksheet

from backend.infrastructure.database import Row
from backend.models.schemas import Question
from backend.services.question_answers import get_answer_label

type ExportFormat = Literal["csv", "xlsx"]
type Column = tuple[str, str, str]
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def export_answers(
    event: Row, tickets: list[Row]
) -> tuple[dict[Column, str], list[dict[Column, str]]]:
    questions = {
        item["id"]: Question.model_validate(item) for item in event["questions"]
    }
    columns = {
        (item.id, item.type, item.label): item.label for item in questions.values()
    }
    all_answers: list[dict[Column, str]] = []
    for ticket in tickets:
        answers: dict[Column, str] = {}
        for recorded in ticket["answer_labels"]:
            key = (recorded["id"], recorded.get("type", ""), recorded["label"])
            columns.setdefault(key, recorded["label"])
            answers[key] = recorded["answer"]
        recorded_ids = {key[0] for key in answers}
        for question_id, answer in ticket["answers"].items():
            if question_id not in recorded_ids:
                key = (question_id, "", question_id)
                columns.setdefault(key, question_id)
                answers[key] = get_answer_label(Question(id=question_id), answer)
        all_answers.append(answers)
    return columns, all_answers


def safe_csv_cell(value: str) -> str:
    if value.startswith(("\t", "\r", "\n")) or value.lstrip().startswith(
        ("=", "+", "-", "@")
    ):
        return "'" + value
    return value


def render_export(
    event: Row,
    tickets: list[Row],
    snapshot_at: datetime,
    format: ExportFormat,
) -> bytes:
    columns, answers = export_answers(event, tickets)
    headings = ["Билет", "ФИО", "Email", "Статус", "Время чекина"]
    labels = {"used": "Присутствует", "active": "Ожидается", "cancelled": "Отменён"}
    rows = [
        [
            ticket["code"],
            ticket["holder_name"],
            ticket["holder_email"],
            labels[ticket["status"]],
            ticket["checked_in_at"].isoformat() if ticket["checked_in_at"] else "",
            *(recorded.get(key, "") for key in columns),
        ]
        for ticket, recorded in zip(tickets, answers, strict=True)
    ]
    if format == "csv":
        output = StringIO(newline="")
        writer = csv.writer(output, delimiter=";")
        writer.writerow(map(safe_csv_cell, [*headings, *columns.values()]))
        writer.writerows(map(safe_csv_cell, row) for row in rows)
        return output.getvalue().encode("utf-8-sig")

    workbook = Workbook(write_only=True)
    sheet = workbook.create_sheet("Участники")
    sheet.freeze_panes = "A2"
    append_text_row(
        sheet,
        [
            "ID билета",
            "Телефон",
            "Регистрация",
            "Проверил",
            *headings,
            *columns.values(),
        ],
    )
    for ticket, row in zip(tickets, rows, strict=True):
        append_text_row(
            sheet,
            [
                ticket["id"],
                ticket["holder_phone"],
                ticket["created_at"].isoformat(),
                ticket["checker"],
                *row,
            ],
        )
    metadata = workbook.create_sheet("Снимок")
    for label, value in [
        ("SnapshotAt", snapshot_at.isoformat()),
        ("EventId", event["id"]),
        ("Slug", event["slug"]),
        ("Мероприятие", event["title"]),
    ]:
        append_text_row(metadata, [label, value])
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def append_text_row(sheet: WriteOnlyWorksheet, values: list[str | None]) -> None:
    cells = []
    for value in values:
        cell = WriteOnlyCell(
            sheet,
            value=ILLEGAL_CHARACTERS_RE.sub("", value) if value is not None else None,
        )
        if value is not None:
            cell.data_type = "s"
        cells.append(cell)
    sheet.append(cells)
