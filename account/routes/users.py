import re

from auth import AuthenticatedUser, current_user
from fastapi import APIRouter, Depends, HTTPException, Query
from infrastructure import Repo
from infrastructure.database.models import Invite, User
from services.nickname import normalize_nickname
from sqlalchemy import String, cast, desc, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import joinedload
from sqlalchemy.sql import func
from starlette.requests import Request

from .deps import get_repo

router = APIRouter(prefix="/users")


async def _profile_for(user_id: int, repo: Repo):
    user = await repo.users.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    invites = (
        (
            await repo.session.execute(
                select(Invite)
                .options(joinedload(Invite.invitee))
                .where(Invite.inviter_id == user_id)
            )
        )
        .scalars()
        .all()
    )
    return {
        "tb_username": user.tb_username,
        "clicks": user.clicks,
        "username": user.username,
        "full_name": user.full_name,
        "nickname": user.nickname,
        "invited_users": [invite.invitee.username for invite in invites],
    }


@router.get("/leaderboard")
async def get_leaderboard(repo: Repo = Depends(get_repo)):
    result = await repo.session.execute(
        select(
            User.nickname,
            User.username,
            User.full_name,
            User.clicks,
        )
        .limit(10)
        .order_by(desc(User.clicks))
    )
    return result.mappings().all()


@router.get("/me/profile")
async def my_profile(
    repo: Repo = Depends(get_repo), user: AuthenticatedUser = Depends(current_user)
):
    return await _profile_for(user.user_id, repo)


@router.patch("/me/nickname")
async def update_my_nickname(
    request: Request,
    repo: Repo = Depends(get_repo),
    user: AuthenticatedUser = Depends(current_user),
):
    data = await request.json()
    try:
        nickname = normalize_nickname(data.get("nickname"))
    except (AttributeError, ValueError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    db_user = await repo.users.get_by_id(user.user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    db_user.nickname = nickname
    await repo.session.commit()
    return {"nickname": db_user.nickname}


@router.get("/search")
async def search_users(
    prefix: str | None = Query(None, min_length=3, max_length=19, pattern=r"^\d+$"),
    query: str | None = Query(None, min_length=1, max_length=20),
    limit: int = Query(20, ge=1, le=20),
    repo: Repo = Depends(get_repo),
):
    term = (query if query is not None else prefix or "").strip()
    if not term:
        raise HTTPException(status_code=400, detail="Search query is required")
    if term.isdigit():
        filters = [cast(User.user_id, String).like(f"{term}%")]
    else:
        pattern = f"%{term}%"
        filters = [
            or_(
                User.nickname.ilike(pattern),
                User.username.ilike(pattern),
                User.full_name.ilike(pattern),
            )
        ]
    result = await repo.session.execute(
        select(
            User.user_id.label("player_id"),
            User.username,
            User.full_name,
            User.nickname,
        )
        .where(*filters)
        .order_by(User.user_id)
        .limit(limit)
    )
    return [dict(row) for row in result.mappings().all()]


@router.post("/me/accept_invite")
async def accept_my_invite(
    request: Request,
    repo: Repo = Depends(get_repo),
    user: AuthenticatedUser = Depends(current_user),
):
    user_id = user.user_id
    db_user = await repo.users.get_by_id(user_id)
    accepted_invite = (
        await repo.session.execute(select(Invite).where(Invite.invitee_id == user_id))
    ).scalar_one_or_none()
    if not db_user or accepted_invite:
        raise HTTPException(status_code=404, detail="User already accepted invite")
    data = await request.json()
    inviter_id = data.get("inviter_id")
    if inviter_id == user_id:
        raise HTTPException(status_code=400, detail="Cannot invite yourself")
    inviter = await repo.users.get_by_id(inviter_id)
    if not inviter:
        raise HTTPException(status_code=404, detail="Inviter not found")
    await repo.session.execute(
        insert(Invite).values(inviter_id=inviter.user_id, invitee_id=user_id)
    )
    await repo.session.commit()
    return {"result": "success"}


@router.get("/{user_id}")
async def get_user(user_id: int, repo: Repo = Depends(get_repo)):
    user = await repo.users.get_by_id(user_id)

    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    invite_count = (
        await repo.session.execute(
            select(func.count(Invite.invite_id)).filter(
                Invite.inviter_id == user.user_id
            )
        )
    ).scalar()

    return {"clicks": user.clicks, "count_invites": invite_count}


@router.get("/{user_id}/profile")
async def profile(user_id: int, repo: Repo = Depends(get_repo)):
    return await _profile_for(user_id, repo)


@router.patch("/{user_id}")
async def update_tb_username(
    user_id: int,
    request: Request,
    repo: Repo = Depends(get_repo),
    user: AuthenticatedUser = Depends(current_user),
):
    if user.user_id != user_id:
        raise HTTPException(status_code=403, detail="Cannot update another user")
    data = await request.json()
    new_tb_username = data.get("tb_username")
    if not new_tb_username or not re.match(r"^[a-zA-Z0-9_-]+/[0-9]+$", new_tb_username):
        raise HTTPException(status_code=400, detail="Incorrect TB Username format.")

    query = (
        update(User)
        .where(User.user_id == user_id)
        .values(tb_username=new_tb_username)
        .returning(User.tb_username)
    )
    result = await repo.session.execute(query)
    await repo.session.commit()
    tb_username = result.scalar_one_or_none()
    return {"tb_username": tb_username}


@router.get("/{user_id}/invite_link")
async def get_invite_link(user_id: int, repo: Repo = Depends(get_repo)):
    user = await repo.users.get_by_id(user_id)

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "invite_link": f"https://t.me/TestUpMiniAppBot?startapp=inviterId{user.user_id}"
    }


@router.post("/{user_id}/accept_invite")
async def accept_invite(
    user_id: int,
    request: Request,
    repo: Repo = Depends(get_repo),
    auth_user: AuthenticatedUser = Depends(current_user),
):
    if auth_user.user_id != user_id:
        raise HTTPException(status_code=403, detail="Cannot update another user")
    user = await repo.users.get_by_id(user_id)
    accepted_invite = (
        await repo.session.execute(select(Invite).where(Invite.invitee_id == user_id))
    ).scalar_one_or_none()

    if not user or accepted_invite:
        raise HTTPException(status_code=404, detail="User already accepted invite")

    data = await request.json()
    inviter_id = data.get("inviter_id")
    inviter = await repo.users.get_by_id(inviter_id)

    if not inviter:
        raise HTTPException(status_code=404, detail="Inviter not found")

    query = insert(Invite).values(inviter_id=inviter.user_id, invitee_id=user.user_id)
    await repo.session.execute(query)
    await repo.session.commit()

    return {"result": "success"}


@router.get("/{user_id}/completed_tasks")
async def completed_tasks(user_id: int, repo: Repo = Depends(get_repo)):
    user = await repo.users.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {"completed_tasks": user.completed_tasks, "tb_username": user.tb_username}


@router.get("/{user_id}/invited_users")
async def invited_users(user_id: int, repo: Repo = Depends(get_repo)):
    user = await repo.users.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result = await repo.session.execute(
        select(Invite)
        .options(joinedload(Invite.invitee))
        .where(Invite.inviter_id == user_id)
    )
    invites = result.scalars().all()

    return {"invited_users": [invite.invitee.username for invite in invites]}


@router.post("/{user_id}/complete_task")
async def complete_task(
    user_id: int,
    request: Request,
    repo: Repo = Depends(get_repo),
    auth_user: AuthenticatedUser = Depends(current_user),
):
    if auth_user.user_id != user_id:
        raise HTTPException(status_code=403, detail="Cannot update another user")
    raise HTTPException(
        status_code=410,
        detail="Client-reported task rewards are disabled; tasks must be verified server-side",
    )


@router.post("/click")
async def click(
    request: Request,
    repo: Repo = Depends(get_repo),
    auth_user: AuthenticatedUser = Depends(current_user),
):
    raise HTTPException(
        status_code=410,
        detail="Client-reported currency changes are disabled",
    )
