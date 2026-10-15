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
        <span class="pg">크기: {r1(o.w)}×{r1(o.d)}×{r1(o.h)}m</span>
        <span class="pg">회전: {o.rot}°</span>
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
