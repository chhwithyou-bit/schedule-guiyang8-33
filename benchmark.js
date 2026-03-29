async function preheatCommunityMediaFile(env, fileId) {
  // Simulate 50ms async work
  await new Promise(r => setTimeout(r, 50));
  return { status: 'hit' };
}

async function runSequential(fileIds, stats) {
  for (const fileId of fileIds) {
    try {
      const result = await preheatCommunityMediaFile({}, fileId);
      if (result.status === 'hit') stats.hit += 1;
    } catch (e) {
      stats.failed += 1;
    }
  }
}

async function runConcurrentChunks(fileIds, stats) {
  const concurrencyLimit = 10;
  for (let i = 0; i < fileIds.length; i += concurrencyLimit) {
    const chunk = fileIds.slice(i, i + concurrencyLimit);
    await Promise.all(chunk.map(async (fileId) => {
      try {
        const result = await preheatCommunityMediaFile({}, fileId);
        if (result.status === 'hit') stats.hit += 1;
      } catch (e) {
        stats.failed += 1;
      }
    }));
  }
}

async function runConcurrentPool(fileIds, stats) {
  let active = 0;
  let index = 0;
  await new Promise((resolve) => {
    if (fileIds.length === 0) return resolve();

    const next = () => {
      if (index >= fileIds.length && active === 0) {
        resolve();
        return;
      }
      while (active < 10 && index < fileIds.length) {
        active++;
        const fileId = fileIds[index++];
        preheatCommunityMediaFile({}, fileId).then((result) => {
          if (result.status === 'hit') stats.hit += 1;
        }).catch((e) => {
          stats.failed += 1;
        }).finally(() => {
          active--;
          next();
        });
      }
    };
    next();
  });
}

async function main() {
  const fileIds = Array.from({ length: 80 }, (_, i) => `file-${i}`);

  let stats = { hit: 0, failed: 0 };
  let start = Date.now();
  await runSequential(fileIds, stats);
  console.log(`Sequential: ${Date.now() - start}ms (hits: ${stats.hit})`);

  stats = { hit: 0, failed: 0 };
  start = Date.now();
  await runConcurrentChunks(fileIds, stats);
  console.log(`Concurrent Chunks (10): ${Date.now() - start}ms (hits: ${stats.hit})`);

  stats = { hit: 0, failed: 0 };
  start = Date.now();
  await runConcurrentPool(fileIds, stats);
  console.log(`Concurrent Pool (10): ${Date.now() - start}ms (hits: ${stats.hit})`);

  // Try unlimited Promise.all
  stats = { hit: 0, failed: 0 };
  start = Date.now();
  await Promise.all(fileIds.map(async (fileId) => {
    try {
      const result = await preheatCommunityMediaFile({}, fileId);
      if (result.status === 'hit') stats.hit += 1;
    } catch (e) {
      stats.failed += 1;
    }
  }));
  console.log(`Promise.all (unlimited): ${Date.now() - start}ms (hits: ${stats.hit})`);
}

main();
