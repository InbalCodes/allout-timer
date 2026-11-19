// Renders the Play Store icon (512×512) and feature graphic (1024×500) into store/graphics/ with headless Edge.
// Needs the dev server: npm run dev (port 5185).   Run: node scripts/store-art.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, statSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = process.env.BASE ?? "http://127.0.0.1:5185";
mkdirSync("store/graphics", { recursive: true });
for (const [art, file, size] of [["icon", "store-icon-512.png", "512,512"], ["feature", "store-feature-1024x500.png", "1024,500"]]) {
  const out = resolve("store/graphics", file);
  if (existsSync(out)) rmSync(out);
  execFileSync(EDGE, ["--headless=new", `--user-data-dir=${resolve(tmpdir(), "allout-shots")}`, "--disable-gpu", "--hide-scrollbars",
    "--force-device-scale-factor=1", `--window-size=${size}`, "--virtual-time-budget=4000", `--screenshot=${out}`,
    `${BASE}/scripts/store-art.html?art=${art}`], { stdio: "ignore", timeout: 60000 });
  // Edge can return before the file is written: wait up to 30 s for it.
  for (let i = 0; i < 60 && !(existsSync(out) && statSync(out).size > 5000); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  console.log(out, existsSync(out) ? statSync(out).size : "MISSING");
}
