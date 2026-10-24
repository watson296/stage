import { ZONE_KINDS, type ZoneKind } from "@stage-planner/shared";
import * as S from "../state/appState";
import { readOnly } from "../net/client";

/** 지금 고치는 도면을 고릅니다. 공연마다 다른 세팅을 둘 수 있습니다. */
function PlanBar() {
  const plans = S.currentEvent().stagePlans;
  const cur = S.currentPlan();
  const shows = S.showsUsingPlan(cur.id);
  const ro = readOnly();
  return (
    <div class="planbar">
      <label>도면
        <select class="inp" id="planSel" value={cur.id}
          onChange={(e) => S.selectPlan((e.target as HTMLSelectElement).value)}>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      {!ro && (
        <input class="inp" id="planName" type="text" value={cur.name} title="도면 이름"
          onInput={(e) => S.setPlanName(cur.id, (e.target as HTMLInputElement).value)} />
      )}
      {shows.length > 0 && <span class="planbar-use">{shows.join(", ")}에서 씁니다</span>}
      {!ro && (
        <>
          <button class="btn" id="planAdd"
            onClick={() => S.addPlan(`배치 ${plans.length + 1}`)}>새 도면</button>
          <button class="btn" id="planCopy"
            onClick={() => S.duplicatePlan(cur.id, `${cur.name} 복사`)}>복사</button>
          <button class="btn btn-danger" id="planDel"
            onClick={() => {
              if (confirm(`도면 "${cur.name}"을 지울까요?`)) S.removePlan(cur.id);
            }}>도면 삭제</button>
        </>
      )}
    </div>
  );
}

export function Toolbar() {
  S.docTick();
  const m = S.mode.value;
  const size = S.stageSize();
  const r1 = (v: number) => Math.round(v * 10) / 10;

  // 읽기 전용으로 붙은 기기에는 보기 관련 단추만 둡니다.
  if (readOnly()) {
    return (
      <>
      <PlanBar />
      <div class="tbar">
        <span class="ro-note">읽기 전용입니다. 고치려면 운영자로 접속해 주세요.</span>
        <div class="sep" />
        <label>
          <input type="checkbox" id="chkZones" checked={S.showZones.value}
            onChange={(e) => (S.showZones.value = (e.target as HTMLInputElement).checked)} /> 구역 표시
        </label>
        <button class={"btn" + (S.autoFit.value ? " active" : "")} id="btnFit"
          onClick={() => S.fit()}>맞춤</button>
      </div>
      </>
    );
  }

  return (
    <>
    <PlanBar />
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
      <button class={"btn" + (S.autoFit.value ? " active" : "")} id="btnFit"
        title="무대 모양이 바뀌면 화면을 자동으로 맞춥니다"
        onClick={() => S.fit()}>맞춤</button>
      <button class="btn btn-danger" onClick={() => {
        if (confirm("모든 장비와 메모를 초기화할까요?")) S.clearPlan();
      }}>초기화</button>
    </div>
    </>
  );
}
