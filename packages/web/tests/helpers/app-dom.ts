export interface AppDomStub {
  appEl: { innerHTML: string };
}

export function installAppDom(user: unknown): AppDomStub {
  const store = new Map<string, string>();
  if (user) store.set('zur_current_user', JSON.stringify(user));
  const g = globalThis as any;
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
  const appEl: any = {
    innerHTML: '',
    querySelector: () => null,
    querySelectorAll: () => [],
    classList: { add() {}, remove() {} },
    addEventListener() {},
  };
  g.document = {
    getElementById: () => appEl,
    addEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    documentElement: { dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, style: {} },
    body: appEl,
    title: '',
  };
  g.window = {
    location: { pathname: '/admin', search: '', origin: 'http://localhost' },
    addEventListener() {},
    scrollTo() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  };
  g.MutationObserver = class { observe() {} disconnect() {} };
  return { appEl };
}
