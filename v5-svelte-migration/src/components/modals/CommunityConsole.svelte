<script lang="ts">
  import { fade } from 'svelte/transition';
  import { closeModal, openModal } from '../../stores/modalState';
  import { currentView, isAdmin, isAuthenticated, selectedProfile, user } from '../../stores/appState';
  import {
    COMMUNITY_MEDIA_UPLOAD_ENDPOINT,
    communityFetch,
    persistCommunitySession
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
  export let accountOnly = false;
  export let defaultTab: TabId = 'account';
  export let openAsModal = false;
  export let allowedTabs: TabId[] | null = null;
  export let showDriveTab = false;

  type DriveItem = {
    id: string;
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
    created_at?: string;
    username?: string;
    avatar_url?: string;
  };

  type ProfileForm = {
    signature: string;
    avatar_url: string;
    background_url: string;
  };

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'account', label: '账号' },
    { id: 'drive', label: '网盘' },
    { id: 'notifications', label: '提醒' }
  ];

  const tabHero: Record<TabId, { eyebrow: string; title: string }> = {
    account: { eyebrow: 'account', title: '资料与账号设置' },
    drive: { eyebrow: 'drive', title: '文件与网盘空间' },
    notifications: { eyebrow: 'alerts', title: '互动提醒与通知' }
  };

  const tabDescriptions: Record<TabId, string> = {
    account: '管理账号、资料和个性设置。',
    drive: '浏览、上传和整理社区网盘。',
    notifications: '查看最近的点赞、评论、回复和转发提醒。'
  };

  const allowedNotificationTypes = new Set(['like', 'comment', 'reply', 'repost', 'comment_like']);

  $: availableTabs = accountOnly
    ? tabs.filter((tab) => tab.id === 'account')
    : tabs.filter((tab) => allowedTabs ? allowedTabs.includes(tab.id) : (showDriveTab || tab.id !== 'drive'));
  $: shouldRenderModalShell = openAsModal && !embedded;
  $: isEmbeddedAccountPanel = embedded && accountOnly;
  $: activeTabMeta = availableTabs.find((tab) => tab.id === activeTab) || availableTabs[0];

  let activeTab: TabId = defaultTab;
  let authPrompt = '';

  function buildProfileForm(source?: Partial<Record<keyof ProfileForm, string | null | undefined>> | null): ProfileForm {
    return {
      signature: String(source?.signature || ''),
      avatar_url: String(source?.avatar_url || ''),
      background_url: String(source?.background_url || '')
    };
  }

  function buildProfileFormSeed(source?: { id?: string; signature?: string | null; avatar_url?: string | null; background_url?: string | null } | null) {
    return JSON.stringify([
      String(source?.id || ''),
      String(source?.signature || ''),
      String(source?.avatar_url || ''),
      String(source?.background_url || '')
    ]);
  }

  function markProfileDirty() {
    profileFormDirty = true;
  }

  function applyProfileFormPatch(patch: Partial<ProfileForm>) {
    profileForm = {
      ...profileForm,
      ...patch
    };
    profileFormDirty = true;
  }

  let profileForm: ProfileForm = buildProfileForm();
  let profileFormDirty = false;
  let profileFormOwnerId = '';
  let lastProfileFormSeed = '';
  let savingProfile = false;
  let profileMessage = '';

  let driveStats: DriveStats = { quota_bytes: 0, used_bytes: 0, available_bytes: 0 };
  let driveUsagePercent = 0;
  let driveItems: DriveItem[] = [];
  let drivePath: Array<{ id: string | null; name: string }> = [{ id: null, name: '根目录' }];
  let loadingDrive = false;
  let driveError = '';
  let uploadingMedia = false;
  let driveFeedback: DriveFeedback | null = null;

  let notifications: NotificationItem[] = [];
  let loadingNotifications = false;
  let notificationError = '';

  let uploadingAvatar = false;
  let uploadingBackground = false;
  let initializedForUserId = '';
  let shellRef: HTMLElement | null = null;
  let closeButtonRef: HTMLButtonElement | null = null;
  let shellFocusPrimed = false;

  $: if (availableTabs.length > 0 && !availableTabs.some((tab) => tab.id === activeTab)) {
    activeTab = availableTabs[0].id;
  }

  $: if ($communityConsoleState.tab && activeTab !== $communityConsoleState.tab && availableTabs.some((tab) => tab.id === $communityConsoleState.tab)) {
    activeTab = $communityConsoleState.tab;
  }

  $: if (accountOnly && activeTab !== 'account') {
    activeTab = 'account';
  }

  $: if ($user) {
    const nextOwnerId = String($user.id || '');
    const nextSeed = buildProfileFormSeed($user);

    if (nextOwnerId !== profileFormOwnerId) {
      profileFormOwnerId = nextOwnerId;
      lastProfileFormSeed = nextSeed;
      profileFormDirty = false;
      profileForm = buildProfileForm($user);
    } else if (!profileFormDirty && nextSeed !== lastProfileFormSeed) {
      lastProfileFormSeed = nextSeed;
      profileForm = buildProfileForm($user);
    }
  } else if (profileFormOwnerId || profileForm.signature || profileForm.avatar_url || profileForm.background_url) {
    profileFormOwnerId = '';
    lastProfileFormSeed = '';
    profileFormDirty = false;
    profileForm = buildProfileForm();
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

    return () => {
      window.removeEventListener('community-console-tab-request', handleConsoleTabRequest as EventListener);
      document.removeEventListener('keydown', handleDocumentKeydown);
    };
  });

  function requireAuth(message: string) {
    authPrompt = message;
    activeTab = 'account';
    setCommunityConsoleState({ tab: 'account' });
  }

  async function bootstrapConsole() {
    const shouldLoadDriveData = accountOnly || availableTabs.some((tab) => tab.id === 'drive');
    await Promise.allSettled([
      shouldLoadDriveData ? loadDriveInfo() : Promise.resolve(),
      shouldLoadDriveData ? loadDriveList() : Promise.resolve(),
      loadNotifications()
    ]);
  }

  async function switchTab(tab: TabId) {
    if (accountOnly && tab !== 'account') {
      return;
    }

    if (!availableTabs.some((item) => item.id === tab)) {
      return;
    }

    if (!$isAuthenticated && tab !== 'account') {
      requireAuth('登录后才能查看这一块。');
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

    const name = prompt('新文件夹叫什么？');
    if (!name || !name.trim()) return;

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
      await loadDriveList();
      setDriveFeedback(`已创建文件夹「${name.trim()}」。`, 'success');
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
    const file = input.files?.[0];
    if (!file) return;
    if (!$isAuthenticated) {
      requireAuth('登录后才能上传文件。');
      input.value = '';
      return;
    }

    uploadingMedia = true;
    driveError = '';
    setDriveFeedback(`正在上传「${file.name}」...`, 'info');

    try {
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
        driveError = data.msg || '文件没传上去。';
        setDriveFeedback(driveError, 'error');
        return;
      }
      await refreshDriveData();
      setDriveFeedback(`「${file.name}」已上传。`, 'success');
    } catch (error) {
      console.error('Failed to upload drive file', error);
      driveError = '文件没传上去。';
      setDriveFeedback(driveError, 'error');
    } finally {
      uploadingMedia = false;
      input.value = '';
    }
  }

  async function loadNotifications() {
    if (!$isAuthenticated) return;
    loadingNotifications = true;
    notificationError = '';

    try {
      const res = await communityFetch('/api/community/notifications');
      const data = await res.json();
      if (!data.ok) {
        notificationError = data.msg || '提醒没加载出来。';
        return;
      }
      notifications = Array.isArray(data.notifications)
        ? data.notifications.filter((item: NotificationItem) => allowedNotificationTypes.has(item.type))
        : [];
    } catch (error) {
      console.error('Failed to load notifications', error);
      notificationError = '提醒没加载出来。';
    } finally {
      loadingNotifications = false;
    }
  }

  async function handleAvatarUpload(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    uploadingAvatar = true;
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await communityFetch(COMMUNITY_MEDIA_UPLOAD_ENDPOINT, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.ok && data.file?.url) {
        applyProfileFormPatch({ avatar_url: data.file.url });
      } else {
        profileMessage = data.msg || '头像上传失败';
      }
    } catch (e) {
      console.error(e);
      profileMessage = '头像上传失败';
    } finally {
      uploadingAvatar = false;
      input.value = '';
    }
  }

  async function handleBackgroundUpload(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    uploadingBackground = true;
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await communityFetch(COMMUNITY_MEDIA_UPLOAD_ENDPOINT, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.ok && data.file?.url) {
        applyProfileFormPatch({ background_url: data.file.url });
      } else {
        profileMessage = data.msg || '背景图上传失败';
      }
    } catch (e) {
      console.error(e);
      profileMessage = '背景图上传失败';
    } finally {
      uploadingBackground = false;
      input.value = '';
    }
  }

  async function saveProfile() {
    if (!$isAuthenticated) {
      requireAuth('登录后才能保存资料。');
      return;
    }
    savingProfile = true;
    profileMessage = '';

    try {
      const res = await communityFetch('/api/community/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileForm)
      });
      const data = await res.json();
      if (!data.ok) {
        profileMessage = data.msg || '资料没保存成功。';
        return;
      }

      const nextUser = {
        ...$user,
        ...(data.user || profileForm)
      };
      profileFormDirty = false;
      lastProfileFormSeed = '';
      user.set(nextUser);
      persistCommunitySession(nextUser);
      profileMessage = '资料已经保存好了。';
    } catch (error) {
      console.error('Failed to save profile', error);
      profileMessage = '资料没保存成功。';
    } finally {
      savingProfile = false;
    }
  }

  function openMyProfile() {
    if (!$user) return;
    selectedProfile.set(null);
    navigateToView('profile');
    if (!embedded) {
      handleClose();
    }
  }

  function openAuth() {
    openModal('auth');
  }

  function logout() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('commUser');
    }
    resetCommunityConsoleState();
    user.set(null);
    isAuthenticated.set(false);
    isAdmin.set(false);
    closeModal();
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
      reply: '回复了你的评论'
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

  function openCommunityView() {
    navigateToView('community');
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
    class="console-shell relative z-10 flex w-full flex-col text-[var(--color-text)] {embedded ? 'overflow-visible bg-transparent' : shouldRenderModalShell ? 'mx-auto min-h-[calc(100svh-2rem)] max-w-6xl rounded-[36px] border border-white/12 bg-[rgba(var(--color-bg-rgb),0.84)] shadow-[0_24px_60px_rgba(var(--shadow-rgb),0.16)] backdrop-blur-[20px]' : 'mx-auto xl:overflow-hidden xl:h-[min(90vh,56rem)] max-w-6xl rounded-[36px] border border-white/12 bg-[rgba(var(--color-bg-rgb),0.84)] shadow-[0_24px_60px_rgba(var(--shadow-rgb),0.16)] backdrop-blur-[20px]'}"
    transition:softReveal={{ y: 18, duration: 280, startScale: 0.988, blur: 6 }}
  >
    {#if !embedded}
      <header class="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-white/10 bg-[rgba(var(--color-bg-rgb),0.78)] px-5 py-4 backdrop-blur-[20px] md:px-6">
        <div>
          <p class="text-[10px] font-black uppercase tracking-[0.24em] opacity-35">控制台导航</p>
          <h2 id="community-console-title" class="mt-1 text-2xl font-black tracking-tight">{accountOnly ? '账号面板' : '账号 / 网盘 / 提醒'}</h2>
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
        {#if !isEmbeddedAccountPanel}
          <div class="console-hero-panel {embedded ? '' : shouldRenderModalShell ? 'mx-1 mt-4 md:mx-2 md:mt-5' : 'mx-4 mt-4 md:mx-5 md:mt-5'}">
            <div class="console-tab-shell flex flex-col gap-5 xl:flex-row xl:items-stretch xl:justify-between">
              <div class="console-tab-rail xl:max-w-[19rem]">
                <p class="text-[10px] font-black uppercase tracking-[0.24em] opacity-35">{tabHero[activeTabMeta?.id || 'account'].eyebrow}</p>
                <h3 class="mt-2 text-2xl font-black tracking-tight">{tabHero[activeTabMeta?.id || 'account'].title}</h3>
                <p class="mt-2 text-sm font-medium leading-7 opacity-65">{tabDescriptions[activeTabMeta?.id || 'account']}</p>
              </div>

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

            {#if !$isAuthenticated}
              <p class="mt-3 rounded-[20px] border border-white/10 bg-[rgba(255,255,255,0.06)] px-4 py-3 text-sm font-medium leading-7 opacity-75">
                {authPrompt || '先登录，就能继续发帖、评论和查看互动提醒。'}
              </p>
            {/if}
          </div>
        {/if}

        <div class="{embedded ? 'space-y-6' : shouldRenderModalShell ? 'space-y-6 px-5 pb-5 pt-1 md:px-6 md:pb-6' : 'px-5 pb-5 pt-1 md:px-6 md:pb-6 xl:flex-1 xl:min-h-0 xl:overflow-y-auto'}">
          {#if activeTab === 'account'}
            <div class="space-y-6">
              {#if !$isAuthenticated}
                <section class="console-panel p-6">
                  <p class="text-[10px] font-black uppercase tracking-[0.24em] opacity-35">先登录一个</p>
                  <h3 class="mt-3 text-3xl font-black tracking-tight">账号入口已经恢复</h3>
                  <p class="mt-3 max-w-2xl text-sm font-medium leading-7 opacity-70">
                    登录后可以在这里编辑资料，回社区后直接发帖、评论和查看互动提醒。
                  </p>
                  <div class="mt-5 flex flex-wrap gap-3">
                    <button type="button" class="console-pill console-pill--primary px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-[var(--color-bg)]" on:click={openAuth}>
                      登录 / 注册
                    </button>
                    <button type="button" class="console-pill console-pill--ghost px-5 py-3 text-xs font-black uppercase tracking-[0.2em]" on:click={openCommunityView}>
                      回到社区
                    </button>
                  </div>
                </section>
              {:else}
                <section class="account-layout {isEmbeddedAccountPanel ? 'is-embedded-account' : ''}">
                  <div class="console-panel p-6">
                    <div class="flex items-center gap-4">
                      <div class="flex h-16 w-16 items-center justify-center overflow-hidden rounded-[22px] bg-[var(--color-primary)] text-2xl font-black text-[var(--color-bg)]">
                        {#if $user?.avatar_url}
                          <img src={$user.avatar_url} alt={$user?.username || 'user'} class="h-full w-full object-cover" />
                        {:else}
                          {$user?.username?.slice(0, 1).toUpperCase() || 'U'}
                        {/if}
                      </div>

                      <div class="min-w-0 flex-1">
                        <h3 class="truncate text-3xl font-black tracking-tight">{$user?.username}</h3>
                        <p class="mt-1 text-[10px] font-black uppercase tracking-[0.24em] opacity-35">
                          {formatRoleLabel($user?.role)} / LV.{$user?.level || 1} / XP.{$user?.xp || 0}
                        </p>
                      </div>
                    </div>

                    <div class="account-form-grid {isEmbeddedAccountPanel ? 'is-embedded-account' : ''}">
                      <label class="block">
                        <span class="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] opacity-35 text-[var(--color-text,#fff4ed)]">个性签名</span>
                        <textarea bind:value={profileForm.signature} on:input={markProfileDirty} class="console-field h-28 w-full px-4 py-3 text-sm font-medium text-[var(--color-text,#fff4ed)] placeholder:text-[var(--color-text,#fff4ed)]/40" style="background-color: rgba(255, 255, 255, 0.18);"></textarea>
                      </label>

                      <label class="block">
                        <span class="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] opacity-35 text-[var(--color-text,#fff4ed)]">上传头像</span>
                        <div class="console-field relative w-full px-4 py-3 text-sm font-medium text-[var(--color-text,#fff4ed)]">
                          <span class="opacity-70">{uploadingAvatar ? '正在上传...' : (profileForm.avatar_url ? '已上传，点击更换' : '点击选择图片')}</span>
                          <input type="file" accept="image/*" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer" on:change={handleAvatarUpload} disabled={uploadingAvatar} />
                        </div>
                      </label>
                      <label class="block">
                        <span class="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] opacity-35 text-[var(--color-text,#fff4ed)]">上传主页壁纸</span>
                        <div class="console-field relative w-full px-4 py-3 text-sm font-medium text-[var(--color-text,#fff4ed)]">
                          <span class="opacity-70">{uploadingBackground ? '正在上传...' : (profileForm.background_url ? '已上传，点击更换' : '点击选择图片')}</span>
                          <input type="file" accept="image/*" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer" on:change={handleBackgroundUpload} disabled={uploadingBackground} />
                        </div>
                      </label>
                    </div>

                    <div class="mt-5 flex flex-wrap gap-3">
                      <button type="button" class="console-pill console-pill--primary px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-[var(--color-bg)] disabled:opacity-50" on:click={saveProfile} disabled={savingProfile}>
                        {savingProfile ? '正在保存...' : '保存资料'}
                      </button>
                      <button type="button" class="console-pill console-pill--ghost px-5 py-3 text-xs font-black uppercase tracking-[0.2em]" on:click={openMyProfile}>
                        打开主页
                      </button>
                      <button type="button" class="rounded-full border border-red-400/20 bg-red-500/10 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-red-200 transition-transform hover:scale-105" on:click={logout}>
                        退出登录
                      </button>
                    </div>

                    {#if profileMessage}
                      <p class="mt-4 text-sm font-bold opacity-75">{profileMessage}</p>
                    {/if}
                  </div>

                  <div class="console-panel p-6">
                    <p class="text-[10px] font-black uppercase tracking-[0.24em] opacity-35">现在的情况</p>
                    <div class="mt-4 grid gap-4 md:grid-cols-2">
                      <div class="console-subpanel p-4">
                        <p class="text-[10px] font-black uppercase tracking-[0.2em] opacity-35">提醒</p>
                        <p class="mt-2 text-2xl font-black tracking-tight">{notifications.length}</p>
                        <p class="mt-1 text-sm font-medium opacity-65">点赞、评论、回复和转发都会汇总到通知里。</p>
                      </div>
                      <div class="console-subpanel p-4">
                        <p class="text-[10px] font-black uppercase tracking-[0.2em] opacity-35">网盘占用</p>
                        <p class="mt-2 text-2xl font-black tracking-tight">{formatBytes(driveStats.used_bytes || 0)}</p>
                        <p class="mt-1 text-sm font-medium opacity-65">总配额 {formatBytes(driveStats.quota_bytes || 0)}</p>
                      </div>
                      <div class="console-subpanel p-4">
                        <p class="text-[10px] font-black uppercase tracking-[0.2em] opacity-35">文件</p>
                        <p class="mt-2 text-2xl font-black tracking-tight">{driveItems.length}</p>
                        <p class="mt-1 text-sm font-medium opacity-65">头像、壁纸和帖子媒体继续走同一个媒体系统。</p>
                      </div>
                      <div class="console-subpanel p-4">
                        <p class="text-[10px] font-black uppercase tracking-[0.2em] opacity-35">身份</p>
                        <p class="mt-2 text-2xl font-black tracking-tight">{$isAdmin ? '管理员' : '成员'}</p>
                        <p class="mt-1 text-sm font-medium opacity-65">账号入口和资料面板保持固定可达。</p>
                      </div>
                    </div>
                  </div>
                </section>
              {/if}
            </div>
          {/if}

          {#if activeTab === 'drive'}
            {#if !$isAuthenticated}
              <div class="console-panel p-6">
                <p class="text-sm font-bold opacity-70">{authPrompt || '登录后才能访问网盘。'}</p>
                <button type="button" class="mt-4 console-pill console-pill--primary px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-[var(--color-bg)]" on:click={openAuth}>
                  先去登录
                </button>
              </div>
            {:else}
              <div class="space-y-5">
                <section class="console-panel p-6">
                  <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p class="text-[10px] font-black uppercase tracking-[0.24em] opacity-35">网盘情况</p>
                      <h3 class="mt-2 text-3xl font-black tracking-tight">{formatBytes(driveStats.used_bytes || 0)} / {formatBytes(driveStats.quota_bytes || 0)}</h3>
                      <p class="mt-2 text-sm font-medium opacity-65">这里可以直接浏览、上传、重命名和删除媒体文件。</p>
                      <p class="mt-2 text-xs font-bold opacity-55">剩余可用 {formatBytes(driveStats.available_bytes || 0)}</p>
                    </div>

                    <div class="flex flex-wrap gap-3">
                      <label class="cursor-pointer console-pill console-pill--primary px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-[var(--color-bg)]">
                        {uploadingMedia ? '上传中...' : '上传媒体'}
                        <input type="file" class="hidden" disabled={uploadingMedia} on:change={handleMediaUpload} />
                      </label>
                      <button type="button" class="console-pill console-pill--ghost px-5 py-3 text-xs font-black uppercase tracking-[0.2em]" on:click={createFolder}>
                        新建文件夹
                      </button>
                      <button type="button" class="console-pill console-pill--ghost px-5 py-3 text-xs font-black uppercase tracking-[0.2em]" on:click={refreshDriveData}>
                        刷新
                      </button>
                    </div>
                  </div>

                  <div class="mt-5">
                    <div class="h-3 overflow-hidden rounded-full bg-white/10">
                      <div class="h-full rounded-full bg-[var(--color-primary)] transition-[width] duration-300" style="width: {driveUsagePercent}%"></div>
                    </div>
                    <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-black uppercase tracking-[0.18em] opacity-35">
                      <span>已用 {driveUsagePercent}%</span>
                      <span>已占用 {formatBytes(driveStats.used_bytes || 0)}</span>
                      <span>剩余 {formatBytes(driveStats.available_bytes || 0)}</span>
                    </div>
                  </div>
                </section>

                <section class="console-panel p-6">
                  <div class="flex flex-wrap items-center gap-2">
                    {#each drivePath as crumb, index}
                      <button type="button" class="console-pill console-pill--ghost px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em]" on:click={() => goToDrivePath(index)}>
                        {crumb.name}
                      </button>
                    {/each}
                  </div>

                  {#if driveFeedback}
                    <p class="mt-4 rounded-2xl border px-4 py-3 text-sm font-bold {driveFeedback.tone === 'success' ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100' : driveFeedback.tone === 'error' ? 'border-red-400/20 bg-red-500/10 text-red-200' : 'border-white/10 bg-[rgba(255,255,255,0.06)] text-[var(--color-text)]/85'}">{driveFeedback.text}</p>
                  {/if}

                  {#if driveError}
                    <p class="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-200">{driveError}</p>
                  {/if}

                  <div class="mt-5 space-y-3">
                    {#if loadingDrive}
                      {#each Array(5) as _}
                        <div class="h-20 animate-pulse rounded-[22px] bg-[rgba(255,255,255,0.08)]"></div>
                      {/each}
                    {:else if driveItems.length > 0}
                      {#each driveItems as item (item.id)}
                        <article class="flex flex-col gap-4 console-subpanel p-4 md:flex-row md:items-center md:justify-between">
                          <div class="min-w-0 flex-1">
                            <div class="flex items-start gap-3">
                              <div class="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-[16px] bg-[var(--color-primary)] text-sm font-black text-[var(--color-bg)]">
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
                                  {item.is_folder ? 'DIR' : isMediaMimeType(item) ? 'MEDIA' : 'FILE'}
                                {/if}
                              </div>
                              <div class="min-w-0 flex-1">
                                <p class="truncate text-sm font-black">{item.name}</p>
                                <p class="mt-1 text-[10px] font-black uppercase tracking-[0.18em] opacity-35">
                                  {describeDriveItem(item)} {#if !item.is_folder}/ {formatBytes(item.size || 0)}{/if}
                                </p>
                                {#if !item.is_folder && item.updated_at}
                                  <p class="mt-2 text-xs font-medium opacity-45">最近更新于 {formatDate(item.updated_at)}</p>
                                {/if}
                              </div>
                            </div>
                          </div>

                          <div class="flex flex-wrap gap-2">
                            {#if item.is_folder}
                              <button type="button" class="console-pill console-pill--primary px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--color-bg)]" on:click={() => enterFolder(item)}>
                                {getDriveItemOpenLabel(item)}
                              </button>
                            {:else if item.url}
                              <a href={item.url} target="_blank" rel="noreferrer" class="console-pill console-pill--primary px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--color-bg)]">
                                {getDriveItemOpenLabel(item)}
                              </a>
                            {/if}
                            <button type="button" class="console-pill console-pill--ghost px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em]" on:click={() => renameDriveItem(item)}>
                              改名
                            </button>
                            <button type="button" class="rounded-full border border-red-400/20 bg-red-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-red-200 transition-transform hover:scale-105" on:click={() => deleteDriveItem(item)}>
                              删除
                            </button>
                          </div>
                        </article>
                      {/each}
                    {:else}
                      <div class="console-empty-state px-4 py-10 text-center text-sm font-bold opacity-50">
                        这个目录还没有文件。
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
                  <button type="button" class="console-pill console-pill--ghost px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em]" on:click={loadNotifications}>
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
                      <article class="console-subpanel px-4 py-4">
                        <div class="flex items-center justify-between gap-4">
                          <p class="text-sm font-black">{item.username || '系统'} {formatNotification(item.type)}</p>
                          <p class="text-[10px] font-black uppercase tracking-[0.18em] opacity-30">{formatDate(item.created_at)}</p>
                        </div>
                      </article>
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

  .account-layout {
    display: grid;
    gap: 1.5rem;
  }

  .account-form-grid {
    display: grid;
    gap: 1rem;
    margin-top: 1.5rem;
  }

  .account-form-grid .console-field {
    min-height: 3.2rem;
  }

  .console-scrim {
    background: rgba(25, 25, 25, 0.18);
    backdrop-filter: blur(3px);
  }

  .console-shell {
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
    box-shadow: none;
    backdrop-filter: none;
  }

  .console-hero-panel {
    background: var(--paper);
  }

  .console-panel:hover,
  .console-tab-card:hover {
    border-color: var(--hairline-strong);
    box-shadow: none;
  }

  .console-subpanel,
  .console-empty-state,
  .console-field,
  .console-tab-card {
    background: var(--paper);
  }

  .console-tab-card.is-active {
    border-color: var(--clay);
    background: var(--surface);
    box-shadow: inset 0 -2px 0 var(--clay);
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
    box-shadow: none;
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

  @media (min-width: 768px) {
    .account-form-grid {
      grid-template-columns: minmax(0, 1.1fr) minmax(12rem, 0.95fr);
    }

    .account-form-grid label:first-child {
      grid-row: span 2;
    }

    .account-form-grid.is-embedded-account {
      grid-template-columns: 1fr;
    }

    .account-form-grid.is-embedded-account label:first-child {
      grid-row: auto;
    }
  }

  @media (min-width: 1280px) {
    .account-layout {
      grid-template-columns: minmax(0, 1.05fr) minmax(20rem, 0.95fr);
    }

    .account-layout.is-embedded-account {
      grid-template-columns: 1fr;
    }
  }
</style>
