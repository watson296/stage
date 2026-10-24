import { formatHHMM } from "@stage-planner/shared";
import * as S from "../state/appState";
import * as N from "../net/client";
import { currentAnnounce, unacked } from "../state/notices";
import { itemName, remainingText, startsInText, useLive } from "./Dashboard";
import { useWakeLock } from "./wakeLock";

/**
 * 대기실 화면. 공지가 떠 있으면 그것만 크게 보여 주고, 없으면 지금·다음 순서를
 * 보여 줍니다. 멀리서 읽어야 하므로 글씨가 큽니다.
 */
export function GreenroomScreen() {
  useWakeLock();
  const v = useLive();
  const notice = currentAnnounce();
  const connecting = N.connState.value === "connecting";

  if (notice) {
    return (
      <div class={"green green-notice" + (notice.level === "urgent" ? " green-urgent" : "")}>
        {connecting && <div class="disp-conn">연결 끊김 — 다시 붙는 중입니다</div>}
        <div class="green-body">
          <div class="green-tag" id="greenTag">
            {notice.level === "urgent" ? "긴급 공지" : "공지"}
          </div>
          <p class="green-text" id="greenText">{notice.text}</p>
          <div class="green-at">{notice.createdAt.slice(11, 16)}</div>
          {unacked(notice) && (
            <button class="btn btn-accent green-ack" id="greenAck"
              onClick={() => N.ackNotice(notice.id)}>확인</button>
          )}
        </div>
        <div class="green-foot" id="greenFoot">
          <span>지금 {itemName(v.current)}</span>
          <span>다음 {itemName(v.next)}</span>
          {v.next && <span>콜 타임 {formatHHMM(v.next.startMin)}</span>}
        </div>
      </div>
    );
  }

  return (
    <div class="green">
      {connecting && <div class="disp-conn">연결 끊김 — 다시 붙는 중입니다</div>}
      <div class="green-body green-plain">
        <div class="green-tag">{S.currentEvent().name}</div>
        <div class="disp-row">
          <span class="disp-label">지금</span>
          <span class="disp-main" id="greenCurrent">{itemName(v.current)}</span>
        </div>
        <div class="disp-row">
          <span class="disp-label">남은 시간</span>
          <span class="disp-main" id="greenRemaining">
            {v.remainingMin != null
              ? remainingText(v.remainingMin)
              : startsInText(v.startsInMin)}
          </span>
        </div>
        <div class="disp-row">
          <span class="disp-label">다음</span>
          <span class="disp-main" id="greenNext">{itemName(v.next)}</span>
        </div>
        <div class="disp-row">
          <span class="disp-label">콜 타임</span>
          <span class="disp-main">{v.next ? formatHHMM(v.next.startMin) : "—"}</span>
        </div>
      </div>
      <div class="green-foot">
        <span class="muted">공지가 오면 이 화면에 크게 뜹니다.</span>
      </div>
    </div>
  );
}
