"""Render the five magnets and four bolt-on shell stages at 3× supersampling."""
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw

tokens = json.loads(Path('brand/tokens.json').read_text())
palette = tokens['legacy']['magnet_atlas']
output = Path('public')
frame = 112
scale = 3
names = ['player', 'bot-1', 'bot-2', 'bot-3', 'bot-4']
colors = [
    (palette['color1'], palette['color2'], palette['color3']), (palette['color4'], palette['color5'], palette['color6']),
    (palette['color7'], palette['color8'], palette['color9']), (palette['color10'], palette['color11'], palette['color12']),
    (palette['color13'], palette['color14'], palette['color15']),
]
atlas = Image.new('RGBA', (frame * 4, frame * len(names)))
metadata = {'frames': {}, 'meta': {'image': 'magnets.webp', 'size': {'w': atlas.width, 'h': atlas.height}}}


def draw_magnet(index, stage):
    canvas = Image.new('RGBA', (frame * scale, frame * scale))
    draw = ImageDraw.Draw(canvas)
    hot, cool, plate = colors[index]

    def coords(box):
        return tuple(round((56 + n) * scale) for n in box)

    def oval(box, color):
        draw.ellipse(coords(box), fill=color)

    def rounded(box, radius, color):
        draw.rounded_rectangle(coords(box), radius=radius * scale, fill=color)

    def poly(points, color):
        draw.polygon([tuple(round((56 + n) * scale) for n in point) for point in points], fill=color)

    oval((-44, -40, 46, 51), (23, 49, 47, 48))
    oval((-47, -46, 45, 46), palette['color16'])
    oval((-45, -45, 43, 43), plate)
    oval((-42, -42, 40, 40), palette['color17'])
    oval((-39, -38, 37, 38), palette['color18'])
    for k in range(6 + 3 * stage):
        theta = 2 * math.pi * k / (6 + 3 * stage) + 0.12 * index
        x, y = 37 * math.cos(theta), 37 * math.sin(theta)
        length = 5 + stage * 1.3
        if stage:
            rounded((x - length, y - length, x + length, y + length), 3, palette['color19'])
            rounded((x - length + 1, y - length + 1, x + length - 1, y + length - 2), 2, plate)
        oval((x - 2.5, y - 2.5, x + 2.5, y + 2.5), palette['color20'])
        oval((x - 1.3, y - 1.7, x + 1.1, y + 0.5), palette['color21'])
    rounded((-31, -28, 32, 29), 13, palette['color22'])
    rounded((-32, -30, 31, -4), 9, palette['color23'])
    rounded((-32, 3, 31, 28), 9, palette['color24'])
    rounded((-31, -30, 29, -8), 7, hot)
    rounded((-31, 1, 29, 23), 7, cool)
    rounded((-32, -26, -13, 21), 8, plate)
    rounded((-28, -21, -16, 17), 5, palette['color25'])
    rounded((-11, -7, 32, 5), 4, palette['color26'])
    for row in (-25, 6):
        rounded((15, row, 30, row + 12), 3, palette['color27'])
        rounded((18, row + 1, 29, row + 3), 1, palette['color28'])
        poly([(4, row + 3), (11, row + 3), (7, row + 9), (0, row + 9)], palette['color29'])
    if index:
        rounded((-25, -7, -17, 2), 2, hot)
    else:
        oval((-25, -6, -17, 2), palette['color30'])
    return canvas.resize((frame, frame), Image.Resampling.LANCZOS)


for index, name in enumerate(names):
    for stage in range(4):
        x, y = stage * frame, index * frame
        atlas.paste(draw_magnet(index, stage), (x, y))
        metadata['frames'][f'{name}-{stage}'] = {
            'frame': {'x': x, 'y': y, 'w': frame, 'h': frame},
            'rotated': False, 'trimmed': False,
            'spriteSourceSize': {'x': 0, 'y': 0, 'w': frame, 'h': frame},
            'sourceSize': {'w': frame, 'h': frame},
        }

atlas.save(output / 'magnets.webp', lossless=True)
(output / 'magnets.json').write_text(json.dumps(metadata, indent=2) + '\n')
