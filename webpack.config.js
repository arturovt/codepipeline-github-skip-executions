const path = require('path');
const slsw = require('serverless-webpack');

module.exports = {
  entry: slsw.lib.entries,
  target: 'node',
  mode: slsw.lib.webpack.isLocal ? 'development' : 'production',
  node: false,
  resolve: {
    extensions: ['.js', '.ts'],
  },
  externals: ['aws-sdk'],
  optimization: {
    minimize: false,
  },
  devtool: 'inline-cheap-module-source-map',
  module: {
    rules: [
      {
        test: /.ts$/,
        loader: 'esbuild-loader',
        options: {
          loader: 'ts',
          tsconfigRaw: require('./tsconfig.json'),
        },
        exclude: [
          path.resolve(__dirname, '.webpack'),
          path.resolve(__dirname, '.serverless'),
          path.resolve(__dirname, 'node_modules'),
        ],
      },
    ],
  },
};
