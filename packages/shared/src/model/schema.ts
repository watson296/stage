// 불러온 JSON을 믿지 않고 검증·정제하는 유틸. 사용자 문자열은 길이를 제한하고,
// 화면에는 textContent로만 넣습니다(innerHTML 사용 금지). 좌표·크기는 범위로 자릅니다.

export const CAPS = {
  MAX_OBJECTS: 1000,
  MAX_POSTITS: 1000,
  MAX_CUSTOM_TYPES: 200,
  MAX_STR: 120,
  COORD_MIN: -500,
  COORD_MAX: 1000,
  STAGE_MIN: 1,
  STAGE_MAX: 500,
  DIM_MIN: 0.05,
  DIM_MAX: 100,
  MAX_ZONES: 200,
  MAX_ZONE_POINTS: 64,
  MAX_ARCS: 200,
  MAX_STAGE_POINTS: 200,
  BULGE_MAX: 200,
  ZONE_HEIGHT_MAX: 10,
  MAX_TIMETABLE_ITEMS: 500,
  MAX_CHANNELS: 512,
  MAX_LINEUP_ENTRIES: 64,
  MAX_INSTRUMENT_COUNT: 64,
} as const;

export class SchemaError extends Error {}

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// 파일 전체의 대략적인 형태만 먼저 본다. 말도 안 되는 입력은 여기서 막는다.
export function assertRawShape(raw: unknown): Record<string, unknown> {
  if (!isObject(raw)) throw new SchemaError("최상위가 객체가 아닙니다.");
  const objects = raw.objects;
  const postits = raw.postits;
  if (objects !== undefined && !Array.isArray(objects))
    throw new SchemaError("objects가 배열이 아닙니다.");
  if (postits !== undefined && !Array.isArray(postits))
    throw new SchemaError("postits가 배열이 아닙니다.");
  if (Array.isArray(objects) && objects.length > CAPS.MAX_OBJECTS)
    throw new SchemaError(`장비 개수가 너무 많습니다(최대 ${CAPS.MAX_OBJECTS}).`);
  if (Array.isArray(postits) && postits.length > CAPS.MAX_POSTITS)
    throw new SchemaError(`포스트잇 개수가 너무 많습니다(최대 ${CAPS.MAX_POSTITS}).`);
  if (raw.customTypes !== undefined && !isObject(raw.customTypes))
    throw new SchemaError("customTypes가 객체가 아닙니다.");
  return raw;
}

export function asNumber(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function clampNum(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = asNumber(v, fallback);
  return Math.max(lo, Math.min(hi, n));
}

export function asString(v: unknown, max: number = CAPS.MAX_STR): string {
  if (typeof v !== "string") return "";
  return v.length > max ? v.slice(0, max) : v;
}

const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
export function sanitizeColor(v: unknown, fallback = "#888888"): string {
  return typeof v === "string" && COLOR_RE.test(v) ? v : fallback;
}
