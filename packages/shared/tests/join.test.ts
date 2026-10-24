import { describe, it, expect } from "vitest";
import {
  buildJoinUrl,
  parseJoinParams,
  searchWithoutCode,
  CODE_PARAM,
  ROLE_PARAM,
} from "../src/index";

describe("접속 링크 만들기", () => {
  it("역할과 코드를 주소에 담습니다", () => {
    const url = buildJoinUrl("http://192.168.0.5:7321/", "staff", "473920");
    expect(url).toBe("http://192.168.0.5:7321/?r=staff&c=473920");
  });

  it("이름 주소에도 그대로 붙습니다", () => {
    expect(buildJoinUrl("http://stage.local:7321/", "display", "000123")).toBe(
      "http://stage.local:7321/?r=display&c=000123",
    );
  });

  it("들어 있던 경로와 물음표 뒤는 지웁니다", () => {
    // 코드가 두 번 붙거나 엉뚱한 경로로 가는 것을 막습니다.
    expect(buildJoinUrl("http://a.b:7321/old/path?x=1&c=999999", "operator", "111111")).toBe(
      "http://a.b:7321/?r=operator&c=111111",
    );
  });
});

describe("접속 링크 읽기", () => {
  it("역할과 코드가 맞으면 그대로 돌려줍니다", () => {
    expect(parseJoinParams("?r=operator&c=482913")).toEqual({
      role: "operator", code: "482913", bad: false,
    });
    // 물음표가 없어도 읽습니다.
    expect(parseJoinParams("r=display&c=000000").role).toBe("display");
  });

  it("아무것도 없으면 평소 흐름입니다", () => {
    expect(parseJoinParams("")).toEqual({ role: null, code: null, bad: false });
    expect(parseJoinParams("?other=1")).toEqual({ role: null, code: null, bad: false });
  });

  it("모르는 역할은 거부합니다", () => {
    const r = parseJoinParams("?r=boss&c=123456");
    expect(r.role).toBeNull();
    expect(r.bad).toBe(true);
  });

  it("코드 모양이 틀리면 거부합니다", () => {
    for (const c of ["12345", "1234567", "abcdef", "12 456", ""]) {
      const r = parseJoinParams(`?r=staff&c=${encodeURIComponent(c)}`);
      expect(r.code, c).toBeNull();
      expect(r.bad, c).toBe(true);
    }
  });

  it("한쪽만 있으면 거부합니다", () => {
    expect(parseJoinParams("?r=staff").bad).toBe(true);
    expect(parseJoinParams("?c=123456").bad).toBe(true);
  });
});

describe("주소에서 코드 지우기", () => {
  it("코드만 지우고 역할은 남깁니다", () => {
    expect(searchWithoutCode("?r=staff&c=473920")).toBe("?r=staff");
  });

  it("다른 값은 건드리지 않습니다", () => {
    expect(searchWithoutCode("?r=display&c=1&keep=2")).toBe("?r=display&keep=2");
  });

  it("남는 것이 없으면 빈 문자열입니다", () => {
    expect(searchWithoutCode("?c=473920")).toBe("");
    expect(searchWithoutCode("")).toBe("");
  });

  it("지운 뒤에는 다시 읽어도 코드가 없습니다", () => {
    const left = searchWithoutCode(buildJoinUrl("http://a.b:1/", "staff", "473920").split("?")[1]);
    expect(parseJoinParams(left).code).toBeNull();
    expect(left).not.toContain(CODE_PARAM + "=");
    expect(left).toContain(ROLE_PARAM + "=");
  });
});
