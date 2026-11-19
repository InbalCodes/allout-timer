// The workout model. A workout is a tree: steps, and groups that repeat their items (groups may hold groups).
// The timer itself never sees the tree: flatten() turns it into the plain list of steps that actually run.
// No DOM, no i18n in here, so scripts/check-workout.mjs can load it directly in Node.

export type Kind = "work" | "rest" | "warmup" | "cooldown";

export interface Step {
  type: "step";
  id: string;
  kind: Kind;
  /** Empty = show the kind's own name ("Work", "Rest"...). */
  name: string;
  /** "time": lasts `seconds`. "reps": lasts until the user says done, or reps × pace when pace > 0. */
  mode: "time" | "reps";
  seconds: number;
  reps: number;
  /** Seconds per rep, counted out loud. 0 = no clock, wait for "Done". */
  pace: number;
}

export interface Group {
  type: "group";
  id: string;
  times: number;
  /** Drop a trailing rest on the last round, so it doesn't stack with whatever rest comes after the group. */
  skipLastRest: boolean;
  items: Node[];
}

export type Node = Step | Group;

export interface Workout {
  id: string;
  name: string;
  items: Node[];
}

/** One step as it will actually run. */
export interface FlatStep {
  step: Step;
  /** 0 = manual: waits for "Done". */
  seconds: number;
  /** [round, of] for each enclosing group, outermost first. */
  path: [number, number][];
}

export const FREE_MAX_STEPS = 4;
export const FREE_MAX_DEPTH = 1;
export const MAX_TIMES = 99;
export const MAX_SECONDS = 4 * 60 * 60;

let seq = 0;
export const newId = (): string => Date.now().toString(36) + (seq++).toString(36) + Math.floor(Math.random() * 1296).toString(36);

export const step = (kind: Kind, seconds: number, name = ""): Step =>
  ({ type: "step", id: newId(), kind, name, mode: "time", seconds, reps: 10, pace: 0 });
export const repsStep = (reps: number, name = "", pace = 0): Step =>
  ({ type: "step", id: newId(), kind: "work", name, mode: "reps", seconds: 30, reps, pace });
export const group = (times: number, items: Node[], skipLastRest = true): Group =>
  ({ type: "group", id: newId(), times, skipLastRest, items });

export const stepSeconds = (s: Step): number => (s.mode === "time" ? s.seconds : s.pace > 0 ? s.reps * s.pace : 0);

const isRest = (n: Node | undefined): boolean => !!n && n.type === "step" && n.kind === "rest";

export function flatten(items: Node[], path: [number, number][] = []): FlatStep[] {
  const out: FlatStep[] = [];
  for (const n of items) {
    if (n.type === "step") { out.push({ step: n, seconds: stepSeconds(n), path }); continue; }
    for (let round = 1; round <= n.times; round++) {
      let inner = n.items;
      if (n.skipLastRest && round === n.times && inner.length > 1 && isRest(inner[inner.length - 1])) inner = inner.slice(0, -1);
      out.push(...flatten(inner, [...path, [round, n.times]]));
    }
  }
  return out;
}

/** Clock time only; manual rep steps add nothing, so a workout with them shows "+". */
export const totalSeconds = (flat: FlatStep[]): number => flat.reduce((a, f) => a + f.seconds, 0);
export const hasManual = (flat: FlatStep[]): boolean => flat.some((f) => f.seconds === 0);

/** Distinct steps the user defined (not rounds). This is what the free limit counts. */
export const countSteps = (items: Node[]): number =>
  items.reduce((a, n) => a + (n.type === "step" ? 1 : countSteps(n.items)), 0);

/** 0 = no groups, 1 = groups of steps, 2 = a group inside a group... */
export const depth = (items: Node[]): number =>
  items.reduce((a, n) => Math.max(a, n.type === "group" ? 1 + depth(n.items) : 0), 0);

export const fitsFree = (items: Node[]): boolean => countSteps(items) <= FREE_MAX_STEPS && depth(items) <= FREE_MAX_DEPTH;

/** Why this workout can't run, or null. */
export function problem(items: Node[]): "empty" | "emptyGroup" | null {
  if (!countSteps(items)) return "empty";
  const emptyGroup = (ns: Node[]): boolean => ns.some((n) => n.type === "group" && (!n.items.length || emptyGroup(n.items)));
  return emptyGroup(items) ? "emptyGroup" : null;
}

// ---- immutable edits (the editor keeps the tree in state) ----

export function findNode(items: Node[], id: string): Node | null {
  for (const n of items) {
    if (n.id === id) return n;
    if (n.type === "group") { const f = findNode(n.items, id); if (f) return f; }
  }
  return null;
}

/** Depth of the group with this id (1 = top level group), or 0 for the root list (id null). */
export function groupDepth(items: Node[], id: string | null, at = 1): number {
  if (id === null) return 0;
  for (const n of items) {
    if (n.type !== "group") continue;
    if (n.id === id) return at;
    const d = groupDepth(n.items, id, at + 1);
    if (d) return d;
  }
  return 0;
}

export const updateNode = (items: Node[], id: string, f: (n: Node) => Node): Node[] =>
  items.map((n) => (n.id === id ? f(n) : n.type === "group" ? { ...n, items: updateNode(n.items, id, f) } : n));

export const removeNode = (items: Node[], id: string): Node[] =>
  items.filter((n) => n.id !== id).map((n) => (n.type === "group" ? { ...n, items: removeNode(n.items, id) } : n));

/** Append to the root list (parent null) or to a group. */
export const addNode = (items: Node[], parent: string | null, node: Node): Node[] =>
  parent === null ? [...items, node] : updateNode(items, parent, (g) => (g.type === "group" ? { ...g, items: [...g.items, node] } : g));

/** Move within its own list. dir -1 = up, 1 = down. */
export function moveNode(items: Node[], id: string, dir: -1 | 1): Node[] {
  const i = items.findIndex((n) => n.id === id);
  if (i >= 0) {
    const j = i + dir;
    if (j < 0 || j >= items.length) return items;
    const next = items.slice();
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  }
  return items.map((n) => (n.type === "group" ? { ...n, items: moveNode(n.items, id, dir) } : n));
}

export const cloneNode = (n: Node): Node =>
  n.type === "step" ? { ...n, id: newId() } : { ...n, id: newId(), items: n.items.map(cloneNode) };

/** Insert a copy right after the original. */
export function duplicateNode(items: Node[], id: string): Node[] {
  const i = items.findIndex((n) => n.id === id);
  if (i >= 0) return [...items.slice(0, i + 1), cloneNode(items[i]), ...items.slice(i + 1)];
  return items.map((n) => (n.type === "group" ? { ...n, items: duplicateNode(n.items, id) } : n));
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(v) ? v : lo)));

/** "1:30", "12:05", "1:02:00". */
export function clock(total: number): string {
  const s = Math.max(0, Math.round(total));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : String(m)) + ":" + String(r).padStart(2, "0");
}

// ---- ready-made workouts (all inside the free limits) ----

export type TemplateId = "simple" | "tabata" | "fourByFour" | "runWalk" | "strength";

/** `names` gives step names in the UI language (only run/walk uses them); the model itself has no i18n. */
export const TEMPLATES: Record<TemplateId, (names?: { run: string; walk: string }) => Node[]> = {
  simple: () => [step("warmup", 300), group(6, [step("work", 60), step("rest", 60)], false), step("cooldown", 300)],
  tabata: () => [group(8, [step("work", 20), step("rest", 10)])],
  fourByFour: () => [step("warmup", 600), group(4, [step("work", 240), step("rest", 180)]), step("cooldown", 300)],
  runWalk: (n = { run: "Run", walk: "Walk" }) => [group(8, [step("work", 60, n.run), step("rest", 90, n.walk)], false)],
  strength: () => [group(3, [repsStep(5), step("rest", 180)])],
};
