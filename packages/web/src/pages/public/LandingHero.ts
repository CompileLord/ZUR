import { renderIcon } from '../../components/common/icons.ts';

export const LANDING_HEADLINE = 'Understand it.\nThen write it.';
export const LANDING_INTERESTS = ['Python basics', 'Problem solving', 'Building projects', 'Teaching'];
export const LANDING_VIDEO_URL = '/media/zur-bust.webm';

export function renderHeroIcon(name: 'x' | 'pause' | 'arrow-right'): string {
  const paths = { x: '<path d="m6 6 12 12M6 18 18 6"/>', pause: '<path d="M8 5v14M16 5v14"/>', 'arrow-right': '<path d="M5 12h14m-6-6 6 6-6 6"/>' };
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

export function renderLandingHero(isSignedIn = false): string {
  const authHref = isSignedIn ? '/learn' : '/sign-in';
  const authLabel = isSignedIn ? 'Continue learning' : 'Sign in';
  const nav = `<a href="/courses">Courses</a><a href="#teaching">For teachers</a><a href="/help">Help</a>`;
  return `
    <div class="zur-hero zh:relative zh:font-sans zh:antialiased zh:flex zh:flex-col zh:lg:block" data-landing-hero>
      <header class="hero-nav zh:fixed zh:top-0 zh:inset-x-0 zh:z-20 zh:px-6 zh:sm:px-8 zh:py-5">
        <div class="zh:max-w-[1200px] zh:mx-auto zh:flex zh:justify-between zh:items-center">
          <a href="/" aria-label="ZUR Home" class="hero-wordmark zh:flex zh:items-center zh:gap-3"><span class="hero-wordmark-mark" aria-hidden="true"></span>ZUR</a>
          <nav class="hero-desktop-links zh:hidden zh:md:flex zh:items-center zh:gap-8" aria-label="Main navigation">${nav}</nav>
          <a class="hero-contact zh:hidden zh:md:block zh:transition-opacity zh:hover:opacity-70" href="${authHref}">${authLabel}</a>
          <button type="button" class="hero-menu-trigger zh:md:hidden zh:flex zh:flex-col zh:gap-[5px] zh:p-2 zh:bg-transparent zh:border-0" aria-label="Open menu" aria-expanded="false" aria-controls="landing-mobile-menu" data-hero-menu-toggle>
            <span class="hero-burger-line zh:block zh:w-6 zh:h-[2px]"></span><span class="hero-burger-line zh:block zh:w-6 zh:h-[2px]"></span><span class="hero-burger-line zh:block zh:w-6 zh:h-[2px]"></span>
          </button>
        </div>
      </header>
      <div id="landing-mobile-menu" role="dialog" aria-modal="true" aria-label="Navigation menu" class="hero-mobile-menu zh:fixed zh:inset-0 zh:z-30 zh:md:hidden zh:flex zh:flex-col zh:justify-center zh:gap-8 zh:px-8" hidden>
        <button type="button" aria-label="Close menu" class="hero-menu-close zh:absolute zh:top-5 zh:right-6 zh:p-2 zh:border-0 zh:bg-transparent" data-hero-menu-close>${renderHeroIcon('x')}</button>
        ${nav}<a href="${authHref}">${authLabel}</a>
      </div>
      <div class="hero-video-frame zh:order-last zh:lg:order-none zh:relative zh:overflow-hidden zh:w-full zh:aspect-square zh:md:aspect-video zh:lg:aspect-auto">
        <video muted playsinline loop preload="none" poster="/media/zur-bust-poster.webp" width="500" height="540" aria-hidden="true" class="hero-video zh:pointer-events-none zh:w-full zh:h-full zh:object-cover zh:object-right" data-hero-video>
          <source src="${LANDING_VIDEO_URL}" type="video/webm" />
        </video>
        <div class="hero-video-error" aria-hidden="true" hidden><span>Read. Try. Check.</span></div>
        <button type="button" class="hero-motion-control" aria-pressed="false" data-hero-motion-toggle>${renderHeroIcon('pause')}<span>Pause motion</span></button>
      </div>
      <div class="hero-content zh:relative zh:z-10 zh:order-first zh:lg:order-none zh:w-full zh:mx-auto zh:px-6 zh:sm:px-8 zh:flex zh:flex-col zh:justify-center zh:pointer-events-none">
        <section id="spade-hero" class="hero-copy zh:pointer-events-auto" aria-labelledby="hero-heading">
          <div data-hero-entrance="0">
            <h1 id="hero-heading" aria-label="Understand it. Then write it." class="hero-headline zh:whitespace-pre-wrap"><span aria-hidden="true" data-hero-typewriter>Understand it.<br />Then write it.</span><span aria-hidden="true" class="hero-cursor animate-blink zh:inline-block zh:w-[2px] zh:h-[1.1em] zh:align-middle zh:ml-[2px]" hidden></span></h1>
          </div>
          <div data-hero-entrance="0.1"><p class="hero-description zh:mb-9">Learn Python through short lessons and real exercises. Create a course that puts practice beside the explanation.</p></div>
          <div data-hero-entrance="0.2">
            <h2 class="hero-interest-title">What would you like to explore?</h2>
            <p class="hero-interest-hint">Select all that interest you</p>
            <div class="zh:flex zh:flex-wrap zh:gap-2" role="group" aria-label="Learning interests">
              ${LANDING_INTERESTS.map(interest => `<button type="button" class="hero-pill" aria-pressed="false" data-hero-interest="${interest}"><span class="hero-pill-check" hidden>${renderIcon('check', { size: 16 })}</span>${interest}</button>`).join('')}
            </div>
            <div class="hero-feedback" aria-live="polite" aria-atomic="true">
              <p class="hero-feedback-empty" data-hero-feedback-empty>Choose an interest, or explore all courses below.</p>
              <div class="hero-feedback-banner" data-hero-feedback-banner hidden><span data-hero-feedback-text></span><a href="/courses" data-hero-feedback-link><span>Explore courses</span>${renderHeroIcon('arrow-right')}</a></div>
            </div>
            <div class="hero-actions zh:flex zh:items-center zh:flex-wrap zh:gap-6 zh:mt-4">
              <a href="${isSignedIn ? '/learn' : '/courses'}" class="hero-primary zh:inline-flex zh:items-center zh:gap-3 zh:px-5 zh:py-3 zh:rounded-lg zh:text-sm zh:font-medium zh:transition-colors">${isSignedIn ? 'Continue learning' : 'Explore courses'}${renderHeroIcon('arrow-right')}</a>
              <a href="#teaching" class="hero-secondary">See how teaching works</a>
            </div>
          </div>
        </section>
      </div>
    </div>
  `;
}
