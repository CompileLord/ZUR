export interface FormattedLearnerError {
  isTraceback: boolean;
  exceptionType?: string;
  exceptionMessage?: string;
  sourceLineNumber?: number;
  sourceCodeSnippet?: string;
  cleanSummary: string;
  rawStderr: string;
}

export function sanitizeInternalPaths(text: string): string {
  if (!text) return '';
  return text
    .replace(/(?:["']?\/[a-zA-Z0-9_.-]+)*\/(main|solution|code)\.py["']?/g, 'solution.py')
    .replace(/\/work\/[a-zA-Z0-9_./-]+/g, 'solution.py')
    .replace(/\/work\b/g, '.')
    .replace(/\/(?:usr(?:\/local)?)\/lib\/python[0-9.]+\/[a-zA-Z0-9_./-]+/g, 'lib')
    .replace(/\/tmp\/[a-zA-Z0-9_./-]+/g, 'temp');
}

export function formatLearnerError(stderr: string): FormattedLearnerError {
  const trimmed = (stderr || '').trim();
  if (!trimmed) {
    return { isTraceback: false, cleanSummary: '', rawStderr: '' };
  }

  const lines = trimmed.split('\n');
  const lastLine = lines[lines.length - 1].trim();

  // Match ExceptionType: Message on the last non-empty line (requires uppercase initial and exception suffix)
  const exceptionMatch = lastLine.match(/^(?:[a-zA-Z0-9_.]+\.)?([A-Z][a-zA-Z0-9_]*(?:Error|Exception|Exit|Interrupt|Iteration))(?::\s*(.*))?$/);

  let sourceLineNumber: number | undefined;
  let sourceCodeSnippet: string | undefined;

  interface Frame {
    filePath: string;
    lineNumber: number;
    snippet?: string;
    isLearnerFile: boolean;
  }
  const frames: Frame[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineMatch = lines[i].match(/File\s+["']([^"']+)["'],\s+line\s+(\d+)/);
    if (lineMatch) {
      const filePath = lineMatch[1];
      const lineNumber = parseInt(lineMatch[2], 10);
      let snippet: string | undefined;
      if (i + 1 < lines.length && !lines[i + 1].trim().startsWith('File ') && !lines[i + 1].match(/^[A-Z][A-Za-z0-9_]*.*:/)) {
        snippet = lines[i + 1].trim();
      }
      const isLibrary =
        filePath.includes('/usr/lib') ||
        filePath.includes('/usr/local/lib') ||
        filePath.includes('site-packages') ||
        filePath.includes('dist-packages') ||
        filePath.includes('<frozen') ||
        filePath.includes('/lib/python');
      const isLearnerFile =
        !isLibrary &&
        (filePath.endsWith('main.py') ||
          filePath.endsWith('solution.py') ||
          filePath.endsWith('code.py') ||
          filePath.startsWith('/work/') ||
          filePath === '<stdin>' ||
          !filePath.startsWith('/'));
      frames.push({ filePath, lineNumber, snippet, isLearnerFile });
    }
  }

  // Prefer the last learner frame so library frames are not mistaken for learner source
  const chosenFrame = [...frames].reverse().find((f) => f.isLearnerFile) || frames[frames.length - 1];
  if (chosenFrame) {
    sourceLineNumber = chosenFrame.lineNumber;
    sourceCodeSnippet = chosenFrame.snippet;
  }

  if (exceptionMatch) {
    const exceptionType = exceptionMatch[1];
    const rawMessage = exceptionMatch[2] || '';
    const exceptionMessage = sanitizeInternalPaths(rawMessage);
    let cleanSummary = exceptionType;
    if (exceptionMessage) {
      cleanSummary += `: ${exceptionMessage}`;
    }
    if (sourceLineNumber !== undefined) {
      cleanSummary = `Line ${sourceLineNumber} · ${cleanSummary}`;
    }

    return {
      isTraceback: true,
      exceptionType,
      exceptionMessage,
      sourceLineNumber,
      sourceCodeSnippet,
      cleanSummary,
      rawStderr: trimmed,
    };
  }

  // Fallback: strip internal runner paths
  const cleaned = sanitizeInternalPaths(trimmed);

  return {
    isTraceback: false,
    cleanSummary: cleaned,
    rawStderr: trimmed,
  };
}
