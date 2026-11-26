"""Arcade machinery, compartment markings and motion cels for MAGNET."""
from math import cos, pi, sin
from PIL import Image, ImageDraw, ImageFilter
from arcade_art import Pen, bolt, cloud, star, stripe_plate, tone

HAZARDS = ('flux', 'cold', 'heat', 'water', 'acid')
PROPS = ('prop-grate', 'prop-drain', 'prop-vent', 'prop-pipe',
         'prop-sign', 'prop-stacks', 'prop-press', 'prop-crate')
DISTRICTS = ('assembly', 'foundry', 'recycling', 'cooling', 'chemical', 'salvage')
HAZARD_CELS = 4


def basin_shape(p, fill, width=0):
    p.shape((12,34),[(21,26,31,32,43,28),(59,18,69,27,74,29),
        (91,28,93,44,89,56),(91,66,77,73,63,69),
        (48,65,44,79,30,74),(18,73,10,65,8,53),(5,46,8,40,12,34)],fill,width)


def device(kind, palette):
    p = Pen(96, palette)
    black, white, steel, navy = (palette[k] for k in ('ink','white','steel','navy'))
    dark = tone(steel,navy,.67)
    pale = tone(steel,white,.57)
    if kind == 'heat':
        # The hottest part sits between slotted grills on a heavy bolted housing.
        p.ellipse((9,68,90,87),(*tone(black, navy, .3),135))
        p.poly([(15,35),(19,25),(29,21),(76,21),(85,31),(86,72),(76,81),(21,79),(12,68)], dark,4.5)
        p.poly([(27,22),(64,22),(75,28),(75,35),(22,35)], steel,2.2)
        p.poly([(27,23),(62,23),(68,26),(24,29)], pale)
        p.rounded((22,37,76,69),5,black,2.1)
        p.shape((25,61),[(29,50,34,55,39,43),(43,45,47,51,48,55),
            (53,49,57,49,58,45),(67,49,70,60,70,64),(25,65)],
            palette['orange'])
        p.poly([(36,64),(40,55),(47,62),(56,53),(61,61),(68,65)],palette['yellow'])
        for x in (29,41,53,65):
            p.line([(x,37),(x+1,66)],black,3.1)
            p.line([(x+2,40),(x+3,64)], tone(steel,palette['orange'],.31),.9)
        stripe_plate(p,21,70,53,palette)
        p.poly([(65,26),(65,18),(70,13),(79,15),(80,27),(75,30)],steel,2.8)
        bolt(p,19,44,2.8,steel,white)
        bolt(p,79,52,2.8,steel,white)
    elif kind in ('water','acid'):
        acid = kind == 'acid'
        hue = palette['green'] if acid else palette['blue']
        basin_shape(p,tone(steel,navy,.57),4.1)
        p.shape((14,41),[(21,32,29,36,43,33),(53,26,69,26,75,34),
            (84,34,89,45,83,54),(86,65,73,68,60,65),(45,62,43,74,29,70),
            (18,67,9,58,14,41)],hue,1.9)
        p.shape((14,51),[(26,61,41,60,56,53),(70,48,74,53,83,49),
            (83,60,75,64,62,63),(47,62,42,70,32,69),(20,67,16,60,14,51)],
            tone(hue,navy,.47))
        p.line([(22,44),(30,40),(39,41),(51,37),(64,36)], tone(hue,white,.72),2.3)
        if acid:
            for cx, cy, radius in [(29,50,5),(67,45,7),(60,59,3)]:
                p.ellipse((cx-radius,cy-radius,cx+radius,cy+radius),tone(hue,white,.41),1.3)
                p.line([(cx-radius*.6,cy-1),(cx-1,cy-radius*.6)],white,1.3)
            p.poly([(43,46),(53,61),(34,61)],palette['yellow'],1.9)
            p.line([(43,50),(43,56)],black,1.5)
        else:
            for cx,cy in [(31,55),(55,45),(71,57)]:
                p.shape((cx-7,cy),[(cx-1,cy-3,cx+3,cy-3,cx+8,cy),
                    (cx+4,cy-1,cx-3,cy+2,cx-7,cy)],tone(hue,white,.57))
        for x,y in [(12,53),(78,66)]:
            bolt(p,x,y,2.7,pale,white)
    elif kind == 'cold':
        p.ellipse((10,66,86,88),(*tone(black,navy,.4),120))
        p.line([(13,65),(14,40),(28,28),(67,28),(81,40),(81,64)],black,12)
        p.line([(13,65),(14,40),(28,28),(67,28),(81,40),(81,64)],steel,8.7)
        p.line([(16,43),(28,31),(66,31),(80,43)],pale,1.7)
        p.poly([(24,34),(62,30),(74,37),(77,67),(68,78),(26,77),(19,64)],
            tone(palette['blue'], navy, .48), 3.6)
        p.rounded((30,38,66,64),4,dark,2.4)
        for x in (34,41,48,55,62):
            p.line([(x,43),(x+1,58)],palette['cyan'],2)
        p.line([(29,67),(49,69),(68,66)],palette['white'],1.6)
        for x,y,h in [(16,64,22),(62,68,15),(76,62,21),(32,72,14)]:
            p.poly([(x-7,y+8),(x-6,y-4),(x+1,y-h),(x+7,y-4),(x+6,y+6)],
                palette['cyan'],2)
            p.poly([(x-3,y-2),(x+1,y-h+5),(x+3,y+4),(x-2,y+5)],pale)
        bolt(p,25,38,2.7,pale,white)
    elif kind in ('flux','flux-drained'):
        empty = kind.endswith('drained')
        purple = tone(palette['purple'],navy,.67) if empty else palette['purple']
        for i in range(6):
            a = i*pi/3
            point = lambda distance, spread: (48+cos(a)*distance-sin(a)*spread,48+sin(a)*distance+cos(a)*spread)
            p.poly([point(16,-15),point(36,-7),point(45,0),point(31,12),point(15,14)],steel,3.7)
            p.poly([point(20,6),point(38,0),point(32,7),point(20,12)],dark)
            p.line([point(20,-10),point(37,-5)], pale,1.8)
        p.poly(star(48,48,30,26,8,pi/8),dark,3.8)
        p.ellipse((31,31,65,65),purple,3)
        p.poly([(48,34),(39,49),(47,48),(44,62),(57,47),(51,47),(55,35)],pale,1.6)
        if empty:
            p.line([(39,38),(57,58)],dark,4.6)
        for x,y in [(48,25),(69,48),(48,71),(25,48)]:
            bolt(p,x,y,3.3,steel,white)
    else:
        draw_prop(p, kind, palette)
    return p.finish(192)


def draw_prop(p, kind, palette):
    ink, steel, navy, white = (palette[k] for k in ('ink','steel','navy','white'))
    dark = tone(steel,navy,.58)
    if kind == 'prop-pipe':
        route = [(17,77),(22,50),(37,40),(67,39),(77,23)]
        p.line(route,ink,21)
        p.line(route,dark,16)
        p.line([(16,69),(20,50),(35,37),(64,36),(72,23)],steel,3.2)
        p.poly([(11,65),(28,68),(25,81),(8,78)],steel,2.6)
        p.poly([(69,18),(86,23),(82,33),(67,30)],steel,2.6)
        p.ellipse((38,27,65,54),palette['rust'],3)
        p.ellipse((44,33,58,47),dark,1.7)
        p.line([(43,45),(60,34)],palette['orange'],2.7)
        bolt(p,52,40,3,steel,white)
    elif kind in ('prop-drain','prop-grate','prop-vent'):
        p.poly([(17,30),(66,21),(87,39),(79,68),(34,78),(12,64)],steel,3.2)
        p.poly([(22,35),(64,27),(78,41),(72,62),(35,68),(21,59)],navy,2.2)
        if kind == 'prop-drain':
            p.ellipse((32,33,66,64),dark,2.3)
            for i in range(3):
                p.line([(36+4*i,52+4*i),(53+4*i,37+4*i)],steel,2.4)
        else:
            for i in range(5):
                x,y=24+i*9,60-i*1.9
                p.line([(x,y),(x+5,y-17)],steel,2.4)
                if kind == 'prop-vent':
                    p.line([(x+1,y+2),(x+6,y-15)],dark,1.1)
            if kind == 'prop-vent':
                p.poly([(46,36),(53,30),(66,31),(72,38),(68,45),(48,45)],steel,2.1)
        for x,y in [(19,47),(36,72),(65,25),(80,51)]:
            bolt(p,x,y,2.1,steel,white)
    elif kind == 'prop-sign':
        p.line([(22,75),(27,46),(65,46),(71,72)],ink,7.5)
        p.line([(22,75),(27,46),(65,46),(71,72)],steel,3.1)
        p.poly([(14,28),(70,25),(84,40),(71,56),(18,58),(8,43)],palette['yellow'],3.4)
        p.poly([(23,38),(45,37),(45,30),(69,40),(45,51),(45,45),(23,46)],ink)
        bolt(p,16,41,2.6,steel,white)
    elif kind == 'prop-stacks':
        for x,y,col in [(14,59,dark),(27,46,steel),(18,33,tone(steel,palette['rust'],.45))]:
            p.poly([(x,y),(x+42,y-8),(x+62,y),(x+60,y+9),(x+18,y+18),(x,y+10)],col,2.9)
            p.line([(x+5,y+1),(x+42,y-6),(x+56,y)],steel,1.1)
            p.line([(x+18,y+11),(x+54,y+3)],navy,3.4)
        p.poly([(37,27),(45,24),(57,49),(48,54)],palette['orange'],1.5)
    elif kind == 'prop-press':
        p.poly([(13,31),(69,24),(84,36),(82,70),(70,80),(18,78),(9,66)],dark,3.4)
        p.poly([(25,36),(62,33),(74,42),(72,64),(23,65)],navy,2.1)
        p.poly([(32,34),(59,33),(61,52),(55,55),(32,54)],palette['cyan'],2.3)
        p.poly([(30,61),(61,60),(68,64),(61,71),(29,70)],steel,1.9)
        stripe_plate(p,18,26,41,palette)
        bolt(p,15,58,2.6,steel,white)
    else:
        p.poly([(13,36),(50,23),(82,35),(83,67),(51,81),(15,67)],dark,3.3)
        p.poly([(13,36),(51,49),(82,35),(50,23)],steel,2.8)
        p.poly([(17,46),(49,56),(49,74),(18,64)],palette['rust'],1.8)
        p.poly([(54,54),(77,45),(78,62),(54,73)],tone(palette['orange'],navy,.4),1.8)
        p.line([(25,48),(44,54),(44,69)],steel,3.1)
        p.line([(58,55),(74,49),(74,61)],steel,3.1)


def hazard_cel(kind, frame, palette):
    p = Pen(96, palette)
    time = frame / HAZARD_CELS
    if kind == 'heat':
        for i in range(3):
            x = 32 + i*15
            height = 7 + (i+frame) % 3 * 4
            p.shape((x-5,63),[(x-10,56,x+3,61-height,x+1,56-height),
                (x+7,62-height,x+8,60,x+5,63),(x-5,63)], palette['orange'])
            p.poly([(x-2,63),(x,57),(x+3,62)],palette['pale'])
        p.rounded((26,51,28,65),1,palette['ink'])
        p.rounded((42,49,44,65),1,palette['ink'])
        p.rounded((58,52,60,65),1,palette['ink'])
        for i in range(2):
            shift = (time+.46*i) % 1
            cloud(p, 71 - shift*13, 16 - shift*11,(*tone(palette['steel'],palette['navy'],.4), round(105*(1-shift))),0)
    elif kind == 'cold':
        for i in range(2):
            shift = (time+.5*i) % 1
            cloud(p,25+shift*43,58-12*i-shift*7,(*tone(palette['cyan'],palette['white'],.66),round(110*(1-shift))),0)
        p.poly(star(15+frame*14,70-frame*9,5,1.5,4,0),(*tone(palette['white'],palette['cyan'],.15),195))
    elif kind == 'acid':
        for i in range(4):
            shift=(time+i*.27)%1
            x,y = 22+i*15, 61-shift*(14+i%2*9)
            r = 2+shift*3
            p.ellipse((x-r,y-r,x+r,y+r),(*tone(palette['green'],palette['white'],.64),round(210*(1-shift*.65))),.85)
    elif kind == 'water':
        for i in range(2):
            shift = (time+.5*i)%1
            r = 5+shift*11
            x = 39+i*23
            p.draw.arc(p.box((x-r,49-r*.45,x+r,49+r*.45)),20,318,fill=(*tone(palette['cyan'],palette['white'],.6),round(180*(1-shift))),width=3)
    else:
        r = 17+frame*3
        points = [(48+cos(a*pi/3+time)*r,48+sin(a*pi/3+time)*r) for a in range(6)]
        p.line([points[frame],points[(frame+1)%6],(48,48),points[(frame+3)%6]],palette['cyan'],1.5)
        p.poly(star(48,48,8+frame*2,2.5,4),palette['white'])
    return p.finish(192)


def district_pad(index, palette, accent):
    """Soft floor paint and a few inset fixtures, with a feathered outer footprint."""
    p = Pen(192,palette,2)
    fill = tone(accent, palette['navy'], .58)
    p.poly([(3,123),(13,73),(56,45),(123,42),(178,67),(189,100),
            (164,150),(93,167),(27,156)],(*fill,118))
    p.poly([(6,114),(31,84),(107,77),(159,86),(181,111),(148,146),(62,155),(21,143)],(*fill,130))
    fog = p.finish().filter(ImageFilter.GaussianBlur(10))
    markings = Pen(192,palette,2)
    for i in range(3):
        x,y=28+i*39,110+(i%2)*13
        markings.line([(x,y),(x+10,y-4),(x+47,y-4)],(*tone(accent,palette['white'],.43),62),1.6)
        markings.line([(x+7,y+6),(x+16,y+1),(x+32,y+1)],(*tone(accent,palette['navy'],.15),57),1.2)
    if index in (0,2,5):
        for x in (41,48,55,62):
            markings.poly([(x,79),(x+4,79),(x+12,71),(x+8,71)],(*tone(accent,palette['white'],.33),83))
    elif index in (1,4):
        for x in (83,96,109,122):
            markings.poly([(x,60),(x+5,60),(x+11,56),(x+6,56)],(*tone(accent,palette['white'],.33),88))
    else:
        for x in (47,66,85):
            markings.line([(x,88),(x,66),(x+7,62),(x+12,62)],(*tone(accent,palette['white'],.46),91),2)
    fog.alpha_composite(markings.finish())
    return fog
