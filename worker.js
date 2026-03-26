import htmlContent from './index.html';

// 默认 Admin 凭据（首次部署前请通过 KV 设置）
const DEFAULT_ADMIN_USER = 'admin';
const DEFAULT_ADMIN_PASS = 'admin888';

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function corsResp() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

async function verifyAdmin(env, username, password) {
  const storedUser = await env.SCHEDULE_KV.get('nodes_admin_user') || DEFAULT_ADMIN_USER;
  const storedPass = await env.SCHEDULE_KV.get('nodes_admin_pass') || DEFAULT_ADMIN_PASS;
  return username === storedUser && password === storedPass;
}

function parseNodes(rawText) {
  let decoded = rawText.trim();
  // 尝试 base64 解码
  try {
    const b64 = atob(decoded);
    if (b64.includes('://')) decoded = b64;
  } catch {}

  return decoded.split('\n')
    .map(l => l.trim())
    .filter(l =>
      l.startsWith('ss://') || l.startsWith('vmess://') ||
      l.startsWith('trojan://') || l.startsWith('vless://') ||
      l.startsWith('ssr://')
    )
    .map(raw => {
      let name = '未知节点';
      try {
        if (raw.startsWith('vmess://')) {
          const json = JSON.parse(atob(raw.slice(8)));
          name = json.ps || json.add || 'vmess节点';
        } else {
          const hashPart = raw.split('#')[1];
          if (hashPart) name = decodeURIComponent(hashPart.split('\r')[0]);
          else name = raw.split('://')[0].toUpperCase() + '节点';
        }
      } catch {}
      return { name: name.trim(), raw };
    });
}

// ── Google Drive API Helpers ────────────────────────────────
async function getGoogleAuthToken(env) {
  let json;
  try {
    json = JSON.parse(env.GDRIVE_JSON);
  } catch (e) {
    throw new Error('GDRIVE_JSON 格式错误，请确保在 Cloudflare 设置的是完整的 JSON 文本');
  }

  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: json.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const header = { alg: 'RS256', typ: 'JWT' };
  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '');
  const encodedClaim = btoa(JSON.stringify(claim)).replace(/=/g, '');
  const signBase = `${encodedHeader}.${encodedClaim}`;

  const pem = json.private_key.replace(/\\n/g, '\n');
  const binaryKey = Uint8Array.from(atob(pem.split('-----')[2].replace(/\s/g, '')), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );

  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signBase));
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const jwt = `${signBase}.${encodedSignature}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`谷歌拒绝了认证请求 (HTTP ${resp.status})。返回内容: ${text.slice(0, 100)}`);
  }

  try {
    const data = JSON.parse(text);
    return data.access_token;
  } catch (e) {
    throw new Error(`解析 Token 失败。返回内容不是 JSON: ${text.slice(0, 100)}`);
  }
}

async function uploadToDrive(env, fileBuffer, fileName, mimeType) {
  const token = await getGoogleAuthToken(env);
  const metadata = {
    name: fileName,
    parents: [env.GDRIVE_FOLDER_ID]
  };

  const form = new FormData();
  // 关键：某些环境下 Blob 需要明确指定类型
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([fileBuffer], { type: mimeType }));

  // 增加 supportsAllDrives=true 兼容团队盘
  const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: form
  });

  const data = await resp.json();
  if (!resp.ok) {
    // 提取最核心的错误消息，避免 JSON 太长
    let errMsg = "未知错误";
    if (data.error && data.error.message) {
      errMsg = data.error.message;
    } else if (data.message) {
      errMsg = data.message;
    } else {
      errMsg = JSON.stringify(data).slice(0, 50);
    }
    throw new Error(errMsg.slice(0, 100)); 
  }
  return data;
}

async function getFromDrive(env, fileId) {
  const token = await getGoogleAuthToken(env);
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return resp;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ── CORS preflight ──────────────────────────────────────
    if (request.method === 'OPTIONS') return corsResp();

    // ── 1. 课程表数据 ───────────────────────────────────────
    if (url.pathname === '/api/data') {
      if (request.method === 'GET') {
        const data = await env.SCHEDULE_KV.get('schedule_data');
        return new Response(data || JSON.stringify({ S: null, EV: null, SJ: null }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
      if (request.method === 'POST') {
        const body = await request.text();
        await env.SCHEDULE_KV.put('schedule_data', body);
        return jsonResp({ ok: true });
      }
    }

    // ── 2. Gemini 代理 ──────────────────────────────────────
    if (url.pathname === '/api/proxy-gemini' && request.method === 'POST') {
      const GEMINI_KEY = 'AIzaSyAx1iLyi7qIO9KLBMtc_1wey18Eaz1J9H0';
      const apiURL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;
      try {
        const resp = await fetch(apiURL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: await request.text(),
        });
        return new Response(await resp.text(), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      } catch (e) {
        return jsonResp({ error: e.message }, 500);
      }
    }

    // ── 3. 节点 API ─────────────────────────────────────────
    if (url.pathname === '/api/nodes') {

      // ── 3a. 普通用户：GET /api/nodes?pwd=xxx ──
      if (request.method === 'GET') {
        const pwd = url.searchParams.get('pwd') || '';
        const userPwd = await env.SCHEDULE_KV.get('nodes_user_pwd');
        if (!userPwd || pwd !== userPwd) {
          return jsonResp({ ok: false, msg: '密码错误' }, 401);
        }
        const nodes = await env.SCHEDULE_KV.get('nodes_list');
        return new Response(nodes || '[]', {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      // ── 3b. Admin：POST /api/nodes ──
      if (request.method === 'POST') {
        let body;
        try { body = await request.json(); }
        catch { return jsonResp({ ok: false, msg: '请求格式错误' }, 400); }

        const { action, adminUser, adminPass } = body;

        // 验证 admin 身份
        if (!(await verifyAdmin(env, adminUser, adminPass))) {
          return jsonResp({ ok: false, msg: '用户名或密码错误' }, 401);
        }

        // ── 获取节点列表 ──
        if (action === 'getNodes') {
          const nodes = JSON.parse(await env.SCHEDULE_KV.get('nodes_list') || '[]');
          return jsonResp({ ok: true, nodes });
        }

        // ── 导入订阅链接 ──
        if (action === 'importSub') {
          try {
            const resp = await fetch(body.subUrl, {
              headers: { 'User-Agent': 'Shadowrocket/2177 CFNetwork/1492.0.1 Darwin/23.3.0' },
            });
            if (!resp.ok) throw new Error(`订阅请求失败: ${resp.status}`);
            const text = await resp.text();
            const newNodes = parseNodes(text);
            if (!newNodes.length) return jsonResp({ ok: false, msg: '未解析到任何节点，请确认订阅链接有效' });

            const existing = JSON.parse(await env.SCHEDULE_KV.get('nodes_list') || '[]');
            const merged = [...existing, ...newNodes];
            await env.SCHEDULE_KV.put('nodes_list', JSON.stringify(merged));
            return jsonResp({ ok: true, count: newNodes.length, nodes: newNodes });
          } catch (e) {
            return jsonResp({ ok: false, msg: e.message }, 500);
          }
        }

        // ── 删除选中节点 ──
        if (action === 'deleteNodes') {
          const idxSet = new Set(body.indexes || []);
          const existing = JSON.parse(await env.SCHEDULE_KV.get('nodes_list') || '[]');
          const kept = existing.filter((_, i) => !idxSet.has(i));
          await env.SCHEDULE_KV.put('nodes_list', JSON.stringify(kept));
          return jsonResp({ ok: true, remaining: kept.length });
        }

        // ── 清空全部节点 ──
        if (action === 'clearNodes') {
          await env.SCHEDULE_KV.put('nodes_list', '[]');
          return jsonResp({ ok: true });
        }

        // ── 修改用户访问密码 ──
        if (action === 'setUserPwd') {
          if (!body.pwd || body.pwd.length < 4) return jsonResp({ ok: false, msg: '密码至少4位' });
          await env.SCHEDULE_KV.put('nodes_user_pwd', body.pwd);
          return jsonResp({ ok: true });
        }

        // ── 修改 Admin 凭据 ──
        if (action === 'setAdminCred') {
          if (!body.newUser || !body.newPass || body.newPass.length < 6) {
            return jsonResp({ ok: false, msg: '用户名不能为空，密码至少6位' });
          }
          await env.SCHEDULE_KV.put('nodes_admin_user', body.newUser);
          await env.SCHEDULE_KV.put('nodes_admin_pass', body.newPass);
          return jsonResp({ ok: true });
        }

        return jsonResp({ ok: false, msg: '未知操作' }, 400);
      }
    }

    // ── 4. 音乐歌单 API ────────────────────────────────────
    if (url.pathname === '/api/music') {
      const R2_BASE = 'https://thefallback.cc.cd';

      if (request.method === 'GET') {
        // 读 KV 手动歌单
        let kvList = JSON.parse(await env.SCHEDULE_KV.get('music_playlist') || '[]');

        // 扫描 R2 bucket，自动发现所有音频文件
        let r2List = [];
        try {
          const listed = await env.MUSIC_BUCKET.list();
          r2List = listed.objects
            .filter(obj => obj.key.match(/\.(mp3|flac|ogg|m4a|wav|aac)$/i))
            .map(obj => {
              const filename = obj.key.split('/').pop();
              const name = decodeURIComponent(filename.replace(/\.[^.]+$/, ''));
              return { name, artist: '', url: R2_BASE + '/' + encodeURIComponent(obj.key) };
            });
        } catch (e) {
          // MUSIC_BUCKET 未绑定时静默忽略
        }

        // 合并：KV 手动歌单优先，R2 自动发现去重补充
        const kvUrls = new Set(kvList.map(t => t.url));
        const merged = [
          ...kvList,
          ...r2List.filter(t => !kvUrls.has(t.url)),
        ];

        return jsonResp({ ok: true, list: merged });
      }
      if (request.method === 'POST') {
        let body;
        try { body = await request.json(); } catch { return jsonResp({ ok: false, msg: '格式错误' }, 400); }
        if (!(await verifyAdmin(env, body.adminUser, body.adminPass))) {
          return jsonResp({ ok: false, msg: '无权限' }, 401);
        }
        if (body.action === 'setList') {
          await env.SCHEDULE_KV.put('music_playlist', JSON.stringify(body.list || []));
          return jsonResp({ ok: true });
        }
        return jsonResp({ ok: false, msg: '未知操作' }, 400);
      }
    }

    // ── 5. Community (Twitter-like) API ───────────────────────
    if (url.pathname.startsWith('/api/community/')) {
      // Helper for current user from Authorization header (simple version)
      // Header format: "Bearer <username>:<password_hash>" or just a simple token
      const getAuth = async () => {
        const auth = request.headers.get('Authorization') || '';
        if (!auth.startsWith('Bearer ')) return null;
        const [username, passHash] = auth.slice(7).split(':');
        if (!username || !passHash) return null;
        const user = await env.COMMUNITY_DB.prepare("SELECT * FROM users WHERE username = ? AND password_hash = ?").bind(username, passHash).first();
        return user;
      };

      // ── 5a. Auth: Register/Login ──
      if (url.pathname === '/api/community/auth' && request.method === 'POST') {
        const { action, username, password } = await request.json();
        if (!username || !password) return jsonResp({ ok: false, msg: '参数不全' }, 400);

        // Simple hash (for prototype)
        const passHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))))
          .map(b => b.toString(16).padStart(2, '0')).join('');

        if (action === 'register') {
          try {
            const id = crypto.randomUUID();
            await env.COMMUNITY_DB.prepare("INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)")
              .bind(id, username, passHash).run();
            return jsonResp({ ok: true, user: { id, username, passHash } });
          } catch (e) {
            return jsonResp({ ok: false, msg: '注册失败（可能用户已存在）' }, 400);
          }
        }
        if (action === 'login') {
          const user = await env.COMMUNITY_DB.prepare("SELECT * FROM users WHERE username = ? AND password_hash = ?")
            .bind(username, passHash).first();
          if (!user) return jsonResp({ ok: false, msg: '用户或密码错误' }, 401);
          return jsonResp({ ok: true, user: { id: user.id, username: user.username, passHash: user.password_hash } });
        }
      }

      // ── 5b. Posts: Fetch ──
      if (url.pathname === '/api/community/posts' && request.method === 'GET') {
        const posts = await env.COMMUNITY_DB.prepare(`
          SELECT p.*, u.username, u.avatar_url,
          (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as like_count,
          (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count
          FROM posts p
          JOIN users u ON p.user_id = u.id
          ORDER BY p.created_at DESC LIMIT 100
        `).all();
        return jsonResp({ ok: true, posts: posts.results });
      }

      // ── 5c. Posts: Create ──
      if (url.pathname === '/api/community/posts' && request.method === 'POST') {
        const user = await getAuth();
        if (!user) return jsonResp({ ok: false, msg: '未授权' }, 401);

        const { content, media } = await request.json();
        const id = crypto.randomUUID();
        await env.COMMUNITY_DB.prepare("INSERT INTO posts (id, user_id, content, media_json) VALUES (?, ?, ?, ?)")
          .bind(id, user.id, content || '', JSON.stringify(media || [])).run();
        return jsonResp({ ok: true, post_id: id });
      }

      // ── 5d. Comments: Fetch/Create ──
      if (url.pathname === '/api/community/comments') {
        if (request.method === 'GET') {
          const postId = url.searchParams.get('post_id');
          if (!postId) return jsonResp({ ok: false, msg: 'Missing post_id' }, 400);
          const comments = await env.COMMUNITY_DB.prepare(`
            SELECT c.*, u.username, u.avatar_url
            FROM comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.post_id = ?
            ORDER BY c.created_at ASC
          `).bind(postId).all();
          return jsonResp({ ok: true, comments: comments.results });
        }
        if (request.method === 'POST') {
          const user = await getAuth();
          if (!user) return jsonResp({ ok: false, msg: '未授权' }, 401);
          const { post_id, content, parent_id } = await request.json();
          const id = crypto.randomUUID();
          await env.COMMUNITY_DB.prepare("INSERT INTO comments (id, post_id, user_id, parent_id, content) VALUES (?, ?, ?, ?, ?)")
            .bind(id, post_id, user.id, parent_id || null, content).run();
          return jsonResp({ ok: true, comment_id: id });
        }
      }

      // ── 5e. Likes: Toggle ──
      if (url.pathname === '/api/community/like' && request.method === 'POST') {
        const user = await getAuth();
        if (!user) return jsonResp({ ok: false, msg: '未授权' }, 401);
        const { post_id } = await request.json();
        // Simple toggle: try insert, if exists delete
        try {
          await env.COMMUNITY_DB.prepare("INSERT INTO likes (post_id, user_id) VALUES (?, ?)")
            .bind(post_id, user.id).run();
          return jsonResp({ ok: true, liked: true });
        } catch (e) {
          await env.COMMUNITY_DB.prepare("DELETE FROM likes WHERE post_id = ? AND user_id = ?")
            .bind(post_id, user.id).run();
          return jsonResp({ ok: true, liked: false });
        }
      }

      // ── 5f. Upload (GDrive as main, R2 as cache) ──
      if (url.pathname === '/api/community/upload' && request.method === 'POST') {
        const user = await getAuth();
        if (!user) return jsonResp({ ok: false, msg: '未授权' }, 401);

        const contentType = request.headers.get('content-type') || 'image/jpeg';
        const buffer = await request.arrayBuffer();
        const fileName = `comm_${crypto.randomUUID()}`;

        try {
          // 1. 上传到 Google Drive
          let driveData;
          try {
            driveData = await uploadToDrive(env, buffer, fileName, contentType);
          } catch (driveErr) {
            throw new Error(`Google Drive 上传阶段失败: ${driveErr.message}`);
          }
          
          const fileId = driveData.id;
          if (!fileId) {
            throw new Error(`Google Drive 返回数据中缺失 ID: ${JSON.stringify(driveData)}`);
          }

          // 2. 尝试写入 R2 缓存 (非阻塞，失败不报错)
          if (env.COMMUNITY_R2) {
            try {
              await env.COMMUNITY_R2.put(fileId, buffer, {
                httpMetadata: { contentType },
                customMetadata: { 'source': 'gdrive', 'original_name': fileName }
              });
            } catch (r2Error) {
              console.error('R2 Cache Write Failed:', r2Error.message);
              // R2 失败不抛出错误，继续返回成功，因为 GDrive 已经存好了
            }
          }

          // 使用自定义域名
          const r2Url = `https://media.thefallback.cc.cd/${fileId}`;
          return jsonResp({ ok: true, fileId: fileId, url: r2Url });
        } catch (e) {
          // 去掉多余前缀，让消息更精炼
          return jsonResp({ ok: false, msg: `错误: ${e.message}` }, 500);
        }
      }

      // ── 5g. Serve Media (R2 Cache -> GDrive Fallback) ──
      if (url.pathname.startsWith('/api/community/media/') && request.method === 'GET') {
        const fileId = url.pathname.split('/').pop();
        if (!fileId) return new Response('Missing fileId', { status: 400 });
        
        try {
          // 1. 尝试从 R2 获取
          if (env.COMMUNITY_R2) {
            try {
              const cacheObj = await env.COMMUNITY_R2.get(fileId);
              if (cacheObj) {
                const headers = new Headers();
                cacheObj.writeHttpMetadata(headers);
                headers.set('X-Cache', 'HIT-R2');
                return new Response(cacheObj.body, { headers });
              }
            } catch (r2ReadError) {
              console.error('R2 Cache Read Failed:', r2ReadError.message);
            }
          }

          // 2. R2 没命中或失败，从 Google Drive 获取
          const driveResp = await getFromDrive(env, fileId);
          if (!driveResp.ok) {
            const errText = await driveResp.text();
            return new Response(`Drive Error: ${errText}`, { status: driveResp.status });
          }

          const buffer = await driveResp.arrayBuffer();
          const contentType = driveResp.headers.get('content-type') || 'image/jpeg';

          // 3. 异步尝试写入 R2 缓存 (非阻塞)
          if (env.COMMUNITY_R2) {
            try {
              await env.COMMUNITY_R2.put(fileId, buffer, {
                httpMetadata: { contentType }
              });
            } catch (e) {}
          }

          const headers = new Headers();
          headers.set('Content-Type', contentType);
          headers.set('X-Cache', 'MISS-GDrive');
          return new Response(buffer, { headers });
        } catch (e) {
          return new Response(`Media Serve Error: ${e.message}`, { status: 500 });
        }
      }

      // ── 5h. Test Google Drive Connection ──
      if (url.pathname === '/api/community/test-drive' && request.method === 'GET') {
        const debug = { hasGdriveJson: !!env.GDRIVE_JSON, folderId: env.GDRIVE_FOLDER_ID || "MISSING" };
        try {
          const token = await getGoogleAuthToken(env);
          const testUrl = `https://www.googleapis.com/drive/v3/files/${env.GDRIVE_FOLDER_ID}?fields=id,name&supportsAllDrives=true`;
          const resp = await fetch(testUrl, { headers: { 'Authorization': `Bearer ${token}` } });
          const data = await resp.json();
          if (!resp.ok) return jsonResp({ ok: false, msg: '读测试失败', error: data }, resp.status);

          let writeTest = "正在测试...";
          const uploadResp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'write_test.txt', parents: [env.GDRIVE_FOLDER_ID] })
          });
          const uploadData = await uploadResp.json();
          if (uploadResp.ok) {
            writeTest = "✅ 写入正常";
            await fetch(`https://www.googleapis.com/drive/v3/files/${uploadData.id}?supportsAllDrives=true`, {
              method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }
            });
          } else {
            writeTest = `❌ 写入失败: ${uploadData.error ? uploadData.error.message : '未知'}`;
          }
          return jsonResp({ ok: true, msg: '诊断完成', folderName: data.name, writeTest });
        } catch (e) {
          return jsonResp({ ok: false, msg: '诊断报错', error: e.message }, 500);
        }
      }

      return jsonResp({ ok: false, msg: 'Community Endpoint Not Found' }, 404);
    }

    // ── 6. 象棋页面跳转 ────────────────────────────────────
    if (url.pathname === '/chess' || url.pathname === '/chess/' || url.pathname === '/chess/index.html') {
      return Response.redirect(url.origin + '/?page=xiangqi', 302);
    }

    // ── 5. 静态资源 ─────────────────────────────────────────
    if (url.pathname.startsWith('/chess/') || url.pathname.match(/\.(js|jpg|jpeg|png|gif|ico|svg|css|wav|mp3|woff|woff2|ttf)$/)) {
      return env.ASSETS.fetch(request);
    }

    // ── 6. 主页面 ───────────────────────────────────────────
    return new Response(htmlContent, {
      headers: { 'Content-Type': 'text/html;charset=UTF-8' },
    });
  },
};
           }, resp.status);
          }
        } catch (e) {
          return jsonResp({ ok: false, msg: '❌ 运行出错', error: e.message, debug }, 500);
        }
      }

      return jsonResp({ ok: false, msg: 'Community Endpoint Not Found' }, 404);
    }

    // ── 6. 象棋页面跳转 ────────────────────────────────────
    if (url.pathname === '/chess' || url.pathname === '/chess/' || url.pathname === '/chess/index.html') {
      return Response.redirect(url.origin + '/?page=xiangqi', 302);
    }

    // ── 5. 静态资源 ─────────────────────────────────────────
    if (url.pathname.startsWith('/chess/') || url.pathname.match(/\.(js|jpg|jpeg|png|gif|ico|svg|css|wav|mp3|woff|woff2|ttf)$/)) {
      return env.ASSETS.fetch(request);
    }

    // ── 6. 主页面 ───────────────────────────────────────────
    return new Response(htmlContent, {
      headers: { 'Content-Type': 'text/html;charset=UTF-8' },
    });
  },
};
// Force redeploy: Thu Mar 26 00:37:28 UTC 2026
