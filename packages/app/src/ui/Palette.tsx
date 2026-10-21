import { EQUIPMENT, PALETTE_GROUPS, CATEGORIES } from "@stage-planner/shared";
import * as S from "../state/appState";
import { readOnly } from "../net/client";

/** 팔레트에서 캔버스로 끌어놓기(HTML5 DnD 아님) + 탭 선택 */
function paletteDrag(key: string) {
  return (e: PointerEvent) => {
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY };
    let dragging = false;
    const move = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 8)
        dragging = true;
    };
    const up = (ev: PointerEvent) => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      const canvas = document.getElementById("cv");
      if (!canvas) return;
      const r = canvas.getBoundingClientRect();
      const over =
        ev.clientX >= r.left && ev.clientX <= r.right &&
        ev.clientY >= r.top && ev.clientY <= r.bottom;
      if (dragging && over) {
        const cam = S.camera.value;
        S.placeObject(key, (ev.clientX - r.left - cam.ox) / cam.scale, (ev.clientY - r.top - cam.oy) / cam.scale);
      } else if (!dragging) {
        S.togglePlacing(key);
      }
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  };
}

function Item(props: { keyName: string; name: string; color: string; onDelete?: () => void }) {
  const selected = S.placingType.value === props.keyName;
  const item = (
    <div
      class={"pal-item" + (selected ? " selected" : "")}
      onPointerDown={paletteDrag(props.keyName)}
    >
      <div class="pal-dot" style={{ background: props.color }} />
      <div class="pal-nm">{props.name}</div>
    </div>
  );
  if (!props.onDelete) return item;
  return (
    <div class="custom-item">
      {item}
      <button
        class="del"
        title="삭제"
        onClick={(e) => {
          e.stopPropagation();
          props.onDelete!();
        }}
      >
        ✕
      </button>
    </div>
  );
}

export function Palette() {
  // 읽기 전용으로 붙은 기기는 장비를 놓을 수 없습니다.
  if (readOnly()) return null;

  S.docVersion.value;
  S.placingType.value;
  const custom = Object.entries(S.currentEvent().customEquipment);
  return (
    <div class="pal">
      <div>
        {PALETTE_GROUPS.map((g) => (
          <div class="pal-group" key={g.title}>
            <div class="pal-hdr">{g.title}</div>
            {g.types.map((k) => {
              const t = EQUIPMENT[k];
              return t ? (
                <Item key={k} keyName={k} name={t.name} color={CATEGORIES[t.cat].color} />
              ) : null;
            })}
          </div>
        ))}
        {custom.length > 0 && (
          <div class="pal-group">
            <div class="pal-hdr">커스텀</div>
            {custom.map(([k, c]) => (
              <Item
                key={k}
                keyName={k}
                name={c.name}
                color={c.color}
                onDelete={() => S.removeCustomEquipment(k)}
              />
            ))}
          </div>
        )}
      </div>
      <div class="pal-foot">
        <button class="ci-btn" onClick={() => (S.showCustomModal.value = true)}>
          직접 추가
        </button>
        <div class="pal-note">장비를 탭한 뒤 무대를 탭하면 배치됩니다. 끌어다 놓아도 됩니다.</div>
      </div>
    </div>
  );
}
