"""Offline macOS speech fixtures. Synthetic acoustic stress is not human/device evidence."""
import array, hashlib, json, math, random, subprocess, tempfile, wave
from pathlib import Path
ROOT = Path(__file__).resolve().parent
manifest = json.loads((ROOT / 'audio-cases.json').read_text())

def speak(text, output, voice='Daniel'):
    subprocess.run(['/usr/bin/say', '-v', voice, '-r', '165', '-o', str(output), '--file-format=WAVE', '--data-format=LEI16@24000', text], check=True, capture_output=True)
    with wave.open(str(output), 'rb') as f:
        assert (f.getnchannels(), f.getsampwidth(), f.getframerate()) == (1, 2, 24000)
        return array.array('h', f.readframes(f.getnframes()))

def write(path, samples):
    with wave.open(str(path), 'wb') as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(24000); f.writeframes(samples.tobytes())

metadata = []
with tempfile.TemporaryDirectory() as tmp:
    for clip in manifest['clips']:
        path = ROOT / clip['file']; path.parent.mkdir(exist_ok=True)
        if clip['id'] == 'silence': samples = array.array('h', [0] * 72000)
        elif clip['id'] == 'thinking-pause':
            samples = speak('Move the plumber call', Path(tmp) / 'one.wav')
            samples.extend([0] * 72000)
            samples.extend(speak('to Friday.', Path(tmp) / 'two.wav'))
        else: samples = speak(clip['reference'], path, 'Karen' if clip['id'] == 'background-noise' else 'Daniel')
        if clip['id'] == 'background-noise':
            rng = random.Random(20261015)
            rms = math.sqrt(sum(x*x for x in samples) / len(samples))
            noise = rms / (10 ** (12/20))
            samples = array.array('h', (max(-32768, min(32767, round(x + rng.gauss(0, noise)))) for x in samples))
        write(path, samples)
        metadata.append({'id': clip['id'], 'seconds': len(samples)/24000, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'provenance': clip['provenance'], 'voice': 'none' if clip['id'] == 'silence' else 'Karen' if clip['id'] == 'background-noise' else 'Daniel'})
(ROOT / 'audio-fixtures' / 'manifest.json').write_text(json.dumps(metadata, indent=2) + '\n')
print(f'Generated {len(metadata)} synthetic clips, {sum(x["seconds"] for x in metadata):.1f} seconds per model. No provider calls.')
