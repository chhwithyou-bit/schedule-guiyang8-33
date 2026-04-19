<script lang="ts">
  import { onMount } from 'svelte';
  import { schedule, eveningSelfStudy, sanjiTests, syncStatus } from '../../stores/appState';
  import AnimatedHeading from '../ui/AnimatedHeading.svelte';
  
  let activeDay = 0;
  const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  
  onMount(async () => {
    await fetchSchedule();
    const today = new Date().getDay();
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
        syncStatus.set(`Synced at ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`);
      }
    } catch (e) {
      syncStatus.set('Using local fallback');
    }
  }

  // Get status for specific day
  function getSanjiForToday() {
    const now = new Date();
    const k = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    let val = '';
    sanjiTests.subscribe(v => val = v[k])();
    return val || 'No tests today';
  }
</script>

<div class="schedule-view">
  <AnimatedHeading text="Schedule Flow" className="text-[12vw]" />
  
  <div class="mt-8 flex items-center justify-between">
    <div class="flex gap-2">
      {#each days as day, i}
        <button 
          on:click={() => activeDay = i}
          class="px-4 py-2 rounded-full font-bold transition-all {activeDay === i ? 'bg-[var(--color-primary)] text-white scale-110 shadow-lg' : 'bg-gray-100 dark:bg-neutral-800 opacity-60'}"
        >
          {day}
        </button>
      {/each}
    </div>
    <div class="text-xs font-mono opacity-40 uppercase tracking-widest">
      {$syncStatus}
    </div>
  </div>

  <!-- Today's Highlights -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
    <div class="p-8 rounded-[40px] bg-[var(--color-primary)] text-white shadow-2xl overflow-hidden relative group">
      <div class="relative z-10">
        <h3 class="text-white/50 font-bold uppercase tracking-widest text-xs mb-2">Sanji Test</h3>
        <p class="text-4xl font-black leading-tight">{getSanjiForToday()}</p>
      </div>
      <div class="absolute -right-10 -bottom-10 w-40 h-40 bg-white/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700"></div>
    </div>
    
    <div class="p-8 rounded-[40px] bg-neutral-100 dark:bg-neutral-900 border-2 border-transparent hover:border-[var(--color-primary)] transition-all duration-300">
      <h3 class="opacity-40 font-bold uppercase tracking-widest text-xs mb-2">Sync Status</h3>
      <p class="text-2xl font-black">{$syncStatus.split(' · ')[0]}</p>
    </div>
  </div>

  <!-- Course List -->
  <div class="mt-12 space-y-4">
    {#if $schedule[activeDay]}
      {#each $schedule[activeDay] as slot, i}
        {#if slot}
          <div class="flex items-center gap-6 p-6 rounded-3xl bg-white dark:bg-neutral-950 border border-neutral-100 dark:border-neutral-900 hover:shadow-xl transition-shadow group">
            <div class="w-12 h-12 flex items-center justify-center rounded-2xl bg-neutral-100 dark:bg-neutral-900 font-black text-xl group-hover:scale-110 transition-transform">
              {i + 1}
            </div>
            <div class="flex-1">
              <p class="text-xl font-bold tracking-tight">{slot.s || '—'}</p>
              <p class="text-sm opacity-50 font-medium">{slot.t || 'Unknown Teacher'}</p>
            </div>
            <div class="text-right">
              <span class="px-3 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-900 text-[10px] font-black uppercase tracking-widest opacity-40">
                {slot.k === 'm' ? 'Morning' : (slot.k === 'a' ? 'Afternoon' : 'Special')}
              </span>
            </div>
          </div>
        {/if}
      {/each}
    {:else}
      <div class="py-20 text-center opacity-20 font-black text-4xl uppercase tracking-tighter">
        Loading Schedule...
      </div>
    {/if}
  </div>
</div>
