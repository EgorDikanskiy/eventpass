class ApiError(Exception):
    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        fields: dict[str, str] | None = None,
        *,
        retry_after: int | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.fields = fields
        self.retry_after = retry_after


def invalid(message: str, fields: dict[str, str] | None = None) -> ApiError:
    return ApiError(422, "VALIDATION", message, fields)


def not_found(message: str) -> ApiError:
    return ApiError(404, "NOT_FOUND", message)


def forbidden(message: str) -> ApiError:
    return ApiError(403, "FORBIDDEN", message)
