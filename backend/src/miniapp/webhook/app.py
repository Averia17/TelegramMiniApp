import logging

from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

from miniapp.webhook import routers
from miniapp.webhook.battle.websocket import battle_router

app = FastAPI()
prefix_router = APIRouter(prefix="/api")

log_level = logging.INFO
log = logging.getLogger(__name__)

origins = [
    # "https://factual-herring-driven.ngrok-free.app",
    # "http://localhost:80",
    # "http://localhost",
]

app.add_middleware(
    CORSMiddleware,
    # allow_origins=origins,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.getLogger(__name__).setLevel(logging.INFO)
logging.basicConfig(
    level=logging.INFO,
    format="%(filename)s:%(lineno)d #%(levelname)-8s [%(asctime)s] - %(name)s - %(message)s",
)

app.include_router(battle_router)
for router in [
    routers.users.users_router,
]:
    prefix_router.include_router(router)

app.include_router(prefix_router)
