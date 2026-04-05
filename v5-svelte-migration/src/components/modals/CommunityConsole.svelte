<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { closeModal, openModal } from '../../stores/modalState';
  import { currentView, isAdmin, isAuthenticated, selectedProfile, user } from '../../stores/appState';
  import { communityFetch, persistCommunitySession } from '../../lib/communityApi';
  import { communityConsoleState, resetCommunityConsoleState, setCommunityConsoleState } from '../../stores/communityConsoleState';
  import { onMount } from 'svelte';

  type TabId = 'account' | 'chats' | 'groups' | 'drive' | 'notifications';

  export let embedded = false;
  export let accountOnly = false;
  export let defaultTab: TabId = 'account';

  type Conversation = {
    id: string;
    kind: 'direct' | 'group';
    title: string;
    description?: string;
    avatar_url?: string;
    unread_count?: number;
    last_message?: string;
    last_sender_name?: string;
    last_message_at?: string;
    member_count?: number;
  };

  type Message = {
    id: string;
    conversation_id: string;
    sender_id?: string;
    content: string;
    created_at?: string;
    sender?: {
      id?: string;
      username?: string;
      avatar_url?: string;
      role?: string;
      level?: number;
      xp?: number;
    } | null;
  };

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
  };

  type DriveStats = {
    quota_bytes?: number;
    used_bytes?: number;
  };

  type NotificationItem = {
    id: string;
    type: string;
    target_id?: string | null;
    created_at?: string;
    username?: string;
    avatar_url?: string;
  };

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'account', label: '账号' },
    { id: 'chats', label: '聊天' },
    { id: 'groups', label: '群组' },
    { id: 'drive', label: '网盘' },
    { id: 'notifications', label: '提醒' }
  ];

  const tabHero: Record<TabId, { eyebrow: string; title: string }> = {
    account: { eyebrow: 'account', title: '资料与账号设置' },
    chats: { eyebrow: 'messages', title: '最近会话与私聊' },
    groups: { eyebrow: 'groups', title: '群聊与建群管理' },
    drive: { eyebrow: 'drive', title: '文件与网盘空间' },
    notifications: { eyebrow: 'alerts', title: '互动提醒与通知' }
  };

  const tabDescriptions: Record<TabId, string> = {
    account: '管理账号、资料和个性设置。',
    chats: '把私聊和群聊消息集中处理。',
    groups: '新建群组并快速回到已有群聊。',
    drive: '浏览、上传和整理社区网盘。',
    notifications: '查看最近的互动和提醒。'
  };

  $: availableTabs = accountOnly ? tabs.filter((tab) => tab.id === 'account') : tabs;
  $: activeTabMeta = availableTabs.find((tab) => tab.id === activeTab) || availableTabs[0];

  let activeTab: TabId = defaultTab;
  let authPrompt = '';

  let profileForm = {
    signature: '',
    avatar_url: '',
    background_url: ''
  };
  let savingProfile = false;
  let profileMessage = '';
  let groupForm = {
    title: '',
    description: ''
  };
  let creatingGroup = false;
  let groupMessage = '';

  let conversations: Conversation[] = [];
  let selectedConversationId = '';
  let selectedConversation: Conversation | null = null;
  let groupConversations: Conversation[] = [];
  let directConversations: Conversation[] = [];
  let messages: Message[] = [];
  let loadingChats = false;
  let loadingMessages = false;
  let chatError = '';
  let messageDraft = '';
  let sendingMessage = false;

  let driveStats: DriveStats = { quota_bytes: 0, used_bytes: 0 };
  let driveUsagePercent = 0;
  let driveItems: DriveItem[] = [];
  let drivePath: Array<{ id: string | null; name: string }> = [{ id: null, name: '根目录' }];
  let loadingDrive = false;
  let driveError = '';
  let uploadingDrive = false;

  let notifications: NotificationItem[] = [];
  let loadingNotifications = false;
  let notificationError = '';

  let initializedForUserId = '';

  onMount(() => {
    const handleConsoleTabRequest = (event: Event) => {
      const customEvent = event as CustomEvent<{ tab?: TabId }>;
      const nextTab = customEvent.detail?.tab;
      if (nextTab) {
        void switchTab(nextTab);
      }
    };

    window.addEventListener('community-console-tab-request', handleConsoleTabRequest as EventListener);

    return () => {
      window.removeEventListener('community-console-tab-request', handleConsoleTabRequest as EventListener);
    };
  });

  $: if ($user) {
    profileForm = {
      signature: $user.signature || '',
      avatar_url: $user.avatar_url || '',
      background_url: $user.background_url || ''
    };
  }

  $: if ($isAuthenticated && !accountOnly && $user?.id && initializedForUserId !== $user.id) {
    initializedForUserId = $user.id;
    void bootstrapConsole();
  }

  $: if ($communityConsoleState.tab && activeTab !== $communityConsoleState.tab) {
    activeTab = $communityConsoleState.tab;
  }

  $: if (accountOnly && activeTab !== 'account') {
    activeTab = 'account';
  }

  $: if (!$isAuthenticated) {
    initializedForUserId = '';
    conversations = [];
    selectedConversationId = '';
    messages = [];
    driveItems = [];
    notifications = [];
    drivePath = [{ id: null, name: '根目录' }];
  }

  function requireAuth(message: string) {
    authPrompt = message;
    activeTab = 'account';
    setCommunityConsoleState({ tab: 'account', conversationId: '' });
  }

  async function bootstrapConsole() {
    await Promise.allSettled([
      loadChats(),
      loadDriveInfo(),
      loadDriveList(),
      loadNotifications()
    ]);

    if ($communityConsoleState.conversationId) {
      await loadMessages($communityConsoleState.conversationId, $communityConsoleState.tab === 'chats');
    }
  }

  async function switchTab(tab: TabId) {
    if (accountOnly && tab !== 'account') {
      return;
    }

    if (!$isAuthenticated && tab !== 'account') {
      requireAuth('登录后才能查看这一块。');
      return;
    }

    activeTab = tab;
    setCommunityConsoleState({ tab, conversationId: selectedConversationId });

    if (tab === 'chats' && conversations.length === 0 && !loadingChats) {
      await loadChats();
    }

    if (tab === 'groups' && conversations.length === 0 && !loadingChats) {
      await loadChats();
    }

    if (tab === 'drive' && driveItems.length === 0 && !loadingDrive) {
      await Promise.allSettled([loadDriveInfo(), loadDriveList()]);
    }

    if (tab === 'notifications' && notifications.length === 0 && !loadingNotifications) {
      await loadNotifications();
    }
  }

  async function loadChats() {
    if (!$isAuthenticated) return;
    loadingChats = true;
    chatError = '';

    try {
      const res = await communityFetch('/api/community/chats');
      const data = await res.json();
      if (!data.ok) {
        chatError = data.msg || '会话列表没加载出来。';
        return;
      }

      conversations = Array.isArray(data.conversations) ? data.conversations : [];

      if (!selectedConversationId && conversations[0]?.id) {
        selectedConversationId = conversations[0].id;
        await loadMessages(selectedConversationId, false);
      } else if (selectedConversationId) {
        const stillExists = conversations.find((item) => item.id === selectedConversationId);
        if (stillExists) {
          await loadMessages(selectedConversationId, false);
        } else {
          selectedConversationId = '';
          messages = [];
          setCommunityConsoleState({ conversationId: '' });
        }
      }
    } catch (error) {
      console.error('Failed to load chats', error);
      chatError = '会话列表没加载出来。';
    } finally {
      loadingChats = false;
    }
  }

  async function loadMessages(conversationId: string, activateTab = true) {
    if (!$isAuthenticated || !conversationId) return;
    loadingMessages = true;
    chatError = '';

    try {
      const res = await communityFetch(`/api/community/chats/messages?conversation_id=${encodeURIComponent(conversationId)}`);
      const data = await res.json();
      if (!data.ok) {
        chatError = data.msg || '消息没加载出来。';
        return;
      }

      selectedConversationId = conversationId;
      messages = Array.isArray(data.messages) ? data.messages : [];
      conversations = conversations.map((item) =>
        item.id === conversationId ? { ...item, unread_count: 0 } : item
      );
      setCommunityConsoleState({
        tab: activateTab ? 'chats' : activeTab,
        conversationId
      });
    } catch (error) {
      console.error('Failed to load messages', error);
      chatError = '消息没加载出来。';
    } finally {
      loadingMessages = false;
    }
  }

  async function sendMessage() {
    const content = messageDraft.trim();
    if (!$isAuthenticated) {
      requireAuth('登录后才能发消息。');
      return;
    }
    if (!selectedConversationId || !content || sendingMessage) return;

    sendingMessage = true;
    chatError = '';

    try {
      const res = await communityFetch('/api/community/chats/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: selectedConversationId,
          content
        })
      });
      const data = await res.json();
      if (!data.ok) {
        chatError = data.msg || '消息没发出去。';
        return;
      }

      messages = [...messages, data.message];
      conversations = conversations.map((item) =>
        item.id === selectedConversationId
          ? {
              ...item,
              last_message: content,
              last_sender_name: $user?.username || '我',
              last_message_at: data.message?.created_at
            }
          : item
      );
      messageDraft = '';
    } catch (error) {
      console.error('Failed to send message', error);
      chatError = '消息没发出去。';
    } finally {
      sendingMessage = false;
    }
  }

  async function loadDriveInfo() {
    if (!$isAuthenticated) return;

    try {
      const res = await communityFetch('/api/community/drive/info');
      const data = await res.json();
      if (data.ok) {
        driveStats = data.stats || { quota_bytes: 0, used_bytes: 0 };
      } else {
        driveError = data.msg || '网盘信息没加载出来。';
      }
    } catch (error) {
      console.error('Failed to load drive info', error);
      driveError = '网盘信息没加载出来。';
    }
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
      driveItems = Array.isArray(data.files) ? data.files : [];
    } catch (error) {
      console.error('Failed to load drive list', error);
      driveError = '这个目录没加载出来。';
    } finally {
      loadingDrive = false;
    }
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
        return;
      }
      await loadDriveList();
    } catch (error) {
      console.error('Failed to create folder', error);
      driveError = '文件夹没建成功。';
    }
  }

  async function renameDriveItem(item: DriveItem) {
    const nextName = prompt('改成什么名字？', item.name);
    if (!nextName || !nextName.trim() || nextName.trim() === item.name) return;

    try {
      const res = await communityFetch('/api/community/drive/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, name: nextName.trim() })
      });
      const data = await res.json();
      if (!data.ok) {
        driveError = data.msg || '改名没成功。';
        return;
      }
      await loadDriveList();
    } catch (error) {
      console.error('Failed to rename drive item', error);
      driveError = '改名没成功。';
    }
  }

  async function deleteDriveItem(item: DriveItem) {
    if (!confirm(`确定删除“${item.name}”吗？`)) return;

    try {
      const res = await communityFetch('/api/community/drive/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [item.id] })
      });
      const data = await res.json();
      if (!data.ok) {
        driveError = data.msg || '删除没成功。';
        return;
      }
      await Promise.allSettled([loadDriveInfo(), loadDriveList()]);
    } catch (error) {
      console.error('Failed to delete drive item', error);
      driveError = '删除没成功。';
    }
  }

  async function handleDriveUpload(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!$isAuthenticated) {
      requireAuth('登录后才能上传文件。');
      input.value = '';
      return;
    }

    uploadingDrive = true;
    driveError = '';

    try {
      const formData = new FormData();
      formData.append('file', file);
      const parentId = drivePath[drivePath.length - 1]?.id;
      if (parentId) formData.append('parent_id', parentId);

      const res = await communityFetch('/api/community/drive/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!data.ok) {
        driveError = data.msg || '文件没传上去。';
        return;
      }
      await Promise.allSettled([loadDriveInfo(), loadDriveList()]);
    } catch (error) {
      console.error('Failed to upload drive file', error);
      driveError = '文件没传上去。';
    } finally {
      uploadingDrive = false;
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
      notifications = Array.isArray(data.notifications) ? data.notifications : [];
    } catch (error) {
      console.error('Failed to load notifications', error);
      notificationError = '提醒没加载出来。';
    } finally {
      loadingNotifications = false;
    }
  }

  let uploadingAvatar = false;
  let uploadingBackground = false;

  async function handleAvatarUpload(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    uploadingAvatar = true;
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await communityFetch('/api/community/drive/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.ok && data.file?.url) {
        profileForm.avatar_url = data.file.url;
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
      const res = await communityFetch('/api/community/drive/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.ok && data.file?.url) {
        profileForm.background_url = data.file.url;
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
        ...profileForm
      };
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
    selectedProfile.set($user);
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

  async function createGroup() {
    const title = groupForm.title.trim();
    const description = groupForm.description.trim();

    if (!$isAuthenticated) {
      requireAuth('登录后才能创建群组。');
      return;
    }
    if (!title || creatingGroup) {
      groupMessage = '请输入群组名称。';
      return;
    }

    creatingGroup = true;
    groupMessage = '';

    try {
      const res = await communityFetch('/api/community/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          member_ids: []
        })
      });
      const data = await res.json();
      if (!data.ok) {
        groupMessage = data.msg || '群组没建成功。';
        return;
      }

      groupForm = { title: '', description: '' };
      groupMessage = '群已经建好了。';
      await loadChats();
      activeTab = 'groups';
      setCommunityConsoleState({ tab: 'groups', conversationId: data.conversation_id || '' });
    } catch (error) {
      console.error('Failed to create group', error);
      groupMessage = '群组没建成功。';
    } finally {
      creatingGroup = false;
    }
  }

  async function openConversation(conversationId: string) {
    await switchTab('chats');
    await loadMessages(conversationId);
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
      follow: '关注了你',
      repost: '转发了你的动态',
      comment: '评论了你的帖子',
      message: '给你发来一条消息'
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

  function formatConversationKind(kind?: string) {
    return kind === 'group' ? '群聊' : '私聊';
  }

  function openNodesView() {
    currentView.set('nodes');
    if (!embedded) {
      handleClose();
    }
  }

  $: selectedConversation = conversations.find((item) => item.id === selectedConversationId) || null;
  $: groupConversations = conversations.filter((item) => item.kind === 'group');
  $: directConversations = conversations.filter((item) => item.kind === 'direct');
  $: driveUsagePercent = driveStats.quota_bytes
    ? Math.min(100, Math.round(((driveStats.used_bytes || 0) / driveStats.quota_bytes) * 100))
    : 0;

  function handleClose() {
    if (embedded) {
      return;
    }

    resetCommunityConsoleState();
    closeModal();
  }
</script>

<div class={embedded ? 'relative z-0' : 'fixed inset-0 z-[10000] flex items-center justify-center p-4 md:p-6'} transition:fade={{ duration: 220 }}>
  {#if !embedded}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="absolute inset-0 bg-black/60 backdrop-blur-xl" on:click={handleClose}></div>
  {/if}

  <section
    class="relative z-10 flex w-full flex-col text-[var(--color-text)] {embedded ? 'overflow-visible bg-transparent' : 'overflow-hidden h-[min(90vh,56rem)] max-w-6xl rounded-[36px] border border-white/10 bg-[rgba(var(--color-bg-rgb),0.96)] shadow-2xl backdrop-blur-2xl'}"
    transition:fly={{ y: 36, duration: 360 }}
  >
    {#if !embedded}
    <header class="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4 md:px-6">
      <div>
        <p class="text-[10px] font-black uppercase tracking-[0.24em] opacity-35">{embedded ? '社区消息台' : '个人面板'}</p>
        <h2 class="mt-1 text-2xl font-black tracking-tight">{accountOnly ? '账号面板' : '聊天 / 群组 / 网盘 / 提醒'}</h2>
      </div>

      <div class="flex items-center gap-3">
        {#if $isAuthenticated}
          <div class="hidden rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] opacity-70 md:block">
            {$user?.username || 'member'}
          </div>
        {/if}
        {#if !embedded}
          <button type="button" class="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] transition-transform hover:scale-105" on:click={handleClose}>
            关闭
          </button>
        {/if}
      </div>
    </header>
    {/if}

    <div class="{embedded ? 'space-y-5' : 'min-h-0 flex-1 overflow-hidden'}">
      <div class="{embedded ? 'space-y-5' : 'flex h-full min-h-0 flex-col'}">
        <div class="rounded-[28px] border border-white/10 bg-white/5 p-3 shadow-lg backdrop-blur-xl {embedded ? '' : 'mx-4 mt-4 md:mx-5 md:mt-5'}">
          <div class="console-tab-shell flex flex-col gap-5 xl:flex-row xl:items-stretch xl:justify-between">
            <div class="console-tab-rail xl:max-w-[19rem]">
              <p class="text-[10px] font-black uppercase tracking-[0.24em] opacity-35">{tabHero[activeTab].eyebrow}</p>
              <h3 class="mt-2 text-2xl font-black tracking-tight">{tabHero[activeTab].title}</h3>
              <p class="mt-2 text-sm font-medium leading-7 opacity-65">{tabDescriptions[activeTab]}</p>
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
              <button type="button" class="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-transform hover:scale-105" on:click={openNodesView}>
                去发现页
              </button>
              {#if $isAuthenticated}
                <button type="button" class="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-transform hover:scale-105" on:click={openMyProfile}>
                  我的主页
                </button>
              {/if}
            </div>
          </div>

          {#if !$isAuthenticated}
            <p class="mt-3 rounded-[20px] border border-white/10 bg-[rgba(255,255,255,0.04)] px-4 py-3 text-sm font-medium leading-7 opacity-75">
              {authPrompt || '先登录，就能继续使用聊天、用户组会话和网盘。'}
            </p>
          {/if}
        </div>

      <div class="{embedded ? 'space-y-6' : 'min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-1 md:px-6 md:pb-6'}">
        {#if activeTab === 'account'}
          <div class="space-y-6">
            {#if !$isAuthenticated}
              <section class="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-xl">
                <p class="text-[10px] font-black uppercase tracking-[0.24em] opacity-35">先登录一下</p>
                <h3 class="mt-3 text-3xl font-black tracking-tight">登录入口已经恢复</h3>
                <p class="mt-3 max-w-2xl text-sm font-medium leading-7 opacity-70">
                  现在这里会固定显示账号入口。登录后，聊天会话、群组、网盘和个人资料编辑都会在同一个面板里可见。
                </p>
                <div class="mt-5 flex flex-wrap gap-3">
                  <button type="button" class="rounded-full bg-[var(--color-primary)] px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-[var(--color-bg)] shadow-lg transition-transform hover:scale-105" on:click={openAuth}>
                    登录 / 注册
                  </button>
                  <button type="button" class="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] transition-transform hover:scale-105" on:click={openNodesView}>
                    去逛逛发现页
                  </button>
                </div>
              </section>
            {:else}
              <section class="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)]">
                <div class="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-xl">
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
                        {formatRoleLabel($user?.role)} · LV.{$user?.level || 1} · XP.{$user?.xp || 0}
                      </p>
                    </div>
                  </div>

                  <div class="mt-6 grid gap-4 md:grid-cols-3">
                    <label class="block">
                      <span class="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] opacity-35 text-[var(--color-text,#fff4ed)]">个性签名</span>
                      <textarea bind:value={profileForm.signature} class="h-28 w-full rounded-[22px] border border-white/30 bg-white/15 px-4 py-3 text-sm font-medium text-[var(--color-text,#fff4ed)] placeholder:text-[var(--color-text,#fff4ed)]/40 outline-none transition-colors focus:border-[var(--color-primary,#fac7b7)]" style="background-color: rgba(255, 255, 255, 0.18);"></textarea>
                    </label>
                    
                    <label class="block">
                      <span class="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] opacity-35 text-[var(--color-text,#fff4ed)]">上传头像</span>
                      <div class="relative w-full rounded-[22px] border border-white/30 bg-white/20 px-4 py-3 text-sm font-medium transition-colors hover:border-[var(--color-primary,#fac7b7)] text-[var(--color-text,#fff4ed)]">
                        <span class="opacity-70">{uploadingAvatar ? '正在上传...' : (profileForm.avatar_url ? '已上传，点击更换' : '点击选择图片')}</span>
                        <input type="file" accept="image/*" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer" on:change={handleAvatarUpload} disabled={uploadingAvatar} />
                      </div>
                    </label>
                    <label class="block">
                      <span class="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] opacity-35 text-[var(--color-text,#fff4ed)]">上传主页壁纸</span>
                      <div class="relative w-full rounded-[22px] border border-white/20 bg-white/10 px-4 py-3 text-sm font-medium transition-colors hover:border-[var(--color-primary,#fac7b7)] text-[var(--color-text,#fff4ed)]">
                        <span class="opacity-70">{uploadingBackground ? '正在上传...' : (profileForm.background_url ? '已上传，点击更换' : '点击选择图片')}</span>
                        <input type="file" accept="image/*" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer" on:change={handleBackgroundUpload} disabled={uploadingBackground} />
                      </div>
                    </label>

                  </div>

                  <div class="mt-5 flex flex-wrap gap-3">
                    <button type="button" class="rounded-full bg-[var(--color-primary)] px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-[var(--color-bg)] shadow-lg transition-transform hover:scale-105 disabled:opacity-50" on:click={saveProfile} disabled={savingProfile}>
                      {savingProfile ? '正在保存…' : '保存资料'}
                    </button>
                    <button type="button" class="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] transition-transform hover:scale-105" on:click={openMyProfile}>
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

                <div class="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-xl">
                  <p class="text-[10px] font-black uppercase tracking-[0.24em] opacity-35">现在的情况</p>
                  <div class="mt-4 grid gap-4 md:grid-cols-2">
                    <div class="rounded-[24px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-4">
                      <p class="text-[10px] font-black uppercase tracking-[0.2em] opacity-35">会话</p>
                      <p class="mt-2 text-2xl font-black tracking-tight">{conversations.length}</p>
                      <p class="mt-1 text-sm font-medium opacity-65">私聊和群组会话会统一汇总到这里。</p>
                    </div>
                    <div class="rounded-[24px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-4">
                      <p class="text-[10px] font-black uppercase tracking-[0.2em] opacity-35">群组</p>
                      <p class="mt-2 text-2xl font-black tracking-tight">{groupConversations.length}</p>
                      <p class="mt-1 text-sm font-medium opacity-65">旧版加入过的群组现在能在控制台里直接打开。</p>
                    </div>
                    <div class="rounded-[24px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-4">
                      <p class="text-[10px] font-black uppercase tracking-[0.2em] opacity-35">网盘占用</p>
                      <p class="mt-2 text-2xl font-black tracking-tight">{formatBytes(driveStats.used_bytes || 0)}</p>
                      <p class="mt-1 text-sm font-medium opacity-65">总配额 {formatBytes(driveStats.quota_bytes || 0)}</p>
                    </div>
                    <div class="rounded-[24px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-4">
                      <p class="text-[10px] font-black uppercase tracking-[0.2em] opacity-35">身份</p>
                      <p class="mt-2 text-2xl font-black tracking-tight">{$isAdmin ? '管理员' : '普通成员'}</p>
                      <p class="mt-1 text-sm font-medium opacity-65">账号入口和资料面板已经恢复为固定 UI。</p>
                    </div>
                  </div>
                </div>
              </section>
            {/if}
          </div>
        {/if}

        {#if activeTab === 'chats'}
          {#if !$isAuthenticated}
            <div class="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-xl">
              <p class="text-sm font-bold opacity-70">{authPrompt || '登录后才能查看聊天和群组会话。'}</p>
              <button type="button" class="mt-4 rounded-full bg-[var(--color-primary)] px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-[var(--color-bg)] shadow-lg transition-transform hover:scale-105" on:click={openAuth}>
                先去登录
              </button>
            </div>
          {:else}
            <div class="{embedded ? 'grid gap-5 xl:grid-cols-[18rem_minmax(0,1fr)]' : 'grid min-h-[34rem] gap-5 xl:grid-cols-[18rem_minmax(0,1fr)]'}">
              <section class="rounded-[32px] border border-white/10 bg-white/5 p-4 shadow-xl">
                <div class="mb-4 flex items-center justify-between">
                  <div>
                    <p class="text-[10px] font-black uppercase tracking-[0.24em] opacity-35">会话列表</p>
                    <h3 class="mt-1 text-xl font-black tracking-tight">共 {conversations.length} 个会话</h3>
                    <p class="mt-1 text-xs font-medium opacity-55">{directConversations.length} 个私聊 · {groupConversations.length} 个群聊</p>
                  </div>
                  <button type="button" class="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-transform hover:scale-105" on:click={loadChats}>
                    刷新
                  </button>
                </div>

                {#if chatError}
                  <p class="mb-3 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-200">{chatError}</p>
                {/if}

                <div class="space-y-3">
                  {#if loadingChats}
                    {#each Array(4) as _}
                      <div class="h-20 animate-pulse rounded-[22px] bg-white/5"></div>
                    {/each}
                  {:else if conversations.length > 0}
                    {#each conversations as item (item.id)}
                      <button
                        type="button"
                        class="flex w-full items-start gap-3 rounded-[22px] border px-4 py-4 text-left transition-colors {selectedConversationId === item.id ? 'border-[var(--color-primary)] bg-[rgba(255,255,255,0.08)]' : 'border-white/10 bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.07)]'}"
                        on:click={() => loadMessages(item.id)}
                      >
                        <div class="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-[16px] bg-[var(--color-primary)] font-black text-[var(--color-bg)]">
                          {#if item.avatar_url}
                            <img src={item.avatar_url} alt={item.title} class="h-full w-full object-cover" />
                          {:else}
                            {item.title?.slice(0, 1).toUpperCase() || '#'}
                          {/if}
                        </div>
                        <div class="min-w-0 flex-1">
                          <div class="flex items-center justify-between gap-3">
                            <p class="truncate text-sm font-black">{item.title}</p>
                            {#if item.unread_count}
                              <span class="rounded-full bg-[var(--color-primary)] px-2 py-1 text-[10px] font-black text-[var(--color-bg)]">{item.unread_count}</span>
                            {/if}
                          </div>
                          <p class="mt-1 truncate text-xs font-medium opacity-55">{item.last_sender_name ? `${item.last_sender_name}: ` : ''}{item.last_message || item.description || '还没有消息。'}</p>
                          <p class="mt-2 text-[10px] font-black uppercase tracking-[0.18em] opacity-30">{formatConversationKind(item.kind)}</p>
                        </div>
                      </button>
                    {/each}
                  {:else}
                    <div class="rounded-[24px] border border-white/10 bg-white/5 px-4 py-10 text-center text-sm font-bold opacity-50">
                      还没有会话。先去发现页加个群，或者去别人的主页打个招呼。
                    </div>
                  {/if}
                </div>
              </section>

              <section class="flex min-h-0 flex-col rounded-[32px] border border-white/10 bg-white/5 p-4 shadow-xl">
                <div class="mb-4 border-b border-white/10 pb-4">
                  <p class="text-[10px] font-black uppercase tracking-[0.24em] opacity-35">当前会话</p>
                  <h3 class="mt-1 text-2xl font-black tracking-tight">{selectedConversation?.title || '先选一个会话'}</h3>
                  {#if selectedConversation}
                    <p class="mt-2 text-sm font-medium opacity-65">{selectedConversation.description || '会话详情会在这里显示。'}</p>
                  {/if}
                </div>

                <div class="min-h-0 flex-1 overflow-y-visible rounded-[24px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-4 xl:overflow-y-auto">
                  {#if loadingMessages}
                    <div class="space-y-3">
                      {#each Array(4) as _}
                        <div class="h-16 animate-pulse rounded-[20px] bg-white/5"></div>
                      {/each}
                    </div>
                  {:else if messages.length > 0}
                    <div class="space-y-3">
                      {#each messages as message (message.id)}
                        <article class="rounded-[20px] border border-white/10 bg-white/5 px-4 py-3">
                          <div class="flex items-center justify-between gap-4">
                            <p class="text-sm font-black">{message.sender?.username || '系统'}</p>
                            <p class="text-[10px] font-black uppercase tracking-[0.18em] opacity-30">{formatDate(message.created_at)}</p>
                          </div>
                          <p class="mt-2 whitespace-pre-wrap text-sm font-medium leading-7 opacity-80">{message.content}</p>
                        </article>
                      {/each}
                    </div>
                  {:else}
                    <div class="flex h-full items-center justify-center text-center text-sm font-bold opacity-45">
                      {selectedConversation ? '这个会话还没有消息。' : '先从左侧选择一个会话。'}
                    </div>
                  {/if}
                </div>

                <div class="mt-4 flex gap-3">
                  <input
                    bind:value={messageDraft}
                    type="text"
                    placeholder={selectedConversation ? '说点什么…' : '先选一个会话'}
                    disabled={!selectedConversation || sendingMessage}
                    on:keydown={(event) => event.key === 'Enter' && sendMessage()}
                    class="min-w-0 flex-1 rounded-[20px] border border-white/30 bg-white/15 px-4 py-3 text-sm font-medium text-[var(--color-text,#fff4ed)] placeholder:text-[var(--color-text,#fff4ed)]/40 outline-none transition-colors focus:border-[var(--color-primary,#fac7b7)] disabled:opacity-40"
                    style="background-color: rgba(255, 255, 255, 0.18);"
                  />
                  <button
                    type="button"
                    disabled={!selectedConversation || !messageDraft.trim() || sendingMessage}
                    class="rounded-[20px] bg-[var(--color-primary,#fac7b7)] px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-[var(--color-bg,#231b22)] shadow-lg transition-transform hover:scale-105 disabled:cursor-default disabled:opacity-40"
                    on:click={sendMessage}
                  >
                    发送
                  </button>
                </div>
              </section>
            </div>
          {/if}
        {/if}

        {#if activeTab === 'groups'}
          {#if !$isAuthenticated}
            <div class="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-xl">
              <p class="text-sm font-bold opacity-70">{authPrompt || '登录后才能查看和创建群组。'}</p>
              <button type="button" class="mt-4 rounded-full bg-[var(--color-primary)] px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-[var(--color-bg)] shadow-lg transition-transform hover:scale-105" on:click={openAuth}>
                先去登录
              </button>
            </div>
          {:else}
            <div class="grid gap-5 xl:grid-cols-[minmax(22rem,0.9fr)_minmax(0,1.1fr)]">
              <section class="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-xl">
                <p class="text-[10px] font-black uppercase tracking-[0.24em] opacity-35">建一个新群</p>
                <h3 class="mt-2 text-3xl font-black tracking-tight">群组入口已经补回来了</h3>
                <p class="mt-3 text-sm font-medium leading-7 opacity-70">
                  这里直接接后端群组接口。你可以新建群组，也可以从右侧打开之前已经加入的会话。
                </p>

                <div class="mt-5 space-y-4">
                  <label class="block">
                    <span class="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] opacity-35">群名</span>
                    <input bind:value={groupForm.title} type="text" maxlength="42" class="w-full rounded-[22px] border border-white/30 bg-white/15 px-4 py-3 text-sm font-medium outline-none transition-colors focus:border-[var(--color-primary)]" style="background-color: rgba(255, 255, 255, 0.18);" />
                  </label>
                  <label class="block">
                    <span class="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] opacity-35">群介绍</span>
                    <textarea bind:value={groupForm.description} class="h-32 w-full rounded-[22px] border border-white/30 bg-white/15 px-4 py-3 text-sm font-medium outline-none transition-colors focus:border-[var(--color-primary)]" style="background-color: rgba(255, 255, 255, 0.18);"></textarea>
                  </label>
                </div>

                <div class="mt-5 flex flex-wrap gap-3">
                  <button type="button" class="rounded-full bg-[var(--color-primary)] px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-[var(--color-bg)] shadow-lg transition-transform hover:scale-105 disabled:opacity-50" on:click={createGroup} disabled={creatingGroup}>
                    {creatingGroup ? '正在创建…' : '创建群聊'}
                  </button>
                  <button type="button" class="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] transition-transform hover:scale-105" on:click={openNodesView}>
                    去发现页看看
                  </button>
                </div>

                {#if groupMessage}
                  <p class="mt-4 text-sm font-bold opacity-75">{groupMessage}</p>
                {/if}
              </section>

              <section class="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-xl">
                <div class="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <p class="text-[10px] font-black uppercase tracking-[0.24em] opacity-35">我加入的群</p>
                    <h3 class="mt-1 text-2xl font-black tracking-tight">共 {groupConversations.length} 个群</h3>
                  </div>
                  <button type="button" class="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-transform hover:scale-105" on:click={loadChats}>
                    刷新
                  </button>
                </div>

                <div class="space-y-3">
                  {#if loadingChats}
                    {#each Array(4) as _}
                      <div class="h-24 animate-pulse rounded-[22px] bg-white/5"></div>
                    {/each}
                  {:else if groupConversations.length > 0}
                    {#each groupConversations as item (item.id)}
                      <article class="rounded-[24px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-4">
                        <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <div class="min-w-0">
                            <div class="flex flex-wrap items-center gap-3">
                              <h4 class="truncate text-lg font-black tracking-tight">{item.title}</h4>
                              <span class="rounded-full border border-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] opacity-60">{item.member_count || 0} 人</span>
                            </div>
                            <p class="mt-2 text-sm font-medium leading-7 opacity-70">{item.description || item.last_message || '这个群组还没有介绍。'}</p>
                            <p class="mt-3 text-[10px] font-black uppercase tracking-[0.18em] opacity-35">
                              {item.last_message_at ? `最近活跃于 ${formatDate(item.last_message_at)}` : '暂时还没人说话'}
                            </p>
                          </div>
                          <button type="button" class="rounded-full bg-[var(--color-primary)] px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--color-bg)] shadow-lg transition-transform hover:scale-105" on:click={() => openConversation(item.id)}>
                            打开会话
                          </button>
                        </div>
                      </article>
                    {/each}
                  {:else}
                    <div class="rounded-[24px] border border-white/10 bg-white/5 px-4 py-10 text-center text-sm font-bold opacity-50">
                      还没有已加入的群。你可以先在这里建一个，或者去发现页加群。
                    </div>
                  {/if}
                </div>
              </section>
            </div>
          {/if}
        {/if}

        {#if activeTab === 'drive'}
          {#if !$isAuthenticated}
            <div class="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-xl">
              <p class="text-sm font-bold opacity-70">{authPrompt || '登录后才能访问网盘。'}</p>
              <button type="button" class="mt-4 rounded-full bg-[var(--color-primary)] px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-[var(--color-bg)] shadow-lg transition-transform hover:scale-105" on:click={openAuth}>
                先去登录
              </button>
            </div>
          {:else}
            <div class="space-y-5">
              <section class="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-xl">
                <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p class="text-[10px] font-black uppercase tracking-[0.24em] opacity-35">网盘情况</p>
                    <h3 class="mt-2 text-3xl font-black tracking-tight">{formatBytes(driveStats.used_bytes || 0)} / {formatBytes(driveStats.quota_bytes || 0)}</h3>
                    <p class="mt-2 text-sm font-medium opacity-65">旧网盘接口已接回前端，这里可以直接浏览、上传、重命名和删除。</p>
                  </div>

                  <div class="flex flex-wrap gap-3">
                    <label class="cursor-pointer rounded-full bg-[var(--color-primary)] px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-[var(--color-bg)] shadow-lg transition-transform hover:scale-105">
                      {uploadingDrive ? '上传中…' : '上传文件'}
                      <input type="file" class="hidden" disabled={uploadingDrive} on:change={handleDriveUpload} />
                    </label>
                    <button type="button" class="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] transition-transform hover:scale-105" on:click={createFolder}>
                      新建文件夹
                    </button>
                    <button type="button" class="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] transition-transform hover:scale-105" on:click={() => Promise.allSettled([loadDriveInfo(), loadDriveList()])}>
                      刷新
                    </button>
                  </div>
                </div>

                <div class="mt-5">
                  <div class="h-3 overflow-hidden rounded-full bg-white/10">
                    <div class="h-full rounded-full bg-[var(--color-primary)] transition-[width] duration-300" style="width: {driveUsagePercent}%"></div>
                  </div>
                  <p class="mt-2 text-[10px] font-black uppercase tracking-[0.18em] opacity-35">已用 {driveUsagePercent}%</p>
                </div>
              </section>

              <section class="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-xl">
                <div class="flex flex-wrap items-center gap-2">
                  {#each drivePath as crumb, index}
                    <button type="button" class="rounded-full border border-white/10 bg-[rgba(255,255,255,0.04)] px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-transform hover:scale-105" on:click={() => goToDrivePath(index)}>
                      {crumb.name}
                    </button>
                  {/each}
                </div>

                {#if driveError}
                  <p class="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-200">{driveError}</p>
                {/if}

                <div class="mt-5 space-y-3">
                  {#if loadingDrive}
                    {#each Array(5) as _}
                      <div class="h-20 animate-pulse rounded-[22px] bg-white/5"></div>
                    {/each}
                  {:else if driveItems.length > 0}
                    {#each driveItems as item (item.id)}
                      <article class="flex flex-col gap-4 rounded-[24px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-4 md:flex-row md:items-center md:justify-between">
                        <div class="min-w-0">
                          <div class="flex items-center gap-3">
                            <div class="flex h-11 w-11 items-center justify-center rounded-[16px] bg-[var(--color-primary)] text-sm font-black text-[var(--color-bg)]">
                              {item.is_folder ? 'DIR' : 'FILE'}
                            </div>
                            <div class="min-w-0">
                              <p class="truncate text-sm font-black">{item.name}</p>
                              <p class="mt-1 text-[10px] font-black uppercase tracking-[0.18em] opacity-35">
                                {item.is_folder ? '文件夹' : item.mime_type || '文件'} {#if !item.is_folder}· {formatBytes(item.size || 0)}{/if}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div class="flex flex-wrap gap-2">
                          {#if item.is_folder}
                            <button type="button" class="rounded-full bg-[var(--color-primary)] px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--color-bg)] shadow-lg transition-transform hover:scale-105" on:click={() => enterFolder(item)}>
                              打开
                            </button>
                          {:else if item.url}
                            <a href={item.url} target="_blank" rel="noreferrer" class="rounded-full bg-[var(--color-primary)] px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--color-bg)] shadow-lg transition-transform hover:scale-105">
                              打开
                            </a>
                          {/if}
                          <button type="button" class="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-transform hover:scale-105" on:click={() => renameDriveItem(item)}>
                            改名
                          </button>
                          <button type="button" class="rounded-full border border-red-400/20 bg-red-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-red-200 transition-transform hover:scale-105" on:click={() => deleteDriveItem(item)}>
                            删除
                          </button>
                        </div>
                      </article>
                    {/each}
                  {:else}
                    <div class="rounded-[24px] border border-white/10 bg-white/5 px-4 py-10 text-center text-sm font-bold opacity-50">
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
            <div class="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-xl">
              <p class="text-sm font-bold opacity-70">{authPrompt || '登录后才能查看通知。'}</p>
              <button type="button" class="mt-4 rounded-full bg-[var(--color-primary)] px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-[var(--color-bg)] shadow-lg transition-transform hover:scale-105" on:click={openAuth}>
                先去登录
              </button>
            </div>
          {:else}
            <section class="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-xl">
              <div class="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p class="text-[10px] font-black uppercase tracking-[0.24em] opacity-35">提醒</p>
                  <h3 class="mt-1 text-2xl font-black tracking-tight">{notifications.length} 条更新</h3>
                </div>
                <button type="button" class="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-transform hover:scale-105" on:click={loadNotifications}>
                  刷新
                </button>
              </div>

              {#if notificationError}
                <p class="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-200">{notificationError}</p>
              {/if}

              <div class="space-y-3">
                {#if loadingNotifications}
                  {#each Array(4) as _}
                    <div class="h-20 animate-pulse rounded-[22px] bg-white/5"></div>
                  {/each}
                {:else if notifications.length > 0}
                  {#each notifications as item (item.id)}
                    <article class="rounded-[24px] border border-white/10 bg-[rgba(255,255,255,0.04)] px-4 py-4">
                      <div class="flex items-center justify-between gap-4">
                        <p class="text-sm font-black">{item.username || '系统'} {formatNotification(item.type)}</p>
                        <p class="text-[10px] font-black uppercase tracking-[0.18em] opacity-30">{formatDate(item.created_at)}</p>
                      </div>
                    </article>
                  {/each}
                {:else}
                  <div class="rounded-[24px] border border-white/10 bg-white/5 px-4 py-10 text-center text-sm font-bold opacity-50">
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
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
    padding: 0.95rem;
    text-align: left;
    transition:
      transform 0.22s ease,
      background 0.22s ease,
      border-color 0.22s ease,
      box-shadow 0.22s ease;
  }

  .console-tab-card:hover {
    transform: translateY(-2px);
    border-color: rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.07);
  }

  .console-tab-card.is-active {
    border-color: color-mix(in srgb, var(--color-primary) 72%, white 28%);
    background: linear-gradient(145deg, rgba(var(--glow-primary-rgb), 0.2), rgba(255, 255, 255, 0.08));
    box-shadow:
      0 16px 28px rgba(var(--shadow-rgb), 0.16),
      inset 0 1px 0 rgba(255, 255, 255, 0.18);
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
</style>
