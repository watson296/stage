// 호스트 서버 실행. `npm run host` 로 띄웁니다.
//
//   npm run host -- --port 7321 --file plan.json
//
// 접속 코드는 이 화면에만 찍습니다. 로그 파일이나 내보내기에는 남기지 않습니다.

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate, type Event } from "@stage-planner/shared";
import { startHost } from "./host.ts";
import { localAddresses, isLoopback } from "./net.ts";

interface Args {
  port: number;
  file: string | null;
  allowPublic: boolean;
  address: string | null;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { port: 7321, file: null, allowPublic: false, address: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port") out.port = Number(argv[++i]) || out.port;
    else if (a === "--file") out.file = argv[++i] ?? null;
    else if (a === "--address") out.address = argv[++i] ?? null;
    else if (a === "--allow-public") out.allowPublic = true;
  }
  return out;
}

async function loadDoc(file: string | null): Promise<{ doc?: Event; warnings: string[] }> {
  if (!file) return { warnings: [] };
  try {
    const text = await readFile(resolve(file), "utf8");
    const { event, warnings } = migrate(JSON.parse(text));
    return { doc: event, warnings };
  } catch (e) {
    console.log(`파일을 읽지 못해 빈 공연으로 시작합니다: ${(e as Error).message}`);
    return { warnings: [] };
  }
}

const args = parseArgs(process.argv.slice(2));
const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, "../../app/dist");
const { doc, warnings } = await loadDoc(args.file);

const host = await startHost({
  port: args.port,
  appDir,
  doc,
  allowPublic: args.allowPublic,
  address: args.address ?? undefined,
});

warnings.forEach((w) => console.log(`주의: ${w}`));

console.log("");
console.log("  호스트를 시작했습니다.");
console.log(`  접속 주소: ${host.url}`);
console.log("");
console.log("  접속 코드 (이 화면에만 보여 줍니다)");
console.log(`    운영자    ${host.codes.operator}`);
console.log(`    스태프    ${host.codes.staff}`);
console.log(`    표시 화면 ${host.codes.display}`);
console.log("");

const others = localAddresses().filter((a) => !isLoopback(a.address));
if (others.length > 1) {
  console.log("  이 기기의 다른 주소 (네트워크가 여럿입니다)");
  for (const a of others) console.log(`    ${a.address}  (${a.name})`);
  console.log("  다른 주소를 쓰려면 --address 로 골라 주세요.");
  console.log("");
}
if (args.allowPublic) {
  console.log("  주의: 사설 IP 제한을 풀었습니다. 인터넷에 노출되지 않게 하세요.");
  console.log("");
}
console.log("  끝내려면 Ctrl+C 를 누릅니다.");

async function saveAndExit(): Promise<void> {
  if (args.file) {
    try {
      // 이 파일에는 접속 코드가 들어갑니다. 껐다 켜도 같은 코드를 쓰기 위해서입니다.
      // 다른 사람에게 줄 때는 앱의 저장(JSON 내보내기)을 쓰세요. 거기에는 코드가 빠집니다.
      const doc = { ...host.hub.snapshot(), accessCodes: host.accessCodes };
      await writeFile(resolve(args.file), JSON.stringify(doc, null, 2), "utf8");
      console.log(`\n${args.file} 에 저장했습니다.`);
    } catch (e) {
      console.log(`\n저장하지 못했습니다: ${(e as Error).message}`);
    }
  }
  await host.close();
  process.exit(0);
}

process.on("SIGINT", () => void saveAndExit());
process.on("SIGTERM", () => void saveAndExit());
