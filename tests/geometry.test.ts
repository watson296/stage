import { describe, it, expect } from "vitest";
import {
  hitTest,
  rotatedAABB,
  clampToStage,
  rectCenter,
  type OrientedRect,
} from "../src/model/geometry";

describe("hitTest", () => {
  it("회전하지 않은 사각형: 안/밖 판정", () => {
    const r: OrientedRect = { x: 1, y: 1, w: 2, d: 1, rot: 0 };
    expect(hitTest(r, { x: 2, y: 1.5 })).toBe(true); // 중심
    expect(hitTest(r, { x: 1.1, y: 1.1 })).toBe(true); // 모서리 근처 안쪽
    expect(hitTest(r, { x: 0.5, y: 1.5 })).toBe(false); // 왼쪽 밖
    expect(hitTest(r, { x: 2, y: 2.5 })).toBe(false); // 아래 밖
  });

  it("45° 회전: 축 정렬 상자에는 들지만 회전 사각형 밖인 점은 빗나감", () => {
    // 중심 (0,0), 한 변 2m 정사각형을 45° 돌림.
    const r: OrientedRect = { x: -1, y: -1, w: 2, d: 2, rot: 45 };
    expect(rectCenter(r)).toEqual({ x: 0, y: 0 });
    // 회전 사각형의 꼭짓점은 축을 따라 ±√2 ≈ 1.414 로 뻗는다.
    expect(hitTest(r, { x: 1.3, y: 0 })).toBe(true); // 꼭짓점 방향 안쪽
    // 모서리(1,1)는 원래 사각형 꼭짓점이지만 45° 회전 후에는 밖.
    expect(hitTest(r, { x: 0.95, y: 0.95 })).toBe(false);
  });

  it("90° 회전: w≠d 사각형의 세로/가로가 바뀐 모양으로 판정", () => {
    // 가로 4, 세로 1 사각형을 중심 (0,0)에 두고 90° 회전 → 세로로 길어짐.
    const r: OrientedRect = { x: -2, y: -0.5, w: 4, d: 1, rot: 90 };
    expect(hitTest(r, { x: 0, y: 1.8 })).toBe(true); // 세로로 길어진 방향 안쪽
    expect(hitTest(r, { x: 1.8, y: 0 })).toBe(false); // 원래 가로 방향은 이제 밖
  });
});

describe("rotatedAABB", () => {
  it("90° 회전한 사각형의 경계상자는 가로/세로가 뒤바뀐다", () => {
    const r: OrientedRect = { x: 0, y: 0, w: 4, d: 1, rot: 90 };
    const box = rotatedAABB(r);
    expect(box.maxX - box.minX).toBeCloseTo(1, 6);
    expect(box.maxY - box.minY).toBeCloseTo(4, 6);
  });

  it("0° 사각형의 경계상자는 사각형 그대로", () => {
    const r: OrientedRect = { x: 2, y: 3, w: 2, d: 1, rot: 0 };
    const box = rotatedAABB(r);
    expect(box.minX).toBeCloseTo(2, 6);
    expect(box.minY).toBeCloseTo(3, 6);
    expect(box.maxX).toBeCloseTo(4, 6);
    expect(box.maxY).toBeCloseTo(4, 6);
  });
});

describe("clampToStage", () => {
  it("무대 밖으로 나간 사각형을 안으로 들인다", () => {
    const r: OrientedRect = { x: -1, y: -2, w: 2, d: 2, rot: 0 };
    const c = clampToStage(r, 8, 6);
    expect(c.x).toBeCloseTo(0, 6);
    expect(c.y).toBeCloseTo(0, 6);
  });

  it("오른쪽/아래로 넘친 사각형을 경계에 맞춘다", () => {
    const r: OrientedRect = { x: 7.5, y: 5.5, w: 2, d: 2, rot: 0 };
    const c = clampToStage(r, 8, 6);
    expect(c.x).toBeCloseTo(6, 6);
    expect(c.y).toBeCloseTo(4, 6);
  });

  it("회전한 사각형은 회전된 경계상자 기준으로 가둔다", () => {
    // 4×1 사각형을 90° 회전하면 세로로 길어져(경계상자 1×4) y로 4m 필요.
    const r: OrientedRect = { x: -2, y: -0.5, w: 4, d: 1, rot: 90 };
    const c = clampToStage(r, 8, 6);
    const box = rotatedAABB({ ...r, x: c.x, y: c.y });
    expect(box.minX).toBeGreaterThanOrEqual(-1e-6);
    expect(box.minY).toBeGreaterThanOrEqual(-1e-6);
    expect(box.maxX).toBeLessThanOrEqual(8 + 1e-6);
    expect(box.maxY).toBeLessThanOrEqual(6 + 1e-6);
  });
});
