from datetime import datetime, timezone
import logging
import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.housing import router as housing_router
from src.housing.db import init_housing_db

logger = logging.getLogger(__name__)

ENABLE_PUBLIC_DOCS = os.getenv("ENABLE_PUBLIC_DOCS", "true").lower() == "true"

CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3002",
    "http://localhost:5173",
    "http://localhost:5174",
]


def _cors_headers(origin: str | None) -> dict[str, str]:
    if origin and origin in CORS_ORIGINS:
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        }
    return {"Access-Control-Allow-Origin": CORS_ORIGINS[0]}


app = FastAPI(
    title="ResMonitor API",
    description="Building management API for manager and resident roles",
    version="2.0.0",
    docs_url="/docs" if ENABLE_PUBLIC_DOCS else None,
    redoc_url="/redoc" if ENABLE_PUBLIC_DOCS else None,
    openapi_url="/openapi.json" if ENABLE_PUBLIC_DOCS else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    host = request.client.host if request.client else "?"
    print(f">>> {request.method} {request.url.path} (from {host})", flush=True)
    response = await call_next(request)
    return response

app.include_router(housing_router)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Ensure 500 responses include CORS headers so the browser shows the real error."""
    if isinstance(exc, HTTPException):
        raise  # Let FastAPI handle HTTPException (404, 403, etc.)
    logger.exception("unhandled_exception path=%s error=%s", request.url.path, exc)
    origin = request.headers.get("origin")
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
        headers=_cors_headers(origin),
    )


@app.on_event("startup")
def on_startup() -> None:
    init_housing_db()
    from src.housing.geo_services import clear_nearby_cache
    clear_nearby_cache()


@app.get("/")
def root() -> dict[str, str]:
    return {
        "service": "resmonitor-api",
        "status": "ok",
        "message": "Residential building management backend is running",
    }


@app.get("/health")
def health() -> JSONResponse:
    return JSONResponse(
        status_code=200,
        content={
            "status": "healthy",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "version": "2.0.0",
        },
    )