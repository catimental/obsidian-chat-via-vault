const path = require('path');

module.exports = {
  mode: 'production',
  entry: './main.ts',
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'dist'),
    libraryTarget: 'commonjs', 
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js'], 
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/, 
        use: 'ts-loader',
        exclude: /node_modules/, 
      },
    ],
  },
  externals: {
    obsidian: 'commonjs obsidian', 
  },
  devtool: 'source-map', 
};
