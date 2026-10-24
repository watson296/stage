import { useEffect } from "preact/hooks";
import * as S from "../state/appState";
import { StageCanvas } from "./StageCanvas";
import { Palette } from "./Palette";
import { Toolbar } from "./Toolbar";
import { Props } from "./Props";
import { NoteModal, CustomModal, InfoModal, Toasts } from "./Modals";
import { PaScreen } from "./PaScreen";
import { TimetableScreen } from "./TimetableScreen";
import { startClock } from "../state/ttState";
import { HostScreen } from "./HostScreen";
import * as N from "../net/client";
import { Dashboard } from "./Dashboard";
import { GreenroomScreen } from "./GreenroomScreen";
import { StartScreen } from "./StartScreen";
import { NoticeCover } from "./NoticeCover";
import { joinFromLink } from "../net/joinLink";
import { appRole, canSee, roleFromWire, roleInfo, screensFor, setAppRole, SCREEN_NAMES } from "../state/roles";
import { exportPNG, exportPDF } from "../render/export-png";
import { downloadJSON, parseEvent, pickJSONFile } from "../io/json";
import { loadEvent } from "../state/autosave";
import symbolUrl from "../../../../assets/brand/saegyeol-symbol.png";

// 내보내기 꼬리말에 쓸 심볼 이미지와 파비콘
const footerLogo = new Image();
footerLogo.src = symbolUrl;

function setFavicon(): void {
  const link = document.createElement("link");
  link.rel = "icon";
  link.type = "image/png";
  link.href = symbolUrl;
  document.head.appendChild(link);
}

async function doLoad(): Promise<void> {
  const text = await pickJSONFile();
  if (text == null) return;
  try {
    const { event, warnings } = parseEvent(text);
    S.store.replace(event);
    S.selection.value = null;
    S.currentPlanId.value = event.stagePlans[0]?.id ?? null;
    S.fit();
    warnings.forEach((w) => S.toast(w));
    S.toast("불러왔습니다.");
  } catch (e) {
    S.toast(e instanceof Error ? e.message : "파일을 읽을 수 없습니다.", true);
  }
}

export function App() {
  useEffect(() => {
    setFavicon();
    // 링크에 역할과 코드가 담겨 있으면 시작 화면을 건너뜁니다.
    joinFromLink();
    // 저장된 작업 복원
    loadEvent()
      .then((saved) => {
        if (!saved) return;
        S.store.replace(saved.event);
        S.currentPlanId.value = saved.event.stagePlans[0]?.id ?? null;
        S.fit();
        saved.warnings.forEach((w) => S.toast(w));
      })
      .catch((e: unknown) => {
        S.toast(
          (e instanceof Error ? e.message : "저장소를 열 수 없습니다.") +
            " 작업이 자동 저장되지 않을 수 있으니 JSON으로 내보내 두세요.",
          true,
        );
      });
    S.setMode("select");

    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const inField = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (e.key === "Escape") {
        S.pendingNote.value = null;
        S.showCustomModal.value = false;
        S.showInfoModal.value = false;
        S.setMode("select");
        return;
      }
      if (inField) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) S.store.redo();
        else S.store.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        S.store.redo();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        // 무대 모양 모드에서는 고른 꼭짓점을 지웁니다.
        if (S.mode.value === "stage") S.removeSelectedVertex();
        else S.deleteSelected();
      }
      if (e.key === "r" || e.key === "R") S.rotateSelected();
    };
    document.addEventListener("keydown", onKey);
    const stopClock = startClock();
    const onUnload = () => void S.autosaver.flush();
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onUnload);
      stopClock();
    };
  }, []);

  // 접속한 코드가 역할을 정합니다. 화면 역할이 다르면 서버 쪽을 따릅니다.
  useEffect(() => {
    const wire = N.myRole.value;
    if (wire) {
      const r = roleFromWire(wire);
      if (appRole.value !== r) {
        setAppRole(r);
        S.screen.value = roleInfo(r).screens[0];
      }
    }
  }, [N.myRole.value]);

  // 고른 자리에서 볼 수 없는 화면이면 첫 화면으로 돌립니다.
  useEffect(() => {
    const role = appRole.value;
    if (role && !canSee(role, S.screen.value)) S.screen.value = roleInfo(role).screens[0];
  }, [appRole.value, S.screen.value]);

  useEffect(() => {
    // 운영 화면은 공연장이 어두워 늘 다크입니다. 설계 화면은 기기 설정을 따릅니다.
    if (S.isDarkScreen(S.screen.value)) document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
  }, [S.screen.value]);

  S.docTick();
  const role = appRole.value;
  if (!role) return <><StartScreen /><Toasts /></>;

  const size = S.stageSize();
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const screen = S.screen.value;
  const info = roleInfo(role);

  return (
    <>
      <header class="hdr">
        <div class="hdr-l">
          <div class="title">Stage Planner</div>
          <button class="btn role-chip" id="btnRole" title="자리를 바꿉니다"
            onClick={() => {
              N.disconnect(true);
              setAppRole(null);
            }}>{info.name}</button>
          <nav class="tabs">
            {screensFor(role).map((sc) => (
              <button key={sc} class={"btn" + (screen === sc ? " active" : "")}
                id={`tab-${sc}`} onClick={() => (S.screen.value = sc)}>
                {sc === "host" && N.connState.value === "online"
                  ? `${SCREEN_NAMES[sc]} (접속됨)`
                  : SCREEN_NAMES[sc]}
              </button>
            ))}
          </nav>
        </div>
        <div class="hdr-r">
          {role === "foh" && (
            <>
              <button class="btn" onClick={() => downloadJSON(S.currentEvent())}>저장</button>
              <button class="btn" onClick={() => void doLoad()}>불러오기</button>
            </>
          )}
          {screen === "stage" && (
            <>
              <button class="btn btn-accent" id="btnExport"
                onClick={() => exportPNG(S.currentPlan(), S.currentEvent().name, S.gridSz.value, footerLogo)}>
                PNG 내보내기
              </button>
              <button class="btn" id="btnPdf"
                onClick={() => exportPDF(S.currentPlan(), S.currentEvent().name, S.gridSz.value, footerLogo)}>
                PDF 내보내기
              </button>
            </>
          )}
          <button class="btn" onClick={() => (S.showInfoModal.value = true)}>정보</button>
        </div>
      </header>
      {screen === "pa" ? (
        <PaScreen />
      ) : screen === "timetable" ? (
        <TimetableScreen />
      ) : screen === "host" ? (
        <HostScreen />
      ) : screen === "dashboard" ? (
        <Dashboard />
      ) : screen === "greenroom" ? (
        <GreenroomScreen />
      ) : (
        <>
          <Toolbar />
          <div class="main">
            <Palette />
            <div class="work">
              <div class="cv-wrap"><StageCanvas /></div>
              <Props />
              <div class="sbar">
                <span>무대: <strong>{r1(size.w)}m × {r1(size.d)}m</strong></span>
                <span id="status">{S.statusMsg.value}</span>
                <span class="mouse">{S.mousePos.value}</span>
              </div>
            </div>
          </div>
        </>
      )}
      <NoticeCover />
      <NoteModal />
      <CustomModal />
      <InfoModal />
      <Toasts />
    </>
  );
}
