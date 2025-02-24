import re

from fastapi import Depends, HTTPException, APIRouter
from starlette.requests import Request
from sqlalchemy import select, desc, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.sql import func
from sqlalchemy.orm import joinedload
from miniapp.infrastructure.database.models.users import Invite
from miniapp.infrastructure.database.repo.requests import RequestsRepo
from miniapp.webhook.utils import get_repo

from miniapp.infrastructure.database.models import User

users_router = APIRouter(prefix="/users")


@users_router.get("/leaderboard")
async def get_leaderboard(repo: RequestsRepo = Depends(get_repo)):
    result = await repo.session.execute(select(
        User.username,
        User.full_name,
        User.clicks,
    ).limit(10).order_by(desc(User.clicks)))
    return result.mappings().all()


@users_router.get("/{user_id}")
async def get_user(user_id: int, repo: RequestsRepo = Depends(get_repo)):
    user = await repo.users.get_by_id(user_id)

    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    invite_count = (await repo.session.execute(
        select(func.count(Invite.invite_id)).filter(Invite.inviter_id == user.user_id)
    )).scalar()

    return {"clicks": user.clicks, "count_invites": invite_count}


@users_router.get("/{user_id}/profile")
async def profile(user_id: int, repo: RequestsRepo = Depends(get_repo)):
    user = await repo.users.get_by_id(user_id)

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    invites = (await repo.session.execute(
        select(Invite)
        .options(joinedload(Invite.invitee))
        .where(Invite.inviter_id == user_id)
    )).scalars().all()

    return {"tb_username": user.tb_username, "clicks": user.clicks, "username": user.username,
            "full_name": user.full_name, "invited_users": [invite.invitee.username for invite in invites]}


@users_router.patch("/{user_id}")
async def update_tb_username(user_id: int, request: Request, repo: RequestsRepo = Depends(get_repo)):
    data = await request.json()
    new_tb_username = data.get("tb_username")
    if not new_tb_username or not re.match(r'^[a-zA-Z0-9_-]+/[0-9]+$', new_tb_username):
        raise HTTPException(status_code=400, detail="Incorrect TB Username format.")

    query = update(User).where(User.user_id == user_id).values(tb_username=new_tb_username).returning(User.tb_username)
    result = await repo.session.execute(query)
    await repo.session.commit()
    tb_username = result.scalar_one_or_none()
    return {"tb_username": tb_username}


@users_router.get("/{user_id}/invite_link")
async def get_invite_link(user_id: int, repo: RequestsRepo = Depends(get_repo)):
    user = await repo.users.get_by_id(user_id)

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {"invite_link": f"https://t.me/TestUpMiniAppBot?startapp=inviterId{user.user_id}"}


@users_router.post("/{user_id}/accept_invite")
async def accept_invite(user_id: int, request: Request, repo: RequestsRepo = Depends(get_repo)):
    user = await repo.users.get_by_id(user_id)
    accepted_invite = (await repo.session.execute(select(Invite).where(Invite.invitee_id == user_id))).scalar_one_or_none()

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


@users_router.get("/{user_id}/completed_tasks")
async def completed_tasks(user_id: int, repo: RequestsRepo = Depends(get_repo)):
    user = await repo.users.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {"completed_tasks": user.completed_tasks, "tb_username": user.tb_username}


@users_router.get("/{user_id}/invited_users")
async def invited_users(user_id: int, repo: RequestsRepo = Depends(get_repo)):
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


@users_router.post("/{user_id}/complete_task")
async def complete_task(user_id: int, request: Request, repo: RequestsRepo = Depends(get_repo)):
    user = await repo.users.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    data = await request.json()
    task_id = data["task_id"]

    if task_id not in user.completed_tasks:
        user.completed_tasks.append(task_id)
        await repo.users.update_completed_tasks(user_id, user.completed_tasks, data["reward"])

    return {"completed_tasks": user.completed_tasks}


@users_router.post("/click")
async def click(request: Request, repo: RequestsRepo = Depends(get_repo)):
    data = await request.json()

    if data.get("user_id") and data.get("clicks"):
        await repo.users.update_clicks(data["user_id"], data["clicks"])

    return data.get("clicks", 0)
