<section aria-labelledby="community-title" class="route-shell community-route">
  <div>
    <p class="route-kicker">8community</p>
    <h1 id="community-title">社区</h1>
    <p>这里保留社区作为默认首页入口；帖子详情和个人详情仍交给现有细节实现，提醒入口则补成真实路由，方便从社区直接继续进入 console/account 流程。</p>
  </div>

  <div class="community-route__actions" aria-label="社区快捷入口">
    <a href="/community/notifications">查看提醒</a>
    <a href="/console">打开个人面板</a>
  </div>
</section>

<style>
  .community-route {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .community-route__actions {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .community-route__actions a {
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.16em;
    padding: 0.85rem 1.1rem;
    text-transform: uppercase;
  }
</style>
