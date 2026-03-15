import logging

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from battle_service.router import matchmake_router, router as battle_router

app = FastAPI(title="Battle Service")

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
