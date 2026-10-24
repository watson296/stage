import { migrate, type Event } from "@stage-planner/shared";

// IndexedDB에 작업을 자동 저장합니다. 저장소를 못 쓰면(사생활 모드 등)
// 조용히 넘기지 않고 onError로 알립니다. iPad Safari는 저장소를 비울 수
// 있으므로, 사용자에게는 JSON 내보내기를 함께 권합니다(UI에서 안내).

const DB_NAME = "stage-planner";
const STORE = "docs";
const KEY = "current";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("이 브라우저에서 저장소를 쓸 수 없습니다."));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("저장소를 열 수 없습니다."));
  });
}

export async function saveEvent(doc: Event): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(doc, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("저장에 실패했습니다."));
    tx.onabort = () => reject(tx.error ?? new Error("저장이 중단되었습니다."));
  });
  db.close();
}

/**
 * 저장해 둔 작업을 꺼냅니다. **반드시 migrate를 거칩니다.** 저장된 문서는 옛
 * 버전이 만든 것일 수 있어서, 그대로 쓰면 그때는 없던 칸(PA 입력, 공지 등)이
 * 빠진 채로 화면에 올라가 화면이 통째로 비어 보입니다.
 */
export async function loadEvent(): Promise<{ event: Event; warnings: string[] } | null> {
  const db = await openDB();
  const raw = await new Promise<unknown>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error ?? new Error("불러오기에 실패했습니다."));
  });
  db.close();
  if (raw == null) return null;
  return migrate(raw);
}

export interface Autosaver {
  schedule(doc: Event): void;
  flush(): Promise<void>;
}

// 변경을 모아 debounce 후 저장. 실패는 onError로 전달.
export function createAutosaver(
  onError: (message: string) => void,
  delayMs = 500,
): Autosaver {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: Event | null = null;

  async function run(): Promise<void> {
    if (!pending) return;
    const doc = pending;
    pending = null;
    try {
      await saveEvent(doc);
    } catch (e) {
      onError(e instanceof Error ? e.message : "자동 저장에 실패했습니다.");
    }
  }

  return {
    schedule(doc) {
      pending = doc;
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, delayMs);
    },
    async flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await run();
    },
  };
}
