import { EQUIPMENT } from "@stage-planner/shared";
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
  S.docVersion.value;
  const sel = S.selection.value;
  if (!sel) {
    return (
      <div class="props">
        <span class="none">장비나 메모를 탭하면 속성이 보입니다</span>
      </div>
    );
  }
  const plan = S.currentPlan();
  const r1 = (v: number) => Math.round(v * 10) / 10;

  if (sel.kind === "obj") {
    const o = plan.objects.find((x) => x.id === sel.id);
    if (!o) return <div class="props" />;
    const t = EQUIPMENT[o.type];
    const setNum = (f: "x" | "y") => (v: string) =>
      S.store.mutate((d) => {
        const t2 = d.stagePlans[0].objects.find((x) => x.id === sel.id);
        if (t2) t2[f] = parseFloat(v) || 0;
      });
    return (
      <div class="props">
        <span class="selnm">{o.label || t?.name || "장비"}</span>
        <span class="pg">X:<input class="inp" type="number" step="0.1" value={r1(o.x)} {...editHandlers(setNum("x"))} />m</span>
        <span class="pg">Y:<input class="inp" type="number" step="0.1" value={r1(o.y)} {...editHandlers(setNum("y"))} />m</span>
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
          <input class="inp" type="number" step="0.05" min="0.1" value={r1(o.w)}
            {...editHandlers((v) => S.resizeObject(o.id, { x: o.x, y: o.y, w: Math.max(0.1, parseFloat(v) || o.w), d: o.d }))} />
          ×
          <input class="inp" type="number" step="0.05" min="0.1" value={r1(o.d)}
            {...editHandlers((v) => S.resizeObject(o.id, { x: o.x, y: o.y, w: o.w, d: Math.max(0.1, parseFloat(v) || o.d) }))} />m
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
        <button class="btn" onClick={S.rotateSelected}>회전</button>
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
