// 호스트 기기에서만 여는 안내 페이지. 접속 링크와 QR, 복사 단추, 접속 기기
// 목록, 코드 재발급을 한 화면에 둡니다.
//
// 이 페이지에는 접속 코드가 그대로 보입니다. 그래서 **루프백에서 온 요청에만**
// 답하고, 같은 네트워크의 다른 기기가 열면 404를 돌려줍니다. 403이 아니라 404인
// 이유는 이런 경로가 있다는 것조차 알리지 않기 위해서입니다(SPEC 10).

import { buildJoinUrl, type Device, type Role } from "@stage-planner/shared";
import { normalizeIp } from "./net.ts";

export interface HostPageView {
  /** 이름 주소. mDNS를 못 쓰면 null입니다. */
  nameBase: string | null;
  /** IP 주소. 늘 있습니다. */
  ipBase: string;
  codes: Record<Role, string>;
  devices: Device[];
  /** 이름 접속을 못 쓰는 이유. 쓸 수 있으면 null입니다. */
  mdnsProblem: string | null;
  rotatedAt: string;
}

export const ROLE_VIEWS: { role: Role; name: string; help: string }[] = [
  { role: "operator", name: "FOH (운영자)", help: "모든 편집과 공지·지시, 순서 진행" },
  { role: "staff", name: "운영팀", help: "받은 지시 처리와 담당 순서의 진행" },
  { role: "display", name: "대기실", help: "읽기 전용. 공지와 순서를 큰 글씨로" },
];

/** 루프백에서 온 요청인지. 호스트 기기 자신만 통과합니다. */
export function isHostPageAllowed(rawIp: string): boolean {
  const ip = normalizeIp(rawIp);
  if (ip === "::1") return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return false;
  return Number(m[1]) === 127 && [m[2], m[3], m[4]].every((n) => Number(n) <= 255);
}

/** 화면에 넣기 전에 꺾쇠와 따옴표를 막습니다. 기기 이름은 사용자 입력입니다. */
function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function joinLinks(view: HostPageView, role: Role): { ip: string; name: string | null } {
  return {
    ip: buildJoinUrl(view.ipBase, role, view.codes[role]),
    name: view.nameBase ? buildJoinUrl(view.nameBase, role, view.codes[role]) : null,
  };
}

export function hostStateJson(view: HostPageView): string {
  return JSON.stringify({
    codes: view.codes,
    rotatedAt: view.rotatedAt,
    nameBase: view.nameBase,
    ipBase: view.ipBase,
    mdnsProblem: view.mdnsProblem,
    links: ROLE_VIEWS.map((r) => ({ role: r.role, ...joinLinks(view, r.role) })),
    devices: view.devices.map((d) => ({
      id: d.id, role: d.role, name: d.name, status: d.status, connectedAt: d.connectedAt,
    })),
  });
}

const STYLE = `
:root {
  --bg: #081a2e; --surface: #0f2742; --text: #e3eaf2; --muted: #9aaabd;
  --border: #1e3a5c; --accent: #6fa3e8; --danger: #ff6b6b;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  background: var(--bg); color: var(--text); padding: 24px;
  font-family: Pretendard, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif;
  font-size: 14px; line-height: 1.6; word-break: keep-all; overflow-wrap: break-word;
}
h1 { font-size: 24px; margin-bottom: 4px; }
h2 { font-size: 15px; margin-bottom: 12px; }
h3 { font-size: 13px; color: var(--muted); margin: 16px 0 6px; font-weight: 400; }
.lead { color: var(--muted); margin-bottom: 24px; }
.wrap { max-width: 1100px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
.addr { display: flex; gap: 24px; flex-wrap: wrap; }
.addr div { display: flex; flex-direction: column; gap: 2px; }
.addr span { color: var(--muted); font-size: 12px; }
.addr code { font-size: 18px; font-weight: 700; }
.warn { color: var(--accent); margin-top: 8px; }
.roles { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
.role-name { font-size: 18px; font-weight: 700; }
.role-help { color: var(--muted); margin-bottom: 12px; }
.qr { width: 160px; height: 160px; background: #fff; border-radius: 8px; padding: 6px; }
.link { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
.link input {
  flex: 1; min-width: 0; background: var(--bg); color: var(--text);
  border: 1px solid var(--border); border-radius: 8px; padding: 7px 10px;
  font-family: ui-monospace, Menlo, monospace; font-size: 12px;
}
button {
  background: var(--surface); color: var(--text); border: 1px solid var(--border);
  border-radius: 8px; padding: 8px 12px; font: inherit; cursor: pointer; min-height: 36px;
}
button:hover { border-color: var(--accent); }
button.danger { color: var(--danger); border-color: var(--danger); }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); }
th { color: var(--muted); font-weight: 400; font-size: 12px; }
details { margin-top: 12px; }
summary { cursor: pointer; color: var(--accent); }
details p, details ol { margin-top: 8px; color: var(--muted); }
details li { margin-left: 20px; }
code.inline { background: var(--bg); padding: 2px 6px; border-radius: 6px; }
.foot { color: var(--muted); font-size: 12px; }
`;

const SCRIPT = `
const copy = async (id) => {
  const el = document.getElementById(id);
  try {
    await navigator.clipboard.writeText(el.value);
    el.nextElementSibling.textContent = "복사함";
    setTimeout(() => { el.nextElementSibling.textContent = "복사"; }, 1500);
  } catch {
    el.select();
    el.nextElementSibling.textContent = "Ctrl+C";
  }
};
const rotate = async () => {
  const ok = confirm("코드를 다시 만들까요?\\n\\n지금까지 나눠준 링크와 QR이 모두 무효가 됩니다. 붙어 있는 기기는 그대로 있습니다.");
  if (!ok) return;
  await fetch("/host/rotate", { method: "POST" });
  location.reload();
};
const fmt = { operator: "FOH", staff: "운영팀", display: "대기실" };
async function tick() {
  try {
    const s = await (await fetch("/host/state.json")).json();
    const rows = s.devices.map((d) =>
      "<tr><td>" + d.name.replace(/[<>&]/g, "") + "</td><td>" + (fmt[d.role] || d.role) +
      "</td><td>" + (d.status === "online" ? "접속" : "끊김") +
      "</td><td>" + d.connectedAt.slice(11, 16) + "</td></tr>").join("");
    document.getElementById("devBody").innerHTML =
      rows || "<tr><td colspan=4>붙어 있는 기기가 없습니다.</td></tr>";
  } catch {
    // 호스트를 끈 뒤에는 조용히 넘어갑니다.
  }
}
tick();
setInterval(tick, 3000);
`;

export function renderHostPage(view: HostPageView): string {
  const cards = ROLE_VIEWS.map((r) => {
    const links = joinLinks(view, r.role);
    const qr = `/qr.svg?d=${encodeURIComponent(links.ip)}`;
    const nameRow = links.name
      ? `<h3>이름 링크</h3>
         <div class="link">
           <input id="name-${r.role}" readonly value="${esc(links.name)}">
           <button onclick="copy('name-${r.role}')">복사</button>
         </div>`
      : "";
    return `
      <section class="card">
        <div class="role-name">${esc(r.name)}</div>
        <div class="role-help">${esc(r.help)}</div>
        <img class="qr" alt="${esc(r.name)} 접속 QR 코드" src="${qr}">
        <h3>IP 링크 (QR과 같은 주소)</h3>
        <div class="link">
          <input id="ip-${r.role}" readonly value="${esc(links.ip)}">
          <button onclick="copy('ip-${r.role}')">복사</button>
        </div>
        ${nameRow}
      </section>`;
  }).join("");

  const displayLink = joinLinks(view, "display").ip;

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Stage Planner 호스트</title>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>호스트</h1>
    <p class="lead">아래 링크나 QR을 기기에 주면 자리 고르기와 코드 입력 없이 바로 들어옵니다.
      이 화면은 호스트 기기에서만 열립니다.</p>
  </header>

  <section class="card">
    <h2>접속 주소</h2>
    <div class="addr">
      <div><span>이름</span><code>${view.nameBase ? esc(hostOf(view.nameBase)) : "쓸 수 없습니다"}</code></div>
      <div><span>IP</span><code>${esc(hostOf(view.ipBase))}</code></div>
    </div>
    ${view.mdnsProblem ? `<p class="warn">${esc(view.mdnsProblem)}</p>` : ""}
  </section>

  <div class="roles">${cards}</div>

  <section class="card">
    <h2>접속 기기</h2>
    <table>
      <thead><tr><th>이름</th><th>자리</th><th>상태</th><th>붙은 시각</th></tr></thead>
      <tbody id="devBody"><tr><td colspan="4">읽는 중입니다.</td></tr></tbody>
    </table>
  </section>

  <section class="card">
    <h2>코드 관리</h2>
    <p class="lead">코드를 다시 만들면 지금까지 나눠준 링크와 QR이 모두 무효가 됩니다.
      이미 붙어 있는 기기는 그대로 있습니다.</p>
    <button class="danger" onclick="rotate()">코드 재발급</button>
    <details>
      <summary>대기실 PC 설정 방법</summary>
      <p>대기실 화면을 켜면 바로 뜨게 하려면 Chrome 바로가기를 하나 만듭니다.</p>
      <ol>
        <li>바탕화면에서 마우스 오른쪽 → 새로 만들기 → 바로 가기</li>
        <li>위치에 Chrome 실행 파일 경로를 넣고, 뒤에
          <code class="inline">--kiosk ${esc(displayLink)}</code> 를 붙입니다</li>
        <li>만든 바로가기를 시작 프로그램 폴더(<code class="inline">shell:startup</code>)에 넣습니다</li>
      </ol>
      <p>전체 화면은 대기실 화면 안의 "전체 화면" 단추로도 켤 수 있습니다.
        코드가 바뀌면 바로가기의 링크도 다시 넣어야 합니다.</p>
    </details>
  </section>

  <p class="foot">코드는 이 화면과 호스트를 띄운 터미널에만 보입니다.
    저장 파일이나 내보내기에는 들어가지 않습니다.</p>
</div>
<script>${SCRIPT}</script>
</body>
</html>`;
}

function hostOf(base: string): string {
  try {
    return new URL(base).host;
  } catch {
    return base;
  }
}
