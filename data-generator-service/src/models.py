from datetime import datetime
from pydantic import BaseModel, Field
from typing import Literal, Optional


ResourceType = Literal["electricity", "water", "heating", "gas"]
SignalStrength = Literal["strong", "medium", "weak"]
ApartmentStatus = Literal["good", "watch", "alert"]
AlertLevel = Literal["info", "warning", "critical"]


class MeterReading(BaseModel):
    meter_id: str
    apartment_id: str
    house_id: str
    resource: ResourceType
    value: float = Field(ge=0)
    unit: str
    timestamp: datetime
    signal_strength: SignalStrength


class ResourceAlert(BaseModel):
    id: str
    house_id: str
    apartment_id: str
    meter_id: str
    resource: ResourceType
    level: AlertLevel
    title: str
    description: str
    timestamp: datetime


class ApartmentSnapshot(BaseModel):
    apartment_id: str
    apartment_number: str
    house_id: str
    status: ApartmentStatus
    total_cost_kzt: int = Field(ge=0)
    readings: list[MeterReading]
    alerts: list[ResourceAlert]


class HouseSnapshot(BaseModel):
    house_id: str
    generated_at: datetime
    apartments: list[ApartmentSnapshot]
    alerts: list[ResourceAlert]


class GenerateSnapshotRequest(BaseModel):
    house_id: str = "house-1"
    apartments_count: int = Field(default=8, ge=1, le=200)
    seed: Optional[int] = None


class GenerateBatchRequest(BaseModel):
    house_id: str = "house-1"
    apartments_count: int = Field(default=8, ge=1, le=200)
    count: int = Field(default=24, ge=1, le=5000)
    step_minutes: int = Field(default=60, ge=1, le=1440)
    seed: Optional[int] = None


class ForwardSnapshotRequest(BaseModel):
    target_url: Optional[str] = None
    house_id: str = "house-1"
    apartments_count: int = Field(default=8, ge=1, le=200)
    seed: Optional[int] = None
