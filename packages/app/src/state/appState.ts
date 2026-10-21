import { signal } from "@preact/signals";
import {
  EQUIPMENT,
  equipmentColor,
  NOTE_W_M,
  NOTE_H_M,
  VIEW_MARGIN,
  clamp,
  clampToShape,
  hitTest,
  polygonBounds,
  rotatedAABB,
  shapeBounds,
  unionBounds,
  rectStage,
  arcOnEdge,
  CAPS,
  DEFAULT_ZONE_HEIGHT_M,
  isZoneRectBigEnough,
  MIN_VERTICES,
  removeVertex as removeShapeVertex,
  insertVertex as insertShapeVertex,
  moveVertex as moveShapeVertex,
  setBulge,
  zoneAt,
  zoneKindInfo,
  zoneNeedsHeight,
  zoneRect,
  type Event,
  type StageObject,
  type StagePlan,
  type AABB,
  type Note,
  type Vec2,
  type Zone,
  type ZoneKind,
} from "@stage-planner/shared";
import { Store } from "./store";
import { createAutosaver } from "./autosave";
import {
  fitCamera,
  sameCamera,
  easeOut,
  lerpCamera,
  type Camera,
} from "../render/camera";
import type { Mode, Selection } from "../render/canvas";

export const store = new Store();

/** 문서가 바뀔 때마다 올라갑니다. 컴포넌트는 이 값을 읽어 다시 그립니다. */
export const docVersion = signal(0);

/** 지금 보고 있는 화면. 1~3번 화면은 호스트 없이 혼자 돌아갑니다(SPEC 4). */
export type Screen = "stage" | "pa" | "timetable" | "host";
export const screen = signal<Screen>("stage");

export const mode = signal<Mode>("select");
export const selection = signal<Selection | null>(null);
export const gridSz = signal(0.25);
export const snap = signal(true);
export const connectSrc = signal<string | null>(null);
export const placingType = signal<string | null>(null);
export const statusMsg = signal("준비됨");
export const mousePos = signal("x:0.0m y:0.0m");
export const camera = signal<Camera>({ scale: 60, ox: VIEW_MARGIN, oy: VIEW_MARGIN });

export interface ToastItem { id: number; text: string; error: boolean }
export const toasts = signal<ToastItem[]>([]);
let toastSeq = 0;
export function toast(text: string, error = false): void {
  const id = ++toastSeq;
  toasts.value = [...toasts.value, { id, text, error }];
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }, error ? 6000 : 3500);
}

export const autosaver = createAutosaver((msg) => {
  toast(msg + " 중요한 배치는 JSON으로 내보내 두세요.", true);
});

store.subscribe(() => {
  docVersion.value++;
  autosaver.schedule(store.get());
});

// ── 현재 문서 읽기 ───────────────────────────────────────────────────────────
export function currentEvent(): Event {
  return store.get();
}
/** 지금 편집 중인 배치도. 여러 장 지원은 2단계입니다. */
export function currentPlan(): StagePlan {
  return store.get().stagePlans[0];
}
export function stageSize(): { w: number; d: number } {
  const b = shapeBounds(currentPlan().stage);
  return { w: b.maxX - b.minX, d: b.maxY - b.minY };
}

let idSeq = 0;
function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${++idSeq}`;
}

/** 장비 키로 기본 치수와 색을 찾습니다(기본 장비 또는 사용자 추가 장비). */
export function resolveType(
  key: string,
): { name: string; w: number; d: number; h: number; color: string; rot: number } | null {
  const t = EQUIPMENT[key];
  if (t) {
    const v = t.variants[0];
    return {
      name: t.name, w: v.w, d: v.d, h: v.h,
      color: equipmentColor(key) ?? "#9aa8ba", rot: t.rot ?? 0,
    };
  }
  const c = store.get().customEquipment[key];
  if (c) return { name: c.name, w: c.w, d: c.d, h: c.h, color: c.color, rot: 0 };
  return null;
}

export function snapVal(v: number): number {
  return snap.value ? Math.round(v / gridSz.value) * gridSz.value : v;
}

// ── 히트 테스트 ──────────────────────────────────────────────────────────────
export function hitNote(wx: number, wy: number): Note | null {
  const ns = currentPlan().notes;
  for (let i = ns.length - 1; i >= 0; i--) {
    const n = ns[i];
    if (Math.abs(wx - n.x) <= NOTE_W_M / 2 && Math.abs(wy - n.y) <= NOTE_H_M / 2) return n;
  }
  return null;
}
export function hitObject(wx: number, wy: number): StageObject | null {
  const os = currentPlan().objects;
  for (let i = os.length - 1; i >= 0; i--) {
    const o = os[i];
    if (hitTest({ x: o.x, y: o.y, w: o.w, d: o.d, rot: o.rot }, { x: wx, y: wy })) return o;
  }
  return null;
}
/** 구역은 장비 아래에 있으므로 마지막에 찾습니다. 구역 표시를 끄면 잡히지 않습니다. */
export function hitZone(wx: number, wy: number): Zone | null {
  if (!showZones.value) return null;
  return zoneAt(currentPlan().zones, { x: wx, y: wy });
}
export function hitAny(wx: number, wy: number): Selection | null {
  const n = hitNote(wx, wy);
  if (n) return { kind: "note", id: n.id };
  const o = hitObject(wx, wy);
  if (o) return { kind: "obj", id: o.id };
  const z = hitZone(wx, wy);
  if (z) return { kind: "zone", id: z.id };
  return null;
}

// ── 편집 동작 ────────────────────────────────────────────────────────────────
function mutatePlan(d: Event, fn: (p: StagePlan) => void): void {
  const p = d.stagePlans[0];
  fn(p);
  p.rev++;
}

export function placeObject(key: string, wx: number, wy: number): void {
  const t = resolveType(key);
  if (!t) return;
  let x = snapVal(wx - t.w / 2);
  let y = snapVal(wy - t.d / 2);
  const c = clampToShape({ x, y, w: t.w, d: t.d, rot: t.rot }, currentPlan().stage);
  x = c.x;
  y = c.y;
  const id = newId("obj");
  store.commit((d) =>
    mutatePlan(d, (p) => {
      p.objects.push({
        id, type: key, variantId: EQUIPMENT[key]?.variants[0]?.id,
        x, y, w: t.w, d: t.d, h: t.h, z: 0, rot: t.rot,
        label: "", onStage: true,
      });
    }),
  );
  selection.value = { kind: "obj", id };
  statusMsg.value = "배치했습니다. 계속 탭해 더 놓거나 Esc로 끝냅니다.";
}

export function rotateSelected(): void {
  const sel = selection.value;
  if (sel?.kind !== "obj") return;
  store.commit((d) =>
    mutatePlan(d, (p) => {
      const o = p.objects.find((x) => x.id === sel.id);
      if (o) o.rot = (o.rot + 45) % 360; // w/d를 맞바꾸지 않습니다
    }),
  );
}

export function deleteSelected(): void {
  const sel = selection.value;
  if (!sel) return;
  store.commit((d) =>
    mutatePlan(d, (p) => {
      if (sel.kind === "obj") {
        p.objects = p.objects.filter((o) => o.id !== sel.id);
        p.notes.forEach((n) => {
          if (n.linkedObjectId === sel.id) n.linkedObjectId = null;
        });
      } else if (sel.kind === "zone") {
        p.zones = p.zones.filter((z) => z.id !== sel.id);
      } else {
        p.notes = p.notes.filter((n) => n.id !== sel.id);
      }
    }),
  );
  selection.value = null;
}

export function addNote(x: number, y: number, text: string, role: string, color: string): void {
  const id = newId("note");
  store.commit((d) =>
    mutatePlan(d, (p) => {
      p.notes.push({ id, x, y, text, role, color, linkedObjectId: null });
    }),
  );
  selection.value = { kind: "note", id };
}

export function connectTap(wx: number, wy: number): void {
  if (connectSrc.value == null) {
    const n = hitNote(wx, wy);
    if (n) {
      connectSrc.value = n.id;
      statusMsg.value = "연결할 장비를 탭하세요 (Esc 취소)";
    }
    return;
  }
  const o = hitObject(wx, wy);
  const src = connectSrc.value;
  if (o) {
    store.commit((d) =>
      mutatePlan(d, (p) => {
        const n = p.notes.find((x) => x.id === src);
        if (n) n.linkedObjectId = o.id;
      }),
    );
    statusMsg.value = "연결했습니다.";
  }
  connectSrc.value = null;
}

export function setStageSize(w: number, d: number): void {
  store.commit((doc) =>
    mutatePlan(doc, (p) => {
      p.stage = rectStage(clamp(w, 1, 50), clamp(d, 1, 50));
    }),
  );
  fitAfterRebuild();
}

export function clearPlan(): void {
  store.commit((d) =>
    mutatePlan(d, (p) => {
      p.objects = [];
      p.notes = [];
      p.zones = [];
    }),
  );
  selection.value = null;
}

export function addCustomEquipment(
  name: string, w: number, d: number, h: number, color: string,
): void {
  const key = "ci_" + Date.now().toString(36);
  store.commit((doc) => {
    doc.customEquipment[key] = { name, w, d, h, color };
  });
}

export function removeCustomEquipment(key: string): void {
  store.commit((doc) => {
    delete doc.customEquipment[key];
  });
  if (placingType.value === key) placingType.value = null;
}

// ── 모드·카메라 ──────────────────────────────────────────────────────────────
const HINTS: Record<Mode, string> = {
  select: "준비됨 | 장비를 탭해 선택·이동, 두 손가락으로 이동·확대",
  addNote: "무대를 탭해 메모를 추가하세요",
  connect: "메모를 탭한 뒤 장비를 탭해 연결하세요",
  place: "무대를 탭해 배치하세요 (Esc로 끝내기)",
  stage: "꼭짓점을 끌어 모양을, 변 중점을 끌어 곡선을 만드세요(중점 더블탭은 직선)",
  zone: "무대 위나 밖을 끌어 구역을 만드세요",
};

export function setMode(m: Mode): void {
  mode.value = m;
  if (m !== "place") placingType.value = null;
  if (m !== "connect") connectSrc.value = null;
  if (m !== "stage") vertexSel.value = null;
  statusMsg.value = HINTS[m];
}

export function togglePlacing(key: string): void {
  if (placingType.value === key) {
    placingType.value = null;
    setMode("select");
    return;
  }
  placingType.value = key;
  mode.value = "place";
  statusMsg.value = `${resolveType(key)?.name ?? "장비"} 배치: 무대를 탭하세요 (Esc로 끝내기)`;
}

let canvasSize = { w: 800, h: 600 };
export function setCanvasSize(w: number, h: number): void {
  canvasSize = { w, h };
}

/**
 * 무대 모양이 바뀌면 화면을 다시 맞출지. 사용자가 직접 확대·축소하거나 화면을
 * 옮기면 꺼지고, 맞춤 단추를 누르면 다시 켜집니다.
 */
export const autoFit = signal(true);

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

const FIT_MS = 200;
let fitAnim = 0;

function cancelFitAnim(): void {
  if (fitAnim) {
    cancelAnimationFrame(fitAnim);
    fitAnim = 0;
  }
}

/** 화면이 움직이는 이유가 사용자 손일 때. 자동 맞춤을 끄고 진행 중인 움직임을 멈춥니다. */
export function userMovedCamera(cam: Camera): void {
  cancelFitAnim();
  autoFit.value = false;
  camera.value = cam;
}

function targetCamera(): Camera {
  return fitCamera(canvasSize.w, canvasSize.h, planBounds(), VIEW_MARGIN);
}

/** 무대와 구역, 무대 밖 장비를 모두 담는 범위. */
function planBounds(): AABB {
  const p = currentPlan();
  const boxes: AABB[] = [shapeBounds(p.stage)];
  for (const z of p.zones) if (z.polygon.length >= 3) boxes.push(polygonBounds(z.polygon));
  for (const o of p.objects) {
    if (o.onStage) continue;
    boxes.push(rotatedAABB({ x: o.x, y: o.y, w: o.w, d: o.d, rot: o.rot }));
  }
  return unionBounds(boxes);
}

function moveCameraTo(target: Camera, animate: boolean): void {
  cancelFitAnim();
  if (!animate || reducedMotion() || sameCamera(camera.value, target)) {
    camera.value = target;
    return;
  }
  const from = camera.value;
  const t0 = performance.now();
  const step = (now: number): void => {
    const t = Math.min(1, (now - t0) / FIT_MS);
    camera.value = lerpCamera(from, target, easeOut(t));
    fitAnim = t < 1 ? requestAnimationFrame(step) : 0;
  };
  fitAnim = requestAnimationFrame(step);
}

/** 맞춤 단추. 자동 맞춤을 다시 켭니다. */
export function fit(animate = true): void {
  autoFit.value = true;
  moveCameraTo(targetCamera(), animate);
}

/**
 * 무대 **모양**이 바뀌었을 때만 부릅니다(템플릿, 꼭짓점, 호, 무대 크기).
 * 장비를 옮기거나 구역을 고칠 때는 부르지 않습니다. 작업 중에 화면이 움직이면
 * 더 불편하기 때문입니다.
 */
export function fitIfAuto(): void {
  if (autoFit.value) moveCameraTo(targetCamera(), true);
}

/**
 * 템플릿 적용이나 무대 크기 입력처럼 무대를 통째로 다시 만드는 경우입니다.
 * 새 무대를 보여 주는 것이 당연하므로 자동 맞춤이 꺼져 있어도 맞춥니다.
 * 다만 사용자가 정한 자동 맞춤 설정은 건드리지 않습니다.
 */
export function fitAfterRebuild(): void {
  moveCameraTo(targetCamera(), true);
}

// ── 모달 상태 ────────────────────────────────────────────────────────────────
/** 메모를 추가할 위치(월드 m). null이 아니면 메모 모달이 열립니다. */
export const pendingNote = signal<{ x: number; y: number } | null>(null);
export const showCustomModal = signal(false);
export const showInfoModal = signal(false);
export const noteColor = signal("#f1c40f");

// ── 무대 모양 ────────────────────────────────────────────────────────────────
import { TEMPLATES, templateById } from "@stage-planner/shared";

/** 템플릿을 현재 무대 크기에 맞춰 적용합니다. */
export function applyTemplate(id: string): void {
  const t = templateById(id);
  if (!t) return;
  const { w, d } = stageSize();
  store.commit((doc) =>
    mutatePlan(doc, (p) => {
      p.stage = t.build(w, d);
      p.audienceDir = t.audienceDir;
    }),
  );
  fitAfterRebuild();
}

/** 무대 모양 모드에서 고른 꼭짓점 번호. 속성 바가 이 값을 읽습니다. */
export const vertexSel = signal<number | null>(null);

export function moveVertex(index: number, x: number, y: number): void {
  store.mutate((doc) => {
    const p = doc.stagePlans[0];
    p.stage = moveShapeVertex(p.stage, index, { x: snapVal(x), y: snapVal(y) });
  });
}

export function selectVertex(index: number | null): void {
  vertexSel.value = index;
  if (index != null) statusMsg.value = `꼭짓점 ${index + 1}을 골랐습니다.`;
}

/** 꼭짓점을 지웁니다. 세 개 아래로는 줄이지 않습니다. */
export function removeSelectedVertex(): void {
  const i = vertexSel.value;
  if (i == null) return;
  const before = currentPlan().stage.points.length;
  if (before <= MIN_VERTICES) {
    toast("꼭짓점은 세 개까지만 줄일 수 있습니다.");
    return;
  }
  store.commit((doc) =>
    mutatePlan(doc, (p) => {
      p.stage = removeShapeVertex(p.stage, i);
    }),
  );
  vertexSel.value = null;
  fitIfAuto();
  statusMsg.value = "꼭짓점을 지웠습니다.";
}

/** 꼭짓점 좌표를 숫자로 고칩니다. */
export function setVertexPos(index: number, x: number, y: number): void {
  store.mutate((doc) => {
    const p = doc.stagePlans[0];
    p.stage = moveShapeVertex(p.stage, index, { x, y });
  });
  fitIfAuto();
}

/** 변 하나를 호로 만들거나(부푼 거리) 0을 주어 직선으로 되돌립니다. */
export function setEdgeBulge(edgeIdx: number, bulgeM: number): void {
  store.mutate((doc) => {
    const p = doc.stagePlans[0];
    p.stage = setBulge(p.stage, edgeIdx, bulgeM);
  });
}

/** 변 중점 더블탭: 그 변을 직선으로 되돌립니다. */
export function straightenEdge(edgeIdx: number): void {
  const had = arcOnEdge(currentPlan().stage, edgeIdx);
  if (!had) return;
  store.commit((doc) =>
    mutatePlan(doc, (p) => {
      p.stage = setBulge(p.stage, edgeIdx, 0);
    }),
  );
  fitIfAuto();
  statusMsg.value = "변을 직선으로 되돌렸습니다.";
}

export function setAudienceDir(dir: "front" | "all"): void {
  store.commit((doc) =>
    mutatePlan(doc, (p) => {
      p.audienceDir = dir;
    }),
  );
}

/**
 * 꼭짓점이나 변 중점 끌기가 끝났을 때. 끄는 동안에는 화면을 움직이지 않고
 * 손을 뗀 뒤 한 번만 맞춥니다.
 */
export function shapeDragEnded(): void {
  fitIfAuto();
}

export const TEMPLATE_LIST = TEMPLATES;

// ── 장비 크기·회전·규격 ─────────────────────────────────────────────────────
export const MIN_SIZE_M = 0.1;

export function resizeObject(
  id: string, box: { x: number; y: number; w: number; d: number },
): void {
  store.mutate((doc) => {
    const o = doc.stagePlans[0].objects.find((x) => x.id === id);
    if (!o) return;
    o.x = box.x;
    o.y = box.y;
    o.w = box.w;
    o.d = box.d;
    o.variantId = undefined; // 손으로 크기를 바꾸면 규격에서 벗어납니다
  });
}

export function setObjectRotation(id: string, deg: number): void {
  store.mutate((doc) => {
    const o = doc.stagePlans[0].objects.find((x) => x.id === id);
    if (o) o.rot = deg;
  });
}

/** 규격을 고르면 치수를 그 값으로 맞춥니다(중심은 그대로). */
export function setVariant(id: string, variantId: string): void {
  store.commit((doc) => {
    const o = doc.stagePlans[0].objects.find((x) => x.id === id);
    if (!o) return;
    const v = EQUIPMENT[o.type]?.variants.find((x) => x.id === variantId);
    if (!v) return;
    const cx = o.x + o.w / 2;
    const cy = o.y + o.d / 2;
    o.w = v.w;
    o.d = v.d;
    o.h = v.h;
    o.variantId = v.id;
    o.x = cx - v.w / 2;
    o.y = cy - v.d / 2;
  });
}

// ── 구역 ─────────────────────────────────────────────────────────────────────
/** 구역을 그릴지. 화면 상태라 문서에 저장하지 않습니다. */
export const showZones = signal(true);
/** 다음에 만들 구역의 종류. */
export const zoneKind = signal<ZoneKind>("riser");

/** 끌어 만든 사각형으로 구역을 추가합니다. 너무 작으면 버립니다. */
export function addZone(a: Vec2, b: Vec2): void {
  if (!isZoneRectBigEnough(a, b)) {
    statusMsg.value = "구역이 너무 작습니다. 더 크게 끌어 주세요.";
    return;
  }
  const kind = zoneKind.value;
  const id = newId("zone");
  store.commit((doc) =>
    mutatePlan(doc, (p) => {
      p.zones.push(zoneRect(id, kind, snapPt(a), snapPt(b)));
    }),
  );
  selection.value = { kind: "zone", id };
  statusMsg.value = `${zoneKindInfo(kind).name} 구역을 만들었습니다.`;
}

function snapPt(p: Vec2): Vec2 {
  return { x: snapVal(p.x), y: snapVal(p.y) };
}

function withZone(id: string, fn: (z: Zone) => void): (doc: Event) => void {
  return (doc) =>
    mutatePlan(doc, (p) => {
      const z = p.zones.find((x) => x.id === id);
      if (z) fn(z);
    });
}

export function moveZoneVertex(id: string, index: number, x: number, y: number): void {
  store.mutate(
    withZone(id, (z) => {
      if (z.polygon[index]) z.polygon[index] = { x: snapVal(x), y: snapVal(y) };
    }),
  );
}

/** 변 중점을 탭해 꼭짓점을 더합니다(터치에서 점을 하나씩 찍지 않게). */
export function insertZoneVertex(id: string, edgeIdx: number): void {
  const z = currentPlan().zones.find((x) => x.id === id);
  if (!z) return;
  const n = z.polygon.length;
  if (n >= CAPS.MAX_ZONE_POINTS) {
    toast("구역 꼭짓점이 너무 많습니다.", true);
    return;
  }
  const a = z.polygon[edgeIdx];
  const b = z.polygon[(edgeIdx + 1) % n];
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  store.commit(
    withZone(id, (zz) => {
      zz.polygon = insertShapeVertex({ points: zz.polygon }, edgeIdx, mid).points;
    }),
  );
  statusMsg.value = "구역에 꼭짓점을 더했습니다.";
}

export function removeZoneVertex(id: string, index: number): void {
  const z = currentPlan().zones.find((x) => x.id === id);
  if (!z) return;
  if (z.polygon.length <= MIN_VERTICES) {
    toast("구역 꼭짓점은 세 개까지만 줄일 수 있습니다.");
    return;
  }
  store.commit(
    withZone(id, (zz) => {
      zz.polygon = removeShapeVertex({ points: zz.polygon }, index).points;
    }),
  );
}

export function setZoneName(id: string, name: string): void {
  store.mutate(withZone(id, (z) => (z.name = name)));
}

export function setZoneKind(id: string, kind: ZoneKind): void {
  store.commit(
    withZone(id, (z) => {
      z.kind = kind;
      // 높이는 라이저·단차만 가집니다. 다른 종류로 바꾸면 지웁니다.
      if (zoneNeedsHeight(kind)) z.heightM = z.heightM ?? DEFAULT_ZONE_HEIGHT_M;
      else delete z.heightM;
    }),
  );
}

export function setZoneHeight(id: string, heightM: number): void {
  store.mutate(
    withZone(id, (z) => {
      if (zoneNeedsHeight(z.kind)) {
        z.heightM = clamp(heightM, 0, CAPS.ZONE_HEIGHT_MAX);
      }
    }),
  );
}
