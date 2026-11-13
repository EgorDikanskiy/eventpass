from io import BytesIO
from os import environ
from uuid import uuid4

from botocore.exceptions import BotoCoreError, ClientError
from PIL import Image, ImageOps, UnidentifiedImageError

from backend.api.errors import ApiError, forbidden, not_found
from backend.infrastructure.database import Database, Row
from backend.infrastructure.storage import get_s3
from backend.models.schemas import EventCover

MAX_IMAGE_BYTES = 5 * 1024 * 1024
MIME_TYPES = {"JPEG": "image/jpeg", "PNG": "image/png"}


def cover_url(asset_id: str | None) -> str | None:
    return f"/api/assets/event-covers/{asset_id}" if asset_id else None


def storage_error() -> ApiError:
    return ApiError(503, "STORAGE_UNAVAILABLE", "Хранилище обложек временно недоступно")


def require_owned_cover(
    database: Database, asset_id: str | None, owner_id: str
) -> None:
    if (
        asset_id
        and not database.execute(
            "SELECT 1 FROM event_covers WHERE id = %s AND owner_id = %s FOR KEY SHARE",
            (asset_id, owner_id),
        ).fetchone()
    ):
        raise forbidden("Нет доступа к обложке")


def store_cover(database: Database, owner_id: str, content: bytes) -> EventCover:
    try:
        with Image.open(BytesIO(content)) as source:
            image_format = source.format
            if (
                image_format not in MIME_TYPES
                or source.width * source.height > 25_000_000
            ):
                raise ValueError("Unsupported image")
            oriented = ImageOps.exif_transpose(source)
            mode = "RGB" if image_format == "JPEG" else "RGBA"
            clean = Image.new(mode, oriented.size)
            clean.paste(oriented.convert(mode))
            width, height = clean.size
            output = BytesIO()
            clean.save(output, format=image_format, optimize=True)
            normalized = output.getvalue()
    except (
        OSError,
        ValueError,
        UnidentifiedImageError,
        Image.DecompressionBombError,
    ) as error:
        raise ApiError(
            422, "INVALID_IMAGE", "Загрузите изображение JPEG или PNG"
        ) from error
    if len(normalized) > MAX_IMAGE_BYTES:
        raise ApiError(422, "INVALID_IMAGE", "Обложка должна занимать до 5 МиБ")
    asset_id = uuid4().hex
    mime_type = MIME_TYPES[image_format]
    database.execute(
        """INSERT INTO event_covers (id, owner_id, mime_type, byte_count, width, height)
           VALUES (%s, %s, %s, %s, %s, %s)""",
        (asset_id, owner_id, mime_type, len(normalized), width, height),
    )
    try:
        get_s3().put_object(
            Bucket=environ["S3_BUCKET"],
            Key=f"covers/{asset_id}",
            Body=normalized,
            ContentType=mime_type,
        )
    except (BotoCoreError, ClientError) as error:
        raise storage_error() from error
    return EventCover(
        asset_id=asset_id,
        url=cover_url(asset_id),
        mime_type=mime_type,
        byte_count=len(normalized),
        width=width,
        height=height,
    )


def read_cover(
    database: Database, asset_id: str, user: Row | None
) -> tuple[bytes, str]:
    asset = database.execute(
        """SELECT mime_type FROM event_covers WHERE id = %s AND (owner_id = %s OR EXISTS (
             SELECT 1 FROM events WHERE cover_asset_id = event_covers.id AND published
           )) FOR KEY SHARE""",
        (asset_id, user["id"] if user else None),
    ).fetchone()
    if not asset:
        raise not_found("Обложка не найдена")
    try:
        stored = get_s3().get_object(
            Bucket=environ["S3_BUCKET"], Key=f"covers/{asset_id}"
        )
        with stored["Body"] as body:
            return body.read(), asset["mime_type"]
    except (BotoCoreError, ClientError) as error:
        raise storage_error() from error


def delete_unused_covers(database: Database) -> None:
    covers = database.execute(
        """SELECT id FROM event_covers WHERE (owner_id IS NULL OR created_at <= now() - interval '1 day')
           AND NOT EXISTS (SELECT 1 FROM events WHERE cover_asset_id = event_covers.id)
           ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED"""
    ).fetchall()
    for cover in covers:
        asset_id = cover["id"]
        removed = database.execute(
            """DELETE FROM event_covers WHERE id = %s
               AND NOT EXISTS (SELECT 1 FROM events WHERE cover_asset_id = %s) RETURNING id""",
            (asset_id, asset_id),
        ).fetchone()
        if removed:
            get_s3().delete_object(
                Bucket=environ["S3_BUCKET"], Key=f"covers/{asset_id}"
            )
