<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { closeModal } from '../../stores/modalState';
  import { isAdmin, isAuthenticated, user } from '../../stores/appState';
  import { buildCommunityAuthHeader, normalizeCommunityMediaUrl, persistCommunitySession } from '../../lib/communityApi';

  let usernameInput: HTMLInputElement | null = null;
  let isRegister = false;
  let username = '';
  let password = '';
  let loading = false;
  let error = '';

  $: usernameLabel = isRegister ? '用户名' : '账号';
  $: usernamePlaceholder = isRegister ? '想让大家怎么叫你' : '输入你的用户名';
  $: passwordPlaceholder = isRegister ? '设置一个你记得住的密码' : '输入你的密码';

  async function hydrateCurrentUser(authToken: string) {
    const res = await fetch('/api/community/me', {
      headers: { Authorization: buildCommunityAuthHeader(authToken) }
    });
    const data = await res.json();
    if (!res.ok || !data?.ok || !data.user) throw new Error(data?.msg || '账号已认证，但资料加载失败。');
    return {
      ...data.user,
      authToken,
      avatar_url: normalizeCommunityMediaUrl(data.user.avatar_url),
      background_url: normalizeCommunityMediaUrl(data.user.background_url)
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
        body: JSON.stringify({ username: normalizedUsername, password })
      });
      const data = await res.json();
      if (!res.ok || !data?.ok || typeof data.token !== 'string') {
        error = data?.msg || '登录没有成功，再试一次。';
        return;
      }

      const nextUser = await hydrateCurrentUser(data.token.trim());
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

  onMount(() => usernameInput?.focus());
</script>

<div class="auth-frame" transition:fade={{ duration: 160 }}>
  <button type="button" class="scrim" on:click={closeModal} aria-label="关闭登录弹窗"></button>

  <div
    data-modal-shell="true"
    role="dialog"
    aria-modal="true"
    aria-labelledby="auth-modal-title"
    aria-describedby="auth-modal-description"
    tabindex="-1"
    class="modal"
    in:fly={{ y: 12, duration: 220 }}
  >
    <button type="button" class="close" on:click={closeModal} aria-label="关闭">×</button>
    <div class="brand">8Community<span>/</span></div>

    <h1 id="auth-modal-title" class="title">{isRegister ? '来这里安个家' : '回来就好'}</h1>
    <p id="auth-modal-description" class="subtitle">{isRegister ? '起个名字，就能开始说话。' : '一个安静的角落，等你继续。'}</p>

    <div class="switch" role="tablist" aria-label="登录注册切换">
      <button type="button" aria-pressed={!isRegister} on:click={() => (isRegister = false)}>登录</button>
      <button type="button" aria-pressed={isRegister} on:click={() => (isRegister = true)}>注册</button>
    </div>

    <form on:submit|preventDefault={handleSubmit}>
      <label class="field" for="username">
        <span>{usernameLabel}</span>
        <input bind:this={usernameInput} data-modal-initial-focus="true" id="username" type="text" bind:value={username} placeholder={usernamePlaceholder} />
      </label>

      <label class="field" for="password">
        <span>密码</span>
        <input id="password" type="password" bind:value={password} placeholder={passwordPlaceholder} />
      </label>

      {#if error}<p class="error">{error}</p>{/if}

      <button type="submit" class="submit" disabled={loading || !username.trim() || !password}>
        {loading ? '正在处理...' : (isRegister ? '注册并进入 /' : '登录 /')}
      </button>
    </form>

    <p class="foot-note">
      {isRegister ? '已经有账号？' : '还没有账号？'}
      <button type="button" on:click={() => (isRegister = !isRegister)}>{isRegister ? '直接登录' : '现在注册'}</button>
    </p>
  </div>
</div>

<style>
	  .auth-frame {
	    position: fixed;
	    top: var(--app-modal-viewport-top, 0);
	    left: 0;
	    right: 0;
    height: var(--app-modal-viewport-height, 100dvh);
    z-index: 11000;
    display: grid;
    place-items: center;
    padding: var(--s3);
    overflow-y: auto;
	    overscroll-behavior: contain;
	  }

	  .auth-frame::before {
	    content: '';
	    position: fixed;
	    inset: 0;
	    background: var(--surface);
	  }

	  .scrim {
	    position: fixed;
	    inset: 0;
	    background: rgba(25, 25, 25, 0.18);
    backdrop-filter: blur(2px);
  }

  .modal {
    position: relative;
    width: min(100%, 420px);
    max-height: calc(var(--app-modal-viewport-height, 100dvh) - (var(--s3) * 2));
    border: 1px solid var(--hairline);
    border-radius: 16px;
    background: var(--surface);
    box-shadow: 0 24px 60px -24px rgba(25, 25, 25, 0.22);
    padding: var(--s5) var(--s4) var(--s4);
    overflow-y: auto;
  }

  .close {
    position: absolute;
    top: var(--s3);
    right: var(--s3);
    width: 30px;
    height: 30px;
    border: 1px solid var(--hairline);
    border-radius: 999px;
    color: var(--ink-soft);
    font-family: var(--sans);
    transition: border-color 180ms ease, color 180ms ease;
  }

  .close:hover {
    border-color: var(--ink);
    color: var(--ink);
  }

  .brand {
    margin-bottom: var(--s4);
    text-align: center;
    font-family: var(--sans);
    font-size: 18px;
    font-weight: 600;
  }

  .brand span {
    color: var(--clay);
  }

  .title {
    margin-bottom: var(--s1);
    text-align: center;
    font-family: var(--serif);
    font-size: 32px;
    font-weight: 400;
    letter-spacing: -0.02em;
  }

  .subtitle {
    margin-bottom: var(--s5);
    color: var(--ink-soft);
    text-align: center;
  }

  .switch {
    display: flex;
    margin-bottom: var(--s4);
    border: 1px solid var(--hairline);
    border-radius: 999px;
    background: var(--paper);
    padding: 3px;
  }

  .switch button {
    flex: 1;
    border-radius: 999px;
    color: var(--ink-soft);
    font-family: var(--sans);
    font-size: 14px;
    font-weight: 500;
    padding: 9px 0;
    transition: background 180ms ease, color 180ms ease;
  }

  .switch button[aria-pressed='true'] {
    background: var(--clay);
    color: var(--paper);
  }

  .field {
    display: block;
    margin-bottom: var(--s3);
  }

  .field span {
    display: block;
    margin-bottom: var(--s1);
    color: var(--ink-soft);
    font-family: var(--sans);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .field input {
    width: 100%;
    border: 1px solid var(--hairline);
    border-radius: var(--r-btn);
    background: var(--paper);
    padding: 12px 14px;
    font-size: 17px;
  }

  .field input:focus {
    border-color: var(--clay);
    outline: none;
  }

  .error {
    margin-bottom: var(--s3);
    border: 1px solid rgba(178, 54, 42, 0.2);
    border-radius: var(--r-btn);
    background: rgba(178, 54, 42, 0.07);
    color: #8b2e24;
    padding: 10px 12px;
    font-size: 14px;
  }

  .submit {
    width: 100%;
    border-radius: var(--r-btn);
    background: var(--clay);
    color: var(--paper);
    font-family: var(--sans);
    font-size: 15px;
    font-weight: 500;
    margin-top: var(--s2);
    padding: 13px 0;
    transition: background 180ms ease, transform 180ms ease;
  }

  .submit:hover:not(:disabled) {
    background: #b5664c;
    transform: translateY(-1px);
  }

  .submit:disabled {
    opacity: 0.5;
  }

  .foot-note {
    margin-top: var(--s4);
    color: var(--ink-soft);
    font-size: 14px;
    text-align: center;
  }

  .foot-note button {
    color: var(--clay);
  }

	  @media (max-width: 520px) {
	    .auth-frame {
	      align-items: stretch;
	      padding: 0;
	    }

	    .auth-frame::before {
	      background:
	        linear-gradient(180deg, rgba(250, 249, 245, 0.98), rgba(240, 238, 230, 0.98)),
	        var(--paper);
	    }

	    .scrim {
	      background: transparent;
	      backdrop-filter: none;
	    }

	    .modal {
	      display: flex;
      width: 100%;
      height: var(--app-modal-viewport-height, 100dvh);
      max-height: var(--app-modal-viewport-height, 100dvh);
      flex-direction: column;
      justify-content: flex-start;
      border: 0;
      border-radius: 0;
      box-shadow: none;
      padding: max(var(--s3), env(safe-area-inset-top)) var(--s3) max(var(--s3), env(safe-area-inset-bottom));
    }

    .close {
      top: max(var(--s3), env(safe-area-inset-top));
      right: var(--s3);
    }

    .brand {
      margin-bottom: var(--s2);
      padding-right: 42px;
      text-align: left;
      font-size: 16px;
    }

    .title {
      margin-top: 0;
      margin-bottom: 2px;
      font-family: var(--sans);
      font-size: 20px;
      font-weight: 800;
      letter-spacing: 0;
      text-align: left;
    }

    .subtitle {
      margin-bottom: var(--s3);
      font-size: 14px;
      text-align: left;
    }

    .switch {
      flex: 0 0 auto;
      margin-bottom: var(--s3);
    }

    form {
      flex: 0 0 auto;
    }

    .field {
      margin-bottom: var(--s2);
    }

    .field span {
      margin-bottom: 6px;
    }

    .field input {
      padding: 10px 12px;
    }

    .submit {
      margin-top: var(--s1);
      padding: 11px 0;
    }

    .foot-note {
      margin-top: var(--s2);
    }
  }
</style>
