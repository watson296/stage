// 화면에서 쓰는 역할. 서버가 아는 역할(operator/staff/display)과 1:1로 맞춥니다.
// 서버 쪽 이름을 바꾸면 저장된 공연 파일과 접속 코드가 모두 흔들리므로,
// 부르는 이름만 공연 현장에서 쓰는 말로 둡니다.

import { signal } from "@preact/signals";
import type { Role } from "@stage-planner/shared";
import type { Screen } from "./appState";

export type AppRole = "foh" | "crew" | "greenroom";

export interface RoleInfo {
  role: AppRole;
  name: string;
  wire: Role;
  summary: string;
  /** 이 역할이 쓰는 화면. 맨 앞이 들어갔을 때 보이는 화면입니다. */
  screens: Screen[];
}

export const ROLE_INFOS: RoleInfo[] = [
  {
    role: "foh",
    name: "FOH",
    wire: "operator",
    summary: "음향과 진행을 맡습니다. 모든 화면을 쓰고 공지와 지시를 보냅니다.",
    screens: ["dashboard", "timetable", "stage", "pa", "host"],
  },
  {
    role: "crew",
    name: "운영팀",
    wire: "staff",
    summary: "무대 전환과 장비를 맡습니다. FOH가 보낸 지시를 보고 처리합니다.",
    screens: ["dashboard", "timetable", "stage", "host"],
  },
  {
    role: "greenroom",
    name: "대기실",
    wire: "display",
    summary: "출연자 대기실 화면입니다. 공지와 순서를 큰 글씨로 봅니다.",
    screens: ["greenroom", "timetable", "stage", "host"],
  },
];

export function roleInfo(role: AppRole): RoleInfo {
  return ROLE_INFOS.find((r) => r.role === role) ?? ROLE_INFOS[0];
}

/** 서버 역할로 화면 역할을 되찾습니다. 접속한 코드가 역할을 정하기 때문입니다. */
export function roleFromWire(wire: Role): AppRole {
  return ROLE_INFOS.find((r) => r.wire === wire)?.role ?? "greenroom";
}

const KEY = "stage-planner.role.v1";

function stored(): AppRole | null {
  try {
    const v = localStorage.getItem(KEY);
    return ROLE_INFOS.some((r) => r.role === v) ? (v as AppRole) : null;
  } catch {
    return null;
  }
}

/** 고른 역할. null이면 시작 화면을 보여 줍니다. */
export const appRole = signal<AppRole | null>(stored());

export function setAppRole(role: AppRole | null): void {
  appRole.value = role;
  try {
    if (role) localStorage.setItem(KEY, role);
    else localStorage.removeItem(KEY);
  } catch {
    // 저장소를 못 써도 이번 실행 동안은 그대로 씁니다.
  }
}

export function screensFor(role: AppRole | null): Screen[] {
  return role ? roleInfo(role).screens : [];
}

export function canSee(role: AppRole | null, screen: Screen): boolean {
  return screensFor(role).includes(screen);
}

export const SCREEN_NAMES: Record<Screen, string> = {
  start: "시작하기",
  dashboard: "대시보드",
  greenroom: "공지",
  timetable: "타임테이블",
  stage: "무대 설계",
  pa: "PA 조언",
  host: "호스트",
};
