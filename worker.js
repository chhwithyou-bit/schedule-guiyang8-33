import webAppWorker from './apps/web/.svelte-kit/cloudflare/_worker.js';
import apiApp from './apps/api/src/index.ts';

function isStaticAsset(pathname) {
  return (
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/_app/') ||
    pathname === '/favicon.ico' ||
    pathname === '/favicon-32.png' ||
    pathname === '/apple-touch-icon.png' ||
    pathname === '/IMG_1695.jpeg' ||
    pathname === '/IMG_1695.webp' ||
    pathname === '/bg.jpg' ||
    pathname.startsWith('/videos/')
  );
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api' || url.pathname === '/health' || url.pathname.startsWith('/api/')) {
      return apiApp.fetch(request, env, ctx);
    }

    if (isStaticAsset(url.pathname) && env.ASSETS?.fetch) {
      return env.ASSETS.fetch(request);
    }

    return webAppWorker.fetch(request, env, ctx);
  }
};
