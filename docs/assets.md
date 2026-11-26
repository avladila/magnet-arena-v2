# MAGNET asset inventory

| Asset | Source | Runtime |
| --- | --- | --- |
| Title illustration | Original ImageGen illustration for this project in `art-source/title.webp`. Prompt specified an industrial salvage arena and a red and cobalt horseshoe electromagnet on a mint ceramic floor. | `src/assets/title.webp`, locally bundled by Vite |
| Wordmark | MAGNET typeset and styled in `index.html` and `src/style.css` | HTML and CSS |
| Player, Copper, Spark, Drift and Orbit | `scripts/generate-magnet-atlas.py`, hand-authored geometry and original palettes | `public/magnets.webp` and `public/magnets.json`, Phaser atlas with 20 frames |
| Natural scrap, gold and energy | `src/particle-view.ts` | Phaser Graphics |
| Salvage, hazard devices, district props and attack overlays | `src/competition-view.ts` and `src/districts.ts` | Phaser Graphics |
| Arena tiles, field and growth rings | `src/art.ts` and `src/growth-feedback.ts` | Phaser Graphics |
| Soundtrack | `scripts/generate-soundtrack.py`, original music and synthesized instruments | `public/soundtrack.ogg`, 16 bars at 105 BPM |
| Effects | `src/audio.ts`, original Web Audio oscillator envelopes | Generated at playback |

The atlas has one row per participant and four shell frames per row, ordered by mass thresholds of 20, 60, 200 and 650. Rendering scales each frame to the existing physical radius. Sprite dimensions, shadows and ease have no authority over interactions.

Ship effects include eased movement heading and physical growth, pickup glints, milestone rings, an armed preview and warning cone, airborne salvage, per-magnet damage numerals, and cold and heat indicators. The runtime has no asset hotlinks. The browser uses system fonts.

To regenerate the atlas, install Pillow for Python 3 and run `python scripts/generate-magnet-atlas.py` from the repository root. To regenerate the music, run the following from the repository root with Python 3 and FFmpeg.

```sh
python scripts/generate-soundtrack.py
ffmpeg -y -i /tmp/magnet-soundtrack.wav -c:a libvorbis -q:a 3 public/soundtrack.ogg
```
