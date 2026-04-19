<section class="route-shell" aria-label="消息台中枢">
  <p class="route-kicker">Console hub</p>
  <h1>消息、群组、网盘</h1>
  <p>这里先把原来堆在一个大面板里的入口拆成真实子路由，后续再逐步迁移具体交互。</p>

  <div class="console-grid">
    <a href="/console/chats">私聊与会话</a>
    <a href="/console/groups">群组与发现</a>
    <a href="/console/drive">网盘与媒体</a>
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
