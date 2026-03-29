import test from 'node:test';
import assert from 'node:assert';
import { collectRecentCommunityMediaFileIds } from '../../utils.mjs';

test('collectRecentCommunityMediaFileIds handles JSON.parse errors gracefully', async () => {
  const mockEnv = {
    COMMUNITY_DB: {
      prepare: (sql) => ({
        bind: () => ({
          all: async () => {
            if (sql.includes('posts')) {
              return {
                results: [
                  { media_json: 'invalid json' }, // This will trigger JSON.parse catch block
                  { media_json: '[{"url": "/api/community/media/valid_file_id_1"}]' },
                  { media_json: null } // This tests edge case where media_json is null
                ]
              };
            }
            if (sql.includes('users')) {
              return { results: [] };
            }
          }
        })
      })
    }
  };

  const ids = await collectRecentCommunityMediaFileIds(mockEnv, 10);
  assert.deepStrictEqual(ids, ['valid_file_id_1'], 'Should extract valid file id and ignore invalid json error');
});
