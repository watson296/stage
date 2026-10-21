import { useRef } from "preact/hooks";
import {
  formatDuration,
  formatHHMM,
  liveView,
  timetableKindInfo,
  type Role,
  type ScheduledRow,
} from "@stage-planner/shared";
import * as S from "../state/appState";
import * as T from "../state/ttState";
import * as N from "../net/client";

const ROLE_LABEL: Record<string, string> = {
  operator: "운영자",
  staff: "스태프",
  display: "표시 화면",
};

/** 호스트에 붙어 있으면 서버 시각으로 셉니다. 모두 같은 숫자를 봅니다(SPEC 9.6). */
export function liveNowMin(): number {
  T.nowMin.value; // 분이 바뀔 때 다시 그립니다
  const d = new Date(Date.now() + N.serverSkewMs.value);
  return d.getHours() * 60 + d.getMinutes();
}

export function useLive() {
  S.docVersion.value;
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

function NoticeForm() {
  const text = useRef<HTMLInputElement>(null);
  const online = N.connState.value === "online";
  const send = (level: "normal" | "urgent"): void => {
    const v = (text.current?.value ?? "").trim();
    if (!v) {
      text.current?.focus();
      return;
    }
    // 보낸 사람 화면까지 덮을 필요는 없습니다. 보낸 내용은 아래 목록에 남습니다.
    const targets: Role[] = ["staff", "display"];
    N.sendNotice(v, level, targets);
    if (text.current) text.current.value = "";
    S.toast(level === "urgent" ? "긴급 공지를 보냈습니다." : "공지를 보냈습니다.");
  };
  return (
    <section class="card">
      <h2>공지 보내기</h2>
      <div class="pa-row">
        <label class="pa-num wide">
          <span>내용</span>
          <input class="inp" type="text" id="noticeText" ref={text}
            placeholder="예: 3팀 대기실로 와 주세요"
            onKeyDown={(e) => { if (e.key === "Enter") send("normal"); }} />
        </label>
        <button class="btn" id="btnNotice" disabled={!online}
          onClick={() => send("normal")}>공지</button>
        <button class="btn btn-danger" id="btnUrgent" disabled={!online}
          onClick={() => send("urgent")}>긴급 공지</button>
      </div>
      <p class="muted">
        {online
          ? "긴급 공지는 받는 화면을 전부 덮습니다. 확인을 누르면 사라집니다."
          : "공지는 호스트를 거쳐 갑니다. 호스트 화면에서 먼저 접속해 주세요."}
      </p>
    </section>
  );
}

function SentNotices() {
  const list = S.currentEvent().notices.slice(-8).reverse();
  if (!list.length) return null;
  return (
    <section class="card">
      <h2>보낸 공지</h2>
      <table class="pa-table" id="noticeTable">
        <thead><tr><th>시각</th><th>내용</th><th>확인</th></tr></thead>
        <tbody>
          {list.map((n) => (
            <tr key={n.id}>
              <td>{n.createdAt.slice(11, 16)}</td>
              <td>{n.level === "urgent" ? `긴급 — ${n.text}` : n.text}</td>
              <td>{n.ackBy.length}대</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function Dashboard() {
  const v = useLive();
  const devices = N.devices.value;
  const online = N.connState.value === "online";

  return (
    <div class="pa dash">
      <div class="pa-col">
        <section class="card">
          <h2>지금 순서</h2>
          <div class="big" id="dashCurrent">{itemName(v.current)}</div>
          <div class="big-sub" id="dashRemaining">
            {v.current
              ? remainingText(v.remainingMin)
              : v.startsInMin != null
                ? `${formatDuration(v.startsInMin)} 뒤 시작`
                : "진행 중인 순서가 없습니다"}
          </div>
          {v.current && (
            <button class="btn" id="dashEnd"
              onClick={() => (online ? N.sendItemEnd(v.current!.item.id) : T.endItem(v.current!.item.id))}>
              순서 종료
            </button>
          )}
          {!v.current && v.next && (
            <button class="btn btn-accent" id="dashStart"
              onClick={() => (online ? N.sendItemStart(v.next!.item.id) : T.startItem(v.next!.item.id))}>
              다음 순서 시작
            </button>
          )}
        </section>

        <section class="card">
          <h2>다음 순서</h2>
          <div class="mid" id="dashNext">{itemName(v.next)}</div>
          <dl class="pa-facts">
            <div><dt>예상 시각</dt><dd>{v.next ? formatHHMM(v.next.startMin) : "—"}</dd></div>
            <div><dt>담당</dt><dd>{v.next?.item.owner || "—"}</dd></div>
            <div><dt>누적 지연</dt><dd id="dashDelay" class={v.delayMin > 0 ? "tt-late" : ""}>
              {v.delayMin > 0 ? formatDuration(v.delayMin) : "제시간"}
            </dd></div>
          </dl>
          {v.next?.item.memo && <p class="muted">{v.next.item.memo}</p>}
        </section>
      </div>

      <div class="pa-col">
        <NoticeForm />
        <section class="card">
          <h2>접속 기기</h2>
          {!online ? (
            <p class="muted" id="dashOffline">
              호스트에 붙어 있지 않습니다. 혼자 쓰는 중이라 이 기기에만 기록됩니다.
            </p>
          ) : devices.length === 0 ? (
            <p class="muted">붙어 있는 기기가 없습니다.</p>
          ) : (
            <table class="pa-table" id="dashDevices">
              <thead><tr><th>이름</th><th>역할</th><th>상태</th></tr></thead>
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
        <SentNotices />
      </div>
    </div>
  );
}
