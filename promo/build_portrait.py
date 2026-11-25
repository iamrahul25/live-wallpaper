"""Build the Day 1 portrait (1080x1920, 9:16) promo edit.

Same timeline as build_landscape.py:
  0.0 - 3.0   intro card, crossfades into
  2.5 - 76.5  pond footage (source 3.8 - 77.8), a 9:16 window that follows the koi (crop_path.json)
  76.0 - 82.5 outro card, fade to black
Step 1 renders the moving crop to pond_portrait.mp4 (sub-pixel pan, Lanczos upscale).
Step 2 adds the cards, section titles, captions and the voiceover.

Usage: python build_portrait.py <source.mp4> <voice.mp3> <words.json> <out.mp4>
"""
import json, os, re, subprocess, sys
import cv2, numpy as np

SRC, VOICE, WORDS, OUT = sys.argv[1:5]
SRC_IN, SRC_OUT = 3.8, 77.8
INTRO, OUTRO, XF = 3.0, 6.5, 0.5
VOICE_DELAY = 0.4
POND_START = INTRO - XF
POND_LEN = SRC_OUT - SRC_IN
OUTRO_START = POND_START + POND_LEN - XF
TOTAL = OUTRO_START + OUTRO
OW, OH = 1080, 1920
SCRIPT = "day1-v2-full.txt"
ff = "ffmpeg"

# ---------------- step 1: moving crop ----------------
if not os.path.exists("pond_portrait.mp4") or "--recrop" in sys.argv:
    path = json.load(open("crop_path.json"))
    xs, cw = path["x"], path["cw"]
    s = OW / cw
    cap = cv2.VideoCapture(SRC)
    cap.set(cv2.CAP_PROP_POS_MSEC, SRC_IN * 1000)
    enc = subprocess.Popen([ff, "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{OW}x{OH}",
                            "-r", "60", "-i", "-", "-c:v", "libx264", "-preset", "fast", "-crf", "14",
                            "-pix_fmt", "yuv420p", "pond_portrait.mp4"], stdin=subprocess.PIPE)
    for i, x in enumerate(xs):
        ok, f = cap.read()
        if not ok:
            break
        M = np.float32([[s, 0, -x * s], [0, s, 0]])
        o = cv2.warpAffine(f, M, (OW, OH), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)
        enc.stdin.write(o.tobytes())
        if i % 600 == 0:
            print(f"crop {i}/{len(xs)}", flush=True)
    enc.stdin.close()
    enc.wait()


# ---------------- step 2: text ----------------
def ts(v):
    cs = int(round(max(v, 0) * 100))
    return f"{cs // 360000}:{cs // 6000 % 60:02}:{cs // 100 % 60:02}.{cs % 100:02}"


words = json.load(open(WORDS, encoding="utf-8"))
tokens = open(SCRIPT, encoding="utf-8").read().split()
ti, rich = 0, []
for a, b, w in words:
    tok = w
    for j in range(ti, min(ti + 4, len(tokens))):
        if re.sub(r"\W", "", tokens[j]).lower().startswith(re.sub(r"\W", "", w).lower()[:3]):
            tok, ti = tokens[j], j + 1
            break
    rich.append((a + VOICE_DELAY, b + VOICE_DELAY, tok))

# short punchy chunks for a narrow frame
chunks, cur = [], []
for k, (a, b, t) in enumerate(rich):
    cur.append((a, b, t))
    text = " ".join(x[2] for x in cur)
    gap = rich[k + 1][0] - b if k + 1 < len(rich) else 9
    if t[-1] in ".!?:," or len(cur) >= 4 or len(text) > 20 or gap > 0.45:
        chunks.append(cur)
        cur = []
if cur:
    chunks.append(cur)
# no orphan one-word captions like "me." - fold them into the previous chunk
merged = []
for c in chunks:
    if merged and len(c) == 1 and len(c[0][2]) <= 4 and c[0][0] - merged[-1][-1][1] < 0.3:
        merged[-1] = merged[-1] + c
    else:
        merged.append(c)
chunks = merged
caps = []
for i, c in enumerate(chunks):
    a, b = c[0][0], c[-1][1]
    b = chunks[i + 1][0][0] if i + 1 < len(chunks) and chunks[i + 1][0][0] - b < 0.5 else b + 0.25
    caps.append((a, b, " ".join(x[2] for x in c)))


def at(phrase):
    p = phrase.lower().split()
    flat = [re.sub(r"\W", "", x[2]).lower() for x in rich]
    for i in range(len(flat)):
        if flat[i:i + len(p)] == p:
            return rich[i][0]
    raise SystemExit(f"phrase not found: {phrase}")


sections = [
    (at("just click anywhere"), at("if the food lands"),  "Click to feed the koi"),
    (at("if the food lands"),   at("ive also added"),     "Lotus leaves react"),
    (at("ive also added"),      at("you can customize"),  r"Ripples · Bubbles · Shadows"),
    (at("you can customize"),   at("but this is"),        r"Fish count · up to 144 FPS\NLow → Ultra quality"),
    (at("but this is"),         at("and one more thing"), r"Coming next\NDay & Night · Rain"),
    (at("and one more thing"),  OUTRO_START + 0.2,        "Looking for a co-builder"),
]

ass = [
    "[Script Info]", "ScriptType: v4.00+", f"PlayResX: {OW}", f"PlayResY: {OH}", "WrapStyle: 0", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
    "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Cap,Segoe UI Black,74,&H00FFFFFF,&H00FFFFFF,&H00101010,&H90000000,0,0,0,0,100,100,0,0,1,5,2,2,70,70,560,1",
    "Style: Sec,Segoe UI Semibold,46,&H00FFFFFF,&H00FFFFFF,&H5A1F2A14,&H5A1F2A14,0,0,0,0,100,100,1,0,3,18,0,8,70,70,250,1",
    "Style: Big,Segoe UI Black,190,&H00FFFFFF,&H00FFFFFF,&H00101010,&H80000000,0,0,0,0,100,100,2,0,1,5,3,5,60,60,0,1",
    "Style: Mid,Segoe UI Semibold,80,&H00F2E6C8,&H00FFFFFF,&H00101010,&H80000000,0,0,0,0,100,100,1,0,1,4,2,5,60,60,0,1",
    "Style: Small,Segoe UI,44,&H00DDDDDD,&H00FFFFFF,&H00101010,&H80000000,0,0,0,0,100,100,1,0,1,2,1,5,60,60,0,1",
    "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
]
ev = lambda st, a, b, txt, layer=0: ass.append(f"Dialogue: {layer},{ts(a)},{ts(b)},{st},,0,0,0,,{txt}")

ev("Big", 0.15, INTRO - 0.1, r"{\fad(350,300)\pos(540,800)}Day 1", 1)
ev("Mid", 0.35, INTRO - 0.1, r"{\fad(350,300)\pos(540,975)}Building in Public", 1)
ev("Small", 0.55, INTRO - 0.1, r"{\fad(350,300)\pos(540,1070)}Koi Pond · interactive live wallpaper", 1)
o = OUTRO_START + 0.35
ev("Mid", o, TOTAL - 0.4, r"{\fad(450,500)\pos(540,780)\fs96}Let's build\Nsomething together", 1)
ev("Small", o + 0.3, TOTAL - 0.4, r"{\fad(450,500)\pos(540,960)\fs50}Android · Desktop · Products", 1)
ev("Mid", o + 0.6, TOTAL - 0.4, r"{\fad(450,500)\pos(540,1080)\fs72}DM me", 1)
for a, b, txt in sections:
    ev("Sec", a, b - 0.15, r"{\fad(300,300)}" + txt, 1)
for a, b, txt in caps:
    ev("Cap", a, b, txt.replace("{", "(").replace("}", ")"), 2)
open("portrait.ass", "w", encoding="utf-8-sig").write("\n".join(ass) + "\n")

# ---------------- step 2: compose ----------------
subprocess.run([ff, "-y", "-v", "error", "-ss", str(SRC_IN), "-i", SRC, "-frames:v", "1", "intro.png"], check=True)
subprocess.run([ff, "-y", "-v", "error", "-ss", str(SRC_OUT - 0.05), "-i", SRC, "-frames:v", "1", "outro.png"], check=True)
card = (f"scale=-2:{OH},crop={OW}:{OH},boxblur=28:2,eq=brightness=-0.22:saturation=0.85,"
        "fps=60,format=yuv420p,setsar=1,settb=1/60")
fc = (
    f"[1:v]{card},trim=duration={INTRO},setpts=PTS-STARTPTS[intro];"
    f"[0:v]setpts=PTS-STARTPTS,unsharp=5:5:0.45,fps=60,format=yuv420p,setsar=1,settb=1/60[pond];"
    f"[2:v]{card},trim=duration={OUTRO},setpts=PTS-STARTPTS[outro];"
    f"[intro][pond]xfade=transition=fade:duration={XF}:offset={INTRO - XF}[a];"
    f"[a][outro]xfade=transition=fade:duration={XF}:offset={OUTRO_START}[b];"
    f"[b]fade=t=in:st=0:d=0.4,fade=t=out:st={TOTAL - 0.9}:d=0.9,subtitles=portrait.ass[v];"
    f"[3:a]adelay={int(VOICE_DELAY * 1000)}:all=1,apad,atrim=duration={TOTAL},"
    f"loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=out:st={TOTAL - 0.6}:d=0.6,aresample=48000[aout]"
)
subprocess.run([ff, "-y", "-v", "error", "-stats",
                "-i", "pond_portrait.mp4",
                "-loop", "1", "-t", str(INTRO + 1), "-i", "intro.png",
                "-loop", "1", "-t", str(OUTRO + 1), "-i", "outro.png",
                "-i", VOICE,
                "-filter_complex", fc, "-map", "[v]", "-map", "[aout]",
                "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "60",
                "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-t", str(TOTAL), OUT], check=True)
print("captions:", len(caps), " total:", TOTAL)
