import base64
import hmac
import logging
from datetime import datetime, timezone

from config import deployment_token
from database import engine, session_pool
from fastapi import Depends, FastAPI, Header, HTTPException, Query, status
from models import ReleaseNews
from schemas import ReleaseNewsCreate, ReleaseNewsListResponse, ReleaseNewsResponse
from sqlalchemy import and_, desc, or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

app = FastAPI(title="Release news service", docs_url=None, redoc_url=None)
logger = logging.getLogger(__name__)


async def get_session() -> AsyncSession:
    async with session_pool() as session:
        yield session


async def require_deployment_token(
    x_deployment_token: str = Header(default=""),
) -> None:
    expected = deployment_token()
    if not expected or not hmac.compare_digest(expected, x_deployment_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid deployment token"
        )


def serialize(item: ReleaseNews) -> ReleaseNewsResponse:
    published_at = item.published_at or datetime.now(timezone.utc)
    return ReleaseNewsResponse(
        id=item.id,
        tag=item.tag,
        commit=item.commit_sha,
        title=item.title,
        body=item.body,
        published_at=published_at,
    )


def encode_cursor(item: ReleaseNews) -> str:
    value = f"{item.published_at.isoformat()}|{item.id}".encode()
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def decode_cursor(value: str) -> tuple[datetime, int]:
    try:
        decoded = base64.urlsafe_b64decode(value + "=" * (-len(value) % 4)).decode()
        timestamp, raw_id = decoded.rsplit("|", 1)
        published_at = datetime.fromisoformat(timestamp)
        item_id = int(raw_id)
        if published_at.tzinfo is None or item_id <= 0:
            raise ValueError
        return published_at, item_id
    except (ValueError, TypeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid news cursor") from None


@app.get("/health", include_in_schema=False)
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready", include_in_schema=False)
async def ready(session: AsyncSession = Depends(get_session)) -> dict[str, str]:
    await session.execute(text("SELECT 1"))
    return {"status": "ready"}


@app.get("/api/news", response_model=ReleaseNewsListResponse)
async def list_news(
    limit: int = Query(default=20, ge=1, le=50),
    cursor: str | None = Query(default=None, max_length=200),
    session: AsyncSession = Depends(get_session),
) -> ReleaseNewsListResponse:
    query = select(ReleaseNews)
    if cursor:
        published_at, item_id = decode_cursor(cursor)
        query = query.where(
            or_(
                ReleaseNews.published_at < published_at,
                and_(
                    ReleaseNews.published_at == published_at, ReleaseNews.id < item_id
                ),
            )
        )
    rows = (
        (
            await session.execute(
                query.order_by(
                    desc(ReleaseNews.published_at), desc(ReleaseNews.id)
                ).limit(limit + 1)
            )
        )
        .scalars()
        .all()
    )
    has_more = len(rows) > limit
    visible = rows[:limit]
    return ReleaseNewsListResponse(
        items=[serialize(item) for item in visible],
        nextCursor=encode_cursor(visible[-1]) if has_more and visible else None,
        hasMore=has_more,
    )


@app.post(
    "/internal/news/releases",
    response_model=ReleaseNewsResponse,
    dependencies=[Depends(require_deployment_token)],
)
async def publish_release(
    payload: ReleaseNewsCreate,
    session: AsyncSession = Depends(get_session),
) -> ReleaseNewsResponse:
    existing = await session.scalar(
        select(ReleaseNews).where(ReleaseNews.tag == payload.tag)
    )
    if existing:
        return serialize(existing)

    item = ReleaseNews(
        tag=payload.tag,
        commit_sha=payload.commit,
        title=payload.title,
        body=payload.body,
    )
    session.add(item)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        existing = await session.scalar(
            select(ReleaseNews).where(ReleaseNews.tag == payload.tag)
        )
        if existing:
            return serialize(existing)
        raise
    await session.refresh(item)
    return serialize(item)


@app.on_event("shutdown")
async def shutdown() -> None:
    await engine.dispose()
