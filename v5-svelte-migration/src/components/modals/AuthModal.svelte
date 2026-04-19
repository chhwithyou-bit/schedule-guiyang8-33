<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { closeModal } from '../../stores/modalState';
  import { isAdmin, isAuthenticated, user } from '../../stores/appState';
  import { persistCommunitySession } from '../../lib/communityApi';
  import { softReveal } from '../../lib/motion';

  let usernameInput: HTMLInputElement | null = null;
  let isRegister = false;
  let username = '';
  let password = '';
  let loading = false;
  let error = '';

  function buildAuthHeader(nextUsername: string, passHash: string) {
    return `Bearer ${encodeURIComponent(nextUsername)}:${passHash}`;
  }

  async function hydrateCurrentUser(nextUsername: string, passHash: string) {
    const res = await fetch('/api/community/me', {
      headers: {
        Authorization: buildAuthHeader(nextUsername, passHash)
      }
    });
    const data = await res.json();

    if (!res.ok || !data?.ok || !data.user) {
      throw new Error(data?.msg || '账号已认证，但资料加载失败。');
    }

    return {
      ...data.user,
      passHash
    };
  }

  async function handleSubmit() {
    const normalizedUsername = username.trim();
    if (!normalizedUsername || !password) return;

    loading = true;
    error = '';

    try {
      const endpoint = isRegister ? '/api/community/register' : '/api/community/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: normalizedUsername,
          password
        })
      });
      const data = await res.json();

      if (!res.ok || !data?.ok || typeof data.token !== 'string') {
        error = data?.msg || '登录没有成功，再试一次。';
        return;
      }

      const [tokenUsername = normalizedUsername, passHash = ''] = data.token.split(':');
      if (!passHash) {
        throw new Error('认证成功，但没有拿到可用会话。');
      }

      const nextUser = await hydrateCurrentUser(tokenUsername, passHash);

      user.set(nextUser);
      isAuthenticated.set(true);
      isAdmin.set(nextUser?.role === 'admin' || nextUser?.role === 'owner');
      persistCommunitySession(nextUser);
      closeModal();
    } catch (nextError: any) {
      error = nextError?.message || '现在连不上，稍后再试。';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    usernameInput?.focus();
  });
</script>

<div
  class="fixed inset-0 z-[10000] flex items-center justify-center p-6"
  transition:fade={{ duration: 300 }}
>
  <button type="button" class="absolute inset-0 bg-black/60 backdrop-blur-xl" on:click={closeModal} aria-label="关闭登录弹窗"></button>

  <div
    data-modal-shell="true"
    role="dialog"
    aria-modal="true"
    aria-labelledby="auth-modal-title"
    aria-describedby="auth-modal-description"
    tabindex="-1"
    class="relative w-full max-w-md overflow-hidden rounded-[40px] border border-white/10 bg-[var(--color-bg,#231b22)] p-10 text-[var(--color-text,#fff4ed)] shadow-2xl"
    transition:softReveal={{ y: 18, duration: 280, startScale: 0.985, blur: 6 }}
  >
    <div class="relative z-10">
      <h2 id="auth-modal-title" class="mb-2 text-4xl font-black uppercase tracking-tighter text-[var(--color-text,#fff4ed)]">
        {isRegister ? '来这里安个家' : '回来就好'}
      </h2>
      <p id="auth-modal-description" class="mb-8 text-sm font-bold uppercase tracking-widest text-[var(--color-text,#fff4ed)] opacity-40">
        {isRegister ? '起个名字，就能开始发帖聊天。' : '登上账号，继续刚才的内容。'}
      </p>

      <form on:submit|preventDefault={handleSubmit} class="space-y-4">
        <div>
          <label class="mb-2 ml-4 block text-[10px] font-black uppercase tracking-widest text-[var(--color-text,#fff4ed)] opacity-30" for="username">用户名</label>
          <input
            bind:this={usernameInput}
            id="username"
            type="text"
            bind:value={username}
            placeholder="想让大家怎么叫你"
            class="w-full rounded-2xl border border-white/30 bg-white/15 px-6 py-4 font-bold text-[var(--color-text,#fff4ed)] outline-none transition-all placeholder:text-[var(--color-text,#fff4ed)]/40 focus:ring-2 focus:ring-[var(--color-primary,#fac7b7)]"
            style="background-color: rgba(255, 255, 255, 0.18);"
          />
        </div>

        <div>
          <label class="mb-2 ml-4 block text-[10px] font-black uppercase tracking-widest text-[var(--color-text,#fff4ed)] opacity-30" for="password">密码</label>
          <input
            id="password"
            type="password"
            bind:value={password}
            placeholder="输入一个你记得住的"
            class="w-full rounded-2xl border border-white/30 bg-white/15 px-6 py-4 font-bold text-[var(--color-text,#fff4ed)] outline-none transition-all placeholder:text-[var(--color-text,#fff4ed)]/40 focus:ring-2 focus:ring-[var(--color-primary,#fac7b7)]"
            style="background-color: rgba(255, 255, 255, 0.18);"
          />
        </div>

        {#if error}
          <p class="rounded-xl bg-red-50 px-4 py-2 text-xs font-bold text-red-500 dark:bg-red-900/20">{error}</p>
        {/if}

        <button
          type="submit"
          disabled={loading}
          class="w-full rounded-2xl bg-[var(--color-primary,#fac7b7)] py-5 text-lg font-black text-[var(--color-button-text,#231b22)] shadow-lg transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
        >
          {loading ? '正在处理...' : (isRegister ? '注册并进入' : '登录')}
        </button>
      </form>

      <div class="mt-8 text-center">
        <button
          on:click={() => isRegister = !isRegister}
          class="text-[10px] font-black uppercase tracking-widest opacity-30 transition-opacity hover:opacity-100"
        >
          {isRegister ? '已经有账号了，直接登录' : '还没有账号？现在注册'}
        </button>
      </div>
    </div>

    <div class="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[var(--color-primary)] opacity-5 blur-3xl"></div>
  </div>
</div>
