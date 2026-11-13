import json
import os
from datetime import UTC, datetime, timedelta
from urllib.error import HTTPError
from urllib.request import Request, urlopen

API_URL = os.environ.get("STAGING_API_URL", "http://127.0.0.1:18090/api")


def call_api(path: str, data: dict | None = None, token: str | None = None) -> dict:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = Request(
        API_URL + path,
        data=json.dumps(data).encode() if data is not None else None,
        headers=headers,
    )
    with urlopen(request, timeout=15) as response:
        return json.load(response)


def get_test_account(role: str, password: str) -> dict:
    credentials = {"email": f"staging.{role}@example.com", "password": password}
    try:
        return call_api(
            "/auth/register",
            {
                **credentials,
                "fullName": f"Staging {role}",
                "consentAccepted": True,
            },
        )
    except HTTPError as error:
        if error.code != 409:
            raise
        return call_api("/auth/login", credentials)


def main() -> None:
    password = os.environ["STAGING_TEST_PASSWORD"]
    owner = get_test_account("organizer", password)
    volunteer = get_test_account("volunteer", password)
    participant = get_test_account("participant", password)
    token = owner["token"]
    events = call_api("/me/events", token=token)["items"]
    existing = next(
        (item for item in events if item["title"] == "Android staging demo"), None
    )
    if existing:
        print(json.dumps(existing, ensure_ascii=False))
        return
    event = call_api(
        "/events",
        {
            "title": "Android staging demo",
            "description": "Тестовое мероприятие для Android",
            "location": "Staging",
            "startsAt": (datetime.now(UTC) + timedelta(days=90)).isoformat(),
            "capacity": 30,
            "publish": True,
            "questions": [
                {
                    "id": "confirmed",
                    "type": "checkbox",
                    "label": "Подтверждаю участие",
                    "required": True,
                }
            ],
            "sections": [{"id": "welcome", "title": "Открытие", "time": "10:00"}],
        },
        token,
    )
    path = f"/events/{event['id']}"
    call_api(path + "/volunteers", {"identifier": volunteer["user"]["publicId"]}, token)
    call_api(
        path + "/registrations",
        {"consentAccepted": True, "answers": {"confirmed": True}},
        participant["token"],
    )
    print(json.dumps(event, ensure_ascii=False))


if __name__ == "__main__":
    main()
