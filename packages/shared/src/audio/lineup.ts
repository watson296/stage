// 편성(어떤 악기가 몇 개인지)과 거기서 나오는 입력 채널·전원 소비를 정의합니다.
// 값은 일반적인 소규모 공연 기준의 대표값이고, 제조사 데이터가 아닙니다(SPEC 8.4).

export const GENRE_IDS = ["acoustic", "band", "rock", "electronic"] as const;
export type Genre = (typeof GENRE_IDS)[number];

export function isGenre(v: unknown): v is Genre {
  return typeof v === "string" && (GENRE_IDS as readonly string[]).includes(v);
}

export interface GenreInfo {
  id: Genre;
  name: string;
  /** 서브우퍼를 쓰는 비율. 저음이 중요한 장르일수록 큽니다. */
  subsPerSide: number;
  /** 객석에서 목표로 삼는 평균 음압(dB SPL A). 조언의 기준값입니다. */
  targetSplDb: number;
}

export const GENRES: GenreInfo[] = [
  { id: "acoustic", name: "어쿠스틱", subsPerSide: 0, targetSplDb: 95 },
  { id: "band", name: "밴드", subsPerSide: 1, targetSplDb: 100 },
  { id: "rock", name: "록", subsPerSide: 1, targetSplDb: 103 },
  { id: "electronic", name: "전자음악", subsPerSide: 2, targetSplDb: 103 },
];

export function genreInfo(id: Genre): GenreInfo {
  return GENRES.find((g) => g.id === id) ?? GENRES[1];
}

/** 입력 채널 하나. 믹서 채널 리스트 초안의 한 줄이 됩니다. */
export interface InputSpec {
  /** 소스 이름. "킥", "일렉 기타 1" 처럼 악기 번호가 붙습니다. */
  source: string;
  /** 마이크 또는 입력 방식. */
  mic: string;
  /** 스탠드 종류. 필요 없으면 빈 문자열입니다. */
  stand: string;
}

export interface InstrumentInfo {
  id: string;
  name: string;
  /** 악기 하나가 차지하는 입력들. */
  inputs: InputSpec[];
  /** 전원 계산에 쓰는 대표 소비 전력(W). 전원을 쓰지 않으면 0입니다. */
  watts: number;
  /** 모니터 믹스를 따로 받는 자리인지. */
  needsMonitor: boolean;
  /** 도면에 배치 초안을 넣을 때 쓰는 장비 키(6장). 없으면 넣지 않습니다. */
  equipType?: string;
}

const SHORT_BOOM = "짧은 붐 스탠드";
const TALL_BOOM = "긴 붐 스탠드";

export const INSTRUMENTS: InstrumentInfo[] = [
  {
    id: "drums",
    name: "드럼",
    watts: 0,
    needsMonitor: true,
    equipType: "drumkit",
    inputs: [
      { source: "킥", mic: "다이내믹(킥용)", stand: SHORT_BOOM },
      { source: "스네어", mic: "다이내믹", stand: SHORT_BOOM },
      { source: "하이햇", mic: "콘덴서(소구경)", stand: SHORT_BOOM },
      { source: "탐", mic: "다이내믹", stand: "림 클램프" },
      { source: "오버헤드 L", mic: "콘덴서(소구경)", stand: TALL_BOOM },
      { source: "오버헤드 R", mic: "콘덴서(소구경)", stand: TALL_BOOM },
    ],
  },
  {
    id: "eguitar",
    name: "일렉 기타",
    watts: 200,
    needsMonitor: true,
    equipType: "guitarAmp",
    inputs: [{ source: "일렉 기타", mic: "다이내믹(앰프 앞)", stand: SHORT_BOOM }],
  },
  {
    id: "bass",
    name: "베이스",
    watts: 400,
    needsMonitor: true,
    equipType: "bassAmp",
    inputs: [{ source: "베이스", mic: "DI 박스", stand: "" }],
  },
  {
    id: "keys",
    name: "키보드",
    watts: 60,
    needsMonitor: true,
    equipType: "keyboard",
    inputs: [
      { source: "키보드 L", mic: "DI 박스", stand: "" },
      { source: "키보드 R", mic: "DI 박스", stand: "" },
    ],
  },
  {
    id: "aguitar",
    name: "어쿠스틱 기타",
    watts: 0,
    needsMonitor: true,
    equipType: "guitarStand",
    inputs: [{ source: "어쿠스틱 기타", mic: "DI 박스", stand: "" }],
  },
  {
    id: "perc",
    name: "퍼커션",
    watts: 0,
    needsMonitor: true,
    inputs: [{ source: "퍼커션", mic: "콘덴서(소구경)", stand: TALL_BOOM }],
  },
  {
    id: "horn",
    name: "관악기",
    watts: 0,
    needsMonitor: true,
    inputs: [{ source: "관악기", mic: "다이내믹", stand: TALL_BOOM }],
  },
  {
    id: "strings",
    name: "현악기",
    watts: 0,
    needsMonitor: true,
    inputs: [{ source: "현악기", mic: "콘덴서(소구경)", stand: TALL_BOOM }],
  },
  {
    id: "playback",
    name: "플레이백·트랙",
    watts: 100,
    needsMonitor: false,
    inputs: [
      { source: "플레이백 L", mic: "DI 박스", stand: "" },
      { source: "플레이백 R", mic: "DI 박스", stand: "" },
    ],
  },
  {
    id: "dj",
    name: "DJ·신시사이저",
    watts: 300,
    needsMonitor: true,
    inputs: [
      { source: "DJ L", mic: "DI 박스", stand: "" },
      { source: "DJ R", mic: "DI 박스", stand: "" },
    ],
  },
];

export function instrumentInfo(id: string): InstrumentInfo | null {
  return INSTRUMENTS.find((i) => i.id === id) ?? null;
}

/** 편성 한 줄. 악기 종류와 개수입니다. */
export interface LineupEntry {
  instrumentId: string;
  count: number;
}

export interface Lineup {
  /** 보컬 마이크 수. 각각 채널 하나와 모니터 믹스 하나를 씁니다. */
  vocals: number;
  entries: LineupEntry[];
}

export const EMPTY_LINEUP: Lineup = { vocals: 0, entries: [] };

/** 보컬 입력. 악기와 달리 수만 받으므로 따로 만듭니다. */
export const VOCAL_INPUT: InputSpec = {
  source: "보컬",
  mic: "다이내믹(보컬용)",
  stand: "붐 스탠드",
};
