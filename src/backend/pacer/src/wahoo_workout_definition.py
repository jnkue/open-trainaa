## Wahoo

import json
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel


##### ENUMS
class WorkoutTypeFamily(int, Enum):
    BIKING = 0
    RUNNING = 1


class WorkoutTypeLocation(int, Enum):
    INDOOR = 0
    OUTDOOR = 1


class ExitTriggerType(str, Enum):
    time = "time"
    distance = "distance"
    kj = "kj"
    repeat = "repeat"


class IntensityType(str, Enum):
    active = "active"
    wu = "wu"  # warmup
    tempo = "tempo"
    recover = "recover"
    lt = "lt"  # lactate threshold
    map = "map"  # maximal aerobic power
    ac = "ac"  # anaerobic capacity
    nm = "nm"  # neuromuscular power
    ftp = "ftp"  # functional threshold power
    cd = "cd"  # cooldown
    rest = "rest"


class TargetType(str, Enum):
    # Absolute targets
    rpm = "rpm"  # cadence based target in rotations per minute
    rpe = "rpe"  # relative perceived effort, 1-10 inclusive
    watts = "watts"  # raw power number target in watts
    hr = "hr"  # absolute hr target in beats per minute
    speed = "speed"  # absolute speed target in meters per second

    # Relative targets (require header values)
    ftp = "ftp"  # portion of athlete's power target
    map = "map"  # portion of 4DP power target based on 5min power
    ac = "ac"  # portion of 4DP power target based on 1min power
    nm = "nm"  # portion of 4DP power target based on 5sec power
    threshold_hr = "threshold_hr"  # portion of HR target based on threshold HR
    max_hr = "max_hr"  # portion of HR target based on max HR
    threshold_speed = (
        "threshold_speed"  # portion of speed target based on threshold speed
    )


class ControlType(str, Enum):
    grade = "grade"


##### MODELS
class Header(BaseModel):
    # Required fields
    name: str
    version: str
    workout_type_family: WorkoutTypeFamily

    # according to definition required but in examples missing
    workout_type_location: Optional[WorkoutTypeLocation] = None

    # Optional fields
    description: Optional[str] = None  # max 5000 characters
    duration_s: Optional[int] = None  # length in seconds
    distance_m: Optional[int] = None  # length in meters

    # Athlete power values (for relative targets)
    ftp: Optional[int] = None  # athlete's FTP value in watts
    map: Optional[int] = None  # athlete's MAP value in watts (5min power)
    ac: Optional[int] = None  # athlete's AC value in watts (1min power)
    nm: Optional[int] = None  # athlete's NM value in watts (5sec power)

    # Athlete heart rate values (for relative targets)
    threshold_hr: Optional[int] = None  # threshold heart rate in bpm
    max_hr: Optional[int] = None  # maximum heart rate in bpm

    # Athlete speed values (for relative targets)
    threshold_speed: Optional[float] = None  # threshold speed in m/s


class Target(BaseModel):
    type: TargetType
    low: Optional[float] = None
    high: Optional[float] = None


class Control(BaseModel):
    type: ControlType
    value: Optional[float] = None  # e.g., grade percentage


class InnerInterval(BaseModel):
    name: Optional[str] = None

    # Required fields
    exit_trigger_type: ExitTriggerType
    exit_trigger_value: float

    # Optional fields with defaults
    intensity_type: Optional[IntensityType] = "active"
    targets: Optional[List[Target]] = None
    controls: Optional[List[Control]] = None


class Interval(InnerInterval):
    intervals: Optional[List[InnerInterval]] = None  # for repeat intervals


class Workout(BaseModel):
    header: Header
    intervals: List[Interval]


if __name__ == "__main__":
    with open("testfiles/plan2.json") as f:
        data = json.load(f)
        workout = Workout(**data)
        print(workout.model_dump_json(indent=2))
