import { useRef } from "preact/hooks";
import * as S from "../state/appState";

// 고치는 동안을 되돌리기 한 단계로 묶는 입력칸입니다(focus에서 시작, blur에서 확정).
//
// 편집 상태(dirty)를 렌더 함수 안의 지역 변수로 두면 안 됩니다. 글자를 칠 때마다
// 문서가 바뀌고 화면이 다시 그려지면서 새 핸들러가 붙는데, 그 핸들러의 dirty는
// false라서 blur 때 cancelTxn()이 불려 입력한 값이 원래대로 돌아갑니다.
// 한 번에 하나의 칸만 포커스를 가지므로 모듈에 하나만 둡니다.
let editing: EventTarget | null = null;
let dirty = false;

/** 쓰는 칸만 받습니다. 필요한 속성이 생기면 여기에 더합니다. */
export interface EditInputProps {
  class?: string;
  id?: string;
  type: "text" | "number" | "time";
  placeholder?: string;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  value: string | number;
  /** 바뀐 글자를 받습니다. false를 돌려주면 반영하지 않은 것으로 봅니다. */
  onEdit: (v: string) => boolean | void;
}

export function EditInput({ value, onEdit, type, ...rest }: EditInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  // 고치는 중에는 화면에 친 글자를 그대로 둡니다. 다시 그릴 때 숫자로 덮으면
  // "12." 같은 중간 상태가 "12"로 바뀌고 커서가 앞으로 가 "512"처럼 섞입니다.
  const el = ref.current;
  const shown = el && editing === el ? el.value : String(value);

  return (
    <input
      {...rest}
      // Preact 타입은 type 값마다 따로 나뉘어 합친 유니온을 받지 못합니다.
      type={type as "text"}
      ref={ref}
      value={shown}
      onFocus={(e) => {
        editing = e.currentTarget;
        dirty = false;
        S.store.beginTxn();
      }}
      onInput={(e) => {
        if (onEdit(e.currentTarget.value) !== false) dirty = true;
      }}
      onBlur={(e) => {
        if (editing !== e.currentTarget) return;
        editing = null;
        if (dirty) S.store.commitTxn();
        else S.store.cancelTxn();
        dirty = false;
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

/** 숫자 칸. 숫자로 읽을 수 없는 중간 글자("", "-")는 반영하지 않습니다. */
export function numEdit(apply: (v: number) => void): (s: string) => boolean {
  return (s) => {
    const v = parseFloat(s);
    if (!Number.isFinite(v)) return false;
    apply(v);
    return true;
  };
}
