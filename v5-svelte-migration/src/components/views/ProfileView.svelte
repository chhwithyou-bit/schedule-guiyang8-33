<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { tick } from 'svelte';
  import { selectedProfile, isAuthenticated, user } from '../../stores/appState';
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
  let lastProfileId = '';

  let uploadingAvatar = false;
  let uploadingBackground = false;

  $: viewedProfileUserId = $selectedProfile?.id || $selectedProfile?.user_id || '';
  $: isOwnProfile = Boolean($isAuthenticated && $user?.id && viewedProfileUserId && $user.id === viewedProfileUserId);

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


  $: currentProfileId = $selectedProfile?.id || $selectedProfile?.user_id || '';

  $: if (currentProfileId && currentProfileId !== lastProfileId) {
    lastProfileId = currentProfileId;
    void refreshProfileSurface();
  }

  $: if (!currentProfileId) {
    lastProfileId = '';
  }

  async function refreshProfileSurface() {
    await tick();
    scrollProfileToTop();
    await Promise.all([fetchProfileData(), fetchUserPosts()]);
  }

  function scrollProfileToTop() {
    profileScrollEl?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  }

  async function fetchProfileData() {
    if (!$selectedProfile) return;
    try {
      const res = await communityFetch(`/api/community/profile?id=${$selectedProfile.id || $selectedProfile.user_id}`);
      const data = await res.json();
      if (data.ok) {
        selectedProfile.set(data.user);
        isFollowing = data.user.viewer_is_following;
        followerCount = data.user.followers_count || 0;
        followingCount = data.user.following_count || 0;
      }
    } catch (e) {
      console.error('Failed to fetch profile', e);
    }
  }

  async function fetchUserPosts() {
    if (!$selectedProfile) return;
    loading = true;
    try {
      const res = await communityFetch(`/api/community/posts?userId=${$selectedProfile.id || $selectedProfile.user_id}`);
      const data = await res.json();
      if (data.ok) {
        posts = data.posts;
      }
    } catch (e) {
      console.error('Failed to fetch user posts', e);
    } finally {
      loading = false;
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
        followerCount += isFollowing ? 1 : -1;
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
      selectedProfile.set(null);
      openModal('community-console');
    } catch (e) {
      console.error('Direct chat failed', e);
    }
  }

  function close() {
    selectedProfile.set(null);
  }
</script>

{#if $selectedProfile}
  <div 
    class="fixed inset-0 z-[7000] flex flex-col bg-[var(--color-bg)] overflow-hidden"
    transition:fly={{ y: 100, duration: 600, easing: (t) => t * (2 - t) }}
  >
    <!-- Background Header -->
    <div class="relative h-[14rem] flex-shrink-0 sm:h-[17rem] md:h-80 group">
      {#if isOwnProfile}
        <div class="absolute right-4 top-4 z-20 transition-opacity sm:right-6 sm:top-6">
            <div class="relative overflow-hidden rounded-full bg-black/50 px-4 py-2 text-xs font-bold text-white backdrop-blur-xl hover:bg-black/70 border border-white/20">
              {uploadingBackground ? '上传中...' : '更换壁纸'}
              <input type="file" accept="image/*" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer" on:change={handleBackgroundUpload} disabled={uploadingBackground} />
            </div>
        </div>
      {/if}
      {#if $selectedProfile.background_url}
        <img src={$selectedProfile.background_url} alt="Background" class="w-full h-full object-cover" />
      {:else}
        <div class="w-full h-full bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_36%),linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02)),linear-gradient(160deg,#0d1330,#1f2947_55%,#121828)] opacity-95"></div>
      {/if}

      <div class="absolute inset-0 bg-gradient-to-b from-black/15 via-black/10 to-[var(--color-bg)]/88"></div>
      
      <!-- Back Button -->
      <button 
        on:click={close}
        class="absolute left-4 top-4 rounded-full bg-black/25 p-3 text-white backdrop-blur-xl transition-transform hover:scale-110 sm:left-6 sm:top-6"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
      </button>

      <!-- Profile Header Overlay -->
      <div class="absolute bottom-0 left-4 right-4 translate-y-1/2 sm:left-6 sm:right-6 md:left-12 md:right-12">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div class="flex items-end gap-4 sm:gap-6">
            <div class="h-28 w-28 overflow-hidden rounded-[36px] border-4 border-white/20 bg-white/10 p-2 shadow-2xl sm:h-32 sm:w-32 md:h-40 md:w-40 md:rounded-[48px] relative group backdrop-blur-xl">
              
              <div class="flex h-full w-full items-center justify-center overflow-hidden rounded-[28px] bg-white/5 md:rounded-[40px]">
                {#if $selectedProfile.avatar_url}
                  <img src={$selectedProfile.avatar_url} alt="Avatar" class="w-full h-full object-cover" />
                {:else}
                  <span class="text-4xl font-black text-[var(--color-primary)]">
                    {$selectedProfile.username?.slice(0, 1).toUpperCase()}
                  </span>
                {/if}
              </div>
              {#if isOwnProfile}
                <label class="absolute bottom-2 right-2 z-10 flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-full bg-black/60 px-3 text-[11px] font-black text-white shadow-lg backdrop-blur-xl transition-transform hover:scale-105 md:bottom-3 md:right-3 border border-white/20">
                  {uploadingAvatar ? '上传中' : '更换'}
                  <input type="file" accept="image/*" class="absolute inset-0 h-full w-full cursor-pointer opacity-0" on:change={handleAvatarUpload} disabled={uploadingAvatar} />
                </label>
              {/if}
            </div>

            <div class="pb-2 text-white">
              <p class="text-[10px] font-black uppercase tracking-[0.24em] text-white/55">个人主页</p>
              <h1 class="mt-2 text-3xl font-black tracking-tighter sm:text-4xl md:text-5xl">{$selectedProfile.username}</h1>
              <p class="mt-2 text-[11px] font-black uppercase tracking-[0.22em] text-white/60">
                {#if $selectedProfile.background_url}
                  当前壁纸已启用
                {:else}
                  使用默认背景
                {/if}
              </p>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            {#if isOwnProfile}
              <label class="relative inline-flex cursor-pointer items-center gap-2 self-start rounded-full border border-white/30 bg-white/15 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/85 backdrop-blur-xl transition-transform hover:scale-105 sm:self-end" style="background-color: rgba(255, 255, 255, 0.18);">
                {uploadingAvatar ? '头像上传中' : '上传头像'}
                <input type="file" accept="image/*" class="absolute inset-0 h-full w-full cursor-pointer opacity-0" on:change={handleAvatarUpload} disabled={uploadingAvatar} />
              </label>
              <label class="relative inline-flex cursor-pointer items-center gap-2 self-start rounded-full border border-white/30 bg-white/15 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/85 backdrop-blur-xl transition-transform hover:scale-105 sm:self-end" style="background-color: rgba(255, 255, 255, 0.18);">
                {uploadingBackground ? '壁纸上传中' : '上传壁纸'}
                <input type="file" accept="image/*" class="absolute inset-0 h-full w-full cursor-pointer opacity-0" on:change={handleBackgroundUpload} disabled={uploadingBackground} />
              </label>
            {/if}
            {#if $selectedProfile.background_url}
              <a
                href={$selectedProfile.background_url}
                target="_blank"
                rel="noreferrer"
                class="inline-flex items-center gap-2 self-start rounded-full border border-white/15 bg-black/25 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/80 backdrop-blur-xl transition-transform hover:scale-105 sm:self-end"
              >
                查看壁纸
              </a>
            {/if}
          </div>
        </div>
      </div>
    </div>

    <!-- Main Content Area -->
    <div bind:this={profileScrollEl} class="flex-1 overflow-y-auto px-4 pb-16 pt-20 sm:px-6 sm:pt-24 md:px-12 md:pt-28 md:pb-20">
      <div class="max-w-4xl mx-auto">
        <!-- Stats & Info -->
        <div class="mb-10 flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <div class="flex-1">
            <div class="flex items-center gap-3 mb-2">
              <h2 class="text-3xl font-black tracking-tighter sm:text-4xl">{$selectedProfile.username}</h2>
              {#if $selectedProfile.role === 'admin'}
                <span class="px-2 py-1 rounded-lg bg-[var(--color-primary)] text-[10px] text-white font-black uppercase tracking-widest">管理员</span>
              {/if}
            </div>
            <p class="text-sm font-bold opacity-30 uppercase tracking-[0.2em] mb-4">
              LV.{$selectedProfile.level || 1} · XP.{$selectedProfile.xp || 0}
            </p>
            <p class="max-w-2xl text-base font-medium leading-relaxed opacity-70">
              {$selectedProfile.signature || '这个人还没写自我介绍。'}
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-5">
            <div class="text-center">
              <p class="text-2xl font-black tracking-tighter">{followingCount}</p>
              <p class="text-[10px] font-black opacity-30 uppercase tracking-widest">关注中</p>
            </div>
            <div class="text-center">
              <p class="text-2xl font-black tracking-tighter">{followerCount}</p>
              <p class="text-[10px] font-black opacity-30 uppercase tracking-widest">关注者</p>
            </div>
            
            {#if $user && $user.id !== ($selectedProfile.id || $selectedProfile.user_id)}
              <div class="ml-4 flex flex-wrap gap-3">
                <button 
                  on:click={startDirectChat}
                  class="px-8 py-4 rounded-2xl border border-white/10 bg-white/5 font-black text-sm tracking-widest uppercase transition-all hover:scale-105"
                >
                  打个招呼
                </button>
                <button 
                  on:click={toggleFollow}
                  class="px-8 py-4 rounded-2xl font-black text-sm tracking-widest uppercase transition-all
                         {isFollowing ? 'bg-white/10 border border-white/10 opacity-60' : 'bg-[var(--color-primary)] text-white shadow-lg scale-105'}"
                >
                  {isFollowing ? '取消关注' : '关注一下'}
                </button>
              </div>
            {/if}
          </div>
        </div>

        <section class="mb-10 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
          <div class="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-xl backdrop-blur-xl">
            <p class="text-[10px] font-black uppercase tracking-[0.22em] opacity-35">个性签名</p>
            <p class="mt-3 text-sm font-medium leading-7 opacity-75 sm:text-base">
              {$selectedProfile.signature || '这里还没有留下自定义签名。'}
            </p>
          </div>

          <div class="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-xl backdrop-blur-xl">
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

        <!-- Post Feed -->
        <div class="space-y-8">
          <h3 class="text-xl font-black uppercase tracking-tighter border-b border-neutral-100 dark:border-neutral-900 pb-4 mb-8">
            发过的内容
            <span class="ml-2 text-sm opacity-30">({posts.length})</span>
          </h3>

          {#if loading}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              {#each Array(4) as _}
                <div class="h-64 rounded-[32px] bg-white/5 border border-white/5 animate-pulse"></div>
              {/each}
            </div>
          {:else if posts.length > 0}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              {#each posts as post (post.id)}
                <PostCard {post} />
              {/each}
            </div>
          {:else}
            <div class="py-24 text-center opacity-20 font-black uppercase tracking-widest text-sm">
              这里暂时还没有公开内容。
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
