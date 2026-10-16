import {
  EQUIPMENT,
  drawShape,
  equipmentColor,
  equipmentDraw,
  NOTE_W_M,
  NOTE_H_M,
  shapeBounds,
  tessellate,
  zoneCentroid,
  zoneKindInfo,
  zoneLabel,
  type StagePlan,
  type StageObject,
  type Note,
  type Vec2,
  type Zone,
} from "@stage-planner/shared";
import { worldToScreen, type Camera } from "./camera";
import { objectHandles, stageHandles, zoneHandles, HANDLE_R } from "./handles";

export interface Selection {
  kind: "obj" | "note" | "zone";
  id: string;
}

export type Mode = "select" | "addNote" | "connect" | "place" | "stage" | "zone";

export interface RenderUI {
  gridSz: number;
  selection: Selection | null;
  connectSrc: string | null;
  mode: Mode;
  /** 구역을 그릴지. 도면이 복잡해지면 끕니다. */
  showZones: boolean;
  /** 구역을 끌어 만드는 중인 사각형(월드 m). */
  zoneDraft?: { a: Vec2; b: Vec2; color: string } | null;
  /** 무대 모양 모드에서 고른 꼭짓점 번호. */
  vertexSel?: number | null;
}

// 색 (3단계에서 디자인 토큰으로 교체). 지금은 새결 네이비 계열의 중립 팔레트.
const C = {
  page: "#eef1f5",
  stage: "#ffffff",
  gridMinor: "rgba(15,39,66,0.06)",
  gridMajor: "rgba(15,39,66,0.13)",
  border: "#0F2742",
  label: "#56667A",
  front: "#2563C4",
  sel: "#2563C4",
  link: "rgba(37,99,196,0.55)",
  objStroke: "rgba(15,39,66,0.22)",
  noteBar: "rgba(0,0,0,0.16)",
};

interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

// 캔버스 백버퍼를 devicePixelRatio에 맞춰 잡고, CSS px 단위로 그리도록
// 변환을 겁니다. 반환값은 현재 CSS 크기입니다.
export function syncCanvasSize(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
): { cssW: number; cssH: number; dpr: number } {
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  const bw = Math.round(cssW * dpr);
  const bh = Math.round(cssH * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { cssW, cssH, dpr };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function trunc(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function objectColor(o: StageObject): string {
  return equipmentColor(o.type) ?? o.color ?? "#888888";
}
function objectLabel(o: StageObject): string {
  return o.label || EQUIPMENT[o.type]?.name || "장비";
}

/**
 * 무대 경로를 만듭니다. 원호는 tessellate가 폅니다. 허용오차를 화면 1.5px로
 * 두어 확대해도 곡선이 매끄럽게 보입니다.
 */
function stagePath(ctx: CanvasRenderingContext2D, cam: Camera, plan: StagePlan): void {
  ctx.beginPath();
  tessellate(plan.stage, 1.5 / cam.scale).forEach((p, i) => {
    const s = worldToScreen(cam, p);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.closePath();
}

export function draw(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  cam: Camera,
  plan: StagePlan,
  ui: RenderUI,
): void {
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.fillStyle = C.page;
  ctx.fillRect(0, 0, cssW, cssH);

  const b = shapeBounds(plan.stage);

  ctx.fillStyle = C.stage;
  stagePath(ctx, cam, plan);
  ctx.fill();

  // 격자는 무대 안으로만 그립니다.
  ctx.save();
  stagePath(ctx, cam, plan);
  ctx.clip();
  drawGrid(ctx, cam, b, ui.gridSz);
  ctx.restore();

  drawScaleLabels(ctx, cam, b);

  ctx.strokeStyle = C.border;
  ctx.lineWidth = 2;
  stagePath(ctx, cam, plan);
  ctx.stroke();

  const front = worldToScreen(cam, { x: (b.minX + b.maxX) / 2, y: b.maxY });
  ctx.fillStyle = C.front;
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(
    plan.audienceDir === "all" ? "사방 객석" : "▲ FRONT (객석 방향)",
    front.x, front.y + 8,
  );

  // 구역은 무대 바닥 위, 장비 아래에 그립니다.
  if (ui.showZones) {
    for (const z of plan.zones) drawZone(ctx, cam, z, ui);
    if (ui.zoneDraft) drawZoneDraft(ctx, cam, ui.zoneDraft);
  }

  for (const o of plan.objects) if (o.type === "riser") drawObject(ctx, cam, o, ui);

  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = C.link;
  ctx.lineWidth = 1.5;
  for (const n of plan.notes) {
    if (n.linkedObjectId == null) continue;
    const o = plan.objects.find((x) => x.id === n.linkedObjectId);
    if (!o) continue;
    const a = worldToScreen(cam, { x: n.x, y: n.y });
    const t = worldToScreen(cam, { x: o.x + o.w / 2, y: o.y + o.d / 2 });
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(t.x, t.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  for (const o of plan.objects) if (o.type !== "riser") drawObject(ctx, cam, o, ui);
  for (const n of plan.notes) drawNote(ctx, cam, n, ui);

  drawHandles(ctx, cam, plan, ui);

  if (ui.connectSrc != null) {
    const n = plan.notes.find((x) => x.id === ui.connectSrc);
    if (n) {
      const c = worldToScreen(cam, { x: n.x, y: n.y });
      const w = NOTE_W_M * cam.scale;
      const h = NOTE_H_M * cam.scale;
      ctx.strokeStyle = C.sel;
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 4]);
      roundRect(ctx, c.x - w / 2 - 2, c.y - h / 2 - 2, w + 4, h + 4, 6);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

function drawGrid(
  ctx: CanvasRenderingContext2D, cam: Camera, b: Bounds, gridSz: number,
): void {
  const top = worldToScreen(cam, { x: b.minX, y: b.minY });
  const bot = worldToScreen(cam, { x: b.maxX, y: b.maxY });
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  ctx.lineWidth = 1;
  for (const [step, color] of [[gridSz, C.gridMinor], [1, C.gridMajor]] as const) {
    ctx.strokeStyle = color;
    for (let x = Math.ceil(b.minX / step) * step; x <= b.maxX + 1e-6; x += step) {
      const sx = worldToScreen(cam, { x, y: 0 }).x;
      line(sx, top.y, sx, bot.y);
    }
    for (let y = Math.ceil(b.minY / step) * step; y <= b.maxY + 1e-6; y += step) {
      const sy = worldToScreen(cam, { x: 0, y }).y;
      line(top.x, sy, bot.x, sy);
    }
  }
}

function drawScaleLabels(ctx: CanvasRenderingContext2D, cam: Camera, b: Bounds): void {
  const top = worldToScreen(cam, { x: b.minX, y: b.minY });
  ctx.fillStyle = C.label;
  ctx.font = "10px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  for (let x = Math.ceil(b.minX); x <= b.maxX + 1e-6; x++) {
    ctx.fillText(x + "m", worldToScreen(cam, { x, y: 0 }).x, top.y - 4);
  }
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let y = Math.ceil(b.minY); y <= b.maxY + 1e-6; y++) {
    ctx.fillText(y + "m", top.x - 5, worldToScreen(cam, { x: 0, y }).y);
  }
}

function drawObject(
  ctx: CanvasRenderingContext2D, cam: Camera, o: StageObject, ui: RenderUI,
): void {
  const center = worldToScreen(cam, { x: o.x + o.w / 2, y: o.y + o.d / 2 });
  const wpx = o.w * cam.scale;
  const hpx = o.d * cam.scale;
  const sel = ui.selection?.kind === "obj" && ui.selection.id === o.id;

  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate((o.rot * Math.PI) / 180);
  if (sel) {
    ctx.shadowColor = C.sel;
    ctx.shadowBlur = 12;
  }
  ctx.globalAlpha = o.onStage ? 1 : 0.6;
  drawShape(ctx, o, equipmentDraw(o.type), cam.scale, objectColor(o));
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  // 선택했거나 무대 밖이면 테두리로 표시합니다.
  if (sel || !o.onStage) {
    ctx.strokeStyle = sel ? C.sel : C.objStroke;
    ctx.lineWidth = sel ? 2 : 1;
    if (!o.onStage) ctx.setLineDash([4, 3]);
    roundRect(ctx, -wpx / 2, -hpx / 2, wpx, hpx, 4);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();

  // 라벨은 그림 아래에 수평으로 적습니다(그림을 가리지 않게).
  if (wpx > 26 || hpx > 26) {
    const label = trunc(objectLabel(o), 13);
    ctx.font = `600 ${clamp(Math.floor(Math.min(wpx, hpx) / 3.2), 9, 12)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const ty = center.y + Math.max(wpx, hpx) / 2 + 3;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.strokeText(label, center.x, ty);
    ctx.fillStyle = C.border;
    ctx.fillText(label, center.x, ty);
  }
  if (sel && wpx > 40) {
    ctx.fillStyle = C.sel;
    ctx.font = "9px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(`${round1(o.w)}×${round1(o.d)}m`, center.x, center.y - Math.max(wpx, hpx) / 2 - 3);
  }
}

function drawNote(
  ctx: CanvasRenderingContext2D, cam: Camera, n: Note, ui: RenderUI,
): void {
  const c = worldToScreen(cam, { x: n.x, y: n.y });
  const w = NOTE_W_M * cam.scale;
  const h = NOTE_H_M * cam.scale;
  const x = c.x - w / 2;
  const y = c.y - h / 2;
  const sel = ui.selection?.kind === "note" && ui.selection.id === n.id;

  ctx.save();
  ctx.shadowColor = "rgba(15,39,66,0.25)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = n.color;
  roundRect(ctx, x, y, w, h, 5);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = C.noteBar;
  ctx.fillRect(x, y, w, Math.max(4, h * 0.1));
  ctx.strokeStyle = sel ? C.sel : "rgba(15,39,66,0.18)";
  ctx.lineWidth = sel ? 2.5 : 1;
  roundRect(ctx, x, y, w, h, 5);
  ctx.stroke();

  const pad = Math.max(5, w * 0.06);
  ctx.fillStyle = "#1a1a1a";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `600 ${clamp(Math.floor(h / 4), 9, 15)}px system-ui, sans-serif`;
  ctx.fillText(trunc(n.text, 12), x + pad, y + h * 0.18);
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.font = `${clamp(Math.floor(h / 5), 8, 13)}px system-ui, sans-serif`;
  ctx.fillText(trunc(n.role, 18), x + pad, y + h * 0.55);

  if (n.linkedObjectId != null) {
    ctx.fillStyle = "#1f9d55";
    ctx.beginPath();
    ctx.arc(
      x + w - Math.max(7, w * 0.07),
      y + Math.max(7, h * 0.14),
      Math.max(3, w * 0.035), 0, Math.PI * 2,
    );
    ctx.fill();
  }
}

/**
 * 구역 하나. 채움은 옅게 하고 테두리와 이름으로 구분합니다. 색만으로 구분하지
 * 않으려고 이름을 늘 함께 적습니다. 무대 밖 구역은 점선 테두리입니다.
 */
function drawZone(
  ctx: CanvasRenderingContext2D, cam: Camera, z: Zone, ui: RenderUI,
): void {
  if (z.polygon.length < 3) return;
  const info = zoneKindInfo(z.kind);
  const sel = ui.selection?.kind === "zone" && ui.selection.id === z.id;

  ctx.beginPath();
  z.polygon.forEach((p, i) => {
    const s = worldToScreen(cam, p);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.closePath();

  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = info.color;
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = sel ? C.sel : info.color;
  ctx.lineWidth = sel ? 2.5 : 1.5;
  if (!info.onStage) ctx.setLineDash([6, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  // 이름(라이저·단차는 높이까지)을 무게중심에 적습니다.
  const c = worldToScreen(cam, zoneCentroid(z));
  const label = trunc(zoneLabel(z), 20);
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.strokeText(label, c.x, c.y);
  ctx.fillStyle = info.color;
  ctx.fillText(label, c.x, c.y);
}

/** 끌어 만드는 중인 구역 미리보기. */
function drawZoneDraft(
  ctx: CanvasRenderingContext2D, cam: Camera,
  draft: { a: Vec2; b: Vec2; color: string },
): void {
  const a = worldToScreen(cam, draft.a);
  const b = worldToScreen(cam, draft.b);
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = draft.color;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
  ctx.strokeStyle = draft.color;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
}

/** 무대 꼭짓점 손잡이와 선택한 장비의 크기·회전 손잡이를 그립니다. */
function drawHandles(
  ctx: CanvasRenderingContext2D, cam: Camera, plan: StagePlan, ui: RenderUI,
): void {
  const dot = (x: number, y: number, r: number, fill: string) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  // 변 중점 손잡이는 꼭짓점보다 작고 속이 비어 있어 구별됩니다.
  const ring = (x: number, y: number, r: number, color: string) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  };

  if (ui.mode === "stage") {
    const selV = ui.vertexSel;
    for (const h of stageHandles(plan.stage, cam)) {
      if (h.kind.startsWith("e")) ring(h.sx, h.sy, HANDLE_R - 2, C.sel);
      else {
        const i = Number(h.kind.slice(1));
        dot(h.sx, h.sy, i === selV ? HANDLE_R + 2 : HANDLE_R, i === selV ? C.front : C.sel);
      }
    }
    return;
  }

  if (ui.selection?.kind === "zone") {
    const z = plan.zones.find((x) => x.id === ui.selection!.id);
    if (!z) return;
    const color = zoneKindInfo(z.kind).color;
    for (const h of zoneHandles(z, cam)) {
      if (h.kind.startsWith("e")) ring(h.sx, h.sy, HANDLE_R - 2, color);
      else dot(h.sx, h.sy, HANDLE_R, color);
    }
    return;
  }

  if (ui.selection?.kind !== "obj") return;
  const o = plan.objects.find((x) => x.id === ui.selection!.id);
  if (!o) return;
  const hs = objectHandles(o, cam);
  const rot = hs.find((h) => h.kind === "rot");
  const top = hs.find((h) => h.kind === "nw");
  const top2 = hs.find((h) => h.kind === "ne");
  if (rot && top && top2) {
    // 회전 손잡이까지 선을 그어 무엇인지 알 수 있게 합니다.
    ctx.strokeStyle = C.sel;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo((top.sx + top2.sx) / 2, (top.sy + top2.sy) / 2);
    ctx.lineTo(rot.sx, rot.sy);
    ctx.stroke();
  }
  for (const h of hs) {
    dot(h.sx, h.sy, h.kind === "rot" ? HANDLE_R + 1 : HANDLE_R, h.kind === "rot" ? "#ffffff" : C.sel);
    if (h.kind === "rot") {
      ctx.beginPath();
      ctx.arc(h.sx, h.sy, HANDLE_R - 2, 0.6, 5.0);
      ctx.strokeStyle = C.sel;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}
