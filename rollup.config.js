 export default {
  input: './dist/tsc/ulit.js',
  output: {
    name: "ulit",
    file: "./dist/ulit.js",
    format: "umd",
    sourcemap: true
  },
  plugins: [],
  external: []
}