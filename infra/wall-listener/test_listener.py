"""python -m unittest test_listener   (no microphone, no models)"""

import unittest
from datetime import time

import numpy as np

from endpoint import Endpointer
from wake import match_wake, strip_wake, worth_a_command
from listener import in_quiet_hours, origin_allowed, parse_quiet_hours

FRAME = 1280


def frames(level: float, seconds: float):
    n = int(round(seconds * 16000 / FRAME))
    rng = np.random.default_rng(0)
    for _ in range(n):
        yield (rng.standard_normal(FRAME) * level).astype(np.int16)


class Wake(unittest.TestCase):
    def test_the_name_in_its_spellings(self):
        for said in ["Hey Symphony.", "hey, symphony", "Hey Sym.", "Hey Sim, add milk", "Okay Symphony what's for dinner", "Um, hey Symph."]:
            self.assertIsNotNone(match_wake(said), said)

    def test_the_command_in_the_same_breath(self):
        self.assertEqual(match_wake("Hey Symphony, add milk to the grocery list."), "add milk to the grocery list.")
        self.assertEqual(match_wake("Hey Sym."), "")
        self.assertTrue(worth_a_command("add milk"))
        self.assertFalse(worth_a_command("please"))
        self.assertEqual(strip_wake("Hey Sym, what's after school?"), "what's after school?")
        self.assertEqual(strip_wake("what's after school?"), "what's after school?")

    def test_ordinary_talk_is_not_the_name(self):
        for said in ["We went to the symphony on Friday.", "Simple, just add salt.", "Hey, can you pass the salt?", "Symmetry matters", "", "Hey simply put it there"]:
            self.assertIsNone(match_wake(said), said)


class Endpointing(unittest.TestCase):
    def run_ep(self, parts, floor=None):
        ep = Endpointer(floor=floor)
        for level, secs in parts:
            for f in frames(level, secs):
                v = ep.push(f)
                if v:
                    return v
        return None

    def test_a_turn_ends_after_a_pause(self):
        self.assertEqual(self.run_ep([(2, 0.3), (1500, 1.5), (2, 3.2)], floor=1), "speech")

    def test_a_thinking_pause_does_not_end_the_turn(self):
        # "Add milk … [two seconds] … and eggs": still one turn.
        self.assertIsNone(self.run_ep([(1500, 1.0), (2, 2.0), (1500, 1.0), (2, 2.0)], floor=1))

    def test_nobody_speaks(self):
        self.assertEqual(self.run_ep([(2, 6.5)], floor=1), "silence")

    def test_speech_at_once_after_the_tap_counts(self):
        # The EMEET zeroes the room (~1); speech right away must not become the floor.
        self.assertEqual(self.run_ep([(1500, 1.2), (2, 3.2)], floor=1), "speech")

    def test_never_listens_forever(self):
        self.assertEqual(self.run_ep([(1500, 31)], floor=1), "speech")


class Rules(unittest.TestCase):
    def test_only_the_wall_page_may_connect(self):
        allowed = ("https://app.symphony-os.com",)
        self.assertTrue(origin_allowed("https://app.symphony-os.com", allowed))
        self.assertFalse(origin_allowed("https://app.symphony-os.com.evil.example", allowed))
        self.assertFalse(origin_allowed(None, allowed))

    def test_quiet_hours_across_midnight(self):
        q = parse_quiet_hours("21:00-06:30")
        self.assertEqual(q, (time(21, 0), time(6, 30)))
        self.assertTrue(in_quiet_hours(q, time(23, 15)))
        self.assertTrue(in_quiet_hours(q, time(6, 0)))
        self.assertFalse(in_quiet_hours(q, time(6, 30)))
        self.assertFalse(in_quiet_hours(q, time(15, 0)))
        self.assertFalse(in_quiet_hours(None, time(23, 0)))
        self.assertIsNone(parse_quiet_hours("off"))


if __name__ == "__main__":
    unittest.main()
