// 구역(Zone)을 다루는 순수 함수들. 화면 그리기와 상태 바꾸기는 app이 맡고,
// 여기서는 모양·판정·이름만 정합니다.
import { pointInPolygon, polygonCentroid, polygonBounds, type AABB } from "./geometry";
import {
  zoneNeedsHeight,
  type Vec2,
  type Zone,
  type ZoneKind,
} from "./types";

export interface ZoneKindInfo {
  kind: ZoneKind;
  /** 화면에 보이는 이름 */
  name: string;
  /** 무대 위 구역인지(아니면 무대 밖 동선) */
  onStage: boolean;
  /** 채움·테두리 색. 색만으로 구분하지 않고 이름을 같이 그립니다. */
  color: string;
}

export const ZONE_KINDS: ZoneKindInfo[] = [
  { kind: "riser", name: "라이저", onStage: true, color: "#C08A3E" },
  { kind: "level", name: "단차", onStage: true, color: "#8C6B4F" },
  { kind: "audience", name: "객석", onStage: false, color: "#5B7FA6" },
  { kind: "foh", name: "FOH", onStage: false, color: "#4F8A7B" },
  { kind: "exit", name: "출입구", onStage: false, color: "#9E5B6B" },
  { kind: "backstage", name: "대기실 동선", onStage: false, color: "#6E6A8F" },
];

export function zoneKindInfo(kind: ZoneKind): ZoneKindInfo {
  return ZONE_KINDS.find((z) => z.kind === kind) ?? ZONE_KINDS[0];
}

/** 라이저·단차의 기본 높이(m). */
export const DEFAULT_ZONE_HEIGHT_M = 0.4;

/** 구역을 만들 때 받아들이는 가장 작은 변 길이(m). 손이 떨린 것은 버립니다. */
export const MIN_ZONE_SIDE_M = 0.3;

/**
 * 두 점을 마주보는 모서리로 삼아 사각형 구역을 만듭니다.
 * 터치에서 점을 하나씩 찍게 하지 않고, 사각형으로 만든 뒤 꼭짓점을 고칩니다.
 */
export function zoneRect(id: string, kind: ZoneKind, a: Vec2, b: Vec2): Zone {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  const zone: Zone = {
    id,
    kind,
    name: zoneKindInfo(kind).name,
    // 화면 좌표(y가 아래)에서 시계 방향으로 감습니다. 무대 모양과 같은 방향입니다.
    polygon: [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ],
  };
  if (zoneNeedsHeight(kind)) zone.heightM = DEFAULT_ZONE_HEIGHT_M;
  return zone;
}

/** 끌어 만든 사각형이 구역으로 쓸 만한 크기인지. */
export function isZoneRectBigEnough(a: Vec2, b: Vec2): boolean {
  return (
    Math.abs(b.x - a.x) >= MIN_ZONE_SIDE_M && Math.abs(b.y - a.y) >= MIN_ZONE_SIDE_M
  );
}

export function zoneCentroid(zone: Zone): Vec2 {
  return polygonCentroid(zone.polygon);
}

export function zoneBounds(zone: Zone): AABB {
  return polygonBounds(zone.polygon);
}

/** 화면과 도면에 적는 이름. 라이저·단차는 높이를 함께 적습니다. */
export function zoneLabel(zone: Zone): string {
  const base = zone.name || zoneKindInfo(zone.kind).name;
  if (!zoneNeedsHeight(zone.kind) || zone.heightM == null) return base;
  return `${base} ${round2(zone.heightM)}m`;
}

/** 점이 어느 구역 안에 있는지. 나중에 만든 것이 위에 있으므로 뒤에서 찾습니다. */
export function zoneAt(zones: Zone[], p: Vec2): Zone | null {
  for (let i = zones.length - 1; i >= 0; i--) {
    if (pointInPolygon(p, zones[i].polygon)) return zones[i];
  }
  return null;
}

/**
 * 장비 중심이 올라가 있는 높이 구역(라이저·단차)을 찾습니다.
 * 표시만 하려고 쓰는 값이며, StageObject.z를 자동으로 바꾸지는 않습니다.
 */
export function riserUnder(zones: Zone[], center: Vec2): Zone | null {
  for (let i = zones.length - 1; i >= 0; i--) {
    const z = zones[i];
    if (zoneNeedsHeight(z.kind) && pointInPolygon(center, z.polygon)) return z;
  }
  return null;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
