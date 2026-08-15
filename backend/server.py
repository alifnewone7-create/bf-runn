"""Binary Fund Global — FastAPI backend (PostgreSQL + Redis + OTC market engine)."""
import os
import logging
import asyncio
from pathlib import Path
from contextlib import asynccontextmanager

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
import socketio

from market import engine
from seed import run_seeds
import candle_store
from routes.auth_routes import router as auth_router
from routes.market_routes import router as market_router
from routes.trade_routes import router as trade_router
from routes.admin_routes import router as admin_router
from routes.purchase_routes import router as purchase_router
from routes.ws_routes import market_loop, settle_loop
from routes.sio_hub import sio

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine.seed()
    await run_seeds()
    market_task = asyncio.create_task(market_loop())
    settle_task = asyncio.create_task(settle_loop())
    candle_task = asyncio.create_task(candle_store.run())
    logger.info("OTC market engine + settle loop started")
    try:
        yield
    finally:
        market_task.cancel()
        settle_task.cancel()
        candle_task.cancel()


app = FastAPI(title="Binary Fund Global API", lifespan=lifespan)

api = APIRouter(prefix="/api")
api.include_router(auth_router)
api.include_router(market_router)
api.include_router(trade_router)
api.include_router(admin_router)
api.include_router(purchase_router)


@api.get("/")
async def root():
    return {"service": "binary-fund-global", "status": "ok"}


@api.get("/health")
async def health():
    return {"status": "healthy"}


@api.get("/config/public")
async def public_config():
    """Public runtime config for the frontend. Values are pulled from backend env."""
    return {
        "google_client_id": os.environ.get("GOOGLE_CLIENT_ID", ""),
    }


app.include_router(api)

# CORS — strict allowlist from env. Comma-separated origins in CORS_ORIGINS.
# Cookies work because we use explicit origins (not wildcard) with credentials.
_origins_raw = os.environ.get("CORS_ORIGINS", "")
origins = [o.strip().rstrip("/") for o in _origins_raw.split(",") if o.strip()]
# Optional regex allowlist (e.g. Emergent preview subdomains).
origin_regex = os.environ.get("CORS_ORIGIN_REGEX") or None

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
logger.info(f"CORS allowlist: {origins} regex={origin_regex}")

# Mount Socket.IO ASGI app on top of FastAPI.
# Client connects via: io(url, { path: "/api/socket.io/" })
# Kubernetes ingress routes /api/* to backend port 8001, so the path MUST start
# with /api. socketio_path is the path *without* the leading slash.
app = socketio.ASGIApp(sio, other_asgi_app=app, socketio_path="api/socket.io")
