<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import CommunityConsole from '../modals/CommunityConsole.svelte';
  import PostCard from './PostCard.svelte';
  import { isAuthenticated, user } from '../../stores/appState';
  import { openModal } from '../../stores/modalState';
  import { communityFetch } from '../../lib/communityApi';

  let profileData: any = null;
  let posts: any[] = [];
  let loadingProfile = false;
  let loadingPosts = false;
  let requestToken = 0;
  let lastLoadedUserId = '';

  async function loadPersonalSurface() {
    if (!$isAuthenticated || !$user?.id) {
      profileData = null;
      posts = [];
      return;
    }

    const currentToken = ++requestToken;
    loadingProfile = true;
    loadingPosts = true;

    try {
      const [profileRes, postsRes] = await Promise.all([
        communityFetch(`/api/community/profile?id=${encodeURIComponent($user.id)}`),
        communityFetch(`/api/community/posts?userId=${encodeURIComponent($user.id)}`)
      ]);

      const [profileJson, postsJson] = await Promise.all([profileRes.json(), postsRes.json()]);

      if (currentToken !== requestToken) return;

      profileData = profileJson?.ok ? profileJson.user || null : null;
      posts = postsJson?.ok && Array.isArray(postsJson.posts) ? postsJson.posts : [];
    } catch (error) {
      if (currentToken !== requestToken) return;
      console.error('Failed to load personal page', error);
      profileData = null;
      posts = [];
    } finally {
      if (currentToken === requestToken) {
        loadingProfile = false;
        loadingPosts = false;
      }
    }
  }

  function handlePostCreated() {
    void loadPersonalSurface();
  }

  onMount(() => {
    void loadPersonalSurface();
    window.addEventListener('post-created', handlePostCreated);
  });

  onDestroy(() => {
    window.removeEventListener('post-created', handlePostCreated);
  });

  $: if ($isAuthenticated && $user?.id && $user.id !== lastLoadedUserId) {
    lastLoadedUserId = $user.id;
    void loadPersonalSurface();
  }

  $: if ($isAuthenticated && $user?.id && profileData && (profileData.id === $user.id || profileData.user_id === $user.id)) {
    if (
      profileData.username !== $user.username ||
      profileData.signature !== $user.signature ||
      profileData.avatar_url !== $user.avatar_url ||
      profileData.background_url !== $user.background_url
    ) {
      profileData = {
        ...profileData,
        username: $user.username ?? profileData.username,
        signature: $user.signature ?? profileData.signature,
        avatar_url: $user.avatar_url ?? profileData.avatar_url,
        background_url: $user.background_url ?? profileData.background_url
      };
    }
  }
</script>

<section class="space-y-8 pb-24">
  <div class="personal-shell rounded-[36px] p-5 md:p-7">
    <div class="personal-shell__overlay"></div>
    <div class="relative z-[1]">
      <p class="text-[10px] font-black uppercase tracking-[0.28em] opacity-35">个人主页</p>
      <h1 class="mt-2 text-[2.4rem] font-black tracking-tight md:text-[3rem]">资料、主题和自己的动态都在这里</h1>
      <p class="mt-3 max-w-3xl text-sm font-medium leading-7 opacity-70 md:text-base">
        这里是新的个人页入口。资料编辑独立出来，消息和通知回到社区，不再和旧控制台混在一起。
      </p>
    </div>
  </div>

  {#if !$isAuthenticated}
    <section class="personal-panel rounded-[32px] p-6 md:p-8">
      <p class="text-[10px] font-black uppercase tracking-[0.24em] opacity-35">先登录</p>
      <h2 class="mt-3 text-3xl font-black tracking-tight">登录后再管理你的资料和内容</h2>
      <p class="mt-3 max-w-2xl text-sm font-medium leading-7 opacity-70">
        登录后可以编辑头像、背景图、签名，并查看自己发过的所有帖子。
      </p>
      <button
        type="button"
        on:click={() => openModal('auth')}
        class="personal-primary mt-5 rounded-full px-6 py-3 text-xs font-black uppercase tracking-[0.2em] text-[var(--color-bg)]"
      >
        登录 / 注册
      </button>
    </section>
  {:else}
    <section class="personal-account-grid grid gap-6">
      <div class="space-y-6">
        <div class="personal-panel rounded-[32px] p-6 md:p-8">
          <div class="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div class="flex items-center gap-4">
              <div class="personal-avatar h-20 w-20 overflow-hidden rounded-[28px]">
                {#if profileData?.avatar_url}
                  <img src={profileData.avatar_url} alt={profileData.username || 'avatar'} class="h-full w-full object-cover" />
                {:else}
                  <div class="flex h-full w-full items-center justify-center text-2xl font-black text-[var(--color-primary)]">
                    {$user?.username?.slice(0, 1)?.toUpperCase() || 'U'}
                  </div>
                {/if}
              </div>

              <div>
                <p class="text-[10px] font-black uppercase tracking-[0.24em] opacity-35">当前账号</p>
                <h2 class="mt-2 text-3xl font-black tracking-tight">{$user?.username || profileData?.username || 'User'}</h2>
                <p class="mt-2 max-w-xl text-sm font-medium leading-7 opacity-70">
                  {profileData?.signature || '还没有写签名，去右侧资料面板补一句吧。'}
                </p>
              </div>
            </div>

            <div class="grid grid-cols-3 gap-3 md:min-w-[18rem]">
              <article class="personal-stat rounded-[24px] p-4 text-center">
                <p class="text-[10px] font-black uppercase tracking-[0.22em] opacity-35">等级</p>
                <p class="mt-2 text-2xl font-black tracking-tight">{profileData?.level || $user?.level || 1}</p>
              </article>
              <article class="personal-stat rounded-[24px] p-4 text-center">
                <p class="text-[10px] font-black uppercase tracking-[0.22em] opacity-35">关注</p>
                <p class="mt-2 text-2xl font-black tracking-tight">{profileData?.following_count || 0}</p>
              </article>
              <article class="personal-stat rounded-[24px] p-4 text-center">
                <p class="text-[10px] font-black uppercase tracking-[0.22em] opacity-35">粉丝</p>
                <p class="mt-2 text-2xl font-black tracking-tight">{profileData?.followers_count || 0}</p>
              </article>
            </div>
          </div>
        </div>

        <div class="personal-panel rounded-[32px] p-6 md:p-8">
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="text-[10px] font-black uppercase tracking-[0.24em] opacity-35">我的动态</p>
              <h2 class="mt-2 text-2xl font-black tracking-tight">自己发过的内容</h2>
            </div>
            {#if loadingPosts}
              <span class="text-xs font-black uppercase tracking-[0.22em] opacity-35">同步中</span>
            {/if}
          </div>

          {#if loadingPosts}
            <div class="mt-6 grid gap-4 md:grid-cols-2">
              {#each Array(4) as _}
                <div class="h-56 animate-pulse rounded-[28px] bg-white/5 border border-white/10"></div>
              {/each}
            </div>
          {:else if posts.length > 0}
            <div class="mt-6 grid gap-5 md:grid-cols-2">
              {#each posts as post (post.id)}
                <PostCard {post} />
              {/each}
            </div>
          {:else}
            <div class="mt-6 rounded-[28px] border border-white/10 bg-white/5 px-5 py-8 text-center text-sm font-medium opacity-70">
              这里还没有你发过的内容。去社区写点新的吧。
            </div>
          {/if}
        </div>
      </div>

      <div class="space-y-6">
        <div class="personal-panel rounded-[32px] p-6 md:p-8">
          <p class="text-[10px] font-black uppercase tracking-[0.24em] opacity-35">资料编辑</p>
          <h2 class="mt-2 text-2xl font-black tracking-tight">账号设置</h2>
          <p class="mt-3 text-sm font-medium leading-7 opacity-70">
            头像、背景图和签名都在这里改，改完会同步回整个社区。
          </p>
        </div>

        <CommunityConsole embedded={true} accountOnly={true} defaultTab="account" />
      </div>
    </section>
  {/if}
</section>

<style>
  .personal-shell,
  .personal-panel {
    position: relative;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background:
      radial-gradient(circle at 14% 0%, rgba(var(--glow-primary-rgb), 0.13), transparent 34%),
      radial-gradient(circle at 88% 12%, rgba(var(--glow-secondary-rgb), 0.09), transparent 30%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.055), rgba(var(--color-bg-rgb), 0.16)),
      rgba(var(--color-bg-rgb), 0.2);
    box-shadow:
      0 20px 48px rgba(var(--shadow-rgb), 0.14),
      inset 0 1px 0 rgba(255, 255, 255, 0.14),
      inset 0 -1px 0 rgba(0, 0, 0, 0.05);
    backdrop-filter: blur(18px) saturate(1.08);
  }

  .personal-shell__overlay {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle at top left, rgba(var(--glow-primary-rgb), 0.18), transparent 36%),
      radial-gradient(circle at 82% 18%, rgba(var(--glow-secondary-rgb), 0.12), transparent 28%);
    opacity: 0.9;
    pointer-events: none;
  }

  .personal-avatar,
  .personal-stat {
    border: 1px solid rgba(255, 255, 255, 0.12);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(var(--color-bg-rgb), 0.08)),
      rgba(var(--color-bg-rgb), 0.14);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
  }

  .personal-primary {
    background:
      radial-gradient(circle at top left, rgba(255, 255, 255, 0.26), transparent 38%),
      linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 86%, white 14%), var(--color-primary));
    box-shadow:
      0 16px 30px rgba(var(--shadow-rgb), 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.24);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }

  .personal-primary:hover {
    transform: translateY(-1px);
    box-shadow:
      0 20px 36px rgba(var(--shadow-rgb), 0.24),
      inset 0 1px 0 rgba(255, 255, 255, 0.26);
  }

  .personal-shell,
  .personal-panel {
    border-color: var(--hairline);
    background: var(--surface);
    color: var(--ink);
    box-shadow: 0 18px 50px rgba(var(--shadow-rgb), 0.055);
    backdrop-filter: none;
  }

  .personal-shell__overlay {
    display: none;
  }

  .personal-avatar,
  .personal-stat {
    border-color: var(--hairline);
    background: var(--paper);
    box-shadow: none;
  }

  .personal-primary {
    background: var(--clay);
    color: var(--paper);
    box-shadow: none;
  }

  .personal-primary:hover {
    background: #b5664c;
    box-shadow: none;
  }

  .personal-panel :global(.bg-white\/5) {
    background: var(--paper) !important;
  }

  .personal-panel :global(.border-white\/10) {
    border-color: var(--hairline) !important;
  }

  @media (min-width: 1280px) {
    .personal-account-grid {
      grid-template-columns: minmax(0, 1fr) minmax(28rem, 0.82fr);
      align-items: start;
    }
  }

  @media (min-width: 1536px) {
    .personal-account-grid {
      grid-template-columns: minmax(0, 1.04fr) minmax(30rem, 0.8fr);
    }
  }
</style>
