<script lang="ts">
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import AnimatedHeading from '../ui/AnimatedHeading.svelte';
  import { selectedProfile, isAuthenticated } from '../../stores/appState';
  import { openModal } from '../../stores/modalState';
  import { communityFetch } from '../../lib/communityApi';

  type DiscoveryUser = {
    id: string;
    username: string;
    signature?: string;
    avatar_url?: string;
    background_url?: string;
    role?: string;
    xp?: number;
    level?: number;
  };

  type DiscoveryGroup = {
    id: string;
    title: string;
    description?: string;
    avatar_url?: string;
    member_count?: number;
    joined?: boolean;
  };

  let loading = true;
  let query = '';
  let users: DiscoveryUser[] = [];
  let groups: DiscoveryGroup[] = [];
  let infoMessage = '';
  let errorMessage = '';
  let joiningGroupId = '';

  onMount(() => {
    void fetchDiscovery();
  });

  async function fetchDiscovery() {
    loading = true;
    errorMessage = '';

    try {
      const url = query.trim()
        ? `/api/community/discovery?q=${encodeURIComponent(query.trim())}`
        : '/api/community/discovery';
      const res = await communityFetch(url);
      const data = await res.json();

      if (data.ok) {
        users = Array.isArray(data.users) ? data.users : [];
        groups = Array.isArray(data.groups) ? data.groups : [];
      } else {
        errorMessage = data.msg || '这里一时没刷出来，稍后再试。';
      }
    } catch (e) {
      console.error('Failed to fetch discovery data', e);
      errorMessage = '这里一时没刷出来，稍后再试。';
    } finally {
      loading = false;
    }
  }

  function handleSearch(event: Event) {
    event.preventDefault();
    void fetchDiscovery();
  }

  function openProfile(user: DiscoveryUser) {
    selectedProfile.set(user);
  }

  async function joinGroup(group: DiscoveryGroup) {
    if (!$isAuthenticated) {
      openModal('auth');
      return;
    }

    joiningGroupId = group.id;
    errorMessage = '';
    infoMessage = '';

    try {
      const res = await communityFetch('/api/community/groups/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: group.id })
      });
      const data = await res.json();

      if (data.ok) {
        groups = groups.map((item) => item.id === group.id ? { ...item, joined: true } : item);
        infoMessage = `已加入 ${group.title}`;
      } else {
        errorMessage = data.msg || '加入群组没成功，再点一次试试。';
      }
    } catch (e) {
      console.error('Failed to join group', e);
      errorMessage = '加入群组没成功，再点一次试试。';
    } finally {
      joiningGroupId = '';
    }
  }
</script>

<div class="nodes-view pb-32">
  <div class="mb-10 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
    <div>
      <AnimatedHeading text="找人和群" className="text-[10vw] md:text-[8vw]" />
      <p class="mt-4 max-w-3xl text-sm font-medium leading-7 opacity-70 md:text-base">
        这里直接连着社区发现接口。想找谁、想进哪个群，都可以从这里开始，不用绕路。
      </p>
    </div>

    <form on:submit={handleSearch} class="relative w-full xl:max-w-sm">
      <input
        bind:value={query}
        type="text"
        placeholder="搜人名或群名..."
        class="w-full rounded-2xl bg-neutral-100 px-6 py-4 font-medium text-neutral-900 transition-all focus:ring-2 focus:ring-[var(--color-primary)] dark:bg-neutral-900 dark:text-neutral-100"
      />
      <button type="submit" class="absolute right-4 top-1/2 -translate-y-1/2 opacity-30 transition-opacity hover:opacity-100">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      </button>
    </form>
  </div>

  {#if infoMessage}
    <div class="mb-6 rounded-[28px] border border-emerald-400/20 bg-emerald-500/10 px-5 py-4 text-sm font-bold text-emerald-200">
      {infoMessage}
    </div>
  {/if}

  {#if errorMessage}
    <div class="mb-6 rounded-[28px] border border-red-400/20 bg-red-500/10 px-5 py-4 text-sm font-bold text-red-200">
      {errorMessage}
    </div>
  {/if}

  <div class="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
    <section class="rounded-[40px] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
      <div class="mb-6 flex items-center justify-between">
        <div>
          <p class="text-[10px] font-black uppercase tracking-[0.28em] opacity-35">看看这些人</p>
          <h3 class="mt-2 text-2xl font-black tracking-tight">推荐用户</h3>
        </div>
        <p class="text-[10px] font-black uppercase tracking-[0.22em] opacity-35">{users.length} 位</p>
      </div>

      {#if loading}
        <div class="space-y-4">
          {#each Array(4) as _}
            <div class="h-24 animate-pulse rounded-[28px] bg-white/5"></div>
          {/each}
        </div>
      {:else if users.length > 0}
        <div class="space-y-4">
          {#each users as user, index (user.id)}
            <article
              in:fly={{ y: 24, duration: 500, delay: index * 70 }}
              class="flex items-center gap-4 rounded-[28px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-5"
            >
              <div class="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-[20px] bg-[var(--color-primary)] font-black text-[var(--color-bg)]">
                {#if user.avatar_url}
                  <img src={user.avatar_url} alt={user.username} class="h-full w-full object-cover" />
                {:else}
                  {user.username?.slice(0, 1).toUpperCase() || '?'}
                {/if}
              </div>

              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h4 class="truncate text-lg font-black tracking-tight">{user.username}</h4>
                  {#if user.role === 'admin' || user.role === 'owner'}
                    <span class="rounded-full border border-white/10 px-2 py-1 text-[9px] font-black uppercase tracking-[0.18em] opacity-60">
                      {user.role}
                    </span>
                  {/if}
                </div>
                <p class="mt-1 text-xs font-black uppercase tracking-[0.2em] opacity-35">
                  LV.{user.level || 1} · XP.{user.xp || 0}
                </p>
                <p class="mt-2 line-clamp-2 text-sm font-medium opacity-70">
                  {user.signature || '这个用户还没有留下签名。'}
                </p>
              </div>

              <button
                type="button"
                on:click={() => openProfile(user)}
                class="rounded-full bg-[var(--color-primary)] px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--color-bg)] shadow-lg transition-transform hover:scale-105"
              >
                看看主页
              </button>
            </article>
          {/each}
        </div>
      {:else}
        <div class="rounded-[28px] border border-white/10 bg-white/5 px-5 py-10 text-center text-sm font-bold opacity-50">
          暂时没有可展示的用户节点。
        </div>
      {/if}
    </section>

    <section class="rounded-[40px] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
      <div class="mb-6 flex items-center justify-between">
        <div>
          <p class="text-[10px] font-black uppercase tracking-[0.28em] opacity-35">也许你会想进</p>
          <h3 class="mt-2 text-2xl font-black tracking-tight">推荐群组</h3>
        </div>
        <p class="text-[10px] font-black uppercase tracking-[0.22em] opacity-35">{groups.length} 个</p>
      </div>

      {#if loading}
        <div class="space-y-4">
          {#each Array(4) as _}
            <div class="h-28 animate-pulse rounded-[28px] bg-white/5"></div>
          {/each}
        </div>
      {:else if groups.length > 0}
        <div class="space-y-4">
          {#each groups as group, index (group.id)}
            <article
              in:fly={{ y: 24, duration: 500, delay: index * 70 }}
              class="rounded-[28px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-5"
            >
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0">
                  <h4 class="truncate text-lg font-black tracking-tight">{group.title}</h4>
                  <p class="mt-2 text-sm font-medium leading-7 opacity-70">
                    {group.description || '这个群组还没有介绍。'}
                  </p>
                </div>
                <div class="rounded-full border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] opacity-55">
                  {group.member_count || 0} 人
                </div>
              </div>

              <div class="mt-5 flex items-center justify-between gap-4">
                <p class="text-[10px] font-black uppercase tracking-[0.2em] opacity-35">
                  {group.joined ? '已经在里面了' : '现在可以加入'}
                </p>
                <button
                  type="button"
                  disabled={group.joined || joiningGroupId === group.id}
                  on:click={() => joinGroup(group)}
                  class="rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-transform disabled:cursor-default disabled:opacity-40 {group.joined ? 'border border-white/10 bg-white/5' : 'bg-[var(--color-primary)] text-[var(--color-bg)] shadow-lg hover:scale-105'}"
                >
                  {group.joined ? '已加入' : joiningGroupId === group.id ? '正在加入…' : '加入这个群'}
                </button>
              </div>
            </article>
          {/each}
        </div>
      {:else}
        <div class="rounded-[28px] border border-white/10 bg-white/5 px-5 py-10 text-center text-sm font-bold opacity-50">
          暂时没有可展示的群组节点。
        </div>
      {/if}
    </section>
  </div>
</div>
