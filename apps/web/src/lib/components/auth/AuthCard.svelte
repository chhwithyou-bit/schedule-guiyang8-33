<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { submitCommunityAuth } from '$lib/api/communityAuth';

  export let initialMode: 'login' | 'register' = 'login';

  const dispatch = createEventDispatcher<{
    success: { user: unknown };
  }>();

  let mode = initialMode;
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
      const data = await submitCommunityAuth(mode, normalizedUsername, password);
      if (data?.ok) {
        dispatch('success', { user: data.user });
      } else {
        error = data?.msg || '登录没成功，再试一次。';
      }
    } catch (eventError) {
      error = eventError instanceof Error ? eventError.message : '现在连不上，稍后再试。';
    } finally {
      loading = false;
    }
  }
</script>

<section class="auth-shell route-shell" aria-label="社区登录与注册">
  <p class="route-kicker">Community access</p>
  <h1>{mode === 'register' ? '来这里安个家' : '回来就好'}</h1>
  <p>{mode === 'register' ? '起个名字，就能开始发帖聊天。' : '登上账号，继续刚才的内容。'}</p>

  <form class="auth-form" on:submit|preventDefault={handleSubmit}>
    <label>
      <span>用户名</span>
      <input bind:value={username} type="text" placeholder="想让大家怎么叫你" />
    </label>

    <label>
      <span>密码</span>
      <input bind:value={password} type="password" placeholder="输一个你记得住的" />
    </label>

    {#if error}
      <p class="auth-error">{error}</p>
    {/if}

    <button type="submit" disabled={loading}>
      {loading ? '正在处理…' : mode === 'register' ? '注册并进入' : '登录'}
    </button>
  </form>

  <button class="auth-toggle" type="button" on:click={() => (mode = mode === 'login' ? 'register' : 'login')}>
    {mode === 'register' ? '已经有账号了，直接登录' : '还没有账号？现在注册'}
  </button>
</section>

<style>
  .auth-shell {
    max-width: 34rem;
    margin: 0 auto;
  }

  .auth-form {
    display: grid;
    gap: 1rem;
    margin-top: 1.5rem;
  }

  label {
    display: grid;
    gap: 0.5rem;
  }

  label span {
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    opacity: 0.6;
  }

  input {
    width: 100%;
    border-radius: 1rem;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    padding: 1rem 1.1rem;
  }

  button {
    border: 0;
    border-radius: 1rem;
    padding: 1rem 1.1rem;
    font-weight: 900;
    cursor: pointer;
  }

  .auth-form button {
    background: var(--color-primary);
    color: var(--color-button-text);
  }

  .auth-toggle {
    margin-top: 1rem;
    background: transparent;
    color: inherit;
    opacity: 0.72;
    padding-left: 0;
  }

  .auth-error {
    margin: 0;
    border-radius: 1rem;
    padding: 0.85rem 1rem;
    background: rgba(220, 38, 38, 0.18);
    color: #fecaca;
  }
</style>
