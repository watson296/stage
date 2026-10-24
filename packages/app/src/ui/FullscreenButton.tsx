import { useEffect, useState } from "preact/hooks";

/**
 * 전체 화면 단추. 대기실 TV에서 머리말과 탭까지 가리고 공지만 띄울 때 씁니다.
 * 지원하지 않는 브라우저에서는 단추를 감춥니다.
 */
export function FullscreenButton() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const sync = (): void => setOn(document.fullscreenElement != null);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  if (typeof document === "undefined" || !document.documentElement.requestFullscreen) {
    return null;
  }

  const toggle = (): void => {
    // 사용자가 Esc로 빠져나갈 수도 있어 현재 상태를 그때그때 봅니다.
    const p = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();
    // 브라우저가 거절하면(사용자 동작 없이 부른 경우 등) 조용히 둡니다.
    void p?.catch(() => {});
  };

  return (
    <button class="btn" id="btnFullscreen" onClick={toggle}>
      {on ? "전체 화면 끄기" : "전체 화면"}
    </button>
  );
}
