from api.analytics.vdot import (
    calculate_vdot, predict_race_times,
    find_best_effort_vdot,
)


class TestCalculateVdot:
    def test_known_5k_vdot(self):
        # 20-minute 5k corresponds to ~VDOT 50 per Daniels formula
        vdot = calculate_vdot(distance_meters=5000, time_seconds=1200)
        assert vdot is not None
        assert 48 <= vdot <= 52

    def test_known_fast_5k(self):
        # 15-minute 5k corresponds to ~VDOT 70 per Daniels formula
        vdot = calculate_vdot(distance_meters=5000, time_seconds=900)
        assert vdot is not None
        assert 67 <= vdot <= 72

    def test_known_marathon(self):
        # 3-hour marathon corresponds to ~VDOT 54 per Daniels formula
        vdot = calculate_vdot(distance_meters=42195, time_seconds=10800)
        assert vdot is not None
        assert 51 <= vdot <= 56

    def test_too_short_returns_none(self):
        assert calculate_vdot(distance_meters=2000, time_seconds=600) is None

    def test_too_long_returns_none(self):
        assert calculate_vdot(distance_meters=50000, time_seconds=5 * 3600) is None

    def test_too_short_distance_returns_none(self):
        assert calculate_vdot(distance_meters=500, time_seconds=720) is None

    def test_zero_time_returns_none(self):
        assert calculate_vdot(distance_meters=5000, time_seconds=0) is None


class TestFindBestEffortVdot:
    def test_steady_pace_run(self):
        speed = [3.33] * 3000  # 50 min at ~5:00/km
        distance = [i * 3.33 for i in range(3000)]
        vdot = find_best_effort_vdot(speed_data=speed, distance_data=distance)
        assert vdot is not None
        assert vdot > 35

    def test_warmup_then_fast(self):
        speed = [2.5] * 600 + [3.5] * 1800
        cumulative_dist = []
        d = 0.0
        for s in speed:
            d += s
            cumulative_dist.append(d)
        vdot_best = find_best_effort_vdot(speed, cumulative_dist)
        vdot_whole = calculate_vdot(cumulative_dist[-1], len(speed))
        assert vdot_best is not None
        assert vdot_whole is not None
        assert vdot_best > vdot_whole

    def test_short_run_falls_back_to_whole_session(self):
        speed = [3.33] * 900
        cumulative_dist = []
        d = 0.0
        for s in speed:
            d += s
            cumulative_dist.append(d)
        vdot = find_best_effort_vdot(speed, cumulative_dist)
        assert vdot is not None

    def test_empty_data_returns_none(self):
        assert find_best_effort_vdot([], []) is None


class TestPredictRaceTimes:
    def test_returns_four_distances(self):
        predictions = predict_race_times(50.0)
        assert set(predictions.keys()) == {"5k", "10k", "half_marathon", "marathon"}

    def test_times_are_monotonically_increasing(self):
        predictions = predict_race_times(50.0)
        assert predictions["5k"] < predictions["10k"]
        assert predictions["10k"] < predictions["half_marathon"]
        assert predictions["half_marathon"] < predictions["marathon"]

    def test_reasonable_times_for_vdot_50(self):
        predictions = predict_race_times(50.0)
        assert abs(predictions["5k"] - 1200) < 90
        assert abs(predictions["marathon"] - 11460) < 300

    def test_round_trip_consistency(self):
        original_time = 1200
        vdot = calculate_vdot(5000, original_time)
        assert vdot is not None
        predictions = predict_race_times(vdot)
        assert abs(predictions["5k"] - original_time) < 30
