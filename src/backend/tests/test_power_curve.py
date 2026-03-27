from api.analytics.power_curve import extract_power_curve, calculate_max_average_np, POWER_CURVE_DURATIONS


class TestCalculateMaxAverageNp:
    def test_empty_data_returns_zero(self):
        assert calculate_max_average_np([], 10) == 0

    def test_data_shorter_than_window_returns_zero(self):
        assert calculate_max_average_np([100, 200, 300], 10) == 0

    def test_constant_power(self):
        data = [200] * 100
        assert calculate_max_average_np(data, 30) == 200

    def test_finds_max_window(self):
        data = [100] * 50 + [300] * 10 + [100] * 40
        result = calculate_max_average_np(data, 10)
        assert result == 300

    def test_matches_reference_implementation(self):
        import random
        random.seed(42)
        data = [random.randint(50, 400) for _ in range(600)]
        for window in [5, 30, 60, 300]:
            np_result = calculate_max_average_np(data, window)
            max_avg = 0
            for i in range(len(data) - window + 1):
                avg = sum(data[i:i + window]) / window
                max_avg = max(max_avg, avg)
            assert np_result == round(max_avg), f"Mismatch at window={window}"


class TestExtractPowerCurve:
    def test_empty_data_returns_empty(self):
        assert extract_power_curve([]) == {}

    def test_constant_power_all_same(self):
        data = [200] * 600
        result = extract_power_curve(data)
        assert result["1"] == 200
        assert result["300"] == 200
        assert result["600"] == 200
        assert "660" not in result

    def test_spike_in_short_durations(self):
        data = [1000] * 5 + [200] * 595
        result = extract_power_curve(data)
        assert result["1"] == 1000
        assert result["5"] == 1000
        assert result["10"] < 700

    def test_durations_skipped_when_data_too_short(self):
        data = [250] * 25
        result = extract_power_curve(data)
        assert "1" in result
        assert "5" in result
        assert "10" in result
        assert "30" not in result
        assert "60" not in result

    def test_returns_dict_with_string_keys_int_values(self):
        data = [300] * 120
        result = extract_power_curve(data)
        for key in result:
            assert isinstance(key, str)
            assert isinstance(result[key], int)

    def test_5min_20min_60min_durations_included(self):
        assert 300 in POWER_CURVE_DURATIONS
        assert 1200 in POWER_CURVE_DURATIONS
        assert 3600 in POWER_CURVE_DURATIONS

    def test_data_with_none_values(self):
        """FIT files often have None values when power meter drops out."""
        data = [200] * 50 + [None] * 10 + [200] * 540
        result = extract_power_curve(data)
        assert "1" in result
        assert result["1"] == 200
        assert result["300"] > 0

    def test_data_with_nan_float_values(self):
        """Power data may contain float NaN values."""
        data = [200.0] * 50 + [float('nan')] * 10 + [200.0] * 540
        result = extract_power_curve(data)
        assert "1" in result
        assert result["300"] > 0

    def test_calculate_max_average_with_none(self):
        """calculate_max_average_np should handle None in data."""
        data = [200, None, 200, 200, 200]
        result = calculate_max_average_np(data, 3)
        assert result >= 0  # Should not crash
        assert isinstance(result, int)
