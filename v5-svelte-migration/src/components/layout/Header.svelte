<script lang="ts">
  import { onMount } from 'svelte';

  import { currentView, isAdmin, isAuthenticated, user, selectedProfile } from '../../stores/appState';
  import { openModal } from '../../stores/modalState';
  import { isCommunityAdminRole, normalizeCommunityMediaUrl, readStoredCommunitySession, refreshStoredCommunitySession } from '../../lib/communityApi';
  import { navigateToCommunitySection, navigateToView } from '../../lib/appRouter';

  let isScrolled = false;

  function goHome() {
    navigateToCommunitySection('feed');
  }

  function goProfile() {
    selectedProfile.set($user);
  }

  function goAdmin() {
    navigateToView('admin');
  }

  function applyCommunitySession(nextUser: ReturnType<typeof readStoredCommunitySession>) {
    user.set(nextUser ? {
      ...nextUser,
      avatar_url: normalizeCommunityMediaUrl(nextUser.avatar_url),
      background_url: normalizeCommunityMediaUrl(nextUser.background_url)
    } : null);
    isAuthenticated.set(Boolean(nextUser));
    isAdmin.set(isCommunityAdminRole(nextUser?.role));
  }

  function clearCommunitySession() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('commUser');
    }
    applyCommunitySession(null);
  }

  onMount(() => {
    try {
      const nextUser = readStoredCommunitySession();
      if (nextUser) {
        applyCommunitySession(nextUser);
        void refreshStoredCommunitySession().then((refreshedUser) => {
          if (refreshedUser) applyCommunitySession(refreshedUser);
          else clearCommunitySession();
        });
      } else {
        clearCommunitySession();
      }
    } catch (error) {
      console.error('Failed to restore session', error);
      clearCommunitySession();
    }

    const handleScroll = () => {
      isScrolled = window.scrollY > 18;
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  });
</script>

<header class="site-header {isScrolled ? 'is-scrolled' : ''}">
  <div class="header-inner site-header-shell">
    <button type="button" on:click={goHome} class="wordmark" aria-label="返回 8Community 社区">
      <span>8Community</span><span class="slash">/</span>
    </button>

    <nav class="header-actions" aria-label="主导航">
      <button type="button" data-header-target="community" on:click={goHome} class="nav-link {$currentView === 'community' ? 'is-active' : ''}">社区</button>
      {#if $isAuthenticated}
        <button type="button" data-header-target="profile" on:click={goProfile} class="nav-link">个人</button>
      {/if}
      {#if $isAdmin}
        <button type="button" on:click={goAdmin} class="nav-link {$currentView === 'admin' ? 'is-active' : ''}">管理</button>
      {/if}

      {#if $isAuthenticated}
        <button
          type="button"
          on:click={goProfile}
          class="header-avatar-shell"
          aria-label="打开个人页面"
        >
          {#if $user?.avatar_url}
            <img src={$user.avatar_url} alt="" />
          {:else}
            <span>{$user?.username?.slice(0, 1)?.toUpperCase() || 'U'}</span>
          {/if}
        </button>
      {:else}
        <button type="button" on:click={() => openModal('auth')} class="header-login-btn">登录</button>
      {/if}
    </nav>
  </div>
</header>

<style>
	  .site-header {
    position: sticky;
    top: 0;
    z-index: 5000;
	    border-bottom: 1px solid var(--hairline);
	    background: rgba(240, 238, 230, 0.84);
	    backdrop-filter: saturate(1.05) blur(12px);
	    transition: background 180ms ease, border-color 180ms ease;
	  }

	  .site-header.is-scrolled {
	    background: rgba(240, 238, 230, 0.92);
	    border-color: var(--hairline-strong);
	  }

  .header-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s3);
	    width: min(1080px, calc(100% - 48px));
	    margin: 0 auto;
	    padding: 22px 0;
	  }

  .wordmark {
    display: inline-flex;
    align-items: baseline;
	    gap: 2px;
	    font-family: var(--sans);
	    font-size: 20px;
	    font-weight: 600;
	    letter-spacing: -0.01em;
	  }

	  .slash {
	    color: var(--clay);
	    font-weight: 500;
	  }

  .header-actions {
	    display: flex;
	    align-items: center;
	    gap: var(--s3);
	  }

	  .nav-link,
	  .header-login-btn {
	    font-family: var(--sans);
	    font-size: 14px;
	    font-weight: 500;
	    color: var(--ink-soft);
	    transition: color 180ms ease, transform 180ms ease;
	  }

	  .nav-link:hover,
	  .nav-link.is-active {
	    color: var(--ink);
	  }

  .nav-link:hover,
  .header-login-btn:hover,
  .header-avatar-shell:hover {
    transform: translateY(-1px);
  }

  .header-avatar-shell {
    display: grid;
	    width: 34px;
	    height: 34px;
    place-items: center;
    overflow: hidden;
    border-radius: 999px;
	    background: var(--clay);
	    color: var(--paper);
    font-family: var(--sans);
    font-size: 14px;
    font-weight: 600;
    transition: transform 180ms ease, box-shadow 180ms ease;
  }

  .header-avatar-shell img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

	  .header-login-btn {
	    min-height: 38px;
	    border: 1px solid var(--clay);
	    border-radius: var(--r-btn);
	    background: var(--clay);
	    color: var(--paper);
	    padding: 0 16px;
	  }

	  @media (max-width: 640px) {
	    .header-inner {
	      width: min(100% - 32px, 1080px);
	      padding: 16px 0;
	    }

    .header-actions {
      gap: var(--s2);
    }

	    .nav-link {
	      display: none;
	    }
	  }

	</style>
