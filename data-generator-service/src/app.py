from datetime import datetime, timezone

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse

from src.config import settings
from src.generator import generate_batch, generate_snapshot
from src.models import ForwardSnapshotRequest, GenerateBatchRequest, GenerateSnapshotRequest

app = FastAPI(
    title="ResMonitor Data Generator Service",
    description="Standalone service for generating synthetic data for the main backend",
    version=settings.service_version,
)


@app.get("/")
def root() -> dict[str, str]:
    return {
        "service": settings.service_name,
        "status": "ok",
        "message": "Synthetic data generator is running",
    }


@app.get("/health")
def health() -> JSONResponse:
    return JSONResponse(
        status_code=200,
        content={
            "status": "healthy",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "version": settings.service_version,
        },
    )


@app.post("/generate/snapshot")
def create_snapshot(payload: GenerateSnapshotRequest):
    snapshot = generate_snapshot(
        house_id=payload.house_id,
        apartments_count=payload.apartments_count,
        seed=payload.seed,
    )
    return snapshot


@app.post("/generate/batch")
def create_batch(payload: GenerateBatchRequest):
    snapshots = generate_batch(
        house_id=payload.house_id,
        apartments_count=payload.apartments_count,
        count=payload.count,
        step_minutes=payload.step_minutes,
        seed=payload.seed,
    )
    return {
        "house_id": payload.house_id,
        "count": len(snapshots),
        "snapshots": snapshots,
    }


@app.post("/forward/snapshot")
async def forward_snapshot(payload: ForwardSnapshotRequest):
    target_url = (payload.target_url or settings.default_target_url).strip()
    if not target_url:
        raise HTTPException(
            status_code=400,
            detail="target_url is required or DEFAULT_TARGET_URL must be set",
        )

    snapshot = generate_snapshot(
        house_id=payload.house_id,
        apartments_count=payload.apartments_count,
        seed=payload.seed,
    )

    timeout = settings.request_timeout_seconds
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(target_url, json=snapshot.model_dump(mode="json"))

    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail={
                "message": "main backend rejected generated payload",
                "target_url": target_url,
                "status_code": response.status_code,
                "response_body": response.text,
            },
        )

    return {
        "status": "forwarded",
        "target_url": target_url,
        "target_status_code": response.status_code,
        "generated_at": snapshot.generated_at,
    }
