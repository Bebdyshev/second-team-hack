from datetime import datetime, timedelta, timezone
from random import Random
from typing import Optional

from src.models import ApartmentSnapshot, HouseSnapshot, MeterReading, ResourceAlert, ResourceType


RESOURCE_UNITS: dict[ResourceType, str] = {
    "electricity": "kWh",
    "water": "m3",
    "heating": "Gcal",
    "gas": "m3",
}

RESOURCE_BASELINE: dict[ResourceType, float] = {
    "electricity": 150.0,
    "water": 12.0,
    "heating": 1.8,
    "gas": 14.0,
}

RESOURCE_PRICE_KZT: dict[ResourceType, int] = {
    "electricity": 42,
    "water": 90,
    "heating": 8200,
    "gas": 36,
}

RESOURCES: list[ResourceType] = ["electricity", "water", "heating", "gas"]


def _random_walk_value(*, rng: Random, previous_value: float) -> float:
    delta = rng.uniform(-0.08, 0.18)
    next_value = previous_value * (1 + delta)
    if next_value < 0:
        return 0.0
    return round(next_value, 3)


def _signal_strength(*, rng: Random) -> str:
    roll = rng.random()
    if roll < 0.08:
        return "weak"
    if roll < 0.28:
        return "medium"
    return "strong"


def _status_from_alerts(alerts_count: int) -> str:
    if alerts_count >= 2:
        return "alert"
    if alerts_count == 1:
        return "watch"
    return "good"


def _build_alert(
    *,
    rng: Random,
    house_id: str,
    apartment_id: str,
    meter_id: str,
    resource: ResourceType,
    timestamp: datetime,
) -> ResourceAlert:
    level = "warning" if rng.random() < 0.75 else "critical"
    return ResourceAlert(
        id=f"alert-{apartment_id}-{resource}-{int(timestamp.timestamp())}",
        house_id=house_id,
        apartment_id=apartment_id,
        meter_id=meter_id,
        resource=resource,
        level=level,
        title=f"High {resource} consumption",
        description=f"Consumption is above expected range for {resource}",
        timestamp=timestamp,
    )


def generate_snapshot(
    *,
    house_id: str,
    apartments_count: int,
    seed: Optional[int] = None,
    generated_at: Optional[datetime] = None,
) -> HouseSnapshot:
    timestamp = generated_at or datetime.now(timezone.utc)
    rng = Random(seed if seed is not None else int(timestamp.timestamp()))

    apartments: list[ApartmentSnapshot] = []
    all_alerts: list[ResourceAlert] = []

    for index in range(apartments_count):
        apartment_number = str(100 + index)
        apartment_id = f"apt-{apartment_number}"
        apartment_readings: list[MeterReading] = []
        apartment_alerts: list[ResourceAlert] = []
        apartment_cost = 0

        for resource in RESOURCES:
            meter_id = f"meter-{apartment_number}-{resource}"
            baseline = RESOURCE_BASELINE[resource]
            noise_multiplier = rng.uniform(0.75, 1.35)
            reading_value = _random_walk_value(
                rng=rng,
                previous_value=baseline * noise_multiplier,
            )

            apartment_cost += int(round(reading_value * RESOURCE_PRICE_KZT[resource]))

            reading = MeterReading(
                meter_id=meter_id,
                apartment_id=apartment_id,
                house_id=house_id,
                resource=resource,
                value=reading_value,
                unit=RESOURCE_UNITS[resource],
                timestamp=timestamp,
                signal_strength=_signal_strength(rng=rng),
            )
            apartment_readings.append(reading)

            alert_threshold = baseline * 1.28
            if reading_value > alert_threshold and rng.random() < 0.85:
                alert = _build_alert(
                    rng=rng,
                    house_id=house_id,
                    apartment_id=apartment_id,
                    meter_id=meter_id,
                    resource=resource,
                    timestamp=timestamp,
                )
                apartment_alerts.append(alert)
                all_alerts.append(alert)

        apartments.append(
            ApartmentSnapshot(
                apartment_id=apartment_id,
                apartment_number=apartment_number,
                house_id=house_id,
                status=_status_from_alerts(len(apartment_alerts)),
                total_cost_kzt=apartment_cost,
                readings=apartment_readings,
                alerts=apartment_alerts,
            )
        )

    return HouseSnapshot(
        house_id=house_id,
        generated_at=timestamp,
        apartments=apartments,
        alerts=all_alerts,
    )


def generate_batch(
    *,
    house_id: str,
    apartments_count: int,
    count: int,
    step_minutes: int,
    seed: Optional[int] = None,
) -> list[HouseSnapshot]:
    now = datetime.now(timezone.utc)
    rng = Random(seed if seed is not None else int(now.timestamp()))
    snapshots: list[HouseSnapshot] = []

    for index in range(count):
        snapshot_seed = rng.randint(1, 10**9)
        generated_at = now - timedelta(minutes=step_minutes * (count - index - 1))
        snapshot = generate_snapshot(
            house_id=house_id,
            apartments_count=apartments_count,
            seed=snapshot_seed,
            generated_at=generated_at,
        )
        snapshots.append(snapshot)

    return snapshots
