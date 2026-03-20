import htmlContent from './index.html';
import billiardsContent from './billiards.html';

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
      
      const GEMINI_KEY = 'AIzaSyAx1iLyi7qIO9KLBMtc_1wey18Eaz1J9H0'; // <--- 填入你的 Key
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

    // 3. 返回台球游戏页面
    if (url.pathname === '/billiards.html' || url.pathname === '/billiards') {
      return new Response(billiardsContent, {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
      });
    }

    
if (url.pathname.match(/\.(jpg|jpeg|png|gif|ico)$/i)) {
      return new Response('Image Not Found', { status: 404 });
    }
    // 5. 返回 HTML 网页 (修复 1101 错误)
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

    // 拦截静态资源：如果请求的是图片等静态文件，直接返回 404，防止返回 HTML
    

    