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
      <section class="container-landing landing-workspace" aria-label="Example Python workspace">
        <!-- Accurate Example Workspace Fragment (P01) -->
        <div class="workspace-fragment mt-12" aria-label="Example workspace">
          <div class="workspace-fragment-header">
            <span class="workspace-fragment-label">Example workspace</span>
            <span class="workspace-fragment-meta font-mono text-xs">${PYTHON_RUNTIME_LABEL} · stdin/stdout</span>
          </div>
          <div class="workspace-fragment-body">
            <div class="workspace-fragment-problem">
              <span class="problem-kicker text-xs text-muted">Problem</span>
              <h2 class="problem-title text-base font-semibold mt-1 mb-2">Calculate squares of numbers</h2>
              <p class="text-sm text-secondary mb-3">
                Given a list of integers, return a new list containing the square of each integer in order.
              </p>
              <div class="example-box text-xs">
                <span class="text-muted">Example input:</span>
                <code class="font-mono text-primary block mt-1">[1, 2, 3, 4, 5]</code>
              </div>
            </div>
            <div class="workspace-fragment-code">
              <div class="code-editor-header flex justify-between text-xs text-muted mb-2">
                <span>solution.py</span>
                <span>Read-only illustration</span>
              </div>
              <pre class="code-surface"><code><span class="line-num">1</span> <span class="syntax-keyword">def</span> <span class="syntax-function">calculate_squares</span>(numbers):
<span class="line-num">2</span>     <span class="syntax-comment"># Square each number in the list</span>
<span class="line-num">3</span>     <span class="syntax-keyword">return</span> [n * n <span class="syntax-keyword">for</span> n <span class="syntax-keyword">in</span> numbers]
<span class="line-num">4</span> 
<span class="line-num">5</span> data = [1, 2, 3, 4, 5]
<span class="line-num">6</span> <span class="syntax-function">print</span>(<span class="syntax-string">"Squares:"</span>, <span class="syntax-function">calculate_squares</span>(data))</code></pre>
              <div class="sample-output-box mt-3 pt-3 border-t border-subtle">
                <span class="text-xs text-muted">Sample output:</span>
                <pre class="font-mono text-sm text-primary mt-1"><code>Squares: [1, 4, 9, 16, 25]</code></pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Read → Try → Check Section (P01) -->
      <section class="reading-progression-section border-t border-subtle py-16" aria-labelledby="progression-heading">
        <div class="container-landing">
          <h2 id="progression-heading" class="sr-only">How learning works</h2>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div class="progression-col">
              <div class="progression-rail-marker" aria-hidden="true">
                <span class="rail-ordinal font-mono">01</span>
                <span class="rail-line"></span>
              </div>
              <h3 class="section-title text-lg font-semibold mb-2">Read</h3>
              <p class="text-sm text-secondary leading-relaxed">
                Focused concept explanations with clear syntax and real examples.
              </p>
            </div>
            <div class="progression-col">
              <div class="progression-rail-marker" aria-hidden="true">
                <span class="rail-ordinal font-mono">02</span>
                <span class="rail-line"></span>
              </div>
              <h3 class="section-title text-lg font-semibold mb-2">Try</h3>
              <p class="text-sm text-secondary leading-relaxed">
                Write real Python code directly in the browser. No setup needed.
              </p>
            </div>
            <div class="progression-col">
              <div class="progression-rail-marker" aria-hidden="true">
                <span class="rail-ordinal font-mono">03</span>
                <span class="rail-line"></span>
              </div>
              <h3 class="section-title text-lg font-semibold mb-2">Check</h3>
              <p class="text-sm text-secondary leading-relaxed">
                Instant automated feedback against public test cases and hidden checks.
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- Authoring Section (P01: #teaching) -->
      <section id="teaching" class="authoring-section border-t border-subtle py-16" aria-labelledby="teaching-heading">
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
