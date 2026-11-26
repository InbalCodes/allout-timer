import Foundation
import AVFoundation

/// Runs a whole interval workout natively, so it survives a locked screen and never stops the user's music.
/// A port of android/.../IntervalService.java; keep the two in step.
///
/// - Clock: system uptime. The next step starts at the planned time rather than "now", so lateness never
///   adds up, and the queue sleeps until the exact moment of the next cue.
/// - Staying alive: the audio session is `.playback` + `.mixWithOthers`, and the engine plays a silent loop
///   for the whole workout. With the "audio" background mode (Info.plist) iOS keeps the app running while
///   the screen is locked, and the user's music app keeps playing.
/// - Sound: beeps are generated PCM on a player node, voice is AVSpeechSynthesizer (it uses our session).
/// - Music: in "duck" mode `.duckOthers` is added only around a cue, so the music dips and comes back.
///   Otherwise the cues simply play on top.
/// - The mute switch does not silence `.playback`, which is what a workout timer wants.
final class Workout: NSObject, AVSpeechSynthesizerDelegate {

    struct Step { let label: String; let say: String; let seconds: Int; let count: Int; let every: Int }
    struct Config { let steps: [Step]; let duck: Bool; let voice: Bool; let beeps: Bool; let lang: String; let complete: String }

    private let q = DispatchQueue(label: "com.uniqops.allout.clock", qos: .userInteractive)
    private let session = AVAudioSession.sharedInstance()
    private let engine = AVAudioEngine()
    private let beeper = AVAudioPlayerNode()
    private let keeper = AVAudioPlayerNode()
    private let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1)!
    private let synth = AVSpeechSynthesizer()
    private var shortBeep: AVAudioPCMBuffer!
    private var longBeep: AVAudioPCMBuffer!
    private var silence: AVAudioPCMBuffer!

    // Everything below is touched only on `q`.
    private var config = Config(steps: [], duck: true, voice: true, beeps: true, lang: "en-US", complete: "")
    private var running = false
    private var paused = false
    private var index = -1
    private var stepStart = 0, pausedAt = 0, workoutStart = 0
    private var countdownNext = 3, countNext = 1
    private var cues = 0, maxLate = 0, sumLate = 0
    private var lastSummary: [String: Any]?
    private var ducked = false
    private var generation = 0
    private var tickItem: DispatchWorkItem?
    private var releaseItem: DispatchWorkItem?
    private var current: AVSpeechUtterance?

    override init() {
        super.init()
        shortBeep = tone(880, 140)
        longBeep = tone(1320, 450)
        silence = tone(0, 1000)
        engine.attach(beeper)
        engine.attach(keeper)
        engine.connect(beeper, to: engine.mainMixerNode, format: format)
        engine.connect(keeper, to: engine.mainMixerNode, format: format)
        synth.delegate = self

        let nc = NotificationCenter.default
        // A phone call or an alarm takes the audio away: pause, and let the user resume.
        nc.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: nil) { [weak self] n in
            let raw = n.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt ?? 0
            let began = AVAudioSession.InterruptionType(rawValue: raw) == .began
            self?.q.async { self?.interrupted(began) }
        }
        // Headphones in or out, or a change of session options, can stop the engine. Start it again.
        nc.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil) { [weak self] _ in
            self?.q.async { self?.reviveEngine() }
        }
    }

    // ---- called by the plugin (any thread) ----

    /// Starts a workout. Returns an error text if the audio could not start, nil when all is well.
    func begin(_ c: Config) -> String? {
        return q.sync { () -> String? in
            generation += 1
            tickItem?.cancel()
            releaseItem?.cancel()
            config = c
            do {
                try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
                try session.setActive(true)
                ducked = false
                try ensureEngine()
            } catch {
                running = false
                return error.localizedDescription
            }
            lastSummary = nil
            cues = 0; maxLate = 0; sumLate = 0
            paused = false
            running = true
            workoutStart = now()
            index = -1
            advance(workoutStart, -1)
            reschedule()
            return nil
        }
    }

    func stop() { q.async { if self.running || self.index >= 0 { self.finish(false) } } }

    func next() {
        q.async {
            guard self.running else { return }
            self.resume()
            self.advance(self.now(), -1)
            self.reschedule()
        }
    }

    func togglePause() { q.async { if self.paused { self.resume() } else { self.pause() } } }

    func status() -> [String: Any] {
        return q.sync { () -> [String: Any] in
            guard running, index >= 0, index < config.steps.count else {
                var r: [String: Any] = ["running": false]
                if let s = lastSummary { r["summary"] = s }
                return r
            }
            let d = config.steps[index].seconds
            let ref = paused ? pausedAt : now()
            return [
                "running": true,
                "index": index,
                "paused": paused,
                "remaining": d > 0 ? max(0.0, Double(d) - Double(ref - stepStart) / 1000.0) : -1.0
            ]
        }
    }

    // ---- workout clock (all on q) ----

    /// Milliseconds on a clock that never jumps.
    private func now() -> Int { Int(ProcessInfo.processInfo.systemUptime * 1000) }

    private func counted() -> Bool { config.steps[index].count > 0 && config.steps[index].every > 0 }

    /// Runs `work` on q after `ms`, unless the workout was stopped or replaced in the meantime.
    private func after(_ ms: Int, _ work: @escaping () -> Void) {
        let g = generation
        q.asyncAfter(deadline: .now() + .milliseconds(ms)) { [weak self] in
            if let s = self, s.generation == g { work() }
        }
    }

    private func tick() {
        guard running, !paused else { return }
        let step = config.steps[index]
        let d = step.seconds
        if d > 0 {
            let total = d * 1000, el = now() - stepStart
            if counted() {
                // Paced reps: say each number as its rep ends. The step's own end cue stands in for the last one.
                while countNext < step.count && el >= countNext * step.every * 1000 {
                    let due = countNext * step.every * 1000
                    if el - due < 900 { record(el - due); takeFocus(); speak(String(countNext)); holdFocus(1500) }
                    countNext += 1
                }
            } else {
                // 3-2-1 before the boundary. Catches up in order if we woke late.
                while countdownNext >= 1 && el >= total - countdownNext * 1000 {
                    let due = total - countdownNext * 1000
                    if config.beeps && d >= 5 && el - due < 900 {
                        if countdownNext == 3 { takeFocus() }
                        record(el - due)
                        play(shortBeep)
                        holdFocus(2500)
                    }
                    countdownNext -= 1
                }
            }
            if el >= total { advance(stepStart + total, el - total) }
        }
        reschedule()
    }

    /// Sleep until the next cue.
    private func reschedule() {
        tickItem?.cancel()
        guard running, !paused else { return }
        let step = config.steps[index]
        let d = step.seconds
        if d == 0 { return } // manual step: nothing to wait for but "Done"
        let total = d * 1000, el = now() - stepStart
        var next = total
        if counted() {
            if countNext < step.count { next = min(next, countNext * step.every * 1000) }
        } else if countdownNext >= 1 {
            next = min(next, total - countdownNext * 1000)
        }
        let item = DispatchWorkItem { [weak self] in self?.tick() }
        tickItem = item
        q.asyncAfter(deadline: .now() + .milliseconds(max(1, next - el)), execute: item)
    }

    /// Move to the next step, which starts at plannedStart (not "now"), so being late never adds up.
    private func advance(_ plannedStart: Int, _ late: Int) {
        index += 1
        if index >= config.steps.count {
            if late >= 0 { record(late) }
            index = config.steps.count - 1
            running = false
            tickItem?.cancel()
            takeFocus()
            play(longBeep)
            sayLater(config.complete)
            after(4500) { self.finish(true) }
            return
        }
        stepStart = plannedStart
        countdownNext = 3
        countNext = 1
        if late >= 0 { record(late) }
        takeFocus()
        play(longBeep)
        sayLater(config.steps[index].say)
    }

    private func pause() {
        guard running, !paused else { return }
        paused = true
        pausedAt = now()
        tickItem?.cancel()
        stopSpeaking()
        releaseFocus()
    }

    private func resume() {
        guard running, paused else { return }
        stepStart += now() - pausedAt
        paused = false
        // After a phone call the session and the engine may be down.
        try? session.setActive(true)
        try? ensureEngine()
        reschedule()
    }

    private func record(_ lateMs: Int) {
        cues += 1
        sumLate += lateMs
        if lateMs > maxLate { maxLate = lateMs }
    }

    private func finish(_ completed: Bool) {
        generation += 1
        running = false
        paused = false
        index = -1
        tickItem?.cancel()
        releaseItem?.cancel()
        lastSummary = [
            "completed": completed,
            "cues": cues,
            "maxLateMs": maxLate,
            "avgLateMs": cues > 0 ? sumLate / cues : 0,
            "seconds": (now() - workoutStart) / 1000
        ]
        if !completed { stopSpeaking() }
        keeper.stop()
        beeper.stop()
        engine.stop()
        ducked = false
        // Hands the full volume back to the music app.
        try? session.setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func interrupted(_ began: Bool) {
        guard running else { return }
        if began { pause(); return }
        try? session.setActive(true)
        try? ensureEngine()
    }

    private func reviveEngine() {
        guard running else { return }
        try? ensureEngine()
    }

    // ---- sound ----

    /// A sine beep with soft edges; hz 0 gives silence.
    private func tone(_ hz: Double, _ ms: Int) -> AVAudioPCMBuffer {
        let sr = format.sampleRate
        let n = Int(sr) * ms / 1000, ramp = Int(sr) / 200
        let buf = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(n))!
        buf.frameLength = AVAudioFrameCount(n)
        let data = buf.floatChannelData![0]
        for i in 0..<n {
            let env = min(1.0, Double(min(i, n - 1 - i)) / Double(ramp))
            data[i] = hz > 0 ? Float(sin(2 * Double.pi * hz * Double(i) / sr) * env * 0.8) : 0
        }
        return buf
    }

    /// The engine must run for the whole workout: its silent loop is what keeps the app alive in the background.
    private func ensureEngine() throws {
        if !engine.isRunning {
            engine.prepare()
            try engine.start()
        }
        if !keeper.isPlaying {
            keeper.scheduleBuffer(silence, at: nil, options: .loops, completionHandler: nil)
            keeper.play()
        }
    }

    private func play(_ buffer: AVAudioPCMBuffer) {
        do { try ensureEngine() } catch { NSLog("Interval: engine failed \(error)"); return }
        beeper.scheduleBuffer(buffer, at: nil, options: .interrupts, completionHandler: nil)
        if !beeper.isPlaying { beeper.play() }
    }

    /// Voice follows the long beep instead of talking over it.
    private func sayLater(_ text: String) {
        if !config.voice || text.isEmpty { holdFocus(900); return }
        holdFocus(8000)
        after(500) { self.speak(text) }
    }

    private func speak(_ text: String) {
        guard config.voice else { return }
        let u = AVSpeechUtterance(string: text)
        u.voice = AVSpeechSynthesisVoice(language: config.lang)
        current = u
        let synth = self.synth
        DispatchQueue.main.async {
            if synth.isSpeaking { synth.stopSpeaking(at: .immediate) }
            synth.speak(u)
        }
    }

    private func stopSpeaking() {
        current = nil
        let synth = self.synth
        DispatchQueue.main.async { if synth.isSpeaking { synth.stopSpeaking(at: .immediate) } }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        q.async {
            // Only the newest sentence gives the music back; one that was cut off by the next does not.
            if utterance === self.current { self.current = nil; self.holdFocus(300) }
        }
    }

    /// Lower the music for a cue ("duck" mode only).
    private func takeFocus() {
        guard config.duck, !ducked else { return }
        setDucking(true)
    }

    /// Give the music back ms from now (later calls replace earlier ones).
    private func holdFocus(_ ms: Int) {
        releaseItem?.cancel()
        let item = DispatchWorkItem { [weak self] in self?.releaseFocus() }
        releaseItem = item
        q.asyncAfter(deadline: .now() + .milliseconds(ms), execute: item)
    }

    private func releaseFocus() {
        releaseItem?.cancel()
        if ducked { setDucking(false) }
    }

    /// The session stays active the whole time (deactivating it in the background would suspend the app),
    /// so ducking is switched by changing the session's options.
    private func setDucking(_ on: Bool) {
        do {
            try session.setCategory(.playback, mode: .default, options: on ? [.mixWithOthers, .duckOthers] : [.mixWithOthers])
            try session.setActive(true)
            ducked = on
            try ensureEngine()
        } catch {
            NSLog("Interval: ducking \(on) failed \(error)")
        }
    }
}
