// 장비 정의. 규격(variants)은 docs/reference/blocks.patch의 OT.variants 값이고
// SPEC 6.2와 같습니다. 단위는 미터(가로 w × 깊이 d × 높이 h)이며
// 맨 앞 variant가 기본값입니다.
//
// 정면은 +y(화면 아래)입니다. 장비가 바라보는 방향입니다.
// draw는 그림 키입니다. 2단계에서 assets/equipment/<draw>.svg 와 이어집니다.

export type EquipCategory = "inst" | "audio" | "stage";

export type DrawKey =
  | "drums" | "amp" | "keys" | "mic" | "speaker" | "wedge"
  | "sub" | "mixer" | "riser" | "cable"
  | "dibox" | "gstand" | "person" | "power"
  | "custom";

export interface Variant {
  id: string;
  label: string;
  w: number;
  d: number;
  h: number;
}

export interface EquipmentType {
  name: string;
  cat: EquipCategory;
  draw: DrawKey;
  /** 기본 회전각(°). 모니터는 연주자를 향하므로 180입니다. */
  rot?: number;
  variants: Variant[];
}

/**
 * 장비 색은 종류마다 다르게 두지 않고 분류 셋으로만 구분합니다.
 * 무지개 색으로 장비를 구분하지 않는다는 디자인 규칙을 따릅니다(docs/design.md).
 */
export const CATEGORIES: Record<EquipCategory, { name: string; color: string }> = {
  inst: { name: "악기", color: "#d9b38c" },
  audio: { name: "음향", color: "#6fa3e8" },
  stage: { name: "무대", color: "#9aa8ba" },
};

/** 장비 키의 표시 색. 사용자가 추가한 장비는 자기 색을 씁니다. */
export function equipmentColor(type: string): string | null {
  const t = EQUIPMENT[type];
  return t ? CATEGORIES[t.cat].color : null;
}

/** 그림 키. 사용자가 추가한 장비는 기본 사각형(custom)입니다. */
export function equipmentDraw(type: string): DrawKey {
  return EQUIPMENT[type]?.draw ?? "custom";
}

export const EQUIPMENT: Record<string, EquipmentType> = {
  drumkit: {
    name: "드럼킷", cat: "inst", draw: "drums",
    variants: [
      { id: "5pc", label: "5기통", w: 1.8, d: 1.5, h: 1.2 },
      { id: "4pc", label: "4기통", w: 1.6, d: 1.4, h: 1.2 },
      { id: "2bd", label: "투베이스", w: 2.2, d: 1.6, h: 1.2 },
    ],
  },
  guitarAmp: {
    name: "기타 앰프", cat: "inst", draw: "amp",
    variants: [
      { id: "combo112", label: "콤보 1×12", w: 0.6, d: 0.27, h: 0.5 },
      { id: "combo212", label: "콤보 2×12", w: 0.7, d: 0.27, h: 0.55 },
      { id: "stack412", label: "스택 4×12", w: 0.76, d: 0.36, h: 1.3 },
    ],
  },
  bassAmp: {
    name: "베이스 앰프", cat: "inst", draw: "amp",
    variants: [
      { id: "cab410", label: "캐비닛 4×10", w: 0.62, d: 0.45, h: 0.75 },
      { id: "combo115", label: "콤보 1×15", w: 0.58, d: 0.42, h: 0.65 },
      { id: "cab810", label: "캐비닛 8×10", w: 0.62, d: 0.4, h: 1.25 },
    ],
  },
  keyboard: {
    name: "키보드", cat: "inst", draw: "keys",
    variants: [
      { id: "k88", label: "88건반", w: 1.35, d: 0.45, h: 0.9 },
      { id: "k61", label: "61건반", w: 1.0, d: 0.4, h: 0.9 },
      { id: "k2tier", label: "2단 스탠드", w: 1.35, d: 0.7, h: 1.1 },
    ],
  },
  vocalMic: {
    name: "보컬 마이크", cat: "inst", draw: "mic",
    variants: [
      { id: "boom", label: "붐 스탠드", w: 0.55, d: 0.55, h: 1.6 },
      { id: "round", label: "원형 받침", w: 0.3, d: 0.3, h: 1.6 },
    ],
  },
  mainSpeaker: {
    name: "메인 스피커", cat: "audio", draw: "speaker",
    variants: [
      { id: "s15", label: "15인치", w: 0.45, d: 0.42, h: 0.75 },
      { id: "s12", label: "12인치", w: 0.37, d: 0.35, h: 0.6 },
      { id: "line", label: "라인 어레이", w: 1.0, d: 0.5, h: 0.3 },
    ],
  },
  monitor: {
    name: "모니터", cat: "audio", draw: "wedge", rot: 180,
    variants: [
      { id: "w12", label: "12인치 웨지", w: 0.6, d: 0.4, h: 0.35 },
      { id: "w15", label: "15인치 웨지", w: 0.68, d: 0.45, h: 0.4 },
    ],
  },
  subwoofer: {
    name: "서브우퍼", cat: "audio", draw: "sub",
    variants: [
      { id: "s18", label: "18인치", w: 0.6, d: 0.7, h: 0.55 },
      { id: "d18", label: "2×18인치", w: 1.2, d: 0.75, h: 0.6 },
    ],
  },
  mixer: {
    name: "믹서", cat: "audio", draw: "mixer",
    variants: [
      { id: "console", label: "콘솔", w: 0.6, d: 0.5, h: 0.2 },
      { id: "foh", label: "FOH 테이블", w: 1.5, d: 0.8, h: 0.9 },
    ],
  },
  riser: {
    name: "라이저", cat: "stage", draw: "riser",
    variants: [
      { id: "2x2", label: "2×2m", w: 2.0, d: 2.0, h: 0.4 },
      { id: "24x2", label: "2.4×2m", w: 2.4, d: 2.0, h: 0.4 },
      { id: "1x2", label: "1×2m", w: 1.0, d: 2.0, h: 0.4 },
    ],
  },
  cableTray: {
    name: "케이블 커버", cat: "stage", draw: "cable",
    variants: [
      { id: "1m", label: "1m", w: 1.0, d: 0.15, h: 0.05 },
      { id: "2m", label: "2m", w: 2.0, d: 0.15, h: 0.05 },
    ],
  },

  // 아래 네 가지는 blocks.patch에 없어 규격이 제안값입니다(SPEC 6.2). 검토가 필요합니다.
  diBox: {
    name: "DI 박스", cat: "audio", draw: "dibox",
    variants: [
      { id: "passive", label: "패시브", w: 0.12, d: 0.08, h: 0.05 },
      { id: "active", label: "액티브(배터리)", w: 0.14, d: 0.09, h: 0.06 },
    ],
  },
  guitarStand: {
    name: "기타 스탠드", cat: "stage", draw: "gstand",
    variants: [
      { id: "a", label: "A자형", w: 0.3, d: 0.3, h: 1.0 },
      { id: "multi3", label: "멀티 스탠드(3단)", w: 0.5, d: 0.4, h: 1.0 },
    ],
  },
  person: {
    name: "사람", cat: "stage", draw: "person",
    // 규격은 하나입니다. 연주자·스태프 구분은 레이블로 적습니다.
    variants: [{ id: "std", label: "기본", w: 0.5, d: 0.5, h: 1.7 }],
  },
  powerBox: {
    name: "전원 박스", cat: "stage", draw: "power",
    variants: [
      { id: "small", label: "소형 분전반", w: 0.3, d: 0.2, h: 0.15 },
      { id: "distro", label: "대형 디스트로", w: 0.5, d: 0.35, h: 0.25 },
    ],
  },
};

export const PALETTE_GROUPS: { title: string; cat: EquipCategory; types: string[] }[] = [
  { title: "악기", cat: "inst", types: ["drumkit", "guitarAmp", "bassAmp", "keyboard", "vocalMic"] },
  { title: "음향", cat: "audio", types: ["mainSpeaker", "monitor", "subwoofer", "mixer", "diBox"] },
  { title: "무대", cat: "stage", types: ["riser", "cableTray", "guitarStand", "person", "powerBox"] },
];

export const NOTE_COLORS = [
  "#f1c40f", "#e74c3c", "#3498db", "#2ecc71",
  "#9b59b6", "#e67e22", "#1abc9c", "#bdc3c7",
];

export function defaultVariant(type: string): Variant | null {
  return EQUIPMENT[type]?.variants[0] ?? null;
}

/** 치수로 variant를 되찾습니다(옛 파일을 열 때 씁니다). */
export function findVariant(type: string, w: number, d: number): Variant | null {
  const t = EQUIPMENT[type];
  if (!t) return null;
  return (
    t.variants.find((v) => Math.abs(v.w - w) < 0.005 && Math.abs(v.d - d) < 0.005) ?? null
  );
}
