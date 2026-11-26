"""Generate original in-game artwork from MAGNET's shared token palette."""
import json
from math import cos, exp, hypot, pi, sin
from pathlib import Path
from PIL import Image, ImageColor, ImageDraw
from arcade_art import (CHARACTER_TILE, FACE_BOX, MOODS, composed, expression, machinery, poster, pupil, shell, star, status_mark)

tokens = json.loads(Path('brand/tokens.json').read_text())
roster = json.loads(Path('brand/roster.json').read_text())
roles = tokens['roles']
steel = tokens['steel']
arcade = tokens['arcade']
ink = arcade['ink']
pickups = tokens['pickups']
energy = pickups['energyMaterial']
P = Path('public')
E = Path('docs/evidence/visual-identity')
N = 96


def radial(x, y, r, count, offset=0):
    return [(x + r * cos(offset + i * 2 * pi / count), y + r * sin(offset + i * 2 * pi / count)) for i in range(count)]


def tile():
    image = Image.new('RGBA', (N, N))
    return image, ImageDraw.Draw(image)


frames = {}


def pack(name, items, tile_size=N):
    width = min(10, len(items))
    sheet = Image.new('RGBA', (width * tile_size, ((len(items) + width - 1) // width) * tile_size))
    mapping = {}
    for i, (key, tile_image) in enumerate(items.items()):
        x, y = i % width * tile_size, i // width * tile_size
        sheet.paste(tile_image, (x, y))
        mapping[key] = {'frame': {'x': x, 'y': y, 'w': tile_size, 'h': tile_size}}
    sheet.save(P / (name + '.webp'), lossless=True)
    (P / (name + '.json')).write_text(json.dumps({'frames': mapping}, indent=2) + '\n')
    return sheet


def mix(a, b, amount):
    return tuple(round(x + (y - x) * amount) for x, y in zip(a, b))


def rgb(value):
    return ImageColor.getrgb(value) if isinstance(value, str) else value


people = [{'id': 'player', 'name': 'You', 'accent': arcade['yellow']}, *roster]
magnets = {}
faces = {}
anchors = {}
assert len(people) == 20
for index, person in enumerate(people):
    name = person['id']
    for stage in range(len(tokens['shellStages'])):
        magnets[f'{name}-{stage}'] = shell(index, stage, person['accent'], arcade)
    for mood in MOODS:
        key = f'{name}-{mood}'
        faces[key], anchors[key] = expression(index, mood, arcade)
person_by_id = {person['id']: (index, person) for index, person in enumerate(people)}
pack('magnets', magnets, CHARACTER_TILE)
pack('faces', faces, FACE_BOX[2] - FACE_BOX[0])
Path('brand/face-anchors.json').write_text(json.dumps(anchors, separators=(',', ':')) + '\n')


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
    image = glow(base, 174 if mode == 'dark' else 143, spread=20 if mode == 'dark' else 18)
    d = ImageDraw.Draw(image)
    edge = mix(rgb(tokens['themes'][mode]['scrap'][i]), rgb(ink), 0.67)
    if i in (0, 4, 5, 9):
        outline = radial(48, 48, 25, 8, pi / 8)
        d.polygon(outline, fill=ink)
        d.polygon(radial(48, 48, 23, 8, pi / 8), fill=edge)
        mask = Image.new('L', (N, N))
        ImageDraw.Draw(mask).polygon(radial(48, 47, 21, 8, pi / 8), fill=255)
    else:
        d.ellipse((24, 24, 72, 72), fill=ink)
        d.ellipse((26, 26, 70, 70), fill=edge)
        mask = Image.new('L', (N, N))
        ImageDraw.Draw(mask).ellipse((28, 27, 68, 67), fill=255)
    image.alpha_composite(material(base, steel[0], mask, strength=0.96))
    d = ImageDraw.Draw(image)
    d.polygon([(34, 40), (37, 34), (45, 33), (47, 36), (39, 41)], fill=arcade['white'])
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
    base = arcade['yellow']
    image = glow(base, 147, spread=20)
    d = ImageDraw.Draw(image)
    d.polygon([(15,51),(26,34),(42,29),(52,33),(67,31),(80,45),(76,59),
               (61,68),(43,65),(28,68)], fill=base, outline=ink, width=4)
    d.polygon([(19,51),(39,52),(43,62),(29,64)], fill=arcade['orange'])
    d.polygon([(39,52),(59,46),(76,47),(72,57),(61,64),(44,63)], fill=pickups['goldEdge'])
    d.polygon([(31,38),(43,32),(54,37),(48,45),(37,45)], fill=arcade['pale'])
    d.polygon([(34,39),(44,34),(48,36),(43,40)], fill=arcade['white'])
    d.line((40,51,59,45,66,38), fill=arcade['pale'], width=2)
    return image


def energy_cell():
    image = glow(energy['glow'], 173, spread=19)
    d = ImageDraw.Draw(image)
    for start in (18, 138, 258):
        d.arc((13, 13, 83, 83), start, start + 72, fill=(*rgb(energy['edge']), 65), width=2)
    d.polygon(radial(48, 48, 27, 6, pi / 6), fill=ink)
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
    for x,y,sign in [(80,29,1),(20,74,-1),(39,12,1)]:
        d.polygon([(x-3,y-2),(x+sign*5,y-5),(x+sign*2,y),(x+sign*5,y+1),(x-2,y+4)], fill=energy['highlight'])
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


def debris(rank):
    base = steel[max(0, 2 - rank)]
    image = glow(base, 58 + rank * 44, spread=16 + rank * 2)
    d = ImageDraw.Draw(image)
    outer = [(13+3*(3-rank),54),(26,30),(50,23-rank*2),(77,34),(82,59),(64,76),(34,73)]
    inner = [(x+(48-x)*.13,y+(48-y)*.13) for x,y in outer]
    d.polygon(outer, fill=base, outline=ink, width=4)
    d.polygon(inner, fill=mix(rgb(base),rgb(arcade['navy']),.27))
    d.polygon([(20,51),(34,36),(52,30),(72,38),(65,48),(39,56)], fill=base)
    d.line((32,39,46,34,59,37), fill=arcade['white'], width=3)
    for i in range(rank + 1):
        d.ellipse((37+i*8, 49, 42+i*8, 54), fill=ink)
    if rank == 3:
        d.line((28,55,48,68,68,59), fill=steel[2], width=4)
        d.line((31,61,48,72,65,65), fill=steel[0], width=2)
    return image


for mode in tokens['themes']:
    for index in range(10):
        frames[f'{mode}-scrap-{index}'] = scrap(index, mode)
frames['gold'] = gold_ingot()
frames['energy'] = energy_cell()
frames['energy-orbit'] = energy_orbit()
frames['pole-charge'] = glow(energy['highlight'], 230, spread=19)
for i in range(4):
    frames[f'debris-{i}'] = debris(i)
scenery = {kind: machinery(kind, arcade) for kind in ('flux','cold','heat','water','acid',
    'prop-grate','prop-drain','prop-vent','prop-pipe','prop-sign','prop-stacks','prop-press','prop-crate')}
pack('scenery', scenery, 192)
frames['eye-pupil'] = pupil(arcade)
for kind in ('sweat', 'frost', 'rust', 'impact'):
    frames['face-' + kind] = status_mark(kind, arcade)
for role in ['steel', 'gold', 'energy', 'teal', 'heat', 'cold', 'flux', 'acid', 'water']:
    tone = steel[0] if role == 'steel' else roles[role]
    frames['fleck-' + role] = sparkle(tone, rays=6 if role == 'gold' else 4)
for index, tone in enumerate(pickups['palette']):
    frames[f'fleck-scrap-{index}'] = sparkle(tone)
pack('workshop', frames)


def figure(id, stage, mood, pixels=CHARACTER_TILE):
    key = f'{id}-{mood}'
    if pixels == CHARACTER_TILE:
        return composed(magnets[f'{id}-{stage}'], faces[key], anchors[key], arcade)
    index, person = person_by_id[id]
    body = shell(index, stage, person['accent'], arcade, pixels)
    face, eyes = expression(index, mood, arcade, pixels)
    return composed(body, face, eyes, arcade)


icon = figure('player', 0, 'ready')
icon.resize((192,192),Image.Resampling.LANCZOS).save(P/'app-icon.png')
icon.resize((32,32),Image.Resampling.LANCZOS).save(P/'favicon.png')
hero = [(figure('bot-2', 2, 'attack', 384), .25, .57, .80, -20),
        (figure('bot-6', 3, 'hit', 384), .77, .54, .86, 26),
        (figure('player', 4, 'ready', 384), .52, .53, 1.15, -8)]
for name, dimensions in [('hero',(1152,432)), ('social',(1200,630))]:
    poster(dimensions, hero, arcade, 'hero').save(P/(name+'.webp'),quality=91)
for mood, figures in {
    'victory': [(figure('bot-1',2,'hit',384), .29, .66, .77, -19), (figure('player',5,'ready',384), .53, .55, 1.18, 8)],
    'defeat': [(figure('bot-2',4,'ready',384), .69, .47, .86, 11), (figure('player',0,'hurt',384), .43, .60, 1.01, -18)],
}.items():
    poster((960,360), figures, arcade, mood).save(P/(mood+'.webp'),quality=90)

E.mkdir(parents=True,exist_ok=True)
sheet = Image.new('RGB', (1120, 50 + 132 * 4), tokens['themes']['dark']['background'])
d = ImageDraw.Draw(sheet)
d.text((16, 15), 'MAGNET / Arena roster', fill=arcade['white'], font_size=24)
for i, person in enumerate(people):
    x, y = 8 + i % 5 * 224, 48 + i // 5 * 132
    mood = MOODS[i % 5]
    art = figure(person['id'], 1 + i % 5, mood).resize((103,103), Image.Resampling.LANCZOS)
    sheet.paste(art,(x+55,y+4),art)
    d.text((x+12, y+104), person['name'], fill=arcade['paper'], font_size=17)
sheet.save(E/'roster.webp', quality=93)

sheet = Image.new('RGB', (1070, 470), tokens['themes']['light']['background'])
d = ImageDraw.Draw(sheet)
for title,y in [('Growth',20),('Expressions',166),('Hazards and salvage',318)]:
    d.text((16,y),title,fill=ink,font_size=22)
for i in range(6):
    art = figure('player', i, 'idle' if i<2 else 'move').resize((106,106),Image.Resampling.LANCZOS)
    sheet.paste(art,(i*164+36,48),art)
for i,mood in enumerate(MOODS):
    art = figure('player', 2, mood).resize((94,94),Image.Resampling.LANCZOS)
    x = i*106+3
    sheet.paste(art,(x,196),art)
    d.text((x+12,290),mood.title(),fill=ink,font_size=15)
environment = {**scenery, **frames}
for i,key in enumerate(('heat','cold','acid','water','flux','debris-3','gold','energy','light-scrap-0','light-scrap-6')):
    art = environment[key].resize((96,96),Image.Resampling.LANCZOS)
    sheet.paste(art,(i*106+8,349),art)
sheet.save(E/'artwork.webp',quality=93)

manifest = {'paletteRoles': list(roles), 'atlases': {'magnets': list(magnets), 'faces': list(faces),
    'workshop': list(frames), 'scenery': list(scenery)}}
Path('brand/asset-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
