"""Render the five magnets and four bolt-on shell stages at 3× supersampling."""
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw

output = Path('public')
frame = 112
scale = 3
names = ['player', 'bot-1', 'bot-2', 'bot-3', 'bot-4']
colors = [
    ('#db4350', '#336ace', '#52877a'), ('#d1703c', '#694b40', '#ad713e'),
    ('#9d60cc', '#494573', '#a883bb'), ('#219cb1', '#235d79', '#4aa9ac'),
    ('#83a345', '#3c6747', '#a1b862'),
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
    oval((-47, -46, 45, 46), '#1b3537')
    oval((-45, -45, 43, 43), plate)
    oval((-42, -42, 40, 40), '#bdd2cd')
    oval((-39, -38, 37, 38), '#385255')
    for k in range(6 + 3 * stage):
        theta = 2 * math.pi * k / (6 + 3 * stage) + 0.12 * index
        x, y = 37 * math.cos(theta), 37 * math.sin(theta)
        length = 5 + stage * 1.3
        if stage:
            rounded((x - length, y - length, x + length, y + length), 3, '#253e42')
            rounded((x - length + 1, y - length + 1, x + length - 1, y + length - 2), 2, plate)
        oval((x - 2.5, y - 2.5, x + 2.5, y + 2.5), '#253c40')
        oval((x - 1.3, y - 1.7, x + 1.1, y + 0.5), '#d3e6df')
    rounded((-31, -28, 32, 29), 13, '#162c36')
    rounded((-32, -30, 31, -4), 9, '#652f41')
    rounded((-32, 3, 31, 28), 9, '#223b65')
    rounded((-31, -30, 29, -8), 7, hot)
    rounded((-31, 1, 29, 23), 7, cool)
    rounded((-32, -26, -13, 21), 8, plate)
    rounded((-28, -21, -16, 17), 5, '#a7bdb8')
    rounded((-11, -7, 32, 5), 4, '#1b333d')
    for row in (-25, 6):
        rounded((15, row, 30, row + 12), 3, '#d4e6de')
        rounded((18, row + 1, 29, row + 3), 1, '#f4fff8')
        poly([(4, row + 3), (11, row + 3), (7, row + 9), (0, row + 9)], '#d8d9b5')
    if index:
        rounded((-25, -7, -17, 2), 2, hot)
    else:
        oval((-25, -6, -17, 2), '#edf9ce')
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
