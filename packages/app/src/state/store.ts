import { cloneEvent, emptyEvent, type Event } from "@stage-planner/shared";

type Listener = () => void;

// 문서 상태 + 되돌리기/다시 실행. 변경은 두 가지 방식으로 한다.
//  - commit(fn): 한 번에 끝나는 동작(추가/삭제/회전/연결 등) → 한 단계로 기록
//  - beginTxn/mutate/commitTxn: 드래그처럼 연속으로 바뀌는 동작 → 통째로 한 단계
export class Store {
  private doc: Event;
  private past: Event[] = [];
  private future: Event[] = [];
  private txn: Event | null = null;
  private listeners = new Set<Listener>();
  private readonly cap = 100;

  constructor(doc: Event = emptyEvent()) {
    this.doc = doc;
  }

  get(): Event {
    return this.doc;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  private pushPast(snapshot: Event): void {
    this.past.push(snapshot);
    if (this.past.length > this.cap) this.past.shift();
    this.future = [];
  }

  commit(mutator: (doc: Event) => void): void {
    this.pushPast(cloneEvent(this.doc));
    mutator(this.doc);
    this.emit();
  }

  beginTxn(): void {
    this.txn = cloneEvent(this.doc);
  }

  // 트랜잭션 중 즉시 반영(히스토리에 쌓지 않음)
  mutate(mutator: (doc: Event) => void): void {
    mutator(this.doc);
    this.emit();
  }

  commitTxn(): void {
    if (!this.txn) return;
    this.pushPast(this.txn);
    this.txn = null;
    this.emit();
  }

  cancelTxn(): void {
    if (!this.txn) return;
    this.doc = this.txn;
    this.txn = null;
    this.emit();
  }

  replace(doc: Event): void {
    this.doc = doc;
    this.past = [];
    this.future = [];
    this.txn = null;
    this.emit();
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }
  canRedo(): boolean {
    return this.future.length > 0;
  }

  undo(): void {
    if (!this.past.length) return;
    this.future.push(cloneEvent(this.doc));
    this.doc = this.past.pop()!;
    this.emit();
  }

  redo(): void {
    if (!this.future.length) return;
    this.past.push(cloneEvent(this.doc));
    this.doc = this.future.pop()!;
    this.emit();
  }
}
