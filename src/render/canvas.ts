import type { Doc, StageObject, Postit } from "../model/types";
import { POSTIT_W_M, POSTIT_H_M } from "../model/constants";
import { worldToScreen, type Camera } from "./camera";

export interface Selection {
  kind: "obj" | "pi";
  id: number;
}

export type Mode = "select" | "addPostit" | "connect" | "place";

export interface RenderUI {
  gridSz: number;
  selection: Selection | null;
  connectSrc: number | null;
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
  postitBar: "rgba(0,0,0,0.16)",
};

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
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
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

export function draw(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  cam: Camera,
  doc: Doc,
  ui: RenderUI,
): void {
  const { stage } = doc;
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.fillStyle = C.page;
  ctx.fillRect(0, 0, cssW, cssH);

  const o0 = worldToScreen(cam, { x: 0, y: 0 });
  const stageWpx = stage.w * cam.scale;
  const stageHpx = stage.d * cam.scale;

  // 무대 면
  ctx.fillStyle = C.stage;
  ctx.fillRect(o0.x, o0.y, stageWpx, stageHpx);

  drawGrid(ctx, cam, stage.w, stage.d, ui.gridSz, o0.x, o0.y, stageWpx, stageHpx);
  drawScaleLabels(ctx, cam, stage.w, stage.d, o0.x, o0.y);

  // 무대 테두리
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 2;
  ctx.strokeRect(o0.x, o0.y, stageWpx, stageHpx);

  // FRONT 표시
  ctx.fillStyle = C.front;
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("▲ FRONT (객석 방향)", o0.x + stageWpx / 2, o0.y + stageHpx + 8);

  // 라이저 먼저
  for (const o of doc.objects) if (o.type === "riser") drawObject(ctx, cam, o, ui);

  // 연결선
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = C.link;
  ctx.lineWidth = 1.5;
  for (const p of doc.postits) {
    if (p.con == null) continue;
    const o = doc.objects.find((x) => x.id === p.con);
    if (!o) continue;
    const a = worldToScreen(cam, { x: p.x, y: p.y });
    const b = worldToScreen(cam, { x: o.x + o.w / 2, y: o.y + o.d / 2 });
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // 나머지 장비
  for (const o of doc.objects) if (o.type !== "riser") drawObject(ctx, cam, o, ui);

  // 포스트잇
  for (const p of doc.postits) drawPostit(ctx, cam, p, ui);

  // 연결 시작 포스트잇 강조
  if (ui.connectSrc != null) {
    const p = doc.postits.find((x) => x.id === ui.connectSrc);
    if (p) {
      const c = worldToScreen(cam, { x: p.x, y: p.y });
      const w = POSTIT_W_M * cam.scale;
      const h = POSTIT_H_M * cam.scale;
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
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  stW: number,
  stD: number,
  gridSz: number,
  ox: number,
  oy: number,
  wpx: number,
  hpx: number,
): void {
  ctx.lineWidth = 1;
  ctx.strokeStyle = C.gridMinor;
  for (let x = 0; x <= stW + 1e-6; x += gridSz) {
    const sx = ox + x * cam.scale;
    ctx.beginPath();
    ctx.moveTo(sx, oy);
    ctx.lineTo(sx, oy + hpx);
    ctx.stroke();
  }
  for (let y = 0; y <= stD + 1e-6; y += gridSz) {
    const sy = oy + y * cam.scale;
    ctx.beginPath();
    ctx.moveTo(ox, sy);
    ctx.lineTo(ox + wpx, sy);
    ctx.stroke();
  }
  ctx.strokeStyle = C.gridMajor;
  for (let x = 0; x <= stW + 1e-6; x += 1) {
    const sx = ox + x * cam.scale;
    ctx.beginPath();
    ctx.moveTo(sx, oy);
    ctx.lineTo(sx, oy + hpx);
    ctx.stroke();
  }
  for (let y = 0; y <= stD + 1e-6; y += 1) {
    const sy = oy + y * cam.scale;
    ctx.beginPath();
    ctx.moveTo(ox, sy);
    ctx.lineTo(ox + wpx, sy);
    ctx.stroke();
  }
}

function drawScaleLabels(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  stW: number,
  stD: number,
  ox: number,
  oy: number,
): void {
  ctx.fillStyle = C.label;
  ctx.font = "10px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  for (let x = 0; x <= stW + 1e-6; x++) ctx.fillText(x + "m", ox + x * cam.scale, oy - 4);
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let y = 0; y <= stD + 1e-6; y++) ctx.fillText(y + "m", ox - 5, oy + y * cam.scale);
}

function drawObject(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  o: StageObject,
  ui: RenderUI,
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
  ctx.fillStyle = o.color;
  ctx.globalAlpha = o.type === "riser" ? 0.35 : 0.9;
  roundRect(ctx, -wpx / 2, -hpx / 2, wpx, hpx, 5);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.strokeStyle = sel ? C.sel : C.objStroke;
  ctx.lineWidth = sel ? 2.5 : 1;
  roundRect(ctx, -wpx / 2, -hpx / 2, wpx, hpx, 5);
  ctx.stroke();

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

  // 라벨·이모지(회전 없이 수평)
  const label = trunc(o.label || o.name, 13);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const big = wpx > 28 && hpx > 20;
  ctx.font = `600 ${clamp(Math.floor(wpx / 7), 9, 13)}px system-ui, sans-serif`;
  ctx.fillText(label, center.x, center.y - (big ? 6 : 0));
  if (big) {
    ctx.font = `${clamp(Math.floor(wpx / 5), 10, 16)}px serif`;
    ctx.fillText(o.emoji, center.x, center.y + clamp(hpx / 5, 6, 14));
  }

  if (sel && wpx > 40) {
    ctx.fillStyle = C.sel;
    ctx.font = "9px system-ui, sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText(`${round1(o.w)}×${round1(o.d)}m`, center.x, center.y + hpx / 2 + 4);
  }
}

function drawPostit(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  p: Postit,
  ui: RenderUI,
): void {
  const c = worldToScreen(cam, { x: p.x, y: p.y });
  const w = POSTIT_W_M * cam.scale;
  const h = POSTIT_H_M * cam.scale;
  const x = c.x - w / 2;
  const y = c.y - h / 2;
  const sel = ui.selection?.kind === "pi" && ui.selection.id === p.id;

  ctx.save();
  ctx.shadowColor = "rgba(15,39,66,0.25)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = p.color;
  roundRect(ctx, x, y, w, h, 5);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = C.postitBar;
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
  ctx.fillText("📌 " + trunc(p.nm, 11), x + pad, y + h * 0.18);
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.font = `${clamp(Math.floor(h / 5), 8, 13)}px system-ui, sans-serif`;
  ctx.fillText(trunc(p.role, 18), x + pad, y + h * 0.55);

  if (p.con != null) {
    ctx.fillStyle = "#1f9d55";
    ctx.beginPath();
    ctx.arc(x + w - Math.max(7, w * 0.07), y + Math.max(7, h * 0.14), Math.max(3, w * 0.035), 0, Math.PI * 2);
    ctx.fill();
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
