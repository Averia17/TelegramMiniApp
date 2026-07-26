import asyncio
import logging
import os
from contextlib import asynccontextmanager

from consumers import consume_battle_results
from fastapi import FastAPI
from routes import auth_router, economy_router, payments_router, users_router
from routes.deps import session_pool
from starlette.middleware.cors import CORSMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(consume_battle_results(session_pool))
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(lifespan=lifespan)
allowed_origins = ["*"]
if os.getenv("APP_ENV", "development").lower() == "production":
    allowed_origins = [
        origin.strip()
        for origin in os.getenv("ALLOWED_ORIGINS", "").split(",")
        if origin.strip()
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

log_level = logging.DEBUG
logging.getLogger(__name__).setLevel(log_level)
logging.basicConfig(
    level=log_level,
    format="%(levelname)-8s %(asctime)s %(message)s",
    datefmt="%H:%M:%S",
)

app.include_router(users_router)
app.include_router(payments_router)
app.include_router(economy_router)
app.include_router(auth_router)
