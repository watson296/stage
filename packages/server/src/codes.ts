// 역할별 접속 코드와 무차별 대입 막기(SPEC 10).
// 코드는 호스트 화면에만 보여 주고 로그에는 남기지 않습니다.

import { randomInt, timingSafeEqual } from "node:crypto";
import type { AccessCodes, Role } from "@stage-planner/shared";

export const CODE_LENGTH = 6;

/** 6자리 숫자 코드. 앞자리가 0이어도 그대로 씁니다. */
export function makeCode(): string {
  let s = "";
  for (let i = 0; i < CODE_LENGTH; i++) s += String(randomInt(0, 10));
  return s;
}

export function makeAccessCodes(): AccessCodes {
  return {
    operator: makeCode(),
    staff: makeCode(),
    display: makeCode(),
    rotatedAt: new Date().toISOString(),
  };
}

/** 길이가 달라도 같은 시간이 걸리게 비교합니다. */
export function codeEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a.padEnd(32, "\0").slice(0, 32));
  const bb = Buffer.from(b.padEnd(32, "\0").slice(0, 32));
  return timingSafeEqual(ba, bb) && a.length === b.length;
}

/** 넣은 코드에 맞는 역할. 어느 것과도 맞지 않으면 null입니다. */
export function roleForCode(codes: AccessCodes, code: string): Role | null {
  if (code.length !== CODE_LENGTH) return null;
  if (codeEquals(codes.operator, code)) return "operator";
  if (codeEquals(codes.staff, code)) return "staff";
  if (codeEquals(codes.display, code)) return "display";
  return null;
}

export interface LimiterOptions {
  maxFailures: number;
  lockMs: number;
  windowMs: number;
}

export const DEFAULT_LIMITS: LimiterOptions = {
  maxFailures: 5,
  lockMs: 60_000,
  windowMs: 10 * 60_000,
};

interface Entry {
  failures: number;
  first: number;
  lockedUntil: number;
}

/**
 * 접속 실패를 IP 단위로 세어 잠시 막습니다. 같은 와이파이에서 쓰는 도구라
 * 영구 차단은 하지 않고, 잠깐 막았다가 풀어 줍니다.
 */
export class FailureLimiter {
  private map = new Map<string, Entry>();

  constructor(private opts: LimiterOptions = DEFAULT_LIMITS) {}

  /** 지금 막혀 있으면 남은 밀리초, 아니면 0. */
  lockedFor(key: string, now = Date.now()): number {
    const e = this.map.get(key);
    if (!e) return 0;
    return e.lockedUntil > now ? e.lockedUntil - now : 0;
  }

  fail(key: string, now = Date.now()): number {
    const e = this.map.get(key);
    if (!e || now - e.first > this.opts.windowMs) {
      this.map.set(key, { failures: 1, first: now, lockedUntil: 0 });
      return 0;
    }
    e.failures++;
    if (e.failures >= this.opts.maxFailures) {
      e.lockedUntil = now + this.opts.lockMs;
      e.failures = 0;
      e.first = now;
      return this.opts.lockMs;
    }
    return 0;
  }

  succeed(key: string): void {
    this.map.delete(key);
  }
}

export interface RateOptions {
  maxPerWindow: number;
  windowMs: number;
}

export const DEFAULT_RATE: RateOptions = { maxPerWindow: 120, windowMs: 10_000 };

/** 메시지 빈도 제한. 연결 하나마다 하나씩 둡니다. */
export class RateCounter {
  private count = 0;
  private start = 0;

  constructor(private opts: RateOptions = DEFAULT_RATE) {}

  /** 보내도 되면 true. 넘으면 false이고 서버가 연결을 끊습니다. */
  allow(now = Date.now()): boolean {
    if (now - this.start > this.opts.windowMs) {
      this.start = now;
      this.count = 0;
    }
    this.count++;
    return this.count <= this.opts.maxPerWindow;
  }
}
