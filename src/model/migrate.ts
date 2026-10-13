import {
  SCHEMA_VERSION,
  type Doc,
  type StageObject,
  type Postit,
  type CustomTypes,
  type EquipmentType,
} from "./types";
import {
  CAPS,
  asNumber,
  asString,
  clampNum,
  sanitizeColor,
  isObject,
  assertRawShape,
} from "./schema";

export interface MigrateResult {
  doc: Doc;
  warnings: string[];
}

// 버전 없는(구) JSON과 v1 JSON을 모두 받아 v1 Doc으로 변환합니다.
// - 구버전 포스트잇은 좌표가 화면 픽셀이라 복원할 수 없으므로,
//   연결된 장비 옆에 두고 연결이 없으면 무대 가장자리에 배치합니다.
// - 사용자 문자열은 길이를 제한하고, 좌표·크기는 범위로 자릅니다.
export function migrate(raw: unknown): MigrateResult {
  const warnings: string[] = [];
  const root = assertRawShape(raw);
  const version = asNumber(root.version, 0);

  const stage = {
    w: clampNum(isObject(root.stage) ? root.stage.w : undefined, CAPS.STAGE_MIN, CAPS.STAGE_MAX, 8),
    d: clampNum(isObject(root.stage) ? root.stage.d : undefined, CAPS.STAGE_MIN, CAPS.STAGE_MAX, 6),
    h: clampNum(isObject(root.stage) ? root.stage.h : undefined, CAPS.STAGE_MIN, CAPS.STAGE_MAX, 4),
  };

  const customTypes = migrateCustomTypes(root.customTypes, warnings);

  const rawObjects = Array.isArray(root.objects) ? root.objects : [];
  const objects: StageObject[] = [];
  for (const ro of rawObjects) {
    const o = migrateObject(ro);
    if (o) objects.push(o);
  }

  const rawPostits = Array.isArray(root.postits) ? root.postits : [];
  const postits: Postit[] = [];
  let edgeSlot = 0;
  for (const rp of rawPostits) {
    const p =
      version >= 1
        ? migratePostitV1(rp)
        : migratePostitV0(rp, objects, stage, edgeSlot);
    if (p) {
      if (version < 1 && p.con == null) edgeSlot++;
      postits.push(p);
    }
  }
  if (version < 1 && postits.length > 0) {
    warnings.push(
      "옛 형식의 포스트잇 위치는 복원할 수 없어 장비 옆이나 무대 가장자리에 다시 놓았습니다.",
    );
  }

  const maxId = Math.max(
    0,
    ...objects.map((o) => o.id),
    ...postits.map((p) => p.id),
  );

  return {
    doc: {
      version: SCHEMA_VERSION,
      stage,
      objects,
      postits,
      customTypes,
      nextId: maxId + 1,
    },
    warnings,
  };
}

function migrateCustomTypes(raw: unknown, warnings: string[]): CustomTypes {
  const out: CustomTypes = {};
  if (!isObject(raw)) return out;
  let count = 0;
  for (const [key, val] of Object.entries(raw)) {
    if (count >= CAPS.MAX_CUSTOM_TYPES) {
      warnings.push("커스텀 장비가 너무 많아 일부를 생략했습니다.");
      break;
    }
    if (!isObject(val)) continue;
    const t: EquipmentType = {
      name: asString(val.name) || "커스텀",
      w: clampNum(val.w, CAPS.DIM_MIN, CAPS.DIM_MAX, 1),
      d: clampNum(val.d, CAPS.DIM_MIN, CAPS.DIM_MAX, 0.5),
      h: clampNum(val.h, CAPS.DIM_MIN, CAPS.DIM_MAX, 1),
      color: sanitizeColor(val.color),
      emoji: asString(val.emoji ?? (val as Record<string, unknown>).e, 8) || "📦",
    };
    out[String(key).slice(0, CAPS.MAX_STR)] = t;
    count++;
  }
  return out;
}

function migrateObject(raw: unknown): StageObject | null {
  if (!isObject(raw)) return null;
  const w = clampNum(raw.w, CAPS.DIM_MIN, CAPS.DIM_MAX, 1);
  const d = clampNum(raw.d, CAPS.DIM_MIN, CAPS.DIM_MAX, 1);
  return {
    id: Math.trunc(asNumber(raw.id, 0)) || randomId(),
    type: asString(raw.type, CAPS.MAX_STR) || "custom",
    name: asString(raw.name) || "장비",
    x: clampNum(raw.x, CAPS.COORD_MIN, CAPS.COORD_MAX, 0),
    y: clampNum(raw.y, CAPS.COORD_MIN, CAPS.COORD_MAX, 0),
    z: clampNum(raw.z, 0, CAPS.DIM_MAX, 0),
    w,
    d,
    h: clampNum(raw.h, CAPS.DIM_MIN, CAPS.DIM_MAX, 1),
    rot: normalizeAngle(asNumber(raw.rot, 0)),
    color: sanitizeColor(raw.color),
    emoji: asString(raw.emoji ?? (raw as Record<string, unknown>).e, 8),
    label: asString(raw.label),
  };
}

function migratePostitV1(raw: unknown): Postit | null {
  if (!isObject(raw)) return null;
  return {
    id: Math.trunc(asNumber(raw.id, 0)) || randomId(),
    x: clampNum(raw.x, CAPS.COORD_MIN, CAPS.COORD_MAX, 0),
    y: clampNum(raw.y, CAPS.COORD_MIN, CAPS.COORD_MAX, 0),
    nm: asString(raw.nm) || "스태프",
    role: asString(raw.role),
    color: sanitizeColor(raw.color, "#f1c40f"),
    con: raw.con == null ? null : Math.trunc(asNumber(raw.con, 0)) || null,
  };
}

// 구버전: cx/cy(픽셀)는 버린다. 연결된 장비 옆, 없으면 무대 가장자리.
function migratePostitV0(
  raw: unknown,
  objects: StageObject[],
  stage: { w: number; d: number },
  edgeSlot: number,
): Postit | null {
  if (!isObject(raw)) return null;
  const con = raw.con == null ? null : Math.trunc(asNumber(raw.con, 0)) || null;
  let x: number;
  let y: number;
  const linked = con != null ? objects.find((o) => o.id === con) : undefined;
  if (linked) {
    x = linked.x + linked.w + 0.3;
    y = linked.y;
  } else {
    // 무대 위쪽 가장자리를 따라 0.4m 간격으로 차곡차곡 배치
    const step = 0.4;
    const perRow = Math.max(1, Math.floor(stage.w / step));
    x = (edgeSlot % perRow) * step + 0.1;
    y = -0.1 - Math.floor(edgeSlot / perRow) * step; // 무대 바로 위
  }
  return {
    id: Math.trunc(asNumber(raw.id, 0)) || randomId(),
    x: clampNum(x, CAPS.COORD_MIN, CAPS.COORD_MAX, 0),
    y: clampNum(y, CAPS.COORD_MIN, CAPS.COORD_MAX, 0),
    nm: asString(raw.nm) || "스태프",
    role: asString(raw.role),
    color: sanitizeColor(raw.color, "#f1c40f"),
    con,
  };
}

function normalizeAngle(a: number): number {
  const r = a % 360;
  return r < 0 ? r + 360 : r;
}

let idCounter = 1;
function randomId(): number {
  return 1_000_000 + idCounter++;
}
