"""Generate MAGNET's original 16-bar soundtrack from synthesized instruments."""
import math
import struct
import wave
from pathlib import Path

rate = 22050
beat = 60 / 105
samples = [0.0] * round(rate * beat * 64)
progression = [(45, 52, 55, 60), (41, 48, 52, 55), (48, 55, 59, 62), (43, 50, 53, 57)]


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


for bar in range(16):
    chord = progression[(bar // 2) % 4]
    for index in range(4):
        at = (4 * bar + index) * beat
        if index in (0, 2):
            layer(at, 0.22, lambda t: math.sin(2 * math.pi * (53 * t + 4 * (1 - math.exp(-24 * t)))) * math.exp(-21 * t), 0.15)
        if index in (1, 3):
            layer(at, 0.105, lambda t: math.sin(18935 * t + 8 * math.sin(13065 * t)) * math.exp(-42 * t), 0.055)
        layer(at + beat / 2, 0.06, lambda t: math.sin(28080 * t + 12 * math.cos(11253 * t)) * math.exp(-70 * t), 0.028)
        layer(at, beat * 0.9, note(chord[0] - (12 if index != 3 else 0), beat * 0.9), 0.105)
        upper = chord[1 + (index + bar // 4) % 3] + 12
        if index != 2 or bar % 2:
            layer(at + beat / 2, beat * 1.15, note(upper, beat * 1.15, 0.22), 0.037)
    for upper in chord[1:]:
        layer(bar * 4 * beat, beat * 3.9, note(upper, beat * 3.9), 0.021)

out = Path('/tmp/magnet-soundtrack.wav')
with wave.open(str(out), 'wb') as track:
    track.setparams((1, 2, rate, len(samples), 'NONE', ''))
    track.writeframes(b''.join(struct.pack('<h', round(max(-1, min(1, s)) * 32767)) for s in samples))
print(out)
