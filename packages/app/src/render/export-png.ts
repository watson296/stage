import { polygonBounds, type StagePlan } from "@stage-planner/shared";
import { draw } from "./canvas";
import type { Camera } from "./camera";

// 현재 확대 상태와 무관하게 무대 전체를 고해상도 PNG로 내보냅니다.
// 화면의 devicePixelRatio 대신 고정 배율(EXPORT_SCALE)로 선명하게 그립니다.
// 하단에 새결 로고와 이름을 넣어 저작권을 표시합니다.
const EXPORT_SCALE = 2;
const MARGIN = 60;
const HEADER_H = 72;
const FOOTER_H = 64;

/**
 * 배치도를 고해상도 캔버스로 그립니다. PNG 저장과 PDF 인쇄가 같이 씁니다.
 */
export function renderPlanCanvas(
  plan: StagePlan,
  eventName: string,
  gridSz: number,
  logo: HTMLImageElement | null,
): HTMLCanvasElement | null {
  const b = polygonBounds(plan.stage.points);
  const stageW = Math.max(0.5, b.maxX - b.minX);
  const stageD = Math.max(0.5, b.maxY - b.minY);
  const scale = Math.min(1400 / stageW, 900 / stageD);
  const contentW = stageW * scale + 2 * MARGIN;
  const contentH = stageD * scale + 2 * MARGIN + 24;
  const finalW = Math.round(contentW);
  const finalH = Math.round(HEADER_H + contentH + FOOTER_H);

  const canvas = document.createElement("canvas");
  canvas.width = finalW * EXPORT_SCALE;
  canvas.height = finalH * EXPORT_SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(EXPORT_SCALE, 0, 0, EXPORT_SCALE, 0, 0);

  // 무대 왼쪽 위가 여백 안쪽에 오도록 카메라를 둡니다.
  const cam: Camera = {
    scale,
    ox: MARGIN - b.minX * scale,
    oy: HEADER_H + MARGIN - b.minY * scale,
  };
  draw(ctx, finalW, finalH, cam, plan, {
    gridSz,
    selection: null,
    connectSrc: null,
    mode: "select",
  });

  // 머리말
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, finalW, HEADER_H);
  ctx.fillStyle = "rgba(15,39,66,0.13)";
  ctx.fillRect(0, HEADER_H - 1, finalW, 1);
  ctx.fillStyle = "#0F2742";
  ctx.font = "700 22px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(eventName || "새결 Stage Planner", MARGIN, HEADER_H / 2 - 8);
  ctx.fillStyle = "#56667A";
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillText(
    `${plan.name} · 무대 ${round1(stageW)}×${round1(stageD)}m · ${new Date().toLocaleDateString("ko-KR")}`,
    MARGIN,
    HEADER_H / 2 + 14,
  );

  // 꼬리말 (로고 저작권 표시)
  const fy = finalH - FOOTER_H;
  ctx.fillStyle = "#0F2742";
  ctx.fillRect(0, fy, finalW, FOOTER_H);
  const cy = fy + FOOTER_H / 2;
  let tx = MARGIN;
  if (logo && logo.complete && logo.naturalWidth > 0) {
    const h = 32;
    const w = (logo.naturalWidth / logo.naturalHeight) * h;
    ctx.drawImage(logo, MARGIN, cy - h / 2, w, h);
    tx = MARGIN + w + 12;
  }
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "600 15px system-ui, sans-serif";
  ctx.fillText("새결 SAEGYEOL", tx, cy - 8);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillText("Stage Planner로 만든 무대 배치도", tx, cy + 10);

  return canvas;
}

export function exportPNG(
  plan: StagePlan,
  eventName: string,
  gridSz: number,
  logo: HTMLImageElement | null,
): void {
  const canvas = renderPlanCanvas(plan, eventName, gridSz, logo);
  if (!canvas) return;
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = "새결_무대_" + new Date().toISOString().slice(0, 10) + ".png";
  a.click();
}

/**
 * 브라우저 인쇄로 PDF를 만듭니다(라이브러리 없음).
 * 인쇄용 시트에 같은 그림을 넣고 window.print()를 부릅니다.
 * 사용자는 인쇄 대화상자에서 "PDF로 저장"을 고릅니다.
 */
export function exportPDF(
  plan: StagePlan,
  eventName: string,
  gridSz: number,
  logo: HTMLImageElement | null,
): void {
  const canvas = renderPlanCanvas(plan, eventName, gridSz, logo);
  if (!canvas) return;
  let sheet = document.getElementById("print-sheet");
  if (!sheet) {
    sheet = document.createElement("div");
    sheet.id = "print-sheet";
    document.body.appendChild(sheet);
  }
  sheet.replaceChildren();
  const img = document.createElement("img");
  img.src = canvas.toDataURL("image/png");
  img.alt = `${eventName} ${plan.name} 무대 배치도`;
  sheet.appendChild(img);
  const done = () => {
    sheet?.replaceChildren();
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  // 이미지가 자리를 잡은 뒤에 인쇄 대화상자를 엽니다.
  if (img.complete) window.print();
  else img.onload = () => window.print();
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
