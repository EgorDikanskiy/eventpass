from collections.abc import Iterator
from os import environ
from pathlib import Path
from typing import Annotated

from fastapi import Depends, Request
from psycopg import Connection
from psycopg.rows import DictRow, dict_row
from psycopg_pool import ConnectionPool

type Row = DictRow
type Database = Connection[Row]


def create_pool() -> ConnectionPool[Database]:
    return ConnectionPool(
        environ["DATABASE_URL"],
        kwargs={"row_factory": dict_row},
        open=False,
        min_size=1,
        max_size=10,
    )


def initialize_database(database: Database) -> None:
    database.execute("SELECT pg_advisory_xact_lock(318650741)")
    directory = Path(__file__).parent
    database.execute((directory / "schema.sql").read_text(encoding="utf-8"))
    database.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY)"
    )
    for migration in sorted((directory / "migrations").glob("*.sql")):
        if database.execute(
            "INSERT INTO schema_migrations VALUES (%s) ON CONFLICT DO NOTHING RETURNING name",
            (migration.name,),
        ).fetchone():
            database.execute(migration.read_text(encoding="utf-8"))


def get_database(request: Request) -> Iterator[Database]:
    pool: ConnectionPool[Database] = request.app.state.database_pool
    with pool.connection() as database:
        yield database


Db = Annotated[Database, Depends(get_database, scope="function")]
