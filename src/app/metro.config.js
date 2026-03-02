const { withNativeWind } = require('nativewind/metro');
const {
  getSentryExpoConfig
} = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);

// PostHog React Native compatibility
config.resolver.alias = {
  ...config.resolver.alias,
  'crypto': 'react-native-crypto',
};

module.exports = withNativeWind(config, { input: './global.css', inlineRem: 16 });