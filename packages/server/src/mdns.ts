// 이름으로 접속하기. `stage.local` 질의에 이 기기의 IP를 돌려줍니다.
//
// IP는 공유기가 바뀌면 달라져 즐겨찾기가 깨집니다. 이름은 그대로입니다.
// 다만 멀티캐스트를 막는 네트워크와 `.local`을 못 여는 기기가 있어서,
// **이름은 보조**이고 IP 주소를 늘 함께 보여 줍니다(SPEC 11).

import multicastDns from "multicast-dns";

/** mDNS 응답에 쓰는 수명(초). 짧게 두어 IP가 바뀌어도 금방 따라옵니다. */
export const TTL_SEC = 120;

export interface MdnsQuestion {
  name: string;
  type: string;
}

export interface MdnsQuery {
  questions?: MdnsQuestion[];
}

export interface MdnsAnswer {
  name: string;
  type: "A";
  ttl: number;
  data: string;
}

/** `stage` → `stage.local`. 이미 .local이면 그대로 둡니다. */
export function toLocalName(name: string): string {
  const trimmed = name.trim().replace(/\.$/, "");
  return /\.local$/i.test(trimmed) ? trimmed : `${trimmed}.local`;
}

/**
 * 이 질의에 답할 A 레코드. 순수 함수라서 멀티캐스트 없이 테스트합니다.
 *
 * 이름이 다르면 **빈 배열**을 돌려줍니다. 남의 질의에 끼어들면 그 네트워크의
 * 이름 해석을 망가뜨리기 때문입니다.
 */
export function buildAnswers(
  hostname: string,
  address: string,
  query: MdnsQuery,
): MdnsAnswer[] {
  const want = toLocalName(hostname).toLowerCase();
  const hit = (query.questions ?? []).some((q) => {
    const type = String(q.type ?? "").toUpperCase();
    if (type !== "A" && type !== "ANY") return false;
    return String(q.name ?? "").replace(/\.$/, "").toLowerCase() === want;
  });
  if (!hit) return [];
  return [{ name: toLocalName(hostname), type: "A", ttl: TTL_SEC, data: address }];
}

export interface MdnsHandle {
  /** 이름 접속을 쓸 수 있는지. */
  ok: boolean;
  /** 못 쓰는 이유. 쓸 수 있으면 null입니다. */
  problem: string | null;
  /** 이름 주소(쓸 수 있을 때만). */
  hostname: string | null;
  stop: () => void;
}

export interface MdnsOptions {
  name: string;
  address: string;
}

/** multicast-dns가 내는 것 중 우리가 쓰는 부분만. 테스트에서 가짜로 바꿉니다. */
export interface MdnsSocket {
  on(event: "query", fn: (query: MdnsQuery) => void): void;
  on(event: "error", fn: (err: Error) => void): void;
  respond(res: { answers: MdnsAnswer[] }): void;
  destroy(): void;
}

function defaultSocket(): MdnsSocket {
  return multicastDns({ loopback: true, reuseAddr: true }) as unknown as MdnsSocket;
}

/**
 * 이름 응답기를 켭니다.
 *
 * **실패해도 서버는 그대로 떠야 합니다.** 5353 포트를 Bonjour 같은 프로그램이
 * 이미 쓰고 있는 일이 흔합니다. 그때는 죽지 않고 IP 접속만 안내합니다.
 */
export function startMdns(
  opts: MdnsOptions,
  make: () => MdnsSocket = defaultSocket,
): MdnsHandle {
  const hostname = toLocalName(opts.name);
  const failed = (message: string): MdnsHandle => ({
    ok: false,
    problem: `${message} 이름 접속을 쓸 수 없어 IP로만 접속합니다.`,
    hostname: null,
    stop: () => {},
  });

  let socket: MdnsSocket;
  try {
    socket = make();
  } catch (e) {
    return failed(`이름 알림을 시작하지 못했습니다(${(e as Error).message}).`);
  }

  let broken: string | null = null;
  socket.on("error", (err: Error) => {
    // 켠 뒤에 깨질 수도 있습니다. 이 경우에도 서버는 계속 갑니다.
    broken = err.message;
  });
  socket.on("query", (query: MdnsQuery) => {
    const answers = buildAnswers(opts.name, opts.address, query);
    if (answers.length) socket.respond({ answers });
  });

  return {
    get ok(): boolean {
      return broken == null;
    },
    get problem(): string | null {
      return broken == null
        ? null
        : `이름 알림이 끊겼습니다(${broken}). IP로 접속해 주세요.`;
    },
    hostname,
    stop: () => {
      try {
        socket.destroy();
      } catch {
        // 이미 닫혔으면 넘어갑니다.
      }
    },
  };
}
