import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const workerSource = readFileSync(resolve(repoRoot, 'src/lib.rs'), 'utf8');

function musicFileHandlerSource() {
  const start = workerSource.indexOf('.get_async("/api/music/file/:key"');
  assert.notEqual(start, -1, 'music file route should exist');
  const end = workerSource.indexOf('.post_async("/api/proxy-gemini"', start);
  assert.notEqual(end, -1, 'music file route end marker should exist');
  return workerSource.slice(start, end);
}

test('music file endpoint supports browser audio range requests', () => {
  const handler = musicFileHandlerSource();

  assert.match(workerSource, /fn parse_music_range_header\(/);
  assert.match(handler, /req\.headers\(\)\.get\("Range"\)/);
  assert.match(handler, /\.range\(range\.r2_range(?:\.clone\(\))?\)/);
  assert.match(handler, /with_status\(206\)/);
  assert.match(workerSource, /Content-Range/);
  assert.match(workerSource, /Accept-Ranges/);
});

test('music file endpoint streams R2 bodies instead of buffering entire songs', () => {
  const handler = musicFileHandlerSource();

  assert.doesNotMatch(handler, /\.body\(\)\.unwrap\(\)\.bytes\(\)\.await/);
  assert.match(handler, /response_body\(\)\?/);
  assert.match(handler, /Response::from_body/);
});

test('music content type falls back from generic upload metadata to audio mime', () => {
  assert.match(workerSource, /fn effective_music_content_type\(/);
  assert.match(workerSource, /application\/octet-stream/);
  assert.match(musicFileHandlerSource(), /effective_music_content_type\(&key,/);
});
