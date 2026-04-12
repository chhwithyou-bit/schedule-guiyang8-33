export type SchedulePayload = {
  ok?: boolean;
  S?: Array<Array<{ s?: string; t?: string; k?: string } | null>> | null;
  EV?: Record<string, string[]>;
  SJ?: Record<string, string>;
};

export interface ScheduleStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

const SCHEDULE_KEY = 'schedule_data';
const EMPTY_SCHEDULE_JSON = '{"S":null}';

export async function readScheduleRaw(store?: Pick<ScheduleStore, 'get'> | null): Promise<string> {
  return (await store?.get(SCHEDULE_KEY)) || EMPTY_SCHEDULE_JSON;
}

export async function readSchedule(store?: Pick<ScheduleStore, 'get'> | null): Promise<SchedulePayload> {
  const raw = await readScheduleRaw(store);

  try {
    return JSON.parse(raw) as SchedulePayload;
  } catch {
    return { S: null };
  }
}

export async function writeScheduleRaw(store: Pick<ScheduleStore, 'put'>, raw: string): Promise<void> {
  await store.put(SCHEDULE_KEY, raw);
}
