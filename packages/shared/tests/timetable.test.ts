import { describe, it, expect } from "vitest";
import {
  parseHHMM,
  formatHHMM,
  formatDuration,
  isNextDay,
  schedule,
  moveItem,
  newTimetableItem,
  nextStartMin,
  timetableKindInfo,
  liveView,
  migrate,
  emptyEvent,
  type Timetable,
  type TimetableItem,
} from "../src/index";

function item(over: Partial<TimetableItem> = {}): TimetableItem {
  return { ...newTimetableItem("i", "show", "13:00", 30), ...over };
}

/** 그날 13:07 같은 시각을 ISO로. 날짜는 결과에 영향을 주지 않습니다. */
function at(h: number, m: number): string {
  const d = new Date(2026, 0, 2, h, m, 0);
  return d.toISOString();
}

describe("시각 표기", () => {
  it("HH:MM을 분으로 바꾸고 되돌립니다", () => {
    expect(parseHHMM("09:30")).toBe(570);
    expect(parseHHMM("9:05")).toBe(545);
    expect(formatHHMM(570)).toBe("09:30");
    expect(formatHHMM(0)).toBe("00:00");
  });

  it("형식이 아니면 null입니다", () => {
    expect(parseHHMM("")).toBeNull();
    expect(parseHHMM("25:00")).toBeNull();
    expect(parseHHMM("09:70")).toBeNull();
    expect(parseHHMM("아홉시")).toBeNull();
  });

  it("자정을 넘기면 접어서 보여 주고 다음 날로 표시합니다", () => {
    expect(formatHHMM(24 * 60 + 30)).toBe("00:30");
    expect(isNextDay(24 * 60 + 30)).toBe(true);
    expect(isNextDay(23 * 60)).toBe(false);
  });

  it("길이는 시간과 분으로 읽습니다", () => {
    expect(formatDuration(45)).toBe("45분");
    expect(formatDuration(60)).toBe("1시간");
    expect(formatDuration(95)).toBe("1시간 35분");
    expect(formatDuration(-10)).toBe("-10분");
  });
});

describe("순서 계산", () => {
  const tt: Timetable = {
    dayStart: "13:00",
    items: [
      item({ id: "a", plannedStart: "13:00", durationMin: 30 }),
      item({ id: "b", plannedStart: "13:30", durationMin: 60 }),
      item({ id: "c", plannedStart: "14:30", durationMin: 30 }),
    ],
  };

  it("기록이 없으면 계획 그대로입니다", () => {
    const r = schedule(tt);
    expect(r.rows.map((x) => formatHHMM(x.startMin))).toEqual(["13:00", "13:30", "14:30"]);
    expect(r.delayMin).toBe(0);
    expect(formatHHMM(r.endMin!)).toBe("15:00");
    expect(r.runningIndex).toBeNull();
    expect(r.nextIndex).toBe(0);
  });

  it("앞 순서가 늦게 끝나면 뒤 순서가 밀립니다", () => {
    const late: Timetable = {
      ...tt,
      items: [
        item({ ...tt.items[0], status: "done", actualStart: at(13, 10), actualEnd: at(13, 50) }),
        tt.items[1],
        tt.items[2],
      ],
    };
    const r = schedule(late);
    // 두 번째는 13:30 계획이지만 앞이 13:50에 끝나 13:50에 시작합니다.
    expect(formatHHMM(r.rows[1].startMin)).toBe("13:50");
    expect(r.rows[1].delayMin).toBe(20);
    expect(formatHHMM(r.rows[2].startMin)).toBe("14:50");
    expect(r.delayMin).toBe(20);
  });

  it("앞이 일찍 끝나도 계획보다 먼저 시작하지 않습니다", () => {
    const early: Timetable = {
      ...tt,
      items: [
        item({ ...tt.items[0], status: "done", actualStart: at(13, 0), actualEnd: at(13, 10) }),
        tt.items[1],
        tt.items[2],
      ],
    };
    const r = schedule(early);
    expect(formatHHMM(r.rows[1].startMin)).toBe("13:30");
    expect(r.rows[1].delayMin).toBe(0);
    // 당겨진 것은 지연으로 세지 않습니다.
    expect(r.delayMin).toBe(0);
  });

  it("진행 중인 순서가 예정을 넘기면 지금까지로 늘어납니다", () => {
    const running: Timetable = {
      ...tt,
      items: [
        item({ ...tt.items[0], status: "running", actualStart: at(13, 0) }),
        tt.items[1],
        tt.items[2],
      ],
    };
    // 13:45. 30분짜리가 15분 넘었습니다.
    const r = schedule(running, 13 * 60 + 45);
    expect(r.runningIndex).toBe(0);
    expect(r.rows[0].overrun).toBe(true);
    expect(formatHHMM(r.rows[0].endMin)).toBe("13:45");
    expect(formatHHMM(r.rows[1].startMin)).toBe("13:45");
    expect(r.delayMin).toBe(15);
  });

  it("아직 안 넘겼으면 예정대로 끝나는 것으로 봅니다", () => {
    const running: Timetable = {
      ...tt,
      items: [item({ ...tt.items[0], status: "running", actualStart: at(13, 0) }), tt.items[1]],
    };
    const r = schedule(running, 13 * 60 + 10);
    expect(r.rows[0].overrun).toBe(false);
    expect(formatHHMM(r.rows[0].endMin)).toBe("13:30");
  });

  it("끝난 순서의 지연은 누적 지연에 넣지 않습니다", () => {
    const done: Timetable = {
      dayStart: "13:00",
      items: [
        item({ id: "a", plannedStart: "13:00", durationMin: 30, status: "done",
          actualStart: at(13, 20), actualEnd: at(13, 40) }),
        item({ id: "b", plannedStart: "13:45", durationMin: 30 }),
      ],
    };
    const r = schedule(done);
    expect(r.rows[0].delayMin).toBe(20);
    // 뒤 순서는 계획대로 13:45에 시작할 수 있으므로 지금 지연은 0입니다.
    expect(r.delayMin).toBe(0);
  });

  it("계획 시각이 비면 앞 순서에 이어 붙입니다", () => {
    const chained: Timetable = {
      dayStart: "10:00",
      items: [
        item({ id: "a", plannedStart: "10:00", durationMin: 20 }),
        item({ id: "b", plannedStart: "", durationMin: 10 }),
      ],
    };
    const r = schedule(chained);
    expect(formatHHMM(r.rows[1].startMin)).toBe("10:20");
  });

  it("항목이 없으면 빈 결과입니다", () => {
    const r = schedule({ dayStart: "09:00", items: [] });
    expect(r.rows).toEqual([]);
    expect(r.endMin).toBeNull();
    expect(r.delayMin).toBe(0);
    expect(r.nextIndex).toBeNull();
  });

  it("새 항목은 마지막 순서가 끝나는 시각에 붙습니다", () => {
    expect(formatHHMM(nextStartMin(tt))).toBe("15:00");
    expect(formatHHMM(nextStartMin({ dayStart: "09:00", items: [] }))).toBe("09:00");
  });
});

describe("순서 옮기기", () => {
  const items = [item({ id: "a" }), item({ id: "b" }), item({ id: "c" })];

  it("위아래로 한 칸씩 옮깁니다", () => {
    expect(moveItem(items, 2, -1).map((i) => i.id)).toEqual(["a", "c", "b"]);
    expect(moveItem(items, 0, 1).map((i) => i.id)).toEqual(["b", "a", "c"]);
  });

  it("끝에서 더 밀면 그대로입니다", () => {
    expect(moveItem(items, 0, -1)).toBe(items);
    expect(moveItem(items, 2, 1)).toBe(items);
    expect(moveItem(items, 9, 1)).toBe(items);
  });
});

describe("타임테이블 왕복 저장", () => {
  it("순서와 실제 기록을 그대로 살립니다", () => {
    const ev = emptyEvent();
    ev.timetable = {
      dayStart: "10:30",
      items: [
        item({ id: "x", kind: "soundcheck", title: "1팀 사운드체크", owner: "김지후",
          memo: "드럼 먼저", durationMin: 45, status: "done",
          actualStart: at(10, 30), actualEnd: at(11, 20) }),
      ],
    };
    const { event } = migrate(JSON.parse(JSON.stringify(ev)));
    expect(event.timetable.dayStart).toBe("10:30");
    expect(event.timetable.items).toHaveLength(1);
    expect(event.timetable.items[0]).toMatchObject({
      kind: "soundcheck", title: "1팀 사운드체크", owner: "김지후", durationMin: 45,
      status: "done",
    });
  });

  it("모르는 종류는 기타로 두고 깨진 시각은 00:00으로 둡니다", () => {
    const raw = JSON.parse(JSON.stringify(emptyEvent()));
    raw.timetable = {
      dayStart: "스물다섯시",
      items: [{ id: "z", kind: "파티", plannedStart: "99:99", durationMin: 1e9 }],
    };
    const { event } = migrate(raw);
    expect(event.timetable.dayStart).toBe("09:00");
    expect(event.timetable.items[0].kind).toBe("other");
    expect(event.timetable.items[0].plannedStart).toBe("00:00");
    expect(event.timetable.items[0].durationMin).toBe(24 * 60);
  });

  it("시작 기록 없이 진행 중이라고 적힌 순서는 대기로 되돌립니다", () => {
    const raw = JSON.parse(JSON.stringify(emptyEvent()));
    raw.timetable = { dayStart: "09:00", items: [{ id: "z", status: "running" }] };
    const { event } = migrate(raw);
    expect(event.timetable.items[0].status).toBe("pending");
  });
});

describe("순서 종류", () => {
  it("이름이 있고 모르는 값은 기타로 떨어집니다", () => {
    expect(timetableKindInfo("show").name).toBe("공연");
    expect(timetableKindInfo("changeover").name).toBe("전환");
  });
});

describe("운영 화면 요약", () => {
  const base: Timetable = {
    dayStart: "13:00",
    items: [
      item({ id: "a", plannedStart: "13:00", durationMin: 30 }),
      item({ id: "b", plannedStart: "13:30", durationMin: 60 }),
    ],
  };

  it("진행 중인 순서와 남은 시간을 냅니다", () => {
    const tt: Timetable = {
      ...base,
      items: [item({ ...base.items[0], status: "running", actualStart: at(13, 0) }), base.items[1]],
    };
    const v = liveView(tt, 13 * 60 + 10);
    expect(v.current?.item.id).toBe("a");
    expect(v.remainingMin).toBe(20);
    expect(v.next?.item.id).toBe("b");
  });

  it("예정을 넘기면 남은 시간이 음수입니다", () => {
    const tt: Timetable = {
      ...base,
      items: [item({ ...base.items[0], status: "running", actualStart: at(13, 0) }), base.items[1]],
    };
    expect(liveView(tt, 13 * 60 + 45).remainingMin).toBe(-15);
  });

  it("진행 중인 것이 없으면 다음 순서까지 남은 시간을 냅니다", () => {
    const v = liveView(base, 12 * 60 + 50);
    expect(v.current).toBeNull();
    expect(v.next?.item.id).toBe("a");
    expect(v.startsInMin).toBe(10);
    expect(v.remainingMin).toBeNull();
  });

  it("순서가 없으면 전부 비어 있습니다", () => {
    const v = liveView({ dayStart: "09:00", items: [] }, 600);
    expect(v.current).toBeNull();
    expect(v.next).toBeNull();
    expect(v.delayMin).toBe(0);
  });
});
