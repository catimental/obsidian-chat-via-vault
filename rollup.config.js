import typescript from 'rollup-plugin-typescript2';
import { nodeResolve } from '@rollup/plugin-node-resolve';

export default {
  input: 'main.ts',  // TypeScript 진입 파일 경로
  output: {
    dir: 'dist',          // 번들링 후 파일이 저장될 디렉토리
    format: 'cjs',        // CommonJS 모듈 형식
    sourcemap: 'inline',  // 디버깅을 위한 소스맵을 포함
  },
  plugins: [
    nodeResolve(),        // Node 모듈을 찾기 위한 플러그인
    typescript(),         // TypeScript 지원을 위한 플러그인
  ],
  external: ['obsidian'],  // 외부 모듈로 간주하여 번들링에 포함하지 않음
};
