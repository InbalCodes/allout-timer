package com.uniqops.allout;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Log;

import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Locale;

/**
 * Runs a whole interval workout natively, so it survives a dark screen and never stops the user's music.
 * The web side hands over a flat list of steps (already localized); everything from "Start" on happens here.
 *
 * - Clock: SystemClock.elapsedRealtime(). The next step starts at the planned time rather than "now", so
 *   lateness never adds up, and the handler sleeps until the exact moment of the next cue.
 * - Sound: beeps are generated PCM on an AudioTrack, voice is the device's TextToSpeech. Both use
 *   USAGE_ASSISTANCE_NAVIGATION_GUIDANCE, which mixes with media instead of replacing it.
 * - Music: in "duck" mode we hold AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK only around a cue, so the player lowers
 *   its volume and comes back. Otherwise we never ask for focus and simply play on top.
 * - Notification: channel importance must be DEFAULT (made silent by hand). LOW is hidden on the lock screen,
 *   and the lock screen is where "Done" gets tapped between sets.
 */
public class IntervalService extends Service {

    static final String ACTION_START = "com.uniqops.allout.START";
    static final String ACTION_STOP = "com.uniqops.allout.STOP";
    static final String ACTION_NEXT = "com.uniqops.allout.NEXT";
    static final String ACTION_PAUSE = "com.uniqops.allout.PAUSE";

    static volatile IntervalService instance;
    static volatile JSObject lastSummary;

    private static final String TAG = "Interval";
    private static final String CHANNEL = "workout_v2";
    private static final int NOTIF_ID = 1;

    private HandlerThread thread;
    private Handler h;
    private PowerManager.WakeLock wake;
    private AudioManager am;
    private AudioAttributes attrs;
    private AudioFocusRequest focusReq;
    private boolean hasFocus;
    private AudioTrack shortBeep, longBeep;
    private TextToSpeech tts;
    private volatile boolean ttsReady;
    private String pendingSpeech;
    private int utterance;

    // The workout, as handed over by the web side.
    private String[] labels, says;
    private int[] secs, countN, countEvery;
    private boolean duck, voice, beeps;
    private String lang = "en";
    private String txDone = "Done", txSkip = "Skip", txStop = "Stop", txPause = "Pause", txResume = "Resume",
            txPaused = "Paused", txComplete = "Workout complete", txTapDone = "Tap Done when finished";

    private volatile boolean running, paused;
    private volatile int index;
    private volatile long stepStart, pausedAt;
    private int countdownNext, countNext;
    private int shownSecond = Integer.MIN_VALUE;
    private long workoutStart;

    private volatile int cues;
    private volatile long maxLate, sumLate;

    private final Runnable tick = this::tick;
    private final Runnable releaseFocus = this::releaseFocus;

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        thread = new HandlerThread("interval-clock");
        thread.start();
        h = new Handler(thread.getLooper());
        am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build();
        focusReq = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                .setAudioAttributes(attrs)
                .setOnAudioFocusChangeListener(change -> { }, h)
                .build();
        shortBeep = tone(880, 140);
        longBeep = tone(1320, 450);
        tts = new TextToSpeech(this, status -> h.post(() -> {
            if (status != TextToSpeech.SUCCESS || tts == null) { Log.w(TAG, "tts init failed " + status); return; }
            tts.setAudioAttributes(attrs);
            applyLanguage();
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) { }
                @Override public void onDone(String id) { h.post(() -> holdFocus(300)); }
                @Override public void onError(String id) { h.post(() -> holdFocus(300)); }
            });
            ttsReady = true;
            if (pendingSpeech != null) { String s = pendingSpeech; pendingSpeech = null; speak(s); }
        }));
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Workout in progress", NotificationManager.IMPORTANCE_DEFAULT);
        ch.setSound(null, null);
        ch.enableVibration(false);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        getSystemService(NotificationManager.class).createNotificationChannel(ch);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_START.equals(action)) {
            // Must reach startForeground quickly after startForegroundService.
            startForeground(NOTIF_ID, notification("…", ""), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            final String config = intent.getStringExtra("config");
            h.post(() -> begin(config));
        } else if (ACTION_NEXT.equals(action)) {
            h.post(() -> { if (running) { resume(); advance(SystemClock.elapsedRealtime(), -1); reschedule(); } });
        } else if (ACTION_PAUSE.equals(action)) {
            h.post(() -> { if (paused) resume(); else pause(); });
        } else if (ACTION_STOP.equals(action)) {
            h.post(() -> finish(false));
        } else if (!running) {
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    // ---- workout clock (all on the handler thread) ----

    private void begin(String config) {
        try {
            JSONObject c = new JSONObject(config);
            JSONArray a = c.getJSONArray("steps");
            int n = a.length();
            if (n == 0) throw new IllegalArgumentException("no steps");
            labels = new String[n]; says = new String[n]; secs = new int[n]; countN = new int[n]; countEvery = new int[n];
            for (int i = 0; i < n; i++) {
                JSONObject o = a.getJSONObject(i);
                labels[i] = o.optString("label", "");
                says[i] = o.optString("say", labels[i]);
                secs[i] = Math.max(0, o.optInt("seconds", 0));
                countN[i] = Math.max(0, o.optInt("count", 0));
                countEvery[i] = Math.max(0, o.optInt("every", 0));
            }
            duck = c.optBoolean("duck", true);
            voice = c.optBoolean("voice", true);
            beeps = c.optBoolean("beeps", true);
            lang = c.optString("lang", "en");
            JSONObject t = c.optJSONObject("texts");
            if (t != null) {
                txDone = t.optString("done", txDone); txSkip = t.optString("skip", txSkip); txStop = t.optString("stop", txStop);
                txPause = t.optString("pause", txPause); txResume = t.optString("resume", txResume);
                txPaused = t.optString("paused", txPaused); txComplete = t.optString("complete", txComplete);
                txTapDone = t.optString("tapDone", txTapDone);
            }
        } catch (Exception e) {
            Log.e(TAG, "bad workout", e);
            finish(false);
            return;
        }
        if (ttsReady) applyLanguage();
        if (wake == null) {
            wake = ((PowerManager) getSystemService(Context.POWER_SERVICE))
                    .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "allout:workout");
            wake.setReferenceCounted(false);
        }
        wake.acquire(6 * 60 * 60 * 1000L);
        lastSummary = null;
        cues = 0; maxLate = 0; sumLate = 0;
        paused = false;
        running = true;
        workoutStart = SystemClock.elapsedRealtime();
        index = -1;
        advance(workoutStart, -1);
        reschedule();
    }

    private void applyLanguage() {
        try { tts.setLanguage(Locale.forLanguageTag(lang)); } catch (Exception e) { Log.w(TAG, "tts language " + lang, e); }
    }

    private boolean counted() { return countN[index] > 0 && countEvery[index] > 0; }

    private void tick() {
        if (!running || paused) return;
        long now = SystemClock.elapsedRealtime();
        int d = secs[index];
        if (d > 0) {
            long total = d * 1000L, el = now - stepStart;
            if (counted()) {
                // Paced reps: say each number as its rep ends. The step's own end cue stands in for the last one.
                while (countNext < countN[index] && el >= countNext * countEvery[index] * 1000L) {
                    long due = countNext * countEvery[index] * 1000L;
                    if (el - due < 900) { record("count " + countNext, el - due); takeFocus(); speak(String.valueOf(countNext)); holdFocus(1500); }
                    countNext++;
                }
            } else {
                // 3-2-1 before the boundary. Catches up in order if we woke late.
                while (countdownNext >= 1 && el >= total - countdownNext * 1000L) {
                    long due = total - countdownNext * 1000L;
                    if (beeps && d >= 5 && el - due < 900) {
                        if (countdownNext == 3) takeFocus();
                        record("beep " + countdownNext, el - due);
                        play(shortBeep);
                        holdFocus(2500);
                    }
                    countdownNext--;
                }
            }
            if (el >= total) advance(stepStart + total, el - total);
        }
        reschedule();
    }

    /** Sleep until the next cue or the next whole second on the notification, whichever comes first. */
    private void reschedule() {
        h.removeCallbacks(tick);
        if (!running || paused) return;
        long now = SystemClock.elapsedRealtime();
        int d = secs[index];
        int remaining = d > 0 ? (int) Math.ceil((d * 1000L - (now - stepStart)) / 1000.0) : -1;
        if (remaining != shownSecond) { shownSecond = remaining; notifyStep(); }
        if (d == 0) return; // manual step: nothing to wait for but "Done"
        long total = d * 1000L, el = now - stepStart;
        long next = total;
        if (counted()) {
            if (countNext < countN[index]) next = Math.min(next, countNext * countEvery[index] * 1000L);
        } else if (countdownNext >= 1) {
            next = Math.min(next, total - countdownNext * 1000L);
        }
        long nextSecond = total - (remaining - 1) * 1000L;
        next = Math.min(next, nextSecond);
        h.postDelayed(tick, Math.max(1, next - el));
    }

    /** Move to the next step, which starts at plannedStart (not "now"), so being late never adds up. */
    private void advance(long plannedStart, long late) {
        index++;
        if (index >= secs.length) {
            if (late >= 0) record("end", late);
            index = secs.length - 1;
            running = false;
            takeFocus();
            play(longBeep);
            sayLater(txComplete);
            h.removeCallbacks(tick);
            h.postDelayed(() -> finish(true), 4500);
            return;
        }
        stepStart = plannedStart;
        countdownNext = 3;
        countNext = 1;
        shownSecond = Integer.MIN_VALUE;
        if (late >= 0) record("start " + labels[index], late);
        takeFocus();
        play(longBeep);
        sayLater(says[index]);
    }

    private void pause() {
        if (!running || paused) return;
        paused = true;
        pausedAt = SystemClock.elapsedRealtime();
        h.removeCallbacks(tick);
        if (tts != null) tts.stop();
        releaseFocus();
        notifyStep();
    }

    private void resume() {
        if (!running || !paused) return;
        stepStart += SystemClock.elapsedRealtime() - pausedAt;
        paused = false;
        shownSecond = Integer.MIN_VALUE;
        reschedule();
    }

    private void record(String what, long lateMs) {
        cues++;
        sumLate += lateMs;
        if (lateMs > maxLate) maxLate = lateMs;
        Log.i(TAG, what + " late=" + lateMs + "ms t=" + (SystemClock.elapsedRealtime() - workoutStart) / 1000 + "s");
    }

    private void finish(boolean completed) {
        running = false;
        paused = false;
        h.removeCallbacksAndMessages(null);
        releaseFocus();
        JSObject s = new JSObject();
        s.put("completed", completed);
        s.put("cues", cues);
        s.put("maxLateMs", maxLate);
        s.put("avgLateMs", cues > 0 ? sumLate / cues : 0);
        s.put("seconds", (SystemClock.elapsedRealtime() - workoutStart) / 1000);
        lastSummary = s;
        Log.i(TAG, "summary " + s);
        if (wake != null && wake.isHeld()) wake.release();
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    // ---- sound ----

    private AudioTrack tone(double hz, int ms) {
        int sr = 44100, n = sr * ms / 1000, ramp = sr / 200;
        short[] buf = new short[n];
        for (int i = 0; i < n; i++) {
            double env = Math.min(1.0, Math.min(i, n - 1 - i) / (double) ramp);
            buf[i] = (short) (Math.sin(2 * Math.PI * hz * i / sr) * env * 0.8 * Short.MAX_VALUE);
        }
        AudioTrack t = new AudioTrack.Builder()
                .setAudioAttributes(attrs)
                .setAudioFormat(new AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(sr)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build())
                .setTransferMode(AudioTrack.MODE_STATIC)
                .setBufferSizeInBytes(n * 2)
                .build();
        t.write(buf, 0, n);
        return t;
    }

    private void play(AudioTrack t) {
        try {
            if (t.getPlayState() != AudioTrack.PLAYSTATE_STOPPED) t.stop();
            t.reloadStaticData();
            t.play();
        } catch (IllegalStateException e) {
            Log.w(TAG, "beep failed", e);
        }
    }

    /** Voice follows the long beep instead of talking over it. */
    private void sayLater(String text) {
        if (!voice || text.isEmpty()) { holdFocus(900); return; }
        holdFocus(8000);
        h.postDelayed(() -> speak(text), 500);
    }

    private void speak(String text) {
        if (!voice) return;
        if (!ttsReady) { pendingSpeech = text; return; }
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "u" + (++utterance));
    }

    private void takeFocus() {
        if (!duck || hasFocus) return;
        hasFocus = am.requestAudioFocus(focusReq) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }

    /** Give the music back ms from now (later calls replace earlier ones). */
    private void holdFocus(long ms) {
        h.removeCallbacks(releaseFocus);
        h.postDelayed(releaseFocus, ms);
    }

    private void releaseFocus() {
        h.removeCallbacks(releaseFocus);
        if (hasFocus) { am.abandonAudioFocusRequest(focusReq); hasFocus = false; }
    }

    // ---- notification ----

    private void notifyStep() {
        if (labels == null || index < 0) return;
        int d = secs[index];
        String title = labels[index] + "  (" + (index + 1) + "/" + labels.length + ")";
        String text;
        if (paused) text = txPaused;
        else if (d == 0) text = txTapDone;
        else text = clock((int) Math.ceil(Math.max(0, d * 1000L - (SystemClock.elapsedRealtime() - stepStart)) / 1000.0));
        getSystemService(NotificationManager.class).notify(NOTIF_ID, notification(title, text));
    }

    private PendingIntent action(int code, String action) {
        return PendingIntent.getService(this, code, new Intent(this, IntervalService.class).setAction(action),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private Notification notification(String title, String text) {
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        boolean manual = running && secs != null && index >= 0 && secs[index] == 0;
        Notification.Builder b = new Notification.Builder(this, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle(title)
                .setContentText(text)
                .setContentIntent(open)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setCategory(Notification.CATEGORY_WORKOUT)
                .setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        // The button you need mid-set comes first: "Done" on a manual step, otherwise pause.
        if (manual) b.addAction(new Notification.Action.Builder(null, txDone, action(1, ACTION_NEXT)).build());
        b.addAction(new Notification.Action.Builder(null, paused ? txResume : txPause, action(3, ACTION_PAUSE)).build());
        if (!manual) b.addAction(new Notification.Action.Builder(null, txSkip, action(1, ACTION_NEXT)).build());
        b.addAction(new Notification.Action.Builder(null, txStop, action(2, ACTION_STOP)).build());
        return b.build();
    }

    private static String clock(int s) {
        return (s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
    }

    // ---- for the web side ----

    JSObject status() {
        JSObject r = new JSObject();
        boolean run = running && secs != null && index >= 0;
        r.put("running", run);
        if (run) {
            int i = index;
            long ref = paused ? pausedAt : SystemClock.elapsedRealtime();
            r.put("index", i);
            r.put("paused", paused);
            r.put("remaining", secs[i] > 0 ? Math.max(0, secs[i] - (ref - stepStart) / 1000.0) : -1);
        }
        return r;
    }

    @Override
    public void onDestroy() {
        running = false;
        instance = null;
        if (h != null) h.removeCallbacksAndMessages(null);
        if (hasFocus) { am.abandonAudioFocusRequest(focusReq); hasFocus = false; }
        if (tts != null) { tts.stop(); tts.shutdown(); tts = null; }
        if (shortBeep != null) shortBeep.release();
        if (longBeep != null) longBeep.release();
        if (wake != null && wake.isHeld()) wake.release();
        if (thread != null) thread.quitSafely();
        super.onDestroy();
    }
}
