"""Day 1 SHORT edit (< 60 s), landscape or portrait.

Voice is re-ordered from day1-v3-voice-US.mp3 using its word timings:
  A  "Today, I want to show you ... interactive Koi Fish wallpaper."   (hook first)
  B  "Hey everyone! Welcome to Day 1 of building in public."
  C  "Just click anywhere ... raindrops create ripples across the water."
  ("And one more thing" onwards is dropped.)
Picture: pond from the very first second (source 3.8 s on), "Day 1 / Building in Public" title over
the pond while B is spoken, section labels + word-synced captions, short end card, fade out.

Usage: python build_short.py landscape|portrait <source.mp4> <out.mp4>
Portrait reuses pond_portrait.mp4 (the moving 9:16 crop that starts at source 3.8 s).
"""
import json, re, subprocess, sys

MODE, SRC, OUT = sys.argv[1:4]
P = MODE == "portrait"
VOICE, WORDS, SCRIPT = "day1-v3-voice-US.mp3", "day1-v3-voice-words.json", "day1-v2-full.txt"
SRC_IN = 3.8
VOICE_DELAY, G1, G2 = 0.3, 0.30, 0.15
OUTRO, XF = 3.5, 0.5
OW, OH = (1080, 1920) if P else (1920, 1080)
ff = "ffmpeg"

words = json.load(open(WORDS, encoding="utf-8"))
idx = lambda w, start=0: next(i for i in range(start, len(words)) if words[i][2] == w)
i_today, i_just = idx("Today"), idx("Just")
i_more = next(i for i in range(len(words) - 2) if [w[2] for w in words[i:i + 3]] == ["And", "one", "more"])
cut = lambda i: (words[i - 1][1] + words[i][0]) / 2
tA0, tA1 = cut(i_today), cut(i_just)
tB0, tB1 = 0.0, cut(i_today)
tC0, tC1 = cut(i_just), cut(i_more)
segs = [(tA0, tA1), (tB0, tB1), (tC0, tC1)]
offs, o = [], VOICE_DELAY
for k, (a, b) in enumerate(segs):
    offs.append(o)
    o += (b - a) + (G1 if k == 0 else G2 if k == 1 else 0)
VOICE_END = o
OUTRO_START = VOICE_END + 0.25
TOTAL = OUTRO_START + OUTRO
POND_LEN = OUTRO_START + XF


def remap(t):
    for (a, b), off in zip(segs, offs):
        if a <= t < b:
            return off + (t - a)
    return None


# captions: recover punctuation in original order, then move each word to its new time
tokens = open(SCRIPT, encoding="utf-8").read().split()
ti, rich = 0, []
for a, b, w in words:
    tok = w
    for j in range(ti, min(ti + 4, len(tokens))):
        if re.sub(r"\W", "", tokens[j]).lower().startswith(re.sub(r"\W", "", w).lower()[:3]):
            tok, ti = tokens[j], j + 1
            break
    na = remap(a)
    if na is not None:
        rich.append((na, na + (b - a), tok))
rich.sort()

maxw, maxc = (4, 20) if P else (6, 34)
chunks, cur = [], []
for k, (a, b, t) in enumerate(rich):
    cur.append((a, b, t))
    gap = rich[k + 1][0] - b if k + 1 < len(rich) else 9
    if t[-1] in ".!?:," or len(cur) >= maxw or len(" ".join(x[2] for x in cur)) > maxc or gap > 0.45:
        chunks.append(cur)
        cur = []
if cur:
    chunks.append(cur)
merged = []
for c in chunks:
    if merged and len(c) == 1 and len(c[0][2]) <= 4 and c[0][0] - merged[-1][-1][1] < 0.3:
        merged[-1] = merged[-1] + c
    else:
        merged.append(c)
caps = []
for i, c in enumerate(merged):
    a, b = c[0][0], c[-1][1]
    b = merged[i + 1][0][0] if i + 1 < len(merged) and merged[i + 1][0][0] - b < 0.5 else b + 0.25
    caps.append((a, b, " ".join(x[2] for x in c)))


def at(phrase):
    p = phrase.lower().split()
    flat = [re.sub(r"\W", "", x[2]).lower() for x in rich]
    for i in range(len(flat)):
        if flat[i:i + len(p)] == p:
            return rich[i][0]
    raise SystemExit(f"phrase not found: {phrase}")


NL = r"\N" if P else "  ·  "
sections = [
    (at("just click anywhere"), at("if the food lands"),  "Click to feed the koi"),
    (at("if the food lands"),   at("ive also added"),     "Lotus leaves react"),
    (at("ive also added"),      at("you can customize"),  "Ripples · Bubbles · Shadows"),
    (at("you can customize"),   at("but this is"),        "Fish count · up to 144 FPS" + NL + "Low → Ultra quality"),
    (at("but this is"),         VOICE_END + 0.1,          "Coming next" + (r"\N" if P else ": ") + "Day & Night · Rain"),
]
day1_a, day1_b = offs[1], offs[1] + (tB1 - tB0)

ts = lambda v: (lambda cs: f"{cs // 360000}:{cs // 6000 % 60:02}:{cs // 100 % 60:02}.{cs % 100:02}")(int(round(max(v, 0) * 100)))
if P:
    styles = [
        "Style: Cap,Segoe UI Black,74,&H00FFFFFF,&H00FFFFFF,&H00101010,&H90000000,0,0,0,0,100,100,0,0,1,5,2,2,70,70,560,1",
        "Style: Sec,Segoe UI Semibold,46,&H00FFFFFF,&H00FFFFFF,&H5A1F2A14,&H5A1F2A14,0,0,0,0,100,100,1,0,3,18,0,8,70,70,250,1",
        "Style: Big,Segoe UI Black,190,&H00FFFFFF,&H00FFFFFF,&H00101010,&H80000000,0,0,0,0,100,100,2,0,1,6,4,5,60,60,0,1",
        "Style: Mid,Segoe UI Semibold,80,&H00F2E6C8,&H00FFFFFF,&H00101010,&H80000000,0,0,0,0,100,100,1,0,1,4,3,5,60,60,0,1",
        "Style: Small,Segoe UI,44,&H00DDDDDD,&H00FFFFFF,&H00101010,&H80000000,0,0,0,0,100,100,1,0,1,2,1,5,60,60,0,1",
    ]
    pos = dict(big=(540, 760), mid=(540, 935), o1=(540, 820), o2=(540, 965), o3=(540, 1060))
else:
    styles = [
        "Style: Cap,Segoe UI Semibold,54,&H00FFFFFF,&H00FFFFFF,&H00101010,&H90000000,0,0,0,0,100,100,0,0,1,3.2,1.5,2,200,200,70,1",
        "Style: Sec,Segoe UI Semibold,44,&H00FFFFFF,&H00FFFFFF,&H5A1F2A14,&H5A1F2A14,0,0,0,0,100,100,1,0,3,16,0,8,200,200,48,1",
        "Style: Big,Segoe UI Black,150,&H00FFFFFF,&H00FFFFFF,&H00101010,&H80000000,0,0,0,0,100,100,2,0,1,5,4,5,100,100,0,1",
        "Style: Mid,Segoe UI Semibold,64,&H00F2E6C8,&H00FFFFFF,&H00101010,&H80000000,0,0,0,0,100,100,1,0,1,3.5,3,5,100,100,0,1",
        "Style: Small,Segoe UI,38,&H00DDDDDD,&H00FFFFFF,&H00101010,&H80000000,0,0,0,0,100,100,1,0,1,2,1,5,100,100,0,1",
    ]
    pos = dict(big=(960, 440), mid=(960, 585), o1=(960, 450), o2=(960, 570), o3=(960, 650))
ass = ["[Script Info]", "ScriptType: v4.00+", f"PlayResX: {OW}", f"PlayResY: {OH}", "WrapStyle: 0", "", "[V4+ Styles]",
       "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
       "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
       *styles, "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"]
ev = lambda st, a, b, txt, layer=0: ass.append(f"Dialogue: {layer},{ts(a)},{ts(b)},{st},,0,0,0,,{txt}")
p = lambda k: r"\pos(%d,%d)" % pos[k]

# "Day 1 / Building in Public" title over the pond while B is spoken
ev("Big", day1_a - 0.1, day1_b + 0.3, r"{\fad(300,350)" + p("big") + "}Day 1", 1)
ev("Mid", day1_a + 0.1, day1_b + 0.3, r"{\fad(300,350)" + p("mid") + "}Building in Public", 1)
# end card
o = OUTRO_START + 0.3
ev("Big", o, TOTAL - 0.3, r"{\fad(400,450)" + p("o1") + r"\fs" + ("130" if P else "120") + "}Koi Pond", 1)
ev("Small", o + 0.2, TOTAL - 0.3, r"{\fad(400,450)" + p("o2") + "}interactive live wallpaper", 1)
ev("Mid", o + 0.4, TOTAL - 0.3, r"{\fad(400,450)" + p("o3") + r"\fs" + ("60" if P else "50") + "}Day 1 · Building in Public", 1)
for a, b, txt in sections:
    ev("Sec", a, b - 0.15, r"{\fad(300,300)}" + txt, 1)
for a, b, txt in caps:
    if not (day1_a - 0.05 <= a < day1_b):            # the big title already says it
        ev("Cap", a, b, txt, 2)
assf = f"short_{MODE}.ass"
open(assf, "w", encoding="utf-8-sig").write("\n".join(ass) + "\n")

# ---- compose
end_src = SRC_IN + POND_LEN
subprocess.run([ff, "-y", "-v", "error", "-ss", str(end_src - 0.05), "-i", SRC, "-frames:v", "1", "short_outro.png"], check=True)
if P:
    pond_in = ["-i", "pond_portrait.mp4"]
    pond = f"[0:v]trim=duration={POND_LEN},setpts=PTS-STARTPTS,unsharp=5:5:0.45,fps=60,format=yuv420p,setsar=1,settb=1/60[pond];"
    card = f"scale=-2:{OH},crop={OW}:{OH},boxblur=28:2"
else:
    pond_in = ["-ss", str(SRC_IN), "-t", str(POND_LEN + 0.5), "-i", SRC]
    pond = f"[0:v]trim=duration={POND_LEN},setpts=PTS-STARTPTS,fps=60,format=yuv420p,setsar=1,settb=1/60[pond];"
    card = "scale=1920:1080,boxblur=24:2"
card += ",eq=brightness=-0.22:saturation=0.85,fps=60,format=yuv420p,setsar=1,settb=1/60"
(a0, a1), (b0, b1), (c0, c1) = segs
fc = (
    pond
    + f"[1:v]{card},trim=duration={OUTRO},setpts=PTS-STARTPTS[outro];"
    + f"[pond][outro]xfade=transition=fade:duration={XF}:offset={OUTRO_START}[b];"
    + f"[b]fade=t=in:st=0:d=0.3,fade=t=out:st={TOTAL - 0.8}:d=0.8,subtitles={assf}[v];"
    + "[2:a]asplit=3[sa][sb][sc];"
    + f"[sa]atrim={a0}:{a1},asetpts=PTS-STARTPTS,afade=t=out:st={a1 - a0 - 0.05}:d=0.05[va];"
    + f"[sb]atrim={b0}:{b1},asetpts=PTS-STARTPTS,afade=t=out:st={b1 - b0 - 0.05}:d=0.05[vb];"
    + f"[sc]atrim={c0}:{c1},asetpts=PTS-STARTPTS,afade=t=out:st={c1 - c0 - 0.1}:d=0.1[vc];"
    + f"aevalsrc=0:d={G1}:s=24000[g1];aevalsrc=0:d={G2}:s=24000[g2];"
    + "[va][g1][vb][g2][vc]concat=n=5:v=0:a=1,"
    + f"adelay={int(VOICE_DELAY * 1000)}:all=1,apad,atrim=duration={TOTAL},"
    + f"loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=out:st={TOTAL - 0.6}:d=0.6,aresample=48000[aout]"
)
subprocess.run([ff, "-y", "-v", "error", "-stats", *pond_in,
                "-loop", "1", "-t", str(OUTRO + 1), "-i", "short_outro.png", "-i", VOICE,
                "-filter_complex", fc, "-map", "[v]", "-map", "[aout]",
                "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "60",
                "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-t", str(TOTAL), OUT], check=True)
print(f"{MODE}: total {TOTAL:.2f}s, voice ends {VOICE_END:.2f}s, Day 1 title {day1_a:.1f}-{day1_b:.1f}s")
print("sections:", [(round(a, 1), t) for a, b, t in sections])
