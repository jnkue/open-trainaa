import math
from api.analytics.hr_curve import (
    filter_hr_data,
    calculate_max_average_hr,
    extract_hr_curve,
    estimate_session_lthr,
    calculate_efficiency_factor,
    calculate_hr_zone_time,
    get_hr_zones,
    detect_max_hr,
    HR_CURVE_DURATIONS,
)


class TestFilterHrData:
    def test_empty_returns_none(self):
        result = filter_hr_data([])
        assert result is None

    def test_removes_values_below_30(self):
        data = [0, 10, 20, 150, 155, 160]
        result = filter_hr_data(data)
        assert result is not None
        assert math.isnan(result[0])
        assert math.isnan(result[1])
        assert math.isnan(result[2])
        assert result[3] == 150

    def test_removes_values_above_220(self):
        data = [150, 155, 230, 250, 160]
        result = filter_hr_data(data)
        assert result is not None
        assert math.isnan(result[2])
        assert math.isnan(result[3])
        assert result[0] == 150

    def test_spike_detection_removes_outliers(self):
        data = [150] * 20 + [200] + [150] * 20
        result = filter_hr_data(data)
        assert result is not None
        assert math.isnan(result[20])

    def test_gradual_change_preserved(self):
        data = [120 + i for i in range(61)]
        result = filter_hr_data(data)
        assert result is not None
        nan_count = sum(1 for v in result if math.isnan(v))
        assert nan_count == 0

    def test_cadence_lock_detection(self):
        data = [90] * 3700
        result = filter_hr_data(data)
        assert result is None

    def test_cadence_lock_not_triggered_short_session(self):
        data = [90] * 1800
        result = filter_hr_data(data)
        assert result is not None

    def test_below_80_percent_valid_returns_none(self):
        data = [10] * 75 + [150] * 25
        result = filter_hr_data(data)
        assert result is None

    def test_interpolates_small_gaps(self):
        data = [150] * 10 + [0, 0] + [150] * 10
        result = filter_hr_data(data)
        assert result is not None
        assert not math.isnan(result[10])
        assert not math.isnan(result[11])

    def test_large_gaps_stay_nan(self):
        data = [150] * 10 + [0, 0, 0, 0, 0] + [150] * 10
        result = filter_hr_data(data)
        assert result is not None
        assert math.isnan(result[12])

    def test_none_values_treated_as_invalid(self):
        data = [150, None, 150, 150, 150]
        result = filter_hr_data(data)
        assert result is not None


class TestCalculateMaxAverageHr:
    def test_empty_returns_zero(self):
        assert calculate_max_average_hr([], 10) == 0

    def test_data_shorter_than_window_returns_zero(self):
        assert calculate_max_average_hr([150.0, 160.0], 10) == 0

    def test_constant_hr(self):
        data = [150.0] * 100
        assert calculate_max_average_hr(data, 30) == 150

    def test_finds_max_window(self):
        data = [130.0] * 50 + [180.0] * 10 + [130.0] * 40
        result = calculate_max_average_hr(data, 10)
        assert result == 180

    def test_skips_windows_with_nan(self):
        data = [150.0] * 10 + [float('nan')] + [150.0] * 10
        result = calculate_max_average_hr(data, 5)
        assert result == 150

    def test_all_nan_returns_zero(self):
        data = [float('nan')] * 20
        assert calculate_max_average_hr(data, 5) == 0


class TestExtractHrCurve:
    def test_empty_returns_empty(self):
        assert extract_hr_curve([]) == {}

    def test_constant_hr(self):
        data = [160.0] * 600
        result = extract_hr_curve(data)
        assert result["1"] == 160
        assert result["300"] == 160
        assert result["600"] == 160
        assert "660" not in result

    def test_spike_in_short_durations(self):
        data = [190.0] * 5 + [150.0] * 595
        result = extract_hr_curve(data)
        assert result["1"] == 190
        assert result["5"] == 190
        assert result["10"] < 180

    def test_durations_skipped_when_data_too_short(self):
        data = [155.0] * 25
        result = extract_hr_curve(data)
        assert "1" in result
        assert "5" in result
        assert "10" in result
        assert "30" not in result

    def test_returns_dict_with_string_keys_int_values(self):
        data = [165.0] * 120
        result = extract_hr_curve(data)
        for key in result:
            assert isinstance(key, str)
            assert isinstance(result[key], int)


class TestEstimateSessionLthr:
    def test_60min_session_uses_3600s_avg(self):
        hr_curve = {str(d): 170 for d in HR_CURVE_DURATIONS if d <= 3600}
        lthr = estimate_session_lthr(hr_curve)
        assert lthr == 170

    def test_30min_session_uses_1800s_with_reduction(self):
        hr_curve = {"1": 185, "5": 182, "10": 180, "30": 178, "60": 175, "300": 172, "1800": 170}
        lthr = estimate_session_lthr(hr_curve)
        assert lthr is not None
        assert abs(lthr - 164.9) < 1

    def test_20min_session_uses_1200s_with_reduction(self):
        hr_curve = {"1": 185, "5": 182, "10": 180, "30": 178, "60": 175, "300": 172, "1200": 170}
        lthr = estimate_session_lthr(hr_curve)
        assert lthr is not None
        assert abs(lthr - 161.5) < 1

    def test_short_session_returns_none(self):
        hr_curve = {"1": 185, "5": 182, "10": 180, "30": 178, "60": 175}
        lthr = estimate_session_lthr(hr_curve)
        assert lthr is None


class TestCalculateEfficiencyFactor:
    def test_cycling_ef(self):
        ef = calculate_efficiency_factor(sport="cycling", avg_heart_rate=150, avg_power=200)
        assert ef is not None
        assert abs(ef - 1.33) < 0.01

    def test_running_ef(self):
        ef = calculate_efficiency_factor(sport="running", avg_heart_rate=155, total_distance=10800.0, total_timer_time=3600.0)
        assert ef is not None
        assert abs(ef - 1.94) < 0.01

    def test_low_hr_returns_none(self):
        ef = calculate_efficiency_factor(sport="cycling", avg_heart_rate=80, avg_power=200)
        assert ef is None

    def test_missing_power_returns_none(self):
        ef = calculate_efficiency_factor(sport="cycling", avg_heart_rate=150)
        assert ef is None

    def test_missing_distance_returns_none(self):
        ef = calculate_efficiency_factor(sport="running", avg_heart_rate=155, total_timer_time=3600.0)
        assert ef is None


class TestCalculateHrZoneTime:
    def test_all_in_one_zone(self):
        data = [100.0] * 100
        result = calculate_hr_zone_time(data, lthr=170.0)
        assert result["1"] == 100
        assert result["2"] == 0

    def test_distributed_across_zones(self):
        data = ([100.0] * 20 + [130.0] * 20 + [150.0] * 20 + [170.0] * 20 + [190.0] * 20)
        result = calculate_hr_zone_time(data, lthr=170.0)
        assert result["1"] == 20
        assert result["2"] == 20
        assert result["3"] == 20
        assert result["4"] == 20
        assert result["5"] == 20

    def test_nan_values_excluded(self):
        data = [150.0] * 10 + [float('nan')] * 5 + [150.0] * 10
        result = calculate_hr_zone_time(data, lthr=170.0)
        total = sum(result.values())
        assert total == 20


class TestGetHrZones:
    def test_returns_5_zones(self):
        zones = get_hr_zones(170.0)
        assert len(zones) == 5

    def test_zone_boundaries(self):
        lthr = 170.0
        zones = get_hr_zones(lthr)
        assert zones[0]["zone"] == 1
        assert zones[0]["name"] == "Recovery"
        assert zones[0]["min_bpm"] == 0
        assert zones[0]["max_bpm"] == int(round(lthr * 0.68))
        assert zones[3]["zone"] == 4
        assert zones[3]["name"] == "Threshold"
        assert zones[3]["min_bpm"] == int(round(lthr * 0.94))
        assert zones[3]["max_bpm"] == int(round(lthr * 1.05))
        assert zones[4]["zone"] == 5
        assert zones[4]["name"] == "Anaerobic"
        assert zones[4]["max_bpm"] is None

    def test_zones_are_contiguous(self):
        zones = get_hr_zones(165.0)
        for i in range(len(zones) - 1):
            assert zones[i]["max_bpm"] == zones[i + 1]["min_bpm"]


class TestDetectMaxHr:
    def test_finds_max_from_raw_data(self):
        data = [150, 155, 160, 195, 160, 155]
        assert detect_max_hr(data) == 195

    def test_ignores_below_30(self):
        data = [0, 10, 150, 155]
        assert detect_max_hr(data) == 155

    def test_ignores_above_220(self):
        data = [150, 155, 250, 160]
        assert detect_max_hr(data) == 160

    def test_preserves_legitimate_spikes(self):
        data = [150] * 50 + [180, 185, 190, 195] + [160] * 50
        assert detect_max_hr(data) == 195

    def test_empty_returns_none(self):
        assert detect_max_hr([]) is None

    def test_all_invalid_returns_none(self):
        assert detect_max_hr([0, 10, 250]) is None

    def test_handles_none_values(self):
        data = [None, 150, None, 180, None]
        assert detect_max_hr(data) == 180

    def test_all_none_returns_none(self):
        assert detect_max_hr([None, None, None]) is None
