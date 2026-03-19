"""PostgreSQL database setup for housing module."""

from __future__ import annotations

import logging
import os
from typing import Generator

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from src.housing.models_db import Base

load_dotenv()

logger = logging.getLogger(__name__)

POSTGRES_URL = os.getenv("POSTGRES_URL")

_engine = None
_SessionLocal = None


def _get_engine():
    global _engine
    if _engine is not None:
        return _engine
    if not POSTGRES_URL:
        logger.warning("POSTGRES_URL not set; housing will use in-memory storage")
        return None
    try:
        _engine = create_engine(
            POSTGRES_URL,
            pool_size=5,
            max_overflow=10,
            pool_pre_ping=True,
            pool_recycle=3600,
        )
        logger.info("Housing database connection initialized")
        return _engine
    except Exception as e:
        logger.warning("Failed to connect housing DB: %s; using in-memory storage", e)
        return None


def init_housing_db() -> None:
    """Create housing tables if they don't exist."""
    engine = _get_engine()
    if engine:
        Base.metadata.create_all(bind=engine)
        _ensure_housing_schema(engine)
        logger.info("Housing tables created/verified")
        _seed_tasks_if_empty(engine)


def _ensure_housing_schema(engine) -> None:
    """Backfill new nullable columns for existing housing tables."""
    statements = [
        "ALTER TABLE IF EXISTS housing_tasks ADD COLUMN IF NOT EXISTS complaint_type VARCHAR(64)",
        "ALTER TABLE IF EXISTS housing_tickets ADD COLUMN IF NOT EXISTS complaint_type VARCHAR(64)",
        "ALTER TABLE housing_tasks ALTER COLUMN complaint_type TYPE VARCHAR(64) USING complaint_type::VARCHAR(64)",
        "ALTER TABLE housing_tickets ALTER COLUMN complaint_type TYPE VARCHAR(64) USING complaint_type::VARCHAR(64)",
    ]
    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))


def _seed_tasks_if_empty(engine) -> None:
    """Seed sample tasks if housing_tasks table is empty."""
    from src.housing.models_db import HousingTaskModel
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = Session()
    try:
        count = db.query(HousingTaskModel).count()
        if count > 0:
            return
        today = __import__("datetime").datetime.now(__import__("datetime").timezone.utc).strftime("%Y-%m-%d")
        seed_data = [
            ("t-1", "Morning meter readings check", "Verify all electricity and water meters.", "Maple Residence", "meter", "high", "todo", "09:00"),
            ("t-2", "Inspect gas valve — Section C", "Scheduled inspection of gas collector valve.", "River Park", "inspection", "critical", "todo", "10:30"),
            ("t-3", "Respond to water leak complaint", "Apt 502 reported damp spots. Coordinate plumber.", "Maple Residence", "complaint", "high", "todo", "11:00"),
            ("t-4", "Replace water meter — Block B", "The water meter m-2 has weak signal. Replace.", "Maple Residence", "repair", "medium", "in_progress", "13:00"),
            ("t-5", "Calibrate heating sensors", "Annual calibration of heating sensor array.", "Oak Gardens", "meter", "medium", "in_progress", "14:00"),
            ("t-6", "Review weekly consumption report", "Compile and review aggregated consumption data.", "All buildings", "report", "low", "todo", "16:00"),
            ("t-7", "Upload daily manager summary", "Publish short daily summary.", "Maple Residence", "report", "medium", "todo", "15:00"),
            ("t-8", "Update elevator power baseline", "Recalculate after last week's alert.", "Oak Gardens", "report", "low", "done", "08:00"),
            ("t-9", "Morning building walkthrough", "Visual inspection of common areas.", "River Park", "inspection", "low", "done", "07:30"),
        ]
        houses = {"Maple Residence": "house-1", "River Park": "house-2", "Oak Gardens": "house-3", "All buildings": "all"}
        for tid, title, desc, building, cat, prio, st, due in seed_data:
            hid = houses.get(building, "house-1")
            apt = "apt-502" if "502" in desc else None
            complaint_type = "water" if "water" in desc.lower() else None
            db.add(HousingTaskModel(
                id=tid, title=title, description=desc, building=building, house_id=hid,
                category=cat, priority=prio, status=st, due_time=due, apartment=apt,
                ai_comment=None, source_ticket_id=None, complaint_type=complaint_type, created_at=today,
            ))
        db.commit()
        logger.info("Seeded %d sample tasks", len(seed_data))
    except Exception as e:
        logger.warning("Could not seed tasks: %s", e)
        db.rollback()
    finally:
        db.close()


def get_housing_db() -> Generator:
    """Dependency that yields a database session for housing. Falls back to None if DB unavailable."""
    engine = _get_engine()
    if not engine:
        yield None
        return

    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    db = _SessionLocal()
    try:
        yield db
    finally:
        db.close()
