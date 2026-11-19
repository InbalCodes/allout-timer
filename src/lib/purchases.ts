// Allout Timer Pro: ONE non-consumable purchase through RevenueCat (Google Play Billing on Android). No subscriptions.
// Pro = any active entitlement, so a renamed entitlement can't lock paying users out.
// RevenueCat uses our install id as its app user id (lib/user.ts).
import { Purchases, LOG_LEVEL, PACKAGE_TYPE, type PurchasesPackage, type CustomerInfo } from "@revenuecat/purchases-capacitor";
import { Capacitor } from "@capacitor/core";
import { getUserId } from "./user";

const isNative = () => Capacitor.isNativePlatform();

const API_KEY = import.meta.env.VITE_REVENUECAT_ANDROID_KEY as string | undefined;
/** Dev builds can skip the paywall (VITE_DEV_UNLOCK=1 in .env.device only). Never set for store builds. */
const DEV_UNLOCK = import.meta.env.VITE_DEV_UNLOCK === "1";

// The local dev server in a browser has no store. It starts free, so the limits can be seen, and "buying" there
// just flips this switch (clear it with localStorage.removeItem("allout.devpro")).
const DEV_BROWSER = import.meta.env.DEV && !isNative();
const DEV_KEY = "allout.devpro";
const devPro = (): boolean => { try { return localStorage.getItem(DEV_KEY) === "1"; } catch { return false; } };

let configured: Promise<boolean> | null = null;

export function initPurchases(): Promise<boolean> {
  configured ??= (async () => {
    if (!isNative() || !API_KEY) return false;
    await Purchases.setLogLevel({ level: import.meta.env.DEV ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN });
    await Purchases.configure({ apiKey: API_KEY, appUserID: getUserId() });
    return true;
  })().catch((e) => { console.error("RevenueCat configure failed", e); return false; });
  return configured;
}

const hasPro = (info: CustomerInfo) => Object.keys(info.entitlements.active).length > 0;

/** True when Pro was bought. A production web build stays locked. */
export async function isPro(): Promise<boolean> {
  if (DEV_UNLOCK) return true;
  if (DEV_BROWSER) return devPro();
  if (!isNative()) return false;
  if (!(await initPurchases())) return false;
  try { return hasPro((await Purchases.getCustomerInfo()).customerInfo); } catch { return false; }
}

/** Calls back whenever the purchase status changes (purchase, restore, refund). */
export async function onProChange(cb: (pro: boolean) => void): Promise<void> {
  if (!(await initPurchases())) return;
  await Purchases.addCustomerInfoUpdateListener((info) => cb(DEV_UNLOCK || hasPro(info)));
}

export interface Product { pkg: PurchasesPackage; price: string }

/** The Pro package from the current offering (the Lifetime package, or the first one). null if the store has nothing yet. */
export async function getProduct(): Promise<Product | null> {
  if (DEV_BROWSER) return { pkg: { product: { title: "Allout Timer Pro" } } as unknown as PurchasesPackage, price: "$4.99" };
  if (!(await initPurchases())) return null;
  const current = (await Purchases.getOfferings()).current;
  const pkg = current?.availablePackages.find((p) => p.packageType === PACKAGE_TYPE.LIFETIME) ?? current?.availablePackages[0];
  return pkg ? { pkg, price: pkg.product.priceString } : null;
}

/** Buys Pro. Resolves true when Pro is active, false if the user cancelled. */
export async function buy(product: Product): Promise<boolean> {
  if (DEV_BROWSER) { try { localStorage.setItem(DEV_KEY, "1"); } catch { /* ignore */ } return true; }
  try {
    const r = await Purchases.purchasePackage({ aPackage: product.pkg });
    return hasPro(r.customerInfo);
  } catch (e) {
    if ((e as { userCancelled?: boolean }).userCancelled) return false;
    throw e;
  }
}

export async function restore(): Promise<boolean> {
  if (DEV_BROWSER) return devPro();
  if (!(await initPurchases())) return false;
  return hasPro((await Purchases.restorePurchases()).customerInfo);
}
