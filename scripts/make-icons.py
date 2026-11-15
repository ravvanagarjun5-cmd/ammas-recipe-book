"""Regenerates the PNG app icons from code (needs Pillow). Run: python scripts/make-icons.py"""
from PIL import Image, ImageDraw

TURMERIC = (227, 154, 27)
CREAM = (255, 253, 248)
INK = (59, 42, 32)


def draw(size: int, maskable: bool) -> Image.Image:
    s = size
    img = Image.new('RGBA', (s, s), TURMERIC if maskable else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if not maskable:
        d.rounded_rectangle((0, 0, s - 1, s - 1), radius=int(s * 0.22), fill=TURMERIC)
    # keep the artwork inside the maskable safe zone (central 60%)
    k = 0.8 if maskable else 1.0
    cx, top = s / 2, s * (0.5 - 0.30 * k)

    def p(x: float, y: float) -> tuple[float, float]:
        return (cx + (x - 0.5) * s * k, s / 2 + (y - 0.5) * s * k)

    # a pot with a rising steam mark: "a recipe being cooked"
    d.rounded_rectangle((*p(0.24, 0.42), *p(0.76, 0.74)), radius=int(s * 0.07 * k), fill=CREAM)
    d.rounded_rectangle((*p(0.20, 0.38), *p(0.80, 0.46)), radius=int(s * 0.04 * k), fill=CREAM)
    d.rounded_rectangle((*p(0.40, 0.78), *p(0.60, 0.82)), radius=int(s * 0.02 * k), fill=INK)
    w = max(2, int(s * 0.035 * k))
    for x in (0.38, 0.5, 0.62):
        d.line([p(x, 0.34), p(x - 0.03, 0.26), p(x + 0.03, 0.18)], fill=INK, width=w, joint='curve')
    return img


for name, size, maskable in [('icon-192.png', 192, False), ('icon-512.png', 512, False), ('icon-maskable-512.png', 512, True)]:
    draw(size, maskable).save(f'web/public/{name}')
    print('wrote', name)
