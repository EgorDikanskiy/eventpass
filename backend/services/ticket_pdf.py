from datetime import datetime
from functools import lru_cache
from os import environ
from pathlib import Path
from typing import BinaryIO
from xml.sax.saxutils import escape
from zoneinfo import ZoneInfo

from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Paragraph

from backend.models.schemas import Ticket

DESIGN_VERSION = 2
PAGE_WIDTH = 520
PAGE_HEIGHT = 710
CARD = HexColor("#181b25")
DARK = HexColor("#0f131c")
SURFACE = HexColor("#262a34")
TEXT = HexColor("#dfe2ef")
SECONDARY = HexColor("#c7c4d7")
ACCENT = HexColor("#8083ff")
ACCENT_LIGHT = HexColor("#c0c1ff")
STATUS_STYLES = {
    "active": ("Действителен", "#19362f", "#61e4b6"),
    "used": ("Использован", "#30324c", "#c0c1ff"),
    "cancelled": ("Отменён", "#402a35", "#fca5a5"),
    "expired": ("Мероприятие завершено", "#30324c", "#c0c1ff"),
}


@lru_cache
def register_fonts() -> None:
    regular = Path(environ["PDF_FONT_PATH"])
    bold = regular.with_stem(f"{regular.stem}-Bold")
    pdfmetrics.registerFont(TTFont("EventPass", str(regular)))
    pdfmetrics.registerFont(
        TTFont("EventPassBold", str(bold if bold.exists() else regular))
    )


def format_date(value: datetime) -> str:
    timezone = ZoneInfo(environ.get("EVENTPASS_TIMEZONE", "Europe/Moscow"))
    return value.astimezone(timezone).strftime("%d.%m.%Y · %H:%M %Z")


def draw_text(
    canvas: Canvas,
    text: str,
    x: int,
    top: int,
    width: int,
    height: int,
    *,
    size: int = 12,
    bold: bool = False,
) -> None:
    font = "EventPassBold" if bold else "EventPass"
    text = " ".join(text.split())
    for font_size in range(size, 7, -1):
        style = ParagraphStyle(
            "TicketText",
            fontName=font,
            textColor=TEXT,
            fontSize=font_size,
            leading=font_size * 1.22,
        )
        paragraph = Paragraph(escape(text), style)
        _, paragraph_height = paragraph.wrap(width, height)
        if paragraph_height <= height:
            paragraph.drawOn(canvas, x, top - paragraph_height)
            return

    while text:
        text = text[:-12].rstrip()
        paragraph = Paragraph(escape(text) + "…", style)
        _, paragraph_height = paragraph.wrap(width, height)
        if paragraph_height <= height:
            paragraph.drawOn(canvas, x, top - paragraph_height)
            return


def draw_label(canvas: Canvas, label: str, x: int, y: int) -> None:
    canvas.setFont("EventPassBold", 9)
    canvas.setFillColor(ACCENT_LIGHT)
    canvas.drawString(x, y, label.upper())


def get_pdf_status(ticket: Ticket) -> str:
    return (
        "expired"
        if ticket.status == "active" and ticket.event.status == "finished"
        else ticket.status
    )


def draw_header(canvas: Canvas, ticket: Ticket) -> None:
    canvas.setFillColor(ACCENT)
    canvas.roundRect(49, 622, 32, 32, 8, stroke=0, fill=1)
    canvas.setStrokeColor(DARK)
    canvas.setLineWidth(1.3)
    canvas.roundRect(56, 632, 18, 12, 3, stroke=1, fill=0)
    canvas.setDash(1, 2)
    canvas.line(68, 633, 68, 643)
    canvas.setDash()
    canvas.setFillColor(TEXT)
    canvas.setFont("EventPassBold", 20)
    canvas.drawString(91, 631, "EventPass")

    label, background, color = STATUS_STYLES[get_pdf_status(ticket)]
    canvas.setFont("EventPassBold", 10)
    width = canvas.stringWidth(label, "EventPassBold", 10) + 24
    canvas.setFillColor(HexColor(background))
    canvas.roundRect(471 - width, 626, width, 24, 12, stroke=0, fill=1)
    canvas.setFillColor(HexColor(color))
    canvas.drawCentredString(471 - width / 2, 634, label)

    draw_label(canvas, "Электронный билет", 49, 590)
    draw_text(canvas, ticket.event.title, 49, 570, 422, 105, size=29, bold=True)


def draw_details(canvas: Canvas, ticket: Ticket) -> None:
    canvas.setFillColor(SURFACE)
    canvas.roundRect(49, 313, 422, 145, 12, stroke=0, fill=1)
    fields = [
        ("Дата и время", format_date(ticket.event.starts_at), 64, 436),
        ("Место", ticket.event.location, 271, 436),
        ("Участник", ticket.holder_name, 64, 366),
        ("Категория", ticket.category, 271, 366),
    ]
    for label, value, x, y in fields:
        draw_label(canvas, label, x, y)
        draw_text(canvas, value, x, y - 9, 184, 41, size=13, bold=True)


def draw_admission(canvas: Canvas, ticket: Ticket) -> None:
    canvas.setDash(4, 5)
    canvas.setLineWidth(1)
    canvas.setStrokeColor(ACCENT)
    canvas.line(37, 291, 483, 291)
    canvas.setDash()
    canvas.setFillColor(white)
    for edge in (25, 495):
        canvas.circle(edge, 291, 9, stroke=0, fill=1)

    text_x = 49
    status = get_pdf_status(ticket)
    if status in ("active", "used"):
        canvas.roundRect(49, 91, 172, 172, 13, stroke=0, fill=1)
        qr = Drawing(144, 144)
        qr.add(QrCodeWidget(ticket.qr_token, barWidth=144, barHeight=144, barBorder=4))
        renderPDF.draw(qr, canvas, 63, 105)
        text_x = 248

    draw_label(canvas, "Номер билета", text_x, 243)
    draw_text(canvas, ticket.code, text_x, 229, 220, 31, size=23, bold=True)
    draw_label(canvas, "Зона прохода", text_x, 180)
    draw_text(canvas, ticket.zone, text_x, 166, 220, 25, size=13)
    instruction = {
        "cancelled": "Регистрация отменена. Этот билет недействителен.",
        "expired": "Мероприятие завершено.",
        "used": "Проход по этому билету уже отмечен.",
    }.get(status, "Покажите QR-код или номер билета на входе.")
    draw_text(canvas, instruction, text_x, 130, 208, 42)

    canvas.setStrokeColor(SURFACE)
    canvas.line(49, 72, 471, 72)
    canvas.setFillColor(SECONDARY)
    canvas.setFont("EventPass", 10)
    canvas.drawString(49, 51, "EventPass")
    canvas.drawRightString(471, 51, ticket.code)


def render_ticket_pdf(ticket: Ticket, output: BinaryIO) -> None:
    register_fonts()
    canvas = Canvas(output, pagesize=(PAGE_WIDTH, PAGE_HEIGHT))
    canvas.setTitle(f"EventPass {ticket.code}")
    canvas.setAuthor("EventPass")
    canvas.setFillColor(CARD)
    canvas.roundRect(25, 28, 470, 654, 20, stroke=0, fill=1)
    draw_header(canvas, ticket)
    draw_details(canvas, ticket)
    draw_admission(canvas, ticket)
    canvas.showPage()
    canvas.save()
