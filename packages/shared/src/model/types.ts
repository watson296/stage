// 공연 하루(Event)를 담는 v2 데이터 모델입니다. SPEC 5장을 따릅니다.
// 모든 좌표와 크기는 미터이고, 각도는 도(°)이며 시계 방향입니다.

import { DEFAULT_SPEAKER, type SpeakerSpec } from "../audio/speaker";
import type { Genre, Lineup } from "../audio/lineup";

export const SCHEMA_VERSION = 2 as const;

export interface Vec2 {
  x: number;
  y: number;
}

/** 역할별 접속 코드. 공연마다 하나씩 두고 호스트를 껐다 켜도 유지합니다. */
export interface AccessCodes {
  operator: string;
  staff: string;
  display: string;
  rotatedAt: string;
}

export interface Venue {
  name: string;
  widthM: number;
  depthM: number;
  ceilingM: number;
  indoor: boolean;
  capacity: number;
  stageToBackM: number;
  tempC: number;
  power: {
    circuits: number;
    ampsPerCircuit: number;
    voltage: number;
  };
}

/** 무대는 다각형입니다. 일부 변은 원호로 둘 수 있습니다(2단계에서 편집 UI 추가). */
export interface StageShape {
  points: Vec2[];
  arcs?: ArcSegment[];
}

export interface ArcSegment {
  fromIdx: number;
  toIdx: number;
  bulgeM: number;
}

/** 구역 종류. riser·level은 무대 위 높이 구역, 나머지는 무대 밖 동선입니다. */
export const ZONE_KIND_IDS = [
  "riser",
  "level",
  "audience",
  "foh",
  "exit",
  "backstage",
] as const;

export type ZoneKind = (typeof ZONE_KIND_IDS)[number];

export function isZoneKind(v: unknown): v is ZoneKind {
  return typeof v === "string" && (ZONE_KIND_IDS as readonly string[]).includes(v);
}

/** 높이(m)를 입력받는 구역인지. 라이저와 단차만 받습니다. */
export function zoneNeedsHeight(kind: ZoneKind): boolean {
  return kind === "riser" || kind === "level";
}

export interface Zone {
  id: string;
  kind: ZoneKind;
  name: string;
  polygon: Vec2[];
  heightM?: number;
}

export interface StageObject {
  id: string;
  type: string;
  variantId?: string;
  x: number; // 회전하지 않은 사각형의 왼쪽 위 모서리
  y: number;
  w: number;
  d: number;
  h: number;
  z: number;
  rot: number; // 중심 기준
  label: string;
  color?: string;
  onStage: boolean;
  locked?: boolean;
}

/** 기존 포스트잇. 좌표는 중심이며 미터입니다. */
export interface Note {
  id: string;
  x: number;
  y: number;
  text: string;
  role: string;
  color: string;
  linkedObjectId: string | null;
}

export type AudienceDir = "front" | "all" | number;

export interface StagePlan {
  id: string;
  name: string;
  stage: StageShape;
  zones: Zone[];
  objects: StageObject[];
  notes: Note[];
  audienceDir: AudienceDir;
  rev: number;
}

export type TimetableKind =
  | "rehearsal"
  | "soundcheck"
  | "show"
  | "changeover"
  | "break"
  | "other";

export interface TimetableItem {
  id: string;
  kind: TimetableKind;
  title: string;
  plannedStart: string; // HH:MM
  durationMin: number;
  owner: string;
  memo: string;
  stagePlanId: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  status: "pending" | "running" | "done";
  rev: number;
}

export interface Timetable {
  dayStart: string; // HH:MM
  items: TimetableItem[];
}

export type Role = "operator" | "staff" | "display";

export interface Notice {
  id: string;
  level: "normal" | "urgent";
  text: string;
  targets: Role[];
  createdAt: string;
  ackBy: string[];
  rev: number;
}

export interface Device {
  id: string;
  role: Role;
  name: string;
  connectedAt: string;
  lastSeen: string;
  status: "online" | "stale" | "offline";
}

/** 사용자가 직접 추가한 장비. 그림은 기본 사각형(custom)을 씁니다. */
export interface CustomEquipment {
  name: string;
  w: number;
  d: number;
  h: number;
  color: string;
}

export interface Event {
  version: typeof SCHEMA_VERSION;
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  venue: Venue;
  pa: PaSetup;
  stagePlans: StagePlan[];
  timetable: Timetable;
  notices: Notice[];
  devices: Device[];
  customEquipment: Record<string, CustomEquipment>;
  accessCodes: AccessCodes;
}

/**
 * PA 조언의 입력. 공연마다 달라지므로 Event에 함께 저장합니다.
 * 스피커 제원은 프리셋에서 고른 값을 **복사해** 둡니다. 프리셋은 기기에만
 * 남으므로, 복사해 두지 않으면 다른 기기에서 연 파일의 조언이 달라집니다.
 */
export interface PaSetup {
  genre: Genre;
  lineup: Lineup;
  speakerName: string;
  speaker: SpeakerSpec;
  mixerChannels: number;
}

export const DEFAULT_PA: PaSetup = {
  genre: "band",
  lineup: { vocals: 1, entries: [] },
  speakerName: "",
  speaker: { ...DEFAULT_SPEAKER },
  mixerChannels: 16,
};

export function clonePa(p: PaSetup): PaSetup {
  return {
    ...p,
    speaker: { ...p.speaker },
    lineup: { vocals: p.lineup.vocals, entries: p.lineup.entries.map((e) => ({ ...e })) },
  };
}

/** 스피커 제원 프리셋. Event가 아니라 기기에 로컬로 저장합니다. */
export interface SpeakerPreset {
  id: string;
  name: string;
  sensitivityDb: number;
  maxSplDb: number;
  dispersionH: number;
  dispersionV: number;
  powerW: number;
}

export const DEFAULT_VENUE: Venue = {
  name: "",
  widthM: 12,
  depthM: 16,
  ceilingM: 5,
  indoor: true,
  capacity: 200,
  stageToBackM: 14,
  tempC: 20,
  power: { circuits: 4, ampsPerCircuit: 16, voltage: 220 },
};

/** 가로 w, 세로 d인 사각형 무대 폴리곤을 만듭니다. */
export function rectStage(w: number, d: number): StageShape {
  return {
    points: [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: d },
      { x: 0, y: d },
    ],
  };
}

export function emptyStagePlan(id = "plan-1", name = "기본 배치"): StagePlan {
  return {
    id,
    name,
    stage: rectStage(8, 6),
    zones: [],
    objects: [],
    notes: [],
    audienceDir: "front",
    rev: 1,
  };
}

export function emptyEvent(): Event {
  return {
    version: SCHEMA_VERSION,
    id: "event-1",
    name: "새 공연",
    date: new Date().toISOString().slice(0, 10),
    venue: { ...DEFAULT_VENUE, power: { ...DEFAULT_VENUE.power } },
    pa: clonePa(DEFAULT_PA),
    stagePlans: [emptyStagePlan()],
    timetable: { dayStart: "09:00", items: [] },
    notices: [],
    devices: [],
    customEquipment: {},
    accessCodes: { operator: "", staff: "", display: "", rotatedAt: "" },
  };
}

export function cloneEvent(e: Event): Event {
  return {
    ...e,
    venue: { ...e.venue, power: { ...e.venue.power } },
    pa: clonePa(e.pa),
    stagePlans: e.stagePlans.map((p) => ({
      ...p,
      stage: { points: p.stage.points.map((v) => ({ ...v })), arcs: p.stage.arcs?.map((a) => ({ ...a })) },
      zones: p.zones.map((z) => ({ ...z, polygon: z.polygon.map((v) => ({ ...v })) })),
      objects: p.objects.map((o) => ({ ...o })),
      notes: p.notes.map((n) => ({ ...n })),
    })),
    timetable: { ...e.timetable, items: e.timetable.items.map((i) => ({ ...i })) },
    notices: e.notices.map((n) => ({ ...n, targets: [...n.targets], ackBy: [...n.ackBy] })),
    devices: e.devices.map((d) => ({ ...d })),
    customEquipment: Object.fromEntries(
      Object.entries(e.customEquipment).map(([k, v]) => [k, { ...v }]),
    ),
    accessCodes: { ...e.accessCodes },
  };
}
