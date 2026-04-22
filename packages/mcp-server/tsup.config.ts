import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: { resolve: true },
  clean: true,
  sourcemap: true,
  tsconfig: "./tsconfig.json",
  banner: {
    js: '#!/usr/bin/env node',
  },
  noExternal: ["@notebook-session-labs/shared"],
});