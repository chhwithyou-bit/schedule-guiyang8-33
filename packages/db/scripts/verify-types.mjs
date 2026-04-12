const mod = await import('../src/index.js');
if (typeof mod.createDb !== 'function') {
  throw new Error('createDb export must be a function.');
}
if (typeof mod.createCommunityRepositories !== 'function') {
  throw new Error('createCommunityRepositories export must be a function.');
}
if (!mod.users || !mod.posts || !mod.conversations) {
  throw new Error('Core table exports are missing.');
}
process.stdout.write('type surface verification passed\n');
