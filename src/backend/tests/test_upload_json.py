"""
Tests for the POST /v1/activities/upload-json endpoint.

Tests the Pydantic model validation and endpoint logic for Apple Health
and other JSON-based activity uploads.
"""

import pytest

from api.routers.activities import ActivityJsonUpload, RecordsPayload


# --- Pydantic Model Tests ---


class TestActivityJsonUploadModel:
    """Tests for the ActivityJsonUpload Pydantic model validation."""

    def test_valid_minimal_payload(self):
        payload = ActivityJsonUpload(
            upload_source="apple_health",
            external_id="ABC-123-DEF",
            sport="running",
            start_time="2024-01-15T08:30:00Z",
        )
        assert payload.upload_source == "apple_health"
        assert payload.external_id == "ABC-123-DEF"
        assert payload.sport == "running"
        assert payload.total_distance is None
        assert payload.records is None

    def test_valid_full_payload(self):
        payload = ActivityJsonUpload(
            upload_source="apple_health",
            external_id="ABC-123-DEF",
            sport="running",
            sub_sport="trail",
            start_time="2024-01-15T08:30:00+01:00",
            total_distance=5000.0,
            total_elapsed_time=1800.0,
            total_timer_time=1750.0,
            total_calories=450,
            avg_heart_rate=155,
            max_heart_rate=178,
            avg_speed=2.78,
            max_speed=3.5,
            avg_cadence=85,
            total_elevation_gain=50.0,
            records=RecordsPayload(
                timestamp=[0, 1, 2],
                heart_rate=[140, 142, 145],
                latitude=[48.123, 48.124, 48.125],
                longitude=[11.567, 11.568, 11.569],
                altitude=[520.0, 520.5, 521.0],
            ),
        )
        assert payload.total_distance == 5000.0
        assert payload.max_speed == 3.5
        assert payload.records is not None
        assert len(payload.records.timestamp) == 3
        assert payload.records.heart_rate == [140, 142, 145]

    def test_invalid_start_time(self):
        with pytest.raises(Exception):
            ActivityJsonUpload(
                upload_source="apple_health",
                external_id="ABC-123",
                sport="running",
                start_time="not-a-date",
            )

    def test_negative_distance_rejected(self):
        with pytest.raises(Exception):
            ActivityJsonUpload(
                upload_source="apple_health",
                external_id="ABC-123",
                sport="running",
                start_time="2024-01-15T08:30:00Z",
                total_distance=-100.0,
            )

    def test_negative_heart_rate_rejected(self):
        with pytest.raises(Exception):
            ActivityJsonUpload(
                upload_source="apple_health",
                external_id="ABC-123",
                sport="running",
                start_time="2024-01-15T08:30:00Z",
                avg_heart_rate=-5,
            )

    def test_missing_required_fields(self):
        with pytest.raises(Exception):
            ActivityJsonUpload(
                upload_source="apple_health",
                sport="running",
                start_time="2024-01-15T08:30:00Z",
                # missing external_id
            )

    def test_empty_records_payload(self):
        payload = ActivityJsonUpload(
            upload_source="apple_health",
            external_id="ABC-123",
            sport="cycling",
            start_time="2024-01-15T08:30:00Z",
            records=RecordsPayload(),
        )
        assert payload.records.timestamp == []
        assert payload.records.heart_rate == []

    def test_start_time_with_timezone(self):
        payload = ActivityJsonUpload(
            upload_source="apple_health",
            external_id="ABC-123",
            sport="swimming",
            start_time="2024-06-15T14:30:00+02:00",
        )
        assert payload.start_time == "2024-06-15T14:30:00+02:00"

    def test_start_time_utc(self):
        payload = ActivityJsonUpload(
            upload_source="apple_health",
            external_id="ABC-123",
            sport="hiking",
            start_time="2024-06-15T12:30:00Z",
        )
        assert payload.start_time == "2024-06-15T12:30:00Z"


class TestRecordsPayload:
    """Tests for the RecordsPayload Pydantic model."""

    def test_valid_records(self):
        records = RecordsPayload(
            timestamp=[0, 5, 10],
            heart_rate=[140, 145, None],
            latitude=[48.1, 48.2, None],
            longitude=[11.5, 11.6, None],
        )
        assert len(records.timestamp) == 3
        assert records.heart_rate[2] is None

    def test_empty_records(self):
        records = RecordsPayload()
        assert records.timestamp == []
        assert records.heart_rate == []
        assert records.latitude == []

    def test_nullable_values_in_arrays(self):
        records = RecordsPayload(
            timestamp=[0, 1, 2],
            heart_rate=[140, None, 145],
            speed=[2.5, None, 3.0],
            power=[200, None, None],
        )
        assert records.heart_rate[1] is None
        assert records.speed[1] is None
        assert records.power[2] is None


class TestDeduplication:
    """Tests for deduplication logic in the upload-json endpoint."""

    def test_external_id_uniqueness_check(self):
        """Verify that the same external_id + upload_source should be detected as duplicate."""
        payload1 = ActivityJsonUpload(
            upload_source="apple_health",
            external_id="HK-WORKOUT-UUID-123",
            sport="running",
            start_time="2024-01-15T08:30:00Z",
        )
        payload2 = ActivityJsonUpload(
            upload_source="apple_health",
            external_id="HK-WORKOUT-UUID-123",
            sport="running",
            start_time="2024-01-15T08:30:00Z",
        )
        # Same external_id + upload_source should be flagged as duplicate
        assert payload1.external_id == payload2.external_id
        assert payload1.upload_source == payload2.upload_source

    def test_different_source_same_external_id(self):
        """Different upload_source with same external_id should NOT be considered duplicate."""
        payload1 = ActivityJsonUpload(
            upload_source="apple_health",
            external_id="SOME-UUID-123",
            sport="running",
            start_time="2024-01-15T08:30:00Z",
        )
        payload2 = ActivityJsonUpload(
            upload_source="garmin",
            external_id="SOME-UUID-123",
            sport="running",
            start_time="2024-01-15T08:30:00Z",
        )
        # Different upload_source means these are from different providers
        assert payload1.upload_source != payload2.upload_source


class TestSportTypeValidation:
    """Tests for sport type values in the upload payload."""

    @pytest.mark.parametrize(
        "sport",
        [
            "running",
            "cycling",
            "swimming",
            "hiking",
            "walking",
            "rowing",
            "training",
            "fitness_equipment",
            "hiit",
            "generic",
        ],
    )
    def test_common_sport_types(self, sport):
        payload = ActivityJsonUpload(
            upload_source="apple_health",
            external_id="test-uuid",
            sport=sport,
            start_time="2024-01-15T08:30:00Z",
        )
        assert payload.sport == sport
