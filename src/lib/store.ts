// Everything stays on the phone, in localStorage (Capacitor's WebView keeps it across launches):
// the workout in the editor, the Pro library of saved workouts, and the cue settings.
import { TEMPLATES, cloneNode, newId, type Node } from "./workout";
import type { Options } from "./runner";

export interface Settings extends Options { keepOn: boolean }

/** The workout in the editor. `id` is the library entry it mirrors, or null when it was never saved. */
export interface Current { id: string | null; name: string; items: Node[] }
export interface Saved { id: string; name: string; items: Node[]; updated: number }

const CURRENT = "workout.current", LIBRARY = "workout.library", SETTINGS = "settings";
const DEFAULTS: Settings = { duck: true, voice: true, beeps: true, keepOn: true };

function read<T>(key: string): T | null {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
}
function write(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode / full: keep running from memory */ }
}

/** The last workout the user had open; a first launch starts from the classic template instead of a blank page. */
export function loadCurrent(): Current {
  const c = read<Current | Node[]>(CURRENT);
  if (Array.isArray(c)) return { id: null, name: "", items: c }; // 0.1.0 stored the bare list
  if (c && Array.isArray(c.items)) return { id: c.id ?? null, name: c.name ?? "", items: c.items };
  return { id: null, name: "", items: TEMPLATES.simple() };
}
export const saveCurrent = (c: Current): void => write(CURRENT, c);

export function loadLibrary(): Saved[] {
  const l = read<Saved[]>(LIBRARY);
  return Array.isArray(l) ? l.filter((w) => w && typeof w.id === "string" && Array.isArray(w.items)) : [];
}
export const saveLibrary = (l: Saved[]): void => write(LIBRARY, l);

// Library edits return a new list, most recently touched first.
export const libAdd = (l: Saved[], name: string, items: Node[]): Saved[] =>
  [{ id: newId(), name, items, updated: Date.now() }, ...l];
export const libUpdate = (l: Saved[], id: string, p: Partial<Pick<Saved, "name" | "items">>): Saved[] => {
  const w = l.find((x) => x.id === id);
  return w ? [{ ...w, ...p, updated: Date.now() }, ...l.filter((x) => x.id !== id)] : l;
};
export const libRemove = (l: Saved[], id: string): Saved[] => l.filter((x) => x.id !== id);
export const libDuplicate = (l: Saved[], id: string, name: string): Saved[] => {
  const w = l.find((x) => x.id === id);
  return w ? libAdd(l, name, w.items.map(cloneNode)) : l;
};

export const loadSettings = (): Settings => ({ ...DEFAULTS, ...(read<Partial<Settings>>(SETTINGS) ?? {}) });
export const saveSettings = (s: Settings): void => write(SETTINGS, s);
