// 호스트 서버. 같은 와이파이의 기기들이 붙어 같은 내용을 봅니다(SPEC 9).
// 인터넷에 열어 두는 용도가 아닙니다. 기본으로 사설 IP에서 오는 연결만 받습니다.

import { createServer, type IncomingMessage, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import QRCode from "qrcode";
import {
  canDo,
  isParseError,
  parseClientMessage,
  ERR,
  MAX_MESSAGE_BYTES,
  type ClientMessage,
  type Event,
  type Role,
} from "@stage-planner/shared";
import { Hub } from "./hub.ts";
import {
  FailureLimiter,
  RateCounter,
  makeAccessCodes,
  reuseOrMakeCodes,
  roleForCode,
} from "./codes.ts";
import { isPrivateAddress, localAddresses, normalizeIp, preferredAddress } from "./net.ts";
import {
  hostStateJson,
  isHostPageAllowed,
  renderHostPage,
  type HostPageView,
} from "./hostPage.ts";

export interface HostOptions {
  port?: number;
  /** 배포 빌드가 있는 폴더. 없으면 안내 쪽지만 보냅니다. */
  appDir?: string;
  doc?: Event;
  /** 사설 IP 제한을 풉니다. 쓸 일이 거의 없고 쓰면 경고합니다. */
  allowPublic?: boolean;
  /** 접속 주소를 만들 때 쓸 IP. 없으면 자동으로 고릅니다. */
  address?: string;
  /** 이름 접속에 쓸 주소(stage.local 등). 없으면 이름 칸을 비웁니다. */
  nameHost?: string;
  /** 이름 접속을 못 쓰는 이유. 호스트 안내 페이지에 그대로 보여 줍니다. */
  mdnsProblem?: string | null;
}

export interface HostHandle {
  port: number;
  /** 코드를 새로 만듭니다. 이미 붙어 있는 기기는 끊지 않습니다. */
  rotateCodes: () => { operator: string; staff: string; display: string };
  /** 파일로 저장할 때 코드까지 함께 남기려면 이 값을 씁니다. */
  accessCodes: import("@stage-planner/shared").AccessCodes;
  url: string;
  codes: { operator: string; staff: string; display: string };
  hub: Hub;
  close: () => Promise<void>;
  server: Server;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

const PING_MS = 15_000;
const HELLO_TIMEOUT_MS = 10_000;

function remoteIp(req: IncomingMessage): string {
  return normalizeIp(req.socket.remoteAddress ?? "");
}

export async function startHost(opts: HostOptions = {}): Promise<HostHandle> {
  const port = opts.port ?? 7321;
  const hub = new Hub(opts.doc);
  // 호스트를 껐다 켜도 같은 코드를 씁니다. 공연 파일에 코드가 들어 있으면 그것을 씁니다.
  const codes = reuseOrMakeCodes(opts.doc?.accessCodes);
  const limiter = new FailureLimiter();
  const address = opts.address ?? preferredAddress(localAddresses());
  const url = `http://${address}:${port}/`;

  const nameBase = opts.nameHost ? `http://${opts.nameHost}:${port}/` : null;
  const view = (): HostPageView => ({
    nameBase,
    ipBase: url,
    codes: { operator: codes.operator, staff: codes.staff, display: codes.display },
    devices: hub.deviceList(),
    mdnsProblem: opts.mdnsProblem ?? null,
    rotatedAt: codes.rotatedAt,
  });

  const server = createServer((req, res) => {
    const ip = remoteIp(req);
    if (!opts.allowPublic && !isPrivateAddress(ip)) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      res.end("같은 네트워크 안에서만 접속할 수 있습니다.");
      return;
    }
    const path = (req.url ?? "/").split("?")[0];
    if (path === "/host" || path.startsWith("/host/")) {
      serveHostPage(req, res, path, ip, view, rotate);
      return;
    }
    void serveStatic(req, res, opts.appDir, url);
  });

  /** 코드만 새로 만듭니다. 이미 인증된 연결은 그대로 둡니다(붙어 있는 기기 유지). */
  function rotate(): { operator: string; staff: string; display: string } {
    // 같은 객체를 고쳐 써야 연결 처리기가 보는 코드도 함께 바뀝니다.
    Object.assign(codes, makeAccessCodes());
    return { operator: codes.operator, staff: codes.staff, display: codes.display };
  }

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

  server.on("upgrade", (req, socket, head) => {
    const ip = remoteIp(req);
    if (!opts.allowPublic && !isPrivateAddress(ip)) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    attach(ws, remoteIp(req), hub, codes, limiter);
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));

  return {
    port,
    url,
    rotateCodes: rotate,
    codes: { operator: codes.operator, staff: codes.staff, display: codes.display },
    accessCodes: codes,
    hub,
    server,
    close: () =>
      new Promise<void>((resolve) => {
        for (const client of wss.clients) client.terminate();
        wss.close();
        server.close(() => resolve());
      }),
  };
}

async function serveStatic(
  req: IncomingMessage,
  res: import("node:http").ServerResponse,
  appDir: string | undefined,
  url: string,
): Promise<void> {
  const path = (req.url ?? "/").split("?")[0];

  if (path === "/qr.svg") {
    const want = new URL(req.url ?? "/", url).searchParams.get("d");
    const data = want == null ? url : qrPayload(want, url);
    if (data == null) {
      res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      res.end("이 호스트의 주소만 QR로 만듭니다.");
      return;
    }
    const svg = await QRCode.toString(data, { type: "svg", margin: 1 });
    res.writeHead(200, { "content-type": "image/svg+xml; charset=utf-8" });
    res.end(svg);
    return;
  }

  if (!appDir) {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("배포 빌드가 없습니다. npm run build 를 먼저 실행해 주세요.");
    return;
  }

  // 경로를 벗어나는 요청(../)은 거부합니다.
  const rel = normalize(decodeURIComponent(path)).replace(/^([/\\])+/, "");
  if (rel.split(sep).includes("..")) {
    res.writeHead(403).end();
    return;
  }
  const file = rel === "" ? "index.html" : rel;

  try {
    const buf = await readFile(join(appDir, file));
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(buf);
  } catch {
    try {
      // 없는 경로는 앱 화면으로 보냅니다.
      const buf = await readFile(join(appDir, "index.html"));
      res.writeHead(200, { "content-type": MIME[".html"] });
      res.end(buf);
    } catch {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("찾는 파일이 없습니다.");
    }
  }
}

function attach(
  ws: WebSocket,
  ip: string,
  hub: Hub,
  codes: ReturnType<typeof makeAccessCodes>,
  limiter: FailureLimiter,
): void {
  const rate = new RateCounter();
  let deviceId: string | null = null;
  let role: Role | null = null;
  let deviceName = "";

  const send = (msg: unknown): void => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };
  const fail = (code: string, message: string, close = false): void => {
    send({ t: "error", payload: { code, message } });
    if (close) ws.close();
  };

  // 코드를 넣지 않은 연결은 오래 붙잡아 두지 않습니다.
  const helloTimer = setTimeout(() => {
    if (!deviceId) fail(ERR.BAD_CODE, "접속 코드를 보내지 않았습니다.", true);
  }, HELLO_TIMEOUT_MS);

  const pinger = setInterval(() => {
    if (deviceId) hub.touch(deviceId);
    send({ t: "pong", payload: {} });
  }, PING_MS);

  ws.on("message", (data) => {
    if (!rate.allow()) {
      fail(ERR.TOO_FAST, "메시지를 너무 자주 보냈습니다.", true);
      return;
    }
    const raw = typeof data === "string" ? data : data.toString("utf8");
    const parsed = parseClientMessage(raw);
    if (isParseError(parsed)) {
      fail(parsed.code, parsed.message, parsed.code === ERR.TOO_BIG);
      return;
    }

    if (parsed.t === "hello") {
      handleHello(parsed);
      return;
    }
    if (!deviceId || !role) {
      fail(ERR.FORBIDDEN, "먼저 접속 코드를 넣어 주세요.", true);
      return;
    }
    if (!canDo(role, parsed, { ownerOf: (id) => hub.ownerOf(id), deviceName })) {
      fail(ERR.FORBIDDEN, "이 역할로는 할 수 없는 동작입니다.");
      return;
    }
    handle(parsed, deviceId);
  });

  ws.on("close", () => {
    clearTimeout(helloTimer);
    clearInterval(pinger);
    if (deviceId) {
      hub.removeDevice(deviceId);
      hub.broadcast({ t: "devices", payload: { devices: hub.deviceList() } });
    }
  });

  function handleHello(msg: Extract<ClientMessage, { t: "hello" }>): void {
    const lockMs = limiter.lockedFor(ip);
    if (lockMs > 0) {
      fail(ERR.LOCKED, `접속 시도가 많아 ${Math.ceil(lockMs / 1000)}초 뒤에 다시 됩니다.`, true);
      return;
    }
    const found = roleForCode(codes, msg.payload.code);
    // 코드에 맞는 역할만 인정합니다. 보낸 역할은 참고하지 않습니다.
    if (!found || found !== msg.payload.role) {
      limiter.fail(ip);
      fail(ERR.BAD_CODE, "접속 코드가 맞지 않습니다. 호스트 화면의 코드를 확인해 주세요.", true);
      return;
    }
    limiter.succeed(ip);
    clearTimeout(helloTimer);

    const now = new Date().toISOString();
    deviceId = `dev-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
    role = found;
    deviceName = msg.payload.deviceName;
    hub.addDevice({
      id: deviceId, role, name: deviceName,
      connectedAt: now, lastSeen: now, status: "online",
      send, close: (reason) => {
        send({ t: "kicked", payload: { reason } });
        ws.close();
      },
    });
    send({
      t: "welcome",
      payload: { deviceId, role, serverTime: now, snapshot: hub.snapshot() },
    });
    hub.broadcast({ t: "devices", payload: { devices: hub.deviceList() } });
  }

  function handle(msg: ClientMessage, by: string): void {
    switch (msg.t) {
      case "ping":
        send({ t: "pong", payload: {} });
        hub.touch(by);
        break;
      case "patch": {
        const { entity, id, rev, changes } = msg.payload;
        const out = hub.patch(entity, id, rev, changes);
        if (!out.found) {
          fail(ERR.NOT_FOUND, "고치려는 항목이 없습니다.");
          return;
        }
        if (out.conflict) {
          send({
            t: "conflict",
            payload: { entity, id, serverRev: out.rev, serverValue: out.value },
          });
        }
        hub.broadcast({
          t: "patched",
          payload: { entity, id, rev: out.rev, changes, by },
        });
        break;
      }
      case "itemStart":
      case "itemEnd": {
        const it = msg.t === "itemStart"
          ? hub.itemStart(msg.payload.itemId)
          : hub.itemEnd(msg.payload.itemId);
        if (!it) {
          fail(ERR.NOT_FOUND, "그런 순서가 없습니다.");
          return;
        }
        // 다른 순서가 함께 끝났을 수 있으므로 전체를 다시 보냅니다.
        hub.broadcast({
          t: "snapshot",
          payload: { serverTime: new Date().toISOString(), snapshot: hub.snapshot() },
        });
        break;
      }
      case "notice": {
        const n = hub.addNotice(msg.payload);
        hub.broadcast({ t: "notice", payload: { notice: n } }, (d) =>
          n.targets.includes(d.role),
        );
        // 보낸 사람도 목록에서 보고 확인 수를 세려면 문서에 들어가야 합니다.
        hub.broadcast({
          t: "snapshot",
          payload: { serverTime: new Date().toISOString(), snapshot: hub.snapshot() },
        });
        break;
      }
      case "ack": {
        const n = hub.ack(msg.payload.noticeId, by);
        if (n) {
          hub.broadcast({
            t: "patched",
            payload: { entity: "notice", id: n.id, rev: n.rev, changes: { ackBy: n.ackBy }, by },
          });
        }
        break;
      }
      case "publish": {
        const warnings = hub.publish(msg.payload.snapshot);
        hub.broadcast({
          t: "snapshot",
          payload: { serverTime: new Date().toISOString(), snapshot: hub.snapshot() },
        });
        if (warnings.length) {
          send({ t: "error", payload: { code: "warning", message: warnings.join(" ") } });
        }
        break;
      }
      case "noticeClose": {
        const n = hub.closeNotice(msg.payload.noticeId);
        if (!n) {
          fail(ERR.NOT_FOUND, "그런 공지가 없습니다.");
          return;
        }
        hub.broadcast({
          t: "snapshot",
          payload: { serverTime: new Date().toISOString(), snapshot: hub.snapshot() },
        });
        break;
      }
      case "kick": {
        const target = hub.getDevice(msg.payload.deviceId);
        if (!target) {
          fail(ERR.NOT_FOUND, "그 기기는 이미 끊겼습니다.");
          return;
        }
        target.close("운영자가 연결을 끊었습니다.");
        break;
      }
      default:
        break;
    }
  }
}

/** QR 최대 길이. 임의 문자열 QR 생성기로 쓰이지 않게 막습니다. */
const QR_MAX = 256;

/**
 * QR에 담아도 되는 주소인지. **이 호스트를 가리키는 http 주소**만 허용합니다.
 * 포트가 같으면 호스트 이름은 다를 수 있습니다(IP와 stage.local 둘 다 씁니다).
 */
export function qrPayload(want: string, selfUrl: string): string | null {
  if (want.length > QR_MAX) return null;
  try {
    const u = new URL(want);
    const self = new URL(selfUrl);
    if (u.protocol !== "http:") return null;
    if (u.port !== self.port) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** 호스트 안내 페이지. 루프백이 아니면 있다는 사실도 알리지 않습니다. */
function serveHostPage(
  req: IncomingMessage,
  res: import("node:http").ServerResponse,
  path: string,
  ip: string,
  view: () => HostPageView,
  rotate: () => { operator: string; staff: string; display: string },
): void {
  if (!isHostPageAllowed(ip)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("찾는 파일이 없습니다.");
    return;
  }
  const noStore = { "cache-control": "no-store" };
  if (path === "/host/state.json") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", ...noStore });
    res.end(hostStateJson(view()));
    return;
  }
  if (path === "/host/rotate") {
    if (req.method !== "POST") {
      res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
      res.end("POST로 보내 주세요.");
      return;
    }
    rotate();
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", ...noStore });
    res.end(hostStateJson(view()));
    return;
  }
  if (path !== "/host") {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("찾는 파일이 없습니다.");
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", ...noStore });
  res.end(renderHostPage(view()));
}
