// 호스트와 접속 기기가 주고받는 WebSocket 메시지입니다(SPEC 9장).
// 5단계에서 서버·클라이언트가 이 타입을 함께 씁니다.
import type { Device, Event, Notice, Role } from "../model/types";

/** 메시지 하나의 최대 크기(바이트). 넘으면 거부합니다. */
export const MAX_MESSAGE_BYTES = 64 * 1024;

/**
 * 운영자의 `publish`만 예외로 이만큼까지 받습니다. 공연 전체를 한 번에 올리므로
 * 장비가 400개쯤 되면 64KB를 넘습니다. 스키마 상한(장비 1000개 등)을 채워도
 * 넉넉한 크기입니다. 접속 코드를 넣기 전에는 이 예외를 쓰지 못합니다.
 */
export const MAX_PUBLISH_BYTES = 2 * 1024 * 1024;

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
  | { t: "ping"; payload: Record<string, never> }
  | { t: "notice"; payload: { level: "normal" | "urgent"; text: string; targets: Role[] } }
  // 운영자가 자기 기기의 작업을 호스트에 올립니다. 호스트가 단일 원본이므로
  // 이 메시지 뒤에는 모두가 호스트의 내용을 봅니다.
  | { t: "publish"; payload: { snapshot: unknown } }
  | { t: "kick"; payload: { deviceId: string } };

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
