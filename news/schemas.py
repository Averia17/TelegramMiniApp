import re
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

TAG_PATTERN = re.compile(r"^v\d+\.\d+\.\d+$")
COMMIT_PATTERN = re.compile(r"^[0-9a-fA-F]{7,64}$")


class ReleaseNewsCreate(BaseModel):
    tag: str = Field(min_length=5, max_length=32)
    commit: str = Field(min_length=7, max_length=64)
    title: str = Field(default="Новое обновление арены", max_length=160)
    body: str = Field(
        default="Вышло новое обновление. Спасибо, что играете!", max_length=2000
    )

    @field_validator("tag")
    @classmethod
    def validate_tag(cls, value: str) -> str:
        if not TAG_PATTERN.fullmatch(value):
            raise ValueError("tag must be a semantic release tag")
        return value

    @field_validator("commit")
    @classmethod
    def validate_commit(cls, value: str) -> str:
        if not COMMIT_PATTERN.fullmatch(value):
            raise ValueError("commit must be a git SHA")
        return value

    @field_validator("title", "body")
    @classmethod
    def strip_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("text must not be empty")
        return value


class ReleaseNewsResponse(BaseModel):
    id: int
    tag: str
    commit: str
    title: str
    body: str
    published_at: datetime


class ReleaseNewsListResponse(BaseModel):
    items: list[ReleaseNewsResponse]
    nextCursor: str | None = None
    hasMore: bool = False
