// 타임테이블 화면의 상태. 계산은 shared/schedule의 순수 함수가 합니다.

import { signal } from "@preact/signals";
import {
  dateToMinOfDay,
  moveItem,
  newTimetableItem,
  nextStartMin,
  formatHHMM,
  schedule,
  CAPS,
  MAX_DURATION_MIN,
  type Event,
  type ScheduleResult,
  type TimetableItem,
  type TimetableKind,
} from "@stage-planner/shared";
import { store, currentEvent, docVersion, toast } from "./appState";

/** 지금 시각(자정부터 분). 진행 중인 순서의 남은 시간 계산에 씁니다. */
export const nowMin = signal(dateToMinOfDay(new Date()));

let timer = 0;
/** 분이 바뀔 때만 다시 그리도록 15초마다 확인합니다. */
export function startClock(): () => void {
  if (!timer) {
    timer = window.setInterval(() => {
      const m = dateToMinOfDay(new Date());
      if (m !== nowMin.value) nowMin.value = m;
    }, 15000);
  }
  return () => {
    if (timer) {
      clearInterval(timer);
      timer = 0;
    }
  };
}

export function rows(): ScheduleResult {
  docVersion.value;
  return schedule(currentEvent().timetable, nowMin.value);
}

function withItem(id: string, fn: (it: TimetableItem) => void): (doc: Event) => void {
  return (doc) => {
    const it = doc.timetable.items.find((x) => x.id === id);
    if (it) {
      fn(it);
      it.rev++;
    }
  };
}

export function addItem(kind: TimetableKind): void {
  const tt = currentEvent().timetable;
  if (tt.items.length >= CAPS.MAX_TIMETABLE_ITEMS) {
    toast("순서를 더 넣을 수 없습니다.", true);
    return;
  }
  const start = formatHHMM(nextStartMin(tt));
  const id = `tt-${Date.now().toString(36)}-${tt.items.length}`;
  store.commit((doc) => {
    doc.timetable.items.push(newTimetableItem(id, kind, start));
  });
  selectedId.value = id;
}

export function removeItem(id: string): void {
  store.commit((doc) => {
    doc.timetable.items = doc.timetable.items.filter((x) => x.id !== id);
  });
  if (selectedId.value === id) selectedId.value = null;
}

export function moveBy(id: string, delta: number): void {
  const items = currentEvent().timetable.items;
  const i = items.findIndex((x) => x.id === id);
  if (i < 0) return;
  store.commit((doc) => {
    doc.timetable.items = moveItem(doc.timetable.items, i, delta);
  });
}

export function setDayStart(v: string): void {
  store.mutate((doc) => {
    doc.timetable.dayStart = v;
  });
}

export function setTitle(id: string, v: string): void {
  store.mutate(withItem(id, (it) => (it.title = v)));
}
export function setOwner(id: string, v: string): void {
  store.mutate(withItem(id, (it) => (it.owner = v)));
}
export function setMemo(id: string, v: string): void {
  store.mutate(withItem(id, (it) => (it.memo = v)));
}
export function setPlannedStart(id: string, v: string): void {
  store.mutate(withItem(id, (it) => (it.plannedStart = v)));
}
export function setDuration(id: string, v: number): void {
  store.mutate(
    withItem(id, (it) => {
      it.durationMin = Math.max(0, Math.min(MAX_DURATION_MIN, Math.round(v)));
    }),
  );
}
export function setKind(id: string, kind: TimetableKind): void {
  store.commit(withItem(id, (it) => (it.kind = kind)));
}
export function setStagePlan(id: string, planId: string | null): void {
  store.commit(withItem(id, (it) => (it.stagePlanId = planId)));
}

// ── 진행 기록 ────────────────────────────────────────────────────────────────
/** 한 번에 하나만 진행 중입니다. 다른 순서를 시작하면 앞선 것을 끝냅니다. */
export function startItem(id: string): void {
  const now = new Date().toISOString();
  store.commit((doc) => {
    for (const it of doc.timetable.items) {
      if (it.status === "running" && it.id !== id) {
        it.actualEnd = now;
        it.status = "done";
        it.rev++;
      }
    }
    const it = doc.timetable.items.find((x) => x.id === id);
    if (it) {
      it.actualStart = now;
      it.actualEnd = null;
      it.status = "running";
      it.rev++;
    }
  });
  nowMin.value = dateToMinOfDay(new Date());
}

export function endItem(id: string): void {
  const now = new Date().toISOString();
  store.commit(
    withItem(id, (it) => {
      it.actualEnd = now;
      it.status = "done";
    }),
  );
  nowMin.value = dateToMinOfDay(new Date());
}

/** 잘못 누른 기록을 지웁니다. 되돌리기로도 되지만 눈에 보이는 길을 둡니다. */
export function clearRecord(id: string): void {
  store.commit(
    withItem(id, (it) => {
      it.actualStart = null;
      it.actualEnd = null;
      it.status = "pending";
    }),
  );
}

/** 목록에서 펼쳐 둔 항목. 메모처럼 긴 입력은 펼쳤을 때만 보여 줍니다. */
export const selectedId = signal<string | null>(null);

export type TimetableView = "list" | "timeline";
export const view = signal<TimetableView>("list");
