// 접속을 받을 주소와 받아도 되는 주소를 정합니다(SPEC 10).
// 기본은 사설 IP 대역에서 오는 연결만 받는 것입니다.

import { networkInterfaces } from "node:os";

export interface LocalAddress {
  name: string;
  address: string;
}

/** 이 기기가 가진 IPv4 주소들. 루프백은 뒤에 둡니다. */
export function localAddresses(): LocalAddress[] {
  const out: LocalAddress[] = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family !== "IPv4") continue;
      out.push({ name, address: ni.address });
    }
  }
  return out.sort((a, b) => Number(isLoopback(a.address)) - Number(isLoopback(b.address)));
}

export function isLoopback(ip: string): boolean {
  return ip.startsWith("127.");
}

/**
 * 사설 IP인지. 10/8, 172.16/12, 192.168/16, 127/8, 169.254/16(링크 로컬)을 봅니다.
 * IPv6로 들어온 IPv4(::ffff:192.168.0.2)와 ::1도 처리합니다.
 */
export function isPrivateAddress(raw: string): boolean {
  const ip = normalizeIp(raw);
  if (ip === "::1") return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if ([a, b, Number(m[3]), Number(m[4])].some((n) => n > 255)) return false;
  if (a === 10 || a === 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

export function normalizeIp(ip: string): string {
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

/** 브라우저에 알려 줄 접속 주소. 루프백이 아닌 주소를 먼저 고릅니다. */
export function preferredAddress(addresses: LocalAddress[]): string {
  const real = addresses.find((a) => !isLoopback(a.address));
  return (real ?? addresses[0])?.address ?? "127.0.0.1";
}
