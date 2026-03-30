"""Tests for race_events Pydantic model validation."""
import pytest
from pydantic import ValidationError
from datetime import date

from api.routers.race_events import RaceEventCreate


class TestRaceEventCreate:
    def test_valid_minimal(self):
        event = RaceEventCreate(name="Berlin Marathon", event_date=date(2026, 9, 27))
        assert event.name == "Berlin Marathon"
        assert event.event_date == date(2026, 9, 27)
        assert event.event_type is None

    def test_valid_with_event_type(self):
        event = RaceEventCreate(
            name="Ironman Frankfurt",
            event_date=date(2026, 6, 28),
            event_type="Full Triathlon"
        )
        assert event.event_type == "Full Triathlon"

    def test_name_required(self):
        with pytest.raises(ValidationError):
            RaceEventCreate(event_date=date(2026, 9, 27))

    def test_name_empty_string_rejected(self):
        with pytest.raises(ValidationError):
            RaceEventCreate(name="", event_date=date(2026, 9, 27))

    def test_name_too_long_rejected(self):
        with pytest.raises(ValidationError):
            RaceEventCreate(name="x" * 256, event_date=date(2026, 9, 27))

    def test_event_type_too_long_rejected(self):
        with pytest.raises(ValidationError):
            RaceEventCreate(
                name="Some Race",
                event_date=date(2026, 9, 27),
                event_type="x" * 101
            )

    def test_date_required(self):
        with pytest.raises(ValidationError):
            RaceEventCreate(name="Some Race")

    def test_event_date_is_date_type(self):
        event = RaceEventCreate(name="Test", event_date=date(2026, 9, 27))
        assert isinstance(event.event_date, date)

    def test_event_type_exactly_100_chars_accepted(self):
        event = RaceEventCreate(
            name="Test",
            event_date=date(2026, 9, 27),
            event_type="x" * 100
        )
        assert len(event.event_type) == 100

    def test_name_exactly_255_chars_accepted(self):
        event = RaceEventCreate(name="x" * 255, event_date=date(2026, 9, 27))
        assert len(event.name) == 255
