// 메시지 검증과 권한. 서버가 이 함수들로 모든 요청을 거릅니다.
// 화면에서 단추를 숨기는 것은 편의일 뿐이고, 믿는 곳은 여기뿐입니다(SPEC 3, 10).

import { CAPS, asString, isObject } from "../model/schema";
import type { Role } from "../model/types";
import { MAX_MESSAGE_BYTES, type ClientMessage, type Entity } from "./messages";

export const ERR = {
  TOO_BIG: "too_big",
  BAD_JSON: "bad_json",
  BAD_MESSAGE: "bad_message",
  BAD_CODE: "bad_code",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  TOO_FAST: "too_fast",
  LOCKED: "locked",
} as const;

export type ErrorCode = (typeof ERR)[keyof typeof ERR];

export interface ParseError {
  code: ErrorCode;
  message: string;
}

const ROLES: Role[] = ["operator", "staff", "display"];
const ENTITIES: Entity[] = ["stagePlan", "timetableItem", "notice"];

/** 항목별로 고쳐도 되는 칸. 여기 없는 칸은 버립니다(id, rev는 서버가 정합니다). */
const PATCHABLE: Record<Entity, string[]> = {
  stagePlan: ["name", "stage", "zones", "objects", "notes", "audienceDir"],
  timetableItem: [
    "kind", "title", "plannedStart", "durationMin", "owner", "memo", "stagePlanId",
  ],
  notice: ["text", "level", "targets"],
};

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && ROLES.includes(v as Role);
}

function isEntity(v: unknown): v is Entity {
  return typeof v === "string" && ENTITIES.includes(v as Entity);
}

/**
 * 받은 한 줄을 메시지로 바꿉니다. 모르는 종류, 모르는 칸, 너무 큰 메시지는
 * 거부합니다. 성공하면 **정제된** 메시지를 돌려주므로 서버는 이 값만 씁니다.
 */
export function parseClientMessage(raw: string): ClientMessage | ParseError {
  if (raw.length > MAX_MESSAGE_BYTES) {
    return { code: ERR.TOO_BIG, message: "메시지가 너무 큽니다." };
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { code: ERR.BAD_JSON, message: "읽을 수 없는 메시지입니다." };
  }
  if (!isObject(data) || typeof data.t !== "string") {
    return { code: ERR.BAD_MESSAGE, message: "메시지 형식이 맞지 않습니다." };
  }
  const p = isObject(data.payload) ? data.payload : {};

  switch (data.t) {
    case "hello": {
      if (!isRole(p.role)) {
        return { code: ERR.BAD_MESSAGE, message: "역할이 맞지 않습니다." };
      }
      return {
        t: "hello",
        payload: {
          code: asString(p.code, 12),
          role: p.role,
          deviceName: asString(p.deviceName, 40) || "이름 없는 기기",
        },
      };
    }
    case "patch": {
      if (!isEntity(p.entity) || typeof p.id !== "string" || !isObject(p.changes)) {
        return { code: ERR.BAD_MESSAGE, message: "수정 요청 형식이 맞지 않습니다." };
      }
      const allowed = PATCHABLE[p.entity];
      const changes: Record<string, unknown> = {};
      for (const k of allowed) {
        if (k in p.changes) changes[k] = p.changes[k];
      }
      if (Object.keys(changes).length === 0) {
        return { code: ERR.BAD_MESSAGE, message: "고칠 수 있는 칸이 없습니다." };
      }
      return {
        t: "patch",
        payload: {
          entity: p.entity,
          id: asString(p.id, 40),
          rev: Math.trunc(typeof p.rev === "number" && Number.isFinite(p.rev) ? p.rev : 0),
          changes,
        },
      };
    }
    case "ack":
      return { t: "ack", payload: { noticeId: asString(p.noticeId, 40) } };
    case "itemStart":
      return { t: "itemStart", payload: { itemId: asString(p.itemId, 40) } };
    case "itemEnd":
      return { t: "itemEnd", payload: { itemId: asString(p.itemId, 40) } };
    case "ping":
      return { t: "ping", payload: {} };
    case "notice": {
      const targets = Array.isArray(p.targets) ? p.targets.filter(isRole) : [];
      return {
        t: "notice",
        payload: {
          level: p.level === "urgent" ? "urgent" : "normal",
          text: asString(p.text, CAPS.MAX_STR * 4),
          targets: targets.length ? targets : [...ROLES],
        },
      };
    }
    case "publish":
      // 내용 검증은 서버가 migrate로 합니다. 여기서는 모양만 봅니다.
      if (!isObject(p.snapshot)) {
        return { code: ERR.BAD_MESSAGE, message: "올릴 내용이 없습니다." };
      }
      return { t: "publish", payload: { snapshot: p.snapshot } };
    case "kick":
      return { t: "kick", payload: { deviceId: asString(p.deviceId, 40) } };
    default:
      return { code: ERR.BAD_MESSAGE, message: `모르는 메시지입니다: ${data.t}` };
  }
}

export function isParseError(v: ClientMessage | ParseError): v is ParseError {
  return (v as ParseError).code !== undefined && (v as ClientMessage).t === undefined;
}

export interface PermissionContext {
  /** 순서의 담당자 이름. 스태프는 자기가 담당인 순서만 건드립니다. */
  ownerOf?: (itemId: string) => string | null;
  deviceName?: string;
}

/**
 * 역할이 이 메시지를 보낼 수 있는지.
 *
 * - 운영자: 전부
 * - 스태프: 공지 확인과 **자기가 담당인** 순서의 시작·종료
 * - 표시 화면: 읽기만. 다만 공지 확인(읽음 표시)은 할 수 있습니다
 */
export function canDo(
  role: Role,
  msg: ClientMessage,
  ctx: PermissionContext = {},
): boolean {
  if (msg.t === "hello" || msg.t === "ping") return true;
  if (role === "operator") return true;
  // 공지 확인은 읽음 표시일 뿐 편집이 아닙니다. 대기실 화면도 긴급 공지를
  // 직접 닫아야 하므로 표시 화면에도 허용합니다(SPEC 4.2).
  if (msg.t === "ack") return true;
  if (role === "display") return false;
  if (msg.t === "itemStart" || msg.t === "itemEnd") {
    const owner = ctx.ownerOf?.(msg.payload.itemId) ?? null;
    if (!owner) return false;
    return owner.trim() === (ctx.deviceName ?? "").trim();
  }
  return false;
}
