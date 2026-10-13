// 모든 좌표와 크기는 미터 단위의 월드 좌표입니다.
// 장비(StageObject)의 x, y는 회전하지 않은 사각형의 왼쪽 위 모서리이고,
// 회전(rot)은 사각형 중심을 기준으로 합니다.
// 포스트잇(Postit)의 x, y는 중심점입니다.

export const SCHEMA_VERSION = 1 as const;

export interface Vec2 {
  x: number;
  y: number;
}

export interface Stage {
  w: number; // 가로 (m)
  d: number; // 세로 (m)
  h: number; // 높이 (m) — 데이터로만 유지, 평면도에는 그리지 않음
}

export interface EquipmentType {
  name: string;
  w: number; // m
  d: number; // m
  h: number; // m — 데이터로만 유지
  color: string;
  emoji: string;
}

export interface StageObject {
  id: number;
  type: string; // 장비 종류 키 (기본 또는 커스텀)
  name: string;
  x: number; // 왼쪽 위 모서리 (m)
  y: number;
  z: number; // 바닥에서 띄운 높이 (m) — 데이터로만 유지
  w: number; // m
  d: number; // m
  h: number; // m — 데이터로만 유지
  rot: number; // 각도(°), 중심 기준
  color: string;
  emoji: string;
  label: string;
}

export interface Postit {
  id: number;
  x: number; // 중심 (m)
  y: number;
  nm: string;
  role: string;
  color: string;
  con: number | null; // 연결된 장비 id
}

export type CustomTypes = Record<string, EquipmentType>;

export interface Design {
  version: typeof SCHEMA_VERSION;
  stage: Stage;
  objects: StageObject[];
  postits: Postit[];
  customTypes: CustomTypes;
}

// 저장·불러오기·되돌리기에 쓰는 문서 전체 상태(선택·카메라 같은 UI 상태는 제외)
export interface Doc extends Design {
  nextId: number;
}

export const DEFAULT_STAGE: Stage = { w: 8, d: 6, h: 4 };

export function emptyDoc(): Doc {
  return {
    version: SCHEMA_VERSION,
    stage: { ...DEFAULT_STAGE },
    objects: [],
    postits: [],
    customTypes: {},
    nextId: 1,
  };
}

export function cloneDoc(d: Doc): Doc {
  return {
    version: SCHEMA_VERSION,
    stage: { ...d.stage },
    objects: d.objects.map((o) => ({ ...o })),
    postits: d.postits.map((p) => ({ ...p })),
    customTypes: Object.fromEntries(
      Object.entries(d.customTypes).map(([k, v]) => [k, { ...v }]),
    ),
    nextId: d.nextId,
  };
}
