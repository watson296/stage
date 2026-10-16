import { describe, it, expect } from "vitest";
import { TEMPLATES, templateById } from "../src/model/templates";
import { shapeBounds, tessellate, polygonCentroid } from "../src/model/geometry";

describe("무대 템플릿", () => {
  it("템플릿 7종이 있다", () => {
    expect(TEMPLATES).toHaveLength(7);
    expect(TEMPLATES.map((t) => t.id)).toEqual([
      "rect", "roundFront", "thrust", "round", "center", "lshape", "wings",
    ]);
  });

  it("모든 템플릿이 요청한 크기 안에 들어가는 다각형을 만든다", () => {
    for (const t of TEMPLATES) {
      const shape = t.build(12, 8);
      expect(shape.points.length).toBeGreaterThanOrEqual(3);
      // 원호까지 펴고 나서 판단합니다. 원호 근사는 2% 넘침까지 봅니다.
      // 원호까지 펴고 나서 판단합니다. 넘치면 안 됩니다.
      const b = shapeBounds(shape, 0.001);
      expect(b.minX).toBeGreaterThanOrEqual(-1e-3);
      expect(b.minY).toBeGreaterThanOrEqual(-1e-3);
      expect(b.maxX).toBeLessThanOrEqual(12 + 1e-3);
      expect(b.maxY).toBeLessThanOrEqual(8 + 1e-3);
    }
  });

  it("사각형은 네 점이고 무대를 꽉 채운다", () => {
    const shape = templateById("rect")!.build(10, 6);
    expect(shape.points).toHaveLength(4);
    expect(shape.arcs).toBeUndefined();
    const b = shapeBounds(shape);
    expect(b.maxX - b.minX).toBeCloseTo(10, 6);
    expect(b.maxY - b.minY).toBeCloseTo(6, 6);
  });

  it("돌출 무대는 앞으로 튀어나온 부분이 있다(꼭짓점 8개)", () => {
    expect(templateById("thrust")!.build(10, 6).points).toHaveLength(8);
  });

  it("원형과 중앙 무대는 객석이 사방이다", () => {
    expect(templateById("round")!.audienceDir).toBe("all");
    expect(templateById("center")!.audienceDir).toBe("all");
  });

  it("날개 무대는 좌우로 날개가 나와 있다(꼭짓점 12개)", () => {
    expect(templateById("wings")!.build(10, 6).points).toHaveLength(12);
  });

  it("없는 id는 undefined", () => {
    expect(templateById("nope")).toBeUndefined();
  });
});

describe("원호를 쓰는 템플릿", () => {
  it("앞이 둥근 무대는 꼭짓점 4개 + 앞 변 원호 1개다", () => {
    const shape = templateById("roundFront")!.build(10, 6);
    expect(shape.points).toHaveLength(4);
    expect(shape.arcs).toHaveLength(1);
    expect(shape.arcs![0].fromIdx).toBe(2); // 앞 변
    expect(shape.arcs![0].toIdx).toBe(3);
    expect(shape.arcs![0].bulgeM).toBeGreaterThan(0); // 바깥으로 부품
  });

  it("앞이 둥근 무대는 펴고 나면 요청한 깊이에 닿는다", () => {
    const b = shapeBounds(templateById("roundFront")!.build(10, 6), 0.001);
    expect(b.maxY).toBeCloseTo(6, 2);
    expect(b.maxX - b.minX).toBeCloseTo(10, 6);
  });

  it("원형 무대는 꼭짓점 4개 + 사분원 4개다", () => {
    const shape = templateById("round")!.build(8, 8);
    expect(shape.points).toHaveLength(4);
    expect(shape.arcs).toHaveLength(4);
    for (const a of shape.arcs!) expect(a.bulgeM).toBeGreaterThan(0);
  });

  it("가로 = 세로인 원형 무대는 정확한 원이다", () => {
    const shape = templateById("round")!.build(8, 8);
    const pts = tessellate(shape, 0.0005);
    const c = polygonCentroid(pts);
    expect(c.x).toBeCloseTo(4, 3);
    expect(c.y).toBeCloseTo(4, 3);
    for (const p of pts) {
      expect(Math.hypot(p.x - 4, p.y - 4)).toBeCloseTo(4, 6);
    }
    const b = shapeBounds(shape, 0.0005);
    expect(b.maxX - b.minX).toBeCloseTo(8, 6);
    expect(b.maxY - b.minY).toBeCloseTo(8, 6);
  });

  it("가로 ≠ 세로인 원형 무대는 요청한 크기를 넘지 않는다", () => {
    for (const [w, d] of [[12, 8], [10, 6], [12, 4], [4, 12]] as const) {
      const b = shapeBounds(templateById("round")!.build(w, d), 0.0005);
      expect(b.minX).toBeGreaterThanOrEqual(-1e-3);
      expect(b.minY).toBeGreaterThanOrEqual(-1e-3);
      expect(b.maxX).toBeLessThanOrEqual(w + 1e-3);
      expect(b.maxY).toBeLessThanOrEqual(d + 1e-3);
      // 축 끝점은 꼭짓점이라 가로·세로는 요청값에 닿습니다.
      expect(b.maxX - b.minX).toBeCloseTo(w, 3);
      expect(b.maxY - b.minY).toBeCloseTo(d, 3);
    }
  });

  it("템플릿을 다시 적용해도 무대가 자라지 않는다", () => {
    // 적용 → stageSize → 다시 적용을 반복해도 크기가 그대로여야 합니다.
    for (const id of ["round", "roundFront"]) {
      let w = 12;
      let d = 4;
      for (let i = 0; i < 5; i++) {
        const b = shapeBounds(templateById(id)!.build(w, d), 0.0005);
        w = b.maxX - b.minX;
        d = b.maxY - b.minY;
      }
      expect(w).toBeCloseTo(12, 2);
      expect(d).toBeCloseTo(4, 2);
    }
  });

  it("원호를 쓰는 템플릿도 꼭짓점 수가 편집할 만큼 적다", () => {
    for (const id of ["roundFront", "round"]) {
      expect(templateById(id)!.build(12, 8).points.length).toBeLessThanOrEqual(4);
    }
  });
});

describe("기본 허용오차로도 크기가 지켜진다", () => {
  // 앱은 shapeBounds를 기본 허용오차로 부릅니다. 느슨하면 곡선 끝이 덜 잡혀
  // 무대가 실제보다 작게 측정되고, 그 값으로 템플릿을 다시 만들면 줄어듭니다.
  it("템플릿을 다섯 번 다시 적용해도 크기가 유지된다", () => {
    for (const id of ["round", "roundFront"]) {
      let w = 12;
      let d = 8;
      for (let i = 0; i < 5; i++) {
        const b = shapeBounds(templateById(id)!.build(w, d)); // 기본 허용오차
        w = b.maxX - b.minX;
        d = b.maxY - b.minY;
      }
      expect(w).toBeCloseTo(12, 1);
      expect(d).toBeCloseTo(8, 1);
    }
  });

  it("기본 허용오차로 잰 크기가 요청값과 0.02m 안에서 맞는다", () => {
    for (const id of ["round", "roundFront"]) {
      const b = shapeBounds(templateById(id)!.build(10, 6));
      expect(b.maxX - b.minX).toBeCloseTo(10, 1);
      expect(Math.abs(b.maxY - b.minY - 6)).toBeLessThan(0.02);
    }
  });
});
