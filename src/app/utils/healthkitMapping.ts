/**
 * Maps between Apple HealthKit workout activity types and TRAINAA SportType.
 *
 * WorkoutActivityType numeric values from:
 * https://developer.apple.com/documentation/healthkit/hkworkoutactivitytype
 */

import { WorkoutActivityType } from "@kingstinct/react-native-healthkit";
import { SportType } from "@/types/sport";

/**
 * Map HealthKit workout activity types to TRAINAA sport types.
 */
const HK_TO_TRAINAA: Partial<Record<WorkoutActivityType, SportType>> = {
  [WorkoutActivityType.americanFootball]: SportType.AMERICAN_FOOTBALL,
  [WorkoutActivityType.badminton]: SportType.RACKET,
  [WorkoutActivityType.baseball]: SportType.BASEBALL,
  [WorkoutActivityType.basketball]: SportType.BASKETBALL,
  [WorkoutActivityType.boxing]: SportType.BOXING,
  [WorkoutActivityType.cricket]: SportType.CRICKET,
  [WorkoutActivityType.crossCountrySkiing]: SportType.CROSS_COUNTRY_SKIING,
  [WorkoutActivityType.crossTraining]: SportType.TRAINING,
  [WorkoutActivityType.cycling]: SportType.CYCLING,
  [WorkoutActivityType.dance]: SportType.DANCE,
  [WorkoutActivityType.downhillSkiing]: SportType.ALPINE_SKIING,
  [WorkoutActivityType.elliptical]: SportType.FITNESS_EQUIPMENT,
  [WorkoutActivityType.fishing]: SportType.FISHING,
  [WorkoutActivityType.functionalStrengthTraining]: SportType.TRAINING,
  [WorkoutActivityType.golf]: SportType.GOLF,
  [WorkoutActivityType.hiking]: SportType.HIKING,
  [WorkoutActivityType.hockey]: SportType.HOCKEY,
  [WorkoutActivityType.hunting]: SportType.HUNTING,
  [WorkoutActivityType.jumpRope]: SportType.JUMP_ROPE,
  [WorkoutActivityType.kickboxing]: SportType.BOXING,
  [WorkoutActivityType.lacrosse]: SportType.LACROSSE,
  [WorkoutActivityType.martialArts]: SportType.MIXED_MARTIAL_ARTS,
  [WorkoutActivityType.mindAndBody]: SportType.MEDITATION,
  [WorkoutActivityType.mixedCardio]: SportType.TRAINING,
  [WorkoutActivityType.paddleSports]: SportType.PADDLING,
  [WorkoutActivityType.rowing]: SportType.ROWING,
  [WorkoutActivityType.rugby]: SportType.RUGBY,
  [WorkoutActivityType.running]: SportType.RUNNING,
  [WorkoutActivityType.sailing]: SportType.SAILING,
  [WorkoutActivityType.skatingSports]: SportType.ICE_SKATING,
  [WorkoutActivityType.snowboarding]: SportType.SNOWBOARDING,
  [WorkoutActivityType.snowSports]: SportType.SNOWSHOEING,
  [WorkoutActivityType.soccer]: SportType.SOCCER,
  [WorkoutActivityType.squash]: SportType.RACKET,
  [WorkoutActivityType.stairClimbing]: SportType.FLOOR_CLIMBING,
  [WorkoutActivityType.surfingSports]: SportType.SURFING,
  [WorkoutActivityType.swimming]: SportType.SWIMMING,
  [WorkoutActivityType.tableTennis]: SportType.RACKET,
  [WorkoutActivityType.tennis]: SportType.TENNIS,
  [WorkoutActivityType.traditionalStrengthTraining]:
    SportType.FITNESS_EQUIPMENT,
  [WorkoutActivityType.volleyball]: SportType.VOLLEYBALL,
  [WorkoutActivityType.walking]: SportType.WALKING,
  [WorkoutActivityType.waterFitness]: SportType.SWIMMING,
  [WorkoutActivityType.waterSports]: SportType.KAYAKING,
  [WorkoutActivityType.wrestling]: SportType.MIXED_MARTIAL_ARTS,
  [WorkoutActivityType.yoga]: SportType.TRAINING,
  [WorkoutActivityType.highIntensityIntervalTraining]: SportType.HIIT,
  [WorkoutActivityType.coreTraining]: SportType.TRAINING,
  [WorkoutActivityType.flexibility]: SportType.TRAINING,
  [WorkoutActivityType.pilates]: SportType.TRAINING,
  [WorkoutActivityType.climbing]: SportType.ROCK_CLIMBING,
  [WorkoutActivityType.equestrianSports]: SportType.HORSEBACK_RIDING,
  [WorkoutActivityType.discSports]: SportType.DISC_GOLF,
};

/**
 * Convert a HealthKit workout activity type to a TRAINAA sport type.
 */
export function hkToTrainaa(hkType: WorkoutActivityType): SportType {
  return HK_TO_TRAINAA[hkType] ?? SportType.GENERIC;
}
