import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { formatDuration, formatHHMM } from "@stage-planner/shared";
import * as S from "../state/appState";
import * as N from "../net/client";
import { itemName, remainingText, useLive } from "./Dashboard";

export type DisplayKind = "green" | "staff" | "cue";
export const displayKind = signal<DisplayKind>("green");

export const DISPLAY_KINDS: { kind: DisplayKind; name: string }[] = [
  { kind: "green", name: "대기실" },
  { kind: "staff", name: "스태프" },
  { kind: "cue", name: "무대 뒤 큐" },
];

/**
 * 화면이 꺼지지 않게 붙잡습니다. 지원하지 않는 브라우저에서는 아무 일도
 * 일어나지 않습니다(SPEC 11).
 */
function useWakeLock(): void {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    let dropped = false;
    const req = async (): Promise<void> => {
      const wl = (navigator as unknown as {
        wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> };
      }).wakeLock;
      if (!wl) return;
      try {
        lock = await wl.request("screen");
      } catch {
        // 배터리 절약 모드 등으로 거절될 수 있습니다. 화면은 그대로 둡니다.
      }
    };
    void req();
    // 탭을 다시 보면 다시 겁니다. 브라우저가 전환할 때 풀기 때문입니다.
    const onVis = (): void => {
      if (document.visibilityState === "visible" && !dropped) void req();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      dropped = true;
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release().catch(() => {});
    };
  }, []);
}

function Conn() {
  if (N.connState.value === "online" || N.connState.value === "offline") return null;
  // 끊겨도 마지막 내용을 그대로 두고 알림만 얹습니다(SPEC 9.5).
  return <div class="disp-conn" id="dispConn">연결 끊김 — 다시 붙는 중입니다</div>;
}

function GreenRoom() {
  const v = useLive();
  return (
    <>
      <div class="disp-row">
        <span class="disp-label">지금</span>
        <span class="disp-main" id="dispCurrent">{itemName(v.current)}</span>
      </div>
      <div class="disp-row">
        <span class="disp-label">남은 시간</span>
        <span class="disp-main" id="dispRemaining">{remainingText(v.remainingMin)}</span>
      </div>
      <div class="disp-row">
        <span class="disp-label">다음</span>
        <span class="disp-main" id="dispNext">{itemName(v.next)}</span>
      </div>
      <div class="disp-row">
        <span class="disp-label">콜 타임</span>
        <span class="disp-main">{v.next ? formatHHMM(v.next.startMin) : "—"}</span>
      </div>
    </>
  );
}

function Staff() {
  const v = useLive();
  return (
    <>
      <div class="disp-row">
        <span class="disp-label">지금</span>
        <span class="disp-main" id="dispCurrent">{itemName(v.current)}</span>
      </div>
      <div class="disp-row">
        <span class="disp-label">다음</span>
        <span class="disp-main" id="dispNext">{itemName(v.next)}</span>
      </div>
      <div class="disp-row">
        <span class="disp-label">담당</span>
        <span class="disp-main">{v.next?.item.owner || "—"}</span>
      </div>
      <div class="disp-row">
        <span class="disp-label">전환 지시</span>
        <span class="disp-note" id="dispMemo">{v.next?.item.memo || "적힌 내용이 없습니다"}</span>
      </div>
      {v.delayMin > 0 && (
        <div class="disp-row">
          <span class="disp-label">지연</span>
          <span class="disp-main">{formatDuration(v.delayMin)}</span>
        </div>
      )}
    </>
  );
}

function Cue() {
  const v = useLive();
  return (
    <div class="cue">
      <div class="cue-name" id="dispCurrent">{itemName(v.current)}</div>
      <div class="cue-time" id="dispRemaining">
        {v.remainingMin == null
          ? v.startsInMin != null ? `${formatDuration(v.startsInMin)} 뒤` : "대기"
          : remainingText(v.remainingMin)}
      </div>
    </div>
  );
}

export function DisplayScreen() {
  useWakeLock();
  const kind = displayKind.value;
  return (
    <div class={"disp disp-" + kind}>
      <Conn />
      <div class="disp-head">
        <span>{S.currentEvent().name}</span>
        <span class="disp-kind">{DISPLAY_KINDS.find((k) => k.kind === kind)?.name}</span>
      </div>
      <div class="disp-body">
        {kind === "green" ? <GreenRoom /> : kind === "staff" ? <Staff /> : <Cue />}
      </div>
    </div>
  );
}

/** 긴급 공지는 화면 전체를 덮습니다. 확인을 누르거나 운영자가 풀면 사라집니다. */
export function NoticeOverlay() {
  const list = N.liveNotices.value;
  const urgent = list.find((n) => n.level === "urgent");
  const normal = list.filter((n) => n.level !== "urgent");

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
      {normal.length > 0 && (
        <div class="notice-list" id="noticeList">
          {normal.map((n) => (
            <div key={n.id} class="notice-item">
              <span>{n.text}</span>
              <button class="btn" onClick={() => N.ackNotice(n.id)}>확인</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
