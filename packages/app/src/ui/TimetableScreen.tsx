import {
  TIMETABLE_KINDS,
  formatDuration,
  formatHHMM,
  isNextDay,
  timetableKindInfo,
  type ScheduledRow,
  type TimetableKind,
} from "@stage-planner/shared";
import * as S from "../state/appState";
import * as T from "../state/ttState";
import { myRole, readOnly, sendItemEnd, sendItemStart } from "../net/client";

/** 글자 입력. 고치는 동안을 되돌리기 한 단계로 묶습니다. */
function textHandlers(apply: (v: string) => void) {
  let dirty = false;
  return {
    onFocus: () => {
      S.store.beginTxn();
      dirty = false;
    },
    onInput: (e: Event) => {
      dirty = true;
      apply((e.target as HTMLInputElement).value);
    },
    onBlur: () => {
      if (dirty) S.store.commitTxn();
      else S.store.cancelTxn();
      dirty = false;
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
        (e.target as HTMLInputElement).blur();
      }
    },
  };
}

function timeLabel(min: number): string {
  return formatHHMM(min) + (isNextDay(min) ? " (다음 날)" : "");
}

function delayLabel(min: number): string {
  if (min === 0) return "제시간";
  return min > 0 ? `${formatDuration(min)} 지연` : `${formatDuration(-min)} 당겨짐`;
}

function Head() {
  const r = T.rows();
  const tt = S.currentEvent().timetable;
  return (
    <div class="tt-head">
      <label class="pa-num">
        <span>하루 시작</span>
        <input class="inp" type="time" id="dayStart" value={tt.dayStart}
          {...textHandlers(T.setDayStart)} />
      </label>
      {readOnly() && (
        <span class="ro-note">읽기 전용입니다. 진행 기록은 담당인 순서만 바꿀 수 있습니다.</span>
      )}
      <div class="tt-sum">
        <span id="ttDelay" class={r.delayMin > 0 ? "tt-late" : ""}>
          {r.rows.length === 0 ? "순서가 없습니다" : delayLabel(r.delayMin)}
        </span>
        {r.endMin != null && <span id="ttEnd">끝 예상 {timeLabel(r.endMin)}</span>}
      </div>
      <div class="tt-acts">
        {readOnly() ? null : <label>순서 추가
          <select class="inp" id="addKind" value=""
            onChange={(e) => {
              const sel = e.target as HTMLSelectElement;
              if (sel.value) T.addItem(sel.value as TimetableKind);
              sel.value = "";
            }}>
            <option value="">고르기</option>
            {TIMETABLE_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.name}</option>)}
          </select>
        </label>}
        <button class={"btn" + (T.view.value === "list" ? " active" : "")}
          id="viewList" onClick={() => (T.view.value = "list")}>목록</button>
        <button class={"btn" + (T.view.value === "timeline" ? " active" : "")}
          id="viewTimeline" onClick={() => (T.view.value = "timeline")}>타임라인</button>
        {!readOnly() && (
          <button class="btn" id="ttUndo" disabled={!S.store.canUndo()}
            onClick={() => S.store.undo()}>되돌리기</button>
        )}
      </div>
    </div>
  );
}

/** 호스트에 붙어 있으면 서버로 보내고, 혼자 쓸 때는 바로 기록합니다. */
function startNow(id: string): void {
  if (myRole.value) sendItemStart(id);
  else T.startItem(id);
}
function endNow(id: string): void {
  if (myRole.value) sendItemEnd(id);
  else T.endItem(id);
}

function StatusCell({ row }: { row: ScheduledRow }) {
  const it = row.item;
  if (it.status === "running") {
    return (
      <>
        <span class="tt-running">진행 중</span>
        <button class="btn" onClick={() => endNow(it.id)}>종료</button>
      </>
    );
  }
  if (it.status === "done") {
    return (
      <>
        <span class="muted">끝남</span>
        {!readOnly() && (
          <button class="btn" onClick={() => T.clearRecord(it.id)}>기록 지우기</button>
        )}
      </>
    );
  }
  return <button class="btn btn-accent" onClick={() => startNow(it.id)}>시작</button>;
}

function Row({ row, plans }: { row: ScheduledRow; plans: { id: string; name: string }[] }) {
  const it = row.item;
  const open = T.selectedId.value === it.id;
  return (
    <>
      <tr class={it.status === "running" ? "tt-row tt-now" : "tt-row"} id={`row-${it.id}`}>
        <td class="num">{row.index + 1}</td>
        <td>
          <select class="inp" value={it.kind}
            onChange={(e) => T.setKind(it.id, (e.target as HTMLSelectElement).value as TimetableKind)}>
            {TIMETABLE_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.name}</option>)}
          </select>
        </td>
        <td>
          <input class="inp wide" type="text" value={it.title} placeholder="순서 이름"
            {...textHandlers((v) => T.setTitle(it.id, v))} />
        </td>
        <td>
          <input class="inp" type="time" value={it.plannedStart}
            {...textHandlers((v) => T.setPlannedStart(it.id, v))} />
        </td>
        <td>
          <input class="inp num" type="number" min="0" max="1440" step="5" value={it.durationMin}
            {...textHandlers((v) => T.setDuration(it.id, parseFloat(v) || 0))} />
        </td>
        <td class="tt-when">
          <strong>{timeLabel(row.startMin)}</strong>
          <span class="muted"> – {timeLabel(row.endMin)}</span>
          {row.delayMin !== 0 && (
            <div class={row.delayMin > 0 ? "tt-late" : "muted"}>{delayLabel(row.delayMin)}</div>
          )}
          {row.overrun && <div class="tt-late">예정 길이를 넘겼습니다</div>}
        </td>
        <td>
          <input class="inp" type="text" value={it.owner} placeholder="담당"
            {...textHandlers((v) => T.setOwner(it.id, v))} />
        </td>
        <td><div class="tt-cell"><StatusCell row={row} /></div></td>
        <td>
          {!readOnly() && (
            <div class="tt-cell">
              <button class="btn" onClick={() => T.moveBy(it.id, -1)}>위로</button>
              <button class="btn" onClick={() => T.moveBy(it.id, 1)}>아래로</button>
              <button class="btn" onClick={() => (T.selectedId.value = open ? null : it.id)}>
                {open ? "접기" : "자세히"}
              </button>
            </div>
          )}
        </td>
      </tr>
      {open && (
        <tr class="tt-detail">
          <td />
          <td colSpan={8}>
            <div class="tt-detail-in">
              <label class="pa-num wide">
                <span>메모</span>
                <input class="inp" type="text" value={it.memo} placeholder="전환 내용, 주의할 점"
                  {...textHandlers((v) => T.setMemo(it.id, v))} />
              </label>
              <label class="pa-num">
                <span>무대 도면</span>
                <select class="inp" value={it.stagePlanId ?? ""}
                  onChange={(e) => {
                    const v = (e.target as HTMLSelectElement).value;
                    T.setStagePlan(it.id, v || null);
                  }}>
                  <option value="">연결 없음</option>
                  {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              {!readOnly() && (
                <div class="pa-row">
                  <button class="btn" onClick={() => {
                    const id = S.addPlan(it.title || "새 도면");
                    T.setStagePlan(it.id, id);
                    S.screen.value = "stage";
                  }}>도면 만들기</button>
                  <button class="btn" onClick={() => {
                    const src = it.stagePlanId ?? S.currentPlan().id;
                    const id = S.duplicatePlan(src, `${it.title || "순서"} 세팅`);
                    T.setStagePlan(it.id, id);
                    S.screen.value = "stage";
                  }}>앞 도면 복사</button>
                  {it.stagePlanId && (
                    <button class="btn" onClick={() => {
                      S.selectPlan(it.stagePlanId!);
                      S.screen.value = "stage";
                    }}>도면 열기</button>
                  )}
                </div>
              )}
              <button class="btn btn-danger" onClick={() => T.removeItem(it.id)}>순서 삭제</button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ListView() {
  const r = T.rows();
  const plans = S.currentEvent().stagePlans.map((p) => ({ id: p.id, name: p.name }));
  if (!r.rows.length) {
    return <p class="muted" id="ttEmpty">순서를 추가하면 예상 시각을 계산합니다.</p>;
  }
  return (
    <table class={"pa-table tt-table" + (readOnly() ? " ro" : "")} id="ttTable">
      <thead>
        <tr>
          <th>번호</th><th>종류</th><th>이름</th><th>계획</th><th>길이(분)</th>
          <th>예상 시각</th><th>담당</th><th>진행</th><th>순서</th>
        </tr>
      </thead>
      <tbody>
        {r.rows.map((row) => <Row key={row.item.id} row={row} plans={plans} />)}
      </tbody>
    </table>
  );
}

function TimelineView() {
  const r = T.rows();
  if (!r.rows.length) {
    return <p class="muted">순서를 추가하면 타임라인을 그립니다.</p>;
  }
  const start = Math.min(...r.rows.map((x) => x.startMin));
  const end = Math.max(...r.rows.map((x) => x.endMin));
  const span = Math.max(30, end - start);
  // 한 시간 눈금. 공연 하루는 보통 몇 시간이라 한 시간이면 충분합니다.
  const firstTick = Math.ceil(start / 60) * 60;
  const ticks: number[] = [];
  for (let t = firstTick; t <= end; t += 60) ticks.push(t);
  const pct = (m: number): number => ((m - start) / span) * 100;
  const widthPct = (r: ScheduledRow): number => ((r.endMin - r.startMin) / span) * 100;
  const now = T.nowMin.value;

  return (
    <div class="tl" id="ttTimeline">
      <div class="tl-ticks">
        {ticks.map((t) => (
          <div key={t} class="tl-tick" style={{ left: `${pct(t)}%` }}>
            <span>{formatHHMM(t)}</span>
          </div>
        ))}
        {now >= start && now <= end && (
          <div class="tl-now" id="tlNow" style={{ left: `${pct(now)}%` }} />
        )}
      </div>
      {r.rows.map((row) => (
        <div key={row.item.id} class="tl-row">
          <div class="tl-name">{row.item.title || timetableKindInfo(row.item.kind).name}</div>
          <div class="tl-track">
            <div class={`tl-bar tone-${timetableKindInfo(row.item.kind).tone}` +
              (row.item.status === "running" ? " tl-bar-now" : "")}
              style={{
                left: `${pct(row.startMin)}%`,
                width: `${Math.max(1.5, widthPct(row))}%`,
              }}>
              {/* 좁은 막대에 시각을 넣으면 잘려서 더 헷갈립니다. */}
              {widthPct(row) >= 8 && <span>{formatHHMM(row.startMin)}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function TimetableScreen() {
  S.docTick();
  T.clockTick();
  return (
    <div class="tt">
      <section class="card">
        <Head />
        {T.view.value === "list" ? <ListView /> : <TimelineView />}
      </section>
    </div>
  );
}
