import minify from "rollup-plugin-babel-minify";
import babel from "rollup-plugin-babel";

export default {
  input: "./src/index.js",
  name: "ulit",
  output: {
    file: "./dist/ulit.js",
    format: "umd"
  },
  sourcemap: true,
  plugins: [
    babel({
      babelrc: false,
      presets: [["env", { modules: false }]],
      plugins: ["transform-flow-strip-types"]
    }),
    minify({ comments: false })
  ],
  globals: {},
  external: []
};
