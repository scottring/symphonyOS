#!/usr/bin/env python3
"""Render the walk's five PLACEHOLDER sounds.

No recordings exist yet and none may be taken from the internet, so the
iPhone walk ships these stand-ins, synthesized from the approved prototype's
recipes (docs/superpowers/specs/2026-11-13-iphone-light-walk-mockup/
mockup-contract.md, section 12): filtered noise bursts through an RBJ biquad
(what Web Audio's BiquadFilterNode is) and tones with exponential glides and
envelopes, mixed with the recipes' own relative gains.

Each sound is then normalised to a target peak (PEAKS), so the stand-ins are
heard on a phone speaker: white noise through a narrow 0 dB-peak band-pass
keeps little of its energy, and the recipes' absolute levels came out at -26
to -34 dBFS. The app's player adds one global volume of 0.6 on top. A file
is as long as its recipe says, or longer when a voice would run past the end,
so nothing is cut.

Plain Python 3, standard library only, seeded, so every run writes the same
bytes. Output: mono, 44.1 kHz, 16-bit WAV, named walk-<name>.PLACEHOLDER.wav.

    python3 scripts/render-walk-placeholder-sounds.py \
        apple/SymphonyOS/SymphonyOS/Resources/WalkSounds

The real recordings replace these by being dropped beside them as
walk-<name>.wav, .caf or .m4a; the app prefers a recording when there is one.
"""

import math
import os
import random
import struct
import sys
import wave

RATE = 44_100
FLOOR = 0.0001          # Web Audio's exponential ramps start and end here

rng = random.Random(13)

# Target peak per sound, in dBFS, before the player's volume of 0.6.
PEAKS = {"bag": -12.0, "poles": -12.0, "unfurl": -12.0, "plant": -9.0, "tick": -18.0}

# One second of white noise, read from a random offset by every burst.
NOISE = [rng.uniform(-1.0, 1.0) for _ in range(RATE)]


def frames(seconds):
    return max(0, int(round(seconds * RATE)))


def rand(lo, hi):
    return lo + rng.random() * (hi - lo)


def room(out, end):
    """Grow the buffer so a voice ending at frame `end` is never cut."""
    if end > len(out):
        out.extend([0.0] * (end - len(out)))


# MARK: Filter

class Biquad:
    """RBJ cookbook biquad, Direct Form I."""

    def __init__(self):
        self.b0, self.b1, self.b2, self.a1, self.a2 = 1.0, 0.0, 0.0, 0.0, 0.0
        self.x1 = self.x2 = self.y1 = self.y2 = 0.0

    def set(self, kind, freq, q):
        w0 = 2 * math.pi * min(freq, RATE * 0.49) / RATE
        cw, sw = math.cos(w0), math.sin(w0)
        if kind in ("lowpass", "highpass"):
            # Web Audio reads Q in dB for these two.
            q = 10 ** (q / 20)
        alpha = sw / (2 * q)
        a0 = 1 + alpha
        if kind == "bandpass":              # 0 dB peak gain
            b0, b1, b2 = alpha, 0.0, -alpha
        elif kind == "lowpass":
            b0, b1, b2 = (1 - cw) / 2, 1 - cw, (1 - cw) / 2
        elif kind == "highpass":
            b0, b1, b2 = (1 + cw) / 2, -(1 + cw), (1 + cw) / 2
        else:
            raise ValueError(kind)
        self.b0, self.b1, self.b2 = b0 / a0, b1 / a0, b2 / a0
        self.a1, self.a2 = -2 * cw / a0, (1 - alpha) / a0

    def process(self, x):
        y = self.b0 * x + self.b1 * self.x1 + self.b2 * self.x2 - self.a1 * self.y1 - self.a2 * self.y2
        self.x2, self.x1 = self.x1, x
        self.y2, self.y1 = self.y1, y
        return y


# MARK: Envelopes

def envelope(t, attack, peak, end):
    """setValueAtTime(FLOOR) -> exponentialRamp(peak, attack) -> exponentialRamp(FLOOR, end)."""
    if t < 0 or t >= end:
        return 0.0
    if t < attack:
        return FLOOR * (peak / FLOOR) ** (t / attack)
    return peak * (FLOOR / peak) ** ((t - attack) / (end - attack))


def glide(f0, f1, t, over):
    """exponentialRamp of a frequency from f0 to f1 over `over` seconds, then held."""
    return f0 * (f1 / f0) ** min(1.0, t / over)


# MARK: Voices

def burst(out, start, kind, f0, dur, gain, q=1.0, f1=None, attack=0.005):
    """Noise through a biquad (optionally sweeping f0 -> f1 over dur) under an envelope."""
    flt = Biquad()
    offset = frames(rand(0, 0.5))
    first = frames(start)
    room(out, first + frames(dur))
    for i in range(first, first + frames(dur)):
        t = (i - first) / RATE
        if (i - first) % 16 == 0:
            flt.set(kind, f0 if f1 is None else glide(f0, f1, t, dur), q)
        out[i] += envelope(t, attack, gain, dur) * flt.process(NOISE[(offset + i - first) % RATE])


def tone(out, start, wave_kind, f0, f1, dur, gain, attack=0.004):
    """An oscillator gliding f0 -> f1 over dur, 4 ms attack, exponential decay."""
    phase = 0.0
    first = frames(start)
    room(out, first + frames(dur))
    for i in range(first, first + frames(dur)):
        t = (i - first) / RATE
        phase = (phase + glide(f0, f1, t, dur) / RATE) % 1.0
        if wave_kind == "sine":
            v = math.sin(2 * math.pi * phase)
        else:                               # triangle
            v = 4 * abs(phase - 0.5) - 1
        out[i] += envelope(t, attack, gain, dur) * v


# MARK: The five recipes (contract section 12)

def bag():
    out = [0.0] * frames(0.40)
    for i in range(6):
        burst(out, i * 0.050 + rand(0, 0.030), "highpass", rand(2600, 4800), rand(0.070, 0.130),
              rand(0.07, 0.12), q=0.7, attack=0.010)
    burst(out, 0.050, "bandpass", 900, 0.280, 0.05, q=0.8, f1=1800, attack=0.060)
    return out


def poles():
    out = [0.0] * frames(0.45)
    t = 0.005
    for _ in range(5):
        f = rand(900, 1500)
        tone(out, t, "triangle", f, 0.92 * f, 0.070, rand(0.05, 0.08))
        burst(out, t, "bandpass", rand(2200, 2800), 0.035, 0.09, q=6)
        t += rand(0.035, 0.095)
    return out


def unfurl():
    out = [0.0] * frames(0.40)
    burst(out, 0.000, "bandpass", 450, 0.200, 0.16, q=1.2, f1=1900, attack=0.030)
    burst(out, 0.170, "bandpass", 700, 0.120, 0.08, q=1.4, f1=1600, attack=0.030)
    burst(out, 0.270, "bandpass", 900, 0.090, 0.05, q=1.6, f1=1400, attack=0.030)
    return out


def plant():
    out = [0.0] * frames(0.40)
    burst(out, 0.000, "bandpass", 600, 0.140, 0.05, f1=1500, attack=0.050)       # the swish
    hit = 0.130                                                                 # the thud (the haptic's moment)
    tone(out, hit, "sine", 120, 42, 0.220, 0.42)
    burst(out, hit, "lowpass", 380, 0.120, 0.3, q=1.0, attack=0.003)
    for i in range(4):
        burst(out, hit + 0.010 + i * 0.022, "highpass", rand(1800, 3300), 0.030, 0.05)
    tone(out, hit, "triangle", 1100, 980, 0.120, 0.025)
    return out


def tick():
    out = [0.0] * frames(0.05)
    tone(out, 0.0, "sine", 2300, 2100, 0.035, 0.03)
    return out


SOUNDS = [("bag", bag), ("poles", poles), ("unfurl", unfurl), ("plant", plant), ("tick", tick)]


# MARK: Writing

def write(path, samples, peak_db):
    # Normalised to the target peak, with a 5 ms fade at the end so the last
    # envelope's tail never clicks.
    gain = 10 ** (peak_db / 20) / max(abs(s) for s in samples)
    fade = frames(0.005)
    n = len(samples)
    data = bytearray()
    for i, s in enumerate(samples):
        v = s * gain
        if i >= n - fade:
            v *= (n - 1 - i) / fade
        v = max(-1.0, min(1.0, v))
        data += struct.pack("<h", int(round(v * 32767)))
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(bytes(data))


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: render-walk-placeholder-sounds.py <output folder>")
    folder = sys.argv[1]
    os.makedirs(folder, exist_ok=True)
    for name, render in SOUNDS:
        samples = render()
        path = os.path.join(folder, f"walk-{name}.PLACEHOLDER.wav")
        write(path, samples, PEAKS[name])
        print(f"{path}  {len(samples) / RATE:.3f} s  peak {PEAKS[name]:.0f} dBFS")


if __name__ == "__main__":
    main()
