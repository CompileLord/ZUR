import { renderIcon } from '../../components/common/icons.ts';

export const LANDING_HEADLINE = 'Understand it.\nThen write it.';
export const LANDING_INTERESTS = ['Python basics', 'Problem solving', 'Building projects', 'Teaching'];
export const LANDING_VIDEO_URL = '/media/zur-bust.webm';

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
  const authLabel = isSignedIn ? 'Continue learning' : 'Explore courses';

  return `
    <div class="zur-hero" data-landing-hero>
      <!-- Hidden compatibility handles for mobile menu controller -->
      <button type="button" class="sr-only" aria-label="Open menu" aria-expanded="false" data-hero-menu-toggle tabindex="-1"></button>
      <div id="landing-mobile-menu" role="dialog" aria-modal="true" class="sr-only" hidden>
        <button type="button" data-hero-menu-close aria-label="Close menu">✕</button>
      </div>

      <div class="hero-container">
        <div class="hero-grid">
          <!-- Left Column: Copy & Actions -->
          <section class="hero-copy" aria-labelledby="hero-heading">
            <div data-hero-entrance="0">
              <h1 id="hero-heading" aria-label="Understand it. Then write it." class="hero-headline">
                <span aria-hidden="true" data-hero-typewriter>Understand it.<br />Then write it.</span>
                <span aria-hidden="true" class="hero-cursor animate-blink" hidden></span>
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

            <!-- Optional topic shortcuts -->
            <div class="hero-topics" data-hero-entrance="0.2">
              <div class="hero-shortcuts" role="group" aria-label="Popular topics">
                <span class="hero-shortcuts-label">Topics:</span>
                ${LANDING_INTERESTS.map(
                  (interest) => `
                  <button type="button" class="hero-pill" aria-pressed="false" data-hero-interest="${interest}">
                    <span class="hero-pill-check" hidden>${renderIcon('check', { size: 14 })}</span>
                    ${interest}
                  </button>
                `
                ).join('')}
              </div>

              <div class="hero-feedback" aria-live="polite" aria-atomic="true">
                <p class="hero-feedback-empty" data-hero-feedback-empty>Select a topic shortcut or explore all courses.</p>
                <div class="hero-feedback-banner" data-hero-feedback-banner hidden>
                  <span data-hero-feedback-text></span>
                  <a href="/courses" data-hero-feedback-link>
                    <span>Explore courses</span>
                    ${renderHeroIcon('arrow-right')}
                  </a>
                </div>
              </div>
            </div>
          </section>

          <!-- Right Column: Interactive Workspace Preview -->
          <div class="hero-workspace-column" aria-label="Example workspace preview">
            <div class="hero-workspace-card workspace-fragment">
              <div class="hero-workspace-header">
                <div class="hero-workspace-tabs">
                  <span class="hero-tab-pill">solution.py</span>
                  <span class="hero-save-badge">✓ Saved</span>
                </div>
                <div class="hero-workspace-tools">
                  <span class="hero-exec-badge hero-exec-run">Run (Samples)</span>
                  <span class="hero-exec-badge hero-exec-submit">Submit</span>
                </div>
              </div>

              <div class="hero-workspace-split">
                <!-- Problem Statement Pane -->
                <div class="hero-workspace-problem">
                  <div class="text-xs font-semibold text-muted mb-1">TASK 1 OF 4</div>
                  <h3 class="text-sm font-semibold text-primary mb-2">Calculate squares of numbers</h3>
                  <p class="text-xs text-secondary leading-relaxed mb-3">
                    Given a list of numbers, return a new list containing each number squared in order.
                  </p>
                  <div class="bg-surface p-2 rounded border border-subtle text-xs">
                    <span class="text-muted block text-micro">Sample Input:</span>
                    <code class="font-mono text-primary">[1, 2, 3, 4, 5]</code>
                  </div>
                </div>

                <!-- Code Editor Pane -->
                <div class="hero-workspace-code">
                  <pre class="hero-code-editor"><code><span class="text-muted"># Write solution function</span>
<span class="text-accent font-semibold">def</span> <span class="font-semibold">calculate_squares</span>(numbers):
    <span class="text-accent">return</span> [n * n <span class="text-accent">for</span> n <span class="text-accent">in</span> numbers]

data = [1, 2, 3, 4, 5]
print(<span class="text-success">"Squares:"</span>, calculate_squares(data))</code></pre>

                  <div class="hero-output-panel">
                    <div class="flex justify-between items-center mb-1">
                      <span class="text-xs font-semibold text-success flex items-center gap-1">✓ Tests passed (2/2)</span>
                      <span class="text-micro text-muted font-mono">0.02s</span>
                    </div>
                    <span class="text-micro text-muted block mb-0.5">Sample output:</span>
                    <code class="font-mono text-xs text-secondary block">Squares: [1, 4, 9, 16, 25]</code>
                  </div>
                </div>
              </div>

              <div class="hero-figure-container">
                <span class="text-xs text-muted">Example workspace · Python 3.14.7</span>
                <button type="button" class="hero-motion-control" aria-pressed="false" data-hero-motion-toggle>
                  ${renderHeroIcon('pause')}
                  <span>Pause motion</span>
                </button>
              </div>

              <!-- Background video handler for controller -->
              <div class="hero-video-frame" aria-hidden="true">
                <video muted playsinline loop preload="none" class="hero-video" data-hero-video>
                  <source src="${LANDING_VIDEO_URL}" type="video/webm" />
                </video>
                <div class="hero-video-error" hidden></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
