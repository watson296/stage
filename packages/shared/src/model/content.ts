// 공연 문서에 사용자가 만든 내용이 있는지, 두 문서의 내용이 같은지 봅니다.
// 호스트에 접속할 때 이 기기의 작업을 덮어도 되는지 판단하는 데 씁니다.

import type { Event } from "./types";

/**
 * 손댄 내용이 있는지. 장비·메모·구역·순서·커스텀 장비가 하나라도 있거나,
 * 공연 이름이나 공연장 이름을 정했으면 true입니다. 새로 만든 빈 공연은 false입니다.
 */
export function hasContent(e: Event): boolean {
  if (e.name.trim() && e.name !== "새 공연") return true;
  if (e.venue.name.trim()) return true;
  if (e.timetable.items.length > 0) return true;
  if (Object.keys(e.customEquipment).length > 0) return true;
  return e.stagePlans.some(
    (p) => p.objects.length > 0 || p.notes.length > 0 || p.zones.length > 0,
  );
}

/**
 * 공연 내용이 같은지. 런타임 정보(접속 기기, 공지, 접속 코드)와 rev는 보지
 * 않습니다. 호스트가 다시 보내 준 같은 내용을 "다르다"고 보지 않기 위해서입니다.
 */
export function sameContent(a: Event, b: Event): boolean {
  return contentKey(a) === contentKey(b);
}

function contentKey(e: Event): string {
  const { notices: _n, devices: _d, accessCodes: _c, ...rest } = e;
  return JSON.stringify(rest, (k, v) => (k === "rev" ? undefined : v));
}
