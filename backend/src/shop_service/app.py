import logging

from fastapi import APIRouter, FastAPI
from middleware import TimeoutMiddleware
from routes import router
from starlette.middleware.cors import CORSMiddleware

app = FastAPI()
prefix_router = APIRouter(prefix="/api")


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
