from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from os import environ

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic.alias_generators import to_camel
from starlette.exceptions import HTTPException

from . import auth, events, organizer, scanner, tickets
from .database import create_pool, initialize_database
from .errors import ApiError


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    with create_pool() as pool:
        with pool.connection() as database:
            initialize_database(database)
        app.state.database_pool = pool
        yield


app = FastAPI(
    title="EventPass API",
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
    auth.router,
    events.router,
    tickets.router,
    organizer.router,
    scanner.router,
):
    app.include_router(router, prefix="/api")


@app.get("/api/health", include_in_schema=False)
def get_health() -> dict[str, str]:
    return {"status": "ok"}


@app.exception_handler(ApiError)
async def handle_api_error(request: Request, error: ApiError) -> JSONResponse:
    payload = {"code": error.code, "message": error.message}
    if error.fields:
        payload["fields"] = error.fields
    return JSONResponse(payload, status_code=error.status)


@app.exception_handler(RequestValidationError)
async def handle_validation_error(
    request: Request, error: RequestValidationError
) -> JSONResponse:
    fields = {
        to_camel(str(item["loc"][1])): "Проверьте значение"
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
