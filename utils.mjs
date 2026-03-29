export function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function extractCommunityMediaFileId(mediaUrl) {
  const raw = String(mediaUrl || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw, 'https://local.invalid');
    const match = parsed.pathname.match(/\/api\/community\/media\/([^/?#]+)/);
    return match ? safeDecodeURIComponent(match[1]) : '';
  } catch {
    const match = raw.match(/\/api\/community\/media\/([^/?#]+)/);
    return match ? safeDecodeURIComponent(match[1]) : '';
  }
}

export async function collectRecentCommunityMediaFileIds(env, limit = 24) {
  const maxItems = Math.max(1, Math.min(80, Number(limit || 24)));
  const postRows = await env.COMMUNITY_DB.prepare("SELECT media_json FROM posts ORDER BY created_at DESC LIMIT ?").bind(Math.max(maxItems * 2, 40)).all();
  const userRows = await env.COMMUNITY_DB.prepare("SELECT avatar_url, background_url FROM users ORDER BY created_at DESC LIMIT ?").bind(Math.max(Math.ceil(maxItems / 2), 20)).all();
  const ids = [];
  const seen = new Set();

  const pushUrl = (value) => {
    const fileId = extractCommunityMediaFileId(value);
    if (!fileId || seen.has(fileId)) return;
    seen.add(fileId);
    ids.push(fileId);
  };

  for (const row of postRows.results || []) {
    try {
      const items = JSON.parse(row.media_json || '[]');
      for (const item of Array.isArray(items) ? items : []) {
        pushUrl(item?.url);
        if (ids.length >= maxItems) return ids;
      }
    } catch (e) {}
  }

  for (const row of userRows.results || []) {
    pushUrl(row.avatar_url);
    if (ids.length >= maxItems) return ids;
    pushUrl(row.background_url);
    if (ids.length >= maxItems) return ids;
  }

  return ids.slice(0, maxItems);
}
