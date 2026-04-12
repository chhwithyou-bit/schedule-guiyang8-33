<script lang="ts">
  import { onMount } from 'svelte';
  import { fly, fade } from 'svelte/transition';

  type ProxyNode = {
    id: string;
    name: string;
    raw: string;
    protocol: string;
    source_id?: string;
    source_label?: string;
  };

  type NodeSource = {
    id: string;
    label: string;
    source_type: string;
    enabled: boolean;
    node_count: number;
    updated_at?: string;
    last_error?: string;
  };

  type NodePayload = {
    ok: boolean;
    msg?: string;
    nodes?: ProxyNode[];
    sources?: NodeSource[];
    subscription_url?: string;
    raw?: string;
    clients?: Record<string, string>;
  };

  const clientCards = [
    { id: 'shadowrocket', label: 'Shadowrocket', detail: 'iOS 一键导入' },
    { id: 'clash', label: 'Clash', detail: '通用订阅地址' },
    { id: 'surge', label: 'Surge', detail: 'Apple 生态' },
    { id: 'loon', label: 'Loon', detail: 'iOS/macOS' },
    { id: 'stash', label: 'Stash', detail: '规则集常用' },
    { id: 'quantumult_x', label: 'Quantumult X', detail: 'QX 导入' },
    { id: 'sing_box', label: 'sing-box', detail: '通用导入' },
    { id: 'v2rayn', label: 'v2rayN', detail: 'Windows 常用' },
    { id: 'v2rayng', label: 'v2rayNG', detail: 'Android 常用' }
  ];

  let loading = false;
  let password = '';
  let authed = false;
  let nodes: ProxyNode[] = [];
  let sources: NodeSource[] = [];
  let subscriptionUrl = '';
  let rawBundle = '';
  let clientLinks: Record<string, string> = {};
  let infoMessage = '';
  let errorMessage = '';
  let revealRef: HTMLElement | null = null;
  let hasCachedPassword = false;

  $: availableClientCount = clientCards.filter((client) => Boolean(clientLinks[client.id])).length;
  $: sourceCount = sources.length;
  $: hasSubscription = Boolean(subscriptionUrl);
  $: hasRawBundle = Boolean(rawBundle.trim());

  function clearUnlockedState() {
    authed = false;
    nodes = [];
    sources = [];
    subscriptionUrl = '';
    rawBundle = '';
    clientLinks = {};
  }

  onMount(() => {
    if (typeof window === 'undefined') return;
    const cached = localStorage.getItem('proxyNodesPassword');
    if (cached) {
      password = cached;
      hasCachedPassword = true;
      void unlockNodes(true);
    }
  });

  async function unlockNodes(silent = false) {
    const trimmedPassword = password.trim();
    if (!trimmedPassword) {
      errorMessage = '先输入访问密码。';
      return;
    }

    loading = true;
    errorMessage = '';
    if (!silent) infoMessage = '';

    try {
      const res = await fetch(`/api/nodes?pwd=${encodeURIComponent(trimmedPassword)}`);
      const data: NodePayload = await res.json();
      if (!res.ok || !data.ok) {
        clearUnlockedState();
        errorMessage = data.msg || '访问密码不对。';
        return;
      }

      authed = true;
      nodes = Array.isArray(data.nodes) ? data.nodes : [];
      sources = Array.isArray(data.sources) ? data.sources : [];
      subscriptionUrl = data.subscription_url || '';
      rawBundle = data.raw || '';
      clientLinks = data.clients || {};
      localStorage.setItem('proxyNodesPassword', trimmedPassword);
      hasCachedPassword = true;
      infoMessage = nodes.length ? `已解锁 ${nodes.length} 条节点。` : '密码通过了，但还没有可用节点。';

      requestAnimationFrame(() => {
        if (!revealRef) return;
        revealRef.animate(
          [
            { transform: 'translateY(24px)', opacity: 0 },
            { transform: 'translateY(0)', opacity: 1 }
          ],
          { duration: 550, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' }
        );
      });
    } catch (e) {
      console.error('Failed to load proxy nodes', e);
      clearUnlockedState();
      errorMessage = '节点暂时没拉出来，稍后再试。';
    } finally {
      loading = false;
    }
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      infoMessage = `${label} 已复制。`;
      errorMessage = '';
    } catch (e) {
      console.error('Copy failed', e);
      errorMessage = `${label} 复制失败。`;
    }
  }

  function openClient(clientId: string) {
    const link = clientLinks[clientId];
    if (!link) {
      errorMessage = '这个客户端还没有可用跳转。';
      return;
    }
    window.location.href = link;
    infoMessage = `正在尝试打开 ${clientCards.find((item) => item.id === clientId)?.label || '客户端'}。`;
  }

  function resetAccess() {
    clearUnlockedState();
    hasCachedPassword = false;
    localStorage.removeItem('proxyNodesPassword');
    infoMessage = '已清除本地访问密码。';
    errorMessage = '';
  }

  function describeSource(source: NodeSource) {
    return `${source.label} · ${source.source_type} · ${source.node_count || 0} 条`;
  }
</script>

<section aria-labelledby="nodes-title" class="nodes-view route-shell pb-32">
  <div class="mb-10 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
    <div>
      <p class="route-kicker">proxy hub</p>
      <h1 id="nodes-title" class="text-4xl font-black tracking-tight md:text-6xl">代理节点</h1>
      <p class="mt-4 max-w-3xl text-sm font-medium leading-7 opacity-70 md:text-base">
        管理员维护节点源后，普通用户在这里输入统一密码，就能复制订阅、导出配置，或者直接尝试打开目标客户端。
      </p>
      <div class="mt-5 flex flex-wrap gap-3 text-[11px] font-black uppercase tracking-[0.24em] opacity-55">
        <span class="rounded-full border border-white/10 bg-[rgba(255,255,255,0.06)] px-4 py-2">订阅分发</span>
        <span class="rounded-full border border-white/10 bg-[rgba(255,255,255,0.06)] px-4 py-2">客户端跳转</span>
        <span class="rounded-full border border-white/10 bg-[rgba(255,255,255,0.06)] px-4 py-2">来源透明展示</span>
      </div>
    </div>

    <form on:submit|preventDefault={() => unlockNodes()} class="w-full xl:max-w-md" aria-label="节点访问表单">
      <div class="rounded-[32px] border border-white/12 bg-[rgba(255,255,255,0.08)] p-3 shadow-xl backdrop-blur-[18px]">
        <div class="flex flex-col gap-3 sm:flex-row">
          <input
            bind:value={password}
            type="password"
            placeholder="输入访问密码..."
            class="min-w-0 flex-1 rounded-2xl border border-white/30 bg-white/15 px-5 py-4 font-medium text-[var(--color-text,#fff4ed)] outline-none transition-all placeholder:text-[var(--color-text,#fff4ed)]/40 focus:ring-2 focus:ring-[var(--color-primary,#fac7b7)]"
            style="background-color: rgba(255, 255, 255, 0.18);"
          />
          <button type="submit" class="rounded-2xl bg-[var(--color-primary)] px-6 py-4 text-xs font-black uppercase tracking-[0.22em] text-[var(--color-bg)] shadow-lg transition-transform hover:scale-105 disabled:opacity-50" disabled={loading}>
            {loading ? '解锁中…' : authed ? '重新拉取' : '解锁节点'}
          </button>
        </div>
      </div>
    </form>
  </div>

  {#if infoMessage}
    <div transition:fade class="mb-6 rounded-[28px] border border-emerald-400/20 bg-emerald-500/10 px-5 py-4 text-sm font-bold text-emerald-200">
      {infoMessage}
    </div>
  {/if}

  {#if errorMessage}
    <div transition:fade class="mb-6 rounded-[28px] border border-red-400/20 bg-red-500/10 px-5 py-4 text-sm font-bold text-red-200">
      {errorMessage}
    </div>
  {/if}

  {#if authed}
    <div bind:this={revealRef} class="space-y-6">
      <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="节点概览统计">
        <article class="rounded-[32px] border border-white/10 bg-[rgba(255,255,255,0.08)] p-5 shadow-xl backdrop-blur-[18px]">
          <p class="text-[10px] font-black uppercase tracking-[0.28em] opacity-35">已解锁节点</p>
          <p class="mt-3 text-3xl font-black tracking-tight">{nodes.length}</p>
          <p class="mt-2 text-sm font-medium opacity-65">当前可复制或导出的可用节点数。</p>
        </article>
        <article class="rounded-[32px] border border-white/10 bg-[rgba(255,255,255,0.08)] p-5 shadow-xl backdrop-blur-[18px]">
          <p class="text-[10px] font-black uppercase tracking-[0.28em] opacity-35">节点来源</p>
          <p class="mt-3 text-3xl font-black tracking-tight">{sourceCount}</p>
          <p class="mt-2 text-sm font-medium opacity-65">后台当前启用或保留的来源记录。</p>
        </article>
        <article class="rounded-[32px] border border-white/10 bg-[rgba(255,255,255,0.08)] p-5 shadow-xl backdrop-blur-[18px]">
          <p class="text-[10px] font-black uppercase tracking-[0.28em] opacity-35">客户端方案</p>
          <p class="mt-3 text-3xl font-black tracking-tight">{availableClientCount}</p>
          <p class="mt-2 text-sm font-medium opacity-65">当前接口返回的一键跳转入口数量。</p>
        </article>
        <article class="rounded-[32px] border border-white/10 bg-[rgba(255,255,255,0.08)] p-5 shadow-xl backdrop-blur-[18px]">
          <p class="text-[10px] font-black uppercase tracking-[0.28em] opacity-35">本机记忆</p>
          <p class="mt-3 text-3xl font-black tracking-tight">{hasCachedPassword ? '已保存' : '未保存'}</p>
          <p class="mt-2 text-sm font-medium opacity-65">清除密码后会移除本地自动解锁能力。</p>
        </article>
      </section>

      <section class="rounded-[40px] border border-white/10 bg-[rgba(255,255,255,0.08)] p-6 shadow-xl backdrop-blur-[18px]">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p class="text-[10px] font-black uppercase tracking-[0.28em] opacity-35">订阅总览</p>
            <h2 class="mt-2 text-2xl font-black tracking-tight">一键复制或直接打开</h2>
            <p class="mt-2 text-sm font-medium opacity-70">支持主流客户端。浏览器里能做的优先做成一键，不能自动粘贴的就退回到复制方案。</p>
          </div>
          <div class="flex flex-wrap gap-3">
            <button type="button" class="rounded-full bg-[var(--color-primary)] px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-[var(--color-bg)] shadow-lg transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-45" on:click={() => copyText(subscriptionUrl, '订阅地址')} disabled={!hasSubscription}>
              复制订阅
            </button>
            <button type="button" class="rounded-full border border-white/10 bg-[rgba(255,255,255,0.08)] px-5 py-3 text-xs font-black uppercase tracking-[0.2em] transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-45" on:click={() => copyText(rawBundle, '原始节点')} disabled={!hasRawBundle}>
              复制原始节点
            </button>
            <button type="button" class="rounded-full border border-white/10 bg-[rgba(255,255,255,0.08)] px-5 py-3 text-xs font-black uppercase tracking-[0.2em] transition-transform hover:scale-105" on:click={resetAccess}>
              清除密码
            </button>
          </div>
        </div>

        <div class="mt-5 grid gap-3 md:grid-cols-3">
          <div class="rounded-[28px] border border-white/10 bg-[rgba(255,255,255,0.04)] px-4 py-4">
            <p class="text-[10px] font-black uppercase tracking-[0.24em] opacity-35">订阅地址</p>
            <p class="mt-2 break-all text-sm font-medium opacity-70">{hasSubscription ? subscriptionUrl : '当前接口没有返回可复制订阅地址。'}</p>
          </div>
          <div class="rounded-[28px] border border-white/10 bg-[rgba(255,255,255,0.04)] px-4 py-4">
            <p class="text-[10px] font-black uppercase tracking-[0.24em] opacity-35">原始节点</p>
            <p class="mt-2 text-sm font-medium opacity-70">{hasRawBundle ? `已聚合 ${nodes.length} 条原始节点，可一键复制。` : '当前没有可聚合的原始节点内容。'}</p>
          </div>
          <div class="rounded-[28px] border border-white/10 bg-[rgba(255,255,255,0.04)] px-4 py-4">
            <p class="text-[10px] font-black uppercase tracking-[0.24em] opacity-35">兼容客户端</p>
            <p class="mt-2 text-sm font-medium opacity-70">已提供 {availableClientCount} 个可跳转入口，不可跳转的客户端会保留复制方案。</p>
          </div>
        </div>
      </section>

      <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {#each clientCards as client, index (client.id)}
          <article in:fly={{ y: 24, duration: 420, delay: index * 35 }} class="rounded-[32px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-5 shadow-xl backdrop-blur-[18px]">
            <p class="text-[10px] font-black uppercase tracking-[0.24em] opacity-35">客户端</p>
            <h3 class="mt-2 text-xl font-black tracking-tight">{client.label}</h3>
            <p class="mt-2 text-sm font-medium opacity-70">{client.detail}</p>
            <div class="mt-5 flex flex-wrap gap-2">
              <button type="button" class="rounded-full bg-[var(--color-primary)] px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--color-bg)] shadow-lg transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-45" on:click={() => openClient(client.id)} disabled={!clientLinks[client.id]}>
                {clientLinks[client.id] ? '打开客户端' : '暂未接入'}
              </button>
              <button type="button" class="rounded-full border border-white/10 bg-[rgba(255,255,255,0.08)] px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-45" on:click={() => copyText(subscriptionUrl, `${client.label} 订阅地址`)} disabled={!hasSubscription}>
                复制链接
              </button>
            </div>
          </article>
        {/each}
      </section>

      <div class="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <section class="rounded-[40px] border border-white/10 bg-[rgba(255,255,255,0.08)] p-6 shadow-xl backdrop-blur-[18px]">
          <div class="mb-6 flex items-center justify-between">
            <div>
              <p class="text-[10px] font-black uppercase tracking-[0.28em] opacity-35">节点列表</p>
              <h2 class="mt-2 text-2xl font-black tracking-tight">可用节点</h2>
            </div>
            <p class="text-[10px] font-black uppercase tracking-[0.22em] opacity-35">{nodes.length} 条</p>
          </div>

          {#if nodes.length > 0}
            <div class="space-y-3">
              {#each nodes as node, index (node.id)}
                <article in:fly={{ y: 18, duration: 380, delay: index * 20 }} class="rounded-[28px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-4">
                  <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <h3 class="truncate text-lg font-black tracking-tight">{node.name}</h3>
                        <span class="rounded-full border border-white/10 px-2 py-1 text-[9px] font-black uppercase tracking-[0.18em] opacity-60">{node.protocol}</span>
                      </div>
                      <p class="mt-2 text-xs font-black uppercase tracking-[0.18em] opacity-35">来源：{node.source_label || '未标记来源'}</p>
                      <p class="mt-2 line-clamp-2 break-all text-sm font-medium opacity-65">{node.raw}</p>
                    </div>
                    <button type="button" class="rounded-full bg-[var(--color-primary)] px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--color-bg)] shadow-lg transition-transform hover:scale-105" on:click={() => copyText(node.raw, node.name)}>
                      复制这一条
                    </button>
                  </div>
                </article>
              {/each}
            </div>
          {:else}
            <div class="rounded-[28px] border border-white/10 bg-[rgba(255,255,255,0.08)] px-5 py-10 text-center text-sm font-bold opacity-50">
              现在还没有可下发的节点。
            </div>
          {/if}
        </section>

        <section class="rounded-[40px] border border-white/10 bg-[rgba(255,255,255,0.08)] p-6 shadow-xl backdrop-blur-[18px]">
          <div class="mb-6 flex items-center justify-between">
            <div>
              <p class="text-[10px] font-black uppercase tracking-[0.28em] opacity-35">节点来源</p>
              <h2 class="mt-2 text-2xl font-black tracking-tight">后台发布情况</h2>
            </div>
            <p class="text-[10px] font-black uppercase tracking-[0.22em] opacity-35">{sources.length} 个</p>
          </div>

          {#if sources.length > 0}
            <div class="space-y-4">
              {#each sources as source, index (source.id)}
                <article in:fly={{ y: 18, duration: 360, delay: index * 20 }} class="rounded-[28px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-5" aria-label={describeSource(source)}>
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <h3 class="text-lg font-black tracking-tight">{source.label}</h3>
                      <p class="mt-2 text-xs font-black uppercase tracking-[0.2em] opacity-35">{source.source_type} · {source.node_count || 0} 条</p>
                    </div>
                    <span class="rounded-full px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] {source.enabled ? 'bg-emerald-500/15 text-emerald-200' : 'bg-[rgba(255,255,255,0.08)] opacity-50'}">
                      {source.enabled ? '启用中' : '已关闭'}
                    </span>
                  </div>
                  <div class="mt-4 grid gap-3 md:grid-cols-2">
                    <div>
                      <p class="text-[10px] font-black uppercase tracking-[0.18em] opacity-35">最近状态</p>
                      {#if source.last_error}
                        <p class="mt-2 text-sm font-medium text-red-200/90">{source.last_error}</p>
                      {:else}
                        <p class="mt-2 text-sm font-medium opacity-65">解析正常，可参与当前节点池分发。</p>
                      {/if}
                    </div>
                    <div>
                      <p class="text-[10px] font-black uppercase tracking-[0.18em] opacity-35">更新时间</p>
                      <p class="mt-2 text-sm font-medium opacity-65">{source.updated_at || '未记录'}</p>
                    </div>
                  </div>
                </article>
              {/each}
            </div>
          {:else}
            <div class="rounded-[28px] border border-white/10 bg-[rgba(255,255,255,0.08)] px-5 py-10 text-center text-sm font-bold opacity-50">
              管理端还没有配置节点来源。
            </div>
          {/if}
        </section>
      </div>
    </div>
  {/if}
</section>
