// Renders the Play Store screenshots (1080×1920, one folder per language) with headless Edge.
// Needs the dev server: npm run dev (port 5185). Screens are the ?demo= modes of the app
// (?demo= screens in src/app.tsx).   Run: node scripts/store-shots.mjs [en de ja]
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, statSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = process.env.BASE ?? "http://127.0.0.1:5185";
const LANGS = process.argv.slice(2).length ? process.argv.slice(2) : ["en", "fr", "de", "it", "ja", "ko", "pt", "es"];
for (const lang of LANGS) {
  const dir = resolve("store/screenshots", lang);
  mkdirSync(dir, { recursive: true });
  for (let shot = 1; shot <= 5; shot++) {
    const out = resolve(dir, `${shot}.png`);
    for (let attempt = 1; ; attempt++) {
      if (existsSync(out)) rmSync(out);
      try { execFileSync(EDGE, ["--headless=new", `--user-data-dir=${resolve(tmpdir(), "allout-shots")}`, "--disable-gpu", "--hide-scrollbars", "--mute-audio", "--force-device-scale-factor=2",
      "--window-size=540,960", "--virtual-time-budget=6000", `--screenshot=${out}`,
      `${BASE}/scripts/store-shots.html?shot=${shot}&lang=${lang}`], { stdio: "ignore", timeout: 60000 }); } catch (e) { console.error(e.message); }
      // Edge can return before the file is written: wait up to 30 s for it.
      for (let i = 0; i < 60 && !(existsSync(out) && statSync(out).size > 50000); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
      if (existsSync(out) && statSync(out).size > 50000) break;
      if (attempt === 3) throw new Error(`failed: ${out}`);
    }
    console.log(out);
  }
}
