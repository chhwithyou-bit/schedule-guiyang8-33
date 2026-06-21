<script lang="ts">
  import { fade } from 'svelte/transition';
  import { closeModal, openModal } from '../../stores/modalState';
  import { isAdmin, isAuthenticated, selectedProfile, user, selectedPost, unreadNotificationsCount } from '../../stores/appState';
  import {
    COMMUNITY_MEDIA_UPLOAD_ENDPOINT,
    communityFetch
  } from '../../lib/communityApi';
  import { navigateToView } from '../../lib/appRouter';
  import {
    communityConsoleState,
    resetCommunityConsoleState,
    setCommunityConsoleState,
    type CommunityConsoleTab
  } from '../../stores/communityConsoleState';
  import { onMount, tick } from 'svelte';
  import { softReveal } from '../../lib/motion';

  type TabId = CommunityConsoleTab;

  export let embedded = false;
  export let defaultTab: TabId = 'drive';
  export let openAsModal = false;
  export let allowedTabs: TabId[] | null = null;
  export let showDriveTab = false;

  type DriveItem = {
    id: string;
    user_id?: string;
    username?: string;
    name: string;
    size?: number;
    mime_type?: string;
    url?: string;
    parent_id?: string | null;
    is_folder?: number | boolean;
    created_at?: string;
    updated_at?: string;
    preview_status?: 'ready' | 'loading' | 'error';
  };

  type DriveStats = {
    quota_bytes?: number;
    used_bytes?: number;
    available_bytes?: number;
  };

  type DriveFeedbackTone = 'info' | 'success' | 'error';

  type DriveFeedback = {
    tone: DriveFeedbackTone;
    text: string;
  };

  type NotificationItem = {
    id: string;
    type: string;
    target_id?: string | null;
    navigate_id?: string | null;
    created_at?: string;
    username?: string;
    avatar_url?: string;
  };

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'drive', label: '公共广场' },
    { id: 'notifications', label: '提醒' }
  ];

  const tabHero: Record<TabId, { eyebrow: string; title: string }> = {
    drive: { eyebrow: 'square', title: '公共广场' },
    notifications: { eyebrow: 'alerts', title: '提醒' }
  };

  const tabDescriptions: Record<TabId, string> = {
    drive: '文件、图片、视频',
    notifications: '点赞、评论、关注'
  };

  const allowedNotificationTypes = new Set(['like', 'comment', 'reply', 'repost', 'comment_like', 'follow']);

  $: availableTabs = tabs.filter((tab) => allowedTabs ? allowedTabs.includes(tab.id) : (showDriveTab || tab.id !== 'drive'));
  $: shouldRenderModalShell = openAsModal && !embedded;
  $: activeTabMeta = availableTabs.find((tab) => tab.id === activeTab) || availableTabs[0];
  $: shouldShowTabGrid = availableTabs.length > 1;

  let activeTab: TabId = defaultTab;
  let authPrompt = '';

  let driveStats: DriveStats = { quota_bytes: 0, used_bytes: 0, available_bytes: 0 };
  let driveUsagePercent = 0;
  let driveItems: DriveItem[] = [];
  let drivePath: Array<{ id: string | null; name: string }> = [{ id: null, name: '根目录' }];
  let loadingDrive = false;
  let driveError = '';
  let uploadingMedia = false;
  let driveFeedback: DriveFeedback | null = null;
  let newFolderName = '';

  let notifications: NotificationItem[] = [];
  let loadingNotifications = false;
  let notificationError = '';

  let initializedForUserId = '';
  let shellRef: HTMLElement | null = null;
  let closeButtonRef: HTMLButtonElement | null = null;
  let shellFocusPrimed = false;
  let notificationsRefreshInterval: ReturnType<typeof setInterval> | null = null;

  $: if (availableTabs.length > 0 && !availableTabs.some((tab) => tab.id === activeTab)) {
    activeTab = availableTabs[0].id;
  }

  $: if ($communityConsoleState.tab && activeTab !== $communityConsoleState.tab && availableTabs.some((tab) => tab.id === $communityConsoleState.tab)) {
    activeTab = $communityConsoleState.tab;
  }

  $: if ($isAuthenticated && $user?.id && initializedForUserId !== $user.id) {
    initializedForUserId = $user.id;
    void bootstrapConsole();
  }

  $: if (!$isAuthenticated) {
    initializedForUserId = '';
    driveItems = [];
    notifications = [];
    drivePath = [{ id: null, name: '根目录' }];
  }

  $: driveUsagePercent = driveStats.quota_bytes
    ? Math.min(100, Math.round(((driveStats.used_bytes || 0) / driveStats.quota_bytes) * 100))
    : 0;

  function getFocusableShellItems() {
    if (!shellRef) {
      return [];
    }

    return Array.from(
      shellRef.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((element) => element.getAttribute('aria-hidden') !== 'true');
  }

  function handleShellKeydown(event: KeyboardEvent) {
    if (!shouldRenderModalShell) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      handleClose();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const items = getFocusableShellItems();
    if (items.length === 0) {
      event.preventDefault();
      shellRef?.focus();
      return;
    }

    const firstItem = items[0];
    const lastItem = items[items.length - 1];
    const current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (event.shiftKey) {
      if (!current || current === firstItem || !shellRef?.contains(current)) {
        event.preventDefault();
        lastItem.focus();
      }
      return;
    }

    if (!current || current === lastItem || !shellRef?.contains(current)) {
      event.preventDefault();
      firstItem.focus();
    }
  }

  $: if (shouldRenderModalShell && shellRef && !shellFocusPrimed) {
    shellFocusPrimed = true;
    tick().then(() => {
      requestAnimationFrame(() => {
        (closeButtonRef || getFocusableShellItems()[0] || shellRef)?.focus();
      });
    });
  }

  $: if (!shouldRenderModalShell) {
    shellFocusPrimed = false;
  }

  onMount(() => {
    const handleConsoleTabRequest = (event: Event) => {
      const customEvent = event as CustomEvent<{ tab?: TabId }>;
      const nextTab = customEvent.detail?.tab;
      if (nextTab) {
        void switchTab(nextTab);
      }
    };

    const handleDocumentKeydown = (event: KeyboardEvent) => {
      if (!shouldRenderModalShell || !shellRef) {
        return;
      }

      if (!shellRef.contains(document.activeElement) && document.activeElement !== shellRef) {
        return;
      }

      handleShellKeydown(event);
    };

    window.addEventListener('community-console-tab-request', handleConsoleTabRequest as EventListener);
    document.addEventListener('keydown', handleDocumentKeydown);
    notificationsRefreshInterval = setInterval(() => {
      if ($isAuthenticated && activeTab === 'notifications') {
        void loadNotifications(true);
      }
    }, 10000);

    return () => {
      if (notificationsRefreshInterval) clearInterval(notificationsRefreshInterval);
      window.removeEventListener('community-console-tab-request', handleConsoleTabRequest as EventListener);
      document.removeEventListener('keydown', handleDocumentKeydown);
    };
  });

  function requireAuth(message: string) {
    authPrompt = message;
  }

  async function bootstrapConsole() {
    const shouldLoadDriveData = availableTabs.some((tab) => tab.id === 'drive');
    await Promise.allSettled([
      shouldLoadDriveData ? loadDriveInfo() : Promise.resolve(),
      shouldLoadDriveData ? loadDriveList() : Promise.resolve(),
      loadNotifications()
    ]);
  }

  async function switchTab(tab: TabId) {

    if (!availableTabs.some((item) => item.id === tab)) {
      return;
    }

    if (!$isAuthenticated) {
      requireAuth('登录后才能查看这一块。');
      openAuth();
      return;
    }

    activeTab = tab;
    setCommunityConsoleState({ tab });

    if (tab === 'drive' && driveItems.length === 0 && !loadingDrive) {
      await Promise.allSettled([loadDriveInfo(), loadDriveList()]);
    }

    if (tab === 'notifications' && notifications.length === 0 && !loadingNotifications) {
      await loadNotifications();
    }
  }

  function setDriveFeedback(text: string, tone: DriveFeedbackTone = 'info') {
    driveFeedback = text ? { text, tone } : null;
  }

  function clearDriveFeedback() {
    driveFeedback = null;
  }

  function normalizeDriveStats(stats?: DriveStats | null) {
    const quotaBytes = Math.max(0, Number(stats?.quota_bytes || 0));
    const usedBytes = Math.max(0, Number(stats?.used_bytes || 0));
    return {
      quota_bytes: quotaBytes,
      used_bytes: usedBytes,
      available_bytes: Math.max(0, quotaBytes - usedBytes)
    };
  }

  function isImageMimeType(item?: DriveItem | null) {
    return String(item?.mime_type || '').toLowerCase().startsWith('image/');
  }

  function isMediaMimeType(item?: DriveItem | null) {
    const mime = String(item?.mime_type || '').toLowerCase();
    return mime.startsWith('audio/') || mime.startsWith('video/') || isImageMimeType(item);
  }

  function describeDriveItem(item: DriveItem) {
    if (item.is_folder) return '文件夹';
    if (isImageMimeType(item)) return '图片';
    const mime = String(item.mime_type || '').toLowerCase();
    if (mime.startsWith('video/')) return '视频';
    if (mime.startsWith('audio/')) return '音频';
    return item.mime_type || '文件';
  }

  function getDriveItemOpenLabel(item: DriveItem) {
    if (item.is_folder) return '打开';
    if (isImageMimeType(item)) return '查看图片';
    const mime = String(item.mime_type || '').toLowerCase();
    if (mime.startsWith('video/')) return '播放视频';
    if (mime.startsWith('audio/')) return '播放音频';
    return '打开文件';
  }

  function isOwnDriveItem(item: DriveItem) {
    return Boolean($user?.id && item.user_id === $user.id);
  }

  function getDriveOwnerLabel(item: DriveItem) {
    return item.username || (isOwnDriveItem(item) ? '我' : '成员');
  }

  async function loadDriveInfo() {
    if (!$isAuthenticated) return;

    try {
      const res = await communityFetch('/api/community/drive/info');
      const data = await res.json();
      if (data.ok) {
        driveStats = normalizeDriveStats(data.stats);
      } else {
        driveError = data.msg || '网盘信息没加载出来。';
      }
    } catch (error) {
      console.error('Failed to load drive info', error);
      driveError = '网盘信息没加载出来。';
    }
  }

  function mapDriveItems(files: DriveItem[] = []): DriveItem[] {
    return files.map((item) => ({
      ...item,
      preview_status: (item.is_folder || !isMediaMimeType(item) || !isImageMimeType(item) ? 'ready' : 'loading') as DriveItem['preview_status']
    }));
  }

  async function loadDriveList(parentId: string | null = drivePath[drivePath.length - 1]?.id || null) {
    if (!$isAuthenticated) return;
    loadingDrive = true;
    driveError = '';

    try {
      const query = parentId ? `?parent_id=${encodeURIComponent(parentId)}` : '';
      const res = await communityFetch(`/api/community/drive/list${query}`);
      const data = await res.json();
      if (!data.ok) {
        driveError = data.msg || '这个目录没加载出来。';
        return;
      }
      driveItems = mapDriveItems(Array.isArray(data.files) ? data.files : []);
    } catch (error) {
      console.error('Failed to load drive list', error);
      driveError = '这个目录没加载出来。';
    } finally {
      loadingDrive = false;
    }
  }

  async function refreshDriveData() {
    await Promise.allSettled([loadDriveInfo(), loadDriveList()]);
  }

  async function enterFolder(item: DriveItem) {
    drivePath = [...drivePath, { id: item.id, name: item.name }];
    await loadDriveList(item.id);
  }

  async function goToDrivePath(index: number) {
    drivePath = drivePath.slice(0, index + 1);
    await loadDriveList(drivePath[drivePath.length - 1]?.id || null);
  }

  async function createFolder() {
    if (!$isAuthenticated) {
      requireAuth('登录后才能创建文件夹。');
      return;
    }

    const name = newFolderName.trim();
    if (!name) {
      setDriveFeedback('先给文件夹起个名字。', 'error');
      return;
    }

    clearDriveFeedback();

    try {
      const res = await communityFetch('/api/community/drive/mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          parent_id: drivePath[drivePath.length - 1]?.id || null
        })
      });
      const data = await res.json();
      if (!data.ok) {
        driveError = data.msg || '文件夹没建成功。';
        setDriveFeedback(driveError, 'error');
        return;
      }
      newFolderName = '';
      await loadDriveList();
      setDriveFeedback(`已创建「${name}」。`, 'success');
    } catch (error) {
      console.error('Failed to create folder', error);
      driveError = '文件夹没建成功。';
      setDriveFeedback(driveError, 'error');
    }
  }

  async function renameDriveItem(item: DriveItem) {
    const nextName = prompt('改成什么名字？', item.name);
    if (!nextName || !nextName.trim() || nextName.trim() === item.name) return;

    clearDriveFeedback();

    try {
      const res = await communityFetch('/api/community/drive/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, name: nextName.trim() })
      });
      const data = await res.json();
      if (!data.ok) {
        driveError = data.msg || '改名没成功。';
        setDriveFeedback(driveError, 'error');
        return;
      }
      await loadDriveList();
      setDriveFeedback(`已将「${item.name}」改名为「${nextName.trim()}」。`, 'success');
    } catch (error) {
      console.error('Failed to rename drive item', error);
      driveError = '改名没成功。';
      setDriveFeedback(driveError, 'error');
    }
  }

  async function deleteDriveItem(item: DriveItem) {
    if (!confirm(`确定删除「${item.name}」吗？`)) return;

    clearDriveFeedback();

    try {
      const res = await communityFetch('/api/community/drive/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id })
      });
      const data = await res.json();
      if (!data.ok) {
        driveError = data.msg || '删除没成功。';
        setDriveFeedback(driveError, 'error');
        return;
      }
      await refreshDriveData();
      setDriveFeedback(`已删除「${item.name}」。`, 'success');
    } catch (error) {
      console.error('Failed to delete drive item', error);
      driveError = '删除没成功。';
      setDriveFeedback(driveError, 'error');
    }
  }

  async function handleMediaUpload(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files || []);
    if (files.length === 0) return;
    if (!$isAuthenticated) {
      requireAuth('登录后才能上传文件。');
      input.value = '';
      return;
    }

    uploadingMedia = true;
    driveError = '';
    setDriveFeedback(`正在上传 ${files.length} 个文件...`, 'info');

    try {
      let failedCount = 0;
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        const parentId = drivePath[drivePath.length - 1]?.id;
        if (parentId) formData.append('parent_id', parentId);

        const res = await communityFetch(COMMUNITY_MEDIA_UPLOAD_ENDPOINT, {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (!data.ok) {
          failedCount += 1;
        }
      }
      await refreshDriveData();
      if (failedCount > 0) {
        driveError = `${failedCount} 个文件没传上去。`;
        setDriveFeedback(files.length === failedCount ? driveError : `已上传 ${files.length - failedCount} 个，${failedCount} 个失败。`, files.length === failedCount ? 'error' : 'info');
      } else {
        setDriveFeedback(`已上传 ${files.length} 个文件。`, 'success');
      }
    } catch (error) {
      console.error('Failed to upload drive file', error);
      driveError = '文件没传上去。';
      setDriveFeedback(driveError, 'error');
    } finally {
      uploadingMedia = false;
      input.value = '';
    }
  }

  async function loadNotifications(background = false) {
    if (!$isAuthenticated) return;
    if (background && loadingNotifications) return;
    if (!background) {
      loadingNotifications = true;
      notificationError = '';
    }

    try {
      const res = await communityFetch('/api/community/notifications');
      const data = await res.json();
      if (!data.ok) {
        if (!background) notificationError = data.msg || '提醒没加载出来。';
        return;
      }
      notifications = Array.isArray(data.notifications)
        ? data.notifications.filter((item: NotificationItem) => allowedNotificationTypes.has(item.type))
        : [];
      
      // Mark as read
      if ($unreadNotificationsCount > 0) {
        communityFetch('/api/community/notifications/read', { method: 'POST' }).catch(() => {});
        unreadNotificationsCount.set(0);
      }
    } catch (error) {
      console.error('Failed to load notifications', error);
      if (!background) notificationError = '提醒没加载出来。';
    } finally {
      if (!background) loadingNotifications = false;
    }
  }



  function handleNotificationClick(item: NotificationItem) {
    if (!item.navigate_id) return;
    if (item.type === 'follow') {
      selectedProfile.set({ id: item.navigate_id, username: item.username, avatar_url: item.avatar_url });
    } else {
      selectedPost.set({ id: item.navigate_id } as any);
    }
    if (!embedded) {
      handleClose();
    }
  }

  function openAuth() {
    openModal('auth');
  }

  function formatBytes(value = 0) {
    if (!value) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = value;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }

  function formatDate(value?: string) {
    if (!value) return '';
    try {
      return new Date(value).toLocaleString('zh-CN');
    } catch {
      return value;
    }
  }

  function formatNotification(type: string) {
    const map: Record<string, string> = {
      like: '赞了你的帖子',
      comment_like: '赞了你的评论',
      repost: '转发了你的动态',
      comment: '评论了你的帖子',
      reply: '回复了你的评论',
      follow: '关注了你'
    };
    return map[type] || type;
  }

  function formatRoleLabel(role?: string) {
    const map: Record<string, string> = {
      owner: '站长',
      admin: '管理员',
      member: '成员',
      user: '成员'
    };
    return map[String(role || '').toLowerCase()] || role || '成员';
  }

  function openAdminView() {
    if (!$isAdmin) return;
    navigateToView('admin');
    if (!embedded) {
      handleClose();
    }
  }

  function openMyProfile() {
    if (!$user) return;
    navigateToView('profile');
    selectedProfile.set({ ...$user, __openedAt: Date.now() });
    if (!embedded) {
      handleClose();
    }
  }

  function markDrivePreviewReady(itemId: string) {
    driveItems = driveItems.map((item) =>
      item.id === itemId ? { ...item, preview_status: 'ready' } : item
    );
  }

  function markDrivePreviewError(itemId: string) {
    driveItems = driveItems.map((item) =>
      item.id === itemId ? { ...item, preview_status: 'error' } : item
    );
  }

  function restoreLaunchFocus(selector: string) {
    if (typeof document === 'undefined' || !selector) {
      return;
    }

    requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(selector);
      target?.focus();
    });
  }

  function handleClose() {
    if (embedded) {
      return;
    }

    const returnFocusSelector = $communityConsoleState.returnFocusSelector;
    resetCommunityConsoleState();
    closeModal();
    restoreLaunchFocus(returnFocusSelector);
  }
</script>

<div class={embedded ? 'relative z-0' : shouldRenderModalShell ? 'fixed inset-0 z-[11000] overflow-y-auto p-4 md:p-6' : 'fixed inset-0 z-[11000] overflow-y-auto xl:overflow-hidden xl:flex xl:items-center xl:justify-center p-4 md:p-6'} transition:fade={{ duration: 220 }}>
  {#if !embedded}
    <button type="button" class="console-scrim fixed inset-0" on:click={handleClose} aria-label="关闭控制台"></button>
  {/if}

  <section
    bind:this={shellRef}
    data-modal-shell={shouldRenderModalShell ? 'true' : undefined}
    role={shouldRenderModalShell ? 'dialog' : undefined}
    aria-modal={shouldRenderModalShell ? 'true' : undefined}
    aria-labelledby={shouldRenderModalShell ? 'community-console-title' : undefined}
    class="console-shell relative z-10 flex w-full flex-col text-[var(--color-text)] {embedded ? 'is-embedded overflow-visible bg-transparent' : shouldRenderModalShell ? 'mx-auto min-h-[calc(100svh-2rem)] max-w-6xl rounded-[36px] border border-white/12 bg-[rgba(var(--color-bg-rgb),0.84)] shadow-[0_24px_60px_rgba(var(--shadow-rgb),0.16)] backdrop-blur-[20px]' : 'mx-auto xl:overflow-hidden xl:h-[min(90vh,56rem)] max-w-6xl rounded-[36px] border border-white/12 bg-[rgba(var(--color-bg-rgb),0.84)] shadow-[0_24px_60px_rgba(var(--shadow-rgb),0.16)] backdrop-blur-[20px]'}"
    transition:softReveal={{ y: 18, duration: 280, startScale: 0.988, blur: 6 }}
  >
    {#if !embedded}
      <header class="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-white/10 bg-[rgba(var(--color-bg-rgb),0.78)] px-5 py-4 backdrop-blur-[20px] md:px-6">
        <div>
          <p class="text-[10px] font-black uppercase tracking-[0.24em] opacity-35">控制台导航</p>
          <h2 id="community-console-title" class="mt-1 text-2xl font-black tracking-tight">{activeTabMeta?.label || '公共广场'}</h2>
        </div>

        <div class="flex items-center gap-3">
          {#if $isAuthenticated}
            <div class="hidden rounded-full border border-white/10 bg-[rgba(255,255,255,0.08)] px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] opacity-70 md:block">
              {$user?.username || 'member'}
            </div>
          {/if}
          <button bind:this={closeButtonRef} data-modal-initial-focus="true" type="button" class="rounded-full border border-white/10 bg-[rgba(255,255,255,0.08)] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] transition-transform hover:scale-105" on:click={handleClose}>
            关闭
          </button>
        </div>
      </header>
    {/if}

    <div class="{embedded ? 'space-y-5' : 'xl:flex-1 xl:min-h-0 xl:overflow-hidden'}">
      <div class="{embedded ? 'space-y-5' : shouldRenderModalShell ? 'min-h-full space-y-5 pb-5' : 'xl:flex xl:flex-col xl:h-full xl:min-h-0'}">
        <div class="console-hero-panel {embedded ? '' : shouldRenderModalShell ? 'mx-1 mt-4 md:mx-2 md:mt-5' : 'mx-4 mt-4 md:mx-5 md:mt-5'}">
          <div class="console-tab-shell flex flex-col gap-5 xl:flex-row xl:items-stretch xl:justify-between">
            <div class="console-tab-rail xl:max-w-[19rem]">
              <p class="text-[10px] font-black uppercase tracking-[0.24em] opacity-35">{tabHero[activeTabMeta?.id || 'drive'].eyebrow}</p>
              <h3 class="mt-2 text-2xl font-black tracking-tight">{tabHero[activeTabMeta?.id || 'drive'].title}</h3>
              <p class="mt-2 text-sm font-medium leading-7 opacity-65">{tabDescriptions[activeTabMeta?.id || 'drive']}</p>
            </div>

            {#if shouldShowTabGrid}
              <div class="min-w-0 flex-1">
                <div class="console-tab-grid">
                  {#each availableTabs as tab}
                    <button
                      type="button"
                      class="console-tab-card {activeTab === tab.id ? 'is-active' : ''}"
                      on:click={() => switchTab(tab.id)}
                    >
                      <span class="console-tab-card__label">{tab.label}</span>
                      <span class="console-tab-card__hint">{tabDescriptions[tab.id]}</span>
                    </button>
                  {/each}
                </div>
              </div>
            {/if}

            <div class="flex flex-wrap gap-2 lg:justify-end">
              {#if $isAdmin}
                <button type="button" class="console-pill console-pill--ghost px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em]" on:click={openAdminView}>
                  管理后台
                </button>
              {/if}
              {#if $isAuthenticated}
                <button type="button" class="console-pill console-pill--ghost px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em]" on:click={openMyProfile}>
                  我的主页
                </button>
              {/if}
            </div>
          </div>

          {#if !$isAuthenticated && !embedded}
            <p class="mt-3 rounded-[20px] border border-white/10 bg-[rgba(255,255,255,0.06)] px-4 py-3 text-sm font-medium leading-7 opacity-75">
              {authPrompt || '登录后继续。'}
            </p>
          {/if}
        </div>

        <div class="{embedded ? 'space-y-6' : shouldRenderModalShell ? 'space-y-6 px-5 pb-5 pt-1 md:px-6 md:pb-6' : 'px-5 pb-5 pt-1 md:px-6 md:pb-6 xl:flex-1 xl:min-h-0 xl:overflow-y-auto'}">

          {#if activeTab === 'drive'}
            {#if !$isAuthenticated}
              <div class="console-panel auth-required-panel p-5">
                <p class="text-sm font-bold opacity-70">{authPrompt || '登录后浏览和上传共享文件。'}</p>
                <button type="button" class="mt-4 square-button square-button--primary" on:click={openAuth}>
                  先去登录
                </button>
              </div>
            {:else}
              <div class="public-square-space">
                <section class="public-square-toolbar">
                  <div class="public-square-summary">
                    <p class="public-square-kicker">共享文件夹</p>
                    <div class="public-square-meta">
                      <span>{driveItems.length} 项</span>
                      <span>{formatBytes(driveStats.used_bytes || 0)}</span>
                        {#if driveStats.quota_bytes}
                        <span>剩余 {formatBytes(driveStats.available_bytes || 0)}</span>
                        {/if}
                    </div>
                  </div>

                  <div class="public-square-actions">
                    <form class="folder-create" on:submit|preventDefault={createFolder}>
                      <input
                        class="console-field folder-create__input"
                        bind:value={newFolderName}
                        maxlength="48"
                        placeholder="文件夹名字"
                        aria-label="文件夹名字"
                      />
                      <button type="submit" class="square-button square-button--secondary folder-create__button">
                        创建
                      </button>
                    </form>
                    <label class="square-button square-button--primary">
                      {uploadingMedia ? '上传中...' : '上传'}
                      <input type="file" class="hidden" multiple disabled={uploadingMedia} on:change={handleMediaUpload} />
                    </label>
                    <button type="button" class="square-button square-button--secondary" on:click={refreshDriveData}>
                      刷新
                    </button>
                  </div>

                  {#if driveStats.quota_bytes}
                    <div class="drive-meter">
                      <div class="drive-meter__bar" style="width: {driveUsagePercent}%"></div>
                    </div>
                  {/if}
                </section>

                <section class="drive-browser">
                  <div class="drive-breadcrumbs">
                    {#each drivePath as crumb, index}
                      <button type="button" class="drive-crumb" on:click={() => goToDrivePath(index)}>
                        {crumb.name}
                      </button>
                    {/each}
                  </div>

                  {#if driveFeedback}
                    <p class="square-feedback {driveFeedback.tone === 'success' ? 'is-success' : driveFeedback.tone === 'error' ? 'is-error' : ''}">{driveFeedback.text}</p>
                  {/if}

                  {#if driveError}
                    <p class="square-feedback is-error">{driveError}</p>
                  {/if}

                  <div class="drive-grid mt-5">
                    {#if loadingDrive}
                      {#each Array(6) as _}
                        <div class="h-48 animate-pulse rounded-[24px] bg-[rgba(255,255,255,0.08)]"></div>
                      {/each}
                    {:else if driveItems.length > 0}
                      {#each driveItems as item (item.id)}
                        <article class="drive-card console-subpanel">
                          <div class="drive-card__preview">
                            {#if isImageMimeType(item) && item.url}
                              <img
                                src={item.url}
                                alt={item.name}
                                class="h-full w-full object-cover"
                                loading="lazy"
                                on:load={() => markDrivePreviewReady(item.id)}
                                on:error={() => markDrivePreviewError(item.id)}
                              />
                            {:else}
                              <span>{item.is_folder ? 'DIR' : isMediaMimeType(item) ? 'MEDIA' : 'FILE'}</span>
                            {/if}
                          </div>
                          <div class="drive-card__body">
                            <div class="min-w-0">
                              <p class="truncate text-sm font-black">{item.name}</p>
                              <p class="mt-1 text-[10px] font-black uppercase tracking-[0.16em] opacity-40">
                                {describeDriveItem(item)} {#if !item.is_folder}/ {formatBytes(item.size || 0)}{/if}
                              </p>
                              <p class="mt-2 truncate text-xs font-semibold opacity-50">由 {getDriveOwnerLabel(item)} 创建</p>
                            </div>
                            <div class="drive-card__actions">
                              {#if item.is_folder}
                                <button type="button" class="drive-action is-primary" on:click={() => enterFolder(item)}>
                                  {getDriveItemOpenLabel(item)}
                                </button>
                              {:else if item.url}
                                <a href={item.url} target="_blank" rel="noreferrer" class="drive-action is-primary">
                                  {getDriveItemOpenLabel(item)}
                                </a>
                              {/if}
                              {#if isOwnDriveItem(item)}
                                <button type="button" class="drive-action" on:click={() => renameDriveItem(item)}>
                                  改名
                                </button>
                                <button type="button" class="drive-action is-danger" on:click={() => deleteDriveItem(item)}>
                                  删除
                                </button>
                              {/if}
                            </div>
                          </div>
                        </article>
                      {/each}
                    {:else}
                      <div class="console-empty-state drive-empty px-4 py-12 text-center text-sm font-bold opacity-60">
                        这里还没有内容。
                      </div>
                    {/if}
                  </div>
                </section>
              </div>
            {/if}
          {/if}

          {#if activeTab === 'notifications'}
            {#if !$isAuthenticated}
              <div class="console-panel p-6">
                <p class="text-sm font-bold opacity-70">{authPrompt || '登录后才能查看通知。'}</p>
                <button type="button" class="mt-4 console-pill console-pill--primary px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-[var(--color-bg)]" on:click={openAuth}>
                  先去登录
                </button>
              </div>
            {:else}
              <section class="console-panel p-6">
                <div class="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <p class="text-[10px] font-black uppercase tracking-[0.24em] opacity-35">提醒</p>
                    <h3 class="mt-1 text-2xl font-black tracking-tight">{notifications.length} 条更新</h3>
                  </div>
                  <button type="button" class="console-pill console-pill--ghost px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em]" on:click={() => loadNotifications()}>
                    刷新
                  </button>
                </div>

                {#if notificationError}
                  <p class="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-200">{notificationError}</p>
                {/if}

                <div class="space-y-3">
                  {#if loadingNotifications}
                    {#each Array(4) as _}
                      <div class="h-20 animate-pulse rounded-[22px] bg-[rgba(255,255,255,0.08)]"></div>
                    {/each}
                  {:else if notifications.length > 0}
                    {#each notifications as item (item.id)}
                      <button type="button" class="console-subpanel px-4 py-4 w-full text-left transition-transform hover:scale-[1.01] hover:border-white/20" on:click={() => handleNotificationClick(item)}>
                        <div class="flex items-center justify-between gap-4">
                          <p class="text-sm font-black">{item.username || '系统'} {formatNotification(item.type)}</p>
                          <p class="text-[10px] font-black uppercase tracking-[0.18em] opacity-30">{formatDate(item.created_at)}</p>
                        </div>
                      </button>
                    {/each}
                  {:else}
                    <div class="console-empty-state px-4 py-10 text-center text-sm font-bold opacity-50">
                      目前还没有通知。
                    </div>
                  {/if}
                </div>
              </section>
            {/if}
          {/if}
        </div>
      </div>
    </div>
  </section>
</div>

<style>
  .console-hero-panel,
  .console-panel {
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 2rem;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(var(--color-bg-rgb), 0.14)),
      rgba(var(--color-bg-rgb), 0.08);
    box-shadow:
      0 18px 42px rgba(var(--shadow-rgb), 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(18px) saturate(1.05);
  }

  .console-hero-panel {
    padding: 1rem;
    background:
      radial-gradient(circle at top left, rgba(var(--glow-primary-rgb), 0.16), transparent 36%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(var(--color-bg-rgb), 0.14)),
      rgba(var(--color-bg-rgb), 0.08);
  }

  .console-panel {
    transition:
      transform 0.22s ease,
      box-shadow 0.22s ease,
      border-color 0.22s ease;
  }

  .console-panel:hover {
    border-color: rgba(255, 255, 255, 0.14);
    box-shadow:
      0 22px 52px rgba(var(--shadow-rgb), 0.15),
      inset 0 1px 0 rgba(255, 255, 255, 0.14);
  }

  .console-subpanel,
  .console-empty-state,
  .console-field {
    border: 1px solid rgba(255, 255, 255, 0.1);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(var(--color-bg-rgb), 0.08)),
      rgba(var(--color-bg-rgb), 0.05);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(12px);
  }

  .console-subpanel,
  .console-empty-state {
    border-radius: 1.5rem;
  }

  .console-field {
    border-radius: 1.375rem;
    outline: none;
    transition:
      border-color 0.18s ease,
      background 0.18s ease,
      box-shadow 0.18s ease;
  }

  .console-field:focus,
  .console-field:focus-visible {
    border-color: color-mix(in srgb, var(--color-primary) 70%, white 30%);
    box-shadow:
      0 0 0 1px rgba(var(--glow-primary-rgb), 0.18),
      inset 0 1px 0 rgba(255, 255, 255, 0.12);
  }

  .console-pill {
    border-radius: 999px;
    transition:
      transform 0.18s ease,
      box-shadow 0.18s ease,
      border-color 0.18s ease,
      background 0.18s ease;
  }

  .console-pill:hover {
    transform: translateY(-1px);
  }

  .console-pill--primary {
    background: linear-gradient(135deg, rgba(var(--glow-primary-rgb), 0.98), rgba(var(--glow-secondary-rgb), 0.92));
    box-shadow: 0 12px 24px rgba(var(--shadow-rgb), 0.14);
  }

  .console-pill--ghost {
    border: 1px solid rgba(255, 255, 255, 0.1);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(var(--color-bg-rgb), 0.08)),
      rgba(var(--color-bg-rgb), 0.05);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  .console-tab-shell {
    align-items: stretch;
  }

  .console-tab-grid {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(10.5rem, 1fr));
  }

  .console-tab-card {
    display: flex;
    min-height: 6.4rem;
    flex-direction: column;
    justify-content: space-between;
    border-radius: 1.35rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(var(--color-bg-rgb), 0.08)),
      rgba(var(--color-bg-rgb), 0.05);
    padding: 0.95rem;
    text-align: left;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
    transition:
      transform 0.18s ease,
      background 0.18s ease,
      border-color 0.18s ease,
      box-shadow 0.18s ease;
  }

  .console-tab-card:hover {
    transform: translateY(-1px);
    border-color: rgba(255, 255, 255, 0.14);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(var(--color-bg-rgb), 0.09)),
      rgba(var(--color-bg-rgb), 0.06);
  }

  .console-tab-card.is-active {
    border-color: color-mix(in srgb, var(--color-primary) 72%, white 28%);
    background:
      linear-gradient(145deg, rgba(var(--glow-primary-rgb), 0.16), rgba(255, 255, 255, 0.05)),
      rgba(var(--color-bg-rgb), 0.07);
    box-shadow:
      0 12px 22px rgba(var(--shadow-rgb), 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.16);
  }

  .console-tab-card__label {
    font-size: 0.78rem;
    font-weight: 900;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  .console-tab-card__hint {
    margin-top: 0.7rem;
    font-size: 0.8rem;
    font-weight: 600;
    line-height: 1.5;
    opacity: 0.68;
    text-transform: none;
  }

  .public-square-space {
    display: grid;
    gap: 1rem;
  }

  .public-square-toolbar,
  .drive-browser {
    border: 1px solid var(--hairline);
    border-radius: 1.25rem;
    background: var(--surface);
  }

  .public-square-toolbar {
    display: grid;
    gap: 1rem;
    padding: 1rem;
  }

  .public-square-summary {
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .public-square-kicker {
    color: var(--ink);
    font-size: 1rem;
    font-weight: 800;
  }

  .public-square-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    color: var(--ink-soft);
    font-size: 0.78rem;
    font-weight: 700;
  }

  .public-square-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }

  .folder-create {
    display: grid;
    grid-template-columns: minmax(10rem, 1fr) auto;
    gap: 0.5rem;
    width: min(100%, 23rem);
  }

  .folder-create__input {
    min-width: 0;
    min-height: 2.5rem;
    padding: 0 0.8rem;
    font-size: 0.86rem;
    font-weight: 650;
  }

  .square-button,
  .drive-action,
  .drive-crumb {
    display: inline-flex;
    min-height: 2.5rem;
    align-items: center;
    justify-content: center;
    border-radius: 0.75rem;
    font-family: var(--sans);
    font-size: 0.75rem;
    font-weight: 800;
    line-height: 1;
    transition:
      border-color 160ms ease,
      background 160ms ease,
      color 160ms ease,
      transform 160ms ease;
  }

  .square-button {
    cursor: pointer;
    padding: 0 0.95rem;
    white-space: nowrap;
  }

  .square-button--primary {
    border: 1px solid var(--clay);
    background: var(--clay);
    color: var(--paper);
  }

  .square-button--secondary {
    border: 1px solid var(--hairline);
    background: var(--paper);
    color: var(--ink);
  }

  .square-button:hover,
  .drive-action:hover,
  .drive-crumb:hover {
    transform: translateY(-1px);
  }

  .drive-meter {
    height: 0.375rem;
    overflow: hidden;
    border-radius: 999px;
    background: var(--paper);
  }

  .drive-meter__bar {
    height: 100%;
    border-radius: inherit;
    background: var(--clay);
    transition: width 220ms ease;
  }

  .drive-browser {
    padding: 1rem;
  }

  .drive-breadcrumbs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .drive-crumb {
    min-height: 2.15rem;
    border: 1px solid var(--hairline);
    background: var(--paper);
    color: var(--ink-soft);
    padding: 0 0.75rem;
  }

  .square-feedback {
    margin-top: 1rem;
    border: 1px solid var(--hairline);
    border-radius: 1rem;
    background: var(--paper);
    color: var(--ink);
    padding: 0.8rem 0.9rem;
    font-size: 0.86rem;
    font-weight: 750;
  }

  .square-feedback.is-success {
    border-color: rgba(34, 120, 72, 0.22);
    background: rgba(34, 120, 72, 0.07);
    color: #227848;
  }

  .square-feedback.is-error {
    border-color: rgba(139, 46, 36, 0.22);
    background: rgba(139, 46, 36, 0.07);
    color: #8b2e24;
  }

  .drive-grid {
    display: grid;
    gap: 0.85rem;
    grid-template-columns: repeat(auto-fill, minmax(13.5rem, 1fr));
  }

  .drive-card {
    display: flex;
    min-width: 0;
    overflow: hidden;
    flex-direction: column;
    border-radius: 1rem;
  }

  .drive-card__preview {
    display: flex;
    aspect-ratio: 16 / 9;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-bottom: 1px solid var(--hairline);
    background: color-mix(in srgb, var(--paper) 80%, var(--ink) 5%);
    color: var(--ink-soft);
    font-size: 0.68rem;
    font-weight: 900;
    letter-spacing: 0.12em;
  }

  .drive-card__body {
    display: grid;
    gap: 0.8rem;
    padding: 0.9rem;
  }

  .drive-card__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .drive-action {
    min-height: 2.1rem;
    border: 1px solid var(--hairline);
    background: var(--surface);
    color: var(--ink);
    padding: 0 0.7rem;
    text-decoration: none;
  }

  .drive-action.is-primary {
    border-color: var(--clay);
    background: var(--clay);
    color: var(--paper);
  }

  .drive-action.is-danger {
    border-color: rgba(139, 46, 36, 0.2);
    background: rgba(139, 46, 36, 0.06);
    color: #8b2e24;
  }

  .drive-empty {
    grid-column: 1 / -1;
    border-radius: 1rem;
  }

  .console-scrim {
    background: rgba(25, 25, 25, 0.18);
    backdrop-filter: blur(3px);
  }

  .console-shell:not(.is-embedded) {
    border-color: var(--hairline) !important;
    background: var(--surface) !important;
    color: var(--ink);
    box-shadow: 0 24px 70px rgba(var(--shadow-rgb), 0.16) !important;
    backdrop-filter: none !important;
  }

  .console-shell > header {
    border-color: var(--hairline) !important;
    background: var(--surface) !important;
    backdrop-filter: none !important;
  }

  .console-hero-panel,
  .console-panel,
  .console-subpanel,
  .console-empty-state,
  .console-field,
  .console-tab-card {
    border-color: var(--hairline);
    background: var(--surface);
    color: var(--ink);
    box-shadow: 0 10px 24px rgba(var(--shadow-rgb), 0.055);
    backdrop-filter: none;
  }

  .console-hero-panel {
    background: var(--paper);
    border-radius: 2rem;
  }

  .console-panel {
    border-radius: 2rem;
  }

  .console-panel.auth-required-panel {
    max-width: 32rem;
    border-radius: 1.25rem;
  }

  .console-panel:hover,
  .console-tab-card:hover {
    border-color: var(--hairline-strong);
    box-shadow: 0 12px 28px rgba(var(--shadow-rgb), 0.075);
  }

  .console-subpanel,
  .console-empty-state,
  .console-field,
  .console-tab-card {
    background: var(--paper);
    border-radius: 1.5rem;
  }

  .console-tab-card.is-active {
    border-color: var(--clay);
    background: var(--surface);
    box-shadow:
      0 12px 26px rgba(var(--shadow-rgb), 0.1),
      inset 0 -2px 0 var(--clay);
  }

  .console-pill--primary {
    background: var(--clay);
    color: var(--paper) !important;
    box-shadow: none;
  }

  .console-pill--ghost,
  .console-shell :global([class*=bg-\[rgba\(255\,255\,255\,0\.08\)\]]) {
    border-color: var(--hairline) !important;
    background: var(--surface) !important;
    box-shadow: 0 8px 18px rgba(var(--shadow-rgb), 0.06);
  }

  .console-shell :global([class*=border-white]),
  .console-shell :global([class*=border-red]) {
    border-color: var(--hairline) !important;
  }

  .console-shell :global([class*=bg-white]),
  .console-shell :global([class*=bg-\[rgba\(255\,255\,255]) {
    background: var(--paper) !important;
  }

  .console-shell :global([class*=text-red]) {
    color: #8b2e24 !important;
  }

  .console-field:focus,
  .console-field:focus-visible {
    border-color: var(--clay);
    box-shadow: 0 0 0 2px rgba(var(--glow-primary-rgb), 0.12);
  }

  .drive-card.console-subpanel {
    border-radius: 1rem;
    box-shadow: none;
  }

  @media (max-width: 640px) {
    .public-square-actions,
    .square-button {
      width: 100%;
    }

    .folder-create {
      grid-template-columns: 1fr;
    }
  }

</style>
