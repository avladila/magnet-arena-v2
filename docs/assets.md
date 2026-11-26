# MAGNET assets

| Asset | Source | Runtime |
| --- | --- | --- |
| Pole Pair, favicon, app icon, hero and social graphics | Original procedural artwork in `scripts/generate-brand-art.py` using `brand/tokens.json`. Hero and social art composite the real player atlas sprite. | `public/app-icon.png`, `public/favicon.png`, `public/hero.webp`, `public/social.webp` |
| Twenty magnets and six shells each | Original mirrored plating, fasteners and enamel poles. The roster supplies names and accent colors. Stages start at 20, 50, 100, 400, 1,500 and 4,352 mass. | `public/magnets.webp` and `public/magnets.json` |
| Scrap, gold, energy, hazards, salvage and props | Original vector-to-raster shapes with ten themed, glossy scrap colors, a faceted gold ingot, and a crimson bolt cell with its own orbit. Salvage has four luminous value tiers. | `public/workshop.webp` and `public/workshop.json` |
| Hazard boundaries, floor markings and attack warnings | Presentation geometry aligned to model radii and bearings | Phaser Graphics |
| Soundtrack | Original 16 bars at the token tempo | `public/soundtrack.ogg` |
| Sound effects | Tuned Web Audio oscillator envelopes and the two-note Pole Pair interval | Generated in `src/audio.ts` from the token definitions |
| RC1 source illustration | Original ImageGen illustration retained in `art-source/title.webp` for provenance | Archived |

The runtime has no hotlinked assets. UI bundles Latin Open Sans Regular and ExtraBold (Apache-2.0). The license and source notice are in `public/fonts/`. The atlases and asset manifest are reproducible with Python and Pillow.

```sh
python scripts/generate-brand-art.py
python scripts/generate-soundtrack.py
ffmpeg -y -i /tmp/magnet-soundtrack.wav -c:a libvorbis -q:a 3 public/soundtrack.ogg
```

See the [brand bible](brand.md), [RC4 roster sheet](evidence/rc4/roster.webp), and [RC3 pickup scale sheet](evidence/rc3/scale-contact.webp).
