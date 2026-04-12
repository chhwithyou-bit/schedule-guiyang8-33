<script lang="ts">
  import { profileHref, postHref } from '$lib/state/communityRouteState';

  type CommunityNotificationItem = {
    id: string;
    type: string;
    username: string;
    from_user_id: string;
    target_id?: string | null;
    created_at: string;
    avatar_url?: string | null;
    role?: string;
    is_read?: boolean;
  };

  export let notifications: CommunityNotificationItem[] = [];
  export let unread = 0;
  export let loading = false;
  export let feedback = '';

  function formatDate(value: string) {
    if (!value) return '';
    return new Date(value).toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function notificationLabel(item: CommunityNotificationItem) {
    if (item.type === 'like') return '赞了你的内容';
    if (item.type === 'comment') return '评论了你的帖子';
    if (item.type === 'repost') return '转发了你的帖子';
    if (item.type === 'follow') return '关注了你';
    return '和你有新的互动';
  }

  function notificationHref(item: CommunityNotificationItem) {
    if (item.target_id && (item.type === 'like' || item.type === 'comment' || item.type === 'repost')) {
      return postHref(item.target_id);
    }
    if (item.from_user_id) {
      return profileHref(item.from_user_id);
    }
    return '/community/notifications';
  }
</script>

<section class="route-shell notification-summary" aria-label="互动提醒摘要">
  <div class="notification-summary__head">
    <div>
      <p class="route-kicker">互动提醒</p>
      <h2>{loading ? '正在同步提醒…' : unread > 0 ? `有 ${unread} 条未读互动` : '最近没有新的提醒'}</h2>
    </div>
    <a href="/community/notifications">查看全部</a>
  </div>

  {#if feedback}
    <p class="notification-summary__feedback">{feedback}</p>
  {/if}

  {#if loading}
    <div class="notification-summary__loading" aria-hidden="true">
      {#each Array(3) as _}
        <div class="notification-summary__skeleton"></div>
      {/each}
    </div>
  {:else if notifications.length > 0}
    <div class="notification-summary__list">
      {#each notifications as item (item.id)}
        <a class:unread={Boolean(!item.is_read)} class="notification-item" href={notificationHref(item)}>
          <div class="notification-item__avatar" aria-hidden="true">
            {#if item.avatar_url}
              <img src={item.avatar_url} alt="" />
            {:else}
              <span>{item.username?.slice(0, 1).toUpperCase() || '?'}</span>
            {/if}
          </div>

          <div class="notification-item__body">
            <strong>{item.username}</strong>
            <p>{notificationLabel(item)}</p>
          </div>

          <span class="notification-item__time">{formatDate(item.created_at)}</span>
        </a>
      {/each}
    </div>
  {:else}
    <p class="notification-summary__empty">等有人点赞、评论、转发或关注你时，这里就会出现提醒。</p>
  {/if}
</section>

<style>
  .notification-summary {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .notification-summary__head,
  .notification-item {
    display: flex;
    gap: 0.9rem;
    align-items: center;
    justify-content: space-between;
  }

  .notification-summary__head h2 {
    margin: 0.4rem 0 0;
    font-size: clamp(1.3rem, 2.5vw, 1.8rem);
    font-weight: 900;
    letter-spacing: -0.03em;
  }

  .notification-summary__head > a {
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.07);
    font-size: 0.75rem;
    font-weight: 900;
    letter-spacing: 0.16em;
    min-height: 2.7rem;
    padding: 0.75rem 1rem;
    text-transform: uppercase;
  }

  .notification-summary__list,
  .notification-summary__loading {
    display: grid;
    gap: 0.75rem;
  }

  .notification-item {
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 1.4rem;
    background: rgba(255, 255, 255, 0.05);
    padding: 0.85rem 1rem;
  }

  .notification-item.unread {
    border-color: rgba(var(--glow-primary-rgb), 0.28);
    background: rgba(var(--glow-primary-rgb), 0.1);
  }

  .notification-item__avatar {
    width: 2.8rem;
    height: 2.8rem;
    flex-shrink: 0;
    overflow: hidden;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.08);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 900;
    color: var(--color-primary);
  }

  .notification-item__avatar img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .notification-item__body {
    min-width: 0;
    flex: 1;
  }

  .notification-item__body strong,
  .notification-item__body p,
  .notification-item__time,
  .notification-summary__feedback,
  .notification-summary__empty {
    margin: 0;
  }

  .notification-item__body p,
  .notification-item__time,
  .notification-summary__feedback,
  .notification-summary__empty {
    opacity: 0.68;
  }

  .notification-item__time {
    font-size: 0.8rem;
    white-space: nowrap;
  }

  .notification-summary__skeleton {
    min-height: 4.6rem;
    border-radius: 1.4rem;
    background: rgba(255, 255, 255, 0.07);
    animation: pulse 1.8s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.55;
    }

    50% {
      opacity: 1;
    }
  }

  @media (max-width: 768px) {
    .notification-summary__head,
    .notification-item {
      align-items: stretch;
      flex-direction: column;
    }

    .notification-summary__head > a,
    .notification-item__time {
      width: 100%;
      text-align: center;
    }
  }
</style>
