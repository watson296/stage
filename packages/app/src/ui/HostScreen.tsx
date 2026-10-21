import { useRef } from "preact/hooks";
import type { Role } from "@stage-planner/shared";
import * as S from "../state/appState";
import * as N from "../net/client";

const ROLE_NAMES: { role: Role; name: string; help: string }[] = [
  { role: "operator", name: "운영자", help: "모든 편집과 공지, 순서 시작·종료" },
  { role: "staff", name: "스태프", help: "공지 확인과 자기 담당 순서의 상태 변경" },
  { role: "display", name: "표시 화면", help: "읽기 전용. 대기실 TV와 큐 화면" },
];

function ConnectForm() {
  const url = useRef<HTMLInputElement>(null);
  const code = useRef<HTMLInputElement>(null);
  const name = useRef<HTMLInputElement>(null);
  const role = useRef<HTMLSelectElement>(null);

  const go = (): void => {
    const c = (code.current?.value ?? "").trim();
    if (c.length !== 6) {
      S.toast("접속 코드는 여섯 자리입니다. 호스트 화면의 코드를 확인해 주세요.", true);
      code.current?.focus();
      return;
    }
    N.connect(
      url.current?.value ?? "",
      c,
      (role.current?.value as Role) ?? "staff",
      (name.current?.value ?? "").trim() || "이름 없는 기기",
    );
  };

  return (
    <section class="card">
      <h2>호스트에 접속</h2>
      <p class="muted">
        같은 와이파이에 있는 호스트에 붙습니다. 호스트 화면에 뜬 주소와 코드를 넣어 주세요.
      </p>
      <div class="pa-grid">
        <label class="pa-num wide">
          <span>호스트 주소</span>
          <input class="inp" type="text" id="hostUrl" ref={url}
            value={location.origin} placeholder="예: http://192.168.0.5:7321" />
        </label>
        <label class="pa-num">
          <span>접속 코드</span>
          <input class="inp" type="text" id="hostCode" ref={code} inputMode="numeric"
            maxLength={6} placeholder="여섯 자리"
            onKeyDown={(e) => { if (e.key === "Enter") go(); }} />
        </label>
        <label class="pa-num">
          <span>역할</span>
          <select class="inp" id="hostRole" ref={role}>
            {ROLE_NAMES.map((r) => <option key={r.role} value={r.role}>{r.name}</option>)}
          </select>
        </label>
        <label class="pa-num">
          <span>이 기기 이름</span>
          <input class="inp" type="text" id="hostName" ref={name} placeholder="예: 대기실 TV" />
        </label>
      </div>
      <button class="btn btn-accent" id="btnConnect" onClick={go}>접속</button>
      {N.connMessage.value && <p class="pa-warn" id="connMsg">{N.connMessage.value}</p>}
    </section>
  );
}

function Connected() {
  const base = N.httpBase();
  const role = N.myRole.value;
  return (
    <section class="card">
      <h2>연결</h2>
      <dl class="pa-facts">
        <div><dt>상태</dt><dd id="connState">
          {N.connState.value === "online" ? "접속됨" : "다시 붙는 중"}
        </dd></div>
        <div><dt>역할</dt><dd id="connRole">
          {ROLE_NAMES.find((r) => r.role === role)?.name ?? "—"}
        </dd></div>
        <div><dt>호스트</dt><dd>{base}</dd></div>
        <div><dt>시계 차이</dt><dd id="connSkew">
          {Math.round(N.serverSkewMs.value / 100) / 10}초
        </dd></div>
      </dl>
      {N.connState.value !== "online" && (
        <p class="pa-warn" id="connMsg">{N.connMessage.value || "연결 끊김"}</p>
      )}
      <div class="pa-row">
        {role === "operator" && (
          <button class="btn" id="btnPublish" onClick={N.publishNow}>
            지금 작업을 호스트에 올리기
          </button>
        )}
        <button class="btn btn-danger" id="btnDisconnect"
          onClick={() => N.disconnect(true)}>접속 끊기</button>
      </div>
    </section>
  );
}

function DeviceList() {
  const list = N.devices.value;
  return (
    <section class="card">
      <h2>접속 기기</h2>
      {list.length === 0 ? (
        <p class="muted">붙어 있는 기기가 없습니다.</p>
      ) : (
        <table class="pa-table" id="devTable">
          <thead><tr><th>이름</th><th>역할</th><th>붙은 시각</th><th /></tr></thead>
          <tbody>
            {list.map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td>{ROLE_NAMES.find((r) => r.role === d.role)?.name ?? d.role}</td>
                <td>{d.connectedAt.slice(11, 16)}</td>
                <td>
                  {N.myRole.value === "operator" && d.id !== N.myDeviceId.value && (
                    <button class="btn" onClick={() => N.kickDevice(d.id)}>끊기</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function HowTo() {
  const base = N.httpBase();
  return (
    <section class="card">
      <h2>호스트 시작하기</h2>
      <p class="muted">
        운영자 기기에서 호스트를 띄우면 같은 와이파이의 기기들이 같은 내용을 봅니다.
        인터넷은 필요 없습니다.
      </p>
      <pre class="code">npm run build{"\n"}npm run host</pre>
      <p class="muted">
        호스트 화면에 접속 주소와 역할별 여섯 자리 코드가 뜹니다. 코드는 그 화면에만
        보여 주고 내보내기 파일이나 표시 화면에는 남기지 않습니다.
      </p>
      {base && (
        <>
          <h3>이 주소로 접속</h3>
          <div class="qr-row">
            <img class="qr" id="qrImg" src={`${base}/qr.svg`} alt={`${base} 접속 QR 코드`} />
            <code>{base}</code>
          </div>
        </>
      )}
    </section>
  );
}

export function HostScreen() {
  S.docVersion.value;
  const online = N.connState.value !== "offline";
  return (
    <div class="pa">
      <div class="pa-col">
        {online ? <Connected /> : <ConnectForm />}
        <HowTo />
      </div>
      <div class="pa-col">
        {online && <DeviceList />}
        <section class="card">
          <h2>역할</h2>
          <dl class="pa-facts">
            {ROLE_NAMES.map((r) => (
              <div key={r.role}><dt>{r.name}</dt><dd class="role-help">{r.help}</dd></div>
            ))}
          </dl>
          <p class="muted">
            권한은 호스트가 확인합니다. 화면에서 단추를 숨기는 것은 편의일 뿐입니다.
          </p>
        </section>
      </div>
    </div>
  );
}
