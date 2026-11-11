# Icône Axon : un neurone blanc minimaliste (corps, dendrites, axone courbe, synapses) sur fond noir arrondi.
# Rendu 4× puis réduit (anticrénelage). Usage : python -I build/make_icon.py
import math, os
from PIL import Image, ImageDraw, ImageFilter

S, SS = 1024, 4096
k = SS / 1024
here = os.path.dirname(os.path.abspath(__file__))

def bez(p0, p1, p2, p3, n=900):
    for i in range(n + 1):
        t = i / n; u = 1 - t
        yield (u**3*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t**3*p3[0], u**3*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t**3*p3[1])

def stroke(d, pts, w0, w1=None):
    pts = list(pts); w1 = w0 if w1 is None else w1
    for i, (x, y) in enumerate(pts):
        w = (w0 + (w1 - w0) * i / max(1, len(pts) - 1)) * k / 2
        d.ellipse([x * k - w, y * k - w, x * k + w, y * k + w], fill="white")

def dot(d, x, y, r):
    d.ellipse([(x - r) * k, (y - r) * k, (x + r) * k, (y + r) * k], fill="white")

def mark(d, scale=1.0):
    cx, cy = 360, 372
    # dendrites (fines, qui s'effilent)
    for a, l, bend in [(205, 150, 25), (250, 130, -20), (160, 120, 20), (300, 110, -15)]:
        r = math.radians(a); ex, ey = cx + math.cos(r) * l, cy + math.sin(r) * l
        mx, my = cx + math.cos(r + math.radians(bend) / 3) * l * .5, cy + math.sin(r + math.radians(bend) / 3) * l * .5
        stroke(d, bez((cx, cy), (mx, my), (mx, my), (ex, ey), 300), 24 * scale, 6 * scale)
    # axone : grande courbe élégante qui s'affine
    stroke(d, bez((cx, cy), (560, 300), (520, 720), (720, 700)), 30 * scale, 16 * scale)
    # terminaisons + synapses
    ex, ey = 720, 700
    for a in (-38, 8, 52):
        r = math.radians(a); x2, y2 = ex + math.cos(r) * 92, ey + math.sin(r) * 92
        stroke(d, bez((ex, ey), ((ex + x2) / 2, (ey + y2) / 2), ((ex + x2) / 2, (ey + y2) / 2), (x2, y2), 200), 14 * scale, 10 * scale)
        dot(d, x2, y2, 20 * scale)
    dot(d, cx, cy, 82 * scale)

big = Image.new("RGBA", (SS, SS), (0, 0, 0, 0))
bgd = ImageDraw.Draw(big)
bgd.rounded_rectangle([40 * k, 40 * k, (S - 40) * k, (S - 40) * k], radius=220 * k, fill=(10, 10, 12, 255))
icon = big.resize((S, S), Image.LANCZOS)
# lumière douce en haut à gauche, limitée au carré arrondi
light = Image.new("RGBA", (S, S), (0, 0, 0, 0)); ImageDraw.Draw(light).ellipse([60, 40, 640, 600], fill=(255, 255, 255, 34))
light = light.filter(ImageFilter.GaussianBlur(110))
maskL = Image.new("L", (S, S), 0); ImageDraw.Draw(maskL).rounded_rectangle([40, 40, S - 40, S - 40], radius=220, fill=255)
icon.alpha_composite(Image.composite(light, Image.new("RGBA", (S, S)), maskL))
ImageDraw.Draw(icon).rounded_rectangle([41, 41, S - 41, S - 41], radius=219, outline=(255, 255, 255, 30), width=3)
# halo puis neurone net
m = Image.new("RGBA", (SS, SS), (0, 0, 0, 0)); mark(ImageDraw.Draw(m)); m = m.resize((S, S), Image.LANCZOS)
halo = m.filter(ImageFilter.GaussianBlur(26)); halo.putalpha(halo.getchannel("A").point(lambda v: int(v * .5)))
icon.alpha_composite(halo); icon.alpha_composite(m)
icon.save(os.path.join(here, "icon.png"))
icon.resize((512, 512), Image.LANCZOS).save(os.path.join(here, "icon-512.png"))
icon.save(os.path.join(here, "icon.ico"), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("ok")
