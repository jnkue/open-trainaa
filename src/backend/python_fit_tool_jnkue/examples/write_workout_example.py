"""
Demonstrates encoding workout fit files
- see: https://developer.garmin.com/fit/cookbook/encoding-workout-files/
"""

from pathlib import Path
import datetime

from fit_tool.fit_file import FitFile
from fit_tool.fit_file_builder import FitFileBuilder
from fit_tool.profile.messages.file_id_message import FileIdMessage
from fit_tool.profile.messages.workout_message import WorkoutMessage
from fit_tool.profile.messages.workout_step_message import WorkoutStepMessage
from fit_tool.profile.profile_type import (
    Sport,
    SubSport,
    Intensity,
    WorkoutStepDuration,
    WorkoutStepTarget,
    WorkoutEquipment,
    SwimStroke,
    DisplayMeasure,
    Manufacturer,
    FileType,
)


def _create_file_id_message() -> FileIdMessage:
    """helper function for boiler plate code
    Returns
    -------
    FileIdMessage
        message written before anything else in FIT file
    """
    file_id_message = FileIdMessage()
    file_id_message.type = FileType.WORKOUT
    file_id_message.manufacturer = Manufacturer.DEVELOPMENT.value
    file_id_message.product = 0
    file_id_message.time_created = round(datetime.datetime.now().timestamp() * 1000)
    file_id_message.serial_number = 0x12345678
    return file_id_message


def _write_workout_fit_and_csv(fit_file: FitFile, workout_name: str, out_dir: Path):
    """generates the FIT file and a CSV dump for human friendly review

    Parameters
    ----------
    fit_file : FitFile
        content to write
    workout_name : str
        name of workout - produces <workout_name>_workout.fit
    out_dir : Path
        directory to write files in
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    # minimal/lazy cleanup
    workout_name = workout_name.replace(" ", "_")
    out_file = out_dir.joinpath(f"{workout_name}_workout.fit")
    fit_file.to_file(out_file.as_posix())
    print(f"created: {out_file.as_posix()}")
    # read the generated file and dump to CSV for inspection
    check_fit_file = FitFile.from_file(out_file.as_posix())
    out_csv = out_file.with_suffix(".csv")
    check_fit_file.to_csv(out_csv.as_posix())
    print(f"created: {out_csv.as_posix()}")


def _build_workout(
    workout_name: str,
    workout_message: WorkoutMessage,
    workout_steps: list[WorkoutStepMessage],
    out_dir: Path = None,
) -> None:
    if out_dir == None:
        out_dir = Path.cwd()

    # We set autoDefine to true, so that the builder creates the required
    # Definition Messages for us.
    builder = FitFileBuilder(auto_define=True, min_string_size=50)
    builder.add(_create_file_id_message())
    builder.add(workout_message)
    builder.add_all(workout_steps)

    fit_file = builder.build()

    # generate the file and check using CSV dump
    _write_workout_fit_and_csv(
        fit_file=fit_file, workout_name=workout_name, out_dir=out_dir
    )


def create_bike_tempo_workout(out_dir: Path):
    """
    Creates the bike tempo workout
    - see: https://github.com/garmin/fit-csharp-sdk/blob/7ab657e8f369c646bd194271ed392f24fac6eebc/Cookbook/WorkoutEncode/Program.cs#L37
    """
    workout_name = "Tempo Bike"

    workout_steps: list[WorkoutStepMessage] = []
    """manages the steps"""

    # w/u 10min z1 HR
    step = WorkoutStepMessage()
    step.message_index = len(workout_steps)
    step.workout_step_name = "Warm Up"
    step.intensity = Intensity.WARMUP
    step.duration_type = WorkoutStepDuration.TIME
    step.duration_time = 600.0  # seconds
    step.target_type = WorkoutStepTarget.HEART_RATE
    step.target_hr_zone = 1
    workout_steps.append(step)

    # bike 40min z3 power
    step = WorkoutStepMessage()
    step.message_index = len(workout_steps)
    step.workout_step_name = "Bike zone 3"
    step.intensity = Intensity.ACTIVE
    step.duration_type = WorkoutStepDuration.TIME
    step.duration_time = 2400.0  # seconds
    step.target_type = WorkoutStepTarget.POWER
    step.target_power_zone = 3
    workout_steps.append(step)

    # c/d until lap button press
    step = WorkoutStepMessage()
    step.message_index = len(workout_steps)
    step.workout_step_name = "Cool Down Until Lap Button Pressed"
    step.intensity = Intensity.COOLDOWN
    step.duration_type = WorkoutStepDuration.OPEN
    step.durationValue = 0
    step.target_type = WorkoutStepTarget.OPEN
    step.target_value = 0
    workout_steps.append(step)

    workout_message = WorkoutMessage()
    workout_message.workout_name = workout_name
    workout_message.sport = Sport.CYCLING
    workout_message.num_valid_steps = len(workout_steps)

    _build_workout(
        workout_name=workout_name,
        workout_message=workout_message,
        workout_steps=workout_steps,
        out_dir=out_dir,
    )


def create_run_800_repeats_workout(out_dir: Path):
    """
    see: https://github.com/garmin/fit-csharp-sdk/blob/7ab657e8f369c646bd194271ed392f24fac6eebc/Cookbook/WorkoutEncode/Program.cs#L67
    """
    workout_name = "800m Repeats"

    workout_steps: list[WorkoutStepMessage] = []
    """manages steps"""

    # w/u 4km @ z1 HR
    step = WorkoutStepMessage()
    step.message_index = len(workout_steps)
    step.workout_step_name = "Warm Up"
    step.intensity = Intensity.WARMUP
    step.duration_type = WorkoutStepDuration.DISTANCE
    step.duration_distance = 4e3  # meter
    step.target_type = WorkoutStepTarget.HEART_RATE
    step.target_hr_zone = 1
    workout_steps.append(step)

    # 5x
    # - run 800m @ z4 HR
    # - recover 200m @ z2 HR
    repeat_from = len(workout_steps)
    # (active step)
    step = WorkoutStepMessage()
    step.message_index = len(workout_steps)
    step.workout_step_name = "Run"
    step.intensity = Intensity.ACTIVE
    step.duration_type = WorkoutStepDuration.DISTANCE
    step.duration_distance = 800.0  # meter
    step.target_type = WorkoutStepTarget.HEART_RATE
    step.target_hr_zone = 4
    workout_steps.append(step)

    # (recover step)
    step = WorkoutStepMessage()
    step.message_index = len(workout_steps)
    step.workout_step_name = "Recover"
    step.intensity = Intensity.RECOVERY
    step.duration_type = WorkoutStepDuration.DISTANCE
    step.duration_distance = 200.0  # meter
    step.target_type = WorkoutStepTarget.HEART_RATE
    step.target_hr_zone = 2
    workout_steps.append(step)

    # create the repeat message
    step = WorkoutStepMessage()
    step.message_index = len(workout_steps)
    step.target_repeat_steps = 5
    step.duration_type = WorkoutStepDuration.REPEAT_UNTIL_STEPS_CMPLT
    step.duration_reps = repeat_from  # repeat from
    workout_steps.append(step)

    # c/d 1km @ z2 HR
    step = WorkoutStepMessage()
    step.message_index = len(workout_steps)
    step.workout_step_name = "Cool Down"
    step.intensity = Intensity.COOLDOWN
    step.duration_type = WorkoutStepDuration.DISTANCE
    step.duration_distance = 1e3
    step.target_type = WorkoutStepTarget.HEART_RATE
    step.target_value = 2
    workout_steps.append(step)

    workout_message = WorkoutMessage()
    workout_message.workout_name = workout_name
    workout_message.sport = Sport.RUNNING
    workout_message.num_valid_steps = len(workout_steps)

    _build_workout(
        workout_name=workout_name,
        workout_message=workout_message,
        workout_steps=workout_steps,
        out_dir=out_dir,
    )


def create_custom_target_values(out_dir: Path):
    """
    - see: https://github.com/garmin/fit-csharp-sdk/blob/7ab657e8f369c646bd194271ed392f24fac6eebc/Cookbook/WorkoutEncode/Program.cs#L67
    """
    workout_name = "Custom Target Values"

    workout_steps: list[WorkoutStepMessage] = []

    # w/u 10min @ 135-155 HR
    step = WorkoutStepMessage()
    step.message_index = len(workout_steps)
    step.workout_step_name = "Warm Up"
    step.intensity = Intensity.WARMUP
    step.duration_type = WorkoutStepDuration.TIME
    step.duration_time = 600.0  # seconds
    step.target_type = WorkoutStepTarget.HEART_RATE
    # NOTE: 0-100 is reserved for % of user value
    # offset applied to provide an absolute target
    heart_rate_offset = 100
    step.target_value = 0
    step.custom_target_heart_rate_low = 135 + heart_rate_offset
    step.custom_target_heart_rate_high = 155 + heart_rate_offset
    workout_steps.append(step)

    # bike 40min @ 175-195 W
    step = WorkoutStepMessage()
    step.message_index = len(workout_steps)
    step.workout_step_name = "Bike"
    step.intensity = Intensity.ACTIVE
    step.duration_type = WorkoutStepDuration.TIME
    step.duration_time = 2400.0  # seconds
    step.target_type = WorkoutStepTarget.POWER
    # NOTE: 0-1000 is reserved for %FTP
    # offset is applied to provide an absolute target
    power_offset = 1000
    step.target_value = 0
    step.custom_target_power_low = 175 + power_offset
    step.custom_target_power_high = 195 + power_offset
    workout_steps.append(step)

    # c/d 10min @ 20-25 km/h
    step = WorkoutStepMessage()
    step.message_index = len(workout_steps)
    step.workout_step_name = "Cool Down"
    step.intensity = Intensity.COOLDOWN
    step.duration_type = WorkoutStepDuration.TIME
    step.duration_time = 600.0  # seconds
    step.target_type = WorkoutStepTarget.SPEED
    kph_to_mps = 1e3 / 3.6e3
    step.target_value = 0
    step.custom_target_speed_low = 20.0 * kph_to_mps
    step.custom_target_speed_high = 25.0 * kph_to_mps
    workout_steps.append(step)

    workout_message = WorkoutMessage()
    workout_message.workout_name = workout_name
    workout_message.sport = Sport.CYCLING
    workout_message.num_valid_steps = len(workout_steps)

    _build_workout(
        workout_name=workout_name,
        workout_message=workout_message,
        workout_steps=workout_steps,
        out_dir=out_dir,
    )


def create_pool_swim(out_dir: Path):
    """
    - see: https://github.com/garmin/fit-csharp-sdk/blob/7ab657e8f369c646bd194271ed392f24fac6eebc/Cookbook/WorkoutEncode/Program.cs#L145
    """
    workout_name = "Pool Swim"

    ANY_STROKE: int = 255
    """sets the stroke type to be invalid (=any stroke)"""

    yd_to_m = 9.144e-1
    """NIST conversion factor, page 63, (https://physics.nist.gov/cuu/pdf/sp811.pdf)"""

    def swim_rest(
        message_index: int,
        duration_type: WorkoutStepDuration = WorkoutStepDuration.OPEN,
        duration_time: float = None,
    ) -> WorkoutStepMessage:
        """rest until lap"""
        step = WorkoutStepMessage()
        step.message_index = message_index
        step.workout_step_name = "Rest"
        step.intensity = Intensity.REST
        step.target_type = WorkoutStepTarget.OPEN
        step.duration_type = duration_type
        step.duration_time = duration_time
        return step

    workout_steps: list[WorkoutStepMessage] = []

    # w/u 200yd any stroke
    step = WorkoutStepMessage()
    step.message_index = len(workout_steps)
    step.workout_step_name = "Warm Up"
    step.intensity = Intensity.WARMUP
    step.duration_type = WorkoutStepDuration.DISTANCE
    step.target_type = WorkoutStepTarget.SWIM_STROKE
    step.target_stroke_type = ANY_STROKE
    step.duration_distance = 200.0 * yd_to_m
    workout_steps.append(step)

    # rest until lap button
    workout_steps.append(swim_rest(message_index=len(workout_steps)))

    # drill w/ kickboard 200yd
    step = WorkoutStepMessage()
    step.message_index = len(workout_steps)
    step.workout_step_name = "Drill"
    step.intensity = Intensity.ACTIVE
    step.duration_type = WorkoutStepDuration.DISTANCE
    step.duration_distance = 200.0 * yd_to_m
    step.target_type = WorkoutStepTarget.SWIM_STROKE
    step.target_stroke_type = SwimStroke.DRILL
    step.equipment = WorkoutEquipment.SWIM_KICKBOARD
    workout_steps.append(step)

    # rest until lap button
    workout_steps.append(swim_rest(message_index=len(workout_steps)))

    # 5x 100yd on 2:00
    repeat_from = len(workout_steps)
    # (active step)
    step = WorkoutStepMessage()
    step.message_index = len(workout_steps)
    step.workout_step_name = "Swim"
    step.intensity = Intensity.ACTIVE
    step.duration_type = WorkoutStepDuration.DISTANCE
    step.duration_distance = 100.0 * yd_to_m
    step.target_type = WorkoutStepTarget.SWIM_STROKE
    step.target_stroke_type = SwimStroke.FREESTYLE
    workout_steps.append(step)
    # (rest - time subject to active step duration)
    workout_steps.append(
        swim_rest(
            message_index=len(workout_steps),
            duration_type=WorkoutStepDuration.REPETITION_TIME,
            duration_time=120.0,
        )
    )
    # create the repeat message
    step = WorkoutStepMessage()
    step.message_index = len(workout_steps)
    step.target_repeat_steps = 5
    step.duration_type = WorkoutStepDuration.REPEAT_UNTIL_STEPS_CMPLT
    step.duration_reps = repeat_from  # repeat from
    workout_steps.append(step)

    # rest until lap button
    workout_steps.append(swim_rest(message_index=len(workout_steps)))

    # cool down 100yd
    step = WorkoutStepMessage()
    step.message_index = len(workout_steps)
    step.workout_step_name = "Cool down"
    step.intensity = Intensity.COOLDOWN
    step.duration_type = WorkoutStepDuration.DISTANCE
    step.target_type = WorkoutStepTarget.SWIM_STROKE
    step.target_stroke_type = ANY_STROKE
    step.duration_distance = 100.0 * yd_to_m
    workout_steps.append(step)

    workout_message = WorkoutMessage()
    workout_message.workout_name = workout_name
    workout_message.sport = Sport.SWIMMING
    workout_message.sub_sport = SubSport.LAP_SWIMMING
    workout_message.pool_length = 25 * yd_to_m
    workout_message.pool_length_unit = DisplayMeasure.STATUTE
    workout_message.num_valid_steps = len(workout_steps)

    _build_workout(
        workout_name=workout_name,
        workout_message=workout_message,
        workout_steps=workout_steps,
    )


if __name__ == "__main__":
    # running the file as a script - create all examples
    out_dir = Path.cwd()
    create_bike_tempo_workout(out_dir=out_dir)
    create_run_800_repeats_workout(out_dir=out_dir)
    create_custom_target_values(out_dir=out_dir)
    create_pool_swim(out_dir=out_dir)
