<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { closeModal } from '../../stores/modalState';
  import { user, isAuthenticated, isAdmin } from '../../stores/appState';
  import { persistCommunitySession } from '../../lib/communityApi';

  let usernameInput: HTMLInputElement | null = null;
  let isRegister = false;
  let username = '';
  let password = '';
  let loading = false;
  let error = '';

  async function handleSubmit() {
    const normalizedUsername = username.trim();
    if (!normalizedUsername || !password) return;
    loading = true;
    error = '';

    try {
      const res = await fetch('/api/community/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: isRegister ? 'register' : 'login',
          username: normalizedUsername,
          password
        })
      });
      const data = await res.json();
      if (data.ok) {
        user.set(data.user);
        isAuthenticated.set(true);
        isAdmin.set(data.user?.role === 'admin' || data.user?.role === 'owner');
        persistCommunitySession(data.user);
        closeModal();
      } else {
        error = data.msg || '登录没成功，再试一次。';
      }
    } catch (e: any) {
      error = e.message || '现在连不上，稍后再试。';
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
    class="relative w-full max-w-md bg-[var(--color-bg,#231b22)] text-[var(--color-text,#fff4ed)] rounded-[40px] p-10 shadow-2xl overflow-hidden border border-white/10"
    transition:fly={{ y: 50, duration: 600, easing: (t) => t * (2 - t) }}
  >
    <div class="relative z-10">
      <h2 id="auth-modal-title" class="text-4xl font-black tracking-tighter mb-2 uppercase text-[var(--color-text,#fff4ed)]">
        {isRegister ? '来这里安个家' : '回来就好'}
      </h2>
      <p id="auth-modal-description" class="text-sm opacity-40 font-bold uppercase tracking-widest mb-8 text-[var(--color-text,#fff4ed)]">
        {isRegister ? '起个名字，就能开始发帖聊天。' : '登上账号，继续刚才的内容。'}
      </p>

      <form on:submit|preventDefault={handleSubmit} class="space-y-4">
        <div>
          <label class="block text-[10px] font-black uppercase tracking-widest opacity-30 mb-2 ml-4 text-[var(--color-text,#fff4ed)]" for="username">用户名</label>
          <input
            bind:this={usernameInput}
            id="username"
            type="text"
            bind:value={username}
            placeholder="想让大家怎么叫你"
            class="w-full px-6 py-4 rounded-2xl bg-white/15 border border-white/30 text-[var(--color-text,#fff4ed)] placeholder:text-[var(--color-text,#fff4ed)]/40 focus:ring-2 focus:ring-[var(--color-primary,#fac7b7)] transition-all font-bold outline-none"
            style="background-color: rgba(255, 255, 255, 0.18);"
          />
        </div>

        <div>
          <label class="block text-[10px] font-black uppercase tracking-widest opacity-30 mb-2 ml-4 text-[var(--color-text,#fff4ed)]" for="password">密码</label>
          <input 
            id="password"
            type="password" 
            bind:value={password}
            placeholder="输一个你记得住的"
            class="w-full px-6 py-4 rounded-2xl bg-white/15 border border-white/30 text-[var(--color-text,#fff4ed)] placeholder:text-[var(--color-text,#fff4ed)]/40 focus:ring-2 focus:ring-[var(--color-primary,#fac7b7)] transition-all font-bold outline-none"
            style="background-color: rgba(255, 255, 255, 0.18);"
          />
        </div>

        {#if error}
          <p class="text-red-500 text-xs font-bold px-4 py-2 bg-red-50 dark:bg-red-900/20 rounded-xl">{error}</p>
        {/if}

        <button 
          type="submit" 
          disabled={loading}
          class="w-full py-5 bg-[var(--color-primary,#fac7b7)] text-[var(--color-button-text,#231b22)] font-black text-lg rounded-2xl shadow-lg hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
        >
          {loading ? '正在处理…' : (isRegister ? '注册并进入' : '登录')}
        </button>
      </form>

      <div class="mt-8 text-center">
        <button 
          on:click={() => isRegister = !isRegister}
          class="text-[10px] font-black uppercase tracking-widest opacity-30 hover:opacity-100 transition-opacity"
        >
          {isRegister ? '已经有账号了，直接登录' : '还没有账号？现在注册'}
        </button>
      </div>
    </div>

    <!-- Decorative Liquid Element -->
    <div class="absolute -right-20 -top-20 w-64 h-64 rounded-full bg-[var(--color-primary)] opacity-5 blur-3xl pointer-events-none"></div>
  </div>
</div>
