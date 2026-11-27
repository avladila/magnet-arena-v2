import { expect, test, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const clips = process.env.MAGNET_RC7B_VIDEO;
const run = promisify(execFile);

async function openArena(page: Page) {
  await page.addInitScript(() => {
    crypto.getRandomValues = buffer => { if (buffer instanceof Uint32Array) buffer.fill(17889); return buffer; };
  });
  await page.route(url => url.pathname === '/src/main.ts', async route => {
    const response = await route.fetch();
    const source = await response.text();
    const anchor = 'this.floor = new ArenaFloor';
    expect(source).toContain(anchor);
    await route.fulfill({ response, body: source.replace(anchor, 'Reflect.set(window, "criticalScene", this); ' + anchor) });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Play Arena' }).click();
  await page.evaluate(async ({ growthPath, combatPath }) => {
    const [growth, combat] = await Promise.all([import(growthPath), import(combatPath)]);
    Reflect.set(window, 'criticalTools', { ...growth, ...combat });
    const scene = Reflect.get(window, 'criticalScene');
    const { model } = scene;
    scene.clock.countdown = 0;
    model.hazards.sites.length = 0;
    model.replenish = () => {};
    model.botSteering = () => ({ kind: 'idle' });
    for (const slot of model.particles.slots) slot.state = 'inactive';
    for (const bot of model.bots) bot.position = { x: 3700, y: 5200 };
  }, { growthPath: '/src/growth.ts', combatPath: '/src/combat.ts' });
  await page.locator('#arena').focus();
  await expect(page.locator('#countdown')).toBeHidden();
}

async function film(page: Page, name: string, play: () => Promise<void>) {
  if (!clips) return play();
  const cdp = await page.context().newCDPSession(page);
  const frames: { jpeg: string; at: number }[] = [];
  cdp.on('Page.screencastFrame', ({ data, sessionId, metadata }) => {
    void cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    if (metadata.timestamp) frames.push({ jpeg: data, at: metadata.timestamp });
  });
  const width = page.viewportSize()!.width;
  const height = page.viewportSize()!.height;
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 89, maxWidth: width, maxHeight: height });
  try {
    await page.waitForTimeout(350);
    await play();
    await page.waitForTimeout(850);
  } finally {
    await cdp.send('Page.stopScreencast');
    await cdp.detach();
  }
  expect(frames.length).toBeGreaterThan(2);
  const folder = await mkdtemp(join(tmpdir(), 'magnet-rc7b-'));
  try {
    await mkdir(clips, { recursive: true });
    const fps = 18;
    let index = 0;
    const files: Promise<void>[] = [];
    for (let frame = 0; frame <= (frames.at(-1)!.at - frames[0].at + 0.65) * fps; frame++) {
      const at = frames[0].at + frame / fps;
      while (frames[index + 1]?.at <= at) index++;
      files.push(writeFile(join(folder, String(frame).padStart(4, '0') + '.jpg'), Buffer.from(frames[index].jpeg, 'base64')));
    }
    await Promise.all(files);
    await run('ffmpeg', ['-v', 'error', '-y', '-threads', '2', '-framerate', String(fps), '-i', join(folder, '%04d.jpg'),
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-threads', '2', '-crf', '22',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(clips, name + '.mp4')]);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

async function goldPickup(page: Page, priorMass: number) {
  await page.evaluate(mass => {
    const { model } = Reflect.get(window, 'criticalScene');
    const { addMass } = Reflect.get(window, 'criticalTools');
    const { player, particles } = model;
    addMass(player, mass - player.mass);
    let resourceId = 0;
    while (particles.kind({ resourceId }) !== 'gold') resourceId++;
    const slot = particles.slots[0];
    Object.assign(slot, { state: 'active', resourceId, generation: slot.generation + 1,
      x: player.position.x + player.radius * .9, y: player.position.y });
  }, priorMass);
  await expect(page.locator('#mass')).toHaveText(String(priorMass + 10));
}

async function stageClaimant(page: Page, gapX: number) {
  await page.evaluate(gap => {
    const scene = Reflect.get(window, 'criticalScene');
    const { addMass } = Reflect.get(window, 'criticalTools');
    const { player, bots: [bot] } = scene.model;
    bot.position = { x: player.position.x - gap, y: player.position.y };
    bot.heading = 0;
    addMass(bot, 12_000 - bot.mass);
    scene.botViews[0].scale.scale = bot.physicalScale;
  }, gapX);
  await expect(page.locator('#critical-title')).toHaveText('CRITICAL MASS REACHED');
}

const waitInClip = (page: Page, milliseconds: number) => clips ? page.waitForTimeout(milliseconds) : Promise.resolve();
const progress = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('magnet.progress.v1')!));

test('Critical Mass follows real growth pickups, anchors the player, destroys rivals and records victory once', async ({ page }) => {
  test.setTimeout(60_000);
  await openArena(page);
  await page.evaluate(() => {
    const scene = Reflect.get(window, 'criticalScene');
    const { addMass } = Reflect.get(window, 'criticalTools');
    const { model } = scene;
    // Inactive rivals are used here to stress several true collision events in one wave.
    model.endgameSteering = () => undefined;
    const positions = [[440, 230], [500, -230], [700, 90], [-495, 280], [-645, -95], [-400, -275]];
    positions.forEach(([x, y], index) => {
      const bot = model.bots[index];
      bot.position = { x: model.player.position.x + x, y: model.player.position.y + y };
      addMass(bot, 70 + 20 * index - bot.mass);
    });
  });
  await film(page, 'growth-and-victory', async () => {
    await goldPickup(page, 4347);
    await waitInClip(page, 750);
    const mood = () => page.evaluate(() => Reflect.get(window, 'criticalScene').magnet.pose.expression);
    for (const [mass, stage, face] of [[7995, 'ULTIMATE FORM', 'manic'], [9995, 'UNSTABLE FORM', 'nervous'],
      [10995, 'SEVERE INSTABILITY', 'strained']] as const) {
      await goldPickup(page, mass);
      await expect(page.locator('#overload-stage')).toHaveText(stage);
      await expect.poll(mood).toBe(face);
      expect(await page.evaluate(() => Reflect.get(window, 'criticalScene').model.player.radius)).toBe(360);
      await waitInClip(page, 850);
    }
    await goldPickup(page, 11995);
    await expect(page.locator('#critical-title')).toHaveText('CRITICAL MASS REACHED');
    await expect.poll(mood).toBe('panic');
    expect(await page.evaluate(() => Reflect.get(window, 'criticalScene').criticalView.number.visible)).toBe(true);
    await expect(page.locator('#attack')).toBeDisabled();
    const position = () => page.evaluate(() => Reflect.get(window, 'criticalScene').model.player.position);
    const anchor = await position();
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(180);
    await page.keyboard.up('KeyD');
    expect(await position()).toEqual(anchor);
    await page.getByRole('button', { name: 'Pause' }).click();
    const remaining = () => page.evaluate(() => Reflect.get(window, 'criticalScene').model.critical.claim?.remaining);
    const paused = await remaining();
    await page.waitForTimeout(270);
    expect(await remaining()).toBe(paused);
    await page.getByRole('button', { name: 'Resume' }).click();
    await expect(page.locator('#result-summary')).toContainText('CRITICAL MASS VICTORY', { timeout: 10000 });
    await expect(page.locator('#result-ranking li')).toHaveCount(20);
    await expect(page.locator('#result-ranking li').first()).toHaveAttribute('data-outcome', 'detonator');
    await expect(page.locator('#result-ranking li[data-outcome=destroyed]')).toHaveCount(6);
    await expect(page.locator('#result-ranking li[data-outcome=survivor]')).toHaveCount(13);
    await expect(page.locator('#result-finale')).toContainText('6 destroyed · 13 survived');
    const recorded = await progress(page);
    expect(recorded).toMatchObject({ completed: 1, criticalVictories: 1, mostDestroyed: 6 });
    await page.evaluate(() => Reflect.get(window, 'criticalScene').finish());
    expect(await progress(page)).toEqual(recorded);
  });
  await page.getByRole('button', { name: 'Play Again' }).click();
  await expect(page.locator('#mass')).toHaveText('20');
  await expect(page.locator('#critical-warning')).toBeHidden();
  await expect(page.locator('#minimap')).not.toHaveAttribute('data-claimant', /.+/);
  await expect(page.locator('#attack')).toBeEnabled();
});

test('Critical Mass stops after a real opponent attack and after acid, then ordinary time expires', async ({ page }) => {
  test.setTimeout(60_000);
  await openArena(page);
  await film(page, 'interruptions-and-timeout', async () => {
    await page.evaluate(() => {
      const { model } = Reflect.get(window, 'criticalScene');
      const { addMass } = Reflect.get(window, 'criticalTools');
      const { player, bots: [bot] } = model;
      addMass(player, 400 - player.mass);
      player.combat.energy = 100;
      bot.strategy = 'collector';
      model.endgameSteering = () => undefined;
    });
    await page.getByRole('button', { name: 'Map', exact: true }).click();
    await stageClaimant(page, 480);
    await expect(page.locator('#minimap')).toHaveAttribute('data-claimant', 'bot-1');
    await waitInClip(page, 420);
    // Aiming to the left with the desktop pointer, then releasing Space, resolves ordinary theft.
    const view = page.viewportSize()!;
    await page.mouse.move(view.width * .27, view.height * .5);
    await page.keyboard.down('Space');
    await expect(page.locator('#attack')).toHaveText('Release');
    await waitInClip(page, 220);
    await page.keyboard.up('Space');
    await expect(page.locator('#critical-title')).toHaveText('DETONATION INTERRUPTED');
    await expect(page.locator('#critical-threat')).toHaveText('Stopped by You');
    await expect(page.locator('#minimap')).not.toHaveAttribute('data-claimant', /.+/);
    await waitInClip(page, 1_100);
    await stageClaimant(page, 480);
    await waitInClip(page, 560);
    await page.evaluate(() => {
      const { model } = Reflect.get(window, 'criticalScene');
      model.hazards.sites.push({ ...model.bots[0].position, kind: 'acid', radius: 115, readyAt: 0,
        contacts: new Set(), victims: new Map() });
    });
    await expect(page.locator('#critical-title')).toHaveText('DETONATION INTERRUPTED');
    await expect(page.locator('#critical-threat')).toHaveText('Hazard damage');
    await waitInClip(page, 1_100);
    await page.evaluate(() => {
      const scene = Reflect.get(window, 'criticalScene');
      scene.clock.elapsed = scene.model.elapsed = 299.7;
    });
    await expect(page.locator('#result-ranking li')).toHaveCount(20);
    await expect(page.locator('#result-finale')).toBeHidden();
    await expect(page.locator('#result-ranking li[data-outcome]')).toHaveCount(0);
    expect(await page.evaluate(() => Reflect.get(window, 'criticalScene').model.matchResult.cause)).toBe('timeout');
  });
});

test('Critical Mass warns about an offscreen bot and a steering player survives and earns 1,000 points', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1120, height: 700 });
  await openArena(page);
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await film(page, 'bot-offscreen-escape', async () => {
    await stageClaimant(page, 1010);
    await expect(page.locator('#critical-direction')).toHaveAttribute('data-offscreen', '');
    await expect(page.locator('#critical-direction')).toContainText('1,010 units to blast center');
    await expect(page.locator('#critical-threat')).toContainText('ESCAPE THE BLAST');
    await expect(page.locator('#minimap')).toHaveAttribute('data-claimant', 'bot-1');
    await waitInClip(page, 420);
    await page.keyboard.down('KeyD');
    await expect(page.locator('#result-summary')).toContainText('YOU SURVIVED', { timeout: 10000 });
    await page.keyboard.up('KeyD');
    await expect(page.locator('#result-ranking li').first()).toHaveAttribute('data-outcome', 'detonator');
    await expect(page.locator('#result-ranking li.is-player')).toHaveAttribute('data-outcome', 'survivor');
    await expect(page.locator('#result-finale')).toContainText('+1,000 SURVIVAL POINTS');
    expect(await progress(page)).toMatchObject({ completed: 1, survivedDetonations: 1 });
  });
});

test('Critical Mass wave destroys a stationary human and ranks them behind survivors', async ({ page }) => {
  test.setTimeout(60_000);
  await openArena(page);
  await film(page, 'bot-detonation-and-destruction', async () => {
    await stageClaimant(page, 440);
    await expect(page.locator('#critical-title')).toHaveText('DESTROYED BY THE SHOCKWAVE', { timeout: 10000 });
    await expect(page.locator('#result-summary')).toContainText('DESTROYED BY THE SHOCKWAVE');
    await expect(page.locator('#result-ranking li').last()).toHaveClass('is-player');
    await expect(page.locator('#result-ranking li').last()).toHaveAttribute('data-outcome', 'destroyed');
    await expect(page.locator('#result-finale')).toContainText('1 destroyed · 18 survived');
    await expect(page.locator('#result-finale')).not.toContainText('SURVIVAL POINTS');
    expect(await progress(page)).toMatchObject({ completed: 1, survivedDetonations: 0 });
  });
});

for (const [label, width, height] of [['portrait', 390, 844], ['landscape', 844, 390]] as const) {
  test(`Critical Mass supports ${label} touchscreen steering and a second thumb in Arena`, async ({ browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'Uses Chromium touch input');
    test.setTimeout(60_000);
    const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4173', hasTouch: true, isMobile: true,
      viewport: { width, height }, ...(label === 'landscape' && { reducedMotion: 'reduce' }) });
    const page = await context.newPage();
    try {
      await openArena(page);
      await page.getByRole('button', { name: 'Map', exact: true }).tap();
      const touch = await context.newCDPSession(page);
      await film(page, `mobile-${label}`, async () => {
        await page.evaluate(() => Reflect.get(window, 'criticalScene').model.player.combat.energy = 100);
        await stageClaimant(page, 960);
        if (label === 'portrait') {
          const banner = (await page.locator('#critical-warning').boundingBox())!;
          const hud = (await page.locator('.field-hud').boundingBox())!;
          expect(banner.y).toBeGreaterThan(hud.y + hud.height);
        }
        const button = (await page.locator('#attack').boundingBox())!;
        const steer = { x: 88, y: height - 122, id: 1 };
        const attack = { x: button.x + button.width / 2, y: button.y + button.height / 2, id: 2 };
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [steer] });
        steer.x += 58;
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [steer] });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [steer, attack] });
        await expect(page.locator('#joystick')).toBeVisible();
        await expect(page.locator('#attack')).toHaveText('Release');
        await expect.poll(() => page.evaluate(() => {
          const { model } = Reflect.get(window, 'criticalScene');
          return model.player.position.x - model.critical.claim?.center.x;
        })).toBeGreaterThan(1_470);
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await expect.poll(() => page.evaluate(() => Reflect.get(window, 'criticalScene').model.player.combat.misses)).toBe(1);
        await expect(page.locator('#result-summary')).toContainText('YOU SURVIVED', { timeout: 10000 });
      });
    } finally {
      await context.close();
    }
  });
}
