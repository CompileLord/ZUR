import { animate, type AnimationPlaybackControls } from 'motion';
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
  if (!reducedMotion.matches) {
    text.textContent = ''; cursor.hidden = false;
    typingDelay = setTimeout(() => {
      let index = 0;
      typingTimer = setInterval(() => {
        index += 1; text.textContent = LANDING_HEADLINE.slice(0, index);
        if (index >= LANDING_HEADLINE.length) finishTyping();
      }, 38);
    }, 600);
    root.querySelectorAll<HTMLElement>('[data-hero-entrance]').forEach(element => {
      track(animate(element, { opacity: [0, 1], y: [20, 0] }, { duration: .6, delay: Number(element.dataset.heroEntrance), ease: [.2, 0, 0, 1] }));
    });
  }

  const selected = new Set<string>();
  const feedback = root.querySelector<HTMLElement>('.hero-feedback')!;
  const empty = root.querySelector<HTMLElement>('[data-hero-feedback-empty]')!;
  const banner = root.querySelector<HTMLElement>('[data-hero-feedback-banner]')!;
  const feedbackText = root.querySelector<HTMLElement>('[data-hero-feedback-text]')!;
  const feedbackLink = root.querySelector<HTMLAnchorElement>('[data-hero-feedback-link]')!;
  let feedbackAnimation: AnimationPlaybackControls | undefined;
  root.querySelectorAll<HTMLButtonElement>('[data-hero-interest]').forEach(button => {
    button.addEventListener('click', () => {
      const interest = button.dataset.heroInterest!;
      if (selected.has(interest)) selected.delete(interest); else selected.add(interest);
      const active = selected.has(interest);
      button.setAttribute('aria-pressed', String(active));
      const check = button.querySelector<HTMLElement>('.hero-pill-check')!;
      check.hidden = !active;
      if (active && !reducedMotion.matches) track(animate(check, { opacity: [0, 1], scale: [.5, 1] }, { type: 'spring', stiffness: 300, damping: 20 }));
      feedbackAnimation?.cancel(); feedback.style.height = '';
      const oldHeight = feedback.getBoundingClientRect().height;
      empty.hidden = selected.size > 0; banner.hidden = selected.size === 0;
      feedbackText.textContent = `Your interests: ${Array.from(selected).join(', ')}`;
      const teachingOnly = selected.size === 1 && selected.has('Teaching');
      feedbackLink.href = teachingOnly ? '#teaching' : '/courses';
      feedbackLink.querySelector('span')!.textContent = teachingOnly ? 'See how to teach' : 'Explore courses';
      if (!reducedMotion.matches) {
        const newHeight = feedback.getBoundingClientRect().height;
        feedbackAnimation = track(animate(feedback, { height: [oldHeight, newHeight] }, { type: 'spring', stiffness: 300, damping: 30 }));
        const current = feedbackAnimation;
        void current.finished.then(() => { if (!disposed && current === feedbackAnimation) feedback.style.height = ''; });
        track(animate(selected.size ? banner : empty, { opacity: [0, 1], y: [4, 0] }, { duration: .2 }));
      }
    }, { signal });
  });

  const menuButton = root.querySelector<HTMLButtonElement>('[data-hero-menu-toggle]')!;
  const menu = root.querySelector<HTMLElement>('#landing-mobile-menu')!;
  let menuOpen = false;
  let menuAnimation: AnimationPlaybackControls | undefined;
  let previousOverflow = '';
  const inertElements = Array.from(document.querySelectorAll<HTMLElement>('.hero-nav, .hero-content, .hero-video-frame, .landing-page > section, .public-footer'));
  const previousInert = new Map(inertElements.map(element => [element, element.inert]));
  function closeMenu(restoreFocus = true) {
    if (!menuOpen) return;
    menuOpen = false;
    menuButton.setAttribute('aria-expanded', 'false'); menuButton.setAttribute('aria-label', 'Open menu');
    document.body.style.overflow = previousOverflow;
    for (const element of inertElements) element.inert = previousInert.get(element) || false;
    menuAnimation?.cancel();
    if (restoreFocus && menuButton.isConnected) menuButton.focus();
    if (reducedMotion.matches || disposed) menu.hidden = true;
    else {
      menu.inert = true;
      menuAnimation = track(animate(menu, { opacity: [1, 0] }, { duration: .2 }));
      void menuAnimation.finished.then(() => { if (!menuOpen) menu.hidden = true; });
    }
  }
  menuButton.addEventListener('click', () => {
    if (menuOpen) { closeMenu(); return; }
    menuOpen = true; menuAnimation?.cancel(); menu.hidden = false; menu.inert = false;
    menuButton.setAttribute('aria-expanded', 'true'); menuButton.setAttribute('aria-label', 'Close menu');
    previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    for (const element of inertElements) element.inert = true;
    if (!reducedMotion.matches) menuAnimation = track(animate(menu, { opacity: [0, 1] }, { duration: .2 }));
    menu.querySelector<HTMLButtonElement>('button')?.focus();
  }, { signal });
  root.querySelector('[data-hero-menu-close]')!.addEventListener('click', () => closeMenu(), { signal });
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); closeMenu(); }
    if (event.key !== 'Tab') return;
    const items = Array.from(menu.querySelectorAll<HTMLElement>('button, a'));
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }, { signal });
  root.addEventListener('click', event => {
    const link = (event.target as Element).closest<HTMLAnchorElement>('a');
    if (!link) return;
    if (link.getAttribute('href') === '#teaching' && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0) {
      event.preventDefault(); event.stopPropagation(); closeMenu(false);
      const teaching = document.getElementById('teaching');
      teaching?.scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' });
      const heading = teaching?.querySelector<HTMLElement>('h2');
      heading?.setAttribute('tabindex', '-1'); heading?.focus({ preventScroll: true });
      history.replaceState(history.state, '', '#teaching');
    } else if (menu.contains(link)) closeMenu(false);
  }, { signal });

  const video = root.querySelector<HTMLVideoElement>('[data-hero-video]')!;
  const motionButton = root.querySelector<HTMLButtonElement>('[data-hero-motion-toggle]')!;
  let paused = false;
  let previousX: number | null = null;
  let targetTime = 0;
  let seekFrame = 0;
  let lastSeekAt = 0;
  let videoVisible = false;
  let videoLoaded = false;
  let loadTimer: ReturnType<typeof setTimeout> | undefined;
  const seek = (now: number) => {
    seekFrame = 0;
    if (disposed || paused || reducedMotion.matches || !videoVisible || video.seeking || !Number.isFinite(video.duration)) return;
    if (now - lastSeekAt < 60) { seekFrame = requestAnimationFrame(seek); return; }
    if (Math.abs(video.currentTime - targetTime) > .025) {
      lastSeekAt = now;
      video.currentTime = targetTime;
    }
  };
  const requestSeek = () => { if (!seekFrame) seekFrame = requestAnimationFrame(seek); };
  const loadVideo = () => {
    if (disposed || videoLoaded || reducedMotion.matches || !video.canPlayType('video/webm; codecs="vp9"')) return;
    videoLoaded = true; video.preload = 'auto'; video.load();
  };
  const playback = () => {
    previousX = null;
    const mobile = window.innerWidth < 1024;
    video.autoplay = mobile && !paused && !reducedMotion.matches;
    motionButton.hidden = reducedMotion.matches || Boolean(video.error);
    if (videoLoaded && video.autoplay && videoVisible && !document.hidden) void video.play().catch(() => {
      if (!disposed) { paused = true; updateMotionButton(); }
    });
    else video.pause();
    targetTime = video.currentTime;
  };
  function updateMotionButton() {
    motionButton.setAttribute('aria-pressed', String(paused));
    motionButton.innerHTML = `${paused ? renderIcon('play', { size: 14 }) : renderHeroIcon('pause')}<span>${paused ? 'Resume motion' : 'Pause motion'}</span>`;
  }
  window.addEventListener('mousemove', event => {
    if (window.innerWidth < 1024 || paused || reducedMotion.matches || document.hidden || !videoVisible) return;
    if (previousX === null) { previousX = event.clientX; return; }
    const delta = event.clientX - previousX; previousX = event.clientX;
    if (!Number.isFinite(video.duration)) return;
    targetTime = Math.min(video.duration, Math.max(0, targetTime + (delta / window.innerWidth) * .8 * video.duration));
    requestSeek();
  }, { passive: true, signal });
  video.addEventListener('seeked', requestSeek, { signal });
  video.addEventListener('loadedmetadata', playback, { signal });
  video.addEventListener('error', () => {
    motionButton.hidden = true;
    root.querySelector<HTMLElement>('.hero-video-error')!.hidden = false;
  }, { signal });
  motionButton.addEventListener('click', () => { paused = !paused; updateMotionButton(); if (!paused) loadVideo(); playback(); }, { signal });
  const observer = new IntersectionObserver(entries => {
    videoVisible = entries[0].isIntersecting;
    if (videoVisible && !videoLoaded && !reducedMotion.matches && !(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) {
      clearTimeout(loadTimer); loadTimer = setTimeout(loadVideo, 350);
    }
    playback();
  });
  observer.observe(video);
  window.addEventListener('resize', () => { playback(); if (window.innerWidth >= 768) closeMenu(false); }, { signal });
  document.addEventListener('visibilitychange', playback, { signal });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) {
      finishTyping(); for (const animation of animations) animation.complete();
      feedback.style.height = '';
    }
    playback();
    if (!reducedMotion.matches && videoVisible) loadVideo();
  }, { signal });
  playback();
  root.dataset.heroReady = 'true';
  return () => {
    disposed = true; closeMenu(false); controller.abort(); observer.disconnect(); clearTimeout(loadTimer);
    finishTyping(); video.pause(); video.removeAttribute('autoplay');
    cancelAnimationFrame(seekFrame);
    for (const animation of animations) animation.cancel();
  };
}
