import { renderContentTree } from '../../components/common/ContentTree.ts';

export interface LandingPageProps {
  isSignedIn?: boolean;
}

export function renderLandingPage(props: LandingPageProps = {}): string {
  const primaryCta = props.isSignedIn
    ? `<a href="/learn" class="btn btn-primary">Continue learning</a>`
    : `<a href="/courses" class="btn btn-primary">Explore courses</a>`;

  const sampleTree = renderContentTree({
    courseTitle: 'Python foundations',
    modules: [
      {
        id: 'mod-demo-1',
        title: 'Variables and Types',
        lessons: [
          {
            id: 'les-demo-1',
            title: 'Naming and Values',
            steps: [
              { id: 'st-1', title: 'What is a variable?', type: 'theory' },
              { id: 'st-2', title: 'Assignment syntax', type: 'quiz' },
              { id: 'st-3', title: 'Echoing Numbers', type: 'python', isSelected: true },
            ],
          },
        ],
      },
    ],
    selectedId: 'st-3',
  });

  return `
    <div class="landing-page">
      <!-- Hero Introduction (P01) -->
      <section class="container-landing py-16" aria-labelledby="hero-heading">
        <div class="hero-grid">
          <div class="hero-text-col">
            <h1 id="hero-heading" class="display-title mb-4">Understand it.<br />Then write it.</h1>
            <p class="prose text-secondary mb-6 max-w-reading">
              Learn Python through short lessons and real exercises. Create a course that puts practice beside the explanation.
            </p>
            <div class="landing-actions flex items-center gap-4">
              ${primaryCta}
              <a href="#teaching" class="text-link">See how teaching works</a>
            </div>
          </div>
        </div>

        <!-- Accurate Example Workspace Fragment (P01) -->
        <div class="workspace-fragment mt-12" aria-label="Example workspace">
          <div class="workspace-fragment-header">
            <span class="workspace-fragment-label">Example workspace</span>
            <span class="workspace-fragment-meta font-mono text-xs">Python 3.12 · stdin/stdout</span>
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
                Focused concept explanations with clear syntax and real examples. No lengthy theory blocks or irrelevant tangents.
              </p>
            </div>
            <div class="progression-col">
              <div class="progression-rail-marker" aria-hidden="true">
                <span class="rail-ordinal font-mono">02</span>
                <span class="rail-line"></span>
              </div>
              <h3 class="section-title text-lg font-semibold mb-2">Try</h3>
              <p class="text-sm text-secondary leading-relaxed">
                Write real Python code directly in the browser. Zero software installation, environment configuration, or setup friction.
              </p>
            </div>
            <div class="progression-col">
              <div class="progression-rail-marker" aria-hidden="true">
                <span class="rail-ordinal font-mono">03</span>
                <span class="rail-line"></span>
              </div>
              <h3 class="section-title text-lg font-semibold mb-2">Check</h3>
              <p class="text-sm text-secondary leading-relaxed">
                Instant automated feedback against public test cases and protected hidden checks. Learn from clear, honest diagnostics.
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
              Build interactive Python courses in a single unified workspace. Combine short explanations, videos, quizzes, and code exercises backed by reference solutions.
            </p>
          </div>

          <div class="authoring-grid grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
            <div class="teaching-tree-card p-6 bg-surface border border-subtle rounded-lg" aria-label="Course structure illustration">
              <div class="flex justify-between items-center mb-4">
                <span class="text-xs font-semibold uppercase tracking-wider text-muted">Course Builder Tree</span>
                <span class="status-badge success text-xs">Validated</span>
              </div>
              ${sampleTree}
            </div>

            <div class="teaching-steps flex flex-col gap-6">
              <div class="teaching-step">
                <span class="teaching-step-num font-mono text-accent font-semibold">1</span>
                <div>
                  <h3 class="font-semibold text-primary mb-1">Structure modules and lessons</h3>
                  <p class="text-sm text-secondary leading-relaxed">
                    Organize your curriculum with clear modules, lessons, and 1–20 focused steps per lesson.
                  </p>
                </div>
              </div>

              <div class="teaching-step">
                <span class="teaching-step-num font-mono text-accent font-semibold">2</span>
                <div>
                  <h3 class="font-semibold text-primary mb-1">Write explanations and Python exercises</h3>
                  <p class="text-sm text-secondary leading-relaxed">
                    Embed Theory markdown, verified video transcripts, single or multiple-choice quizzes, and Python challenges.
                  </p>
                </div>
              </div>

              <div class="teaching-step">
                <span class="teaching-step-num font-mono text-accent font-semibold">3</span>
                <div>
                  <h3 class="font-semibold text-primary mb-1">Validate reference solutions</h3>
                  <p class="text-sm text-secondary leading-relaxed">
                    Every exercise requires a passing reference solution and hidden checks before publishing is permitted.
                  </p>
                </div>
              </div>

              <div class="teaching-step">
                <span class="teaching-step-num font-mono text-accent font-semibold">4</span>
                <div>
                  <h3 class="font-semibold text-primary mb-1">Publish immutable versioned releases</h3>
                  <p class="text-sm text-secondary leading-relaxed">
                    Updates publish as new versions. Existing students stay safely pinned to their enrolled version without interrupted progress.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div class="mt-12 pt-8 border-t border-subtle flex items-center justify-between flex-wrap gap-4">
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
