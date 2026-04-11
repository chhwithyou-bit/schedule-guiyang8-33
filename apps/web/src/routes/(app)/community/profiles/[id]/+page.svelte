<script lang="ts">
  export let data: { id?: string } | undefined;
</script>

<section class="route-shell" aria-label="个人主页详情">
  <p class="route-kicker">Profile detail</p>
  <h1>个人主页</h1>
  <p>个人页将从原先内存态 selectedProfile 迁到真实 URL。当前占位资料 ID：<code>{data?.id ?? 'unknown'}</code></p>
</section>
