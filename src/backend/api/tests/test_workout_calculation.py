"""
Test workout calculation methods
"""

from agent.workout_management_agent import WorkoutManagementAgent
from api.routers.workouts import calculate_workout_estimates


class TestWorkoutCalculation:
    """Test suite for workout time and HR load calculation"""

    def test_64_minute_interval_workout(self):
        """
        Test calculation for a complex interval workout that should total 64 minutes.

        Breakdown:
        - Warm Up: 15m (5m + 5m + 5m)
        - Main Set:
          - 3x Interval Block 1: 18m (3 × (2m + 1m + 3m))
          - 4x Interval Block 2: 16m (4 × (1m + 1m + 2m))
          - 5x Interval Block 3: 5m (5 × (30s + 30s))
        - Cool Down: 10m (5m + 5m)
        Total: 15 + 18 + 16 + 5 + 10 = 64m
        """
        workout_text = """Warm Up
- 5m Z2 #lockeres Joggen
- 5m Z1 #dynamisches Dehnen
- 5m Z3 #Steigerungsläufe

Main Set
3x Intervall Block 1
- 2m Z4 #schnell
- 1m Z2 #Erholung
- 3m Z1 #Pause
4x Intervall Block 2
- 1m Z5 #sehr schnell
- 1m Z2 #Erholung
- 2m Z1 #Pause
5x Intervall Block 3
- 30s Z5 #Sprint
- 30s Z2 #Erholung

Cool Down
- 5m Z2 #lockeres Joggen
- 5m Z1 #statisches Dehnen"""

        estimated_time, estimated_hr_load = calculate_workout_estimates(workout_text)

        assert estimated_time == 64, f"Expected 64 minutes, got {estimated_time}"
        assert estimated_hr_load is not None, "HR load should be calculated"
        assert estimated_hr_load > 0, "HR load should be positive"

    def test_simple_workout_no_repetitions(self):
        """Test calculation for a simple workout without set repetitions"""
        workout_text = """Warm Up
                        - 10m Z2 #easy pace

                        Main Set
                        - 20m Z3 #tempo run
                        - 5m Z2 #recovery

                        Cool Down
                        - 5m Z1 #walking"""

        estimated_time = calculate_workout_estimates(workout_text)

        # Expected: 10 + 20 + 5 + 5 = 40 minutes
        assert estimated_time == 40, f"Expected 40 minutes, got {estimated_time}"

    def test_workout_with_seconds(self):
        """Test calculation handles seconds correctly"""
        workout_text = """Sprint Set
10x Sprint Block
- 30s Z5 #sprint
- 90s Z2 #recovery"""

        estimated_time, estimated_hr_load = calculate_workout_estimates(workout_text)

        # Expected: 10 × (0.5m + 1.5m) = 10 × 2m = 20 minutes
        assert estimated_time == 20, f"Expected 20 minutes, got {estimated_time}"

    def test_workout_with_mixed_time_formats(self):
        """Test calculation handles mixed time formats (hours, minutes, seconds)"""
        workout_text = """Long Endurance
- 1h Z2 #easy run
- 30m Z3 #tempo
- 2m30s Z4 #hard effort
- 45s Z5 #sprint finish"""

        estimated_time, estimated_hr_load = calculate_workout_estimates(workout_text)

        # Expected: 60m + 30m + 2.5m + 0.75m = 93.25m, rounded to 93
        assert estimated_time == 93, f"Expected 93 minutes, got {estimated_time}"

    def test_nested_repetitions(self):
        """Test calculation handles multiple repetition blocks correctly"""
        workout_text = """Main Set
3x Block A
- 5m Z3
- 2m Z2
2x Block B
- 10m Z4
- 5m Z2"""

        estimated_time, estimated_hr_load = calculate_workout_estimates(workout_text)

        # Expected: 3×(5+2) + 2×(10+5) = 3×7 + 2×15 = 21 + 30 = 51 minutes
        assert estimated_time == 51, f"Expected 51 minutes, got {estimated_time}"

    def test_hr_load_calculation_by_zone(self):
        """Test that HR load is calculated differently for different zones"""
        workout_text_z1 = """Easy
- 30m Z1"""

        workout_text_z5 = """Hard
- 30m Z5"""

        _, hr_load_z1 = calculate_workout_estimates(workout_text_z1)
        _, hr_load_z5 = calculate_workout_estimates(workout_text_z5)

        # Z5 should have higher HR load than Z1 for same duration
        assert hr_load_z5 > hr_load_z1, (
            f"Z5 HR load ({hr_load_z5}) should be greater than Z1 HR load ({hr_load_z1})"
        )

    def test_empty_workout(self):
        """Test handling of empty workout text"""
        estimated_time, estimated_hr_load = calculate_workout_estimates("")

        assert estimated_time is None, "Empty workout should return None for time"
        assert estimated_hr_load is None, "Empty workout should return None for HR load"

    def test_workout_with_blank_lines(self):
        """Test that blank lines don't affect calculation"""
        workout_text = """Warm Up

- 10m Z2

Main Set

- 20m Z3

"""
        estimated_time, estimated_hr_load = calculate_workout_estimates(workout_text)

        # Expected: 10 + 20 = 30 minutes
        assert estimated_time == 30, f"Expected 30 minutes, got {estimated_time}"

    def test_agent_calculation_matches_router(self):
        """Test that the agent's calculation method produces the same result as the router"""
        workout_text = """Warm Up
- 5m Z2 #lockeres Joggen
- 5m Z1 #dynamisches Dehnen
- 5m Z3 #Steigerungsläufe

Main Set
3x Intervall Block 1
- 2m Z4 #schnell
- 1m Z2 #Erholung
- 3m Z1 #Pause
4x Intervall Block 2
- 1m Z5 #sehr schnell
- 1m Z2 #Erholung
- 2m Z1 #Pause
5x Intervall Block 3
- 30s Z5 #Sprint
- 30s Z2 #Erholung

Cool Down
- 5m Z2 #lockeres Joggen
- 5m Z1 #statisches Dehnen"""

        # Test router calculation
        router_time, _ = calculate_workout_estimates(workout_text)

        # Test agent calculation
        agent = WorkoutManagementAgent()
        agent_time = agent._calculate_workout_duration(workout_text)

        # Both should return 64 minutes
        assert router_time == 64, (
            f"Router calculation expected 64 minutes, got {router_time}"
        )
        assert agent_time == 64, (
            f"Agent calculation expected 64 minutes, got {agent_time}"
        )
        assert router_time == agent_time, (
            f"Router and agent calculations should match: "
            f"router={router_time}, agent={agent_time}"
        )
