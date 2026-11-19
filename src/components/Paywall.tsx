// Paywall for the one-time Pro purchase. Shown only when a free user reaches for a Pro feature; never on open.
// The price comes from Google Play through RevenueCat; nothing is hard-coded.
import { useEffect, useState } from "preact/hooks";
import { t } from "../i18n";
import { getProduct, buy, restore, type Product } from "../lib/purchases";

export const SITE = "https://allout-timer.netlify.app";
export const LEGAL = { terms: `${SITE}/terms/`, privacy: `${SITE}/privacy/` };

interface Props { reason?: string; onUnlocked: () => void; onClose: () => void }

export function Paywall({ reason, onUnlocked, onClose }: Props) {
  const [product, setProduct] = useState<Product | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { getProduct().then(setProduct).catch(() => setProduct(null)); }, []);

  async function purchase() {
    if (!product) return;
    setBusy(true); setMsg("");
    try { if (await buy(product)) onUnlocked(); }
    catch { setMsg(t("purchaseFailed")); }
    finally { setBusy(false); }
  }

  async function doRestore() {
    setBusy(true); setMsg("");
    try { if (await restore()) onUnlocked(); else setMsg(t("nothingToRestore")); }
    catch { setMsg(t("purchaseFailed")); }
    finally { setBusy(false); }
  }

  return (
    <section class="paywall">
      <button type="button" class="ghost close" onClick={onClose} aria-label={t("notNow")}>✕</button>
      {reason && <p class="reason">{reason}</p>}
      <h2>{t("paywallTitle")}</h2>
      <p class="sub">{t("paywallSub")}</p>
      <ul class="benefits">
        <li>{t("benefit1")}</li>
        <li>{t("benefit2")}</li>
        <li>{t("benefit3")}</li>
      </ul>

      {product === null && <p class="msg">{t("notAvailable")}</p>}
      {msg && <p class="msg">{msg}</p>}
      <button type="button" class="cta" disabled={!product || busy} onClick={purchase}>
        {busy ? "…" : product ? t("buyFor", { price: product.price }) : "…"}
      </button>
      {product && <p class="fine">{t("oneTime", { price: product.price })}</p>}
      <div class="links">
        <button type="button" class="ghost" disabled={busy} onClick={doRestore}>{t("restore")}</button>
        <button type="button" class="ghost" onClick={onClose}>{t("notNow")}</button>
      </div>
      <div class="links legal">
        <a href={LEGAL.terms} target="_blank" rel="noopener">{t("terms")}</a>
        <a href={LEGAL.privacy} target="_blank" rel="noopener">{t("privacy")}</a>
      </div>
    </section>
  );
}
