from __future__ import annotations

from datetime import datetime
from typing import Literal, Any

from pydantic import BaseModel, Field, EmailStr


RoleName = Literal["Manager", "Resident"]
TxStatus = Literal["pending", "confirmed", "failed"]
ApartmentStatus = Literal["good", "watch", "alert"]


class Organization(BaseModel):
    id: str
    name: str


class Membership(BaseModel):
    organization_id: str
    organization_name: str
    role: str


class UserProfile(BaseModel):
    id: str
    email: str
    full_name: str
    organizations: list[Organization]
    memberships: list[Membership]


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserProfile


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=4)


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=4)
    full_name: str = Field(min_length=2)
    role: RoleName = "Resident"


class RefreshRequest(BaseModel):
    refresh_token: str


class House(BaseModel):
    id: str
    name: str
    address: str
    units_count: int
    occupancy_rate: int
    manager: str


class Apartment(BaseModel):
    id: str
    house_id: str
    floor: int
    unit: int
    number: str
    score: int
    status: ApartmentStatus
    electricity_daily: list[float]
    water_daily: list[float]
    electricity_monthly: list[float]
    water_monthly: list[float]
    co2_series: list[int]
    humidity_series: list[int]
    anomalies: list[str]
    savings: int


class HouseSummary(BaseModel):
    house: House
    total_power: float
    total_water: float
    average_air: int
    city_impact: int
    alerts_count: int


class DynamicsPoint(BaseModel):
    label: str
    value: float


class DynamicsResponse(BaseModel):
    resource: str
    period: str
    dynamics: list[DynamicsPoint]


class ResourceAlert(BaseModel):
    id: str
    house_id: str
    house_name: str
    resource: str
    severity: Literal["low", "medium", "high"]
    title: str
    detected_at: str


class MeterHealth(BaseModel):
    id: str
    house_id: str
    house_name: str
    resource: str
    signal_strength: Literal["good", "weak", "offline"]
    last_sync: str


class ReportAnchor(BaseModel):
    id: str
    house_id: str
    period: str
    metadata_uri: str
    report_hash: str
    triggered_by: str
    status: TxStatus
    tx_hash: str
    block_number: int
    chain_id: int
    contract_address: str
    explorer_url: str
    error_message: str
    created_at: datetime
    updated_at: datetime


class ManagerActionProof(BaseModel):
    id: str
    house_id: str
    action_type: str
    actor_id: str
    action_hash: str
    triggered_by: str
    status: TxStatus
    tx_hash: str
    block_number: int
    chain_id: int
    contract_address: str
    explorer_url: str
    error_message: str
    created_at: datetime
    updated_at: datetime


class AnchorRequest(BaseModel):
    period: str | None = None
    metadata_uri: str | None = None
    report_hash: str | None = None


class ProveActionRequest(BaseModel):
    house_id: str | None = None
    action_type: str
    actor_id: str | None = None
    payload: dict[str, Any] | None = None


TaskStatus = Literal["todo", "in_progress", "done"]
TaskPriority = Literal["low", "medium", "high", "critical"]
TaskCategory = Literal["inspection", "repair", "meter", "complaint", "report"]


class Task(BaseModel):
    id: str
    title: str
    description: str
    building: str
    house_id: str
    category: TaskCategory
    priority: TaskPriority
    status: TaskStatus
    due_time: str
    apartment: str | None = None
    created_at: str


class CreateTaskRequest(BaseModel):
    title: str
    description: str = ""
    building: str
    house_id: str | None = None
    category: TaskCategory = "inspection"
    priority: TaskPriority = "medium"
    due_time: str = "12:00"


class UpdateTaskRequest(BaseModel):
    status: TaskStatus | None = None
    title: str | None = None
    description: str | None = None
