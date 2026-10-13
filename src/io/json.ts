import type { Doc } from "../model/types";
import { migrate, type MigrateResult } from "../model/migrate";

// 현재 문서를 JSON 파일로 저장합니다. 브라우저가 파일을 내려받습니다.
export function downloadJSON(doc: Doc): void {
  const data = {
    version: doc.version,
    stage: doc.stage,
    objects: doc.objects,
    postits: doc.postits,
    customTypes: doc.customTypes,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "새결_무대_" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  URL.revokeObjectURL(url);
}

// 파일 텍스트를 파싱·검증·마이그레이션해 Doc으로 만듭니다. 실패하면 던집니다.
export function parseDesign(text: string): MigrateResult {
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
