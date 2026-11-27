"""Layered facial cels and eye apertures in each magnet's faceplate coordinates."""
from math import hypot
from PIL import Image
from arcade_art import CHARACTER_TILE, PERSONALITIES, Pen, tone

FACE_TILE = 56
BASE_MOODS = ('relaxed', 'curious', 'excited', 'satisfied', 'worried', 'frightened',
              'aggressive', 'shocked', 'injured', 'overheated', 'frozen', 'corroded')
MOODS = BASE_MOODS + ('manic', 'nervous', 'strained', 'panic')

# Eye opening, brow height, inner brow raise and pupil size. The mouth uses the same mood key.
EYE_ACTING = {
    'relaxed': (.94, 0, .2, 1), 'curious': (1.03, 1.15, -.2, .94),
    'excited': (1.13, 1.30, -.65, .88), 'satisfied': (.78, .50, -.25, 1.02),
    'worried': (1.06, .4, 2.65, .88), 'frightened': (1.28, .90, 2.15, .66),
    'aggressive': (.73, -.35, -2.4, .94), 'shocked': (1.35, 1.0, 1.60, .58),
    'injured': (.69, -.15, 1.2, .96), 'overheated': (.83, .1, 1.1, .83),
    'frozen': (.91, .20, 1.6, .84), 'corroded': (.74, .2, -1.35, .95),
    'manic': (1.06, 1.35, -1.05, .77), 'nervous': (1.18, .85, 1.65, .76),
    'strained': (1.02, .45, 2.7, .70), 'panic': (1.37, 1.08, 2.5, .52),
}


def mouth(p, index, mood, palette):
    middle = FACE_TILE / 2
    shift = (index % 5 - 2) * .43
    width = .95 + (index % 4) * .047
    variant = PERSONALITIES[index][3]

    def moved(coords):
        return tuple((middle + shift + width * n) if i % 2 == 0 else middle + n for i, n in enumerate(coords))

    def lip(start, segments, color=None, ink=0):
        p.shape(moved(start), [moved(segment) for segment in segments], color or palette['ink'], ink)

    def spot(box, color):
        p.ellipse(moved(box), color)

    if mood == 'relaxed':
        corner = -1.4 if variant in ('teeth', 'smirk', 'tooth') else .4
        lip((-10, 9), [(-5,11,4,11,10,7+corner), (11,9+corner),
            (5,14,-4,14,-10,11), (-10,9)])
        if variant in ('tooth', 'teeth', 'grin'):
            lip((4, 10), [(8,8+corner),(8,10+corner),(5,11)], palette['white'])
    elif mood == 'curious':
        spot((-5, 8, 4, 15), palette['ink'])
        spot((-2, 12, 2, 14), palette['rust'])
    elif mood in ('excited', 'satisfied', 'manic'):
        bottom = 16 if mood == 'satisfied' else 20
        lip((-12, 8), [(-6,10,4,9,12,7), (13,14,7,bottom,1,bottom),
            (-6,bottom,-12,15,-12,8)])
        lip((-10, 9), [(-3,10,5,9,10,8), (8,12,1,13,-4,12), (-7,12,-9,11,-10,9)], palette['white'])
        if mood != 'satisfied':
            spot((-3, 15, 7, 18), palette['red'])
        if mood == 'manic':
            p.line([moved((1, 9)), moved((1, 12))], palette['ink'], 1)
    elif mood in ('worried', 'injured', 'corroded'):
        skew = 2.7 if mood == 'corroded' else .0
        low = 17 if mood == 'injured' else 16
        lip((-10, low), [(-8,10,-3,8,1,8), (5,8,9,11+skew,11,14+skew),
            (10,16+skew), (7,14+skew,4,11,0,11), (-4,11,-7,14,-9,low+1), (-10,low)])
        if mood == 'injured':
            lip((-15, 4), [(-8,6),(-9,10),(-16,8),(-15,4)], palette['bandage'], 1.05)
            p.line([moved((-13,6)),moved((-11,7))], palette['paper'], 1.2)
    elif mood in ('aggressive', 'frozen', 'nervous', 'strained'):
        skew = {'aggressive': -2, 'nervous': .5, 'strained': 2}.get(mood, 1)
        lip((-12, 10), [(-5,8,4,8,12,8+skew), (13,14+skew),
            (7,17,0,19,-8,17),(-12,16,-13,12,-12,10)])
        center = tone(palette['cyan'], palette['white'], .76) if mood == 'frozen' else palette['pale']
        lip((-9, 11), [(-2,10,6,10,10,10+skew),(10,13+skew),
            (4,15,-3,17,-8,15),(-9,11)], center)
        for x in (-4, 2, 7):
            p.line([moved((x,10.5)),moved((x+.4,14.6))], width=1.0)
    elif mood in ('shocked', 'panic'):
        spot((-8, 5, 9, 21), palette['ink'])
        spot((-4, 14, 6, 18.5), palette['red'])
        spot((-4, 7.6, 5, 10), palette['white'])
        if mood == 'panic':
            p.line([moved((-12, 12)), moved((-14, 14))], palette['ink'], 1.4)
            p.line([moved((13, 9)), moved((15, 11))], palette['ink'], 1.4)
    else:
        low = 19 if mood == 'frightened' else 17
        lip((-9, 10), [(-7,5,5,5,9,10), (11,14,7,low,1,low),
            (-5,low,-11,15,-9,10)])
        lip((-6, 9), [(0,7,5,8,7,10), (6,12),(0,11,-3,12,-6,11),(-6,9)], palette['white'])
        if mood == 'overheated':
            spot((-3, 13, 4, 16), palette['red'])


def expression(index, mood, palette, pixels=FACE_TILE):
    eyes, brows, lips = [Pen(FACE_TILE, palette) for _ in range(3)]
    left, right, tilt, _, _ = PERSONALITIES[index]
    opening, height, inner, pupil = EYE_ACTING[mood]
    mid = FACE_TILE / 2
    apertures = []
    for side, ratio in ((-1, left), (1, right)):
        # Personality influences proportions without changing the two-eye arrangement.
        x = side * (9.05 + (index % 4 - 1.5) * .27) - .5
        y = -7.25 + side * ((index % 5 - 2) * .31 - .45)
        rx = 7.05 + .32 * (1 - ratio) + (.35 if mood in ('shocked', 'frightened', 'panic') else 0)
        ry = min(11.35, (8.5 + (ratio - 1) * 3.15) * opening + side * (.72 if mood in ('curious', 'overheated') else .27))
        cx, cy = x + mid, y + mid
        white = tone(palette['white'], palette['cyan'], .15) if mood == 'frozen' else palette['white']
        eyes.ellipse((cx-rx, cy-ry, cx+rx, cy+ry), white, 1.9)
        # A reflected line sits within the lower edge of the sclera.
        eyes.line([(cx-rx*.57,cy+ry*.57),(cx,cy+ry*.73),(cx+rx*.53,cy+ry*.59)],
                  tone(palette['steel'], white, .75), .85)
        # Raise the inner ends for concern and lower them for attack. Keep the outer tips clear of the rim.
        row = max(mid - 21, cy-ry-2.2-height)
        slope = inner + tilt * .14
        brow_w = rx * .77
        left_y, right_y = row-side*slope, row+side*slope
        tip = min(left_y, right_y) - (1.05 if mood != 'satisfied' else 1.8)
        brows.shape((cx-brow_w,left_y),[(cx-2,tip,cx+2,tip,cx+brow_w,right_y),
            (cx+brow_w-.2,right_y+2.4),(cx+2,tip+2.1,cx-2,tip+2.1,cx-brow_w,left_y+2.1)], palette['ink'])
        inner_x, inner_y = rx - 2.2, ry - 2.2
        px = inner_x * (.54 if mood != 'aggressive' else .59) * pupil
        py = min(inner_y * .72, px * 1.20)
        apertures.append([round(v, 3) for v in (x, y, inner_x, inner_y, px, py)])
    mouth(lips, index, mood, palette)
    return {'eyes': eyes.finish(pixels), 'brows': brows.finish(pixels), 'mouth': lips.finish(pixels)}, apertures


def blink(index, palette):
    p = Pen(FACE_TILE, palette)
    mid = FACE_TILE / 2
    for side in (-1, 1):
        x = mid + side * (9.05 + (index % 4 - 1.5) * .27) - .5
        y = mid - 7.25 + side * ((index % 5 - 2) * .31 - .45)
        p.shape((x-6,y-2), [(x-2,y+1,x+2,y+2,x+6,y-2), (x+6,y),
            (x+2,y+5,x-3,y+4,x-6,y)], palette['ink'])
    return p.finish()


def composed(shell, layers, apertures, mount, palette, gaze=(.55, -.17)):
    """Compose promotional and review art with the same socket and pupil math as the Canvas rig."""
    x, y, scale = mount
    body_scale = shell.width / CHARACTER_TILE
    size = round(FACE_TILE * scale * body_scale)
    origin = (round(x * body_scale - size / 2), round(y * body_scale - size / 2))
    image = shell.copy()
    image.alpha_composite(layers['eyes'].resize((size, size), Image.Resampling.LANCZOS), origin)
    p = Pen(FACE_TILE, palette)
    for x, y, rx, ry, px, py in apertures:
        limit = max(0, 1 - max((px + .43) / rx, (py + .43) / ry))
        aperture_distance = hypot(gaze[0] / rx, gaze[1] / ry)
        travel = limit * min(1, hypot(*gaze)) / aperture_distance if aperture_distance else 0
        x, y = FACE_TILE / 2 + x + gaze[0] * travel, FACE_TILE / 2 + y + gaze[1] * travel
        p.ellipse((x-px, y-py, x+px, y+py), palette['ink'])
        p.ellipse((x-px*.55, y-py*.63, x-px*.06, y-py*.12), palette['white'])
    image.alpha_composite(p.finish(size), origin)
    for part in ('brows', 'mouth'):
        image.alpha_composite(layers[part].resize((size, size), Image.Resampling.LANCZOS), origin)
    return image
