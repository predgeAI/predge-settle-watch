# Draws the Settle Watch mark (clock ring + check) in Clock In colors. Run: python3 scripts/make-icons.py
from PIL import Image, ImageDraw, ImageFilter
import math, os
S = 1024
SS = 3
BG = (10, 15, 11, 255)
PURPLE = (153, 69, 255)
BRIGHT = (194, 255, 196)
MID = (40, 190, 230)
GREEN = (20, 241, 149)
out = os.path.join(os.path.dirname(__file__), "..", "assets")

def grad(size, a, b):
    g = Image.new("RGB", (size, size))
    px = g.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size)
            t = min(1, max(0, (t - 0.25) / 0.5))
            if t < 0.5:
                u = t * 2; lo, hi = a, MID
            else:
                u = (t - 0.5) * 2; lo, hi = MID, b
            px[x, y] = tuple(int(lo[i] + (hi[i] - lo[i]) * u) for i in range(3))
    return g

def mark(scale, glow=True):
    """RGBA canvas SxS with mark whose ring diameter = scale*S."""
    W = S * SS
    m = Image.new("L", (W, W), 0)
    d = ImageDraw.Draw(m)
    c = W / 2
    R = scale * W / 2
    th = R * 0.16
    d.ellipse([c - R, c - R, c + R, c + R], outline=255, width=int(th))
    # tick marks at 12/3/6/9 as small notches inside the ring
    for k in range(12):
        a = k * math.pi / 6
        r1, r2 = R - th - R * 0.03, R - th - R * (0.10 if k % 3 == 0 else 0.06)
        w = int(R * (0.045 if k % 3 == 0 else 0.03))
        d.line([c + r1 * math.sin(a), c - r1 * math.cos(a), c + r2 * math.sin(a), c - r2 * math.cos(a)], fill=255, width=w)
    # check mark
    p = [(c - R * 0.40, c + R * 0.02), (c - R * 0.10, c + R * 0.32), (c + R * 0.42, c - R * 0.34)]
    cw = int(R * 0.17)
    d.line(p, fill=255, width=cw, joint="curve")
    for q in (p[0], p[2]):
        d.ellipse([q[0] - cw / 2, q[1] - cw / 2, q[0] + cw / 2, q[1] + cw / 2], fill=255)
    m = m.resize((S, S), Image.LANCZOS)
    ring_only = m
    col = grad(S, PURPLE, GREEN).convert("RGBA")
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    layer.paste(col, (0, 0), m)
    if glow:
        g = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        gm = m.filter(ImageFilter.GaussianBlur(S * 0.03)).point(lambda v: int(v * 0.55))
        g.paste(Image.new("RGBA", (S, S), GREEN + (255,)), (0, 0), gm)
        layer = Image.alpha_composite(g, layer)
    return layer, m

def bg():
    img = Image.new("RGBA", (S, S), BG)
    g = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(g)
    gd.ellipse([S * 0.1, S * 0.1, S * 0.9, S * 0.9], fill=(60, 30, 110, 120))
    g = g.filter(ImageFilter.GaussianBlur(S * 0.18))
    return Image.alpha_composite(img, g)

# full icon (ring fills most of the canvas)
l, _ = mark(0.66)
Image.alpha_composite(bg(), l).convert("RGB").save(f"{out}/icon.png")
# adaptive foreground: keep inside the 66% safe zone
l, m = mark(0.42)
l.save(f"{out}/adaptive-icon.png")
# monochrome (themed icons): white mark on transparent
mono = Image.new("RGBA", (S, S), (0, 0, 0, 0))
mono.paste(Image.new("RGBA", (S, S), (255, 255, 255, 255)), (0, 0), m)
mono.save(f"{out}/adaptive-icon-mono.png")
# splash icon: transparent, mark only
l, _ = mark(0.62)
l.save(f"{out}/splash-icon.png")
l.resize((48, 48), Image.LANCZOS).save(f"{out}/favicon.png")
print("ok")
