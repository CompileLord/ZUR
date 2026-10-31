import { animate, inView, stagger, type AnimationPlaybackControls } from 'motion';
import type { LandingScene } from './LandingScene.ts';
import type { LandingAmbient } from './LandingAmbient.ts';
import { LANDING_HEADLINE, renderHeroIcon } from './LandingHero.ts';
import { renderIcon } from '../../components/common/icons.ts';
import './landing-hero.css';

/** Enhance the server-style HTML; every listener, timer and animation belongs to this route. */
export function initLandingHero(root: HTMLElement): () => void {
  const controller = new AbortController();
  const { signal } = controller;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const animations = new Set<AnimationPlaybackControls>();
  const track = (animation: AnimationPlaybackControls) => {
    animations.add(animation);
    void animation.finished.then(() => animations.delete(animation));
    return animation;
  };
  let disposed = false;
  let typingTimer: ReturnType<typeof setInterval> | undefined;
  let typingDelay: ReturnType<typeof setTimeout> | undefined;
  const text = root.querySelector<HTMLElement>('[data-hero-typewriter]')!;
  const cursor = root.querySelector<HTMLElement>('.hero-cursor')!;
  const finishTyping = () => {
    clearTimeout(typingDelay); clearInterval(typingTimer);
    text.textContent = LANDING_HEADLINE; cursor.hidden = true;
  };
  // Type the headline once; it then stays readable.
  const startTyping = () => {
    finishTyping();
    if (disposed || reducedMotion.matches) return;
    cursor.hidden = false;
    let index = 0;
    text.textContent = '';
    typingTimer = setInterval(() => {
      text.textContent = LANDING_HEADLINE.slice(0, ++index);
      if (index < LANDING_HEADLINE.length) return;
      clearInterval(typingTimer);
      typingDelay = setTimeout(finishTyping, 600);
    }, 45);
  };
  if (!reducedMotion.matches) {
    startTyping();
    root.querySelectorAll<HTMLElement>('[data-hero-entrance]').forEach(element => {
      track(animate(element, { opacity: [0, 1], y: [20, 0] }, { duration: .3, delay: Number(element.dataset.heroEntrance), ease: [.2, 0, 0, 1] }));
    });
  }

  // WebGL backdrop is loaded lazily so three.js never blocks the first paint.
  let scene: LandingScene | null = null;
  const sceneCanvas = root.querySelector<HTMLCanvasElement>('[data-hero-scene]')!;
  const loadScene = () => {
    if (scene || disposed || reducedMotion.matches) return;
    void import('./LandingScene.ts').then(({ initLandingScene }) => {
      if (disposed || scene || reducedMotion.matches) return;
      scene = initLandingScene(sceneCanvas, root);
      scene?.setPaused(paused);
    });
  };
  let ambient: LandingAmbient | null = null;
  const ambientCanvas = document.querySelector<HTMLCanvasElement>('[data-landing-ambient]');
  const loadAmbient = () => {
    if (ambient || disposed || reducedMotion.matches || !ambientCanvas) return;
    void import('./LandingAmbient.ts').then(({ initLandingAmbient }) => {
      if (disposed || ambient || reducedMotion.matches) return;
      ambient = initLandingAmbient(ambientCanvas, root);
      ambient?.setPaused(paused);
    });
  };
  loadScene();
  // The page-wide layer waits for idle time so it never competes with the hero for the first frames.
  const ambientIdle = setTimeout(loadAmbient, 900);

  // 3D tilt with a cursor-following sheen on cards below the hero.
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  document.querySelectorAll<HTMLElement>('.landing-page [data-tilt]').forEach(card => {
    card.addEventListener('pointermove', event => {
      if (reducedMotion.matches || paused || !finePointer.matches) return;
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width, y = (event.clientY - rect.top) / rect.height;
      card.style.setProperty('--tilt-x', `${(.5 - y) * 8}deg`);
      card.style.setProperty('--tilt-y', `${(x - .5) * 10}deg`);
      card.style.setProperty('--sheen-x', `${x * 100}%`);
      card.style.setProperty('--sheen-y', `${y * 100}%`);
      card.dataset.tiltActive = 'true';
    }, { signal });
    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--tilt-x', '0deg'); card.style.setProperty('--tilt-y', '0deg');
      delete card.dataset.tiltActive;
    }, { signal });
  });

  const stopReveals: Array<() => void> = [];
  if (!reducedMotion.matches) {
    document.querySelectorAll<HTMLElement>('.landing-page > section').forEach(section => {
      const items = section.querySelectorAll<HTMLElement>('h2, .landing-step-card, .teaching-tree-card, .max-w-reading > p');
      items.forEach(item => { item.style.opacity = '0'; });
      stopReveals.push(inView(section, () => {
        track(animate(items, { opacity: [0, 1], y: [28, 0], filter: ['blur(6px)', 'blur(0px)'] },
          { duration: .7, delay: stagger(.06), ease: [.2, 0, 0, 1] }));
      }, { amount: .15 }));
    });
  }

  root.addEventListener('click', event => {
    const link = (event.target as Element).closest<HTMLAnchorElement>('a');
    if (link?.getAttribute('href') !== '#teaching' || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    const teaching = document.getElementById('teaching');
    teaching?.scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' });
    const heading = teaching?.querySelector<HTMLElement>('h2');
    heading?.setAttribute('tabindex', '-1'); heading?.focus({ preventScroll: true });
    history.replaceState(history.state, '', '#teaching');
  }, { signal });

  const motionButton = root.querySelector<HTMLButtonElement>('[data-hero-motion-toggle]')!;
  let paused = false;
  function updateMotionButton() {
    motionButton.hidden = reducedMotion.matches;
    motionButton.setAttribute('aria-pressed', String(paused));
    motionButton.innerHTML = `${paused ? renderIcon('play', { size: 14 }) : renderHeroIcon('pause')}<span>${paused ? 'Resume motion' : 'Pause motion'}</span>`;
  }
  motionButton.addEventListener('click', () => { paused = !paused; scene?.setPaused(paused); ambient?.setPaused(paused); finishTyping(); updateMotionButton(); }, { signal });
  updateMotionButton();
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) {
      scene?.dispose(); scene = null; ambient?.dispose(); ambient = null;
      finishTyping(); for (const animation of animations) animation.complete();
    }
    updateMotionButton();
    loadScene(); loadAmbient();
  }, { signal });
  root.dataset.heroReady = 'true';
  return () => {
    disposed = true; controller.abort();
    finishTyping();
    for (const animation of animations) animation.cancel();
    clearTimeout(ambientIdle); scene?.dispose(); ambient?.dispose(); stopReveals.forEach(stop => stop());
    document.querySelectorAll<HTMLElement>('.landing-page > section *').forEach(item => { item.style.opacity = ''; item.style.transform = ''; item.style.filter = ''; });
  };
}
