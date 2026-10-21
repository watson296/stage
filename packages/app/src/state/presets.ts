// 스피커 제원 프리셋. Event가 아니라 기기에 남습니다(SPEC 8.1).
// 공연 파일을 다른 기기에서 열어도 조언이 달라지지 않도록, 고른 제원은
// Event의 PaSetup에 복사해 둡니다.

import { DEFAULT_SPEAKER, type SpeakerPreset, type SpeakerSpec } from "@stage-planner/shared";

const KEY = "stage-planner.speakerPresets.v1";
const MAX_PRESETS = 50;

function clampNum(v: unknown, lo: number, hi: number, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
}

function sanitize(raw: unknown): SpeakerPreset | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.slice(0, 60) : "";
  if (!name) return null;
  return {
    id: typeof r.id === "string" ? r.id.slice(0, 40) : String(Date.now()),
    name,
    sensitivityDb: clampNum(r.sensitivityDb, 60, 130, DEFAULT_SPEAKER.sensitivityDb),
    maxSplDb: clampNum(r.maxSplDb, 60, 160, DEFAULT_SPEAKER.maxSplDb),
    dispersionH: clampNum(r.dispersionH, 1, 360, DEFAULT_SPEAKER.dispersionH),
    dispersionV: clampNum(r.dispersionV, 1, 360, DEFAULT_SPEAKER.dispersionV),
    powerW: clampNum(r.powerW, 1, 100000, DEFAULT_SPEAKER.powerW),
  };
}

/** 저장소를 못 읽어도 화면은 떠야 하므로 빈 목록으로 돌려줍니다. */
export function loadPresets(): SpeakerPreset[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.map(sanitize).filter((p): p is SpeakerPreset => p !== null);
  } catch {
    return [];
  }
}

export function savePresets(list: SpeakerPreset[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_PRESETS)));
    return true;
  } catch {
    return false;
  }
}

export function addPreset(name: string, spec: SpeakerSpec): SpeakerPreset[] {
  const list = loadPresets();
  const preset: SpeakerPreset = { id: `sp-${Date.now().toString(36)}`, name, ...spec };
  // 같은 이름이 있으면 덮어씁니다. 같은 스피커를 여러 번 저장하지 않게 합니다.
  const i = list.findIndex((p) => p.name === name);
  if (i >= 0) list[i] = { ...preset, id: list[i].id };
  else list.push(preset);
  savePresets(list);
  return list;
}

export function removePreset(id: string): SpeakerPreset[] {
  const list = loadPresets().filter((p) => p.id !== id);
  savePresets(list);
  return list;
}

export function presetSpec(p: SpeakerPreset): SpeakerSpec {
  return {
    sensitivityDb: p.sensitivityDb,
    maxSplDb: p.maxSplDb,
    dispersionH: p.dispersionH,
    dispersionV: p.dispersionV,
    powerW: p.powerW,
  };
}
