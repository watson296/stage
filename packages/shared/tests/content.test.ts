import { describe, it, expect } from "vitest";
import { cloneEvent, emptyEvent, hasContent, newTimetableItem, sameContent } from "@stage-planner/shared";

describe("공연 내용 판별", () => {
  it("새로 만든 공연은 내용이 없습니다", () => {
    expect(hasContent(emptyEvent())).toBe(false);
  });

  it("장비·순서·이름 중 하나라도 있으면 내용이 있습니다", () => {
    const a = emptyEvent();
    a.stagePlans[0].objects.push({
      id: "o1", type: "drum_kit", x: 1, y: 1, w: 1, d: 1, h: 1, z: 0, rot: 0, label: "", onStage: true,
    });
    expect(hasContent(a)).toBe(true);

    const b = emptyEvent();
    b.timetable.items.push(newTimetableItem("it-1", "show", "13:00"));
    expect(hasContent(b)).toBe(true);

    const c = emptyEvent();
    c.name = "봄 정기공연";
    expect(hasContent(c)).toBe(true);
  });

  it("공지·접속 기기·rev만 다르면 같은 내용으로 봅니다", () => {
    const a = emptyEvent();
    a.timetable.items.push(newTimetableItem("it-1", "show", "13:00"));
    const b = cloneEvent(a);
    b.timetable.items[0].rev = 9;
    b.notices.push({ id: "n", level: "normal", text: "x", targets: ["display"], createdAt: "", ackBy: [], rev: 1 });
    b.accessCodes.operator = "123456";
    expect(sameContent(a, b)).toBe(true);
    b.timetable.items[0].title = "다른 이름";
    expect(sameContent(a, b)).toBe(false);
  });
});
