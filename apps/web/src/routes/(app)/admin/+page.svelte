<script lang="ts">
  import { onMount } from 'svelte';
  import {
    communityFetch,
    isCommunityAdmin,
    readStoredCommunitySession,
    type CommunitySession
  } from '$lib/api/communityAuth';

  type AdminReport = {
    id: string;
    target_type: string;
    target_id: string;
    reason: string;
    user_id: string;
  };

  type AdminUser = {
    id: string;
    username: string;
    role: string;
    drive_used: number;
    drive_quota: number;
    is_banned: number;
    avatar_url?: string;
  };

  type NodeSource = {
    id: string;
    label: string;
    source_type: string;
    node_count?: number;
    updated_at?: string;
    last_error?: string;
  };

  type ProxyNode = {
    name: string;
    protocol: string;
    source_label?: string;
    raw: string;
  };

  type Announcement = {
    content: string;
    updatedAt: string;
  };

  type AdminTab = 'reports' | 'users' | 'announcement' | 'nodes';

  let session: CommunitySession | null = null;
  let loading = false;
  let reports: AdminReport[] = [];
  let users: AdminUser[] = [];
  let announcement: Announcement = { content: '', updatedAt: '' };
  let activeTab: AdminTab = 'reports';
  let nodeSources: NodeSource[] = [];
  let proxyNodes: ProxyNode[] = [];
  let nodePassword = '';
  let nodesPasswordConfigured = false;
  let statusMessage = '';
  let statusTone: 'success' | 'error' | 'info' = 'info';
  let nodeSourceForm = {
    source_label: '',
    source_type: 'manual',
    source_url: '',
    source_content: ''
  };

  $: canAccessAdmin = isCommunityAdmin(session);

  onMount(async () => {
    const nextSession = readStoredCommunitySession();
    session = nextSession;

    if (isCommunityAdmin(nextSession)) {
      await fetchAdminData();
    }
  });

  async function fetchAdminData() {
    loading = true;
    statusMessage = '';

    try {
      const response = await communityFetch('/api/community/admin/data');
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        statusTone = 'error';
        statusMessage = data?.msg || '管理数据没有成功返回。';
        return;
      }

      reports = Array.isArray(data.reports) ? data.reports : [];
      users = Array.isArray(data.users) ? data.users : [];
      announcement = data.announcement || { content: '', updatedAt: '' };
      nodeSources = Array.isArray(data.node_sources) ? data.node_sources : [];
      proxyNodes = Array.isArray(data.proxy_nodes) ? data.proxy_nodes : [];
      nodesPasswordConfigured = Boolean(data.nodes_password_configured);
    } catch (error) {
      console.error('Failed to fetch admin data', error);
      statusTone = 'error';
      statusMessage = '管理数据加载失败，请稍后再试。';
    } finally {
      loading = false;
    }
  }

  async function handleAction(
    action: string,
    target_type: string,
    target_id: string,
    extra: Record<string, unknown> = {},
    skipConfirm = false
  ) {
    if (!skipConfirm && !window.confirm(`确认执行这项管理操作吗？\n${action}`)) return false;

    try {
      statusMessage = '';
      statusTone = 'info';

      const response = await communityFetch('/api/community/admin/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, target_type, target_id, ...extra })
      });
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        statusTone = 'error';
        statusMessage = `操作没成功：${data?.msg || '请稍后再试'}`;
        return false;
      }

      if (Array.isArray(data.node_sources)) nodeSources = data.node_sources;
      if (Array.isArray(data.proxy_nodes)) proxyNodes = data.proxy_nodes;

      statusTone = 'success';
      statusMessage = `操作已完成：${action}`;
      await fetchAdminData();
      return true;
    } catch (error) {
      statusTone = 'error';
      statusMessage = `发生错误：${error instanceof Error ? error.message : '未知错误'}`;
      return false;
    }
  }

  async function updateAnnouncement() {
    await handleAction('set_announcement', 'system', 'announcement', { content: announcement.content });
  }

  async function saveNodePassword() {
    if (!nodePassword.trim()) {
      statusTone = 'error';
      statusMessage = '先输入新的节点访问密码。';
      return;
    }

    const ok = await handleAction(
      'set_nodes_password',
      'system',
      'nodes',
      { new_password: nodePassword.trim() },
      true
    );

    if (!ok) return;

    nodesPasswordConfigured = true;
    nodePassword = '';
    statusTone = 'success';
    statusMessage = '节点访问密码已更新。';
  }

  async function createNodeSource() {
    if (!nodeSourceForm.source_label.trim()) {
      statusTone = 'error';
      statusMessage = '先填来源名称。';
      return;
    }

    if (nodeSourceForm.source_type === 'manual' && !nodeSourceForm.source_content.trim()) {
      statusTone = 'error';
      statusMessage = '手工来源需要节点内容。';
      return;
    }

    if (
      nodeSourceForm.source_type !== 'manual' &&
      !nodeSourceForm.source_url.trim() &&
      !nodeSourceForm.source_content.trim()
    ) {
      statusTone = 'error';
      statusMessage = '至少给一个订阅链接或原始内容。';
      return;
    }

    const ok = await handleAction(
      'create_node_source',
      'node_source',
      nodeSourceForm.source_label.trim(),
      {
        source_label: nodeSourceForm.source_label.trim(),
        source_type: nodeSourceForm.source_type,
        source_url: nodeSourceForm.source_url.trim(),
        source_content: nodeSourceForm.source_content
      },
      true
    );

    if (!ok) return;

    nodeSourceForm = {
      source_label: '',
      source_type: 'manual',
      source_url: '',
      source_content: ''
    };
    statusTone = 'success';
    statusMessage = '节点来源已保存。';
  }

  function formatSize(bytes: number) {
    if (!bytes) return '0 GB';
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  }

  function statusClass(tone: 'success' | 'error' | 'info') {
    if (tone === 'success') return 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100';
    if (tone === 'error') return 'border-red-400/20 bg-red-500/10 text-red-100';
    return 'border-white/10 bg-white/5 text-[var(--color-text,#fff4ed)]';
  }
</script>

{#if !session}
  <section aria-labelledby="admin-login-title" class="route-shell space-y-4">
    <p class="route-kicker">control room</p>
    <h1 id="admin-login-title">管理后台</h1>
    <p>请先登录社区账号，再进入 /admin。顶部导航会继续按当前登录状态决定是否展示管理入口。</p>
  </section>
{:else if !canAccessAdmin}
  <section aria-labelledby="admin-forbidden-title" class="route-shell space-y-4">
    <p class="route-kicker">control room</p>
    <h1 id="admin-forbidden-title">管理后台</h1>
    <p>当前账号没有管理权限。只有 admin 或 owner 可以进入这个页面，导航里的管理入口也会保持隐藏。</p>
  </section>
{:else}
  <div class="admin-view pb-40">
    <div class="mb-12 flex flex-wrap items-end justify-between gap-6">
      <div>
        <p class="route-kicker">control room</p>
        <h1 class="mt-3 text-[clamp(2.5rem,12vw,7rem)] font-black tracking-[-0.08em]">管理后台</h1>
        <p class="mt-4 max-w-3xl text-sm font-medium leading-7 opacity-70">
          把举报处理、用户处置、站内公告和节点运营都收在同一处，方便管理员快速巡检并留下明确反馈。
        </p>
      </div>
      <div class="mb-2 flex flex-wrap gap-2">
        <button on:click={() => (activeTab = 'reports')} class:tab-active={activeTab === 'reports'} class="admin-tab">举报</button>
        <button on:click={() => (activeTab = 'users')} class:tab-active={activeTab === 'users'} class="admin-tab">用户</button>
        <button on:click={() => (activeTab = 'announcement')} class:tab-active={activeTab === 'announcement'} class="admin-tab">公告</button>
        <button on:click={() => (activeTab = 'nodes')} class:tab-active={activeTab === 'nodes'} class="admin-tab">节点</button>
      </div>
    </div>

    {#if loading}
      <div class="py-20 text-center text-4xl font-black uppercase italic tracking-tighter opacity-20">正在加载…</div>
    {:else}
      <div class="space-y-6">
        <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="管理后台概览统计">
          <article class="admin-card p-6">
            <p class="admin-metric-label">待处理举报</p>
            <p class="mt-3 text-3xl font-black tracking-tight">{reports.length}</p>
            <p class="mt-2 text-sm font-medium opacity-55">当前仍需人工确认的举报项目。</p>
          </article>
          <article class="admin-card p-6">
            <p class="admin-metric-label">用户数量</p>
            <p class="mt-3 text-3xl font-black tracking-tight">{users.length}</p>
            <p class="mt-2 text-sm font-medium opacity-55">已同步到管理视图的账号总数。</p>
          </article>
          <article class="admin-card p-6">
            <p class="admin-metric-label">节点来源</p>
            <p class="mt-3 text-3xl font-black tracking-tight">{nodeSources.length}</p>
            <p class="mt-2 text-sm font-medium opacity-55">正在维护的来源记录数量。</p>
          </article>
          <article class="admin-card p-6">
            <p class="admin-metric-label">节点密码</p>
            <p class="mt-3 text-3xl font-black tracking-tight">{nodesPasswordConfigured ? '已配置' : '未配置'}</p>
            <p class="mt-2 text-sm font-medium opacity-55">前台节点页是否具备统一访问密码。</p>
          </article>
        </section>

        {#if statusMessage}
          <div class={`rounded-[28px] border px-5 py-4 text-sm font-bold ${statusClass(statusTone)}`} role="status" aria-live="polite">
            {statusMessage}
          </div>
        {/if}

        {#if activeTab === 'reports'}
          <div class="grid grid-cols-1 gap-4">
            {#each reports as report}
              <div class="admin-card flex items-center justify-between p-8 max-md:flex-col max-md:items-start max-md:gap-4">
                <div>
                  <p class="mb-1 text-[10px] font-black uppercase tracking-widest opacity-30">{report.target_type} · {report.target_id}</p>
                  <p class="mb-2 text-xl font-bold tracking-tight">举报原因：{report.reason}</p>
                  <p class="text-xs font-medium opacity-40">提交人：{report.user_id}</p>
                </div>
                <div class="flex gap-2 max-sm:w-full max-sm:flex-col">
                  <button
                    on:click={() => handleAction('delete_item', report.target_type, report.target_id, { report_id: report.id })}
                    class="rounded-xl bg-red-500 px-6 py-3 text-[10px] font-black uppercase tracking-widest text-white transition-transform hover:scale-105"
                  >
                    删除内容
                  </button>
                  <button
                    on:click={() => handleAction('resolve_report', 'report', report.id)}
                    class="rounded-xl bg-neutral-100 px-6 py-3 text-[10px] font-black uppercase tracking-widest transition-transform hover:scale-105 dark:bg-neutral-800"
                  >
                    处理完成
                  </button>
                </div>
              </div>
            {:else}
              <div class="py-20 text-center text-sm font-black uppercase tracking-widest opacity-20">现在没有待处理举报。</div>
            {/each}
          </div>
        {:else if activeTab === 'users'}
          <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {#each users as user}
              <div class="admin-card p-8">
                <div class="mb-6 flex items-center gap-4">
                  <div class="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-neutral-100 text-xl font-black dark:bg-neutral-800">
                    {#if user.avatar_url}
                      <img src={user.avatar_url} alt="" class="h-full w-full object-cover" />
                    {:else}
                      {user.username.slice(0, 1)}
                    {/if}
                  </div>
                  <div class="flex-1">
                    <h2 class="text-lg font-black">
                      {user.username}
                      <span class="ml-2 text-[10px] font-mono uppercase tracking-widest opacity-30">{user.role}</span>
                    </h2>
                    <p class="text-[10px] font-bold uppercase tracking-widest opacity-30">网盘：{formatSize(user.drive_used)} / {formatSize(user.drive_quota)}</p>
                  </div>
                  <div class="flex items-center gap-2">
                    {#if user.is_banned}
                      <button on:click={() => handleAction('unban_user', 'user', user.id)} class="text-[10px] font-black uppercase tracking-widest text-green-500">解除封禁</button>
                    {:else}
                      <button on:click={() => handleAction('ban_user', 'user', user.id)} class="text-[10px] font-black uppercase tracking-widest text-red-500">封禁</button>
                    {/if}
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <button
                    on:click={() => {
                      const password = window.prompt('输入新密码');
                      if (password) handleAction('reset_password', 'user', user.id, { new_password: password });
                    }}
                    class="rounded-xl bg-neutral-100 py-3 text-[9px] font-black uppercase tracking-widest dark:bg-neutral-900"
                  >
                    重置密码
                  </button>
                  <button
                    on:click={() => {
                      const quota = window.prompt('输入新的网盘配额，单位 GB');
                      if (quota) handleAction('set_drive_quota', 'user', user.id, { quota_gb: quota });
                    }}
                    class="rounded-xl bg-neutral-100 py-3 text-[9px] font-black uppercase tracking-widest dark:bg-neutral-900"
                  >
                    修改配额
                  </button>
                  {#if user.role === 'user'}
                    <button on:click={() => handleAction('grant_admin', 'user', user.id)} class="col-span-2 rounded-xl bg-[var(--color-primary)] py-3 text-[9px] font-black uppercase tracking-widest text-white">
                      设为管理员
                    </button>
                  {:else if user.role === 'admin'}
                    <button on:click={() => handleAction('revoke_admin', 'user', user.id)} class="col-span-2 rounded-xl bg-neutral-200 py-3 text-[9px] font-black uppercase tracking-widest dark:bg-neutral-800">
                      撤掉管理员
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {:else if activeTab === 'announcement'}
          <div class="admin-card mx-auto max-w-2xl p-10">
            <h2 class="mb-8 text-2xl font-black uppercase tracking-tighter">站内公告</h2>
            <textarea
              bind:value={announcement.content}
              placeholder="想告诉全站什么，就写在这里。"
              class="mb-6 h-48 w-full resize-none rounded-3xl border border-white/30 bg-white/15 p-6 font-bold text-[var(--color-text,#fff4ed)] outline-none transition-all placeholder:text-[var(--color-text,#fff4ed)]/40 focus:ring-2 focus:ring-[var(--color-primary,#fac7b7)]"
              style="background-color: rgba(255, 255, 255, 0.18);"
            ></textarea>
            <button
              on:click={updateAnnouncement}
              class="w-full rounded-2xl bg-[var(--color-primary)] py-5 text-lg font-black text-white shadow-lg transition-all hover:scale-[1.02] active:scale-95"
            >
              更新公告
            </button>
            <p class="mt-6 text-center text-[10px] font-bold uppercase tracking-widest opacity-20">上次更新：{announcement.updatedAt || '还没有更新过'}</p>
          </div>
        {:else if activeTab === 'nodes'}
          <div class="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <section class="admin-card space-y-5 p-8">
              <div>
                <p class="admin-metric-label">访问控制</p>
                <h2 class="mt-2 text-2xl font-black tracking-tight">统一访问密码</h2>
              </div>
              <div class="rounded-[28px] border border-black/5 bg-neutral-50 px-5 py-4 dark:border-white/5 dark:bg-neutral-900">
                <p class="admin-metric-label">当前状态</p>
                <p class="mt-2 text-sm font-medium opacity-65">{nodesPasswordConfigured ? '已存在统一访问密码，更新后前台将使用新密码。' : '当前还没有统一访问密码，前台节点页将无法解锁。'}</p>
              </div>
              <input bind:value={nodePassword} type="text" placeholder="输入新的访问密码" class="w-full rounded-2xl border border-white/30 bg-white/15 px-5 py-4 font-medium outline-none focus:ring-2 focus:ring-[var(--color-primary)]" style="background-color: rgba(255, 255, 255, 0.18);" />
              <button on:click={saveNodePassword} class="w-full rounded-2xl bg-[var(--color-primary)] py-4 font-black uppercase tracking-widest text-white shadow-lg transition-transform hover:scale-[1.01]">更新密码</button>

              <div class="border-t border-black/5 pt-4 dark:border-white/5">
                <p class="admin-metric-label">新增来源</p>
                <div class="mt-4 space-y-3">
                  <input bind:value={nodeSourceForm.source_label} type="text" placeholder="来源名称" class="w-full rounded-2xl border border-white/30 bg-white/15 px-5 py-4 font-medium outline-none focus:ring-2 focus:ring-[var(--color-primary)]" style="background-color: rgba(255, 255, 255, 0.18);" />
                  <select bind:value={nodeSourceForm.source_type} class="w-full rounded-2xl border border-white/30 bg-white/15 px-5 py-4 font-medium outline-none focus:ring-2 focus:ring-[var(--color-primary)]" style="background-color: rgba(255, 255, 255, 0.18);">
                    <option value="manual">手工粘贴</option>
                    <option value="community">社区来源</option>
                    <option value="subscription">订阅链接</option>
                  </select>
                  {#if nodeSourceForm.source_type !== 'manual'}
                    <input bind:value={nodeSourceForm.source_url} type="text" placeholder="订阅链接（可选，支持远程抓取）" class="w-full rounded-2xl border border-white/30 bg-white/15 px-5 py-4 font-medium outline-none focus:ring-2 focus:ring-[var(--color-primary)]" style="background-color: rgba(255, 255, 255, 0.18);" />
                  {/if}
                  <textarea bind:value={nodeSourceForm.source_content} placeholder="把 ss/vmess/trojan/vless/ssr 节点内容粘到这里；订阅型来源也可直接先贴内容" class="h-48 w-full rounded-3xl border border-white/30 bg-white/15 px-5 py-4 font-medium outline-none focus:ring-2 focus:ring-[var(--color-primary)]" style="background-color: rgba(255, 255, 255, 0.18);"></textarea>
                  <button on:click={createNodeSource} class="w-full rounded-2xl bg-neutral-950 py-4 font-black uppercase tracking-widest text-white shadow-lg transition-transform hover:scale-[1.01] dark:bg-white dark:text-black">保存来源并解析</button>
                </div>
              </div>
            </section>

            <section class="space-y-4">
              <div class="admin-card p-8">
                <div class="flex items-center justify-between gap-4">
                  <div>
                    <p class="admin-metric-label">来源列表</p>
                    <h2 class="mt-2 text-2xl font-black tracking-tight">已配置来源</h2>
                  </div>
                  <p class="admin-metric-label">{nodeSources.length} 个</p>
                </div>
                <div class="mt-6 space-y-3">
                  {#each nodeSources as source}
                    <article class="rounded-[28px] border border-neutral-100 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900">
                      <div class="flex items-start justify-between gap-4">
                        <div>
                          <h3 class="text-lg font-black tracking-tight">{source.label}</h3>
                          <p class="mt-2 text-[10px] font-black uppercase tracking-widest opacity-40">{source.source_type} · {source.node_count || 0} 条</p>
                          <p class="mt-2 text-sm font-medium opacity-60">{source.updated_at || '未记录更新时间'}</p>
                          {#if source.last_error}
                            <p class="mt-2 text-sm font-medium text-red-500">{source.last_error}</p>
                          {/if}
                        </div>
                        <div class="flex gap-2">
                          <button on:click={() => handleAction('delete_node_source', 'node_source', source.id, { source_id: source.id })} class="rounded-xl bg-red-500 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white">删除</button>
                        </div>
                      </div>
                    </article>
                  {:else}
                    <div class="py-12 text-center text-sm font-bold uppercase tracking-widest opacity-35">还没有节点来源。</div>
                  {/each}
                </div>
              </div>

              <div class="admin-card p-8">
                <div class="flex items-center justify-between gap-4">
                  <div>
                    <p class="admin-metric-label">节点池</p>
                    <h2 class="mt-2 text-2xl font-black tracking-tight">当前可分发节点</h2>
                  </div>
                  <p class="admin-metric-label">{proxyNodes.length} 条</p>
                </div>
                <div class="mt-6 max-h-[32rem] space-y-3 overflow-auto pr-2">
                  {#each proxyNodes as node}
                    <article class="rounded-[28px] border border-neutral-100 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900">
                      <div class="flex items-start justify-between gap-4">
                        <div class="min-w-0">
                          <h3 class="truncate text-lg font-black tracking-tight">{node.name}</h3>
                          <p class="mt-2 text-[10px] font-black uppercase tracking-widest opacity-40">{node.protocol} · {node.source_label || '未标记来源'}</p>
                          <p class="mt-2 break-all text-sm font-medium opacity-60">{node.raw}</p>
                        </div>
                      </div>
                    </article>
                  {:else}
                    <div class="py-12 text-center text-sm font-bold uppercase tracking-widest opacity-35">现在还没有节点。</div>
                  {/each}
                </div>
              </div>
            </section>
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .admin-tab {
    border-radius: 1rem;
    padding: 0.75rem 1.5rem;
    font-size: 0.75rem;
    font-weight: 900;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    opacity: 0.5;
    background: rgb(23 23 23 / 0.65);
    transition: transform 0.2s ease, opacity 0.2s ease, background 0.2s ease;
  }

  .admin-tab.tab-active {
    opacity: 1;
    color: white;
    background: var(--color-primary, #f97316);
    box-shadow: 0 1rem 2rem rgb(0 0 0 / 0.2);
  }

  .admin-card {
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 2rem;
    background: rgba(8, 15, 26, 0.56);
    box-shadow: 0 1rem 2rem rgba(0, 0, 0, 0.14);
    backdrop-filter: blur(20px);
  }

  .admin-metric-label {
    font-size: 0.625rem;
    font-weight: 900;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    opacity: 0.38;
  }
</style>
