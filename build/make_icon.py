# Generates build/icon.ico (tactical badge) for the Electron app.
from PIL import Image, ImageDraw, ImageFont
import os

S = 512
img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# rounded dark tile
d.rounded_rectangle([16, 16, S - 16, S - 16], radius=96, fill=(14, 18, 23, 255), outline=(232, 176, 74, 255), width=14)

# shield
cx = S // 2
shield = [(cx, 78), (cx + 150, 128), (cx + 138, 300), (cx, 430), (cx - 138, 300), (cx - 150, 128)]
d.polygon(shield, fill=(34, 42, 53, 255), outline=(232, 176, 74, 255))
d.line(shield + [shield[0]], fill=(232, 176, 74, 255), width=10, joint='curve')

# crosshair
d.ellipse([cx - 78, 176, cx + 78, 332], outline=(217, 220, 223, 255), width=14)
for (x0, y0, x1, y1) in [(cx, 140, cx, 200), (cx, 308, cx, 368), (cx - 118, 254, cx - 58, 254), (cx + 58, 254, cx + 118, 254)]:
    d.line([x0, y0, x1, y1], fill=(217, 220, 223, 255), width=14)
d.ellipse([cx - 14, 240, cx + 14, 268], fill=(217, 84, 74, 255))

out = os.path.join(os.path.dirname(__file__), 'icon.ico')
img.save(out, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
img.save(os.path.join(os.path.dirname(__file__), 'icon.png'))
print('ok', out)
