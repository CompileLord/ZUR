export const LANDING_HEADLINE = 'Understand it.\nThen write it.';

export function renderHeroIcon(name: 'x' | 'pause' | 'arrow-right'): string {
  const paths = {
    x: '<path d="m6 6 12 12M6 18 18 6"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    'arrow-right': '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  };
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

export function renderLandingHero(isSignedIn = false): string {
  const authHref = isSignedIn ? '/learn' : '/courses';
  const authLabel = isSignedIn ? 'Continue learning' : 'Browse Python courses';

  return `
    <div class="zur-hero" data-landing-hero>
      <div class="hero-scene" aria-hidden="true">
        <canvas class="hero-scene-canvas" data-hero-scene></canvas>
        <div class="hero-scene-glow"></div>
      </div>
      <div class="hero-container">
        <div class="hero-grid">
          <!-- Left Column: Copy & Actions -->
          <section class="hero-copy" aria-labelledby="hero-heading">
            <div data-hero-entrance="0">
              <h1 id="hero-heading" aria-label="Understand it. Then write it." class="hero-headline">
                <!-- The invisible sizer holds the final headline's box so typing never shifts content below. -->
                <span aria-hidden="true" class="hero-headline-sizer">Understand it.<br />Then write it.</span>
                <span aria-hidden="true" class="hero-headline-typed"><span data-hero-typewriter>Understand it.<br />Then write it.</span><span class="hero-cursor animate-blink" hidden></span></span>
              </h1>
            </div>

            <div data-hero-entrance="0.1">
              <p class="hero-description">
                Learn Python through short lessons and real exercises. Create a course that puts practice beside the explanation.
              </p>
            </div>

            <div class="hero-actions" data-hero-entrance="0.15">
              <a href="${authHref}" class="hero-primary">
                <span>${authLabel}</span>
                ${renderHeroIcon('arrow-right')}
              </a>
              <a href="#teaching" class="hero-secondary">
                See how teaching works
              </a>
            </div>
          </section>

          <!-- Right Column: stage for the WebGL sculpture rendered behind the grid -->
          <div class="hero-stage">
            <button type="button" class="hero-motion-control" aria-pressed="false" data-hero-motion-toggle>
              ${renderHeroIcon('pause')}
              <span>Pause motion</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}
