from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from os import environ
from re import fullmatch
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic.alias_generators import to_camel
from starlette.exceptions import HTTPException
from starlette.middleware.base import RequestResponseEndpoint
from starlette.responses import Response

from backend.api.contracts import document_business_errors
from backend.api.errors import ApiError
from backend.infrastructure.database import create_pool, initialize_database

from . import assets, auth, events, organizer, scanner, tickets


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    with create_pool() as pool, create_pool() as rate_limit_pool:
        with pool.connection() as database:
            initialize_database(database)
        app.state.database_pool = pool
        app.state.rate_limit_pool = rate_limit_pool
        yield


app = FastAPI(
    title="EventPass API",
    version="1.1.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)
allowed_origins = [
    origin.strip()
    for origin in environ.get("CORS_ORIGINS", "").split(",")
    if origin.strip()
]
if allowed_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
for router in (
    assets.router,
    auth.router,
    events.router,
    tickets.router,
    organizer.router,
    scanner.router,
):
    app.include_router(router, prefix="/api")


@app.middleware("http")
async def prevent_api_caching(
    request: Request, call_next: RequestResponseEndpoint
) -> Response:
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/.well-known/assetlinks.json", include_in_schema=False)
def get_android_app_links() -> JSONResponse:
    application_id = environ.get("ANDROID_APPLICATION_ID", "")
    fingerprints = [
        value.strip().upper()
        for value in environ.get("ANDROID_CERT_FINGERPRINTS", "").split(",")
        if value.strip()
    ]
    if (
        not fullmatch(
            r"[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+", application_id
        )
        or not fingerprints
        or any(
            not fullmatch(r"(?:[0-9A-F]{2}:){31}[0-9A-F]{2}", value)
            for value in fingerprints
        )
    ):
        raise ApiError(404, "NOT_FOUND", "Android App Links ещё не настроены")
    return JSONResponse(
        [
            {
                "relation": ["delegate_permission/common.handle_all_urls"],
                "target": {
                    "namespace": "android_app",
                    "package_name": application_id,
                    "sha256_cert_fingerprints": fingerprints,
                },
            }
        ]
    )


@app.get("/api/health", include_in_schema=False)
def get_health() -> dict[str, str]:
    return {"status": "ok"}


@app.exception_handler(ApiError)
async def handle_api_error(request: Request, error: ApiError) -> JSONResponse:
    payload = {"code": error.code, "message": error.message}
    if error.fields:
        payload["fields"] = error.fields
    headers = {"Retry-After": str(error.retry_after)} if error.retry_after else None
    return JSONResponse(payload, status_code=error.status, headers=headers)


@app.exception_handler(RequestValidationError)
async def handle_validation_error(
    request: Request, error: RequestValidationError
) -> JSONResponse:
    fields = {
        ".".join(to_camel(str(part)) for part in item["loc"][1:]): item["type"].upper()
        for item in error.errors()
        if len(item["loc"]) > 1
    }
    return JSONResponse(
        {"code": "VALIDATION", "message": "Проверьте поля формы", "fields": fields},
        status_code=422,
    )


@app.exception_handler(HTTPException)
async def handle_http_error(request: Request, error: HTTPException) -> JSONResponse:
    code = "NOT_FOUND" if error.status_code == 404 else "UNKNOWN"
    message = "Страница не найдена" if error.status_code == 404 else str(error.detail)
    return JSONResponse(
        {"code": code, "message": message},
        status_code=error.status_code,
        headers=error.headers,
    )


generate_openapi = app.openapi


def get_openapi() -> dict[str, Any]:
    if app.openapi_schema is None:
        document_business_errors(generate_openapi())
    return app.openapi_schema


app.openapi = get_openapi
