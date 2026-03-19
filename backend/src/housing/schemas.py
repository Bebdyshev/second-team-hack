from __future__ import annotations

from datetime import datetime
from typing import Literal, Any, get_args

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
    apartment_id: str | None = None  # Resident's assigned apartment; empty for Manager


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


class NearbyService(BaseModel):
    name: str
    service_type: str
    phone: str | None = None
    distance_m: int | None = None
    address: str | None = None
    lat: float | None = None
    lon: float | None = None
    maps_url: str
    maps_2gis_url: str | None = None
    whatsapp_url: str | None = None


class NearbyServicesResponse(BaseModel):
    services: list[NearbyService]
    center_lat: float | None = None
    center_lon: float | None = None
    search_query: str | None = None  # For 2GIS search link (e.g. "сантехник", "электрик")


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
ComplaintType = Literal["neighbors", "water", "electricity", "schedule", "general", "recommendation"]

VALID_COMPLAINT_TYPES = frozenset(get_args(ComplaintType))


def _parse_complaint_types(raw: str | None) -> list[ComplaintType]:
    if not raw:
        return []
    tags = [t.strip().lower() for t in raw.split(",") if t.strip()]
    return [t for t in tags if t in VALID_COMPLAINT_TYPES]


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
    ai_comment: str | None = None
    source_ticket_id: str | None = None
    complaint_type: ComplaintType | None = None
    complaint_types: list[ComplaintType] = []
    created_at: str


class CreateTaskRequest(BaseModel):
    title: str
    description: str = ""
    building: str
    house_id: str | None = None
    category: TaskCategory = "inspection"
    priority: TaskPriority = "medium"
    due_time: str = "12:00"
    complaint_type: ComplaintType | None = None


class UpdateTaskRequest(BaseModel):
    status: TaskStatus | None = None
    title: str | None = None
    description: str | None = None
    decision: str | None = None  # When marking done from ticket: note for resident


# ── Tickets ───────────────────────────────────────────────────────────────────
TicketStatus = Literal["sent", "viewing", "decision"]


class TicketAttachment(BaseModel):
    name: str
    url: str | None = None


class TicketFollowUp(BaseModel):
    id: str
    text: str
    author_id: str
    author_name: str
    author_role: str
    created_at: datetime


class Ticket(BaseModel):
    id: str
    house_id: str
    resident_id: str
    resident_name: str
    resident_email: str
    apartment_id: str
    subject: str
    description: str
    incident_date: str
    incident_time: str
    attachments: list[TicketAttachment]
    status: TicketStatus
    follow_ups: list[TicketFollowUp]
    created_at: datetime
    updated_at: datetime
    viewed_at: datetime | None = None
    decision: str | None = None
    complaint_type: ComplaintType | None = None
    complaint_types: list[ComplaintType] = []


class TicketCreate(BaseModel):
    subject: str = Field(min_length=1)
    description: str = Field(min_length=1)
    incident_date: str = Field(min_length=1)
    incident_time: str = Field(min_length=1)
    attachments: list[TicketAttachment] = []


class TicketFollowUpCreate(BaseModel):
    text: str = Field(min_length=1)


class EcoQuestCompleteRequest(BaseModel):
    quest_id: str
    photo_base64: str = Field(..., min_length=50)  # data:image/jpeg;base64,... or raw base64


class EcoQuestActivityDay(BaseModel):
    date: str  # YYYY-MM-DD
    level: int  # 0=empty, 1=partial, 2=full


class EcoQuestActivityResponse(BaseModel):
    days: list[EcoQuestActivityDay]


class EcoQuestStreakResponse(BaseModel):
    current_streak: int
    last_activity_date: str | None  # most recent day in current streak
    streak_break_date: str | None = None  # when streak broke (first non-7 day going back)
    streak_break_count: int | None = None  # how many tasks done that day (0–6)


class EcoQuestStatusResponse(BaseModel):
    completed: list[str]
    completed_count: int
    total_points: int


class TicketUpdate(BaseModel):
    status: TicketStatus | None = None
    decision: str | None = None


# ── Reports / Transparency ─────────────────────────────────────────────────────

class ReportAnomalyItem(BaseModel):
    id: str
    resource: str
    severity: Literal["low", "medium", "high"]
    title: str
    detected_at: str


class MonthlyReportRow(BaseModel):
    period: str          # e.g. "2026-03"
    electricity_kwh: float
    water_liters: float
    co2_avg_ppm: float
    anomaly_count: int
    apartment_count: int


class ReportProvenance(BaseModel):
    generated_at: str       # ISO timestamp
    source: str             # description of data origin
    thresholds: dict[str, dict[str, float]]  # {resource: {warn: X, critical: Y}}
    meters_used: int
    apartments_measured: int


class ReportOverview(BaseModel):
    house_id: str
    house_name: str
    monthly_rows: list[MonthlyReportRow]
    anomalies: list[ReportAnomalyItem]
    provenance: ReportProvenance
