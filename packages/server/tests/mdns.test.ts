import { describe, it, expect } from "vitest";
import {
  buildAnswers,
  startMdns,
  toLocalName,
  TTL_SEC,
  type MdnsQuery,
  type MdnsSocket,
} from "../src/mdns.ts";

const IP = "192.168.0.5";
const q = (name: string, type = "A"): MdnsQuery => ({ questions: [{ name, type }] });

describe("이름 만들기", () => {
  it(".local을 붙입니다", () => {
    expect(toLocalName("stage")).toBe("stage.local");
    expect(toLocalName("stage.local")).toBe("stage.local");
    expect(toLocalName("stage.local.")).toBe("stage.local");
    expect(toLocalName("  stage  ")).toBe("stage.local");
  });
});

describe("A 레코드 만들기", () => {
  it("이름이 맞으면 IP를 돌려줍니다", () => {
    expect(buildAnswers("stage", IP, q("stage.local"))).toEqual([
      { name: "stage.local", type: "A", ttl: TTL_SEC, data: IP },
    ]);
  });

  it("대소문자와 끝점을 가리지 않습니다", () => {
    expect(buildAnswers("stage", IP, q("STAGE.LOCAL"))).toHaveLength(1);
    expect(buildAnswers("stage", IP, q("stage.local."))).toHaveLength(1);
  });

  it("ANY 질의에도 답합니다", () => {
    expect(buildAnswers("stage", IP, q("stage.local", "ANY"))).toHaveLength(1);
    expect(buildAnswers("stage", IP, q("stage.local", "any"))).toHaveLength(1);
  });

  it("다른 이름에는 끼어들지 않습니다", () => {
    expect(buildAnswers("stage", IP, q("printer.local"))).toEqual([]);
    expect(buildAnswers("stage", IP, q("stage.local.evil.com"))).toEqual([]);
    expect(buildAnswers("stage", IP, q("notstage.local"))).toEqual([]);
  });

  it("A가 아닌 종류에는 답하지 않습니다", () => {
    expect(buildAnswers("stage", IP, q("stage.local", "AAAA"))).toEqual([]);
    expect(buildAnswers("stage", IP, q("stage.local", "PTR"))).toEqual([]);
    expect(buildAnswers("stage", IP, q("stage.local", "SRV"))).toEqual([]);
  });

  it("질문이 없으면 빈 배열입니다", () => {
    expect(buildAnswers("stage", IP, {})).toEqual([]);
    expect(buildAnswers("stage", IP, { questions: [] })).toEqual([]);
  });

  it("이름을 바꾸면 그 이름에만 답합니다", () => {
    expect(buildAnswers("무대", IP, q("무대.local"))).toHaveLength(1);
    expect(buildAnswers("무대", IP, q("stage.local"))).toEqual([]);
  });
});

/** 멀티캐스트 소켓을 흉내 냅니다. 실제로 5353을 열지 않습니다. */
function fakeSocket() {
  const handlers: Record<string, ((v: never) => void)[]> = {};
  const responses: { answers: unknown[] }[] = [];
  let destroyed = false;
  const socket: MdnsSocket = {
    on(event: string, fn: (v: never) => void) {
      (handlers[event] ??= []).push(fn);
    },
    respond(res) {
      responses.push(res);
    },
    destroy() {
      destroyed = true;
    },
  } as MdnsSocket;
  return {
    socket,
    responses,
    get destroyed() {
      return destroyed;
    },
    fire(event: string, v: unknown) {
      for (const fn of handlers[event] ?? []) (fn as (x: unknown) => void)(v);
    },
  };
}

describe("이름 응답기", () => {
  it("질의가 오면 답을 보냅니다", () => {
    const f = fakeSocket();
    const h = startMdns({ name: "stage", address: IP }, () => f.socket);
    expect(h.ok).toBe(true);
    expect(h.hostname).toBe("stage.local");

    f.fire("query", q("stage.local"));
    expect(f.responses).toHaveLength(1);
    expect(f.responses[0].answers).toEqual([
      { name: "stage.local", type: "A", ttl: TTL_SEC, data: IP },
    ]);

    // 남의 질의에는 답하지 않습니다.
    f.fire("query", q("printer.local"));
    expect(f.responses).toHaveLength(1);

    h.stop();
    expect(f.destroyed).toBe(true);
  });

  it("5353을 못 열어도 죽지 않고 이유를 알려 줍니다", () => {
    const h = startMdns({ name: "stage", address: IP }, () => {
      throw new Error("bind EADDRINUSE 0.0.0.0:5353");
    });
    expect(h.ok).toBe(false);
    expect(h.problem).toContain("IP로만 접속합니다");
    expect(h.hostname).toBeNull();
    // 멈추기를 불러도 터지지 않습니다.
    expect(() => h.stop()).not.toThrow();
  });

  it("켠 뒤에 끊겨도 터지지 않습니다", () => {
    const f = fakeSocket();
    const h = startMdns({ name: "stage", address: IP }, () => f.socket);
    f.fire("error", new Error("ENETDOWN"));
    expect(h.ok).toBe(false);
    expect(h.problem).toContain("ENETDOWN");
  });

  it("멈추기가 실패해도 터지지 않습니다", () => {
    const h = startMdns({ name: "stage", address: IP }, () => ({
      on() {},
      respond() {},
      destroy() {
        throw new Error("이미 닫힘");
      },
    }) as MdnsSocket);
    expect(() => h.stop()).not.toThrow();
  });
});
