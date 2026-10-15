import type { Vec2 } from "@stage-planner/shared";

// 월드(m) → 화면(CSS px) 변환. 가로세로 같은 축척(scale) 하나만 쓰므로
// 무대 비율이 왜곡되지 않습니다. screenX = ox + worldX * scale.
export interface Camera {
  scale: number; // px per meter
  ox: number;
  oy: number;
}

export function worldToScreen(cam: Camera, w: Vec2): Vec2 {
  return { x: cam.ox + w.x * cam.scale, y: cam.oy + w.y * cam.scale };
}

export function screenToWorld(cam: Camera, sx: number, sy: number): Vec2 {
  return { x: (sx - cam.ox) / cam.scale, y: (sy - cam.oy) / cam.scale };
}

// 무대 전체가 보이도록 가운데 맞춤. 단일 축척이라 비율이 유지됩니다.
export function fitCamera(
  cssW: number,
  cssH: number,
  stageW: number,
  stageD: number,
  margin: number,
): Camera {
  const availW = Math.max(1, cssW - 2 * margin);
  const availH = Math.max(1, cssH - 2 * margin);
  const scale = Math.max(1, Math.min(availW / stageW, availH / stageD));
  const ox = (cssW - stageW * scale) / 2;
  const oy = (cssH - stageD * scale) / 2;
  return { scale, ox, oy };
}

export const MIN_SCALE = 8;
export const MAX_SCALE = 600;

// 초점(focal, 화면 좌표)을 고정한 채 확대/축소합니다.
export function zoomAt(cam: Camera, factor: number, fx: number, fy: number): Camera {
  const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, cam.scale * factor));
  const world = screenToWorld(cam, fx, fy);
  return { scale: next, ox: fx - world.x * next, oy: fy - world.y * next };
}

export function pan(cam: Camera, dx: number, dy: number): Camera {
  return { scale: cam.scale, ox: cam.ox + dx, oy: cam.oy + dy };
}
