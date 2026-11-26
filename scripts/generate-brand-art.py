"""Generate original in-game artwork from MAGNET's shared token palette."""
import json
from math import cos, exp, hypot, pi, sin
from pathlib import Path
from PIL import Image, ImageColor, ImageDraw
from arcade_art import (CHARACTER_TILE, FACE_BOX, MOODS, Pen, composed, expression, poster, pupil, shell, star, status_mark)
from scrapyard_art import DISTRICTS, HAZARDS, HAZARD_CELS, PROPS, device, district_pad, hazard_cel

tokens = json.loads(Path('brand/tokens.json').read_text())
roster = json.loads(Path('brand/roster.json').read_text())
roles = tokens['roles']
steel = tokens['steel']
arcade = tokens['arcade']
ink = arcade['ink']
pickups = tokens['pickups']
energy = pickups['energyMaterial']
P = Path('public')
E = Path('docs/evidence/rc6')
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
    faces[f'{name}-blink'], anchors[f'{name}-blink'] = expression(index, 'idle', arcade, blink=True)
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
    image = glow(base, 208 if mode == 'dark' else 176, spread=19 if mode == 'dark' else 16.5)
    d = ImageDraw.Draw(image)
    edge = mix(rgb(tokens['themes'][mode]['scrap'][i]), rgb(ink), 0.52)
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
    image.alpha_composite(material(base, steel[0], mask, strength=1.14))
    d = ImageDraw.Draw(image)
    d.polygon([(33, 42), (36, 34), (46, 31), (51, 34), (42, 38), (37, 44)], fill=arcade['white'])
    d.arc((29,29,67,68), 37, 122, fill=mix(rgb(base),rgb(arcade['white']),.40), width=3)
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
    image = glow(arcade['yellow'], 203, spread=20)
    d = ImageDraw.Draw(image)
    d.polygon([(14,52),(29,31),(46,20),(66,32),(81,44),(76,61),(61,75),
               (34,72),(22,66)], fill=arcade['yellow'], outline=ink, width=4)
    d.polygon([(19,52),(40,50),(47,66),(35,69),(24,64)], fill=arcade['orange'])
    d.polygon([(47,65),(58,51),(77,45),(72,58),(60,71)], fill=pickups['goldEdge'])
    d.polygon([(31,34),(46,24),(64,34),(57,48),(40,50)], fill=arcade['pale'])
    d.polygon([(33,35),(45,26),(51,29),(42,36),(36,38)], fill=arcade['white'])
    d.polygon([(59,49),(62,39),(76,45),(69,47)],fill=arcade['orange'])
    d.line((43,51,58,49,64,35), fill=arcade['white'], width=2)
    return image


def energy_cell():
    image = glow(energy['glow'], 224, spread=20)
    d = ImageDraw.Draw(image)
    for start in (18, 138, 258):
        d.arc((13, 13, 83, 83), start, start + 72, fill=(*rgb(energy['edge']), 65), width=2)
    d.polygon(radial(48, 48, 28, 6, pi / 6), fill=ink)
    d.polygon(radial(48, 48, 24, 6, pi / 6), fill=energy['edge'])
    mask = Image.new('L', (N, N))
    ImageDraw.Draw(mask).polygon(radial(48, 47, 21, 6, pi / 6), fill=255)
    image.alpha_composite(material(energy['body'], energy['highlight'], mask))
    d = ImageDraw.Draw(image)
    d.line((29, 40, 39, 30, 52, 30), fill=energy['highlight'], width=3)
    d.line((31, 57, 40, 67, 58, 67), fill=energy['shadow'], width=4)
    # The white bolt is wide enough to retain an unmistakable bright center at distance.
    d.polygon([(49, 31), (35, 50), (46, 50), (43, 65), (62, 43), (50, 43), (55, 31)], fill=energy['core'])
    return image


def energy_orbit():
    image = glow(energy['glow'], 119, spread=23)
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


SHARDS = (
    ((31,52),(42,36),(58,33),(70,44),(63,59),(54,60),(49,68),(33,66)),
    ((20,48),(36,28),(47,35),(60,33),(73,44),(69,63),(55,73),(31,69),(33,56)),
    ((15,48),(34,24),(59,27),(78,35),(83,57),(68,58),(68,73),(42,77),(22,63)),
    ((13,51),(23,27),(44,18),(62,25),(81,25),(85,53),(75,73),(53,79),(30,69),(19,72)),
)


def debris(rank, cosmetic=None):
    p = Pen(96, arcade)
    base = steel[1] if rank >= 2 else steel[3]
    outer = SHARDS[rank]
    shade = mix(rgb(base),rgb(arcade['navy']),.54)
    p.poly(outer, shade, 4.4)
    p.poly([(x+(49-x)*.25,y+(45-y)*.20) for x,y in outer[:5]]+[(59,51),(30,61)], base, 1.8)
    p.line([(30,46),(43,32 if rank >= 2 else 40),(61,36 if rank >= 2 else 44)],arcade['white'],3.7)
    if rank:
        for i in range(rank):
            cx,cy = 40+i*11,52+(i%2)*8
            p.ellipse((cx-3,cy-3,cx+3,cy+3),arcade['steel'],1.6)
    if rank >= 2:
        p.line([(36,61),(47,68),(64,66)],steel[4],3.8)
        p.line([(37,59),(48,64),(61,63)],steel[1],1.7)
    if cosmetic:
        p.poly([(31,46),(43,36),(62,39),(56,46),(37,53)], arcade[cosmetic], 1.3)
        for side,(x,y) in enumerate([(34,46),(43,49),(54,38)]):
            p.line([(x-5,y+8),(x+1,y-6)],arcade['rust'] if side==0 else steel[4],1.5)
        return p.finish()
    image = glow(steel[0] if rank < 3 else arcade['cyan'], 69 + rank * 39, spread=17+rank)
    image.alpha_composite(p.finish())
    return image


for mode in tokens['themes']:
    for index in range(10):
        frames[f'{mode}-scrap-{index}'] = scrap(index, mode)
frames['gold'] = gold_ingot()
frames['energy'] = energy_cell()
frames['energy-orbit'] = energy_orbit()
stationary_orbit = frames['energy-orbit'].copy()
stationary_orbit.putalpha(stationary_orbit.getchannel('A').point(lambda alpha: round(alpha * 0.94)))
frames['energy-static'] = Image.alpha_composite(stationary_orbit, frames['energy'])
frames['pole-charge'] = glow(energy['highlight'], 230, spread=19)
for i in range(4):
    frames[f'debris-{i}'] = debris(i)
for i, finish in enumerate(('red','steel','blue')):
    frames[f'fracture-shard-{i}'] = debris(i+1, cosmetic=finish)
scenery = {kind: device(kind, arcade) for kind in (*HAZARDS, 'flux-drained', *PROPS)}
for kind in HAZARDS:
    for index in range(HAZARD_CELS):
        scenery[f'{kind}-motion-{index}'] = hazard_cel(kind, index, arcade)
for index, name in enumerate(DISTRICTS):
    scenery[f'floor-{name}'] = district_pad(index, arcade, tokens['legacy']['districts'][f'color{index+1}'])
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
plate_file = Path('art-source/assembly-bay.webp')
with Image.open(plate_file) as plate:
    hero = [(figure('bot-2', 2, 'attack', 384), .27, .57, .74, -28),
            (figure('bot-6', 3, 'hit', 384), .76, .50, .82, 31),
            (figure('player', 4, 'ready', 384), .51, .56, 1.14, -17)]
    loose = [(frames[key],x,y,size,angle) for key,x,y,size,angle in (
        ('fracture-shard-1',.17,.43,.15,-25), ('dark-scrap-3',.31,.24,.11,0),
        ('gold',.71,.74,.16,34), ('fracture-shard-2',.83,.32,.19,29),
        ('energy',.89,.65,.17,0), ('dark-scrap-0',.48,.87,.11,0), ('fracture-shard-0',.36,.73,.15,-17))]
    for name, dimensions in [('hero',(1152,432)), ('social',(1200,630))]:
        poster(dimensions, hero, arcade, 'hero', plate, loose).save(P/(name+'.webp'),quality=90)
    portrait = [(figure('bot-2', 2, 'attack', 384), .25, .30, .49, -22),
                (figure('bot-6', 3, 'hit', 384), .78, .68, .51, 29),
                (figure('player', 4, 'ready', 384), .48, .49, .69, -16)]
    poster((760, 840), portrait, arcade, 'hero', plate, loose).save(P/'hero-portrait.webp',quality=88)
    for mood, figures in {
        'victory': [(figure('bot-1',2,'hit',384), .24, .70, .67, -19),
                    (figure('player',5,'ready',384), .53, .55, 1.15, 8)],
        'defeat': [(figure('bot-2',3,'ready',384), .71, .46, .78, 17),
                   (figure('player',1,'hurt',384), .43, .64, .94, -29)],
        'endless': [(figure('player',2,'collect',384), .46,.55,1.04,-11),
                    (figure('bot-14',1,'idle',384), .72,.65,.73,21)],
    }.items():
        poster((960,360), figures, arcade, mood, plate, loose).save(P/(mood+'.webp'),quality=89)

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

def contact_sheet(name, columns, width, height, frames_list, backdrop):
    rows = (len(frames_list)+columns-1)//columns
    sheet = Image.new('RGB', (columns*width, 38+rows*height), backdrop)
    d = ImageDraw.Draw(sheet)
    d.text((14,9), name.replace('-', ' ').upper(), fill=arcade['paper'], font_size=19)
    for i, (title, art) in enumerate(frames_list):
        x,y = i%columns*width,38+i//columns*height
        size = min(width-9, height-17)
        image = art.resize((size,size),Image.Resampling.LANCZOS)
        sheet.paste(image,(x+(width-size)//2,y),image)
        d.text((x+4,y+height-16),title,fill=arcade['paper'],font_size=12)
    sheet.save(E/(name+'.webp'),quality=92)


contact_sheet('all-growth-stages',6,120,101,
    [(person['name']+' / '+str(tokens['shellStages'][stage]),figure(person['id'],stage,'idle')) for person in people for stage in range(6)],
    arcade['navy'])
contact_sheet('all-expressions',10,106,91,
    [(person['name']+' / '+mood,figure(person['id'],2,mood)) for person in people for mood in MOODS],
    arcade['navy'])
contact_sheet('scenery',8,117,99,[(key,value) for key,value in scenery.items() if '-motion-' not in key],
    arcade['navy'])

manifest = {'paletteRoles': list(roles), 'atlases': {'magnets': list(magnets), 'faces': list(faces),
    'workshop': list(frames), 'scenery': list(scenery)},
    'illustrations': ['app-icon.png','favicon.png','hero.webp','hero-portrait.webp','social.webp','victory.webp','defeat.webp','endless.webp'],
    'audio': ['soundtrack.ogg'],
    'sourceArtwork': [str(plate_file)],
    'generators': ['scripts/generate-brand-art.py','scripts/generate-soundtrack.py']}
Path('brand/asset-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
