# MAGNET assets

| Asset | Source | Runtime |
| --- | --- | --- |
| App mark, title, social, victory, defeat, and Endless art | Original cel art composited at illustration resolution with the game cast. Title art has wide and portrait compositions. | `public/app-icon.png`, `public/favicon.png`, `public/hero.webp`, `public/hero-portrait.webp`, `public/social.webp`, `public/victory.webp`, `public/defeat.webp`, `public/endless.webp` |
| Twenty characters, six shells each | 120 inked steel and enamel shells with roster-specific proportions, colors, decals, and stage-specific mechanical faceplates | `public/magnets.webp` and `public/magnets.json` |
| Twelve expressions and a blink per character | 720 matching eye, brow, and mouth cels plus 20 closed-lid cels. The face anchor data carries 120 shell sockets and 480 pupil apertures. | `public/faces.webp`, `public/faces.json`, and `brand/face-anchors.json` |
| Hazards and scenery | 40 frames for five hazards, a discharged Flux state, four moving overlays per hazard, eight mechanical props, and six district floor stamps | `public/scenery.webp` and `public/scenery.json` |
| Pickups, salvage, and character effects | 56 frames, including ten scrap colors, a faceted gold nugget, animated and static ringed charge cells, four claimable salvage tiers, three cosmetic fracture plates, pupils, and reactions | `public/workshop.webp` and `public/workshop.json` |
| Floor, field, footprints, and shockwaves | World-anchored floor plates and boundaries. Vector effects use the model radii and bearings. | `src/art.ts`, `src/growth-feedback.ts`, `src/competition-view.ts` |
| Soundtrack and cues | Original 114 BPM, 16-bar loop with synthesized instruments and Web Audio cue envelopes | `public/soundtrack.ogg`, `src/audio.ts`, `brand/tokens.json` |
| Illustration sources | Original ImageGen scrapyard backdrop used under the generated foreground characters. The earlier title source is retained for provenance. | `art-source/assembly-bay.webp`, `art-source/title.webp` |

The current artwork ships with the game. `scripts/arcade_art.py` draws shells and mechanical faceplates, `scripts/living_faces.py` draws facial layers, `scripts/scrapyard_art.py` draws machinery and landscape details, and `scripts/generate-brand-art.py` packs the atlases and composes the illustrations. `brand/roster.json` and `brand/tokens.json` supply roster and palette data. The checked-in backdrop makes illustration generation local. Use Python 3 with Pillow and FFmpeg with `libvorbis`. The local Open Sans Regular and ExtraBold faces include their Apache-2.0 license in `public/fonts/`.

```sh
python -B scripts/generate-brand-art.py
python -B scripts/generate-soundtrack.py
ffmpeg -y -i /tmp/magnet-soundtrack.wav -c:a libvorbis -q:a 3 public/soundtrack.ogg
```

[Asset manifest](../brand/asset-manifest.json) · [Visual identity](brand.md) · [120 growth-stage shells](evidence/rc7a/all-growth-stages.webp) · [240 expressions](evidence/rc7a/all-expressions.webp) · [Gaze and mouth previews](evidence/rc7a/gaze-and-mouths.webp) · [RC6 illustrations](evidence/rc6/artwork.webp)
