<script lang="ts">
  import { onMount } from 'svelte';
  import AuthCard from '$lib/components/auth/AuthCard.svelte';
  import {
    communityFetch,
    isCommunityAdmin,
    persistCommunitySession,
    readStoredCommunitySession,
    type CommunitySession
  } from '$lib/api/communityAuth';

  const consoleCards = [
    {
      href: '/console/chats',
      title: '私聊与会话',
      detail: '直接进入最近会话、群聊详情和消息发送面板。'
    },
    {
      href: '/console/groups',
      title: '群组与发现',
      detail: '处理群组发现、建群、加入和直接开聊。'
    },
    {
      href: '/console/drive',
      title: '网盘与媒体',
      detail: '上传、整理和预览社区网盘里的文件。'
    },
    {
      href: '/community/notifications',
      title: '互动提醒',
      detail: '集中查看提及、评论、点赞和私信提醒。'
    }
  ];

  let session: CommunitySession | null = null;
  let profileForm = {
    signature: '',
    avatar_url: '',
    background_url: ''
  };
  let feedback = '';
  let saving = false;

  onMount(() => {
    syncSession();
  });

  function syncSession() {
    session = readStoredCommunitySession();
    profileForm = {
      signature: session?.signature || '',
      avatar_url: session?.avatar_url || '',
      background_url: session?.background_url || ''
    };
  }

  async function handleAuthSuccess() {
    syncSession();
  }

  async function saveProfile() {
    if (!session || saving) return;

    saving = true;
    feedback = '';

    try {
      const response = await communityFetch('/api/community/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileForm)
      });
      const data = await response.json().catch(() => ({ ok: false, msg: '资料保存失败。' }));

      if (!response.ok || !data?.ok) {
        feedback = data?.msg || '资料保存失败。';
        return;
      }

      const nextSession = {
        ...(session || {}),
        ...(data.user || {}),
        signature: profileForm.signature || null,
        avatar_url: profileForm.avatar_url || null,
        background_url: profileForm.background_url || null
      };
      persistCommunitySession(nextSession);
      feedback = '资料已更新。';
      syncSession();
    } catch (saveError) {
      feedback = saveError instanceof Error ? saveError.message : '资料保存失败。';
    } finally {
      saving = false;
    }
  }
</script>

<section class="console-page" aria-label="消息台中枢">
  <section class="route-shell console-hero">
    <div>
      <p class="route-kicker">Console hub</p>
      <h1>个人面板、消息、群组、网盘、提醒</h1>
      <p>消息台现在是 route-native 的真实首页，不再只是旧弹层的占位入口；账号资料和常用分区都可以直接从这里进入。</p>
    </div>

    {#if session}
      <div class="console-profile-badge">
        <span>当前账号</span>
        <strong>{session.username}</strong>
        <small>Lv.{session.level || 1} · {session.role || 'user'}</small>
      </div>
    {/if}
  </section>

  <section class="console-grid" aria-label="消息台快捷入口">
    <a href="/console" aria-current="page" class="console-card">
      <strong>个人面板</strong>
      <p>返回账号总览、资料编辑和常用入口汇总。</p>
    </a>

    {#each consoleCards as card}
      <a href={card.href} class="console-card">
        <strong>{card.title}</strong>
        <p>{card.detail}</p>
      </a>
    {/each}
  </section>

  {#if !session}
    <section class="console-auth">
      <div class="route-shell console-auth-copy">
        <p class="route-kicker">Sign in</p>
        <h2>先登录，再继续你的消息台。</h2>
        <p>登录后就能保存个人资料、进入会话、管理群组和整理网盘文件。</p>
      </div>

      <AuthCard on:success={handleAuthSuccess} />
    </section>
  {:else}
    <section class="route-shell console-account">
      <div class="console-account__head">
        <div>
          <p class="route-kicker">Account</p>
          <h2>个人资料</h2>
        </div>

        {#if isCommunityAdmin(session)}
          <a href="/admin" class="console-account__admin">进入管理后台</a>
        {/if}
      </div>

      <div class="console-account__stats" aria-label="账号摘要">
        <div>
          <span>用户名</span>
          <strong>{session.username}</strong>
        </div>
        <div>
          <span>等级</span>
          <strong>Lv.{session.level || 1}</strong>
        </div>
        <div>
          <span>经验</span>
          <strong>{session.xp || 0}</strong>
        </div>
      </div>

      <form class="console-account__form" on:submit|preventDefault={saveProfile}>
        <label>
          <span>签名</span>
          <textarea bind:value={profileForm.signature} rows="4" placeholder="写一点介绍或近况。"></textarea>
        </label>

        <label>
          <span>头像地址</span>
          <input bind:value={profileForm.avatar_url} type="url" placeholder="https://..." />
        </label>

        <label>
          <span>背景地址</span>
          <input bind:value={profileForm.background_url} type="url" placeholder="https://..." />
        </label>

        {#if feedback}
          <p class="console-account__feedback">{feedback}</p>
        {/if}

        <button type="submit" disabled={saving}>{saving ? '保存中…' : '保存资料'}</button>
      </form>
    </section>
  {/if}
</section>

<style>
  .console-page {
    display: grid;
    gap: 1.25rem;
  }

  .console-hero {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .console-profile-badge {
    min-width: 12rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 1.5rem;
    background: rgba(255, 255, 255, 0.08);
    padding: 1rem;
    display: grid;
    gap: 0.35rem;
  }

  .console-profile-badge span,
  .console-account__stats span,
  .console-account__form label span {
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    opacity: 0.62;
  }

  .console-profile-badge strong {
    font-size: 1.2rem;
    font-weight: 900;
  }

  .console-grid {
    display: grid;
    gap: 0.85rem;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  }

  .console-card {
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 1.4rem;
    background: rgba(255, 255, 255, 0.06);
    padding: 1.05rem;
    display: grid;
    gap: 0.6rem;
  }

  .console-card strong {
    font-size: 1rem;
    font-weight: 900;
  }

  .console-card p {
    margin: 0;
    line-height: 1.65;
    opacity: 0.78;
  }

  .console-auth {
    display: grid;
    gap: 1.25rem;
    grid-template-columns: minmax(0, 1fr) minmax(0, 34rem);
  }

  .console-account {
    display: grid;
    gap: 1.1rem;
  }

  .console-account__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .console-account__head h2 {
    margin: 0.75rem 0 0;
    font-size: clamp(1.7rem, 4vw, 2.4rem);
    font-weight: 900;
    letter-spacing: -0.04em;
  }

  .console-account__admin,
  .console-account button {
    border: 0;
    border-radius: 999px;
    background: var(--color-primary, #f97316);
    color: var(--color-button-text, #fff7ed);
    padding: 0.85rem 1.2rem;
    font-weight: 900;
  }

  .console-account__stats {
    display: grid;
    gap: 0.85rem;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  }

  .console-account__stats div {
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 1.25rem;
    background: rgba(255, 255, 255, 0.05);
    padding: 0.95rem 1rem;
    display: grid;
    gap: 0.45rem;
  }

  .console-account__stats strong {
    font-size: 1.2rem;
    font-weight: 900;
  }

  .console-account__form {
    display: grid;
    gap: 1rem;
  }

  .console-account__form label {
    display: grid;
    gap: 0.55rem;
  }

  .console-account__form input,
  .console-account__form textarea {
    width: 100%;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 1.2rem;
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    padding: 1rem 1.05rem;
  }

  .console-account__feedback {
    margin: 0;
    border-radius: 1rem;
    background: rgba(255, 255, 255, 0.08);
    padding: 0.9rem 1rem;
  }

  .console-account button {
    width: fit-content;
    cursor: pointer;
  }

  .console-account button:disabled {
    opacity: 0.58;
    cursor: not-allowed;
  }

  @media (max-width: 900px) {
    .console-auth {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 640px) {
    .console-hero,
    .console-account__head {
      flex-direction: column;
    }

    .console-account button,
    .console-account__admin {
      width: 100%;
      text-align: center;
    }
  }
</style>
