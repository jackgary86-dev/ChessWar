import { describe, expect, it } from 'vitest';

import { GAME_NAME } from '@sim/index.ts';

describe('project scaffold', () => {
  it('resolves the @sim path alias', () => {
    expect(GAME_NAME).toBe('Chess War');
  });
});
