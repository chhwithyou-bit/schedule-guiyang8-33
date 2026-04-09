<script lang="ts">
  import CommunityConsole from '../modals/CommunityConsole.svelte';
</script>

<section class="console-view space-y-5 md:space-y-6">
  <div class="console-view__shell overflow-hidden rounded-[32px] px-5 py-5 md:px-7 md:py-6">
    <div aria-hidden="true" class="console-view__overlay pointer-events-none absolute inset-0"></div>
    <div aria-hidden="true" class="console-view__shine pointer-events-none absolute inset-x-7 top-0 h-px opacity-80"></div>

    <div class="console-view__intro relative z-[1]">
      <p class="text-[10px] font-black uppercase tracking-[0.28em] opacity-35">主消息台</p>
      <h1 class="mt-2 text-[2rem] font-black tracking-tight md:text-[2.5rem]">聊天 / 群组 / 网盘 / 提醒</h1>
      <p class="mt-3 max-w-3xl text-sm font-medium leading-7 opacity-70 md:text-base">
        这些原来塞在弹窗里的高频交互已经平铺到主选项卡，手机端可以整页滚动，不再只剩下半屏可用。
      </p>
    </div>

    <div class="console-view__panel mt-5 md:mt-6">
      <CommunityConsole embedded={true} defaultTab="chats" />
    </div>
  </div>
</section>

<style>
  .console-view__shell {
    position: relative;
    border: 1px solid rgba(var(--glow-primary-rgb), 0.14);
    background:
      linear-gradient(145deg, rgba(var(--glow-primary-rgb), 0.16), rgba(var(--glow-secondary-rgb), 0.12)),
      linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(var(--color-bg-rgb), 0.18)),
      rgba(var(--color-bg-rgb), 0.34);
    box-shadow:
      0 22px 52px rgba(var(--shadow-rgb), 0.16),
      inset 0 1px 0 rgba(255, 255, 255, 0.14),
      inset 0 -1px 0 rgba(0, 0, 0, 0.05);
    backdrop-filter: blur(18px) saturate(1.06);
  }

  .console-view__overlay {
    background:
      radial-gradient(circle at top left, rgba(var(--glow-primary-rgb), 0.18), transparent 38%),
      radial-gradient(circle at 85% 16%, rgba(var(--glow-secondary-rgb), 0.12), transparent 30%),
      linear-gradient(135deg, rgba(var(--glow-primary-rgb), 0.04), rgba(var(--glow-secondary-rgb), 0.03));
    opacity: 0.95;
  }

  .console-view__shine {
    background: linear-gradient(90deg, rgba(var(--glow-primary-rgb), 0.04), rgba(255, 255, 255, 0.34), rgba(var(--glow-secondary-rgb), 0.06));
  }

  .console-view__intro {
    padding-bottom: 0.25rem;
  }

  .console-view__panel {
    position: relative;
    z-index: 1;
    border-top: 1px solid rgba(var(--glow-primary-rgb), 0.14);
    padding-top: 1.25rem;
  }

  @media (min-width: 768px) {
    .console-view__panel {
      padding-top: 1.5rem;
    }
  }
</style>
