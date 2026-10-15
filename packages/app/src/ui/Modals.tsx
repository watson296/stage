import { useRef } from "preact/hooks";
import { NOTE_COLORS } from "@stage-planner/shared";
import * as S from "../state/appState";
import logoVerticalUrl from "../../../../assets/brand/saegyeol-logo-vertical.png";

export function NoteModal() {
  const pos = S.pendingNote.value;
  const nameRef = useRef<HTMLInputElement>(null);
  const roleRef = useRef<HTMLInputElement>(null);
  if (!pos) return null;

  const close = () => {
    S.pendingNote.value = null;
    S.setMode("select");
  };
  const confirm = () => {
    S.addNote(
      pos.x, pos.y,
      nameRef.current?.value.trim() || "스태프",
      roleRef.current?.value.trim() || "",
      S.noteColor.value,
    );
    S.pendingNote.value = null;
    S.setMode("select");
  };

  return (
    <div class="modal-ov" onKeyDown={(e) => { if (e.key === "Enter") confirm(); }}>
      <div class="modal">
        <h2>메모 추가</h2>
        <div class="field">
          <label>이름</label>
          <input id="noteName" ref={nameRef} type="text" placeholder="예: 김지훈" autofocus />
        </div>
        <div class="field">
          <label>역할</label>
          <input id="noteRole" ref={roleRef} type="text" placeholder="예: 드럼, 기타, 보컬" />
        </div>
        <div class="field">
          <label>색상</label>
          <div class="swatches">
            {NOTE_COLORS.map((c) => (
              <div key={c}
                class={"sw" + (S.noteColor.value === c ? " sel" : "")}
                style={{ background: c }}
                onClick={() => (S.noteColor.value = c)} />
            ))}
          </div>
        </div>
        <div class="modal-acts">
          <button class="btn" onClick={close}>취소</button>
          <button class="btn btn-accent" id="noteOk" onClick={confirm}>추가</button>
        </div>
      </div>
    </div>
  );
}

export function CustomModal() {
  if (!S.showCustomModal.value) return null;
  const name = useRef<HTMLInputElement>(null);
  const w = useRef<HTMLInputElement>(null);
  const d = useRef<HTMLInputElement>(null);
  const h = useRef<HTMLInputElement>(null);
  const color = useRef<HTMLInputElement>(null);

  const confirm = () => {
    const nm = name.current?.value.trim();
    if (!nm) {
      name.current?.focus();
      return;
    }
    S.addCustomEquipment(
      nm,
      parseFloat(w.current?.value ?? "1") || 1,
      parseFloat(d.current?.value ?? "0.5") || 0.5,
      parseFloat(h.current?.value ?? "1") || 1,
      color.current?.value || "#8e44ad",
    );
    S.showCustomModal.value = false;
  };

  return (
    <div class="modal-ov" onKeyDown={(e) => { if (e.key === "Enter") confirm(); }}>
      <div class="modal">
        <h2>커스텀 장비 추가</h2>
        <div class="field">
          <label>이름</label>
          <input ref={name} type="text" placeholder="예: 서브믹서, DI박스" autofocus />
        </div>
        <div class="row">
          <div class="field"><label>가로(m)</label><input ref={w} type="number" value="1.0" min="0.1" max="20" step="0.1" /></div>
          <div class="field"><label>세로(m)</label><input ref={d} type="number" value="0.5" min="0.1" max="20" step="0.1" /></div>
          <div class="field"><label>높이(m)</label><input ref={h} type="number" value="1.0" min="0.1" max="10" step="0.1" /></div>
        </div>
        <div class="field">
          <label>색상</label>
          <input ref={color} type="color" value="#8e44ad" style={{ height: "38px", padding: "2px" }} />
        </div>
        <div class="modal-acts">
          <button class="btn" onClick={() => (S.showCustomModal.value = false)}>취소</button>
          <button class="btn btn-accent" onClick={confirm}>팔레트에 추가</button>
        </div>
      </div>
    </div>
  );
}

export function InfoModal() {
  if (!S.showInfoModal.value) return null;
  return (
    <div class="modal-ov">
      <div class="modal">
        <img class="info-logo" src={logoVerticalUrl} alt="새결 SAEGYEOL" />
        <div class="info-body">
          <p><strong>Stage Planner</strong> — 공연 무대를 평면도로 구상하는 도구입니다.</p>
          <p class="muted">소스 코드는 Apache-2.0으로 공개됩니다. 새결 로고와 이름은 상표이며,
            포크할 때는 로고를 본인 또는 본인 조직의 것으로 교체해야 합니다.</p>
          <p class="muted">작업은 이 기기 안에 자동 저장됩니다. 기기나 브라우저를 바꾸거나
            저장소가 비워지면 사라질 수 있으니, 중요한 배치는 <strong>JSON으로 내보내</strong> 두세요.</p>
          <p class="muted">© 2026 새결 (Team Saegyeol)</p>
        </div>
        <div class="modal-acts">
          <button class="btn btn-accent" onClick={() => (S.showInfoModal.value = false)}>닫기</button>
        </div>
      </div>
    </div>
  );
}

export function Toasts() {
  return (
    <div id="toast">
      {S.toasts.value.map((t) => (
        <div key={t.id} class={"toast" + (t.error ? " err" : "")}>{t.text}</div>
      ))}
    </div>
  );
}
