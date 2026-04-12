<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte';
  import { communityFetch } from '$lib/api/communityAuth';

  export let open = false;

  const dispatch = createEventDispatcher<{
    close: void;
    created: { id: string };
  }>();

  let dialogRef: HTMLDivElement | null = null;
  let textareaRef: HTMLTextAreaElement | null = null;
  let closeButtonRef: HTMLButtonElement | null = null;
  let content = '';
  let error = '';
  let submitting = false;

  $: if (open) {
    void primeDialogFocus();
  } else {
    content = '';
    error = '';
    submitting = false;
  }

  async function primeDialogFocus() {
    await tick();
    if (!open) return;
    textareaRef?.focus();
  }

  function requestClose() {
    if (submitting) return;
    dispatch('close');
  }

  function handleDialogKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      requestClose();
      return;
    }

    if (event.key !== 'Tab' || !dialogRef) return;

    const items = Array.from(
      dialogRef.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
    ).filter((element) => element.getAttribute('aria-hidden') !== 'true');

    if (items.length === 0) {
      event.preventDefault();
      dialogRef.focus();
      return;
    }

    const first = items[0];
    const last = items[items.length - 1];
    const current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (event.shiftKey) {
      if (!current || current === first || !dialogRef.contains(current)) {
        event.preventDefault();
        last.focus();
      }
      return;
    }

    if (!current || current === last || !dialogRef.contains(current)) {
      event.preventDefault();
      first.focus();
    }
  }

  async function submitPost() {
    const trimmedContent = content.trim();
    if (!trimmedContent || submitting) return;

    submitting = true;
    error = '';

    try {
      const response = await communityFetch('/api/community/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: trimmedContent })
      });
      const data = await response.json().catch(() => ({ ok: false, msg: '发布失败。' }));

      if (!response.ok || !data?.ok) {
        error = data?.msg || '发布失败。';
        return;
      }

      dispatch('created', { id: String(data.id || data.post_id || '') });
    } catch (submitError) {
      error = submitError instanceof Error ? submitError.message : '发布失败。';
    } finally {
      submitting = false;
    }
  }
</script>

{#if open}
  <div class="composer-overlay" aria-hidden="true" on:click={requestClose}></div>

  <div
    bind:this={dialogRef}
    class="composer-dialog"
    role="dialog"
    aria-modal="true"
    aria-label="发点近况"
    tabindex="-1"
    on:keydown={handleDialogKeydown}
  >
    <div class="composer-shell">
      <div class="composer-head">
        <div>
          <p class="composer-kicker">Community post</p>
          <h2>发点近况</h2>
        </div>

        <button bind:this={closeButtonRef} type="button" class="composer-close" on:click={requestClose}>
          关闭
        </button>
      </div>

      <label class="composer-field">
        <span>内容</span>
        <textarea
          bind:this={textareaRef}
          bind:value={content}
          rows="8"
          maxlength="1200"
          placeholder="今天想说什么，直接写下来。"
        ></textarea>
      </label>

      {#if error}
        <p class="composer-error">{error}</p>
      {/if}

      <div class="composer-footer">
        <p>{content.trim().length} / 1200</p>
        <button type="button" class="composer-submit" disabled={submitting || !content.trim()} on:click={submitPost}>
          {submitting ? '发送中…' : '发出去'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .composer-overlay {
    position: fixed;
    inset: 0;
    z-index: 6100;
    background:
      radial-gradient(circle at 20% 10%, rgba(var(--glow-primary-rgb, 249 115 22), 0.12), transparent 28%),
      rgba(8, 15, 26, 0.62);
    backdrop-filter: blur(12px);
  }

  .composer-dialog {
    position: fixed;
    inset: 0;
    z-index: 6200;
    display: grid;
    place-items: center;
    padding: 1.5rem;
  }

  .composer-shell {
    width: min(44rem, 100%);
    border-radius: 2rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background:
      radial-gradient(circle at top right, rgba(var(--glow-primary-rgb, 249 115 22), 0.16), transparent 32%),
      rgba(8, 15, 26, 0.9);
    padding: 1.4rem;
    box-shadow: 0 28px 80px rgba(var(--shadow-rgb, 0 0 0), 0.38);
  }

  .composer-head,
  .composer-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .composer-kicker,
  .composer-field span {
    margin: 0;
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    opacity: 0.62;
  }

  .composer-head h2 {
    margin: 0.6rem 0 0;
    font-size: clamp(1.8rem, 4vw, 2.6rem);
    font-weight: 900;
    letter-spacing: -0.04em;
  }

  .composer-close,
  .composer-submit {
    border: 0;
    border-radius: 999px;
    padding: 0.85rem 1.2rem;
    font-weight: 900;
    cursor: pointer;
  }

  .composer-close {
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
  }

  .composer-field {
    display: grid;
    gap: 0.75rem;
    margin-top: 1.35rem;
  }

  .composer-field textarea {
    width: 100%;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 1.5rem;
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    padding: 1.2rem 1.3rem;
    resize: vertical;
    line-height: 1.7;
  }

  .composer-field textarea:focus {
    outline: 2px solid color-mix(in srgb, var(--color-primary, #f97316) 72%, white 28%);
    outline-offset: 2px;
  }

  .composer-error {
    margin: 1rem 0 0;
    border-radius: 1rem;
    background: rgba(220, 38, 38, 0.18);
    color: #fecaca;
    padding: 0.9rem 1rem;
  }

  .composer-footer {
    margin-top: 1rem;
  }

  .composer-footer p {
    margin: 0;
    font-size: 0.85rem;
    opacity: 0.62;
  }

  .composer-submit {
    background: var(--color-primary, #f97316);
    color: var(--color-button-text, #fff7ed);
    min-width: 7.4rem;
  }

  .composer-submit:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  @media (max-width: 640px) {
    .composer-dialog {
      padding: 1rem;
      align-items: end;
    }

    .composer-shell {
      border-radius: 1.5rem;
      padding: 1.1rem;
    }

    .composer-head,
    .composer-footer {
      align-items: flex-start;
      flex-direction: column;
    }

    .composer-close,
    .composer-submit {
      width: 100%;
    }
  }
</style>
