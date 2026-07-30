import typescript from "@rollup/plugin-typescript";
import { terser } from "rollup-plugin-terser";
import copy from "rollup-plugin-copy";
import clear from "rollup-plugin-clear";
import inline from "./rollup-plugin-inline";
import { storeBundle, retrieveBundle } from "./rollup-plugin-output-as-module";

const banner = `/*
Draw.io Diagrams Obsidian Plugin
2021 - Sam Greenhalgh - https://radicalresearch.co.uk/
*/
`;

const chunkCache = new Map();

export default [
  {
    input: "./src/drawio-client/init/index.ts",
    output: {
      name: "init",
      file: "/tmp/bt8/init.js",
      format: "iife",
      banner,
    },
    plugins: [
      inline(),
      typescript({
        tsconfig: "./tsconfig.es5.json",
      }),
      terser(),
      storeBundle(chunkCache),
    ],
  },
  {
    input: "./src/drawio-client/app/index.ts",
    output: {
      name: "app",
      file: "/tmp/bt8/app.js",
      format: "iife",
      banner,
    },
    plugins: [
      inline(),
      typescript({
        tsconfig: "./tsconfig.es5.json",
      }),
      terser(),
      storeBundle(chunkCache),
    ],
  },
  {
    input: "./src/DiagramPlugin.ts",
    output: [
      {
        file: "/tmp/bt8/main.js",
        format: "cjs",
        exports: "default",
        banner,
      },
    ],
    external: ["obsidian"],
    plugins: [
      clear({ targets: ["/tmp/bt8"] }),
      retrieveBundle(chunkCache),
      inline(),
      typescript(),
      terser(),
      copy({
        targets: [
          { src: "./manifest.json", dest: "/tmp/bt8" },
          { src: "./src/assets/styles.css", dest: "/tmp/bt8" },
        ],
      }),
    ],
  },
];
