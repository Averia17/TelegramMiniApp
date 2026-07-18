import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from routes import users_router, payments_router, economy_router
from consumers import consume_battle_results
from routes.deps import session_pool

@asynccontextmanager
async def lifespan(app: FastAPI):
    task=asyncio.create_task(consume_battle_results(session_pool)); yield; task.cancel()
    try: await task
    except asyncio.CancelledError: pass

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
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
