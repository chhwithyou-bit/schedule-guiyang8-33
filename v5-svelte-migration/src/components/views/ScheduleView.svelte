<script lang="ts">
  import { onMount } from 'svelte';
  import { schedule, eveningSelfStudy, sanjiTests, syncStatus } from '../../stores/appState';
  import AnimatedHeading from '../ui/AnimatedHeading.svelte';
  import { fade, fly } from 'svelte/transition';
  
  let activeDay = 0;
  const days = ['周一', '周二', '周三', '周四', '周五', '周六'];
  const dayEn = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  
  onMount(async () => {
    await fetchSchedule();
    const today = new Date().getDay();
    // 周日(0)和周一(1)都显示周一的内容
    activeDay = (today >= 1 && today <= 6) ? today - 1 : 0;
  });

  async function fetchSchedule() {
    try {
      syncStatus.set('Syncing...');
      const res = await fetch('/api/schedule');
      if (!res.ok) throw new Error('Fetch failed');
      const data = await res.json();
      
      if (data && (data.S || data.EV || data.SJ)) {
        schedule.set(data.S || []);
        eveningSelfStudy.set(data.EV || {});
        sanjiTests.set(data.SJ || {});
        syncStatus.set(`Synced · ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`);
      }
    } catch (e) {
      syncStatus.set('Offline Mode');
    }
  }

  function getTodayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  }

  function getSanjiForToday() {
    const k = getTodayKey();
    let val = '';
    sanjiTests.subscribe(v => val = v[k])();
    return val;
  }

  function getEveningStudy() {
    const k = getTodayKey();
    let ev: any = null;
    eveningSelfStudy.subscribe(v => ev = v[k])();
    return ev;
  }

  // 课程配色逻辑 (对齐 V4.2)
  function getSlotColor(name: string) {
    if (!name || name === '—') return 'opacity-20';
    if (name.includes('语')) return 'bg-orange-500 text-white';
    if (name.includes('数')) return 'bg-blue-600 text-white';
    if (name.includes('英') || name.includes('外')) return 'bg-purple-500 text-white';
    if (name.includes('物')) return 'bg-cyan-500 text-white';
    if (name.includes('化')) return 'bg-emerald-500 text-white';
    if (name.includes('生')) return 'bg-green-500 text-white';
    if (name.includes('地')) return 'bg-amber-600 text-white';
    if (name.includes('历')) return 'bg-red-700 text-white';
    if (name.includes('政')) return 'bg-rose-600 text-white';
    if (name.includes('体')) return 'bg-lime-500 text-black';
    return 'bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200';
  }

  const timeMap = ["08:00", "08:55", "10:10", "11:05", "11:55", "14:30", "15:25", "16:30", "17:25", "19:00", "20:30"];
</script>

<div class="schedule-view pb-20">
  <div class="flex items-end justify-between mb-8">
    <AnimatedHeading text="Schedule" className="text-[12vw] leading-none" />
    <div class="text-[10px] font-black opacity-20 uppercase tracking-[0.3em] pb-2">
      {$syncStatus}
    </div>
  </div>
  
  <!-- Day Selector -->
  <div class="flex gap-2 overflow-x-auto no-scrollbar pb-4 -mx-2 px-2">
    {#each days as day, i}
      <button 
        on:click={() => activeDay = i}
        class="flex-shrink-0 px-6 py-4 rounded-[24px] transition-all duration-500 flex flex-col items-center gap-1
               {activeDay === i ? 'bg-[var(--color-primary)] text-white scale-105 shadow-xl' : 'bg-neutral-100 dark:bg-neutral-900 opacity-40 hover:opacity-100'}"
      >
        <span class="text-[10px] font-black tracking-widest uppercase">{dayEn[i]}</span>
        <span class="text-lg font-black tracking-tighter">{day}</span>
      </button>
    {/each}
  </div>

  <!-- Special Alerts (Sanji & Evening) -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
    <!-- Sanji Card -->
    <div class="p-8 rounded-[40px] bg-[var(--color-primary)] text-white shadow-2xl relative overflow-hidden group">
      <div class="relative z-10">
        <h3 class="text-white/40 font-black uppercase tracking-[0.2em] text-[10px] mb-2">Sanji Test</h3>
        <p class="text-4xl font-black leading-tight tracking-tighter">
          {getSanjiForToday() || '今日无测试'}
        </p>
      </div>
      <div class="absolute -right-10 -bottom-10 w-48 h-48 bg-white/10 rounded-full blur-3xl group-hover:scale-125 transition-transform duration-1000"></div>
    </div>
    
    <!-- Evening Study Card -->
    <div class="p-8 rounded-[40px] bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-900 shadow-sm flex flex-col justify-between">
      <div>
        <h3 class="opacity-30 font-black uppercase tracking-[0.2em] text-[10px] mb-4">Evening Flow</h3>
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold opacity-40">一段晚自习</span>
            <span class="text-lg font-black tracking-tight">{getEveningStudy()?.[0] || '暂无安排'}</span>
          </div>
          <div class="w-full h-px bg-neutral-200 dark:bg-neutral-800 opacity-50"></div>
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold opacity-40">二段晚自习</span>
            <span class="text-lg font-black tracking-tight">{getEveningStudy()?.[1] || '暂无安排'}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Course List -->
  <div class="mt-12 space-y-3">
    <div class="flex items-center justify-between px-4 mb-6">
      <h3 class="text-xs font-black uppercase tracking-[0.3em] opacity-30">Full Day Timeline</h3>
      <div class="w-12 h-0.5 bg-[var(--color-primary)] opacity-20 rounded-full"></div>
    </div>

    {#if $schedule[activeDay]}
      {#each $schedule[activeDay] as slot, i}
        {#if slot}
          <div 
            class="flex items-center gap-4 p-4 rounded-[28px] bg-white dark:bg-neutral-950 border border-neutral-100 dark:border-neutral-900 group hover:scale-[1.01] transition-all duration-300"
            in:fly={{ y: 20, delay: i * 50 }}
          >
            <!-- Slot Index & Time -->
            <div class="w-16 flex flex-col items-center justify-center gap-0.5 border-r border-neutral-100 dark:border-neutral-900 pr-2">
              <span class="text-xl font-black tracking-tighter leading-none">{i + 1}</span>
              <span class="text-[9px] font-bold opacity-30">{timeMap[i] || '--:--'}</span>
            </div>

            <!-- Subject Badge -->
            <div class="flex-1 min-w-0 flex items-center gap-4">
              <div class="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm shadow-sm flex-shrink-0 {getSlotColor(slot.s)}">
                {slot.s?.slice(0,1) || '—'}
              </div>
              <div class="flex-1 truncate">
                <p class="text-lg font-bold tracking-tight truncate">{slot.s || '—'}</p>
                <p class="text-[10px] font-bold opacity-30 uppercase tracking-widest">{slot.t || 'Unassigned'}</p>
              </div>
            </div>

            <!-- Tag -->
            <div class="hidden sm:block">
              <span class="px-3 py-1.5 rounded-full bg-neutral-50 dark:bg-neutral-900/50 text-[9px] font-black uppercase tracking-widest opacity-30">
                {slot.k === 'x' ? 'Elective' : 'Core'}
              </span>
            </div>
          </div>
        {/if}
      {/each}
    {:else}
      <div class="py-32 text-center opacity-10 font-black text-6xl uppercase tracking-tighter italic">
        Loading...
      </div>
    {/if}
  </div>
</div>

<style>
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
</style>
