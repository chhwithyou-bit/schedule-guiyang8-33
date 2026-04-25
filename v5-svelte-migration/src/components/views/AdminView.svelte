<script lang="ts">
  import { onMount } from 'svelte';
  import AnimatedHeading from '../ui/AnimatedHeading.svelte';
  import { communityFetch } from '../../lib/communityApi';

  type AdminTab = 'reports' | 'users' | 'announcement' | 'media';

  let activeTab: AdminTab = 'reports';
  let loading = true;
  let reports: any[] = [];
  let users: any[] = [];
  let announcement = { content: '', updatedAt: '' };
  let mediaStorage: {
    mode?: string;
    drive_folder_id?: string;
    drive_folder_configured?: boolean;
    r2_configured?: boolean;
    r2_error?: string;
    r2_sample_count?: number;
    r2_sample_keys?: string[];
  } = {};
  let statusMessage = '';
  let statusTone: 'success' | 'error' | 'info' = 'info';

  async function fetchAdminData() {
    loading = true;

    try {
      const res = await communityFetch('/api/community/admin/data');
      const data = await res.json();
      if (!data.ok) {
        statusTone = 'error';
        statusMessage = data.msg || '管理数据没有成功返回。';
        return;
      }

      reports = Array.isArray(data.reports) ? data.reports : [];
      users = Array.isArray(data.users) ? data.users : [];
      announcement = data.announcement || { content: '', updatedAt: '' };
      mediaStorage = data.media_storage || {};
      statusMessage = '';
    } catch (error) {
      console.error('Failed to fetch admin data', error);
      statusTone = 'error';
      statusMessage = '管理数据加载失败，请稍后再试。';
    } finally {
      loading = false;
    }
  }

  async function handleAction(action: string, target_type: string, target_id: string, extra: any = {}, skipConfirm = false) {
    if (!skipConfirm && !confirm(`确认执行这项管理操作吗？\n${action}`)) {
      return false;
    }

    try {
      statusTone = 'info';
      statusMessage = '';

      const res = await communityFetch('/api/community/admin/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, target_type, target_id, ...extra })
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        statusTone = 'error';
        statusMessage = `操作没有成功：${data.msg || '请稍后再试'}`;
        return false;
      }

      statusTone = 'success';
      statusMessage = `操作已完成：${action}`;
      await fetchAdminData();
      return true;
    } catch (error: any) {
      statusTone = 'error';
      statusMessage = `发生错误：${error.message || error}`;
      return false;
    }
  }

  async function updateAnnouncement() {
    const ok = await handleAction('set_announcement', 'system', 'announcement', {
      content: announcement.content
    });
    if (ok && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('community-announcement-updated'));
    }
  }

  function formatSize(bytes: number) {
    if (!bytes) return '0 GB';
    return `${(bytes / (1024 ** 3)).toFixed(1)} GB`;
  }

  function statusClass(tone: 'success' | 'error' | 'info') {
    if (tone === 'success') return 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100';
    if (tone === 'error') return 'border-red-400/20 bg-red-500/10 text-red-100';
    return 'border-white/10 bg-white/5 text-[var(--color-text,#fff4ed)]';
  }

  function promptPasswordReset(account: any) {
    const nextPassword = prompt('输入新密码');
    if (!nextPassword) return;
    void handleAction('reset_password', 'user', account.id, { new_password: nextPassword });
  }

  function promptDriveQuota(account: any) {
    const rawQuota = prompt('输入新的媒体配额（GB）');
    if (rawQuota === null) return;

    const quotaGb = Number.parseFloat(rawQuota);
    if (!Number.isFinite(quotaGb) || quotaGb < 0) {
      statusTone = 'error';
      statusMessage = '请输入有效的媒体配额数字。';
      return;
    }

    void handleAction('set_drive_quota', 'user', account.id, { quota_gb: quotaGb });
  }

  onMount(() => {
    void fetchAdminData();
  });
</script>

<section class="admin-view pb-40">
  <div class="mb-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
    <div>
      <AnimatedHeading text="管理后台" className="text-5xl sm:text-7xl lg:text-8xl" />
      <p class="mt-4 max-w-3xl text-sm font-medium leading-7 opacity-70">
        后台现在只保留审核、公告和媒体运维，不再暴露旧节点模块。用户治理、举报处理和图片存储链路都从这里统一处理。
      </p>
    </div>

    <div class="admin-tabs mb-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:justify-end">
      <button on:click={() => activeTab = 'reports'} class="admin-tab {activeTab === 'reports' ? 'is-active' : ''}">举报</button>
      <button on:click={() => activeTab = 'users'} class="admin-tab {activeTab === 'users' ? 'is-active' : ''}">用户</button>
      <button on:click={() => activeTab = 'announcement'} class="admin-tab {activeTab === 'announcement' ? 'is-active' : ''}">公告</button>
      <button on:click={() => activeTab = 'media'} class="admin-tab {activeTab === 'media' ? 'is-active' : ''}">媒体</button>
    </div>
  </div>

  {#if loading}
    <div class="py-20 text-center text-4xl font-black uppercase tracking-tighter opacity-20 italic">正在加载...</div>
  {:else}
    <div class="space-y-6">
      <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="管理后台概览统计">
        <article class="admin-card p-6">
          <p class="text-[10px] font-black uppercase tracking-widest opacity-30">待处理举报</p>
          <p class="mt-3 text-3xl font-black tracking-tight">{reports.length}</p>
          <p class="mt-2 text-sm font-medium opacity-55">当前仍需人工确认的举报项目。</p>
        </article>
        <article class="admin-card p-6">
          <p class="text-[10px] font-black uppercase tracking-widest opacity-30">用户数量</p>
          <p class="mt-3 text-3xl font-black tracking-tight">{users.length}</p>
          <p class="mt-2 text-sm font-medium opacity-55">已经同步到管理视图的账号总数。</p>
        </article>
        <article class="admin-card p-6">
          <p class="text-[10px] font-black uppercase tracking-widest opacity-30">Drive 原始存储</p>
          <p class="mt-3 text-3xl font-black tracking-tight">{mediaStorage.drive_folder_configured ? '已配置' : '未配置'}</p>
          <p class="mt-2 text-sm font-medium opacity-55">帖子图片的原始文件存储位置。</p>
        </article>
        <article class="admin-card p-6">
          <p class="text-[10px] font-black uppercase tracking-widest opacity-30">R2 缓存样本</p>
          <p class="mt-3 text-3xl font-black tracking-tight">{mediaStorage.r2_sample_count || 0}</p>
          <p class="mt-2 text-sm font-medium opacity-55">当前抓到的缓存对象样本数。</p>
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
            <div class="admin-card flex flex-col gap-5 p-6 sm:p-7 lg:flex-row lg:items-center lg:justify-between">
              <div class="min-w-0">
                <p class="mb-1 text-[10px] font-black uppercase tracking-widest opacity-30">{report.target_type} / {report.target_id}</p>
                <p class="mb-2 break-words text-xl font-bold tracking-tight">举报原因：{report.reason}</p>
                <p class="text-xs font-medium opacity-40">提交人：{report.user_id}</p>
              </div>
              <div class="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
                <button on:click={() => handleAction('delete_item', report.target_type, report.target_id, { report_id: report.id })} class="admin-danger min-h-12 px-4 py-3 sm:px-6">删除内容</button>
                <button on:click={() => handleAction('resolve_report', 'report', report.id)} class="admin-ghost min-h-12 px-4 py-3 sm:px-6">处理完成</button>
              </div>
            </div>
          {:else}
            <div class="py-20 text-center text-sm font-black uppercase tracking-widest opacity-20">现在没有待处理举报。</div>
          {/each}
        </div>
      {/if}

      {#if activeTab === 'users'}
        <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {#each users as account}
            <div class="admin-card p-8">
              <div class="mb-6 flex items-center gap-4">
                <div class="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-neutral-100 text-xl font-black dark:bg-neutral-800">
                  {#if account.avatar_url}
                    <img src={account.avatar_url} alt="" class="h-full w-full object-cover" />
                  {:else}
                    {account.username.slice(0, 1)}
                  {/if}
                </div>
                <div class="flex-1">
                  <h4 class="text-lg font-black">{account.username} <span class="ml-2 font-mono text-[10px] uppercase tracking-widest opacity-30">{account.role}</span></h4>
                  <p class="text-[10px] font-bold uppercase tracking-widest opacity-30">媒体配额：{formatSize(account.drive_used)} / {formatSize(account.drive_quota)}</p>
                </div>
                <div class="flex items-center gap-2">
                  {#if account.is_banned}
                    <button on:click={() => handleAction('unban_user', 'user', account.id)} class="text-[10px] font-black uppercase tracking-widest text-green-500">解除封禁</button>
                  {:else}
                    <button on:click={() => handleAction('ban_user', 'user', account.id)} class="text-[10px] font-black uppercase tracking-widest text-red-500">封禁</button>
                  {/if}
                </div>
              </div>

              <div class="grid grid-cols-2 gap-2">
                <button on:click={() => promptPasswordReset(account)} class="admin-ghost py-3">重置密码</button>
                <button on:click={() => promptDriveQuota(account)} class="admin-ghost py-3">修改配额</button>
                {#if account.role === 'user'}
                  <button on:click={() => handleAction('grant_admin', 'user', account.id)} class="admin-primary col-span-2 py-3">设为管理员</button>
                {:else if account.role === 'admin'}
                  <button on:click={() => handleAction('revoke_admin', 'user', account.id)} class="admin-ghost col-span-2 py-3">撤掉管理员</button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}

      {#if activeTab === 'announcement'}
        <div class="admin-card mx-auto max-w-2xl p-10">
          <h3 class="mb-8 text-2xl font-black uppercase tracking-tighter">站内公告</h3>
          <textarea
            bind:value={announcement.content}
            placeholder="想告诉全站什么，就写在这里。"
            class="mb-6 h-48 w-full resize-none rounded-3xl border border-white/30 bg-white/15 p-6 font-bold text-[var(--color-text,#fff4ed)] outline-none transition-all placeholder:text-[var(--color-text,#fff4ed)]/40 focus:ring-2 focus:ring-[var(--color-primary,#fac7b7)]"
            style="background-color: rgba(255, 255, 255, 0.18);"
          ></textarea>
          <button on:click={updateAnnouncement} class="admin-primary w-full py-5 text-lg">更新公告</button>
          <p class="mt-6 text-center text-[10px] font-bold uppercase tracking-widest opacity-20">上次更新：{announcement.updatedAt || '还没有更新过'}</p>
        </div>
      {/if}

      {#if activeTab === 'media'}
        <div class="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section class="admin-card p-8">
            <p class="text-[10px] font-black uppercase tracking-widest opacity-30">媒体链路</p>
            <h3 class="mt-2 text-2xl font-black tracking-tight">Google Drive 原始存储 + R2 缓存</h3>
            <div class="mt-6 grid gap-4 sm:grid-cols-2">
              <article class="rounded-[28px] border border-white/10 bg-white/5 p-5">
                <p class="text-[10px] font-black uppercase tracking-widest opacity-30">原始存储</p>
                <p class="mt-2 text-xl font-black tracking-tight">{mediaStorage.drive_folder_configured ? 'Google Drive 已接通' : 'Google Drive 未接通'}</p>
                <p class="mt-2 text-sm font-medium opacity-65 break-all">{mediaStorage.drive_folder_id || '当前没有读取到文件夹 ID。'}</p>
              </article>
              <article class="rounded-[28px] border border-white/10 bg-white/5 p-5">
                <p class="text-[10px] font-black uppercase tracking-widest opacity-30">缓存分发</p>
                <p class="mt-2 text-xl font-black tracking-tight">{mediaStorage.r2_configured === false ? 'R2 未接通' : `R2 样本对象 ${mediaStorage.r2_sample_count || 0} 个`}</p>
                <p class="mt-2 text-sm font-medium opacity-65">
                  {mediaStorage.r2_error || '帖子图片会先写入 Drive，再通过 `/api/community/media/:key` 命中 R2/边缘缓存。'}
                </p>
              </article>
            </div>

            <button on:click={fetchAdminData} class="admin-primary mt-6 px-6 py-3">刷新媒体状态</button>
          </section>

          <section class="admin-card p-8">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-[10px] font-black uppercase tracking-widest opacity-30">缓存样本</p>
                <h3 class="mt-2 text-2xl font-black tracking-tight">R2 当前返回的对象键</h3>
              </div>
              <span class="text-[10px] font-black uppercase tracking-widest opacity-30">{mediaStorage.r2_sample_count || 0} 个</span>
            </div>

            {#if mediaStorage.r2_sample_keys?.length}
              <div class="mt-6 space-y-3">
                {#each mediaStorage.r2_sample_keys as cacheKey}
                  <div class="rounded-[24px] border border-white/10 bg-white/5 px-4 py-3 font-mono text-xs opacity-80">
                    {cacheKey}
                  </div>
                {/each}
              </div>
            {:else}
              <div class="mt-6 rounded-[28px] border border-white/10 bg-white/5 px-5 py-8 text-sm font-medium opacity-70">
                这里暂时还没有抓到缓存对象样本。可以先让前台访问一些帖子图片，再回来刷新看看。
              </div>
            {/if}
          </section>
        </div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .admin-card {
    border-radius: 28px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background:
      linear-gradient(145deg, rgba(var(--glow-primary-rgb), 0.12) 0% 42%, rgba(var(--glow-secondary-rgb), 0.08) 42% 100%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(var(--color-bg-rgb), 0.58)),
      rgba(var(--color-bg-rgb), 0.72);
    box-shadow:
      0 20px 48px rgba(var(--shadow-rgb), 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.18),
      inset 0 -1px 0 rgba(0, 0, 0, 0.05);
    backdrop-filter: blur(20px) saturate(1.08);
  }

  .admin-tab,
  .admin-primary,
  .admin-ghost,
  .admin-danger {
    border-radius: 16px;
    font-size: 0.75rem;
    font-weight: 900;
    letter-spacing: 0.16em;
    line-height: 1.2;
    min-width: 0;
    text-transform: uppercase;
    transition: transform 0.2s ease, opacity 0.2s ease, box-shadow 0.2s ease;
    white-space: normal;
  }

  .admin-tab {
    min-height: 2.75rem;
    padding: 0.72rem 1.2rem;
    opacity: 0.45;
    background: rgba(var(--color-bg-rgb), 0.58);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .admin-tab.is-active {
    opacity: 1;
    background: var(--color-primary);
    color: white;
    box-shadow: 0 18px 30px rgba(var(--shadow-rgb), 0.18);
  }

  .admin-primary {
    background: var(--color-primary);
    color: white;
    box-shadow: 0 18px 30px rgba(var(--shadow-rgb), 0.18);
  }

  .admin-ghost {
    background: rgba(255, 255, 255, 0.09);
  }

  .admin-danger {
    background: rgb(239 68 68);
    color: white;
  }

  .admin-tab:hover,
  .admin-primary:hover,
  .admin-ghost:hover,
  .admin-danger:hover {
    transform: translateY(-1px);
  }

  @media (max-width: 640px) {
    .admin-view :global(.animated-heading) {
      line-height: 0.95;
    }

    .admin-card {
      border-radius: 24px;
    }
  }
</style>
