// 장비를 위에서 본 모습으로 그립니다.
// 모든 함수는 장비 중심이 원점, 단위는 px, 앞쪽이 +y입니다. s는 1m당 px입니다.
// 규격(w, d, variantId)에 따라 모양이 달라집니다(투베이스, 2단 키보드, 건반 수 등).
// docs/reference/blocks.patch의 SHAPES를 옮겨 온 코드입니다.
import type { StageObject } from "../model/types";

export const BRASS = "#c9a45c"; // 심벌

type Ctx = CanvasRenderingContext2D;

export function hexA(hex: string, a: number): string {
  const h = (hex || "#888888").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function box(
  ctx: Ctx, x: number, y: number, w: number, h: number, r: number,
  fill: string | null, stroke: string | null, lw = 1.2,
): void {
  if (w <= 0 || h <= 0) return;
  rrect(ctx, x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

function circ(
  ctx: Ctx, x: number, y: number, r: number,
  fill: string | null, stroke: string | null, lw = 1,
): void {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

function seg(ctx: Ctx, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export type ShapeFn = (
  ctx: Ctx, o: StageObject, s: number, hw: number, hd: number, c: string,
) => void;

export const SHAPES: Record<string, ShapeFn> = {
  drums(ctx, o, s, _hw, _hd, c) {
    // 1.8 × 1.5m 기준 위치를 가로·세로 비율대로 늘립니다
    const kx = o.w / 1.8, ky = o.d / 1.5, kr = Math.min(kx, ky);
    const X = (v: number) => v * kx * s;
    const Y = (v: number) => v * ky * s;
    const R = (v: number) => Math.max(1.2, v * kr * s);
    const drum = (x: number, y: number, r: number) => {
      circ(ctx, X(x), Y(y), R(r), hexA(c, 0.26), c, 1.2);
      circ(ctx, X(x), Y(y), R(r) * 0.78, null, hexA(c, 0.4), 0.8);
    };
    const cym = (x: number, y: number, r: number) => {
      circ(ctx, X(x), Y(y), R(r), hexA(BRASS, 0.14), hexA(BRASS, 0.85), 1);
      circ(ctx, X(x), Y(y), R(r) * 0.55, null, hexA(BRASS, 0.3), 0.7);
      circ(ctx, X(x), Y(y), Math.max(1, R(r) * 0.08), BRASS, null);
    };
    const kick = (x: number) => {
      const kw = X(0.5), kd = Y(0.42), ky0 = Y(0.27) - kd / 2;
      box(ctx, X(x) - kw / 2, ky0, kw, kd, 3, hexA(c, 0.2), c, 1.2);
      ctx.strokeStyle = c;
      ctx.lineWidth = 2;
      seg(ctx, X(x) - kw / 2 + 1, ky0 + 1.5, X(x) + kw / 2 - 1, ky0 + 1.5);
      seg(ctx, X(x) - kw / 2 + 1, ky0 + kd - 1.5, X(x) + kw / 2 - 1, ky0 + kd - 1.5);
    };
    ctx.setLineDash([3, 3]); // 드럼 의자
    circ(ctx, X(0), Y(-0.53), R(0.17), hexA(c, 0.08), hexA(c, 0.65), 1);
    ctx.setLineDash([]);
    const twin = o.variantId ? o.variantId === "2bd" : o.w >= 2.05;
    if (twin) { kick(-0.3); kick(0.3); } else kick(0);
    drum(-0.47, -0.24, 0.2);  // 플로어 탐
    drum(0.3, -0.18, 0.17);   // 스네어
    drum(0.17, 0, 0.13);      // 탐 1
    drum(-0.17, 0, 0.14);     // 탐 2
    cym(0.63, -0.08, 0.18);   // 하이햇
    cym(0.45, 0.36, 0.22);    // 크래시
    cym(-0.58, 0.18, 0.26);   // 라이드
  },

  amp(ctx, o, _s, hw, hd, c) {
    box(ctx, -hw, -hd, 2 * hw, 2 * hd, Math.min(4, hw * 0.2), hexA(c, 0.2), c, 1.3);
    const g = Math.max(3, 2 * hd * 0.24); // 앞면 그릴
    box(ctx, -hw + 1.5, hd - g, 2 * hw - 3, g - 1.5, 2, hexA(c, 0.45), null);
    ctx.strokeStyle = hexA(c, 0.6);
    ctx.lineWidth = 0.7;
    for (let x = -hw + 4; x < hw - 3; x += 3) seg(ctx, x, hd - g + 1.5, x, hd - 2.5);
    const hl = hw * 0.7, hh = Math.max(2.5, 2 * hd * 0.14); // 손잡이
    box(ctx, -hl / 2, -hd * 0.25 - hh / 2, hl, hh, hh / 2, null, hexA(c, 0.75), 1.2);
    if (o.h >= 1.0) { // 스택은 헤드 위치 표시
      ctx.strokeStyle = hexA(c, 0.5);
      ctx.lineWidth = 1;
      seg(ctx, -hw + 2, -hd + 3, hw - 2, -hd + 3);
    }
  },

  keys(ctx, o, _s, hw, hd, c) {
    // 연주자는 -y 쪽(뒤)에 서서 객석(+y)을 봅니다.
    const tiers = o.d >= 0.6 ? 2 : 1;
    const td = (2 * hd) / tiers;
    ctx.strokeStyle = hexA(c, 0.35); // 스탠드 다리
    ctx.lineWidth = 1.5;
    seg(ctx, -hw * 0.75, -hd + 2, -hw * 0.55, hd - 2);
    seg(ctx, hw * 0.75, -hd + 2, hw * 0.55, hd - 2);
    for (let i = 0; i < tiers; i++) {
      const by = -hd + i * td + 1.5, bh = td - 3;
      box(ctx, -hw, by, 2 * hw, bh, 3, hexA(c, 0.22), c, 1.2);
      const pad = Math.max(2, 2 * hw * 0.035);
      const kx0 = -hw + pad, kw = 2 * hw - 2 * pad;
      const kby = by + Math.max(1.5, bh * 0.1), kbh = bh * 0.52;
      box(ctx, kx0, kby, kw, kbh, 1, "rgba(230,236,242,.85)", null);
      const n = o.w >= 1.2 ? 52 : 36, wk = kw / n, off = n === 52 ? 5 : 0;
      if (wk >= 2.2) {
        ctx.fillStyle = "#1b2230";
        for (let k = 0; k < n - 1; k++) {
          const m = (k + off) % 7;
          if (m === 2 || m === 6) continue; // E-F, B-C 사이에는 검은 건반이 없습니다
          ctx.fillRect(kx0 + (k + 1) * wk - wk * 0.3, kby, wk * 0.6, kbh * 0.6);
        }
      } else {
        ctx.strokeStyle = "rgba(27,34,48,.55)";
        ctx.lineWidth = 0.7;
        for (let k = 7 - off; k < n; k += 7) seg(ctx, kx0 + k * wk, kby, kx0 + k * wk, kby + kbh);
      }
    }
  },

  mic(ctx, o, s, hw, hd, c) {
    const r = Math.min(hw, hd);
    if (o.w < 0.4 && o.d < 0.4) { // 원형 받침
      circ(ctx, 0, 0, r * 0.9, hexA(c, 0.2), c, 1.2);
      circ(ctx, 0, 0, Math.max(2, r * 0.22), c, null);
      return;
    }
    const hx = 0, hy = -r * 0.1;
    ctx.strokeStyle = c; // 삼각대 다리
    ctx.lineWidth = 2;
    [270, 30, 150].forEach((a) => {
      const t = (a * Math.PI) / 180;
      seg(ctx, hx, hy, hx + Math.cos(t) * r * 0.9, hy + Math.sin(t) * r * 0.9);
    });
    ctx.strokeStyle = hexA(c, 0.8); // 붐 암
    ctx.lineWidth = 1.5;
    seg(ctx, hx, hy, r * 0.35, r * 0.82);
    circ(ctx, r * 0.35, r * 0.82, Math.max(2.5, 0.035 * s), c, null);
    circ(ctx, hx, hy, Math.max(2, r * 0.1), c, null);
  },

  speaker(ctx, o, _s, hw, hd, c) {
    const bw = hw * 0.7; // 뒤가 좁은 사다리꼴 캐비닛
    ctx.beginPath();
    ctx.moveTo(-hw, hd);
    ctx.lineTo(hw, hd);
    ctx.lineTo(bw, -hd);
    ctx.lineTo(-bw, -hd);
    ctx.closePath();
    ctx.fillStyle = hexA(c, 0.22);
    ctx.fill();
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.3;
    ctx.stroke();
    const g = Math.max(3, 2 * hd * 0.22), k = (hw - bw) * (g / (2 * hd));
    ctx.beginPath();
    ctx.moveTo(-hw + 2, hd - 1.5);
    ctx.lineTo(hw - 2, hd - 1.5);
    ctx.lineTo(hw - 2 - k, hd - g);
    ctx.lineTo(-hw + 2 + k, hd - g);
    ctx.closePath();
    ctx.fillStyle = hexA(c, 0.5);
    ctx.fill();
    if (o.w / o.d >= 1.6) { // 라인 어레이: 리깅 프레임
      ctx.strokeStyle = hexA(c, 0.55);
      ctx.lineWidth = 1;
      seg(ctx, -bw * 0.6, -hd * 0.4, bw * 0.6, -hd * 0.4);
    }
  },

  wedge(ctx, _o, _s, hw, hd, c) {
    box(ctx, -hw, -hd, 2 * hw, 2 * hd, 3, hexA(c, 0.18), c, 1.3);
    const y0 = -hd * 0.15; // 비스듬한 앞판
    box(ctx, -hw + 2, y0, 2 * hw - 4, hd - y0 - 2, 2, hexA(c, 0.42), null);
    ctx.strokeStyle = hexA(c, 0.7);
    ctx.lineWidth = 0.8;
    for (let i = 1; i <= 3; i++) {
      const y = y0 + ((hd - y0) * i) / 4;
      seg(ctx, -hw + 4, y, hw - 4, y);
    }
  },

  sub(ctx, o, _s, hw, hd, c) {
    box(ctx, -hw, -hd, 2 * hw, 2 * hd, 3, hexA(c, 0.26), c, 1.3);
    const g = Math.max(3, 2 * hd * 0.14);
    box(ctx, -hw + 1.5, hd - g, 2 * hw - 3, g - 1.5, 2, hexA(c, 0.55), null);
    const n = clamp(Math.round(o.w / 0.6), 1, 4);
    const sw = (2 * hw) / n, rr = Math.min(sw, 2 * hd - g) * 0.33;
    for (let i = 0; i < n; i++) {
      const x = -hw + sw * (i + 0.5), y = -g / 2;
      circ(ctx, x, y, rr, null, hexA(c, 0.75), 1);
      circ(ctx, x, y, rr * 0.35, hexA(c, 0.45), null);
    }
  },

  mixer(ctx, o, s, hw, hd, c) {
    let x0 = -hw, y0 = -hd, w = 2 * hw, h = 2 * hd;
    if (o.w >= 1.2) { // 테이블 위에 콘솔
      ctx.setLineDash([4, 3]);
      box(ctx, -hw, -hd, 2 * hw, 2 * hd, 4, hexA(c, 0.07), hexA(c, 0.7), 1);
      ctx.setLineDash([]);
      w = Math.min(2 * hw * 0.62, 0.9 * s);
      h = Math.min(2 * hd * 0.72, 0.6 * s);
      x0 = -w / 2;
      y0 = -hd + (2 * hd - h) * 0.3;
    }
    box(ctx, x0, y0, w, h, 3, hexA(c, 0.24), c, 1.3);
    // 엔지니어는 +y 쪽에 섭니다. 페이더는 엔지니어 쪽, 노브는 안쪽입니다.
    const pad = Math.max(2, w * 0.05), mw = w * 0.17;
    const cw = w - 2 * pad - mw - pad;
    const n = clamp(Math.floor(cw / (0.028 * s)), 4, 32), sw = cw / n;
    const fy0 = y0 + h * 0.5, fy1 = y0 + h - pad;
    for (let i = 0; i < n; i++) {
      const x = x0 + pad + sw * (i + 0.5);
      ctx.strokeStyle = hexA(c, 0.5);
      ctx.lineWidth = 1;
      seg(ctx, x, fy0, x, fy1);
      const fy = fy0 + (fy1 - fy0) * (0.25 + (0.45 * ((i * 37) % 10)) / 10);
      ctx.fillStyle = "#e3eaf2";
      const cwd = Math.max(2.5, sw * 0.6), chh = Math.max(1.5, h * 0.045);
      ctx.fillRect(x - cwd / 2, fy - chh / 2, cwd, chh);
      if (sw >= 4) {
        for (let k = 0; k < 3; k++) {
          circ(ctx, x, y0 + pad + ((fy0 - y0 - 2 * pad) * (k + 0.5)) / 3,
            Math.max(0.8, sw * 0.17), hexA(c, 0.7), null);
        }
      }
    }
    box(ctx, x0 + w - pad - mw, y0 + pad, mw, h - 2 * pad, 2, hexA(c, 0.32), null);
    ctx.strokeStyle = hexA(c, 0.8);
    ctx.lineWidth = 1.2;
    seg(ctx, x0 + w - pad - mw * 0.66, fy0, x0 + w - pad - mw * 0.66, fy1);
    seg(ctx, x0 + w - pad - mw * 0.33, fy0, x0 + w - pad - mw * 0.33, fy1);
  },

  riser(ctx, o, s, hw, hd, c) {
    box(ctx, -hw, -hd, 2 * hw, 2 * hd, 2, hexA(c, 0.1), hexA(c, 0.85), 1.4);
    ctx.save();
    rrect(ctx, -hw, -hd, 2 * hw, 2 * hd, 2);
    ctx.clip();
    ctx.strokeStyle = hexA(c, 0.16);
    ctx.lineWidth = 1;
    const step = Math.max(6, 0.25 * s);
    for (let k = -hw - 2 * hd; k < hw; k += step) seg(ctx, k, -hd, k + 2 * hd, hd);
    ctx.restore();
    // 모듈 이음새 (약 1m 간격)
    ctx.strokeStyle = hexA(c, 0.4);
    ctx.lineWidth = 1;
    const nx = Math.max(1, Math.round(o.w / 1.0)), ny = Math.max(1, Math.round(o.d / 2.0));
    for (let i = 1; i < nx; i++) {
      const x = -hw + (2 * hw * i) / nx;
      seg(ctx, x, -hd + 1, x, hd - 1);
    }
    for (let j = 1; j < ny; j++) {
      const y = -hd + (2 * hd * j) / ny;
      seg(ctx, -hw + 1, y, hw - 1, y);
    }
  },

  cable(ctx, _o, _s, hw, hd, c) {
    const r = Math.min(hw, hd);
    box(ctx, -hw, -hd, 2 * hw, 2 * hd, r, hexA(c, 0.3), c, 1.1);
    if (hd >= 4) {
      ctx.strokeStyle = hexA(c, 0.6);
      ctx.lineWidth = 0.8;
      [-0.45, 0, 0.45].forEach((j) => seg(ctx, -hw + r, j * hd, hw - r, j * hd));
    }
  },

  // ── 아래 네 가지는 패치에 없어 새로 그렸습니다(SPEC 6.2) ──
  dibox(ctx, _o, _s, hw, hd, c) {
    box(ctx, -hw, -hd, 2 * hw, 2 * hd, Math.min(2, hw * 0.3), hexA(c, 0.25), c, 1.2);
    circ(ctx, 0, hd * 0.35, Math.max(1, Math.min(hw, hd) * 0.3), null, hexA(c, 0.8), 1);
    ctx.strokeStyle = hexA(c, 0.6);
    ctx.lineWidth = 1;
    seg(ctx, -hw * 0.5, -hd * 0.4, hw * 0.5, -hd * 0.4);
  },

  gstand(ctx, _o, _s, hw, hd, c) {
    // 위에서 본 A자 스탠드: 뒤쪽 받침과 앞으로 벌어진 두 팔
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.6;
    seg(ctx, -hw * 0.8, -hd * 0.6, hw * 0.8, -hd * 0.6);
    seg(ctx, -hw * 0.8, -hd * 0.6, -hw * 0.3, hd * 0.8);
    seg(ctx, hw * 0.8, -hd * 0.6, hw * 0.3, hd * 0.8);
    circ(ctx, 0, hd * 0.1, Math.max(1.5, Math.min(hw, hd) * 0.28), hexA(c, 0.2), hexA(c, 0.7), 1);
  },

  person(ctx, _o, _s, hw, hd, c) {
    const r = Math.min(hw, hd) * 0.92;
    // 어깨(원)와 바라보는 방향(+y) 표시
    circ(ctx, 0, 0, r, hexA(c, 0.28), c, 1.4);
    ctx.fillStyle = hexA(c, 0.8);
    ctx.beginPath();
    ctx.moveTo(0, r * 0.95);
    ctx.lineTo(-r * 0.42, r * 0.3);
    ctx.lineTo(r * 0.42, r * 0.3);
    ctx.closePath();
    ctx.fill();
  },

  power(ctx, _o, _s, hw, hd, c) {
    box(ctx, -hw, -hd, 2 * hw, 2 * hd, Math.min(3, hw * 0.25), hexA(c, 0.22), c, 1.3);
    const r = Math.max(1, Math.min(hw, hd) * 0.26);
    [-0.45, 0.45].forEach((fx) => {
      circ(ctx, fx * hw, 0, r, null, hexA(c, 0.8), 1);
      circ(ctx, fx * hw - r * 0.35, 0, Math.max(0.6, r * 0.18), hexA(c, 0.9), null);
      circ(ctx, fx * hw + r * 0.35, 0, Math.max(0.6, r * 0.18), hexA(c, 0.9), null);
    });
  },

  custom(ctx, _o, _s, hw, hd, c) {
    box(ctx, -hw, -hd, 2 * hw, 2 * hd, Math.min(5, hw * 0.3, hd * 0.3), hexA(c, 0.25), c, 1.3);
  },
};

/**
 * 장비 하나를 그립니다. 호출 전에 장비 중심으로 translate하고 rot만큼
 * rotate해 두어야 합니다. s는 1m당 px입니다.
 */
export function drawShape(
  ctx: Ctx,
  o: StageObject,
  drawKey: string,
  s: number,
  color: string,
): void {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const fn = SHAPES[drawKey] ?? SHAPES.custom;
  fn(ctx, o, s, (o.w * s) / 2, (o.d * s) / 2, color);
}
