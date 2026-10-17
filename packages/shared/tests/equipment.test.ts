import { describe, it, expect } from "vitest";
import { EQUIPMENT, CATEGORIES, PALETTE_GROUPS, defaultVariant, findVariant } from "../src/model/equipment";

/**
 * 확정된 규격이 조용히 흐트러지지 않게 표 그대로 묶어 둡니다(SPEC 6.2).
 * 패치에 없어 따로 정한 네 가지입니다.
 */
const CONFIRMED: Record<string, [string, string, number, number, number][]> = {
  diBox: [
    ["passive", "패시브", 0.12, 0.08, 0.05],
    ["active", "액티브(배터리)", 0.14, 0.09, 0.06],
  ],
  guitarStand: [
    ["a", "A자형", 0.3, 0.3, 1.0],
    ["multi3", "멀티 스탠드(3단)", 0.5, 0.4, 1.0],
  ],
  person: [["std", "기본", 0.5, 0.5, 1.7]],
  powerBox: [
    ["small", "소형 분전반", 0.3, 0.2, 0.15],
    ["distro", "대형 디스트로", 0.5, 0.35, 0.25],
  ],
};

describe("새로 넣은 장비 4종의 확정 규격", () => {
  for (const [key, rows] of Object.entries(CONFIRMED)) {
    it(`${key}: 규격 ${rows.length}개가 표와 같다`, () => {
      const t = EQUIPMENT[key];
      expect(t, `${key}가 없습니다`).toBeDefined();
      expect(t.variants).toHaveLength(rows.length);
      t.variants.forEach((v, i) => {
        const [id, label, w, d, h] = rows[i];
        expect(v.id).toBe(id);
        expect(v.label).toBe(label);
        expect([v.w, v.d, v.h]).toEqual([w, d, h]);
      });
    });
  }

  it("사람은 규격이 하나다(연주자·스태프는 레이블로 구분)", () => {
    expect(EQUIPMENT.person.variants).toHaveLength(1);
    expect(defaultVariant("person")).toMatchObject({ w: 0.5, d: 0.5, h: 1.7 });
  });

  it("치수로 규격을 되찾을 수 있다", () => {
    expect(findVariant("powerBox", 0.5, 0.35)?.id).toBe("distro");
    expect(findVariant("diBox", 0.12, 0.08)?.id).toBe("passive");
  });
});

describe("장비 라이브러리 전체", () => {
  it("15종이고 모두 규격을 하나 이상 가진다", () => {
    const keys = Object.keys(EQUIPMENT);
    expect(keys).toHaveLength(15);
    for (const k of keys) {
      expect(EQUIPMENT[k].variants.length, k).toBeGreaterThanOrEqual(1);
      for (const v of EQUIPMENT[k].variants) {
        expect(v.w, `${k}/${v.id} 가로`).toBeGreaterThan(0);
        expect(v.d, `${k}/${v.id} 세로`).toBeGreaterThan(0);
        expect(v.h, `${k}/${v.id} 높이`).toBeGreaterThan(0);
      }
    }
  });

  it("규격 id가 장비 안에서 겹치지 않는다", () => {
    for (const [k, t] of Object.entries(EQUIPMENT)) {
      const ids = t.variants.map((v) => v.id);
      expect(new Set(ids).size, k).toBe(ids.length);
    }
  });

  it("분류는 셋이고 모든 장비가 그 안에 든다", () => {
    expect(Object.keys(CATEGORIES)).toEqual(["inst", "audio", "stage"]);
    for (const [k, t] of Object.entries(EQUIPMENT)) {
      expect(CATEGORIES[t.cat], k).toBeDefined();
    }
  });

  it("팔레트가 모든 장비를 한 번씩 담는다", () => {
    const listed = PALETTE_GROUPS.flatMap((g) => g.types);
    expect(new Set(listed).size).toBe(listed.length);
    expect(listed.sort()).toEqual(Object.keys(EQUIPMENT).sort());
  });
});
