// 호스트가 가진 단 하나의 원본과 그것을 고치는 방법(SPEC 9).
// 받은 내용은 믿지 않고 migrate로 한 번 거릅니다.

import {
  emptyEvent,
  sanitizeEvent,
  type Device,
  type Entity,
  type Event,
  type Notice,
  type Role,
  type StagePlan,
  type TimetableItem,
} from "@stage-planner/shared";

export interface PatchOutcome {
  found: boolean;
  /** 보낸 rev가 서버와 달랐는지. 다르면 적용은 하되 보낸 쪽에 알립니다. */
  conflict: boolean;
  rev: number;
  value: unknown;
}

export interface DeviceEntry extends Device {
  send: (msg: unknown) => void;
  close: (reason: string) => void;
}

export class Hub {
  private doc: Event;
  private devices = new Map<string, DeviceEntry>();
  private seq = 0;

  constructor(doc: Event = emptyEvent()) {
    this.doc = sanitizeEvent(doc).event;
  }

  snapshot(): Event {
    // 접속 기기 목록은 런타임 정보이고, 접속 코드는 내보내지 않습니다(SPEC 10).
    return {
      ...this.doc,
      devices: this.deviceList(),
      accessCodes: { operator: "", staff: "", display: "", rotatedAt: "" },
    };
  }

  /** 운영자가 자기 작업을 호스트에 올립니다. 내용은 다시 검증합니다. */
  publish(raw: unknown): string[] {
    const { event, warnings } = sanitizeEvent(raw);
    this.doc = event;
    return warnings;
  }

  ownerOf(itemId: string): string | null {
    return this.doc.timetable.items.find((i) => i.id === itemId)?.owner ?? null;
  }

  private findTarget(entity: Entity, id: string):
    | StagePlan
    | TimetableItem
    | Notice
    | null {
    if (entity === "stagePlan") return this.doc.stagePlans.find((p) => p.id === id) ?? null;
    if (entity === "timetableItem") {
      return this.doc.timetable.items.find((i) => i.id === id) ?? null;
    }
    return this.doc.notices.find((n) => n.id === id) ?? null;
  }

  /**
   * 항목 하나를 고칩니다. rev가 다르면 **나중에 온 것이 이깁니다.** 값을 조용히
   * 덮지 않고, 밀린 쪽에 conflict를 알리도록 결과에 표시합니다(SPEC 9.4).
   */
  patch(entity: Entity, id: string, rev: number, changes: Record<string, unknown>): PatchOutcome {
    const target = this.findTarget(entity, id);
    if (!target) return { found: false, conflict: false, rev: 0, value: null };

    const conflict = target.rev !== rev;
    Object.assign(target as unknown as Record<string, unknown>, changes);
    target.rev = Math.max(target.rev, rev) + 1;

    // 통째로 한 번 더 거릅니다. 깨진 값이 들어오면 여기서 정리됩니다.
    const keptRev = target.rev;
    this.doc = sanitizeEvent(this.doc).event;
    const after = this.findTarget(entity, id);
    if (after) after.rev = keptRev;

    return { found: true, conflict, rev: keptRev, value: after };
  }

  addNotice(level: "normal" | "urgent", text: string, targets: Role[]): Notice {
    const notice: Notice = {
      id: `notice-${Date.now().toString(36)}-${++this.seq}`,
      level,
      text,
      targets,
      createdAt: new Date().toISOString(),
      ackBy: [],
      rev: 1,
    };
    this.doc.notices.push(notice);
    return notice;
  }

  ack(noticeId: string, deviceId: string): Notice | null {
    const n = this.doc.notices.find((x) => x.id === noticeId);
    if (!n) return null;
    if (!n.ackBy.includes(deviceId)) {
      n.ackBy.push(deviceId);
      n.rev++;
    }
    return n;
  }

  /** 한 번에 하나만 진행 중입니다. 앱과 같은 규칙입니다. */
  itemStart(itemId: string): TimetableItem | null {
    const now = new Date().toISOString();
    const it = this.doc.timetable.items.find((x) => x.id === itemId);
    if (!it) return null;
    for (const other of this.doc.timetable.items) {
      if (other.status === "running" && other.id !== itemId) {
        other.actualEnd = now;
        other.status = "done";
        other.rev++;
      }
    }
    it.actualStart = now;
    it.actualEnd = null;
    it.status = "running";
    it.rev++;
    return it;
  }

  itemEnd(itemId: string): TimetableItem | null {
    const it = this.doc.timetable.items.find((x) => x.id === itemId);
    if (!it) return null;
    it.actualEnd = new Date().toISOString();
    it.status = "done";
    it.rev++;
    return it;
  }

  // ── 접속 기기 ──────────────────────────────────────────────────────────────
  addDevice(entry: DeviceEntry): void {
    this.devices.set(entry.id, entry);
  }

  removeDevice(id: string): void {
    this.devices.delete(id);
  }

  getDevice(id: string): DeviceEntry | undefined {
    return this.devices.get(id);
  }

  touch(id: string): void {
    const d = this.devices.get(id);
    if (d) {
      d.lastSeen = new Date().toISOString();
      d.status = "online";
    }
  }

  deviceList(): Device[] {
    return [...this.devices.values()].map(({ id, role, name, connectedAt, lastSeen, status }) => ({
      id, role, name, connectedAt, lastSeen, status,
    }));
  }

  broadcast(msg: unknown, filter?: (d: DeviceEntry) => boolean): void {
    for (const d of this.devices.values()) {
      if (!filter || filter(d)) d.send(msg);
    }
  }
}
