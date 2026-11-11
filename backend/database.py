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
    database.execute(Path(__file__).with_name("schema.sql").read_text(encoding="utf-8"))


def get_database(request: Request) -> Iterator[Database]:
    pool: ConnectionPool[Database] = request.app.state.database_pool
    with pool.connection() as database:
        yield database


Db = Annotated[Database, Depends(get_database, scope="function")]
