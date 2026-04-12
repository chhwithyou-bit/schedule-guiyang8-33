<script lang="ts">
  import { GEMINI_PROXY_PATH, submitGeminiProxy, type GeminiProxyRequest } from '$lib/api/proxy';

  const examplePayload = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: '用一句话说明这个代理页现在已经迁移为 apps/web 的 route-native 精简版本。'
          }
        ]
      }
    ]
  };

  let payloadText = JSON.stringify(examplePayload, null, 2);
  let isSubmitting = false;
  let statusText = '尚未发送请求';
  let errorText = '';
  let responseStatus: number | null = null;
  let responseContentType = 'application/json';
  let responseBody = '';

  function formatPayload() {
    try {
      payloadText = JSON.stringify(JSON.parse(payloadText), null, 2);
      errorText = '';
    } catch {
      errorText = '请求体不是合法 JSON，先修正后再发送。';
    }
  }

  async function handleSubmit() {
    errorText = '';
    responseStatus = null;
    responseBody = '';

    let payload: GeminiProxyRequest;
    try {
      payload = JSON.parse(payloadText) as GeminiProxyRequest;
    } catch {
      errorText = `请求体不是合法 JSON，无法发送到 ${GEMINI_PROXY_PATH}。`;
      statusText = '请求未发送';
      return;
    }

    if (!Array.isArray(payload?.contents) || payload.contents.length === 0) {
      errorText = '请求体需要包含非空 contents 数组。';
      statusText = '请求未发送';
      return;
    }

    isSubmitting = true;
    statusText = `正在发送到 ${GEMINI_PROXY_PATH}…`;

    try {
      const result = await submitGeminiProxy(payload);
      responseStatus = result.status;
      responseContentType = result.contentType;
      responseBody = result.body;
      statusText = result.ok ? '请求已完成' : '代理返回错误状态';
    } catch (error) {
      errorText = error instanceof Error ? error.message : '请求失败';
      statusText = '请求失败';
    } finally {
      isSubmitting = false;
    }
  }

  async function copyPayload() {
    try {
      await navigator.clipboard.writeText(payloadText);
      statusText = '示例请求已复制';
      errorText = '';
    } catch {
      errorText = '当前环境不支持复制到剪贴板。';
    }
  }
</script>

<section aria-labelledby="proxy-title" class="route-shell proxy-page">
  <header class="proxy-page__hero">
    <div>
      <p class="route-kicker">Proxy tools</p>
      <h1 id="proxy-title">代理服务</h1>
      <p>这里不再只是占位说明，而是直接给出可用的 Gemini 代理调试页，继续沿用旧 Worker 的 <code>{GEMINI_PROXY_PATH}</code> POST JSON 契约。</p>
    </div>
    <div class="proxy-page__summary" aria-label="代理页范围说明">
      <p class="proxy-page__summary-label">route-native 精简版</p>
      <ul>
        <li>保留现有 worker API，不额外改动鉴权和上游协议。</li>
        <li>提供示例请求体、原始响应预览和状态提示。</li>
        <li>便于后续把更多 proxy 工具继续拆到 apps/web 下。</li>
      </ul>
    </div>
  </header>

  <div class="proxy-page__grid">
    <article class="proxy-card proxy-card--editor">
      <div class="proxy-card__head">
        <div>
          <p class="proxy-card__eyebrow">Request</p>
          <h2>Gemini 请求体</h2>
        </div>
        <div class="proxy-card__actions">
          <button type="button" on:click={formatPayload}>格式化 JSON</button>
          <button type="button" on:click={copyPayload}>复制示例</button>
        </div>
      </div>

      <label class="proxy-field">
        <span>发送到 <code>{GEMINI_PROXY_PATH}</code> 的原始 JSON</span>
        <textarea
          bind:value={payloadText}
          rows="18"
          spellcheck="false"
          aria-label="Gemini 代理请求体"
        ></textarea>
      </label>

      <div class="proxy-submit-row">
        <button type="button" class="proxy-submit" on:click={handleSubmit} disabled={isSubmitting}>
          {#if isSubmitting}发送中…{:else}发送测试请求{/if}
        </button>
        <p class="proxy-status" aria-live="polite">{statusText}</p>
      </div>

      {#if errorText}
        <p class="proxy-error" role="alert">{errorText}</p>
      {/if}
    </article>

    <article class="proxy-card proxy-card--response">
      <div class="proxy-card__head">
        <div>
          <p class="proxy-card__eyebrow">Response</p>
          <h2>原始响应</h2>
        </div>
        <dl class="proxy-meta" aria-label="响应元数据">
          <div>
            <dt>状态</dt>
            <dd>{responseStatus ?? '—'}</dd>
          </div>
          <div>
            <dt>类型</dt>
            <dd>{responseContentType}</dd>
          </div>
        </dl>
      </div>

      <pre class="proxy-response" aria-label="Gemini 代理原始响应">{responseBody || '发送后会在这里显示上游返回的原始内容。'}</pre>
    </article>
  </div>
</section>

<style>
  .proxy-page {
    display: grid;
    gap: 1.25rem;
  }

  .proxy-page__hero,
  .proxy-card {
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 1.5rem;
    background: rgba(255, 255, 255, 0.05);
  }

  .proxy-page__hero {
    display: grid;
    gap: 1rem;
    padding: 1.5rem;
  }

  .proxy-page__summary {
    border-radius: 1.25rem;
    background: rgba(10, 18, 30, 0.46);
    padding: 1rem 1.1rem;
  }

  .proxy-page__summary-label,
  .proxy-card__eyebrow {
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.18em;
    opacity: 0.65;
    text-transform: uppercase;
  }

  .proxy-page__summary ul {
    margin: 0.75rem 0 0;
    padding-left: 1.1rem;
    display: grid;
    gap: 0.45rem;
    line-height: 1.6;
    opacity: 0.85;
  }

  .proxy-page__grid {
    display: grid;
    gap: 1rem;
  }

  .proxy-card {
    display: grid;
    gap: 1rem;
    padding: 1.25rem;
  }

  .proxy-card__head,
  .proxy-card__actions,
  .proxy-submit-row,
  .proxy-meta {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
  }

  .proxy-card h2 {
    margin-top: 0.3rem;
    font-size: 1.25rem;
    font-weight: 800;
  }

  .proxy-card__actions button,
  .proxy-submit,
  .proxy-field textarea {
    color: inherit;
  }

  .proxy-card__actions button,
  .proxy-submit {
    cursor: pointer;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
    padding: 0.7rem 1rem;
    font-weight: 700;
  }

  .proxy-submit[disabled] {
    cursor: progress;
    opacity: 0.7;
  }

  .proxy-field {
    display: grid;
    gap: 0.6rem;
  }

  .proxy-field span,
  .proxy-status,
  .proxy-meta dt {
    font-size: 0.9rem;
    opacity: 0.72;
  }

  .proxy-field textarea,
  .proxy-response {
    width: 100%;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 1.25rem;
    background: rgba(10, 18, 30, 0.62);
    padding: 1rem;
    font-family: 'SFMono-Regular', 'Consolas', 'Liberation Mono', monospace;
    font-size: 0.9rem;
    line-height: 1.6;
  }

  .proxy-field textarea {
    min-height: 24rem;
    resize: vertical;
  }

  .proxy-response {
    margin: 0;
    min-height: 24rem;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .proxy-meta {
    margin: 0;
  }

  .proxy-meta div {
    display: grid;
    gap: 0.25rem;
    min-width: 8rem;
  }

  .proxy-meta dd {
    margin: 0;
    font-weight: 700;
  }

  .proxy-error {
    margin: 0;
    color: #fca5a5;
    font-size: 0.95rem;
  }

  @media (min-width: 960px) {
    .proxy-page__hero {
      grid-template-columns: minmax(0, 1.8fr) minmax(18rem, 1fr);
      align-items: start;
    }

    .proxy-page__grid {
      grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
      align-items: start;
    }
  }
</style>
