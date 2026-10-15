import type { Vec2 } from "@stage-planner/shared";

// 마우스·터치·펜을 Pointer Events 하나로 처리합니다.
//  - 손가락 하나: 잡을 게 있으면 끌기, 빈 곳이면 화면 이동(드래그) 또는 탭
//  - 손가락 둘: 이동 + 핀치 줌
//  - 휠: 커서 기준 확대/축소 (데스크톱)
export interface GestureHandlers {
  toWorld(cssX: number, cssY: number): Vec2;
  grabbableAt(world: Vec2): boolean;
  onTap(world: Vec2): void;
  onGrabStart(world: Vec2): void;
  onGrabMove(world: Vec2): void;
  onGrabEnd(moved: boolean): void;
  // scaleFactor로 확대/축소하고(focal 고정), (dxCss,dyCss)만큼 화면을 밉니다.
  onPanZoom(scaleFactor: number, focalCssX: number, focalCssY: number, dxCss: number, dyCss: number): void;
}

const TAP_THRESHOLD = 6; // css px

type State = "idle" | "grab" | "maybePan" | "gesture";

interface Pt {
  x: number;
  y: number;
}

export function attachGestures(canvas: HTMLCanvasElement, h: GestureHandlers): () => void {
  const pointers = new Map<number, Pt>();
  let state: State = "idle";
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let moved = false;
  let gLastDist = 0;
  let gLastMid: Pt = { x: 0, y: 0 };

  const pos = (e: PointerEvent): Pt => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const twoPointerInfo = (): { mid: Pt; dist: number } => {
    const pts = [...pointers.values()];
    const a = pts[0];
    const b = pts[1];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    return { mid, dist };
  };

  const onDown = (e: PointerEvent): void => {
    const p = pos(e);
    pointers.set(e.pointerId, p);
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // 합성 이벤트 등으로 캡처가 안 될 수 있음 — 무시
    }

    if (pointers.size >= 2) {
      if (state === "grab") h.onGrabEnd(moved);
      state = "gesture";
      const info = twoPointerInfo();
      gLastDist = info.dist;
      gLastMid = info.mid;
      return;
    }

    startX = lastX = p.x;
    startY = lastY = p.y;
    moved = false;
    const world = h.toWorld(p.x, p.y);
    if (h.grabbableAt(world)) {
      state = "grab";
      h.onGrabStart(world);
    } else {
      state = "maybePan";
    }
  };

  const onMove = (e: PointerEvent): void => {
    if (!pointers.has(e.pointerId)) return;
    const p = pos(e);
    pointers.set(e.pointerId, p);

    if (state === "gesture" && pointers.size >= 2) {
      const info = twoPointerInfo();
      const factor = info.dist / gLastDist;
      h.onPanZoom(factor, info.mid.x, info.mid.y, info.mid.x - gLastMid.x, info.mid.y - gLastMid.y);
      gLastDist = info.dist;
      gLastMid = info.mid;
      return;
    }

    if (pointers.size !== 1) return;
    if (!moved && Math.hypot(p.x - startX, p.y - startY) > TAP_THRESHOLD) moved = true;

    if (state === "grab") {
      h.onGrabMove(h.toWorld(p.x, p.y));
    } else if (state === "maybePan" && moved) {
      h.onPanZoom(1, p.x, p.y, p.x - lastX, p.y - lastY);
    }
    lastX = p.x;
    lastY = p.y;
  };

  const endPointer = (e: PointerEvent, cancelled: boolean): void => {
    if (!pointers.has(e.pointerId)) return;
    const p = pos(e);
    pointers.delete(e.pointerId);
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);

    if (state === "gesture") {
      if (pointers.size >= 2) {
        const info = twoPointerInfo();
        gLastDist = info.dist;
        gLastMid = info.mid;
      } else if (pointers.size === 1) {
        // 한 손가락만 남음: 튐 방지를 위해 남은 손가락은 이동으로만 쓴다
        const only = [...pointers.values()][0];
        state = "maybePan";
        moved = true;
        lastX = only.x;
        lastY = only.y;
      } else {
        state = "idle";
      }
      return;
    }

    if (state === "grab") {
      h.onGrabEnd(moved);
    } else if (state === "maybePan" && !moved && !cancelled) {
      h.onTap(h.toWorld(p.x, p.y));
    }
    if (pointers.size === 0) state = "idle";
  };

  const onUp = (e: PointerEvent): void => endPointer(e, false);
  const onCancel = (e: PointerEvent): void => endPointer(e, true);

  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const factor = Math.exp(-e.deltaY * 0.0015);
    h.onPanZoom(factor, e.clientX - r.left, e.clientY - r.top, 0, 0);
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onCancel);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  return () => {
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onCancel);
    canvas.removeEventListener("wheel", onWheel);
  };
}
