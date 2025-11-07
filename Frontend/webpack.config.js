const createExpoWebpackConfigAsync = require('@expo/webpack-config');

module.exports = async function(env, argv) {
  const config = await createExpoWebpackConfigAsync(env, argv);

  // Ensure a web-friendly implementation of react-native-svg is used on web builds.
  // This allows libraries that depend on react-native-svg (like react-native-chart-kit)
  // to work in the browser by mapping them to react-native-svg-web.
  config.resolve = config.resolve || {};
  config.resolve.alias = Object.assign({}, config.resolve.alias || {}, {
    'react-native-svg': require.resolve('react-native-svg-web'),
  });

  return config;
};
