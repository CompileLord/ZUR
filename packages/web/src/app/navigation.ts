type RenderHandler = (path?: string) => void;
type S2PageHandler = (pageId: string, params: Record<string, string>, path: string) => Promise<void>;

const handlers: { render: RenderHandler | null; loadS2Page: S2PageHandler | null } = { render: null, loadS2Page: null };

/**
 * Page controllers call renderApp/navigateTo/loadS2Page through this module and the bootstrap
 * (main.ts) registers the real implementations, so controllers never import the router switch.
 */
export function registerAppHandlers(render: RenderHandler, loadS2PageImpl: S2PageHandler): void {
  handlers.render = render;
  handlers.loadS2Page = loadS2PageImpl;
}

export function renderApp(path?: string): void {
  handlers.render!(path);
}

export function navigateTo(path: string): void {
  window.history.pushState({}, '', path);
  renderApp(path);
}

export function loadS2Page(pageId: string, params: Record<string, string>, path: string): Promise<void> {
  return handlers.loadS2Page!(pageId, params, path);
}
