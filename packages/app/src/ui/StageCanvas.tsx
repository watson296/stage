import { useEffect, useRef } from "preact/hooks";
import { clampToStage, type Vec2 } from "@stage-planner/shared";
import { attachGestures } from "../input/pointer";
import { draw, syncCanvasSize } from "../render/canvas";
import { screenToWorld, zoomAt, pan } from "../render/camera";
import * as S from "../state/appState";

export function StageCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ kind: "obj" | "note"; id: string; dx: number; dy: number } | null>(null);
  const firstFit = useRef(false);

  // 이 값들이 바뀌면 컴포넌트가 다시 렌더되고, 아래 effect가 다시 그립니다.
  S.docVersion.value;
  S.camera.value;
  S.selection.value;
  S.gridSz.value;
  S.connectSrc.value;
  S.mode.value;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const detach = attachGestures(canvas, {
      toWorld: (x, y) => screenToWorld(S.camera.value, x, y),
      grabbableAt: (w) => S.mode.value === "select" && S.hitAny(w.x, w.y) !== null,
      onGrabStart: (w) => {
        const sel = S.hitAny(w.x, w.y);
        if (!sel) return;
        S.selection.value = sel;
        S.store.beginTxn();
        if (sel.kind === "obj") {
          const o = S.currentPlan().objects.find((x) => x.id === sel.id)!;
          drag.current = { kind: "obj", id: sel.id, dx: w.x - o.x, dy: w.y - o.y };
        } else {
          const n = S.currentPlan().notes.find((x) => x.id === sel.id)!;
          drag.current = { kind: "note", id: sel.id, dx: w.x - n.x, dy: w.y - n.y };
        }
      },
      onGrabMove: (w) => {
        const dr = drag.current;
        if (!dr) return;
        const size = S.stageSize();
        S.store.mutate((doc) => {
          const p = doc.stagePlans[0];
          if (dr.kind === "obj") {
            const o = p.objects.find((x) => x.id === dr.id);
            if (!o) return;
            const nx = S.snapVal(w.x - dr.dx);
            const ny = S.snapVal(w.y - dr.dy);
            if (o.onStage) {
              const c = clampToStage({ x: nx, y: ny, w: o.w, d: o.d, rot: o.rot }, size.w, size.d);
              o.x = c.x;
              o.y = c.y;
            } else {
              o.x = nx;
              o.y = ny;
            }
          } else {
            const n = p.notes.find((x) => x.id === dr.id);
            if (!n) return;
            n.x = S.snapVal(w.x - dr.dx);
            n.y = S.snapVal(w.y - dr.dy);
          }
        });
      },
      onGrabEnd: (moved) => {
        if (drag.current) {
          if (moved) S.store.commitTxn();
          else S.store.cancelTxn();
        }
        drag.current = null;
      },
      onTap: (w: Vec2) => {
        if (S.mode.value === "place" && S.placingType.value) {
          S.placeObject(S.placingType.value, w.x, w.y);
          return;
        }
        if (S.mode.value === "addNote") {
          S.pendingNote.value = { x: w.x, y: w.y };
          return;
        }
        if (S.mode.value === "connect") {
          S.connectTap(w.x, w.y);
          return;
        }
        S.selection.value = null;
      },
      onPanZoom: (factor, fx, fy, dx, dy) => {
        let cam = S.camera.value;
        if (factor !== 1) cam = zoomAt(cam, factor, fx, fy);
        if (dx !== 0 || dy !== 0) cam = pan(cam, dx, dy);
        S.camera.value = cam;
      },
    });

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const w = screenToWorld(S.camera.value, e.clientX - r.left, e.clientY - r.top);
      S.mousePos.value = `x:${w.x.toFixed(1)}m y:${w.y.toFixed(1)}m`;
    };
    canvas.addEventListener("pointermove", onMove);

    const ro = new ResizeObserver(() => {
      S.setCanvasSize(canvas.clientWidth, canvas.clientHeight);
      if (!firstFit.current && canvas.clientWidth > 0) {
        firstFit.current = true;
        S.fit();
      }
      render();
    });
    ro.observe(canvas);

    return () => {
      detach();
      canvas.removeEventListener("pointermove", onMove);
      ro.disconnect();
    };
  }, []);

  function render(): void {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { cssW, cssH } = syncCanvasSize(canvas, ctx);
    S.setCanvasSize(cssW, cssH);
    draw(ctx, cssW, cssH, S.camera.value, S.currentPlan(), {
      gridSz: S.gridSz.value,
      selection: S.selection.value,
      connectSrc: S.connectSrc.value,
      mode: S.mode.value,
    });
  }

  useEffect(() => {
    render();
  });

  return <canvas id="cv" ref={ref} />;
}
