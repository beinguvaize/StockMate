"""
Generate the StockMate app icon.
Output: build/icon.png (1024) + build/icon.ico (multi-size).
Design: isometric emerald cube on a dark rounded-square background.
Run:  python3 build/make_icon.py
"""
import os
from PIL import Image, ImageDraw

SS = 4                      # supersample factor for crisp anti-aliasing
N = 1024                    # final icon size
S = N * SS                  # working canvas size
OUT = os.path.dirname(os.path.abspath(__file__))


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


# ── Background: vertical gradient, dark green-black ──────────────────────────
top_col = (28, 47, 40)      # #1c2f28
bot_col = (15, 27, 23)      # #0f1b17
bg = Image.new("RGB", (S, S))
for y in range(S):
    Image.new("RGB", (S, 1), lerp(top_col, bot_col, y / S)).paste
bg_draw = ImageDraw.Draw(bg)
for y in range(S):
    bg_draw.line([(0, y), (S, y)], fill=lerp(top_col, bot_col, y / S))

# Rounded-square mask
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(0.225 * S), fill=255)

icon = Image.new("RGBA", (S, S), (0, 0, 0, 0))
icon.paste(bg, (0, 0), mask)

draw = ImageDraw.Draw(icon)

# ── Isometric cube (centered) ───────────────────────────────────────────────
cx = S // 2
T  = (cx,            int(0.279 * S))
R  = (int(0.740 * S), int(0.416 * S))
B  = (cx,            int(0.553 * S))
L  = (int(0.260 * S), int(0.416 * S))
sh = int(0.244 * S)
R2 = (R[0], R[1] + sh)
B2 = (B[0], B[1] + sh)
L2 = (L[0], L[1] + sh)

face_top   = (52, 211, 153)   # #34d399 emerald-400
face_left  = (15, 159, 116)   # #0f9f74
face_right = (10, 122, 90)    # #0a7a5a

draw.polygon([B, R, R2, B2], fill=face_right)   # right (drawn first)
draw.polygon([L, B, B2, L2], fill=face_left)    # left
draw.polygon([T, R, B, L],   fill=face_top)     # top

# Subtle top-edge highlight on the top face
draw.line([L, T, R], fill=(120, 230, 190), width=SS * 3)

# ── Downsample + save ───────────────────────────────────────────────────────
final = icon.resize((N, N), Image.LANCZOS)
png_path = os.path.join(OUT, "icon.png")
final.save(png_path)
print("wrote", png_path)

ico_path = os.path.join(OUT, "icon.ico")
final.save(ico_path, sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
print("wrote", ico_path)
