# MAGNET RC2 verification

## Phase 0 · Audit

Base `318656d` from GitHub main. RC1 shipped playable competition and original art and audio. Gaps confirmed in the implementation:

- A–C. Four shell stages, runtime-drawn world objects, and no standalone logo exports. The prior title illustration looks like a separate 3D scene from the actual game.
- D–F. Six effects with separate music/effects settings, working selective vibration, and a tutorial that explains hazards in text. The music has usable rhythm but no shared sonic-logo definition.
- G–H. No committed browser suite, 30-minute soak or restart test. Existing balance evidence covers 36 runs.
- I–J. Vite places Phaser in the main chunk. Chromium has evidence. Firefox and WebKit remain unverified.

The old environment is legible but uses different materials and contrast from the title, and stage art lacks bilateral details. Preserve the model, pool and input rules while bringing the presentation under one palette.
