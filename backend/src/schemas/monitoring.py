from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class ResourceType(str, Enum):
    electricity = "electricity"
    cold_water = "cold_water"
    hot_water = "hot_water"
    heating = "heating"
    gas = "gas"


class BuildingCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    address: str = Field(min_length=5, max_length=255)
    apartment_count: int = Field(ge=1, le=10000)


class BuildingRead(BuildingCreate):
    id: int
    created_at: datetime


class MeterCreate(BaseModel):
    building_id: int = Field(ge=1)
    serial_number: str = Field(min_length=3, max_length=64)
    resource_type: ResourceType
    location: str = Field(default="technical_room", min_length=2, max_length=120)


class MeterRead(MeterCreate):
    id: int
    is_active: bool
    created_at: datetime


class MetricCreate(BaseModel):
    meter_id: int = Field(ge=1)
    value: float = Field(ge=0)
    recorded_at: datetime = Field(default_factory=datetime.utcnow)


class MetricRead(MetricCreate):
    id: int
    created_at: datetime


class DashboardRead(BaseModel):
    building_count: int
    meter_count: int
    metric_count: int
    latest_metrics_by_resource: dict[ResourceType, float]
