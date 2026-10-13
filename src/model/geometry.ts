import type { Vec2 } from "./types";

// 회전 사각형. x, y는 회전하지 않은 사각형의 왼쪽 위 모서리(월드 m),
// rot은 중심을 기준으로 한 각도(°).
export interface OrientedRect {
  x: number;
  y: number;
  w: number;
  d: number;
  rot: number;
}

export function rectCenter(r: OrientedRect): Vec2 {
  return { x: r.x + r.w / 2, y: r.y + r.d / 2 };
}

const rad = (deg: number) => (deg * Math.PI) / 180;

// 월드 점을 사각형 로컬 좌표(중심 원점, 회전 제거)로 변환합니다.
export function worldToLocal(r: OrientedRect, p: Vec2): Vec2 {
  const c = rectCenter(r);
  const a = -rad(r.rot); // 회전을 되돌린다
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return {
    x: dx * Math.cos(a) - dy * Math.sin(a),
    y: dx * Math.sin(a) + dy * Math.cos(a),
  };
}

// 점이 회전 사각형 안에 있는지. 보이는 모양(회전된 사각형)과 일치합니다.
export function hitTest(r: OrientedRect, p: Vec2): boolean {
  const l = worldToLocal(r, p);
  return Math.abs(l.x) <= r.w / 2 && Math.abs(l.y) <= r.d / 2;
}

// 회전 사각형 네 꼭짓점(월드 좌표).
export function corners(r: OrientedRect): Vec2[] {
  const c = rectCenter(r);
  const a = rad(r.rot);
  const hw = r.w / 2;
  const hd = r.d / 2;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ].map(([x, y]) => ({ x: c.x + x * ca - y * sa, y: c.y + x * sa + y * ca }));
}

export interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// 회전 사각형을 감싸는 축 정렬 경계상자(월드 좌표).
export function rotatedAABB(r: OrientedRect): AABB {
  const cs = corners(r);
  const xs = cs.map((c) => c.x);
  const ys = cs.map((c) => c.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

// 회전 사각형의 경계상자가 [0,0]~[stageW,stageD] 안에 들어오도록
// 왼쪽 위 모서리(x, y)를 보정합니다. 회전은 그대로 둡니다.
export function clampToStage(
  r: OrientedRect,
  stageW: number,
  stageD: number,
): { x: number; y: number } {
  const box = rotatedAABB(r);
  let x = r.x;
  let y = r.y;

  // x축: 사각형이 무대보다 넓으면 왼쪽(최소)에 맞춘다.
  const spanX = box.maxX - box.minX;
  if (spanX >= stageW) {
    x += -box.minX; // 왼쪽 정렬
  } else {
    if (box.minX < 0) x += -box.minX;
    else if (box.maxX > stageW) x -= box.maxX - stageW;
  }

  const spanY = box.maxY - box.minY;
  if (spanY >= stageD) {
    y += -box.minY;
  } else {
    if (box.minY < 0) y += -box.minY;
    else if (box.maxY > stageD) y -= box.maxY - stageD;
  }

  return { x, y };
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
