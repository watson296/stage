// 음향 기본 계산. 모두 순수 함수이고 SPEC 8.3의 공식을 그대로 씁니다.
// 직접음만 다룹니다. 반사·간섭·잔향·실내 음향은 넣지 않습니다(SPEC 8.4).

/** 기준 거리 1m. 스피커 감도의 기준입니다. */
export const REF_DISTANCE_M = 1;

/** 음속(m/s). c = 331.3 + 0.606 × T(°C) */
export function speedOfSound(tempC: number): number {
  return 331.3 + 0.606 * tempC;
}

/** 거리 d(m)를 소리가 지나는 시간(초). 딜레이 스피커 정렬에 씁니다. */
export function delaySeconds(distanceM: number, tempC: number): number {
  return distanceM / speedOfSound(tempC);
}

export function delayMs(distanceM: number, tempC: number): number {
  return delaySeconds(distanceM, tempC) * 1000;
}

/**
 * 거리가 d1에서 d2로 멀어질 때의 음압 변화(dB). 멀어지면 음수입니다.
 * ΔSPL = 20 × log10(d2 / d1) 의 부호를 뒤집은 값입니다.
 */
export function distanceLossDb(d1: number, d2: number): number {
  if (d1 <= 0 || d2 <= 0) return 0;
  return -20 * Math.log10(d2 / d1);
}

/** 스피커 한 대가 거리 d에서 내는 음압. SPL = 감도 + 10log10(W) − 20log10(d) */
export function splAtDistance(
  sensitivityDb: number,
  watts: number,
  distanceM: number,
): number {
  if (watts <= 0 || distanceM <= 0) return 0;
  return sensitivityDb + 10 * Math.log10(watts) - 20 * Math.log10(distanceM);
}

/**
 * 서로 간섭하지 않는 음원들의 합(dB). L = 10 × log10(Σ 10^(Li/10))
 * 같은 크기 둘이면 +3dB입니다.
 */
export function sumLevelsDb(levels: number[]): number {
  const sum = levels.reduce((a, L) => a + Math.pow(10, L / 10), 0);
  return sum <= 0 ? 0 : 10 * Math.log10(sum);
}

/** 같은 음압 n개를 합쳤을 때의 증가분(dB). n이 두 배면 +3dB입니다. */
export function stackGainDb(count: number): number {
  return count <= 0 ? 0 : 10 * Math.log10(count);
}

/** 0dBu = 0.7746V 기준. dBV = dBu + 20log10(0.7746) ≈ dBu − 2.21 */
export const DBU_TO_DBV_OFFSET = 20 * Math.log10(0.7746);

export function dbuToDbv(dbu: number): number {
  return dbu + DBU_TO_DBV_OFFSET;
}

export function dbvToDbu(dbv: number): number {
  return dbv - DBU_TO_DBV_OFFSET;
}

/** 전류(A) = 합계 전력(W) / 전압(V) */
export function currentA(totalW: number, voltage: number): number {
  return voltage <= 0 ? 0 : totalW / voltage;
}

/**
 * 메인 스피커에서 d만큼 떨어진 딜레이 스피커의 정렬 지연(ms).
 * 소리가 그 거리를 지나는 시간에 하스 효과용 여유를 더합니다. 여유를 두면
 * 소리의 방향이 앞(메인) 쪽으로 남습니다.
 */
export const HAAS_OFFSET_MS = 10;

export function alignDelayMs(
  mainToDelayM: number,
  tempC: number,
  haasMs: number = HAAS_OFFSET_MS,
): number {
  return delayMs(mainToDelayM, tempC) + haasMs;
}
