<script lang="ts">
  import { onMount } from 'svelte';
  import AnimatedHeading from '../ui/AnimatedHeading.svelte';
  import { communityFetch } from '../../lib/communityApi';

  let reports: any[] = [];
  let users: any[] = [];
  let announcement = { content: '', updatedAt: '' };
  let loading = true;
  let activeTab = 'reports';
  let nodeSources: any[] = [];
  let proxyNodes: any[] = [];
  let nodePassword = '';
  let nodeSourceForm = {
    source_label: '',
    source_type: 'manual',
    source_url: '',
    source_content: ''
  };

  onMount(async () => {
    await fetchAdminData();
  });

  async function fetchAdminData() {
    loading = true;
    try {
      const res = await communityFetch('/api/community/admin/data');
      const data = await res.json();
      if (data.ok) {
        reports = data.reports;
        users = data.users;
        announcement = data.announcement;
        nodeSources = Array.isArray(data.node_sources) ? data.node_sources : [];
        proxyNodes = Array.isArray(data.proxy_nodes) ? data.proxy_nodes : [];
      }
    } catch (e) {
      console.error('Failed to fetch admin data', e);
    } finally {
      loading = false;
    }
  }

  async function handleAction(action: string, target_type: string, target_id: string, extra: any = {}, skipConfirm = false) {
    if (!skipConfirm && !confirm(`确认执行这项管理操作吗？\n${action}`)) return;
    try {
      const res = await communityFetch('/api/community/admin/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, target_type, target_id, ...extra })
      });
      const data = await res.json();
      if (data.ok) {
        if (Array.isArray(data.node_sources)) nodeSources = data.node_sources;
        if (Array.isArray(data.proxy_nodes)) proxyNodes = data.proxy_nodes;
        if (!skipConfirm) alert('操作已完成。');
        fetchAdminData();
      } else {
        alert('操作没成功：' + data.msg);
      }
    } catch (e: any) {
      alert('发生错误：' + e.message);
    }
  }

  async function updateAnnouncement() {
    await handleAction('set_announcement', 'system', 'announcement', { content: announcement.content });
  }

  async function saveNodePassword() {
    if (!nodePassword.trim()) return;
    await handleAction('set_nodes_password', 'system', 'nodes', { new_password: nodePassword.trim() }, true);
    alert('节点访问密码已更新。');
    nodePassword = '';
  }

  async function createNodeSource() {
    if (!nodeSourceForm.source_label.trim()) {
      alert('先填来源名称。');
      return;
    }
    if (nodeSourceForm.source_type === 'manual' && !nodeSourceForm.source_content.trim()) {
      alert('手工来源需要节点内容。');
      return;
    }
    if (nodeSourceForm.source_type !== 'manual' && !nodeSourceForm.source_url.trim() && !nodeSourceForm.source_content.trim()) {
      alert('至少给一个订阅链接或原始内容。');
      return;
    }

    await handleAction('create_node_source', 'node_source', nodeSourceForm.source_label.trim(), {
      source_label: nodeSourceForm.source_label.trim(),
      source_type: nodeSourceForm.source_type,
      source_url: nodeSourceForm.source_url.trim(),
      source_content: nodeSourceForm.source_content
    }, true);

    nodeSourceForm = {
      source_label: '',
      source_type: 'manual',
      source_url: '',
      source_content: ''
    };
    alert('节点来源已保存。');
  }

  function formatSize(bytes: number) {
    if (!bytes) return '0 GB';
    return (bytes / (1024 ** 3)).toFixed(1) + ' GB';
  }
</script>

<div class="admin-view pb-40">
  <div class="flex items-end justify-between mb-12">
    <AnimatedHeading text="管理后台" className="text-[12vw]" />
    <div class="flex gap-2 mb-2">
      <button on:click={() => activeTab = 'reports'} class="px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all {activeTab === 'reports' ? 'bg-[var(--color-primary)] text-white shadow-xl' : 'bg-neutral-100 dark:bg-neutral-900 opacity-40'}">举报</button>
      <button on:click={() => activeTab = 'users'} class="px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all {activeTab === 'users' ? 'bg-[var(--color-primary)] text-white shadow-xl' : 'bg-neutral-100 dark:bg-neutral-900 opacity-40'}">用户</button>
      <button on:click={() => activeTab = 'announcement'} class="px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all {activeTab === 'announcement' ? 'bg-[var(--color-primary)] text-white shadow-xl' : 'bg-neutral-100 dark:bg-neutral-900 opacity-40'}">公告</button>
      <button on:click={() => activeTab = 'nodes'} class="px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all {activeTab === 'nodes' ? 'bg-[var(--color-primary)] text-white shadow-xl' : 'bg-neutral-100 dark:bg-neutral-900 opacity-40'}">节点</button>
    </div>
  </div>

  {#if loading}
    <div class="py-20 text-center opacity-20 font-black text-4xl uppercase tracking-tighter italic">正在加载…</div>
  {:else}
    <div class="space-y-6">
      {#if activeTab === 'reports'}
        <div class="grid grid-cols-1 gap-4">
          {#each reports as r}
            <div class="p-8 rounded-[40px] bg-white dark:bg-neutral-950 border border-neutral-100 dark:border-neutral-900 shadow-sm flex items-center justify-between">
              <div>
                <p class="text-[10px] font-black uppercase tracking-widest opacity-30 mb-1">{r.target_type} · {r.target_id}</p>
                <p class="text-xl font-bold tracking-tight mb-2">举报原因：{r.reason}</p>
                <p class="text-xs font-medium opacity-40">提交人：{r.user_id}</p>
              </div>
              <div class="flex gap-2">
                <button on:click={() => handleAction('delete_item', r.target_type, r.target_id, { report_id: r.id })} class="px-6 py-3 rounded-xl bg-red-500 text-white font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-transform">删除内容</button>
                <button on:click={() => handleAction('resolve_report', 'report', r.id)} class="px-6 py-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-transform">处理完成</button>
              </div>
            </div>
          {:else}
            <div class="py-20 text-center opacity-20 font-black text-sm uppercase tracking-widest">现在没有待处理举报。</div>
          {/each}
        </div>

      {:else if activeTab === 'users'}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {#each users as u}
            <div class="p-8 rounded-[40px] bg-white dark:bg-neutral-950 border border-neutral-100 dark:border-neutral-900 shadow-sm">
              <div class="flex items-center gap-4 mb-6">
                <div class="w-12 h-12 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center font-black text-xl overflow-hidden">
                  {#if u.avatar_url} <img src={u.avatar_url} alt="" class="w-full h-full object-cover" /> {:else} {u.username.slice(0,1)} {/if}
                </div>
                <div class="flex-1">
                  <h4 class="font-black text-lg">{u.username} <span class="text-[10px] opacity-30 ml-2 font-mono uppercase tracking-widest">{u.role}</span></h4>
                  <p class="text-[10px] font-bold opacity-30 uppercase tracking-widest">网盘：{formatSize(u.drive_used)} / {formatSize(u.drive_quota)}</p>
                </div>
                <div class="flex items-center gap-2">
                  {#if u.is_banned}
                    <button on:click={() => handleAction('unban_user', 'user', u.id)} class="text-[10px] font-black text-green-500 uppercase tracking-widest">解除封禁</button>
                  {:else}
                    <button on:click={() => handleAction('ban_user', 'user', u.id)} class="text-[10px] font-black text-red-500 uppercase tracking-widest">封禁</button>
                  {/if}
                </div>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <button on:click={() => { const p = prompt('输入新密码'); if(p) handleAction('reset_password', 'user', u.id, { new_password: p }) }} class="py-3 rounded-xl bg-neutral-100 dark:bg-neutral-900 text-[9px] font-black uppercase tracking-widest">重置密码</button>
                <button on:click={() => { const q = prompt('输入新的网盘配额，单位 GB'); if(q) handleAction('set_drive_quota', 'user', u.id, { quota_gb: q }) }} class="py-3 rounded-xl bg-neutral-100 dark:bg-neutral-900 text-[9px] font-black uppercase tracking-widest">修改配额</button>
                {#if u.role === 'user'}
                  <button on:click={() => handleAction('grant_admin', 'user', u.id)} class="py-3 rounded-xl bg-[var(--color-primary)] text-white text-[9px] font-black uppercase tracking-widest col-span-2">设为管理员</button>
                {:else if u.role === 'admin'}
                  <button on:click={() => handleAction('revoke_admin', 'user', u.id)} class="py-3 rounded-xl bg-neutral-200 dark:bg-neutral-800 text-[9px] font-black uppercase tracking-widest col-span-2">撤掉管理员</button>
                {/if}
              </div>
            </div>
          {/each}
        </div>

      {:else if activeTab === 'announcement'}
        <div class="p-10 rounded-[48px] bg-white dark:bg-neutral-950 border border-neutral-100 dark:border-neutral-900 shadow-sm max-w-2xl mx-auto">
          <h3 class="text-2xl font-black uppercase tracking-tighter mb-8">站内公告</h3>
          <textarea
            bind:value={announcement.content}
            placeholder="想告诉全站什么，就写在这里。"
            class="w-full h-48 p-6 rounded-3xl bg-white/15 border border-white/30 text-[var(--color-text,#fff4ed)] placeholder:text-[var(--color-text,#fff4ed)]/40 focus:ring-2 focus:ring-[var(--color-primary,#fac7b7)] transition-all font-bold resize-none mb-6 outline-none"
            style="background-color: rgba(255, 255, 255, 0.18);"
          ></textarea>
          <button
            on:click={updateAnnouncement}
            class="w-full py-5 bg-[var(--color-primary)] text-white font-black text-lg rounded-2xl shadow-lg hover:scale-[1.02] active:scale-95 transition-all"
          >
            更新公告
          </button>
          <p class="text-center mt-6 text-[10px] font-bold opacity-20 uppercase tracking-widest">上次更新：{announcement.updatedAt || '还没有更新过'}</p>
        </div>

      {:else if activeTab === 'nodes'}
        <div class="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section class="p-8 rounded-[40px] bg-white dark:bg-neutral-950 border border-neutral-100 dark:border-neutral-900 shadow-sm space-y-5">
            <div>
              <p class="text-[10px] font-black uppercase tracking-widest opacity-30">访问控制</p>
              <h3 class="mt-2 text-2xl font-black tracking-tight">统一访问密码</h3>
            </div>
            <input bind:value={nodePassword} type="text" placeholder="输入新的访问密码" class="w-full rounded-2xl bg-white/15 border border-white/30 px-5 py-4 font-medium outline-none focus:ring-2 focus:ring-[var(--color-primary)]" style="background-color: rgba(255, 255, 255, 0.18);" />
            <button on:click={saveNodePassword} class="w-full py-4 rounded-2xl bg-[var(--color-primary)] text-white font-black uppercase tracking-widest shadow-lg transition-transform hover:scale-[1.01]">更新密码</button>

            <div class="pt-4 border-t border-black/5 dark:border-white/5">
              <p class="text-[10px] font-black uppercase tracking-widest opacity-30">新增来源</p>
              <div class="mt-4 space-y-3">
                <input bind:value={nodeSourceForm.source_label} type="text" placeholder="来源名称" class="w-full rounded-2xl bg-white/15 border border-white/30 px-5 py-4 font-medium outline-none focus:ring-2 focus:ring-[var(--color-primary)]" style="background-color: rgba(255, 255, 255, 0.18);" />
                <select bind:value={nodeSourceForm.source_type} class="w-full rounded-2xl bg-white/15 border border-white/30 px-5 py-4 font-medium outline-none focus:ring-2 focus:ring-[var(--color-primary)]" style="background-color: rgba(255, 255, 255, 0.18);">
                  <option value="manual">手工粘贴</option>
                  <option value="community">社区来源</option>
                  <option value="subscription">订阅链接</option>
                </select>
                {#if nodeSourceForm.source_type !== 'manual'}
                  <input bind:value={nodeSourceForm.source_url} type="text" placeholder="订阅链接（可选，支持远程抓取）" class="w-full rounded-2xl bg-white/15 border border-white/30 px-5 py-4 font-medium outline-none focus:ring-2 focus:ring-[var(--color-primary)]" style="background-color: rgba(255, 255, 255, 0.18);" />
                {/if}
                <textarea bind:value={nodeSourceForm.source_content} placeholder="把 ss/vmess/trojan/vless/ssr 节点内容粘到这里；订阅型来源也可直接先贴内容" class="h-48 w-full rounded-3xl bg-white/15 border border-white/30 px-5 py-4 font-medium outline-none focus:ring-2 focus:ring-[var(--color-primary)]" style="background-color: rgba(255, 255, 255, 0.18);"></textarea>
                <button on:click={createNodeSource} class="w-full py-4 rounded-2xl bg-neutral-950 dark:bg-white text-white dark:text-black font-black uppercase tracking-widest shadow-lg transition-transform hover:scale-[1.01]">保存来源并解析</button>
              </div>
            </div>
          </section>

          <section class="space-y-4">
            <div class="p-8 rounded-[40px] bg-white dark:bg-neutral-950 border border-neutral-100 dark:border-neutral-900 shadow-sm">
              <div class="flex items-center justify-between gap-4">
                <div>
                  <p class="text-[10px] font-black uppercase tracking-widest opacity-30">来源列表</p>
                  <h3 class="mt-2 text-2xl font-black tracking-tight">已配置来源</h3>
                </div>
                <p class="text-[10px] font-black uppercase tracking-widest opacity-30">{nodeSources.length} 个</p>
              </div>
              <div class="mt-6 space-y-3">
                {#each nodeSources as source}
                  <article class="p-5 rounded-[28px] bg-neutral-50 dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800">
                    <div class="flex items-start justify-between gap-4">
                      <div>
                        <h4 class="text-lg font-black tracking-tight">{source.label}</h4>
                        <p class="mt-2 text-[10px] font-black uppercase tracking-widest opacity-40">{source.source_type} · {source.node_count || 0} 条</p>
                        <p class="mt-2 text-sm font-medium opacity-60">{source.updated_at || '未记录更新时间'}</p>
                        {#if source.last_error}
                          <p class="mt-2 text-sm font-medium text-red-500">{source.last_error}</p>
                        {/if}
                      </div>
                      <div class="flex gap-2">
                        <button on:click={() => handleAction('delete_node_source', 'node_source', source.id, { source_id: source.id })} class="px-4 py-2 rounded-xl bg-red-500 text-white text-[10px] font-black uppercase tracking-widest">删除</button>
                      </div>
                    </div>
                  </article>
                {:else}
                  <div class="py-12 text-center text-sm font-bold opacity-35 uppercase tracking-widest">还没有节点来源。</div>
                {/each}
              </div>
            </div>

            <div class="p-8 rounded-[40px] bg-white dark:bg-neutral-950 border border-neutral-100 dark:border-neutral-900 shadow-sm">
              <div class="flex items-center justify-between gap-4">
                <div>
                  <p class="text-[10px] font-black uppercase tracking-widest opacity-30">节点池</p>
                  <h3 class="mt-2 text-2xl font-black tracking-tight">当前可分发节点</h3>
                </div>
                <p class="text-[10px] font-black uppercase tracking-widest opacity-30">{proxyNodes.length} 条</p>
              </div>
              <div class="mt-6 space-y-3 max-h-[32rem] overflow-auto pr-2">
                {#each proxyNodes as node}
                  <article class="p-5 rounded-[28px] bg-neutral-50 dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800">
                    <div class="flex items-start justify-between gap-4">
                      <div class="min-w-0">
                        <h4 class="truncate text-lg font-black tracking-tight">{node.name}</h4>
                        <p class="mt-2 text-[10px] font-black uppercase tracking-widest opacity-40">{node.protocol} · {node.source_label || '未标记来源'}</p>
                        <p class="mt-2 break-all text-sm font-medium opacity-60">{node.raw}</p>
                      </div>
                    </div>
                  </article>
                {:else}
                  <div class="py-12 text-center text-sm font-bold opacity-35 uppercase tracking-widest">现在还没有节点。</div>
                {/each}
              </div>
            </div>
          </section>
        </div>
      {/if}
    </div>
  {/if}
</div>
