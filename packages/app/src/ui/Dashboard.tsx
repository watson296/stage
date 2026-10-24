import { useRef } from "preact/hooks";
import { signal } from "@preact/signals";
import {
  CUE_KINDS,
  cueKindInfo,
  formatDuration,
  formatHHMM,
  liveView,
  timetableKindInfo,
  type CueKind,
  type Notice,
  type ScheduledRow,
} from "@stage-planner/shared";
import * as S from "../state/appState";
import * as T from "../state/ttState";
import * as N from "../net/client";
import { openAnnouncesAll, openCues, openCuesAll, unacked } from "../state/notices";
import { appRole } from "../state/roles";

const ROLE_LABEL: Record<string, string> = {
  operator: "FOH",
  staff: "운영팀",
  display: "대기실",
};

/** 호스트에 붙어 있으면 서버 시각으로 셉니다. 모두 같은 숫자를 봅니다(SPEC 9.6). */
export function liveNowMin(): number {
  T.clockTick(); // 분이 바뀔 때 다시 그립니다
  const d = new Date(Date.now() + N.serverSkewMs.value);
  return d.getHours() * 60 + d.getMinutes();
}

export function useLive() {
  S.docTick();
  return liveView(S.currentEvent().timetable, liveNowMin());
}

export function itemName(row: ScheduledRow | null): string {
  if (!row) return "없음";
  return row.item.title || timetableKindInfo(row.item.kind).name;
}

/** 남은 시간. 넘겼으면 얼마나 넘겼는지 적습니다. */
export function remainingText(min: number | null): string {
  if (min == null) return "—";
  return min >= 0 ? `${formatDuration(min)} 남음` : `${formatDuration(-min)} 넘김`;
}

/**
 * 다음 순서까지 남은 시간. 계획 시각이 이미 지났으면 음수가 되는데,
 * "-8시간 뒤 시작"은 말이 되지 않으므로 바로 시작할 수 있다고 적습니다.
 */
export function startsInText(min: number | null): string {
  if (min == null) return "진행 중인 순서가 없습니다";
  return min > 0 ? `${formatDuration(min)} 뒤 시작` : "시작할 차례입니다";
}

function isFoh(): boolean {
  return appRole.value === "foh";
}

function online(): boolean {
  return N.connState.value === "online";
}

// ── 지금 순서 ────────────────────────────────────────────────────────────────
function NowCard() {
  const v = useLive();
  const start = (id: string): void => (online() ? N.sendItemStart(id) : T.startItem(id));
  const end = (id: string): void => (online() ? N.sendItemEnd(id) : T.endItem(id));
  return (
    <section class="card">
      <h2>지금 순서</h2>
      <div class="big" id="dashCurrent">{itemName(v.current)}</div>
      <div class="big-sub" id="dashRemaining">
        {v.current ? remainingText(v.remainingMin) : startsInText(v.startsInMin)}
      </div>
      <dl class="pa-facts">
        <div><dt>다음</dt><dd id="dashNext">{itemName(v.next)}</dd></div>
        <div><dt>예상 시각</dt><dd>{v.next ? formatHHMM(v.next.startMin) : "—"}</dd></div>
        <div><dt>누적 지연</dt><dd id="dashDelay" class={v.delayMin > 0 ? "tt-late" : ""}>
          {v.delayMin > 0 ? formatDuration(v.delayMin) : "제시간"}
        </dd></div>
      </dl>
      <div class="pa-row">
        {v.current && (
          <button class="btn" id="dashEnd" onClick={() => end(v.current!.item.id)}>순서 종료</button>
        )}
        {!v.current && v.next && (
          <button class="btn btn-accent" id="dashStart"
            onClick={() => start(v.next!.item.id)}>다음 순서 시작</button>
        )}
      </div>
    </section>
  );
}

// ── 타임테이블 요약 ──────────────────────────────────────────────────────────
function TimetableCard() {
  const r = T.rows();
  const rows = r.rows.filter((x) => x.item.status !== "done").slice(0, 6);
  return (
    <section class="card">
      <h2>타임테이블</h2>
      {rows.length === 0 ? (
        <p class="muted">남은 순서가 없습니다.</p>
      ) : (
        <table class="pa-table" id="dashTt">
          <thead><tr><th>시각</th><th>순서</th><th>담당</th><th>도면</th></tr></thead>
          <tbody>
            {rows.map((row) => {
              const plan = S.currentEvent().stagePlans.find((p) => p.id === row.item.stagePlanId);
              return (
                <tr key={row.item.id} class={row.item.status === "running" ? "tt-now" : ""}>
                  <td>{formatHHMM(row.startMin)}</td>
                  <td>{itemName(row)}</td>
                  <td>{row.item.owner || "—"}</td>
                  <td>
                    {plan ? (
                      <button class="btn" onClick={() => {
                        S.selectPlan(plan.id);
                        S.screen.value = "stage";
                      }}>{plan.name}</button>
                    ) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <button class="btn" onClick={() => (S.screen.value = "timetable")}>타임테이블 열기</button>
    </section>
  );
}

// ── 보내기 ───────────────────────────────────────────────────────────────────
const cueKind = signal<CueKind>("mic");

function AnnounceForm() {
  const text = useRef<HTMLInputElement>(null);
  const send = (level: "normal" | "urgent"): void => {
    const v = (text.current?.value ?? "").trim();
    if (!v) {
      text.current?.focus();
      return;
    }
    N.sendNotice({ kind: "announce", text: v, level, targets: ["display"] });
    if (text.current) text.current.value = "";
    S.toast("대기실 화면에 띄웠습니다.");
  };
  return (
    <section class="card">
      <h2>대기실 공지</h2>
      <p class="muted">대기실 화면을 가득 채워 띄웁니다. 내릴 때까지 그대로 있습니다.</p>
      <div class="pa-row">
        <label class="pa-num wide">
          <span>내용</span>
          <input class="inp" type="text" id="announceText" ref={text}
            placeholder="예: 3팀 공연장 이동 준비해 주세요"
            onKeyDown={(e) => { if (e.key === "Enter") send("normal"); }} />
        </label>
        <button class="btn" id="btnAnnounce" disabled={!online()}
          onClick={() => send("normal")}>띄우기</button>
        <button class="btn btn-danger" id="btnAnnounceUrgent" disabled={!online()}
          onClick={() => send("urgent")}>긴급</button>
      </div>
      {!online() && <p class="muted">호스트에 붙어 있어야 보낼 수 있습니다.</p>}
    </section>
  );
}

function CueForm() {
  const text = useRef<HTMLInputElement>(null);
  const item = useRef<HTMLSelectElement>(null);
  const info = cueKindInfo(cueKind.value);
  const send = (): void => {
    const v = (text.current?.value ?? "").trim();
    if (!v) {
      text.current?.focus();
      return;
    }
    N.sendNotice({
      kind: "cue",
      text: v,
      targets: ["staff"],
      cueKind: cueKind.value,
      itemId: item.current?.value || null,
    });
    if (text.current) text.current.value = "";
    S.toast("운영팀에 지시를 보냈습니다.");
  };
  return (
    <section class="card">
      <h2>운영팀 지시</h2>
      <p class="muted">운영팀 목록에 쌓입니다. 처리하면 체크해 내립니다.</p>
      <div class="pa-grid">
        <label class="pa-num">
          <span>종류</span>
          <select class="inp" id="cueKind" value={cueKind.value}
            onChange={(e) => (cueKind.value = (e.target as HTMLSelectElement).value as CueKind)}>
            {CUE_KINDS.map((c) => <option key={c.kind} value={c.kind}>{c.name}</option>)}
          </select>
        </label>
        <label class="pa-num">
          <span>대상 순서</span>
          <select class="inp" id="cueItem" ref={item}>
            <option value="">전체</option>
            {S.currentEvent().timetable.items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.title || timetableKindInfo(i.kind).name}
              </option>
            ))}
          </select>
        </label>
        <label class="pa-num wide">
          <span>내용</span>
          <input class="inp" type="text" id="cueText" ref={text} placeholder={info.hint || "할 일"}
            onKeyDown={(e) => { if (e.key === "Enter") send(); }} />
        </label>
      </div>
      <button class="btn btn-accent" id="btnCue" disabled={!online()} onClick={send}>
        지시 보내기
      </button>
    </section>
  );
}

// ── 지금 떠 있는 글 ──────────────────────────────────────────────────────────
function itemTitle(id: string | null | undefined): string | null {
  if (!id) return null;
  const it = S.currentEvent().timetable.items.find((x) => x.id === id);
  return it ? it.title || timetableKindInfo(it.kind).name : null;
}

/**
 * 지시 한 줄.
 *
 * 공지 객체를 통째로 넘기지 않고 보여 줄 값만 넘깁니다. Preact는 props가 같은
 * 객체이면 자식을 다시 그리지 않아서, 객체 안의 숫자(처리 수)만 바뀌면 화면이
 * 옛 값에 머뭅니다.
 */
function CueRow(props: {
  id: string;
  tag: string;
  text: string;
  target: string | null;
  acks: number;
  todo: boolean;
  foh: boolean;
}) {
  return (
    <li class="cue-item">
      <span class="cue-tag">{props.tag}</span>
      <span class="cue-text">
        {props.text}
        {props.target && <span class="muted"> — {props.target}</span>}
      </span>
      <span class="cue-acts">
        {!props.foh && props.todo && (
          <button class="btn" onClick={() => N.ackNotice(props.id)}>처리함</button>
        )}
        {!props.foh && !props.todo && <span class="muted">처리함</span>}
        {props.foh && <span class="muted">{props.acks}명 처리</span>}
        {props.foh && (
          <button class="btn" onClick={() => N.closeNotice(props.id)}>내리기</button>
        )}
      </span>
    </li>
  );
}

function cueRow(n: Notice, foh: boolean) {
  return (
    <CueRow key={n.id} id={n.id} foh={foh}
      tag={cueKindInfo(n.cueKind ?? "other").name}
      text={n.text}
      target={itemTitle(n.itemId)}
      acks={n.ackBy.length}
      todo={unacked(n)} />
  );
}

function BoardCard() {
  const foh = isFoh();
  const announces = foh ? openAnnouncesAll() : [];
  const cues = foh ? openCuesAll() : openCues();
  return (
    <section class="card">
      <h2>{foh ? "지금 떠 있는 글" : "받은 지시"}</h2>
      {foh && (
        <>
          <h3>대기실 공지</h3>
          {announces.length === 0 ? (
            <p class="muted" id="noAnnounce">띄워 둔 공지가 없습니다.</p>
          ) : (
            <ul class="cue-list" id="announceList">
              {announces.map((n) => (
                <li key={n.id} class="cue-item">
                  <span class={"cue-tag" + (n.level === "urgent" ? " cue-urgent" : "")}>
                    {n.level === "urgent" ? "긴급" : "공지"}
                  </span>
                  <span class="cue-text">{n.text}</span>
                  <span class="cue-acts">
                    <span class="muted">{n.ackBy.length}대 확인</span>
                    <button class="btn" onClick={() => N.closeNotice(n.id)}>내리기</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <h3>운영팀 지시</h3>
        </>
      )}
      {cues.length === 0 ? (
        <p class="muted" id="noCue">
          {foh ? "보낸 지시가 없습니다." : "아직 받은 지시가 없습니다."}
        </p>
      ) : (
        <ul class="cue-list" id="cueList">
          {cues.map((n) => cueRow(n, foh))}
        </ul>
      )}
    </section>
  );
}

function DeviceCard() {
  const devices = N.devices.value;
  if (!online()) {
    return (
      <section class="card">
        <h2>접속 기기</h2>
        <p class="muted" id="dashOffline">
          호스트에 붙어 있지 않습니다. 혼자 쓰는 중이라 이 기기에만 기록됩니다.
        </p>
      </section>
    );
  }
  return (
    <section class="card">
      <h2>접속 기기</h2>
      {devices.length === 0 ? (
        <p class="muted">붙어 있는 기기가 없습니다.</p>
      ) : (
        <table class="pa-table" id="dashDevices">
          <thead><tr><th>이름</th><th>자리</th><th>상태</th></tr></thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td>{ROLE_LABEL[d.role] ?? d.role}</td>
                <td>{d.status === "online" ? "접속" : "끊김"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function Dashboard() {
  const foh = isFoh();
  return (
    <div class="pa dash">
      <div class="pa-col">
        <NowCard />
        <TimetableCard />
      </div>
      <div class="pa-col">
        <BoardCard />
        {foh && <AnnounceForm />}
        {foh && <CueForm />}
        {foh && <DeviceCard />}
      </div>
    </div>
  );
}
