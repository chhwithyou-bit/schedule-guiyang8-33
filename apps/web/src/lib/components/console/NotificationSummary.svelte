<script lang="ts" context="module">
  export type NotificationSummaryItem = {
    id: string;
    type: string;
    username?: string | null;
    created_at?: string | null;
  };
</script>

<script lang="ts">
  export let item: NotificationSummaryItem;

  function formatDate(value?: string | null) {
    if (!value) return '';
    try {
      return new Date(value).toLocaleString('zh-CN');
    } catch {
      return value;
    }
  }

  function formatNotification(type: string) {
    const map: Record<string, string> = {
      like: '赞了你的帖子',
      follow: '关注了你',
      repost: '转发了你的动态',
      comment: '评论了你的帖子',
      message: '给你发来一条消息'
    };
    return map[type] || type;
  }
</script>

<article class="notification-card">
  <div class="notification-card__head">
    <p class="notification-card__text">{item.username || '系统'} {formatNotification(item.type)}</p>
    <p class="notification-card__time">{formatDate(item.created_at)}</p>
  </div>
</article>

<style>
  .notification-card {
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 1.5rem;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(var(--color-bg-rgb, 12 18 28), 0.14)),
      rgba(var(--color-bg-rgb, 12 18 28), 0.08);
    box-shadow:
      0 18px 42px rgba(var(--shadow-rgb, 0 0 0), 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.12);
    padding: 1rem;
  }

  .notification-card__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .notification-card__text {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 900;
  }

  .notification-card__time {
    margin: 0;
    font-size: 0.65rem;
    font-weight: 900;
    letter-spacing: 0.18em;
    opacity: 0.5;
    text-transform: uppercase;
    white-space: nowrap;
  }

  @media (max-width: 640px) {
    .notification-card__head {
      flex-direction: column;
      align-items: flex-start;
    }

    .notification-card__time {
      white-space: normal;
    }
  }
</style>
