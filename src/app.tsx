// Allout Timer: home is the workout editor → run (big clock, driven by the native service) → done.
// Nothing leaves the phone. The workout tree and its limits live in lib/workout.ts, the timer in lib/runner.ts.
import { useEffect, useRef, useState } from "preact/hooks";
import { App as CapApp } from "@capacitor/app";
import { t, type Key } from "./i18n";
import {
  flatten, totalSeconds, hasManual, countSteps, groupDepth, problem, clock, clamp, step, repsStep, group, findNode, fitsFree,
  addNode, removeNode, moveNode, duplicateNode, updateNode, TEMPLATES, FREE_MAX_STEPS, FREE_MAX_DEPTH, MAX_TIMES, MAX_SECONDS,
  type Node, type Step, type Group, type Kind, type FlatStep, type TemplateId,
} from "./lib/workout";
import * as runner from "./lib/runner";
import { loadCurrent, saveCurrent, loadLibrary, saveLibrary, libAdd, libUpdate, libRemove, libDuplicate, loadSettings, saveSettings, type Settings, type Current, type Saved } from "./lib/store";
import { isPro, onProChange, restore } from "./lib/purchases";
import { Paywall, LEGAL } from "./components/Paywall";
import { afterWorkoutCompleted } from "./lib/review";
import { secretTap } from "./lib/crash";

type Screen = "home" | "library" | "run" | "done" | "settings";
const KINDS: Kind[] = ["work", "rest", "warmup", "cooldown"];
const TEMPLATE_KEYS: [TemplateId, Key, Key][] = [
  ["simple", "tplSimple", "tplSimpleHint"], ["tabata", "tplTabata", "tplTabataHint"], ["fourByFour", "tplFourByFour", "tplFourByFourHint"],
  ["runWalk", "tplRunWalk", "tplRunWalkHint"], ["strength", "tplStrength", "tplStrengthHint"],
];
const RUN_KEY = "run.flat";

/** Dev only: fixed screens for the store screenshots (scripts/store-shots.html). ?demo=home|run|reps|library|settings|paywall */
const DEMO = import.meta.env.DEV ? new URLSearchParams(location.search).get("demo") : null;
const D = DEMO ? (() => {
  const nested = [step("warmup", 600), group(3, [group(4, [step("work", 60), step("rest", 60)]), step("rest", 180)]), step("cooldown", 300)];
  const strength = [step("warmup", 300), group(3, [repsStep(8), step("rest", 120)]), step("cooldown", 300)];
  const lib: Saved[] = ([
    ["3 × 4 × 1:00", nested], [t("tplStrength"), strength], [t("tplTabata"), TEMPLATES.tabata()],
    [t("tplFourByFour"), TEMPLATES.fourByFour()], [t("tplRunWalk"), TEMPLATES.runWalk({ run: t("tplRun"), walk: t("tplWalk") })],
  ] as [string, Node[]][]).map(([name, items], i) => ({ id: "demo" + i, name, items, updated: 0 }));
  const reps = DEMO === "reps";
  const flat = flatten(reps ? strength : nested);
  const index = reps
    ? flat.findIndex((f) => f.step.mode === "reps" && f.path[0][0] === 2)
    : flat.findIndex((f) => f.step.kind === "work" && f.path[0]?.[0] === 2 && f.path[1]?.[0] === 3);
  const screen: Screen = reps || DEMO === "run" ? "run" : DEMO === "library" || DEMO === "settings" ? DEMO : "home";
  return {
    lib, flat, screen,
    current: { id: lib[reps ? 1 : 0].id, name: lib[reps ? 1 : 0].name, items: reps ? strength : nested } as Current,
    status: { running: true, index, paused: false, remaining: reps ? -1 : 37 } as runner.Status,
  };
})() : null;

const stepLabel = (s: Step): string => runner.label({ step: s, seconds: 0, path: [] });
const stepLength = (s: Step): string =>
  s.mode === "time" ? clock(s.seconds) : s.pace > 0 ? clock(s.reps * s.pace) : t("manual");

/** A number with − / + around it; typing works too. */
function Num({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (v: number) => void; label?: string }) {
  return (
    <label class="num">
      <span class="numrow">
        <button type="button" aria-label="−" onClick={() => onChange(clamp(value - 1, min, max))}>−</button>
        <input type="number" inputMode="numeric" value={value} min={min} max={max}
          onFocus={(e) => (e.target as HTMLInputElement).select()}
          onInput={(e) => { const v = (e.target as HTMLInputElement).value; if (v !== "") onChange(clamp(Number(v), min, max)); }} />
        <button type="button" aria-label="+" onClick={() => onChange(clamp(value + 1, min, max))}>+</button>
      </span>
      {label && <span class="numlabel">{label}</span>}
    </label>
  );
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div class="seg" role="radiogroup">
      {options.map(([v, text]) => (
        <button type="button" role="radio" aria-checked={v === value} class={v === value ? "on" : ""} onClick={() => onChange(v)}>{text}</button>
      ))}
    </div>
  );
}

const NodeActions = ({ onUp, onDown, onDuplicate, onRemove }: { onUp: () => void; onDown: () => void; onDuplicate: () => void; onRemove: () => void }) => (
  <div class="actions">
    <button type="button" onClick={onUp}>↑ {t("moveUp")}</button>
    <button type="button" onClick={onDown}>↓ {t("moveDown")}</button>
    <button type="button" onClick={onDuplicate}>{t("duplicate")}</button>
    <button type="button" class="danger" onClick={onRemove}>{t("remove")}</button>
  </div>
);

function StepSheet({ s, change, actions, onClose }: { s: Step; change: (p: Partial<Step>) => void; actions: preact.ComponentChildren; onClose: () => void }) {
  return (
    <div class="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class={"sheet kind-" + s.kind} role="dialog" aria-label={t("editStep")}>
        <div class="chips">
          {KINDS.map((k) => <button type="button" class={"chip kind-" + k + (k === s.kind ? " on" : "")} onClick={() => change({ kind: k })}>{t(k)}</button>)}
        </div>
        <label class="field">
          <span>{t("name")}</span>
          <input type="text" value={s.name} maxLength={30} placeholder={t("namePlaceholder")} onInput={(e) => change({ name: (e.target as HTMLInputElement).value })} />
        </label>
        <Seg value={s.mode} options={[["time", t("byTime")], ["reps", t("byReps")]]} onChange={(mode) => change({ mode })} />
        {s.mode === "time" ? (
          <div class="pairnum">
            <Num value={Math.floor(s.seconds / 60)} min={0} max={MAX_SECONDS / 60} label={t("minutes")}
              onChange={(m) => change({ seconds: clamp(m * 60 + (s.seconds % 60), 1, MAX_SECONDS) })} />
            <Num value={s.seconds % 60} min={0} max={59} label={t("seconds")}
              onChange={(sec) => change({ seconds: clamp(Math.floor(s.seconds / 60) * 60 + sec, 1, MAX_SECONDS) })} />
          </div>
        ) : (
          <>
            <div class="pairnum">
              <Num value={s.reps} min={1} max={999} label={t("reps")} onChange={(reps) => change({ reps })} />
              {s.pace > 0 && <Num value={s.pace} min={1} max={60} label={t("secPerRep")} onChange={(pace) => change({ pace })} />}
            </div>
            <Seg value={s.pace > 0 ? "paced" : "manual"} options={[["manual", t("manual")], ["paced", t("paced")]]}
              onChange={(v) => change({ pace: v === "paced" ? Math.max(s.pace, 3) : 0 })} />
            <p class="hint">{t(s.pace > 0 ? "pacedHint" : "manualHint")}</p>
          </>
        )}
        {actions}
        <button type="button" class="cta" onClick={onClose}>{t("close")}</button>
      </div>
    </div>
  );
}

function GroupSheet({ g, change, actions, onClose }: { g: Group; change: (p: Partial<Group>) => void; actions: preact.ComponentChildren; onClose: () => void }) {
  return (
    <div class="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="sheet" role="dialog" aria-label={t("addGroup")}>
        <div class="pairnum"><Num value={g.times} min={1} max={MAX_TIMES} label={t("times")} onChange={(times) => change({ times })} /></div>
        <label class="toggle"><input type="checkbox" checked={g.skipLastRest} onChange={(e) => change({ skipLastRest: (e.target as HTMLInputElement).checked })} /><span>{t("skipLastRest")}</span></label>
        {actions}
        <button type="button" class="cta" onClick={onClose}>{t("close")}</button>
      </div>
    </div>
  );
}

function Run({ flat, settings, onEnd, demo }: { flat: FlatStep[]; settings: Settings; onEnd: (s: runner.Summary | null) => void; demo?: runner.Status }) {
  const [st, setSt] = useState<runner.Status>(demo ?? { running: true, index: 0, paused: false, remaining: flat[0].seconds || -1 });
  const idle = useRef(0);
  useEffect(() => {
    if (demo) return;
    if (settings.keepOn) void runner.keepAwake(true);
    const id = window.setInterval(async () => {
      const s = await runner.status().catch(() => null);
      if (!s) return;
      if (s.running) { idle.current = 0; setSt(s); return; }
      // The service says its goodbye for a few seconds before the summary exists.
      if (s.summary || ++idle.current > 40) onEnd(s.summary ?? null);
    }, 200);
    return () => { clearInterval(id); void runner.keepAwake(false); };
  }, []);

  const i = Math.min(st.index ?? 0, flat.length - 1), f = flat[i], nextStep = flat[i + 1];
  const manual = f.seconds === 0;
  const remaining = st.remaining ?? 0;
  const before = flat.slice(0, i).reduce((a, x) => a + x.seconds, 0), total = totalSeconds(flat);
  const fraction = hasManual(flat) || !total ? i / flat.length : Math.min(1, (before + f.seconds - Math.max(0, remaining)) / total);
  const rounds = f.path.map(([a, b]) => t("roundOf", { a, b })).join(" · ");
  return (
    <section class={"run kind-" + f.step.kind + (st.paused ? " paused" : "")}>
      <div class="bar"><span style={{ width: (fraction * 100).toFixed(1) + "%" }} /></div>
      <p class="pos">{t("stepOf", { a: i + 1, b: flat.length })}</p>
      <div class="now">
        <h2>{runner.label(f)}</h2>
        <div class="time">{manual ? "✓" : clock(Math.ceil(remaining))}</div>
        <p class="rounds">{st.paused ? t("paused") : manual ? t("tapDone") : rounds || " "}</p>
        {manual && rounds && !st.paused && <p class="rounds">{rounds}</p>}
      </div>
      <p class="upnext">{nextStep ? <>{t("next")}: <b>{runner.label(nextStep)}</b>{nextStep.seconds > 0 && " · " + clock(nextStep.seconds)}</> : t("finish")}</p>
      {manual
        ? <button type="button" class="cta huge" onClick={() => void runner.next()}>{t("done")}</button>
        : <button type="button" class="cta" onClick={() => void runner.togglePause()}>{st.paused ? t("resume") : t("pause")}</button>}
      <div class="pair">
        <button type="button" class="secondary" onClick={() => void (manual ? runner.togglePause() : runner.next())}>{manual ? (st.paused ? t("resume") : t("pause")) : t("skip")}</button>
        <button type="button" class="secondary" onClick={() => { if (confirm(t("stopConfirm"))) void runner.stop(); }}>{t("stop")}</button>
      </div>
    </section>
  );
}
function NameSheet({ initial, onSave, onClose }: { initial: string; onSave: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState(initial);
  const save = () => onSave(name.trim() || t("untitled"));
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  return (
    <div class="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form class="sheet" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <label class="field">
          <span>{t("workoutName")}</span>
          <input type="text" value={name} maxLength={40} ref={input} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        </label>
        <button type="submit" class="cta">{t("save")}</button>
      </form>
    </div>
  );
}

/** What the name sheet is for: saving the editor's workout as a new entry, or renaming a saved one. */
type Naming = { kind: "saveAs" } | { kind: "rename"; id: string };

export function App() {
  const [screen, setScreen] = useState<Screen>(D?.screen ?? "home");
  const [current, setCurrent] = useState<Current>(D?.current ?? loadCurrent);
  const [library, setLibrary] = useState<Saved[]>(D?.lib ?? loadLibrary);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [pro, setPro] = useState(!!D);
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [paywall, setPaywall] = useState<string | null>(DEMO === "paywall" ? "" : null);
  const [naming, setNaming] = useState<Naming | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [flat, setFlat] = useState<FlatStep[]>(D?.flat ?? []);
  const [summary, setSummary] = useState<runner.Summary | null>(null);
  const items = current.items;
  const saved = current.id !== null && library.some((w) => w.id === current.id);

  const open = (c: Current) => { setCurrent(c); saveCurrent(c); };
  const store = (l: Saved[]) => { setLibrary(l); saveLibrary(l); };
  /** Every edit is kept; a workout that came from the library updates its entry too, so there's no "save" step. */
  const edit = (next: Node[]) => {
    open({ ...current, items: next });
    if (saved) store(libUpdate(library, current.id!, { items: next }));
  };
  const setting = (p: Partial<Settings>) => { const s = { ...settings, ...p }; setSettings(s); saveSettings(s); };

  useEffect(() => {
    if (D) return;
    void isPro().then(setPro);
    void onProChange(setPro);
    // A workout that is still running in the service (app reopened from the notification) goes straight back to its screen.
    void runner.status().then((s) => {
      if (!s.running) return;
      try { const list = JSON.parse(localStorage.getItem(RUN_KEY) ?? "null") as FlatStep[] | null; if (list?.length) { setFlat(list); setScreen("run"); } } catch { /* ignore */ }
    }).catch(() => { /* ignore */ });
  }, []);

  // Android back: close what's open, leave from home. A running workout keeps running in the background.
  const state = useRef({ screen, editing, notice, paywall, naming, menu });
  state.current = { screen, editing, notice, paywall, naming, menu };
  useEffect(() => {
    const h = CapApp.addListener("backButton", () => {
      const s = state.current;
      if (s.paywall !== null) setPaywall(null);
      else if (s.notice) setNotice(null);
      else if (s.naming) setNaming(null);
      else if (s.menu) setMenu(null);
      else if (s.editing) setEditing(null);
      else if (s.screen === "settings" || s.screen === "done" || s.screen === "library") setScreen("home");
      else if (s.screen === "run") void CapApp.minimizeApp();
      else void CapApp.exitApp();
    });
    return () => { void h.then((x) => x.remove()); };
  }, []);

  // ---- editor ----
  const canAddSteps = (n: number): boolean => {
    if (pro || countSteps(items) + n <= FREE_MAX_STEPS) return true;
    setPaywall(t("proSteps", { n: FREE_MAX_STEPS }));
    return false;
  };
  /** The Pro mark on an add button: shown when this tap would open the paywall instead of adding. */
  const stepsLeft = FREE_MAX_STEPS - countSteps(items);
  const stepTag = !pro && stepsLeft < 1 && <span class="tag">{t("pro")}</span>;
  const groupTag = (parent: string | null) =>
    !pro && (groupDepth(items, parent) + 1 > FREE_MAX_DEPTH || stepsLeft < 2) && <span class="tag">{t("pro")}</span>;
  const addStep = (parent: string | null) => {
    if (!canAddSteps(1)) return;
    const siblings = parent ? (findNode(items, parent) as Group).items : items;
    const last = siblings[siblings.length - 1];
    const s = step(last?.type === "step" && last.kind === "work" ? "rest" : "work", 60);
    edit(addNode(items, parent, s));
    setEditing(s.id);
  };
  const addGroup = (parent: string | null) => {
    if (!pro && groupDepth(items, parent) + 1 > FREE_MAX_DEPTH) { setPaywall(t("proNesting")); return; }
    if (!canAddSteps(2)) return;
    edit(addNode(items, parent, group(4, [step("work", 60), step("rest", 60)])));
  };
  const duplicate = (n: Node) => {
    if (!canAddSteps(n.type === "step" ? 1 : countSteps(n.items))) return;
    edit(duplicateNode(items, n.id));
    setEditing(null);
  };
  /** A template (or a blank page) never overwrites a saved workout: it opens as a new, unsaved one. */
  const replaceWith = (next: Node[]) => {
    if (!saved && countSteps(items) && !confirm(t("replaceConfirm"))) return;
    open({ id: null, name: "", items: next });
    setScreen("home");
    window.scrollTo({ top: 0 });
  };

  // ---- library (Pro) ----
  const needPro = (reason: Key): boolean => { if (pro) return false; setPaywall(t(reason)); return true; };
  const saveAs = (name: string) => {
    const l = libAdd(library, name, items);
    store(l);
    open({ id: l[0].id, name, items });
    setNaming(null);
  };
  const rename = (id: string, name: string) => {
    store(libUpdate(library, id, { name }));
    if (current.id === id) open({ ...current, name });
    setNaming(null);
  };
  const removeSaved = (w: Saved) => {
    if (!confirm(t("deleteConfirm", { name: w.name }))) return;
    store(libRemove(library, w.id));
    if (current.id === w.id) open({ ...current, id: null, name: "" }); // the editor keeps the steps, as an unsaved workout
    setMenu(null);
  };

  const begin = async () => {
    const p = problem(items);
    if (p) { setNotice(t(p === "empty" ? "cantEmpty" : "cantEmptyGroup")); return; }
    // A workout built with Pro (and then refunded, or restored on another phone) still needs Pro to run.
    if (!pro && !fitsFree(items)) { setPaywall(countSteps(items) > FREE_MAX_STEPS ? t("proSteps", { n: FREE_MAX_STEPS }) : t("proNesting")); return; }
    const list = flatten(items);
    try { localStorage.setItem(RUN_KEY, JSON.stringify(list)); } catch { /* ignore */ }
    setFlat(list);
    setSummary(null);
    await runner.start(list, settings);
    setScreen("run");
  };

  const doRestore = async () => {
    setMsg("");
    try { if (await restore()) { setPro(true); setMsg(t("restored")); } else setMsg(t("nothingToRestore")); }
    catch { setMsg(t("purchaseFailed")); }
  };

  if (paywall !== null) {
    return <main class="app"><Paywall reason={paywall} onUnlocked={() => { setPro(true); setPaywall(null); }} onClose={() => setPaywall(null)} /></main>;
  }

  const list = (nodes: Node[], parent: string | null) => (
    <>
      {nodes.map((n) => n.type === "step" ? (
        <button type="button" class={"row kind-" + n.kind} onClick={() => setEditing(n.id)}>
          <span class="title">{stepLabel(n)}</span><span class="len">{stepLength(n)}</span>
        </button>
      ) : (
        <div class="group">
          <div class="ghead">
            <button type="button" class="gtimes" onClick={() => setEditing(n.id)}>× {n.times}</button>
            <span class="muted small">{n.skipLastRest ? t("skipLastRest") : ""}</span>
            <button type="button" class="more" aria-label={t("addGroup")} onClick={() => setEditing(n.id)}>⋯</button>
          </div>
          {n.items.length ? list(n.items, n.id) : <p class="hint">{t("emptyGroupHint")}</p>}
          <div class="adders">
            <button type="button" onClick={() => addStep(n.id)}>+ {t("addStep")}{stepTag}</button>
            <button type="button" onClick={() => addGroup(n.id)}>+ {t("addGroup")}{groupTag(n.id)}</button>
          </div>
        </div>
      ))}
      {parent === null && (
        <div class="adders root">
          <button type="button" onClick={() => addStep(null)}>+ {t("addStep")}{stepTag}</button>
          <button type="button" onClick={() => addGroup(null)}>+ {t("addGroup")}{groupTag(null)}</button>
        </div>
      )}
    </>
  );

  const node = editing ? findNode(items, editing) : null;
  const actions = node && (
    <NodeActions
      onUp={() => edit(moveNode(items, node.id, -1))}
      onDown={() => edit(moveNode(items, node.id, 1))}
      onDuplicate={() => duplicate(node)}
      onRemove={() => { edit(removeNode(items, node.id)); setEditing(null); }} />
  );
  const all = flatten(items);
  const length = (f: FlatStep[]) => clock(totalSeconds(f)) + (hasManual(f) ? " " + t("plusManual") : "");
  const menuFor = menu ? library.find((w) => w.id === menu) : undefined;

  return (
    <main class="app">
      {screen === "home" && (
        <section class="home">
          <header class="top">
            <h1 onClick={secretTap}>{t("appName")}</h1>
            <button type="button" class="ghost gear" aria-label={t("settings")} onClick={() => setScreen("settings")}>⚙</button>
          </header>
          <p class="tagline">{t("tagline")}</p>
          <div class="libbar">
            <button type="button" onClick={() => { if (!needPro("proLibrary")) setScreen("library"); }}>
              {t("myWorkouts")}{pro ? (library.length ? " · " + library.length : "") : <span class="tag">{t("pro")}</span>}
            </button>
            {saved
              ? <span class="savedmark">✓ {t("saved")}</span>
              : <button type="button" onClick={() => { if (!needPro("proLibrary")) setNaming({ kind: "saveAs" }); }}>{t("save")}{!pro && <span class="tag">{t("pro")}</span>}</button>}
          </div>
          <div class="summary">
            <span>{saved ? current.name : t("yourWorkout")}</span>
            <b>{t("total")} {length(all)}</b>
          </div>
          <div class="tree">
            {items.length ? null : <p class="hint">{t("emptyHint")}</p>}
            {list(items, null)}
          </div>
          <button type="button" class="cta start" onClick={() => void begin()}>{t("start")}</button>
          <p class="hint">{t("musicHint")}</p>
          <h3>{t("templates")}</h3>
          <ul class="cards">
            {TEMPLATE_KEYS.map(([id, title, hint]) => (
              <li><button type="button" onClick={() => replaceWith(TEMPLATES[id]({ run: t("tplRun"), walk: t("tplWalk") }))}><b>{t(title)}</b><span>{t(hint)}</span></button></li>
            ))}
          </ul>
        </section>
      )}

      {screen === "library" && (
        <section class="library">
          <button type="button" class="ghost back" onClick={() => setScreen("home")}>‹ {t("appName")}</button>
          <h2>{t("myWorkouts")}</h2>
          {library.length === 0 && <p class="hint">{t("libraryEmpty")}</p>}
          <ul class="cards">
            {library.map((w) => {
              const f = flatten(w.items);
              return (
                <li class={"saveditem" + (w.id === current.id ? " on" : "")}>
                  <button type="button" onClick={() => { open({ id: w.id, name: w.name, items: w.items }); setScreen("home"); }}>
                    <b>{w.name}</b><span>{length(f)} · {t("stepsN", { n: f.length })}</span>
                  </button>
                  <button type="button" class="more" aria-label={w.name} onClick={() => setMenu(w.id)}>⋯</button>
                </li>
              );
            })}
          </ul>
          <button type="button" class="secondary newbtn" onClick={() => replaceWith([])}>+ {t("newWorkout")}</button>
        </section>
      )}

      {screen === "run" && flat.length > 0 && (
        <Run flat={flat} settings={settings} demo={D?.status} onEnd={(s) => { setSummary(s); setScreen("done"); if (s?.completed && !D) afterWorkoutCompleted(); }} />
      )}

      {screen === "done" && (
        <section class="done">
          <div class="now">
            <h2>{t(summary && !summary.completed ? "stoppedTitle" : "completeTitle")}</h2>
            {summary && <p class="rounds">{t("duration", { t: clock(summary.seconds) })}</p>}
            {summary && summary.cues > 0 && <p class="muted small">{t("onTime", { ms: summary.maxLateMs })}</p>}
          </div>
          <button type="button" class="cta" onClick={() => void begin()}>{t("again")}</button>
          <button type="button" class="secondary" onClick={() => setScreen("home")}>{t("home")}</button>
        </section>
      )}

      {screen === "settings" && (
        <section class="settings">
          <button type="button" class="ghost back" onClick={() => { setMsg(""); setScreen("home"); }}>‹ {t("appName")}</button>
          <h2>{t("settings")}</h2>
          <h3>{t("music")}</h3>
          <label class="toggle"><input type="radio" name="music" checked={settings.duck} onChange={() => setting({ duck: true })} /><span>{t("musicDuck")}</span></label>
          <label class="toggle"><input type="radio" name="music" checked={!settings.duck} onChange={() => setting({ duck: false })} /><span>{t("musicMix")}</span></label>
          <h3>{t("cues")}</h3>
          <label class="toggle"><input type="checkbox" checked={settings.voice} onChange={(e) => setting({ voice: (e.target as HTMLInputElement).checked })} /><span>{t("voice")}</span></label>
          <label class="toggle"><input type="checkbox" checked={settings.beeps} onChange={(e) => setting({ beeps: (e.target as HTMLInputElement).checked })} /><span>{t("beeps")}</span></label>
          <label class="toggle"><input type="checkbox" checked={settings.keepOn} onChange={(e) => setting({ keepOn: (e.target as HTMLInputElement).checked })} /><span>{t("keepOn")}</span></label>
          <h3>{t("paywallTitle")}</h3>
          {pro
            ? <p class="proactive">{t("proActive")}</p>
            : <button type="button" class="secondary" onClick={() => setPaywall("")}>{t("getPro")}</button>}
          {!pro && <button type="button" class="ghost" onClick={() => void doRestore()}>{t("restore")}</button>}
          {msg && <p class="hint">{msg}</p>}
          <p class="free">
            <span class="links legal">
              <a href={LEGAL.privacy} target="_blank" rel="noopener">{t("privacy")}</a>
              <a href={LEGAL.terms} target="_blank" rel="noopener">{t("terms")}</a>
            </span>
            {t("version", { v: __APP_VERSION__ })} · {t("madeBy")}
          </p>
        </section>
      )}

      {node?.type === "step" && (
        <StepSheet s={node} actions={actions} onClose={() => setEditing(null)}
          change={(p) => edit(updateNode(items, node.id, (n) => ({ ...(n as Step), ...p })))} />
      )}
      {node?.type === "group" && (
        <GroupSheet g={node} actions={actions} onClose={() => setEditing(null)}
          change={(p) => edit(updateNode(items, node.id, (n) => ({ ...(n as Group), ...p })))} />
      )}
      {menuFor && !naming && (
        <div class="scrim" onClick={(e) => { if (e.target === e.currentTarget) setMenu(null); }}>
          <div class="sheet" role="dialog" aria-label={menuFor.name}>
            <b>{menuFor.name}</b>
            <div class="actions three">
              <button type="button" onClick={() => setNaming({ kind: "rename", id: menuFor.id })}>{t("rename")}</button>
              <button type="button" onClick={() => { store(libDuplicate(library, menuFor.id, t("copyOf", { name: menuFor.name }))); setMenu(null); }}>{t("duplicate")}</button>
              <button type="button" class="danger" onClick={() => removeSaved(menuFor)}>{t("remove")}</button>
            </div>
            <button type="button" class="cta" onClick={() => setMenu(null)}>{t("close")}</button>
          </div>
        </div>
      )}
      {naming && (
        <NameSheet
          initial={naming.kind === "rename" ? library.find((w) => w.id === naming.id)?.name ?? "" : ""}
          onSave={(name) => { if (naming.kind === "rename") { rename(naming.id, name); setMenu(null); } else saveAs(name); }}
          onClose={() => setNaming(null)} />
      )}
      {notice && (
        <div class="scrim" onClick={() => setNotice(null)}>
          <div class="sheet notice" role="alertdialog">
            <p>{notice}</p>
            <button type="button" class="cta" onClick={() => setNotice(null)}>{t("ok")}</button>
          </div>
        </div>
      )}
    </main>
  );
}
