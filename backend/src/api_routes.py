from fastapi import APIRouter, Query

from src.schemas.monitoring import (
    BuildingCreate,
    BuildingRead,
    DashboardRead,
    MeterCreate,
    MeterRead,
    MetricCreate,
    MetricRead,
)
from src.services.monitoring_service import (
    create_building,
    create_meter,
    create_metric,
    get_dashboard_snapshot,
    list_buildings,
    list_meters,
    list_metrics,
)


api_router = APIRouter(tags=["monitoring"])


@api_router.get("/buildings", response_model=list[BuildingRead])
def get_buildings() -> list[BuildingRead]:
    return list_buildings()


@api_router.post("/buildings", response_model=BuildingRead, status_code=201)
def post_building(payload: BuildingCreate) -> BuildingRead:
    return create_building(payload)


@api_router.get("/meters", response_model=list[MeterRead])
def get_meters(building_id: int | None = Query(default=None, ge=1)) -> list[MeterRead]:
    return list_meters(building_id=building_id)


@api_router.post("/meters", response_model=MeterRead, status_code=201)
def post_meter(payload: MeterCreate) -> MeterRead:
    return create_meter(payload)


@api_router.get("/metrics", response_model=list[MetricRead])
def get_metrics(
    meter_id: int | None = Query(default=None, ge=1),
    limit: int = Query(default=100, ge=1, le=1000),
) -> list[MetricRead]:
    return list_metrics(meter_id=meter_id, limit=limit)


@api_router.post("/metrics", response_model=MetricRead, status_code=201)
def post_metric(payload: MetricCreate) -> MetricRead:
    return create_metric(payload)


@api_router.get("/dashboard", response_model=DashboardRead)
def get_dashboard() -> DashboardRead:
    return get_dashboard_snapshot()
