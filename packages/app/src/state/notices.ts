// 공지와 지시를 화면별로 골라 줍니다. 원본은 늘 문서(Event.notices)이고
// 호스트가 가집니다. 화면은 읽기만 합니다.

import { isNoticeOpen, type Notice, type Role } from "@stage-planner/shared";
import { currentEvent, docTick } from "./appState";
import { ackedHere, myDeviceId, myRole } from "../net/client";

function all(): Notice[] {
  docTick();
  return currentEvent().notices;
}

/** 내 역할이 받는 글인지. 호스트에 붙어 있지 않으면 역할 구분이 없습니다. */
function forMe(n: Notice, role: Role | null): boolean {
  return role == null || n.targets.includes(role);
}

/** 대기실에 띄워 둔 공지. 가장 나중에 보낸 것 하나만 띄웁니다. */
export function currentAnnounce(role: Role | null = myRole.value): Notice | null {
  const list = all().filter((n) => n.kind === "announce" && isNoticeOpen(n) && forMe(n, role));
  return list.length ? list[list.length - 1] : null;
}

/** 운영팀 지시 목록. 나중 것이 위로 옵니다. */
export function openCues(role: Role | null = myRole.value): Notice[] {
  return all()
    .filter((n) => n.kind === "cue" && isNoticeOpen(n) && forMe(n, role))
    .slice()
    .reverse();
}

/** FOH가 보는 목록. 역할로 거르지 않고 지금 떠 있는 것을 모두 봅니다. */
export function openAnnouncesAll(): Notice[] {
  return all().filter((n) => n.kind === "announce" && isNoticeOpen(n)).slice().reverse();
}

export function openCuesAll(): Notice[] {
  return all().filter((n) => n.kind === "cue" && isNoticeOpen(n)).slice().reverse();
}

/** 이 기기가 아직 확인하지 않은 글인지. */
export function unacked(n: Notice): boolean {
  const id = myDeviceId.value;
  if (ackedHere.value.includes(n.id)) return false;
  return id == null || !n.ackBy.includes(id);
}

/** 화면 전체를 덮어야 하는 긴급 공지. 확인하면 사라집니다. */
export function coveringNotice(): Notice | null {
  const n = currentAnnounce();
  if (!n || n.level !== "urgent") return null;
  return unacked(n) ? n : null;
}
