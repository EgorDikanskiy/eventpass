from fastapi import APIRouter, Response, UploadFile

from backend.api.auth import CurrentUser, Viewer
from backend.api.errors import ApiError
from backend.infrastructure.database import Db
from backend.models.schemas import EventCover
from backend.services.event_covers import MAX_IMAGE_BYTES, read_cover, store_cover

router = APIRouter(prefix="/assets/event-covers", tags=["Обложки"])


@router.post("", status_code=201)
def upload_cover(file: UploadFile, database: Db, user: CurrentUser) -> EventCover:
    content = file.file.read(MAX_IMAGE_BYTES + 1)
    if len(content) > MAX_IMAGE_BYTES:
        raise ApiError(413, "INVALID_IMAGE", "Обложка должна занимать до 5 МиБ")
    return store_cover(database, user["id"], content)


@router.get("/{asset_id}", response_class=Response)
def download_cover(asset_id: str, database: Db, user: Viewer) -> Response:
    content, mime_type = read_cover(database, asset_id, user)
    return Response(content, media_type=mime_type)
