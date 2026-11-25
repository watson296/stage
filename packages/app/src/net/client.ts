// 호스트 접속. 호스트가 단일 원본이므로 받은 내용은 그대로 따르고,
// 운영자일 때만 내 작업을 올립니다(SPEC 9).

import { signal } from "@preact/signals";
import {
  MAX_PUBLISH_BYTES,
  cloneEvent,
  hasContent,
  migrate,
  sameContent,
  type Device,
  type Notice,
  type Role,
} from "@stage-planner/shared";
import { store, docVersion, toast } from "../state/appState";
import { loadBackup, saveBackup } from "../state/autosave";

export type ConnState = "offline" | "connecting" | "online";

export const connState = signal<ConnState>("offline");
export const connMessage = signal("");
export const myRole = signal<Role | null>(null);
export const myDeviceId = signal<string | null>(null);
export const devices = signal<Device[]>([]);
export const liveNotices = signal<Notice[]>([]);
/** 서버 시각 − 내 시각(ms). 남은 시간을 모두 같은 숫자로 보게 맞춥니다(SPEC 9.6). */
export const serverSkewMs = signal(0);
export const hostUrl = signal("");
/** 접속 전 작업이 따로 남아 있는지. 호스트 화면에서 되살리기 단추를 보입니다. */
export const backupAvailable = signal(false);

let ws: WebSocket | null = null;
let wanted: { url: string; code: string; role: Role; name: string } | null = null;
let retry = 0;
let retryTimer = 0;
/** 호스트에서 받은 내용을 반영하는 중. 그동안 올리기를 멈춥니다. */
let applyingRemote = false;
let publishTimer = 0;

const PUBLISH_DEBOUNCE_MS = 400;
const MAX_RETRY_MS = 10_000;

/** http(s) 주소를 ws(s) 주소로 바꿉니다. 사용자가 둘 중 뭘 넣어도 되게 합니다. */
export function toWsUrl(raw: string): string {
  const t = raw.trim() || location.origin;
  const withScheme = /^[a-z]+:\/\//i.test(t) ? t : `http://${t}`;
  const u = new URL(withScheme);
  u.protocol = u.protocol === "https:" || u.protocol === "wss:" ? "wss:" : "ws:";
  u.pathname = "/";
  return u.toString();
}

export function httpBase(): string {
  if (!hostUrl.value) return "";
  const u = new URL(hostUrl.value);
  u.protocol = u.protocol === "wss:" ? "https:" : "http:";
  return u.origin;
}

export function connect(url: string, code: string, role: Role, name: string): void {
  disconnect(false);
  wanted = { url: toWsUrl(url), code, role, name };
  hostUrl.value = wanted.url;
  open();
}

function open(): void {
  if (!wanted) return;
  connState.value = "connecting";
  connMessage.value = "호스트를 찾는 중입니다.";
  let socket: WebSocket;
  try {
    socket = new WebSocket(wanted.url);
  } catch {
    connMessage.value = "주소를 읽을 수 없습니다. 호스트 화면의 주소를 확인해 주세요.";
    connState.value = "offline";
    return;
  }
  ws = socket;

  socket.onopen = () => {
    if (!wanted) return;
    retry = 0;
    send({
      t: "hello",
      payload: { code: wanted.code, role: wanted.role, deviceName: wanted.name },
    });
  };

  socket.onmessage = (ev) => {
    let msg: { t: string; payload: Record<string, unknown> };
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    handle(msg);
  };

  socket.onclose = () => {
    if (ws === socket) ws = null;
    myRole.value = null;
    myDeviceId.value = null;
    if (!wanted) {
      connState.value = "offline";
      return;
    }
    connState.value = "connecting";
    // 끊기면 마지막 내용을 그대로 두고 다시 붙습니다(SPEC 9.5).
    connMessage.value = "연결이 끊겼습니다. 다시 붙는 중입니다.";
    retry = Math.min(MAX_RETRY_MS, retry ? retry * 2 : 500);
    retryTimer = window.setTimeout(open, retry);
  };

  socket.onerror = () => {
    connMessage.value = "호스트에 닿지 못했습니다. 같은 와이파이인지 확인해 주세요.";
  };
}

export function disconnect(byUser = true): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = 0;
  }
  if (byUser) wanted = null;
  const socket = ws;
  ws = null;
  if (socket) {
    socket.onclose = null;
    socket.close();
  }
  if (byUser) {
    connState.value = "offline";
    connMessage.value = "";
    myRole.value = null;
    myDeviceId.value = null;
    devices.value = [];
  }
}

function send(msg: unknown): void {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function applySnapshot(raw: unknown, serverTime: string): void {
  const { event } = migrate(raw);
  applyingRemote = true;
  store.replace(event);
  applyingRemote = false;
  setSkew(serverTime);
}

function setSkew(serverTime: string): void {
  const t = Date.parse(serverTime);
  if (!Number.isNaN(t)) serverSkewMs.value = t - Date.now();
}

/**
 * 접속했을 때 이 기기의 작업을 어떻게 할지 정합니다.
 *
 * 호스트가 단일 원본이라 보통은 호스트 내용을 따릅니다. 그러면 이 기기에서
 * 만든 작업이 자동 저장까지 덮이므로, 내용이 다르면 먼저 따로 남겨 둡니다.
 * 운영자가 빈 호스트(새로 띄웠거나 꺼졌다 다시 켠 호스트)에 붙으면 덮지 않고
 * 이 기기의 작업을 올립니다.
 */
function onWelcome(role: Role, raw: unknown, serverTime: string): void {
  const local = cloneEvent(store.get());
  const host = migrate(raw).event;
  const localHas = hasContent(local);
  const differs = localHas && !sameContent(local, host);

  if (differs) {
    saveBackup(local)
      .then(() => (backupAvailable.value = true))
      .catch(() =>
        toast("접속 전 작업을 따로 남기지 못했습니다. 저장(JSON)으로 파일을 남겨 두세요.", true),
      );
  }

  if (role === "operator" && localHas && !hasContent(host)) {
    setSkew(serverTime);
    publishNow();
    toast("호스트가 비어 있어 이 기기의 작업을 올렸습니다.");
    return;
  }

  applyingRemote = true;
  store.replace(host);
  applyingRemote = false;
  setSkew(serverTime);
  toast(
    differs
      ? "호스트의 내용으로 바꿨습니다. 접속 전 작업은 호스트 화면의 '접속 전 작업 되살리기'로 다시 열 수 있습니다."
      : "호스트에 접속했습니다.",
  );
}

/**
 * 접속 전 작업을 다시 엽니다. 운영자로 붙어 있으면 그대로 호스트에 올라갑니다.
 * 읽기 전용으로 붙어 있을 때는 다음 스냅샷에 덮이므로 쓰지 않습니다.
 */
export async function restoreBackup(): Promise<void> {
  if (!canEdit()) {
    toast("읽기 전용으로 붙어 있을 때는 되살릴 수 없습니다. 접속을 끊은 뒤 해 주세요.", true);
    return;
  }
  try {
    const saved = await loadBackup();
    if (!saved) {
      backupAvailable.value = false;
      toast("되살릴 작업이 없습니다.", true);
      return;
    }
    store.replace(saved.event);
    saved.warnings.forEach((w) => toast(w));
    toast(
      connState.value === "online"
        ? "접속 전 작업을 되살려 호스트에 올렸습니다."
        : "접속 전 작업을 되살렸습니다.",
    );
  } catch (e) {
    toast(e instanceof Error ? e.message : "되살리지 못했습니다.", true);
  }
}

function handle(msg: { t: string; payload: Record<string, unknown> }): void {
  switch (msg.t) {
    case "welcome": {
      const p = msg.payload as {
        deviceId: string; role: Role; serverTime: string; snapshot: unknown;
      };
      myDeviceId.value = p.deviceId;
      myRole.value = p.role;
      connState.value = "online";
      connMessage.value = "";
      onWelcome(p.role, p.snapshot, p.serverTime);
      break;
    }
    case "snapshot": {
      const p = msg.payload as { serverTime: string; snapshot: unknown };
      applySnapshot(p.snapshot, p.serverTime);
      break;
    }
    case "patched": {
      const p = msg.payload as {
        entity: string; id: string; rev: number; changes: Record<string, unknown>;
      };
      applyPatched(p.entity, p.id, p.rev, p.changes);
      break;
    }
    case "conflict": {
      toast("다른 사람이 먼저 고쳤습니다. 호스트의 내용으로 맞췄습니다.", true);
      break;
    }
    case "notice": {
      const n = (msg.payload as { notice: Notice }).notice;
      liveNotices.value = [...liveNotices.value, n];
      break;
    }
    case "devices":
      devices.value = (msg.payload as { devices: Device[] }).devices;
      break;
    case "kicked":
      toast(String(msg.payload.reason ?? "연결이 끊겼습니다."), true);
      disconnect(true);
      break;
    case "error": {
      const code = String(msg.payload.code ?? "");
      connMessage.value = String(msg.payload.message ?? "");
      // 코드가 틀렸거나 막힌 경우에는 다시 붙어도 소용이 없습니다.
      if (code === "bad_code" || code === "locked") {
        wanted = null;
        connState.value = "offline";
      }
      toast(connMessage.value, true);
      break;
    }
    default:
      break;
  }
}

function applyPatched(
  entity: string,
  id: string,
  rev: number,
  changes: Record<string, unknown>,
): void {
  applyingRemote = true;
  store.mutate((doc) => {
    const target =
      entity === "stagePlan"
        ? doc.stagePlans.find((p) => p.id === id)
        : entity === "timetableItem"
          ? doc.timetable.items.find((i) => i.id === id)
          : doc.notices.find((n) => n.id === id);
    if (!target) return;
    Object.assign(target as unknown as Record<string, unknown>, changes);
    (target as { rev: number }).rev = rev;
  });
  applyingRemote = false;
}

// ── 내보내기 ─────────────────────────────────────────────────────────────────
export function publishNow(): void {
  if (myRole.value !== "operator") return;
  // 공지와 접속 기기 목록은 호스트가 가진 것을 씁니다(hub.publish). 올릴 필요가
  // 없고, 공지가 쌓이면 메시지만 커집니다.
  const msg = JSON.stringify({
    t: "publish",
    payload: { snapshot: { ...store.get(), notices: [], devices: [] } },
  });
  if (new Blob([msg]).size > MAX_PUBLISH_BYTES) {
    toast("공연 내용이 너무 커서 호스트에 올리지 못했습니다. 저장(JSON)으로 파일을 남겨 두세요.", true);
    return;
  }
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(msg);
}

export function sendItemStart(itemId: string): void {
  send({ t: "itemStart", payload: { itemId } });
}
export function sendItemEnd(itemId: string): void {
  send({ t: "itemEnd", payload: { itemId } });
}
export function sendNotice(
  text: string,
  level: "normal" | "urgent",
  targets: Role[],
): void {
  send({ t: "notice", payload: { text, level, targets } });
}
export function ackNotice(noticeId: string): void {
  send({ t: "ack", payload: { noticeId } });
  liveNotices.value = liveNotices.value.filter((n) => n.id !== noticeId);
}
export function kickDevice(deviceId: string): void {
  send({ t: "kick", payload: { deviceId } });
}

/**
 * 지금 이 기기가 고칠 수 있는지. 호스트에 붙어 있으면 운영자만 고칩니다.
 * 서버도 같은 검사를 하지만, 화면에서도 막아야 고친 것이 조용히 사라지지
 * 않습니다. 혼자 쓸 때는 늘 고칠 수 있습니다.
 */
export function canEdit(): boolean {
  return connState.value === "offline" || myRole.value === "operator";
}

export function readOnly(): boolean {
  return !canEdit();
}

/**
 * 운영자가 고친 것을 호스트에 올립니다. 항목 단위 patch 대신 통째로 올리는
 * 이유는, 도면 편집이 한 번에 여러 항목을 건드리고 운영자가 보통 한 명이기
 * 때문입니다. 여럿이 같은 항목을 고치는 경우는 patch와 rev로 거릅니다.
 */
store.subscribe(() => {
  if (applyingRemote || connState.value !== "online" || myRole.value !== "operator") return;
  if (publishTimer) clearTimeout(publishTimer);
  publishTimer = window.setTimeout(() => {
    publishTimer = 0;
    publishNow();
  }, PUBLISH_DEBOUNCE_MS);
});

/** 화면이 다시 그려지도록 문서 번호를 읽습니다. */
export function liveVersion(): number {
  return docVersion.value;
}

// 앞서 남겨 둔 접속 전 작업이 있으면 되살리기 단추를 보입니다.
loadBackup()
  .then((b) => (backupAvailable.value = b != null))
  .catch(() => {});
