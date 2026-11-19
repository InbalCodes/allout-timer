# Allout Timer: מה למלא ב-Play Console (App content)

כתובות האתר (חשבון Uniqops ב-Netlify, שם האתר `allout-timer`; אם השם תפוס צריך לעדכן גם ב-`src/components/Paywall.tsx`):
- מדיניות פרטיות: https://allout-timer.netlify.app/privacy/
- תנאי שימוש: https://allout-timer.netlify.app/terms/
- מחיקת נתונים: https://allout-timer.netlify.app/delete/

> הטקסטים המשפטיים הם טיוטה סבירה, לא ייעוץ משפטי.

**כמו Dripless:** אין שרת, אין חשבון, אין קבצים. נאסף רק מה ש-RevenueCat צריך בשביל רכישת ה-Pro.
**שונה מ-Dripless:** יש שירות שרץ ברקע (foreground service) והרשאת התראות. זה דורש הצהרה נוספת (למטה), ועליה יש סיכון.

## Privacy policy
להדביק את כתובת מדיניות הפרטיות.

## Ads
**No**

## App access
**All functionality is available without special access.** אין התחברות. החינמי: אימון אחד עד 4 שלבים ורמת חזרה אחת; Pro (רכישה חד-פעמית): שמירת אימונים, חזרות בתוך חזרות, שלבים ללא הגבלה.

## Content rating
שאלון IARC: קטגוריה **Utility, Productivity, Communication, or Other** (או Reference/Health אם מוצע). בכל השאלות **No**.

## Target audience
**13 and over** (לסמן 13–15, 16–17 ו-18+). לא מתחת ל-13 (Families + RevenueCat).

## Data safety
- **Collects or shares required user data?** Yes (בגלל RevenueCat)
- **Encrypted in transit?** Yes
- **Way to request deletion?** Yes, עמוד `/delete/`

| קטגוריה | סוג | Collected | Shared | Ephemeral | חובה/אופציונלי | מטרה |
|---|---|---|---|---|---|---|
| Financial info | **Purchase history** | Yes | No (ספק שירות) | No | Required | App functionality |
| App info and performance | **Diagnostics** (גרסה, מכשיר, מערכת הפעלה) | Yes | No | No | Required | App functionality |
| Device or other IDs | **Device or other IDs** (מזהה אקראי של ההתקנה) | Yes | No | No | Required | App functionality |

**לא נאספים:** מיקום, אנשי קשר, אודיו (אין מיקרופון), בריאות וכושר (האימונים נשמרים רק בטלפון ולא נשלחים), פעילות באפליקציה (אין analytics).
כש-Crashlytics יתווסף: להוסיף **Crash logs** לפי `infra/CRASH-REPORTING.md`.

## Health apps
Play שואל אם יש באפליקציה תכונות בריאות. **ההערכה שלי (לא בדקתי מול הטופס העדכני):** לסמן **Activity and fitness** בלבד (טיימר אימונים), בלי שום תכונה רפואית. אם הטופס מציע "None", זה לא מדויק לאפליקציית כושר.

## Foreground service permissions (חשוב)
האפליקציה מצהירה על `FOREGROUND_SERVICE_MEDIA_PLAYBACK`. Play דורש הצהרה עם **תיאור + קישור לסרטון** שמראה את השימוש.
- **Task:** Media playback
- **תיאור מוצע:** "During a workout the app plays timed audio cues (beeps and spoken announcements) through the phone's audio output while the screen is off and the user's own music app keeps playing. The service starts only when the user taps Start, shows an ongoing notification with Done, Pause, Skip and Stop, and ends when the workout finishes or the user stops it."
- **סרטון:** הקלטת מסך קצרה (30–60 שניות): לוחצים Start, מכבים מסך, שומעים צפצוף מעל Spotify, ההתראה במסך הנעילה. מעלים ל-YouTube כ-Unlisted ומדביקים קישור.
- **סיכון:** Google עלולה לטעון ש-"mediaPlayback" מיועד לנגני מוזיקה/וידאו. אם ידחו, החלופה היא `specialUse` עם הסבר; זה שינוי קוד קטן אצלי, ואז שולחים שוב.

## Government apps / Financial features / News
**No** לכולם.

## Advertising ID
**No**

## לבדוק לפני production
- [ ] רשימת ההרשאות ב-AAB: INTERNET, FOREGROUND_SERVICE, FOREGROUND_SERVICE_MEDIA_PLAYBACK, POST_NOTIFICATIONS, WAKE_LOCK, BILLING (ובלי AD_ID / RECORD_AUDIO)
- [ ] מעבר על הנוסחים המשפטיים
