// 링크로 바로 들어오기. `?r=staff&c=473920` 처럼 역할과 코드가 담긴 주소로 열면
// 자리 고르기와 코드 입력을 건너뜁니다.
//
// 들어간 직후 주소에서 코드를 지웁니다. 주소창과 방문 기록에 코드가 남으면
// 화면을 넘겨받은 사람이 그대로 들어올 수 있기 때문입니다(SPEC 10).

import { parseJoinParams, searchWithoutCode } from "@stage-planner/shared";
import { screen } from "../state/appState";
import { roleFromWire, roleInfo, setAppRole } from "../state/roles";
import { connectFromLink } from "./client";
import { joinProblem, STALE_LINK } from "../state/joinState";

/** 기기 이름의 기본값. 자리마다 다르게 둡니다. */
function defaultName(roleName: string): string {
  return `${roleName} 기기`;
}

/**
 * 주소에 담긴 역할·코드로 들어갑니다. 링크가 없으면 아무 일도 하지 않고
 * 평소 흐름(자리 고르기 → 코드 입력)을 그대로 둡니다.
 *
 * 돌려주는 값은 "링크로 들어갔는지"입니다.
 */
export function joinFromLink(search = location.search): boolean {
  const { role, code, bad } = parseJoinParams(search);
  if (bad) {
    joinProblem.value = STALE_LINK;
    stripCode(search);
    return false;
  }
  if (!role || !code) return false;

  const app = roleFromWire(role);
  setAppRole(app);
  screen.value = roleInfo(app).screens[0];
  connectFromLink(location.origin, code, role, defaultName(roleInfo(app).name));
  stripCode(search);
  return true;
}

/** 주소에서 코드만 지웁니다. 역사에 남기지 않도록 replaceState를 씁니다. */
function stripCode(search: string): void {
  try {
    const left = searchWithoutCode(search);
    history.replaceState(null, "", location.pathname + left + location.hash);
  } catch {
    // 파일로 열어 둔 경우 등 주소를 못 바꾸는 환경이면 그냥 둡니다.
  }
}
