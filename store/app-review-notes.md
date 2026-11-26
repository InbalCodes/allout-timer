# Allout Timer — App Review notes (App Store Connect → App Review Information → Notes)

Paste everything below the line into the Notes field when submitting 1.0. It answers up front the questions Apple asked our other apps under Guideline 2.1, explains the background audio mode, and says what is different about this app (Guideline 4.3).

---

Thank you for reviewing Allout Timer.

1. PURPOSE AND AUDIENCE
Allout Timer is an interval timer for people who train with their own music: runners, HIIT and Tabata, strength sets. It plays short beeps and a spoken cue ("Work", "Rest", "Round 2 of 4") on top of whatever the user is already listening to. It never pauses, skips or replaces the user's music.

2. WHAT IS DIFFERENT ABOUT THIS APP
- Cues mix with the user's music. The user chooses in Settings whether the music is lowered for a moment during a cue, or left untouched.
- Workouts are built from blocks, and repeats can be placed inside repeats (for example 3 sets of 4 × (1 min hard + 1 min easy) with a longer rest between sets). The editor shows this nesting directly.
- Steps can be by time or by reps. A rep step waits for the user to tap Done, or the voice counts the reps at a pace the user sets.
- No subscription. The free version is fully usable with no ads; Pro is a single non-consumable purchase.
- No account, no ads, no analytics or tracking. Workouts are stored only on the device.
The app was designed and written by us from scratch. The workout engine is native Swift (AVAudioEngine and AVSpeechSynthesizer).

3. HOW TO USE / TEST
- No login is needed.
- The home screen is the workout editor. Tap a template at the bottom (for example "Tabata"), or use "+ Step" and "+ Repeat" to build one.
- Start music in any app (Apple Music, a podcast), return to Allout Timer and tap Start. You will hear 3-2-1 beeps and a voice at each change of step, over the music.
- Lock the iPhone during the workout: the cues keep arriving on time.
- Settings (gear icon): "Lower it for a moment" / "Leave it alone, play on top", voice on/off, beeps on/off, keep the screen on.
- Free use: one workout of up to 4 steps with one level of repeats, as often as you like.
- Paid feature: Allout Pro (allout_pro), a one-time non-consumable purchase. It unlocks saving any number of workouts, repeats inside repeats, and an unlimited number of steps. To see it: tap "+ Repeat" inside an existing repeat, or add a fifth step, or open Settings → "Get Pro". "Restore purchase" is on the same screen.

4. BACKGROUND AUDIO (UIBackgroundModes: audio)
The app's core function is audible workout cues while the iPhone is locked or in a pocket. The audio session is active only while a workout the user started is running, and it is released as soon as the workout ends or is stopped. Nothing plays and nothing runs in the background when no workout is running. The session uses the playback category with the mixWithOthers option, so other apps' audio is never interrupted.

5. EXTERNAL SERVICES
- Apple In-App Purchase (StoreKit) for the one-time purchase.
- RevenueCat, to check whether Pro was bought and to restore it. It receives only a random app user ID and the purchase history; no name or email.
- Firebase Crashlytics (Google), for crash reports only. A report holds the device model, iOS version, app version, the stack trace and the same random app user ID; no name, email or content. It is not used for analytics or tracking.
No analytics, advertising, login or social services are used. The app does not use the microphone, camera, location, Health or contacts.

6. REGIONS
The app works the same in all regions. Only the price differs by country, according to App Store pricing. The interface is available in English, French, German, Italian, Japanese, Korean, Portuguese (Brazil) and Spanish.

7. REGULATED INDUSTRY / THIRD-PARTY MATERIAL
Not applicable. The app gives no medical or health advice and contains no third-party content. It does not play, control or access the user's music; it only plays its own cues alongside it.

8. ACCOUNTS
There are no accounts, no login and no user-generated content shared with others, so there are no registration, deletion, reporting or blocking flows.

Contact: uniqops.office@gmail.com
