export type SchedulePayload = {
  ok?: boolean;
  S?: Array<Array<{ s?: string; t?: string; k?: string } | null>>;
  EV?: Record<string, string[]>;
  SJ?: Record<string, string>;
};

export interface ScheduleStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

const SCHEDULE_KEY = 'schedule_data';

export async function readSchedule(store: ScheduleStore): Promise<SchedulePayload> {
  const raw = (await store.get(SCHEDULE_KEY)) || '{}';

  try {
    const parsed = JSON.parse(raw) as SchedulePayload;
    return {
      ok: true,
      S: Array.isArray(parsed.S) ? parsed.S : [],
      EV: parsed.EV && typeof parsed.EV === 'object' ? parsed.EV : {},
      SJ: parsed.SJ && typeof parsed.SJ === 'object' ? parsed.SJ : {}
    };
  } catch {
    return { ok: true, S: [], EV: {}, SJ: {} };
  }
}

export async function writeSchedule(store: ScheduleStore, payload: SchedulePayload): Promise<SchedulePayload> {
  const normalized = {
    ok: true,
    S: Array.isArray(payload?.S) ? payload.S : [],
    EV: payload?.EV && typeof payload.EV === 'object' ? payload.EV : {},
    SJ: payload?.SJ && typeof payload.SJ === 'object' ? payload.SJ : {}
  };

  await store.put(SCHEDULE_KEY, JSON.stringify(normalized));
  return normalized;
}
