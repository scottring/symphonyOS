import Foundation
import AVFoundation

/// Paper sounds for the fold (paper-style horizons, Scott 2026-11-04), made on
/// the fly from a noise buffer: no audio files. A port of the approved
/// prototype's Web Audio generators (docs/superpowers/specs/
/// 2026-11-04-paper-fold-prototype.html, `Sound`): swish, crinkle, land and
/// pencil, with the same filters, levels and envelopes.
///
/// Each sound is rendered into a short buffer (`PaperSynth`, plain DSP: an
/// RBJ biquad, which is what Web Audio's BiquadFilterNode is, and Web Audio's
/// linear and exponential ramps) and played on an AVAudioEngine player. The
/// `.ambient` session category mixes with other audio and goes quiet with the
/// silent switch. Mute lives in `@AppStorage("planner.paperSound")` (default
/// on). Anything that fails leaves the fold silent, never broken.
@MainActor
final class PaperSound {
    static let shared = PaperSound()
    static let storageKey = "planner.paperSound"

    var isOn: Bool {
        get { UserDefaults.standard.object(forKey: Self.storageKey) as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: Self.storageKey) }
    }

    private let sampleRate: Double = 44_100
    private var engine: AVAudioEngine?
    private var players: [AVAudioPlayerNode] = []
    private var nextPlayer = 0
    private var format: AVAudioFormat?
    private var failed = false
    private lazy var synth = PaperSynth(sampleRate: sampleRate)

    private init() {}

    // MARK: The four sounds (prototype defaults)

    func swish(duration: Double = 0.32, level: Float = 1, lo: Double = 500, hi: Double = 2600) {
        play { $0.swish(duration: duration, level: level, lo: lo, hi: hi) }
    }

    func crinkle(count: Int = 6, over: Double = 0.26, level: Float = 1) {
        play { $0.crinkle(count: count, over: over, level: level) }
    }

    func land(level: Float = 1) {
        play { $0.land(level: level) }
    }

    func pencil() {
        play { $0.pencil() }
    }

    // MARK: Engine

    private func play(_ render: (PaperSynth) -> [Float]) {
        guard isOn, let player = ready(), let format else { return }
        let samples = render(synth)
        guard !samples.isEmpty,
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(samples.count)),
              let channel = buffer.floatChannelData?[0] else { return }
        buffer.frameLength = AVAudioFrameCount(samples.count)
        samples.withUnsafeBufferPointer { src in
            channel.update(from: src.baseAddress!, count: samples.count)
        }
        player.scheduleBuffer(buffer, completionHandler: nil)
        if !player.isPlaying { player.play() }
    }

    /// The engine, started on the first sound (always from a gesture), and
    /// the next of a few players, so sounds overlap as they do on the web.
    private func ready() -> AVAudioPlayerNode? {
        if failed { return nil }
        if engine == nil {
            #if os(iOS)
            do {
                // Ambient: mixes with music and respects the silent switch.
                try AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default, options: [.mixWithOthers])
                try AVAudioSession.sharedInstance().setActive(true)
            } catch {
                // Plays under whatever category the app already has.
            }
            #endif
            let e = AVAudioEngine()
            guard let f = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1) else {
                failed = true
                return nil
            }
            for _ in 0..<6 {
                let p = AVAudioPlayerNode()
                e.attach(p)
                e.connect(p, to: e.mainMixerNode, format: f)
                players.append(p)
            }
            e.mainMixerNode.outputVolume = 0.9   // the prototype's master gain
            engine = e
            format = f
        }
        guard let engine else { return nil }
        if !engine.isRunning {
            do { try engine.start() } catch { return nil }
        }
        let p = players[nextPlayer]
        nextPlayer = (nextPlayer + 1) % players.count
        // A player still busy with a long sound starts over on this one.
        if p.isPlaying { p.stop() }
        return p
    }
}

// MARK: - Synthesis

/// The prototype's generators as sample math. Times are seconds from the
/// start of the buffer; each sound is written into one mono buffer.
struct PaperSynth {
    let sampleRate: Double
    /// One second of white noise, read from a random offset, as the
    /// prototype's AudioBufferSourceNode does.
    private let noise: [Float]

    init(sampleRate: Double) {
        self.sampleRate = sampleRate
        noise = (0..<Int(sampleRate)).map { _ in Float.random(in: -1...1) }
    }

    // MARK: Sounds

    /// Small bursts of filtered noise spread over `over` seconds.
    func crinkle(count: Int = 6, over: Double = 0.26, level: Float = 1) -> [Float] {
        var out = [Float](repeating: 0, count: frames(0.005 + over + 0.09))
        for _ in 0..<count {
            let t = 0.005 + pow(Double.random(in: 0..<1), 1.4) * over
            grain(into: &out, at: t, gain: Float(0.035 + Double.random(in: 0..<1) * 0.11) * level,
                  freq: 1700 + Double.random(in: 0..<1) * 4200, dur: 0.012 + Double.random(in: 0..<1) * 0.035)
        }
        return out
    }

    /// A band of noise sweeping up from `lo` to `hi`: the sheet moving through air.
    func swish(duration dur: Double = 0.32, level: Float = 1, lo: Double = 500, hi: Double = 2600) -> [Float] {
        let t0 = 0.005
        var out = [Float](repeating: 0, count: frames(t0 + dur + 0.05))
        var filter = Biquad()
        let offset = Int(Double.random(in: 0..<0.5) * sampleRate)
        let peak = 0.075 * Double(level)
        for i in frames(t0)..<out.count {
            let t = Double(i) / sampleRate - t0
            // exponentialRampToValueAtTime(hi, dur * .7), then holds.
            let sweep = min(1, t / (dur * 0.7))
            let freq = lo * pow(hi / lo, sweep)
            if i % 16 == 0 { filter.setBandpass(freq: freq, q: 0.7, sampleRate: sampleRate) }
            let g = Self.envelope(t, attack: dur * 0.35, peak: peak, end: dur)
            out[i] += Float(g) * filter.process(noise[(offset + i) % noise.count])
        }
        return out
    }

    /// A soft thump: low-passed noise, a falling sine, and a few grains.
    func land(level: Float = 1) -> [Float] {
        let t0 = 0.003
        var out = [Float](repeating: 0, count: frames(t0 + 0.14))
        // Noise through a 520 Hz low-pass, from 0.22 down over 70 ms; plays 100 ms.
        var lp = Biquad()
        lp.setLowpass(freq: 520, q: 1.122, sampleRate: sampleRate)   // Web Audio's Q of 1 dB
        let offset = Int(Double.random(in: 0..<0.5) * sampleRate)
        for i in frames(t0)..<min(out.count, frames(t0 + 0.1)) {
            let t = Double(i) / sampleRate - t0
            let g = Self.decay(t, from: 0.22 * Double(level), over: 0.07)
            out[i] += Float(g) * lp.process(noise[(offset + i) % noise.count])
        }
        // A sine falling 120 → 62 Hz over 90 ms, from 0.11 down over 110 ms; stops at 130 ms.
        var phase = 0.0
        for i in frames(t0)..<min(out.count, frames(t0 + 0.13)) {
            let t = Double(i) / sampleRate - t0
            let f = 120 * pow(62.0 / 120, min(1, t / 0.09))
            phase += 2 * .pi * f / sampleRate
            out[i] += Float(Self.decay(t, from: 0.11 * Double(level), over: 0.11) * sin(phase))
        }
        for _ in 0..<3 {
            grain(into: &out, at: t0 + 0.01 + Double.random(in: 0..<1) * 0.05, gain: 0.04 * level,
                  freq: 2500 + Double.random(in: 0..<1) * 2500, dur: 0.02)
        }
        return out
    }

    /// Two quick strokes of high noise: a pencil tick.
    func pencil() -> [Float] {
        let t0 = 0.003
        var out = [Float](repeating: 0, count: frames(t0 + 0.055 + 0.07))
        for stroke in 0..<2 {
            let start = t0 + Double(stroke) * 0.055
            var bp = Biquad()
            bp.setBandpass(freq: 3200 + Double(stroke) * 1600, q: 1.4, sampleRate: sampleRate)
            let offset = Int(Double.random(in: 0..<0.8) * sampleRate)
            for i in frames(start)..<min(out.count, frames(start + 0.06)) {
                let t = Double(i) / sampleRate - start
                let g = Self.envelope(t, attack: 0.004, peak: 0.12, end: 0.045)
                out[i] += Float(g) * bp.process(noise[(offset + i) % noise.count])
            }
        }
        return out
    }

    // MARK: Pieces

    /// One grain: band-passed noise with a 2.5 ms attack, falling to 0.0005 at `dur`.
    private func grain(into out: inout [Float], at start: Double, gain: Float, freq: Double, dur: Double) {
        var bp = Biquad()
        bp.setBandpass(freq: freq, q: 0.8 + Double.random(in: 0..<1) * 1.6, sampleRate: sampleRate)
        let offset = Int(Double.random(in: 0..<0.85) * sampleRate)
        for i in frames(start)..<min(out.count, frames(start + dur + 0.03)) {
            let t = Double(i) / sampleRate - start
            let g = Self.envelope(t, attack: 0.0025, peak: Double(gain), end: dur)
            out[i] += Float(g) * bp.process(noise[(offset + i) % noise.count])
        }
    }

    private func frames(_ seconds: Double) -> Int { max(0, Int((seconds * sampleRate).rounded())) }

    /// Web Audio's setValueAtTime(0) → linearRamp(peak, attack) →
    /// exponentialRamp(0.0005, end).
    static func envelope(_ t: Double, attack: Double, peak: Double, end: Double) -> Double {
        if t < 0 { return 0 }
        if t < attack { return peak * t / attack }
        if t >= end { return 0.0005 }
        return peak * pow(0.0005 / peak, (t - attack) / (end - attack))
    }

    /// setValueAtTime(from) → exponentialRamp(0.0005, over).
    static func decay(_ t: Double, from: Double, over: Double) -> Double {
        if t < 0 { return 0 }
        if t >= over { return 0.0005 }
        return from * pow(0.0005 / from, t / over)
    }
}

/// An RBJ biquad (Direct Form I), the filter behind Web Audio's
/// BiquadFilterNode.
struct Biquad {
    private var b0 = 1.0, b1 = 0.0, b2 = 0.0, a1 = 0.0, a2 = 0.0
    private var x1 = 0.0, x2 = 0.0, y1 = 0.0, y2 = 0.0

    /// Band-pass with 0 dB peak gain (Web Audio "bandpass").
    mutating func setBandpass(freq: Double, q: Double, sampleRate: Double) {
        let w0 = 2 * .pi * min(freq, sampleRate * 0.49) / sampleRate
        let alpha = sin(w0) / (2 * q)
        let a0 = 1 + alpha
        b0 = alpha / a0; b1 = 0; b2 = -alpha / a0
        a1 = -2 * cos(w0) / a0; a2 = (1 - alpha) / a0
    }

    mutating func setLowpass(freq: Double, q: Double, sampleRate: Double) {
        let w0 = 2 * .pi * min(freq, sampleRate * 0.49) / sampleRate
        let alpha = sin(w0) / (2 * q)
        let c = cos(w0)
        let a0 = 1 + alpha
        b0 = (1 - c) / 2 / a0; b1 = (1 - c) / a0; b2 = (1 - c) / 2 / a0
        a1 = -2 * c / a0; a2 = (1 - alpha) / a0
    }

    mutating func process(_ x: Float) -> Float {
        let xd = Double(x)
        let y = b0 * xd + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2 = x1; x1 = xd
        y2 = y1; y1 = y
        return Float(y)
    }
}
