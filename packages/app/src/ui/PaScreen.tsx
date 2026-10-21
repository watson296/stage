import {
  GENRES,
  INSTRUMENTS,
  PA_ASSUMPTIONS,
  type SpeakerSpec,
  type Genre,
} from "@stage-planner/shared";
import * as S from "../state/appState";
import * as P from "../state/paState";
import { addPreset, presetSpec, removePreset } from "../state/presets";

/** 숫자 입력 한 칸. 고치는 동안을 되돌리기 한 단계로 묶습니다. */
function numHandlers(apply: (v: number) => void) {
  let dirty = false;
  return {
    onFocus: () => {
      S.store.beginTxn();
      dirty = false;
    },
    onInput: (e: Event) => {
      const v = parseFloat((e.target as HTMLInputElement).value);
      if (Number.isFinite(v)) {
        dirty = true;
        apply(v);
      }
    },
    onBlur: () => {
      if (dirty) S.store.commitTxn();
      else S.store.cancelTxn();
      dirty = false;
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
    },
  };
}

function Num(props: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  id?: string;
  onNum: (v: number) => void;
}) {
  return (
    <label class="pa-num">
      <span>{props.label}{props.unit ? ` (${props.unit})` : ""}</span>
      <input class="inp" type="number" id={props.id} value={props.value}
        min={props.min} max={props.max} step={props.step ?? 1}
        {...numHandlers(props.onNum)} />
    </label>
  );
}

function r1(v: number): number {
  return Math.round(v * 10) / 10;
}

function VenueCard() {
  const v = P.venue();
  return (
    <section class="card">
      <h2>공연장</h2>
      <label class="pa-num wide">
        <span>이름</span>
        <input class="inp" type="text" id="venueName" value={v.name} placeholder="예: 부산 소극장"
          onInput={(e) => P.setVenueField("name", (e.target as HTMLInputElement).value)} />
      </label>
      <div class="pa-grid">
        <Num label="가로" unit="m" value={v.widthM} min={1} max={500} step={0.5}
          onNum={(n) => P.setVenueField("widthM", n)} />
        <Num label="깊이" unit="m" value={v.depthM} min={1} max={500} step={0.5}
          onNum={(n) => P.setVenueField("depthM", n)} />
        <Num label="천장 높이" unit="m" value={v.ceilingM} min={1} max={100} step={0.5}
          onNum={(n) => P.setVenueField("ceilingM", n)} />
        <Num label="수용 인원" unit="명" value={v.capacity} min={0} max={100000} step={10}
          id="capacity" onNum={(n) => P.setVenueField("capacity", n)} />
        <Num label="맨 뒤까지" unit="m" value={v.stageToBackM} min={1} max={500} step={0.5}
          id="stageToBack" onNum={(n) => P.setVenueField("stageToBackM", n)} />
        <Num label="기온" unit="°C" value={v.tempC} min={-40} max={60} step={1}
          id="tempC" onNum={(n) => P.setVenueField("tempC", n)} />
      </div>
      <label class="pa-check">
        <input type="checkbox" id="indoor" checked={v.indoor}
          onChange={(e) => P.setVenueField("indoor", (e.target as HTMLInputElement).checked)} />
        실내
      </label>
      <h3>전원</h3>
      <div class="pa-grid">
        <Num label="회로 수" value={v.power.circuits} min={0} max={1000} step={1}
          id="circuits" onNum={(n) => P.setPowerField("circuits", n)} />
        <Num label="회로당" unit="A" value={v.power.ampsPerCircuit} min={1} max={200} step={1}
          onNum={(n) => P.setPowerField("ampsPerCircuit", n)} />
        <Num label="전압" unit="V" value={v.power.voltage} min={100} max={400} step={10}
          onNum={(n) => P.setPowerField("voltage", n)} />
      </div>
    </section>
  );
}

function LineupCard() {
  const p = P.pa();
  return (
    <section class="card">
      <h2>편성</h2>
      <div class="pa-grid">
        <label class="pa-num">
          <span>장르</span>
          <select class="inp" id="genre" value={p.genre}
            onChange={(e) => P.setGenre((e.target as HTMLSelectElement).value as Genre)}>
            {GENRES.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <Num label="보컬" unit="명" value={p.lineup.vocals} min={0} max={64} step={1}
          id="vocals" onNum={P.setVocals} />
        <Num label="믹서 채널" value={p.mixerChannels} min={0} max={512} step={1}
          id="mixerCh" onNum={P.setMixerChannels} />
      </div>
      <div class="pa-grid">
        {INSTRUMENTS.map((i) => (
          <Num key={i.id} label={i.name} value={P.instrumentCount(i.id)} min={0} max={64} step={1}
            id={`inst-${i.id}`} onNum={(n) => P.setInstrumentCount(i.id, n)} />
        ))}
      </div>
    </section>
  );
}

function SpeakerCard() {
  const p = P.pa();
  const list = P.presets.value;
  const spec = p.speaker;
  const set = (k: keyof SpeakerSpec) => (n: number) => P.setSpeakerField(k, n);

  const save = (): void => {
    const name = p.speakerName.trim();
    if (!name) {
      S.toast("프리셋 이름을 먼저 적어 주세요.", true);
      return;
    }
    P.presets.value = addPreset(name, spec);
    S.toast(`${name} 제원을 이 기기에 저장했습니다.`);
  };

  return (
    <section class="card">
      <h2>스피커 제원</h2>
      <p class="muted">제조사 데이터를 내장하지 않습니다. 쓰는 스피커의 제원을 넣어 주세요.</p>
      <div class="pa-row">
        <label class="pa-num wide">
          <span>이름</span>
          <input class="inp" type="text" id="spName" value={p.speakerName}
            placeholder="예: 메인 15인치"
            onInput={(e) => P.setSpeakerName((e.target as HTMLInputElement).value)} />
        </label>
        <button class="btn" id="btnSavePreset" onClick={save}>프리셋 저장</button>
      </div>
      {list.length > 0 && (
        <div class="pa-row">
          <label class="pa-num wide">
            <span>저장한 프리셋</span>
            <select class="inp" id="presetSel" value=""
              onChange={(e) => {
                const sel = e.target as HTMLSelectElement;
                const found = list.find((x) => x.id === sel.value);
                if (found) {
                  P.applySpeakerSpec(found.name, presetSpec(found));
                  S.toast(`${found.name} 제원을 넣었습니다.`);
                }
                sel.value = "";
              }}>
              <option value="">고르기</option>
              {list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <button class="btn btn-danger" onClick={() => {
            const found = list.find((x) => x.name === p.speakerName);
            if (!found) {
              S.toast("지울 프리셋을 이름으로 찾지 못했습니다.", true);
              return;
            }
            P.presets.value = removePreset(found.id);
            S.toast(`${found.name} 프리셋을 지웠습니다.`);
          }}>프리셋 삭제</button>
        </div>
      )}
      <div class="pa-grid">
        <Num label="감도" unit="dB@1W/1m" value={spec.sensitivityDb} min={60} max={130} step={0.5}
          id="spSens" onNum={set("sensitivityDb")} />
        <Num label="최대 음압" unit="dB" value={spec.maxSplDb} min={60} max={160} step={1}
          onNum={set("maxSplDb")} />
        <Num label="정격 출력" unit="W" value={spec.powerW} min={1} max={100000} step={50}
          id="spPower" onNum={set("powerW")} />
        <Num label="수평 지향각" unit="°" value={spec.dispersionH} min={1} max={360} step={5}
          onNum={set("dispersionH")} />
        <Num label="수직 지향각" unit="°" value={spec.dispersionV} min={1} max={360} step={5}
          onNum={set("dispersionV")} />
      </div>
    </section>
  );
}

function SystemCard() {
  const { system } = P.paResult();
  return (
    <section class="card">
      <h2>시스템 구성</h2>
      <dl class="pa-facts">
        <div><dt>메인 스피커</dt><dd id="outMain">
          {system.mainKind === "line" ? "라인 어레이" : "포인트 소스"} {system.mainCount}대
          (한쪽 {system.mainPerSide}대)
        </dd></div>
        <div><dt>서브우퍼</dt><dd id="outSub">{system.subCount}대</dd></div>
        <div><dt>모니터 믹스</dt><dd id="outMon">{system.monitorMixes}개</dd></div>
        <div><dt>맨 앞 음압</dt><dd id="outFront">{r1(system.frontSplDb)} dB</dd></div>
        <div><dt>맨 뒤 음압</dt><dd id="outBack">
          {r1(system.backSplDb)} dB <span class="muted">/ 목표 {system.targetSplDb} dB</span>
        </dd></div>
        <div><dt>딜레이 스피커</dt><dd id="outDelay">
          {system.delayNeeded
            ? `${system.delayDistanceM}m 지점, ${r1(system.delayMs)}ms 지연`
            : "필요하지 않습니다"}
        </dd></div>
      </dl>
      <h3>근거</h3>
      <ul class="pa-notes">
        {system.reasons.map((r) => <li key={r}>{r}</li>)}
      </ul>
      <button class="btn btn-accent" id="btnDraft" onClick={P.applyDraftToPlan}>
        배치 초안 넣기
      </button>
    </section>
  );
}

function ChannelCard() {
  const { channels, mixer, gear } = P.paResult();
  return (
    <section class="card">
      <h2>입력 채널 초안</h2>
      <p class={mixer.ok ? "pa-ok" : "pa-warn"} id="mixerCheck">
        {mixer.ok
          ? `채널 ${mixer.needed}개가 필요하고 믹서에 ${mixer.available}개가 있습니다.`
          : `채널이 ${mixer.shortBy}개 모자랍니다. ${mixer.needed}개가 필요한데 믹서는 ${mixer.available}개입니다.`}
      </p>
      {channels.length === 0 ? (
        <p class="muted">편성을 넣으면 채널 리스트를 만듭니다.</p>
      ) : (
        <table class="pa-table" id="chTable">
          <thead>
            <tr><th>번호</th><th>소스</th><th>마이크·입력</th><th>스탠드</th></tr>
          </thead>
          <tbody>
            {channels.map((c) => (
              <tr key={c.no}>
                <td class="num">{c.no}</td>
                <td>{c.source}</td>
                <td>{c.mic}</td>
                <td>{c.stand || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {channels.length > 0 && (
        <>
          <h3>준비물 합계</h3>
          <ul class="pa-notes">
            {gear.mics.map((m) => <li key={`m-${m.name}`}>{m.name} {m.count}개</li>)}
            {gear.stands.map((s) => <li key={`s-${s.name}`}>{s.name} {s.count}개</li>)}
          </ul>
        </>
      )}
    </section>
  );
}

function PowerCard() {
  const { power } = P.paResult();
  return (
    <section class="card">
      <h2>전원 점검</h2>
      <dl class="pa-facts">
        <div><dt>백라인</dt><dd>{Math.round(power.backlineW)} W</dd></div>
        <div><dt>PA</dt><dd>{Math.round(power.paW)} W</dd></div>
        <div><dt>합계</dt><dd id="outTotalA">
          {Math.round(power.totalW)} W / {r1(power.totalA)} A
        </dd></div>
        <div><dt>쓸 수 있는 양</dt><dd>{r1(power.capacityA)} A</dd></div>
        <div><dt>필요한 회로</dt><dd id="outCircuits">{power.circuitsNeeded}개</dd></div>
      </dl>
      <p class={power.ok ? "pa-ok" : "pa-warn"} id="powerCheck">
        {power.ok ? "전원 용량 안에 들어옵니다." : "전원 용량을 넘습니다."}
      </p>
      <ul class="pa-notes">
        {power.warnings.map((w) => <li key={w}>{w}</li>)}
      </ul>
    </section>
  );
}

export function PaScreen() {
  S.docVersion.value;
  return (
    <div class="pa">
      <div class="pa-col">
        <VenueCard />
        <LineupCard />
        <SpeakerCard />
      </div>
      <div class="pa-col">
        <SystemCard />
        <PowerCard />
        <ChannelCard />
        <section class="card">
          <h2>가정과 한계</h2>
          <ul class="pa-notes">
            {PA_ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </section>
      </div>
    </div>
  );
}
