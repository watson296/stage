// 스피커 제원. 제조사 데이터를 내장하지 않고 사용자가 넣습니다(SPEC 8.1).

export interface SpeakerSpec {
  /** 감도 dB @1W/1m */
  sensitivityDb: number;
  maxSplDb: number;
  /** 수평·수직 지향각(도) */
  dispersionH: number;
  dispersionV: number;
  /** 정격 출력(W) */
  powerW: number;
}

/** 제원을 모를 때 출발점으로 쓰는 일반적인 12~15인치 액티브 스피커의 값입니다. */
export const DEFAULT_SPEAKER: SpeakerSpec = {
  sensitivityDb: 97,
  maxSplDb: 126,
  dispersionH: 90,
  dispersionV: 60,
  powerW: 500,
};
