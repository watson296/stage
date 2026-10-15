import { describe, it, expect } from "vitest";
import { migrate } from "../src/model/migrate";
import { SCHEMA_VERSION } from "../src/model/types";
import { polygonBounds } from "../src/model/geometry";

const v1Doc = {
  version: 1,
  stage: { w: 10, d: 7, h: 5 },
  objects: [
    { id: 1, type: "drumkit", name: "드럼킷", x: 2, y: 2, z: 0,
      w: 1.8, d: 1.5, h: 1.2, rot: 0, color: "#e74c3c", emoji: "🥁", label: "" },
  ],
  postits: [
    { id: 10, x: 4.1, y: 2, nm: "김드럼", role: "드럼", color: "#f1c40f", con: 1 },
  ],
  customTypes: {
    ci_1: { name: "DI박스", w: 0.2, d: 0.2, h: 0.1, color: "#8e44ad", e: "🎛️" },
  },
};

describe("migrate: 버전 올리기", () => {
  it("v1을 v2 Event로 감싼다", () => {
    const { event } = migrate(v1Doc);
    expect(event.version).toBe(SCHEMA_VERSION);
    expect(event.stagePlans).toHaveLength(1);
    expect(event.timetable.items).toEqual([]);
    expect(event.notices).toEqual([]);
  });

  it("사각 무대 w·d를 네 점 다각형으로 바꾼다", () => {
    const { event } = migrate(v1Doc);
    const pts = event.stagePlans[0].stage.points;
    expect(pts).toHaveLength(4);
    const b = polygonBounds(pts);
    expect(b.maxX - b.minX).toBeCloseTo(10, 6);
    expect(b.maxY - b.minY).toBeCloseTo(7, 6);
  });

  it("버전 없는 JSON도 v2로 올린다", () => {
    const { event } = migrate({ stage: { w: 8, d: 6 }, objects: [], postits: [] });
    expect(event.version).toBe(SCHEMA_VERSION);
  });
});

describe("migrate: 장비", () => {
  it("id를 문자열로 바꾸고 치수로 variant를 찾는다", () => {
    const { event } = migrate(v1Doc);
    const o = event.stagePlans[0].objects[0];
    expect(typeof o.id).toBe("string");
    expect(o.variantId).toBe("5pc"); // 1.8 × 1.5 = 5기통
    expect(o.onStage).toBe(true);
  });

  it("커스텀 장비를 customEquipment로 옮긴다", () => {
    const { event } = migrate(v1Doc);
    expect(event.customEquipment.ci_1.name).toBe("DI박스");
    expect(event.customEquipment.ci_1.w).toBeCloseTo(0.2, 6);
  });
});

describe("migrate: 메모(옛 포스트잇)", () => {
  it("v1 메모는 좌표를 그대로 두고 nm을 text로 옮긴다", () => {
    const { event } = migrate(v1Doc);
    const n = event.stagePlans[0].notes[0];
    expect(n.text).toBe("김드럼");
    expect(n.x).toBeCloseTo(4.1, 6);
    expect(n.linkedObjectId).toBe("obj-1");
  });

  it("v0 메모(픽셀)는 연결된 장비 옆에 다시 놓는다", () => {
    const { event, warnings } = migrate({
      stage: { w: 8, d: 6 },
      objects: [{ id: 1, type: "drumkit", x: 2, y: 2, w: 1.8, d: 1.5, h: 1.2, rot: 0 }],
      postits: [{ id: 10, cx: 500, cy: 300, nm: "연결됨", role: "", color: "#f1c40f", con: 1 }],
    });
    const n = event.stagePlans[0].notes[0];
    expect(n.x).toBeCloseTo(2 + 1.8 + 0.3, 6);
    expect(n.y).toBeCloseTo(2, 6);
    expect(warnings.some((w) => w.includes("포스트잇"))).toBe(true);
  });

  it("v0 메모에 연결이 없으면 무대 범위 안에 둔다", () => {
    const { event } = migrate({
      stage: { w: 8, d: 6 },
      objects: [],
      postits: [{ id: 11, cx: 900, cy: 700, nm: "없음", role: "", color: "#3498db", con: null }],
    });
    const n = event.stagePlans[0].notes[0];
    expect(Math.abs(n.x)).toBeLessThan(8); // 900px 같은 값이 아님
    expect(Math.abs(n.y)).toBeLessThan(8);
  });
});

describe("migrate: 검증·정제", () => {
  it("범위를 벗어난 좌표를 자른다", () => {
    const { event } = migrate({
      version: 1, stage: { w: 8, d: 6 }, postits: [],
      objects: [{ id: 1, type: "x", x: 999999, y: -999999, w: 1, d: 1, h: 1, rot: 0 }],
    });
    const o = event.stagePlans[0].objects[0];
    expect(o.x).toBeLessThanOrEqual(1000);
    expect(o.y).toBeGreaterThanOrEqual(-500);
  });

  it("긴 문자열은 길이를 제한한다", () => {
    const { event } = migrate({
      version: 1, stage: { w: 8, d: 6 }, objects: [],
      postits: [{ id: 1, x: 0, y: 0, nm: "가".repeat(500), role: "", color: "#f1c40f", con: null }],
    });
    expect(event.stagePlans[0].notes[0].text.length).toBeLessThanOrEqual(120);
  });

  it("잘못된 색은 기본값으로 바꾼다", () => {
    const { event } = migrate({
      version: 1, stage: { w: 8, d: 6 }, postits: [],
      objects: [{ id: 1, type: "x", x: 0, y: 0, w: 1, d: 1, h: 1, rot: 0, color: "javascript:alert(1)" }],
    });
    expect(event.stagePlans[0].objects[0].color).toMatch(/^#[0-9a-fA-F]{3,8}$/);
  });

  it("객체가 아닌 입력은 오류를 던진다", () => {
    expect(() => migrate(42)).toThrow();
    expect(() => migrate({ objects: "nope" })).toThrow();
  });
});

describe("migrate: v2 다시 읽기", () => {
  it("v2를 다시 넣어도 구조가 유지된다", () => {
    const { event } = migrate(v1Doc);
    const again = migrate(JSON.parse(JSON.stringify(event))).event;
    expect(again.version).toBe(SCHEMA_VERSION);
    expect(again.stagePlans[0].objects).toHaveLength(1);
    expect(again.stagePlans[0].notes[0].text).toBe("김드럼");
    expect(polygonBounds(again.stagePlans[0].stage.points).maxX).toBeCloseTo(10, 6);
  });

  it("접속 코드는 내보낸 값을 그대로 읽는다", () => {
    const { event } = migrate({
      version: 2, stagePlans: [],
      accessCodes: { operator: "123456", staff: "222222", display: "333333", rotatedAt: "" },
    });
    expect(event.accessCodes.operator).toBe("123456");
  });
});
