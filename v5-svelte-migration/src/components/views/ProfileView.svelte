<script lang="ts">
  import { fly } from 'svelte/transition';
  import { onMount, onDestroy } from 'svelte';
  import { tick } from 'svelte';
  import { currentView, selectedProfile, isAuthenticated, user, clearSelectedProfile } from '../../stores/appState';
  import { openModal } from '../../stores/modalState';
  import PostCard from './PostCard.svelte';
  import { communityFetch, persistCommunitySession } from '../../lib/communityApi';
  import { setCommunityConsoleState } from '../../stores/communityConsoleState';

  let posts: any[] = [];
  let loading = true;
  let isFollowing = false;
  let followerCount = 0;
  let followingCount = 0;
  let profileScrollEl: HTMLDivElement;
  let profileSurfaceEl: HTMLDivElement;
  let lastProfileId = '';
  let profileRequestToken = 0;
  let postsRequestToken = 0;

  let uploadingAvatar = false;
  let uploadingBackground = false;

  $: viewedProfileUserId = $selectedProfile?.id || $selectedProfile?.user_id || '';
  $: isOwnProfile = Boolean($isAuthenticated && $user?.id && viewedProfileUserId && $user.id === viewedProfileUserId);
  $: currentProfileId = $selectedProfile?.id || $selectedProfile?.user_id || '';

  function resetProfileSurface() {
    posts = [];
    loading = true;
    isFollowing = false;
    followerCount = 0;
    followingCount = 0;
    uploadingAvatar = false;
    uploadingBackground = false;
  }

  function primeProfileSurface() {
    isFollowing = Boolean($selectedProfile?.viewer_is_following);
    followerCount = Number($selectedProfile?.followers_count || 0);
    followingCount = Number($selectedProfile?.following_count || 0);
    loading = true;
  }

  function syncProfileSurface(patch: Record<string, unknown>) {
    if ($selectedProfile) {
      selectedProfile.set({
        ...$selectedProfile,
        ...patch
      });
    }

    if ($user && $user.id === viewedProfileUserId) {
      const nextUser = {
        ...$user,
        ...patch
      };
      user.set(nextUser);
      persistCommunitySession(nextUser);
    }
  }

  async function saveProfileMedia(patch: { avatar_url?: string; background_url?: string }) {
    const signature = String($selectedProfile?.signature || $user?.signature || '');
    const avatar_url = String(patch.avatar_url ?? $selectedProfile?.avatar_url ?? $user?.avatar_url ?? '');
    const background_url = String(patch.background_url ?? $selectedProfile?.background_url ?? $user?.background_url ?? '');

    const res = await communityFetch('/api/community/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signature,
        avatar_url,
        background_url
      })
    });

    const data = await res.json();
    if (!data.ok) {
      throw new Error(data.msg || '资料保存失败');
    }

    syncProfileSurface({
      avatar_url,
      background_url,
      signature
    });
  }

  async function handleAvatarUpload(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    uploadingAvatar = true;
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await communityFetch('/api/community/drive/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.ok && data.file?.url) {
        await saveProfileMedia({ avatar_url: data.file.url });
      }
    } catch (e) {
      console.error(e);
    } finally {
      uploadingAvatar = false;
      input.value = '';
    }
  }

  async function handleBackgroundUpload(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    uploadingBackground = true;
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await communityFetch('/api/community/drive/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.ok && data.file?.url) {
        await saveProfileMedia({ background_url: data.file.url });
      }
    } catch (e) {
      console.error(e);
    } finally {
      uploadingBackground = false;
      input.value = '';
    }
  }


  $: if (currentProfileId && currentProfileId !== lastProfileId) {
    lastProfileId = currentProfileId;
    primeProfileSurface();
    void refreshProfileSurface();
  }

  $: if (!currentProfileId) {
    lastProfileId = '';
    profileRequestToken += 1;
    postsRequestToken += 1;
    resetProfileSurface();
  }

  async function refreshProfileSurface() {
    await tick();
    scrollProfileToTop();
    profileSurfaceEl?.focus();
    await Promise.all([fetchProfileData(), fetchUserPosts()]);
  }

  function handlePostUpdated(event: Event) {
    const customEvent = event as CustomEvent<{ id?: string; patch?: Record<string, unknown> }>;
    const postId = String(customEvent.detail?.id || '');
    const patch = customEvent.detail?.patch;
    if (!postId || !patch) return;
    posts = posts.map((item) => item.id === postId ? { ...item, ...patch } : item);
  }

  onMount(() => {
    window.addEventListener('community-post-updated', handlePostUpdated as EventListener);
    tick().then(() => profileSurfaceEl?.focus());
  });

  onDestroy(() => {
    window.removeEventListener('community-post-updated', handlePostUpdated as EventListener);
  });

  function scrollProfileToTop() {
    profileScrollEl?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  }

  async function fetchProfileData() {
    if (!$selectedProfile) return;
    const requestToken = ++profileRequestToken;
    const profileId = $selectedProfile.id || $selectedProfile.user_id;
    try {
      const res = await communityFetch(`/api/community/profile?id=${profileId}`);
      const data = await res.json();
      if (data.ok && requestToken === profileRequestToken && currentProfileId === profileId) {
        const nextUser = data.user || {};
        selectedProfile.set({
          ...$selectedProfile,
          ...nextUser
        });
        isFollowing = Boolean(nextUser.viewer_is_following);
        followerCount = nextUser.followers_count || 0;
        followingCount = nextUser.following_count || 0;
      }
    } catch (e) {
      console.error('Failed to fetch profile', e);
    }
  }

  async function fetchUserPosts() {
    if (!$selectedProfile) return;
    const requestToken = ++postsRequestToken;
    const profileId = $selectedProfile.id || $selectedProfile.user_id;
    loading = true;
    try {
      const res = await communityFetch(`/api/community/posts?userId=${profileId}`);
      const data = await res.json();
      if (data.ok && requestToken === postsRequestToken && currentProfileId === profileId) {
        posts = Array.isArray(data.posts) ? data.posts : [];
      }
    } catch (e) {
      if (requestToken === postsRequestToken && currentProfileId === profileId) {
        posts = [];
      }
      console.error('Failed to fetch user posts', e);
    } finally {
      if (requestToken === postsRequestToken && currentProfileId === profileId) {
        loading = false;
      }
    }
  }

  async function toggleFollow() {
    if (!$isAuthenticated) {
      openModal('auth');
      return;
    }
    try {
      const res = await communityFetch('/api/community/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ following_id: $selectedProfile.id || $selectedProfile.user_id })
      });
      const data = await res.json();
      if (data.ok) {
        isFollowing = data.action === 'followed';
        followerCount = Math.max(0, followerCount + (isFollowing ? 1 : -1));
        syncProfileSurface({
          viewer_is_following: isFollowing,
          followers_count: followerCount,
          following_count: followingCount
        });
      }
    } catch (e) {
      console.error('Follow failed', e);
    }
  }

  async function startDirectChat() {
    if (!$isAuthenticated) {
      openModal('auth');
      return;
    }
    if (!$selectedProfile) return;

    try {
      const res = await communityFetch('/api/community/chats/direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_user_id: $selectedProfile.id || $selectedProfile.user_id })
      });
      const data = await res.json();
      if (!data.ok) return;

      setCommunityConsoleState({
        tab: 'chats',
        conversationId: data.conversation?.id || ''
      });
      clearSelectedProfile();
      currentView.set('console');
    } catch (e) {
      console.error('Direct chat failed', e);
    }
  }

  function close() {
    clearSelectedProfile();
  }

  function handleOverlayKeydown(event: KeyboardEvent) {
    if (!$selectedProfile || event.key !== 'Escape') {
      return;
    }

    event.preventDefault();
    close();
  }
</script>

<svelte:window on:keydown={handleOverlayKeydown} />

{#if $selectedProfile}
  <div
    bind:this={profileSurfaceEl}
    class="fixed inset-0 z-[7000] overflow-hidden bg-[var(--color-bg)]/92 backdrop-blur-md"
    role="dialog"
    aria-modal="true"
    aria-label={`${$selectedProfile.username || '用户'} 的个人主页`}
    tabindex="-1"
    transition:fly={{ y: 100, duration: 600, easing: (t) => t * (2 - t) }}
  >
    <div bind:this={profileScrollEl} class="h-full overflow-y-auto px-4 pb-16 pt-6 sm:px-6 sm:pb-20 sm:pt-8 md:px-10 lg:px-12">
      <div class="mx-auto max-w-5xl">
        <section class="profile-shell overflow-hidden rounded-[32px] md:rounded-[40px]">
          <div class="profile-hero relative min-h-[19rem] sm:min-h-[22rem] md:min-h-[26rem]">
            {#if $selectedProfile.background_url}
              <img src={$selectedProfile.background_url} alt="Background" class="absolute inset-0 h-full w-full object-cover" />
            {:else}
              <div class="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_36%),linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02)),linear-gradient(160deg,#0d1330,#1f2947_55%,#121828)] opacity-95"></div>
            {/if}

            <div class="absolute inset-0 bg-gradient-to-b from-black/18 via-black/18 to-[var(--color-bg)]/92"></div>
            <div class="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/18 to-transparent"></div>

            <div class="relative z-[1] flex min-h-[inherit] flex-col p-4 sm:p-6 md:p-8">
              <div class="flex items-start justify-between gap-4">
                <button
                  on:click={close}
                  class="profile-hero__control inline-flex h-12 w-12 items-center justify-center rounded-full text-white transition-transform hover:scale-105"
                  aria-label="关闭个人主页"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                </button>

                <div class="flex flex-wrap justify-end gap-2.5">
                  {#if $selectedProfile.background_url}
                    <a
                      href={$selectedProfile.background_url}
                      target="_blank"
                      rel="noreferrer"
                      class="profile-hero__control inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/80 transition-transform hover:scale-[1.02]"
                    >
                      查看壁纸
                    </a>
                  {/if}
                </div>
              </div>

              <div class="mt-auto pt-16 sm:pt-20 md:pt-24">
                <div class="profile-identity-card rounded-[30px] p-4 sm:p-5 md:p-6">
                  <div class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-5 md:gap-6">
                      <div class="profile-avatar-frame relative h-28 w-28 overflow-hidden rounded-[32px] p-2 shadow-2xl sm:h-32 sm:w-32 md:h-40 md:w-40 md:rounded-[42px]">
                        <div class="flex h-full w-full items-center justify-center overflow-hidden rounded-[24px] bg-white/5 md:rounded-[34px]">
                          {#if $selectedProfile.avatar_url}
                            <img src={$selectedProfile.avatar_url} alt="Avatar" class="h-full w-full object-cover" />
                          {:else}
                            <span class="text-4xl font-black text-[var(--color-primary)]">
                              {$selectedProfile.username?.slice(0, 1).toUpperCase()}
                            </span>
                          {/if}
                        </div>
                        {#if isOwnProfile}
                          <label class="profile-avatar-action absolute bottom-2 right-2 z-10 flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-full px-3 text-[11px] font-black text-white transition-transform hover:scale-105 md:bottom-3 md:right-3">
                            {uploadingAvatar ? '上传中' : '更换'}
                            <input type="file" accept="image/*" class="absolute inset-0 h-full w-full cursor-pointer opacity-0" on:change={handleAvatarUpload} disabled={uploadingAvatar} />
                          </label>
                        {/if}
                      </div>

                      <div class="min-w-0 text-white">
                        <p class="text-[10px] font-black uppercase tracking-[0.24em] text-white/52">个人主页</p>
                        <h1 class="mt-2 break-words text-3xl font-black tracking-tighter sm:text-4xl md:text-5xl">{$selectedProfile.username}</h1>
                        <div class="mt-3 flex flex-wrap items-center gap-2.5 text-[11px] font-black uppercase tracking-[0.18em] text-white/62">
                          <span class="rounded-full border border-white/10 bg-white/8 px-3 py-1.5">
                            {#if $selectedProfile.background_url}
                              当前壁纸已启用
                            {:else}
                              使用默认背景
                            {/if}
                          </span>
                          <span class="rounded-full border border-white/10 bg-white/8 px-3 py-1.5">
                            LV.{$selectedProfile.level || 1} · XP.{$selectedProfile.xp || 0}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div class="flex flex-wrap items-center gap-2.5 lg:max-w-[22rem] lg:justify-end">
                      {#if isOwnProfile}
                        <label class="profile-identity-chip relative inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-transform hover:scale-[1.02]">
                          {uploadingAvatar ? '头像上传中' : '上传头像'}
                          <input type="file" accept="image/*" class="absolute inset-0 h-full w-full cursor-pointer opacity-0" on:change={handleAvatarUpload} disabled={uploadingAvatar} />
                        </label>
                        <label class="profile-identity-chip relative inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-transform hover:scale-[1.02]">
                          {uploadingBackground ? '壁纸上传中' : '上传壁纸'}
                          <input type="file" accept="image/*" class="absolute inset-0 h-full w-full cursor-pointer opacity-0" on:change={handleBackgroundUpload} disabled={uploadingBackground} />
                        </label>
                      {/if}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div class="mx-auto max-w-4xl px-1 pt-6 sm:pt-8 md:pt-10">
          <div class="profile-summary-panel mb-10 rounded-[30px] p-5 sm:p-6">
            <div class="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
              <div class="flex-1">
                <div class="mb-2 flex flex-wrap items-center gap-3">
                  <h2 class="text-3xl font-black tracking-tighter sm:text-4xl">{$selectedProfile.username}</h2>
                  {#if $selectedProfile.role === 'admin'}
                    <span class="rounded-lg bg-[var(--color-primary)] px-2 py-1 text-[10px] font-black uppercase tracking-widest text-white">管理员</span>
                  {/if}
                </div>
                <p class="max-w-2xl text-base font-medium leading-relaxed opacity-72">
                  {$selectedProfile.signature || '这个人还没写自我介绍。'}
                </p>
              </div>

              <div class="flex flex-wrap items-center gap-3 sm:gap-5">
                <div class="profile-stat-chip text-center">
                  <p class="text-2xl font-black tracking-tighter">{followingCount}</p>
                  <p class="text-[10px] font-black uppercase tracking-widest opacity-35">关注中</p>
                </div>
                <div class="profile-stat-chip text-center">
                  <p class="text-2xl font-black tracking-tighter">{followerCount}</p>
                  <p class="text-[10px] font-black uppercase tracking-widest opacity-35">关注者</p>
                </div>

                {#if $user && $user.id !== ($selectedProfile.id || $selectedProfile.user_id)}
                  <div class="flex flex-wrap gap-3 sm:ml-2">
                    <button
                      on:click={startDirectChat}
                      class="profile-action-button rounded-2xl px-6 py-3 text-sm font-black uppercase tracking-[0.18em] transition-all hover:-translate-y-0.5"
                    >
                      打个招呼
                    </button>
                    <button
                      on:click={toggleFollow}
                      class:is-active={!isFollowing}
                      class="profile-action-button rounded-2xl px-6 py-3 text-sm font-black uppercase tracking-[0.18em] transition-all hover:-translate-y-0.5"
                    >
                      {isFollowing ? '取消关注' : '关注一下'}
                    </button>
                  </div>
                {/if}
              </div>
            </div>
          </div>

          <section class="mb-10 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
            <div class="profile-info-card rounded-[28px] p-5">
              <p class="text-[10px] font-black uppercase tracking-[0.22em] opacity-35">个性签名</p>
              <p class="mt-3 text-sm font-medium leading-7 opacity-75 sm:text-base">
                {$selectedProfile.signature || '这里还没有留下自定义签名。'}
              </p>
            </div>

            <div class="profile-info-card rounded-[28px] p-5">
              <p class="text-[10px] font-black uppercase tracking-[0.22em] opacity-35">主页壁纸</p>
              <p class="mt-3 text-sm font-medium leading-7 opacity-70">
                {#if $selectedProfile.background_url}
                  这张壁纸会作为个人主页头图显示，点击顶部按钮可以单独打开查看。
                {:else}
                  还没设置自定义壁纸，现在展示的是默认背景。
                {/if}
              </p>
            </div>
          </section>

          <div class="space-y-8">
            <h3 class="border-b border-neutral-100 pb-4 text-xl font-black uppercase tracking-tighter dark:border-neutral-900">
              发过的内容
              <span class="ml-2 text-sm opacity-30">({posts.length})</span>
            </h3>

            {#if loading}
              <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
                {#each Array(4) as _}
                  <div class="h-64 rounded-[32px] border border-white/5 bg-white/5 animate-pulse"></div>
                {/each}
              </div>
            {:else if posts.length > 0}
              <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
                {#each posts as post (post.id)}
                  <PostCard {post} />
                {/each}
              </div>
            {:else}
              <div class="py-24 text-center text-sm font-black uppercase tracking-widest opacity-20">
                这里暂时还没有公开内容。
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .profile-shell,
  .profile-summary-panel,
  .profile-info-card {
    border: 1px solid rgba(var(--glow-primary-rgb), 0.14);
    background:
      linear-gradient(145deg, rgba(var(--glow-primary-rgb), 0.14), rgba(var(--glow-secondary-rgb), 0.08)),
      linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(var(--color-bg-rgb), 0.18)),
      rgba(var(--color-bg-rgb), 0.3);
    box-shadow:
      0 22px 54px rgba(var(--shadow-rgb), 0.16),
      inset 0 1px 0 rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(18px) saturate(1.05);
  }

  .profile-hero__control,
  .profile-identity-chip,
  .profile-stat-chip,
  .profile-action-button,
  .profile-avatar-action,
  .profile-identity-card {
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow:
      0 14px 30px rgba(var(--shadow-rgb), 0.14),
      inset 0 1px 0 rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(18px) saturate(1.06);
  }

  .profile-hero__control,
  .profile-identity-chip,
  .profile-stat-chip,
  .profile-action-button,
  .profile-avatar-action {
    background:
      linear-gradient(145deg, rgba(var(--glow-primary-rgb), 0.14), rgba(var(--glow-secondary-rgb), 0.08)),
      rgba(var(--color-bg-rgb), 0.22);
  }

  .profile-identity-card {
    background:
      linear-gradient(160deg, rgba(8, 10, 20, 0.16), rgba(var(--color-bg-rgb), 0.4)),
      rgba(var(--color-bg-rgb), 0.18);
  }

  .profile-avatar-frame {
    border: 1px solid rgba(255, 255, 255, 0.16);
    background:
      linear-gradient(145deg, rgba(var(--glow-primary-rgb), 0.2), rgba(var(--glow-secondary-rgb), 0.1)),
      rgba(var(--color-bg-rgb), 0.24);
    box-shadow:
      0 24px 42px rgba(var(--shadow-rgb), 0.18),
      inset 0 1px 0 rgba(255, 255, 255, 0.14);
    backdrop-filter: blur(20px) saturate(1.08);
  }

  .profile-action-button.is-active {
    background: var(--color-primary);
    border-color: rgba(var(--glow-primary-rgb), 0.34);
    box-shadow:
      0 18px 36px rgba(var(--shadow-rgb), 0.18),
      0 10px 24px rgba(var(--glow-primary-rgb), 0.18),
      inset 0 1px 0 rgba(255, 255, 255, 0.16);
    color: white;
  }

  @media (max-width: 640px) {
    .profile-summary-panel {
      padding: 1.25rem;
    }
  }
</style>
