"""When to stop listening: after the person stops speaking.

Energy based, against the room's own noise floor: a kitchen has a fridge, a
dishwasher, a TV. Speech is a frame well above the floor; the turn ends after
a pause once speech has started, or gives up if nobody speaks.
"""

from __future__ import annotations

from typing import Optional

import numpy as np


class Endpointer:
    def __init__(self, rate: int = 16000, frame: int = 1280, *, pause_s: float = 0.9, start_timeout_s: float = 4.0,
                 max_s: float = 10.0, min_speech_s: float = 0.25, ratio: float = 3.0, floor_min: float = 120.0,
                 floor: Optional[float] = None):
        """`floor`: the room's level just before the trigger, if known — so
        speech that starts at once is not taken for the room."""
        self.frame_s = frame / rate
        self.pause = int(round(pause_s / self.frame_s))
        self.start_timeout = int(round(start_timeout_s / self.frame_s))
        self.max = int(round(max_s / self.frame_s))
        self.min_speech = max(1, int(round(min_speech_s / self.frame_s)))
        self.ratio = ratio
        self.floor_min = floor_min
        self.floor: Optional[float] = max(floor, floor_min) if floor is not None else None
        self.n = 0
        self.speech = 0
        self.quiet = 0

    @staticmethod
    def rms(frame: np.ndarray) -> float:
        f = frame.astype(np.float32)
        return float(np.sqrt(np.mean(f * f))) if f.size else 0.0

    def push(self, frame: np.ndarray) -> Optional[str]:
        """Feed one frame. Returns None to keep listening, or why it stopped:
        "speech" (a complete turn), "silence" (nobody spoke)."""
        self.n += 1
        level = self.rms(frame)
        if self.floor is None:
            self.floor = max(level, self.floor_min)
        loud = level > max(self.floor * self.ratio, self.floor_min * self.ratio)
        if loud:
            self.speech += 1
            self.quiet = 0
        else:
            self.quiet += 1
            # The floor follows the room while nobody is talking.
            self.floor = max(self.floor_min, 0.95 * self.floor + 0.05 * level)
        if self.speech >= self.min_speech and self.quiet >= self.pause:
            return "speech"
        if self.speech < self.min_speech and self.n >= self.start_timeout:
            return "silence"
        if self.n >= self.max:
            return "speech" if self.speech >= self.min_speech else "silence"
        return None
