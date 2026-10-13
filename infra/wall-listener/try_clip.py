#!/usr/bin/env python3
"""Try the listener end to end without a microphone.

    python try_clip.py clip.wav [--voice en_US-lessac-medium.onnx] [--say "reply"]

Starts the listener on the clip, connects as the wall page would, presses
Talk, and prints what it heard and how long each part took. A wrong Origin
is refused, which is checked first.
"""

import argparse
import asyncio
import json
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent


async def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("wav")
    p.add_argument("--voice")
    p.add_argument("--say")
    p.add_argument("--port", type=int, default=8799)
    p.add_argument("--whisper-model", default="base.en")
    p.add_argument("--wake", action="store_true", help="don't press Talk: the clip must say the wake phrase")
    p.add_argument("--expect-nothing", action="store_true", help="the clip must NOT wake it")
    a = p.parse_args()

    import websockets

    cmd = [sys.executable, str(HERE / "listener.py"), "--wav", a.wav, "--port", str(a.port), "--whisper-model", a.whisper_model, "--quiet-hours", "off"]
    if a.voice:
        cmd += ["--voice", a.voice]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    url = f"ws://127.0.0.1:{a.port}"
    try:
        for _ in range(100):
            try:
                async with websockets.connect(url, origin="https://evil.example") as ws:
                    await asyncio.wait_for(ws.recv(), 2)
                print("FAIL: a foreign origin was let in")
                return 1
            except websockets.exceptions.ConnectionClosedError:
                print("ok: foreign origin refused")
                break
            except (OSError, asyncio.TimeoutError):
                await asyncio.sleep(0.2)
        async with websockets.connect(url, origin="https://app.symphony-os.com") as ws:
            t0 = time.time()
            while True:
                m = json.loads(await ws.recv())
                if m.get("type") == "state" and m["state"] in ("ready", "muted"):
                    break
            print(f"ready after {time.time() - t0:.1f}s (models loaded)")
            if not a.wake:
                await ws.send(json.dumps({"type": "listen"}))
            t1 = time.time()
            marks = {}
            try:
                while True:
                    m = json.loads(await asyncio.wait_for(ws.recv(), 25 if a.expect_nothing else 60))
                    if m.get("type") == "state":
                        marks.setdefault(m["state"], time.time() - t1)
                    if m.get("type") in ("heard", "nothing", "error"):
                        break
            except asyncio.TimeoutError:
                m = {"type": "timeout"}
            if a.expect_nothing:
                print("ok: did not wake" if m["type"] == "timeout" and "listening" not in marks and "thinking" not in marks else f"FAIL: woke up: {m}")
                return 0
            print("states:", {k: round(v, 2) for k, v in marks.items()})
            print(f"{m.get('type')} after {time.time() - t1:.1f}s:", m.get("text") or m.get("reason") or m.get("message"))
            if a.say:
                t2 = time.time()
                await ws.send(json.dumps({"type": "say", "text": a.say}))
                while True:
                    m = json.loads(await asyncio.wait_for(ws.recv(), 60))
                    if m.get("type") == "state" and m["state"] == "ready":
                        break
                print(f"spoke reply in {time.time() - t2:.1f}s")
        return 0
    finally:
        proc.terminate()
        try:
            _, err = proc.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            _, err = proc.communicate()
        bad = [l for l in (err or "").splitlines() if "Traceback" in l or "Error" in l]
        if bad:
            print("listener stderr:\n" + err[-2000:])


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
