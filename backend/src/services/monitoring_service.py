from datetime import datetime
from threading import Lock

from fastapi import HTTPException

from src.schemas.monitoring import (
    BuildingCreate,
    BuildingRead,
    DashboardRead,
    MeterCreate,
    MeterRead,
    MetricCreate,
    MetricRead,
    ResourceType,
)


storage_lock = Lock()
buildings: list[BuildingRead] = []
meters: list[MeterRead] = []
metrics: list[MetricRead] = []


def list_buildings() -> list[BuildingRead]:
    return buildings


def create_building(payload: BuildingCreate) -> BuildingRead:
    with storage_lock:
        building = BuildingRead(
            id=len(buildings) + 1,
            name=payload.name,
            address=payload.address,
            apartment_count=payload.apartment_count,
            created_at=datetime.utcnow(),
        )
        buildings.append(building)
        return building


def list_meters(building_id: int | None = None) -> list[MeterRead]:
    if building_id is None:
        return meters
    return [meter for meter in meters if meter.building_id == building_id]


def create_meter(payload: MeterCreate) -> MeterRead:
    has_building = any(building.id == payload.building_id for building in buildings)
    if not has_building:
        raise HTTPException(status_code=404, detail="Building not found")

    with storage_lock:
        meter = MeterRead(
            id=len(meters) + 1,
            building_id=payload.building_id,
            serial_number=payload.serial_number,
            resource_type=payload.resource_type,
            location=payload.location,
            is_active=True,
            created_at=datetime.utcnow(),
        )
        meters.append(meter)
        return meter


def list_metrics(meter_id: int | None = None, limit: int = 100) -> list[MetricRead]:
    if limit < 1:
        return []

    if meter_id is None:
        return metrics[-limit:]

    filtered = [metric for metric in metrics if metric.meter_id == meter_id]
    return filtered[-limit:]


def create_metric(payload: MetricCreate) -> MetricRead:
    has_meter = any(meter.id == payload.meter_id for meter in meters)
    if not has_meter:
        raise HTTPException(status_code=404, detail="Meter not found")

    with storage_lock:
        metric = MetricRead(
            id=len(metrics) + 1,
            meter_id=payload.meter_id,
            value=payload.value,
            recorded_at=payload.recorded_at,
            created_at=datetime.utcnow(),
        )
        metrics.append(metric)
        return metric


def get_dashboard_snapshot() -> DashboardRead:
    latest_metrics_by_resource: dict[ResourceType, float] = {}

    for resource in ResourceType:
        resource_meter_ids = [
            meter.id for meter in meters if meter.resource_type == resource and meter.is_active
        ]
        if not resource_meter_ids:
            continue

        resource_metrics = [metric for metric in metrics if metric.meter_id in resource_meter_ids]
        if not resource_metrics:
            continue

        latest_metrics_by_resource[resource] = resource_metrics[-1].value

    return DashboardRead(
        building_count=len(buildings),
        meter_count=len(meters),
        metric_count=len(metrics),
        latest_metrics_by_resource=latest_metrics_by_resource,
    )
