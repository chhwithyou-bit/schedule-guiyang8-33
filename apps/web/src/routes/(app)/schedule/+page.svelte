<script lang="ts">
  import { onMount } from 'svelte';

  type ScheduleSlot = {
    s?: string;
    t?: string;
    k?: string;
  };

  type EveningStudyMap = Record<string, [string?, string?] | string[] | undefined>;
  type SanjiMap = Record<string, string | undefined>;
  type ScheduleResponse = {
    S?: ScheduleSlot[][];
    EV?: EveningStudyMap;
    SJ?: SanjiMap;
  };

  const days = ['周一', '周二', '周三', '周四', '周五', '周六'];
  const dayEn = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const timeMap = ['08:00', '08:55', '10:10', '11:05', '11:55', '14:30', '15:25', '16:30', '17:25', '19:00', '20:30'];

  const todayKey = buildTodayKey();

  let activeDay = 0;
  let scheduleData: ScheduleResponse = {};
  let syncStatus = '正在同步…';

  onMount(() => {
    const abortController = new AbortController();
    void fetchSchedule(abortController.signal);

    const today = new Date().getDay();
    activeDay = today >= 1 && today <= 6 ? today - 1 : 0;

    return () => abortController.abort();
  });

  async function fetchSchedule(signal: AbortSignal) {
    try {
      syncStatus = '正在同步…';
      const res = await fetch('/api/schedule', { signal });
      if (!res.ok) throw new Error('Fetch failed');

      const data = (await res.json()) as ScheduleResponse;
      if (data && (data.S || data.EV || data.SJ)) {
        scheduleData = data;
        syncStatus = `刚刚更新 · ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
      } else {
        syncStatus = '离线显示';
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      syncStatus = '离线显示';
    }
  }

  function buildTodayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  function getSlotColor(name: string) {
    if (!name || name === '—') return 'slot-badge--empty';
    if (name.includes('语')) return 'slot-badge--orange';
    if (name.includes('数')) return 'slot-badge--blue';
    if (name.includes('英') || name.includes('外')) return 'slot-badge--purple';
    if (name.includes('物')) return 'slot-badge--cyan';
    if (name.includes('化')) return 'slot-badge--emerald';
    if (name.includes('生')) return 'slot-badge--green';
    if (name.includes('地')) return 'slot-badge--amber';
    if (name.includes('历')) return 'slot-badge--red';
    if (name.includes('政')) return 'slot-badge--rose';
    if (name.includes('体')) return 'slot-badge--lime';
    return 'slot-badge--neutral';
  }

  $: schedule = scheduleData.S || [];
  $: eveningSelfStudy = scheduleData.EV || {};
  $: sanjiTests = scheduleData.SJ || {};
  $: todaySanji = sanjiTests[todayKey] || '';
  $: eveningStudy = eveningSelfStudy[todayKey] || [];
  $: activeSlots = schedule[activeDay] || [];
</script>

<svelte:head>
  <title>课表</title>
</svelte:head>

<section aria-labelledby="schedule-title" class="schedule-view route-shell">
  <div class="schedule-view__header">
    <div>
      <p class="route-kicker">today flow</p>
      <h2 class="schedule-view__sr-only">课表</h2>
      <h1 id="schedule-title">课程安排</h1>
    </div>
    <p class="schedule-view__status" aria-live="polite">{syncStatus}</p>
  </div>

  <div class="schedule-view__days" role="tablist" aria-label="切换课表日期">
    {#each days as day, i}
      <button
        type="button"
        role="tab"
        class:day-pill--active={activeDay === i}
        class="day-pill"
        aria-selected={activeDay === i}
        aria-controls={`schedule-day-${i}`}
        id={`schedule-tab-${i}`}
        on:click={() => (activeDay = i)}
      >
        <span class="day-pill__eyebrow">{dayEn[i]}</span>
        <span class="day-pill__label">{day}</span>
      </button>
    {/each}
  </div>

  <div class="schedule-view__alerts">
    <article class="feature-card feature-card--primary" aria-label="今日考试">
      <h2>今日考试</h2>
      <p>{todaySanji || '今日无测试'}</p>
    </article>

    <article class="feature-card feature-card--secondary" aria-label="晚自习安排">
      <h2>晚自习安排</h2>
      <dl>
        <div>
          <dt>一段晚自习</dt>
          <dd>{eveningStudy[0] || '暂无安排'}</dd>
        </div>
        <div class="feature-card__divider"></div>
        <div>
          <dt>二段晚自习</dt>
          <dd>{eveningStudy[1] || '暂无安排'}</dd>
        </div>
      </dl>
    </article>
  </div>

  <section class="schedule-list" aria-labelledby="schedule-list-title">
    <div class="schedule-list__header">
      <h2 id="schedule-list-title">今天怎么排</h2>
      <div class="schedule-list__accent"></div>
    </div>

    <div
      id={`schedule-day-${activeDay}`}
      role="tabpanel"
      tabindex="0"
      aria-labelledby={`schedule-tab-${activeDay}`}
      class="schedule-list__panel"
    >
      {#if activeSlots.length}
        {#each activeSlots as slot, i}
          {#if slot}
            <article class="schedule-slot" aria-label={`${days[activeDay]}第${i + 1}节`}>
              <div class="schedule-slot__index">
                <span>{i + 1}</span>
                <small>{timeMap[i] || '--:--'}</small>
              </div>

              <div class="schedule-slot__content">
                <div class={`slot-badge ${getSlotColor(slot.s || '—')}`} aria-hidden="true">
                  {slot.s?.slice(0, 1) || '—'}
                </div>
                <div class="schedule-slot__meta">
                  <p>{slot.s || '—'}</p>
                  <small>{slot.t || '暂未安排老师'}</small>
                </div>
              </div>

              <div class="schedule-slot__tag-wrap">
                <span class="schedule-slot__tag">{slot.k === 'x' ? '选修' : '必修'}</span>
              </div>
            </article>
          {/if}
        {/each}
      {:else}
        <div class="schedule-list__empty">稍等一下…</div>
      {/if}
    </div>
  </section>
</section>

<style>
  .schedule-view {
    display: grid;
    gap: 2rem;
  }

  .schedule-view__header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
  }

  .schedule-view__status {
    margin: 0;
    padding-bottom: 0.35rem;
    font-size: 0.7rem;
    font-weight: 900;
    letter-spacing: 0.3em;
    opacity: 0.45;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .schedule-view__sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .schedule-view__days {
    display: flex;
    gap: 0.75rem;
    overflow-x: auto;
    padding-bottom: 0.25rem;
    scrollbar-width: none;
  }

  .schedule-view__days::-webkit-scrollbar {
    display: none;
  }

  .day-pill {
    flex-shrink: 0;
    min-width: 6.75rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 1.5rem;
    background: rgba(255, 255, 255, 0.06);
    color: inherit;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    padding: 1rem 1.2rem;
    opacity: 0.58;
    transition: transform 0.25s ease, opacity 0.25s ease, background 0.25s ease, border-color 0.25s ease;
  }

  .day-pill:hover,
  .day-pill:focus-visible {
    opacity: 1;
    transform: translateY(-1px);
  }

  .day-pill--active {
    opacity: 1;
    color: var(--color-button-text, #fff7ed);
    background: linear-gradient(135deg, color-mix(in srgb, var(--color-primary, #f97316) 86%, white 14%), var(--color-primary, #f97316));
    border-color: color-mix(in srgb, var(--color-primary, #f97316) 72%, white 28%);
    box-shadow: 0 24px 55px rgba(var(--shadow-rgb, 0 0 0), 0.28);
    transform: scale(1.02);
  }

  .day-pill__eyebrow {
    font-size: 0.65rem;
    font-weight: 900;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }

  .day-pill__label {
    font-size: 1.1rem;
    font-weight: 900;
    letter-spacing: -0.04em;
  }

  .schedule-view__alerts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .feature-card {
    border-radius: 2rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    padding: 1.75rem;
    min-height: 12rem;
  }

  .feature-card h2 {
    margin: 0 0 0.85rem;
    font-size: 0.75rem;
    font-weight: 900;
    letter-spacing: 0.18em;
    opacity: 0.55;
    text-transform: uppercase;
  }

  .feature-card p {
    margin: 0;
    max-width: none;
    font-size: clamp(2rem, 4vw, 3rem);
    font-weight: 900;
    letter-spacing: -0.06em;
    line-height: 1.05;
    opacity: 1;
  }

  .feature-card--primary {
    background: linear-gradient(135deg, color-mix(in srgb, var(--color-primary, #f97316) 90%, white 10%), color-mix(in srgb, var(--color-primary, #f97316) 70%, black 30%));
    color: white;
    box-shadow: 0 30px 80px rgba(var(--glow-primary-rgb, 249 115 22), 0.26);
  }

  .feature-card--primary h2 {
    opacity: 0.72;
  }

  .feature-card--secondary {
    background: rgba(4, 9, 18, 0.78);
  }

  .feature-card dl {
    display: grid;
    gap: 1rem;
    margin: 0;
  }

  .feature-card dl div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .feature-card dt {
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    opacity: 0.52;
  }

  .feature-card dd {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 900;
    letter-spacing: -0.03em;
    text-align: right;
  }

  .feature-card__divider {
    width: 100%;
    height: 1px;
    background: rgba(255, 255, 255, 0.08);
  }

  .schedule-list {
    display: grid;
    gap: 1rem;
  }

  .schedule-list__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding-inline: 0.25rem;
  }

  .schedule-list__header h2 {
    margin: 0;
    font-size: 0.78rem;
    font-weight: 900;
    letter-spacing: 0.28em;
    opacity: 0.55;
    text-transform: uppercase;
  }

  .schedule-list__accent {
    width: 3rem;
    height: 0.2rem;
    border-radius: 999px;
    background: var(--color-primary, #f97316);
    opacity: 0.35;
  }

  .schedule-list__panel {
    display: grid;
    gap: 0.85rem;
    outline: none;
  }

  .schedule-slot {
    display: flex;
    align-items: center;
    gap: 1rem;
    border-radius: 1.75rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
    padding: 1rem;
    transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
  }

  .schedule-slot:hover {
    transform: translateY(-1px);
    border-color: rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.06);
  }

  .schedule-slot__index {
    width: 4.25rem;
    padding-right: 0.75rem;
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    flex-shrink: 0;
  }

  .schedule-slot__index span {
    font-size: 1.45rem;
    font-weight: 900;
    letter-spacing: -0.05em;
    line-height: 1;
  }

  .schedule-slot__index small,
  .schedule-slot__meta small,
  .schedule-slot__tag {
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    opacity: 0.52;
    text-transform: uppercase;
  }

  .schedule-slot__content {
    display: flex;
    align-items: center;
    gap: 1rem;
    min-width: 0;
    flex: 1;
  }

  .slot-badge {
    width: 3rem;
    height: 3rem;
    border-radius: 1rem;
    display: grid;
    place-items: center;
    font-size: 1rem;
    font-weight: 900;
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
    flex-shrink: 0;
  }

  .slot-badge--empty {
    background: rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.65);
  }

  .slot-badge--orange { background: #f97316; color: white; }
  .slot-badge--blue { background: #2563eb; color: white; }
  .slot-badge--purple { background: #a855f7; color: white; }
  .slot-badge--cyan { background: #06b6d4; color: white; }
  .slot-badge--emerald { background: #10b981; color: white; }
  .slot-badge--green { background: #22c55e; color: white; }
  .slot-badge--amber { background: #d97706; color: white; }
  .slot-badge--red { background: #b91c1c; color: white; }
  .slot-badge--rose { background: #e11d48; color: white; }
  .slot-badge--lime { background: #84cc16; color: #0f172a; }
  .slot-badge--neutral {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.9);
  }

  .schedule-slot__meta {
    min-width: 0;
    flex: 1;
  }

  .schedule-slot__meta p {
    margin: 0;
    max-width: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.15rem;
    font-weight: 800;
    letter-spacing: -0.03em;
    opacity: 1;
  }

  .schedule-slot__tag-wrap {
    flex-shrink: 0;
  }

  .schedule-slot__tag {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
    padding: 0.55rem 0.9rem;
  }

  .schedule-list__empty {
    padding: 5rem 1rem;
    text-align: center;
    font-size: clamp(2rem, 6vw, 4rem);
    font-style: italic;
    font-weight: 900;
    letter-spacing: -0.06em;
    opacity: 0.16;
    text-transform: uppercase;
  }

  @media (max-width: 900px) {
    .schedule-view__alerts {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 700px) {
    .schedule-view__header {
      flex-direction: column;
      align-items: flex-start;
    }

    .schedule-view__status {
      white-space: normal;
    }

    .feature-card dl div {
      align-items: flex-start;
      flex-direction: column;
    }

    .feature-card dd {
      text-align: left;
    }

    .schedule-slot {
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .schedule-slot__tag-wrap {
      width: 100%;
      padding-left: calc(4.25rem + 1rem);
    }
  }

  @media (max-width: 540px) {
    .schedule-view {
      gap: 1.5rem;
    }

    .schedule-slot__index {
      width: 3.5rem;
    }

    .schedule-slot__content {
      gap: 0.75rem;
    }

    .slot-badge {
      width: 2.65rem;
      height: 2.65rem;
      border-radius: 0.9rem;
    }

    .schedule-slot__meta p {
      white-space: normal;
    }

    .schedule-slot__tag-wrap {
      padding-left: 0;
    }
  }
</style>
