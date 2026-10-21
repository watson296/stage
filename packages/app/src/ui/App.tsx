import { useEffect } from "preact/hooks";
import * as S from "../state/appState";
import { StageCanvas } from "./StageCanvas";
import { Palette } from "./Palette";
import { Toolbar } from "./Toolbar";
import { Props } from "./Props";
import { NoteModal, CustomModal, InfoModal, Toasts } from "./Modals";
import { PaScreen } from "./PaScreen";
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
    // 저장된 작업 복원
    loadEvent()
      .then((saved) => {
        if (saved) {
          S.store.replace(saved);
          S.fit();
        }
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
    const onUnload = () => void S.autosaver.flush();
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, []);

  S.docVersion.value;
  const size = S.stageSize();
  const r1 = (v: number) => Math.round(v * 10) / 10;

  return (
    <>
      <header class="hdr">
        <div class="hdr-l">
          <div class="title">Stage Planner</div>
          <div class="sub">새결 공연 무대 구상 도구</div>
          <nav class="tabs">
            <button class={"btn" + (S.screen.value === "stage" ? " active" : "")}
              id="tabStage" onClick={() => (S.screen.value = "stage")}>무대 설계</button>
            <button class={"btn" + (S.screen.value === "pa" ? " active" : "")}
              id="tabPa" onClick={() => (S.screen.value = "pa")}>PA 조언</button>
          </nav>
        </div>
        <div class="hdr-r">
          <button class="btn" onClick={() => downloadJSON(S.currentEvent())}>저장</button>
          <button class="btn" onClick={() => void doLoad()}>불러오기</button>
          {S.screen.value === "stage" && (
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
      {S.screen.value === "pa" ? (
        <PaScreen />
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
      <NoteModal />
      <CustomModal />
      <InfoModal />
      <Toasts />
    </>
  );
}
