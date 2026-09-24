import type { McpResource, McpResourceContent } from './types.ts';

export const MCP_RESOURCES: McpResource[] = [
  {
    uri: 'zur://schema',
    name: 'ZUR Content Schema',
    description: 'Data model definitions for courses, modules, lessons, steps, and assessments',
    mimeType: 'application/json',
  },
  {
    uri: 'zur://markdown-guide',
    name: 'ZUR Markdown Guidelines',
    description: 'Documentation of supported Markdown syntax, image references, and security restrictions',
    mimeType: 'text/markdown',
  },
  {
    uri: 'zur://connection-info',
    name: 'ZUR MCP Connection Info',
    description: 'Endpoint details, quotas, rate limits, and supported protocol capabilities',
    mimeType: 'application/json',
  },
];

const SCHEMA_TEXT = JSON.stringify(
  {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'ZUR Content Architecture',
    definitions: {
      Course: {
        type: 'object',
        required: ['id', 'title', 'ownerId', 'categoryId', 'draftRevision'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          title: { type: 'string', maxLength: 200 },
          description: { type: 'string' },
          categoryId: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' }, maxItems: 5 },
          difficulty: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'] },
          language: { type: 'string', default: 'en' },
          learningOutcomes: { type: 'array', items: { type: 'string' } },
          prerequisites: { type: 'string' },
          estimatedDurationMinutes: { type: 'integer', minimum: 0 },
          visibility: { type: 'string', enum: ['public', 'unlisted', 'private'] },
          enrollmentPolicy: { type: 'string', enum: ['open', 'invitation_only'] },
          publicationStatus: { type: 'string', enum: ['draft', 'published', 'archived'] },
          draftRevision: { type: 'integer', minimum: 1 },
        },
      },
      Module: {
        type: 'object',
        required: ['id', 'courseId', 'title', 'position'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          courseId: { type: 'string', format: 'uuid' },
          title: { type: 'string', maxLength: 200 },
          position: { type: 'integer', minimum: 0 },
        },
      },
      Lesson: {
        type: 'object',
        required: ['id', 'moduleId', 'title', 'position'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          moduleId: { type: 'string', format: 'uuid' },
          title: { type: 'string', maxLength: 200 },
          description: { type: 'string' },
          position: { type: 'integer', minimum: 0 },
        },
      },
      Step: {
        type: 'object',
        required: ['id', 'lessonId', 'type', 'title', 'position'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          lessonId: { type: 'string', format: 'uuid' },
          type: { type: 'string', enum: ['theory', 'video', 'quiz', 'python'] },
          title: { type: 'string', maxLength: 200 },
          position: { type: 'integer', minimum: 0 },
          isRequired: { type: 'boolean', default: true },
          estimatedDurationMinutes: { type: 'integer', minimum: 1 },
        },
      },
      TheoryContent: {
        type: 'object',
        required: ['kind', 'markdown'],
        properties: {
          kind: { const: 'theory' },
          markdown: { type: 'string' },
        },
      },
      VideoContent: {
        type: 'object',
        required: ['kind', 'videoUrl', 'provider'],
        properties: {
          kind: { const: 'video' },
          videoUrl: { type: 'string', format: 'uri' },
          provider: { type: 'string', enum: ['youtube', 'vimeo', 'loom'] },
          transcript: { type: 'string' },
          captionVerified: { type: 'boolean' },
        },
      },
      QuizContent: {
        type: 'object',
        required: ['kind', 'quizType', 'prompt', 'options'],
        properties: {
          kind: { const: 'quiz' },
          quizType: { type: 'string', enum: ['single_choice', 'multiple_choice'] },
          prompt: { type: 'string' },
          options: {
            type: 'array',
            minItems: 2,
            maxItems: 8,
            items: {
              type: 'object',
              required: ['id', 'text', 'isCorrect'],
              properties: {
                id: { type: 'string' },
                text: { type: 'string' },
                isCorrect: { type: 'boolean' },
              },
            },
          },
          explanation: { type: 'string' },
        },
      },
      PythonExerciseContent: {
        type: 'object',
        required: ['kind', 'problemStatement', 'starterCode', 'referenceSolution'],
        properties: {
          kind: { const: 'python' },
          problemStatement: { type: 'string' },
          inputFormat: { type: 'string' },
          outputFormat: { type: 'string' },
          constraints: { type: 'string' },
          starterCode: { type: 'string' },
          referenceSolution: { type: 'string' },
          hints: { type: 'array', items: { type: 'string' }, maxItems: 3 },
          solutionExplanation: { type: 'string' },
          runtimeLimits: {
            type: 'object',
            properties: {
              cpuTimeoutSeconds: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
              wallTimeoutSeconds: { type: 'integer', minimum: 1, maximum: 20, default: 10 },
              memoryLimitMib: { type: 'integer', minimum: 16, maximum: 512, default: 128 },
            },
          },
        },
      },
    },
  },
  null,
  2
);

const MARKDOWN_GUIDE_TEXT = `# ZUR Markdown Authoring Guide

## Supported Subset
- Headings: \`# H1\` to \`###### H6\`
- Text styling: **bold**, *italic*, \`inline code\`, ~~strikethrough~~
- Lists: ordered (\`1. \`), unordered (\`- \`, \`* \`), task lists (\`- [ ] \`)
- Blockquotes: \`> quote\`
- Tables: GFM table format with pipes and hyphens
- Fenced code blocks with language tags:
  \`\`\`python
  def greet(name: str) -> str:
      return f"Hello, {name}!"
  \`\`\`

## Image Embeds
Images must refer to authorized assets uploaded to the course:
\`![Descriptive alt text](zur-asset:asset_uuid)\`

For decorative images:
\`![](zur-asset:asset_uuid)\` (where \`is_decorative\` is marked true in asset metadata)

## Security Restrictions
- Raw HTML is strictly disallowed and stripped.
- JavaScript, inline event handlers, and data: URIs are rejected.
- External untrusted remote media fetching is not permitted. Upload image bytes via \`create_image_upload\` / \`complete_image_upload\`.
`;

const CONNECTION_INFO_TEXT = JSON.stringify(
  {
    server: 'ZUR MCP Server',
    version: '1.0.0',
    protocolVersion: '2024-11-05',
    transport: 'Streamable HTTP (JSON-RPC 2.0)',
    endpoints: ['/mcp', '/api/mcp'],
    auth: 'Bearer zur_at_<identifier>_<secret>',
    quotas: {
      rateLimitPerMinute: 60,
      maxConcurrentPerAuthor: 10,
      maxPayloadBytes: 1048576,
      maxImageBytes: 5242880,
      maxBatchOperations: 100,
      maxStepsPerLesson: 20,
    },
    scopes: [
      'courses:read',
      'courses:create',
      'content:write',
      'content:delete',
      'media:write',
      'exercises:validate',
      'courses:publish',
      'courses:manage',
    ],
  },
  null,
  2
);

export function listMcpResources(): McpResource[] {
  return MCP_RESOURCES;
}

export function readMcpResource(uri: string): McpResourceContent | null {
  switch (uri) {
    case 'zur://schema':
      return {
        uri,
        mimeType: 'application/json',
        text: SCHEMA_TEXT,
      };
    case 'zur://markdown-guide':
      return {
        uri,
        mimeType: 'text/markdown',
        text: MARKDOWN_GUIDE_TEXT,
      };
    case 'zur://connection-info':
      return {
        uri,
        mimeType: 'application/json',
        text: CONNECTION_INFO_TEXT,
      };
    default:
      return null;
  }
}
