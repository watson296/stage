import { signal } from "@preact/signals";
import {
  EQUIPMENT,
  equipmentColor,
  NOTE_W_M,
  NOTE_H_M,
  VIEW_MARGIN,
  clamp,
  clampToStage,
  hitTest,
  polygonBounds,
  rectStage,
  type Event,
  type StageObject,
  type StagePlan,
  type Note,
} from "@stage-planner/shared";
import { Store } from "./store";
import { createAutosaver } from "./autosave";
import { fitCamera, type Camera } from "../render/camera";
import type { Mode, Selection } from "../render/canvas";

export const store = new Store();

/** 문서가 바뀔 때마다 올라갑니다. 컴포넌트는 이 값을 읽어 다시 그립니다. */
export const docVersion = signal(0);

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
  const b = polygonBounds(currentPlan().stage.points);
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
export function hitAny(wx: number, wy: number): Selection | null {
  const n = hitNote(wx, wy);
  if (n) return { kind: "note", id: n.id };
  const o = hitObject(wx, wy);
  if (o) return { kind: "obj", id: o.id };
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
  const { w: sw, d: sd } = stageSize();
  let x = snapVal(wx - t.w / 2);
  let y = snapVal(wy - t.d / 2);
  const c = clampToStage({ x, y, w: t.w, d: t.d, rot: t.rot }, sw, sd);
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
  fit();
}

export function clearPlan(): void {
  store.commit((d) =>
    mutatePlan(d, (p) => {
      p.objects = [];
      p.notes = [];
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
  stage: "무대 꼭짓점을 끌어 모양을 바꾸세요",
};

export function setMode(m: Mode): void {
  mode.value = m;
  if (m !== "place") placingType.value = null;
  if (m !== "connect") connectSrc.value = null;
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

export function fit(): void {
  const { w, d } = stageSize();
  camera.value = fitCamera(canvasSize.w, canvasSize.h, w, d, VIEW_MARGIN);
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
  fit();
}

export function moveVertex(index: number, x: number, y: number): void {
  store.mutate((doc) => {
    const pts = doc.stagePlans[0].stage.points;
    if (pts[index]) {
      pts[index] = { x: snapVal(x), y: snapVal(y) };
    }
  });
}

export function setAudienceDir(dir: "front" | "all"): void {
  store.commit((doc) =>
    mutatePlan(doc, (p) => {
      p.audienceDir = dir;
    }),
  );
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
