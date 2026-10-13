"""Is this the wall's name? "Hey Symphony" and "Hey Sym" (Scott, 2026-10-13).

The listener transcribes each short burst of speech with a small, fast model
on the Pi and keeps it only if it starts with the wake phrase; anything else
is dropped on the spot (never stored, never sent). Whisper spells the short
name several ways ("Hey Sim.", "Hey, Symph"), so all of them count.
"""

from __future__ import annotations

import re
from typing import Optional

WAKE_LABEL = "Hey Symphony"

_GREETING = r"(?:hey|hay|hi|okay|ok|a)"
_NAME = r"(?:symphony|symphonie|symfony|simphony|simfony|symph|sym|sim|simm|symm)"
_WAKE = re.compile(rf"^\W*(?:(?:um|uh|so)\W+)?{_GREETING}\W+{_NAME}\b\W*(.*)$", re.IGNORECASE | re.DOTALL)


def match_wake(text: str) -> Optional[str]:
    """The words after the wake phrase ("" when it was only the name), or
    None when the burst did not start with it."""
    m = _WAKE.match(text or "")
    if not m:
        return None
    return m.group(1).strip()


def strip_wake(text: str) -> str:
    """The command alone, if the transcript still begins with the name."""
    rest = match_wake(text)
    return text.strip() if rest is None else rest


def worth_a_command(rest: str) -> bool:
    """Did they say the command in the same breath ("Hey Symphony, add milk")?"""
    return len(re.findall(r"[A-Za-z0-9']+", rest)) >= 2
