// Anonymous id per install: the RevenueCat app user id. The only identifier the app has; it never leaves the phone
// except to RevenueCat with a purchase.
const USER_KEY = "allout.user";

export function getUserId(): string {
  let id = "";
  try { id = localStorage.getItem(USER_KEY) ?? ""; } catch { /* storage blocked */ }
  if (!id) {
    id = crypto.randomUUID().replace(/-/g, "");
    try { localStorage.setItem(USER_KEY, id); } catch { /* ignore */ }
  }
  return id;
}

/** Small persisted settings and counters. */
export function getItem(key: string): string | null {
  try { return localStorage.getItem(`allout.${key}`); } catch { return null; }
}
export function setItem(key: string, value: string): void {
  try { localStorage.setItem(`allout.${key}`, value); } catch { /* ignore */ }
}
