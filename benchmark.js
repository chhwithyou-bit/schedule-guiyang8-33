const fs = require('fs');

async function runBenchmark() {
  const code = fs.readFileSync('./worker.js', 'utf-8');

  // Create a minimal environment to test the specific logic of media-cache-warm
  // We don't need the whole server, we just need to test the performance of the modified loop.

  // Let's create a dummy file array
  const fileIds = Array.from({ length: 80 }, (_, i) => `file_${i}`);

  const env = {
    COMMUNITY_R2: {
      head: async (id) => {
        await new Promise(r => setTimeout(r, 10)); // simulate 10ms network latency
        return null; // simulate cache miss
      },
      put: async (id, buffer, options) => {
        await new Promise(r => setTimeout(r, 10)); // simulate network latency
      }
    },
    SCHEDULE_KV: {
      get: async () => null,
      put: async () => null
    },
    COMMUNITY_DB: {
      prepare: () => ({ bind: () => ({ all: async () => [], first: async () => null, run: async () => null }) })
    }
  };

  // The function to test:
  async function preheatCommunityMediaFile(env, fileId) {
    if (!fileId) return { status: 'invalid' };
    if (!env.COMMUNITY_R2) return { status: 'disabled' };

    try {
      const existing = await env.COMMUNITY_R2.head(fileId);
      if (existing) {
        return { status: 'hit' };
      }
    } catch (e) {}

    // Mock getFromDrive and everything else
    await new Promise(r => setTimeout(r, 20)); // simulated 20ms drive fetch

    // Simulate cacheCommunityMedia
    await new Promise(r => setTimeout(r, 10));

    return { status: 'cached', byteSize: 1000, contentType: 'image/jpeg' };
  }

  const stats = {
    requested: 80,
    selected: 80,
    hit: 0,
    cached: 0,
    skipped: 0,
    missing: 0,
    failed: 0
  };

  const startTime = Date.now();

  // ---- Original Code Block (for baseline) or Modified Code Block ----

  // Sequential version (Current Code)
  for (const fileId of fileIds) {
    try {
      const result = await preheatCommunityMediaFile(env, fileId);
      if (result.status === 'hit') stats.hit += 1;
      else if (result.status === 'cached') stats.cached += 1;
      else if (result.status === 'skipped') stats.skipped += 1;
      else if (result.status === 'missing') stats.missing += 1;
      else stats.failed += 1;
    } catch (e) {
      stats.failed += 1;
    }
  }

  const duration = Date.now() - startTime;
  console.log(`Sequential cache warm took ${duration}ms`);

  // Reset stats
  Object.keys(stats).forEach(k => { if (k !== 'requested' && k !== 'selected') stats[k] = 0; });

  const startTimeParallel = Date.now();

  // Parallel version (Optimized Code)
  const promises = fileIds.map(async (fileId) => {
    try {
      const result = await preheatCommunityMediaFile(env, fileId);
      if (result.status === 'hit') stats.hit += 1;
      else if (result.status === 'cached') stats.cached += 1;
      else if (result.status === 'skipped') stats.skipped += 1;
      else if (result.status === 'missing') stats.missing += 1;
      else stats.failed += 1;
    } catch (e) {
      stats.failed += 1;
    }
  });
  await Promise.all(promises);

  const durationParallel = Date.now() - startTimeParallel;
  console.log(`Parallel cache warm took ${durationParallel}ms`);
  console.log(`Improvement: ${(duration / durationParallel).toFixed(2)}x faster`);
}

runBenchmark();
