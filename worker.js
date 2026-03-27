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
async function getGoogleAuthToken(env, forceRefresh = false) {
  // 1. 尝试从 KV 获取缓存的 Token (除非强制刷新)
  if (!forceRefresh) {
    const cached = await env.SCHEDULE_KV.get('gdrive_token_cache', { type: 'json' });
    if (cached && Date.now() < cached.expiresAt) {
      return cached.token;
    }
  }

  const { GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN } = env;
  if (!GDRIVE_CLIENT_ID || !GDRIVE_CLIENT_SECRET || !GDRIVE_REFRESH_TOKEN) {
    throw new Error('缺失 OAuth2 凭据 (Client ID, Secret, 或 Refresh Token)。请在 Cloudflare 后台设置环境变量。');
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
  if (!resp.ok) {
    if (data.error === 'invalid_grant') {
      throw new Error('Google Refresh Token 已过期或被撤销，请重新获取 Refresh Token。');
    }
    throw new Error(`OAuth2 刷新失败: ${data.error_description || data.error}`);
  }
  
  const accessToken = data.access_token;
  const expiresAt = Date.now() + (data.expires_in || 3600) * 1000 - 60000;

  // 2. 将新 Token 存入 KV
  await env.SCHEDULE_KV.put('gdrive_token_cache', JSON.stringify({
    token: accessToken,
    expiresAt
  }), { expirationTtl: Math.floor((data.expires_in || 3600) - 60) });

  return accessToken;
}

async function uploadToDrive(env, fileBuffer, fileName, mimeType, retry = true) {
  let token = await getGoogleAuthToken(env);
  const metadata = { name: fileName, parents: [env.GDRIVE_FOLDER_ID] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([fileBuffer], { type: mimeType }));
  
  let resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: form
  });

  // 如果返回 401 且允许重试，强制刷新 Token 再试一次
  if (resp.status === 401 && retry) {
    console.warn("Access Token 疑似失效，正在强制刷新...");
    token = await getGoogleAuthToken(env, true);
    resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: form
    });
  }

  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error ? data.error.message : 'Upload Failed');
  return data;
}

async function getFromDrive(env, fileId, retry = true) {
  let token = await getGoogleAuthToken(env);
  let resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (resp.status === 401 && retry) {
    token = await getGoogleAuthToken(env, true);
    resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
  }
  return resp;
}

async function sha256Hex(input) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input)))
  ).map(b => b.toString(16).padStart(2, '0')).join('');
}

function extractMetaTag(html, key, attr = 'property') {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`<meta[^>]+${attr}=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i');
  const reverseRegex = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${escaped}["'][^>]*>`, 'i');
  const match = html.match(regex) || html.match(reverseRegex);
  return match ? match[1].trim() : '';
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return '';
  return match[1].replace(/\s+/g, ' ').trim();
}

function cleanPreviewTitle(title, host) {
  const raw = String(title || '').trim();
  if (!raw) return '';
  if (host.includes('bilibili.com') || host === 'b23.tv') {
    return raw.replace(/[-_ ]*哔哩哔哩.*$/i, '').replace(/[-_ ]*bilibili.*$/i, '').trim();
  }
  return raw;
}

function isAllowedPreviewHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return ['b23.tv', 'bilibili.com', 'www.bilibili.com', 'm.bilibili.com', 'youtube.com', 'www.youtube.com', 'youtu.be'].includes(host);
}

// FINAL DEPLOY V4.3 - Optimized Storage & Auth
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return corsResp();

    if (url.pathname === '/api/data' || url.pathname === '/api/schedule') {
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

    if (url.pathname === '/api/music') {
      if (request.method === 'GET') {
        try {
          // 1. 优先尝试获取手动配置的歌单
          const playlistObj = await env.MUSIC_BUCKET.get('playlist.json');
          let list = [];
          if (playlistObj) {
            list = await playlistObj.json();
          }

          // 2. 如果手动配置为空，则自动扫描存储桶中的所有 MP3 文件
          if (!list || list.length === 0) {
            const listed = await env.MUSIC_BUCKET.list();
            list = listed.objects
              .filter(obj => obj.key.toLowerCase().endsWith('.mp3'))
              .map(obj => {
                // 将文件名去掉 .mp3 后缀作为歌名
                const name = obj.key.replace(/\.[^/.]+$/, "");
                return {
                  name: decodeURIComponent(name),
                  artist: 'R2 Drive',
                  // 使用您的自定义域名拼接链接
                  url: `https://thefallback.cc.cd/${obj.key}`
                };
              });
          }
          
          return jsonResp(list);
        } catch (e) { return jsonResp({ ok: false, msg: e.message }, 500); }
      }
      if (request.method === 'POST') {
        try {
          const body = await request.json();
          if (!(await verifyAdmin(env, body.adminUser, body.adminPass))) return jsonResp({ ok: false, msg: '认证失败' }, 401);
          if (body.action === 'setList') {
            await env.MUSIC_BUCKET.put('playlist.json', JSON.stringify(body.list));
            return jsonResp({ ok: true });
          }
          return jsonResp({ ok: false, msg: '未知操作' }, 400);
        } catch (e) { return jsonResp({ ok: false, msg: e.message }, 500); }
      }
    }

    if (url.pathname.startsWith('/api/community/')) {
      const getAuth = async () => {
        const auth = request.headers.get('Authorization') || '';
        if (!auth.startsWith('Bearer ')) return null;
        const raw = auth.slice(7);
        const sep = raw.indexOf(':');
        if (sep === -1) return null;
        const rawUser = raw.slice(0, sep);
        const p = raw.slice(sep + 1);
        let u = rawUser;
        try {
          u = decodeURIComponent(rawUser);
        } catch (e) {}
        const user = await env.COMMUNITY_DB.prepare("SELECT * FROM users WHERE username = ? AND password_hash = ?").bind(u, p).first();
        if (user && user.is_banned) return null;
        return user;
      };

      const awardXP = async (userId, amount) => {
        await env.COMMUNITY_DB.prepare("UPDATE users SET xp = xp + ?, level = CAST(((xp + ?) / 100) + 1 AS INTEGER) WHERE id = ?").bind(amount, amount, userId).run();
      };

      const addNotify = async (userId, type, fromUserId, targetId) => {
        if (userId === fromUserId) return;
        await env.COMMUNITY_DB.prepare("INSERT INTO notifications (id, user_id, type, from_user_id, target_id) VALUES (?, ?, ?, ?, ?)")
          .bind(crypto.randomUUID(), userId, type, fromUserId, targetId).run();
      };

      if (url.pathname === '/api/community/auth' && request.method === 'POST') {
        try {
          const { action, username, password } = await request.json();
          const passHash = await sha256Hex(password);
          if (action === 'register') {
            const id = crypto.randomUUID();
            try {
              await env.COMMUNITY_DB.prepare("INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)").bind(id, username, passHash).run();
              return jsonResp({ ok: true, user: { id, username, passHash, role: 'user', level: 1, xp: 0 } });
            } catch (err) {
              const msg = err && err.message ? String(err.message) : String(err);
              if (msg.includes('UNIQUE')) {
                return jsonResp({ ok: false, msg: '该用户名已被注册' });
              }
              return jsonResp({ ok: false, msg: '注册异常: ' + msg });
            }
          }
          if (action === 'login') {
            const user = await env.COMMUNITY_DB.prepare("SELECT * FROM users WHERE username = ? AND password_hash = ?").bind(username, passHash).first();
            if (!user) return jsonResp({ ok: false, msg: '用户名或密码错误' }, 401);
            if (user.is_banned) return jsonResp({ ok: false, msg: '账号已被封禁' }, 403);
            let role = user.role || 'user';
            let level = user.level || 1;
            let xp = user.xp || 0;
            return jsonResp({ ok: true, user: { id: user.id, username, passHash, role, level, xp, signature: user.signature, avatar_url: user.avatar_url, background_url: user.background_url } });
          }
        } catch (e) {
          return jsonResp({ ok: false, msg: '服务端错误: ' + e.message }, 500);
        }
      }

      if (url.pathname === '/api/community/link-preview' && request.method === 'GET') {
        try {
          const rawUrl = url.searchParams.get('url') || '';
          if (!rawUrl) return jsonResp({ ok: false, msg: '缺少链接' }, 400);
          const target = new URL(rawUrl);
          if (!['http:', 'https:'].includes(target.protocol)) return jsonResp({ ok: false, msg: '链接协议不支持' }, 400);
          if (!isAllowedPreviewHost(target.hostname)) return jsonResp({ ok: false, msg: '暂不支持该链接预览' }, 400);

          const resp = await fetch(target.toString(), {
            redirect: 'follow',
            headers: {
              'user-agent': 'Mozilla/5.0 (compatible; 8communityBot/1.0; +https://thefallback.cc.cd)',
              'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8'
            }
          });
          if (!resp.ok) return jsonResp({ ok: false, msg: '链接解析失败' }, 502);

          const finalUrl = resp.url || target.toString();
          const final = new URL(finalUrl);
          const html = await resp.text();
          const title = cleanPreviewTitle(
            extractMetaTag(html, 'og:title') || extractMetaTag(html, 'twitter:title', 'name') || extractTitle(html),
            final.hostname
          );
          const image = extractMetaTag(html, 'og:image') || extractMetaTag(html, 'twitter:image', 'name');
          if (!title) return jsonResp({ ok: false, msg: '未解析到标题' }, 404);

          return jsonResp({
            ok: true,
            preview: {
              url: finalUrl,
              title,
              image,
              host: final.hostname.replace(/^www\./, '')
            }
          });
        } catch (e) {
          return jsonResp({ ok: false, msg: '链接解析失败' }, 500);
        }
      }

      if (url.pathname === '/api/community/posts') {
        if (request.method === 'GET') {
          try {
            const viewer = await getAuth();
            const query = url.searchParams.get('q');
            const userId = url.searchParams.get('userId');
            const username = url.searchParams.get('username');
            let sql = `
              SELECT p.*, u.username, u.avatar_url, COALESCE(u.level, 1) as level, COALESCE(u.role, 'user') as role,
              (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
              (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
              (SELECT COUNT(*) FROM posts WHERE repost_id = p.id) as repost_count
              FROM posts p JOIN users u ON p.user_id = u.id 
            `;
            const params = [];
            const postId = url.searchParams.get('id');
            if (postId) {
              sql += " WHERE p.id = ? ";
              params.push(postId);
            } else if (query) {
              sql += " WHERE p.content LIKE ? OR p.content LIKE ? OR u.id LIKE ? ";
              params.push(`%${query}%`, `%#${query}%`, `%${query}%`);
            } else if (userId) {
              sql += " WHERE p.user_id = ? ";
              params.push(userId);
            } else if (username) {
              sql += " WHERE u.username = ? ";
              params.push(username);
            }
            sql += " ORDER BY p.created_at DESC LIMIT 100 ";
            const { results } = await env.COMMUNITY_DB.prepare(sql).bind(...params).all();

            const posts = results || [];
            posts.forEach(p => {
              try {
                const parsedMedia = JSON.parse(p.media_json || '[]');
                p.media_json = JSON.stringify(Array.isArray(parsedMedia) ? parsedMedia.filter(item => item && typeof item === 'object') : []);
              } catch (e) {
                p.media_json = '[]';
              }
            });
            if (posts.length > 0) {
              const ids = posts.map(p => p.id);
              const placeholders = ids.map(() => '?').join(',');
              // Fetch latest 3 comments for each post (sqlite doesn't have row_number easily, so we just fetch all and group in JS, limit 500 total comments to prevent memory bloat)
              const commQuery = "SELECT c.id, c.post_id, c.content, c.user_id, u.username FROM comments c JOIN users u ON c.user_id = u.id WHERE c.post_id IN (" + placeholders + ") ORDER BY c.created_at ASC LIMIT 500";
              const commResults = await env.COMMUNITY_DB.prepare(commQuery).bind(...ids).all();
              const comms = commResults.results || [];
              let likedIds = new Set();

              if (viewer) {
                const likedResults = await env.COMMUNITY_DB.prepare(
                  "SELECT post_id FROM likes WHERE user_id = ? AND post_id IN (" + placeholders + ")"
                ).bind(viewer.id, ...ids).all();
                likedIds = new Set((likedResults.results || []).map(row => row.post_id));
              }
              
              posts.forEach(p => {
                p.inline_comments = comms.filter(c => c.post_id === p.id).slice(-3); // Get last 3 comments
                p.viewer_liked = likedIds.has(p.id);
              });
            }

            return jsonResp({ ok: true, posts });
          } catch (e) { return jsonResp({ ok: false, msg: e.message }, 500); }
        }
        if (request.method === 'POST') {
          const user = await getAuth();
          if (!user) return jsonResp({ ok: false, msg: 'No Auth' }, 401);
          const { content, media, repost_id } = await request.json();
          const postId = crypto.randomUUID();
          await env.COMMUNITY_DB.prepare("INSERT INTO posts (id, user_id, content, media_json, type, repost_id) VALUES (?, ?, ?, ?, ?, ?)")
            .bind(postId, user.id, content || '', JSON.stringify(media || []), repost_id ? 'repost' : 'post', repost_id || null).run();
          
          await awardXP(user.id, 5);
          if (repost_id) {
            const original = await env.COMMUNITY_DB.prepare("SELECT user_id FROM posts WHERE id = ?").bind(repost_id).first();
            if (original) await addNotify(original.user_id, 'repost', user.id, postId);
          }
          return jsonResp({ ok: true });
        }
        if (request.method === 'DELETE') {
          const user = await getAuth();
          if (!user) return jsonResp({ ok: false, msg: 'No Auth' }, 401);
          const postId = url.searchParams.get('id');
          const post = await env.COMMUNITY_DB.prepare("SELECT user_id FROM posts WHERE id = ?").bind(postId).first();
          if (!post) return jsonResp({ ok: false, msg: 'Not found' }, 404);
          if (post.user_id !== user.id && user.role !== 'admin') return jsonResp({ ok: false, msg: 'Forbidden' }, 403);
          await env.COMMUNITY_DB.prepare("DELETE FROM posts WHERE id = ?").bind(postId).run();
          return jsonResp({ ok: true });
        }
      }

      if (url.pathname === '/api/community/like' && request.method === 'POST') {
        const user = await getAuth();
        if (!user) return jsonResp({ ok: false, msg: 'No Auth' }, 401);
        const { post_id } = await request.json();
        const post = await env.COMMUNITY_DB.prepare("SELECT user_id FROM posts WHERE id = ?").bind(post_id).first();
        if (!post) return jsonResp({ ok: false }, 404);
        try {
          await env.COMMUNITY_DB.prepare("INSERT INTO likes (post_id, user_id) VALUES (?, ?)").bind(post_id, user.id).run();
          await awardXP(user.id, 1);
          await addNotify(post.user_id, 'like', user.id, post_id);
          return jsonResp({ ok: true, action: 'liked' });
        } catch (e) {
          await env.COMMUNITY_DB.prepare("DELETE FROM likes WHERE post_id = ? AND user_id = ?").bind(post_id, user.id).run();
          return jsonResp({ ok: true, action: 'unliked' });
        }
      }

      if (url.pathname === '/api/community/follow' && request.method === 'POST') {
        const user = await getAuth();
        if (!user) return jsonResp({ ok: false, msg: 'No Auth' }, 401);
        const { following_id } = await request.json();
        try {
          await env.COMMUNITY_DB.prepare("INSERT INTO follows (follower_id, following_id) VALUES (?, ?)").bind(user.id, following_id).run();
          await addNotify(following_id, 'follow', user.id, null);
          return jsonResp({ ok: true, action: 'followed' });
        } catch (e) {
          await env.COMMUNITY_DB.prepare("DELETE FROM follows WHERE follower_id = ? AND following_id = ?").bind(user.id, following_id).run();
          return jsonResp({ ok: true, action: 'unfollowed' });
        }
      }

      if (url.pathname === '/api/community/notifications' && request.method === 'GET') {
        const user = await getAuth();
        if (!user) return jsonResp({ ok: false }, 401);
        const { results } = await env.COMMUNITY_DB.prepare(`
          SELECT n.*, u.id as user_id, u.username, u.avatar_url FROM notifications n 
          JOIN users u ON n.from_user_id = u.id 
          WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 50
        `).bind(user.id).all();
        return jsonResp({ ok: true, notifications: results || [] });
      }

      
      if (url.pathname === '/api/community/profile' && request.method === 'GET') {
        const viewer = await getAuth();
        const uid = url.searchParams.get('id');
        const uname = url.searchParams.get('username');
        let sql = "SELECT id, username, avatar_url, background_url, signature, level, xp, role FROM users WHERE ";
        let param = uid;
        if (uid) { sql += "id = ?"; } else { sql += "username = ?"; param = uname; }
        const user = await env.COMMUNITY_DB.prepare(sql).bind(param).first();
        if (!user) return jsonResp({ ok: false }, 404);
        
        const followers = await env.COMMUNITY_DB.prepare("SELECT COUNT(*) as c FROM follows WHERE following_id = ?").bind(user.id).first();
        const following = await env.COMMUNITY_DB.prepare("SELECT COUNT(*) as c FROM follows WHERE follower_id = ?").bind(user.id).first();
        user.followers_count = followers ? followers.c : 0;
        user.following_count = following ? following.c : 0;
        user.viewer_is_following = false;

        if (viewer && viewer.id !== user.id) {
          const relation = await env.COMMUNITY_DB.prepare(
            "SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?"
          ).bind(viewer.id, user.id).first();
          user.viewer_is_following = !!relation;
        }
        
        return jsonResp({ ok: true, user });
      }
      
      if (url.pathname === '/api/community/profile' && request.method === 'POST') {

        const user = await getAuth();
        if (!user) return jsonResp({ ok: false }, 401);
        const { signature, background_url, avatar_url } = await request.json();
        await env.COMMUNITY_DB.prepare("UPDATE users SET signature = ?, background_url = ?, avatar_url = ? WHERE id = ?")
          .bind(signature || user.signature, background_url || user.background_url, avatar_url || user.avatar_url, user.id).run();
        return jsonResp({ ok: true });
      }

      if (url.pathname === '/api/community/comments') {
        if (request.method === 'GET') {
          const postId = url.searchParams.get('postId');
          const { results } = await env.COMMUNITY_DB.prepare(`
            SELECT c.*, u.id as user_id, u.username, u.avatar_url, COALESCE(u.level, 1) as level FROM comments c 
            JOIN users u ON c.user_id = u.id 
            WHERE c.post_id = ? ORDER BY c.created_at ASC
          `).bind(postId).all();
          return jsonResp({ ok: true, comments: results || [] });
        }
        if (request.method === 'POST') {
          const user = await getAuth();
          if (!user) return jsonResp({ ok: false }, 401);
          const { post_id, content, parent_id } = await request.json();
          const commentId = crypto.randomUUID();
          await env.COMMUNITY_DB.prepare("INSERT INTO comments (id, post_id, user_id, parent_id, content) VALUES (?, ?, ?, ?, ?)")
            .bind(commentId, post_id, user.id, parent_id || null, content).run();
          await awardXP(user.id, 2);
          const post = await env.COMMUNITY_DB.prepare("SELECT user_id FROM posts WHERE id = ?").bind(post_id).first();
          if (post) await addNotify(post.user_id, 'comment', user.id, post_id);
          return jsonResp({ ok: true });
        }
      }

      if (url.pathname === '/api/community/report' && request.method === 'POST') {
        const user = await getAuth();
        if (!user) return jsonResp({ ok: false }, 401);
        const { target_type, target_id, reason } = await request.json();
        await env.COMMUNITY_DB.prepare("INSERT INTO reports (id, user_id, target_type, target_id, reason) VALUES (?, ?, ?, ?, ?)")
          .bind(crypto.randomUUID(), user.id, target_type, target_id, reason).run();
        return jsonResp({ ok: true });
      }

      if (url.pathname === '/api/community/admin/data' && request.method === 'GET') {
        const user = await getAuth();
        if (!user || user.role !== 'admin') return jsonResp({ ok: false }, 403);
        const reports = await env.COMMUNITY_DB.prepare("SELECT * FROM reports WHERE status = 'pending' ORDER BY created_at DESC").all();
        const users = await env.COMMUNITY_DB.prepare("SELECT id, username, role, level, xp, is_banned, created_at, avatar_url, password_hash FROM users ORDER BY created_at DESC").all();
        const announcementRaw = await env.SCHEDULE_KV.get('community_announcement');
        const announcement = announcementRaw ? JSON.parse(announcementRaw) : { content: '', updatedAt: null };
        return jsonResp({ ok: true, reports: reports.results || [], users: users.results || [], announcement });
      }

      if (url.pathname === '/api/community/announcement' && request.method === 'GET') {
        const announcementRaw = await env.SCHEDULE_KV.get('community_announcement');
        const announcement = announcementRaw ? JSON.parse(announcementRaw) : { content: '', updatedAt: null };
        return jsonResp({ ok: true, announcement });
      }

      
      if (url.pathname === '/api/community/admin/action' && request.method === 'POST') {
        const user = await getAuth();
        if (!user || user.role !== 'admin') return jsonResp({ ok: false }, 403);
        const { action, target_type, target_id, report_id, new_password, content } = await request.json();
        
        if (action === 'reset_password' && target_type === 'user') {
           const passHash = await sha256Hex(new_password);
           await env.COMMUNITY_DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(passHash, target_id).run();
           return jsonResp({ ok: true });
        }

        if (action === 'delete_item') {
          if (target_type === 'post') await env.COMMUNITY_DB.prepare("DELETE FROM posts WHERE id = ?").bind(target_id).run();
          if (target_type === 'comment') await env.COMMUNITY_DB.prepare("DELETE FROM comments WHERE id = ?").bind(target_id).run();
          if (report_id) await env.COMMUNITY_DB.prepare("UPDATE reports SET status = 'resolved' WHERE id = ?").bind(report_id).run();
        } else if (action === 'resolve_report') {
          await env.COMMUNITY_DB.prepare("UPDATE reports SET status = 'resolved' WHERE id = ?").bind(target_id).run();
        } else if (action === 'ban_user') {
          await env.COMMUNITY_DB.prepare("UPDATE users SET is_banned = 1 WHERE id = ?").bind(target_id).run();
        } else if (action === 'unban_user') {
          await env.COMMUNITY_DB.prepare("UPDATE users SET is_banned = 0 WHERE id = ?").bind(target_id).run();
        } else if (action === 'grant_admin' && target_type === 'user') {
          await env.COMMUNITY_DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(target_id).run();
        } else if (action === 'revoke_admin' && target_type === 'user') {
          if (target_id === user.id) return jsonResp({ ok: false, msg: '不能撤销自己的管理员权限' }, 400);
          await env.COMMUNITY_DB.prepare("UPDATE users SET role = 'user' WHERE id = ?").bind(target_id).run();
        } else if (action === 'set_announcement') {
          await env.SCHEDULE_KV.put('community_announcement', JSON.stringify({
            content: String(content || '').trim(),
            updatedAt: new Date().toISOString()
          }));
        }
        return jsonResp({ ok: true });
      }

      if (url.pathname === '/api/community/upload' && request.method === 'POST') {
        const user = await getAuth();
        if (!user) return jsonResp({ ok: false, msg: 'No Auth' }, 401);
        const buffer = await request.arrayBuffer();
        const contentType = request.headers.get('content-type') || 'image/jpeg';
        try {
          // 核心逻辑：确保 Drive 成功即发布成功
          const driveData = await uploadToDrive(env, buffer, `img_${Date.now()}`, contentType);
          const fileId = driveData.id;

          // R2 异步后台缓存
          if (env.COMMUNITY_R2) {
            ctx.waitUntil(
              env.COMMUNITY_R2.put(fileId, buffer, { 
                httpMetadata: { contentType },
                customMetadata: { source: 'gdrive', uploadedAt: new Date().toISOString() }
              }).catch(e => console.error("R2 Background Cache Error:", e))
            );
          }

          return jsonResp({ ok: true, fileId, url: `/api/community/media/${fileId}`, fromDrive: true });
        } catch (e) { 
          return jsonResp({ ok: false, msg: "Drive 发布失败: " + e.message }, 500); 
        }
      }

      if (url.pathname.startsWith('/api/community/media/')) {
        const fileId = url.pathname.split('/').pop();
        
        // 1. 优先读取 R2 缓存
        if (env.COMMUNITY_R2) {
          try {
            const cache = await env.COMMUNITY_R2.get(fileId);
            if (cache) {
              return new Response(cache.body, { 
                headers: { 
                  'Access-Control-Allow-Origin': '*', 
                  'Content-Type': cache.httpMetadata.contentType || 'image/jpeg',
                  'X-Cache': 'HIT-R2',
                  'Cache-Control': 'public, max-age=31536000'
                } 
              });
            }
          } catch (e) {}
        }

        // 2. 缓存未命中，从 Drive 读取
        try {
          const drive = await getFromDrive(env, fileId);
          if (!drive.ok) throw new Error("Drive file not found");
          const contentType = drive.headers.get('content-type') || 'image/jpeg';
          const buf = await drive.arrayBuffer();

          // 3. 异步回填 R2 缓存
          if (env.COMMUNITY_R2) {
            ctx.waitUntil(
              env.COMMUNITY_R2.put(fileId, buf, { httpMetadata: { contentType } })
                .catch(e => console.error("R2 Backfill Error:", e))
            );
          }

          return new Response(buf, { 
            headers: { 
              'Access-Control-Allow-Origin': '*', 
              'Content-Type': contentType, 
              'X-Cache': 'MISS-GDrive',
              'Cache-Control': 'public, max-age=31536000'
            } 
          });
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
