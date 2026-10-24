import { useRef } from "preact/hooks";
import { signal } from "@preact/signals";
import * as S from "../state/appState";
import * as N from "../net/client";
import { ROLE_INFOS, roleInfo, setAppRole, type AppRole } from "../state/roles";

/** 시작 화면에서 고른 역할. 고르면 접속 칸이 열립니다. */
const picked = signal<AppRole | null>(null);

function enter(role: AppRole, screen: S.Screen): void {
  setAppRole(role);
  S.screen.value = screen;
  picked.value = null;
}

function ConnectPanel({ role }: { role: AppRole }) {
  const info = roleInfo(role);
  const url = useRef<HTMLInputElement>(null);
  const code = useRef<HTMLInputElement>(null);
  const name = useRef<HTMLInputElement>(null);

  const go = (): void => {
    const c = (code.current?.value ?? "").trim();
    if (c.length !== 6) {
      S.toast("접속 코드는 여섯 자리입니다. FOH 화면의 코드를 확인해 주세요.", true);
      code.current?.focus();
      return;
    }
    N.connect(
      url.current?.value ?? "",
      c,
      info.wire,
      (name.current?.value ?? "").trim() || `${info.name} 기기`,
    );
    enter(role, info.screens[0]);
  };

  return (
    <div class="start-connect">
      <h3>{info.name}(으)로 들어가기</h3>
      <p class="muted">{info.summary}</p>
      <div class="pa-grid">
        <label class="pa-num wide">
          <span>호스트 주소</span>
          <input class="inp" type="text" id="startUrl" ref={url} value={location.origin} />
        </label>
        <label class="pa-num">
          <span>접속 코드</span>
          <input class="inp" type="text" id="startCode" ref={code} inputMode="numeric"
            maxLength={6} placeholder="여섯 자리" autofocus
            onKeyDown={(e) => { if (e.key === "Enter") go(); }} />
        </label>
        <label class="pa-num">
          <span>이 기기 이름</span>
          <input class="inp" type="text" id="startName" ref={name}
            placeholder={role === "greenroom" ? "예: 대기실 TV" : "예: 김수윤"} />
        </label>
      </div>
      <div class="pa-row">
        <button class="btn btn-accent" id="startConnect" onClick={go}>접속</button>
        {role === "foh" && (
          <button class="btn" id="startAlone"
            onClick={() => enter(role, "stage")}>혼자 준비하기</button>
        )}
        <button class="btn" id="startBack" onClick={() => (picked.value = null)}>뒤로</button>
      </div>
      {role !== "foh" && (
        <p class="muted">
          호스트가 켜져 있어야 들어갈 수 있습니다. FOH 기기에서 호스트를 먼저 시작해 주세요.
        </p>
      )}
    </div>
  );
}

export function StartScreen() {
  const sel = picked.value;
  return (
    <div class="start">
      <div class="start-box">
        <h1>Stage Planner</h1>
        <p class="start-lead">
          무대를 그리고, 하루 순서를 짜고, 공연 중에 서로 같은 내용을 봅니다.
        </p>
        {sel ? (
          <ConnectPanel role={sel} />
        ) : (
          <>
            <h2 class="start-ask">어떤 자리에서 쓰시나요?</h2>
            <div class="start-roles">
              {ROLE_INFOS.map((r) => (
                <button key={r.role} class="start-card" id={`role-${r.role}`}
                  onClick={() => (picked.value = r.role)}>
                  <span class="start-card-name">{r.name}</span>
                  <span class="start-card-desc">{r.summary}</span>
                </button>
              ))}
            </div>
            <p class="muted">고른 자리는 이 기기에 기억해 둡니다. 나중에 바꿀 수 있습니다.</p>
          </>
        )}
      </div>
    </div>
  );
}
