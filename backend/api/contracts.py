from typing import Any

ERRORS = {
    "create_event": {409: "IDEMPOTENCY_CONFLICT"},
    "update_event": {422: "VALIDATION"},
    "publish_event": {422: "VALIDATION"},
    "finish_event": {403: "FORBIDDEN"},
    "register_for_event": {
        409: "EVENT_FINISHED, EVENT_FULL, ALREADY_REGISTERED, EMAIL_TAKEN, IDEMPOTENCY_CONFLICT",
        422: "VALIDATION, CONSENT_REQUIRED",
        429: "RATE_LIMITED",
    },
    "cancel_ticket": {409: "TICKET_USED"},
    "cancel_attendee": {403: "FORBIDDEN", 404: "NOT_FOUND", 409: "TICKET_USED"},
    "scan_ticket": {
        403: "EVENT_FINISHED, FORBIDDEN",
        409: "IDEMPOTENCY_CONFLICT",
        429: "RATE_LIMITED",
    },
    "list_attendees": {409: "STALE_PAGE"},
    "upload_cover": {
        413: "INVALID_IMAGE",
        422: "INVALID_IMAGE, VALIDATION",
        503: "STORAGE_UNAVAILABLE",
    },
    "download_cover": {404: "NOT_FOUND", 503: "STORAGE_UNAVAILABLE"},
    "download_ticket": {503: "STORAGE_UNAVAILABLE"},
    "sign_up": {422: "VALIDATION, CONSENT_REQUIRED", 429: "RATE_LIMITED"},
    "log_in": {429: "RATE_LIMITED"},
    "request_password_reset": {429: "RATE_LIMITED"},
    "resend_verification": {429: "RATE_LIMITED"},
    "use_email_link": {429: "RATE_LIMITED"},
}


def document_business_errors(schema: dict[str, Any]) -> None:
    errors = {
        "type": "object",
        "required": ["code", "message"],
        "properties": {
            "code": {"type": "string"},
            "message": {"type": "string"},
            "fields": {"type": "object", "additionalProperties": {"type": "string"}},
        },
    }
    schema["components"]["schemas"]["ApiError"] = errors
    for path in schema["paths"].values():
        for operation in path.values():
            documented = operation["responses"]
            route_name = operation["operationId"].split("_api_", 1)[0]
            known = ERRORS.get(route_name, {})
            if "422" in documented:
                known = {422: "VALIDATION", **known}
            for status, codes in known.items():
                documented[str(status)] = {
                    "description": codes,
                    "content": {
                        "application/json": {
                            "schema": {"$ref": "#/components/schemas/ApiError"}
                        }
                    },
                }
                if status == 429:
                    documented["429"]["headers"] = {
                        "Retry-After": {
                            "schema": {"type": "integer"},
                            "description": "Секунд до повтора",
                        },
                    }
