import { useEffect, useRef } from "preact/hooks";
import { clampToShape, zoneKindInfo, type Vec2 } from "@stage-planner/shared";
import { attachGestures } from "../input/pointer";
import {
  objectHandles, stageHandles, zoneHandles, hitHandle, resizeByCorner,
  rotationFromPointer, bulgeFromPointer, type Handle,
} from "../render/handles";
import { draw, syncCanvasSize } from "../render/canvas";
import { screenToWorld, zoomAt, pan } from "../render/camera";
import * as S from "../state/appState";

const DOUBLE_TAP_MS = 350;

/** 끄는 동안 보여 주는 부푼 거리 문구. 음수는 오목이라고 적습니다. */
function bulgeText(bulgeM: number): string {
  const v = Math.round(bulgeM * 100) / 100;
  if (Math.abs(v) < 0.01) return "부푼 거리 0m (직선)";
  const sign = v < 0 ? "−" : "";
  return `부푼 거리 ${sign}${Math.abs(v).toFixed(2)}m${v < 0 ? " (오목)" : ""}`;
}

export function StageCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ kind: "obj" | "note"; id: string; dx: number; dy: number } | null>(null);
  const handleDrag = useRef<{ handle: Handle; id: string } | null>(null);
  const zoneDraft = useRef<{ a: Vec2; b: Vec2 } | null>(null);
  // 변 중점 더블탭을 알아보려고 마지막 손잡이 탭을 기억합니다.
  const lastTap = useRef<{ kind: string; at: number }>({ kind: "", at: 0 });
  const firstFit = useRef(false);

  // 이 값들이 바뀌면 컴포넌트가 다시 렌더되고, 아래 effect가 다시 그립니다.
  S.docVersion.value;
  S.camera.value;
  S.selection.value;
  S.gridSz.value;
  S.connectSrc.value;
  S.mode.value;
  S.showZones.value;
  S.vertexSel.value;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const detach = attachGestures(canvas, {
      toWorld: (x, y) => screenToWorld(S.camera.value, x, y),
      grabbableAt: (w) => {
        if (currentHandles().length && handleAt(w) !== null) return true;
        // 구역 모드에서는 빈 곳을 끌어 사각형을 만듭니다.
        if (S.mode.value === "zone") return true;
        return S.mode.value === "select" && S.hitAny(w.x, w.y) !== null;
      },
      onGrabStart: (w) => {
        const h = handleAt(w);
        if (h) {
          S.store.beginTxn();
          handleDrag.current = { handle: h, id: S.selection.value?.id ?? "" };
          return;
        }
        if (S.mode.value === "zone") {
          zoneDraft.current = { a: w, b: w };
          return;
        }
        const sel = S.hitAny(w.x, w.y);
        if (!sel) return;
        S.selection.value = sel;
        if (sel.kind === "zone") return; // 구역은 꼭짓점 손잡이로만 고칩니다
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
        if (zoneDraft.current) {
          zoneDraft.current = { a: zoneDraft.current.a, b: w };
          render();
          return;
        }
        const hd = handleDrag.current;
        if (hd) {
          const kind = hd.handle.kind;
          if (kind.startsWith("v")) {
            const vi = Number(kind.slice(1));
            if (S.mode.value === "stage") S.moveVertex(vi, w.x, w.y);
            else if (hd.id) S.moveZoneVertex(hd.id, vi, w.x, w.y);
          } else if (kind.startsWith("e")) {
            // 구역의 변 중점은 끌지 않고 탭으로 꼭짓점을 더합니다.
            if (S.mode.value === "stage") dragEdgeBulge(Number(kind.slice(1)), w);
          } else {
            const o = S.currentPlan().objects.find((x) => x.id === hd.id);
            if (!o) return;
            if (kind === "rot") {
              S.setObjectRotation(o.id, rotationFromPointer(o, w, S.snap.value ? 15 : null));
            } else {
              S.resizeObject(o.id, resizeByCorner(o, kind, w, S.MIN_SIZE_M, S.snapVal));
            }
          }
          return;
        }
        const dr = drag.current;
        if (!dr) return;
        S.store.mutate((doc) => {
          const p = doc.stagePlans[0];
          if (dr.kind === "obj") {
            const o = p.objects.find((x) => x.id === dr.id);
            if (!o) return;
            const nx = S.snapVal(w.x - dr.dx);
            const ny = S.snapVal(w.y - dr.dy);
            if (o.onStage) {
              const c = clampToShape({ x: nx, y: ny, w: o.w, d: o.d, rot: o.rot }, p.stage);
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
        const dz = zoneDraft.current;
        zoneDraft.current = null;
        if (dz) {
          if (moved) S.addZone(dz.a, dz.b);
          else S.selection.value = S.hitAny(dz.a.x, dz.a.y);
          render();
          return;
        }
        const hd = handleDrag.current;
        if (hd || drag.current) {
          if (moved) S.store.commitTxn();
          else S.store.cancelTxn();
        }
        // 끌지 않고 뗀 것은 손잡이 탭입니다.
        if (hd && !moved) onHandleTap(hd);
        handleDrag.current = null;
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
        if (S.mode.value === "stage") {
          S.selectVertex(null);
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

  function currentHandles(): Handle[] {
    const cam = S.camera.value;
    if (S.mode.value === "stage") return stageHandles(S.currentPlan().stage, cam);
    const sel = S.selection.value;
    if (sel?.kind === "zone") {
      const z = S.currentPlan().zones.find((x) => x.id === sel.id);
      return z ? zoneHandles(z, cam) : [];
    }
    if (sel?.kind !== "obj") return [];
    const o = S.currentPlan().objects.find((x) => x.id === sel.id);
    return o ? objectHandles(o, cam) : [];
  }

  /** 변 중점을 끌어 부푼 거리를 바꿉니다. 끄는 동안 숫자로 보여 줍니다. */
  function dragEdgeBulge(edgeIdx: number, w: Vec2): void {
    const pts = S.currentPlan().stage.points;
    const a = pts[edgeIdx];
    const b = pts[(edgeIdx + 1) % pts.length];
    if (!a || !b) return;
    let bulge = bulgeFromPointer(a, b, w);
    if (S.snap.value) bulge = S.snapVal(bulge);
    S.setEdgeBulge(edgeIdx, bulge);
    S.statusMsg.value = bulgeText(bulge);
  }

  /** 손잡이를 끌지 않고 탭했을 때. 변 중점 더블탭은 직선으로 되돌립니다. */
  function onHandleTap(hd: { handle: Handle; id: string }): void {
    const kind = hd.handle.kind;
    const now = Date.now();
    const twice =
      lastTap.current.kind === kind && now - lastTap.current.at < DOUBLE_TAP_MS;
    lastTap.current = { kind, at: now };

    if (S.mode.value === "stage") {
      if (kind.startsWith("v")) S.selectVertex(Number(kind.slice(1)));
      else if (kind.startsWith("e") && twice) S.straightenEdge(Number(kind.slice(1)));
      return;
    }
    const sel = S.selection.value;
    if (sel?.kind === "zone" && kind.startsWith("e")) {
      S.insertZoneVertex(sel.id, Number(kind.slice(1)));
    }
  }

  /** 월드 좌표를 화면으로 되돌려 손잡이를 찾습니다. */
  function handleAt(w: { x: number; y: number }): Handle | null {
    const cam = S.camera.value;
    return hitHandle(currentHandles(), cam.ox + w.x * cam.scale, cam.oy + w.y * cam.scale);
  }

  function render(): void {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { cssW, cssH } = syncCanvasSize(canvas, ctx);
    S.setCanvasSize(cssW, cssH);
    const dz = zoneDraft.current;
    draw(ctx, cssW, cssH, S.camera.value, S.currentPlan(), {
      gridSz: S.gridSz.value,
      selection: S.selection.value,
      connectSrc: S.connectSrc.value,
      mode: S.mode.value,
      showZones: S.showZones.value,
      vertexSel: S.vertexSel.value,
      zoneDraft: dz ? { ...dz, color: zoneKindInfo(S.zoneKind.value).color } : null,
    });
  }

  useEffect(() => {
    render();
  });

  return <canvas id="cv" ref={ref} />;
}
