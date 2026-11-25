"""Find where the koi action is, frame by frame, and plan a smooth 9:16 camera path.

Writes crop_path.json: {"fps": 60, "x": [left edge of the 607.5-px-wide crop, per output frame]}
and crop_path.png (target vs smoothed path) for a quick visual check.
Usage: python track_action.py <source.mp4> <start_s> <end_s>
"""
import json, sys
import cv2, numpy as np

SRC, T0, T1 = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
W, H, FPS = 1920, 1080, 60
CW = H * 9 / 16                     # 607.5
SC = 4                              # analysis downscale
STEP = 3                            # analyse every 3rd frame (20 Hz)
ICON_X = 150 // SC                  # desktop icon column: never counts as action

cap = cv2.VideoCapture(SRC)
cap.set(cv2.CAP_PROP_POS_MSEC, T0 * 1000)
n_frames = int(round((T1 - T0) * FPS))
small = []
for i in range(n_frames):
    ok, f = cap.read()
    if not ok:
        break
    if i % STEP == 0:
        small.append(cv2.resize(f, (W // SC, H // SC), interpolation=cv2.INTER_AREA))
n_frames = min(n_frames, len(small) * STEP)

# static background (rocks, lotus, icons) = per-pixel median over the clip
bg = np.median(np.stack(small[:: max(1, len(small) // 80)]), axis=0).astype(np.int16)
kernel = np.ones((3, 3), np.uint8)
win = int(round(CW / SC))
targets, weights = [], []
for s in small:
    hsv = cv2.cvtColor(s, cv2.COLOR_BGR2HSV)
    h, sat, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    koi = ((h < 28) & (sat > 110) & (v > 110)) | ((sat < 40) & (v > 225))
    moved = np.abs(s.astype(np.int16) - bg).sum(axis=2) > 60
    m = (koi & moved).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, kernel)          # drop glints and specks
    m[:, :ICON_X] = 0
    col = m.sum(axis=0).astype(np.float32)
    # ripples and splashes count a little too (food landing), via frame-to-frame change
    score = np.convolve(col, np.ones(win), "valid")        # fish pixels inside each window position
    best = int(np.argmax(score))
    targets.append((best * SC) if score[best] > 25 else np.nan)
    weights.append(float(score[best]))

t = np.array(targets, dtype=np.float64)
# hold through gaps
for i in range(len(t)):
    if np.isnan(t[i]):
        t[i] = t[i - 1] if i else (W - CW) / 2
# hysteresis: only jump to a new group when it stays the best for ~0.8 s
hold, out, cur = int(0.8 * FPS / STEP), [], t[0]
for i in range(len(t)):
    ahead = t[i:i + hold]
    if abs(np.median(ahead) - cur) > 140:
        cur = np.median(ahead)
    elif abs(t[i] - cur) > 40:
        cur += 0.15 * (t[i] - cur)
    out.append(cur)
out = np.array(out)

# smooth (non-causal Gaussian, ~0.9 s) then limit pan speed, then upsample to 60 fps
sig = 0.9 * FPS / STEP
k = np.exp(-0.5 * (np.arange(-3 * sig, 3 * sig + 1) / sig) ** 2); k /= k.sum()
pad = len(k) // 2
sm = np.convolve(np.pad(out, pad, mode="edge"), k, "valid")
vmax = 420 / (FPS / STEP)                                   # px per sample
for i in range(1, len(sm)):
    sm[i] = sm[i - 1] + np.clip(sm[i] - sm[i - 1], -vmax, vmax)
for i in range(len(sm) - 2, -1, -1):                        # backward pass keeps it symmetric
    sm[i] = sm[i + 1] + np.clip(sm[i] - sm[i + 1], -vmax, vmax)
x = np.interp(np.arange(n_frames), np.arange(len(sm)) * STEP, sm)
x = np.clip(x, 310, W - CW)          # 310: never show the two desktop icon columns (cut-off icons look broken)
json.dump({"fps": FPS, "cw": CW, "x": [round(float(v), 2) for v in x]}, open("crop_path.json", "w"))

# visual check
plot = np.full((300, 1200, 3), 24, np.uint8)
for i in range(1, len(t)):
    a, b = (i - 1) * 1200 // len(t), i * 1200 // len(t)
    cv2.line(plot, (a, int(t[i - 1] / W * 300)), (b, int(t[i] / W * 300)), (90, 90, 200), 1)
    cv2.line(plot, (a, int(sm[i - 1] / W * 300)), (b, int(sm[i] / W * 300)), (80, 230, 80), 2)
cv2.imwrite("crop_path.png", plot)
print(f"frames {n_frames}, path range {x.min():.0f}-{x.max():.0f}px, mean {x.mean():.0f}")
