<script lang="ts">
  import { onMount } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { gsap } from 'gsap';
  import AnimatedHeading from '../ui/AnimatedHeading.svelte';

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

  onMount(() => {
    if (typeof window === 'undefined') return;
    const cached = localStorage.getItem('proxyNodesPassword');
    if (cached) {
      password = cached;
      void unlockNodes(true);
    }
  });

  async function unlockNodes(silent = false) {
    if (!password.trim()) {
      errorMessage = '先输入访问密码。';
      return;
    }

    loading = true;
    errorMessage = '';
    if (!silent) infoMessage = '';

    try {
      const res = await fetch(`/api/nodes?pwd=${encodeURIComponent(password.trim())}`);
      const data: NodePayload = await res.json();
      if (!data.ok) {
        authed = false;
        nodes = [];
        sources = [];
        subscriptionUrl = '';
        rawBundle = '';
        clientLinks = {};
        errorMessage = data.msg || '访问密码不对。';
        return;
      }

      authed = true;
      nodes = Array.isArray(data.nodes) ? data.nodes : [];
      sources = Array.isArray(data.sources) ? data.sources : [];
      subscriptionUrl = data.subscription_url || '';
      rawBundle = data.raw || '';
      clientLinks = data.clients || {};
      localStorage.setItem('proxyNodesPassword', password.trim());
      infoMessage = nodes.length ? `已解锁 ${nodes.length} 条节点。` : '密码通过了，但还没有可用节点。';

      requestAnimationFrame(() => {
        if (!revealRef) return;
        gsap.fromTo(revealRef, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.55, ease: 'power3.out' });
      });
    } catch (e) {
      console.error('Failed to load proxy nodes', e);
      authed = false;
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
    authed = false;
    nodes = [];
    sources = [];
    subscriptionUrl = '';
    rawBundle = '';
    clientLinks = {};
    localStorage.removeItem('proxyNodesPassword');
    infoMessage = '已清除本地访问密码。';
    errorMessage = '';
  }
</script>

<div class="nodes-view pb-32">
  <div class="mb-10 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
    <div>
      <AnimatedHeading text="代理节点" className="text-[10vw] md:text-[8vw]" />
      <p class="mt-4 max-w-3xl text-sm font-medium leading-7 opacity-70 md:text-base">
        管理员维护节点源后，普通用户在这里输入统一密码，就能复制订阅、导出配置，或者直接尝试打开目标客户端。
      </p>
    </div>

    <form on:submit|preventDefault={() => unlockNodes()} class="w-full xl:max-w-md">
      <div class="rounded-[32px] border border-white/10 bg-white/5 p-3 shadow-2xl backdrop-blur-xl">
        <div class="flex flex-col gap-3 sm:flex-row">
          <input
            bind:value={password}
            type="password"
            placeholder="输入访问密码..."
            class="min-w-0 flex-1 rounded-2xl bg-white/15 border border-white/30 px-5 py-4 font-medium text-[var(--color-text,#fff4ed)] placeholder:text-[var(--color-text,#fff4ed)]/40 transition-all focus:ring-2 focus:ring-[var(--color-primary,#fac7b7)] outline-none"
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
      <section class="rounded-[40px] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p class="text-[10px] font-black uppercase tracking-[0.28em] opacity-35">订阅总览</p>
            <h3 class="mt-2 text-2xl font-black tracking-tight">一键复制或直接打开</h3>
            <p class="mt-2 text-sm font-medium opacity-70">支持主流客户端。浏览器里能做的优先做成一键，不能自动粘贴的就退回到复制方案。</p>
          </div>
          <div class="flex flex-wrap gap-3">
            <button type="button" class="rounded-full bg-[var(--color-primary)] px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-[var(--color-bg)] shadow-lg transition-transform hover:scale-105" on:click={() => copyText(subscriptionUrl, '订阅地址')}>
              复制订阅
            </button>
            <button type="button" class="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] transition-transform hover:scale-105" on:click={() => copyText(rawBundle, '原始节点')}>
              复制原始节点
            </button>
            <button type="button" class="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] transition-transform hover:scale-105" on:click={resetAccess}>
              清除密码
            </button>
          </div>
        </div>
      </section>

      <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {#each clientCards as client, index (client.id)}
          <article in:fly={{ y: 24, duration: 420, delay: index * 35 }} class="rounded-[32px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-5 shadow-xl backdrop-blur-xl">
            <p class="text-[10px] font-black uppercase tracking-[0.24em] opacity-35">客户端</p>
            <h4 class="mt-2 text-xl font-black tracking-tight">{client.label}</h4>
            <p class="mt-2 text-sm font-medium opacity-70">{client.detail}</p>
            <div class="mt-5 flex flex-wrap gap-2">
              <button type="button" class="rounded-full bg-[var(--color-primary)] px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--color-bg)] shadow-lg transition-transform hover:scale-105" on:click={() => openClient(client.id)}>
                打开客户端
              </button>
              <button type="button" class="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-transform hover:scale-105" on:click={() => copyText(subscriptionUrl, `${client.label} 订阅地址`)}>
                复制链接
              </button>
            </div>
          </article>
        {/each}
      </section>

      <div class="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <section class="rounded-[40px] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
          <div class="mb-6 flex items-center justify-between">
            <div>
              <p class="text-[10px] font-black uppercase tracking-[0.28em] opacity-35">节点列表</p>
              <h3 class="mt-2 text-2xl font-black tracking-tight">可用节点</h3>
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
                        <h4 class="truncate text-lg font-black tracking-tight">{node.name}</h4>
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
            <div class="rounded-[28px] border border-white/10 bg-white/5 px-5 py-10 text-center text-sm font-bold opacity-50">
              现在还没有可下发的节点。
            </div>
          {/if}
        </section>

        <section class="rounded-[40px] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
          <div class="mb-6 flex items-center justify-between">
            <div>
              <p class="text-[10px] font-black uppercase tracking-[0.28em] opacity-35">节点来源</p>
              <h3 class="mt-2 text-2xl font-black tracking-tight">后台发布情况</h3>
            </div>
            <p class="text-[10px] font-black uppercase tracking-[0.22em] opacity-35">{sources.length} 个</p>
          </div>

          {#if sources.length > 0}
            <div class="space-y-4">
              {#each sources as source, index (source.id)}
                <article in:fly={{ y: 18, duration: 360, delay: index * 20 }} class="rounded-[28px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-5">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <h4 class="text-lg font-black tracking-tight">{source.label}</h4>
                      <p class="mt-2 text-xs font-black uppercase tracking-[0.2em] opacity-35">{source.source_type} · {source.node_count || 0} 条</p>
                    </div>
                    <span class="rounded-full px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] {source.enabled ? 'bg-emerald-500/15 text-emerald-200' : 'bg-white/5 opacity-50'}">
                      {source.enabled ? '启用中' : '已关闭'}
                    </span>
                  </div>
                  {#if source.last_error}
                    <p class="mt-3 text-sm font-medium text-red-200/90">{source.last_error}</p>
                  {:else}
                    <p class="mt-3 text-sm font-medium opacity-65">最后更新：{source.updated_at || '未记录'}</p>
                  {/if}
                </article>
              {/each}
            </div>
          {:else}
            <div class="rounded-[28px] border border-white/10 bg-white/5 px-5 py-10 text-center text-sm font-bold opacity-50">
              管理端还没有配置节点来源。
            </div>
          {/if}
        </section>
      </div>
    </div>
  {/if}
</div>
