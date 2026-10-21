// 시각 계산. 하루 안에서만 다루고 자정을 넘는 공연은 분이 1440을 넘는 값으로
// 이어서 셉니다(표시할 때 "다음 날"로 알려 줍니다).

export const MIN_PER_DAY = 24 * 60;

/** "HH:MM" → 자정부터의 분. 형식이 아니면 null입니다. */
export function parseHHMM(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** 분 → "HH:MM". 하루를 넘으면 넘긴 만큼 접어서 보여 줍니다. */
export function formatHHMM(minutes: number): string {
  const m = ((Math.round(minutes) % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** 하루를 넘긴 시각인지. 표에 "다음 날"을 붙일 때 씁니다. */
export function isNextDay(minutes: number): boolean {
  return minutes >= MIN_PER_DAY;
}

/** 길이(분)를 사람이 읽는 말로. 60분 이상은 시간과 분으로 나눕니다. */
export function formatDuration(minutes: number): string {
  const sign = minutes < 0 ? "-" : "";
  const m = Math.abs(Math.round(minutes));
  if (m < 60) return `${sign}${m}분`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${sign}${h}시간` : `${sign}${h}시간 ${rest}분`;
}

/** ISO 시각 → 그날 자정부터의 분. 기기의 현지 시각으로 읽습니다. */
export function isoToMinOfDay(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
}

export function dateToMinOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}
