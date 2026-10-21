import { describe, it, expect } from "vitest";
import { migrate } from "../src/model/migrate";
import { emptyEvent, rectStage, SCHEMA_VERSION, type Zone } from "../src/model/types";

/** 자동 저장과 JSON 불러오기가 모두 migrate를 거칩니다. 왕복에서 잃는 것이 없어야 합니다. */
function roundTrip(mutate: (ev: ReturnType<typeof emptyEvent>) => void) {
  const ev = emptyEvent();
  mutate(ev);
  const json = JSON.parse(JSON.stringify(ev));
  return migrate(json);
}

describe("v2 왕복 저장", () => {
  it("무대 원호를 그대로 살린다", () => {
    const { event } = roundTrip((ev) => {
      ev.stagePlans[0].stage = {
        points: rectStage(10, 6).points,
        arcs: [{ fromIdx: 2, toIdx: 3, bulgeM: 1.5 }],
      };
    });
    const arcs = event.stagePlans[0].stage.arcs;
    expect(arcs).toHaveLength(1);
    expect(arcs![0]).toEqual({ fromIdx: 2, toIdx: 3, bulgeM: 1.5 });
  });

  it("구역을 그대로 살린다", () => {
    const zone: Zone = {
      id: "zone-1",
      kind: "riser",
      name: "드럼 라이저",
      polygon: [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 3 }, { x: 1, y: 3 }],
      heightM: 0.4,
    };
    const { event } = roundTrip((ev) => {
      ev.stagePlans[0].zones = [zone];
    });
    expect(event.stagePlans[0].zones).toEqual([zone]);
  });

  it("버전은 v2를 유지한다", () => {
    const { event } = roundTrip(() => {});
    expect(event.version).toBe(SCHEMA_VERSION);
  });
});

describe("v2 검증", () => {
  const base = () => ({
    version: 2,
    id: "e1",
    name: "공연",
    date: "2026-10-17",
    stagePlans: [{ id: "p1", name: "배치", stage: rectStage(10, 6), zones: [], objects: [], notes: [], audienceDir: "front", rev: 1 }],
  });

  it("꼭짓점을 가리키지 못하는 원호는 버린다", () => {
    const raw = base();
    (raw.stagePlans[0].stage as unknown as Record<string, unknown>).arcs = [
      { fromIdx: 0, toIdx: 1, bulgeM: 1 },   // 정상
      { fromIdx: 9, toIdx: 10, bulgeM: 1 },  // 범위 밖
      { fromIdx: 1, toIdx: 3, bulgeM: 1 },   // 이웃이 아님
      { fromIdx: 0, toIdx: 1, bulgeM: 2 },   // 같은 변 중복
      { fromIdx: 1.5, toIdx: 2.5, bulgeM: 1 }, // 정수가 아님
      { fromIdx: 2, toIdx: 3, bulgeM: 0 },   // 0은 직선이므로 호가 아님
    ];
    const { event, warnings } = migrate(raw);
    expect(event.stagePlans[0].stage.arcs).toEqual([{ fromIdx: 0, toIdx: 1, bulgeM: 1 }]);
    expect(warnings.join(" ")).toContain("원호");
  });

  it("마지막 변의 원호(n-1 → 0)는 남긴다", () => {
    const raw = base();
    (raw.stagePlans[0].stage as unknown as Record<string, unknown>).arcs = [
      { fromIdx: 3, toIdx: 0, bulgeM: -0.8 },
    ];
    const { event } = migrate(raw);
    expect(event.stagePlans[0].stage.arcs).toEqual([{ fromIdx: 3, toIdx: 0, bulgeM: -0.8 }]);
  });

  it("모르는 구역 종류와 점이 모자란 구역을 버린다", () => {
    const raw = base();
    raw.stagePlans[0].zones = [
      { id: "z1", kind: "riser", name: "라이저", polygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], heightM: 0.4 },
      { id: "z2", kind: "자유입력", name: "나쁨", polygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] },
      { id: "z3", kind: "foh", name: "점 부족", polygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
    ] as never;
    const { event, warnings } = migrate(raw);
    expect(event.stagePlans[0].zones.map((z) => z.id)).toEqual(["z1"]);
    expect(warnings.join(" ")).toContain("구역");
  });

  it("높이는 라이저·단차만 가진다", () => {
    const raw = base();
    raw.stagePlans[0].zones = [
      { id: "z1", kind: "foh", name: "FOH", polygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], heightM: 2 },
      { id: "z2", kind: "level", name: "단차", polygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] },
    ] as never;
    const { event } = migrate(raw);
    const [foh, level] = event.stagePlans[0].zones;
    expect(foh.heightM).toBeUndefined();
    expect(level.heightM).toBe(0.4); // 값이 없으면 기본값
  });

  it("구역 높이는 범위로 자른다", () => {
    const raw = base();
    raw.stagePlans[0].zones = [
      { id: "z1", kind: "riser", name: "너무 높음", polygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], heightM: 9999 },
    ] as never;
    const { event } = migrate(raw);
    expect(event.stagePlans[0].zones[0].heightM).toBe(10);
  });

  it("꼭짓점이 세 개가 안 되면 기본 사각 무대로 되돌린다", () => {
    const raw = base();
    raw.stagePlans[0].stage = { points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] } as never;
    const { event, warnings } = migrate(raw);
    expect(event.stagePlans[0].stage.points).toHaveLength(4);
    expect(warnings.join(" ")).toContain("무대 꼭짓점");
  });
});

describe("PA 입력 왕복 저장", () => {
  it("편성과 스피커 제원을 그대로 살린다", () => {
    const { event } = roundTrip((ev) => {
      ev.pa.genre = "rock";
      ev.pa.mixerChannels = 32;
      ev.pa.speakerName = "메인 15인치";
      ev.pa.speaker = {
        sensitivityDb: 99, maxSplDb: 131, dispersionH: 60, dispersionV: 40, powerW: 1200,
      };
      ev.pa.lineup = {
        vocals: 3,
        entries: [
          { instrumentId: "drums", count: 1 },
          { instrumentId: "eguitar", count: 2 },
        ],
      };
    });
    expect(event.pa.genre).toBe("rock");
    expect(event.pa.mixerChannels).toBe(32);
    expect(event.pa.speakerName).toBe("메인 15인치");
    expect(event.pa.speaker.powerW).toBe(1200);
    expect(event.pa.lineup.vocals).toBe(3);
    expect(event.pa.lineup.entries).toEqual([
      { instrumentId: "drums", count: 1 },
      { instrumentId: "eguitar", count: 2 },
    ]);
  });

  it("모르는 장르와 악기는 버리고 경고를 남긴다", () => {
    const raw = JSON.parse(JSON.stringify(emptyEvent()));
    raw.pa = {
      genre: "트로트",
      lineup: { vocals: 1, entries: [{ instrumentId: "하프", count: 1 }] },
    };
    const { event, warnings } = migrate(raw);
    expect(event.pa.genre).toBe("band");
    expect(event.pa.lineup.entries).toEqual([]);
    expect(warnings.length).toBeGreaterThanOrEqual(2);
  });

  it("PA 입력이 아예 없는 옛 v2 파일은 기본값으로 연다", () => {
    const raw = JSON.parse(JSON.stringify(emptyEvent()));
    delete raw.pa;
    const { event } = migrate(raw);
    expect(event.pa.genre).toBe("band");
    expect(event.pa.speaker.sensitivityDb).toBeGreaterThan(0);
  });
});

describe("공지 왕복 저장", () => {
  it("공지와 확인 기록을 그대로 살린다", () => {
    const { event } = roundTrip((ev) => {
      ev.notices = [{
        id: "n-1", level: "urgent", text: "3팀 대기실로 와 주세요",
        targets: ["staff", "display"], createdAt: "2026-10-21T04:00:00.000Z",
        ackBy: ["dev-1", "dev-2"], rev: 3,
      }];
    });
    expect(event.notices).toHaveLength(1);
    expect(event.notices[0]).toMatchObject({
      level: "urgent", text: "3팀 대기실로 와 주세요", ackBy: ["dev-1", "dev-2"], rev: 3,
    });
    expect(event.notices[0].targets).toEqual(["staff", "display"]);
  });

  it("모르는 대상과 등급은 기본값으로 둔다", () => {
    const raw = JSON.parse(JSON.stringify(emptyEvent()));
    raw.notices = [{ id: "n", level: "아주급함", text: "x", targets: ["사장"], ackBy: [1, "d"] }];
    const { event } = migrate(raw);
    expect(event.notices[0].level).toBe("normal");
    expect(event.notices[0].targets).toEqual(["operator", "staff", "display"]);
    expect(event.notices[0].ackBy).toEqual(["d"]);
  });
});
