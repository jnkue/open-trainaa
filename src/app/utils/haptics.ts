import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

export function lightHaptic() {
  if (Platform.OS !== "web") {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
}
