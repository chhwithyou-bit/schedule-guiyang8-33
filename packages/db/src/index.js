export * from './schema.js';
export * from './relations.js';
export * from './repositories/base-repository.js';
export * from './repositories/community-repository.js';

export async function createPgPool(...args) {
  const mod = await import('./client.js');
  return mod.createPgPool(...args);
}

export async function createDb(...args) {
  const mod = await import('./client.js');
  return mod.createDb(...args);
}

export function withTransaction(db, callback) {
  return db.transaction((tx) => callback(tx));
}
