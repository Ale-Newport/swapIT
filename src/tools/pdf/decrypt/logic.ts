export interface FailureLike {
  name: string;
  message: string;
}

/**
 * qpdf reports a rejected password as "That password does not open this
 * document." — the one failure worth explaining differently from a damaged file.
 */
export function isWrongPassword(message: string): boolean {
  return /password/i.test(message);
}

export interface DecryptSummary {
  /** Files the password did not open. */
  wrongPassword: string[];
  /** Files that failed for some other reason (damaged, unreadable, missing). */
  other: FailureLike[];
}

export function summariseFailures(failures: FailureLike[]): DecryptSummary {
  const wrongPassword: string[] = [];
  const other: FailureLike[] = [];
  for (const failure of failures) {
    if (isWrongPassword(failure.message)) wrongPassword.push(failure.name);
    else other.push(failure);
  }
  return { wrongPassword, other };
}

/** The sentence shown when a password did not fit one or more documents. */
export function wrongPasswordMessage(names: string[], total: number): string {
  if (names.length === 0) return '';
  if (total === 1) return 'That password does not open this document.';
  if (names.length === total) {
    return `That password does not open any of these ${total} documents.`;
  }
  return `That password does not open ${names.length} of the ${total} documents: ${names.join(', ')}.`;
}
