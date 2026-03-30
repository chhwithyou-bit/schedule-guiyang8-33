<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { closeModal } from '../../stores/modalState';
  import { user, isAuthenticated } from '../../stores/appState';

  let isRegister = false;
  let username = '';
  let password = '';
  let loading = false;
  let error = '';

  async function handleSubmit() {
    if (!username || !password) return;
    loading = true;
    error = '';

    try {
      const res = await fetch('/api/community/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: isRegister ? 'register' : 'login',
          username,
          password
        })
      });
      const data = await res.json();
      if (data.ok) {
        user.set(data.user);
        isAuthenticated.set(true);
        localStorage.setItem('commUser', JSON.stringify(data.user));
        closeModal();
      } else {
        error = data.msg || 'Auth failed';
      }
    } catch (e: any) {
      error = e.message;
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
        {isRegister ? 'Join Us' : 'Welcome Back'}
      </h2>
      <p class="text-sm opacity-40 font-bold uppercase tracking-widest mb-8">
        {isRegister ? 'Create your visual identity' : 'Sign in to your frequency'}
      </p>

      <form on:submit|preventDefault={handleSubmit} class="space-y-4">
        <div>
          <label class="block text-[10px] font-black uppercase tracking-widest opacity-30 mb-2 ml-4" for="username">Username</label>
          <input 
            id="username"
            type="text" 
            bind:value={username}
            placeholder="Identity"
            class="w-full px-6 py-4 rounded-2xl bg-neutral-100 dark:bg-neutral-900 border-none focus:ring-2 focus:ring-[var(--color-primary)] transition-all font-bold"
          />
        </div>

        <div>
          <label class="block text-[10px] font-black uppercase tracking-widest opacity-30 mb-2 ml-4" for="password">Password</label>
          <input 
            id="password"
            type="password" 
            bind:value={password}
            placeholder="Passcode"
            class="w-full px-6 py-4 rounded-2xl bg-neutral-100 dark:bg-neutral-900 border-none focus:ring-2 focus:ring-[var(--color-primary)] transition-all font-bold"
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
          {loading ? 'Processing...' : (isRegister ? 'REGISTER' : 'LOGIN')}
        </button>
      </form>

      <div class="mt-8 text-center">
        <button 
          on:click={() => isRegister = !isRegister}
          class="text-[10px] font-black uppercase tracking-widest opacity-30 hover:opacity-100 transition-opacity"
        >
          {isRegister ? 'Already have an identity? Login' : 'Need a new frequency? Register'}
        </button>
      </div>
    </div>

    <!-- Decorative Liquid Element -->
    <div class="absolute -right-20 -top-20 w-64 h-64 rounded-full bg-[var(--color-primary)] opacity-5 blur-3xl pointer-events-none"></div>
  </div>
</div>
