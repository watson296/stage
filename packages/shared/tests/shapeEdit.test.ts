import { describe, it, expect } from "vitest";
import {
  removeVertex,
  insertVertex,
  setBulge,
  moveVertex,
  MIN_VERTICES,
} from "../src/model/shapeEdit";
import { tessellate, shapeBounds } from "../src/model/geometry";
import { rectStage, type StageShape } from "../src/model/types";

/** 꼭짓점 5개. 변 i는 꼭짓점 i → i+1 입니다. */
const five = (): StageShape => ({
  points: [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 4 },
    { x: 2, y: 6 },
    { x: 0, y: 4 },
  ],
});

describe("setBulge", () => {
  it("원호를 끼운다", () => {
    const s = setBulge(rectStage(10, 6), 2, 1.5);
    expect(s.arcs).toEqual([{ fromIdx: 2, toIdx: 3, bulgeM: 1.5 }]);
  });

  it("마지막 변은 0번 꼭짓점으로 닫힌다", () => {
    const s = setBulge(rectStage(10, 6), 3, 0.5);
    expect(s.arcs).toEqual([{ fromIdx: 3, toIdx: 0, bulgeM: 0.5 }]);
  });

  it("같은 변에 다시 넣으면 값만 바뀐다", () => {
    const s = setBulge(setBulge(rectStage(10, 6), 1, 1), 1, -2);
    expect(s.arcs).toEqual([{ fromIdx: 1, toIdx: 2, bulgeM: -2 }]);
  });

  it("0을 주면 그 원호를 지워 직선으로 되돌린다", () => {
    const withArc = setBulge(rectStage(10, 6), 2, 1.5);
    const straight = setBulge(withArc, 2, 0);
    expect(straight.arcs).toBeUndefined();
    expect(tessellate(straight)).toEqual(rectStage(10, 6).points);
  });

  it("다른 변의 원호는 남긴다", () => {
    let s = setBulge(rectStage(10, 6), 0, 1);
    s = setBulge(s, 2, 2);
    s = setBulge(s, 0, 0);
    expect(s.arcs).toEqual([{ fromIdx: 2, toIdx: 3, bulgeM: 2 }]);
  });

  it("변 번호는 접어서 받는다", () => {
    const s = setBulge(rectStage(10, 6), 4, 1); // 4 → 0
    expect(s.arcs![0].fromIdx).toBe(0);
  });
});

describe("removeVertex — 원호 번호 보정", () => {
  it("뒤쪽 원호의 번호를 한 칸 내린다", () => {
    const s: StageShape = { ...five(), arcs: [{ fromIdx: 3, toIdx: 4, bulgeM: 1 }] };
    const out = removeVertex(s, 1);
    expect(out.points).toHaveLength(4);
    expect(out.arcs).toEqual([{ fromIdx: 2, toIdx: 3, bulgeM: 1 }]);
  });

  it("지운 꼭짓점보다 앞에 있는 원호는 그대로 둔다", () => {
    const s: StageShape = { ...five(), arcs: [{ fromIdx: 0, toIdx: 1, bulgeM: 1 }] };
    const out = removeVertex(s, 3);
    expect(out.arcs).toEqual([{ fromIdx: 0, toIdx: 1, bulgeM: 1 }]);
  });

  it("지운 꼭짓점에서 나가는 변의 원호는 버린다", () => {
    const s: StageShape = { ...five(), arcs: [{ fromIdx: 2, toIdx: 3, bulgeM: 1 }] };
    expect(removeVertex(s, 2).arcs).toBeUndefined();
  });

  it("지운 꼭짓점으로 들어오는 변의 원호도 버린다", () => {
    const s: StageShape = { ...five(), arcs: [{ fromIdx: 1, toIdx: 2, bulgeM: 1 }] };
    expect(removeVertex(s, 2).arcs).toBeUndefined();
  });

  it("0번을 지우면 마지막 변(n-1 → 0)의 원호를 버리고 나머지를 내린다", () => {
    const s: StageShape = {
      ...five(),
      arcs: [
        { fromIdx: 4, toIdx: 0, bulgeM: 1 }, // 0번으로 들어오는 변 → 버림
        { fromIdx: 2, toIdx: 3, bulgeM: 2 }, // 남아서 1번으로 내려감
      ],
    };
    const out = removeVertex(s, 0);
    expect(out.points[0]).toEqual({ x: 4, y: 0 });
    expect(out.arcs).toEqual([{ fromIdx: 1, toIdx: 2, bulgeM: 2 }]);
  });

  it("마지막 꼭짓점을 지우면 남은 원호가 새 길이로 닫힌다", () => {
    const s: StageShape = { ...five(), arcs: [{ fromIdx: 2, toIdx: 3, bulgeM: 2 }] };
    // 4번(마지막)을 지우면 변 2는 그대로지만 변 3이 0번으로 닫힙니다.
    const out = removeVertex(s, 4);
    expect(out.points).toHaveLength(4);
    expect(out.arcs).toEqual([{ fromIdx: 2, toIdx: 3, bulgeM: 2 }]);
  });

  it("남은 원호의 toIdx가 항상 fromIdx + 1(mod n)이다", () => {
    const s: StageShape = {
      ...five(),
      arcs: [
        { fromIdx: 0, toIdx: 1, bulgeM: 1 },
        { fromIdx: 3, toIdx: 4, bulgeM: 1 },
        { fromIdx: 4, toIdx: 0, bulgeM: 1 },
      ],
    };
    for (let i = 0; i < 5; i++) {
      const out = removeVertex(s, i);
      const n = out.points.length;
      for (const a of out.arcs ?? []) {
        expect(a.fromIdx).toBeGreaterThanOrEqual(0);
        expect(a.fromIdx).toBeLessThan(n);
        expect(a.toIdx).toBe((a.fromIdx + 1) % n);
      }
    }
  });

  it("지운 뒤에도 tessellate가 깨지지 않는다", () => {
    const s: StageShape = {
      ...five(),
      arcs: [{ fromIdx: 3, toIdx: 4, bulgeM: 1 }],
    };
    const out = removeVertex(s, 1);
    const pts = tessellate(out, 0.01);
    expect(pts.length).toBeGreaterThan(4);
    for (const p of pts) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
    const b = shapeBounds(out);
    expect(Number.isFinite(b.maxX)).toBe(true);
  });

  it("꼭짓점이 세 개면 더 지우지 않는다", () => {
    const tri: StageShape = { points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 2 }] };
    expect(removeVertex(tri, 0)).toBe(tri);
    expect(tri.points).toHaveLength(MIN_VERTICES);
  });

  it("범위 밖 번호는 무시한다", () => {
    const s = five();
    expect(removeVertex(s, 9)).toBe(s);
    expect(removeVertex(s, -1)).toBe(s);
    expect(removeVertex(s, 1.5)).toBe(s);
  });
});

describe("insertVertex", () => {
  it("변 중간에 꼭짓점을 끼우고 뒤쪽 원호 번호를 올린다", () => {
    const s: StageShape = { ...five(), arcs: [{ fromIdx: 3, toIdx: 4, bulgeM: 1 }] };
    const out = insertVertex(s, 0, { x: 2, y: 0 });
    expect(out.points).toHaveLength(6);
    expect(out.points[1]).toEqual({ x: 2, y: 0 });
    expect(out.arcs).toEqual([{ fromIdx: 4, toIdx: 5, bulgeM: 1 }]);
  });

  it("쪼갠 변의 원호는 버린다", () => {
    const s: StageShape = { ...five(), arcs: [{ fromIdx: 1, toIdx: 2, bulgeM: 1 }] };
    expect(insertVertex(s, 1, { x: 4, y: 2 }).arcs).toBeUndefined();
  });

  it("마지막 변에 끼우면 맨 끝에 붙는다", () => {
    const out = insertVertex(rectStage(10, 6), 3, { x: 0, y: 3 });
    expect(out.points).toHaveLength(5);
    expect(out.points[4]).toEqual({ x: 0, y: 3 });
  });
});

describe("moveVertex", () => {
  it("꼭짓점을 옮기고 원호는 그대로 둔다", () => {
    const s: StageShape = { ...five(), arcs: [{ fromIdx: 0, toIdx: 1, bulgeM: 1 }] };
    const out = moveVertex(s, 2, { x: 9, y: 9 });
    expect(out.points[2]).toEqual({ x: 9, y: 9 });
    expect(out.arcs).toEqual([{ fromIdx: 0, toIdx: 1, bulgeM: 1 }]);
  });

  it("없는 번호는 무시한다", () => {
    const s = five();
    expect(moveVertex(s, 9, { x: 1, y: 1 })).toBe(s);
  });
});
