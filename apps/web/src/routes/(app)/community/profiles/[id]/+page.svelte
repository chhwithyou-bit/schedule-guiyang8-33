<svelte:head>
  <title>个人主页 · Schedule Guiyang</title>
</svelte:head>

<script lang="ts">
  import { communityFetch, persistCommunitySession, readStoredCommunitySession } from '$lib/api/communityAuth';
  import { postHref, profileHref } from '$lib/state/communityRouteState';

  type ProfileUser = {
    id: string;
    username: string;
    avatar_url?: string | null;
    background_url?: string | null;
    signature?: string | null;
    role?: string;
    level?: number;
    xp?: number;
    followers_count?: number;
    following_count?: number;
    viewer_is_following?: boolean;
  };

  type ProfilePost = {
    id: string;
    content: string;
    media_json: string;
    created_at: string;
    like_count?: number;
    comment_count?: number;
  };

  export let data:
    | {
        id?: string;
        user?: ProfileUser | null;
        posts?: ProfilePost[];
      }
    | undefined;

  let user = data?.user || null;
  let posts = Array.isArray(data?.posts) ? data.posts : [];
  let feedback = '';
  let followPending = false;
  let savePending = false;
  let draftSignature = user?.signature || '';
  let draftAvatar = user?.avatar_url || '';
  let draftBackground = user?.background_url || '';

  $: isOwnProfile = Boolean(readStoredCommunitySession()?.id && user?.id && readStoredCommunitySession()?.id === user.id);

  function safeMedia(json: string) {
    try {
      const parsed = JSON.parse(json);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is { url: string } => Boolean(item && typeof item.url === 'string' && item.url.trim()))
        : [];
    } catch {
      return [];
    }
  }

  function formatDate(value: string) {
    if (!value) return '';
    return new Date(value).toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  async function toggleFollow() {
    if (!user?.id) return;
    if (!readStoredCommunitySession()) {
      feedback = '先登录，再关注。';
      return;
    }
    if (isOwnProfile || followPending) return;

    followPending = true;
    feedback = '';

    try {
      const response = await communityFetch('/api/community/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ following_id: user.id })
      });
      const payload = await response.json();
      if (!payload?.ok) {
        feedback = payload?.msg || '关注失败。';
        return;
      }

      const followed = payload.action === 'followed';
      user = {
        ...user,
        viewer_is_following: followed,
        followers_count: Math.max(0, Number(user.followers_count || 0) + (followed ? 1 : -1))
      };
    } catch {
      feedback = '关注失败。';
    } finally {
      followPending = false;
    }
  }

  async function saveProfile() {
    if (!user?.id || !isOwnProfile) return;
    if (savePending) return;

    savePending = true;
    feedback = '';

    try {
      const response = await communityFetch('/api/community/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature: draftSignature,
          avatar_url: draftAvatar,
          background_url: draftBackground
        })
      });
      const payload = await response.json();
      if (!payload?.ok) {
        feedback = payload?.msg || '资料保存失败。';
        return;
      }

      user = {
        ...user,
        signature: draftSignature,
        avatar_url: draftAvatar,
        background_url: draftBackground
      };

      const session = readStoredCommunitySession();
      if (session && session.id === user.id) {
        persistCommunitySession({
          ...session,
          signature: draftSignature,
          avatar_url: draftAvatar,
          background_url: draftBackground
        });
      }

      feedback = '资料已保存。';
    } catch {
      feedback = '资料保存失败。';
    } finally {
      savePending = false;
    }
  }
</script>

<section class="profile-page space-y-6">
  {#if user}
    <section class="route-shell profile-hero" aria-label="个人主页详情">
      <div class="profile-hero__media">
        {#if user.background_url}
          <img src={user.background_url} alt="个人主页背景" />
        {/if}
        <div class="profile-hero__overlay"></div>
      </div>

      <div class="profile-hero__content">
        <div class="profile-hero__topbar">
          <div>
            <p class="route-kicker">Profile detail</p>
            <h1>个人主页</h1>
            <div class="profile-hero__identity-line">
              <strong>{user.username}</strong>
              <code>{user.id}</code>
            </div>
          </div>
          <a href="/community">返回社区</a>
        </div>

        <div class="profile-identity">
          <div class="profile-avatar">
            {#if user.avatar_url}
              <img src={user.avatar_url} alt={user.username} />
            {:else}
              <span>{user.username?.slice(0, 1).toUpperCase() || '?'}</span>
            {/if}
          </div>

          <div class="profile-summary">
            <div class="profile-summary__badges">
              <span>LV.{user.level || 1}</span>
              <span>XP.{user.xp || 0}</span>
              {#if user.role === 'admin' || user.role === 'owner'}
                <span>{user.role === 'owner' ? '站长' : '管理员'}</span>
              {/if}
            </div>
            <p>{user.signature || '这个人还没写个性签名。'}</p>
            <div class="profile-stats">
              <strong>{user.followers_count || 0} 粉丝</strong>
              <strong>{user.following_count || 0} 关注</strong>
            </div>
          </div>
        </div>

        <div class="profile-actions">
          {#if !isOwnProfile}
            <button type="button" class:active={Boolean(user.viewer_is_following)} on:click={toggleFollow} disabled={followPending}>
              {user.viewer_is_following ? '取消关注' : '关注这个人'}
            </button>
            <a href="/console/chats">发起私聊</a>
          {:else}
            <a href="/console">打开我的控制台</a>
          {/if}
        </div>
      </div>
    </section>

    {#if isOwnProfile}
      <section class="route-shell profile-editor" aria-label="编辑个人资料">
        <div>
          <p class="route-kicker">Profile edit</p>
          <h2>编辑资料</h2>
        </div>

        <label>
          <span>签名</span>
          <textarea bind:value={draftSignature} rows="3" placeholder="写一点介绍或近况。"></textarea>
        </label>

        <div class="profile-editor__grid">
          <label>
            <span>头像链接</span>
            <input bind:value={draftAvatar} type="url" placeholder="https://..." />
          </label>
          <label>
            <span>背景链接</span>
            <input bind:value={draftBackground} type="url" placeholder="https://..." />
          </label>
        </div>

        <div class="profile-editor__footer">
          <p>{feedback}</p>
          <button type="button" on:click={saveProfile} disabled={savePending}>
            {savePending ? '保存中…' : '保存资料'}
          </button>
        </div>
      </section>
    {:else if feedback}
      <section class="route-shell" aria-label="操作反馈">
        <p>{feedback}</p>
      </section>
    {/if}

    <section class="route-shell profile-posts" aria-labelledby="profile-posts-title">
      <div>
        <p class="route-kicker">User posts</p>
        <h2 id="profile-posts-title">{posts.length ? `${user.username} 发过的内容` : '这个主页暂时还没有帖子'}</h2>
      </div>

      {#if posts.length > 0}
        <div class="profile-posts__grid">
          {#each posts as post}
            <article class="profile-post-card">
              <a class="profile-post-card__body" href={postHref(post.id)}>
                <p>{post.content || '这条动态没有文字内容。'}</p>
              </a>

              {#if safeMedia(post.media_json).length > 0}
                <div class="profile-post-card__media">
                  {#each safeMedia(post.media_json).slice(0, 3) as item}
                    <img src={item.url} alt="帖子图片" loading="lazy" />
                  {/each}
                </div>
              {/if}

              <div class="profile-post-card__footer">
                <span>{formatDate(post.created_at)}</span>
                <div>
                  <span>♥ {post.like_count || 0}</span>
                  <span>评论 {post.comment_count || 0}</span>
                </div>
              </div>
            </article>
          {/each}
        </div>
      {:else}
        <p class="profile-posts__empty">回头再来看看，这里还没有公开内容。</p>
      {/if}
    </section>
  {:else}
    <section class="route-shell profile-hero" aria-label="个人主页详情">
      <div class="profile-hero__content">
        <div class="profile-hero__topbar">
          <div>
            <p class="route-kicker">Profile detail</p>
            <h1>个人主页</h1>
            {#if data?.id}
              <div class="profile-hero__identity-line">
                <code>{data.id}</code>
              </div>
            {/if}
          </div>
          <a href="/community">返回社区</a>
        </div>

        <div class="profile-summary">
          <p>这个用户资料暂时没加载出来，但直接路由已经生效。</p>
        </div>
      </div>
    </section>
  {/if}
</section>

<style>
  .profile-page {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .profile-hero,
  .profile-editor,
  .profile-post-card,
  .profile-editor textarea,
  .profile-editor input {
    border: 1px solid rgba(255, 255, 255, 0.1);
    background:
      linear-gradient(145deg, rgba(var(--glow-primary-rgb), 0.12), rgba(var(--glow-secondary-rgb), 0.08)),
      rgba(var(--color-bg-rgb), 0.22);
    box-shadow:
      0 18px 40px rgba(var(--shadow-rgb), 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(16px);
  }

  .profile-hero {
    position: relative;
    overflow: hidden;
    min-height: 24rem;
  }

  .profile-hero__media,
  .profile-hero__overlay {
    position: absolute;
    inset: 0;
  }

  .profile-hero__media img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .profile-hero__overlay {
    background:
      linear-gradient(180deg, rgba(0, 0, 0, 0.12), rgba(var(--color-bg-rgb), 0.78)),
      radial-gradient(circle at top left, rgba(var(--glow-primary-rgb), 0.18), transparent 34%);
  }

  .profile-hero__content {
    position: relative;
    z-index: 1;
    display: flex;
    min-height: 100%;
    flex-direction: column;
    gap: 1.25rem;
  }

  .profile-hero__topbar,
  .profile-identity,
  .profile-actions,
  .profile-summary__badges,
  .profile-stats,
  .profile-editor__grid,
  .profile-editor__footer,
  .profile-post-card__footer {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
  }

  .profile-hero__topbar h1,
  .profile-editor h2,
  .profile-posts h2 {
    margin: 0.4rem 0 0;
    font-size: clamp(1.8rem, 4vw, 2.8rem);
    font-weight: 900;
    letter-spacing: -0.03em;
  }

  .profile-hero__identity-line {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-top: 0.75rem;
  }

  .profile-hero__identity-line strong {
    font-size: 1.1rem;
    font-weight: 900;
  }

  .profile-hero__identity-line code {
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    padding: 0.35rem 0.65rem;
  }

  .profile-hero__topbar > a,
  .profile-actions a,
  .profile-actions button,
  .profile-editor__footer button {
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    font: inherit;
    font-size: 0.75rem;
    font-weight: 900;
    letter-spacing: 0.16em;
    min-height: 2.7rem;
    padding: 0.75rem 1rem;
    text-transform: uppercase;
    transition: transform 0.18s ease, border-color 0.18s ease;
  }

  .profile-hero__topbar > a:hover,
  .profile-actions a:hover,
  .profile-actions button:hover,
  .profile-editor__footer button:hover {
    transform: translateY(-1px);
    border-color: rgba(var(--glow-primary-rgb), 0.24);
  }

  .profile-actions button.active {
    background: rgba(var(--glow-primary-rgb), 0.18);
    border-color: rgba(var(--glow-primary-rgb), 0.28);
  }

  .profile-avatar {
    width: clamp(5.5rem, 14vw, 8rem);
    height: clamp(5.5rem, 14vw, 8rem);
    overflow: hidden;
    border-radius: 2rem;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.08);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-size: clamp(2rem, 5vw, 3rem);
    font-weight: 900;
    color: var(--color-primary);
  }

  .profile-avatar img,
  .profile-post-card__media img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .profile-summary {
    min-width: 0;
    flex: 1;
  }

  .profile-summary p,
  .profile-post-card__body p,
  .profile-posts__empty,
  .profile-editor__footer p {
    line-height: 1.75;
    opacity: 0.86;
  }

  .profile-summary__badges span,
  .profile-stats strong,
  .profile-post-card__footer span,
  .profile-post-card__footer div {
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    padding: 0.35rem 0.65rem;
    font-size: 0.75rem;
    font-weight: 900;
  }

  .profile-editor label {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }

  .profile-editor textarea,
  .profile-editor input {
    width: 100%;
    color: inherit;
    border-radius: 1.4rem;
    padding: 0.95rem 1rem;
    outline: none;
  }

  .profile-editor textarea:focus,
  .profile-editor input:focus {
    border-color: rgba(var(--glow-primary-rgb), 0.32);
    box-shadow: 0 0 0 2px rgba(var(--glow-primary-rgb), 0.14);
  }

  .profile-editor textarea {
    min-height: 7rem;
    resize: vertical;
  }

  .profile-editor__grid {
    margin-top: 1rem;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    align-items: stretch;
  }

  .profile-editor__footer {
    margin-top: 1rem;
  }

  .profile-posts__grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
    margin-top: 1rem;
  }

  .profile-post-card {
    border-radius: 1.8rem;
    padding: 1rem;
  }

  .profile-post-card__body {
    display: block;
    border-radius: 1.4rem;
    background: rgba(255, 255, 255, 0.05);
    padding: 1rem;
    min-height: 7rem;
  }

  .profile-post-card__body p {
    margin: 0;
    white-space: pre-wrap;
  }

  .profile-post-card__media {
    display: grid;
    gap: 0.5rem;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-top: 0.85rem;
  }

  .profile-post-card__media img {
    aspect-ratio: 1 / 1;
    overflow: hidden;
    border-radius: 1rem;
  }

  .profile-post-card__footer {
    margin-top: 0.85rem;
    padding-top: 0.8rem;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .profile-post-card__footer div {
    display: inline-flex;
    gap: 0.55rem;
  }

  @media (max-width: 768px) {
    .profile-hero__topbar,
    .profile-actions,
    .profile-editor__footer,
    .profile-post-card__footer {
      align-items: stretch;
    }

    .profile-hero__topbar > a,
    .profile-actions > *,
    .profile-editor__footer > * {
      width: 100%;
      text-align: center;
      justify-content: center;
    }
  }
</style>
