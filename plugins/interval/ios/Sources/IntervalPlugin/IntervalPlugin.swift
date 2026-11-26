import Foundation
import Capacitor
import UIKit

/// Thin bridge, same contract as android/.../IntervalPlugin.java: the web side hands over a flat,
/// already-localized list of steps; Workout does the rest. JS: registerPlugin("Interval") (src/lib/runner.ts).
@objc(IntervalPlugin)
public class IntervalPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "IntervalPlugin"
    public let jsName = "Interval"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "next", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "keepAwake", returnType: CAPPluginReturnPromise)
    ]

    private let workout = Workout()

    /// { steps: [{ label, say, seconds, count?, every? }], duck, voice, beeps, lang, texts }.
    /// seconds 0 = wait for next(). count/every = say 1..count, one number every `every` seconds.
    @objc func start(_ call: CAPPluginCall) {
        let raw = call.options["steps"] as? [[String: Any]] ?? []
        let steps: [Workout.Step] = raw.map { o in
            let label = o["label"] as? String ?? ""
            return Workout.Step(
                label: label,
                say: o["say"] as? String ?? label,
                seconds: max(0, (o["seconds"] as? NSNumber)?.intValue ?? 0),
                count: max(0, (o["count"] as? NSNumber)?.intValue ?? 0),
                every: max(0, (o["every"] as? NSNumber)?.intValue ?? 0))
        }
        if steps.isEmpty { call.reject("steps required"); return }
        let texts = call.options["texts"] as? [String: Any]
        let config = Workout.Config(
            steps: steps,
            duck: call.getBool("duck", true),
            voice: call.getBool("voice", true),
            beeps: call.getBool("beeps", true),
            lang: call.getString("lang", "en-US"),
            complete: texts?["complete"] as? String ?? "Workout complete")
        if let error = workout.begin(config) {
            call.reject("Could not start audio: \(error)")
        } else {
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) { workout.stop(); call.resolve() }

    @objc func next(_ call: CAPPluginCall) { workout.next(); call.resolve() }

    /// Toggles pause.
    @objc func pause(_ call: CAPPluginCall) { workout.togglePause(); call.resolve() }

    /// { running, index, paused, remaining } while a workout runs; { running: false, summary? } otherwise.
    @objc func status(_ call: CAPPluginCall) { call.resolve(workout.status()) }

    @objc func keepAwake(_ call: CAPPluginCall) {
        let on = call.getBool("on", true)
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = on
            call.resolve()
        }
    }
}
