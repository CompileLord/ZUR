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

export function isValidUtf8(input: string | Uint8Array): boolean {
  if (typeof input === 'string') {
    return !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(input);
  }
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    decoder.decode(input);
    return true;
  } catch {
    return false;
  }
}

export function validatePythonSource(code: string): { valid: boolean; error?: string } {
  if (typeof code !== 'string') {
    return { valid: false, error: 'Source code must be a string' };
  }
  if (!isValidUtf8(code)) {
    return { valid: false, error: 'Source code must be valid UTF-8' };
  }
  const bytes = Buffer.byteLength(code, 'utf-8');
  if (bytes > 64 * 1024) {
    return { valid: false, error: `Source code exceeds 64 KiB limit (${bytes} bytes)` };
  }
  return { valid: true };
}

export function validateTestCaseInputOutput(stdin: string, expectedStdout: string): { valid: boolean; error?: string } {
  if (typeof stdin !== 'string' || typeof expectedStdout !== 'string') {
    return { valid: false, error: 'Stdin and expected stdout must be strings' };
  }
  if (!isValidUtf8(stdin)) {
    return { valid: false, error: 'Stdin must be valid UTF-8' };
  }
  if (!isValidUtf8(expectedStdout)) {
    return { valid: false, error: 'Expected stdout must be valid UTF-8' };
  }
  const stdinBytes = Buffer.byteLength(stdin, 'utf-8');
  if (stdinBytes > 64 * 1024) {
    return { valid: false, error: `Stdin exceeds 64 KiB limit (${stdinBytes} bytes)` };
  }
  const stdoutBytes = Buffer.byteLength(expectedStdout, 'utf-8');
  if (stdoutBytes > 64 * 1024) {
    return { valid: false, error: `Expected stdout exceeds 64 KiB limit (${stdoutBytes} bytes)` };
  }
  return { valid: true };
}

export function validateTestCount(count: number): { valid: boolean; error?: string } {
  if (count > 50) {
    return { valid: false, error: `Exercise exceeds maximum of 50 tests (${count} tests)` };
  }
  return { valid: true };
}

