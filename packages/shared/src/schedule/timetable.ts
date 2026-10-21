// 타임테이블 계산. 계획 시각과 실제 기록을 합쳐 각 순서의 예상 시각과 지연을
// 구합니다. 모두 순수 함수이고 화면·서버가 같은 결과를 씁니다.

import type { Timetable, TimetableItem, TimetableKind } from "../model/types";
import { isoToMinOfDay, parseHHMM } from "./time";

export interface TimetableKindInfo {
  kind: TimetableKind;
  name: string;
  /** 타임라인 막대 색. 종류를 무지개로 나누지 않고 농도로만 구분합니다. */
  tone: "strong" | "mid" | "weak";
}

export const TIMETABLE_KINDS: TimetableKindInfo[] = [
  { kind: "rehearsal", name: "리허설", tone: "mid" },
  { kind: "soundcheck", name: "사운드체크", tone: "mid" },
  { kind: "show", name: "공연", tone: "strong" },
  { kind: "changeover", name: "전환", tone: "weak" },
  { kind: "break", name: "휴식", tone: "weak" },
  { kind: "other", name: "기타", tone: "weak" },
];

export function timetableKindInfo(kind: TimetableKind): TimetableKindInfo {
  return TIMETABLE_KINDS.find((k) => k.kind === kind) ?? TIMETABLE_KINDS[5];
}

export function isTimetableKind(v: unknown): v is TimetableKind {
  return typeof v === "string" && TIMETABLE_KINDS.some((k) => k.kind === v);
}

export const DEFAULT_DURATION_MIN = 30;
export const MAX_DURATION_MIN = 24 * 60;

export interface ScheduledRow {
  item: TimetableItem;
  index: number;
  /** 계획 시작(자정부터 분). 비어 있으면 앞 순서에 이어 붙입니다. */
  plannedMin: number;
  /** 실제 또는 예상 시작. */
  startMin: number;
  endMin: number;
  /** 계획보다 밀린 분. 음수면 당겨진 것입니다. */
  delayMin: number;
  /** 실제 기록이 들어간 줄인지. */
  actual: boolean;
  /** 진행 중인 순서가 예정 길이를 넘겼는지. */
  overrun: boolean;
}

export interface ScheduleResult {
  rows: ScheduledRow[];
  /** 지금 진행 중인 순서의 번호. 없으면 null입니다. */
  runningIndex: number | null;
  /** 다음에 할 순서의 번호. */
  nextIndex: number | null;
  /** 아직 안 끝난 순서 중 가장 큰 지연(분). 없으면 0입니다. */
  delayMin: number;
  /** 마지막 순서가 끝나는 예상 시각(분). 항목이 없으면 null입니다. */
  endMin: number | null;
}

function duration(item: TimetableItem): number {
  return Math.max(0, Math.min(MAX_DURATION_MIN, Math.round(item.durationMin)));
}

/**
 * 순서대로 예상 시각을 구합니다.
 *
 * - 끝난 순서는 실제 기록을 그대로 씁니다.
 * - 진행 중인 순서는 실제 시작에 예정 길이를 더하고, 이미 넘겼으면 지금 시각까지
 *   늘립니다. 그래야 뒤 순서가 현실에 맞게 밀립니다.
 * - 아직 안 한 순서는 앞 순서가 끝난 뒤와 계획 시각 중 **늦은 쪽**에 시작합니다.
 *   앞이 일찍 끝났다고 계획보다 먼저 시작하지는 않기 때문입니다.
 *
 * `nowMin`은 지금 시각(자정부터 분)입니다. null이면 진행 중인 순서를 예정대로만
 * 봅니다(테스트와 편집 화면에서 씁니다).
 */
export function schedule(tt: Timetable, nowMin: number | null = null): ScheduleResult {
  const dayStart = parseHHMM(tt.dayStart) ?? 0;
  const rows: ScheduledRow[] = [];
  let cursor = dayStart;
  let runningIndex: number | null = null;
  let nextIndex: number | null = null;

  tt.items.forEach((item, index) => {
    const planned = parseHHMM(item.plannedStart) ?? cursor;
    const len = duration(item);
    const startedAt = item.actualStart ? isoToMinOfDay(item.actualStart) : null;
    const endedAt = item.actualEnd ? isoToMinOfDay(item.actualEnd) : null;

    let startMin: number;
    let endMin: number;
    let actual = false;
    let overrun = false;

    if (item.status === "done" && startedAt != null) {
      startMin = startedAt;
      endMin = endedAt ?? startedAt + len;
      actual = true;
    } else if (item.status === "running" && startedAt != null) {
      startMin = startedAt;
      endMin = startedAt + len;
      actual = true;
      if (nowMin != null && nowMin > endMin) {
        endMin = nowMin;
        overrun = true;
      }
      runningIndex = index;
    } else {
      startMin = Math.max(cursor, planned);
      endMin = startMin + len;
      if (nextIndex == null && item.status === "pending") nextIndex = index;
    }

    rows.push({
      item,
      index,
      plannedMin: planned,
      startMin,
      endMin,
      delayMin: startMin - planned,
      actual,
      overrun,
    });
    cursor = endMin;
  });

  // 지연은 아직 안 끝난 순서 기준입니다. 이미 끝난 순서의 지연은 되돌릴 수 없고,
  // 운영자가 알고 싶은 것은 "지금부터 얼마나 밀렸는지"입니다.
  const pending = rows.filter((r) => r.item.status !== "done");
  const delayMin = pending.length ? Math.max(...pending.map((r) => r.delayMin)) : 0;

  return {
    rows,
    runningIndex,
    nextIndex,
    delayMin,
    endMin: rows.length ? rows[rows.length - 1].endMin : null,
  };
}

/** 순서를 위아래로 옮긴 새 배열. 범위를 벗어나면 그대로 돌려줍니다. */
export function moveItem(
  items: TimetableItem[],
  index: number,
  delta: number,
): TimetableItem[] {
  const to = index + delta;
  if (index < 0 || index >= items.length || to < 0 || to >= items.length) return items;
  const out = items.slice();
  const [it] = out.splice(index, 1);
  out.splice(to, 0, it);
  return out;
}

/** 새 항목의 기본 시작 시각. 마지막 순서가 끝나는 시각에 붙입니다. */
export function nextStartMin(tt: Timetable): number {
  const r = schedule(tt);
  return r.endMin ?? parseHHMM(tt.dayStart) ?? 0;
}

export function newTimetableItem(
  id: string,
  kind: TimetableKind,
  plannedStart: string,
  durationMin = DEFAULT_DURATION_MIN,
): TimetableItem {
  return {
    id,
    kind,
    title: timetableKindInfo(kind).name,
    plannedStart,
    durationMin,
    owner: "",
    memo: "",
    stagePlanId: null,
    actualStart: null,
    actualEnd: null,
    status: "pending",
    rev: 1,
  };
}
