const { withInfoPlist, withAndroidManifest } = require('@expo/config-plugins');

/**
 * Expo config plugin for react-native-share
 * Adds necessary configurations for Instagram Stories sharing
 */
const withReactNativeShare = (config) => {
  // iOS Configuration
  config = withInfoPlist(config, (config) => {
    if (!config.modResults.LSApplicationQueriesSchemes) {
      config.modResults.LSApplicationQueriesSchemes = [];
    }

    // Add Instagram URL schemes
    const schemes = [
      'instagram',
      'instagram-stories',
      'whatsapp',
      'fb',
      'twitter',
    ];

    schemes.forEach((scheme) => {
      if (!config.modResults.LSApplicationQueriesSchemes.includes(scheme)) {
        config.modResults.LSApplicationQueriesSchemes.push(scheme);
      }
    });

    return config;
  });

  // Android Configuration
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // Add queries for Instagram and other social media apps
    if (!manifest.queries) {
      manifest.queries = [];
    }

    // Ensure queries is an array
    if (!Array.isArray(manifest.queries)) {
      manifest.queries = [manifest.queries];
    }

    const packages = [
      'com.instagram.android',
      'com.whatsapp',
      'com.facebook.katana',
      'com.twitter.android',
    ];

    packages.forEach((packageName) => {
      const packageQuery = {
        package: [
          {
            $: {
              'android:name': packageName,
            },
          },
        ],
      };

      // Check if this package is already in queries
      const hasPackage = manifest.queries.some((query) => {
        return query.package?.some((pkg) => pkg.$?.['android:name'] === packageName);
      });

      if (!hasPackage) {
        manifest.queries.push(packageQuery);
      }
    });

    return config;
  });

  return config;
};

module.exports = withReactNativeShare;
