import { describe, it, expect } from "vitest";
import {
  arcFromBulge,
  arcMidpoint,
  edgeNormal,
  tessellate,
  shapeBounds,
  pointInPolygon,
  pointInShape,
  nearestPointOnPolygon,
  polygonCentroid,
  clampToShape,
  type OrientedRect,
} from "../src/model/geometry";
import { rectStage, type StageShape, type Vec2 } from "../src/model/types";

const P = (x: number, y: number): Vec2 => ({ x, y });

/** 선분 배열의 길이 합 (닫힌 다각형). */
function perimeter(pts: Vec2[]): number {
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

describe("edgeNormal / arcMidpoint", () => {
  // 사각 템플릿은 (0,0) (w,0) (w,d) (0,d) 순서라 화면 좌표(y가 아래)에서 시계
  // 방향입니다. 변 0은 뒤쪽(y=0)이므로 법선은 위(-y)를 가리키고, 그게 무대
  // 바깥쪽입니다. 앞 변(변 2)은 반대로 아래(+y)가 바깥쪽입니다.
  it("오른쪽으로 가는 변의 법선은 위쪽(-y)이다", () => {
    const n = edgeNormal(P(0, 0), P(2, 0));
    expect(n.x).toBeCloseTo(0, 9);
    expect(n.y).toBeCloseTo(-1, 9);
  });

  it("사각 무대의 모든 변에서 법선이 바깥을 가리킨다", () => {
    const pts = rectStage(10, 6).points;
    const c = polygonCentroid(pts);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const mid = arcMidpoint(a, b, 1); // 1m 바깥으로 민 점
      const chord = P((a.x + b.x) / 2, (a.y + b.y) / 2);
      // 밀어낸 점은 무게중심에서 더 멀어야 합니다.
      expect(Math.hypot(mid.x - c.x, mid.y - c.y)).toBeGreaterThan(
        Math.hypot(chord.x - c.x, chord.y - c.y),
      );
    }
  });

  it("양수는 법선 쪽으로, 음수는 반대쪽으로 부푼다", () => {
    expect(arcMidpoint(P(0, 0), P(2, 0), 0.5)).toEqual({ x: 1, y: -0.5 });
    expect(arcMidpoint(P(0, 0), P(2, 0), -0.5)).toEqual({ x: 1, y: 0.5 });
  });
});

describe("arcFromBulge", () => {
  it("부푼 거리가 0이면 직선이라 null", () => {
    expect(arcFromBulge(P(0, 0), P(2, 0), 0)).toBeNull();
  });

  it("부푼 거리가 현의 절반이면 반원: 반지름 = 절반, 중심 = 현의 중점", () => {
    const g = arcFromBulge(P(0, 0), P(4, 0), 2)!;
    expect(g).not.toBeNull();
    expect(g.r).toBeCloseTo(2, 9);
    expect(g.cx).toBeCloseTo(2, 9);
    expect(g.cy).toBeCloseTo(0, 9);
  });

  it("얕은 호는 반지름이 커지고 중심이 반대쪽 멀리 간다", () => {
    // h = 2, s = 0.5 → R = (4 + 0.25) / 1 = 4.25
    const g = arcFromBulge(P(0, 0), P(4, 0), 0.5)!;
    expect(g.r).toBeCloseTo(4.25, 9);
    expect(g.cy).toBeCloseTo(3.75, 9); // 법선(-y) 반대쪽
  });

  it("부호를 뒤집으면 중심이 반대편으로 간다", () => {
    const up = arcFromBulge(P(0, 0), P(4, 0), 0.5)!;
    const down = arcFromBulge(P(0, 0), P(4, 0), -0.5)!;
    expect(down.r).toBeCloseTo(up.r, 9);
    expect(down.cy).toBeCloseTo(-up.cy, 9);
    expect(down.ccw).toBe(true);
    expect(up.ccw).toBe(false);
  });
});

describe("tessellate", () => {
  const halfCircleShape = (r: number): StageShape => ({
    points: [P(0, 0), P(2 * r, 0)],
    arcs: [{ fromIdx: 0, toIdx: 1, bulgeM: r }],
  });

  it("호가 없으면 꼭짓점을 그대로 돌려준다", () => {
    const shape = rectStage(10, 6);
    expect(tessellate(shape)).toEqual(shape.points);
  });

  it("arcs가 빈 배열이어도 그대로 돌려준다", () => {
    expect(tessellate({ points: rectStage(4, 4).points, arcs: [] })).toHaveLength(4);
  });

  it("반원의 둘레가 πr + 지름에 수렴한다", () => {
    const r = 3;
    const pts = tessellate(halfCircleShape(r), 0.001);
    // 아래 반원 + 되돌아오는 지름
    expect(perimeter(pts)).toBeCloseTo(Math.PI * r + 2 * r, 2);
  });

  it("분할점이 모두 중심에서 반지름 거리에 있다", () => {
    const r = 3;
    const pts = tessellate(halfCircleShape(r), 0.01);
    // 중심은 (r, 0)
    for (const p of pts) {
      expect(Math.hypot(p.x - r, p.y - 0)).toBeCloseTo(r, 9);
    }
  });

  it("허용오차를 줄이면 점이 늘어난다", () => {
    const coarse = tessellate(halfCircleShape(3), 0.2).length;
    const fine = tessellate(halfCircleShape(3), 0.005).length;
    expect(fine).toBeGreaterThan(coarse);
  });

  it("선분이 호에서 벗어나는 최대 거리가 허용오차 이하다", () => {
    const r = 4;
    const tol = 0.02;
    const pts = tessellate(halfCircleShape(r), tol);
    const c = P(r, 0);
    let worst = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const mid = P((pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
      // 현의 중점은 호보다 중심에 가깝습니다. 그 차이가 벗어남입니다.
      worst = Math.max(worst, Math.abs(r - Math.hypot(mid.x - c.x, mid.y - c.y)));
    }
    expect(worst).toBeLessThanOrEqual(tol + 1e-9);
  });

  it("음수 부푼 거리는 오목하게 안쪽으로 들어온다", () => {
    const shape: StageShape = {
      points: rectStage(10, 6).points,
      arcs: [{ fromIdx: 2, toIdx: 3, bulgeM: -1 }], // 앞 변(y=6)이 안쪽으로
    };
    const b = shapeBounds(shape);
    expect(b.maxY).toBeCloseTo(6, 6); // 꼭짓점은 그대로 y=6
    // 앞 변 중앙은 안으로 1m 들어옵니다.
    expect(pointInShape(P(5, 5.5), shape)).toBe(false);
    expect(pointInShape(P(5, 4.5), shape)).toBe(true);
  });

  it("바깥으로 부푼 호는 경계상자를 넓힌다", () => {
    const shape: StageShape = {
      points: rectStage(10, 6).points,
      arcs: [{ fromIdx: 2, toIdx: 3, bulgeM: 2 }],
    };
    expect(shapeBounds(shape).maxY).toBeCloseTo(8, 1);
  });
});

describe("pointInPolygon / nearestPointOnPolygon / polygonCentroid", () => {
  const sq = [P(0, 0), P(4, 0), P(4, 4), P(0, 4)];

  it("안과 밖을 가린다", () => {
    expect(pointInPolygon(P(2, 2), sq)).toBe(true);
    expect(pointInPolygon(P(5, 2), sq)).toBe(false);
    expect(pointInPolygon(P(-0.1, 2), sq)).toBe(false);
    expect(pointInPolygon(P(3.99, 3.99), sq)).toBe(true);
  });

  it("오목한 다각형에서도 가린다", () => {
    // ㄷ 모양: 가운데가 파여 있음
    const c = [P(0, 0), P(4, 0), P(4, 1), P(1, 1), P(1, 3), P(4, 3), P(4, 4), P(0, 4)];
    expect(pointInPolygon(P(0.5, 2), c)).toBe(true);
    expect(pointInPolygon(P(3, 2), c)).toBe(false); // 파인 곳
  });

  it("가장 가까운 둘레 점을 찾는다", () => {
    expect(nearestPointOnPolygon(sq, P(6, 2))).toEqual({ x: 4, y: 2 });
    expect(nearestPointOnPolygon(sq, P(2, -3))).toEqual({ x: 2, y: 0 });
  });

  it("사각형의 무게중심은 가운데다", () => {
    const c = polygonCentroid(sq);
    expect(c.x).toBeCloseTo(2, 9);
    expect(c.y).toBeCloseTo(2, 9);
  });
});

describe("clampToShape (호가 든 무대)", () => {
  /** 반지름 4인 원형 무대(중심 4,4). 네 축 끝점 + 네 호. */
  const circle: StageShape = {
    points: [P(4, 0), P(8, 4), P(4, 8), P(0, 4)],
    arcs: [0, 1, 2, 3].map((i) => ({
      fromIdx: i,
      toIdx: (i + 1) % 4,
      // 사분원의 부푼 거리 = r(1 − cos45°)
      bulgeM: 4 * (1 - Math.SQRT1_2),
    })),
  };

  it("원형 무대의 경계상자는 지름과 같다", () => {
    const b = shapeBounds(circle, 0.001);
    expect(b.maxX - b.minX).toBeCloseTo(8, 2);
    expect(b.maxY - b.minY).toBeCloseTo(8, 2);
  });

  it("경계상자 안이지만 원 밖인 모서리에 둔 장비를 안으로 들인다", () => {
    // (0,0)은 경계상자 안이지만 원 밖입니다.
    const r: OrientedRect = { x: 0, y: 0, w: 1, d: 1, rot: 0 };
    const c = clampToShape(r, circle);
    const center = { x: c.x + 0.5, y: c.y + 0.5 };
    expect(pointInShape(center, circle)).toBe(true);
  });

  it("원 안에 있던 장비는 움직이지 않는다", () => {
    const r: OrientedRect = { x: 3.5, y: 3.5, w: 1, d: 1, rot: 0 };
    const c = clampToShape(r, circle);
    expect(c.x).toBeCloseTo(3.5, 9);
    expect(c.y).toBeCloseTo(3.5, 9);
  });

  it("오목한 무대의 파인 곳에 둔 장비도 안으로 들인다", () => {
    const concave: StageShape = {
      points: rectStage(10, 6).points,
      arcs: [{ fromIdx: 2, toIdx: 3, bulgeM: -2 }],
    };
    const r: OrientedRect = { x: 4.5, y: 5.2, w: 1, d: 1, rot: 0 };
    const c = clampToShape(r, concave);
    expect(pointInShape({ x: c.x + 0.5, y: c.y + 0.5 }, concave)).toBe(true);
  });

  it("무대보다 큰 장비는 왼쪽 위에 맞춘다", () => {
    const r: OrientedRect = { x: 5, y: 5, w: 20, d: 20, rot: 0 };
    const c = clampToShape(r, rectStage(8, 6));
    expect(c.x).toBeCloseTo(0, 6);
    expect(c.y).toBeCloseTo(0, 6);
  });
});
