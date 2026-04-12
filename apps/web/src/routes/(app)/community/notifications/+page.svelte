<script lang="ts">
  import { onMount } from 'svelte';
  import AuthCard from '$lib/components/auth/AuthCard.svelte';
  import NotificationSummary, { type NotificationSummaryItem } from '$lib/components/console/NotificationSummary.svelte';
  import { communityFetch, readStoredCommunitySession } from '$lib/api/communityAuth';

  let session = readStoredCommunitySession();
  let notifications: NotificationSummaryItem[] = [];
  let loading = Boolean(session);
  let error = '';

  async function loadNotifications() {
    session = readStoredCommunitySession();
    if (!session) {
      notifications = [];
      loading = false;
      error = '';
      return;
    }

    loading = true;
    error = '';

    try {
      const res = await communityFetch('/api/community/notifications');
      const data = await res.json();
      if (!data?.ok) {
        error = data?.msg || '提醒没加载出来。';
        return;
      }

      notifications = Array.isArray(data.notifications) ? data.notifications : [];
    } catch (eventError) {
      error = eventError instanceof Error ? eventError.message : '提醒没加载出来。';
    } finally {
      loading = false;
    }
  }

  async function handleAuthSuccess() {
    await loadNotifications();
  }

  onMount(() => {
    void loadNotifications();
  });
</script>

<section class="route-shell notifications-route" aria-labelledby="notifications-title">
  <div class="notifications-route__hero">
    <div>
      <p class="route-kicker">Community alerts</p>
      <h1 id="notifications-title">互动提醒</h1>
      <p>把原来 console 里的提醒单独拉成路由，方便从社区、console 和账号入口直接落到通知列表。</p>
    </div>

    <div class="notifications-route__links" aria-label="提醒相关入口">
      <a href="/console">个人面板</a>
      <a href="/console/chats">私聊与会话</a>
    </div>
  </div>

  {#if !session}
    <div class="notifications-route__auth">
      <AuthCard on:success={handleAuthSuccess} />
    </div>
  {:else}
    <section class="notifications-route__panel" aria-label="提醒列表">
      <div class="notifications-route__toolbar">
        <div>
          <p class="notifications-route__eyebrow">提醒</p>
          <h2>{notifications.length} 条更新</h2>
          <p class="notifications-route__hint">最新提及、互动和私信提醒都会继续复用原 worker 通知接口。</p>
        </div>

        <div class="notifications-route__actions">
          <a href="/console">回到个人面板</a>
          <button type="button" on:click={loadNotifications}>刷新</button>
        </div>
      </div>

      {#if error}
        <p class="notifications-route__error">{error}</p>
      {/if}

      <div class="notifications-route__list">
        {#if loading}
          {#each Array(4) as _}
            <div class="notifications-route__skeleton"></div>
          {/each}
        {:else if notifications.length > 0}
          {#each notifications as item (item.id)}
            <NotificationSummary {item} />
          {/each}
        {:else}
          <div class="notifications-route__empty">目前还没有通知。</div>
        {/if}
      </div>
    </section>
  {/if}
</section>

<style>
  .notifications-route {
    display: grid;
    gap: 1.5rem;
  }

  .notifications-route__hero {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .notifications-route__links,
  .notifications-route__actions {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .notifications-route__links a,
  .notifications-route__actions a,
  .notifications-route__actions button {
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

  .notifications-route__actions button {
    cursor: pointer;
  }

  .notifications-route__auth {
    display: grid;
  }

  .notifications-route__panel {
    display: grid;
    gap: 1rem;
  }

  .notifications-route__toolbar {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .notifications-route__eyebrow {
    margin: 0;
    font-size: 0.7rem;
    font-weight: 900;
    letter-spacing: 0.22em;
    opacity: 0.45;
    text-transform: uppercase;
  }

  .notifications-route__toolbar h2 {
    margin: 0.35rem 0 0;
    font-size: clamp(1.6rem, 3vw, 2.2rem);
    font-weight: 900;
    letter-spacing: -0.04em;
  }

  .notifications-route__hint {
    margin-top: 0.5rem;
    max-width: 38rem;
    opacity: 0.72;
  }

  .notifications-route__error {
    margin: 0;
    border-radius: 1rem;
    border: 1px solid rgba(248, 113, 113, 0.25);
    background: rgba(239, 68, 68, 0.12);
    color: #fecaca;
    padding: 0.85rem 1rem;
  }

  .notifications-route__list {
    display: grid;
    gap: 0.85rem;
  }

  .notifications-route__empty,
  .notifications-route__skeleton {
    border-radius: 1.5rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.06);
    padding: 1.1rem;
  }

  .notifications-route__empty {
    text-align: center;
    opacity: 0.6;
  }

  .notifications-route__skeleton {
    min-height: 5rem;
    animation: pulse 1.2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.45;
    }
    50% {
      opacity: 0.9;
    }
  }
</style>
