<script lang="ts">
  import { onMount } from 'svelte';

  import { user, isAuthenticated, isAdmin, selectedProfile } from '../../stores/appState';
  import { openModal } from '../../stores/modalState';

  let y = 0;
  let lastY = 0;
  let isVisible = true;

  onMount(() => {
    // Auth init
    const saved = localStorage.getItem('commUser');
    if (saved) {
      try {
        const u = JSON.parse(saved);
        user.set(u);
        isAuthenticated.set(true);
        isAdmin.set(u.role === 'admin' || u.role === 'owner');
      } catch (e) {}
    }

    // Basic scroll hide/show logic
    const handleScroll = () => {
      isVisible = y < lastY || y < 60;
      lastY = y;
    };

    window.addEventListener('scroll', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  });
</script>

<svelte:window bind:scrollY={y} />

<header 
  class="fixed top-0 left-0 right-0 z-[5000] px-6 md:px-12 py-6 transition-all duration-500
         {isVisible ? 'translate-y-0' : '-translate-y-full'}
         {y > 60 ? 'bg-white/80 dark:bg-neutral-950/80 backdrop-blur-2xl shadow-sm' : 'bg-transparent'}"
>
  <div class="max-w-7xl mx-auto flex items-center justify-between">
    <!-- Logo -->
    <div class="group cursor-pointer">
      <h1 class="text-2xl font-black tracking-tighter transition-transform group-hover:scale-110">
        8<span class="text-[var(--color-primary)]">COMMUNITY</span>
      </h1>
    </div>

    <!-- Navigation / Profile -->
    <div class="flex items-center gap-6">
      {#if $isAuthenticated}
        <button 
          on:click={() => selectedProfile.set($user)}
          class="w-10 h-10 flex items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:scale-110 transition-transform overflow-hidden shadow-sm"
        >
          {#if $user.avatar_url}
            <img src={$user.avatar_url} alt="" class="w-full h-full object-cover" />
          {:else}
            <span class="text-xs font-black text-[var(--color-primary)]">{$user.username.slice(0,1).toUpperCase()}</span>
          {/if}
        </button>
      {:else}
        <button 
          on:click={() => openModal('auth')}
          class="px-6 py-2.5 rounded-full bg-[var(--color-primary)] text-white text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg"
        >
          Login
        </button>
      {/if}
    </div>
  </div>
</header>
