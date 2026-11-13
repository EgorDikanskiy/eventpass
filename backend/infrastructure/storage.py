from functools import lru_cache
from hashlib import sha256
from io import BytesIO
from os import environ

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from backend.api.errors import ApiError
from backend.models.schemas import Ticket
from backend.services.ticket_pdf import (
    DESIGN_VERSION,
    format_date,
    get_pdf_status,
    render_ticket_pdf,
)


@lru_cache
def get_s3() -> object:
    return boto3.client(
        "s3",
        endpoint_url=environ.get("S3_ENDPOINT_URL"),
        region_name=environ.get("AWS_DEFAULT_REGION", "us-east-1"),
        config=Config(
            connect_timeout=3,
            read_timeout=5,
            retries={"max_attempts": 2},
            s3={"addressing_style": "path"},
        ),
    )


def get_pdf_key(ticket_id: str) -> str:
    return f"tickets/{ticket_id}.pdf"


def delete_ticket_pdf(ticket_id: str) -> None:
    get_s3().delete_object(Bucket=environ["S3_BUCKET"], Key=get_pdf_key(ticket_id))


def get_ticket_pdf(ticket: Ticket) -> bytes:
    client = get_s3()
    location = {"Bucket": environ["S3_BUCKET"], "Key": get_pdf_key(ticket.id)}
    fingerprint = sha256(
        repr(
            (
                DESIGN_VERSION,
                get_pdf_status(ticket),
                ticket.code,
                ticket.qr_token,
                ticket.event.title,
                format_date(ticket.event.starts_at),
                ticket.event.location,
                ticket.holder_name,
                ticket.category,
                ticket.zone,
            )
        ).encode()
    ).hexdigest()
    try:
        try:
            stored = client.get_object(**location)
        except ClientError as error:
            if error.response["Error"]["Code"] not in ("NoSuchKey", "404"):
                raise
        else:
            with stored["Body"] as stream:
                if stored["Metadata"].get("fingerprint") == fingerprint:
                    return stream.read()
        output = BytesIO()
        render_ticket_pdf(ticket, output)
        content = output.getvalue()
        client.put_object(
            **location,
            Body=content,
            ContentType="application/pdf",
            Metadata={"fingerprint": fingerprint},
        )
        return content
    except (BotoCoreError, ClientError) as error:
        raise ApiError(
            503, "STORAGE_UNAVAILABLE", "Хранилище билетов временно недоступно"
        ) from error


def initialize_bucket() -> None:
    from time import sleep

    client = get_s3()
    bucket = environ["S3_BUCKET"]
    for attempt in range(20):
        try:
            client.head_bucket(Bucket=bucket)
            return
        except ClientError as error:
            if error.response["Error"]["Code"] not in ("NoSuchBucket", "404"):
                raise
            client.create_bucket(Bucket=bucket)
            return
        except BotoCoreError:
            if attempt == 19:
                raise
            sleep(2)


if __name__ == "__main__":
    initialize_bucket()
