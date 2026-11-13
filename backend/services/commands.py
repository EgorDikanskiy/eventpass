from hashlib import sha256
from json import dumps
from typing import Annotated

from fastapi import Header
from psycopg.types.json import Jsonb
from pydantic import BaseModel

from backend.api.errors import ApiError
from backend.infrastructure.database import Database

IdempotencyKey = Annotated[
    str | None,
    Header(
        description="Ключ повтора команды. Успешный результат хранится 24 часа.",
        min_length=16,
        max_length=128,
        pattern=r"^[A-Za-z0-9._:-]+$",
    ),
]


class Command:
    def __init__(
        self, database: Database, scope: str, key: str | None, body: BaseModel
    ) -> None:
        self.database = database
        self.scope = scope
        self.key_hash = sha256(key.encode()).hexdigest() if key else None
        self.fingerprint = sha256(
            dumps(body.model_dump(mode="json"), sort_keys=True).encode()
        ).hexdigest()

    def replay[Result: BaseModel](self, model: type[Result]) -> Result | None:
        if self.key_hash is None:
            return None
        self.database.execute(
            "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
            (f"{self.scope}:{self.key_hash}",),
        )
        self.database.execute(
            "DELETE FROM command_results WHERE scope = %s AND key_hash = %s AND expires_at <= now()",
            (self.scope, self.key_hash),
        )
        row = self.database.execute(
            "SELECT fingerprint, outcome FROM command_results WHERE scope = %s AND key_hash = %s",
            (self.scope, self.key_hash),
        ).fetchone()
        if row is None:
            return None
        if row["fingerprint"] != self.fingerprint:
            raise ApiError(
                409, "IDEMPOTENCY_CONFLICT", "Ключ уже использован с другими данными"
            )
        return model.model_validate(row["outcome"])

    def save[Result: BaseModel](self, result: Result) -> Result:
        if self.key_hash:
            self.database.execute(
                "INSERT INTO command_results (scope, key_hash, fingerprint, outcome) VALUES (%s, %s, %s, %s)",
                (
                    self.scope,
                    self.key_hash,
                    self.fingerprint,
                    Jsonb(result.model_dump(mode="json")),
                ),
            )
        return result
