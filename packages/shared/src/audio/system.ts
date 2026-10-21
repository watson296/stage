// PA 시스템 조언. 정해진 규칙과 공식으로만 만들고 추측하지 않습니다(SPEC 8.4).
// 결과마다 근거 문장을 함께 돌려주어 화면에 그대로 보여 줍니다.

import type { Venue } from "../model/types";
import {
  alignDelayMs,
  currentA,
  splAtDistance,
  stackGainDb,
} from "./acoustics";
import { backlineWatts, monitorMixCount } from "./channels";
import { genreInfo, type Genre, type Lineup } from "./lineup";
import type { SpeakerSpec } from "./speaker";

/** 무대 앞에서 객석 첫 줄까지의 가정 거리(m). */
export const FRONT_ROW_M = 2;
/** 라인 어레이를 권하는 기준. 이보다 멀거나 많으면 포인트 소스로는 뒤가 모자랍니다. */
export const LINE_ARRAY_DEPTH_M = 25;
export const LINE_ARRAY_CAPACITY = 300;
/** 딜레이 스피커를 권하는 거리. 이보다 멀면 뒤쪽 음압이 많이 떨어집니다. */
export const DELAY_SPEAKER_DEPTH_M = 25;
export const MAX_MAIN_PER_SIDE = 4;

export interface PaInput {
  venue: Venue;
  genre: Genre;
  lineup: Lineup;
  speaker: SpeakerSpec;
  /** 쓸 수 있는 믹서 입력 채널 수. */
  mixerChannels: number;
}

export interface SystemAdvice {
  mainKind: "point" | "line";
  mainPerSide: number;
  mainCount: number;
  subCount: number;
  frontSplDb: number;
  backSplDb: number;
  targetSplDb: number;
  meetsTarget: boolean;
  delayNeeded: boolean;
  delayDistanceM: number;
  delayMs: number;
  monitorMixes: number;
  reasons: string[];
}

function r1(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * 메인 스피커 구성과 예상 음압. 직접음만 계산하므로 실내 반사로 올라가는 몫은
 * 들어 있지 않습니다. 실제로는 이 값보다 조금 높게 나옵니다.
 */
export function adviseSystem(input: PaInput): SystemAdvice {
  const { venue, speaker } = input;
  const g = genreInfo(input.genre);
  const backM = Math.max(FRONT_ROW_M, venue.stageToBackM);
  const reasons: string[] = [];

  const line = venue.capacity >= LINE_ARRAY_CAPACITY || backM >= LINE_ARRAY_DEPTH_M;
  reasons.push(
    line
      ? `수용 ${venue.capacity}명, 맨 뒤 ${r1(backM)}m라서 라인 어레이를 권합니다` +
        ` (${LINE_ARRAY_CAPACITY}명 또는 ${LINE_ARRAY_DEPTH_M}m 이상 기준).`
      : `수용 ${venue.capacity}명, 맨 뒤 ${r1(backM)}m라서 포인트 소스 좌우 배치로 충분합니다.`,
  );

  // 한 대로 객석 맨 뒤에서 나오는 음압을 먼저 구하고, 목표에 모자라는 만큼
  // 대수를 올립니다. 같은 소리 두 배는 +3dB입니다.
  const oneAtBack = splAtDistance(speaker.sensitivityDb, speaker.powerW, backM);
  const shortfall = g.targetSplDb - oneAtBack;
  const needed = shortfall <= 0 ? 1 : Math.ceil(Math.pow(10, shortfall / 10));
  const perSide = Math.max(1, Math.min(MAX_MAIN_PER_SIDE, needed));
  const mainCount = perSide * 2;

  const gain = stackGainDb(perSide);
  const backSplDb = oneAtBack + gain;
  const frontSplDb =
    splAtDistance(speaker.sensitivityDb, speaker.powerW, FRONT_ROW_M) + gain;
  const meetsTarget = backSplDb >= g.targetSplDb;

  reasons.push(
    perSide === 1
      ? `한 대가 ${r1(backM)}m에서 ${r1(oneAtBack)}dB이고 목표는 ${g.targetSplDb}dB이므로` +
        ` 좌우 한 대씩 ${mainCount}대로 충분합니다.`
      : `한 대가 ${r1(backM)}m에서 ${r1(oneAtBack)}dB이고 목표는 ${g.targetSplDb}dB이므로` +
        ` 한쪽 ${perSide}대(합계 ${mainCount}대)를 쌓아 ${r1(gain)}dB를 더합니다.`,
  );
  if (!meetsTarget) {
    reasons.push(
      `한쪽 ${MAX_MAIN_PER_SIDE}대까지 올려도 목표 음압에 ${r1(g.targetSplDb - backSplDb)}dB` +
        ` 모자랍니다. 더 큰 스피커나 딜레이 스피커가 필요합니다.`,
    );
  }
  if (frontSplDb > speaker.maxSplDb) {
    reasons.push(
      `맨 앞 예상 음압이 스피커 최대 음압(${speaker.maxSplDb}dB)을 넘습니다.` +
        ` 스피커를 객석에서 더 띄우거나 각도를 내려야 합니다.`,
    );
  }

  const subCount = g.subsPerSide * 2;
  reasons.push(
    subCount === 0
      ? `${g.name}는 저음 보강이 필요 없어 서브우퍼를 두지 않습니다.`
      : `${g.name}라서 서브우퍼를 한쪽 ${g.subsPerSide}대씩 ${subCount}대 둡니다.`,
  );

  const delayNeeded = backM >= DELAY_SPEAKER_DEPTH_M || !meetsTarget;
  const delayDistanceM = delayNeeded ? Math.round(backM / 2) : 0;
  const ms = delayNeeded ? alignDelayMs(delayDistanceM, venue.tempC) : 0;
  if (delayNeeded) {
    reasons.push(
      `무대 앞에서 ${delayDistanceM}m 지점에 딜레이 스피커를 두고` +
        ` ${r1(ms)}ms 늦춥니다 (기온 ${venue.tempC}°C의 음속 기준, 하스 여유 10ms 포함).`,
    );
  }

  const monitorMixes = monitorMixCount(input.lineup);
  reasons.push(`보컬과 모니터가 필요한 자리를 세어 모니터 믹스 ${monitorMixes}개입니다.`);

  return {
    mainKind: line ? "line" : "point",
    mainPerSide: perSide,
    mainCount,
    subCount,
    frontSplDb,
    backSplDb,
    targetSplDb: g.targetSplDb,
    meetsTarget,
    delayNeeded,
    delayDistanceM,
    delayMs: ms,
    monitorMixes,
    reasons,
  };
}

/** PA 장비의 대표 소비 전력(W). 정격 출력이 아니라 공연 중 평균 소비입니다. */
export const PA_WATTS = {
  /** 액티브 스피커는 정격 출력의 35%쯤을 꾸준히 먹습니다. */
  speakerDuty: 0.35,
  sub: 400,
  monitor: 150,
  mixer: 150,
} as const;

export interface PowerPlan {
  backlineW: number;
  paW: number;
  totalW: number;
  totalA: number;
  capacityA: number;
  circuitsNeeded: number;
  perCircuitA: number;
  ok: boolean;
  warnings: string[];
}

/**
 * 전원 합계와 회로 배분. I = ΣP / V 이고 회로 하나의 여유는 80%만 씁니다.
 * 꾸준히 쓰는 부하는 회로 용량의 80%까지만 거는 것이 일반적인 기준입니다.
 */
export const CIRCUIT_SAFETY = 0.8;

export function planPower(input: PaInput, advice: SystemAdvice): PowerPlan {
  const { venue } = input;
  const warnings: string[] = [];

  const backlineW = backlineWatts(input.lineup);
  const paW =
    advice.mainCount * input.speaker.powerW * PA_WATTS.speakerDuty +
    advice.subCount * PA_WATTS.sub +
    advice.monitorMixes * PA_WATTS.monitor +
    PA_WATTS.mixer;

  const totalW = backlineW + paW;
  const totalA = currentA(totalW, venue.power.voltage);
  const perCircuitSafeA = venue.power.ampsPerCircuit * CIRCUIT_SAFETY;
  const capacityA = venue.power.circuits * perCircuitSafeA;
  const circuitsNeeded = perCircuitSafeA > 0 ? Math.ceil(totalA / perCircuitSafeA) : 0;
  const perCircuitA = venue.power.circuits > 0 ? totalA / venue.power.circuits : 0;
  const ok = totalA <= capacityA;

  if (!ok) {
    warnings.push(
      `합계 ${r1(totalA)}A는 쓸 수 있는 ${r1(capacityA)}A를 넘습니다.` +
        ` 회로가 ${circuitsNeeded}개 필요합니다.`,
    );
  }
  if (backlineW > 0 && paW > 0) {
    warnings.push("무대 백라인과 PA는 서로 다른 회로에 나누어 소음을 줄입니다.");
  }

  return {
    backlineW,
    paW,
    totalW,
    totalA,
    capacityA,
    circuitsNeeded,
    perCircuitA,
    ok,
    warnings,
  };
}

/** 화면에 늘 함께 보여 주는 가정과 한계(SPEC 8.4). */
export const PA_ASSUMPTIONS = [
  "직접음만 계산합니다. 반사·간섭·잔향과 실내 음향은 넣지 않습니다.",
  "공기 흡수와 지향각에 따른 감쇠는 단순하게만 다룹니다.",
  "제조사 데이터를 내장하지 않습니다. 넣은 제원이 틀리면 결과도 틀립니다.",
  "전문 음향 시뮬레이터를 대신하지 않습니다. 현장에서 확인해야 합니다.",
  `객석 첫 줄은 무대 앞에서 ${FRONT_ROW_M}m로 가정합니다.`,
  "전원은 회로 용량의 80%까지만 쓰는 것으로 계산합니다.",
];
