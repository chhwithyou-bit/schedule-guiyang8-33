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
              return { name, artist: '', url: R2_BASE + '/' + obj.key };
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

    // ── 5. 象棋页面跳转 ────────────────────────────────────
    if (url.pathname === '/chess' || url.pathname === '/chess/') {
      return Response.redirect(url.origin + '/chess/index.html', 302);
    }

    // ── 5. 静态资源 ─────────────────────────────────────────
    if (url.pathname.startsWith('/chess/') || url.pathname.match(/\.(jpg|jpeg|png|gif|ico|svg|css|wav|mp3|woff|woff2|ttf)$/)) {
      return env.ASSETS.fetch(request);
    }

    // ── 6. 主页面 ───────────────────────────────────────────
    return new Response(htmlContent, {
      headers: { 'Content-Type': 'text/html;charset=UTF-8' },
    });
  },
};
