#!/usr/bin/env python3
"""Symphony wall listener: the kitchen kiosk's microphone.

Runs on the wall Pi beside the kiosk browser. Listening starts when someone
says "Hey Symphony" / "Hey Sym" or taps Talk on the wall. It records until
they stop speaking, transcribes on this device, and hands only those words to
the wall page over a local WebSocket. The page decides what they mean (save
it, run it, or answer it) and may send back a short reply to speak.

How the wake phrase is heard: each short burst of speech is transcribed with
a small fast model, and kept only if it starts with the name. Anything else
is dropped at once: no audio or text is stored, and nothing leaves the Pi
until the name was said. Muted, or in quiet hours, the microphone stream is
closed (a tap on Talk still opens it for one turn in quiet hours).

Protocol (JSON text frames, ws://127.0.0.1:8765):
  listener -> page
    {"type":"state","state":"starting|ready|listening|thinking|speaking|muted|quiet",
     "wake":"Hey Symphony"|null,"muted":bool,"quiet":bool}
    {"type":"heard","id":"<uuid>","text":"add milk","via":"wake|tap"}
    {"type":"nothing","reason":"silence|too-short"}
    {"type":"error","message":"..."}
  page -> listener
    {"type":"listen"}  {"type":"cancel"}  {"type":"mute","on":bool}
    {"type":"say","text":"..."} (or {"type":"play","wav":"<base64>"})  {"type":"done"}
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import io
import json
import logging
import os
import queue
import threading
import time as clock
import uuid
import wave
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, time
from pathlib import Path
from typing import Callable, Iterable, Optional

import numpy as np

from endpoint import Endpointer
from wake import WAKE_LABEL, match_wake, strip_wake, worth_a_command

log = logging.getLogger("wall-listener")

RATE = 16000
FRAME = 1280  # 80 ms
DEFAULT_ORIGINS = (
    "https://app.symphony-os.com",
    "http://localhost:5173",
    "http://localhost:5196",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5196",
)
STATE_FILE = Path(os.environ.get("WALL_LISTENER_STATE", Path.home() / ".config" / "symphony-wall-listener" / "state.json"))
SPEECH_MIN = 360.0  # an EMEET-processed room sits near 1; speech is ~700+


# ── Config ──────────────────────────────────────────────────────────────────

QuietHours = Optional[tuple[time, time]]


def parse_quiet_hours(spec: Optional[str]) -> QuietHours:
    """"21:00-06:30" → (21:00, 06:30); "off" / empty → None."""
    if not spec or spec.strip().lower() in ("off", "none", "no"):
        return None
    a, b = spec.split("-")
    to_t = lambda s: time(*[int(x) for x in s.strip().split(":")])  # noqa: E731
    return to_t(a), to_t(b)


def in_quiet_hours(q: QuietHours, now: time) -> bool:
    if not q:
        return False
    start, end = q
    return (start <= now or now < end) if start > end else (start <= now < end)


@dataclass
class Config:
    host: str = "127.0.0.1"
    port: int = 8765
    origins: tuple[str, ...] = DEFAULT_ORIGINS
    wake: bool = True
    wake_whisper_model: str = "tiny.en"
    whisper_model: str = "base.en"
    quiet_hours: QuietHours = None
    voice: Optional[str] = None  # a Piper .onnx voice: the offline fallback for "say"
    input_device: Optional[str] = None
    wav: Optional[str] = None  # read audio from this file instead of the mic (testing)


# ── Audio in ────────────────────────────────────────────────────────────────

class MicSource:
    """16 kHz mono int16 frames from the microphone (through PipeWire's default
    source on the Pi — reading the EMEET's ALSA device directly gives silence)."""

    def __init__(self, device: Optional[str]):
        self.device = device
        self.frames: "queue.Queue[np.ndarray]" = queue.Queue(maxsize=200)
        self.stream = None

    @property
    def is_open(self) -> bool:
        return bool(self.stream)

    def open(self) -> None:
        if self.stream:
            return
        import sounddevice as sd

        def cb(indata, _frames, _time, status):  # audio thread
            if status:
                log.debug("audio status %s", status)
            try:
                self.frames.put_nowait(indata[:, 0].copy())
            except queue.Full:
                pass  # drop rather than lag

        self.stream = sd.InputStream(samplerate=RATE, channels=1, dtype="int16", blocksize=FRAME,
                                     device=self.device, callback=cb)
        self.stream.start()

    def close(self) -> None:
        if self.stream and self.stream is not True:
            self.stream.stop()
            self.stream.close()
        self.stream = None
        with self.frames.mutex:
            self.frames.queue.clear()

    def read(self, timeout: float = 0.5) -> Optional[np.ndarray]:
        try:
            return self.frames.get(timeout=timeout)
        except queue.Empty:
            return None


class WavSource(MicSource):
    """Frames from a 16 kHz mono wav, paced like a real mic, then silence (testing)."""

    def __init__(self, path: str):
        super().__init__(None)
        with wave.open(path, "rb") as w:
            assert w.getframerate() == RATE and w.getnchannels() == 1 and w.getsampwidth() == 2, "need 16 kHz mono 16-bit wav"
            self.audio = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
        self.pos = 0

    def open(self) -> None:
        if self.stream:
            return
        self.stream = True

        def feed():
            while self.stream:
                chunk = self.audio[self.pos:self.pos + FRAME]
                self.pos += FRAME
                if len(chunk) < FRAME:
                    chunk = np.concatenate([chunk, np.zeros(FRAME - len(chunk), dtype=np.int16)])
                self.frames.put(chunk)
                clock.sleep(FRAME / RATE)

        threading.Thread(target=feed, daemon=True).start()

    def rewind(self) -> None:
        self.pos = 0


# ── Models (loaded once, off the event loop) ────────────────────────────────

class Models:
    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.fast = None
        self.whisper = None
        self.voice = None

    def load(self) -> None:
        from faster_whisper import WhisperModel
        self.whisper = WhisperModel(self.cfg.whisper_model, device="cpu", compute_type="int8")
        if self.cfg.wake:
            self.fast = (self.whisper if self.cfg.wake_whisper_model == self.cfg.whisper_model
                         else WhisperModel(self.cfg.wake_whisper_model, device="cpu", compute_type="int8", cpu_threads=2))
        if self.cfg.voice:
            from piper import PiperVoice
            self.voice = PiperVoice.load(self.cfg.voice)

    @staticmethod
    def _run(model, audio: np.ndarray, prompt: Optional[str]) -> str:
        pcm = audio.astype(np.float32) / 32768.0
        segments, _ = model.transcribe(pcm, language="en", beam_size=1, condition_on_previous_text=False,
                                       initial_prompt=prompt, without_timestamps=True)
        return " ".join(s.text.strip() for s in segments).strip()

    def wake_text(self, audio: np.ndarray) -> str:
        # A hint that repeats the wake phrase makes Whisper skip it in the
        # audio ("Hey Sim, what's…" came back as "What's…"); this one does not.
        return self._run(self.fast, audio, "Talking to the kitchen display named Symphony.")

    def transcribe(self, audio: np.ndarray) -> str:
        return self._run(self.whisper, audio, "Talking to the kitchen display named Symphony about groceries, "
                         "the scratchpad, the inbox, after school, dinner, homework and pickups.")

    def speak(self, text: str) -> None:
        if not self.voice:
            return
        import sounddevice as sd
        chunks = [c.audio_int16_array for c in self.voice.synthesize(text)]
        if chunks:
            sd.play(np.concatenate(chunks), self.voice.config.sample_rate, blocking=True)


def play_wav_bytes(data: bytes) -> None:
    import sounddevice as sd
    with wave.open(io.BytesIO(data), "rb") as w:
        audio = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
        if w.getnchannels() > 1:
            audio = audio.reshape(-1, w.getnchannels())
        sd.play(audio, w.getframerate(), blocking=True)


def chime(rising: bool = True) -> None:
    """A short two-note cue: rising when listening starts, falling when it stops."""
    try:
        import sounddevice as sd
        sr = 22050
        notes = (660, 880) if rising else (880, 660)
        t = np.linspace(0, 0.09, int(sr * 0.09), endpoint=False)
        env = np.minimum(1, np.minimum(t, 0.09 - t) * 60)
        tone = np.concatenate([np.sin(2 * np.pi * f * t) * env for f in notes]) * 0.25
        sd.play(tone.astype(np.float32), sr, blocking=False)
    except Exception:  # no output device: cues are optional
        pass


# ── The listener ────────────────────────────────────────────────────────────

@dataclass
class Listener:
    cfg: Config
    models: Models
    source: MicSource
    send: Callable[[dict], None]
    now: Callable[[], time] = field(default_factory=lambda: (lambda: datetime.now().time()))
    state: str = "starting"
    muted: bool = False
    _listen_now: threading.Event = field(default_factory=threading.Event)
    _cancel: threading.Event = field(default_factory=threading.Event)
    _stop: threading.Event = field(default_factory=threading.Event)
    _out: "queue.Queue[tuple[str, object]]" = field(default_factory=queue.Queue)
    _room: "deque[float]" = field(default_factory=lambda: deque(maxlen=25))

    @property
    def quiet(self) -> bool:
        return in_quiet_hours(self.cfg.quiet_hours, self.now())

    @property
    def wake_on(self) -> bool:
        return self.cfg.wake and not self.muted and not self.quiet

    def resting_state(self) -> str:
        return "muted" if self.muted else "quiet" if self.quiet else "ready"

    def set_state(self, state: str) -> None:
        self.state = state
        self.send({"type": "state", "state": state, "wake": WAKE_LABEL if self.cfg.wake else None,
                   "muted": self.muted, "quiet": self.quiet})

    # From the WebSocket side.
    def listen(self) -> None:
        if not self.muted:
            self._listen_now.set()

    def cancel(self) -> None:
        self._cancel.set()

    def say(self, text: str) -> None:
        text = (text or "").strip()[:400]
        if text:
            self._out.put(("say", text))

    def play(self, wav: bytes) -> None:
        if wav:
            self._out.put(("play", wav))

    def mute(self, on: bool) -> None:
        self.muted = on
        save_state({"muted": on})
        if on:
            self._cancel.set()
        self.set_state(self.resting_state() if self.state in ("ready", "muted", "quiet") or on else self.state)

    def stop(self) -> None:
        self._stop.set()
        self.source.close()

    # The audio loop, on its own thread.
    def run(self) -> None:
        self.models.load()
        self.set_state(self.resting_state())
        seg: list[np.ndarray] = []
        pre: "deque[np.ndarray]" = deque(maxlen=4)
        speech = quiet_frames = 0
        while not self._stop.is_set():
            if not self._out.empty():
                self._speak(*self._out.get())
                continue
            # Tap: one turn, even in quiet hours (the stream opens for it).
            if self._listen_now.is_set():
                self._listen_now.clear()
                self.source.open()
                self._capture(via="tap")
                seg, speech, quiet_frames = [], 0, 0
                continue
            # The mic is open only while the wake phrase can be heard.
            if not self.wake_on:
                if self.source.is_open:
                    self.source.close()
                if self.state != self.resting_state():
                    self.set_state(self.resting_state())
                clock.sleep(0.1)
                continue
            if not self.source.is_open:
                self.source.open()
                self.set_state("ready")
            frame = self.source.read()
            if frame is None:
                continue
            level = Endpointer.rms(frame)
            self._room.append(level)
            loud = level > max(self._floor() * 3, SPEECH_MIN)
            if not seg:
                pre.append(frame)
                if loud:
                    seg, speech, quiet_frames = list(pre), 1, 0
                continue
            seg.append(frame)
            if loud:
                speech, quiet_frames = speech + 1, 0
            else:
                quiet_frames += 1
            cut = len(seg) * FRAME >= RATE * 6
            if quiet_frames >= 8 or cut:  # a 0.64 s pause ends a burst
                burst = np.concatenate(seg)
                seg, speech_n, speech, quiet_frames = [], speech, 0, 0
                pre.clear()
                if speech_n >= 3:
                    self._check_wake(burst, cut)

    def _floor(self) -> float:
        room = sorted(self._room)
        return room[len(room) // 5] if room else 1.0

    def _check_wake(self, burst: np.ndarray, cut: bool) -> None:
        text = self.models.wake_text(burst)
        rest = match_wake(text)
        if rest is None:
            return  # not for us: dropped, never kept
        log.info("wake (%s)", "with command" if worth_a_command(rest) else "name only")
        if worth_a_command(rest) and not cut:
            # "Hey Symphony, add milk" — the command came in the same breath.
            chime(True)
            self.set_state("thinking")
            words = strip_wake(self.models.transcribe(burst)) or rest
            self._hand_over(words, "wake")
            return
        prefix = burst if cut else None  # still talking: keep what was said
        self._capture(via="wake", prefix=prefix)

    def _speak(self, kind: str, payload) -> None:
        self.set_state("speaking")
        was_open = self.source.is_open
        self.source.close()  # never hear ourselves
        try:
            if kind == "play":
                play_wav_bytes(payload)  # a natural voice made by the app
            else:
                self.models.speak(payload)  # the offline voice
        except Exception as e:  # a reply that cannot be spoken is still on screen
            log.warning("speak failed: %s", e)
        if was_open and self.wake_on:
            self.source.open()
        self.set_state(self.resting_state())

    def _capture(self, via: str, prefix: Optional[np.ndarray] = None) -> None:
        self._cancel.clear()
        self.set_state("listening")
        if prefix is None:
            chime(True)
        room = sorted(self._room)
        ep = Endpointer(rate=RATE, frame=FRAME, floor=room[len(room) // 5] if room else None)
        if prefix is not None:
            ep.speech = ep.min_speech  # already mid-sentence
        audio: list[np.ndarray] = [prefix] if prefix is not None else []
        verdict = None
        while not self._stop.is_set():
            if self._cancel.is_set():
                self._cancel.clear()
                self.set_state(self.resting_state())
                return
            frame = self.source.read()
            if frame is None:
                continue
            audio.append(frame)
            verdict = ep.push(frame)
            if verdict:
                break
        chime(False)
        if not self.wake_on:
            self.source.close()  # a tap in quiet hours: one turn only
        if verdict != "speech":
            self.send({"type": "nothing", "reason": verdict or "silence"})
            self.set_state(self.resting_state())
            return
        self.set_state("thinking")
        text = strip_wake(self.models.transcribe(np.concatenate(audio)))
        del audio  # nothing kept
        self._hand_over(text, via)

    def _hand_over(self, text: str, via: str) -> None:
        if len(text) < 2:
            self.send({"type": "nothing", "reason": "too-short"})
            self.set_state(self.resting_state())
            return
        self.send({"type": "heard", "id": str(uuid.uuid4()), "text": text, "via": via})
        # The page answers with "say"/"play" or "done"; until then, thinking.


# ── State on disk (mute survives a reboot) ──────────────────────────────────

def load_state() -> dict:
    try:
        return json.loads(STATE_FILE.read_text())
    except Exception:
        return {}


def save_state(state: dict) -> None:
    try:
        STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        STATE_FILE.write_text(json.dumps(state))
    except OSError as e:
        log.warning("could not save state: %s", e)


# ── WebSocket server ────────────────────────────────────────────────────────

def origin_allowed(origin: Optional[str], allowed: Iterable[str]) -> bool:
    """Only the wall page may connect: a page on any other site the browser
    opens must not be able to start the microphone or read what was heard."""
    return bool(origin) and origin in tuple(allowed)


async def serve(cfg: Config) -> None:
    import websockets

    loop = asyncio.get_running_loop()
    clients: set = set()
    last: dict = {}

    def send(msg: dict) -> None:  # from any thread
        if msg.get("type") == "state":
            last.clear()
            last.update(msg)
        data = json.dumps(msg)

        def fan_out():
            for ws in list(clients):
                asyncio.ensure_future(ws.send(data))
        loop.call_soon_threadsafe(fan_out)

    source = WavSource(cfg.wav) if cfg.wav else MicSource(cfg.input_device)
    listener = Listener(cfg, Models(cfg), source, send, muted=bool(load_state().get("muted")))

    async def handler(ws):
        origin = ws.request.headers.get("Origin")
        if not origin_allowed(origin, cfg.origins):
            log.warning("refused connection from origin %r", origin)
            await ws.close(code=1008, reason="origin not allowed")
            return
        clients.add(ws)
        try:
            await ws.send(json.dumps(last or {"type": "state", "state": listener.state, "wake": None, "muted": listener.muted, "quiet": listener.quiet}))
            async for raw in ws:
                try:
                    msg = json.loads(raw)
                except (TypeError, ValueError):
                    continue
                kind = msg.get("type")
                if kind == "listen":
                    listener.listen()
                elif kind == "cancel":
                    listener.cancel()
                elif kind == "mute":
                    listener.mute(bool(msg.get("on")))
                elif kind == "say":
                    listener.say(str(msg.get("text", "")))
                elif kind == "play":
                    try:
                        listener.play(base64.b64decode(str(msg.get("wav", "")), validate=True)[: 4 * 1024 * 1024])
                    except ValueError:
                        pass
                elif kind == "done" and listener.state == "thinking":
                    listener.set_state(listener.resting_state())
        finally:
            clients.discard(ws)

    threading.Thread(target=listener.run, daemon=True).start()
    async with websockets.serve(handler, cfg.host, cfg.port, max_size=6 * 1024 * 1024):
        log.info("listening on ws://%s:%d (wake: %s, quiet hours: %s)", cfg.host, cfg.port,
                 WAKE_LABEL if cfg.wake else "off", cfg.quiet_hours or "none")
        await asyncio.Future()


def main() -> None:
    env = os.environ.get
    p = argparse.ArgumentParser(description="Symphony wall listener")
    p.add_argument("--port", type=int, default=int(env("WALL_LISTENER_PORT", 8765)))
    p.add_argument("--no-wake", action="store_true", default=env("WALL_WAKE", "on") == "off", help="Talk button only")
    p.add_argument("--wake-whisper-model", default=env("WALL_WAKE_WHISPER_MODEL", "tiny.en"))
    p.add_argument("--whisper-model", default=env("WALL_WHISPER_MODEL", "base.en"))
    p.add_argument("--quiet-hours", default=env("WALL_QUIET_HOURS", "21:00-06:30"), help='e.g. "21:00-06:30", or "off"')
    p.add_argument("--voice", default=env("WALL_VOICE") or None)
    p.add_argument("--input-device", default=env("WALL_INPUT_DEVICE") or None)
    p.add_argument("--origins", default=env("WALL_ALLOWED_ORIGINS"))
    p.add_argument("--wav", help="read audio from this 16 kHz mono wav instead of the mic (testing)")
    p.add_argument("-v", "--verbose", action="store_true")
    a = p.parse_args()
    logging.basicConfig(level=logging.DEBUG if a.verbose else logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    cfg = Config(port=a.port, wake=not a.no_wake, wake_whisper_model=a.wake_whisper_model, whisper_model=a.whisper_model,
                 quiet_hours=parse_quiet_hours(a.quiet_hours), voice=a.voice, input_device=a.input_device, wav=a.wav,
                 origins=tuple(o.strip() for o in a.origins.split(",")) if a.origins else DEFAULT_ORIGINS)
    asyncio.run(serve(cfg))


if __name__ == "__main__":
    main()
