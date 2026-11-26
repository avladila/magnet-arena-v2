"""Generate MAGNET's original 16-bar soundtrack from synthesized instruments."""
import json
import math
import struct
import wave
from pathlib import Path

rate = 22050
sound = json.loads(Path('brand/tokens.json').read_text())['sound']
beat = 60 / sound['tempo']
samples = [0.0] * round(rate * beat * 64)
progression = [(45, 52, 55, 60), (45, 53, 55, 62), (41, 48, 52, 57), (43, 50, 53, 59)]


def layer(start, duration, voice, gain):
    offset = round(start * rate)
    for sample in range(round(duration * rate)):
        t = sample / rate
        samples[(offset + sample) % len(samples)] += gain * voice(t)


def note(midi, duration, bright=0.12):
    hz = 440 * 2 ** ((midi - 69) / 12)

    def voice(t):
        phase = 2 * math.pi * hz * t
        envelope = min(1, t / 0.018) * max(0, 1 - t / duration) ** 1.6
        return envelope * (math.sin(phase) + bright * math.sin(2 * phase))

    return voice


def kick(t):
    phase = 2 * math.pi * (44*t + 1.9*(1-math.exp(-34*t)))
    return math.sin(phase) * math.exp(-17*t)


def clank(t):
    ring = math.sin(2*math.pi*290*t) + .59*math.sin(2*math.pi*577*t) + .32*math.sin(2*math.pi*1143*t)
    strike = .63*math.sin(37575*t + 8*math.sin(19863*t))*math.exp(-72*t)
    return (ring*math.exp(-30*t) + strike) * min(1,t/.003)


def shuffle(t):
    return math.sin(23450*t + math.sin(9743*t)*4.6) * math.exp(-78*t) * min(1,t/.003)


riff = (0, None, 7, None, 0, 12, None, 7, 0, None, 3, None, 7, None, 5, None)
for bar in range(16):
    chord = progression[(bar // 2) % 4]
    for pulse in range(16):
        at = (4*bar+(pulse + (0.09 if pulse%2 else 0))/4)*beat
        if pulse in (0, 6, 8, 13):
            layer(at, 0.24, kick, .118 if pulse%8==0 else .074)
        if pulse in (4,12) or (bar%4==3 and pulse==15):
            layer(at, .135, clank, .047 if pulse%4==0 else .026)
        if pulse%2:
            layer(at, .051, shuffle, .027 if pulse%4==2 else .016)
        move = riff[(pulse + (bar%2)*4) % 16]
        if move is not None:
            length = beat*.35
            layer(at, length, note(chord[0]-12+move,length,.32),.093)
        if pulse in ((2,7,11) if bar%2==0 else (3,9,14)):
            upper = chord[1+(pulse+bar//4)%3] + (12 if bar % 4 < 2 else 0)
            length = beat*.69
            layer(at, length, note(upper,length,.26), .041)
    for upper in chord[1:]:
        layer(bar*4*beat, beat*3.55, note(upper,beat*3.55,.12), .012)

out = Path('/tmp/magnet-soundtrack.wav')
for bar in (0, 8):
    at = bar * 4 * beat + .25 * beat
    layer(at, beat * .63, note(64, beat * .63, .2), .037)
    layer(at + beat * .75, beat * .83, note(64 + sound['interval'], beat * .83, .2), .035)

with wave.open(str(out), 'wb') as track:
    track.setparams((1, 2, rate, len(samples), 'NONE', ''))
    track.writeframes(b''.join(struct.pack('<h', round(max(-1, min(1, s)) * 32767)) for s in samples))
print(out)
