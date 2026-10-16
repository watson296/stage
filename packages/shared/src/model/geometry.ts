import type { Vec2, StageShape, ArcSegment } from "./types";

// 회전 사각형. x, y는 회전하지 않은 사각형의 왼쪽 위 모서리(월드 m),
// rot은 중심을 기준으로 한 각도(°).
export interface OrientedRect {
  x: number;
  y: number;
  w: number;
  d: number;
  rot: number;
}

export function rectCenter(r: OrientedRect): Vec2 {
  return { x: r.x + r.w / 2, y: r.y + r.d / 2 };
}

const rad = (deg: number) => (deg * Math.PI) / 180;

// 월드 점을 사각형 로컬 좌표(중심 원점, 회전 제거)로 변환합니다.
export function worldToLocal(r: OrientedRect, p: Vec2): Vec2 {
  const c = rectCenter(r);
  const a = -rad(r.rot); // 회전을 되돌린다
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return {
    x: dx * Math.cos(a) - dy * Math.sin(a),
    y: dx * Math.sin(a) + dy * Math.cos(a),
  };
}

// 점이 회전 사각형 안에 있는지. 보이는 모양(회전된 사각형)과 일치합니다.
export function hitTest(r: OrientedRect, p: Vec2): boolean {
  const l = worldToLocal(r, p);
  return Math.abs(l.x) <= r.w / 2 && Math.abs(l.y) <= r.d / 2;
}

// 회전 사각형 네 꼭짓점(월드 좌표).
export function corners(r: OrientedRect): Vec2[] {
  const c = rectCenter(r);
  const a = rad(r.rot);
  const hw = r.w / 2;
  const hd = r.d / 2;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ].map(([x, y]) => ({ x: c.x + x * ca - y * sa, y: c.y + x * sa + y * ca }));
}

export interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// 회전 사각형을 감싸는 축 정렬 경계상자(월드 좌표).
export function rotatedAABB(r: OrientedRect): AABB {
  const cs = corners(r);
  const xs = cs.map((c) => c.x);
  const ys = cs.map((c) => c.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ── 다각형 (무대 모양) ──────────────────────────────────────────────────────

/** 다각형을 감싸는 축 정렬 경계상자. 무대 눈금과 화면 맞춤에 씁니다. */
export function polygonBounds(points: Vec2[]): AABB {
  if (!points.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

/** 여러 경계상자를 하나로 합칩니다. 내보내기 범위를 구할 때 씁니다. */
export function unionBounds(boxes: AABB[]): AABB {
  if (!boxes.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY)),
  };
}

/** 점이 다각형 안에 있는지(ray casting). */
export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const hit =
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || Number.EPSILON) + a.x;
    if (hit) inside = !inside;
  }
  return inside;
}

/** 점에서 다각형 둘레까지 가장 가까운 점. 경계 밖으로 나간 것을 되돌릴 때 씁니다. */
export function nearestPointOnPolygon(poly: Vec2[], p: Vec2): Vec2 {
  let best: Vec2 = poly[0] ?? { x: 0, y: 0 };
  let bestD = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j];
    const b = poly[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1);
    const q = { x: a.x + dx * t, y: a.y + dy * t };
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

/** 다각형의 무게중심(면적 가중). 이름을 찍을 자리와 안쪽 방향을 찾는 데 씁니다. */
export function polygonCentroid(poly: Vec2[]): Vec2 {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j];
    const b = poly[i];
    const cross = a.x * b.y - b.x * a.y;
    area += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (Math.abs(area) < 1e-12) {
    // 면적이 0에 가까우면(점이 한 줄로 늘어선 경우) 단순 평균으로 둡니다.
    const n = poly.length || 1;
    return {
      x: poly.reduce((s, q) => s + q.x, 0) / n,
      y: poly.reduce((s, q) => s + q.y, 0) / n,
    };
  }
  return { x: cx / (3 * area), y: cy / (3 * area) };
}

// ── 원호가 섞인 무대 모양 ────────────────────────────────────────────────────

/**
 * 원호 하나의 기하. 중심·반지름과 시작·끝 각도(라디안)로 나타냅니다.
 * canvas의 ctx.arc와 같은 뜻의 ccw를 함께 줍니다.
 */
export interface ArcGeom {
  cx: number;
  cy: number;
  r: number;
  a0: number;
  a1: number;
  ccw: boolean;
}

/** 부푼 거리가 이보다 작으면 직선으로 봅니다(m). */
export const BULGE_EPS = 1e-6;

/** 기본 허용오차(m). 이보다 촘촘하면 눈으로 구분되지 않습니다. */
export const TESSELLATE_TOLERANCE_M = 0.05;

/**
 * 변 a→b의 단위 법선. 부푼 거리의 부호 기준입니다.
 *
 * 양수 bulgeM은 호의 중점을 현의 중점에서 이 방향으로 밀어냅니다. 템플릿은
 * 화면 좌표(y가 아래쪽)에서 시계 방향으로 감겨 있어 양수가 무대 바깥쪽입니다.
 * 음수는 오목입니다.
 */
export function edgeNormal(a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dy / len, y: -dx / len };
}

/** 호의 중점(현의 중점에서 법선 방향으로 bulgeM만큼). 손잡이 자리로 씁니다. */
export function arcMidpoint(a: Vec2, b: Vec2, bulgeM: number): Vec2 {
  const n = edgeNormal(a, b);
  return {
    x: (a.x + b.x) / 2 + n.x * bulgeM,
    y: (a.y + b.y) / 2 + n.y * bulgeM,
  };
}

/**
 * 현 두 점과 부푼 거리로 원호를 구합니다. bulgeM이 0에 가까우면 직선이라 null입니다.
 *
 * 현의 절반을 h, 부푼 거리를 s라 하면 반지름은 (h² + s²) / 2|s| 입니다.
 * 중심은 현의 중점에서 법선 반대쪽으로 (R − |s|)만큼 간 곳입니다.
 * |s| = h인 반원에서는 반지름이 h이고 중심이 현의 중점과 겹칩니다.
 */
export function arcFromBulge(a: Vec2, b: Vec2, bulgeM: number): ArcGeom | null {
  if (!Number.isFinite(bulgeM) || Math.abs(bulgeM) < BULGE_EPS) return null;
  const chord = Math.hypot(b.x - a.x, b.y - a.y);
  if (chord < BULGE_EPS) return null;
  const h = chord / 2;
  const s = bulgeM;
  const r = (h * h + s * s) / (2 * Math.abs(s));
  const n = edgeNormal(a, b);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const back = (r - Math.abs(s)) * Math.sign(s);
  const cx = mx - n.x * back;
  const cy = my - n.y * back;
  return {
    cx,
    cy,
    r,
    a0: Math.atan2(a.y - cy, a.x - cx),
    a1: Math.atan2(b.y - cy, b.x - cx),
    // 양수는 법선(바깥) 쪽으로 부풀고, 화면 좌표에서 그 방향은 시계 방향입니다.
    ccw: s < 0,
  };
}

/** 허용오차를 지키는 분할 수. 선분이 호에서 벗어나는 최대 거리는 R(1 − cos(θ/2))입니다. */
function arcSteps(r: number, sweep: number, toleranceM: number): number {
  const tol = Math.max(1e-4, toleranceM);
  if (tol >= r) return 2;
  const theta = 2 * Math.acos(1 - tol / r);
  if (!Number.isFinite(theta) || theta <= 0) return 2;
  return Math.max(2, Math.min(512, Math.ceil(Math.abs(sweep) / theta)));
}

/** 호가 도는 각도. ccw는 각도가 줄어드는 방향입니다. */
function arcSweep(g: ArcGeom): number {
  let sweep = g.a1 - g.a0;
  if (g.ccw) {
    while (sweep > 0) sweep -= Math.PI * 2;
    while (sweep <= -Math.PI * 2) sweep += Math.PI * 2;
  } else {
    while (sweep < 0) sweep += Math.PI * 2;
    while (sweep >= Math.PI * 2) sweep -= Math.PI * 2;
  }
  return sweep;
}

/** 호를 선분 끝점들로 폅니다. 시작점은 빼고 끝점까지 돌려줍니다. */
function arcPoints(g: ArcGeom, toleranceM: number): Vec2[] {
  const sweep = arcSweep(g);
  const n = arcSteps(g.r, sweep, toleranceM);
  const out: Vec2[] = [];
  for (let i = 1; i <= n; i++) {
    const t = g.a0 + (sweep * i) / n;
    out.push({ x: g.cx + Math.cos(t) * g.r, y: g.cy + Math.sin(t) * g.r });
  }
  return out;
}

/** 변 번호로 원호를 찾습니다. 변 i는 꼭짓점 i에서 i+1로 갑니다. */
export function arcOnEdge(shape: StageShape, edgeIdx: number): ArcSegment | undefined {
  return shape.arcs?.find((a) => a.fromIdx === edgeIdx);
}

/**
 * 무대 모양을 실제 선분 배열로 폅니다. **무대 모양의 단일 진실입니다.**
 * 그리기, 히트테스트, 경계 제한, 내보내기가 모두 이 함수를 거칩니다.
 */
export function tessellate(
  shape: StageShape,
  toleranceM: number = TESSELLATE_TOLERANCE_M,
): Vec2[] {
  const pts = shape.points;
  const n = pts.length;
  if (n < 2 || !shape.arcs?.length) return pts.map((p) => ({ ...p }));

  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    out.push({ ...a });
    const arc = arcOnEdge(shape, i);
    if (!arc) continue;
    const g = arcFromBulge(a, b, arc.bulgeM);
    if (!g) continue;
    // 끝점 b는 다음 반복이 다시 넣으므로 여기서는 뺍니다.
    const seg = arcPoints(g, toleranceM);
    seg.pop();
    out.push(...seg);
  }
  return out;
}

/** 원호까지 반영한 무대 경계상자. polygonBounds(shape.points)를 대신합니다. */
export function shapeBounds(
  shape: StageShape,
  toleranceM: number = TESSELLATE_TOLERANCE_M,
): AABB {
  return polygonBounds(tessellate(shape, toleranceM));
}

/** 점이 무대 안에 있는지. 원호를 반영합니다. */
export function pointInShape(p: Vec2, shape: StageShape): boolean {
  return pointInPolygon(p, tessellate(shape));
}

/**
 * 회전 사각형을 무대 안으로 되돌립니다.
 *
 * 규칙은 **중심 기준**입니다. 먼저 경계상자를 무대 경계상자 안으로 밀고, 그래도
 * 중심이 무대 밖이면 가장 가까운 둘레 점에서 안쪽으로 조금 들인 자리로 옮깁니다.
 * 오목한 변이나 호 근처에서는 모서리가 조금 걸칠 수 있습니다(SPEC 11장).
 */
export function clampToShape(
  r: OrientedRect,
  shape: StageShape,
): { x: number; y: number } {
  const poly = tessellate(shape);
  const stage = polygonBounds(poly);
  const box = rotatedAABB(r);
  let x = r.x;
  let y = r.y;

  // x축: 사각형이 무대보다 넓으면 왼쪽(최소)에 맞춥니다.
  const spanX = box.maxX - box.minX;
  const stageW = stage.maxX - stage.minX;
  if (spanX >= stageW || box.minX < stage.minX) {
    x += stage.minX - box.minX;
  } else if (box.maxX > stage.maxX) {
    x -= box.maxX - stage.maxX;
  }

  const spanY = box.maxY - box.minY;
  const stageD = stage.maxY - stage.minY;
  if (spanY >= stageD || box.minY < stage.minY) {
    y += stage.minY - box.minY;
  } else if (box.maxY > stage.maxY) {
    y -= box.maxY - stage.maxY;
  }

  // 무대보다 큰 장비는 중심이 무대 안에 들어올 수 없습니다. 왼쪽 위 정렬로 둡니다.
  if (spanX >= stageW || spanY >= stageD) return { x, y };

  const center = { x: x + r.w / 2, y: y + r.d / 2 };
  if (pointInPolygon(center, poly)) return { x, y };

  // 둘레에서 가장 가까운 점을 찾아 무게중심 쪽으로 1cm 들입니다.
  const edge = nearestPointOnPolygon(poly, center);
  const inward = polygonCentroid(poly);
  const dx = inward.x - edge.x;
  const dy = inward.y - edge.y;
  const len = Math.hypot(dx, dy);
  const INSET = 0.01;
  const target =
    len < 1e-9 ? edge : { x: edge.x + (dx / len) * INSET, y: edge.y + (dy / len) * INSET };
  return { x: target.x - r.w / 2, y: target.y - r.d / 2 };
}
