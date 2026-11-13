from hashlib import sha256
from time import time

from fastapi import Request

from backend.api.errors import ApiError


def check_rate_limit(
    request: Request,
    operation: str,
    limit: int,
    *,
    actor: str | None = None,
    window: int = 300,
) -> None:
    now = int(time())
    start = now // window * window
    address = request.client.host if request.client else "unknown"
    key = sha256(f"{operation}:{actor or address}".encode()).hexdigest()
    with request.app.state.rate_limit_pool.connection() as counters:
        row = counters.execute(
            """INSERT INTO rate_limits (bucket, window_start, attempts) VALUES (%s, %s, 1)
               ON CONFLICT (bucket, window_start) DO UPDATE SET attempts = rate_limits.attempts + 1
               WHERE rate_limits.attempts <= %s RETURNING attempts""",
            (key, start, limit),
        ).fetchone()
    if not row or row["attempts"] > limit:
        raise ApiError(
            429,
            "RATE_LIMITED",
            "Слишком много запросов",
            retry_after=start + window - now,
        )
