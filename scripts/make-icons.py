# Draws the Settle Watch app icons from the pixel mascot in src/sprites.json. Run: python3 scripts/make-icons.py
# `python3 scripts/make-icons.py monad` draws the Monad edition set into assets/monad (Monad purple, dark violet ground).
from PIL import Image, ImageDraw
import json, os, sys
here = os.path.dirname(__file__)
MONAD = len(sys.argv) > 1 and sys.argv[1] == "monad"
out = os.path.join(here, "..", "assets", "monad") if MONAD else os.path.join(here, "..", "assets")
os.makedirs(out, exist_ok=True)
data = json.load(open(os.path.join(here, "..", "src", "sprites.json")))
pal = {k: tuple(int(v[i:i + 2], 16) for i in (1, 3, 5)) for k, v in data["palette"].items()}
m = data["mascot"]["idle"]
S = 1024
BG = (14, 11, 31) if MONAD else (10, 15, 11)
ACCENT = (131, 110, 249, 255) if MONAD else (153, 69, 255, 255)

def sprite(px, mono=False):
    w, h = len(m[0]) * px, len(m) * px
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for y, row in enumerate(m):
        for x, ch in enumerate(row):
            if ch == ".":
                continue
            if mono:
                if ch in "KW":
                    continue
                col = (255, 255, 255, 255)
            else:
                col = pal[ch] + (255,)
            d.rectangle([x * px, y * px, (x + 1) * px - 1, (y + 1) * px - 1], fill=col)
    return im

def center(img, base):
    base.alpha_composite(img, ((S - img.width) // 2, (S - img.height) // 2))
    return base

# full icon: dark ground, faint pixel dots like the game track, mascot centered
icon = Image.new("RGBA", (S, S), BG + (255,))
d = ImageDraw.Draw(icon)
for i in range(5):
    x = 130 + i * 190
    dot = ACCENT[:3] if MONAD else (194, 255, 196)
    d.rectangle([x, 880, x + 36, 916], fill=dot + (255 if i > 1 else 90,))
d.rectangle([0, 0, S, 24], fill=ACCENT)
center(sprite(54), icon)
icon.convert("RGB").save(f"{out}/icon.png")
# adaptive foreground (safe zone) and monochrome
center(sprite(44), Image.new("RGBA", (S, S), (0, 0, 0, 0))).save(f"{out}/adaptive-icon.png")
center(sprite(44, mono=True), Image.new("RGBA", (S, S), (0, 0, 0, 0))).save(f"{out}/adaptive-icon-mono.png")
# splash: transparent, mascot only
sp = center(sprite(60), Image.new("RGBA", (S, S), (0, 0, 0, 0)))
sp.save(f"{out}/splash-icon.png")
sprite(4).resize((48, 48), Image.NEAREST).save(f"{out}/favicon.png")
print("ok")
