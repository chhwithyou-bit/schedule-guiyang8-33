const mod = await import('../src/index.js');
const required = ['communitySchema', 'createDb', 'createCommunityRepositories'];
for (const key of required) {
  if (!(key in mod)) {
    throw new Error(`Missing export: ${key}`);
  }
}
process.stdout.write('build verification passed\n');
