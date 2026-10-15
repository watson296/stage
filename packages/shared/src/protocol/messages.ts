// 호스트와 접속 기기가 주고받는 WebSocket 메시지입니다(SPEC 9장).
// 5단계에서 서버·클라이언트가 이 타입을 함께 씁니다.
import type { Device, Event, Notice, Role } from "../model/types";

/** 메시지 하나의 최대 크기(바이트). 넘으면 연결을 끊습니다. */
export const MAX_MESSAGE_BYTES = 64 * 1024;

export type Entity = "stagePlan" | "timetableItem" | "notice";

export interface Envelope<T = unknown> {
  t: string;
  seq?: number;
  payload: T;
}

// 클라이언트 → 서버
export type ClientMessage =
  | { t: "hello"; payload: { code: string; role: Role; deviceName: string } }
  | { t: "patch"; payload: { entity: Entity; id: string; rev: number; changes: Record<string, unknown> } }
  | { t: "ack"; payload: { noticeId: string } }
  | { t: "itemStart"; payload: { itemId: string } }
  | { t: "itemEnd"; payload: { itemId: string } }
  | { t: "ping"; payload: Record<string, never> };

// 서버 → 클라이언트
export type ServerMessage =
  | { t: "welcome"; payload: { deviceId: string; role: Role; serverTime: string; snapshot: Event } }
  | { t: "snapshot"; payload: { serverTime: string; snapshot: Event } }
  | { t: "patched"; payload: { entity: Entity; id: string; rev: number; changes: Record<string, unknown>; by: string } }
  | { t: "conflict"; payload: { entity: Entity; id: string; serverRev: number; serverValue: unknown } }
  | { t: "notice"; payload: { notice: Notice } }
  | { t: "devices"; payload: { devices: Device[] } }
  | { t: "kicked"; payload: { reason: string } }
  | { t: "error"; payload: { code: string; message: string } }
  | { t: "pong"; payload: Record<string, never> };
