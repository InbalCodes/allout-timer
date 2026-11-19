import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  plugins: [preact()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: { outDir: "dist", target: "es2022" },
  // android/ holds Gradle build output (locked files on Windows); never watch it.
  server: { port: 5185, host: "127.0.0.1", watch: { ignored: ["**/android/**", "**/dist/**"] } },
});
