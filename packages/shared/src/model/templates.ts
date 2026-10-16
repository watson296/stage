// 무대 모양 템플릿. 가로·깊이를 받아 다각형 꼭짓점을 만듭니다.
// 만든 뒤에는 모두 똑같이 꼭짓점을 끌어 고칠 수 있습니다(SPEC 7장).
import type { StageShape, Vec2, AudienceDir } from "./types";
import { edgeNormal, shapeBounds } from "./geometry";

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

/**
 * 두 꼭짓점을 지나는 원호가 세 번째 점도 지나게 하는 부푼 거리를 구합니다.
 * 타원의 45° 점을 세 번째 점으로 넣어 원형 무대를 만듭니다.
 */
function bulgeThrough(a: Vec2, b: Vec2, through: Vec2): number {
  const n = edgeNormal(a, b);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  // 법선 방향으로 얼마나 떨어져 있는지가 곧 부푼 거리입니다.
  return (through.x - mx) * n.x + (through.y - my) * n.y;
}

/**
 * 부푼 거리를 한 배율로 줄여 모양이 요청한 w × d 안에 들어오게 맞춥니다.
 *
 * 원호 넷으로 타원을 흉내면 짧은 축 쪽이 몇 %씩 넘칩니다. 그대로 두면
 * stageSize가 요청값보다 커지고, 템플릿을 다시 적용할 때마다 무대가 조금씩
 * 자라납니다. 이분법으로 넘치지 않는 가장 큰 배율을 찾습니다.
 */
function fitBulges(shape: StageShape, w: number, d: number): StageShape {
  const arcs = shape.arcs;
  if (!arcs?.length) return shape;
  const TOL = 1e-4;
  const fits = (f: number): boolean => {
    const b = shapeBounds(
      { points: shape.points, arcs: arcs.map((a) => ({ ...a, bulgeM: a.bulgeM * f })) },
      0.0005,
    );
    return b.minX >= -TOL && b.minY >= -TOL && b.maxX <= w + TOL && b.maxY <= d + TOL;
  };
  if (fits(1)) return shape;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return {
    points: shape.points,
    arcs: arcs.map((a) => ({ ...a, bulgeM: a.bulgeM * lo })),
  };
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
      // 뒤와 옆은 직선, 앞 변(변 2)만 바깥으로 부푼 호 하나입니다.
      const straight = d * 0.65;
      return {
        points: [P(0, 0), P(w, 0), P(w, straight), P(0, straight)],
        arcs: [{ fromIdx: 2, toIdx: 3, bulgeM: d - straight }],
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
    build: (w, d) => {
      // 축 끝점 네 개와 사분원 네 개. w === d면 정확한 원이 되고,
      // w ≠ d면 타원을 원호 네 개로 근사합니다(SPEC 7.2).
      const rx = w / 2;
      const ry = d / 2;
      const points = [P(rx, 0), P(w, ry), P(rx, d), P(0, ry)];
      const k = Math.SQRT1_2; // cos 45° = sin 45°
      const corner = [
        P(rx + rx * k, ry - ry * k),
        P(rx + rx * k, ry + ry * k),
        P(rx - rx * k, ry + ry * k),
        P(rx - rx * k, ry - ry * k),
      ];
      return fitBulges(
        {
          points,
          arcs: points.map((_, i) => ({
            fromIdx: i,
            toIdx: (i + 1) % points.length,
            bulgeM: bulgeThrough(points[i], points[(i + 1) % points.length], corner[i]),
          })),
        },
        w,
        d,
      );
    },
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
