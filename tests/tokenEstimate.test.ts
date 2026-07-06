import { describe, expect, it } from 'vitest';
import { estimateTokens } from '../src/core/tokenEstimate';

describe('estimateTokens', () => {
  it('estimates one token per four characters rounded up', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abc')).toBe(1);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});
