<section class="route-shell" aria-label="消息台中枢">
  <p class="route-kicker">Console hub</p>
  <h1>个人面板、消息、群组、网盘、提醒</h1>
  <p>这里把原来挤在一个大面板里的入口整理成真实子路由，提醒也能从 console/account 直接跳到独立页面。</p>

  <div class="console-grid">
    <a href="/console" aria-current="page">个人面板</a>
    <a href="/console/chats">私聊与会话</a>
    <a href="/console/groups">群组与发现</a>
    <a href="/console/drive">网盘与媒体</a>
    <a href="/community/notifications">互动提醒</a>
  </div>
</section>

<style>
  .console-grid {
    margin-top: 1.25rem;
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  }

  .console-grid a {
    display: block;
    padding: 1rem;
    border-radius: 1.25rem;
    border: 1px solid rgba(255,255,255,.12);
    background: rgba(255,255,255,.06);
  }
</style>
