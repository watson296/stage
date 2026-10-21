// 편성에서 입력 채널 리스트 초안을 만듭니다. 순서는 콘솔에서 흔히 쓰는 순서
// (드럼 → 베이스 → 기타 → 키보드 → 그 밖의 악기 → 플레이백 → 보컬)입니다.

import {
  INSTRUMENTS,
  VOCAL_INPUT,
  instrumentInfo,
  type InputSpec,
  type Lineup,
} from "./lineup";

export interface ChannelRow {
  no: number;
  source: string;
  mic: string;
  stand: string;
}

/** 콘솔 입력 순서. 여기에 없는 악기는 뒤에 정의 순서대로 붙습니다. */
const ORDER = [
  "drums",
  "bass",
  "eguitar",
  "aguitar",
  "keys",
  "perc",
  "horn",
  "strings",
  "dj",
  "playback",
];

function orderIndex(id: string): number {
  const i = ORDER.indexOf(id);
  return i < 0 ? ORDER.length + INSTRUMENTS.findIndex((x) => x.id === id) : i;
}

/** 같은 악기가 여럿이면 소스 이름 뒤에 번호를 붙입니다. */
function numbered(input: InputSpec, nth: number, total: number): InputSpec {
  if (total <= 1) return input;
  return { ...input, source: `${input.source} ${nth}` };
}

export function buildChannelList(lineup: Lineup): ChannelRow[] {
  const rows: ChannelRow[] = [];
  const push = (i: InputSpec): void => {
    rows.push({ no: rows.length + 1, source: i.source, mic: i.mic, stand: i.stand });
  };

  const entries = lineup.entries
    .filter((e) => e.count > 0 && instrumentInfo(e.instrumentId))
    .slice()
    .sort((a, b) => orderIndex(a.instrumentId) - orderIndex(b.instrumentId));

  for (const e of entries) {
    const info = instrumentInfo(e.instrumentId);
    if (!info) continue;
    for (let n = 1; n <= e.count; n++) {
      for (const input of info.inputs) push(numbered(input, n, e.count));
    }
  }

  for (let n = 1; n <= lineup.vocals; n++) {
    push(numbered(VOCAL_INPUT, n, lineup.vocals));
  }

  return rows;
}

export interface MixerCheck {
  needed: number;
  available: number;
  ok: boolean;
  shortBy: number;
}

export function checkMixer(rows: ChannelRow[], availableChannels: number): MixerCheck {
  const needed = rows.length;
  const shortBy = Math.max(0, needed - availableChannels);
  return { needed, available: availableChannels, ok: shortBy === 0, shortBy };
}

export interface GearCount {
  name: string;
  count: number;
}

/** 채널 리스트에서 필요한 마이크·스탠드·DI 수를 셉니다. 준비물 확인용입니다. */
export function summarizeGear(rows: ChannelRow[]): { mics: GearCount[]; stands: GearCount[] } {
  const tally = (vals: string[]): GearCount[] => {
    const m = new Map<string, number>();
    for (const v of vals) {
      if (!v) continue;
      m.set(v, (m.get(v) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko"));
  };
  return {
    mics: tally(rows.map((r) => r.mic)),
    stands: tally(rows.map((r) => r.stand)),
  };
}

/** 모니터 믹스 수. 보컬마다 하나, 모니터가 필요한 악기 자리마다 하나입니다. */
export const MAX_MONITOR_MIXES = 8;

export function monitorMixCount(lineup: Lineup): number {
  let n = lineup.vocals;
  for (const e of lineup.entries) {
    const info = instrumentInfo(e.instrumentId);
    if (info?.needsMonitor) n += Math.max(0, e.count);
  }
  return Math.max(1, Math.min(MAX_MONITOR_MIXES, n));
}

/** 편성이 쓰는 무대 위 전원 합계(W). 백라인만이며 PA 전원은 따로 더합니다. */
export function backlineWatts(lineup: Lineup): number {
  let w = 0;
  for (const e of lineup.entries) {
    const info = instrumentInfo(e.instrumentId);
    if (info) w += info.watts * Math.max(0, e.count);
  }
  return w;
}
