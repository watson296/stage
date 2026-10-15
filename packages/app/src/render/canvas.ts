import {
  EQUIPMENT,
  NOTE_W_M,
  NOTE_H_M,
  polygonBounds,
  type StagePlan,
  type StageObject,
  type Note,
} from "@stage-planner/shared";
import { worldToScreen, type Camera } from "./camera";

export interface Selection {
  kind: "obj" | "note";
  id: string;
}

export type Mode = "select" | "addNote" | "connect" | "place";

export interface RenderUI {
  gridSz: number;
  selection: Selection | null;
  connectSrc: string | null;
  mode: Mode;
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
  return o.color ?? EQUIPMENT[o.type]?.color ?? "#888888";
}
function objectLabel(o: StageObject): string {
  return o.label || EQUIPMENT[o.type]?.name || "장비";
}
function objectEmoji(o: StageObject): string {
  return EQUIPMENT[o.type]?.emoji ?? "";
}

/** 무대 다각형 경로를 만듭니다. */
function stagePath(ctx: CanvasRenderingContext2D, cam: Camera, plan: StagePlan): void {
  ctx.beginPath();
  plan.stage.points.forEach((p, i) => {
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

  const b = polygonBounds(plan.stage.points);

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
  ctx.fillStyle = objectColor(o);
  ctx.globalAlpha = o.type === "riser" ? 0.35 : o.onStage ? 0.9 : 0.6;
  roundRect(ctx, -wpx / 2, -hpx / 2, wpx, hpx, 5);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.strokeStyle = sel ? C.sel : C.objStroke;
  ctx.lineWidth = sel ? 2.5 : 1;
  // 무대 밖 장비는 점선 테두리로 구분합니다.
  if (!o.onStage) ctx.setLineDash([4, 3]);
  roundRect(ctx, -wpx / 2, -hpx / 2, wpx, hpx, 5);
  ctx.stroke();
  ctx.setLineDash([]);

  // 정면(+d) 방향 화살표
  if (wpx > 22 && hpx > 18) {
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.moveTo(0, hpx / 2 - 5);
    ctx.lineTo(-5, hpx / 2 - 13);
    ctx.lineTo(5, hpx / 2 - 13);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  const label = trunc(objectLabel(o), 13);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const big = wpx > 28 && hpx > 20;
  ctx.font = `600 ${clamp(Math.floor(wpx / 7), 9, 13)}px system-ui, sans-serif`;
  ctx.fillText(label, center.x, center.y - (big ? 6 : 0));
  const emoji = objectEmoji(o);
  if (big && emoji) {
    ctx.font = `${clamp(Math.floor(wpx / 5), 10, 16)}px serif`;
    ctx.fillText(emoji, center.x, center.y + clamp(hpx / 5, 6, 14));
  }
  if (sel && wpx > 40) {
    ctx.fillStyle = C.sel;
    ctx.font = "9px system-ui, sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText(`${round1(o.w)}×${round1(o.d)}m`, center.x, center.y + hpx / 2 + 4);
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
