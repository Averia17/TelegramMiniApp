import logging
import os

from fastapi import APIRouter, FastAPI
from middlewares import TimeoutMiddleware
from routes import router
from starlette.middleware.cors import CORSMiddleware

app = FastAPI()
prefix_router = APIRouter(prefix="/api")


origins = [
    # "https://factual-herring-driven.ngrok-free.app",
    # "http://localhost:80",
    # "http://localhost",
]
if os.getenv("APP_ENV", "development").lower() == "production":
    origins = [
        origin.strip()
        for origin in os.getenv("ALLOWED_ORIGINS", "").split(",")
        if origin.strip()
    ]
else:
    origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(TimeoutMiddleware)

log_level = logging.DEBUG
logging.getLogger(__name__).setLevel(log_level)
logging.basicConfig(
    level=log_level,
    format="%(levelname)-8s %(asctime)s %(message)s",
    datefmt="%H:%M:%S",
)

prefix_router.include_router(router)

app.include_router(prefix_router)
