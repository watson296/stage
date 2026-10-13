import "./styles/tokens.css";
import "./styles/app.css";

import {
  type StageObject,
  type EquipmentType,
  type Postit,
} from "./model/types";
import { EQUIPMENT, PALETTE_GROUPS, POSTIT_COLORS } from "./model/equipment";
import { POSTIT_W_M, POSTIT_H_M, VIEW_MARGIN } from "./model/constants";
import { hitTest, clampToStage, clamp } from "./model/geometry";
import { Store } from "./state/store";
import { createAutosaver, loadDoc } from "./state/autosave";
import {
  fitCamera,
  zoomAt,
  pan,
  screenToWorld,
  type Camera,
} from "./render/camera";
import { draw, syncCanvasSize, type Selection, type Mode, type RenderUI } from "./render/canvas";
import { exportPNG } from "./render/export-png";
import { attachGestures } from "./input/pointer";
import { downloadJSON, parseDesign, pickJSONFile } from "./io/json";

import logoVerticalUrl from "../assets/brand/saegyeol-logo-vertical.png";
import symbolUrl from "../assets/brand/saegyeol-symbol.png";

// ── 파비콘 ───────────────────────────────────────────────────────────────────
const favicon = document.createElement("link");
favicon.rel = "icon";
favicon.type = "image/png";
favicon.href = symbolUrl;
document.head.appendChild(favicon);

// 내보내기 꼬리말에 쓸 심볼 이미지 미리 로드
const footerLogo = new Image();
footerLogo.src = symbolUrl;

// ── UI 상태 (되돌리기·저장 대상 아님) ────────────────────────────────────────
interface UIState {
  mode: Mode;
  selection: Selection | null;
  gridSz: number;
  snap: boolean;
  connectSrc: number | null;
  placingType: string | null;
}
const ui: UIState = {
  mode: "select",
  selection: null,
  gridSz: 0.25,
  snap: true,
  connectSrc: null,
  placingType: null,
};

const store = new Store();
let cam: Camera = { scale: 60, ox: VIEW_MARGIN, oy: VIEW_MARGIN };

// ── 정적 뼈대 (사용자 입력 없음 → innerHTML 안전) ────────────────────────────
const app = document.getElementById("app")!;
app.innerHTML = `
<header class="hdr">
  <div class="hdr-l">
    <div class="title">Stage Planner</div>
    <div class="sub">새결 밴드 무대 구상 툴</div>
  </div>
  <div class="hdr-r">
    <button class="btn" id="btnSave">💾 저장</button>
    <button class="btn" id="btnLoad">📂 불러오기</button>
    <button class="btn btn-accent" id="btnExport">📷 PNG 내보내기</button>
    <button class="btn" id="btnInfo">ℹ 정보</button>
  </div>
</header>
<div class="tbar">
  <button class="btn" id="mSelect">↖ 선택</button>
  <button class="btn" id="mPostit">📌 포스트잇</button>
  <button class="btn" id="mConnect">🔗 연결</button>
  <div class="sep"></div>
  <button class="btn" id="btnRotate">↻ 회전 45°</button>
  <button class="btn btn-danger" id="btnDelete">✕ 삭제</button>
  <div class="sep"></div>
  <button class="btn" id="btnUndo">↶ 되돌리기</button>
  <button class="btn" id="btnRedo">↷ 다시 실행</button>
  <div class="sep"></div>
  <label>무대 가로<input class="inp" type="number" id="stageW" min="1" max="50" step="0.5"></label>
  <label>세로<input class="inp" type="number" id="stageD" min="1" max="50" step="0.5"></label>
  <label>격자
    <select class="inp" id="gridSel">
      <option value="0.1">0.1m</option>
      <option value="0.25">0.25m</option>
      <option value="0.5">0.5m</option>
      <option value="1">1m</option>
    </select>
  </label>
  <label><input type="checkbox" id="snapCk"> 스냅</label>
  <div class="sep"></div>
  <button class="btn" id="btnFit">⤢ 맞춤</button>
  <button class="btn btn-danger" id="btnClear">🗑 초기화</button>
</div>
<div class="main">
  <div class="pal">
    <div id="palGroups"></div>
    <div class="pal-group" id="customSec" hidden>
      <div class="pal-hdr">커스텀</div>
      <div id="customItems"></div>
    </div>
    <div class="pal-foot">
      <button class="ci-btn" id="btnCustom">➕ 직접 추가</button>
      <div class="pal-note">장비를 탭한 뒤 무대를 탭하면 배치됩니다. 끌어다 놓아도 됩니다.</div>
    </div>
  </div>
  <div class="work">
    <div class="cv-wrap"><canvas id="cv"></canvas></div>
    <div class="props" id="props"></div>
    <div class="sbar">
      <span>무대: <strong id="stageDim"></strong></span>
      <span id="status">준비됨</span>
      <span class="mouse" id="mousePos">x:0.0m y:0.0m</span>
    </div>
  </div>
</div>

<div class="modal-ov" id="piModal" hidden>
  <div class="modal">
    <h2>📌 포스트잇 추가</h2>
    <div class="field"><label>스태프 이름</label><input type="text" id="piName" placeholder="예: 김지훈"></div>
    <div class="field"><label>역할</label><input type="text" id="piRole" placeholder="예: 드럼, 기타, 보컬"></div>
    <div class="field"><label>색상</label><div class="swatches" id="piSwatches"></div></div>
    <div class="modal-acts">
      <button class="btn" id="piCancel">취소</button>
      <button class="btn btn-accent" id="piOk">추가</button>
    </div>
  </div>
</div>

<div class="modal-ov" id="ciModal" hidden>
  <div class="modal">
    <h2>➕ 커스텀 장비 추가</h2>
    <div class="field"><label>이름</label><input type="text" id="ciName" placeholder="예: 서브믹서, DI박스"></div>
    <div class="row">
      <div class="field"><label>아이콘(이모지)</label><input type="text" id="ciIcon" maxlength="4" placeholder="🎛️" style="text-align:center"></div>
      <div class="field"><label>색상</label><input type="color" id="ciColor" value="#8e44ad" style="padding:2px;height:38px"></div>
    </div>
    <div class="row">
      <div class="field"><label>가로(m)</label><input type="number" id="ciW" value="1.0" min="0.1" max="20" step="0.1"></div>
      <div class="field"><label>세로(m)</label><input type="number" id="ciD" value="0.5" min="0.1" max="20" step="0.1"></div>
      <div class="field"><label>높이(m)</label><input type="number" id="ciH" value="1.0" min="0.1" max="10" step="0.1"></div>
    </div>
    <div class="modal-acts">
      <button class="btn" id="ciCancel">취소</button>
      <button class="btn btn-accent" id="ciOk">팔레트에 추가</button>
    </div>
  </div>
</div>

<div class="modal-ov" id="infoModal" hidden>
  <div class="modal">
    <img class="info-logo" id="infoLogo" alt="새결 SAEGYEOL">
    <div class="info-body">
      <p><strong>Stage Planner</strong> — 밴드·공연 무대를 평면도로 구상하는 도구입니다.</p>
      <p class="muted">소스 코드는 Apache-2.0으로 공개됩니다. 새결 로고와 이름은 상표이며,
        포크할 때는 로고를 본인/본인 조직의 것으로 교체해야 합니다.</p>
      <p class="muted">작업은 이 기기 안에 자동 저장됩니다. 기기나 브라우저를 바꾸거나
        저장소가 비워지면 사라질 수 있으니, 중요한 배치는 <strong>JSON으로 내보내</strong> 두세요.</p>
      <p class="muted">© 2026 새결 (Team Saegyeol)</p>
    </div>
    <div class="modal-acts"><button class="btn btn-accent" id="infoClose">닫기</button></div>
  </div>
</div>

<div id="toast"></div>
`;

(document.getElementById("infoLogo") as HTMLImageElement).src = logoVerticalUrl;

// ── 요소 참조 ────────────────────────────────────────────────────────────────
const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("cv");
const ctx = canvas.getContext("2d")!;

// ── 렌더 ─────────────────────────────────────────────────────────────────────
let rafPending = false;
function requestRender(): void {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    render();
  });
}
function render(): void {
  const { cssW, cssH } = syncCanvasSize(canvas, ctx);
  const rui: RenderUI = {
    gridSz: ui.gridSz,
    selection: ui.selection,
    connectSrc: ui.connectSrc,
    mode: ui.mode,
  };
  draw(ctx, cssW, cssH, cam, store.get(), rui);
}

// ── 장비 종류 해석 ───────────────────────────────────────────────────────────
function resolveType(key: string): EquipmentType | null {
  return EQUIPMENT[key] ?? store.get().customTypes[key] ?? null;
}

// ── 히트 테스트 ──────────────────────────────────────────────────────────────
function hitPostit(wx: number, wy: number): Postit | null {
  const ps = store.get().postits;
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    if (
      Math.abs(wx - p.x) <= POSTIT_W_M / 2 &&
      Math.abs(wy - p.y) <= POSTIT_H_M / 2
    )
      return p;
  }
  return null;
}
function hitObject(wx: number, wy: number): StageObject | null {
  const os = store.get().objects;
  for (let i = os.length - 1; i >= 0; i--) {
    const o = os[i];
    if (hitTest({ x: o.x, y: o.y, w: o.w, d: o.d, rot: o.rot }, { x: wx, y: wy }))
      return o;
  }
  return null;
}
function hitAny(wx: number, wy: number): Selection | null {
  const p = hitPostit(wx, wy);
  if (p) return { kind: "pi", id: p.id };
  const o = hitObject(wx, wy);
  if (o) return { kind: "obj", id: o.id };
  return null;
}

// ── 선택 ─────────────────────────────────────────────────────────────────────
function select(sel: Selection | null): void {
  ui.selection = sel;
  renderProps();
  requestRender();
}

// ── 배치 ─────────────────────────────────────────────────────────────────────
function snapVal(v: number): number {
  return ui.snap ? Math.round(v / ui.gridSz) * ui.gridSz : v;
}
function placeObject(key: string, wx: number, wy: number): void {
  const t = resolveType(key);
  if (!t) return;
  const doc = store.get();
  let x = snapVal(wx - t.w / 2);
  let y = snapVal(wy - t.d / 2);
  const c = clampToStage({ x, y, w: t.w, d: t.d, rot: 0 }, doc.stage.w, doc.stage.d);
  x = c.x;
  y = c.y;
  let newId = 0;
  store.commit((d) => {
    newId = d.nextId++;
    d.objects.push({
      id: newId,
      type: key,
      name: t.name,
      x,
      y,
      z: 0,
      w: t.w,
      d: t.d,
      h: t.h,
      rot: 0,
      color: t.color,
      emoji: t.emoji,
      label: "",
    });
  });
  select({ kind: "obj", id: newId });
  setStatus("배치했습니다. 계속 탭해 더 놓거나 Esc로 끝냅니다.");
}

// ── 드래그 ───────────────────────────────────────────────────────────────────
let dragOffset = { x: 0, y: 0 };
let dragKind: "obj" | "pi" | null = null;
let dragId = 0;

const gestureHost = {
  toWorld: (sx: number, sy: number) => screenToWorld(cam, sx, sy),
  grabbableAt: (world: { x: number; y: number }) =>
    ui.mode === "select" && hitAny(world.x, world.y) !== null,
  onGrabStart: (world: { x: number; y: number }) => {
    const sel = hitAny(world.x, world.y);
    if (!sel) return;
    select(sel);
    store.beginTxn();
    dragKind = sel.kind;
    dragId = sel.id;
    if (sel.kind === "obj") {
      const o = store.get().objects.find((x) => x.id === sel.id)!;
      dragOffset = { x: world.x - o.x, y: world.y - o.y };
    } else {
      const p = store.get().postits.find((x) => x.id === sel.id)!;
      dragOffset = { x: world.x - p.x, y: world.y - p.y };
    }
  },
  onGrabMove: (world: { x: number; y: number }) => {
    if (!dragKind) return;
    const doc = store.get();
    store.mutate((d) => {
      if (dragKind === "obj") {
        const o = d.objects.find((x) => x.id === dragId);
        if (!o) return;
        let x = snapVal(world.x - dragOffset.x);
        let y = snapVal(world.y - dragOffset.y);
        const c = clampToStage({ x, y, w: o.w, d: o.d, rot: o.rot }, doc.stage.w, doc.stage.d);
        o.x = c.x;
        o.y = c.y;
      } else {
        const p = d.postits.find((x) => x.id === dragId);
        if (!p) return;
        p.x = clamp(snapVal(world.x - dragOffset.x), 0, doc.stage.w);
        p.y = clamp(snapVal(world.y - dragOffset.y), 0, doc.stage.d);
      }
    });
    renderProps();
  },
  onGrabEnd: (moved: boolean) => {
    if (dragKind) {
      if (moved) store.commitTxn();
      else store.cancelTxn();
    }
    dragKind = null;
  },
  onTap: (world: { x: number; y: number }) => {
    if (ui.mode === "place" && ui.placingType) {
      placeObject(ui.placingType, world.x, world.y);
      return;
    }
    if (ui.mode === "addPostit") {
      openPostitModal(world.x, world.y);
      return;
    }
    if (ui.mode === "connect") {
      handleConnectTap(world.x, world.y);
      return;
    }
    select(null); // 선택 모드 빈 곳 탭 → 선택 해제
  },
  onPanZoom: (factor: number, fx: number, fy: number, dx: number, dy: number) => {
    if (factor !== 1) cam = zoomAt(cam, factor, fx, fy);
    if (dx !== 0 || dy !== 0) cam = pan(cam, dx, dy);
    requestRender();
  },
};
attachGestures(canvas, gestureHost);

// 마우스 위치 표시
canvas.addEventListener("pointermove", (e) => {
  const r = canvas.getBoundingClientRect();
  const w = screenToWorld(cam, e.clientX - r.left, e.clientY - r.top);
  $("mousePos").textContent = `x:${w.x.toFixed(1)}m y:${w.y.toFixed(1)}m`;
});

// ── 연결 모드 ────────────────────────────────────────────────────────────────
function handleConnectTap(wx: number, wy: number): void {
  if (ui.connectSrc == null) {
    const p = hitPostit(wx, wy);
    if (p) {
      ui.connectSrc = p.id;
      setStatus("연결할 장비를 탭하세요 (Esc 취소)");
      requestRender();
    }
    return;
  }
  const o = hitObject(wx, wy);
  const src = ui.connectSrc;
  if (o) {
    store.commit((d) => {
      const p = d.postits.find((x) => x.id === src);
      if (p) p.con = o.id;
    });
    setStatus("연결했습니다.");
  }
  ui.connectSrc = null;
  requestRender();
}

// ── 포스트잇 모달 ────────────────────────────────────────────────────────────
let pendingPostit: { x: number; y: number } | null = null;
let postitColor = POSTIT_COLORS[0];
function buildSwatches(): void {
  const sc = $("piSwatches");
  sc.innerHTML = "";
  POSTIT_COLORS.forEach((c) => {
    const d = document.createElement("div");
    d.className = "sw" + (c === postitColor ? " sel" : "");
    d.style.background = c;
    d.onclick = () => {
      postitColor = c;
      sc.querySelectorAll(".sw").forEach((s) => s.classList.remove("sel"));
      d.classList.add("sel");
    };
    sc.appendChild(d);
  });
}
function openPostitModal(wx: number, wy: number): void {
  pendingPostit = { x: wx, y: wy };
  ($("piName") as HTMLInputElement).value = "";
  ($("piRole") as HTMLInputElement).value = "";
  buildSwatches();
  $("piModal").hidden = false;
  setTimeout(() => ($("piName") as HTMLInputElement).focus(), 40);
}
function confirmPostit(): void {
  if (!pendingPostit) return;
  const nm = ($("piName") as HTMLInputElement).value.trim() || "스태프";
  const role = ($("piRole") as HTMLInputElement).value.trim();
  const pos = pendingPostit;
  pendingPostit = null;
  $("piModal").hidden = true;
  let newId = 0;
  store.commit((d) => {
    newId = d.nextId++;
    d.postits.push({ id: newId, x: pos.x, y: pos.y, nm, role, color: postitColor, con: null });
  });
  setMode("select");
  select({ kind: "pi", id: newId });
}

// ── 커스텀 장비 모달 ─────────────────────────────────────────────────────────
function confirmCustom(): void {
  const name = ($("ciName") as HTMLInputElement).value.trim();
  if (!name) {
    ($("ciName") as HTMLInputElement).focus();
    return;
  }
  const emoji = ($("ciIcon") as HTMLInputElement).value.trim() || "📦";
  const color = ($("ciColor") as HTMLInputElement).value || "#8e44ad";
  const w = parseFloat(($("ciW") as HTMLInputElement).value) || 1;
  const d = parseFloat(($("ciD") as HTMLInputElement).value) || 0.5;
  const h = parseFloat(($("ciH") as HTMLInputElement).value) || 1;
  const key = "ci_" + Date.now();
  $("ciModal").hidden = true;
  store.commit((doc) => {
    doc.customTypes[key] = { name, w, d, h, color, emoji };
  });
  renderPalette();
}

// ── 팔레트 ───────────────────────────────────────────────────────────────────
function makePalItem(key: string, t: EquipmentType, isCustom: boolean): HTMLElement {
  const item = document.createElement("div");
  item.className = "pal-item" + (ui.placingType === key ? " selected" : "");
  item.dataset.key = key;
  const dot = document.createElement("div");
  dot.className = "pal-dot";
  dot.style.background = t.color;
  const nm = document.createElement("div");
  nm.className = "pal-nm";
  nm.textContent = `${t.emoji} ${t.name}`; // textContent → XSS 방지
  item.append(dot, nm);
  attachPaletteDrag(item, key);
  if (isCustom) {
    const wrap = document.createElement("div");
    wrap.className = "custom-item";
    const del = document.createElement("button");
    del.className = "del";
    del.textContent = "✕";
    del.title = "삭제";
    del.onclick = (e) => {
      e.stopPropagation();
      store.commit((doc) => {
        delete doc.customTypes[key];
      });
      if (ui.placingType === key) clearPlacing();
      renderPalette();
    };
    wrap.append(item, del);
    return wrap;
  }
  return item;
}
function renderPalette(): void {
  const groups = $("palGroups");
  groups.innerHTML = "";
  for (const g of PALETTE_GROUPS) {
    const sec = document.createElement("div");
    sec.className = "pal-group";
    const hdr = document.createElement("div");
    hdr.className = "pal-hdr";
    hdr.textContent = g.title;
    sec.appendChild(hdr);
    for (const key of g.types) {
      const t = EQUIPMENT[key];
      if (t) sec.appendChild(makePalItem(key, t, false));
    }
    groups.appendChild(sec);
  }
  const custom = store.get().customTypes;
  const keys = Object.keys(custom);
  const customItems = $("customItems");
  customItems.innerHTML = "";
  $("customSec").hidden = keys.length === 0;
  for (const key of keys) customItems.appendChild(makePalItem(key, custom[key], true));
}

// 팔레트 → 캔버스 끌어놓기(HTML5 DnD 아님) + 탭 선택
function attachPaletteDrag(item: HTMLElement, key: string): void {
  item.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY };
    let dragging = false;
    const move = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 8)
        dragging = true;
    };
    const up = (ev: PointerEvent) => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      const r = canvas.getBoundingClientRect();
      const overCanvas =
        ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
      if (dragging && overCanvas) {
        const w = screenToWorld(cam, ev.clientX - r.left, ev.clientY - r.top);
        placeObject(key, w.x, w.y);
      } else if (!dragging) {
        togglePlacing(key); // 탭 → 배치 모드 토글
      }
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  });
}
function togglePlacing(key: string): void {
  if (ui.placingType === key) {
    clearPlacing();
    return;
  }
  ui.placingType = key;
  setMode("place");
  const t = resolveType(key);
  setStatus(`${t?.name ?? "장비"} 배치: 무대를 탭하세요 (Esc로 끝내기)`);
  renderPalette();
}
function clearPlacing(): void {
  ui.placingType = null;
  if (ui.mode === "place") ui.mode = "select";
  renderPalette();
  updateToolbar();
}

// ── 모드 ─────────────────────────────────────────────────────────────────────
function setMode(m: Mode): void {
  ui.mode = m;
  if (m !== "place") ui.placingType = null;
  if (m !== "connect") ui.connectSrc = null;
  const hints: Record<Mode, string> = {
    select: "준비됨 | 장비를 탭해 선택·이동, 두 손가락으로 이동·확대",
    addPostit: "무대를 탭해 포스트잇을 추가하세요",
    connect: "포스트잇을 탭한 뒤 장비를 탭해 연결하세요",
    place: "무대를 탭해 배치하세요 (Esc로 끝내기)",
  };
  setStatus(hints[m]);
  updateToolbar();
  renderPalette();
  requestRender();
}

// ── 회전·삭제 ────────────────────────────────────────────────────────────────
function rotateSelected(): void {
  if (ui.selection?.kind !== "obj") return;
  const id = ui.selection.id;
  store.commit((d) => {
    const o = d.objects.find((x) => x.id === id);
    if (o) o.rot = (o.rot + 45) % 360; // w/d 맞바꾸지 않음
  });
  renderProps();
}
function deleteSelected(): void {
  const sel = ui.selection;
  if (!sel) return;
  store.commit((d) => {
    if (sel.kind === "obj") {
      d.objects = d.objects.filter((o) => o.id !== sel.id);
      d.postits.forEach((p) => {
        if (p.con === sel.id) p.con = null;
      });
    } else {
      d.postits = d.postits.filter((p) => p.id !== sel.id);
    }
  });
  ui.selection = null;
  renderProps();
}

// ── 속성 바 ──────────────────────────────────────────────────────────────────
function renderProps(): void {
  const el = $("props");
  const sel = ui.selection;
  el.innerHTML = "";
  if (!sel) {
    const s = document.createElement("span");
    s.className = "none";
    s.textContent = "장비나 포스트잇을 탭하면 속성이 보입니다";
    el.appendChild(s);
    return;
  }
  if (sel.kind === "obj") {
    const o = store.get().objects.find((x) => x.id === sel.id);
    if (!o) return;
    el.appendChild(span("selnm", `${o.emoji} ${o.name}`));
    el.appendChild(numField("X", o.x, (v) => applyObj((d) => (d.x = v))));
    el.appendChild(numField("Y", o.y, (v) => applyObj((d) => (d.y = v))));
    el.appendChild(labelPair("크기", `${round1(o.w)}×${round1(o.d)}×${round1(o.h)}m`));
    el.appendChild(labelPair("회전", `${o.rot}°`));
    el.appendChild(textField("레이블", o.label, (v) => applyObj((d) => (d.label = v))));
    el.appendChild(btn("↻ 회전", rotateSelected));
    el.appendChild(btn("✕ 삭제", deleteSelected, "btn-danger"));
  } else {
    const p = store.get().postits.find((x) => x.id === sel.id);
    if (!p) return;
    el.appendChild(span("selnm", `📌 ${p.nm || "포스트잇"}`));
    el.appendChild(textField("이름", p.nm, (v) => applyPi((d) => (d.nm = v))));
    el.appendChild(textField("역할", p.role, (v) => applyPi((d) => (d.role = v))));
    el.appendChild(btn("✕ 삭제", deleteSelected, "btn-danger"));
  }

  function applyObj(fn: (o: StageObject) => void): void {
    store.mutate((d) => {
      const o = d.objects.find((x) => x.id === sel!.id);
      if (o) fn(o);
    });
    requestRender();
  }
  function applyPi(fn: (p: Postit) => void): void {
    store.mutate((d) => {
      const p = d.postits.find((x) => x.id === sel!.id);
      if (p) fn(p);
    });
    requestRender();
  }
}

function span(cls: string, text: string): HTMLElement {
  const s = document.createElement("span");
  s.className = cls;
  s.textContent = text;
  return s;
}
function labelPair(label: string, value: string): HTMLElement {
  const g = document.createElement("span");
  g.className = "pg";
  g.textContent = `${label}: ${value}`;
  return g;
}
function numField(label: string, value: number, apply: (v: number) => void): HTMLElement {
  const g = document.createElement("span");
  g.className = "pg";
  g.textContent = label + ":";
  const inp = document.createElement("input");
  inp.className = "inp";
  inp.type = "number";
  inp.step = "0.1";
  inp.value = String(round1(value));
  wireEditable(inp, () => apply(parseFloat(inp.value) || 0));
  g.appendChild(inp);
  g.append("m");
  return g;
}
function textField(label: string, value: string, apply: (v: string) => void): HTMLElement {
  const g = document.createElement("span");
  g.className = "pg";
  g.textContent = label + ":";
  const inp = document.createElement("input");
  inp.className = "inp wide";
  inp.type = "text";
  inp.value = value; // value 속성 → XSS 아님
  wireEditable(inp, () => apply(inp.value));
  g.appendChild(inp);
  return g;
}
// 편집을 한 번의 되돌리기 단계로 묶는다(focus→begin, input→mutate, blur→commit)
function wireEditable(inp: HTMLInputElement, apply: () => void): void {
  let dirty = false;
  inp.addEventListener("focus", () => {
    store.beginTxn();
    dirty = false;
  });
  inp.addEventListener("input", () => {
    dirty = true;
    apply();
  });
  const finish = () => {
    if (dirty) store.commitTxn();
    else store.cancelTxn();
    dirty = false;
  };
  inp.addEventListener("blur", finish);
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") inp.blur();
  });
}
function btn(text: string, onClick: () => void, cls = ""): HTMLElement {
  const b = document.createElement("button");
  b.className = "btn " + cls;
  b.textContent = text;
  b.onclick = onClick;
  return b;
}
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

// ── 툴바 상태 ────────────────────────────────────────────────────────────────
function updateToolbar(): void {
  $("mSelect").classList.toggle("active", ui.mode === "select" || ui.mode === "place");
  $("mPostit").classList.toggle("active", ui.mode === "addPostit");
  $("mConnect").classList.toggle("active", ui.mode === "connect");
  ($("btnUndo") as HTMLButtonElement).disabled = !store.canUndo();
  ($("btnRedo") as HTMLButtonElement).disabled = !store.canRedo();
  ($("snapCk") as HTMLInputElement).checked = ui.snap;
  const d = store.get();
  $("stageDim").textContent = `${d.stage.w}m × ${d.stage.d}m × ${d.stage.h}m`;
}

// ── 무대 설정 ────────────────────────────────────────────────────────────────
function syncStageInputs(): void {
  const d = store.get();
  ($("stageW") as HTMLInputElement).value = String(d.stage.w);
  ($("stageD") as HTMLInputElement).value = String(d.stage.d);
  ($("gridSel") as HTMLSelectElement).value = String(ui.gridSz);
}
function applyStageSize(): void {
  const w = clamp(parseFloat(($("stageW") as HTMLInputElement).value) || 8, 1, 50);
  const d = clamp(parseFloat(($("stageD") as HTMLInputElement).value) || 6, 1, 50);
  store.commit((doc) => {
    doc.stage.w = w;
    doc.stage.d = d;
  });
  fit();
}

// ── 상태 메시지 ──────────────────────────────────────────────────────────────
function setStatus(msg: string): void {
  $("status").textContent = msg;
}

// ── 토스트 ───────────────────────────────────────────────────────────────────
function toast(msg: string, isError = false): void {
  const t = document.createElement("div");
  t.className = "toast" + (isError ? " err" : "");
  t.textContent = msg;
  $("toast").appendChild(t);
  setTimeout(() => t.remove(), isError ? 6000 : 3500);
}

// ── 카메라 맞춤 ──────────────────────────────────────────────────────────────
function fit(): void {
  const d = store.get();
  cam = fitCamera(canvas.clientWidth, canvas.clientHeight, d.stage.w, d.stage.d, VIEW_MARGIN);
  requestRender();
}

// ── 저장·불러오기·내보내기 ───────────────────────────────────────────────────
async function doLoad(): Promise<void> {
  const text = await pickJSONFile();
  if (text == null) return;
  try {
    const { doc, warnings } = parseDesign(text);
    store.replace(doc);
    ui.selection = null;
    syncStageInputs();
    fit();
    renderPalette();
    renderProps();
    updateToolbar();
    warnings.forEach((w) => toast(w));
    toast("불러왔습니다.");
  } catch (e) {
    toast(e instanceof Error ? e.message : "파일을 읽을 수 없습니다.", true);
  }
}

// ── 이벤트 연결 ──────────────────────────────────────────────────────────────
$("btnSave").onclick = () => downloadJSON(store.get());
$("btnLoad").onclick = () => void doLoad();
$("btnExport").onclick = () => exportPNG(store.get(), ui.gridSz, footerLogo);
$("btnInfo").onclick = () => ($("infoModal").hidden = false);
$("infoClose").onclick = () => ($("infoModal").hidden = true);

$("mSelect").onclick = () => setMode("select");
$("mPostit").onclick = () => setMode("addPostit");
$("mConnect").onclick = () => setMode("connect");
$("btnRotate").onclick = rotateSelected;
$("btnDelete").onclick = deleteSelected;
$("btnUndo").onclick = () => store.undo();
$("btnRedo").onclick = () => store.redo();
$("btnFit").onclick = fit;
$("btnClear").onclick = () => {
  if (!confirm("모든 장비와 포스트잇을 초기화할까요?")) return;
  store.commit((d) => {
    d.objects = [];
    d.postits = [];
  });
  ui.selection = null;
  renderProps();
};
$("stageW").onchange = applyStageSize;
$("stageD").onchange = applyStageSize;
$("gridSel").onchange = () => {
  ui.gridSz = parseFloat(($("gridSel") as HTMLSelectElement).value) || 0.25;
  requestRender();
};
$("snapCk").onchange = () => {
  ui.snap = ($("snapCk") as HTMLInputElement).checked;
};
$("btnCustom").onclick = () => {
  $("ciModal").hidden = false;
  setTimeout(() => ($("ciName") as HTMLInputElement).focus(), 40);
};
$("piOk").onclick = confirmPostit;
$("piCancel").onclick = () => {
  $("piModal").hidden = true;
  pendingPostit = null;
  setMode("select");
};
$("ciOk").onclick = confirmCustom;
$("ciCancel").onclick = () => ($("ciModal").hidden = true);

// 모달 Enter/Esc
$("piModal").addEventListener("keydown", (e) => {
  if (e.key === "Enter") confirmPostit();
});
$("ciModal").addEventListener("keydown", (e) => {
  if (e.key === "Enter") confirmCustom();
});

// 키보드 단축키
document.addEventListener("keydown", (e) => {
  const tag = (e.target as HTMLElement).tagName;
  const inField = tag === "INPUT" || tag === "TEXTAREA";
  if (e.key === "Escape") {
    if (!$("piModal").hidden) {
      $("piModal").hidden = true;
      pendingPostit = null;
    }
    if (!$("ciModal").hidden) $("ciModal").hidden = true;
    if (!$("infoModal").hidden) $("infoModal").hidden = true;
    setMode("select");
    return;
  }
  if (inField) return;
  if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
    e.preventDefault();
    if (e.shiftKey) store.redo();
    else store.undo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
    e.preventDefault();
    store.redo();
    return;
  }
  if (e.key === "Delete" || e.key === "Backspace") deleteSelected();
  if (e.key === "r" || e.key === "R") rotateSelected();
});

// 리사이즈
const ro = new ResizeObserver(() => requestRender());
ro.observe($("cv"));
window.addEventListener("resize", () => requestRender());

// ── 자동 저장 ────────────────────────────────────────────────────────────────
let storageWarned = false;
const autosaver = createAutosaver((msg) => {
  toast(msg + " 중요한 배치는 JSON으로 내보내 두세요.", true);
  storageWarned = true;
});
function isEditing(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
}
store.subscribe(() => {
  updateToolbar();
  // 입력창을 편집 중이 아니면 속성·무대 입력값을 현재 상태로 되맞춘다
  // (되돌리기/다시 실행 후 표시가 최신이 되도록).
  if (!isEditing()) {
    renderProps();
    syncStageInputs();
  }
  requestRender();
  autosaver.schedule(store.get());
});
window.addEventListener("beforeunload", () => void autosaver.flush());

// ── 시작 ─────────────────────────────────────────────────────────────────────
async function start(): Promise<void> {
  try {
    const saved = await loadDoc();
    if (saved) store.replace(saved);
  } catch (e) {
    toast(
      (e instanceof Error ? e.message : "저장소를 열 수 없습니다.") +
        " 작업이 자동 저장되지 않을 수 있으니 JSON으로 내보내 두세요.",
      true,
    );
    storageWarned = true;
  }
  void storageWarned;
  ui.snap = true;
  syncStageInputs();
  renderPalette();
  renderProps();
  setMode("select");
  fit();
}
void start();
