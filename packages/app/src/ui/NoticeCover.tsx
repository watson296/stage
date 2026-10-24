import * as N from "../net/client";
import * as S from "../state/appState";
import { coveringNotice, openCues, unacked } from "../state/notices";
import { appRole } from "../state/roles";

/**
 * 긴급 공지는 어느 화면에 있든 전체를 덮습니다. 대기실 화면에서는 공지가 이미
 * 화면 전체이므로 덮지 않습니다.
 */
export function NoticeCover() {
  const role = appRole.value;
  const onGreenroom = S.screen.value === "greenroom";
  const urgent = role === "foh" || onGreenroom ? null : coveringNotice();

  // 운영팀에는 아직 처리하지 않은 지시 수를 작게 띄웁니다.
  const todo =
    role === "crew" && S.screen.value !== "dashboard"
      ? openCues().filter(unacked).length
      : 0;

  return (
    <>
      {urgent && (
        <div class="notice-ov" id="urgentNotice">
          <div class="notice-box">
            <div class="notice-tag">긴급 공지</div>
            <p class="notice-text">{urgent.text}</p>
            <button class="btn btn-accent" id="btnAck"
              onClick={() => N.ackNotice(urgent.id)}>확인</button>
          </div>
        </div>
      )}
      {todo > 0 && (
        <button class="cue-badge" id="cueBadge"
          onClick={() => (S.screen.value = "dashboard")}>
          처리할 지시 {todo}건
        </button>
      )}
    </>
  );
}
