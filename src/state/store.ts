import { cloneDoc, emptyDoc, type Doc } from "../model/types";

type Listener = () => void;

// 문서 상태 + 되돌리기/다시 실행. 변경은 두 가지 방식으로 한다.
//  - commit(fn): 한 번에 끝나는 동작(추가/삭제/회전/연결 등) → 한 단계로 기록
//  - beginTxn/mutate/commitTxn: 드래그처럼 연속으로 바뀌는 동작 → 통째로 한 단계
export class Store {
  private doc: Doc;
  private past: Doc[] = [];
  private future: Doc[] = [];
  private txn: Doc | null = null;
  private listeners = new Set<Listener>();
  private readonly cap = 100;

  constructor(doc: Doc = emptyDoc()) {
    this.doc = doc;
  }

  get(): Doc {
    return this.doc;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  private pushPast(snapshot: Doc): void {
    this.past.push(snapshot);
    if (this.past.length > this.cap) this.past.shift();
    this.future = [];
  }

  commit(mutator: (doc: Doc) => void): void {
    this.pushPast(cloneDoc(this.doc));
    mutator(this.doc);
    this.emit();
  }

  beginTxn(): void {
    this.txn = cloneDoc(this.doc);
  }

  // 트랜잭션 중 즉시 반영(히스토리에 쌓지 않음)
  mutate(mutator: (doc: Doc) => void): void {
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

  replace(doc: Doc): void {
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
    this.future.push(cloneDoc(this.doc));
    this.doc = this.past.pop()!;
    this.emit();
  }

  redo(): void {
    if (!this.future.length) return;
    this.past.push(cloneDoc(this.doc));
    this.doc = this.future.pop()!;
    this.emit();
  }
}
