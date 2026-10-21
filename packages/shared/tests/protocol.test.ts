import { describe, it, expect } from "vitest";
import {
  parseClientMessage,
  isParseError,
  canDo,
  ERR,
  MAX_MESSAGE_BYTES,
  type ClientMessage,
} from "../src/index";

function ok(raw: unknown): ClientMessage {
  const r = parseClientMessage(JSON.stringify(raw));
  if (isParseError(r)) throw new Error(`거부되었습니다: ${r.message}`);
  return r;
}

function err(raw: unknown): string {
  const r = parseClientMessage(typeof raw === "string" ? raw : JSON.stringify(raw));
  if (!isParseError(r)) throw new Error("거부될 줄 알았는데 통과했습니다");
  return r.code;
}

describe("메시지 검증", () => {
  it("접속은 역할과 이름을 다듬습니다", () => {
    const m = ok({ t: "hello", payload: { code: "123456", role: "staff", deviceName: "" } });
    expect(m).toMatchObject({ t: "hello" });
    if (m.t === "hello") {
      expect(m.payload.role).toBe("staff");
      expect(m.payload.deviceName).toBe("이름 없는 기기");
    }
  });

  it("모르는 역할과 모르는 종류는 거부합니다", () => {
    expect(err({ t: "hello", payload: { code: "1", role: "사장님" } })).toBe(ERR.BAD_MESSAGE);
    expect(err({ t: "shutdown", payload: {} })).toBe(ERR.BAD_MESSAGE);
    expect(err({ payload: {} })).toBe(ERR.BAD_MESSAGE);
  });

  it("JSON이 아니면 거부합니다", () => {
    expect(err("{이건 JSON이 아닙니다")).toBe(ERR.BAD_JSON);
  });

  it("64KB를 넘으면 거부합니다", () => {
    const big = JSON.stringify({ t: "ping", payload: { x: "가".repeat(MAX_MESSAGE_BYTES) } });
    expect(err(big)).toBe(ERR.TOO_BIG);
  });

  it("고칠 수 있는 칸만 남깁니다", () => {
    const m = ok({
      t: "patch",
      payload: {
        entity: "timetableItem", id: "it-1", rev: 3,
        changes: { title: "바꿈", rev: 999, id: "다른 것", status: "done", 몰래: 1 },
      },
    });
    if (m.t !== "patch") throw new Error();
    expect(Object.keys(m.payload.changes)).toEqual(["title"]);
    expect(m.payload.rev).toBe(3);
  });

  it("고칠 칸이 하나도 없으면 거부합니다", () => {
    expect(err({
      t: "patch",
      payload: { entity: "stagePlan", id: "p", rev: 1, changes: { rev: 2 } },
    })).toBe(ERR.BAD_MESSAGE);
  });

  it("모르는 항목 종류는 거부합니다", () => {
    expect(err({
      t: "patch",
      payload: { entity: "venue", id: "v", rev: 1, changes: { name: "x" } },
    })).toBe(ERR.BAD_MESSAGE);
  });

  it("공지는 대상이 비면 모두에게 보냅니다", () => {
    const m = ok({ t: "notice", payload: { text: "다 모여 주세요", targets: ["없는역할"] } });
    if (m.t !== "notice") throw new Error();
    expect(m.payload.targets).toEqual(["operator", "staff", "display"]);
    expect(m.payload.level).toBe("normal");
  });
});

describe("역할별 권한", () => {
  const patch: ClientMessage = {
    t: "patch",
    payload: { entity: "stagePlan", id: "p", rev: 1, changes: { name: "x" } },
  };
  const start: ClientMessage = { t: "itemStart", payload: { itemId: "it-1" } };
  const ack: ClientMessage = { t: "ack", payload: { noticeId: "n" } };

  it("운영자는 전부 할 수 있습니다", () => {
    expect(canDo("operator", patch)).toBe(true);
    expect(canDo("operator", start)).toBe(true);
    expect(canDo("operator", { t: "kick", payload: { deviceId: "d" } })).toBe(true);
  });

  it("표시 화면은 읽기만 합니다", () => {
    expect(canDo("display", patch)).toBe(false);
    expect(canDo("display", ack)).toBe(false);
    // 접속과 살아 있음 확인은 누구나 합니다.
    expect(canDo("display", { t: "ping", payload: {} })).toBe(true);
  });

  it("스태프는 공지 확인과 자기 담당 순서만 바꿉니다", () => {
    expect(canDo("staff", ack)).toBe(true);
    expect(canDo("staff", patch)).toBe(false);
    const ctx = { ownerOf: () => "김수윤", deviceName: "김수윤" };
    expect(canDo("staff", start, ctx)).toBe(true);
    expect(canDo("staff", start, { ownerOf: () => "다른 사람", deviceName: "김수윤" })).toBe(false);
    // 담당이 비어 있으면 아무도 못 바꿉니다.
    expect(canDo("staff", start, { ownerOf: () => "", deviceName: "" })).toBe(false);
  });
});
