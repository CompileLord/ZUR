export interface ComparisonResult {
  passed: boolean;
  normalizedActual: string;
  normalizedExpected: string;
}

export function normalizeOutput(text: string): string {
  if (typeof text !== 'string') {
    return '';
  }

  // 1. Normalize CRLF and CR line endings to LF
  const lfText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 2. Remove trailing ASCII spaces (' ' and '\t') from each line
  const lines = lfText.split('\n').map((line) => line.replace(/[ \t]+$/, ''));

  // 3. Remove empty lines at the end of the output
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines.join('\n');
}

export function compareOutput(actualStdout: string, expectedStdout: string): ComparisonResult {
  const normalizedActual = normalizeOutput(actualStdout);
  const normalizedExpected = normalizeOutput(expectedStdout);

  // 4. Compare the remaining text exactly, including case, leading whitespace, and internal spacing
  const passed = normalizedActual === normalizedExpected;

  return {
    passed,
    normalizedActual,
    normalizedExpected,
  };
}
