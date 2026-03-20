import htmlContent from './index.html';
import chessContent from './chess.html';

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

    // 2. 处理 Gemini 识别代理 (免费识别)
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

    // 3. 返回象棋游戏页面
    if (url.pathname === '/chess.html' || url.pathname === '/chess') {
      return new Response(chessContent, {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
      });
    }

    // 4. 拦截静态资源请求，返回 404
    if (url.pathname.match(/\.(jpg|jpeg|png|gif|ico|svg|css|js|woff|woff2|ttf)$/)) {
      return new Response('Not Found', { status: 404 });
    }

    // 5. 返回主 HTML 网页
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
