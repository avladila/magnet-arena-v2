# MAGNET assets

| Asset | Source | Runtime |
| --- | --- | --- |
| App mark, hero, social, victory, and defeat art | Original cel art composited at illustration resolution from the game character designs | `public/app-icon.png`, `public/favicon.png`, `public/hero.webp`, `public/social.webp`, `public/victory.webp`, `public/defeat.webp` |
| Twenty characters, six shells each | Artwork uses the shared color tokens, roster accents, and individual decals | `public/magnets.webp` and `public/magnets.json` |
| Ten expressions per character | Painted eyes, brows and mouths with two authored pupil anchors per face | `public/faces.webp`, `public/faces.json`, and `brand/face-anchors.json` |
| Hazards and scenery | Inked furnaces, coolers, puddles, spikes, signs, drains, pipes, presses, and vents | `public/scenery.webp` and `public/scenery.json` |
| Pickups, salvage, and status marks | Ten luminous scrap colors, gold nuggets, crimson charge cells with an orbit, four salvage tiers, pupils, and reaction effects | `public/workshop.webp` and `public/workshop.json` |
| Field, footprint, and shockwave | Vector commands aligned with model radii and bearings | Phaser Canvas |
| Soundtrack and cues | Original 16-bar loop and Web Audio envelopes with two-note confirmations | `public/soundtrack.ogg`, `src/audio.ts`, `brand/tokens.json` |
| Early title illustration | Original ImageGen source illustration retained for provenance | `art-source/title.webp` |

The current artwork ships with the game. It is generated from `scripts/arcade_art.py`, `scripts/generate-brand-art.py`, `brand/roster.json`, and `brand/tokens.json`. The local Open Sans Regular and ExtraBold faces include their Apache-2.0 license in `public/fonts/`.

```sh
python -B scripts/generate-brand-art.py
python scripts/generate-soundtrack.py
ffmpeg -y -i /tmp/magnet-soundtrack.wav -c:a libvorbis -q:a 3 public/soundtrack.ogg
```

[Asset manifest](../brand/asset-manifest.json) · [Visual identity](brand.md) · [Art sheet](evidence/visual-identity/artwork.webp) · [Roster sheet](evidence/visual-identity/roster.webp)
