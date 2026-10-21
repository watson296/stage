import {
  SCHEMA_VERSION,
  emptyEvent,
  rectStage,
  type Event,
  type StageObject,
  type Note,
  type StagePlan,
  type CustomEquipment,
  type StageShape,
  type ArcSegment,
  type Vec2,
  type Zone,
  type Timetable,
  type TimetableItem,
  type Notice as NoticeEntry,
  type Role,
  isZoneKind,
  zoneNeedsHeight,
  clonePa,
  DEFAULT_PA,
  type PaSetup,
} from "./types";
import { isGenre, instrumentInfo, type LineupEntry } from "../audio/lineup";
import { isTimetableKind, MAX_DURATION_MIN } from "../schedule/timetable";
import { parseHHMM } from "../schedule/time";
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
    .map((p, i) => v2Plan(p, i, warnings))
    .filter((p): p is StagePlan => p !== null);
  if (migrated.length) base.stagePlans = migrated;
  else warnings.push("배치도가 없어 빈 배치도를 하나 만들었습니다.");

  base.pa = v2Pa(root.pa, warnings);
  base.timetable = v2Timetable(root.timetable, warnings);
  base.notices = v2Notices(root.notices);

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

/**
 * PA 조언 입력. 모르는 장르나 악기는 버립니다. 자동 저장도 이 함수를 거치므로
 * 여기서 흘리면 새로고침 한 번에 편성이 사라집니다.
 */
function v2Pa(raw: unknown, warnings: string[]): PaSetup {
  const pa = clonePa(DEFAULT_PA);
  if (!isObject(raw)) return pa;

  if (isGenre(raw.genre)) pa.genre = raw.genre;
  else if (raw.genre !== undefined) warnings.push("모르는 장르라서 기본값으로 두었습니다.");

  pa.speakerName = asString(raw.speakerName);
  pa.mixerChannels = Math.trunc(clampNum(raw.mixerChannels, 0, CAPS.MAX_CHANNELS, 16));

  if (isObject(raw.speaker)) {
    const s = raw.speaker;
    pa.speaker = {
      sensitivityDb: clampNum(s.sensitivityDb, 60, 130, pa.speaker.sensitivityDb),
      maxSplDb: clampNum(s.maxSplDb, 60, 160, pa.speaker.maxSplDb),
      dispersionH: clampNum(s.dispersionH, 1, 360, pa.speaker.dispersionH),
      dispersionV: clampNum(s.dispersionV, 1, 360, pa.speaker.dispersionV),
      powerW: clampNum(s.powerW, 1, 100000, pa.speaker.powerW),
    };
  }

  if (isObject(raw.lineup)) {
    const l = raw.lineup;
    const entries: LineupEntry[] = [];
    let dropped = 0;
    for (const re of Array.isArray(l.entries) ? l.entries : []) {
      if (entries.length >= CAPS.MAX_LINEUP_ENTRIES) break;
      if (!isObject(re) || !instrumentInfo(asString(re.instrumentId, 40))) {
        dropped++;
        continue;
      }
      entries.push({
        instrumentId: asString(re.instrumentId, 40),
        count: Math.trunc(clampNum(re.count, 0, CAPS.MAX_INSTRUMENT_COUNT, 1)),
      });
    }
    if (dropped) warnings.push(`모르는 악기 ${dropped}개를 편성에서 뺐습니다.`);
    pa.lineup = {
      vocals: Math.trunc(clampNum(l.vocals, 0, CAPS.MAX_INSTRUMENT_COUNT, 0)),
      entries,
    };
  }

  return pa;
}

/**
 * 공지. 호스트가 만들고 확인 기록(ackBy)도 호스트가 가집니다.
 * 여기서 흘리면 호스트가 자기 공지를 스스로 지웁니다.
 */
function v2Notices(raw: unknown): NoticeEntry[] {
  const out: NoticeEntry[] = [];
  for (const rn of Array.isArray(raw) ? raw : []) {
    if (out.length >= CAPS.MAX_NOTICES) break;
    if (!isObject(rn)) continue;
    const targets = (Array.isArray(rn.targets) ? rn.targets : [])
      .filter((t): t is Role => t === "operator" || t === "staff" || t === "display");
    out.push({
      id: asString(rn.id, 40) || `notice-${out.length + 1}`,
      level: rn.level === "urgent" ? "urgent" : "normal",
      text: asString(rn.text, CAPS.MAX_STR * 4),
      targets: targets.length ? targets : ["operator", "staff", "display"],
      createdAt: asString(rn.createdAt, 40),
      ackBy: (Array.isArray(rn.ackBy) ? rn.ackBy : [])
        .filter((v): v is string => typeof v === "string")
        .slice(0, CAPS.MAX_ACKS)
        .map((v) => v.slice(0, 40)),
      rev: Math.max(1, Math.trunc(asNumber(rn.rev, 1))),
    });
  }
  return out;
}

/** 하루 순서. 자동 저장도 이 함수를 거치므로 여기서 흘리면 순서가 사라집니다. */
function v2Timetable(raw: unknown, warnings: string[]): Timetable {
  const out: Timetable = { dayStart: "09:00", items: [] };
  if (!isObject(raw)) return out;

  const ds = asString(raw.dayStart, 5);
  out.dayStart = parseHHMM(ds) == null ? out.dayStart : ds;

  let dropped = 0;
  for (const ri of Array.isArray(raw.items) ? raw.items : []) {
    if (out.items.length >= CAPS.MAX_TIMETABLE_ITEMS) break;
    const it = v2TimetableItem(ri, out.items.length);
    if (it) out.items.push(it);
    else dropped++;
  }
  if (dropped) warnings.push(`읽을 수 없는 순서 ${dropped}개를 뺐습니다.`);
  return out;
}

function v2TimetableItem(raw: unknown, idx: number): TimetableItem | null {
  if (!isObject(raw)) return null;
  const kind = isTimetableKind(raw.kind) ? raw.kind : "other";
  const planned = asString(raw.plannedStart, 5);
  const status = raw.status;
  const actualStart = asString(raw.actualStart, 40) || null;
  const actualEnd = asString(raw.actualEnd, 40) || null;
  return {
    id: asString(raw.id, 40) || `item-${idx + 1}`,
    kind,
    title: asString(raw.title),
    plannedStart: parseHHMM(planned) == null ? "00:00" : planned,
    durationMin: Math.round(clampNum(raw.durationMin, 0, MAX_DURATION_MIN, 30)),
    owner: asString(raw.owner),
    memo: asString(raw.memo, CAPS.MAX_STR * 4),
    stagePlanId: asString(raw.stagePlanId, 40) || null,
    actualStart,
    actualEnd,
    // 시작 기록이 없는데 진행 중이라고 적힌 파일은 믿지 않습니다.
    status:
      (status === "running" && actualStart) || (status === "done" && actualStart)
        ? status
        : "pending",
    rev: Math.max(1, Math.trunc(asNumber(raw.rev, 1))),
  };
}

function v2Plan(raw: unknown, idx: number, warnings: string[]): StagePlan | null {
  if (!isObject(raw)) return null;
  const dir = raw.audienceDir;
  return {
    id: asString(raw.id) || `plan-${idx + 1}`,
    name: asString(raw.name) || `배치 ${idx + 1}`,
    stage: v2Stage(raw.stage, warnings),
    zones: v2Zones(raw.zones, warnings),
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

function v2Point(raw: Record<string, unknown>): Vec2 {
  return {
    x: clampNum(raw.x, CAPS.COORD_MIN, CAPS.COORD_MAX, 0),
    y: clampNum(raw.y, CAPS.COORD_MIN, CAPS.COORD_MAX, 0),
  };
}

/**
 * 무대 모양을 그대로 살려 둡니다. 꼭짓점이 모자라면 기본 사각 무대로 되돌리고,
 * 원호는 꼭짓점 번호가 실제로 가리킬 수 있는 것만 남깁니다.
 */
function v2Stage(raw: unknown, warnings: string[]): StageShape {
  if (!isObject(raw) || !Array.isArray(raw.points)) return rectStage(8, 6);
  const points = raw.points
    .filter(isObject)
    .slice(0, CAPS.MAX_STAGE_POINTS)
    .map(v2Point);
  if (points.length < 3) {
    warnings.push("무대 꼭짓점이 세 개가 안 되어 기본 사각 무대로 되돌렸습니다.");
    return rectStage(8, 6);
  }
  const arcs = v2Arcs(raw.arcs, points.length, warnings);
  return arcs.length ? { points, arcs } : { points };
}

/**
 * 원호는 꼭짓점 i에서 i+1로 가는 변에만 붙습니다. 그 규칙에서 벗어난 항목과
 * 같은 변에 겹쳐 들어온 항목은 버립니다.
 */
function v2Arcs(raw: unknown, n: number, warnings: string[]): ArcSegment[] {
  if (!Array.isArray(raw)) return [];
  const out: ArcSegment[] = [];
  const seen = new Set<number>();
  let dropped = 0;
  for (const item of raw.slice(0, CAPS.MAX_ARCS)) {
    if (!isObject(item)) {
      dropped++;
      continue;
    }
    const from = asNumber(item.fromIdx, -1);
    const to = asNumber(item.toIdx, -1);
    const bulgeM = clampNum(item.bulgeM, -CAPS.BULGE_MAX, CAPS.BULGE_MAX, 0);
    const ok =
      Number.isInteger(from) &&
      Number.isInteger(to) &&
      from >= 0 &&
      from < n &&
      to === (from + 1) % n &&
      bulgeM !== 0 &&
      !seen.has(from);
    if (!ok) {
      dropped++;
      continue;
    }
    seen.add(from);
    out.push({ fromIdx: from, toIdx: to, bulgeM });
  }
  if (dropped) warnings.push(`무대 원호 ${dropped}개를 읽을 수 없어 직선으로 두었습니다.`);
  return out;
}

function v2Zones(raw: unknown, warnings: string[]): Zone[] {
  if (!Array.isArray(raw)) return [];
  const out: Zone[] = [];
  let dropped = 0;
  for (const item of raw.slice(0, CAPS.MAX_ZONES)) {
    if (!isObject(item) || !isZoneKind(item.kind) || !Array.isArray(item.polygon)) {
      dropped++;
      continue;
    }
    const polygon = item.polygon
      .filter(isObject)
      .slice(0, CAPS.MAX_ZONE_POINTS)
      .map(v2Point);
    if (polygon.length < 3) {
      dropped++;
      continue;
    }
    const zone: Zone = {
      id: idToString(item.id, "zone"),
      kind: item.kind,
      name: asString(item.name),
      polygon,
    };
    // 높이는 라이저와 단차만 가집니다. 다른 종류에 붙어 온 값은 버립니다.
    if (zoneNeedsHeight(item.kind)) {
      zone.heightM = clampNum(item.heightM, 0, CAPS.ZONE_HEIGHT_MAX, 0.4);
    }
    out.push(zone);
  }
  if (dropped) warnings.push(`구역 ${dropped}개를 읽을 수 없어 빼고 불러왔습니다.`);
  return out;
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

/**
 * 이미 v2인 Event를 다시 한 번 정제합니다. 호스트가 받은 내용을 그대로 믿지 않고
 * 거르는 데 씁니다. 모르는 칸은 버리고 범위를 벗어난 값은 자릅니다.
 */
export function sanitizeEvent(raw: unknown): MigrateResult {
  return migrate(raw);
}
