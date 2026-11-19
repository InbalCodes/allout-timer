package com.uniqops.allout;

import android.content.Context;
import android.content.Intent;
import android.view.WindowManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Thin bridge: the web side hands over a flat, already-localized list of steps; IntervalService does the rest. */
@CapacitorPlugin(name = "Interval")
public class IntervalPlugin extends Plugin {

    /**
     * { steps: [{ label, say, seconds, count?, every? }], duck, voice, beeps, lang, texts }.
     * seconds 0 = wait for next(). count/every = say 1..count, one number every `every` seconds.
     */
    @PluginMethod
    public void start(PluginCall call) {
        JSArray steps = call.getArray("steps");
        if (steps == null || steps.length() == 0) { call.reject("steps required"); return; }
        Context c = getContext();
        Intent i = new Intent(c, IntervalService.class).setAction(IntervalService.ACTION_START);
        i.putExtra("config", call.getData().toString());
        c.startForegroundService(i);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) { send(IntervalService.ACTION_STOP); call.resolve(); }

    @PluginMethod
    public void next(PluginCall call) { send(IntervalService.ACTION_NEXT); call.resolve(); }

    /** Toggles pause. */
    @PluginMethod
    public void pause(PluginCall call) { send(IntervalService.ACTION_PAUSE); call.resolve(); }

    /** { running, index, paused, remaining } while a workout runs; { running: false, summary? } otherwise. */
    @PluginMethod
    public void status(PluginCall call) {
        IntervalService s = IntervalService.instance;
        JSObject r = s != null ? s.status() : new JSObject();
        if (!r.optBoolean("running", false)) {
            r.put("running", false);
            if (IntervalService.lastSummary != null) r.put("summary", IntervalService.lastSummary);
        }
        call.resolve(r);
    }

    @PluginMethod
    public void keepAwake(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", true));
        if (getActivity() == null) { call.resolve(); return; }
        getActivity().runOnUiThread(() -> {
            if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            call.resolve();
        });
    }

    private void send(String action) {
        if (IntervalService.instance == null) return;
        Context c = getContext();
        c.startService(new Intent(c, IntervalService.class).setAction(action));
    }
}
