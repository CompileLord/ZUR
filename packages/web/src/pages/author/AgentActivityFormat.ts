export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatActivityDate(isoString: string): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'UTC',
    });
  } catch {
    return isoString;
  }
}

export function formatToolName(toolName: string): string {
  switch (toolName) {
    case 'apply_course_changes':
    case 'batch_author':
      return 'Batch authoring';
    case 'create_course':
      return 'Create course draft';
    case 'update_course_metadata':
      return 'Update metadata';
    case 'create_module':
      return 'Create module';
    case 'update_module':
      return 'Update module';
    case 'delete_module':
      return 'Delete module';
    case 'create_lesson':
      return 'Create lesson';
    case 'update_lesson':
      return 'Update lesson';
    case 'delete_lesson':
      return 'Delete lesson';
    case 'create_step':
      return 'Create step';
    case 'update_step':
      return 'Update step content';
    case 'delete_step':
      return 'Delete step';
    case 'duplicate_step':
      return 'Duplicate step';
    case 'restore_draft_revision':
      return 'Restore draft revision';
    default:
      return toolName;
  }
}

function formatEntityString(str: string, toolName?: string): string {
  const prefixMatch = str.match(/^(?:mod|module|lesson|step)[-_0-9]+[-_](.+)$/i);
  if (prefixMatch) {
    const rawName = prefixMatch[1].replace(/[-_]+/g, ' ');
    const humanName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
    return `<span title="${escapeHtml(str)}" class="entity-name">${escapeHtml(humanName)}</span>`;
  }
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  if (isUuid) {
    if (toolName === 'update_course_metadata' || toolName === 'create_course') return 'Course metadata';
    if (toolName?.includes('step')) return 'Step content';
    if (toolName?.includes('lesson')) return 'Lesson';
    if (toolName?.includes('module')) return 'Module';
    return 'Course content';
  }
  return escapeHtml(str);
}

export function formatAffectedEntities(entities: any, toolName?: string): string {
  if (!entities) {
    if (toolName === 'update_course_metadata') return 'Course metadata';
    if (toolName === 'create_course') return 'Course draft';
    return 'None';
  }

  if (typeof entities === 'object' && !Array.isArray(entities)) {
    if (entities.operations_applied) {
      const nodeCount = Array.isArray(entities.affected_entities) ? entities.affected_entities.length : 0;
      return `${entities.operations_applied} batch operations (${nodeCount} node${nodeCount === 1 ? '' : 's'})`;
    }
    if (entities.title) return escapeHtml(String(entities.title));
    if (entities.name) return escapeHtml(String(entities.name));
    const propCount = Object.keys(entities).length;
    return `${propCount} propert${propCount === 1 ? 'y' : 'ies'}`;
  }

  if (Array.isArray(entities)) {
    if (entities.length === 0) {
      if (toolName === 'update_course_metadata') return 'Course metadata';
      return 'None';
    }

    if (entities.length === 1) {
      const item = entities[0];
      if (typeof item === 'object' && item !== null) {
        if (item.title) return escapeHtml(String(item.title));
        if (item.name) return escapeHtml(String(item.name));
      }
      return formatEntityString(String(item), toolName);
    }

    return `${entities.length} items`;
  }

  const str = String(entities);
  return formatEntityString(str, toolName);
}
