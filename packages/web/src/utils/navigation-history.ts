/**
 * navigation-history.ts
 *
 * Tracks same-document navigation indices and provides directional reversal
 * (Back / Forward) for popstate navigation guards without creating new entries,
 * truncating forward history, or entering infinite popstate loops.
 */

export class NavigationHistoryManager {
  private currentIndex: number = 0;
  private reverting: boolean = false;
  private initialized: boolean = false;

  constructor() {
    this.init();
  }

  public init(): void {
    if (this.initialized) return;
    if (typeof window === 'undefined' || !window.history) return;

    this.initialized = true;

    const currentState = window.history.state;
    if (currentState && typeof currentState.__zur_idx === 'number') {
      this.currentIndex = currentState.__zur_idx;
    } else {
      this.currentIndex = 0;
      const existing = (currentState && typeof currentState === 'object') ? currentState : {};
      try {
        const rawReplace = window.history.replaceState.bind(window.history);
        rawReplace({ ...existing, __zur_idx: 0 }, '');
      } catch {}
    }

    const rawPush = window.history.pushState.bind(window.history);
    const rawReplace = window.history.replaceState.bind(window.history);

    window.history.pushState = (data: any, unused: string, url?: string | URL | null) => {
      this.currentIndex++;
      const state = (data && typeof data === 'object') ? { ...data, __zur_idx: this.currentIndex } : { __zur_idx: this.currentIndex };
      if (url !== undefined) {
        return rawPush(state, unused, url);
      }
      return rawPush(state, unused);
    };

    window.history.replaceState = (data: any, unused: string, url?: string | URL | null) => {
      const state = (data && typeof data === 'object') ? { ...data, __zur_idx: this.currentIndex } : { __zur_idx: this.currentIndex };
      if (url !== undefined) {
        return rawReplace(state, unused, url);
      }
      return rawReplace(state, unused);
    };
  }

  public getCurrentIndex(): number {
    return this.currentIndex;
  }

  public setCurrentIndex(idx: number): void {
    this.currentIndex = idx;
  }

  public isReverting(): boolean {
    return this.reverting;
  }

  public clearReverting(): void {
    this.reverting = false;
  }

  /**
   * Called at the start of popstate.
   * If we are in the middle of reverting a cancelled popstate, returns true so the caller can return early.
   */
  public checkAndClearReverting(): boolean {
    if (this.reverting) {
      this.reverting = false;
      return true;
    }
    return false;
  }

  /**
   * Computes the signed traversal step count:
   * delta > 0 indicates forward traversal (incomingIndex > currentIndex)
   * delta < 0 indicates backward traversal (incomingIndex < currentIndex)
   */
  public getDelta(incomingState: any): number | undefined {
    const incomingIdx = (incomingState && typeof incomingState.__zur_idx === 'number')
      ? incomingState.__zur_idx
      : (typeof window !== 'undefined' && window.history?.state && typeof window.history.state.__zur_idx === 'number'
          ? window.history.state.__zur_idx
          : undefined);

    if (typeof incomingIdx === 'number') {
      return incomingIdx - this.currentIndex;
    }
    return undefined;
  }

  /**
   * Reverses a popstate traversal back to currentIndex.
   * If delta is positive (forward traversal), goes back by delta (-delta).
   * If delta is negative (backward traversal), goes forward by |delta| (-delta).
   */
  public revertPopstate(incomingState: any): void {
    const delta = this.getDelta(incomingState);
    this.reverting = true;
    if (typeof delta === 'number' && delta !== 0) {
      window.history.go(-delta);
    } else {
      window.history.forward();
    }
  }

  /**
   * Confirms a popstate traversal, updating currentIndex to match the new entry.
   */
  public confirmPopstate(incomingState: any): void {
    const incomingIdx = (incomingState && typeof incomingState.__zur_idx === 'number')
      ? incomingState.__zur_idx
      : (typeof window !== 'undefined' && window.history?.state && typeof window.history.state.__zur_idx === 'number'
          ? window.history.state.__zur_idx
          : undefined);

    if (typeof incomingIdx === 'number') {
      this.currentIndex = incomingIdx;
    }
  }
}

export const navigationHistory = new NavigationHistoryManager();
