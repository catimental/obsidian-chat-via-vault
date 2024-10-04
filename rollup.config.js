import typescript from 'rollup-plugin-typescript2';
import { nodeResolve } from '@rollup/plugin-node-resolve';

export default {
  input: 'main.ts', 
  output: {
    dir: 'dist',     
    format: 'cjs',   
    sourcemap: 'inline', 
  },
  plugins: [
    nodeResolve(),       
    typescript(),    
  ],
  external: ['obsidian'], 
};
