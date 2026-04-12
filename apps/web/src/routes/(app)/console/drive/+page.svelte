<script lang="ts">
  import { onMount } from 'svelte';
  import DrivePanel from '$lib/components/drive/DrivePanel.svelte';
  import {
    createDriveFolder,
    deleteDriveEntries,
    fetchDriveInfo,
    fetchDriveList,
    isCommunitySessionReady,
    normalizeDriveStats,
    renameDriveEntry,
    rootDrivePath,
    uploadDriveFile,
    type DriveDialogMode,
    type DriveFeedback,
    type DriveItem,
    type DrivePathCrumb,
    type DrivePreviewStatus,
    type DriveStats
  } from '$lib/state/drive';

  let items: DriveItem[] = [];
  let stats: DriveStats = normalizeDriveStats();
  let path: DrivePathCrumb[] = [...rootDrivePath];
  let loading = false;
  let uploading = false;
  let error = '';
  let feedback: DriveFeedback | null = null;
  let activeDialog: DriveDialogMode | null = null;
  let draftName = '';
  let selectedItem: DriveItem | null = null;
  let submittingDialog = false;
  let authReady = false;

  function setFeedback(text: string, tone: DriveFeedback['tone']) {
    feedback = text ? { text, tone } : null;
  }

  function clearFeedback() {
    feedback = null;
    error = '';
  }

  function closeDialog() {
    activeDialog = null;
    draftName = '';
    selectedItem = null;
    submittingDialog = false;
  }

  function currentParentId() {
    return path[path.length - 1]?.id || null;
  }

  function updatePreviewStatus(itemId: string, status: DrivePreviewStatus) {
    items = items.map((item) =>
      item.id === itemId && item.preview_status !== status ? { ...item, preview_status: status } : item
    );
  }

  async function loadInfo() {
    stats = await fetchDriveInfo();
  }

  async function loadList(parentId: string | null = currentParentId()) {
    loading = true;
    error = '';

    try {
      items = await fetchDriveList(parentId);
    } catch (err) {
      items = [];
      error = err instanceof Error ? err.message : '这个目录没加载出来。';
    } finally {
      loading = false;
    }
  }

  async function refreshDriveData() {
    if (!authReady) return;

    try {
      await Promise.all([loadInfo(), loadList()]);
    } catch (err) {
      error = err instanceof Error ? err.message : '网盘信息没加载出来。';
    }
  }

  async function enterFolder(item: DriveItem) {
    path = [...path, { id: item.id, name: item.name }];
    await loadList(item.id);
  }

  async function navigateTo(index: number) {
    path = path.slice(0, index + 1);
    await loadList(currentParentId());
  }

  function startCreateFolder() {
    clearFeedback();
    draftName = '';
    selectedItem = null;
    activeDialog = 'create';
  }

  function startRename(item: DriveItem) {
    clearFeedback();
    selectedItem = item;
    draftName = item.name;
    activeDialog = 'rename';
  }

  function startDelete(item: DriveItem) {
    clearFeedback();
    selectedItem = item;
    draftName = '';
    activeDialog = 'delete';
  }

  async function submitCreateFolder() {
    const name = draftName.trim();
    if (!name) {
      error = '请输入文件夹名称。';
      return;
    }

    submittingDialog = true;
    clearFeedback();

    try {
      await createDriveFolder(name, currentParentId());
      await loadList();
      setFeedback(`已创建文件夹“${name}”。`, 'success');
      closeDialog();
    } catch (err) {
      error = err instanceof Error ? err.message : '文件夹没建成功。';
      submittingDialog = false;
    }
  }

  async function submitRename() {
    const nextName = draftName.trim();
    if (!selectedItem) return;
    if (!nextName) {
      error = '请输入新的名称。';
      return;
    }
    if (nextName === selectedItem.name) {
      closeDialog();
      return;
    }

    submittingDialog = true;
    clearFeedback();

    try {
      const previousName = selectedItem.name;
      await renameDriveEntry(selectedItem.id, nextName);
      await loadList();
      setFeedback(`已将“${previousName}”改名为“${nextName}”。`, 'success');
      closeDialog();
    } catch (err) {
      error = err instanceof Error ? err.message : '改名没成功。';
      submittingDialog = false;
    }
  }

  async function submitDelete() {
    if (!selectedItem) return;

    submittingDialog = true;
    clearFeedback();

    try {
      const deletedName = selectedItem.name;
      const data = await deleteDriveEntries([selectedItem.id]);
      if (data?.stats) {
        stats = normalizeDriveStats(data.stats);
        await loadList();
      } else {
        await refreshDriveData();
      }
      setFeedback(`已删除“${deletedName}”。`, 'success');
      closeDialog();
    } catch (err) {
      error = err instanceof Error ? err.message : '删除没成功。';
      submittingDialog = false;
    }
  }

  async function handleUpload(file: File) {
    if (!authReady) {
      error = '请先登录。';
      return;
    }

    uploading = true;
    clearFeedback();
    setFeedback(`正在上传“${file.name}”…`, 'info');

    try {
      const data = await uploadDriveFile(file, currentParentId());
      if (data?.stats) {
        stats = normalizeDriveStats(data.stats);
        await loadList();
      } else {
        await refreshDriveData();
      }
      setFeedback(`“${file.name}”已上传，可继续整理或预览。`, 'success');
    } catch (err) {
      error = err instanceof Error ? err.message : '文件没传上去。';
      setFeedback(error, 'error');
    } finally {
      uploading = false;
    }
  }

  onMount(async () => {
    authReady = isCommunitySessionReady();
    if (!authReady) {
      error = '请先登录后再使用网盘。';
      return;
    }
    await refreshDriveData();
  });
</script>

<DrivePanel
  {items}
  {stats}
  {path}
  {loading}
  {uploading}
  {error}
  {feedback}
  {activeDialog}
  {draftName}
  selectedItem={selectedItem}
  submitDisabled={submittingDialog}
  onNavigate={navigateTo}
  onOpen={enterFolder}
  onRefresh={refreshDriveData}
  onUpload={handleUpload}
  onStartCreateFolder={startCreateFolder}
  onStartRename={startRename}
  onStartDelete={startDelete}
  onCancelDialog={closeDialog}
  onSubmitCreateFolder={submitCreateFolder}
  onSubmitRename={submitRename}
  onSubmitDelete={submitDelete}
  onDraftNameChange={(value) => (draftName = value)}
  onPreviewStatusChange={updatePreviewStatus}
/>
