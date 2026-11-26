// Free keyword check for the App Store listing: what the App Store autocompletes for our seed words, per country.
// The order of the suggestions is Apple's own (most searched first), so it shows which phrases people really type.
// No popularity numbers (that needs a paid tool). Output: store/keywords-ios/hints.json
// Run: node scripts/ios-keyword-hints.mjs
import { writeFile } from "node:fs/promises";
import { throttle, withRetry, getText } from "../../../research-hub/src/sources/http.js";

const SF = { us: 143441, fr: 143442, de: 143443, it: 143450, jp: 143462, kr: 143466, br: 143503, mx: 143468 };
const SEEDS = {
  us: ["interval", "interval t", "hiit", "tabata", "workout timer", "gym timer", "emom", "round timer", "boxing timer", "rest timer", "running interval", "timer", "amrap", "circuit t", "stopwatch", "exercise timer"],
  fr: ["minuteur", "interval", "hiit", "tabata", "chrono", "timer", "fractionné", "emom", "minuteur sport", "boxe", "entrainement"],
  de: ["intervall", "interval", "hiit", "tabata", "timer", "stoppuhr", "workout", "emom", "training timer", "box timer", "lauf"],
  it: ["timer", "intervall", "interval", "hiit", "tabata", "cronometro", "allenamento", "emom", "ripetute"],
  jp: ["インターバル", "タバタ", "hiit", "タイマー", "筋トレ", "ストップウォッチ", "トレーニング", "ラウンド", "emom", "interval"],
  kr: ["인터벌", "타바타", "hiit", "타이머", "운동 타이머", "스톱워치", "헬스", "라운드", "emom", "interval"],
  br: ["timer", "interval", "hiit", "tabata", "cronômetro", "cronometro", "treino", "emom", "temporizador"],
  mx: ["temporizador", "interval", "hiit", "tabata", "cronómetro", "cronometro", "timer", "emom", "entrenamiento"],
};
const out = {};
for (const [cc, seeds] of Object.entries(SEEDS)) {
  out[cc] = {};
  for (const seed of seeds) {
    await throttle("itunes-hints", 3200);
    const url = `https://search.itunes.apple.com/WebObjects/MZSearchHints.woa/wa/hints?clientApplication=Software&term=${encodeURIComponent(seed)}`;
    try {
      const xml = await withRetry(() => getText(url, { "X-Apple-Store-Front": `${SF[cc]}-1,29` }));
      out[cc][seed] = [...xml.matchAll(/<key>term<\/key>\s*<string>([^<]*)<\/string>/g)].map((m) => m[1].replace(/&amp;/g, "&").replace(/&#39;/g, "'").trim());
    } catch (e) { out[cc][seed] = ["ERROR " + e.message]; }
    console.log(cc, JSON.stringify(seed), "→", out[cc][seed].join(" | "));
  }
}
await writeFile("store/keywords-ios/hints.json", JSON.stringify(out, null, 1));
