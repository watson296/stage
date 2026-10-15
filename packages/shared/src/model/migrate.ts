import {
  SCHEMA_VERSION,
  emptyEvent,
  rectStage,
  type Event,
  type StageObject,
  type Note,
  type StagePlan,
  type CustomEquipment,
} from "./types";
import { findVariant } from "./equipment";
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
  event: Event;
  warnings: string[];
}

// 버전 없는(구) JSON, v1, v2를 모두 받아 v2 Event로 바꿉니다(SPEC 5.1).
//  - v0/v1은 배치도 한 장짜리 Event로 감쌉니다.
//  - v0 포스트잇은 좌표가 화면 픽셀이라 복원할 수 없으므로, 연결된 장비 옆에
//    두고 연결이 없으면 무대 가장자리에 놓습니다.
export function migrate(raw: unknown): MigrateResult {
  const warnings: string[] = [];
  const root = assertRawShape(raw);
  const version = asNumber(root.version, 0);
  if (version >= SCHEMA_VERSION) return { event: migrateV2(root, warnings), warnings };
  return { event: migrateLegacy(root, version, warnings), warnings };
}

// ── v0 / v1 → v2 ────────────────────────────────────────────────────────────
function migrateLegacy(
  root: Record<string, unknown>,
  version: number,
  warnings: string[],
): Event {
  const ev = emptyEvent();
  const stageW = clampNum(
    isObject(root.stage) ? root.stage.w : undefined, CAPS.STAGE_MIN, CAPS.STAGE_MAX, 8);
  const stageD = clampNum(
    isObject(root.stage) ? root.stage.d : undefined, CAPS.STAGE_MIN, CAPS.STAGE_MAX, 6);

  const plan: StagePlan = {
    id: "plan-1",
    name: "기본 배치",
    stage: rectStage(stageW, stageD),
    zones: [],
    objects: [],
    notes: [],
    audienceDir: "front",
    rev: 1,
  };

  for (const ro of Array.isArray(root.objects) ? root.objects : []) {
    const o = legacyObject(ro);
    if (o) plan.objects.push(o);
  }

  let edgeSlot = 0;
  for (const rp of Array.isArray(root.postits) ? root.postits : []) {
    const n =
      version >= 1 ? legacyNoteV1(rp) : legacyNoteV0(rp, plan.objects, stageW, edgeSlot);
    if (n) {
      if (version < 1 && n.linkedObjectId == null) edgeSlot++;
      plan.notes.push(n);
    }
  }
  if (version < 1 && plan.notes.length > 0) {
    warnings.push(
      "옛 형식의 포스트잇 위치는 복원할 수 없어 장비 옆이나 무대 가장자리에 다시 놓았습니다.",
    );
  }

  ev.stagePlans = [plan];
  ev.customEquipment = legacyCustom(root.customTypes, warnings);
  ev.venue.widthM = Math.max(ev.venue.widthM, stageW);
  warnings.push("옛 형식을 새 형식(v2)으로 바꿔 열었습니다.");
  return ev;
}

function legacyObject(raw: unknown): StageObject | null {
  if (!isObject(raw)) return null;
  const type = asString(raw.type, CAPS.MAX_STR) || "custom";
  const w = clampNum(raw.w, CAPS.DIM_MIN, CAPS.DIM_MAX, 1);
  const d = clampNum(raw.d, CAPS.DIM_MIN, CAPS.DIM_MAX, 1);
  const variant = findVariant(type, w, d);
  return {
    id: idToString(raw.id, "obj"),
    type,
    variantId: variant?.id,
    x: clampNum(raw.x, CAPS.COORD_MIN, CAPS.COORD_MAX, 0),
    y: clampNum(raw.y, CAPS.COORD_MIN, CAPS.COORD_MAX, 0),
    w,
    d,
    h: clampNum(raw.h, CAPS.DIM_MIN, CAPS.DIM_MAX, 1),
    z: clampNum(raw.z, 0, CAPS.DIM_MAX, 0),
    rot: normalizeAngle(asNumber(raw.rot, 0)),
    label: asString(raw.label),
    color: sanitizeColor(raw.color),
    onStage: true,
  };
}

function legacyNoteV1(raw: unknown): Note | null {
  if (!isObject(raw)) return null;
  return {
    id: idToString(raw.id, "note"),
    x: clampNum(raw.x, CAPS.COORD_MIN, CAPS.COORD_MAX, 0),
    y: clampNum(raw.y, CAPS.COORD_MIN, CAPS.COORD_MAX, 0),
    text: asString(raw.nm) || "스태프",
    role: asString(raw.role),
    color: sanitizeColor(raw.color, "#f1c40f"),
    linkedObjectId: raw.con == null ? null : idToString(raw.con, "obj"),
  };
}

// 구버전: cx/cy(픽셀)는 버립니다.
function legacyNoteV0(
  raw: unknown,
  objects: StageObject[],
  stageW: number,
  edgeSlot: number,
): Note | null {
  if (!isObject(raw)) return null;
  const linkedId = raw.con == null ? null : idToString(raw.con, "obj");
  const linked = linkedId ? objects.find((o) => o.id === linkedId) : undefined;
  let x: number;
  let y: number;
  if (linked) {
    x = linked.x + linked.w + 0.3;
    y = linked.y;
  } else {
    const step = 0.4;
    const perRow = Math.max(1, Math.floor(stageW / step));
    x = (edgeSlot % perRow) * step + 0.1;
    y = -0.1 - Math.floor(edgeSlot / perRow) * step;
  }
  return {
    id: idToString(raw.id, "note"),
    x: clampNum(x, CAPS.COORD_MIN, CAPS.COORD_MAX, 0),
    y: clampNum(y, CAPS.COORD_MIN, CAPS.COORD_MAX, 0),
    text: asString(raw.nm) || "스태프",
    role: asString(raw.role),
    color: sanitizeColor(raw.color, "#f1c40f"),
    linkedObjectId: linkedId,
  };
}

function legacyCustom(raw: unknown, warnings: string[]): Record<string, CustomEquipment> {
  const out: Record<string, CustomEquipment> = {};
  if (!isObject(raw)) return out;
  let count = 0;
  for (const [key, val] of Object.entries(raw)) {
    if (count >= CAPS.MAX_CUSTOM_TYPES) {
      warnings.push("커스텀 장비가 너무 많아 일부를 생략했습니다.");
      break;
    }
    if (!isObject(val)) continue;
    out[String(key).slice(0, CAPS.MAX_STR)] = {
      name: asString(val.name) || "커스텀",
      w: clampNum(val.w, CAPS.DIM_MIN, CAPS.DIM_MAX, 1),
      d: clampNum(val.d, CAPS.DIM_MIN, CAPS.DIM_MAX, 0.5),
      h: clampNum(val.h, CAPS.DIM_MIN, CAPS.DIM_MAX, 1),
      color: sanitizeColor(val.color),
    };
    count++;
  }
  return out;
}

// ── v2 검증 ─────────────────────────────────────────────────────────────────
function migrateV2(root: Record<string, unknown>, warnings: string[]): Event {
  const base = emptyEvent();
  base.id = asString(root.id) || base.id;
  base.name = asString(root.name) || base.name;
  base.date = asString(root.date, 10) || base.date;

  if (isObject(root.venue)) {
    const v = root.venue;
    base.venue = {
      name: asString(v.name),
      widthM: clampNum(v.widthM, CAPS.STAGE_MIN, CAPS.STAGE_MAX, base.venue.widthM),
      depthM: clampNum(v.depthM, CAPS.STAGE_MIN, CAPS.STAGE_MAX, base.venue.depthM),
      ceilingM: clampNum(v.ceilingM, 1, 100, base.venue.ceilingM),
      indoor: v.indoor !== false,
      capacity: clampNum(v.capacity, 0, 1000000, base.venue.capacity),
      stageToBackM: clampNum(v.stageToBackM, 0, CAPS.STAGE_MAX, base.venue.stageToBackM),
      tempC: clampNum(v.tempC, -40, 60, 20),
      power: isObject(v.power)
        ? {
            circuits: clampNum(v.power.circuits, 0, 1000, 4),
            ampsPerCircuit: clampNum(v.power.ampsPerCircuit, 1, 200, 16),
            voltage: clampNum(v.power.voltage, 100, 400, 220),
          }
        : base.venue.power,
    };
  }

  const plans = Array.isArray(root.stagePlans) ? root.stagePlans : [];
  const migrated = plans
    .map((p, i) => v2Plan(p, i))
    .filter((p): p is StagePlan => p !== null);
  if (migrated.length) base.stagePlans = migrated;
  else warnings.push("배치도가 없어 빈 배치도를 하나 만들었습니다.");

  if (isObject(root.customEquipment)) {
    base.customEquipment = legacyCustom(root.customEquipment, warnings);
  }
  if (isObject(root.accessCodes)) {
    const a = root.accessCodes;
    base.accessCodes = {
      operator: asString(a.operator, 12),
      staff: asString(a.staff, 12),
      display: asString(a.display, 12),
      rotatedAt: asString(a.rotatedAt, 40),
    };
  }
  return base;
}

function v2Plan(raw: unknown, idx: number): StagePlan | null {
  if (!isObject(raw)) return null;
  const pts =
    isObject(raw.stage) && Array.isArray(raw.stage.points)
      ? raw.stage.points.filter(isObject).map((p) => ({
          x: clampNum(p.x, CAPS.COORD_MIN, CAPS.COORD_MAX, 0),
          y: clampNum(p.y, CAPS.COORD_MIN, CAPS.COORD_MAX, 0),
        }))
      : [];
  const dir = raw.audienceDir;
  return {
    id: asString(raw.id) || `plan-${idx + 1}`,
    name: asString(raw.name) || `배치 ${idx + 1}`,
    stage: pts.length >= 3 ? { points: pts } : rectStage(8, 6),
    zones: [],
    objects: (Array.isArray(raw.objects) ? raw.objects : [])
      .map(v2Object)
      .filter((o): o is StageObject => o !== null),
    notes: (Array.isArray(raw.notes) ? raw.notes : [])
      .map(noteV2)
      .filter((n): n is Note => n !== null),
    audienceDir: dir === "all" || typeof dir === "number" ? dir : "front",
    rev: Math.max(1, Math.trunc(asNumber(raw.rev, 1))),
  };
}

function v2Object(raw: unknown): StageObject | null {
  const o = legacyObject(raw);
  if (!o || !isObject(raw)) return o;
  o.onStage = raw.onStage !== false;
  const vid = asString(raw.variantId, 40);
  if (vid) o.variantId = vid;
  return o;
}

function noteV2(raw: unknown): Note | null {
  if (!isObject(raw)) return null;
  return {
    id: idToString(raw.id, "note"),
    x: clampNum(raw.x, CAPS.COORD_MIN, CAPS.COORD_MAX, 0),
    y: clampNum(raw.y, CAPS.COORD_MIN, CAPS.COORD_MAX, 0),
    text: asString(raw.text) || "스태프",
    role: asString(raw.role),
    color: sanitizeColor(raw.color, "#f1c40f"),
    linkedObjectId: raw.linkedObjectId == null ? null : idToString(raw.linkedObjectId, "obj"),
  };
}

// ── 유틸 ────────────────────────────────────────────────────────────────────
let counter = 0;
function idToString(v: unknown, prefix: string): string {
  if (typeof v === "string" && v.length) return v.slice(0, CAPS.MAX_STR);
  if (typeof v === "number" && Number.isFinite(v)) return `${prefix}-${Math.trunc(v)}`;
  return `${prefix}-${++counter}`;
}

function normalizeAngle(a: number): number {
  const r = a % 360;
  return r < 0 ? r + 360 : r;
}
