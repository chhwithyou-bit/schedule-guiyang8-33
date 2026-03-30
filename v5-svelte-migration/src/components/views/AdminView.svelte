<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { isAdmin } from '../../stores/appState';
  import AnimatedHeading from '../ui/AnimatedHeading.svelte';

  let reports: any[] = [];
  let users: any[] = [];
  let announcement = { content: '', updatedAt: '' };
  let loading = true;
  let activeTab = 'reports';

  onMount(async () => {
    await fetchAdminData();
  });

  async function fetchAdminData() {
    loading = true;
    try {
      const res = await fetch('/api/community/admin/data');
      const data = await res.json();
      if (data.ok) {
        reports = data.reports;
        users = data.users;
        announcement = data.announcement;
      }
    } catch (e) {
      console.error('Failed to fetch admin data', e);
    } finally {
      loading = false;
    }
  }

  async function handleAction(action: string, target_type: string, target_id: string, extra: any = {}) {
    if (!confirm(`Confirm admin action: ${action}?`)) return;
    try {
      const res = await fetch('/api/community/admin/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, target_type, target_id, ...extra })
      });
      const data = await res.json();
      if (data.ok) {
        alert('Action successful');
        fetchAdminData();
      } else {
        alert('Action failed: ' + data.msg);
      }
    } catch (e: any) {
      alert('Error: ' + e.message);
    }
  }

  async function updateAnnouncement() {
    await handleAction('set_announcement', 'system', 'announcement', { content: announcement.content });
  }

  function formatSize(bytes: number) {
    if (!bytes) return '0 GB';
    return (bytes / (1024 ** 3)).toFixed(1) + ' GB';
  }
</script>

<div class="admin-view pb-40">
  <div class="flex items-end justify-between mb-12">
    <AnimatedHeading text="Admin Hub" className="text-[12vw]" />
    <div class="flex gap-2 mb-2">
      <button on:click={() => activeTab = 'reports'} class="px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all {activeTab === 'reports' ? 'bg-[var(--color-primary)] text-white shadow-xl' : 'bg-neutral-100 dark:bg-neutral-900 opacity-40'}">Reports</button>
      <button on:click={() => activeTab = 'users'} class="px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all {activeTab === 'users' ? 'bg-[var(--color-primary)] text-white shadow-xl' : 'bg-neutral-100 dark:bg-neutral-900 opacity-40'}">Users</button>
      <button on:click={() => activeTab = 'announcement'} class="px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all {activeTab === 'announcement' ? 'bg-[var(--color-primary)] text-white shadow-xl' : 'bg-neutral-100 dark:bg-neutral-900 opacity-40'}">Notice</button>
    </div>
  </div>

  {#if loading}
    <div class="py-20 text-center opacity-20 font-black text-4xl uppercase tracking-tighter italic">Loading Data...</div>
  {:else}
    <div class="space-y-6">
      {#if activeTab === 'reports'}
        <div class="grid grid-cols-1 gap-4">
          {#each reports as r}
            <div class="p-8 rounded-[40px] bg-white dark:bg-neutral-950 border border-neutral-100 dark:border-neutral-900 shadow-sm flex items-center justify-between">
              <div>
                <p class="text-[10px] font-black uppercase tracking-widest opacity-30 mb-1">{r.target_type} ID: {r.target_id}</p>
                <p class="text-xl font-bold tracking-tight mb-2">Reason: {r.reason}</p>
                <p class="text-xs font-medium opacity-40">Reported by: {r.user_id}</p>
              </div>
              <div class="flex gap-2">
                <button on:click={() => handleAction('delete_item', r.target_type, r.target_id, { report_id: r.id })} class="px-6 py-3 rounded-xl bg-red-500 text-white font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-transform">Delete Item</button>
                <button on:click={() => handleAction('resolve_report', 'report', r.id)} class="px-6 py-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-transform">Dismiss</button>
              </div>
            </div>
          {:else}
            <div class="py-20 text-center opacity-20 font-black text-sm uppercase tracking-widest">No pending reports.</div>
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
                  <p class="text-[10px] font-bold opacity-30 uppercase tracking-widest">Disk: {formatSize(u.drive_used)} / {formatSize(u.drive_quota)}</p>
                </div>
                <div class="flex items-center gap-2">
                  {#if u.is_banned}
                    <button on:click={() => handleAction('unban_user', 'user', u.id)} class="text-[10px] font-black text-green-500 uppercase tracking-widest">Unban</button>
                  {:else}
                    <button on:click={() => handleAction('ban_user', 'user', u.id)} class="text-[10px] font-black text-red-500 uppercase tracking-widest">Ban</button>
                  {/if}
                </div>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <button on:click={() => { const p = prompt('New Password:'); if(p) handleAction('reset_password', 'user', u.id, { new_password: p }) }} class="py-3 rounded-xl bg-neutral-100 dark:bg-neutral-900 text-[9px] font-black uppercase tracking-widest">Reset Pass</button>
                <button on:click={() => { const q = prompt('Quota in GB:'); if(q) handleAction('set_drive_quota', 'user', u.id, { quota_gb: q }) }} class="py-3 rounded-xl bg-neutral-100 dark:bg-neutral-900 text-[9px] font-black uppercase tracking-widest">Set Quota</button>
                {#if u.role === 'user'}
                  <button on:click={() => handleAction('grant_admin', 'user', u.id)} class="py-3 rounded-xl bg-[var(--color-primary)] text-white text-[9px] font-black uppercase tracking-widest col-span-2">Grant Admin</button>
                {:else if u.role === 'admin'}
                  <button on:click={() => handleAction('revoke_admin', 'user', u.id)} class="py-3 rounded-xl bg-neutral-200 dark:bg-neutral-800 text-[9px] font-black uppercase tracking-widest col-span-2">Revoke Admin</button>
                {/if}
              </div>
            </div>
          {/each}
        </div>

      {:else if activeTab === 'announcement'}
        <div class="p-10 rounded-[48px] bg-white dark:bg-neutral-950 border border-neutral-100 dark:border-neutral-900 shadow-sm max-w-2xl mx-auto">
          <h3 class="text-2xl font-black uppercase tracking-tighter mb-8">Broadcast System</h3>
          <textarea 
            bind:value={announcement.content} 
            placeholder="Type global announcement..."
            class="w-full h-48 p-6 rounded-3xl bg-neutral-100 dark:bg-neutral-900 border-none focus:ring-2 focus:ring-[var(--color-primary)] transition-all font-bold resize-none mb-6"
          ></textarea>
          <button 
            on:click={updateAnnouncement}
            class="w-full py-5 bg-[var(--color-primary)] text-white font-black text-lg rounded-2xl shadow-lg hover:scale-[1.02] active:scale-95 transition-all"
          >
            UPDATE BROADCAST
          </button>
          <p class="text-center mt-6 text-[10px] font-bold opacity-20 uppercase tracking-widest">Last updated: {announcement.updatedAt || 'Never'}</p>
        </div>
      {/if}
    </div>
  {/if}
</div>
