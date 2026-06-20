<script lang="ts">
  import { fly } from 'svelte/transition';
  import { onMount, onDestroy } from 'svelte';
  import { tick } from 'svelte';
  import { selectedProfile, isAuthenticated, user, clearSelectedProfile } from '../../stores/appState';
  import { openModal } from '../../stores/modalState';
  import PostCard from './PostCard.svelte';
  import {
    COMMUNITY_MEDIA_UPLOAD_ENDPOINT,
    communityFetch,
    normalizeCommunityMediaUrl,
    persistCommunitySession
  } from '../../lib/communityApi';
  import { closeCommunitySurface } from '../../lib/communityNavigation';
  import { softReveal } from '../../lib/motion';

  let posts: any[] = [];
  let loading = true;
  let isFollowing = false;
  let followerCount = 0;
  let followingCount = 0;
  let profileScrollEl: HTMLDivElement;
  let profileSurfaceEl: HTMLDivElement;
  let lastProfileId = '';
  let lastProfileOpenToken = '';
  let profileRequestToken = 0;
  let postsRequestToken = 0;

  let uploadingAvatar = false;
  let uploadingBackground = false;
  let togglingFollow = false;

  let editingSignature = false;
  let signatureInput = '';
  let savingSignature = false;

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
    togglingFollow = false;
    editingSignature = false;
    signatureInput = '';
  }

  function primeProfileSurface() {
    isFollowing = Boolean($selectedProfile?.viewer_is_following);
    followerCount = Number($selectedProfile?.followers_count || 0);
    followingCount = Number($selectedProfile?.following_count || 0);
    signatureInput = $selectedProfile?.signature || '';
    editingSignature = false;
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

  async function saveProfileMedia(patch: { avatar_url?: string; background_url?: string; signature?: string }) {
    const signature = patch.signature !== undefined ? patch.signature : String($selectedProfile?.signature || $user?.signature || '');
    const avatar_url = String(normalizeCommunityMediaUrl(patch.avatar_url ?? $selectedProfile?.avatar_url ?? $user?.avatar_url) || '');
    const background_url = String(normalizeCommunityMediaUrl(patch.background_url ?? $selectedProfile?.background_url ?? $user?.background_url) || '');

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

    syncProfileSurface(data.user || {
      avatar_url,
      background_url,
      signature
    });
  }

  async function saveSignature() {
    if (!isOwnProfile || savingSignature || signatureInput === ($selectedProfile?.signature || '')) {
      editingSignature = false;
      return;
    }
    savingSignature = true;
    try {
      await saveProfileMedia({ signature: signatureInput });
      editingSignature = false;
    } catch (e) {
      console.error(e);
      alert('签名保存失败');
    } finally {
      savingSignature = false;
    }
  }

  function logout() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('commUser');
    }
    user.set(null);
    isAuthenticated.set(false);
    isAdmin.set(false);
    selectedProfile.set(null);
  }

  async function handleAvatarUpload(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    uploadingAvatar = true;
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await communityFetch(COMMUNITY_MEDIA_UPLOAD_ENDPOINT, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.ok && data.file?.url) {
        await saveProfileMedia({ avatar_url: normalizeCommunityMediaUrl(data.file.url) || data.file.url });
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
      const res = await communityFetch(COMMUNITY_MEDIA_UPLOAD_ENDPOINT, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.ok && data.file?.url) {
        await saveProfileMedia({ background_url: normalizeCommunityMediaUrl(data.file.url) || data.file.url });
      }
    } catch (e) {
      console.error(e);
    } finally {
      uploadingBackground = false;
      input.value = '';
    }
  }


  $: profileOpenToken = currentProfileId ? `${currentProfileId}:${$selectedProfile?.__openedAt || ''}` : '';

  $: if (currentProfileId && profileOpenToken !== lastProfileOpenToken) {
    lastProfileId = currentProfileId;
    lastProfileOpenToken = profileOpenToken;
    primeProfileSurface();
    void refreshProfileSurface();
  }

  $: if (!currentProfileId) {
    lastProfileId = '';
    lastProfileOpenToken = '';
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

  function handlePostDeleted(event: Event) {
    const customEvent = event as CustomEvent<{ id?: string }>;
    const postId = String(customEvent.detail?.id || '');
    if (!postId) return;
    posts = posts.filter((item) => item.id !== postId);
  }

  onMount(() => {
    window.addEventListener('community-post-updated', handlePostUpdated as EventListener);
    window.addEventListener('community-post-deleted', handlePostDeleted as EventListener);
    tick().then(() => profileSurfaceEl?.focus());
  });

  onDestroy(() => {
    window.removeEventListener('community-post-updated', handlePostUpdated as EventListener);
    window.removeEventListener('community-post-deleted', handlePostDeleted as EventListener);
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
    const profileId = String($selectedProfile.id || $selectedProfile.user_id || '');
    if (!profileId) return;
    try {
      const res = await communityFetch(`/api/community/profile?id=${encodeURIComponent(profileId)}`);
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
    const profileId = String($selectedProfile.id || $selectedProfile.user_id || '');
    if (!profileId) return;
    loading = true;
    try {
      const res = await communityFetch(`/api/community/posts?userId=${encodeURIComponent(profileId)}`);
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
    const profileId = $selectedProfile?.id || $selectedProfile?.user_id;
    if (!profileId || togglingFollow) return;

    togglingFollow = true;
    try {
      const res = await communityFetch('/api/community/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ following_id: profileId })
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
        await fetchProfileData();
      }
    } catch (e) {
      console.error('Follow failed', e);
    } finally {
      togglingFollow = false;
    }
  }

  function close() {
    closeCommunitySurface(() => clearSelectedProfile());
  }

  function handleOverlayKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }
</script>

{#if $selectedProfile}
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <div
    bind:this={profileSurfaceEl}
    data-testid="profile-view"
    class="profile-overlay"
    role="dialog"
    aria-modal="true"
    aria-label={`${$selectedProfile.username || '用户'} 的个人主页`}
    tabindex="-1"
    on:keydown={handleOverlayKeydown}
    transition:softReveal={{ y: 22, duration: 300, startScale: 0.988, blur: 6 }}
  >
    <div bind:this={profileScrollEl} class="h-full overflow-y-auto px-4 pb-16 pt-6 sm:px-6 sm:pb-20 sm:pt-8 md:px-10 lg:px-12">
      <div class="mx-auto max-w-5xl">
        <section class="profile-shell overflow-hidden rounded-[32px] md:rounded-[40px] bg-[var(--paper)]">
          <div class="profile-hero relative min-h-[12rem] sm:min-h-[16rem] md:min-h-[20rem]">
            {#if $selectedProfile.background_url}
              <img src={$selectedProfile.background_url} alt="Background" class="absolute inset-0 h-full w-full object-cover" />
            {:else}
              <div class="profile-default-cover absolute inset-0"></div>
            {/if}

            <div class="profile-cover-top absolute inset-x-0 top-0 h-24 pointer-events-none"></div>

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

            </div>
          </div>

          <div class="profile-identity-card px-4 pb-6 pt-0 sm:px-6 sm:pb-8 md:px-8 md:pb-10">
            <div class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-5 md:gap-6">
                <div class="profile-avatar-frame relative -mt-12 h-28 w-28 overflow-hidden rounded-[32px] p-2 shadow-xl sm:-mt-16 sm:h-32 sm:w-32 md:-mt-20 md:h-40 md:w-40 md:rounded-[42px] z-10 bg-[var(--paper)]">
                  <div class="flex h-full w-full items-center justify-center overflow-hidden rounded-[24px] bg-[var(--clay-light)] md:rounded-[34px]">
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

                <div class="min-w-0 pb-2">
                  <p class="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--ink-soft)]">个人主页</p>
                  <h1 class="mt-1 break-words text-3xl font-black tracking-tighter text-[var(--ink)] sm:text-4xl md:text-5xl">{$selectedProfile.username}</h1>
                  <div class="mt-3 flex flex-wrap items-center gap-2.5 text-[11px] font-black uppercase tracking-[0.18em] text-[var(--ink-soft)]">
                    <span class="rounded-full border border-[var(--clay)] bg-[var(--clay-light)] px-3 py-1.5">
                      {#if $selectedProfile.background_url}
                        当前壁纸已启用
                      {:else}
                        使用默认背景
                      {/if}
                    </span>
                    <span class="rounded-full border border-[var(--clay)] bg-[var(--clay-light)] px-3 py-1.5">
                      LV.{$selectedProfile.level || 1} · XP.{$selectedProfile.xp || 0}
                    </span>
                  </div>
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-2.5 lg:max-w-[22rem] lg:justify-end pb-2">
                {#if isOwnProfile}
                  <label class="relative inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-[var(--clay)] bg-[var(--clay-light)] px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--ink)] transition-transform hover:scale-[1.02]">
                    {uploadingAvatar ? '头像上传中' : '上传头像'}
                    <input type="file" accept="image/*" class="absolute inset-0 h-full w-full cursor-pointer opacity-0" on:change={handleAvatarUpload} disabled={uploadingAvatar} />
                  </label>
                  <label class="relative inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-[var(--clay)] bg-[var(--clay-light)] px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--ink)] transition-transform hover:scale-[1.02]">
                    {uploadingBackground ? '壁纸上传中' : '上传壁纸'}
                    <input type="file" accept="image/*" class="absolute inset-0 h-full w-full cursor-pointer opacity-0" on:change={handleBackgroundUpload} disabled={uploadingBackground} />
                  </label>
                  <button class="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-red-400/20 bg-red-50 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-red-500 transition-transform hover:scale-[1.02]" on:click={logout}>
                    退出登录
                  </button>
                {/if}
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
                      on:click={toggleFollow}
                      disabled={togglingFollow}
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
              {#if isOwnProfile}
                {#if editingSignature}
                  <textarea
                    bind:value={signatureInput}
                    class="mt-3 w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-sm font-medium leading-7 opacity-90 outline-none transition-colors focus:border-white/30"
                    placeholder="写点什么介绍自己..."
                    rows="3"
                    disabled={savingSignature}
                  ></textarea>
                  <div class="mt-3 flex justify-end gap-2">
                    <button class="rounded-full px-4 py-1.5 text-[10px] font-black uppercase tracking-widest opacity-50 hover:bg-white/5 hover:opacity-100" on:click={() => { editingSignature = false; signatureInput = $selectedProfile.signature || ''; }} disabled={savingSignature}>取消</button>
                    <button class="rounded-full bg-white/10 px-4 py-1.5 text-[10px] font-black uppercase tracking-widest opacity-80 hover:bg-white/20 hover:opacity-100" on:click={saveSignature} disabled={savingSignature}>{savingSignature ? '保存中...' : '保存'}</button>
                  </div>
                {:else}
                  <div class="group relative mt-3">
                    <p class="text-sm font-medium leading-7 opacity-75 sm:text-base">
                      {$selectedProfile.signature || '这里还没有留下自定义签名。'}
                    </p>
                    <button class="absolute -right-2 -top-2 rounded-full p-2 opacity-0 transition-opacity hover:bg-white/5 group-hover:opacity-100" on:click={() => editingSignature = true} aria-label="编辑签名" disabled={savingSignature}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                  </div>
                {/if}
              {:else}
                <p class="mt-3 text-sm font-medium leading-7 opacity-75 sm:text-base">
                  {$selectedProfile.signature || '这里还没有留下自定义签名。'}
                </p>
              {/if}
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
            <h3 class="border-b border-neutral-100 pb-4 text-xl font-black uppercase tracking-tighter">
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
  .profile-overlay {
    position: fixed;
    inset: 0;
    z-index: 11000;
    overflow: hidden;
    isolation: isolate;
    background: var(--paper);
    color: var(--ink);
  }

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
  .profile-avatar-action {
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



  .profile-action-button.is-active {
    background: var(--color-primary);
    border-color: rgba(var(--glow-primary-rgb), 0.34);
    box-shadow:
      0 18px 36px rgba(var(--shadow-rgb), 0.18),
      0 10px 24px rgba(var(--glow-primary-rgb), 0.18),
      inset 0 1px 0 rgba(255, 255, 255, 0.16);
    color: white;
  }

  .profile-shell,
  .profile-summary-panel,
  .profile-info-card,
  .profile-stat-chip,
  .profile-hero__control,
  .profile-identity-chip,
  .profile-avatar-action {
    border-color: var(--hairline);
    background: var(--surface);
    color: var(--ink);
    box-shadow: 0 18px 50px rgba(var(--shadow-rgb), 0.055);
    backdrop-filter: none;
  }

  .profile-hero {
    background: var(--paper);
  }

  .profile-default-cover {
    background:
      linear-gradient(180deg, rgba(250, 249, 245, 0.94), rgba(240, 238, 230, 0.96)),
      repeating-linear-gradient(90deg, rgba(25, 25, 25, 0.035) 0 1px, transparent 1px 64px);
  }

  .profile-cover-top {
    background: linear-gradient(180deg, rgba(250, 249, 245, 0.64), rgba(250, 249, 245, 0));
  }

  .profile-shell :global([class*=text-white]),
  .profile-shell :global([class*=text-red]),
  .profile-summary-panel :global([class*=text-white]) {
    color: var(--ink) !important;
  }

  .profile-shell :global([class*=border-white]),
  .profile-summary-panel :global([class*=border-white]),
  .profile-info-card :global([class*=border-white]) {
    border-color: var(--hairline) !important;
  }

  .profile-shell :global([class*=bg-white]),
  .profile-summary-panel :global([class*=bg-white]),
  .profile-info-card :global([class*=bg-white]) {
    background: var(--paper) !important;
  }

  .profile-avatar-action,
  .profile-action-button.is-active {
    background: var(--clay);
    color: var(--paper) !important;
    box-shadow: none;
  }

  .profile-action-button:not(.is-active),
  .profile-identity-chip,
  .profile-hero__control {
    background: var(--surface);
  }

  @media (max-width: 640px) {
    .profile-summary-panel {
      padding: 1.25rem;
    }
  }
</style>
