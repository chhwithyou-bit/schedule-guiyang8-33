<script lang="ts">
  export let data: { id?: string } | undefined;
</script>

<section class="route-shell" aria-label="帖子详情">
  <p class="route-kicker">Post detail</p>
  <h1>帖子详情</h1>
  <p>帖子详情将从原先内存态 selectedPost 迁到真实 URL。当前占位详情 ID：<code>{data?.id ?? 'unknown'}</code></p>
</section>
