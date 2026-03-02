module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
    plugins: [
      '@babel/plugin-proposal-export-namespace-from',
      // Remove console.* statements in production builds
      process.env.NODE_ENV === 'production' && 'transform-remove-console',
      'react-native-worklets/plugin', // react-native-worklets/plugin has to be listed last.
    ].filter(Boolean),
  };
};
