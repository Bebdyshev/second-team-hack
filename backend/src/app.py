from datetime import datetime, timezone
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.housing import router as housing_router


ENABLE_PUBLIC_DOCS = os.getenv("ENABLE_PUBLIC_DOCS", "true").lower() == "true"

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
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3002",
        "http://localhost:5173",
        "http://localhost:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(housing_router)


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