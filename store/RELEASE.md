# Allout Timer: העלאה ל-Google Play ו-RevenueCat (גרסה 0.1.0)

אותו תהליך כמו Dripless: **אין שרת** (רק אתר סטטי + התראות מכירה), ו-**Pro הוא מוצר חד-פעמי** (In-app product), לא מנוי.
הבדל אחד חשוב: לאפליקציה יש **שירות שרץ ברקע** (foreground service), ולכן Play דורש הצהרה עם סרטון (שלב 2).

> המפתחות והסיסמאות את מכניסה בעצמך. אני לא מקליד מפתחות.

## 0. לפני הכול: ריפו ואתר (פעם אחת)
1. **GitHub:** ליצור ריפו פרטי `InbalCodes/allout-timer`. אחר כך תגידי לי ואני אעשה init, commit ו-push מהתיקייה `apps/interval-timer`
2. **Netlify** (חשבון Uniqops): Add new site → Import from GitHub → `allout-timer` → שם האתר `allout-timer` (הכתובת `https://allout-timer.netlify.app` כתובה באפליקציה, במסך ה-Pro ובהגדרות). **אם השם תפוס, תגידי לי:** אני מעדכן את הכתובת בקוד ובונה AAB חדש לפני ההעלאה. Build settings נקראים מ-`netlify.toml`
3. **התראות מכירה** (`infra/SALES-ALERTS.md`): ב-Netlify → Environment variables: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (כמו בשאר האפליקציות) ו-`REVENUECAT_WEBHOOK_AUTH` (מחרוזת חדשה, שונה מהאפליקציות האחרות)

## 1. יצירת האפליקציה (Play Console → Create app)
- **App name:** `Allout Timer: Interval & HIIT`
- **Default language:** English (United States)
- **App or game:** App · **Free or paid:** Free
- לאשר את ההצהרות

## 2. App content (Policy → App content)
הכול כתוב ב-`store/play-console-forms.md`, כולל **Foreground service permissions**: צריך סרטון קצר (הקלטת מסך של אימון שרץ מעל Spotify עם מסך כבוי), מועלה ל-YouTube כ-Unlisted. זה הדבר היחיד שאני לא יכול להכין לבד.

## 3. דף החנות (Grow → Store presence → Main store listing)
- **טקסטים:** `store/listings.md`, 8 שפות (en-US ברירת מחדל, השאר ב-Translations בסדר: fr-FR, de-DE, it-IT, ja-JP, ko-KR, pt-BR, es-419)
- **App icon:** `store/graphics/store-icon-512.png`
- **Feature graphic:** `store/graphics/store-feature-1024x500.png`
- **Phone screenshots:** `store/screenshots/<lang>/1.png` עד `5.png`, לכל שפה בנפרד (`pt` = pt-BR, `es` = es-419)
- **Category:** Health & Fitness
- **Contact email:** uniqops.office@gmail.com
- **Website:** https://allout-timer.netlify.app

## 4. מפתח העלאה ו-AAB
**נעשה 19.11:** מפתח ההעלאה ב-`NEVER_DELETE_APP_BUNDLE_KEY/AlloutTimer/allout-upload.jks` (+ `password.txt`, alias `allout-upload`, SHA-256 3A:B9:D8:1B…19:9E:3C:CA). ה-AAB החתום: `release/allout-timer-0.1.0-1.aab` (6 MB, versionCode 1, **בלי מפתח RevenueCat**: מסך ה-Pro יציג "Purchases aren't available"). **לא למחוק ולא לשתף את המפתח.**

## 5. העלאת ה-AAB (Testing → Internal testing)
1. **Testers:** אותה רשימה כמו בשאר האפליקציות
2. **Create new release** → להעלות את ה-AAB. אם Play שואל על **Play App Signing**: לאשר
3. **Release notes:** להדביק מ-`store/release-notes.md` (8 שפות בבת אחת)
4. **Review release** → **Start rollout to Internal testing**

## 6. מוצר Pro (Monetize → Products → In-app products)
**לא Subscriptions!** מוצר חד-פעמי.
- **Product ID:** `allout_pro`
- **Name:** `Allout Timer Pro` · **Description:** `Saved workouts, repeats inside repeats and unlimited steps. One-time purchase.`
- **Price:** 4.99$ (הצעה, עדיין פתוח) → Set prices → לעדכן את כל המדינות לפי ה-USD
- **Activate**

## 7. RevenueCat (app.revenuecat.com)
1. **Create new project** בשם `Allout Timer`
2. **Apps → + New → Google Play Store**, Package: `com.uniqops.allout`
3. **לפני העלאת ה-JSON:** ב-Play Console → Users and permissions → `revenuecat@clearcut-billing.iam.gserviceaccount.com` → להוסיף את Allout Timer עם 4 ההרשאות (View app information, View app quality, View financial data, Manage orders and subscriptions). בלי זה RevenueCat דוחה את הקובץ, כמו שקרה ב-Dripless. אחר כך להעלות את אותו קובץ JSON
4. **Product catalog → Products → Import** את `allout_pro`
5. **Entitlements → + New:** `allout_pro` ("Allout Timer Pro"), ולצרף אליו את המוצר
6. **Offerings:** offering בשם `default` (Current), עם חבילה אחת: **Lifetime** ← `allout_pro`
7. **API keys → Public app-specific key** (מתחיל ב-`goog_`): לקובץ `apps/interval-timer/.env` שורה `VITE_REVENUECAT_ANDROID_KEY=goog_...`
8. **Integrations → Webhooks → Add:** URL `https://allout-timer.netlify.app/api/rc-webhook`, Authorization header = ה-`REVENUECAT_WEBHOOK_AUTH` משלב 0, ואז **Send test event** → אמורה להגיע הודעה בטלגרם

## 8. אחרי שלב 7: תגידי לי
אני בונה AAB חדש עם מפתח RevenueCat (versionCode 2), ואת מעלה אותו ל-Internal testing, מתקינה מ-Play (לא מה-APK של הדיבאג: חתימה שונה, צריך להסיר אותו קודם) ובודקת רכישת Pro עם חשבון License tester.

## 9. Production
כשהרכישה עובדת: Production → Create new release → אותו AAB → כל המדינות → Review → Start rollout.
