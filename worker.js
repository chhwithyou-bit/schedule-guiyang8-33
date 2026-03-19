export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API: GET /api/data — read schedule from KV
    if (url.pathname === '/api/data' && request.method === 'GET') {
      const data = await env.SCHEDULE_KV.get('schedule_data');
      if (!data) {
        return new Response(JSON.stringify({ S: null, EV: null, SJ: null }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
      return new Response(data, {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // API: POST /api/data — save schedule to KV
    if (url.pathname === '/api/data' && request.method === 'POST') {
      const body = await request.text();
      // Validate JSON
      try { JSON.parse(body); } catch {
        return new Response('Invalid JSON', { status: 400 });
      }
      await env.SCHEDULE_KV.put('schedule_data', body);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    // Serve static assets (index.html etc.)
    return env.ASSETS.fetch(request);
  }
};
