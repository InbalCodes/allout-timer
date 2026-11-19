// Sanity checks on the workout model (run: npm run check). Loads the TS source through Node's type stripping.
import {
  TEMPLATES, flatten, totalSeconds, hasManual, countSteps, depth, fitsFree, problem, step, repsStep, group,
  addNode, removeNode, moveNode, duplicateNode, updateNode, groupDepth, clock,
} from "../src/lib/workout.ts";

let bad = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.error(`FAIL ${name}: got ${a}, want ${b}`); bad++; }
};

for (const [id, make] of Object.entries(TEMPLATES)) {
  const items = make();
  const flat = flatten(items);
  eq(`${id} fits free`, fitsFree(items), true);
  eq(`${id} runnable`, problem(items), null);
  console.log(`${id.padEnd(11)} ${String(flat.length).padStart(3)} steps  ${clock(totalSeconds(flat))}${hasManual(flat) ? " + manual" : ""}`);
}

// The example from decisions.md: 3 × [4 × (fast + rest) + set rest], with warm-up and cool-down.
const inner = group(4, [step("work", 90), step("rest", 60)], true);
const nested = [step("warmup", 600), group(3, [inner, step("rest", 180)], true), step("cooldown", 300)];
const flat = flatten(nested);
// Per set: 4 work + 3 rest (last rest skipped) = 7; sets 1-2 add a set rest; + warm-up and cool-down.
eq("nested length", flat.length, 1 + 3 * 7 + 2 + 1);
eq("nested seconds", totalSeconds(flat), 600 + 3 * (4 * 90 + 3 * 60) + 2 * 180 + 300);
eq("nested path of 2nd step", flat[1].path, [[1, 3], [1, 4]]);
eq("nested last work path", flat[flat.length - 2].path, [[3, 3], [4, 4]]);
eq("no double rest", flat.some((f, i) => i > 0 && f.step.kind === "rest" && flat[i - 1].step.kind === "rest"), false);
eq("nested steps", countSteps(nested), 5);
eq("nested depth", depth(nested), 2);
eq("nested is Pro", fitsFree(nested), false);

// skipLastRest off keeps every rest; a group holding only a rest is never emptied.
eq("keep last rest", flatten([group(2, [step("work", 10), step("rest", 5)], false)]).length, 4);
eq("rest-only group", flatten([group(2, [step("rest", 5)], true)]).length, 2);

// Reps: manual has no clock, paced lasts reps × pace.
eq("manual reps", flatten([repsStep(5)])[0].seconds, 0);
eq("paced reps", flatten([repsStep(5, "", 3)])[0].seconds, 15);
eq("3 x [5 reps + rest]", flatten(TEMPLATES.strength()).map((f) => f.seconds), [0, 180, 0, 180, 0]);

// Limits.
eq("5 steps is Pro", fitsFree([1, 2, 3, 4, 5].map(() => step("work", 10))), false);
eq("4 steps in a group is free", fitsFree([group(3, [1, 2, 3, 4].map(() => step("work", 10)))]), true);
eq("empty", problem([]), "empty");
eq("empty group", problem([step("work", 5), group(2, [])]), "emptyGroup");

// Edits.
const a = step("work", 10), b = step("rest", 5), g = group(2, [a, b]);
let t = [g];
eq("groupDepth", [groupDepth(t, null), groupDepth(t, g.id)], [0, 1]);
t = addNode(t, g.id, step("work", 20));
eq("add to group", t[0].items.length, 3);
t = moveNode(t, b.id, 1);
eq("move down", t[0].items.map((n) => n.seconds), [10, 20, 5]);
t = duplicateNode(t, a.id);
eq("duplicate", t[0].items.map((n) => n.seconds), [10, 10, 20, 5]);
eq("duplicate has new id", t[0].items[0].id !== t[0].items[1].id, true);
t = updateNode(t, g.id, (n) => ({ ...n, times: 5 }));
eq("update", t[0].times, 5);
t = removeNode(t, a.id);
eq("remove", t[0].items.length, 3);

eq("clock", [clock(5), clock(90), clock(725), clock(3720)], ["0:05", "1:30", "12:05", "1:02:00"]);

if (bad) process.exit(1);
console.log("workout OK");
