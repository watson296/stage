import { describe, it, expect } from "vitest";
import {
  speedOfSound,
  delayMs,
  distanceLossDb,
  splAtDistance,
  sumLevelsDb,
  stackGainDb,
  dbuToDbv,
  dbvToDbu,
  currentA,
  alignDelayMs,
  HAAS_OFFSET_MS,
  buildChannelList,
  checkMixer,
  summarizeGear,
  monitorMixCount,
  backlineWatts,
  MAX_MONITOR_MIXES,
  adviseSystem,
  planPower,
  DEFAULT_SPEAKER,
  FRONT_ROW_M,
  CIRCUIT_SAFETY,
  DEFAULT_VENUE,
  type Lineup,
  type PaInput,
} from "../src/index";

const near = (a: number, b: number, eps = 0.01): void => {
  expect(Math.abs(a - b)).toBeLessThan(eps);
};

describe("음향 기본 공식", () => {
  it("음속은 20°C에서 343.4m/s입니다", () => {
    near(speedOfSound(20), 343.42);
    near(speedOfSound(0), 331.3);
    // 기온이 10도 오르면 6.06m/s 빨라집니다.
    near(speedOfSound(30) - speedOfSound(20), 6.06);
  });

  it("34.342m는 20°C에서 100ms 걸립니다", () => {
    near(delayMs(34.342, 20), 100, 0.05);
  });

  it("거리가 두 배면 6dB 줄어듭니다", () => {
    near(distanceLossDb(1, 2), -6.02);
    near(distanceLossDb(1, 4), -12.04);
    near(distanceLossDb(10, 10), 0);
    // 가까워지면 늘어납니다.
    near(distanceLossDb(2, 1), 6.02);
  });

  it("스피커 음압은 감도 + 10log10(W) − 20log10(d)", () => {
    // 감도 97dB에 1W, 1m면 감도 그대로입니다.
    near(splAtDistance(97, 1, 1), 97);
    // 100W면 +20dB
    near(splAtDistance(97, 100, 1), 117);
    // 같은 출력에서 10m면 −20dB
    near(splAtDistance(97, 100, 10), 97);
  });

  it("같은 크기 음원 둘을 합치면 +3dB입니다", () => {
    near(sumLevelsDb([100, 100]), 103.01);
    near(sumLevelsDb([100, 100, 100, 100]), 106.02);
    near(sumLevelsDb([100]), 100);
    expect(sumLevelsDb([])).toBe(0);
    // 20dB 차이 나는 소리는 거의 더해지지 않습니다.
    near(sumLevelsDb([100, 80]), 100.04);
  });

  it("대수를 두 배로 올리면 3dB씩 늘어납니다", () => {
    near(stackGainDb(1), 0);
    near(stackGainDb(2), 3.01);
    near(stackGainDb(4), 6.02);
    expect(stackGainDb(0)).toBe(0);
  });

  it("dBu와 dBV는 2.21dB 차이입니다", () => {
    near(dbuToDbv(0), -2.2185, 0.001);
    near(dbvToDbu(0), 2.2185, 0.001);
    // 왕복하면 제자리입니다.
    near(dbvToDbu(dbuToDbv(4)), 4, 1e-9);
  });

  it("전류는 전력 나누기 전압입니다", () => {
    near(currentA(2200, 220), 10);
    expect(currentA(1000, 0)).toBe(0);
  });

  it("딜레이 정렬은 거리 시간에 하스 여유를 더합니다", () => {
    const d = 20;
    near(alignDelayMs(d, 20), delayMs(d, 20) + HAAS_OFFSET_MS);
    // 추우면 음속이 느려 지연이 길어집니다.
    expect(alignDelayMs(d, 0)).toBeGreaterThan(alignDelayMs(d, 30));
  });
});

const bandLineup: Lineup = {
  vocals: 2,
  entries: [
    { instrumentId: "drums", count: 1 },
    { instrumentId: "bass", count: 1 },
    { instrumentId: "eguitar", count: 2 },
    { instrumentId: "keys", count: 1 },
  ],
};

describe("입력 채널 리스트", () => {
  it("드럼 6 + 베이스 1 + 기타 2 + 키보드 2 + 보컬 2 = 13채널", () => {
    const rows = buildChannelList(bandLineup);
    expect(rows).toHaveLength(13);
    expect(rows[0]).toMatchObject({ no: 1, source: "킥" });
    // 번호는 1부터 빠짐없이 이어집니다.
    expect(rows.map((r) => r.no)).toEqual(rows.map((_, i) => i + 1));
  });

  it("콘솔 순서대로 드럼이 먼저, 보컬이 마지막입니다", () => {
    const rows = buildChannelList({
      vocals: 1,
      entries: [
        { instrumentId: "keys", count: 1 },
        { instrumentId: "drums", count: 1 },
      ],
    });
    expect(rows[0].source).toBe("킥");
    expect(rows[rows.length - 1].source).toBe("보컬");
  });

  it("같은 악기가 여럿이면 번호를 붙이고 하나면 붙이지 않습니다", () => {
    const rows = buildChannelList({
      vocals: 1,
      entries: [{ instrumentId: "eguitar", count: 2 }],
    });
    expect(rows.map((r) => r.source)).toEqual(["일렉 기타 1", "일렉 기타 2", "보컬"]);
  });

  it("모르는 악기와 개수 0은 건너뜁니다", () => {
    const rows = buildChannelList({
      vocals: 0,
      entries: [
        { instrumentId: "없는악기", count: 3 },
        { instrumentId: "bass", count: 0 },
        { instrumentId: "bass", count: 1 },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("베이스");
  });

  it("믹서 채널이 모자라면 몇 개 모자란지 알려 줍니다", () => {
    const rows = buildChannelList(bandLineup);
    expect(checkMixer(rows, 16)).toMatchObject({ ok: true, shortBy: 0, needed: 13 });
    expect(checkMixer(rows, 8)).toMatchObject({ ok: false, shortBy: 5 });
  });

  it("마이크와 스탠드 수를 셉니다", () => {
    const { mics, stands } = summarizeGear(buildChannelList(bandLineup));
    const di = mics.find((m) => m.name === "DI 박스");
    // 베이스 1 + 키보드 2 = DI 3개
    expect(di?.count).toBe(3);
    // 스탠드가 없는 입력(DI)은 세지 않습니다.
    expect(stands.every((s) => s.name !== "")).toBe(true);
  });

  it("모니터 믹스는 보컬과 악기 자리를 세고 8개를 넘지 않습니다", () => {
    // 보컬 2 + 드럼 1 + 베이스 1 + 기타 2 + 키보드 1 = 7
    expect(monitorMixCount(bandLineup)).toBe(7);
    expect(monitorMixCount({ vocals: 0, entries: [] })).toBe(1);
    expect(
      monitorMixCount({ vocals: 20, entries: [{ instrumentId: "drums", count: 1 }] }),
    ).toBe(MAX_MONITOR_MIXES);
    // 플레이백은 모니터 자리를 차지하지 않습니다.
    expect(monitorMixCount({ vocals: 1, entries: [{ instrumentId: "playback", count: 1 }] })).toBe(1);
  });

  it("백라인 전력은 악기별 대표값의 합입니다", () => {
    // 베이스 400 + 기타 200×2 + 키보드 60 = 860
    expect(backlineWatts(bandLineup)).toBe(860);
    expect(backlineWatts({ vocals: 3, entries: [] })).toBe(0);
  });
});

function input(over: Partial<PaInput> = {}): PaInput {
  return {
    venue: { ...DEFAULT_VENUE, power: { ...DEFAULT_VENUE.power } },
    genre: "band",
    lineup: bandLineup,
    speaker: { ...DEFAULT_SPEAKER },
    mixerChannels: 16,
    ...over,
  };
}

describe("PA 시스템 조언", () => {
  it("작은 공연장은 포인트 소스 좌우 두 대입니다", () => {
    const a = adviseSystem(input());
    expect(a.mainKind).toBe("point");
    expect(a.mainCount).toBe(a.mainPerSide * 2);
    expect(a.reasons.length).toBeGreaterThan(0);
  });

  it("수용 인원이 많거나 객석이 깊으면 라인 어레이를 권합니다", () => {
    expect(adviseSystem(input({ venue: { ...DEFAULT_VENUE, capacity: 500 } })).mainKind).toBe("line");
    expect(
      adviseSystem(input({ venue: { ...DEFAULT_VENUE, capacity: 50, stageToBackM: 30 } })).mainKind,
    ).toBe("line");
  });

  it("예상 음압은 거리 공식과 대수 합산을 그대로 따릅니다", () => {
    const i = input({ venue: { ...DEFAULT_VENUE, stageToBackM: 20 } });
    const a = adviseSystem(i);
    const one = splAtDistance(i.speaker.sensitivityDb, i.speaker.powerW, 20);
    near(a.backSplDb, one + stackGainDb(a.mainPerSide));
    const front = splAtDistance(i.speaker.sensitivityDb, i.speaker.powerW, FRONT_ROW_M);
    near(a.frontSplDb, front + stackGainDb(a.mainPerSide));
    // 앞이 뒤보다 큽니다.
    expect(a.frontSplDb).toBeGreaterThan(a.backSplDb);
  });

  it("장르에 따라 서브우퍼 수가 달라집니다", () => {
    expect(adviseSystem(input({ genre: "acoustic" })).subCount).toBe(0);
    expect(adviseSystem(input({ genre: "band" })).subCount).toBe(2);
    expect(adviseSystem(input({ genre: "electronic" })).subCount).toBe(4);
  });

  it("객석이 깊으면 딜레이 스피커와 지연 시간을 냅니다", () => {
    const near30 = adviseSystem(input({ venue: { ...DEFAULT_VENUE, stageToBackM: 30 } }));
    expect(near30.delayNeeded).toBe(true);
    expect(near30.delayDistanceM).toBe(15);
    near(near30.delayMs, alignDelayMs(15, 20));
    // 가까운 객석에는 두지 않습니다.
    const small = adviseSystem(input({ venue: { ...DEFAULT_VENUE, stageToBackM: 10 } }));
    if (small.meetsTarget) {
      expect(small.delayNeeded).toBe(false);
      expect(small.delayMs).toBe(0);
    }
  });

  it("목표 음압에 못 미치면 그 사실을 근거에 적습니다", () => {
    const weak = adviseSystem(
      input({
        genre: "rock",
        venue: { ...DEFAULT_VENUE, stageToBackM: 60 },
        speaker: { ...DEFAULT_SPEAKER, powerW: 50, sensitivityDb: 90 },
      }),
    );
    expect(weak.meetsTarget).toBe(false);
    expect(weak.reasons.some((r) => r.includes("모자랍니다"))).toBe(true);
  });
});

describe("전원 계산", () => {
  it("합계 전류는 백라인과 PA 전력을 전압으로 나눈 값입니다", () => {
    const i = input();
    const a = adviseSystem(i);
    const p = planPower(i, a);
    expect(p.backlineW).toBe(backlineWatts(i.lineup));
    near(p.totalW, p.backlineW + p.paW);
    near(p.totalA, p.totalW / i.venue.power.voltage);
  });

  it("회로 용량은 80%까지만 씁니다", () => {
    const i = input({
      venue: { ...DEFAULT_VENUE, power: { circuits: 2, ampsPerCircuit: 16, voltage: 220 } },
    });
    const p = planPower(i, adviseSystem(i));
    near(p.capacityA, 2 * 16 * CIRCUIT_SAFETY);
  });

  it("용량을 넘으면 모자란 회로 수를 알려 줍니다", () => {
    const i = input({
      venue: { ...DEFAULT_VENUE, power: { circuits: 1, ampsPerCircuit: 6, voltage: 220 } },
    });
    const p = planPower(i, adviseSystem(i));
    expect(p.ok).toBe(false);
    expect(p.circuitsNeeded).toBeGreaterThan(1);
    expect(p.warnings.some((w) => w.includes("넘습니다"))).toBe(true);
  });
});
