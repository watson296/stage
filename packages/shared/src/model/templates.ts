// 무대 모양 템플릿. 가로·깊이를 받아 다각형 꼭짓점을 만듭니다.
// 만든 뒤에는 모두 똑같이 꼭짓점을 끌어 고칠 수 있습니다(SPEC 7장).
import type { StageShape, Vec2, AudienceDir } from "./types";

export type TemplateId =
  | "rect" | "roundFront" | "thrust" | "round" | "center" | "lshape" | "wings";

export interface StageTemplate {
  id: TemplateId;
  name: string;
  /** 이 모양에 어울리는 객석 방향 */
  audienceDir: AudienceDir;
  build: (w: number, d: number) => StageShape;
}

const P = (x: number, y: number): Vec2 => ({ x, y });

/** 원호를 선분으로 잘게 나눠 다각형으로 만듭니다. */
function arc(
  cx: number, cy: number, rx: number, ry: number,
  from: number, to: number, steps: number,
): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = from + ((to - from) * i) / steps;
    out.push(P(cx + Math.cos(t) * rx, cy + Math.sin(t) * ry));
  }
  return out;
}

export const TEMPLATES: StageTemplate[] = [
  {
    id: "rect",
    name: "사각형",
    audienceDir: "front",
    build: (w, d) => ({ points: [P(0, 0), P(w, 0), P(w, d), P(0, d)] }),
  },
  {
    id: "roundFront",
    name: "앞이 둥근 무대",
    audienceDir: "front",
    build: (w, d) => {
      // 뒤는 직선, 앞(+y)은 바깥으로 부푼 호
      const straight = d * 0.65;
      return {
        points: [
          P(0, 0), P(w, 0), P(w, straight),
          ...arc(w / 2, straight, w / 2, d - straight, 0, Math.PI, 16).slice(1, -1),
          P(0, straight),
        ],
      };
    },
  },
  {
    id: "thrust",
    name: "돌출 무대",
    audienceDir: "front",
    build: (w, d) => {
      const base = d * 0.6;
      const tw = w * 0.42;
      const x0 = (w - tw) / 2;
      return {
        points: [
          P(0, 0), P(w, 0), P(w, base),
          P(x0 + tw, base), P(x0 + tw, d), P(x0, d), P(x0, base),
          P(0, base),
        ],
      };
    },
  },
  {
    id: "round",
    name: "원형",
    audienceDir: "all",
    build: (w, d) => ({ points: arc(w / 2, d / 2, w / 2, d / 2, 0, Math.PI * 2, 24).slice(0, -1) }),
  },
  {
    id: "center",
    name: "중앙 무대",
    audienceDir: "all",
    build: (w, d) => ({ points: [P(0, 0), P(w, 0), P(w, d), P(0, d)] }),
  },
  {
    id: "lshape",
    name: "L자",
    audienceDir: "front",
    build: (w, d) => {
      const cw = w * 0.55, cd = d * 0.55;
      return { points: [P(0, 0), P(cw, 0), P(cw, d - cd), P(w, d - cd), P(w, d), P(0, d)] };
    },
  },
  {
    id: "wings",
    name: "날개 있는 무대",
    audienceDir: "front",
    build: (w, d) => {
      const wingW = w * 0.18, wingD = d * 0.45;
      const y0 = (d - wingD) / 2;
      return {
        points: [
          P(wingW, 0), P(w - wingW, 0), P(w - wingW, y0), P(w, y0),
          P(w, y0 + wingD), P(w - wingW, y0 + wingD), P(w - wingW, d),
          P(wingW, d), P(wingW, y0 + wingD), P(0, y0 + wingD),
          P(0, y0), P(wingW, y0),
        ],
      };
    },
  },
];

export function templateById(id: string): StageTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
