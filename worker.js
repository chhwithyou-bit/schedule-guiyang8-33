import htmlContent from './index.html';

const DEFAULT_ADMIN_USER = 'admin';
const DEFAULT_ADMIN_PASS = 'admin888';

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function corsResp() {
  return new Response(null, {
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
  });
}

async function verifyAdmin(env, username, password) {
  const storedUser = await env.SCHEDULE_KV.get('nodes_admin_user') || DEFAULT_ADMIN_USER;
  const storedPass = await env.SCHEDULE_KV.get('nodes_admin_pass') || DEFAULT_ADMIN_PASS;
  return username === storedUser && password === storedPass;
}

function parseNodes(rawText) {
  let decoded = rawText.trim();
  try { const b64 = atob(decoded); if (b64.includes('://')) decoded = b64; } catch {}
  return decoded.split('\n').map(l => l.trim()).filter(l => l.startsWith('ss://') || l.startsWith('vmess://') || l.startsWith('trojan://') || l.startsWith('vless://') || l.startsWith('ssr://'))
    .map(raw => {
      let name = '未知节点';
      try {
        if (raw.startsWith('vmess://')) { const json = JSON.parse(atob(raw.slice(8))); name = json.ps || json.add || 'vmess节点'; }
        else { const hashPart = raw.split('#')[1]; if (hashPart) name = decodeURIComponent(hashPart.split('\r')[0]); else name = raw.split('://')[0].toUpperCase() + '节点'; }
      } catch {}
      return { name: name.trim(), raw };
    });
}

// ── Google Drive API Helpers (OAuth2 User Flow) ────────────────
async function getGoogleAuthToken(env) {
  const { GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN } = env;
  if (!GDRIVE_CLIENT_ID || !GDRIVE_CLIENT_SECRET || !GDRIVE_REFRESH_TOKEN) {
    throw new Error('缺失 OAuth2 凭据 (Client ID, Secret, 或 Refresh Token)');
  }

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GDRIVE_CLIENT_ID,
      client_secret: GDRIVE_CLIENT_SECRET,
      refresh_token: GDRIVE_REFRESH_TOKEN,
      grant_type: 'refresh_token'
    })
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(`OAuth2 Failed: ${data.error_description || data.error}`);
  return data.access_token;
}

async function uploadToDrive(env, fileBuffer, fileName, mimeType) {
  const token = await getGoogleAuthToken(env);
  const metadata = { name: fileName, parents: [env.GDRIVE_FOLDER_ID] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([fileBuffer], { type: mimeType }));
  const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: form
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error ? data.error.message : 'Upload Failed');
  return data;
}

async function getFromDrive(env, fileId) {
  const token = await getGoogleAuthToken(env);
  return await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return corsResp();

    if (url.pathname === '/api/data') {
      if (request.method === 'GET') return new Response(await env.SCHEDULE_KV.get('schedule_data') || '{"S":null}', { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      if (request.method === 'POST') { await env.SCHEDULE_KV.put('schedule_data', await request.text()); return jsonResp({ ok: true }); }
    }

    if (url.pathname === '/api/proxy-gemini' && request.method === 'POST') {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=AIzaSyAx1iLyi7qIO9KLBMtc_1wey18Eaz1J9H0`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: await request.text() });
      return new Response(await resp.text(), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    if (url.pathname === '/api/nodes') {
      if (request.method === 'GET') {
        const pwd = url.searchParams.get('pwd') || '';
        if (pwd !== await env.SCHEDULE_KV.get('nodes_user_pwd')) return jsonResp({ ok: false, msg: '无权访问' }, 401);
        return new Response(await env.SCHEDULE_KV.get('nodes_list') || '[]', { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
      if (request.method === 'POST') {
        const body = await request.json();
        if (!(await verifyAdmin(env, body.adminUser, body.adminPass))) return jsonResp({ ok: false, msg: '认证失败' }, 401);
        if (body.action === 'getNodes') return jsonResp({ ok: true, nodes: JSON.parse(await env.SCHEDULE_KV.get('nodes_list') || '[]') });
        if (body.action === 'clearNodes') { await env.SCHEDULE_KV.put('nodes_list', '[]'); return jsonResp({ ok: true }); }
        return jsonResp({ ok: false, msg: '未知操作' }, 400);
      }
    }

    if (url.pathname.startsWith('/api/community/')) {
      const getAuth = async () => {
        const auth = request.headers.get('Authorization') || '';
        if (!auth.startsWith('Bearer ')) return null;
        const [u, p] = auth.slice(7).split(':');
        return await env.COMMUNITY_DB.prepare("SELECT * FROM users WHERE username = ? AND password_hash = ?").bind(u, p).first();
      };

      if (url.pathname === '/api/community/auth' && request.method === 'POST') {
        const { action, username, password } = await request.json();
        const passHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password)))).map(b => b.toString(16).padStart(2, '0')).join('');
        if (action === 'register') { await env.COMMUNITY_DB.prepare("INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)").bind(crypto.randomUUID(), username, passHash).run(); return jsonResp({ ok: true, user: { username, passHash } }); }
        if (action === 'login') { const user = await env.COMMUNITY_DB.prepare("SELECT * FROM users WHERE username = ? AND password_hash = ?").bind(username, passHash).first(); if (!user) return jsonResp({ ok: false }, 401); return jsonResp({ ok: true, user: { username, passHash } }); }
      }

      if (url.pathname === '/api/community/posts') {
        if (request.method === 'GET') {
          try {
            const { results } = await env.COMMUNITY_DB.prepare("SELECT p.id, p.content, p.media_json, p.created_at, u.username FROM posts p JOIN users u ON p.user_id = u.id ORDER BY p.created_at DESC LIMIT 100").all();
            return jsonResp({ ok: true, posts: results || [] });
          } catch (e) { return jsonResp({ ok: false, msg: e.message }, 500); }
        }
        if (request.method === 'POST') {
          const user = await getAuth();
          if (!user) return jsonResp({ ok: false, msg: 'No Auth' }, 401);
          const { content, media } = await request.json();
          await env.COMMUNITY_DB.prepare("INSERT INTO posts (id, user_id, content, media_json) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(), user.id, content || '', JSON.stringify(media || [])).run();
          return jsonResp({ ok: true });
        }
      }

      if (url.pathname === '/api/community/upload' && request.method === 'POST') {
        const user = await getAuth();
        if (!user) return jsonResp({ ok: false, msg: 'No Auth' }, 401);
        const buffer = await request.arrayBuffer();
        const contentType = request.headers.get('content-type') || 'image/jpeg';
        try {
          let fileId, fromDrive = true;
          try {
            const driveData = await uploadToDrive(env, buffer, `img_${Date.now()}`, contentType);
            fileId = driveData.id;
          } catch (driveErr) {
            console.error("Drive Failed:", driveErr.message);
            fileId = "r2cache_" + crypto.randomUUID();
            fromDrive = false;
          }
          if (env.COMMUNITY_R2) { try { await env.COMMUNITY_R2.put(fileId, buffer, { httpMetadata: { contentType } }); } catch (e) {} }
          return jsonResp({ ok: true, fileId, url: `/api/community/media/${fileId}`, fromDrive });
        } catch (e) { return jsonResp({ ok: false, msg: e.message }, 500); }
      }

      if (url.pathname.startsWith('/api/community/media/')) {
        const fileId = url.pathname.split('/').pop();
        if (env.COMMUNITY_R2) {
          const cache = await env.COMMUNITY_R2.get(fileId);
          if (cache) return new Response(cache.body, { headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'image/jpeg', 'X-Cache': 'HIT-R2' } });
        }
        try {
          const drive = await getFromDrive(env, fileId);
          if (!drive.ok) throw new Error();
          const buf = await drive.arrayBuffer();
          if (env.COMMUNITY_R2) { try { await env.COMMUNITY_R2.put(fileId, buf, { httpMetadata: { contentType: 'image/jpeg' } }); } catch (e) {} }
          return new Response(buf, { headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'image/jpeg', 'X-Cache': 'MISS-GDrive' } });
        } catch (e) { return new Response('Media Not Found', { status: 404 }); }
      }

      if (url.pathname === '/api/community/test-drive') {
        try {
          const token = await getGoogleAuthToken(env);
          const drive = await (await fetch(`https://www.googleapis.com/drive/v3/files/${env.GDRIVE_FOLDER_ID}?supportsAllDrives=true`, { headers: { 'Authorization': `Bearer ${token}` } })).json();
          return jsonResp({ ok: true, msg: '[V4-OAuth2] 诊断完成', folder: drive.name });
        } catch (e) { return jsonResp({ ok: false, err: e.message }); }
      }
    }

    if (url.pathname.startsWith('/chess/') || url.pathname.match(/\.(js|css|png|jpg|ico)$/)) return env.ASSETS.fetch(request);
    return new Response(htmlContent, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    }
    };
