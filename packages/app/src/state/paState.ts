// PA 조언 화면의 상태. 계산은 shared/audio의 순수 함수가 하고 여기서는
// 문서를 고치고 결과를 모아 줍니다.

import { signal } from "@preact/signals";
import {
  EQUIPMENT,
  adviseSystem,
  buildChannelList,
  checkMixer,
  planPower,
  shapeBounds,
  summarizeGear,
  type Event,
  type PaInput,
  type PaSetup,
  type SpeakerSpec,
  type StageObject,
  type StagePlan,
  type Venue,
  type Genre,
} from "@stage-planner/shared";
import { store, currentEvent, currentPlan, fitAfterRebuild, screen, selection, toast } from "./appState";
import { loadPresets } from "./presets";

export const presets = signal(loadPresets());

export function pa(): PaSetup {
  return currentEvent().pa;
}

export function venue(): Venue {
  return currentEvent().venue;
}

export function paInput(): PaInput {
  const p = pa();
  return {
    venue: venue(),
    genre: p.genre,
    lineup: p.lineup,
    speaker: p.speaker,
    mixerChannels: p.mixerChannels,
  };
}

/** 화면이 쓰는 결과 묶음. 입력이 바뀔 때마다 다시 계산합니다. */
export function paResult() {
  const input = paInput();
  const system = adviseSystem(input);
  const channels = buildChannelList(input.lineup);
  return {
    input,
    system,
    channels,
    mixer: checkMixer(channels, input.mixerChannels),
    gear: summarizeGear(channels),
    power: planPower(input, system),
  };
}

// ── 입력 고치기 ──────────────────────────────────────────────────────────────
function editPa(fn: (p: PaSetup) => void): void {
  store.mutate((doc: Event) => fn(doc.pa));
}

export function setGenre(g: Genre): void {
  store.commit((doc: Event) => {
    doc.pa.genre = g;
  });
}

export function setVocals(n: number): void {
  editPa((p) => {
    p.lineup = { ...p.lineup, vocals: Math.max(0, Math.round(n)) };
  });
}

/** 악기 수를 고칩니다. 0이면 편성에서 뺍니다. */
export function setInstrumentCount(instrumentId: string, count: number): void {
  const n = Math.max(0, Math.round(count));
  editPa((p) => {
    const entries = p.lineup.entries.filter((e) => e.instrumentId !== instrumentId);
    if (n > 0) entries.push({ instrumentId, count: n });
    p.lineup = { ...p.lineup, entries };
  });
}

export function instrumentCount(instrumentId: string): number {
  return pa().lineup.entries.find((e) => e.instrumentId === instrumentId)?.count ?? 0;
}

export function setMixerChannels(n: number): void {
  editPa((p) => {
    p.mixerChannels = Math.max(0, Math.round(n));
  });
}

export function setSpeakerField(key: keyof SpeakerSpec, value: number): void {
  editPa((p) => {
    p.speaker = { ...p.speaker, [key]: value };
  });
}

export function setSpeakerName(name: string): void {
  editPa((p) => {
    p.speakerName = name;
  });
}

export function applySpeakerSpec(name: string, spec: SpeakerSpec): void {
  store.commit((doc: Event) => {
    doc.pa.speakerName = name;
    doc.pa.speaker = { ...spec };
  });
}

export function setVenueField(key: keyof Omit<Venue, "power">, value: number | string | boolean): void {
  store.mutate((doc: Event) => {
    (doc.venue as unknown as Record<string, unknown>)[key] = value;
  });
}

export function setPowerField(key: keyof Venue["power"], value: number): void {
  store.mutate((doc: Event) => {
    doc.venue.power = { ...doc.venue.power, [key]: Math.max(0, value) };
  });
}

// ── 배치 초안 ────────────────────────────────────────────────────────────────
const SIDE_GAP_M = 1.0;
const FRONT_GAP_M = 0.5;
const MONITOR_INSET_M = 0.8;

function makeObject(
  id: string,
  type: string,
  variantId: string,
  cx: number,
  cy: number,
  onStage: boolean,
  rot = 0,
  label = "",
): StageObject | null {
  const v = EQUIPMENT[type]?.variants.find((x) => x.id === variantId);
  if (!v) return null;
  return {
    id,
    type,
    variantId: v.id,
    x: cx - v.w / 2,
    y: cy - v.d / 2,
    w: v.w,
    d: v.d,
    h: v.h,
    z: 0,
    rot,
    label,
    onStage,
  };
}

/**
 * 조언 결과를 지금 배치도에 넣습니다. 기존 배치를 지우지 않고 더하기만 하며,
 * 한 번에 커밋해 되돌리기 한 단계로 취소됩니다(SPEC 8.5).
 * 객석은 +y(화면 아래) 쪽으로 보고 놓습니다.
 */
export function applyDraftToPlan(): void {
  const { system } = paResult();
  const plan: StagePlan = currentPlan();
  const b = shapeBounds(plan.stage);
  const mainKind = system.mainKind === "line" ? "line" : "s15";
  const added: StageObject[] = [];
  let seq = 0;
  const id = (): string => `pa-${Date.now().toString(36)}-${++seq}`;

  for (const side of [-1, 1] as const) {
    const baseX = side < 0 ? b.minX - SIDE_GAP_M : b.maxX + SIDE_GAP_M;
    for (let i = 0; i < system.mainPerSide; i++) {
      const o = makeObject(
        id(), "mainSpeaker", mainKind,
        baseX, b.maxY + FRONT_GAP_M + i * 0.9, false, 0,
        side < 0 ? "메인 L" : "메인 R",
      );
      if (o) added.push(o);
    }
  }

  for (let i = 0; i < system.subCount; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const nth = Math.floor(i / 2);
    const x = side < 0 ? b.minX + 0.4 - nth * 0.8 : b.maxX - 0.4 + nth * 0.8;
    const o = makeObject(id(), "subwoofer", "s18", x, b.maxY + FRONT_GAP_M, false, 0, "서브");
    if (o) added.push(o);
  }

  // 모니터는 무대 앞쪽에 고르게 두고 연주자를 향하도록 돌립니다.
  const span = b.maxX - b.minX;
  for (let i = 0; i < system.monitorMixes; i++) {
    const t = (i + 1) / (system.monitorMixes + 1);
    const o = makeObject(
      id(), "monitor", "w12",
      b.minX + span * t, b.maxY - MONITOR_INSET_M, true, 180, `모니터 ${i + 1}`,
    );
    if (o) added.push(o);
  }

  const fohY = b.maxY + Math.max(4, venue().stageToBackM * 0.8);
  const foh = makeObject(
    id(), "mixer", "foh", (b.minX + b.maxX) / 2, fohY, false, 180, "FOH",
  );
  if (foh) added.push(foh);

  if (!added.length) {
    toast("넣을 장비가 없습니다.", true);
    return;
  }

  const planId = plan.id;
  store.commit((doc: Event) => {
    const p = doc.stagePlans.find((x) => x.id === planId) ?? doc.stagePlans[0];
    p.objects.push(...added);
    p.rev++;
  });
  selection.value = null;
  // FOH처럼 무대에서 멀리 떨어진 장비가 생기므로 화면을 한 번 맞춥니다.
  fitAfterRebuild();
  screen.value = "stage";
  toast(`배치 초안 ${added.length}개를 넣었습니다. 되돌리기로 취소할 수 있습니다.`);
}
