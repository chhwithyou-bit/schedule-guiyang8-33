<script lang="ts">
  import CommunityConsole from '../modals/CommunityConsole.svelte';
</script>

<section class="console-view space-y-6">
  <div class="rounded-[30px] border border-white/10 bg-white/5 px-6 py-5 shadow-xl">
    <p class="text-[10px] font-black uppercase tracking-[0.26em] opacity-35">主消息台</p>
    <h1 class="mt-2 text-3xl font-black tracking-tight md:text-4xl">聊天 / 群组 / 网盘 / 提醒</h1>
    <p class="mt-3 max-w-3xl text-sm font-medium leading-7 opacity-70 md:text-base">
      这些原来塞在弹窗里的高频交互已经平铺到主选项卡，手机端可以整页滚动，不再只剩下半屏可用。
    </p>
  </div>

  <CommunityConsole embedded={true} defaultTab="chats" />
</section>
