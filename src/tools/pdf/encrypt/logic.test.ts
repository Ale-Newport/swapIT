import { describe, expect, it } from 'vitest';
import { generatePassword, passwordStrength, validatePasswords } from './logic';

describe('validatePasswords', () => {
  it('requires a password', () => {
    expect(validatePasswords('', '', '').error).toBe(
      'Enter the password that will be needed to open the document.',
    );
  });

  it('asks for the confirmation before complaining about a mismatch', () => {
    expect(validatePasswords('hunter2', '', '').error).toBe('Repeat the password to confirm it.');
    expect(validatePasswords('hunter2', 'hunter3', '').error).toBe('The two passwords do not match.');
  });

  it('accepts a matching pair with no owner password', () => {
    expect(validatePasswords('correct horse', 'correct horse', '')).toEqual({
      error: null,
      warnings: [],
    });
  });

  it('is case and whitespace exact, because qpdf is', () => {
    expect(validatePasswords('Secret', 'secret', '').error).toBe('The two passwords do not match.');
    expect(validatePasswords('secret ', 'secret', '').error).toBe('The two passwords do not match.');
  });

  it('blocks a password of only spaces, which the backend rejects anyway', () => {
    const check = validatePasswords('   ', '   ', '');
    expect(check.error).toMatch(/only spaces/);
    expect(check.warnings).toEqual([]);
  });

  it('warns about a padded password without blocking it', () => {
    const check = validatePasswords(' padded ', ' padded ', '');
    expect(check.error).toBeNull();
    expect(check.warnings).toHaveLength(1);
    expect(check.warnings[0]).toMatch(/space/);
  });

  it('warns when characters may not survive other PDF readers', () => {
    const check = validatePasswords('contraseña123', 'contraseña123', '');
    expect(check.error).toBeNull();
    expect(check.warnings.some((w) => /non-Latin/.test(w))).toBe(true);
  });

  it('warns when the owner password adds no protection', () => {
    const check = validatePasswords('same-one', 'same-one', 'same-one');
    expect(check.warnings.some((w) => /permissions/.test(w))).toBe(true);
  });

  it('says nothing about a different owner password', () => {
    expect(validatePasswords('open-me', 'open-me', 'admin-only').warnings).toEqual([]);
  });
});

describe('passwordStrength', () => {
  it('calls a short password weak', () => {
    expect(passwordStrength('abc123').level).toBe('weak');
    expect(passwordStrength('').label).toBe('No password yet');
  });

  it('calls a long varied password strong', () => {
    expect(passwordStrength('Tr0ubadour&Horse').level).toBe('strong');
  });

  it('lets sheer length make up for a single character class', () => {
    expect(passwordStrength('correcthorsebatterystaple').level).toBe('strong');
  });

  it('calls a middling password fair', () => {
    expect(passwordStrength('passwordpw').level).toBe('fair');
  });
});

describe('generatePassword', () => {
  it('produces the requested length from an unambiguous alphabet', () => {
    const password = generatePassword(20);
    expect(password).toHaveLength(20);
    expect(password).not.toMatch(/[lIO01]/);
  });

  it('does not repeat itself', () => {
    expect(generatePassword()).not.toBe(generatePassword());
  });

  it('produces something the strength meter is happy with', () => {
    expect(passwordStrength(generatePassword()).level).toBe('strong');
  });
});
