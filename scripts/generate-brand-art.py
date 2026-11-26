"""Generate original in-game artwork from MAGNET's shared token palette."""
import json
from math import cos, pi, sin
from pathlib import Path
from PIL import Image, ImageDraw

tokens = json.loads(Path('brand/tokens.json').read_text())
roles = tokens['roles']
steel = tokens['steel']
ink = tokens['themes']['light']['ink']
P = Path('public')
E = Path('docs/evidence/rc2')
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


def magnet(index, stage):
    image, d = tile()
    trim = tokens['rivalTrim'][index]
    r = 34 + stage
    d.ellipse((49-r, 51-r, 49+r, 51+r), fill=(35, 54, 74, 66))
    d.ellipse((48-r, 48-r, 48+r, 48+r), fill=ink)
    d.ellipse((50-r, 50-r, 46+r, 46+r), fill=trim)
    d.ellipse((54-r, 54-r, 42+r, 42+r), fill=steel[3])
    for x, y in radial(48, 48, r - 7, [4, 6, 8, 12, 16, 24][stage]):
        d.ellipse((x-3, y-3, x+3, y+3), fill=ink)
        d.ellipse((x-2, y-2, x, y), fill=steel[0])
    d.rounded_rectangle((21, 24, 72, 72), 11, fill=ink)
    for a, b, pole in [(28, 43, 'coral'), (53, 68, 'cobalt')]:
        d.rounded_rectangle((27, a, 68, b), 6, fill=roles[pole])
        d.rounded_rectangle((58, a+2, 66, b-2), 4, fill=steel[0])
    d.rounded_rectangle((23, 28, 38, 68), 8, fill=trim)
    if index == 2:
        d.polygon(radial(30, 48, 6, 6), fill=steel[0])
    elif index == 4:
        d.ellipse((26,44,34,52), outline=steel[0], width=2)
    else:
        d.rounded_rectangle((26, 44, 35, 52), 4, fill=steel[0])
    return image


magnets = {f'{name}-{stage}': magnet(i, stage) for i, name in enumerate(['player', 'bot-1', 'bot-2', 'bot-3', 'bot-4'])
           for stage in range(len(tokens['shellStages']))}
pack('magnets', magnets)


def scrap(i, palette, detailed):
    image, d = tile()
    c = palette[i]
    d.ellipse((22, 32, 80, 80), fill=(35,54,74,64))
    if not detailed:
        d.polygon(radial(48, 48, 32, 6), fill=c, outline=ink, width=4)
    elif i in (0, 1, 4):
        if i == 1:
            d.ellipse((18, 18, 78, 78), fill=c, outline=ink, width=5)
        else:
            d.polygon(radial(48, 48, 33, 6 if i == 0 else 12), fill=c, outline=ink, width=4)
            if i == 4:
                for x, y in radial(48, 48, 31, 6):
                    d.ellipse((x-7,y-7,x+7,y+7), fill=c)
        d.ellipse((37, 37, 59, 59), fill=ink)
    elif i in (2, 3, 8):
        d.rounded_rectangle((39, 30, 59, 78), 8, fill=c, outline=ink, width=4)
        d.rounded_rectangle((25, 20, 72, 43), 10 if i == 8 else 5, fill=c, outline=ink, width=4)
        if i == 3:
            for y in (48, 57, 66):
                d.line((40,y,59,y),fill=steel[1],width=3)
    elif i == 5:
        d.polygon([(20,25),(73,22),(78,59),(50,74),(29,61)],fill=c,outline=ink,width=4)
    elif i == 6:
        d.line([(32 + 30 * (j % 2), 19 + 8 * j) for j in range(8)],fill=c,width=10,joint='curve')
    elif i == 7:
        d.rounded_rectangle((29,18,67,78),16,outline=c,width=10)
        d.line((30,53,66,53),fill=c,width=7)
    else:
        d.line((29,23,29,69,71,69),fill=c,width=14,joint='curve')
    d.line((26, 29, 39, 22), fill=steel[0], width=3)
    return image


def object_art(kind):
    im, d = tile()
    if kind == 'gold':
        d.polygon([(14,55),(26,32),(73,32),(83,58),(69,69),(23,69)],fill=roles['gold'],outline=ink,width=4)
        d.line((28,37,66,37),fill=steel[0],width=4)
    elif kind == 'energy':
        d.ellipse((12,29,84,67),outline=roles['energy'],width=5)
        d.polygon(radial(48,48,24,6,pi/6),fill=roles['energy'],outline=ink,width=4)
        d.line((36,41,49,29),fill=steel[0],width=3)
    elif kind.startswith('debris'):
        rank = int(kind[-1])
        d.polygon(radial(48,48,23 + rank*5,6,.23),fill=steel[2-rank],outline=ink,width=5)
        d.line((27,43,46,35,64,42),fill=steel[0],width=5)
        for i in range(rank+1):
            d.ellipse((35+i*10,47,40+i*10,52),fill=ink)
    elif kind in ('flux', 'cold'):
        d.ellipse((10,10,86,86),outline=roles[kind],width=4)
        for angle in range(6):
            a = angle*pi/3
            d.polygon([(48+r*cos(a+b),48+r*sin(a+b)) for r,b in [(13,-.35),(36,0),(13,.35)]],
                      fill=roles[kind],outline=ink,width=2)
        d.polygon(radial(48,48,11,6),fill=steel[0],outline=ink,width=2)
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
    else:
        d.polygon([(13,46),(24,27),(48,19),(74,28),(85,48),(72,67),(42,76),(22,64)],
                  fill=roles[kind],outline=ink,width=4)
        d.ellipse((26,36,69,61),outline=steel[0],width=3)
        if kind == 'acid':
            d.polygon(radial(48,48,12,6),fill=ink)
        else:
            d.line((33,50,42,43,53,53,64,46),fill=steel[0],width=4)
    return im


for mode, theme in tokens['themes'].items():
    for i in range(10):
        for detail in (0,1):
            frames[f'{mode}-scrap-{i}-{detail}'] = scrap(i, theme['scrap'], detail)
for kind in ['gold','energy','debris-0','debris-1','debris-2','flux','cold','heat','water','acid','prop-grate','prop-drain']:
    frames[kind] = object_art(kind)
for role in ['steel', 'gold', 'energy', 'teal', 'heat', 'cold', 'flux', 'acid', 'water']:
    im, d = tile()
    d.polygon(radial(48, 48, 34, 6), fill=steel[0] if role == 'steel' else roles[role])
    d.ellipse((29, 27, 43, 39), fill=steel[0])
    frames['fleck-' + role] = im
pack('workshop', frames)


def pole_mark():
    im, d = tile()
    d.rounded_rectangle((14,16,82,79),18,fill=ink)
    d.rounded_rectangle((26,30,72,66),11,fill=steel[0])
    for x, pole in [(28,'coral'),(55,'cobalt')]:
        d.rounded_rectangle((x,27,x+15,69),7,fill=roles[pole])
        d.ellipse((x+3,27,x+12,36),fill=steel[0])
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
sheet=Image.new('RGB',(960,768),tokens['themes']['light']['background'])
d=ImageDraw.Draw(sheet)
for col, mode in enumerate(tokens['themes']):
    x0=480*col
    d.rectangle((x0,0,x0+480,768),fill=tokens['themes'][mode]['background'])
    d.text((x0+12,10),mode.upper(),fill=tokens['themes'][mode]['ink'])
    for i,(key,img) in enumerate([*magnets.items(), *((k,v) for k,v in frames.items() if k.startswith(mode) or not k.startswith(('light','dark'))) ]):
        x,y = x0 + (i%8)*60, 29+(i//8)*60
        sheet.paste(img.resize((52,52),Image.Resampling.LANCZOS),(x+4,y),img.resize((52,52),Image.Resampling.LANCZOS))
sheet.save(E/'atlas-contact.webp',quality=90)
(Path('brand')/'asset-manifest.json').write_text(json.dumps({'paletteRoles': list(roles), 'atlases': {'magnets': list(magnets), 'workshop': list(frames)}},indent=2)+'\n')
