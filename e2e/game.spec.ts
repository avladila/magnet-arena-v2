import { expect, test, type Page } from '@playwright/test';

async function inspectScene(page: Page): Promise<void> {
  await page.route((url) => url.pathname === '/src/main.ts', async (route) => {
    const response = await route.fetch();
    const original = await response.text();
    const anchor = 'this.floor = new ArenaFloor';
    expect(original).toContain(anchor);
    await route.fulfill({ response, body: original.replace(anchor, 'window.trainingScene = this; ' + anchor) });
  });
}

test('Arena starts, steers and pauses; Endless reaches results and replays', async ({ page }) => {
  const errors: Error[] = [];
  page.on('pageerror', (error) => errors.push(error));
  await page.goto('/');
  await page.getByRole('button', { name: 'Play Arena' }).click();
  await expect(page.locator('#clock')).toHaveText('5:00');
  await expect(page.locator('#countdown')).toBeVisible();
  await expect(page.locator('#clock')).not.toHaveText('5:00', { timeout: 8000 });
  await page.keyboard.down('KeyD');
  await expect.poll(async () => Number(await page.locator('#mass').textContent()), { timeout: 10000 }).toBeGreaterThan(20);
  await page.keyboard.up('KeyD');
  await page.getByRole('button', { name: 'Pause' }).click();
  const paused = await page.locator('#clock').textContent();
  await expect(page.locator('#clock')).toHaveText(paused!);
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('#clock')).not.toHaveText(paused!);
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Main Menu' }).click();
  await page.getByRole('button', { name: 'Leave' }).click();
  await page.getByRole('button', { name: 'Endless', exact: true }).click();
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'End Session' }).click();
  await expect(page.locator('#result-ranking li')).toHaveCount(20);
  await page.getByRole('button', { name: 'Play Again' }).click();
  await expect(page.locator('#mass')).toHaveText('20');
  expect(errors).toEqual([]);
});

test('settings persist and both themes fit the HUD at nine sizes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('#volume').fill('0');
  await page.locator('#music').fill('0');
  await page.locator('#dark').check();
  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('#volume')).toHaveValue('0');
  await expect(page.locator('#music')).toHaveValue('0');
  await expect(page.locator('#dark')).toBeChecked();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Endless', exact: true }).click();
  for (const theme of ['dark', 'light']) {
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    for (const [width, height] of [[320, 568], [375, 667], [390, 844], [430, 932], [844, 390], [932, 430], [768, 1024], [1366, 768], [1920, 1080]]) {
      await page.setViewportSize({ width, height });
      const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth &&
        ['#theme-toggle', '#pause', '#attack', '#map-toggle'].every((selector) => {
          const bounds = document.querySelector(selector)!.getBoundingClientRect();
          return bounds.left >= 0 && bounds.top >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight;
        }));
      expect(fits, theme + ' ' + width + '×' + height).toBe(true);
    }
    if (theme === 'dark') await page.locator('#theme-toggle').click();
  }
});

test('training advances after real steering', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Learn to Play' }).click();
  await expect(page.locator('#tutorial-task')).toContainText('Move your magnet');
  await page.keyboard.down('KeyD');
  await expect.poll(async () => Number(await page.locator('#mass').textContent())).toBeGreaterThan(20);
  await page.keyboard.up('KeyD');
});

test('fifty replays reuse the canvas and continue to handle controls', async ({ page, browserName }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await page.getByRole('button', { name: 'Endless', exact: true }).click();
  const cdp = browserName === 'chromium' ? await page.context().newCDPSession(page) : undefined;
  await cdp?.send('HeapProfiler.collectGarbage');
  const before = await cdp?.send('Runtime.getHeapUsage');
  for (let i = 0; i < 50; i++) {
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.getByRole('button', { name: 'End Session' }).click();
    await page.getByRole('button', { name: 'Play Again' }).click();
  }
  await expect(page.locator('#arena > canvas')).toHaveCount(1);
  await cdp?.send('HeapProfiler.collectGarbage');
  const after = await cdp?.send('Runtime.getHeapUsage');
  if (before && after) {
    const delta = after.usedSize - before.usedSize;
    console.log('Retained JavaScript heap after 50 replays (bytes):', delta);
    expect(delta).toBeLessThan(12 * 1024 * 1024);
  }
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.locator('#menu-title')).toHaveText('Paused');
});

test('two real Chromium touch pointers steer and resolve one overridden attack', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'Requires Chromium CDP touch injection');
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  try {
    const page = await context.newPage();
    await inspectScene(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Endless', exact: true }).tap();
    await page.evaluate(() => {
      const scene = Reflect.get(window, 'trainingScene');
      scene.model.player.combat.energy = 100;
    });
    const cdp = await context.newCDPSession(page);
    const box = (await page.locator('#attack').boundingBox())!;
    const attack = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 2 };
    const steer = { x: 65, y: 620, id: 1 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [steer] });
    steer.x += 48;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [steer] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [steer, attack] });
    await expect(page.locator('#attack')).toHaveText('Release');
    attack.x += 27;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [steer, attack] });
    await expect(page.locator('#joystick')).toBeVisible();
    await expect.poll(() => page.evaluate(() => Reflect.get(window, 'trainingScene').playInput.aim())).toBeCloseTo(0);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => page.evaluate(() => {
      const c = Reflect.get(window, 'trainingScene').model.player.combat;
      return c.hits + c.misses + c.protectedHits + c.guarded;
    })).toBe(1);
  } finally {
    await context.close();
  }
});

test('full Arena simulation reaches results and Play Again through the UI', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: Error[] = [];
  page.on('pageerror', (error) => errors.push(error));
  await inspectScene(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Play Arena' }).click();
  const elapsed = await page.evaluate(() => {
    const scene = Reflect.get(window, 'trainingScene');
    const start = performance.now();
    for (let frame = 0; frame < 2200 && !scene.clock.ended; frame++) {
      scene.update(start + frame * 145, 145);
    }
    return scene.clock.elapsed;
  });
  expect(elapsed).toBeCloseTo(300, 6);
  await expect(page.locator('#result-ranking li')).toHaveCount(20);
  await page.getByRole('button', { name: 'Play Again' }).click();
  await expect(page.locator('#clock')).toHaveText('5:00');
  expect(errors).toEqual([]);
});

test('training teaches each hazard through in-arena encounters without recording a match', async ({ page }) => {
  test.setTimeout(45_000);
  await inspectScene(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Learn to Play' }).click();
  await page.keyboard.down('KeyD');
  await expect(page.locator('#energy-readout')).toHaveText('100%', { timeout: 15000 });
  await page.keyboard.up('KeyD');
  await page.keyboard.down('Space');
  await expect(page.locator('#attack')).toHaveText('Release');
  await page.keyboard.up('Space');
  await expect(page.locator('#tutorial-task')).toContainText('neutral salvage');
  await page.keyboard.down('KeyD');
  const instructions = page.locator('#tutorial-task');
  await expect(instructions).toContainText('Flux device', { timeout: 8000 });
  await expect(instructions).toContainText('heat bay', { timeout: 5000 });
  for (const [station, next] of [['water pool', 'acid pool'], ['acid pool', 'cryo vent'], ['cryo vent', 'Training complete']]) {
    await expect(instructions).toContainText(station, { timeout: 5000 });
    await expect.poll(() => page.evaluate((phrase) => {
      if (!document.querySelector('#tutorial-task')?.textContent?.includes(phrase)) return 0;
      const model = Reflect.get(window, 'trainingScene').model;
      const { x, y } = model.tutorial.station;
      return Math.hypot(model.player.position.x - x, model.player.position.y - y);
    }, station), { intervals: [20], timeout: 4000 }).toBeLessThan(100);
    await page.keyboard.up('KeyD');
    await expect(instructions).toContainText(next);
    if (next !== 'Training complete') await page.keyboard.down('KeyD');
  }
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('magnet.progress.v1')!));
  expect(progress.tutorialDone).toBe(true);
  expect(progress.completed).toBe(0);
  expect(progress.collected).toBe(0);
});

test('presentation pool stays within each quality cap and clears under reduced motion', async ({ page }) => {
  await inspectScene(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Endless', exact: true }).click();
  const measurements = await page.evaluate(() => {
    const scene = Reflect.get(window, 'trainingScene');
    const point = scene.model.player.position;
    const bounds = { left: point.x - 500, right: point.x + 500, top: point.y - 500, bottom: point.y + 500 };
    const run = (quality: string) => {
      scene.effects.reset();
      scene.effects.configure(quality, false);
      for (let i = 0; i < 300; i++) scene.effects.burst(point, 'gold', 6, 270);
      scene.effects.render(bounds, 0.01, point);
      return scene.effects.peakVisible;
    };
    const result = ['high', 'balanced', 'low'].map(run);
    scene.effects.configure('low', true);
    const cleared = scene.effects.pool.every((fleck: { image: { visible: boolean } }) => !fleck.image.visible);
    return { result, cleared };
  });
  expect(measurements).toEqual({ result: [600, 300, 120], cleared: true });
});

test('master mute keeps the live music and effects buses silent after hide and resume', async ({ page }) => {
  await inspectScene(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Endless', exact: true }).click();
  await expect.poll(() => page.evaluate(() => {
    const audio = Reflect.get(window, 'trainingScene').audio;
    return Boolean(audio.bus && audio.track && !audio.track.paused);
  })).toBe(true);
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('#master').fill('0');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Reflect.deleteProperty(document, 'hidden');
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.getByRole('button', { name: 'Resume' }).click();
  const silent = await page.evaluate(() => {
    const audio = Reflect.get(window, 'trainingScene').audio;
    return audio.bus.gain.value === 0 && audio.track.paused;
  });
  expect(silent).toBe(true);
});

test('giant mobile energy stays recognizable in Low and reduced motion, then charges without growth', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await inspectScene(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('#quality').selectOption('low');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Endless', exact: true }).click();
  await page.evaluate(() => {
    const scene = Reflect.get(window, 'trainingScene');
    const { model } = scene;
    const { player } = model;
    player.mass = player.combat.highest = 4352;
    player.physicalScale = scene.magnetScale.scale = 12;
    player.radius = 360;
    player.combat.energy = 96;
    model.hazards.sites.length = 0;
    model.replenish = () => {};
    for (const bot of model.bots) bot.position = { x: 400, y: 400 };
    for (const scrap of model.particles.slots) scrap.state = 'inactive';
    const cell = model.particles.slots[0];
    let identity = 0;
    while (model.particles.kind({ resourceId: identity }) !== 'energy') identity++;
    Object.assign(cell, { x: player.position.x + 540, y: player.position.y + 105, state: 'active', resourceId: identity });
    scene.framing.follow(player.position, 15, player.mass);
  });
  await expect.poll(() => page.evaluate(() => {
    const scene = Reflect.get(window, 'trainingScene');
    const image = scene.particleView.sprites.find((sprite: { visible: boolean; frame: { name: string } }) =>
      sprite.visible && sprite.frame.name === 'energy-static');
    return image ? image.displayWidth * scene.framing.zoom * 0.5 : 0;
  })).toBeGreaterThanOrEqual(10.39);
  const hudClear = await page.evaluate(() =>
    document.querySelector('#pause')!.getBoundingClientRect().bottom <= document.querySelector('#ranking')!.getBoundingClientRect().top);
  expect(hudClear).toBe(true);
  await page.evaluate(() => {
    const { model } = Reflect.get(window, 'trainingScene');
    const cell = model.particles.slots[0];
    cell.x = model.player.position.x + model.player.radius + 3;
    cell.y = model.player.position.y;
  });
  await expect(page.locator('#energy-ready')).toBeVisible();
  await expect(page.locator('#attack')).toHaveText('Ready');
  await expect(page.locator('#mass')).toHaveText('4352');
});

test('live ranks stay compact and reveal the full twenty-place standings on desktop and mobile', async ({ page }) => {
  await inspectScene(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Endless', exact: true }).click();
  await page.evaluate(() => {
    const scene = Reflect.get(window, 'trainingScene');
    for (const [i, bot] of scene.model.bots.entries()) {
      bot.mass = 100 + i * 5;
      bot.combat.highest = bot.mass;
    }
  });
  await expect(page.locator('#ranking li')).toHaveCount(6);
  await expect(page.locator('#ranking .is-player span').first()).toHaveText('20');
  await page.getByRole('button', { name: 'Full rankings' }).click();
  await expect(page.locator('#ranking li')).toHaveCount(20);
  await expect(page.getByRole('button', { name: 'Close rankings' })).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Close rankings' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#ranking li')).toHaveCount(2);
  await page.getByRole('button', { name: 'Full rankings' }).click();
  await expect(page.locator('#ranking li')).toHaveCount(20);
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'End Session' }).click();
  await expect(page.locator('#result-ranking li')).toHaveCount(20);
  await expect(page.locator('#result-ranking .is-player span').first()).toHaveText('20');
  expect(await page.locator('#result-ranking').evaluate((list) => list.scrollHeight > list.clientHeight)).toBe(true);
});

test('live release shrinks a giant, launches salvage and reports a guarded follow-up', async ({ page }) => {
  await inspectScene(page);
  await page.setViewportSize({ width: 1460, height: 880 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Endless', exact: true }).click();
  await page.evaluate(() => {
    const scene = Reflect.get(window, 'trainingScene');
    const { model } = scene;
    model.botSteering = () => ({ kind: 'idle' });
    model.replenish = () => {};
    model.hazards.sites.length = 0;
    model.particles.slots.forEach((piece: { state: string }) => { piece.state = 'inactive'; });
    const player = model.player;
    player.combat.energy = 100;
    for (const bot of model.bots.slice(1)) bot.position = { x: 500, y: 500 };
    const victim = model.bots[0];
    Object.assign(victim, { position: { x: player.position.x + 410, y: player.position.y }, mass: 4352, physicalScale: 12, radius: 360 });
    victim.combat.highest = 4352;
    scene.botViews[0].scale.scale = 12;
  });
  await page.keyboard.down('Space');
  await expect(page.locator('#attack')).toHaveText('Release');
  await page.keyboard.up('Space');
  await expect(page.locator('#status')).toHaveText('GIANT CRACKED · 3301 MASS DETACHED');
  const impact = await page.evaluate(() => {
    const { model } = Reflect.get(window, 'trainingScene');
    return { mass: model.bots[0].mass, radius: model.bots[0].radius, chunks: model.salvage.chunks.length };
  });
  expect(impact.mass).toBe(1051);
  expect(impact.radius).toBeCloseTo(180, 1);
  expect(impact.chunks).toBe(24);
  await page.evaluate(() => { Reflect.get(window, 'trainingScene').model.player.combat.energy = 100; });
  await expect(page.locator('#attack')).toHaveText('Ready');
  await page.keyboard.down('Space');
  await page.keyboard.up('Space');
  await expect(page.locator('#status')).toHaveText('ATTACK GUARDED');
  await expect(page.locator('#energy-readout')).toHaveText('65%');
});

test('arena signals use one direction cue and results show recorded progression on a phone-sized viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    crypto.getRandomValues = (buffer) => {
      if (buffer instanceof Uint32Array) buffer.fill(11216);
      return buffer;
    };
  });
  await inspectScene(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Play Arena' }).click();
  const played = await page.evaluate(() => {
    const scene = Reflect.get(window, 'trainingScene');
    const start = performance.now();
    for (let frame = 0; frame < 240 && !scene.model.signal; frame++) scene.update(start + frame * 145, 145);
    const { model, framing } = scene;
    const signal = model.signal;
    return { elapsed: scene.clock.elapsed, signal: Boolean(signal),
      offscreen: signal && (signal.x < framing.bounds.left || signal.x > framing.bounds.right ||
        signal.y < framing.bounds.top || signal.y > framing.bounds.bottom) };
  });
  expect(played.signal).toBe(true);
  expect(played.elapsed).toBeGreaterThanOrEqual(23);
  expect(played.elapsed).toBeLessThan(30);
  const signal = page.locator('#salvage-signal');
  await expect(signal).toHaveText(played.offscreen ? /^Salvage Signal \d+ m$/ : 'Salvage Signal');
  if (played.offscreen) {
    await expect(signal).toHaveAttribute('data-offscreen', '');
    expect(await signal.evaluate((node) => getComputedStyle(node, '::before').display)).toBe('inline-block');
  }
  await page.evaluate(() => {
    const scene = Reflect.get(window, 'trainingScene');
    const { model } = scene;
    scene.menu.lastHud = -Infinity;
    const point = model.player.position;
    const victimId = model.bots[0].id;
    model.salvage.chunks.push({ ...point, origin: point, destination: point, age: 1, value: 31,
      offset: 0, source: { victimId, credits: [{ id: model.player.id, value: 31 }] } });
  });
  await expect(page.locator('#salvage-reward')).toHaveText('SALVAGE SECURED +31');
  await expect(page.locator('#rank-record')).toContainText(/Best #\d+ · Peak \d+/);
  await page.evaluate(() => {
    const scene = Reflect.get(window, 'trainingScene');
    scene.clock.elapsed = 299.99;
  });
  await expect(page.locator('#menu-title')).toHaveText('Results');
  const stats = page.locator('#result-stats');
  await expect(stats.getByText('Best rank', { exact: true })).toBeVisible();
  await expect(stats.locator('dt', { hasText: /^Salvage from your attacks$/ }).locator('+ dd')).toHaveText('31');
  await expect(stats.getByText('Larger rivals damaged')).toBeVisible();
  await expect(stats.getByText('Best recovery after theft')).toBeVisible();
  expect(await page.locator('#menu').evaluate((dialog) => dialog.getBoundingClientRect().width <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Play Again' }).click();
  await expect(page.locator('#mass')).toHaveText('20');
  await expect(page.locator('#rank-record')).toBeEmpty();
  await expect(page.locator('#salvage-reward')).toBeEmpty();
});

test('cartoon expressions follow a real attack and both Arena outcomes display matching art', async ({ page }) => {
  const errors: Error[] = [];
  page.on('pageerror', (error) => errors.push(error));
  await inspectScene(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Play Arena' }).click();
  await page.evaluate(() => {
    const scene = Reflect.get(window, 'trainingScene');
    scene.clock.countdown = 0;
    scene.model.player.combat.energy = 100;
  });
  const mood = () => page.evaluate(() => Reflect.get(window, 'trainingScene').magnet.face.mouth.frame.name);
  await expect(page.locator('#energy-ready')).toBeVisible();
  await page.keyboard.down('Space');
  await expect.poll(mood).toBe('player-aggressive-mouth');
  await page.keyboard.up('Space');
  await expect(page.locator('#attack')).toHaveText('Cooling');
  for (const [outcome, victory] of [['victory', true], ['defeat', false]] as const) {
    await page.evaluate((win) => {
      const scene = Reflect.get(window, 'trainingScene');
      const participant = win ? scene.model.player : scene.model.bots[0];
      participant.mass = participant.combat.highest = 8500;
      scene.clock.countdown = 0;
      scene.clock.elapsed = 299.999;
    }, victory);
    await expect(page.locator('#menu')).toHaveAttribute('data-outcome', outcome);
    const art = await page.locator('.menu-art').evaluate((element) => getComputedStyle(element, '::before').backgroundImage);
    expect(art).toContain(outcome + '.webp');
    if (victory) await page.getByRole('button', { name: 'Play Again' }).click();
  }
  expect(errors).toEqual([]);
});

test('Low and reduced motion preserve live gaze, concern, danger, and replay reset', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await inspectScene(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('#quality').selectOption('low');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Endless', exact: true }).click();
  await page.evaluate(async () => {
    const scene = Reflect.get(window, 'trainingScene');
    const growthSource = '/src/growth.ts';
    const { addMass } = await import(growthSource);
    const { model } = scene;
    model.botSteering = () => ({ kind: 'idle' });
    model.replenish = () => {};
    model.hazards.sites.length = 0;
    for (const bot of model.bots) bot.position = { x: 800, y: 800 };
    for (const slot of model.particles.slots) slot.state = 'inactive';
    const player = model.player;
    addMass(player, 380);
    scene.framing.follow(player.position, 10, player.mass);
    scene.magnetScale.scale = player.physicalScale;
    let resourceId = 0;
    while (model.particles.kind({ resourceId }) !== 'energy') resourceId++;
    Object.assign(model.particles.slots[0], { resourceId, state: 'active', x: player.position.x + 258, y: player.position.y - 135 });
  });

  const state = () => page.evaluate(() => {
    const { magnet, model } = Reflect.get(window, 'trainingScene');
    const target = magnet.attention.focus;
    return { kind: target?.kind, actor: target?.actor?.id, moving: model.player.velocity.x < -40,
      mouth: magnet.face.mouth.frame.name, eyes: magnet.face.eyes.frame.name, brows: magnet.face.brows.frame.name,
      sweat: magnet.marks.get('sweat')?.visible ?? false };
  });
  await expect.poll(state).toMatchObject({ kind: 'energy', moving: false, mouth: 'player-excited-mouth' });
  await page.evaluate(() => {
    const { model } = Reflect.get(window, 'trainingScene');
    const player = model.player;
    model.bots[0].position = { x: player.position.x + player.radius + 130, y: player.position.y + 25 };
  });
  await expect.poll(state).toMatchObject({ actor: 'bot-1', mouth: 'player-worried-mouth', eyes: 'player-worried-eyes', brows: 'player-worried-brows' });
  await page.locator('#arena').focus();
  await page.keyboard.down('KeyA');
  await expect.poll(state).toMatchObject({ actor: 'bot-1', moving: true });
  await page.keyboard.up('KeyA');
  await page.evaluate(() => {
    const { model } = Reflect.get(window, 'trainingScene');
    const player = model.player;
    const bot = model.bots[0];
    bot.position = { x: player.position.x + player.radius + 100, y: player.position.y + 20 };
    bot.combat.energy = 100;
    player.combat.heat = .8;
  });
  await expect.poll(state).toMatchObject({ actor: 'bot-1', mouth: 'player-frightened-mouth', sweat: true });
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'End Session' }).click();
  await page.getByRole('button', { name: 'Play Again' }).click();
  await page.evaluate(() => {
    const { model } = Reflect.get(window, 'trainingScene');
    model.replenish = () => {};
    for (const bot of model.bots) bot.position = { x: 900, y: 900 };
    for (const slot of model.particles.slots) slot.state = 'inactive';
  });
  await expect.poll(state).toMatchObject({ kind: undefined, actor: undefined, mouth: 'player-relaxed-mouth', sweat: false });
});
