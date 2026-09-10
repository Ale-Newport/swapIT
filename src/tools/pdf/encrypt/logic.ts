export interface PasswordCheck {
  /** Blocks the run. */
  error: string | null;
  /** Worth saying, but the run is still allowed. */
  warnings: string[];
}

const NON_ASCII = /[^\x20-\x7e]/;

/**
 * Everything that can go wrong before qpdf is involved. The confirm field exists
 * because a mistyped password is unrecoverable: nobody, including Toolbox, can
 * open the result without it.
 */
export function validatePasswords(user: string, confirm: string, owner: string): PasswordCheck {
  const warnings: string[] = [];

  if (user === '') {
    return { error: 'Enter the password that will be needed to open the document.', warnings };
  }
  if (confirm !== user) {
    return {
      error: confirm === '' ? 'Repeat the password to confirm it.' : 'The two passwords do not match.',
      warnings,
    };
  }
  // qpdf is handed the password verbatim, but the backend refuses a blank-looking
  // one outright, so a spaces-only password has to be blocked here rather than
  // merely flagged — otherwise the whole batch fails with "enter a password".
  if (user.trim() === '') {
    return {
      error: 'A password of only spaces cannot be used — add at least one visible character.',
      warnings,
    };
  }
  if (user !== user.trim()) {
    warnings.push('The password starts or ends with a space, which is easy to lose when copying it.');
  }
  if (NON_ASCII.test(user) || NON_ASCII.test(owner)) {
    warnings.push('Accented and non-Latin characters are not handled by every PDF reader.');
  }
  if (owner !== '' && owner === user) {
    warnings.push('The owner password matches the open password, so anyone who can open the file can also change its permissions.');
  }
  return { error: null, warnings };
}

export type StrengthLevel = 'weak' | 'fair' | 'strong';

export interface Strength {
  level: StrengthLevel;
  label: string;
}

/**
 * A rough, honest read on the password: length first, character variety second.
 * It is guidance, never a gate.
 */
export function passwordStrength(password: string): Strength {
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(password)).length;
  if (password.length === 0) return { level: 'weak', label: 'No password yet' };
  if (password.length < 8) return { level: 'weak', label: 'Short — easy to guess' };
  if (password.length >= 12 && classes >= 3) return { level: 'strong', label: 'Strong' };
  if (password.length >= 16) return { level: 'strong', label: 'Strong — long enough to make up for the variety' };
  return { level: 'fair', label: 'Reasonable — longer or more varied would be better' };
}

const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*?';

/** A password worth suggesting: 20 characters from the browser's CSPRNG. */
export function generatePassword(length = 20): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}
