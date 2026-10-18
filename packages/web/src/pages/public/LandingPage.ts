import { renderIcon } from '../../components/common/icons.ts';
import { renderLandingHero } from './LandingHero.ts';
import { PYTHON_RUNTIME_LABEL } from 'zur-shared';

export interface LandingPageProps {
  isSignedIn?: boolean;
}

export function renderLandingPage(props: LandingPageProps = {}): string {
  const primaryCta = props.isSignedIn
    ? `<a href="/learn" class="btn btn-primary">Continue learning</a>`
    : `<a href="/courses" class="btn btn-primary">Explore courses</a>`;

  const sampleTree = `<ul class="landing-static-tree">
    <li>${renderIcon('book')}<strong>Python foundations</strong></li>
    <li>${renderIcon('folder')}Variables and Types</li>
    <li class="tree-step">${renderIcon('file-text')}What is a variable?</li>
    <li class="tree-step">${renderIcon('list-checks')}Assignment syntax</li>
    <li class="tree-step">${renderIcon('code')}Echoing Numbers</li>
  </ul>`;

  return `
    <div class="landing-page">
      ${renderLandingHero(Boolean(props.isSignedIn))}


      <!-- Read → Try → Check Section (P01) -->
      <section class="reading-progression-section landing-steps" aria-labelledby="progression-heading">
        <div class="container-landing">
          <h2 id="progression-heading" class="landing-section-title">How learning works</h2>
          <div class="landing-step-grid">
            <div class="progression-col landing-step-card">
              <div class="landing-step-visual" aria-hidden="true">
                <svg viewBox="0 0 120 64" fill="none"><rect x="14" y="8" width="92" height="48" rx="6" class="v-surface"/><rect x="24" y="18" width="48" height="5" rx="2.5" class="v-strong"/><rect x="24" y="29" width="72" height="4" rx="2" class="v-soft"/><rect x="24" y="38" width="62" height="4" rx="2" class="v-soft"/><rect x="24" y="47" width="30" height="4" rx="2" class="v-soft"/></svg>
              </div>
              <span class="landing-step-ordinal font-mono">01 · ${renderIcon('book', { size: 14 })}</span>
              <h3 class="landing-step-title">Read</h3>
              <p class="landing-step-text">
                Focused concept explanations with clear syntax and real examples.
              </p>
            </div>
            <div class="progression-col landing-step-card">
              <div class="landing-step-visual" aria-hidden="true">
                <svg viewBox="0 0 120 64" fill="none"><rect x="14" y="8" width="92" height="48" rx="6" class="v-surface"/><path d="m28 22 8 7-8 7" class="v-line"/><rect x="44" y="34" width="26" height="4" rx="2" class="v-accent"/><rect x="44" y="24" width="40" height="4" rx="2" class="v-soft"/><rect x="44" y="44" width="50" height="4" rx="2" class="v-soft"/></svg>
              </div>
              <span class="landing-step-ordinal font-mono">02 · ${renderIcon('code', { size: 14 })}</span>
              <h3 class="landing-step-title">Try</h3>
              <p class="landing-step-text">
                Write real Python code directly in the browser. No setup needed.
              </p>
            </div>
            <div class="progression-col landing-step-card">
              <div class="landing-step-visual" aria-hidden="true">
                <svg viewBox="0 0 120 64" fill="none"><rect x="14" y="8" width="92" height="48" rx="6" class="v-surface"/><circle cx="34" cy="24" r="6" class="v-ok"/><path d="m31 24 2.2 2.2L37.5 22" class="v-tick"/><rect x="46" y="22" width="48" height="4" rx="2" class="v-soft"/><circle cx="34" cy="42" r="6" class="v-ok"/><path d="m31 42 2.2 2.2L37.5 40" class="v-tick"/><rect x="46" y="40" width="36" height="4" rx="2" class="v-soft"/></svg>
              </div>
              <span class="landing-step-ordinal font-mono">03 · ${renderIcon('list-checks', { size: 14 })}</span>
              <h3 class="landing-step-title">Check</h3>
              <p class="landing-step-text">
                Instant automated feedback against public test cases and hidden checks.
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- Authoring Section (P01: #teaching) -->
      <section id="teaching" class="authoring-section landing-teach" aria-labelledby="teaching-heading">
        <div class="container-landing">
          <div class="mb-10 max-w-reading">
            <h2 id="teaching-heading" class="page-title font-semibold mb-3">Teach with practice beside explanation</h2>
            <p class="text-secondary leading-relaxed">
              Bring short explanations, quizzes, and Python exercises together in one course.
            </p>
          </div>

          <div class="authoring-grid grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
            <div class="teaching-tree-card p-6 bg-surface border border-subtle rounded-lg" aria-label="Course structure illustration">
              <div class="flex justify-between items-center mb-4">
                <span class="text-sm font-semibold text-secondary">Example course outline</span>
              </div>
              ${sampleTree}
            </div>

            <div class="teaching-steps flex flex-col gap-6">
              <div class="teaching-step">
                <span class="teaching-step-num font-mono text-accent font-semibold">1</span>
                <div>
                  <h3 class="font-semibold text-primary mb-1">Structure modules and lessons</h3>
                  <p class="text-sm text-secondary leading-relaxed">
                    Give each lesson a clear path from reading to practice.
                  </p>
                </div>
              </div>

              <div class="teaching-step">
                <span class="teaching-step-num font-mono text-accent font-semibold">2</span>
                <div>
                  <h3 class="font-semibold text-primary mb-1">Write explanations and Python exercises</h3>
                  <p class="text-sm text-secondary leading-relaxed">
                    Combine a focused explanation with a quiz or code challenge.
                  </p>
                </div>
              </div>

              <div class="teaching-step">
                <span class="teaching-step-num font-mono text-accent font-semibold">3</span>
                <div>
                  <h3 class="font-semibold text-primary mb-1">Validate reference solutions</h3>
                  <p class="text-sm text-secondary leading-relaxed">
                    Check each exercise against a working solution before publishing.
                  </p>
                </div>
              </div>

              <div class="teaching-step">
                <span class="teaching-step-num font-mono text-accent font-semibold">4</span>
                <div>
                  <h3 class="font-semibold text-primary mb-1">Publish when you’re ready</h3>
                  <p class="text-sm text-secondary leading-relaxed">
                    Release updates while students keep their current version and progress.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div class="landing-final-cta border-t border-subtle flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 class="font-semibold text-primary mb-1">Ready to start?</h3>
              <p class="text-sm text-secondary">Browse published courses and begin practicing immediately.</p>
            </div>
            <div>
              ${primaryCta}
            </div>
          </div>
        </div>
      </section>
    </div>
  `;
}
