import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const distDir = path.join(repoRoot, 'v5-svelte-migration', 'dist');
const distAssetsDir = path.join(distDir, 'assets');
const publicDir = path.join(repoRoot, 'public');
const publicAssetsDir = path.join(publicDir, 'assets');
const distIndex = path.join(distDir, 'index.html');
const publicIndex = path.join(publicDir, 'index.html');
const rootIndex = path.join(repoRoot, 'index.html');
const assetRefPattern = /(?:src|href)="(\/assets\/[^"]+)"/g;

if (!fs.existsSync(distIndex)) {
  throw new Error(`Missing build artifact: ${distIndex}`);
}

const distHtml = fs.readFileSync(distIndex, 'utf8');
const requiredAssetNames = [...new Set(
  [...distHtml.matchAll(assetRefPattern)]
    .map((match) => match[1].replace(/^\/assets\//, ''))
    .filter(Boolean)
)];

if (requiredAssetNames.length === 0) {
  throw new Error('No /assets references found in dist/index.html');
}

fs.mkdirSync(publicAssetsDir, { recursive: true });

for (const assetName of requiredAssetNames) {
  const sourcePath = path.join(distAssetsDir, assetName);
  const targetPath = path.join(publicAssetsDir, assetName);
  fs.copyFileSync(sourcePath, targetPath);
}

for (const existingName of fs.readdirSync(publicAssetsDir)) {
  if (!requiredAssetNames.includes(existingName)) {
    fs.rmSync(path.join(publicAssetsDir, existingName), { force: true, recursive: true });
  }
}

fs.copyFileSync(distIndex, rootIndex);
fs.copyFileSync(distIndex, publicIndex);

for (const entry of fs.readdirSync(distDir, { withFileTypes: true })) {
  if (!entry.isFile() || entry.name === 'index.html') continue;
  fs.copyFileSync(path.join(distDir, entry.name), path.join(publicDir, entry.name));
}

console.log(`Synced ${requiredAssetNames.length} asset(s) into ${publicAssetsDir} and refreshed HTML shells.`);
