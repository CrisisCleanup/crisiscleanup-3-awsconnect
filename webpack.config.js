const nodeExternals = require('webpack-node-externals');
const slsw = require('serverless-webpack');
const SentryWebpack = require('@sentry/webpack-plugin');

module.exports = {
  entry: slsw.lib.entries,
  target: 'node',
  mode: slsw.lib.webpack.isLocal ? 'development' : 'production',
  externals: [nodeExternals()],
  plugins: [
    new SentryWebpack({
      include: '.',
      ignoreFile: '.gitignore',
      configFile: 'sentry.properties',
      ignore: ['node_modules'],
    }),
  ],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.jsx?$/,
        include: __dirname,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
        },
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx'],
  },
};
