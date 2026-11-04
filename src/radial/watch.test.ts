import { describe, expect, it } from 'vitest';
import { WATCH_ACTIONS, actionAcceptsKind, describeAction } from './watch';

describe('watch actions', () => {
  it('has unique ids', () => {
    expect(new Set(WATCH_ACTIONS.map((a) => a.id)).size).toBe(WATCH_ACTIONS.length);
  });

  it('only runs an action on the kinds it was made for', () => {
    expect(actionAcceptsKind('convert:jpg', 'image')).toBe(true);
    expect(actionAcceptsKind('convert:jpg', 'video')).toBe(false);
    expect(actionAcceptsKind('convert:mp3', 'audio')).toBe(true);
    // An action this table does not know about is left to the catalogue to judge.
    expect(actionAcceptsKind('custom:thing', 'image')).toBe(true);
  });

  it('describes known actions and echoes unknown ones', () => {
    expect(describeAction('edit:compress')).toBe('Compress images');
    expect(describeAction('x:y')).toBe('x:y');
  });
});
