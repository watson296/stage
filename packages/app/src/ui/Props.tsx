import {
  EQUIPMENT,
  MIN_VERTICES,
  ZONE_KINDS,
  riserUnder,
  zoneLabel,
  zoneNeedsHeight,
  type ZoneKind,
} from "@stage-planner/shared";
import * as S from "../state/appState";

/** 편집을 되돌리기 한 단계로 묶습니다(focus에서 시작, blur에서 확정). */
function editHandlers(apply: (v: string) => void) {
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
      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
    },
  };
}

export function Props() {
  S.docTick();
  const sel = S.selection.value;
  const plan = S.currentPlan();
  // 소수 둘째 자리까지 보여 줍니다. DI 박스 0.12×0.08처럼 10cm 아래 치수가
  // 있어서 한 자리로 반올림하면 규격과 다른 값이 보입니다.
  const r2 = (v: number) => Math.round(v * 100) / 100;

  // 무대 모양 모드에서는 고른 꼭짓점을 보여 줍니다.
  if (S.mode.value === "stage") return <VertexProps />;

  if (!sel) {
    return (
      <div class="props">
        <span class="none">장비나 메모를 탭하면 속성이 보입니다</span>
      </div>
    );
  }

  if (sel.kind === "obj") {
    const o = plan.objects.find((x) => x.id === sel.id);
    if (!o) return <div class="props" />;
    const t = EQUIPMENT[o.type];
    // 장비 중심이 올라가 있는 높이 구역. 표시만 하고 z는 그대로 둡니다.
    const riser = riserUnder(plan.zones, { x: o.x + o.w / 2, y: o.y + o.d / 2 });
    const setNum = (f: "x" | "y") => (v: string) =>
      S.store.mutate((d) => {
        const t2 = d.stagePlans[0].objects.find((x) => x.id === sel.id);
        if (t2) t2[f] = parseFloat(v) || 0;
      });
    return (
      <div class="props">
        <span class="selnm">{o.label || t?.name || "장비"}</span>
        <span class="pg">X:<input class="inp" type="number" step="0.1" value={r2(o.x)} {...editHandlers(setNum("x"))} />m</span>
        <span class="pg">Y:<input class="inp" type="number" step="0.1" value={r2(o.y)} {...editHandlers(setNum("y"))} />m</span>
        {t && t.variants.length > 1 && (
          <span class="pg">규격:
            <select class="inp wide" value={o.variantId ?? ""}
              onChange={(e) => S.setVariant(o.id, (e.target as HTMLSelectElement).value)}>
              {!o.variantId && <option value="">직접 지정</option>}
              {t.variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </span>
        )}
        <span class="pg">크기:
          <input class="inp" type="number" step="0.01" min="0.05" value={r2(o.w)}
            {...editHandlers((v) => S.resizeObject(o.id, { x: o.x, y: o.y, w: Math.max(S.MIN_SIZE_M, parseFloat(v) || o.w), d: o.d }))} />
          ×
          <input class="inp" type="number" step="0.01" min="0.05" value={r2(o.d)}
            {...editHandlers((v) => S.resizeObject(o.id, { x: o.x, y: o.y, w: o.w, d: Math.max(S.MIN_SIZE_M, parseFloat(v) || o.d) }))} />m
        </span>
        <span class="pg">회전:
          <input class="inp" type="number" step="5" value={Math.round(o.rot)}
            {...editHandlers((v) => S.setObjectRotation(o.id, ((parseFloat(v) || 0) % 360 + 360) % 360))} />°
        </span>
        <span class="pg">레이블:
          <input class="inp wide" type="text" value={o.label}
            {...editHandlers((v) =>
              S.store.mutate((d) => {
                const t2 = d.stagePlans[0].objects.find((x) => x.id === sel.id);
                if (t2) t2.label = v;
              }),
            )} />
        </span>
        <label class="pg">
          <input type="checkbox" checked={!o.onStage}
            onChange={(e) =>
              S.store.commit((d) => {
                const t2 = d.stagePlans[0].objects.find((x) => x.id === sel.id);
                if (t2) t2.onStage = !(e.target as HTMLInputElement).checked;
              })
            } /> 무대 밖
        </label>
        {riser && <span class="pg" id="riserInfo">{zoneLabel(riser)} 위</span>}
        <button class="btn" onClick={S.rotateSelected}>회전</button>
        <button class="btn btn-danger" onClick={S.deleteSelected}>삭제</button>
      </div>
    );
  }

  if (sel.kind === "zone") {
    const z = plan.zones.find((x) => x.id === sel.id);
    if (!z) return <div class="props" />;
    return (
      <div class="props">
        <span class="selnm">{zoneLabel(z)}</span>
        <span class="pg">이름:
          <input class="inp wide" type="text" id="zoneName" value={z.name}
            {...editHandlers((v) => S.setZoneName(z.id, v))} />
        </span>
        <span class="pg">종류:
          <select class="inp wide" id="zoneKind" value={z.kind}
            onChange={(e) =>
              S.setZoneKind(z.id, (e.target as HTMLSelectElement).value as ZoneKind)}>
            {ZONE_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.name}</option>)}
          </select>
        </span>
        {zoneNeedsHeight(z.kind) && (
          <span class="pg">높이:
            <input class="inp" type="number" step="0.05" min="0" max="10" id="zoneHeight"
              value={z.heightM ?? 0}
              {...editHandlers((v) => S.setZoneHeight(z.id, parseFloat(v) || 0))} />m
          </span>
        )}
        <span class="pg">꼭짓점 {z.polygon.length}개 · 변 중점을 탭해 더합니다</span>
        <button class="btn btn-danger" onClick={S.deleteSelected}>삭제</button>
      </div>
    );
  }

  const n = plan.notes.find((x) => x.id === sel.id);
  if (!n) return <div class="props" />;
  return (
    <div class="props">
      <span class="selnm">{n.text || "메모"}</span>
      <span class="pg">이름:
        <input class="inp wide" type="text" value={n.text}
          {...editHandlers((v) =>
            S.store.mutate((d) => {
              const t2 = d.stagePlans[0].notes.find((x) => x.id === sel.id);
              if (t2) t2.text = v;
            }),
          )} />
      </span>
      <span class="pg">역할:
        <input class="inp wide" type="text" value={n.role}
          {...editHandlers((v) =>
            S.store.mutate((d) => {
              const t2 = d.stagePlans[0].notes.find((x) => x.id === sel.id);
              if (t2) t2.role = v;
            }),
          )} />
      </span>
      <button class="btn btn-danger" onClick={S.deleteSelected}>삭제</button>
    </div>
  );
}

/** 무대 모양 모드의 속성 바. 고른 꼭짓점의 좌표를 고치고 지웁니다. */
function VertexProps() {
  S.docTick();
  const i = S.vertexSel.value;
  const pts = S.currentPlan().stage.points;
  const r1 = (v: number) => Math.round(v * 10) / 10;

  if (i == null || !pts[i]) {
    return (
      <div class="props">
        <span class="none">
          꼭짓점을 탭하면 좌표가 보입니다 · 변 중점을 끌면 곡선이 됩니다
        </span>
      </div>
    );
  }
  const p = pts[i];
  const tooFew = pts.length <= MIN_VERTICES;
  return (
    <div class="props">
      <span class="selnm">꼭짓점 {i + 1} / {pts.length}</span>
      <span class="pg">X:
        <input class="inp" type="number" step="0.1" id="vx" value={r1(p.x)}
          {...editHandlers((v) => S.setVertexPos(i, parseFloat(v) || 0, pts[i].y))} />m
      </span>
      <span class="pg">Y:
        <input class="inp" type="number" step="0.1" id="vy" value={r1(p.y)}
          {...editHandlers((v) => S.setVertexPos(i, pts[i].x, parseFloat(v) || 0))} />m
      </span>
      <button class="btn btn-danger" id="btnDelVertex" disabled={tooFew}
        onClick={S.removeSelectedVertex}>삭제</button>
      {tooFew && <span class="pg">꼭짓점은 세 개까지만 줄입니다</span>}
    </div>
  );
}
