import type { McpTool } from '../types.ts';

export function createCourseMutationTools(): McpTool[] {
  return [
    {
      name: 'create_course',
      description: 'Creates a new draft course owned by the author and allowlists it on the current token.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', maxLength: 200, description: 'Course title (required, max 200 characters)' },
          description: { type: 'string', description: 'Short course summary' },
          category_id: { type: 'string', description: 'Category identifier' },
          tags: { type: 'array', items: { type: 'string' }, maxItems: 5, description: 'At most 5 tags' },
          difficulty: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'], description: 'Course level' },
        },
        required: ['title'],
      },
      annotations: {
        readOnly: false,
      },
      requiredScope: 'courses:create',
    },
    {
      name: 'update_course_metadata',
      description: 'Updates metadata of an existing draft course with optimistic concurrency check.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID to update' },
          expected_revision: { type: 'integer', minimum: 0, description: 'Current draft_revision for conflict prevention' },
          metadata: {
            type: 'object',
            properties: {
              title: { type: 'string', maxLength: 200 },
              description: { type: 'string' },
              category_id: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' }, maxItems: 5 },
              difficulty: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'] },
              language: { type: 'string' },
              prerequisites: { type: 'string' },
              learning_outcomes: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        required: ['course_id', 'expected_revision', 'metadata'],
      },
      annotations: {
        readOnly: false,
      },
      requiredScope: 'content:write',
    },
    {
      name: 'create_module',
      description: 'Creates a module in the course hierarchy.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID' },
          title: { type: 'string', maxLength: 200, description: 'Module title' },
          position: { type: 'integer', minimum: 0, description: 'Zero-based position index' },
        },
        required: ['course_id', 'title'],
      },
      annotations: {
        readOnly: false,
      },
      requiredScope: 'content:write',
    },
    {
      name: 'update_module',
      description: 'Renames a module in the course.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID' },
          module_id: { type: 'string', description: 'Module ID' },
          title: { type: 'string', maxLength: 200, description: 'New module title' },
        },
        required: ['course_id', 'module_id', 'title'],
      },
      annotations: {
        readOnly: false,
      },
      requiredScope: 'content:write',
    },
    {
      name: 'delete_module',
      description: 'Deletes a module. If the module contains lessons, confirm_delete_children must be true.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID' },
          module_id: { type: 'string', description: 'Module ID' },
          confirm_delete_children: { type: 'boolean', description: 'Must be true if module contains lessons' },
        },
        required: ['course_id', 'module_id'],
      },
      annotations: {
        destructive: true,
      },
      requiredScope: 'content:delete',
    },
    {
      name: 'create_lesson',
      description: 'Creates a lesson under a specified module.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID' },
          module_id: { type: 'string', description: 'Parent module ID' },
          title: { type: 'string', maxLength: 200, description: 'Lesson title' },
          description: { type: 'string', description: 'Optional lesson description' },
          position: { type: 'integer', minimum: 0, description: 'Zero-based position index' },
        },
        required: ['course_id', 'module_id', 'title'],
      },
      annotations: {
        readOnly: false,
      },
      requiredScope: 'content:write',
    },
    {
      name: 'update_lesson',
      description: 'Updates a lesson title and description.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID' },
          lesson_id: { type: 'string', description: 'Lesson ID' },
          title: { type: 'string', maxLength: 200, description: 'Lesson title' },
          description: { type: 'string', description: 'Lesson description' },
        },
        required: ['course_id', 'lesson_id', 'title'],
      },
      annotations: {
        readOnly: false,
      },
      requiredScope: 'content:write',
    },
    {
      name: 'delete_lesson',
      description: 'Deletes a lesson. If the lesson contains steps, confirm_delete_children must be true.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID' },
          lesson_id: { type: 'string', description: 'Lesson ID' },
          confirm_delete_children: { type: 'boolean', description: 'Must be true if lesson contains steps' },
        },
        required: ['course_id', 'lesson_id'],
      },
      annotations: {
        destructive: true,
      },
      requiredScope: 'content:delete',
    },
    {
      name: 'create_step',
      description: 'Creates a step (theory, video, quiz, or python) in a lesson with 1-20 steps limit.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID' },
          lesson_id: { type: 'string', description: 'Lesson ID' },
          title: { type: 'string', maxLength: 200, description: 'Step title' },
          type: { type: 'string', enum: ['theory', 'video', 'quiz', 'python'], description: 'Step type' },
          position: { type: 'integer', minimum: 0, description: 'Zero-based position' },
          is_required: { type: 'boolean', description: 'Whether required for course completion (default true)' },
          estimated_duration_minutes: { type: 'integer', minimum: 0, description: 'Estimated time in minutes' },
          content: { type: 'object', description: 'Optional step content payload matching step type' },
          test_cases: {
            type: 'array',
            description: 'Optional test cases for python exercises',
            items: {
              type: 'object',
              required: ['stdin', 'expected_stdout'],
              properties: {
                stdin: { type: 'string' },
                expected_stdout: { type: 'string' },
                is_hidden: { type: 'boolean' },
              },
            },
          },
        },
        required: ['course_id', 'lesson_id', 'title', 'type'],
      },
      annotations: {
        readOnly: false,
      },
      requiredScope: 'content:write',
    },
    {
      name: 'update_step',
      description: 'Updates a step metadata and optionally its content payload.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID' },
          step_id: { type: 'string', description: 'Step ID' },
          expected_revision: { type: 'integer', minimum: 0, description: 'Expected revision of the step content' },
          title: { type: 'string', maxLength: 200, description: 'New step title' },
          is_required: { type: 'boolean', description: 'Whether required' },
          estimated_duration_minutes: { type: 'integer', minimum: 0, description: 'Estimated duration in minutes' },
          content: { type: 'object', description: 'New step content payload' },
          test_cases: {
            type: 'array',
            description: 'New test cases for python exercises',
            items: {
              type: 'object',
              required: ['stdin', 'expected_stdout'],
              properties: {
                stdin: { type: 'string' },
                expected_stdout: { type: 'string' },
                is_hidden: { type: 'boolean' },
              },
            },
          },
        },
        required: ['course_id', 'step_id'],
      },
      annotations: {
        readOnly: false,
      },
      requiredScope: 'content:write',
    },
    {
      name: 'delete_step',
      description: 'Deletes a step from a lesson.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID' },
          step_id: { type: 'string', description: 'Step ID' },
        },
        required: ['course_id', 'step_id'],
      },
      annotations: {
        destructive: true,
      },
      requiredScope: 'content:delete',
    },
    {
      name: 'duplicate_step',
      description: 'Duplicates an existing step into the same lesson with fresh IDs.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID' },
          step_id: { type: 'string', description: 'Step ID to duplicate' },
        },
        required: ['course_id', 'step_id'],
      },
      annotations: {
        readOnly: false,
      },
      requiredScope: 'content:write',
    },
    {
      name: 'move_content',
      description: 'Reorders or moves a module, lesson, or step within the course hierarchy using stable parent IDs, with cycle prevention.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID' },
          content_type: { type: 'string', enum: ['module', 'lesson', 'step'], description: 'Type of content node' },
          id: { type: 'string', description: 'ID of the node to move' },
          target_parent_id: { type: 'string', description: 'Target parent ID (module_id for lesson, lesson_id for step)' },
          position: { type: 'integer', minimum: 0, description: 'Zero-based target position among siblings' },
          new_position: { type: 'integer', minimum: 0, description: 'Alias of position' },
          expected_revision: { type: 'integer', minimum: 0, description: 'Expected draft_revision for conflict prevention' },
        },
        required: ['course_id', 'content_type', 'id'],
      },
      annotations: {
        readOnly: false,
      },
      requiredScope: 'content:write',
    },
    {
      name: 'duplicate_content',
      description: 'Duplicates a module, lesson, or step with fresh IDs, without learner records.',
      inputSchema: {
        type: 'object',
        properties: {
          course_id: { type: 'string', description: 'Course ID' },
          content_type: { type: 'string', enum: ['module', 'lesson', 'step'], description: 'Type of content node to duplicate' },
          id: { type: 'string', description: 'ID of the node to duplicate' },
          target_parent_id: { type: 'string', description: 'Optional target parent ID' },
          expected_revision: { type: 'integer', minimum: 0, description: 'Expected draft_revision for conflict prevention' },
        },
        required: ['course_id', 'content_type', 'id'],
      },
      annotations: {
        readOnly: false,
      },
      requiredScope: 'content:write',
    },
  ];
}
