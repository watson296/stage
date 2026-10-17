import type { AABB, Vec2 } from "@stage-planner/shared";

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

/**
 * 주어진 범위가 전부 보이도록 가운데 맞춤. 단일 축척이라 비율이 유지됩니다.
 *
 * 범위를 경계상자로 받습니다. 바깥으로 부푼 호가 있으면 무대가 (0,0)에서
 * 시작하지 않으므로 가로·세로만으로는 자리를 잡을 수 없습니다.
 */
export function fitCamera(
  cssW: number,
  cssH: number,
  bounds: AABB,
  margin: number,
): Camera {
  const w = Math.max(0.5, bounds.maxX - bounds.minX);
  const d = Math.max(0.5, bounds.maxY - bounds.minY);
  const availW = Math.max(1, cssW - 2 * margin);
  const availH = Math.max(1, cssH - 2 * margin);
  const scale = clampScale(Math.min(availW / w, availH / d));
  return {
    scale,
    ox: (cssW - w * scale) / 2 - bounds.minX * scale,
    oy: (cssH - d * scale) / 2 - bounds.minY * scale,
  };
}

export function clampScale(v: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, v));
}

/** 두 카메라가 사실상 같은지. 뜻 없는 애니메이션을 건너뛸 때 씁니다. */
export function sameCamera(a: Camera, b: Camera): boolean {
  return (
    Math.abs(a.scale - b.scale) < 0.01 &&
    Math.abs(a.ox - b.ox) < 0.5 &&
    Math.abs(a.oy - b.oy) < 0.5
  );
}

/** 0 → 1 로 가는 ease-out 곡선. */
export function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function lerpCamera(a: Camera, b: Camera, k: number): Camera {
  return {
    scale: a.scale + (b.scale - a.scale) * k,
    ox: a.ox + (b.ox - a.ox) * k,
    oy: a.oy + (b.oy - a.oy) * k,
  };
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
