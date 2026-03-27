from api.analytics.cp_model import fit_cp_model, get_power_zones, compute_aggregate_envelope


class TestFitCpModel:
    def test_known_cp_and_w_prime(self):
        known_cp = 250.0
        known_w_prime = 20000.0
        power_curve = {}
        for t in [120, 180, 300, 600, 1200, 1800, 3600]:
            power_curve[str(t)] = int(known_cp + known_w_prime / t)
        cp, w_prime = fit_cp_model(power_curve)
        assert abs(cp - known_cp) / known_cp < 0.05
        assert abs(w_prime - known_w_prime) / known_w_prime < 0.10

    def test_insufficient_data_returns_none(self):
        power_curve = {"120": 350, "300": 300}
        assert fit_cp_model(power_curve) is None

    def test_no_points_above_2min_returns_none(self):
        power_curve = {"1": 900, "5": 800, "10": 700, "30": 500, "60": 400}
        assert fit_cp_model(power_curve) is None

    def test_empty_curve_returns_none(self):
        assert fit_cp_model({}) is None

    def test_noisy_data_still_converges(self):
        import random
        random.seed(123)
        known_cp = 280.0
        known_w_prime = 25000.0
        power_curve = {}
        for t in [120, 180, 240, 300, 420, 600, 900, 1200, 1800]:
            ideal = known_cp + known_w_prime / t
            noisy = ideal + random.uniform(-10, 10)
            power_curve[str(t)] = int(noisy)
        result = fit_cp_model(power_curve)
        assert result is not None
        cp, _ = result
        assert abs(cp - known_cp) / known_cp < 0.10

    def test_high_cp_athlete(self):
        power_curve = {}
        for t in [120, 300, 600, 1200, 3600]:
            power_curve[str(t)] = int(420 + 30000 / t)
        result = fit_cp_model(power_curve)
        assert result is not None
        cp, _ = result
        assert cp > 400

    def test_low_w_prime_athlete(self):
        power_curve = {}
        for t in [120, 300, 600, 1200, 3600]:
            power_curve[str(t)] = int(200 + 5000 / t)
        result = fit_cp_model(power_curve)
        assert result is not None
        _, w_prime = result
        assert w_prime < 8000


class TestComputeAggregateEnvelope:
    def test_single_session(self):
        curves = [{"1": 800, "5": 600, "300": 300}]
        envelope = compute_aggregate_envelope(curves)
        assert envelope == {"1": 800, "5": 600, "300": 300}

    def test_envelope_takes_max(self):
        curves = [
            {"1": 800, "5": 600, "300": 300},
            {"1": 900, "5": 500, "300": 350},
        ]
        envelope = compute_aggregate_envelope(curves)
        assert envelope["1"] == 900
        assert envelope["5"] == 600
        assert envelope["300"] == 350

    def test_empty_list(self):
        assert compute_aggregate_envelope([]) == {}


class TestGetPowerZones:
    def test_returns_7_zones(self):
        zones = get_power_zones(300.0)
        assert len(zones) == 7

    def test_zone_boundaries(self):
        cp = 300.0
        zones = get_power_zones(cp)
        assert zones[0]["zone"] == 1
        assert zones[0]["name"] == "Recovery"
        assert zones[0]["min_watts"] == 0
        assert zones[0]["max_watts"] == int(round(cp * 0.55))
        assert zones[3]["zone"] == 4
        assert zones[3]["min_watts"] == int(round(cp * 0.90))
        assert zones[3]["max_watts"] == int(round(cp * 1.05))
        assert zones[6]["zone"] == 7
        assert zones[6]["min_watts"] == int(round(cp * 1.50))
        assert zones[6]["max_watts"] is None

    def test_zones_are_contiguous(self):
        zones = get_power_zones(250.0)
        for i in range(len(zones) - 1):
            assert zones[i]["max_watts"] == zones[i + 1]["min_watts"]
