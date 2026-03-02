"""
Sport type definitions and enums for activities, sessions, and workouts.

This module provides a centralized definition of all supported sport types
across the TRAINAA application, ensuring consistency between FIT file imports,
Strava synchronization, and workout planning.
"""

from enum import Enum
from typing import Optional


class SportType(str, Enum):
    """
    Comprehensive sport type enum based on FIT file format.

    These sport types are used across:
    - Activity/session imports from FIT files
    - Strava activity synchronization
    - Workout and training plan definitions

    Note: Some sport types are primarily used for activity tracking,
    while workouts typically use a subset of common sports.
    """

    GENERIC = "generic"
    RUNNING = "running"
    CYCLING = "cycling"
    TRANSITION = "transition"  # Multisport transition
    FITNESS_EQUIPMENT = "fitness_equipment"
    SWIMMING = "swimming"
    BASKETBALL = "basketball"
    SOCCER = "soccer"
    TENNIS = "tennis"
    AMERICAN_FOOTBALL = "american_football"
    TRAINING = "training"
    WALKING = "walking"
    CROSS_COUNTRY_SKIING = "cross_country_skiing"
    ALPINE_SKIING = "alpine_skiing"
    SNOWBOARDING = "snowboarding"
    ROWING = "rowing"
    MOUNTAINEERING = "mountaineering"
    HIKING = "hiking"
    MULTISPORT = "multisport"
    PADDLING = "paddling"
    FLYING = "flying"
    E_BIKING = "e_biking"
    MOTORCYCLING = "motorcycling"
    BOATING = "boating"
    DRIVING = "driving"
    GOLF = "golf"
    HANG_GLIDING = "hang_gliding"
    HORSEBACK_RIDING = "horseback_riding"
    HUNTING = "hunting"
    FISHING = "fishing"
    INLINE_SKATING = "inline_skating"
    ROCK_CLIMBING = "rock_climbing"
    SAILING = "sailing"
    ICE_SKATING = "ice_skating"
    SKY_DIVING = "sky_diving"
    SNOWSHOEING = "snowshoeing"
    SNOWMOBILING = "snowmobiling"
    STAND_UP_PADDLEBOARDING = "stand_up_paddleboarding"
    SURFING = "surfing"
    WAKEBOARDING = "wakeboarding"
    WATER_SKIING = "water_skiing"
    KAYAKING = "kayaking"
    RAFTING = "rafting"
    WINDSURFING = "windsurfing"
    KITESURFING = "kitesurfing"
    TACTICAL = "tactical"
    JUMPMASTER = "jumpmaster"
    BOXING = "boxing"
    FLOOR_CLIMBING = "floor_climbing"
    BASEBALL = "baseball"
    DIVING = "diving"
    HIIT = "hiit"
    RACKET = "racket"
    WHEELCHAIR_PUSH_WALK = "wheelchair_push_walk"
    WHEELCHAIR_PUSH_RUN = "wheelchair_push_run"
    MEDITATION = "meditation"
    DISC_GOLF = "disc_golf"
    CRICKET = "cricket"
    RUGBY = "rugby"
    HOCKEY = "hockey"
    LACROSSE = "lacrosse"
    VOLLEYBALL = "volleyball"
    WATER_TUBING = "water_tubing"
    WAKESURFING = "wakesurfing"
    MIXED_MARTIAL_ARTS = "mixed_martial_arts"
    SNORKELING = "snorkeling"
    DANCE = "dance"
    JUMP_ROPE = "jump_rope"
    ALL = "all"  # All is for goals only to include all sports


class WorkoutSportType(str, Enum):
    """
    Common sport types used for workout planning and structured training.

    This is a subset of SportType containing the most commonly used sports
    for creating workout plans and training schedules.
    """

    RUNNING = "running"
    CYCLING = "cycling"
    SWIMMING = "swimming"
    TRAINING = "training"  # Strength training, gym workouts, etc.
    HIKING = "hiking"
    ROWING = "rowing"
    WALKING = "walking"
    REST_DAY = "rest_day"  # Explicit rest/recovery day


# FIT file sport type ID to SportType mapping
FIT_SPORT_ID_MAPPING = {
    "0": SportType.GENERIC,
    "1": SportType.RUNNING,
    "2": SportType.CYCLING,
    "3": SportType.TRANSITION,
    "4": SportType.FITNESS_EQUIPMENT,
    "5": SportType.SWIMMING,
    "6": SportType.BASKETBALL,
    "7": SportType.SOCCER,
    "8": SportType.TENNIS,
    "9": SportType.AMERICAN_FOOTBALL,
    "10": SportType.TRAINING,
    "11": SportType.WALKING,
    "12": SportType.CROSS_COUNTRY_SKIING,
    "13": SportType.ALPINE_SKIING,
    "14": SportType.SNOWBOARDING,
    "15": SportType.ROWING,
    "16": SportType.MOUNTAINEERING,
    "17": SportType.HIKING,
    "18": SportType.MULTISPORT,
    "19": SportType.PADDLING,
    "20": SportType.FLYING,
    "21": SportType.E_BIKING,
    "22": SportType.MOTORCYCLING,
    "23": SportType.BOATING,
    "24": SportType.DRIVING,
    "25": SportType.GOLF,
    "26": SportType.HANG_GLIDING,
    "27": SportType.HORSEBACK_RIDING,
    "28": SportType.HUNTING,
    "29": SportType.FISHING,
    "30": SportType.INLINE_SKATING,
    "31": SportType.ROCK_CLIMBING,
    "32": SportType.SAILING,
    "33": SportType.ICE_SKATING,
    "34": SportType.SKY_DIVING,
    "35": SportType.SNOWSHOEING,
    "36": SportType.SNOWMOBILING,
    "37": SportType.STAND_UP_PADDLEBOARDING,
    "38": SportType.SURFING,
    "39": SportType.WAKEBOARDING,
    "40": SportType.WATER_SKIING,
    "41": SportType.KAYAKING,
    "42": SportType.RAFTING,
    "43": SportType.WINDSURFING,
    "44": SportType.KITESURFING,
    "45": SportType.TACTICAL,
    "46": SportType.JUMPMASTER,
    "47": SportType.BOXING,
    "48": SportType.FLOOR_CLIMBING,
    "49": SportType.BASEBALL,
    "53": SportType.DIVING,
    "62": SportType.HIIT,
    "64": SportType.RACKET,
    "65": SportType.WHEELCHAIR_PUSH_WALK,
    "66": SportType.WHEELCHAIR_PUSH_RUN,
    "67": SportType.MEDITATION,
    "69": SportType.DISC_GOLF,
    "71": SportType.CRICKET,
    "72": SportType.RUGBY,
    "73": SportType.HOCKEY,
    "74": SportType.LACROSSE,
    "75": SportType.VOLLEYBALL,
    "76": SportType.WATER_TUBING,
    "77": SportType.WAKESURFING,
    "80": SportType.MIXED_MARTIAL_ARTS,
    "82": SportType.SNORKELING,
    "83": SportType.DANCE,
    "84": SportType.JUMP_ROPE,
    "254": SportType.ALL,
}


def get_sport_from_fit_id(fit_id: str) -> Optional[SportType]:
    """
    Convert a FIT file sport ID to a SportType enum value.

    Args:
        fit_id: The numeric sport ID from a FIT file (as string)

    Returns:
        The corresponding SportType enum value, or None if not found
    """
    return FIT_SPORT_ID_MAPPING.get(fit_id)


def validate_sport_type(sport: str) -> bool:
    """
    Validate if a string is a valid sport type.

    Args:
        sport: The sport string to validate

    Returns:
        True if the sport is valid, False otherwise
    """
    try:
        SportType(sport)
        return True
    except ValueError:
        return False


def get_all_sport_values() -> list[str]:
    """
    Get a list of all valid sport type string values.

    Returns:
        List of all sport type strings
    """
    return [sport.value for sport in SportType]


def get_workout_sport_values() -> list[str]:
    """
    Get a list of common workout sport type string values.

    Returns:
        List of workout sport type strings
    """
    return [sport.value for sport in WorkoutSportType]
