from os import environ

from backend.api.errors import ApiError
from backend.models.schemas import ConsentDocument, ConsentDocuments


def get_consent_documents() -> ConsentDocuments:
    return ConsentDocuments(
        terms=ConsentDocument(
            url=environ.get("TERMS_URL") or None,
            version=environ.get("TERMS_VERSION") or None,
        ),
        privacy=ConsentDocument(
            url=environ.get("PRIVACY_URL") or None,
            version=environ.get("PRIVACY_VERSION") or None,
        ),
    )


def require_consent(accepted: bool) -> dict[str, str]:
    if not accepted:
        raise ApiError(
            422, "CONSENT_REQUIRED", "Примите условия", {"consentAccepted": "REQUIRED"}
        )
    documents = get_consent_documents()
    return {
        name: document.version
        for name, document in (
            ("terms", documents.terms),
            ("privacy", documents.privacy),
        )
        if document.version
    }
