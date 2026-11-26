"""Original cel artwork for the playable MAGNET characters and scrapyard."""
from math import cos, pi, sin
from PIL import Image, ImageColor, ImageDraw

CHARACTER_TILE = 128
FACE_BOX = (14, 20, 86, 92)
MOODS = ('idle', 'move', 'collect', 'ready', 'attack', 'hit', 'hurt', 'hot', 'cold', 'rust')

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


def shell(index, stage, trim, palette, pixels=CHARACTER_TILE):
    p = Pen(CHARACTER_TILE, palette)
    black, white = palette['ink'], palette['white']
    navy, grey = palette['navy'], palette['steel']
    shadow, shine = tone(trim, navy, .53), tone(trim, white, .52)
    shoulder = [30, 28, 25, 22, 19, 17][stage]
    back = [21, 19, 17, 16, 15, 14][stage]
    # The open jaw and the external plates stay inside the model's nominal diameter.
    p.shape((104,23),[(114,24,117,32,117,43),(116,50,109,51,100,51),(80,52),
        (73,52,70,56,70,63),(70,69,76,75,83,75),(106,75),
        (114,76,117,82,117,89),(117,100,111,106,103,107),(59,109),
        (37,112,back,98,back,76),(back-2,57,back,44,shoulder,29),
        (44,13,48,15,65,17),(94,19),(104,23)], trim, 5.3)
    p.shape((back+2,66),[(back+6,83,40,100,63,99),(104,98),(113,90),(114,97),
        (111,103,105,104,98,105),(56,106),(30,109,back+1,92,back+2,66)], shadow)
    p.shape((shoulder,35),[(32,21,49,18,66,20),(83,23),(60,24),(39,24,33,31,shoulder,35)], shine)
    # Two hard cel planes on each magnetic pole and cold steel end caps.
    for y, color in ((25,palette['red']), (78,palette['blue'])):
        lower = y + 22
        p.shape((57,y+2),[(77,y),(99,y),(105,y+3,105,y+16,102,lower),(58,lower),
            (49,lower-2,49,y+5,57,y+2)], color, 3)
        p.poly([(54,y+12),(69,y+15),(101,y+14),(101,lower-2),(58,lower-2)], tone(color, black, .33))
        p.poly([(63,y+4),(83,y+3),(91,y+3),(86,y+6),(64,y+7)], tone(color, white, .72))
        p.shape((99,y+1),[(106,y-1,112,y+1,113,y+5),(114,y+11,115,y+16,111,y+21),
            (99,y+23),(94,y+16,94,y+5,99,y+1)], grey, 2.8)
        p.poly([(99,y+12),(108,y+12),(112,y+9),(111,y+19),(99,y+21)], tone(grey, navy, .50))
        p.poly([(99,y+4),(108,y+3),(110,y+6),(99,y+7)], white)
    # One strong plain face plate keeps eyes and mouth legible on a small sprite.
    p.shape((35,34),[(43,30,58,30,64,37),(68,45,70,58,68,71),(68,82,58,92,45,91),
        (32,90,25,82,24,70),(21,56,24,42,35,34)], tone(trim, palette['paper'], .70), 2.4)
    p.shape((26,68),[(30,81,47,90,59,84),(55,90,45,90,38,88),(29,85,26,77,26,68)], tone(trim, navy, .23))
    p.line([(31,40),(38,35),(43,34)], palette['pale'], 2.2)
    detail = PERSONALITIES[index][3]
    decal(p, detail, 55, 94, palette['pale'], shadow)
    bolt(p, shoulder+6, 28, 3.6, grey, white)
    if stage >= 1:
        p.poly([(28,86),(38,90),(36,102),(27,100),(22,93)], palette['orange'] if index == 0 else shine, 2.4)
        p.line([(25,92),(29,97),(34,99)], white, 1.6)
        bolt(p, 80, 98, 3.1, grey, white)
    if stage >= 2:
        p.poly([(24,35),(35,30),(32,22),(48,17),(58,19),(58,26),(43,31),(31,43)], shadow, 2.7)
        p.line([(36,24),(45,21),(54,21)], shine, 1.7)
        bolt(p, 65, 22, 3.7, grey, white)
    if stage >= 3:
        p.poly([(17,54),(28,55),(30,78),(39,88),(32,102),(20,90),(14,74)], grey, 3.1)
        p.poly([(17,72),(27,74),(36,88),(32,97),(22,87)], tone(grey, navy, .46))
        p.poly([(18,60),(23,58),(25,74),(21,75)], white)
        for y in (67,77):
            bolt(p, 22, y, 3.3, shine, white)
        bolt(p, 87, 103, 3.7, grey, white)
    if stage >= 4:
        p.poly([(16,57),(18,42),(25,29),(39,23),(39,34),(31,44),(29,60)], trim, 3.5)
        p.poly([(19,53),(25,42),(31,37),(29,43),(24,55)], shine)
        p.poly([(43,96),(61,88),(75,91),(88,100),(83,108),(50,109)], shadow, 3)
        p.line([(53,99),(63,95),(71,97)], shine, 1.8)
        bolt(p, 61, 102, 3.4, grey, white)
    if stage == 5:
        p.poly([(13,62),(10,58),(13,45),(22,40),(26,46),(23,59),(18,65)], grey, 2.9)
        p.poly([(27,29),(29,22),(42,17),(43,12),(60,12),(64,19),(75,21),(67,30),
                (50,27),(35,33)], grey, 3.5)
        p.poly([(34,24),(46,19),(57,17),(64,20),(59,22),(47,21),(36,27)], white)
        p.poly([(85,24),(84,17),(89,13),(104,16),(112,24),(107,29),(95,24)], trim, 3.3)
        p.poly([(85,104),(95,105),(106,99),(112,105),(103,114),(86,114),(79,110)], grey, 3)
        p.line([(88,110),(99,110),(104,106)], white, 1.6)
        p.line([(19,82),(28,86),(24,89),(31,94)], navy, 2)
        bolt(p, 54, 21, 3.2, trim, white)
        bolt(p, 93, 19, 3.1, shine, white)
    return p.finish(pixels)


EYE_POSES = {
    'idle': (1, 1, 0), 'move': (.73, .86, 2), 'collect': (1.20, 1.22, -1),
    'ready': (1.35, 1.2, -3), 'attack': (.62, .67, 3), 'hit': (1.47, 1.38, -4),
    'hurt': (.7, .86, 1), 'hot': (.74, 1.13, -1), 'cold': (.88, .67, 1), 'rust': (.86, .72, -1),
}


def expression(index, mood, palette, pixels=CHARACTER_TILE):
    p = Pen(CHARACTER_TILE, palette)
    white, black = palette['white'], palette['ink']
    l, r, tilt, resting, _ = PERSONALITIES[index]
    left, right, emotion = EYE_POSES[mood]
    eyes = []
    for side, x, ratio, pose in ((-1,36,l,left),(1,55,r,right)):
        y = 52 + (.9 if side == -1 else -1.9) + (index % 3 - 1) * side * .6
        wide = 8.1 if side == -1 else 7.7
        tall = min(13.5, 9.2*ratio*pose)
        if mood == 'hit':
            y -= 2
            wide += 1.2
        p.ellipse((x-wide,y-tall,x+wide,y+tall), white, 2.2)
        p.shape((x-wide+2,y+1),[(x-wide+4,y+tall-1,x+wide-4,y+tall-1,x+wide-1,y+2),
            (x+wide-2,y+tall,x-wide+3,y+tall+2,x-wide+2,y+1)], tone(palette['steel'], white, .55))
        if mood in ('move','attack'):
            p.poly([(x-wide,y-tall+2),(x+wide+1,y-tall+side*4),
                   (x+wide,y-tall-2),(x-wide-1,y-tall-3)], black)
        brow = y - tall - 4
        slope = (tilt + emotion) * side * .68
        p.shape((x-wide-1,brow+slope),[(x-2,brow-3,x+3,brow-4,x+wide,brow-slope),
            (x+wide-1,brow-slope+3),(x+4,brow-1,x-4,brow+.3,x-wide-2,brow+slope+2)],
            palette['cyan'] if mood == 'cold' else black, 1 if mood == 'cold' else 0)
        eyes.append([round(x-64,2), round(y-64,2), round(wide-3.6,2), round(max(.8,tall-4.4),2)])
    mouth = {
        'idle': resting, 'move':'smirk', 'collect':'grin', 'ready':'grin', 'attack':'teeth',
        'hit':'gasp', 'hurt':'tooth', 'hot':'gasp', 'cold':'teeth', 'rust':'tooth',
    }[mood]
    if mouth in ('grin','teeth'):
        top = 67 if mood != 'ready' else 65
        p.shape((29,top+2),[(38,top+3,55,top+2,65,top-1),(66,76,59,82,49,83),
            (38,83,30,78,29,top+2)], black, 1.8)
        p.shape((32,top+3),[(41,top+4,54,top+1,62,top+1),(61,top+8),
            (53,top+10,42,top+10,33,top+8),(32,top+3)], white)
        for x in (40,48,56):
            p.line([(x,top+4),(x+1,top+9)], width=1.1)
        if mouth == 'grin':
            p.ellipse((43,77,57,81), palette['red'])
        else:
            p.line([(35,79),(46,80),(58,78)], white, 2)
    elif mouth == 'gasp':
        p.ellipse((39,65,57 if mood=='hit' else 55,83 if mood=='hit' else 79), black, 1.5)
        p.ellipse((44,74,53,81), palette['red'])
        p.poly([(42,68),(52,67),(53,70),(43,71)], white)
    else:
        lift = -4 if mouth == 'smirk' else 2 if mouth == 'tooth' else 0
        p.shape((34,72),[(43,73,54,71,61,69+lift),(63,71+lift),
            (55,77+lift,45,77,34,75),(34,72)], black)
        if mouth in ('smirk', 'tooth'):
            p.poly([(53,73),(59,71+lift),(59,75+lift),(54,76)], white)
    if mood in ('hurt','hit'):
        p.line([(28,63),(24,67),(27,70),(21,76)], width=2)
        p.ellipse((55,57,66,63), tone(palette['purple'], palette['rust'], .35))
        if mood == 'hurt':
            p.poly([(21,64),(24,60),(36,68),(33,73)], palette['bandage'], 1.5)
            p.poly([(25,64),(27,62),(32,67),(30,69)], palette['paper'])
    if mood == 'hot':
        p.shape((63,54),[(66,58,71,62,68,67),(65,71,61,66,61,63),(63,54)], palette['cyan'], 1.7)
        p.line([(65,61),(65,64)], white, 1.2)
        p.ellipse((25,61,32,65), palette['red'])
        p.ellipse((54,61,60,65), palette['orange'])
    if mood == 'cold':
        for x,y in [(25,57),(63,67),(65,47)]:
            p.poly(star(x,y,4.5,1.8,4,0), palette['cyan'], 1.2)
    if mood == 'rust':
        for x,y in [(24,58),(29,64),(64,62),(63,53)]:
            p.poly([(x-2,y-1),(x+1,y-2),(x+3,y),(x,y+2)], palette['rust'], 1)
    face_box = tuple(round(n * pixels / CHARACTER_TILE) for n in FACE_BOX)
    return p.finish(pixels).crop(face_box), eyes


def composed(shell_art, face_art, anchors, palette, gaze=(.7,-.18)):
    image = shell_art.copy()
    image.alpha_composite(face_art, tuple(round(n * image.width / CHARACTER_TILE) for n in FACE_BOX[:2]))
    p = Pen(CHARACTER_TILE, palette)
    for x,y,room_x,room_y in anchors:
        x, y = x + 64 + room_x*gaze[0], y + 64 + room_y*gaze[1]
        p.ellipse((x-3.7,y-4.4,x+3.7,y+4.4), palette['ink'])
        p.ellipse((x-1.5,y-2.8,x+.1,y-1.15), palette['white'])
    image.alpha_composite(p.finish(image.width))
    return image


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


def machinery(kind, palette):
    p = Pen(96,palette)
    black, white, steel, navy = (palette[k] for k in ('ink','white','steel','navy'))
    gray = tone(steel, navy, .56)
    if kind == 'heat':
        cloud(p, 67, 15, tone(steel,white,.48))
        p.poly([(57,23),(58,11),(67,10),(70,24)], gray, 3)
        p.poly([(10,36),(17,29),(73,28),(86,35),(88,77),(78,84),(18,84),(9,75)], palette['orange'], 4.2)
        p.poly([(12,72),(25,68),(79,70),(84,63),(85,77),(76,81),(19,81)], palette['rust'])
        p.rounded((18,36,73,68),5,navy,3)
        p.shape((28,64),[(24,53,34,52,36,42),(41,47,43,51,43,55),(54,49,54,40,54,37),
            (66,45,71,60,64,65),(28,64)],palette['red'],2.1)
        p.poly([(37,64),(43,53),(49,59),(58,49),(61,56),(56,64)],palette['yellow'])
        for y in (45,55,65):
            p.line([(19,y),(70,y)],black,3)
            p.line([(22,y+2),(68,y+2)],palette['pale'],1.1)
        bolt(p, 79, 42, 3.2, steel, white)
        stripe_plate(p, 20, 71, 46, palette)
    elif kind == 'cold':
        cloud(p, 60, 21, palette['white'])
        p.poly([(16,30),(30,21),(65,24),(77,33),(77,72),(63,82),(25,80),(15,72)], palette['cyan'],4.2)
        p.poly([(16,61),(42,66),(74,58),(73,72),(61,78),(26,77),(18,70)],palette['blue'])
        p.rounded((28,33,64,64),7,navy,3)
        p.poly(star(46,48,14,5,6),palette['cyan'],1.6)
        p.ellipse((42,44,49,51),white)
        for x,y,size in [(17,66,19),(74,68,18),(61,77,13),(82,51,13)]:
            p.poly([(x-8,y+8),(x-4,y-4),(x+2,y-size),(x+8,y-2),(x+7,y+7)],palette['cyan'],2.4)
            p.poly([(x-2,y-2),(x+2,y-size+3),(x+2,y+5),(x-5,y+6)],white)
        bolt(p, 23, 34, 3, steel, white)
    elif kind == 'flux':
        p.poly(star(48,48,42,20,6),palette['purple'],4.6)
        p.poly(star(48,48,32,16,6),tone(palette['purple'],navy,.50),1.7)
        p.poly([(47,11),(54,33),(49,42),(45,24)],palette['cyan'])
        p.ellipse((25,25,71,71),gray,3.5)
        stripe_plate(p, 29, 50, 39, palette)
        p.poly(star(47,43,19,10,4,0),palette['pale'],2.5)
        p.poly([(45,30),(53,34),(47,43),(54,42),(42,54),(45,44),(39,44)],palette['purple'],1.7)
        for x,y in [(29,42),(65,43),(48,67)]:
            bolt(p, x, y, 2.8, steel, white)
    elif kind in ('water','acid'):
        acid = kind == 'acid'
        liquid = palette['green'] if acid else palette['cyan']
        deep = tone(liquid,navy,.47)
        path = [(32,23),(41,32),(58,19),(68,31),(84,31),(89,47),(82,62),(70,69),
                (58,66),(43,79),(27,71),(12,70),(5,54),(15,36)] if acid else None
        if path:
            p.poly(path,liquid,4)
        else:
            p.shape((11,45),[(7,38,16,30,30,31),(41,33,51,22,65,29),(74,36,87,31,89,47),
                (94,57,80,67,70,66),(54,64,53,76,33,72),(16,73,2,65,11,45)],liquid,4)
        p.shape((12,57),[(29,59,41,66,57,60),(69,57,80,56,86,49),(89,56,80,65,72,65),
            (59,64,56,73,43,74),(28,70,15,73,12,57)],deep)
        for x,y,r in [(24,45,5),(66,48,8),(78,40,4),(29,61,3)]:
            p.ellipse((x-r,y-r,x+r,y+r),tone(liquid,white,.34),1.6)
            p.line([(x-r*.48,y-r*.14),(x-r*.16,y-r*.57)],white,1.8)
        p.line([(32,36),(40,35),(47,32),(56,34)],white,2.8)
        if acid:
            p.poly([(39,53),(47,40),(55,53)],palette['yellow'],2)
            p.line([(47,44),(47,48)],black,1.8)
            p.ellipse((46,50,48,52),black)
        else:
            p.line([(37,49),(43,46),(48,49),(54,44)],white,2.3)
    else:
        if kind == 'prop-pipe':
            p.line([(18,76),(18,41),(32,26),(65,26),(78,39),(78,55)], black,19)
            p.line([(18,76),(18,41),(32,26),(65,26),(78,39),(78,55)], gray,14)
            p.line([(15,66),(15,40),(32,22),(63,22),(76,34)],steel,3)
            p.rounded((7,67,29,84),3, palette['orange'],2.7)
            p.rounded((67,49,89,65),3, steel,2.7)
            bolt(p, 50, 26, 5, palette['yellow'], white)
        elif kind in ('prop-drain','prop-grate','prop-vent'):
            p.poly([(15,30),(73,24),(86,37),(80,67),(22,72),(10,56)], gray,3.4)
            p.poly([(22,37),(75,32),(78,46),(73,58),(23,64),(17,52)],navy,2.2)
            for x in range(24,74,10):
                p.line([(x,57),(x+7,39)],steel,3)
            for x,y in [(17,41),(77,60),(70,30),(26,66)]:
                bolt(p,x,y,2.8,palette['paper'],white)
            if kind == 'prop-drain':
                p.ellipse((34,35,62,61),tone(steel,white,.2),2.7)
                p.line([(35,53),(58,43)],white,1.6)
            elif kind == 'prop-vent':
                cloud(p,60,21,steel)
        elif kind in ('prop-sign','prop-stacks'):
            p.line([(34,74),(33,44),(62,44),(65,76)],black,9)
            p.line([(34,74),(33,44),(62,44),(65,76)],steel,4)
            p.poly([(14,28),(73,25),(82,40),(72,55),(17,56),(9,41)],palette['yellow'],3.9)
            if kind == 'prop-sign':
                p.poly([(24,36),(50,36),(50,29),(67,40),(50,52),(50,44),(24,44)],black)
            else:
                stripe_plate(p,20,36,52,palette)
        else:
            accent = palette['purple'] if kind == 'prop-press' else palette['orange']
            p.poly([(9,40),(22,25),(72,25),(87,42),(84,74),(20,76),(8,63)],accent,4.2)
            p.poly([(19,63),(80,59),(81,72),(23,73)],tone(accent,navy,.51))
            p.rounded((24,37,70,61),4,navy,2.9)
            p.poly([(29,42),(64,41),(65,49),(30,52)],steel)
            if kind == 'prop-press':
                p.poly([(39,30),(57,30),(56,53),(53,57),(42,55)],palette['cyan'],2.5)
            else:
                stripe_plate(p,25,43,46,palette)
            bolt(p,15,55,3,steel,white)
            bolt(p,77,53,3,steel,white)
    return p.finish(192)


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


def poster(dimensions, figures, palette, mood):
    w,h = dimensions
    ink = palette['ink']
    middle = (w*.52,h*.57)
    colors = {'hero': ('navy','purple','cyan'), 'victory': ('navy','orange','yellow'),
              'defeat': ('navy','plum','red')}
    bg, ray, accent = (palette[key] for key in colors[mood])
    image = Image.new('RGBA', dimensions, bg)
    d = ImageDraw.Draw(image)
    for i, angle in enumerate(-pi + step*pi/17 for step in range(34)):
        if i%2:
            continue
        span = .044 + (i%5)*.01
        d.polygon([middle,(middle[0]+w*2*cos(angle),middle[1]+w*2*sin(angle)),
            (middle[0]+w*2*cos(angle+span),middle[1]+w*2*sin(angle+span))],fill=tone(bg,ray,.44))
    for y in range(10,h,18):
        for x in range(17+(y//18)%2*8,w,18):
            if (x-middle[0])**2 + (y-middle[1])**2 > (h*.37)**2:
                d.ellipse((x,y,x+2,y+2),fill=tone(bg,accent,.28))
    points = star(*middle, h*.49, h*.37, 16)
    d.polygon(points, fill=tone(ray,accent,.40), outline=ink, width=5)
    for figure, x, y, size, angle in figures:
        art = figure.resize((round(h*size),round(h*size)),Image.Resampling.LANCZOS)
        art = art.rotate(angle, Image.Resampling.BICUBIC, expand=True)
        image.alpha_composite(art,(round(w*x-art.width/2),round(h*y-art.height/2)))
    d = ImageDraw.Draw(image)
    for i,(x,y,scale) in enumerate([(0.14,.27,.07),(.22,.71,.09),(.33,.25,.06),(.70,.22,.082),(.78,.70,.055),(.88,.42,.095)]):
        shape = star(w*x,h*y,h*scale,h*scale*.39,4 if i%2==0 else 5)
        d.polygon(shape,fill=accent if i%2==0 else palette['pale'],outline=ink,width=4)
    d.rectangle((0,h-12,w,h), fill=ink)
    for x in range(-20,w,31):
        d.polygon([(x,h-1),(x+13,h-1),(x+26,h-12),(x+13,h-12)],fill=palette['yellow'])
    return image.convert('RGB')
