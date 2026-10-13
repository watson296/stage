import type { EquipmentType } from "./types";

// 기존 프로토타입(template.html)의 OT 객체 값을 그대로 옮긴 기본 장비 11종.
export const EQUIPMENT: Record<string, EquipmentType> = {
  drumkit: { name: "드럼킷", w: 1.8, d: 1.5, h: 1.2, color: "#e74c3c", emoji: "🥁" },
  guitarAmp: { name: "기타 앰프", w: 0.6, d: 0.5, h: 0.7, color: "#e67e22", emoji: "🎸" },
  bassAmp: { name: "베이스 앰프", w: 0.7, d: 0.55, h: 0.75, color: "#f39c12", emoji: "🎸" },
  keyboard: { name: "키보드", w: 1.3, d: 0.4, h: 0.9, color: "#9b59b6", emoji: "🎹" },
  vocalMic: { name: "보컬 마이크", w: 0.3, d: 0.3, h: 1.6, color: "#1abc9c", emoji: "🎤" },
  mainSpeaker: { name: "메인 스피커", w: 0.6, d: 0.5, h: 1.2, color: "#3498db", emoji: "🔊" },
  monitor: { name: "모니터", w: 0.5, d: 0.4, h: 0.4, color: "#2ecc71", emoji: "🔊" },
  subwoofer: { name: "서브우퍼", w: 0.6, d: 0.6, h: 0.6, color: "#566573", emoji: "🔉" },
  mixer: { name: "믹서 테이블", w: 1.0, d: 0.6, h: 1.0, color: "#34495e", emoji: "🎚️" },
  riser: { name: "드럼 라이저", w: 2.0, d: 2.0, h: 0.3, color: "#7f8c8d", emoji: "▭" },
  cableTray: { name: "케이블 트레이", w: 1.0, d: 0.2, h: 0.1, color: "#95a5a6", emoji: "—" },
};

// 팔레트 묶음 (화면 표시 순서)
export const PALETTE_GROUPS: { title: string; types: string[] }[] = [
  { title: "악기", types: ["drumkit", "guitarAmp", "bassAmp", "keyboard", "vocalMic"] },
  { title: "음향", types: ["mainSpeaker", "monitor", "subwoofer", "mixer"] },
  { title: "기타", types: ["riser", "cableTray"] },
];

export const POSTIT_COLORS = [
  "#f1c40f",
  "#e74c3c",
  "#3498db",
  "#2ecc71",
  "#9b59b6",
  "#e67e22",
  "#1abc9c",
  "#bdc3c7",
];
