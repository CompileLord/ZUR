import { app, appEl } from './state.ts';

export const lessonMediaObjectUrls = new Set<string>();

export function releaseLessonMediaObjectUrls(): void {
  for (const url of lessonMediaObjectUrls) URL.revokeObjectURL(url);
  lessonMediaObjectUrls.clear();
  if (app.lessonVideoLoadTimer) window.clearTimeout(app.lessonVideoLoadTimer);
  app.lessonVideoLoadTimer = undefined;
  app.lessonVideoReadyCleanup?.();
  app.lessonVideoReadyCleanup = undefined;
}

export async function hydrateDeferredAssets(container: HTMLElement = appEl): Promise<void> {
  const mediaImages = [...container.querySelectorAll<HTMLImageElement>('img[src^="about:blank#zur-asset-"], img[data-authorized-asset]')];
  for (const image of mediaImages) {
    if (image.src.startsWith('blob:') || image.src.startsWith('data:')) continue;
    const assetId = image.dataset.authorizedAsset || '';
    if (!/^[0-9a-f-]{36}$/i.test(assetId)) continue;
    try {
      const response = await fetch(`/api/assets/${encodeURIComponent(assetId)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('media unavailable');
      const blob = await response.blob();
      if (!/^image\/(png|jpeg|webp|gif)$/.test(blob.type)) throw new Error('unsupported media');
      const objectUrl = URL.createObjectURL(blob);
      lessonMediaObjectUrls.add(objectUrl);
      image.src = objectUrl;
      image.addEventListener('error', () => {
        URL.revokeObjectURL(objectUrl);
        lessonMediaObjectUrls.delete(objectUrl);
        const fallback = document.createElement('span');
        fallback.className = 'lesson-media-fallback';
        fallback.setAttribute('role', 'status');
        fallback.textContent = image.alt ? `Image unavailable: ${image.alt}.` : 'Image unavailable.';
        image.replaceWith(fallback);
      }, { once: true });
    } catch {
      const fallback = document.createElement('span');
      fallback.className = 'lesson-media-fallback';
      fallback.setAttribute('role', 'status');
      fallback.textContent = image.alt ? `Image unavailable: ${image.alt}.` : 'Image unavailable.';
      image.replaceWith(fallback);
    }
  }
}
