import { describe, it, expect } from "vitest";
import { TEMPLATES, templateById } from "../src/model/templates";
import { polygonBounds } from "../src/model/geometry";

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
      const b = polygonBounds(shape.points);
      expect(b.minX).toBeGreaterThanOrEqual(-1e-6);
      expect(b.minY).toBeGreaterThanOrEqual(-1e-6);
      expect(b.maxX).toBeLessThanOrEqual(12 + 1e-6);
      expect(b.maxY).toBeLessThanOrEqual(8 + 1e-6);
    }
  });

  it("사각형은 네 점이고 무대를 꽉 채운다", () => {
    const b = polygonBounds(templateById("rect")!.build(10, 6).points);
    expect(templateById("rect")!.build(10, 6).points).toHaveLength(4);
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
