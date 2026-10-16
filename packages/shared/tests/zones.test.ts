import { describe, it, expect } from "vitest";
import {
  ZONE_KINDS,
  zoneKindInfo,
  zoneRect,
  zoneLabel,
  zoneAt,
  zoneCentroid,
  riserUnder,
  isZoneRectBigEnough,
  DEFAULT_ZONE_HEIGHT_M,
} from "../src/model/zones";
import { zoneNeedsHeight, ZONE_KIND_IDS, isZoneKind, type Zone } from "../src/model/types";

describe("구역 종류", () => {
  it("6종이 있고 types의 목록과 일치한다", () => {
    expect(ZONE_KINDS).toHaveLength(6);
    expect(ZONE_KINDS.map((z) => z.kind)).toEqual([...ZONE_KIND_IDS]);
  });

  it("라이저·단차만 무대 위이고 높이를 받는다", () => {
    for (const z of ZONE_KINDS) {
      expect(z.onStage).toBe(zoneNeedsHeight(z.kind));
    }
    expect(ZONE_KINDS.filter((z) => z.onStage).map((z) => z.kind)).toEqual([
      "riser",
      "level",
    ]);
  });

  it("종류마다 다른 색을 가진다", () => {
    expect(new Set(ZONE_KINDS.map((z) => z.color)).size).toBe(6);
  });

  it("모르는 종류는 걸러진다", () => {
    expect(isZoneKind("riser")).toBe(true);
    expect(isZoneKind("stage")).toBe(false);
    expect(isZoneKind(3)).toBe(false);
  });

  it("없는 종류를 물으면 첫 종류로 되돌린다", () => {
    expect(zoneKindInfo("없음" as never).kind).toBe("riser");
  });
});

describe("zoneRect", () => {
  it("끈 방향과 무관하게 같은 사각형을 만든다", () => {
    const a = zoneRect("z1", "foh", { x: 1, y: 1 }, { x: 4, y: 3 });
    const b = zoneRect("z1", "foh", { x: 4, y: 3 }, { x: 1, y: 1 });
    expect(a.polygon).toEqual(b.polygon);
    expect(a.polygon).toEqual([
      { x: 1, y: 1 },
      { x: 4, y: 1 },
      { x: 4, y: 3 },
      { x: 1, y: 3 },
    ]);
  });

  it("라이저는 기본 높이를 가지고 FOH는 높이가 없다", () => {
    expect(zoneRect("z", "riser", { x: 0, y: 0 }, { x: 2, y: 2 }).heightM).toBe(
      DEFAULT_ZONE_HEIGHT_M,
    );
    expect(zoneRect("z", "foh", { x: 0, y: 0 }, { x: 2, y: 2 }).heightM).toBeUndefined();
  });

  it("이름은 종류 이름으로 시작한다", () => {
    expect(zoneRect("z", "backstage", { x: 0, y: 0 }, { x: 2, y: 2 }).name).toBe(
      "대기실 동선",
    );
  });

  it("너무 작게 끈 것은 받지 않는다", () => {
    expect(isZoneRectBigEnough({ x: 0, y: 0 }, { x: 0.1, y: 2 })).toBe(false);
    expect(isZoneRectBigEnough({ x: 0, y: 0 }, { x: 2, y: 0.2 })).toBe(false);
    expect(isZoneRectBigEnough({ x: 0, y: 0 }, { x: 0.5, y: 0.5 })).toBe(true);
  });
});

describe("zoneLabel", () => {
  it("라이저는 높이를 함께 적는다", () => {
    const z = zoneRect("z", "riser", { x: 0, y: 0 }, { x: 2, y: 2 });
    z.name = "드럼 라이저";
    z.heightM = 0.4;
    expect(zoneLabel(z)).toBe("드럼 라이저 0.4m");
  });

  it("무대 밖 구역은 이름만 적는다", () => {
    const z = zoneRect("z", "audience", { x: 0, y: 0 }, { x: 2, y: 2 });
    expect(zoneLabel(z)).toBe("객석");
  });

  it("이름이 비면 종류 이름으로 적는다", () => {
    const z = zoneRect("z", "exit", { x: 0, y: 0 }, { x: 2, y: 2 });
    z.name = "";
    expect(zoneLabel(z)).toBe("출입구");
  });

  it("높이는 소수 둘째 자리까지 적는다", () => {
    const z = zoneRect("z", "level", { x: 0, y: 0 }, { x: 2, y: 2 });
    z.heightM = 0.123456;
    expect(zoneLabel(z)).toBe("단차 0.12m");
  });
});

describe("zoneAt / riserUnder", () => {
  const riser = zoneRect("z1", "riser", { x: 1, y: 1 }, { x: 4, y: 3 });
  const foh = zoneRect("z2", "foh", { x: 6, y: 6 }, { x: 8, y: 8 });
  const overlap = zoneRect("z3", "audience", { x: 2, y: 2 }, { x: 5, y: 5 });
  const zones: Zone[] = [riser, foh, overlap];

  it("점이 든 구역을 찾는다", () => {
    expect(zoneAt(zones, { x: 1.5, y: 1.5 })?.id).toBe("z1");
    expect(zoneAt(zones, { x: 7, y: 7 })?.id).toBe("z2");
    expect(zoneAt(zones, { x: 20, y: 20 })).toBeNull();
  });

  it("겹치면 나중에 만든 것을 고른다", () => {
    expect(zoneAt(zones, { x: 2.5, y: 2.5 })?.id).toBe("z3");
  });

  it("riserUnder는 높이 구역만 본다", () => {
    // 같은 자리에 객석 구역이 위에 있어도 라이저를 찾습니다.
    expect(riserUnder(zones, { x: 2.5, y: 2.5 })?.id).toBe("z1");
    expect(riserUnder(zones, { x: 7, y: 7 })).toBeNull();
    expect(riserUnder(zones, { x: 4.5, y: 4.5 })).toBeNull();
  });

  it("무게중심은 사각형 가운데다", () => {
    const c = zoneCentroid(riser);
    expect(c.x).toBeCloseTo(2.5, 9);
    expect(c.y).toBeCloseTo(2, 9);
  });
});
