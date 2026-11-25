"""Build the Day 1 landscape (1920x1080) promo edit.

Timeline (seconds):
  0.0 - 3.0   intro card (blurred pond still + "Day 1 / Building in Public"), crossfades into
  2.5 - 76.5  pond footage, source 3.8 - 77.8 (OBS window and taskbar cut off)
  76.0 - 82.5 outro card (blurred pond still + call to action), fade to black at the end
  voiceover starts at VOICE_DELAY; word-synced captions + section titles burned in via ASS.

Usage: python build_landscape.py <source.mp4> <voice.mp3> <words.json> <out.mp4>
"""
import json, re, subprocess, sys

SRC, VOICE, WORDS, OUT = sys.argv[1:5]
SRC_IN, SRC_OUT = 3.8, 77.8
INTRO, OUTRO, XF = 3.0, 6.5, 0.5
VOICE_DELAY = 0.4
POND_START = INTRO - XF                               # 2.5
POND_LEN = SRC_OUT - SRC_IN                           # 74
OUTRO_START = POND_START + POND_LEN - XF              # 76.0
TOTAL = OUTRO_START + OUTRO                           # 82.5
SCRIPT = "day1-v2-full.txt"


def ts(s):
    cs = int(round(max(s, 0) * 100))
    return f"{cs // 360000}:{cs // 6000 % 60:02}:{cs // 100 % 60:02}.{cs % 100:02}"


# ---- captions: word timings, punctuation recovered from the script text
words = json.load(open(WORDS, encoding="utf-8"))
tokens = open(SCRIPT, encoding="utf-8").read().split()
ti, rich = 0, []
for s, e, w in words:
    tok = w
    for j in range(ti, min(ti + 4, len(tokens))):
        if re.sub(r"\W", "", tokens[j]).lower().startswith(re.sub(r"\W", "", w).lower()[:3]):
            tok, ti = tokens[j], j + 1
            break
    rich.append((s + VOICE_DELAY, e + VOICE_DELAY, tok))

chunks, cur = [], []
for k, (s, e, t) in enumerate(rich):
    cur.append((s, e, t))
    text = " ".join(x[2] for x in cur)
    gap = rich[k + 1][0] - e if k + 1 < len(rich) else 9
    if t[-1] in ".!?:," or len(cur) >= 6 or len(text) > 34 or gap > 0.45:
        chunks.append(cur)
        cur = []
if cur:
    chunks.append(cur)

cap_events = []
for i, c in enumerate(chunks):
    start, end = c[0][0], c[-1][1]
    if i + 1 < len(chunks) and chunks[i + 1][0][0] - end < 0.5:
        end = chunks[i + 1][0][0]                    # no flicker between close chunks
    else:
        end += 0.25
    cap_events.append((start, end, " ".join(x[2] for x in c)))

# ---- section titles (timeline seconds), timed to the narration
def at(phrase):
    p = phrase.lower().split()
    flat = [re.sub(r"\W", "", x[2]).lower() for x in rich]
    for i in range(len(flat)):
        if flat[i:i + len(p)] == p:
            return rich[i][0]
    raise SystemExit(f"phrase not found: {phrase}")

sections = [
    (at("just click anywhere"),   at("if the food lands"),   "Click to feed the koi"),
    (at("if the food lands"),     at("ive also added"),      "Lotus leaves react"),
    (at("ive also added"),        at("you can customize"),   "Ripples  ·  Bubbles  ·  Shadows"),
    (at("you can customize"),     at("but this is"),         "Fish count  ·  up to 144 FPS  ·  Low → Ultra"),
    (at("but this is"),           at("and one more thing"),  "Coming next: Day & Night  ·  Rain"),
    (at("and one more thing"),    OUTRO_START + 0.2,         "Looking for a co-builder"),
]

ass = [
    "[Script Info]", "ScriptType: v4.00+", "PlayResX: 1920", "PlayResY: 1080", "WrapStyle: 0", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
    "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Cap,Segoe UI Semibold,54,&H00FFFFFF,&H00FFFFFF,&H00101010,&H90000000,0,0,0,0,100,100,0,0,1,3.2,1.5,2,200,200,70,1",
    "Style: Sec,Segoe UI Semibold,44,&H00FFFFFF,&H00FFFFFF,&H5A1F2A14,&H5A1F2A14,0,0,0,0,100,100,1,0,3,16,0,8,200,200,48,1",
    "Style: Big,Segoe UI Black,150,&H00FFFFFF,&H00FFFFFF,&H00101010,&H80000000,0,0,0,0,100,100,2,0,1,4,3,5,100,100,0,1",
    "Style: Mid,Segoe UI Semibold,64,&H00F2E6C8,&H00FFFFFF,&H00101010,&H80000000,0,0,0,0,100,100,1,0,1,3,2,5,100,100,0,1",
    "Style: Small,Segoe UI,38,&H00DDDDDD,&H00FFFFFF,&H00101010,&H80000000,0,0,0,0,100,100,1,0,1,2,1,5,100,100,0,1",
    "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
]
ev = lambda st, a, b, txt, layer=0: ass.append(f"Dialogue: {layer},{ts(a)},{ts(b)},{st},,0,0,0,,{txt}")

# intro card
ev("Big", 0.15, INTRO - 0.1, r"{\fad(350,300)\pos(960,440)}Day 1", 1)
ev("Mid", 0.35, INTRO - 0.1, r"{\fad(350,300)\pos(960,585)}Building in Public", 1)
ev("Small", 0.55, INTRO - 0.1, r"{\fad(350,300)\pos(960,665)}Koi Pond  ·  interactive live wallpaper", 1)
# outro card
o = OUTRO_START + 0.35
ev("Mid", o, TOTAL - 0.4, r"{\fad(450,500)\pos(960,430)\fs88}Let's build something together", 1)
ev("Small", o + 0.3, TOTAL - 0.4, r"{\fad(450,500)\pos(960,540)\fs46}Android  ·  Desktop  ·  Products", 1)
ev("Mid", o + 0.6, TOTAL - 0.4, r"{\fad(450,500)\pos(960,640)\fs58}DM me", 1)
# section titles during the pond footage
for a, b, txt in sections:
    ev("Sec", a, b - 0.15, r"{\fad(300,300)}" + txt, 1)
# captions
for a, b, txt in cap_events:
    ev("Cap", a, b, txt.replace("{", "(").replace("}", ")"), 2)
open("landscape.ass", "w", encoding="utf-8-sig").write("\n".join(ass) + "\n")

# ---- stills for the cards
ff = "ffmpeg"
subprocess.run([ff, "-y", "-v", "error", "-ss", str(SRC_IN), "-i", SRC, "-frames:v", "1", "intro.png"], check=True)
subprocess.run([ff, "-y", "-v", "error", "-ss", str(SRC_OUT - 0.05), "-i", SRC, "-frames:v", "1", "outro.png"], check=True)

card = "scale=1920:1080,boxblur=24:2,eq=brightness=-0.22:saturation=0.85,fps=60,format=yuv420p,setsar=1,settb=1/60"
fc = (
    f"[1:v]{card},trim=duration={INTRO},setpts=PTS-STARTPTS[intro];"
    f"[0:v]trim=start={SRC_IN}:end={SRC_OUT},setpts=PTS-STARTPTS,fps=60,format=yuv420p,setsar=1,settb=1/60[pond];"
    f"[2:v]{card},trim=duration={OUTRO},setpts=PTS-STARTPTS[outro];"
    f"[intro][pond]xfade=transition=fade:duration={XF}:offset={INTRO - XF}[a];"
    f"[a][outro]xfade=transition=fade:duration={XF}:offset={OUTRO_START}[b];"
    f"[b]fade=t=in:st=0:d=0.4,fade=t=out:st={TOTAL - 0.9}:d=0.9,subtitles=landscape.ass[v];"
    f"[3:a]adelay={int(VOICE_DELAY * 1000)}:all=1,apad,atrim=duration={TOTAL},"
    f"loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=out:st={TOTAL - 0.6}:d=0.6,aresample=48000[aout]"
)
cmd = [ff, "-y", "-v", "error", "-stats",
       "-i", SRC,
       "-loop", "1", "-t", str(INTRO + 1), "-i", "intro.png",
       "-loop", "1", "-t", str(OUTRO + 1), "-i", "outro.png",
       "-i", VOICE,
       "-filter_complex", fc, "-map", "[v]", "-map", "[aout]",
       "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "60",
       "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-t", str(TOTAL), OUT]
subprocess.run(cmd, check=True)
print("sections:", [(round(a, 1), round(b, 1), t) for a, b, t in sections])
print("captions:", len(cap_events), " total:", TOTAL)
