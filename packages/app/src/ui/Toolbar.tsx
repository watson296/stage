import { ZONE_KINDS, type ZoneKind } from "@stage-planner/shared";
import * as S from "../state/appState";

export function Toolbar() {
  S.docVersion.value;
  const m = S.mode.value;
  const size = S.stageSize();
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return (
    <div class="tbar">
      <button class={"btn" + (m === "select" || m === "place" ? " active" : "")}
        onClick={() => S.setMode("select")}>선택</button>
      <button class={"btn" + (m === "addNote" ? " active" : "")}
        id="mNote" onClick={() => S.setMode("addNote")}>메모</button>
      <button class={"btn" + (m === "connect" ? " active" : "")}
        onClick={() => S.setMode("connect")}>연결</button>
      <button class={"btn" + (m === "stage" ? " active" : "")}
        id="mStage" onClick={() => S.setMode(m === "stage" ? "select" : "stage")}>무대 모양</button>
      <button class={"btn" + (m === "zone" ? " active" : "")}
        id="mZone" onClick={() => S.setMode(m === "zone" ? "select" : "zone")}>구역</button>
      <div class="sep" />
      <label>템플릿
        <select class="inp" value="" onChange={(e) => {
          const v = (e.target as HTMLSelectElement).value;
          if (v) S.applyTemplate(v);
          (e.target as HTMLSelectElement).value = "";
        }}>
          <option value="">고르기</option>
          {S.TEMPLATE_LIST.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <label>객석
        <select class="inp" value={S.currentPlan().audienceDir === "all" ? "all" : "front"}
          onChange={(e) => S.setAudienceDir((e.target as HTMLSelectElement).value as "front" | "all")}>
          <option value="front">앞쪽</option>
          <option value="all">사방</option>
        </select>
      </label>
      {m === "zone" && (
        <label>구역 종류
          <select class="inp" id="selZoneKind" value={S.zoneKind.value}
            onChange={(e) =>
              (S.zoneKind.value = (e.target as HTMLSelectElement).value as ZoneKind)}>
            {ZONE_KINDS.map((z) => <option key={z.kind} value={z.kind}>{z.name}</option>)}
          </select>
        </label>
      )}
      <label>
        <input type="checkbox" id="chkZones" checked={S.showZones.value}
          onChange={(e) => (S.showZones.value = (e.target as HTMLInputElement).checked)} /> 구역 표시
      </label>
      <div class="sep" />
      <button class="btn" id="btnRotate" onClick={S.rotateSelected}>회전 45°</button>
      <button class="btn btn-danger" id="btnDelete" onClick={S.deleteSelected}>삭제</button>
      <div class="sep" />
      <button class="btn" id="btnUndo" disabled={!S.store.canUndo()} onClick={() => S.store.undo()}>되돌리기</button>
      <button class="btn" id="btnRedo" disabled={!S.store.canRedo()} onClick={() => S.store.redo()}>다시 실행</button>
      <div class="sep" />
      <label>무대 가로
        <input class="inp" type="number" min="1" max="50" step="0.5" value={r1(size.w)}
          onChange={(e) =>
            S.setStageSize(parseFloat((e.target as HTMLInputElement).value) || 8, S.stageSize().d)} />
      </label>
      <label>세로
        <input class="inp" type="number" min="1" max="50" step="0.5" value={r1(size.d)}
          onChange={(e) =>
            S.setStageSize(S.stageSize().w, parseFloat((e.target as HTMLInputElement).value) || 6)} />
      </label>
      <label>격자
        <select class="inp" value={String(S.gridSz.value)}
          onChange={(e) => (S.gridSz.value = parseFloat((e.target as HTMLSelectElement).value) || 0.25)}>
          <option value="0.1">0.1m</option>
          <option value="0.25">0.25m</option>
          <option value="0.5">0.5m</option>
          <option value="1">1m</option>
        </select>
      </label>
      <label>
        <input type="checkbox" checked={S.snap.value}
          onChange={(e) => (S.snap.value = (e.target as HTMLInputElement).checked)} /> 스냅
      </label>
      <div class="sep" />
      <button class="btn" id="btnFit" onClick={S.fit}>맞춤</button>
      <button class="btn btn-danger" onClick={() => {
        if (confirm("모든 장비와 메모를 초기화할까요?")) S.clearPlan();
      }}>초기화</button>
    </div>
  );
}
