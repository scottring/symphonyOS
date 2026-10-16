"""Render Symphony's narrated examples as portable H.264 videos.

Uses Pillow + ffmpeg; no browser automation or family data. Run generate-audio.mjs first.
"""
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import textwrap
import wave
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / 'node_modules/.cache/symphony-horizon-audio'
OUTPUT = ROOT / 'public/onboarding/horizons'
OUTPUT.mkdir(parents=True, exist_ok=True)
PLAN = json.loads((CACHE / 'plan.json').read_text())
CASCADE = json.loads((ROOT / 'src/lib/onboarding/horizonCascade.json').read_text())
W, H, FPS = 1280, 720, 24
BG, INK, GREEN, MUTED = '#edf3f0', '#263e35', '#315f4d', '#60766c'
FONT_DIR = Path('/System/Library/Fonts/Supplemental')
FONTS = {}

def font(size, face='Arial.ttf'):
    key = (size, face)
    if key not in FONTS:
        FONTS[key] = ImageFont.truetype(str(FONT_DIR / face), size)
    return FONTS[key]

def lines(text, max_width, size, face='Arial.ttf'):
    result, current = [], ''
    for word in text.split():
        next_line = f'{current} {word}'.strip()
        if font(size, face).getlength(next_line) > max_width and current:
            result.append(current)
            current = word
        else:
            current = next_line
    if current:
        result.append(current)
    return result

def paragraph(draw, text, xy, width, size, color=INK, face='Arial.ttf', gap=8):
    x, y = xy
    for line in lines(text, width, size, face):
        draw.text((x, y), line, font=font(size, face), fill=color)
        y += size + gap
    return y

def ease(value):
    p = min(1, max(0, value))
    return 1 - (1-p)**3

def chrome(example):
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)
    d.text((64, 30), 'Symphony', font=font(30, 'Georgia.ttf'), fill=GREEN)
    d.text((1030, 39), 'Illustrative example', font=font(18), fill=MUTED)
    x = 64
    for name in ['Year', 'Season', 'Month', 'Week', 'Today']:
        tw = font(19).getlength(name)
        if name == example['name']:
            d.rounded_rectangle((x-14, 88, x+tw+14, 124), radius=18, fill=GREEN)
        d.text((x, 95), name, font=font(19), fill='white' if name == example['name'] else MUTED)
        x += tw + 60
    return im

def base(example):
    im = chrome(example)
    d = ImageDraw.Draw(im)
    d.text((64, 170), example['name'], font=font(58, 'Georgia.ttf'), fill=INK)
    paragraph(d, example['question'], (67, 250), 410, 27, GREEN)
    d.text((67, 336), 'IMAGINE YOU SAY', font=font(15, 'Arial Bold.ttf'), fill=MUTED)
    d.rounded_rectangle((64, 372, 491, 586), radius=22, fill='#dfece5')
    paragraph(d, '“' + example['quote'] + '”', (86, 398), 380, 25, INK, gap=9)
    # Stable list: the list itself never jumps as each line arrives.
    d.rounded_rectangle((546, 178, 1216, 597), radius=22, fill='#dbe5de')
    d.rounded_rectangle((540, 170, 1210, 589), radius=22, fill='white')
    d.text((570, 195), example['listTitle'], font=font(36, 'Georgia.ttf'), fill=INK)
    d.text((572, 245), 'Your own words, given a place', font=font(18), fill=MUTED)
    for i in range(3):
        d.line((574, 364+i*91, 1176, 364+i*91), fill='#e5ebe7', width=1)
    return im

def cascade_frame(example, t):
    im = chrome(example)
    d = ImageDraw.Draw(im)
    paragraph(d, CASCADE['title'], (64, 180), 350, 43, INK, 'Georgia.ttf')
    paragraph(d, CASCADE['description'], (67, 305), 340, 27, GREEN, gap=10)
    paragraph(d, 'One example. You choose the connections.', (67, 479), 340, 23, MUTED)
    for i, row in enumerate(CASCADE['rows']):
        age = t - i*.8
        if age < 0:
            continue
        p = ease(age/.55)
        layer = Image.new('RGBA', (W, H), (0,0,0,0))
        ld = ImageDraw.Draw(layer)
        x, y = 467+i*29, 167+i*86
        if i:
            # The final connector is dotted: Today is a placement of the same
            # weekly activity, not another child task or a duplicated record.
            connector_x = x-15
            for yy in range(y-12, y+35, 7 if i == 4 else 1):
                ld.line((connector_x, yy, connector_x, yy+3), fill='#a4bfb0', width=2)
            ld.line((connector_x, y+35, x-3, y+35), fill='#a4bfb0', width=2)
        active = row['horizon'] == example['name']
        ld.rounded_rectangle((x,y,1210,y+75), radius=13, fill='#dcece2' if active else 'white', outline='#a6c4b3' if active else '#e2eae5', width=2)
        ld.text((x+17,y+10), row['horizon'].upper(), font=font(15,'Arial Bold.ttf'), fill=GREEN)
        ld.text((x+108,y+8), row['title'], font=font(25,'Arial Bold.ttf'), fill=INK)
        ld.text((x+108,y+44), row['detail'], font=font(18), fill=MUTED)
        if p < 1:
            layer.putalpha(layer.getchannel('A').point(lambda a:int(a*p)))
        im = Image.alpha_composite(im.convert('RGBA'),layer).convert('RGB')
    return im

def frame(example, still, starts, total, t):
    im = still.copy()
    for i, item in enumerate(example['items']):
        age = t - starts[i+1]
        if age < 0:
            continue
        p = ease(age / .6)
        layer = Image.new('RGBA', (W, H), (0,0,0,0))
        d = ImageDraw.Draw(layer)
        y = 284+i*91+int((1-p)*12)
        if age < 2.1:
            alpha = int(210 * max(0, 1-age/2.1))
            d.rounded_rectangle((561, y-3, 1191, y+76), radius=12, fill=(219,237,226,alpha))
        d.ellipse((576, y+12, 586, y+22), fill=GREEN)
        count = max(1, math.ceil(len(item['text']) * min(1, age/1.25)))
        d.text((603, y+2), item['text'][:count], font=font(27, 'Arial Bold.ttf'), fill=INK)
        if age > .8:
            d.text((603, y+43), item['detail'], font=font(20), fill=MUTED)
        if p < 1:
            layer.putalpha(layer.getchannel('A').point(lambda a: int(a*p)))
        im = Image.alpha_composite(im.convert('RGBA'), layer).convert('RGB')
    if t >= starts[4]:
        age = t-starts[4]
        im = Image.blend(im, cascade_frame(example, age), ease(age/.5))
    d = ImageDraw.Draw(im)
    takeaway = CASCADE['rule'] if t >= starts[4] else 'From your story to a list you can review.'
    d.rounded_rectangle((64, 625, 1210, 681), radius=14, fill='#e0ebe4')
    d.text((88, 639), takeaway, font=font(24), fill=GREEN)
    d.line((64, 704, 1210, 704), fill='#cfdfd6', width=3)
    d.line((64, 704, 64+1146*min(1,t/total), 704), fill=GREEN, width=3)
    return im

def stamp(seconds):
    ms = round(seconds*1000)
    return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02}.{ms%1000:03}'

def render(example):
    starts, parts, elapsed = [], [], .25
    silence = lambda seconds: b'\x00' * (round(seconds*24000)*2)
    parts.append(silence(.25))
    captions = ['WEBVTT', '']
    for segment in example['segments']:
        starts.append(elapsed)
        pcm = subprocess.check_output(['/opt/homebrew/bin/ffmpeg','-v','error','-i',segment['file'],'-ac','1','-ar','24000','-f','s16le','pipe:1'])
        seconds = len(pcm)/48000
        words = segment['text'].split()
        for offset in range(0,len(words),11):
            end = min(offset+11,len(words))
            captions += [f'{stamp(elapsed+seconds*offset/len(words))} --> {stamp(elapsed+seconds*end/len(words))}', textwrap.fill(' '.join(words[offset:end]),width=46), '']
        parts += [pcm,silence(.35)]
        elapsed += seconds+.35
    parts.append(silence(1.1))
    total = elapsed+1.1
    audio = CACHE / f'{example["id"]}-joined.wav'
    with wave.open(str(audio),'wb') as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(24000); f.writeframes(b''.join(parts))
    # A content hash keeps browser caches honest when narration or artwork changes.
    digest = hashlib.sha256((json.dumps(example,sort_keys=True)+json.dumps(CASCADE,sort_keys=True)+'visual-v2').encode()).hexdigest()[:12]
    stem = f'{example["id"]}.{digest}'
    video, poster, vtt = (OUTPUT / f'{stem}.{ext}' for ext in ['mp4','jpg','vtt'])
    still = base(example)
    frame(example, still, starts, total, total-1).save(poster,quality=93)
    vtt.write_text('\n'.join(captions))
    process = subprocess.Popen(['/opt/homebrew/bin/ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','pipe:0','-i',str(audio),'-c:v','libx264','-preset','fast','-crf','21','-threads','2','-pix_fmt','yuv420p','-c:a','aac','-b:a','96k','-movflags','+faststart','-shortest',str(video)],stdin=subprocess.PIPE)
    try:
        for f in range(math.ceil(total*FPS)):
            process.stdin.write(frame(example, still, starts, total, f/FPS).tobytes())
    finally:
        process.stdin.close()
    if process.wait() != 0:
        raise RuntimeError(f'Video encoding failed: {example["id"]}')
    info = json.loads(subprocess.check_output(['/opt/homebrew/bin/ffprobe','-v','error','-show_streams','-show_format','-of','json',str(video)]))
    assert {s['codec_type'] for s in info['streams']} == {'video','audio'}
    assert total < 65, f'Example too long: {example["id"]}'
    print(f'{example["name"]}: {total:.1f}s, {video.stat().st_size/1e6:.2f} MB',flush=True)
    prefix='/onboarding/horizons/'
    return {'id':example['id'],'name':example['name'],'seconds':round(total,2),'connectionsStart':round(starts[4],2),'voice':PLAN['voice'],'video':prefix+video.name,'poster':prefix+poster.name,'captions':prefix+vtt.name,'bytes':video.stat().st_size}

if __name__ == '__main__':
    manifest = {e['id']:render(e) for e in PLAN['examples']}
    (ROOT/'src/lib/onboarding/horizonVideos.json').write_text(json.dumps(manifest,indent=2)+'\n')
    (CACHE/'render-report.json').write_text(json.dumps({'videos':manifest,'width':W,'height':H,'fps':FPS,'narrationVoice':PLAN['voice'],'model':PLAN['model']},indent=2)+'\n')
