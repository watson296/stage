import { describe, it, expect, afterEach } from "vitest";
import WebSocket from "ws";
import { emptyEvent, newTimetableItem, type Event } from "@stage-planner/shared";
import { startHost, type HostHandle } from "../src/host.ts";
import { Hub } from "../src/hub.ts";
import { isPrivateAddress, normalizeIp, preferredAddress } from "../src/net.ts";
import { FailureLimiter, RateCounter, makeCode, roleForCode, makeAccessCodes } from "../src/codes.ts";

describe("주소 판별", () => {
  it("사설 대역만 통과시킵니다", () => {
    for (const ip of ["10.0.0.1", "172.16.5.5", "172.31.255.255", "192.168.0.10", "127.0.0.1", "169.254.1.1", "::1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "172.32.0.1", "172.15.0.1", "193.168.0.1", "", "말도 안 되는 값"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it("IPv6로 들어온 IPv4를 알아봅니다", () => {
    expect(normalizeIp("::ffff:192.168.0.2")).toBe("192.168.0.2");
    expect(isPrivateAddress("::ffff:192.168.0.2")).toBe(true);
    expect(isPrivateAddress("::ffff:8.8.8.8")).toBe(false);
  });

  it("접속 주소는 루프백이 아닌 것을 먼저 고릅니다", () => {
    expect(
      preferredAddress([
        { name: "lo", address: "127.0.0.1" },
        { name: "wifi", address: "192.168.0.5" },
      ]),
    ).toBe("192.168.0.5");
    expect(preferredAddress([{ name: "lo", address: "127.0.0.1" }])).toBe("127.0.0.1");
    expect(preferredAddress([])).toBe("127.0.0.1");
  });
});

describe("접속 코드", () => {
  it("여섯 자리 숫자입니다", () => {
    for (let i = 0; i < 20; i++) expect(makeCode()).toMatch(/^\d{6}$/);
  });

  it("코드로 역할을 찾고 틀리면 null입니다", () => {
    const codes = makeAccessCodes();
    expect(roleForCode(codes, codes.operator)).toBe("operator");
    expect(roleForCode(codes, codes.staff)).toBe("staff");
    expect(roleForCode(codes, codes.display)).toBe("display");
    expect(roleForCode(codes, "000000" === codes.operator ? "111111" : "")).toBeNull();
    expect(roleForCode(codes, codes.operator + "0")).toBeNull();
  });

  it("실패가 쌓이면 잠시 막고 성공하면 풉니다", () => {
    const l = new FailureLimiter({ maxFailures: 3, lockMs: 1000, windowMs: 10000 });
    expect(l.lockedFor("a")).toBe(0);
    l.fail("a");
    l.fail("a");
    expect(l.lockedFor("a")).toBe(0);
    l.fail("a");
    expect(l.lockedFor("a")).toBeGreaterThan(0);
    // 다른 IP는 영향을 받지 않습니다.
    expect(l.lockedFor("b")).toBe(0);
    l.succeed("a");
    expect(l.lockedFor("a")).toBe(0);
  });

  it("메시지 빈도를 제한합니다", () => {
    const r = new RateCounter({ maxPerWindow: 3, windowMs: 1000 });
    const t = 1000;
    expect(r.allow(t)).toBe(true);
    expect(r.allow(t)).toBe(true);
    expect(r.allow(t)).toBe(true);
    expect(r.allow(t)).toBe(false);
    // 창이 지나면 다시 됩니다.
    expect(r.allow(t + 2000)).toBe(true);
  });
});

function docWithItem(): Event {
  const ev = emptyEvent();
  ev.timetable.items = [
    { ...newTimetableItem("it-1", "show", "13:00", 30), owner: "김수윤" },
    newTimetableItem("it-2", "changeover", "13:30", 10),
  ];
  return ev;
}

describe("호스트 상태", () => {
  it("rev가 같으면 그냥 적용하고 1 올립니다", () => {
    const hub = new Hub(docWithItem());
    const out = hub.patch("timetableItem", "it-1", 1, { title: "1팀" });
    expect(out).toMatchObject({ found: true, conflict: false, rev: 2 });
    expect(hub.snapshot().timetable.items[0].title).toBe("1팀");
  });

  it("rev가 다르면 적용하되 충돌을 알립니다", () => {
    const hub = new Hub(docWithItem());
    hub.patch("timetableItem", "it-1", 1, { title: "먼저" });
    const out = hub.patch("timetableItem", "it-1", 1, { title: "나중" });
    // 나중에 온 것이 이깁니다.
    expect(out.conflict).toBe(true);
    expect(hub.snapshot().timetable.items[0].title).toBe("나중");
    expect(out.rev).toBeGreaterThan(2);
  });

  it("없는 항목은 못 고칩니다", () => {
    const hub = new Hub(docWithItem());
    expect(hub.patch("timetableItem", "없음", 1, { title: "x" }).found).toBe(false);
  });

  it("받은 값을 믿지 않고 범위를 자릅니다", () => {
    const hub = new Hub(docWithItem());
    hub.patch("timetableItem", "it-1", 1, { durationMin: 999999, kind: "파티" });
    const it = hub.snapshot().timetable.items[0];
    expect(it.durationMin).toBe(24 * 60);
    expect(it.kind).toBe("other");
  });

  it("순서를 시작하면 앞선 순서가 끝납니다", () => {
    const hub = new Hub(docWithItem());
    hub.itemStart("it-1");
    hub.itemStart("it-2");
    const items = hub.snapshot().timetable.items;
    expect(items[0].status).toBe("done");
    expect(items[0].actualEnd).toBeTruthy();
    expect(items[1].status).toBe("running");
  });

  it("공지를 더하고 확인을 기록합니다", () => {
    const hub = new Hub(docWithItem());
    const n = hub.addNotice("urgent", "무대 정리 부탁드립니다", ["staff"]);
    expect(hub.ack(n.id, "dev-1")?.ackBy).toEqual(["dev-1"]);
    // 같은 기기가 두 번 눌러도 한 번만 셉니다.
    expect(hub.ack(n.id, "dev-1")?.ackBy).toEqual(["dev-1"]);
    expect(hub.ack("없는 공지", "dev-1")).toBeNull();
  });

  it("스냅샷에는 접속 코드를 담지 않습니다", () => {
    const ev = docWithItem();
    ev.accessCodes = { operator: "123456", staff: "222222", display: "333333", rotatedAt: "x" };
    const snap = new Hub(ev).snapshot();
    expect(snap.accessCodes.operator).toBe("");
    expect(JSON.stringify(snap)).not.toContain("123456");
  });

  it("담당자를 찾아 줍니다", () => {
    const hub = new Hub(docWithItem());
    expect(hub.ownerOf("it-1")).toBe("김수윤");
    expect(hub.ownerOf("없음")).toBeNull();
  });
});

// ── 실제 연결 ────────────────────────────────────────────────────────────────
let host: HostHandle | null = null;
afterEach(async () => {
  await host?.close();
  host = null;
});

function connect(port: number): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${port}/`);
}

/** 다음 메시지 하나를 기다립니다. */
function next(ws: WebSocket, type?: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error(`${type ?? "메시지"}를 기다리다 시간이 지났습니다`)), 4000);
    const on = (data: WebSocket.RawData): void => {
      const msg = JSON.parse(data.toString());
      if (type && msg.t !== type) return;
      clearTimeout(to);
      ws.off("message", on);
      resolve(msg);
    };
    ws.on("message", on);
  });
}

async function hello(port: number, code: string, role: string, name: string): Promise<WebSocket> {
  const ws = connect(port);
  await new Promise((r) => ws.on("open", r));
  ws.send(JSON.stringify({ t: "hello", payload: { code, role, deviceName: name } }));
  return ws;
}

describe("실시간 연결", () => {
  it("맞는 코드로 붙으면 전체 상태를 받습니다", async () => {
    host = await startHost({ port: 0, doc: docWithItem(), address: "127.0.0.1" });
    const port = (host.server.address() as { port: number }).port;
    const ws = await hello(port, host.codes.operator, "operator", "운영자 노트북");
    const welcome = await next(ws, "welcome");
    expect(welcome.payload.role).toBe("operator");
    expect(welcome.payload.snapshot.timetable.items).toHaveLength(2);
    expect(welcome.payload.serverTime).toBeTruthy();
    ws.close();
  });

  it("틀린 코드는 거부하고 끊습니다", async () => {
    host = await startHost({ port: 0, address: "127.0.0.1" });
    const port = (host.server.address() as { port: number }).port;
    const ws = await hello(port, "000000", "operator", "모르는 기기");
    const err = await next(ws, "error");
    expect(err.payload.code).toBe("bad_code");
    await new Promise((r) => ws.on("close", r));
  });

  it("코드에 맞지 않는 역할을 달라고 하면 거부합니다", async () => {
    host = await startHost({ port: 0, address: "127.0.0.1" });
    const port = (host.server.address() as { port: number }).port;
    // 표시 화면 코드로 운영자를 달라고 합니다.
    const ws = await hello(port, host.codes.display, "operator", "욕심쟁이");
    const err = await next(ws, "error");
    expect(err.payload.code).toBe("bad_code");
  });

  it("한 기기의 수정이 다른 기기에 전달됩니다", async () => {
    host = await startHost({ port: 0, doc: docWithItem(), address: "127.0.0.1" });
    const port = (host.server.address() as { port: number }).port;
    const a = await hello(port, host.codes.operator, "operator", "A");
    await next(a, "welcome");
    const b = await hello(port, host.codes.display, "display", "대기실 TV");
    await next(b, "welcome");

    a.send(JSON.stringify({
      t: "patch",
      payload: { entity: "timetableItem", id: "it-1", rev: 1, changes: { title: "1팀 공연" } },
    }));
    const got = await next(b, "patched");
    expect(got.payload.changes.title).toBe("1팀 공연");
    expect(got.payload.rev).toBe(2);
    a.close();
    b.close();
  });

  it("표시 화면은 고칠 수 없습니다", async () => {
    host = await startHost({ port: 0, doc: docWithItem(), address: "127.0.0.1" });
    const port = (host.server.address() as { port: number }).port;
    const ws = await hello(port, host.codes.display, "display", "TV");
    await next(ws, "welcome");
    ws.send(JSON.stringify({
      t: "patch",
      payload: { entity: "timetableItem", id: "it-1", rev: 1, changes: { title: "바꿔 보기" } },
    }));
    const err = await next(ws, "error");
    expect(err.payload.code).toBe("forbidden");
    expect(host.hub.snapshot().timetable.items[0].title).not.toBe("바꿔 보기");
    ws.close();
  });

  it("스태프는 자기가 담당인 순서만 시작할 수 있습니다", async () => {
    host = await startHost({ port: 0, doc: docWithItem(), address: "127.0.0.1" });
    const port = (host.server.address() as { port: number }).port;
    const ws = await hello(port, host.codes.staff, "staff", "김수윤");
    await next(ws, "welcome");

    ws.send(JSON.stringify({ t: "itemStart", payload: { itemId: "it-2" } }));
    const err = await next(ws, "error");
    expect(err.payload.code).toBe("forbidden");

    ws.send(JSON.stringify({ t: "itemStart", payload: { itemId: "it-1" } }));
    const snap = await next(ws, "snapshot");
    expect(snap.payload.snapshot.timetable.items[0].status).toBe("running");
    ws.close();
  });

  it("코드를 넣기 전에는 아무것도 못 합니다", async () => {
    host = await startHost({ port: 0, address: "127.0.0.1" });
    const port = (host.server.address() as { port: number }).port;
    const ws = connect(port);
    await new Promise((r) => ws.on("open", r));
    ws.send(JSON.stringify({ t: "ping", payload: {} }));
    const err = await next(ws, "error");
    expect(err.payload.code).toBe("forbidden");
  });

  it("모르는 메시지는 거부합니다", async () => {
    host = await startHost({ port: 0, address: "127.0.0.1" });
    const port = (host.server.address() as { port: number }).port;
    const ws = await hello(port, host.codes.operator, "operator", "A");
    await next(ws, "welcome");
    ws.send(JSON.stringify({ t: "drop", payload: {} }));
    const err = await next(ws, "error");
    expect(err.payload.code).toBe("bad_message");
    ws.close();
  });

  it("접속 기기 목록이 모두에게 전달됩니다", async () => {
    host = await startHost({ port: 0, address: "127.0.0.1" });
    const port = (host.server.address() as { port: number }).port;
    const a = await hello(port, host.codes.operator, "operator", "운영자");
    await next(a, "welcome");
    const b = await hello(port, host.codes.staff, "staff", "스태프 폰");
    const devices = await next(a, "devices");
    expect(devices.payload.devices.map((d: { name: string }) => d.name)).toContain("스태프 폰");
    a.close();
    b.close();
  });

  it("운영자가 기기를 끊을 수 있습니다", async () => {
    host = await startHost({ port: 0, address: "127.0.0.1" });
    const port = (host.server.address() as { port: number }).port;
    const a = await hello(port, host.codes.operator, "operator", "운영자");
    await next(a, "welcome");
    const b = await hello(port, host.codes.display, "display", "TV");
    const bw = await next(b, "welcome");
    a.send(JSON.stringify({ t: "kick", payload: { deviceId: bw.payload.deviceId } }));
    const kicked = await next(b, "kicked");
    expect(kicked.payload.reason).toContain("운영자");
    a.close();
  });

  it("운영자가 올린 내용이 모두에게 퍼집니다", async () => {
    host = await startHost({ port: 0, address: "127.0.0.1" });
    const port = (host.server.address() as { port: number }).port;
    const a = await hello(port, host.codes.operator, "operator", "운영자");
    await next(a, "welcome");
    const b = await hello(port, host.codes.display, "display", "TV");
    await next(b, "welcome");

    const mine = docWithItem();
    mine.name = "2026 봄 정기공연";
    a.send(JSON.stringify({ t: "publish", payload: { snapshot: mine } }));
    const snap = await next(b, "snapshot");
    expect(snap.payload.snapshot.name).toBe("2026 봄 정기공연");
    a.close();
    b.close();
  });

  it("공지는 대상 역할에게만 갑니다", async () => {
    host = await startHost({ port: 0, address: "127.0.0.1" });
    const port = (host.server.address() as { port: number }).port;
    const a = await hello(port, host.codes.operator, "operator", "운영자");
    await next(a, "welcome");
    const b = await hello(port, host.codes.display, "display", "TV");
    await next(b, "welcome");

    a.send(JSON.stringify({
      t: "notice",
      payload: { level: "urgent", text: "무대 정리 부탁드립니다", targets: ["display"] },
    }));
    const got = await next(b, "notice");
    expect(got.payload.notice.text).toBe("무대 정리 부탁드립니다");
    expect(got.payload.notice.level).toBe("urgent");
    a.close();
    b.close();
  });
});
