// Runs a flattened workout. On the phone that's the native service (android/.../IntervalService.java): it owns
// the clock, the beeps and the voice, so cues arrive with the screen off and the user's music keeps playing.
// In a browser a small JS stand-in does the same job well enough to build and check the UI.
import { Capacitor, registerPlugin } from "@capacitor/core";
import { t, speechLang } from "../i18n";
import type { FlatStep } from "./workout";

export interface Options { duck: boolean; voice: boolean; beeps: boolean }
export interface Summary { completed: boolean; cues: number; maxLateMs: number; avgLateMs: number; seconds: number }
export interface Status { running: boolean; index?: number; paused?: boolean; /** -1 on a manual step */ remaining?: number; summary?: Summary }

interface NativeStep { label: string; say: string; seconds: number; count?: number; every?: number }

interface IntervalPlugin {
  start(o: Options & { steps: NativeStep[]; lang: string; texts: Record<string, string> }): Promise<void>;
  stop(): Promise<void>;
  next(): Promise<void>;
  pause(): Promise<void>;
  status(): Promise<Status>;
  keepAwake(o: { on: boolean }): Promise<void>;
}

const Interval = registerPlugin<IntervalPlugin>("Interval");
export const native = Capacitor.isNativePlatform();

/** What the screen and the notification show for a step. */
export function label(f: FlatStep): string {
  const s = f.step, name = s.name.trim();
  if (s.mode === "reps") return name ? t("repsNamed", { name, n: s.reps }) : t("repsN", { n: s.reps });
  return name || t(s.kind);
}

/** What the voice says: "Work, 2 of 4", and "Set 2." in front when an outer round begins. */
export function say(flat: FlatStep[], i: number): string {
  const f = flat[i], s = f.step, name = s.name.trim();
  let text = s.mode === "reps"
    ? (name ? t("sayRepsNamed", { name, n: s.reps }) : t("sayReps", { n: s.reps }))
    : (name || t(s.kind));
  if (s.kind === "rest" || !f.path.length) return text;
  const [a, b] = f.path[f.path.length - 1];
  text = t("sayRound", { label: text, a, b });
  const prev = flat[i - 1];
  if (f.path.length > 1 && (!prev || !prev.path.length || prev.path[0][0] !== f.path[0][0])) text = t("saySet", { a: f.path[0][0], rest: text });
  return text;
}

const toNative = (flat: FlatStep[]): NativeStep[] =>
  flat.map((f, i) => ({
    label: label(f),
    say: say(flat, i),
    seconds: f.seconds,
    ...(f.step.mode === "reps" && f.step.pace > 0 ? { count: f.step.reps, every: f.step.pace } : {}),
  }));

export async function start(flat: FlatStep[], o: Options): Promise<void> {
  const steps = toNative(flat);
  if (!native) { sim.start(steps, o); return; }
  await Interval.start({
    ...o, steps, lang: speechLang,
    texts: {
      done: t("done"), skip: t("skip"), stop: t("stop"), pause: t("pause"), resume: t("resume"),
      paused: t("paused"), complete: t("sayComplete"), tapDone: t("tapDone"),
    },
  });
}

export const stop = (): Promise<void> => (native ? Interval.stop() : sim.stop());
export const next = (): Promise<void> => (native ? Interval.next() : sim.next());
export const togglePause = (): Promise<void> => (native ? Interval.pause() : sim.pause());
export const status = (): Promise<Status> => (native ? Interval.status() : sim.status());
export async function keepAwake(on: boolean): Promise<void> {
  if (native) { try { await Interval.keepAwake({ on }); } catch { /* ignore */ } }
}

// ---- browser stand-in: same behaviour, JS timers, WebAudio beeps, the browser's speech ----

const sim = (() => {
  let steps: NativeStep[] = [], opts: Options = { duck: true, voice: true, beeps: true };
  let index = -1, stepStart = 0, pausedAt = 0, began = 0, countdown = 3, count = 1;
  let running = false, paused = false, timer = 0;
  let summary: Summary | undefined;
  let ctx: AudioContext | null = null;

  const beep = (hz: number, ms: number) => {
    try {
      ctx ??= new AudioContext();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = hz;
      g.gain.value = 0.15;
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + ms / 1000);
    } catch { /* no audio: the UI still runs */ }
  };
  const speak = (text: string) => {
    if (!opts.voice || !("speechSynthesis" in window)) return;
    try { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(text)); } catch { /* ignore */ }
  };
  const end = (completed: boolean) => {
    running = false; paused = false;
    clearInterval(timer);
    summary = { completed, cues: 0, maxLateMs: 0, avgLateMs: 0, seconds: Math.round((performance.now() - began) / 1000) };
  };
  const advance = (plannedStart: number) => {
    index++;
    if (index >= steps.length) { index = steps.length - 1; beep(1320, 450); speak(t("sayComplete")); end(true); return; }
    stepStart = plannedStart; countdown = 3; count = 1;
    beep(1320, 450);
    setTimeout(() => speak(steps[index].say), 500);
  };
  const tick = () => {
    if (!running || paused) return;
    const s = steps[index];
    if (!s.seconds) return;
    const el = performance.now() - stepStart, total = s.seconds * 1000;
    if (s.count && s.every) {
      while (count < s.count && el >= count * s.every * 1000) speak(String(count++));
    } else {
      while (countdown >= 1 && el >= total - countdown * 1000) { if (opts.beeps && s.seconds >= 5) beep(880, 140); countdown--; }
    }
    if (el >= total) advance(stepStart + total);
  };
  return {
    start(list: NativeStep[], o: Options) {
      steps = list; opts = o; summary = undefined;
      running = true; paused = false; index = -1; began = performance.now();
      advance(began);
      clearInterval(timer);
      timer = window.setInterval(tick, 50);
    },
    async stop() { if (running) end(false); },
    async next() { if (running) { if (paused) { paused = false; } advance(performance.now()); } },
    async pause() {
      if (!running) return;
      if (paused) { stepStart += performance.now() - pausedAt; paused = false; }
      else { paused = true; pausedAt = performance.now(); }
    },
    async status(): Promise<Status> {
      if (!running) return { running: false, summary };
      const s = steps[index], ref = paused ? pausedAt : performance.now();
      return { running: true, index, paused, remaining: s.seconds ? Math.max(0, s.seconds - (ref - stepStart) / 1000) : -1 };
    },
  };
})();
