import { describe, expect, it } from 'vitest';
import { archiveExtension, archiveFileName, stemOf, suggestArchiveName } from './logic';

describe('archiveExtension', () => {
  it('normalises the aliases the backend accepts', () => {
    expect(archiveExtension('zip')).toBe('zip');
    expect(archiveExtension('tar')).toBe('tar');
    expect(archiveExtension('tar.gz')).toBe('tar.gz');
    expect(archiveExtension('tgz')).toBe('tar.gz');
    expect(archiveExtension('TARGZ')).toBe('tar.gz');
  });

  it('falls back to zip for anything unknown, as the backend does', () => {
    expect(archiveExtension('rar')).toBe('zip');
    expect(archiveExtension('')).toBe('zip');
  });
});

describe('stemOf', () => {
  it('drops only the final extension', () => {
    expect(stemOf('/a/b/photo.jpg')).toBe('photo');
    expect(stemOf('/a/b/backup.tar.gz')).toBe('backup.tar');
  });

  it('treats a leading dot as part of the name, like Rust file_stem', () => {
    expect(stemOf('/a/.env')).toBe('.env');
  });

  it('returns a folder name untouched, trailing slash and all', () => {
    expect(stemOf('/Users/me/Holiday Photos')).toBe('Holiday Photos');
    expect(stemOf('/Users/me/Holiday Photos/')).toBe('Holiday Photos');
  });
});

describe('suggestArchiveName', () => {
  it('uses the first selected item, which is what the backend defaults to', () => {
    expect(suggestArchiveName(['/a/Report.pdf', '/a/notes.txt'])).toBe('Report');
  });

  it('is empty with no selection so the field can show a placeholder', () => {
    expect(suggestArchiveName([])).toBe('');
  });
});

describe('archiveFileName', () => {
  it('shows the exact file that will be written', () => {
    expect(archiveFileName('Holiday', 'tar.gz')).toBe('Holiday.tar.gz');
    expect(archiveFileName('  Holiday  ', 'zip')).toBe('Holiday.zip');
  });

  it('never produces a nameless archive', () => {
    expect(archiveFileName('', 'zip')).toBe('archive.zip');
  });
});
