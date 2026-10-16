// 무대 모양을 고치는 순수 함수들. 원호(ArcSegment)는 변 번호로 꼭짓점을
// 가리키므로, 꼭짓점을 더하거나 지울 때마다 번호를 다시 맞춰야 합니다.
// 그 보정을 한 곳에 모아 두고 테스트로 덮습니다.
import type { ArcSegment, StageShape, Vec2 } from "./types";
import { BULGE_EPS } from "./geometry";

/** 꼭짓점은 삼각형 아래로 줄이지 않습니다. */
export const MIN_VERTICES = 3;

/** 변 번호를 정규화합니다(음수와 넘침을 접습니다). */
function wrapEdge(i: number, n: number): number {
  return ((i % n) + n) % n;
}

function arcsOf(shape: StageShape): ArcSegment[] {
  return shape.arcs ?? [];
}

/** 원호 배열이 비면 필드를 아예 빼서 저장 파일을 깔끔하게 둡니다. */
function withArcs(points: Vec2[], arcs: ArcSegment[]): StageShape {
  return arcs.length ? { points, arcs } : { points };
}

/**
 * 변 하나의 부푼 거리를 정합니다. 0에 가까우면 그 원호를 지워 직선으로 만듭니다.
 * 변 edgeIdx는 꼭짓점 edgeIdx에서 edgeIdx+1로 가는 변입니다.
 */
export function setBulge(shape: StageShape, edgeIdx: number, bulgeM: number): StageShape {
  const n = shape.points.length;
  if (n < 2) return shape;
  const i = wrapEdge(edgeIdx, n);
  const rest = arcsOf(shape).filter((a) => a.fromIdx !== i);
  if (!Number.isFinite(bulgeM) || Math.abs(bulgeM) < BULGE_EPS) {
    return withArcs(shape.points, rest);
  }
  const next = [...rest, { fromIdx: i, toIdx: (i + 1) % n, bulgeM }];
  next.sort((a, b) => a.fromIdx - b.fromIdx);
  return withArcs(shape.points, next);
}

/**
 * 꼭짓점을 지웁니다.
 *
 * 지운 꼭짓점에 닿던 원호는 **버립니다**. 두 변이 하나로 합쳐지므로 어느 쪽
 * 부푼 거리를 물려받아야 할 근거가 없습니다. 남은 원호는 번호를 한 칸 내립니다.
 */
export function removeVertex(shape: StageShape, index: number): StageShape {
  const n = shape.points.length;
  if (n <= MIN_VERTICES) return shape;
  if (!Number.isInteger(index) || index < 0 || index >= n) return shape;

  const points = shape.points.filter((_, i) => i !== index);
  const m = points.length;
  // 지운 꼭짓점이 끝점인 변: index(앞으로 나가는 변)와 index-1(들어오는 변).
  const touching = new Set([index, wrapEdge(index - 1, n)]);
  const arcs = arcsOf(shape)
    .filter((a) => !touching.has(a.fromIdx))
    .map((a) => {
      const from = a.fromIdx > index ? a.fromIdx - 1 : a.fromIdx;
      return { fromIdx: from, toIdx: (from + 1) % m, bulgeM: a.bulgeM };
    });
  return withArcs(points, arcs);
}

/**
 * 변 edgeIdx의 중간에 꼭짓점을 끼웁니다. 새 꼭짓점의 번호는 edgeIdx + 1입니다.
 *
 * 쪼개진 변의 원호는 버립니다(한 원호를 두 개로 나누려면 각도를 반으로
 * 갈라야 하는데, 직선으로 두는 쪽이 예상에 가깝습니다). 뒤쪽 원호는 한 칸 올립니다.
 */
export function insertVertex(shape: StageShape, edgeIdx: number, at: Vec2): StageShape {
  const n = shape.points.length;
  if (n < 2) return shape;
  const i = wrapEdge(edgeIdx, n);
  const points = [...shape.points];
  points.splice(i + 1, 0, { x: at.x, y: at.y });
  const m = points.length;
  const arcs = arcsOf(shape)
    .filter((a) => a.fromIdx !== i)
    .map((a) => {
      const from = a.fromIdx > i ? a.fromIdx + 1 : a.fromIdx;
      return { fromIdx: from, toIdx: (from + 1) % m, bulgeM: a.bulgeM };
    });
  return withArcs(points, arcs);
}

/** 꼭짓점 하나를 옮깁니다. 원호 번호는 그대로입니다. */
export function moveVertex(shape: StageShape, index: number, at: Vec2): StageShape {
  if (!shape.points[index]) return shape;
  const points = shape.points.map((p, i) => (i === index ? { x: at.x, y: at.y } : p));
  return withArcs(points, arcsOf(shape).map((a) => ({ ...a })));
}

/** 변의 개수. 닫힌 다각형이라 꼭짓점 수와 같습니다. */
export function edgeCount(shape: StageShape): number {
  return shape.points.length;
}
