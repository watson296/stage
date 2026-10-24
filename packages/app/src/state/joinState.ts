// 링크로 들어오다 막혔을 때 시작 화면에 적을 말.
// 접속 모듈과 링크 모듈이 서로를 부르지 않도록 여기에 따로 둡니다.

import { signal } from "@preact/signals";

export const STALE_LINK = "링크가 오래되었습니다. 새 링크를 받아 주세요.";

/** 비어 있으면 아무것도 적지 않습니다. */
export const joinProblem = signal("");
