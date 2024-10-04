const path = require('path');

module.exports = {
  mode: 'production', // development or production
  entry: './main.ts', // 플러그인의 진입점 파일
  output: {
    filename: 'main.js', // 번들링된 파일 이름
    path: path.resolve(__dirname, 'dist'), // 출력 디렉터리
    libraryTarget: 'commonjs', // Obsidian 플러그인에서 사용할 형식 (CommonJS)
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js'], // 파일 확장자 처리
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/, // .ts, .tsx 파일을 찾는다.
        use: 'ts-loader', // TypeScript 파일을 로드하기 위한 ts-loader 사용
        exclude: /node_modules/, // node_modules는 제외
      },
    ],
  },
  externals: {
    obsidian: 'commonjs obsidian', // Obsidian API는 외부 모듈로 취급 (번들에 포함되지 않음)
  },
  devtool: 'source-map', // 디버깅을 위한 소스맵 생성
};
