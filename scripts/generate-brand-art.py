"""Generate original in-game artwork from MAGNET's shared token palette."""
import json
from math import cos, exp, hypot, pi, sin
from pathlib import Path
from PIL import Image, ImageColor, ImageDraw
from arcade_art import CHARACTER_TILE, Pen, face_mount, poster, pupil, shell, star, status_mark
from living_faces import BASE_MOODS, FACE_TILE, MOODS, blink, composed, expression
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
E = Path('docs/evidence/rc7a')
N = 96


def radial(x, y, r, count, offset=0):
    return [(x + r * cos(offset + i * 2 * pi / count), y + r * sin(offset + i * 2 * pi / count)) for i in range(count)]


def tile():
    image = Image.new('RGBA', (N, N))
    return image, ImageDraw.Draw(image)


frames = {}


def pack(name, items, tile_size=N, columns=10, trim=False):
    width = min(columns, len(items))
    rectangles = {key: art.getbbox() if trim else (0, 0, tile_size, tile_size) for key, art in items.items()}
    padding = int(trim)
    cell_width = max(right - left for left, _, right, _ in rectangles.values()) + 2 * padding
    cell_height = max(bottom - top for _, top, _, bottom in rectangles.values()) + 2 * padding
    sheet = Image.new('RGBA', (width * cell_width, ((len(items) + width - 1) // width) * cell_height))
    mapping = {}
    for i, (key, tile_image) in enumerate(items.items()):
        left, top, right, bottom = rectangles[key]
        x, y = i % width * cell_width + padding, i // width * cell_height + padding
        w, h = right - left, bottom - top
        sheet.paste(tile_image.crop(rectangles[key]) if trim else tile_image, (x, y))
        mapping[key] = {'frame': {'x': x, 'y': y, 'w': w, 'h': h}}
        if trim:
            mapping[key].update(trimmed=True, sourceSize={'w': tile_size, 'h': tile_size},
                                spriteSourceSize={'x': left, 'y': top, 'w': w, 'h': h})
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
poses = {}
anchors = {'mounts': {}, 'eyes': {}}
assert len(people) == 20
for index, person in enumerate(people):
    name = person['id']
    anchors['mounts'][name] = []
    for stage in range(len(tokens['shellStages'])):
        magnets[f'{name}-{stage}'] = shell(index, stage, person['accent'], arcade)
        x, y, size = face_mount(index, stage)
        anchors['mounts'][name].append([round(x-64, 2), round(y-64, 2), size])
    for mood in MOODS:
        key = f'{name}-{mood}'
        layers, anchors['eyes'][key] = expression(index, mood, arcade)
        poses[key] = layers
        for name_of_part, art in layers.items():
            faces[f'{key}-{name_of_part}'] = art
    faces[f'{name}-blink-eyes'] = blink(index, arcade)
person_by_id = {person['id']: (index, person) for index, person in enumerate(people)}
for index, person in enumerate(people):
    magnets[person['id'] + '-overload'] = shell(index, 5, person['accent'], arcade, ultimate=True)
pack('magnets', magnets, CHARACTER_TILE)
pack('faces', faces, FACE_TILE, columns=24, trim=True)
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


def figure(id, stage, mood, pixels=CHARACTER_TILE, gaze=(.55, -.17), ultimate=False):
    key = f'{id}-{mood}'
    index, person = person_by_id[id]
    mount = face_mount(index, stage)
    if pixels == CHARACTER_TILE:
        body = magnets[id + '-overload' if ultimate else f'{id}-{stage}']
        return composed(body, poses[key], anchors['eyes'][key], mount, arcade, gaze)
    body = shell(index, stage, person['accent'], arcade, pixels, ultimate=ultimate)
    layers, eyes = expression(index, mood, arcade, round(FACE_TILE * pixels / CHARACTER_TILE))
    return composed(body, layers, eyes, mount, arcade, gaze)


icon = figure('player', 0, 'excited')
icon.resize((192,192),Image.Resampling.LANCZOS).save(P/'app-icon.png')
icon.resize((32,32),Image.Resampling.LANCZOS).save(P/'favicon.png')
plate_file = Path('art-source/assembly-bay.webp')
with Image.open(plate_file) as plate:
    hero = [(figure('bot-2', 2, 'aggressive', 384), .27, .57, .74, -28),
            (figure('bot-6', 3, 'shocked', 384), .76, .50, .82, 31),
            (figure('player', 4, 'excited', 384), .51, .56, 1.14, -17)]
    loose = [(frames[key],x,y,size,angle) for key,x,y,size,angle in (
        ('fracture-shard-1',.17,.43,.15,-25), ('dark-scrap-3',.31,.24,.11,0),
        ('gold',.71,.74,.16,34), ('fracture-shard-2',.83,.32,.19,29),
        ('energy',.89,.65,.17,0), ('dark-scrap-0',.48,.87,.11,0), ('fracture-shard-0',.36,.73,.15,-17))]
    for name, dimensions in [('hero',(1152,432)), ('social',(1200,630))]:
        poster(dimensions, hero, arcade, 'hero', plate, loose).save(P/(name+'.webp'),quality=90)
    portrait = [(figure('bot-2', 2, 'aggressive', 384), .25, .30, .49, -22),
                (figure('bot-6', 3, 'shocked', 384), .78, .68, .51, 29),
                (figure('player', 4, 'excited', 384), .48, .49, .69, -16)]
    poster((760, 840), portrait, arcade, 'hero', plate, loose).save(P/'hero-portrait.webp',quality=88)
    for mood, figures in {
        'victory': [(figure('bot-1',2,'shocked',384), .24, .70, .67, -19),
                    (figure('player',5,'excited',384), .53, .55, 1.15, 8)],
        'defeat': [(figure('bot-2',3,'excited',384), .71, .46, .78, 17),
                   (figure('player',1,'injured',384), .43, .64, .94, -29)],
        'endless': [(figure('player',2,'satisfied',384), .46,.55,1.04,-11),
                    (figure('bot-14',1,'relaxed',384), .72,.65,.73,21)],
    }.items():
        poster((960,360), figures, arcade, mood, plate, loose).save(P/(mood+'.webp'),quality=89)
    detonation = {
        'detonation-win': ('victory', [(figure('player',5,'manic',384,ultimate=True),.47,.53,1.19,-9),
                                     (figure('bot-7',2,'panic',384),.78,.64,.75,27)]),
        'detonation-survive': ('endless', [(figure('player',3,'satisfied',384),.57,.59,1.0,-20),
                                          (figure('bot-2',5,'panic',384,ultimate=True),.22,.52,.75,21)]),
        'detonation-loss': ('defeat', [(figure('player',2,'shocked',384),.54,.70,1.06,-32),
                                      (figure('bot-16',5,'strained',384,ultimate=True),.78,.39,.64,27)]),
    }
    for name, (mood, figures) in detonation.items():
        poster((960,360), figures, arcade, mood, plate, loose).save(P/(name+'.webp'),quality=89)

E.mkdir(parents=True, exist_ok=True)

def contact_sheet(name, columns, width, height, frames_list, backdrop, directory=E):
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
    sheet.save(directory/(name+'.webp'),quality=92)


contact_sheet('roster',5,146,128,
    [(person['name'],figure(person['id'],2,BASE_MOODS[i % len(BASE_MOODS)])) for i, person in enumerate(people)], arcade['navy'])
contact_sheet('all-growth-stages',6,126,109,
    [(person['name']+' / '+str(tokens['shellStages'][stage]),figure(person['id'],stage,'relaxed')) for person in people for stage in range(6)],
    arcade['navy'])
contact_sheet('all-expressions',12,118,104,
    [(person['name']+' / '+mood,figure(person['id'],2,mood)) for person in people for mood in BASE_MOODS], arcade['navy'])

sheet = Image.new('RGB', (1200, 575), arcade['navy'])
d = ImageDraw.Draw(sheet)
d.text((18,14),'Eye direction and mouth shape',fill=arcade['paper'],font_size=24)
for index, (label, gaze) in enumerate([('West',(-1,0)),('North',(0,-1)),('Centre',(0,0)),('East',(1,0)),('South',(0,1)),('North East',(.707,-.707))]):
    x = 200 * index
    art = figure('player', 2, 'worried', 180, gaze)
    sheet.paste(art,(x+10,38),art)
    d.text((x+23,208),label,fill=arcade['paper'],font_size=16)
for index, mood in enumerate(BASE_MOODS):
    x = 200*(index%6)
    y = 250 + 154*(index//6)
    art = figure('bot-1', 2, mood, 160)
    close = art.crop((27,42,88,114)).resize((100,118), Image.Resampling.LANCZOS)
    sheet.paste(close,(x+14,y),close)
    # A second swatch keeps the shell at a representative gameplay pixel size.
    preview = art.resize((53,53), Image.Resampling.LANCZOS)
    sheet.paste(preview,(x+120,y+33),preview)
    d.text((x+22,y+120),mood.title(),fill=arcade['paper'],font_size=16)
sheet.save(E/'gaze-and-mouths.webp',quality=93)

critical_evidence = E.parent / 'rc7b'
critical_evidence.mkdir(parents=True, exist_ok=True)
contact_sheet('ultimate-roster', 5, 176, 142,
    [(person['name'],figure(person['id'],5,'manic',ultimate=True)) for person in people], arcade['navy'], critical_evidence)
contact_sheet('overload-expressions', 4, 166, 146,
    [(person['name']+' / '+mood,figure(person['id'],5,mood,ultimate=True)) for person in people for mood in MOODS[len(BASE_MOODS):]],
    arcade['navy'], critical_evidence)

manifest = {'paletteRoles': list(roles), 'atlases': {'magnets': list(magnets), 'faces': list(faces),
    'workshop': list(frames), 'scenery': list(scenery)},
    'illustrations': ['app-icon.png','favicon.png','hero.webp','hero-portrait.webp','social.webp','victory.webp','defeat.webp','endless.webp',
                      'detonation-win.webp','detonation-survive.webp','detonation-loss.webp'],
    'audio': ['soundtrack.ogg'],
    'sourceArtwork': [str(plate_file)],
    'generators': ['scripts/generate-brand-art.py','scripts/generate-soundtrack.py']}
Path('brand/asset-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
