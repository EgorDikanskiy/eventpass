import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formatdate
from os import environ
from time import sleep

import pika
from botocore.exceptions import BotoCoreError, ClientError
from pika.adapters.blocking_connection import BlockingChannel
from psycopg import OperationalError
from psycopg_pool import ConnectionPool, PoolTimeout

from .database import Database, create_pool
from .jobs import resolve_ticket_notification
from .storage import delete_ticket_pdf

QUEUE_NAME = "eventpass.jobs"
logger = logging.getLogger(__name__)


def send_email(payload: dict[str, str], job_id: int) -> None:
    sender = environ["SMTP_FROM"]
    message = EmailMessage()
    message["From"] = sender
    message["To"] = payload["email"]
    message["Subject"] = payload["subject"]
    message["Date"] = formatdate()
    message["Message-ID"] = f"<eventpass-{job_id}@{sender.rsplit('@', 1)[-1]}>"
    message.set_content(payload["body"])
    with smtplib.SMTP(
        environ["SMTP_HOST"], int(environ.get("SMTP_PORT", "587")), timeout=8
    ) as smtp:
        if environ.get("SMTP_STARTTLS", "true") == "true":
            smtp.starttls(context=ssl.create_default_context())
        if username := environ.get("SMTP_USERNAME"):
            smtp.login(username, environ["SMTP_PASSWORD"])
        smtp.send_message(message)


def publish_job(database: Database, channel: BlockingChannel) -> bool:
    job = database.execute(
        """SELECT id FROM jobs WHERE published_at IS NULL AND failed_at IS NULL AND available_at <= now()
           ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED"""
    ).fetchone()
    if not job:
        return False
    channel.basic_publish(
        exchange="",
        routing_key=QUEUE_NAME,
        body=str(job["id"]).encode(),
        properties=pika.BasicProperties(delivery_mode=2),
        mandatory=True,
    )
    database.execute("UPDATE jobs SET published_at = now() WHERE id = %s", (job["id"],))
    return True


def run_job(database: Database, job_id: int) -> None:
    job = database.execute(
        "SELECT * FROM jobs WHERE id = %s AND published_at IS NOT NULL AND failed_at IS NULL FOR UPDATE",
        (job_id,),
    ).fetchone()
    if not job:
        return
    payload = job["payload"]
    assert isinstance(payload, dict)
    try:
        if job["kind"] == "email":
            if notification := payload.get("notification"):
                payload = resolve_ticket_notification(
                    database, payload["ticket_id"], notification
                )
            if payload:
                send_email(payload, job_id)
        else:
            delete_ticket_pdf(payload["ticket_id"])
    except (OSError, smtplib.SMTPException, BotoCoreError, ClientError) as error:
        logger.warning("Job %s failed (%s)", job_id, type(error).__name__)
        database.execute(
            """UPDATE jobs SET attempts = attempts + 1, published_at = NULL,
                   available_at = now() + interval '30 seconds',
                   failed_at = CASE WHEN attempts >= 4 THEN now() END
               WHERE id = %s""",
            (job_id,),
        )
    else:
        database.execute("DELETE FROM jobs WHERE id = %s", (job_id,))


def run_worker(pool: ConnectionPool[Database]) -> None:
    parameters = pika.URLParameters(environ["RABBITMQ_URL"])
    with pika.BlockingConnection(parameters) as connection:
        channel = connection.channel()
        channel.queue_declare(queue=QUEUE_NAME, durable=True)
        channel.confirm_delivery()
        while True:
            with pool.connection() as database:
                published = publish_job(database, channel)
            delivery, _, body = channel.basic_get(QUEUE_NAME)
            if delivery:
                with pool.connection() as database:
                    run_job(database, int(body))
                channel.basic_ack(delivery.delivery_tag)
            elif not published:
                connection.sleep(0.5)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    logging.getLogger("pika").setLevel(logging.WARNING)
    with create_pool() as pool:
        while True:
            try:
                run_worker(pool)
            except (pika.exceptions.AMQPError, OperationalError, PoolTimeout) as error:
                logger.warning("Worker reconnecting (%s)", type(error).__name__)
                sleep(3)


if __name__ == "__main__":
    main()
