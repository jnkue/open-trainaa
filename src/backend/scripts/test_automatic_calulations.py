"""
From backend:
python -m scripts.test_automatic_calulations


"""

from api.database import supabase


def get_user_id_by_email(email: str) -> str:
    """Get user ID based on email address"""
    response = supabase.auth.admin.list_users()
    for user in response:
        if hasattr(user, "email") and user.email == email:
            return user.id
    raise Exception(f"User with email {email} not found")


# user_id = get_user_id_by_email("test@example.com")

""" # Test-Konfiguration
from api.routers.ai_tools import calculate_ftp, save_max_watts

calculate_ftp(user_id) """


""" 
  Max 5-sec avg: 198
  Max 5-min avg: 193
  Max 20-min avg: 174

  Max 5-sec avg: 173
  Max 5-min avg: 157
  Max 20-min avg: 144

  Max 5-sec avg: 176
  Max 5-min avg: 161
  Max 20-min avg: 150

  Max 5-sec avg: 181
  Max 5-min avg: 164
  Max 20-min avg: 154

  Max 5-sec avg: 171
  Max 5-min avg: 160
  Max 20-min avg: 0.0

  Max 5-sec avg: 176
  Max 5-min avg: 168
  Max 20-min avg: 162
  
  Total time for 6 records: 0.10241413116455078 seconds
"""


strava_to_fit_mapping = {
    "AlpineSki": {"sport": "alpine_skiing", "sub_sport": "resort"},
    "BackcountrySki": {"sport": "alpine_skiing", "sub_sport": "backcountry"},
    "Canoeing": {"sport": "paddling", "sub_sport": None},
    "Crossfit": {"sport": "training", "sub_sport": "strength_training"},
    "EBikeRide": {"sport": "cycling", "sub_sport": "e_bike_fitness"},
    "Elliptical": {"sport": "fitness_equipment", "sub_sport": "elliptical"},
    "Golf": {"sport": "golf", "sub_sport": None},
    "Handcycle": {"sport": "cycling", "sub_sport": "hand_cycling"},
    "Hike": {"sport": "hiking", "sub_sport": None},
    "IceSkate": {"sport": "ice_skating", "sub_sport": None},
    "InlineSkate": {"sport": "inline_skating", "sub_sport": None},
    "Kayaking": {"sport": "kayaking", "sub_sport": None},
    "Kitesurf": {"sport": "kitesurfing", "sub_sport": None},
    "NordicSki": {"sport": "cross_country_skiing", "sub_sport": "skate_skiing"},
    "Ride": {"sport": "cycling", "sub_sport": None},
    "RockClimbing": {"sport": "rock_climbing", "sub_sport": None},
    "RollerSki": {"sport": "cross_country_skiing", "sub_sport": None},
    "Rowing": {"sport": "rowing", "sub_sport": None},
    "Run": {"sport": "running", "sub_sport": None},
    "Sail": {"sport": "sailing", "sub_sport": None},
    "Skateboard": {
        "sport": "surfing",  # skateboarding is not supported in fit files, using surfing as closest match
        "sub_sport": None,
    },
    "Snowboard": {"sport": "snowboarding", "sub_sport": None},
    "Snowshoe": {"sport": "snowshoeing", "sub_sport": None},
    "Soccer": {"sport": "soccer", "sub_sport": None},
    "StairStepper": {"sport": "fitness_equipment", "sub_sport": "treadmill"},
    "StandUpPaddling": {"sport": "stand_up_paddleboarding", "sub_sport": None},
    "Surfing": {"sport": "surfing", "sub_sport": None},
    "Swim": {"sport": "swimming", "sub_sport": None},
    "Velomobile": {"sport": "cycling", "sub_sport": None},
    "VirtualRide": {"sport": "cycling", "sub_sport": "indoor_cycling"},
    "VirtualRun": {"sport": "running", "sub_sport": "treadmill"},
    "Walk": {"sport": "walking", "sub_sport": None},
    "WeightTraining": {"sport": "training", "sub_sport": "strength_training"},
    "Wheelchair": {"sport": "wheelchair_push_run", "sub_sport": None},
    "Windsurf": {"sport": "windsurfing", "sub_sport": None},
    "Workout": {"sport": "training", "sub_sport": None},
    "Yoga": {"sport": "training", "sub_sport": "yoga"},
}


def get_strava_sport_mapping(strava_type: str) -> dict:
    """Get the corresponding sport and sub_sport for a given Strava activity type."""
    return strava_to_fit_mapping.get(
        strava_type, {"sport": "Unknown", "sub_sport": None}
    )


print(get_strava_sport_mapping("Run")["sport"])


sport = (
    {
        "0": "generic",
        "1": "running",
        "2": "cycling",
        "3": "transition",  # Mulitsport transition
        "4": "fitness_equipment",
        "5": "swimming",
        "6": "basketball",
        "7": "soccer",
        "8": "tennis",
        "9": "american_football",
        "10": "training",
        "11": "walking",
        "12": "cross_country_skiing",
        "13": "alpine_skiing",
        "14": "snowboarding",
        "15": "rowing",
        "16": "mountaineering",
        "17": "hiking",
        "18": "multisport",
        "19": "paddling",
        "20": "flying",
        "21": "e_biking",
        "22": "motorcycling",
        "23": "boating",
        "24": "driving",
        "25": "golf",
        "26": "hang_gliding",
        "27": "horseback_riding",
        "28": "hunting",
        "29": "fishing",
        "30": "inline_skating",
        "31": "rock_climbing",
        "32": "sailing",
        "33": "ice_skating",
        "34": "sky_diving",
        "35": "snowshoeing",
        "36": "snowmobiling",
        "37": "stand_up_paddleboarding",
        "38": "surfing",
        "39": "wakeboarding",
        "40": "water_skiing",
        "41": "kayaking",
        "42": "rafting",
        "43": "windsurfing",
        "44": "kitesurfing",
        "45": "tactical",
        "46": "jumpmaster",
        "47": "boxing",
        "48": "floor_climbing",
        "49": "baseball",
        "53": "diving",
        "62": "hiit",
        "64": "racket",
        "65": "wheelchair_push_walk",
        "66": "wheelchair_push_run",
        "67": "meditation",
        "69": "disc_golf",
        "71": "cricket",
        "72": "rugby",
        "73": "hockey",
        "74": "lacrosse",
        "75": "volleyball",
        "76": "water_tubing",
        "77": "wakesurfing",
        "80": "mixed_martial_arts",
        "82": "snorkeling",
        "83": "dance",
        "84": "jump_rope",
        "254": "all",  # All is for goals only to include all sports.
    },
)
sub_sport = {
    "0": "generic",
    "1": "treadmill",  # Run/Fitness Equipment
    "2": "street",  # Run
    "3": "trail",  # Run
    "4": "track",  # Run
    "5": "spin",  # Cycling
    "6": "indoor_cycling",  # Cycling/Fitness Equipment
    "7": "road",  # Cycling
    "8": "mountain",  # Cycling
    "9": "downhill",  # Cycling
    "10": "recumbent",  # Cycling
    "11": "cyclocross",  # Cycling
    "12": "hand_cycling",  # Cycling
    "13": "track_cycling",  # Cycling
    "14": "indoor_rowing",  # Fitness Equipment
    "15": "elliptical",  # Fitness Equipment
    "16": "stair_climbing",  # Fitness Equipment
    "17": "lap_swimming",  # Swimming
    "18": "open_water",  # Swimming
    "19": "flexibility_training",  # Training
    "20": "strength_training",  # Training
    "21": "warm_up",  # Tennis
    "22": "match",  # Tennis
    "23": "exercise",  # Tennis
    "24": "challenge",
    "25": "indoor_skiing",  # Fitness Equipment
    "26": "cardio_training",  # Training
    "27": "indoor_walking",  # Walking/Fitness Equipment
    "28": "e_bike_fitness",  # E-Biking
    "29": "bmx",  # Cycling
    "30": "casual_walking",  # Walking
    "31": "speed_walking",  # Walking
    "32": "bike_to_run_transition",  # Transition
    "33": "run_to_bike_transition",  # Transition
    "34": "swim_to_bike_transition",  # Transition
    "35": "atv",  # Motorcycling
    "36": "motocross",  # Motorcycling
    "37": "backcountry",  # Alpine Skiing/Snowboarding
    "38": "resort",  # Alpine Skiing/Snowboarding
    "39": "rc_drone",  # Flying
    "40": "wingsuit",  # Flying
    "41": "whitewater",  # Kayaking/Rafting
    "42": "skate_skiing",  # Cross Country Skiing
    "43": "yoga",  # Training
    "44": "pilates",  # Fitness Equipment
    "45": "indoor_running",  # Run
    "46": "gravel_cycling",  # Cycling
    "47": "e_bike_mountain",  # Cycling
    "48": "commuting",  # Cycling
    "49": "mixed_surface",  # Cycling
    "50": "navigate",
    "51": "track_me",
    "52": "map",
    "53": "single_gas_diving",  # Diving
    "54": "multi_gas_diving",  # Diving
    "55": "gauge_diving",  # Diving
    "56": "apnea_diving",  # Diving
    "57": "apnea_hunting",  # Diving
    "58": "virtual_activity",
    "59": "obstacle",  # Used for events where participants run, crawl through mud, climb over walls, etc.
    "62": "breathing",
    "65": "sail_race",  # Sailing
    "67": "ultra",  # Ultramarathon
    "68": "indoor_climbing",  # Climbing
    "69": "bouldering",  # Climbing
    "70": "hiit",  # High Intensity Interval Training
    "73": "amrap",  # HIIT
    "74": "emom",  # HIIT
    "75": "tabata",  # HIIT
    "84": "pickleball",  # Racket
    "85": "padel",  # Racket
    "86": "indoor_wheelchair_walk",
    "87": "indoor_wheelchair_run",
    "88": "indoor_hand_cycling",
    "94": "squash",
    "95": "badminton",
    "96": "racquetball",
    "97": "table_tennis",
    "110": "fly_canopy",  # Flying
    "111": "fly_paraglide",  # Flying
    "112": "fly_paramotor",  # Flying
    "113": "fly_pressurized",  # Flying
    "114": "fly_navigate",  # Flying
    "115": "fly_timer",  # Flying
    "116": "fly_altimeter",  # Flying
    "117": "fly_wx",  # Flying
    "118": "fly_vfr",  # Flying
    "119": "fly_ifr",  # Flying
    "254": "all",
}


sport = {
    "generic",
    "running",
    "cycling",
    "transition",  # Mulitsport transition
    "fitness_equipment",
    "swimming",
    "basketball",
    "soccer",
    "tennis",
    "american_football",
    "training",
    "walking",
    "cross_country_skiing",
    "alpine_skiing",
    "snowboarding",
    "rowing",
    "mountaineering",
    "hiking",
    "multisport",
    "paddling",
    "flying",
    "e_biking",
    "motorcycling",
    "boating",
    "driving",
    "golf",
    "hang_gliding",
    "horseback_riding",
    "hunting",
    "fishing",
    "inline_skating",
    "rock_climbing",
    "sailing",
    "ice_skating",
    "sky_diving",
    "snowshoeing",
    "snowmobiling",
    "stand_up_paddleboarding",
    "surfing",
    "wakeboarding",
    "water_skiing",
    "kayaking",
    "rafting",
    "windsurfing",
    "kitesurfing",
    "tactical",
    "jumpmaster",
    "boxing",
    "floor_climbing",
    "baseball",
    "diving",
    "hiit",
    "racket",
    "wheelchair_push_walk",
    "wheelchair_push_run",
    "meditation",
    "disc_golf",
    "cricket",
    "rugby",
    "hockey",
    "lacrosse",
    "volleyball",
    "water_tubing",
    "wakesurfing",
    "mixed_martial_arts",
    "snorkeling",
    "dance",
    "jump_rope",
    "all",  # All is for goals only to include all sports.
}
