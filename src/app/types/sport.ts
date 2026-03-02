/**
 * Sport type definitions for the mobile app.
 *
 * This module provides comprehensive sport type definitions that match the backend
 * SportType enum, ensuring consistency across the application.
 */

/**
 * Comprehensive sport types matching backend FIT sport definitions.
 * These values are returned from the backend for activities and sessions.
 */
export enum SportType {
  GENERIC = "generic",
  RUNNING = "running",
  CYCLING = "cycling",
  TRANSITION = "transition",
  FITNESS_EQUIPMENT = "fitness_equipment",
  SWIMMING = "swimming",
  BASKETBALL = "basketball",
  SOCCER = "soccer",
  TENNIS = "tennis",
  AMERICAN_FOOTBALL = "american_football",
  TRAINING = "training",
  WALKING = "walking",
  CROSS_COUNTRY_SKIING = "cross_country_skiing",
  ALPINE_SKIING = "alpine_skiing",
  SNOWBOARDING = "snowboarding",
  ROWING = "rowing",
  MOUNTAINEERING = "mountaineering",
  HIKING = "hiking",
  MULTISPORT = "multisport",
  PADDLING = "paddling",
  FLYING = "flying",
  E_BIKING = "e_biking",
  MOTORCYCLING = "motorcycling",
  BOATING = "boating",
  DRIVING = "driving",
  GOLF = "golf",
  HANG_GLIDING = "hang_gliding",
  HORSEBACK_RIDING = "horseback_riding",
  HUNTING = "hunting",
  FISHING = "fishing",
  INLINE_SKATING = "inline_skating",
  ROCK_CLIMBING = "rock_climbing",
  SAILING = "sailing",
  ICE_SKATING = "ice_skating",
  SKY_DIVING = "sky_diving",
  SNOWSHOEING = "snowshoeing",
  SNOWMOBILING = "snowmobiling",
  STAND_UP_PADDLEBOARDING = "stand_up_paddleboarding",
  SURFING = "surfing",
  WAKEBOARDING = "wakeboarding",
  WATER_SKIING = "water_skiing",
  KAYAKING = "kayaking",
  RAFTING = "rafting",
  WINDSURFING = "windsurfing",
  KITESURFING = "kitesurfing",
  TACTICAL = "tactical",
  JUMPMASTER = "jumpmaster",
  BOXING = "boxing",
  FLOOR_CLIMBING = "floor_climbing",
  BASEBALL = "baseball",
  DIVING = "diving",
  HIIT = "hiit",
  RACKET = "racket",
  WHEELCHAIR_PUSH_WALK = "wheelchair_push_walk",
  WHEELCHAIR_PUSH_RUN = "wheelchair_push_run",
  MEDITATION = "meditation",
  DISC_GOLF = "disc_golf",
  CRICKET = "cricket",
  RUGBY = "rugby",
  HOCKEY = "hockey",
  LACROSSE = "lacrosse",
  VOLLEYBALL = "volleyball",
  WATER_TUBING = "water_tubing",
  WAKESURFING = "wakesurfing",
  MIXED_MARTIAL_ARTS = "mixed_martial_arts",
  SNORKELING = "snorkeling",
  DANCE = "dance",
  JUMP_ROPE = "jump_rope",
  ALL = "all",
}

/**
 * Workout sport types - common sports used for workout planning.
 * This is a subset of SportType for the most frequently used training activities.
 */
export enum WorkoutSportType {
  RUNNING = "running",
  CYCLING = "cycling",
  SWIMMING = "swimming",
  TRAINING = "training",
  HIKING = "hiking",
  ROWING = "rowing",
  WALKING = "walking",
}

/**
 * Sport category grouping for UI organization and filtering.
 * Groups similar sports together for better user experience.
 */
export enum SportCategory {
  ENDURANCE = "endurance",
  STRENGTH = "strength",
  WATER = "water",
  WINTER = "winter",
  TEAM = "team",
  OUTDOOR = "outdoor",
  WELLNESS = "wellness",
  OTHER = "other",
}

/**
 * Maps sport types to their display categories for UI grouping.
 */
export const SPORT_CATEGORY_MAP: Record<SportType, SportCategory> = {
  [SportType.RUNNING]: SportCategory.ENDURANCE,
  [SportType.CYCLING]: SportCategory.ENDURANCE,
  [SportType.WALKING]: SportCategory.ENDURANCE,
  [SportType.HIKING]: SportCategory.ENDURANCE,
  [SportType.E_BIKING]: SportCategory.ENDURANCE,
  [SportType.ROWING]: SportCategory.ENDURANCE,

  [SportType.TRAINING]: SportCategory.STRENGTH,
  [SportType.FITNESS_EQUIPMENT]: SportCategory.STRENGTH,
  [SportType.BOXING]: SportCategory.STRENGTH,
  [SportType.HIIT]: SportCategory.STRENGTH,
  [SportType.FLOOR_CLIMBING]: SportCategory.STRENGTH,

  [SportType.SWIMMING]: SportCategory.WATER,
  [SportType.KAYAKING]: SportCategory.WATER,
  [SportType.PADDLING]: SportCategory.WATER,
  [SportType.RAFTING]: SportCategory.WATER,
  [SportType.STAND_UP_PADDLEBOARDING]: SportCategory.WATER,
  [SportType.SURFING]: SportCategory.WATER,
  [SportType.WAKEBOARDING]: SportCategory.WATER,
  [SportType.WATER_SKIING]: SportCategory.WATER,
  [SportType.WAKESURFING]: SportCategory.WATER,
  [SportType.WATER_TUBING]: SportCategory.WATER,
  [SportType.WINDSURFING]: SportCategory.WATER,
  [SportType.KITESURFING]: SportCategory.WATER,
  [SportType.SAILING]: SportCategory.WATER,
  [SportType.BOATING]: SportCategory.WATER,
  [SportType.SNORKELING]: SportCategory.WATER,
  [SportType.DIVING]: SportCategory.WATER,

  [SportType.ALPINE_SKIING]: SportCategory.WINTER,
  [SportType.CROSS_COUNTRY_SKIING]: SportCategory.WINTER,
  [SportType.SNOWBOARDING]: SportCategory.WINTER,
  [SportType.SNOWSHOEING]: SportCategory.WINTER,
  [SportType.SNOWMOBILING]: SportCategory.WINTER,
  [SportType.ICE_SKATING]: SportCategory.WINTER,

  [SportType.BASKETBALL]: SportCategory.TEAM,
  [SportType.SOCCER]: SportCategory.TEAM,
  [SportType.TENNIS]: SportCategory.TEAM,
  [SportType.AMERICAN_FOOTBALL]: SportCategory.TEAM,
  [SportType.BASEBALL]: SportCategory.TEAM,
  [SportType.VOLLEYBALL]: SportCategory.TEAM,
  [SportType.CRICKET]: SportCategory.TEAM,
  [SportType.RUGBY]: SportCategory.TEAM,
  [SportType.HOCKEY]: SportCategory.TEAM,
  [SportType.LACROSSE]: SportCategory.TEAM,
  [SportType.RACKET]: SportCategory.TEAM,

  [SportType.ROCK_CLIMBING]: SportCategory.OUTDOOR,
  [SportType.MOUNTAINEERING]: SportCategory.OUTDOOR,
  [SportType.INLINE_SKATING]: SportCategory.OUTDOOR,
  [SportType.HANG_GLIDING]: SportCategory.OUTDOOR,
  [SportType.SKY_DIVING]: SportCategory.OUTDOOR,
  [SportType.FLYING]: SportCategory.OUTDOOR,

  [SportType.MEDITATION]: SportCategory.WELLNESS,
  [SportType.DANCE]: SportCategory.WELLNESS,

  [SportType.GENERIC]: SportCategory.OTHER,
  [SportType.TRANSITION]: SportCategory.OTHER,
  [SportType.MULTISPORT]: SportCategory.OTHER,
  [SportType.MOTORCYCLING]: SportCategory.OTHER,
  [SportType.DRIVING]: SportCategory.OTHER,
  [SportType.GOLF]: SportCategory.OTHER,
  [SportType.HORSEBACK_RIDING]: SportCategory.OTHER,
  [SportType.HUNTING]: SportCategory.OTHER,
  [SportType.FISHING]: SportCategory.OTHER,
  [SportType.TACTICAL]: SportCategory.OTHER,
  [SportType.JUMPMASTER]: SportCategory.OTHER,
  [SportType.WHEELCHAIR_PUSH_WALK]: SportCategory.OTHER,
  [SportType.WHEELCHAIR_PUSH_RUN]: SportCategory.OTHER,
  [SportType.DISC_GOLF]: SportCategory.OTHER,
  [SportType.MIXED_MARTIAL_ARTS]: SportCategory.OTHER,
  [SportType.JUMP_ROPE]: SportCategory.OTHER,
  [SportType.ALL]: SportCategory.OTHER,
};

/**
 * Check if a string is a valid sport type.
 */
export function isValidSportType(sport: string): sport is SportType {
  return Object.values(SportType).includes(sport as SportType);
}

/**
 * Get the category for a given sport type.
 */
export function getSportCategory(sport: SportType): SportCategory {
  return SPORT_CATEGORY_MAP[sport] || SportCategory.OTHER;
}

/**
 * Get all sports in a specific category.
 */
export function getSportsByCategory(category: SportCategory): SportType[] {
  return Object.entries(SPORT_CATEGORY_MAP)
    .filter(([_, cat]) => cat === category)
    .map(([sport]) => sport as SportType);
}
