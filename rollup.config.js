import typescript from 'rollup-plugin-typescript';

export default [{
  input: './src/ulit.ts',
  output: {
    file: './dist/ulit.js',
    format: 'umd',
    name: 'ulit',
    sourcemap: true,
  },
  plugins: [
    typescript({
      exclude: 'node_modules/**',
      typescript: require("typescript")
    }),
  ],
}];