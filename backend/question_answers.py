from datetime import date
from math import isfinite
from re import fullmatch

from email_validator import EmailNotValidError, validate_email

from .errors import invalid
from .schemas import OPTION_QUESTION_TYPES, Answer, Question


def get_answer_error(question: Question, answer: Answer) -> str | None:
    if not answer:
        return "Обязательный вопрос" if question.required else None

    options = {option.value for option in question.options or []}
    if question.type == "multiple":
        if (
            not isinstance(answer, list)
            or len(answer) != len(set(answer))
            or not set(answer) <= options
        ):
            return "Выберите варианты из списка"
        return None

    if not isinstance(answer, str):
        return "Введите один ответ"
    if question.type in OPTION_QUESTION_TYPES and answer not in options:
        return "Выберите вариант из списка"
    if question.type == "email":
        try:
            validate_email(answer, check_deliverability=False)
        except EmailNotValidError:
            return "Проверьте email"
    if question.type == "tel" and (
        not fullmatch(r"\+?[0-9 ().-]+", answer)
        or not 7 <= sum(character.isdigit() for character in answer) <= 15
    ):
        return "Введите номер телефона"
    if question.type == "number" and (
        not fullmatch(
            r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?", answer
        )
        or not isfinite(float(answer))
    ):
        return "Введите число"
    if question.type == "date":
        try:
            if date.fromisoformat(answer).isoformat() != answer:
                return "Введите дату"
        except ValueError:
            return "Введите дату"
    return None


def validate_answers(
    questions: list[Question], answers: dict[str, Answer]
) -> dict[str, Answer]:
    normalized: dict[str, Answer] = {}
    errors: dict[str, str] = {}
    for question in questions:
        answer = answers.get(question.id, "")
        if isinstance(answer, str):
            answer = answer.strip()
        if error := get_answer_error(question, answer):
            errors[question.id] = error
        elif answer:
            normalized[question.id] = answer
    if errors:
        raise invalid("Проверьте ответы анкеты", errors)
    return normalized


def get_answer_label(question: Question, answer: Answer = "") -> str:
    labels = {option.value: option.label for option in question.options or []}
    values = answer if isinstance(answer, list) else [answer]
    return ", ".join(labels.get(value, value) for value in values)
