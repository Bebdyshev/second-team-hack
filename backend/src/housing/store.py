from __future__ import annotations

import hashlib
import random
from datetime import datetime, timezone
from uuid import uuid4

from src.housing.schemas import (
    Apartment,
    House,
    ManagerActionProof,
    MeterHealth,
    ReportAnchor,
    ResourceAlert,
    RoleName,
    UserProfile,
    Organization,
    Membership,
)
from src.utils.auth_utils import hash_password, verify_password


_houses: dict[str, House] = {
    "house-1": House(id="house-1", name="Maple Residence", address="12 Maple Street", units_count=42, occupancy_rate=94, manager="Olivia Smith"),
    "house-2": House(id="house-2", name="River Park", address="88 River Avenue", units_count=60, occupancy_rate=89, manager="Lucas Martin"),
    "house-3": House(id="house-3", name="Oak Gardens", address="31 Oak Lane", units_count=28, occupancy_rate=96, manager="Emma Wilson"),
}

_alerts: list[ResourceAlert] = [
    ResourceAlert(id="a-1", house_id="house-1", house_name="Maple Residence", resource="gas", severity="high", title="Unexpected night-time gas usage spike", detected_at="10:14"),
    ResourceAlert(id="a-2", house_id="house-1", house_name="Maple Residence", resource="water", severity="medium", title="Persistent leak pattern in section B", detected_at="09:02"),
    ResourceAlert(id="a-3", house_id="house-2", house_name="River Park", resource="electricity", severity="low", title="Elevator power draw above baseline", detected_at="07:48"),
]

_meters: list[MeterHealth] = [
    MeterHealth(id="m-1", house_id="house-1", house_name="Maple Residence", resource="electricity", signal_strength="good", last_sync="2 min ago"),
    MeterHealth(id="m-2", house_id="house-1", house_name="Maple Residence", resource="water", signal_strength="weak", last_sync="9 min ago"),
    MeterHealth(id="m-3", house_id="house-2", house_name="River Park", resource="gas", signal_strength="offline", last_sync="53 min ago"),
    MeterHealth(id="m-4", house_id="house-3", house_name="Oak Gardens", resource="heating", signal_strength="good", last_sync="1 min ago"),
]

_apartments: dict[str, Apartment] = {}
_report_anchors: list[ReportAnchor] = []
_manager_action_proofs: list[ManagerActionProof] = []


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _status_from_score(score: int) -> str:
    if score >= 80:
        return "good"
    if score >= 60:
        return "watch"
    return "alert"


def _generate_apartment(house_id: str, floor: int, unit: int) -> Apartment:
    seed = floor * 1000 + unit * 37
    rng = random.Random(seed)
    number = f"{floor}{unit:02d}"
    apt_id = f"apt-{number}"

    base_power = rng.uniform(1.4, 2.8)
    base_water = rng.uniform(18, 42)

    electricity_daily = [round(_clamp(base_power + rng.uniform(-0.35, 0.35) + (0.8 if h in {7, 19} else 0), 0.4, 7.5), 2) for h in range(24)]
    water_daily = [round(_clamp(base_water + rng.uniform(-6.5, 6.5) + (8 if h in {7, 20} else 0), 5, 80), 2) for h in range(24)]
    co2_series = [int(_clamp(530 + rng.uniform(-80, 80) + (130 if h in {18, 20} else 0), 420, 1100)) for h in range(24)]
    humidity_series = [int(_clamp(45 + rng.uniform(-8, 8), 30, 68)) for _ in range(24)]

    electricity_monthly = [round(base_power * 20 + rng.uniform(-4, 5), 2) for _ in range(30)]
    water_monthly = [round(base_water * 3.5 + rng.uniform(-8, 9), 2) for _ in range(30)]

    anomalies: list[str] = []
    anomaly_roll = rng.random()
    if anomaly_roll > 0.45:
        anomalies.append("Unusual electricity spike at 19:00")
    if anomaly_roll < 0.55:
        anomalies.append("Possible water leak at 07:00")
    if 0.25 < anomaly_roll < 0.72:
        anomalies.append("CO2 comfort drop detected at 18:00")

    score_value = int(round(100 - sum(electricity_daily) * 0.85 - sum(water_daily) * 0.06 + rng.uniform(8, 16)))
    score = int(_clamp(score_value, 48, 97))

    return Apartment(
        id=apt_id,
        house_id=house_id,
        floor=floor,
        unit=unit,
        number=number,
        score=score,
        status=_status_from_score(score),  # type: ignore[arg-type]
        electricity_daily=electricity_daily,
        water_daily=water_daily,
        electricity_monthly=electricity_monthly,
        water_monthly=water_monthly,
        co2_series=co2_series,
        humidity_series=humidity_series,
        anomalies=anomalies,
        savings=int(rng.uniform(9, 24)),
    )


def _seed_apartments() -> None:
    if _apartments:
        return
    for floor in range(12, 0, -1):
        for unit in range(1, 9):
            apt = _generate_apartment("house-1", floor, unit)
            _apartments[apt.id] = apt


_users_by_email: dict[str, dict[str, str]] = {
    "manager@resmonitor.kz": {
        "id": "user-manager-1",
        "email": "manager@resmonitor.kz",
        "password_hash": hash_password("manager123"),
        "full_name": "Olivia Smith",
        "role": "Manager",
        "house_id": "house-1",
        "apartment_id": "",
        "refresh_token": "",
    },
    "resident@resmonitor.kz": {
        "id": "user-resident-1",
        "email": "resident@resmonitor.kz",
        "password_hash": hash_password("resident123"),
        "full_name": "Alex Johnson",
        "role": "Resident",
        "house_id": "house-1",
        "apartment_id": "apt-804",
        "refresh_token": "",
    },
}

_users_by_id: dict[str, dict[str, str]] = {item["id"]: item for item in _users_by_email.values()}


def make_profile(user: dict[str, str]) -> UserProfile:
    house = _houses[user["house_id"]]
    return UserProfile(
        id=user["id"],
        email=user["email"],
        full_name=user["full_name"],
        organizations=[Organization(id=house.id, name=house.name)],
        memberships=[Membership(organization_id=house.id, organization_name=house.name, role=user["role"])],
    )


def get_user_by_email(email: str) -> dict[str, str] | None:
    return _users_by_email.get(email.lower().strip())


def get_user_by_id(user_id: str) -> dict[str, str] | None:
    return _users_by_id.get(user_id)


def create_user(email: str, password: str, full_name: str, role: RoleName) -> dict[str, str]:
    normalized = email.lower().strip()
    if normalized in _users_by_email:
        raise ValueError("email already registered")

    new_user = {
        "id": f"user-{uuid4().hex[:12]}",
        "email": normalized,
        "password_hash": hash_password(password),
        "full_name": full_name.strip(),
        "role": role,
        "house_id": "house-1",
        "apartment_id": "apt-801" if role == "Resident" else "",
        "refresh_token": "",
    }
    _users_by_email[normalized] = new_user
    _users_by_id[new_user["id"]] = new_user
    return new_user


def verify_user_password(user: dict[str, str], password: str) -> bool:
    return verify_password(password, user["password_hash"])


def set_refresh_token(user_id: str, refresh_token: str) -> None:
    user = _users_by_id[user_id]
    user["refresh_token"] = refresh_token


def get_houses_for_user(user: dict[str, str]) -> list[House]:
    house = _houses.get(user["house_id"])
    return [house] if house else []


def get_house(house_id: str) -> House | None:
    return _houses.get(house_id)


def get_apartment(apartment_id: str) -> Apartment | None:
    _seed_apartments()
    return _apartments.get(apartment_id)


def list_apartments(house_id: str) -> list[Apartment]:
    _seed_apartments()
    items = [item for item in _apartments.values() if item.house_id == house_id]
    return sorted(items, key=lambda item: (-item.floor, -item.unit))


def list_alerts(house_id: str) -> list[ResourceAlert]:
    return [item for item in _alerts if item.house_id == house_id]


def list_meters(house_id: str) -> list[MeterHealth]:
    return [item for item in _meters if item.house_id == house_id]


def compute_hash(payload: dict) -> str:
    digest = hashlib.sha256(str(payload).encode("utf-8")).hexdigest()
    return f"0x{digest}"


def find_report_anchor(house_id: str, period: str, report_hash: str) -> ReportAnchor | None:
    for item in _report_anchors:
        if item.house_id == house_id and item.period == period and item.report_hash == report_hash:
            return item
    return None


def add_report_anchor(anchor: ReportAnchor) -> ReportAnchor:
    _report_anchors.append(anchor)
    return anchor


def list_report_anchors(house_id: str) -> list[ReportAnchor]:
    return sorted([item for item in _report_anchors if item.house_id == house_id], key=lambda item: item.created_at, reverse=True)


def find_action_proof(house_id: str, action_hash: str) -> ManagerActionProof | None:
    for item in _manager_action_proofs:
        if item.house_id == house_id and item.action_hash == action_hash:
            return item
    return None


def add_action_proof(proof: ManagerActionProof) -> ManagerActionProof:
    _manager_action_proofs.append(proof)
    return proof


def list_action_proofs(house_id: str) -> list[ManagerActionProof]:
    return sorted([item for item in _manager_action_proofs if item.house_id == house_id], key=lambda item: item.created_at, reverse=True)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)
