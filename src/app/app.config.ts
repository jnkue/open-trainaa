import { ExpoConfig, ConfigContext } from "expo/config";

// Read version from package.json (synced by ./dev.sh bump)
// Note: cannot import from .ts files here as app.config.ts runs in plain Node.js
const { version: APP_VERSION } = require("./package.json");

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "TRAINAA",
  slug: "trainaa",
  orientation: "portrait",
  version: APP_VERSION,
  icon: "./assets/images/AppIcon.png",
  scheme: "mobile",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    bundleIdentifier: "com.trainaa.app",
    supportsTablet: false,
    usesAppleSignIn: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      UIBackgroundModes: ["remote-notification"],
    },
    icon: "./assets/AppIcon.icon",
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/images/android_icon.png",
      backgroundColor: "#ffffff",
    },
    permissions: ["com.android.vending.BILLING"],

    blockedPermissions:
      ["android.permission.READ_MEDIA_IMAGES",
        "android.permission.READ_MEDIA_VIDEO",
        "com.google.android.gms.permission.AD_ID"
      ],
    edgeToEdgeEnabled: true,
    package: "com.pacerchat.app",
    googleServicesFile: "./google-services.json",
    config: {
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_API_KEY ?? "",
      },
    }
  },
  web: {
    bundler: "metro",
    output: "server",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#000000",
      },
    ],
    "expo-localization",
    "expo-font",
    "expo-secure-store",
    "expo-web-browser",
    [
      "expo-dev-client",
      {
        launchMode: "most-recent",
      },
    ],
    [
      "expo-media-library",
      {
        photosPermission: "Allow $(PRODUCT_NAME) to save images to your camera roll.",
        savePhotosPermission: "Allow $(PRODUCT_NAME) to save images to your camera roll.",
      },
    ],
    [
      "@sentry/react-native/expo",
      {
        url: "https://sentry.io/",
        project: "react-native",
        organization: "pacerchat",
      },
    ],
    "./plugins/withReactNativeShare.js",
    "@react-native-community/datetimepicker",
    [
      "expo-notifications",
      {
        icon: "./assets/images/AppIcon.png",
        color: "#000000",
      },
    ],
    [
    "@react-native-google-signin/google-signin",
    {
      iosUrlScheme: `com.googleusercontent.apps.${(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "").split(".")[0]}`,
    }
  ],
    "expo-apple-authentication"
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: "96d10c90-5cd3-42da-84d9-aaa688560941" },
  },
    updates: {
    url: "https://u.expo.dev/96d10c90-5cd3-42da-84d9-aaa688560941"
  },
  runtimeVersion: { policy: "fingerprint" },
  owner: "pacer",
});
