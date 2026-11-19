// Checks store/listings.json against Google Play's limits and writes store/listings.md (easy to copy from).
// Run: node scripts/check-listings.mjs
import { readFile, writeFile } from "node:fs/promises";

const LIMITS = { title: 30, short: 80, full: 4000 };
const data = JSON.parse(await readFile("store/listings.json", "utf8"));
const len = (s) => [...s].length; // count characters, not UTF-16 units

let ok = true, md = "# Allout Timer: טקסטים לדף החנות ב-Google Play\n\nנוצר מ-`store/listings.json` (`node scripts/check-listings.mjs`). מעתיקים לכל שפה ב-Play Console → Store presence → Main store listing → Translations.\n";
for (const [locale, l] of Object.entries(data)) {
  if (locale.startsWith("_")) continue;
  const counts = Object.fromEntries(Object.keys(LIMITS).map((k) => [k, len(l[k])]));
  const bad = Object.keys(LIMITS).filter((k) => counts[k] > LIMITS[k]);
  const missing = l.keywords.filter((k) => !(`${l.title} ${l.short} ${l.full}`.toLowerCase().includes(k.toLowerCase().split(" ")[0])));
  console.log(`${bad.length ? "✗" : "✓"} ${locale.padEnd(6)} title ${counts.title}/30  short ${counts.short}/80  full ${counts.full}/4000${bad.length ? "  OVER: " + bad.join(",") : ""}${missing.length ? "  (keyword not found: " + missing.join(", ") + ")" : ""}`);
  if (bad.length) ok = false;
  md += `\n## ${locale}\n**Title** (${counts.title}/30)\n\n\`\`\`\n${l.title}\n\`\`\`\n**Short description** (${counts.short}/80)\n\n\`\`\`\n${l.short}\n\`\`\`\n**Full description** (${counts.full}/4000)\n\n\`\`\`\n${l.full}\n\`\`\`\n`;
}
await writeFile("store/listings.md", md);
process.exit(ok ? 0 : 1);
