# Wall listener

The kitchen wall's microphone: a small program on the wall Pi, beside the
kiosk browser. Say **"Hey Symphony"** or **"Hey Sym"**, or tap Tell Symphony
on the wall. It records until you stop, transcribes on the Pi, and hands only
those words to the wall page (`ws://127.0.0.1:8765`). The page saves them
(groceries, scratchpad, Inbox — each with Undo), runs a kitchen command, or
answers a question from what the wall shows, and the reply is spoken.

- **Privacy:** audio never leaves the Pi and is never written to disk. Each
  burst of speech is transcribed by a small model only to check for the name,
  then dropped. The words after the name go to the wall page; questions are
  answered by `wall-ask` from the wall's own on-screen data, and replies are
  voiced by `wall-say` (only the reply text is sent).
- **Off:** the wall's mic button (remembered across reboots), and quiet hours
  (default 21:00–06:30) when the mic is closed — a tap still works.
- **Hardware:** EMEET OfficeCore M0 Plus over USB. Record through PipeWire
  (the default device); reading its ALSA device directly returns silence.

## Try it without the Pi

```
python3.11 -m venv venv && venv/bin/pip install -r requirements.txt
venv/bin/python -m unittest test_listener
venv/bin/python try_clip.py clip.wav --wake      # a 16 kHz mono wav that says "Hey Symphony, …"
```

## Put it on the Pi

`./install.sh` — copies the files, installs gently (see the script), and
starts the `wall-listener` user service. Logs: `journalctl --user -u wall-listener`.
