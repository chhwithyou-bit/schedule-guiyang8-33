<script lang="ts">
  import { onMount } from 'svelte';
  import { communityFetch, readStoredCommunitySession } from '$lib/api/communityAuth';
  import type { CommunitySession } from '$lib/api/communityAuth';
  import { profileHref } from '$lib/state/communityRouteState';

  type GroupItem = {
    id: string;
    title: string;
    description?: string;
    avatar_url?: string;
    updated_at?: string;
    member_count?: number;
    joined?: boolean;
  };

  type DiscoveryUser = {
    id: string;
    username: string;
    avatar_url?: string;
    signature?: string;
    xp?: number;
    level?: number;
    role?: string;
  };

  const createFormDefaults = {
    title: '',
    description: ''
  };

  let session: CommunitySession | null = null;
  let loading = false;
  let discoveryError = '';
  let createError = '';
  let feedback = '';
  let searchQuery = '';
  let createForm = { ...createFormDefaults };
  let creatingGroup = false;
  let joiningGroupId = '';
  let groups: GroupItem[] = [];
  let discoveryUsers: DiscoveryUser[] = [];

  $: joinedGroups = groups.filter((group) => group.joined);

  onMount(() => {
    session = readStoredCommunitySession();
    if (session?.username && session?.passHash) {
      void loadDiscovery();
    }
  });

  async function loadDiscovery() {
    if (!session?.username || !session?.passHash) {
      groups = [];
      discoveryUsers = [];
      return;
    }

    loading = true;
    discoveryError = '';

    try {
      const query = searchQuery.trim();
      const qs = query ? `?q=${encodeURIComponent(query)}` : '';
      const response = await communityFetch(`/api/community/discovery${qs}`);
      const data = await response.json();

      if (!data?.ok) {
        discoveryError = data?.msg || '群组发现没加载出来。';
        return;
      }

      groups = Array.isArray(data.groups) ? data.groups : [];
      discoveryUsers = Array.isArray(data.users) ? data.users : [];
    } catch (error) {
      console.error('Failed to load console groups discovery', error);
      discoveryError = '群组发现没加载出来。';
    } finally {
      loading = false;
    }
  }

  async function createGroup() {
    const title = createForm.title.trim();
    const description = createForm.description.trim();

    if (!session?.username || !session?.passHash) {
      createError = '登录后才能创建群组。';
      return;
    }

    if (!title || creatingGroup) {
      createError = '请输入群组名称。';
      return;
    }

    creatingGroup = true;
    createError = '';
    feedback = '';

    try {
      const response = await communityFetch('/api/community/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          member_ids: []
        })
      });
      const data = await response.json();

      if (!data?.ok) {
        createError = data?.msg || '群组没建成功。';
        return;
      }

      createForm = { ...createFormDefaults };
      feedback = '群已经建好了。';
      await loadDiscovery();
    } catch (error) {
      console.error('Failed to create console group', error);
      createError = '群组没建成功。';
    } finally {
      creatingGroup = false;
    }
  }

  async function joinGroup(group: GroupItem) {
    if (!session?.username || !session?.passHash || !group?.id || joiningGroupId) {
      return;
    }

    joiningGroupId = group.id;
    discoveryError = '';
    feedback = '';

    try {
      const response = await communityFetch('/api/community/groups/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: group.id })
      });
      const data = await response.json();

      if (!data?.ok) {
        discoveryError = data?.msg || '加入群组失败。';
        return;
      }

      feedback = `已加入“${group.title}”。`;
      await loadDiscovery();
    } catch (error) {
      console.error('Failed to join console group', error);
      discoveryError = '加入群组失败。';
    } finally {
      joiningGroupId = '';
    }
  }

  function formatDate(value?: string) {
    if (!value) return '刚刚活跃';
    try {
      return new Date(value).toLocaleString('zh-CN');
    } catch {
      return value;
    }
  }

  function formatRoleLabel(role?: string) {
    const map: Record<string, string> = {
      owner: '站长',
      admin: '管理员',
      member: '成员',
      user: '成员'
    };
    return map[String(role || '').toLowerCase()] || role || '成员';
  }
</script>

<section class="route-shell console-groups-shell" aria-label="群组与发现">
  <p class="route-kicker">Console groups</p>
  <h1>群组与发现</h1>
  <p>把旧控制台里的群组、发现、加入和建群流程拆到真实路由里，直接复用现有 community worker 接口。</p>

  {#if !session?.username || !session?.passHash}
    <section class="panel stack-lg" aria-label="群组登录提示">
      <div>
        <p class="section-kicker">先登录一下</p>
        <h2>登录后才能继续加入或创建群组</h2>
        <p>当前页面已经改成路由原生流程，不再依赖旧的 modal/currentView 切换。登录后会自动加载群组发现列表。</p>
      </div>
      <div class="cta-row">
        <a class="pill pill-primary" href="/community">去社区首页登录</a>
        <a class="pill pill-ghost" href="/console">返回 console 中枢</a>
      </div>
    </section>
  {:else}
    <div class="hero-grid">
      <section class="panel stack-lg" aria-label="当前账号概览">
        <div class="identity-row">
          <div class="identity-avatar" aria-hidden="true">
            {#if session.avatar_url}
              <img src={session.avatar_url} alt="" />
            {:else}
              {session.username.slice(0, 1).toUpperCase()}
            {/if}
          </div>
          <div>
            <p class="section-kicker">群组控制台</p>
            <h2>{session.username}</h2>
            <p class="muted">{formatRoleLabel(session.role)} · LV.{session.level || 1} · XP.{session.xp || 0}</p>
          </div>
        </div>

        <form class="search-row" on:submit|preventDefault={loadDiscovery}>
          <input
            bind:value={searchQuery}
            type="search"
            placeholder="搜索群组或成员"
            aria-label="搜索群组或成员"
          />
          <button type="submit" class="pill pill-primary" disabled={loading}>
            {loading ? '搜索中…' : '搜索发现'}
          </button>
        </form>

        <div class="stats-grid" aria-label="群组统计">
          <article class="stat-card">
            <span>已加入群组</span>
            <strong>{joinedGroups.length}</strong>
          </article>
          <article class="stat-card">
            <span>可发现群组</span>
            <strong>{groups.length}</strong>
          </article>
          <article class="stat-card">
            <span>推荐成员</span>
            <strong>{discoveryUsers.length}</strong>
          </article>
        </div>

        <div class="cta-row">
          <a class="pill pill-ghost" href="/console/chats">前往聊天路由</a>
          <button type="button" class="pill pill-ghost" on:click={loadDiscovery} disabled={loading}>
            刷新群组
          </button>
        </div>
      </section>

      <section class="panel stack-lg" aria-label="创建群组">
        <div>
          <p class="section-kicker">创建群聊</p>
          <h2>建一个新群</h2>
          <p>建群能力已经切到独立页面表单，创建后会立即回到发现与已加入列表。</p>
        </div>

        <label class="field-block">
          <span>群名</span>
          <input bind:value={createForm.title} type="text" maxlength="42" placeholder="例如：Guiyang Late Night" aria-label="群名" />
        </label>

        <label class="field-block">
          <span>群介绍</span>
          <textarea bind:value={createForm.description} rows="5" placeholder="写一点这个群的主题或欢迎语" aria-label="群介绍"></textarea>
        </label>

        <div class="cta-row">
          <button type="button" class="pill pill-primary" on:click={createGroup} disabled={creatingGroup}>
            {creatingGroup ? '正在创建…' : '创建群聊'}
          </button>
          <a class="pill pill-ghost" href="/console">返回 console</a>
        </div>

        {#if createError}
          <p class="message message-error">{createError}</p>
        {/if}
      </section>
    </div>

    {#if feedback}
      <p class="message message-success">{feedback}</p>
    {/if}

    {#if discoveryError}
      <p class="message message-error">{discoveryError}</p>
    {/if}

    <div class="content-grid">
      <section class="panel stack-lg" aria-label="我加入的群组">
        <div class="section-heading">
          <div>
            <p class="section-kicker">已加入</p>
            <h2>我加入的群组</h2>
          </div>
          <a class="pill pill-ghost" href="/console/chats">去聊天页</a>
        </div>

        {#if loading && joinedGroups.length === 0}
          <p class="muted">正在加载你已经加入的群组…</p>
        {:else if joinedGroups.length > 0}
          <div class="card-list">
            {#each joinedGroups as group (group.id)}
              <article class="group-card">
                <div class="group-card__main">
                  <div>
                    <h3>{group.title}</h3>
                    <p class="meta">{group.member_count || 0} 人 · 最近活跃于 {formatDate(group.updated_at)}</p>
                  </div>
                  <p class="muted">{group.description || '这个群还没有介绍。'}</p>
                </div>
                <div class="cta-row">
                  <span class="pill pill-tag">已加入</span>
                  <a class="pill pill-primary" href="/console/chats">打开会话</a>
                </div>
              </article>
            {/each}
          </div>
        {:else}
          <p class="muted">你还没有加入任何群组，可以先从右侧发现列表里挑一个。</p>
        {/if}
      </section>

      <section class="panel stack-lg" aria-label="发现群组与成员">
        <div class="section-heading">
          <div>
            <p class="section-kicker">发现</p>
            <h2>群组与成员推荐</h2>
          </div>
          <button type="button" class="pill pill-ghost" on:click={loadDiscovery} disabled={loading}>刷新</button>
        </div>

        <div class="stack-lg">
          <div>
            <h3 class="subheading">可加入的群组</h3>
            {#if loading && groups.length === 0}
              <p class="muted">正在搜索群组…</p>
            {:else if groups.length > 0}
              <div class="card-list">
                {#each groups as group (group.id)}
                  <article class="group-card">
                    <div class="group-card__main">
                      <div>
                        <h3>{group.title}</h3>
                        <p class="meta">{group.member_count || 0} 人 · 最近活跃于 {formatDate(group.updated_at)}</p>
                      </div>
                      <p class="muted">{group.description || '这个群还没有介绍。'}</p>
                    </div>
                    <div class="cta-row">
                      {#if group.joined}
                        <span class="pill pill-tag">已加入</span>
                        <a class="pill pill-primary" href="/console/chats">去聊天</a>
                      {:else}
                        <button
                          type="button"
                          class="pill pill-primary"
                          on:click={() => joinGroup(group)}
                          disabled={joiningGroupId === group.id}
                        >
                          {joiningGroupId === group.id ? '加入中…' : '加入群组'}
                        </button>
                      {/if}
                    </div>
                  </article>
                {/each}
              </div>
            {:else}
              <p class="muted">没有找到匹配的群组，换个关键词试试，或者自己创建一个。</p>
            {/if}
          </div>

          <div>
            <h3 class="subheading">推荐成员</h3>
            {#if discoveryUsers.length > 0}
              <div class="user-list">
                {#each discoveryUsers as member (member.id)}
                  <a class="user-card" href={profileHref(member.id)}>
                    <div class="identity-avatar identity-avatar--small" aria-hidden="true">
                      {#if member.avatar_url}
                        <img src={member.avatar_url} alt="" />
                      {:else}
                        {member.username.slice(0, 1).toUpperCase()}
                      {/if}
                    </div>
                    <div>
                      <strong>{member.username}</strong>
                      <p class="meta">{formatRoleLabel(member.role)} · LV.{member.level || 1} · XP.{member.xp || 0}</p>
                      <p class="muted">{member.signature || '这个成员还没写签名。'}</p>
                    </div>
                  </a>
                {/each}
              </div>
            {:else}
              <p class="muted">当前没有额外推荐成员。</p>
            {/if}
          </div>
        </div>
      </section>
    </div>
  {/if}
</section>

<style>
  .console-groups-shell {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .hero-grid,
  .content-grid {
    display: grid;
    gap: 1rem;
  }

  .hero-grid {
    grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
  }

  .content-grid {
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
    align-items: start;
  }

  .panel,
  .stat-card,
  .group-card,
  .user-card,
  .field-block input,
  .field-block textarea,
  .pill-tag,
  .message {
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(16px);
  }

  .panel,
  .group-card,
  .user-card,
  .message {
    border-radius: 1.6rem;
  }

  .panel {
    padding: 1.25rem;
  }

  .stack-lg {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .identity-row,
  .section-heading,
  .search-row,
  .cta-row {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
  }

  .identity-avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3.5rem;
    height: 3.5rem;
    border-radius: 1.25rem;
    overflow: hidden;
    background: var(--color-primary, #f97316);
    color: var(--color-button-text, #fff7ed);
    font-weight: 900;
    font-size: 1.25rem;
  }

  .identity-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .identity-avatar--small {
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 1rem;
    flex-shrink: 0;
  }

  .section-kicker,
  .meta {
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    opacity: 0.62;
  }

  .muted {
    opacity: 0.78;
    line-height: 1.65;
  }

  .search-row input,
  .field-block input,
  .field-block textarea {
    width: 100%;
    border-radius: 1rem;
    padding: 0.9rem 1rem;
    color: inherit;
  }

  .search-row {
    align-items: stretch;
  }

  .search-row input {
    flex: 1 1 16rem;
  }

  .field-block {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .field-block span,
  .subheading {
    font-size: 0.8rem;
    font-weight: 900;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    opacity: 0.72;
  }

  .stats-grid,
  .card-list,
  .user-list {
    display: grid;
    gap: 0.75rem;
  }

  .stats-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .stat-card {
    border-radius: 1.1rem;
    padding: 0.9rem 1rem;
  }

  .stat-card span {
    display: block;
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    opacity: 0.6;
  }

  .stat-card strong {
    display: block;
    margin-top: 0.45rem;
    font-size: 1.8rem;
    font-weight: 900;
  }

  .group-card,
  .user-card {
    padding: 1rem;
  }

  .group-card {
    display: flex;
    gap: 0.75rem;
    justify-content: space-between;
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .group-card__main {
    flex: 1 1 16rem;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }

  .user-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.85rem;
    text-decoration: none;
    color: inherit;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.75rem;
    padding: 0.75rem 1rem;
    border-radius: 999px;
    font-size: 0.76rem;
    font-weight: 900;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    text-decoration: none;
  }

  .pill-primary {
    background: var(--color-primary, #f97316);
    color: var(--color-button-text, #fff7ed);
  }

  .pill-ghost,
  .pill-tag {
    color: inherit;
  }

  .pill-tag {
    padding-inline: 0.85rem;
  }

  .message {
    padding: 0.95rem 1rem;
    font-weight: 700;
  }

  .message-success {
    border-color: rgba(52, 211, 153, 0.28);
    background: rgba(16, 185, 129, 0.12);
  }

  .message-error {
    border-color: rgba(248, 113, 113, 0.28);
    background: rgba(239, 68, 68, 0.12);
  }

  @media (max-width: 900px) {
    .content-grid {
      grid-template-columns: 1fr;
    }

    .stats-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
