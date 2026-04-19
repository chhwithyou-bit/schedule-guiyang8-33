<svelte:head>
  <title>私聊与会话 · Schedule Guiyang</title>
</svelte:head>

<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { communityFetch, readStoredCommunitySession } from '$lib/api/communityAuth';
  import {
    chatsHref,
    clearStoredChatConversationId,
    persistStoredChatConversationId,
    readStoredChatConversationId
  } from '$lib/state/chatRouteState';

  type Conversation = {
    id: string;
    kind: 'direct' | 'group';
    title: string;
    description?: string;
    avatar_url?: string;
    unread_count?: number;
    last_message?: string;
    last_sender_name?: string;
    last_message_at?: string;
    member_count?: number;
  };

  type Message = {
    id: string;
    conversation_id: string;
    sender_id?: string;
    content: string;
    created_at?: string;
    sender?: {
      id?: string;
      username?: string;
      avatar_url?: string;
      role?: string;
      level?: number;
      xp?: number;
    } | null;
  };

  let conversations: Conversation[] = [];
  let messages: Message[] = [];
  let selectedConversationId = '';
  let loadingChats = true;
  let loadingMessages = false;
  let sendingMessage = false;
  let chatError = '';
  let messageDraft = '';
  let isAuthenticated = false;
  let mobileChatView: 'list' | 'detail' = 'list';
  let viewportWidth = 0;
  let initialized = false;
  let loadingConversationId = '';

  $: requestedConversationId = page.url.searchParams.get('conversation')?.trim() || '';
  $: selectedConversation = conversations.find((item) => item.id === selectedConversationId) || null;
  $: directConversations = conversations.filter((item) => item.kind === 'direct');
  $: groupConversations = conversations.filter((item) => item.kind === 'group');
  $: if (
    initialized &&
    requestedConversationId &&
    requestedConversationId !== selectedConversationId &&
    requestedConversationId !== loadingConversationId &&
    conversations.some((item) => item.id === requestedConversationId)
  ) {
    void openConversation(requestedConversationId, { syncUrl: false, showMobileDetail: isMobileViewport() });
  }

  function isMobileViewport() {
    return viewportWidth > 0 && viewportWidth < 1280;
  }

  function formatDate(value?: string) {
    if (!value) return '';

    try {
      return new Date(value).toLocaleString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return value;
    }
  }

  function formatConversationKind(kind?: Conversation['kind']) {
    return kind === 'group' ? '群聊' : '私聊';
  }

  function resolvePreferredConversationId(nextConversations: Conversation[]) {
    const preferredId = requestedConversationId || readStoredChatConversationId() || nextConversations[0]?.id || '';
    if (!preferredId) return '';
    return nextConversations.find((item) => item.id === preferredId)?.id || nextConversations[0]?.id || '';
  }

  async function syncConversationUrl(conversationId: string) {
    const target = chatsHref(conversationId);
    const current = `${page.url.pathname}${page.url.search}`;
    if (current === target) {
      return;
    }

    await goto(target, {
      replaceState: true,
      noScroll: true,
      keepFocus: true
    });
  }

  async function openConversation(
    conversationId: string,
    options: {
      syncUrl?: boolean;
      showMobileDetail?: boolean;
    } = {}
  ) {
    if (!isAuthenticated || !conversationId) return;

    const { syncUrl = true, showMobileDetail = true } = options;
    loadingConversationId = conversationId;
    loadingMessages = true;
    chatError = '';

    try {
      if (syncUrl) {
        await syncConversationUrl(conversationId);
      }

      const response = await communityFetch(`/api/community/chats/messages?conversation_id=${encodeURIComponent(conversationId)}`);
      const data = await response.json();

      if (!data?.ok) {
        chatError = data?.msg || '消息没加载出来。';
        return;
      }

      selectedConversationId = conversationId;
      messages = Array.isArray(data.messages) ? data.messages : [];
      conversations = conversations.map((item) =>
        item.id === conversationId ? { ...item, unread_count: 0 } : item
      );
      persistStoredChatConversationId(conversationId);

      if (showMobileDetail) {
        mobileChatView = 'detail';
      }
    } catch {
      chatError = '消息没加载出来。';
    } finally {
      loadingMessages = false;
      if (loadingConversationId === conversationId) {
        loadingConversationId = '';
      }
    }
  }

  async function loadChats() {
    if (!isAuthenticated) {
      loadingChats = false;
      return;
    }

    loadingChats = true;
    chatError = '';

    try {
      const response = await communityFetch('/api/community/chats');
      const data = await response.json();

      if (!data?.ok) {
        chatError = data?.msg || '会话列表没加载出来。';
        conversations = [];
        messages = [];
        selectedConversationId = '';
        clearStoredChatConversationId();
        await syncConversationUrl('');
        return;
      }

      conversations = Array.isArray(data.conversations) ? data.conversations : [];

      if (conversations.length === 0) {
        messages = [];
        selectedConversationId = '';
        clearStoredChatConversationId();
        await syncConversationUrl('');
        return;
      }

      const nextConversationId = resolvePreferredConversationId(conversations);
      if (!nextConversationId) {
        messages = [];
        selectedConversationId = '';
        clearStoredChatConversationId();
        await syncConversationUrl('');
        return;
      }

      await openConversation(nextConversationId, {
        syncUrl: true,
        showMobileDetail: isMobileViewport()
      });
    } catch {
      chatError = '会话列表没加载出来。';
      conversations = [];
      messages = [];
      selectedConversationId = '';
    } finally {
      loadingChats = false;
    }
  }

  async function sendMessage() {
    const content = messageDraft.trim();
    if (!isAuthenticated || !selectedConversationId || !content || sendingMessage) {
      return;
    }

    sendingMessage = true;
    chatError = '';

    try {
      const response = await communityFetch('/api/community/chats/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: selectedConversationId,
          content
        })
      });
      const data = await response.json();

      if (!data?.ok) {
        chatError = data?.msg || '消息没发出去。';
        return;
      }

      const senderName = readStoredCommunitySession()?.username || '我';
      messages = [...messages, data.message];
      conversations = conversations.map((item) =>
        item.id === selectedConversationId
          ? {
              ...item,
              unread_count: 0,
              last_message: content,
              last_sender_name: senderName,
              last_message_at: data.message?.created_at
            }
          : item
      );
      messageDraft = '';
    } catch {
      chatError = '消息没发出去。';
    } finally {
      sendingMessage = false;
    }
  }

  onMount(async () => {
    isAuthenticated = Boolean(readStoredCommunitySession());
    viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
    mobileChatView = viewportWidth < 1280 ? 'list' : 'detail';
    await loadChats();
    initialized = true;
  });
</script>

<svelte:window bind:innerWidth={viewportWidth} />

<section class="chats-page" aria-labelledby="chats-title">
  <section class="route-shell chats-hero">
    <p class="route-kicker">Chats</p>
    <h1 id="chats-title">私聊与会话</h1>
    <p>把原 community console 里的聊天列表、会话详情和发消息流程拆成真实子路由，后续 groups 直接沿用这套路由化模式。</p>
  </section>

  {#if !isAuthenticated}
    <section class="route-shell chats-auth-empty">
      <p>先登录，再查看私聊和群聊会话。</p>
      <div class="chats-auth-empty__actions">
        <a href="/login">登录</a>
        <a href="/register">注册</a>
      </div>
    </section>
  {:else}
    <section class="chats-shell route-shell">
      <section class:hidden={mobileChatView === 'detail'} class="chats-panel chats-list-panel" aria-labelledby="chat-list-title">
        <div class="chats-panel__head">
          <div>
            <p class="route-kicker">Conversation list</p>
            <h2 id="chat-list-title">共 {conversations.length} 个会话</h2>
            <p>{directConversations.length} 个私聊 · {groupConversations.length} 个群聊</p>
          </div>
          <button type="button" on:click={loadChats} disabled={loadingChats}>刷新</button>
        </div>

        {#if chatError}
          <p class="chats-feedback chats-feedback--error">{chatError}</p>
        {/if}

        <div class="chats-list" aria-busy={loadingChats}>
          {#if loadingChats}
            {#each Array(4) as _}
              <article class="chats-list-item is-skeleton"></article>
            {/each}
          {:else if conversations.length > 0}
            {#each conversations as item (item.id)}
              <button
                type="button"
                class:selected={selectedConversationId === item.id}
                class="chats-list-item"
                on:click={() => openConversation(item.id, { syncUrl: true, showMobileDetail: true })}
              >
                <div class="chats-avatar" aria-hidden="true">
                  {#if item.avatar_url}
                    <img src={item.avatar_url} alt="" loading="lazy" />
                  {:else}
                    <span>{item.title?.slice(0, 1).toUpperCase() || '#'}</span>
                  {/if}
                </div>

                <div class="chats-list-item__body">
                  <div class="chats-list-item__row">
                    <strong>{item.title}</strong>
                    {#if item.unread_count}
                      <span class="chats-unread">{item.unread_count}</span>
                    {/if}
                  </div>
                  <p>{item.last_sender_name ? `${item.last_sender_name}: ` : ''}{item.last_message || item.description || '还没有消息。'}</p>
                  <div class="chats-list-item__meta">
                    <span>{formatConversationKind(item.kind)}</span>
                    {#if item.last_message_at}
                      <span>{formatDate(item.last_message_at)}</span>
                    {/if}
                  </div>
                </div>
              </button>
            {/each}
          {:else}
            <p class="chats-empty">还没有会话。先去社区或群组建立一条对话。</p>
          {/if}
        </div>
      </section>

      <section class:hidden={mobileChatView === 'list'} class="chats-panel chats-detail-panel" aria-labelledby="chat-detail-title">
        <div class="chats-panel__head chats-panel__head--detail">
          <div>
            <button type="button" class="chats-back" on:click={() => (mobileChatView = 'list')}>返回会话</button>
            <p class="route-kicker">Current conversation</p>
            <h2 id="chat-detail-title">{selectedConversation?.title || '先选一个会话'}</h2>
            <p>{selectedConversation?.description || '会话详情会在这里显示。'}</p>
          </div>
        </div>

        {#if chatError && !loadingChats}
          <p class="chats-feedback chats-feedback--error">{chatError}</p>
        {/if}

        <div class="chats-thread" aria-busy={loadingMessages}>
          {#if loadingMessages}
            <div class="chats-thread__stack">
              {#each Array(4) as _}
                <article class="chats-message is-skeleton"></article>
              {/each}
            </div>
          {:else if messages.length > 0}
            <div class="chats-thread__stack">
              {#each messages as message (message.id)}
                <article class="chats-message">
                  <div class="chats-message__meta">
                    <strong>{message.sender?.username || '系统'}</strong>
                    <span>{formatDate(message.created_at)}</span>
                  </div>
                  <p>{message.content}</p>
                </article>
              {/each}
            </div>
          {:else}
            <p class="chats-empty chats-empty--thread">{selectedConversation ? '这个会话还没有消息。' : '先从左侧选择一个会话。'}</p>
          {/if}
        </div>

        <div class="chats-composer">
          <input
            bind:value={messageDraft}
            type="text"
            placeholder={selectedConversation ? '说点什么…' : '先选一个会话'}
            disabled={!selectedConversation || sendingMessage}
            on:keydown={(event) => event.key === 'Enter' && sendMessage()}
          />
          <button
            type="button"
            on:click={sendMessage}
            disabled={!selectedConversation || !messageDraft.trim() || sendingMessage}
          >
            {sendingMessage ? '发送中…' : '发送'}
          </button>
        </div>
      </section>
    </section>
  {/if}
</section>

<style>
  .chats-page {
    display: grid;
    gap: 1.5rem;
  }

  .chats-shell {
    display: grid;
    gap: 1rem;
    grid-template-columns: minmax(18rem, 22rem) minmax(0, 1fr);
    align-items: stretch;
  }

  .chats-panel {
    display: grid;
    gap: 1rem;
    min-height: 0;
  }

  .chats-list-panel,
  .chats-detail-panel,
  .chats-auth-empty {
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 1.5rem;
    background: rgba(255, 255, 255, 0.05);
    padding: 1rem;
  }

  .chats-panel__head {
    display: flex;
    gap: 1rem;
    justify-content: space-between;
    align-items: flex-start;
  }

  .chats-panel__head h2 {
    margin-top: 0.35rem;
    font-size: 1.5rem;
    font-weight: 900;
    letter-spacing: -0.04em;
  }

  .chats-panel__head p:last-child {
    margin-top: 0.35rem;
    opacity: 0.7;
    line-height: 1.6;
  }

  .chats-panel__head button,
  .chats-auth-empty__actions a,
  .chats-composer button,
  .chats-back {
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
    color: inherit;
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 900;
    letter-spacing: 0.16em;
    min-height: 2.8rem;
    padding: 0.75rem 1rem;
    text-decoration: none;
    text-transform: uppercase;
  }

  .chats-back {
    display: none;
    margin-bottom: 0.75rem;
  }

  .chats-composer button {
    background: var(--color-primary, #fac7b7);
    color: var(--color-button-text, #231b22);
  }

  .chats-list {
    display: grid;
    gap: 0.75rem;
  }

  .chats-list-item,
  .chats-message,
  .chats-empty {
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 1.25rem;
    background: rgba(255, 255, 255, 0.06);
  }

  .chats-list-item {
    display: flex;
    gap: 0.85rem;
    width: 100%;
    padding: 1rem;
    text-align: left;
    color: inherit;
    cursor: pointer;
  }

  .chats-list-item.selected {
    border-color: rgba(250, 199, 183, 0.6);
    background: rgba(250, 199, 183, 0.12);
  }

  .chats-avatar {
    width: 3rem;
    height: 3rem;
    border-radius: 1rem;
    overflow: hidden;
    background: var(--color-primary, #fac7b7);
    color: var(--color-button-text, #231b22);
    display: flex;
    align-items: center;
    justify-content: center;
    flex: none;
    font-weight: 900;
  }

  .chats-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .chats-list-item__body {
    min-width: 0;
    display: grid;
    gap: 0.35rem;
    flex: 1;
  }

  .chats-list-item__row,
  .chats-message__meta,
  .chats-list-item__meta {
    display: flex;
    gap: 0.75rem;
    justify-content: space-between;
    align-items: center;
  }

  .chats-list-item__row strong,
  .chats-message__meta strong {
    min-width: 0;
    font-size: 0.95rem;
    font-weight: 900;
  }

  .chats-list-item__body p,
  .chats-message p {
    margin: 0;
    line-height: 1.7;
    opacity: 0.82;
    word-break: break-word;
  }

  .chats-list-item__body > p {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chats-list-item__meta,
  .chats-message__meta span {
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.14em;
    opacity: 0.5;
    text-transform: uppercase;
  }

  .chats-unread {
    border-radius: 999px;
    background: var(--color-primary, #fac7b7);
    color: var(--color-button-text, #231b22);
    flex: none;
    font-size: 0.7rem;
    font-weight: 900;
    padding: 0.25rem 0.55rem;
  }

  .chats-thread {
    min-height: 20rem;
    max-height: 58svh;
    overflow-y: auto;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 1.25rem;
    background: rgba(255, 255, 255, 0.04);
    padding: 1rem;
  }

  .chats-thread__stack {
    display: grid;
    gap: 0.75rem;
  }

  .chats-message {
    padding: 1rem;
  }

  .chats-composer {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .chats-composer input {
    width: 100%;
    min-width: 0;
    border-radius: 1rem;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    padding: 1rem 1.1rem;
  }

  .chats-auth-empty__actions {
    margin-top: 1rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .chats-feedback {
    margin: 0;
    border-radius: 1rem;
    padding: 0.85rem 1rem;
    font-weight: 700;
  }

  .chats-feedback--error {
    background: rgba(220, 38, 38, 0.18);
    color: #fecaca;
  }

  .chats-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 8rem;
    padding: 1rem;
    text-align: center;
    opacity: 0.65;
  }

  .chats-empty--thread {
    min-height: 100%;
  }

  .is-skeleton {
    min-height: 5.5rem;
    opacity: 0.4;
  }

  @media (max-width: 1279px) {
    .chats-shell {
      grid-template-columns: 1fr;
    }

    .chats-back {
      display: inline-flex;
    }

    .chats-list-panel.hidden,
    .chats-detail-panel.hidden {
      display: none;
    }

    .chats-thread {
      max-height: none;
      min-height: 18rem;
    }
  }

  @media (max-width: 768px) {
    .chats-composer {
      grid-template-columns: 1fr;
    }

    .chats-auth-empty__actions a,
    .chats-composer button,
    .chats-panel__head button {
      width: 100%;
      justify-content: center;
      text-align: center;
    }

    .chats-panel__head {
      flex-direction: column;
    }
  }
</style>
