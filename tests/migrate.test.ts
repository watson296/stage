import { describe, it, expect } from "vitest";
import { migrate } from "../src/model/migrate";
import { SCHEMA_VERSION } from "../src/model/types";

describe("migrate: 버전 처리", () => {
  it("버전 없는 JSON을 v1으로 올린다", () => {
    const { doc } = migrate({ stage: { w: 10, d: 7, h: 5 }, objects: [], postits: [] });
    expect(doc.version).toBe(SCHEMA_VERSION);
    expect(doc.stage).toEqual({ w: 10, d: 7, h: 5 });
  });

  it("v1 JSON의 좌표는 그대로 둔다", () => {
    const { doc } = migrate({
      version: 1,
      stage: { w: 8, d: 6, h: 4 },
      objects: [],
      postits: [{ id: 5, x: 2.5, y: 3.5, nm: "김", role: "드럼", color: "#f1c40f", con: null }],
    });
    expect(doc.postits[0]).toMatchObject({ x: 2.5, y: 3.5, nm: "김", con: null });
    expect(doc.nextId).toBe(6);
  });
});

describe("migrate: 구버전 포스트잇 재배치", () => {
  const old = {
    stage: { w: 8, d: 6, h: 4 },
    objects: [{ id: 1, type: "drumkit", name: "드럼킷", x: 2, y: 2, z: 0, w: 1.8, d: 1.5, h: 1.2, rot: 0, color: "#e74c3c", e: "🥁", label: "" }],
    postits: [
      { id: 10, cx: 500, cy: 300, nm: "연결됨", role: "드럼", color: "#f1c40f", con: 1 },
      { id: 11, cx: 50, cy: 80, nm: "연결없음", role: "", color: "#3498db", con: null },
    ],
  };

  it("연결된 포스트잇은 장비 옆에 둔다", () => {
    const { doc } = migrate(old);
    const linked = doc.postits.find((p) => p.nm === "연결됨")!;
    expect(linked.con).toBe(1);
    // 장비(x=2, w=1.8) 오른쪽 + 0.3 = 4.1
    expect(linked.x).toBeCloseTo(4.1, 6);
    expect(linked.y).toBeCloseTo(2, 6);
  });

  it("연결 없는 포스트잇은 좌표가 픽셀이 아니라 무대 범위 안이다", () => {
    const { doc } = migrate(old);
    const free = doc.postits.find((p) => p.nm === "연결없음")!;
    expect(free.con).toBeNull();
    expect(Math.abs(free.x)).toBeLessThan(8); // 500px 같은 값이 아님
    expect(Math.abs(free.y)).toBeLessThan(8);
  });

  it("구버전 변환 시 경고를 남긴다", () => {
    const { warnings } = migrate(old);
    expect(warnings.some((w) => w.includes("포스트잇"))).toBe(true);
  });
});

describe("migrate: 검증·정제", () => {
  it("범위를 벗어난 좌표는 자른다", () => {
    const { doc } = migrate({
      version: 1,
      objects: [{ id: 1, type: "x", name: "a", x: 999999, y: -999999, z: 0, w: 1, d: 1, h: 1, rot: 0, color: "#fff" }],
      postits: [],
    });
    expect(doc.objects[0].x).toBeLessThanOrEqual(1000);
    expect(doc.objects[0].y).toBeGreaterThanOrEqual(-500);
  });

  it("긴 문자열은 길이를 제한한다", () => {
    const { doc } = migrate({
      version: 1,
      objects: [],
      postits: [{ id: 1, x: 0, y: 0, nm: "가".repeat(500), role: "", color: "#f1c40f", con: null }],
    });
    expect(doc.postits[0].nm.length).toBeLessThanOrEqual(120);
  });

  it("잘못된 색은 기본값으로 바꾼다", () => {
    const { doc } = migrate({
      version: 1,
      objects: [{ id: 1, type: "x", name: "a", x: 0, y: 0, z: 0, w: 1, d: 1, h: 1, rot: 0, color: "javascript:alert(1)" }],
      postits: [],
    });
    expect(doc.objects[0].color).toMatch(/^#[0-9a-fA-F]{3,8}$/);
  });

  it("커스텀 장비의 옛 e 필드를 emoji로 옮긴다", () => {
    const { doc } = migrate({
      version: 1,
      objects: [],
      postits: [],
      customTypes: { ci_1: { name: "DI박스", w: 0.2, d: 0.2, h: 0.1, color: "#8e44ad", e: "🎛️" } },
    });
    expect(doc.customTypes.ci_1.emoji).toBe("🎛️");
  });

  it("객체가 아닌 입력은 오류를 던진다", () => {
    expect(() => migrate(42)).toThrow();
    expect(() => migrate({ objects: "nope" })).toThrow();
  });
});
