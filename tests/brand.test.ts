import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { brand } from '../src/brand';

function sources(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = path + '/' + entry.name;
    if (entry.isDirectory()) return sources(child);
    return /\.(?:ts|css|py)$/.test(entry.name) ? [child] : [];
  });
}

test('presentation source has no inline hexadecimal color literals', () => {
  const cssHex = /(?<=['":\s])#[0-9a-f]{3,8}(?![0-9a-z_])/i;
  const numeric = /\b0x[0-9a-f]{6}\b/i;
  for (const file of [...sources('src'), ...sources('scripts')]) {
    const source = readFileSync(file, 'utf8');
    assert.ok(!cssHex.test(source) && !numeric.test(source), file);
  }
});

test('theme keys and scrap indices match and exclusive role colors differ', () => {
  assert.deepEqual(Object.keys(brand.themes.light).sort(), Object.keys(brand.themes.dark).sort());
  assert.equal(brand.themes.light.scrap.length, 10);
  assert.equal(brand.themes.dark.scrap.length, 10);
  const colors = Object.values(brand.roles);
  assert.ok(colors.every((color) => /^#[0-9A-F]{6}$/.test(color)));
  assert.equal(new Set(colors).size, colors.length);
});

test('asset manifest references valid palette roles and actual packed frames', () => {
  const manifest = JSON.parse(readFileSync('brand/asset-manifest.json', 'utf8'));
  assert.deepEqual(manifest.paletteRoles, Object.keys(brand.roles));
  for (const [name, frames] of Object.entries(manifest.atlases)) {
    const atlas = JSON.parse(readFileSync('public/' + name + '.json', 'utf8'));
    assert.deepEqual(frames, Object.keys(atlas.frames));
  }
});
