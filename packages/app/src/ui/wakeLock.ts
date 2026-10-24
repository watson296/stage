import { useEffect } from "preact/hooks";

/**
 * 화면이 꺼지지 않게 붙잡습니다. 지원하지 않는 브라우저에서는 아무 일도
 * 일어나지 않습니다(SPEC 11). 탭을 다시 보면 다시 겁니다.
 */
export function useWakeLock(): void {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    let dropped = false;
    const req = async (): Promise<void> => {
      const wl = (navigator as unknown as {
        wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> };
      }).wakeLock;
      if (!wl) return;
      try {
        lock = await wl.request("screen");
      } catch {
        // 배터리 절약 모드 등으로 거절될 수 있습니다. 화면은 그대로 둡니다.
      }
    };
    void req();
    const onVis = (): void => {
      if (document.visibilityState === "visible" && !dropped) void req();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      dropped = true;
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release().catch(() => {});
    };
  }, []);
}
