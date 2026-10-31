/** Shown when a step save is rejected because someone else saved a newer revision first. */
export function renderSaveConflict(): string {
  return `
    <p class="save-conflict-text">This step was saved in another tab or session after you opened it.</p>
    <div class="save-conflict-actions">
      <button type="button" class="btn btn-secondary btn-compact" data-conflict-action="reload">Load the saved version</button>
      <button type="button" class="btn btn-primary btn-compact" data-conflict-action="overwrite">Keep my changes</button>
    </div>
  `;
}
