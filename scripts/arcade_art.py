"""Original cel artwork for the playable MAGNET characters and scrapyard."""
from math import cos, pi, sin
from PIL import Image, ImageColor, ImageDraw, ImageOps

CHARACTER_TILE = 128

# Eye height, eyebrow slope, idle mouth, and shell decal by roster order.
PERSONALITIES = (
    (1.02, 1.16, 1.25, 'smirk', 'stripes'),    # Player
    (0.73, 1.34, 1.8, 'teeth', 'coin'),       # Copper
    (1.38, 0.94, -2.5, 'grin', 'bolt'),       # Spark
    (1.27, 1.42, -1.0, 'gasp', 'arrow'),      # Drift
    (0.73, 0.78, 0.0, 'calm', 'orbit'),       # Orbit
    (0.83, 1.16, -1.3, 'smirk', 'rivets'),    # Alloy
    (0.79, 0.70, 3.4, 'teeth', 'claw'),       # Bolt
    (1.19, 0.91, 2.2, 'grin', 'bolt'),        # Flux
    (0.73, 1.02, -2.2, 'smirk', 'arrow'),     # Cobalt
    (1.09, 0.87, 1.1, 'calm', 'coin'),       # Nickel
    (1.17, 0.89, -3.1, 'gasp', 'orbit'),      # Echo
    (1.36, 1.15, -1.9, 'grin', 'bolt'),       # Volt
    (0.65, 1.14, 2.7, 'tooth', 'patch'),      # Rusty
    (1.13, 1.20, -0.5, 'smirk', 'star'),      # Nova
    (0.83, 1.39, 2.7, 'grin', 'coil'),        # Coil
    (1.15, 0.66, -2.5, 'teeth', 'patch'),     # Static
    (0.82, 0.69, 3.15, 'teeth', 'rivets'),   # Torque
    (1.15, 0.83, 1.25, 'tooth', 'stripes'),  # Zinc
    (1.36, 0.82, -3.6, 'gasp', 'claw'),      # Surge
    (0.83, 0.93, 0.55, 'smirk', 'star'),      # Chrome
)


def tone(a, b, amount):
    left = ImageColor.getrgb(a) if isinstance(a, str) else a[:3]
    right = ImageColor.getrgb(b) if isinstance(b, str) else b[:3]
    return tuple(round(x + (y - x) * amount) for x, y in zip(left, right))


def star(x, y, outer, inner, count=5, tilt=-pi / 2):
    return [(x + cos(tilt + pi * i / count) * (inner if i % 2 else outer),
             y + sin(tilt + pi * i / count) * (inner if i % 2 else outer)) for i in range(count * 2)]


class Pen:
    def __init__(self, size, palette, scale=3):
        self.size = size
        self.scale = scale
        self.ink = palette['ink']
        self.image = Image.new('RGBA', (size * scale, size * scale))
        self.draw = ImageDraw.Draw(self.image)

    def points(self, points):
        return [(round(x * self.scale), round(y * self.scale)) for x, y in points]

    def box(self, box):
        return tuple(round(v * self.scale) for v in box)

    def line(self, points, color=None, width=2):
        self.draw.line(self.points(points), fill=color or self.ink, width=max(1, round(width * self.scale)), joint='curve')

    def poly(self, points, fill, width=0):
        points = list(points)
        self.draw.polygon(self.points(points), fill=fill)
        if width:
            self.line([*points, points[0]], width=width)

    def shape(self, origin, segments, fill, width=0):
        """A closed outline with straight segments and cubic Béziers."""
        points = [origin]
        for segment in segments:
            if len(segment) == 2:
                points.append(segment)
                continue
            x0, y0 = points[-1]
            a, b, c, d, x, y = segment
            for i in range(1, 13):
                t = i / 12
                q = 1 - t
                points.append((q**3*x0 + 3*q*q*t*a + 3*q*t*t*c + t**3*x,
                               q**3*y0 + 3*q*q*t*b + 3*q*t*t*d + t**3*y))
        self.poly(points, fill, width)

    def ellipse(self, box, fill, width=0):
        self.draw.ellipse(self.box(box), fill=fill, outline=self.ink if width else None,
                          width=max(1, round(width * self.scale)))

    def rounded(self, box, corner, fill, width=0):
        self.draw.rounded_rectangle(self.box(box), round(corner * self.scale), fill=fill,
                                    outline=self.ink if width else None, width=max(1, round(width * self.scale)))

    def finish(self, size=None):
        pixels = size or self.size
        return self.image.resize((pixels, pixels), Image.Resampling.LANCZOS)


def bolt(pen, x, y, r, face, gleam):
    hexagon = star(x, y, r, r * .88, 6, 0)
    pen.poly(hexagon, face, 1.5)
    pen.line([(x-r*.48, y+r*.37), (x+r*.48, y-r*.37)], width=1.4)
    pen.line([(x-r*.46, y-r*.48), (x-r*.01, y-r*.65)], gleam, 1.4)


def decal(p, kind, x, y, paint, edge):
    if kind == 'bolt':
        p.poly([(x-6,y-2),(x+1,y-9),(x+2,y-3),(x+7,y-3),(x-1,y+8),(x-2,y+2)], paint, 1.8)
    elif kind in ('coin', 'orbit', 'coil'):
        p.ellipse((x-6,y-6,x+6,y+6), paint, 1.8)
        p.ellipse((x-2,y-3,x+3,y+2), edge, 1.3)
        if kind != 'coin':
            p.line([(x-8,y+4),(x+7,y-4)], edge, 1.5)
    elif kind == 'star':
        p.poly(star(x,y,7,3.1,5), paint, 1.6)
    elif kind == 'arrow':
        p.poly([(x-7,y-4),(x,y-4),(x,y-8),(x+7,y),(x,y+7),(x,y+3),(x-7,y+3)], paint, 1.6)
    elif kind == 'patch':
        p.poly([(x-8,y+2),(x+4,y-7),(x+8,y-1),(x-4,y+8)], paint, 1.6)
        p.line([(x-3,y-2),(x+2,y+4)], edge, 1.3)
    else:
        for n in (-4, 2):
            p.poly([(x-5+n,y+4),(x-2+n,y+4),(x+4+n,y-4),(x+1+n,y-4)], paint, 1.2)


# Back curvature, fore-pole offset, jaw asymmetry, and trim family.
CHASSIS = (
    (0,  1, -1, 'forged'), (+1, -2,  1, 'cast'), (-1,  2, -2, 'cut'),
    (2, -3, -2, 'cut'), (3, -1,  1, 'cast'), (0,  0, -1, 'forged'),
    (-2,  3,  1, 'forged'), (2,  1,  3, 'cut'), (-1,  2, -2, 'forged'),
    (2, -3,  0, 'cast'), (1,  2,  2, 'cast'), (-1,  3, -1, 'cut'),
    (-3, -2,  2, 'forged'), (3,  1, -2, 'cut'), (3, -2,  1, 'cast'),
    (1,  0,  2, 'cut'), (-3,  2,  0, 'forged'), (2, -1,  1, 'forged'),
    (1,  2, -3, 'cut'), (1,  0, -1, 'cast'),
)


def face_mount(index, stage):
    arch, _, tilt, _ = CHASSIS[index]
    return (round(45.8 + arch * .24 - stage * .22, 2),
            round(63.2 + tilt * .31 + max(0, stage - 2) * .18, 2),
            (.89, .92, .94, .96, .98, 1)[stage])


def seat(p, index, stage, trim, palette):
    x, y, size = face_mount(index, stage)

    def moved(points):
        return tuple((x if i % 2 == 0 else y) + size * n for i, n in enumerate(points))

    def panel(start, segments, fill, stroke=0):
        p.shape(moved(start), [moved(segment) for segment in segments], fill, stroke)

    panel((-15, -26), [(4,-30,16,-27,21,-19), (25,-10,23,12,19,22),
        (10,30,-8,30,-18,23), (-24,18,-24,5,-23,-6), (-23,-15,-20,-21,-15,-26)],
        tone(trim, palette['navy'], .46), 2.65)
    panel((-13, -23), [(0,-26,15,-25,18,-17), (22,-7,20,11,16,20),
        (7,25,-8,25,-15,20), (-21,17,-21,4,-20,-6), (-20,-15,-17,-20,-13,-23)],
        tone(trim, palette['paper'], .72), 1.75)
    panel((-18, 11), [(-15,18,-7,22,2,22), (8,22,14,19,17,15),
        (15,21,8,24,0,24), (-10,24,-17,19,-18,11)], tone(trim, palette['rust'], .27))
    p.line([moved((-17,-15)), moved((-13,-21)), moved((-5,-23))], palette['paper'], 1.5)


def shell(index, stage, trim, palette, pixels=CHARACTER_TILE, ultimate=False):
    p = Pen(CHARACTER_TILE, palette)
    ink, white, navy, steel = (palette[k] for k in ('ink', 'white', 'navy', 'steel'))
    arch, nose, tilt, family = CHASSIS[index]
    back = [22, 21, 19, 16, 14, 12][stage] + arch
    cap = [107, 108, 110, 111, 113, 114][stage] + nose
    shoulder = [29, 27, 26, 23, 21, 19][stage]
    top = 25 - stage * 1.45
    bottom = 105 + stage * 1.45
    upper, lower = 49 + tilt, 76 + tilt
    frame_light = tone(steel, white, .55)
    frame_dark = tone(steel, navy, .72)
    enamel = tone(trim, navy, .58)
    highlight = tone(trim, white, .58)
    p.shape((cap-10, top), [(cap-1,top+1,cap+1,top+5,cap+2,top+14),
        (cap+4,upper-5,cap,upper,cap-7,upper), (81,upper+3),
        (72,upper+4,69,57+tilt,69,63+tilt), (68,69+tilt,73,lower-2,82,lower),
        (cap-6,lower+1),(cap+5,lower+1,cap+5,lower+12,cap+1,lower+21),
        (cap-1,bottom-2,cap-7,bottom,cap-13,bottom),(60,bottom+1),
        (38,bottom+3,back,97,back,78),(back-4,59,back+1,41,shoulder,32),
        (38,top+3,48,top-4,63,top-3),(cap-10,top)], frame_dark, 5.5)
    # Polished upper light and a dark plane on the bend separate the materials.
    p.shape((back+2,71), [(back-2,55,back+8,39,shoulder+6,32),
        (41,22,61,top,78,top+3),(72,30),(54,33),(29,43),(back+2,71)], frame_light)
    p.shape((back+1,76),[(back+6,90,40,bottom-7,61,bottom-8),(78,bottom-5),
        (76,bottom-1),(52,bottom-1,back+5,99,back+1,76)], tone(trim, navy, .30))
    seat(p, index, stage, trim, palette)
    for is_top, color in ((True, palette['red']), (False, palette['blue'])):
        y = top+2 if is_top else lower+3
        end = upper-1 if is_top else bottom-3
        inner = cap - (14 if stage < 2 else 18)
        p.poly([(61,y+3),(73,y),(inner+5,y+2),(inner+5,end-1),(76,end+1),
                (72,end-5),(64,end-7)], color, 2.8)
        p.poly([(68,(y+end)*.50),(79,(y+end)*.57),(inner+2,(y+end)*.48),
                (inner+2,end-3),(77,end-2),(73,end-8)], tone(color, navy, .58))
        p.poly([(72,y+3),(inner+2,y+4),(inner-3,y+7),(72,y+6)], tone(color, white, .72))
        p.line([(77,y+9),(inner-11,y+9)], tone(color, white, .32), 1.35)
        ym = (y+end)*.5
        chamfer = 4 if family == 'cut' else 2
        p.poly([(inner,y+1),(cap-5,y+2),(cap+1,y+7),(cap+1,end-chamfer),
            (cap-4,end),(inner,end+1),(inner-3,end-5),(inner-3,y+5)], steel, 2.75)
        p.poly([(inner-1,ym),(cap-3,ym+1),(cap,end-5),(cap-5,end-1),(inner-2,end-2)], frame_dark)
        p.poly([(inner+1,y+4),(cap-7,y+4),(cap-4,y+6),(inner+1,y+8)], white)
        if stage >= 2:
            p.line([(inner+4,y+7),(inner+4,end-3)], frame_light, 1.7)
        if stage >= 4:
            p.line([(cap-5,y+8),(cap-6,end-3)], ink, 1.4)
    if stage >= 1:
        p.poly([(back+2,81),(31,85),(36,94),(31,bottom-1),(23,bottom-6),(back,88)], trim, 2.3)
        p.line([(back+4,85),(29,90),(32,94)], highlight, 1.8)
        bolt(p, 66, bottom-6, 3.5, steel, white)
    if stage >= 2:
        p.poly([(back+1,43),(31,29),(46,top-3),(62,top+1),(56,top+8),(41,top+7),(27,41)],
            steel, 2.5)
        p.line([(32,30),(44,top+1),(53,top+1)], white, 2)
    if stage >= 3:
        p.poly([(back+2,42),(25,43),(24,66),(27,81),(24,92),(back+3,86),
                (back-2,68),(back-1,53)], steel, 2.8)
        p.poly([(back+1,54),(20,47),(20,70),(24,83),(21,85),(back+1,72)], frame_dark)
        for y in (52, 69, 82):
            bolt(p, 20 if y != 82 else 25, y, 2.45, highlight, white)
    if stage >= 4:
        p.poly([(42,92),(63,88),(74,95),(89,94),(94,bottom-2),(77,bottom+2),
                (52,bottom+2),(43,bottom-1)], enamel, 2.8)
        p.poly([(49,95),(62,92),(76,101),(87,98),(89,103),(55,106)], trim)
        p.line([(53,97),(61,96),(68,99)], highlight, 1.6)
        bolt(p, 79, bottom-4, 3.3, frame_light, white)
    if stage == 5:
        p.poly([(back,55),(back-1,44),(23,28),(38,19),(56,top-4),(66,top+1),
                (59,top+9),(41,28),(27,39),(20,56)], steel, 3.45)
        p.poly([(14,48),(24,35),(40,23),(53,top),(57,top+3),(41,26),(28,39),(19,50)], white)
        p.poly([(88,bottom-8),(cap-8,bottom-16),(cap+1,bottom-10),(cap-3,bottom+2),
                (94,bottom+4),(82,bottom)], frame_dark, 3.15)
        p.line([(92,bottom-1),(cap-7,bottom-4),(cap-4,bottom-9)], frame_light, 2)
        for x, y in [(36,29),(56,top+2),(cap-11,bottom-4)]:
            bolt(p,x,y,3.2,trim,white)

    bolt(p, 59, 31, 3.15, steel if index else palette['yellow'], white)
    if stage == 0:
        bolt(p, 60, 91, 3.15, steel, white)
    decal(p, PERSONALITIES[index][4], 40, 96, highlight, enamel)
    if family == 'forged':
        p.line([(79,top-1),(84,top+1),(89,top+1)], ink, 1.4)
    elif family == 'cut':
        p.line([(28,83),(31,84),(33,89)], enamel, 1.7)
    else:
        p.line([(31,33),(35,31),(44,28)], white, 1.5)
    if index == 12 or stage >= 3:
        p.line([(34,90),(38,88),(42,89)], enamel, 1.2)
    if ultimate:
        # Inlaid plates follow the existing shoulder, back and cap contours.
        gold = palette['yellow']
        amber = tone(gold, palette['rust'], .50)
        p.poly([(back+1,49),(24,34),(42,23),(58,20),(61,24),(55,31),
                (39,33),(26,43),(22,52),(back+3,60)], amber, 2)
        p.poly([(back+3,47),(25,36),(42,26),(56,23),(54,28),(39,30),(26,39),(22,47)], gold)
        p.line([(25,36),(42,26),(53,24)], palette['pale'], 1.8)
        p.poly([(back,67),(21,64),(22,78),(30,89),(26,97),(20,91),(back+1,81)], gold, 2.15)
        p.line([(back+3,70),(19,78),(25,87)], palette['pale'], 1.65)
        p.poly([(48,bottom-12),(62,bottom-20),(74,bottom-12),(86,bottom-13),(91,bottom-5),
                (77,bottom-3),(52,bottom-4)], amber, 2.2)
        p.poly([(52,bottom-11),(63,bottom-17),(75,bottom-11),(85,bottom-12),(86,bottom-8),
                (75,bottom-7),(61,bottom-11)], gold)
        p.line([(54,bottom-11),(63,bottom-15),(71,bottom-11)], palette['white'], 1.45)
        for y in (top+7, lower+6):
            p.line([(cap-16,y),(cap-8,y+1),(cap-4,y+4)], gold, 2.3)
            p.line([(cap-15,y-1),(cap-9,y)], palette['white'], 1.1)
        bolt(p, 56, bottom-7, 2.5, trim, white)
        bolt(p, 25, 37, 2.6, trim, white)
    return p.finish(pixels)



def pupil(palette):
    p = Pen(96, palette)
    p.ellipse((14,8,82,88), palette['ink'])
    p.ellipse((29,19,46,37), palette['white'])
    return p.finish()


def cloud(p, x, y, color, width=2.2):
    p.shape((x-13,y+2),[(x-17,y-2,x-14,y-8,x-8,y-7),(x-7,y-15,x+4,y-17,x+8,y-9),
        (x+16,y-10,x+19,y,x+17,y+3),(x+14,y+8,x-7,y+8,x-13,y+2)], color, width)


def stripe_plate(p, x, y, width, palette):
    p.poly([(x,y),(x+width,y),(x+width-4,y+9),(x-4,y+9)], palette['yellow'], 2.5)
    for n in range(4, width-3, 9):
        p.poly([(x+n,y+1),(x+n+4,y+1),(x+n,y+8),(x+n-4,y+8)], palette['ink'])


def status_mark(kind, palette):
    p = Pen(96,palette)
    if kind == 'sweat':
        p.shape((44,16),[(46,33,73,54,66,68),(53,91,25,71,28,56),(30,44,39,33,44,16)],palette['cyan'],5)
        p.line([(40,46),(36,56),(37,63)],palette['white'],4)
    elif kind == 'frost':
        p.poly(star(48,48,39,14,6),palette['cyan'],5)
        p.poly(star(48,48,23,7,6),palette['white'])
    elif kind == 'rust':
        p.poly([(20,42),(45,17),(72,24),(83,56),(48,78),(34,68)], palette['rust'],5)
        p.line([(29,43),(46,27),(59,30)],palette['orange'],4)
    else:
        p.poly(star(48,48,40,15,5),palette['yellow'],5)
        p.poly(star(48,48,25,8,5),palette['pale'])
    return p.finish()


def poster(dimensions, figures, palette, mood, plate=None, loose=()):
    w,h = dimensions
    ink = palette['ink']
    middle = (w*.51,h*.56)
    colors = {'hero': ('navy','cyan','yellow'), 'victory': ('navy','orange','yellow'),
              'defeat': ('navy','plum','red'), 'endless': ('navy','cyan','cyan')}
    bg, ray, accent = (palette[key] for key in colors[mood])
    if plate is None:
        image = Image.new('RGBA', dimensions, bg)
    else:
        image = ImageOps.fit(plate, dimensions, Image.Resampling.LANCZOS, centering=(.50,.60)).convert('RGBA')
        image = Image.blend(image, Image.new('RGBA', dimensions, tone(bg, ray, .20)), .12)
    d = ImageDraw.Draw(image)
    for i in range(13):
        angle = i * .46 + .16
        distance = h * (.49 + (i % 3) * .05)
        x = middle[0] + cos(angle)*distance*1.70
        y = middle[1] + sin(angle)*distance*.92
        d.polygon([(x,y),(x+cos(angle)*h*.32,y+sin(angle)*h*.25),(x-9*sin(angle),y+9*cos(angle))],
            fill=tone(bg,ray,.45))
    if mood != 'defeat':
        points = star(*middle, h*.57, h*.41, 13, .08)
        d.polygon(points, fill=tone(bg,ray,.62), outline=ink, width=5)
        d.polygon(star(*middle,h*.48,h*.365,13,.08),fill=tone(ray,accent,.23),outline=ink,width=2)
    else:
        d.ellipse((w*.16,h*.78,w*.81,h*1.10),fill=tone(bg,ray,.61))
        d.line([(w*.21,h*.82),(w*.34,h*.72),(w*.55,h*.82),(w*.83,h*.74)],fill=ink,width=6)
    for figure, x, y, size, angle in [*loose[:5], *figures, *loose[5:]]:
        dimension = round(h*size)
        art = figure.resize((dimension,dimension),Image.Resampling.LANCZOS)
        art = art.rotate(angle, Image.Resampling.BICUBIC, expand=True)
        image.alpha_composite(art,(round(w*x-art.width/2),round(h*y-art.height/2)))
    d = ImageDraw.Draw(image)
    for i,(x,y,scale) in enumerate([(0.13,.23,.036),(.22,.70,.045),(.31,.20,.027),(.70,.17,.044),(.83,.70,.030),(.90,.49,.036)]):
        shape = star(w*x,h*y,h*scale,h*scale*.29,4)
        d.polygon(shape,fill=accent if i%2==0 else palette['pale'],outline=ink,width=2)
    d.rectangle((0,h-7,w,h), fill=ink)
    for x in range(-20,w,26):
        d.polygon([(x,h-1),(x+10,h-1),(x+19,h-7),(x+9,h-7)],fill=accent)
    return image.convert('RGB')
