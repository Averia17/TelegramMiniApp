import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from battle_service.producer import kafka_manager
from battle_service.router import matchmake_router, router as battle_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await kafka_manager.start()
    yield
    await kafka_manager.stop()


app = FastAPI(title="Battle Service", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.DEBUG,
    format="%(levelname)-8s %(asctime)s %(message)s",
    datefmt="%H:%M:%S",
)

app.include_router(battle_router)
app.include_router(matchmake_router)
