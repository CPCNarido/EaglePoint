const nodeExternals = require('webpack-node-externals');
const { RunScriptWebpackPlugin } = require('run-script-webpack-plugin');

module.exports = function (options, webpack) {
  return {
    ...options,
    entry: ['webpack/hot/poll?100', options.entry],
    externals: [
      nodeExternals({
        allowlist: ['webpack/hot/poll?100'],
      }),
    ],
    // Improve watcher behavior: debounce rebuilds and ignore OneDrive/OS-level sync folders
    watchOptions: {
      // wait this many ms after the first change before rebuilding
      aggregateTimeout: 300,
      // use polling at a slower interval to avoid tight loops
      poll: 1000,
      // ignore node_modules, git metadata, and OneDrive paths which can cause noisy events on Windows
      ignored: /node_modules|\.git|OneDrive/,
    },
    plugins: [
      ...options.plugins,
      new webpack.HotModuleReplacementPlugin(),
      new webpack.WatchIgnorePlugin({
        paths: [/\.js$/, /\.d\.ts$/],
      }),
      new RunScriptWebpackPlugin({
        name: options.output.filename,
        autoRestart: false,
      }),
    ],
  };
};
