import asyncio
import hmac
import logging
import os
from contextlib import asynccontextmanager

from consumers import consume_battle_results
from deployment import begin, resume, snapshot
from fastapi import FastAPI, Header
from fastapi.responses import JSONResponse
from routes import auth_router, economy_router, payments_router, users_router
from routes.deps import session_pool
from starlette.middleware.cors import CORSMiddleware

from tasks import refill_energy_periodically


@asynccontextmanager
async def lifespan(app: FastAPI):
    tasks = [
        asyncio.create_task(consume_battle_results(session_pool)),
        asyncio.create_task(refill_energy_periodically(session_pool)),
    ]
    yield
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)


app = FastAPI(lifespan=lifespan)


@app.get("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


def deployment_admin_authorized(token: str) -> bool:
    expected = os.getenv("DEPLOY_ADMIN_TOKEN", "")
    return bool(expected and token and hmac.compare_digest(expected, token))


@app.post("/internal/deployment/drain", include_in_schema=False)
async def deployment_drain(x_deployment_token: str = Header(default="")):
    if not deployment_admin_authorized(x_deployment_token):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    begin("Идёт обновление. Новые бои временно недоступны.")
    return snapshot()


@app.post("/internal/deployment/resume", include_in_schema=False)
async def deployment_resume(x_deployment_token: str = Header(default="")):
    if not deployment_admin_authorized(x_deployment_token):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    resume()
    return snapshot()


@app.get("/internal/deployment/status", include_in_schema=False)
async def deployment_status(x_deployment_token: str = Header(default="")):
    if not deployment_admin_authorized(x_deployment_token):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    return snapshot()


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
