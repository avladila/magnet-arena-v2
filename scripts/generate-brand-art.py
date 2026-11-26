"""Generate original in-game artwork from MAGNET's shared token palette."""
import json
from math import cos, exp, hypot, pi, sin
from pathlib import Path
from PIL import Image, ImageColor, ImageDraw

tokens = json.loads(Path('brand/tokens.json').read_text())
roster = json.loads(Path('brand/roster.json').read_text())
roles = tokens['roles']
steel = tokens['steel']
ink = tokens['themes']['light']['ink']
pickups = tokens['pickups']
energy = pickups['energyMaterial']
P = Path('public')
E = Path('docs/evidence/rc4')
N = 96


def radial(x, y, r, count, offset=0):
    return [(x + r * cos(offset + i * 2 * pi / count), y + r * sin(offset + i * 2 * pi / count)) for i in range(count)]


def tile():
    image = Image.new('RGBA', (N, N))
    return image, ImageDraw.Draw(image)


frames = {}


def pack(name, items):
    width = min(10, len(items))
    sheet = Image.new('RGBA', (width * N, ((len(items) + width - 1) // width) * N))
    mapping = {}
    for i, (key, tile_image) in enumerate(items.items()):
        x, y = i % width * N, i // width * N
        sheet.paste(tile_image, (x, y))
        mapping[key] = {'frame': {'x': x, 'y': y, 'w': N, 'h': N}}
    sheet.save(P / (name + '.webp'), lossless=True)
    (P / (name + '.json')).write_text(json.dumps({'frames': mapping}, indent=2) + '\n')
    return sheet


def mix(a, b, amount):
    return tuple(round(x + (y - x) * amount) for x, y in zip(a, b))


def rgb(value):
    return ImageColor.getrgb(value) if isinstance(value, str) else value


def magnet(index, stage):
    image, d = tile()
    trim = tokens['rivalTrim'][index] if index < len(tokens['rivalTrim']) else roster[index-1]['accent']
    r = 34 + stage
    d.ellipse((49-r, 51-r, 49+r, 51+r), fill=(35, 54, 74, 66))
    d.ellipse((48-r, 48-r, 48+r, 48+r), fill=ink)
    d.ellipse((50-r, 50-r, 46+r, 46+r), fill=trim)
    d.ellipse((54-r, 54-r, 42+r, 42+r), fill=steel[3])
    d.arc((51-r, 51-r, 45+r, 45+r), 181, 270, fill=steel[0], width=1)
    for x, y in radial(48, 48, r - 7, [4, 6, 8, 12, 16, 24][stage]):
        d.ellipse((x-3, y-3, x+3, y+3), fill=ink)
        d.ellipse((x-2, y-2, x, y), fill=steel[0])
    d.rounded_rectangle((21, 24, 72, 72), 11, fill=ink)
    for a, b, pole in [(28, 43, 'coral'), (53, 68, 'cobalt')]:
        d.rounded_rectangle((27, a, 68, b), 6, fill=roles[pole])
        highlight = mix(rgb(roles[pole]), rgb(steel[0]), 0.66)
        d.line((33, a+2, 59, a+2), fill=highlight, width=2)
        d.rounded_rectangle((58, a+2, 66, b-2), 4, fill=steel[1])
        d.line((60, a+3, 64, a+3),fill=steel[0],width=2)
    d.rounded_rectangle((23, 28, 38, 68), 8, fill=trim)
    if index == 2:
        d.polygon(radial(30, 48, 6, 6), fill=steel[0])
    elif index == 4:
        d.ellipse((26,44,34,52), outline=steel[0], width=2)
    elif index > 4:
        points = (3, 4, 5, 6)[index % 4]
        d.polygon(radial(30, 48, 6, points, -pi/2 + (index % 3) * pi/6), fill=steel[0])
        for offset in range(index % 3 + 1):
            d.line((26, 40 + offset * 8, 34, 40 + offset * 8), fill=trim, width=1)
    else:
        d.rounded_rectangle((26, 44, 35, 52), 4, fill=steel[0])
    return image


magnets = {f'{name}-{stage}': magnet(i, stage) for i, name in enumerate(['player', *(bot['id'] for bot in roster)])
           for stage in range(len(tokens['shellStages']))}
pack('magnets', magnets)


def glow(color, opacity, spread=19, center=(48, 48)):
    """A colored falloff with transparent padding on all four atlas edges."""
    x0, y0 = center
    alpha = bytearray()
    for y in range(N):
        for x in range(N):
            distance = hypot(x - x0, y - y0)
            falloff = exp(-0.5 * (distance / spread) ** 2)
            fade_edge = max(0, min(1, (46 - distance) / 12))
            alpha.append(round(opacity * falloff * fade_edge))
    halo = Image.new('RGBA', (N, N), rgb(color))
    halo.putalpha(Image.frombytes('L', (N, N), bytes(alpha)))
    return halo


def material(base, highlight, mask, strength=1):
    """Bake enamel shading and an upper-left specular reflection inside a silhouette."""
    base, highlight = rgb(base), rgb(highlight)
    shadow = mix(base, rgb(ink), 0.57)
    pixels = []
    for y in range(N):
        for x in range(N):
            light = max(0, min(1, 1.08 - (x + y - 52) / 101))
            body = mix(shadow, base, light)
            specular = exp(-0.5 * (((x - 38) / 11) ** 2 + ((y - 35) / 8) ** 2))
            pixels.append(mix(body, highlight, min(1, specular * strength)))
    shade = Image.new('RGB', (N, N))
    shade.putdata(pixels)
    shade.putalpha(mask)
    return shade


def scrap(i, mode):
    # This rounded silhouette stays consistent at every zoom. Fine cuts and highlights
    # disappear naturally as the Canvas sampler reduces the texture to a few pixels.
    base = pickups['palette'][i]
    image = glow(base, 153 if mode == 'dark' else 116, spread=20 if mode == 'dark' else 17)
    d = ImageDraw.Draw(image)
    edge = mix(rgb(tokens['themes'][mode]['scrap'][i]), rgb(ink), 0.48)
    if i in (0, 4, 5, 9):
        outline = radial(48, 48, 25, 8, pi / 8)
        d.polygon(outline, fill=edge)
        mask = Image.new('L', (N, N))
        ImageDraw.Draw(mask).polygon(radial(48, 47, 21, 8, pi / 8), fill=255)
    else:
        d.ellipse((24, 24, 72, 72), fill=edge)
        mask = Image.new('L', (N, N))
        ImageDraw.Draw(mask).ellipse((28, 27, 68, 67), fill=255)
    image.alpha_composite(material(base, steel[0], mask, strength=0.96))
    d = ImageDraw.Draw(image)
    d.ellipse((35, 33, 45, 39), fill=steel[0])
    # Industrial face details are subpixel at distant zoom, leaving a colored bead.
    if i in (0, 1, 4, 7):
        d.ellipse((46, 47, 57, 56), fill=edge)
        d.arc((43, 44, 59, 59), 15, 105, fill=base, width=2)
    elif i in (2, 3, 8):
        d.line((45, 50, 58, 50), fill=edge, width=3)
        d.line((46, 53, 57, 53), fill=base, width=2)
    else:
        d.line((45, 59, 56, 55, 61, 47), fill=edge, width=2)
    return image


def gold_ingot():
    base = roles['gold']
    image = glow(base, 145, spread=20)
    d = ImageDraw.Draw(image)
    d.polygon([(17, 54), (30, 32), (66, 32), (79, 53), (65, 67), (30, 67)],
              fill=pickups['goldEdge'])
    d.polygon([(22, 53), (34, 36), (63, 36), (74, 53)], fill=base)
    d.polygon([(22, 55), (74, 55), (63, 63), (32, 63)], fill=mix(rgb(base), rgb(pickups['goldEdge']), 0.45))
    d.line((34, 38, 62, 38), fill=steel[0], width=3)
    d.line((27, 51, 68, 51), fill=mix(rgb(base), rgb(steel[0]), 0.65), width=2)
    return image


def energy_cell():
    image = glow(energy['glow'], 173, spread=19)
    d = ImageDraw.Draw(image)
    for start in (18, 138, 258):
        d.arc((13, 13, 83, 83), start, start + 72, fill=(*rgb(energy['edge']), 65), width=2)
    d.polygon(radial(48, 48, 27, 6, pi / 6), fill=energy['shadow'])
    d.polygon(radial(48, 48, 24, 6, pi / 6), fill=energy['edge'])
    mask = Image.new('L', (N, N))
    ImageDraw.Draw(mask).polygon(radial(48, 47, 21, 6, pi / 6), fill=255)
    image.alpha_composite(material(energy['body'], energy['highlight'], mask))
    d = ImageDraw.Draw(image)
    d.line((29, 40, 39, 30, 52, 30), fill=energy['highlight'], width=2)
    # The white bolt is wide enough to retain an unmistakable bright center at distance.
    d.polygon([(49, 31), (35, 50), (46, 50), (43, 65), (62, 43), (50, 43), (55, 31)], fill=energy['core'])
    return image


def energy_orbit():
    image = glow(energy['glow'], 100, spread=23)
    d = ImageDraw.Draw(image)
    for start in (6, 126, 246):
        d.arc((12, 12, 84, 84), start, start + 75, fill=energy['edge'], width=5)
        d.arc((12, 12, 84, 84), start + 3, start + 68, fill=energy['body'], width=2)
    return image


def sparkle(color, rays=4):
    image = glow(color, 191, spread=20)
    d = ImageDraw.Draw(image)
    points = []
    for i in range(rays * 2):
        size = 31 if i % 2 == 0 else 8
        angle = i * pi / rays
        points.append((48 + size * cos(angle), 48 + size * sin(angle)))
    d.polygon(points, fill=color)
    d.ellipse((41, 41, 55, 55), fill=steel[0])
    return image


def object_art(kind):
    im, d = tile()
    if kind.startswith('debris'):
        rank = int(kind[-1])
        base = steel[max(0, 2 - rank)]
        im = glow(base, 58 + rank * 44, spread=16 + rank * 2)
        d = ImageDraw.Draw(im)
        points = radial(48, 48, 23 + rank * 5, 6, .23)
        d.polygon(points, fill=steel[3], outline=ink, width=4)
        mask = Image.new('L', (N, N))
        ImageDraw.Draw(mask).polygon(radial(48, 47, 19 + rank * 5, 6, .23), fill=255)
        im.alpha_composite(material(base, steel[0], mask))
        d = ImageDraw.Draw(im)
        d.line((34, 39, 46, 34, 59, 38), fill=steel[0], width=3)
        for i in range(rank + 1):
            d.ellipse((38+i*8, 49, 42+i*8, 53), fill=ink)
        if rank == 3:
            d.line((27, 56, 47, 68, 68, 59), fill=steel[2], width=4)
            d.line((30, 61, 47, 72, 65, 65), fill=steel[0], width=2)
    elif kind == 'flux':
        d.ellipse((10,10,86,86),outline=roles[kind],width=4)
        for angle in range(6):
            a = angle*pi/3
            d.polygon([(48+r*cos(a+b),48+r*sin(a+b)) for r,b in [(13,-.35),(36,0),(13,.35)]],
                      fill=roles[kind],outline=ink,width=2)
        d.polygon(radial(48,48,11,6),fill=steel[0],outline=ink,width=2)
    elif kind == 'cold':
        for x,y in radial(48,48,30,6,pi/6):
            d.polygon(radial(x,y,12,6,pi/6),fill=roles['cold'],outline=ink,width=3)
            d.line((x-4,y-5,x+4,y-5),fill=steel[0],width=2)
        for x,y in radial(48,48,17,6,pi/6):
            d.line((48,48,x,y),fill=roles['cold'],width=4)
        d.ellipse((43,43,53,53),fill=steel[0],outline=ink,width=2)
    elif kind.startswith('prop'):
        d.rounded_rectangle((7,20,89,76),8,fill=steel[3],outline=ink,width=4)
        if kind == 'prop-drain':
            for radius in (13,22):
                d.ellipse((48-radius,48-radius,48+radius,48+radius),outline=steel[0],width=3)
        else:
            for x in range(22,78,12):
                d.line((x-7,61,x+7,35),fill=ink,width=4)
    elif kind == 'heat':
        d.rounded_rectangle((13,21,83,75),8,fill=roles[kind],outline=ink,width=4)
        for y in (30,42,54,66):
            d.line((25,y,71,y),fill=ink,width=4)
            d.line((27,y+3,69,y+3),fill=mix(rgb(roles['heat']), rgb(steel[0]), 0.74),width=1)
    else:
        outline = ([(13,46),(22,25),(44,28),(62,17),(79,27),(86,51),(69,63),(47,73),(31,68),(16,61)]
                   if kind == 'acid' else [(10,42),(23,29),(48,24),(76,30),(88,50),(76,63),(47,73),(20,68)])
        d.polygon(outline, fill=roles[kind],outline=ink,width=4)
        d.arc((18, 28, 75, 61), 190, 282, fill=steel[0], width=2)
        d.ellipse((26,36,69,61),outline=steel[0],width=3)
        if kind == 'acid':
            d.polygon(radial(48,48,12,6),fill=ink)
        else:
            d.line((33,50,42,43,53,53,64,46),fill=steel[0],width=4)
    return im


for mode in tokens['themes']:
    for index in range(10):
        frames[f'{mode}-scrap-{index}'] = scrap(index, mode)
frames['gold'] = gold_ingot()
frames['energy'] = energy_cell()
frames['energy-orbit'] = energy_orbit()
frames['pole-charge'] = glow(energy['highlight'], 230, spread=19)
for kind in ['debris-0','debris-1','debris-2','debris-3','flux','cold','heat','water','acid','prop-grate','prop-drain']:
    frames[kind] = object_art(kind)
for role in ['steel', 'gold', 'energy', 'teal', 'heat', 'cold', 'flux', 'acid', 'water']:
    tone = steel[0] if role == 'steel' else roles[role]
    frames['fleck-' + role] = sparkle(tone, rays=6 if role == 'gold' else 4)
for index, tone in enumerate(pickups['palette']):
    frames[f'fleck-scrap-{index}'] = sparkle(tone)
pack('workshop', frames)


def pole_mark():
    im, d = tile()
    d.rounded_rectangle((14,16,82,79),18,fill=ink)
    d.rounded_rectangle((23,25,73,70),16,fill=steel[0])
    d.rounded_rectangle((39,14,57,52),8,fill=ink)
    for x, pole in [(23,'coral'),(57,'cobalt')]:
        d.rounded_rectangle((x,25,x+16,59),7,fill=roles[pole])
        d.ellipse((x+3,27,x+13,37),fill=steel[0])
    return im


icon = pole_mark()
icon.resize((192,192),Image.Resampling.LANCZOS).save(P/'app-icon.png')
icon.resize((32,32),Image.Resampling.LANCZOS).save(P/'favicon.png')
for name, dimensions in [('hero',(1024,384)), ('social',(1200,630))]:
    background = Image.new('RGBA', dimensions, tokens['themes']['dark']['background'])
    d = ImageDraw.Draw(background)
    w,h = dimensions
    for x in range(32,w,64):
        for y in range(32,h,64):
            d.ellipse((x,y,x+3,y+3),fill=tokens['themes']['dark']['markings'])
    for r in (102,152,205):
        d.ellipse((w/2-r,h/2-r,w/2+r,h/2+r),outline=tokens['themes']['dark']['markings'],width=3)
    large = magnets['player-5'].resize((240,240),Image.Resampling.LANCZOS)
    background.alpha_composite(large,(w//2-120,h//2-120))
    background.convert('RGB').save(P/(name+'.webp'),quality=90)

E.mkdir(parents=True,exist_ok=True)
sheet = Image.new('RGB', (1076, 40 + 112 * ((len(roster) + 5) // 5)), tokens['themes']['dark']['background'])
d = ImageDraw.Draw(sheet)
legend = steel[0]
d.text((14, 12), 'MAGNET · Arena roster and shell stages', fill=legend)
for i, bot in enumerate([{'id': 'player', 'name': 'You', 'strategy': 'player'}, *roster]):
    x, y = 9 + i % 5 * 215, 38 + i // 5 * 112
    d.text((x+7, y+6), bot['name'] + ' / ' + bot['strategy'].capitalize(), fill=legend)
    for stage in range(len(tokens['shellStages'])):
        img = magnets[f"{bot['id']}-{stage}"].resize((34, 34), Image.Resampling.LANCZOS)
        sheet.paste(img, (x + stage * 34, y + 34), img)
sheet.save(E/'roster.webp', quality=93)
(Path('brand')/'asset-manifest.json').write_text(json.dumps({'paletteRoles': list(roles), 'atlases': {'magnets': list(magnets), 'workshop': list(frames)}},indent=2)+'\n')
