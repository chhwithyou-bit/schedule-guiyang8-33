import htmlContent from './index.html';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. 处理数据接口 (KV 存储)
    if (url.pathname === '/api/data') {
      if (request.method === 'OPTIONS') return this.handleCORS();
      if (request.method === 'GET') {
        const data = await env.SCHEDULE_KV.get('schedule_data');
        return new Response(data || JSON.stringify({ S: null, EV: null, SJ: null }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
      if (request.method === 'POST') {
        const body = await request.text();
        await env.SCHEDULE_KV.put('schedule_data', body);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // 2. 处理 Gemini 识别代理
    if (url.pathname === '/api/proxy-gemini' && request.method === 'POST') {
      if (request.method === 'OPTIONS') return this.handleCORS();
      const GEMINI_KEY = 'AIzaSyAx1iLyi7qIO9KLBMtc_1wey18Eaz1J9H0';
      const apiURL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;
      try {
        const response = await fetch(apiURL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: await request.text()
        });
        const data = await response.text();
        return new Response(data, {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
      }
    }

    // 3. 节点管理 API
    if (url.pathname === '/api/nodes') {
      if (request.method === 'OPTIONS') return this.handleCORS();

      // GET /api/nodes?pwd=xxx — 普通用户获取节点列表
      if (request.method === 'GET') {
        const pwd = url.searchParams.get('pwd');
        const userPwd = await env.SCHEDULE_KV.get('nodes_user_pwd');
        if (!userPwd || pwd !== userPwd) {
          return new Response(JSON.stringify({ ok: false, msg: '密码错误' }), {
            status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }
        const nodes = await env.SCHEDULE_KV.get('nodes_list');
        return new Response(nodes || '[]', {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      // POST /api/nodes — admin操作（提交订阅/删除节点/设置密码）
      if (request.method === 'POST') {
        const body = await request.json();
        const adminPwd = await env.SCHEDULE_KV.get('nodes_admin_pwd') || 'admin888';

        if (body.adminPwd !== adminPwd) {
          return new Response(JSON.stringify({ ok: false, msg: 'Admin密码错误' }), {
            status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }

        // 设置用户密码
        if (body.action === 'setUserPwd') {
          await env.SCHEDULE_KV.put('nodes_user_pwd', body.pwd);
          return new Response(JSON.stringify({ ok: true }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }

        // 设置admin用户名+密码
        if (body.action === 'setAdminPwd') {
          if (body.newUser) await env.SCHEDULE_KV.put('nodes_admin_user', body.newUser);
          if (body.newPwd)  await env.SCHEDULE_KV.put('nodes_admin_pwd',  body.newPwd);
          return new Response(JSON.stringify({ ok: true }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }

        // Admin 获取节点列表
        if (body.action === 'getNodes') {
          const nodes = JSON.parse(await env.SCHEDULE_KV.get('nodes_list') || '[]');
          return new Response(JSON.stringify({ ok: true, nodes }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }

        // 提交订阅链接，解析节点
        if (body.action === 'importSub') {
          try {
            const resp = await fetch(body.subUrl, { headers: { 'User-Agent': 'ClashForWindows' } });
            const text = await resp.text();
            // base64 decode
            let decoded = '';
            try { decoded = atob(text.trim()); } catch { decoded = text; }
            const lines = decoded.split('\n').map(l => l.trim()).filter(l =>
              l.startsWith('ss://') || l.startsWith('vmess://') ||
              l.startsWith('trojan://') || l.startsWith('vless://') ||
              l.startsWith('ssr://')
            );
            // 解析节点名称
            const nodes = lines.map(raw => {
              let name = '';
              try {
                if (raw.startsWith('vmess://')) {
                  const json = JSON.parse(atob(raw.slice(8)));
                  name = json.ps || json.add || 'vmess节点';
                } else if (raw.startsWith('ss://')) {
                  const part = raw.split('#');
                  name = part[1] ? decodeURIComponent(part[1]) : 'SS节点';
                } else if (raw.startsWith('trojan://') || raw.startsWith('vless://')) {
                  const part = raw.split('#');
                  name = part[1] ? decodeURIComponent(part[1]) : '节点';
                } else {
                  name = '节点';
                }
              } catch { name = '未知节点'; }
              return { name, raw };
            });
            const existing = JSON.parse(await env.SCHEDULE_KV.get('nodes_list') || '[]');
            const merged = [...existing, ...nodes];
            await env.SCHEDULE_KV.put('nodes_list', JSON.stringify(merged));
            return new Response(JSON.stringify({ ok: true, count: nodes.length, nodes }), {
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
          } catch (e) {
            return new Response(JSON.stringify({ ok: false, msg: e.message }), {
              status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
          }
        }

        // 删除节点
        if (body.action === 'deleteNodes') {
          const existing = JSON.parse(await env.SCHEDULE_KV.get('nodes_list') || '[]');
          const kept = existing.filter((_, i) => !body.indexes.includes(i));
          await env.SCHEDULE_KV.put('nodes_list', JSON.stringify(kept));
          return new Response(JSON.stringify({ ok: true }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }

        // 清空节点
        if (body.action === 'clearNodes') {
          await env.SCHEDULE_KV.put('nodes_list', '[]');
          return new Response(JSON.stringify({ ok: true }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }

        return new Response(JSON.stringify({ ok: false, msg: '未知操作' }), {
          status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // 4. /chess → 跳转到静态象棋页面
    if (url.pathname === '/chess' || url.pathname === '/chess/') {
      return Response.redirect(url.origin + '/chess/index.html', 302);
    }

    // 4. 静态资源（chess/img、chess/js、chess/css 等）→ 交给 Assets 处理
    if (url.pathname.startsWith('/chess/') || url.pathname.match(/\.(jpg|jpeg|png|gif|ico|svg|css|wav|mp3|woff|woff2|ttf)$/)) {
      return env.ASSETS.fetch(request);
    }

    // 5. 根路径 → 返回主页面
    return new Response(htmlContent, {
      headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
  },

  handleCORS() {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }
};
