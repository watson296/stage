// 접속 링크. 역할과 코드를 주소에 담아 한 번 눌러 들어오게 합니다.
// 호스트가 만들고 앱이 읽으므로 양쪽이 같은 함수를 씁니다.
//
// 코드가 주소에 담기는 만큼, 들어간 뒤에는 앱이 주소에서 코드를 지웁니다.
// 코드를 보여 주는 화면은 호스트 기기 안으로만 제한합니다(SPEC 10).

import type { Role } from "../model/types";
import { CODE_RE } from "./validate";

export const ROLE_PARAM = "r";
export const CODE_PARAM = "c";

/** 역할과 코드를 담은 접속 링크. base는 `http://host:port/` 형태입니다. */
export function buildJoinUrl(base: string, role: Role, code: string): string {
  const u = new URL(base);
  u.pathname = "/";
  u.search = "";
  u.searchParams.set(ROLE_PARAM, role);
  u.searchParams.set(CODE_PARAM, code);
  return u.toString();
}

export interface JoinParams {
  role: Role | null;
  code: string | null;
  /** 값이 있는데 형식이 틀린 경우. 조용히 넘기지 않고 화면에 알립니다. */
  bad: boolean;
}

/**
 * 주소의 물음표 뒤를 읽습니다. 역할과 코드가 **둘 다** 제대로 있어야 바로
 * 들어갑니다. 하나라도 모양이 틀리면 bad로 돌려주어 "링크가 오래되었습니다"를
 * 띄우게 합니다.
 */
export function parseJoinParams(search: string): JoinParams {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const rawRole = q.get(ROLE_PARAM);
  const rawCode = q.get(CODE_PARAM);
  if (rawRole == null && rawCode == null) return { role: null, code: null, bad: false };

  const role = isRoleParam(rawRole) ? rawRole : null;
  const code = rawCode != null && CODE_RE.test(rawCode) ? rawCode : null;
  return { role, code, bad: role == null || code == null };
}

function isRoleParam(v: string | null): v is Role {
  return v === "operator" || v === "staff" || v === "display";
}

/**
 * 코드만 뺀 물음표 뒤. 들어간 직후 history.replaceState에 넣어 주소창과 방문
 * 기록에 코드가 남지 않게 합니다. 역할은 남겨 둡니다 — 새로고침했을 때 어떤
 * 자리로 들어왔는지 알 수 있고, 코드가 없으므로 그 자체로는 들어갈 수 없습니다.
 */
export function searchWithoutCode(search: string): string {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  q.delete(CODE_PARAM);
  const rest = q.toString();
  return rest ? `?${rest}` : "";
}
