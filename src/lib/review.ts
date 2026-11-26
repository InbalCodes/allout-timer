// Asks for a store rating (Google Play / App Store) at a happy moment: right after a workout that ran to the end.
// Only from the 3rd finished workout on, and at most once every 60 days (the stores also limit how often the sheet shows).
import { Capacitor, registerPlugin } from "@capacitor/core";
import { getItem, setItem } from "./user";

const AppReview = registerPlugin<{ requestReview(): Promise<void> }>("AppReview");

const DONE_KEY = "workoutsDone";
const ASKED_KEY = "reviewAskedAt";
const MIN_WORKOUTS = 3;
const GAP_MS = 60 * 24 * 3600 * 1000;

const num = (key: string) => Number(getItem(key)) || 0;

export function afterWorkoutCompleted(): void {
  const done = num(DONE_KEY) + 1;
  setItem(DONE_KEY, String(done));
  if (!Capacitor.isNativePlatform()) return;
  if (done < MIN_WORKOUTS || Date.now() - num(ASKED_KEY) < GAP_MS) return;
  setItem(ASKED_KEY, String(Date.now()));
  // after the "workout complete" cue and the switch to the summary screen
  setTimeout(() => { AppReview.requestReview().catch(() => {}); }, 2500);
}
