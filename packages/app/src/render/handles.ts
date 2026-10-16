import type { StageObject, StagePlan, Vec2 } from "@stage-planner/shared";
import { worldToScreen, screenToWorld, type Camera } from "./camera";

/** 손잡이 종류. v0, v1 … 은 무대 꼭짓점 번호입니다. */
export type HandleKind = "nw" | "ne" | "se" | "sw" | "rot" | `v${number}`;

export interface Handle {
  kind: HandleKind;
  sx: number; // 화면 좌표
  sy: number;
}

/** 터치로 잡기 쉬운 크기(화면 px). 디자인 규칙의 44px 영역에 맞춥니다. */
export const HANDLE_R = 7;
export const HANDLE_HIT_R = 22;
const ROT_OFFSET = 26; // 회전 손잡이를 장비 위로 띄우는 거리

const rad = (deg: number) => (deg * Math.PI) / 180;

/** 장비 로컬 좌표 → 월드 좌표 */
export function localToWorld(o: StageObject, lx: number, ly: number): Vec2 {
  const cx = o.x + o.w / 2;
  const cy = o.y + o.d / 2;
  const a = rad(o.rot);
  return {
    x: cx + lx * Math.cos(a) - ly * Math.sin(a),
    y: cy + lx * Math.sin(a) + ly * Math.cos(a),
  };
}

/** 월드 좌표 → 장비 로컬 좌표(중심 원점, 회전 제거) */
export function worldToLocal(o: StageObject, p: Vec2): Vec2 {
  const cx = o.x + o.w / 2;
  const cy = o.y + o.d / 2;
  const a = -rad(o.rot);
  const dx = p.x - cx;
  const dy = p.y - cy;
  return {
    x: dx * Math.cos(a) - dy * Math.sin(a),
    y: dx * Math.sin(a) + dy * Math.cos(a),
  };
}

const CORNERS: { kind: HandleKind; sx: number; sy: number }[] = [
  { kind: "nw", sx: -1, sy: -1 },
  { kind: "ne", sx: 1, sy: -1 },
  { kind: "se", sx: 1, sy: 1 },
  { kind: "sw", sx: -1, sy: 1 },
];

/** 선택한 장비의 크기·회전 손잡이(화면 좌표) */
export function objectHandles(o: StageObject, cam: Camera): Handle[] {
  const out: Handle[] = CORNERS.map((c) => {
    const w = localToWorld(o, (c.sx * o.w) / 2, (c.sy * o.d) / 2);
    const s = worldToScreen(cam, w);
    return { kind: c.kind, sx: s.x, sy: s.y };
  });
  // 회전 손잡이는 장비 뒤쪽(-y) 바깥에 둡니다.
  const top = localToWorld(o, 0, -o.d / 2);
  const ts = worldToScreen(cam, top);
  const center = worldToScreen(cam, { x: o.x + o.w / 2, y: o.y + o.d / 2 });
  const dx = ts.x - center.x;
  const dy = ts.y - center.y;
  const len = Math.hypot(dx, dy) || 1;
  out.push({ kind: "rot", sx: ts.x + (dx / len) * ROT_OFFSET, sy: ts.y + (dy / len) * ROT_OFFSET });
  return out;
}

/** 무대 꼭짓점 손잡이(화면 좌표) */
export function stageHandles(plan: StagePlan, cam: Camera): Handle[] {
  return plan.stage.points.map((p, i) => {
    const s = worldToScreen(cam, p);
    return { kind: `v${i}` as HandleKind, sx: s.x, sy: s.y };
  });
}

export function hitHandle(handles: Handle[], sx: number, sy: number): Handle | null {
  let best: Handle | null = null;
  let bestD = HANDLE_HIT_R;
  for (const h of handles) {
    const dist = Math.hypot(h.sx - sx, h.sy - sy);
    if (dist <= bestD) {
      bestD = dist;
      best = h;
    }
  }
  return best;
}

/**
 * 모서리를 끌어 크기를 바꿉니다. 반대쪽 모서리를 제자리에 두고,
 * 회전은 그대로 둔 채 로컬 좌표에서 계산합니다.
 */
export function resizeByCorner(
  o: StageObject,
  kind: HandleKind,
  world: Vec2,
  minSize: number,
  snapFn: (v: number) => number,
): { x: number; y: number; w: number; d: number } {
  const c = CORNERS.find((k) => k.kind === kind);
  if (!c) return { x: o.x, y: o.y, w: o.w, d: o.d };
  const p = worldToLocal(o, world);
  // 고정되는 반대쪽 모서리(로컬)
  const fx = (-c.sx * o.w) / 2;
  const fy = (-c.sy * o.d) / 2;
  const w = Math.max(minSize, snapFn(Math.abs(p.x - fx)));
  const d = Math.max(minSize, snapFn(Math.abs(p.y - fy)));
  // 고정 모서리에서 새 중심까지(로컬)
  const ncx = fx + (c.sx * w) / 2;
  const ncy = fy + (c.sy * d) / 2;
  const center = localToWorld(o, ncx, ncy);
  return { x: center.x - w / 2, y: center.y - d / 2, w, d };
}

/** 회전 손잡이를 끌어 각도를 구합니다. snapDeg가 있으면 그 단위로 맞춥니다. */
export function rotationFromPointer(
  o: StageObject,
  world: Vec2,
  snapDeg: number | null,
): number {
  const cx = o.x + o.w / 2;
  const cy = o.y + o.d / 2;
  // 손잡이는 장비 뒤쪽(-y)에 있으므로 90°를 더해 보정합니다.
  let deg = (Math.atan2(world.y - cy, world.x - cx) * 180) / Math.PI + 90;
  if (snapDeg) deg = Math.round(deg / snapDeg) * snapDeg;
  deg %= 360;
  return deg < 0 ? deg + 360 : deg;
}

export { screenToWorld };
