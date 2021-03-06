const nodeExternals = require('webpack-node-externals');
const slsw = require('serverless-webpack');
const threadLoader = require('thread-loader');

const poolConfig = {
  workerParallelJobs: 50,
  workerNodeArgs: ['--max-old-space-size=1024'],
};

threadLoader.warmup(poolConfig, ['babel-loader']);

module.exports = {
  entry: slsw.lib.entries,
  target: 'node',
  mode: slsw.lib.webpack.isLocal ? 'development' : 'production',
  externals: [nodeExternals()],
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
        use: [
          { loader: 'thread-loader', options: poolConfig },
          { loader: 'babel-loader' },
        ],
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx'],
  },
};
