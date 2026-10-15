import { migrate, type Event, type MigrateResult } from "@stage-planner/shared";

// 현재 공연을 JSON 파일로 저장합니다.
// 접속 코드는 기본으로 빼고 내보냅니다(SPEC 10장). 파일을 남에게 줄 때
// 코드가 함께 나가지 않도록 하기 위해서입니다.
export function downloadJSON(ev: Event, includeCodes = false): void {
  const data: Record<string, unknown> = {
    ...ev,
    devices: [],
    accessCodes: includeCodes
      ? ev.accessCodes
      : { operator: "", staff: "", display: "", rotatedAt: "" },
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "새결_무대_" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  URL.revokeObjectURL(url);
}

/** 파일 텍스트를 파싱·검증·마이그레이션해 Event로 만듭니다. 실패하면 던집니다. */
export function parseEvent(text: string): MigrateResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("JSON 형식이 아닙니다.");
  }
  return migrate(raw);
}

export function pickJSONFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.click();
  });
}
