// Free competition check: the top App Store results for a phrase and how many ratings they have (iTunes Search API).
// Run: node scripts/ios-keyword-competition.mjs   → store/keywords-ios/competition.json
import { writeFile } from "node:fs/promises";
import { search } from "../../../research-hub/src/sources/appstore.js";
const TERMS = { us: ["interval timer", "interval training music", "interval timer music", "workout timer", "rest timer", "emom timer", "rep counter timer"], fr: ["minuteur fractionné", "minuteur sport"], de: ["intervall timer", "timer sport"], it: ["timer allenamento"], jp: ["インターバルタイマー", "筋トレタイマー"], kr: ["인터벌 타이머", "운동 타이머"], br: ["timer treino", "cronômetro de treino"], mx: ["temporizador de intervalos", "timer ejercicio"] };
const out = {};
for (const [cc, terms] of Object.entries(TERMS)) for (const term of terms) {
  const apps = await search(term, cc, 8);
  out[`${cc}: ${term}`] = apps.map((a) => ({ name: a.name, ratings: a.ratings, rating: a.rating, updated: (a.updated || "").slice(0, 10) }));
  const strong = apps.filter((a) => a.ratings >= 1000).length;
  console.log(`${cc} "${term}": ${strong}/8 with 1000+ ratings | ` + apps.slice(0, 5).map((a) => `${a.name.slice(0, 28)} (${a.ratings})`).join(" | "));
}
await writeFile("store/keywords-ios/competition.json", JSON.stringify(out, null, 1));
