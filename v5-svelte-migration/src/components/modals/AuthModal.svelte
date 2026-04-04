<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { closeModal } from '../../stores/modalState';
  import { user, isAuthenticated, isAdmin } from '../../stores/appState';
  import { persistCommunitySession } from '../../lib/communityApi';

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
</script>

<div 
  class="fixed inset-0 z-[10000] flex items-center justify-center p-6"
  transition:fade={{ duration: 300 }}
>
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="absolute inset-0 bg-black/60 backdrop-blur-xl" on:click={closeModal}></div>

  <div 
    class="relative w-full max-w-md bg-[var(--color-bg)] rounded-[40px] p-10 shadow-2xl overflow-hidden"
    transition:fly={{ y: 50, duration: 600, easing: (t) => t * (2 - t) }}
  >
    <div class="relative z-10">
      <h2 class="text-4xl font-black tracking-tighter mb-2 uppercase">
        {isRegister ? '来这里安个家' : '回来就好'}
      </h2>
      <p class="text-sm opacity-40 font-bold uppercase tracking-widest mb-8">
        {isRegister ? '起个名字，就能开始发帖聊天。' : '登上账号，继续刚才的内容。'}
      </p>

      <form on:submit|preventDefault={handleSubmit} class="space-y-4">
        <div>
          <label class="block text-[10px] font-black uppercase tracking-widest opacity-30 mb-2 ml-4" for="username">用户名</label>
          <input 
            id="username"
            type="text" 
            bind:value={username}
            placeholder="想让大家怎么叫你"
            class="w-full px-6 py-4 rounded-2xl bg-white/5 border border-white/10 focus:ring-2 focus:ring-[var(--color-primary)] transition-all font-bold outline-none"
          />
        </div>

        <div>
          <label class="block text-[10px] font-black uppercase tracking-widest opacity-30 mb-2 ml-4" for="password">密码</label>
          <input 
            id="password"
            type="password" 
            bind:value={password}
            placeholder="输一个你记得住的"
            class="w-full px-6 py-4 rounded-2xl bg-white/5 border border-white/10 focus:ring-2 focus:ring-[var(--color-primary)] transition-all font-bold outline-none"
          />
        </div>

        {#if error}
          <p class="text-red-500 text-xs font-bold px-4 py-2 bg-red-50 dark:bg-red-900/20 rounded-xl">{error}</p>
        {/if}

        <button 
          type="submit" 
          disabled={loading}
          class="w-full py-5 bg-[var(--color-primary)] text-white font-black text-lg rounded-2xl shadow-lg hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
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
