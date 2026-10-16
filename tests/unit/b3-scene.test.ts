import { describe, it, expect } from 'vitest';
import { sceneSpec, sceneSvg, eraOf, phaseOf } from '../../src/ui/logic/scene.ts';

describe('b3 scene banner', () => {
  it('era and life phase buckets', () => {
    expect([1950, 1975, 1990, 2010, 2026, 2050].map(eraOf)).toEqual(['postwar', 'boom', 'late20', 'digital', 'now', 'future']);
    expect([5, 30, 60, 80].map(phaseOf)).toEqual(['dawn', 'day', 'dusk', 'night']);
  });
  it('city vs countryside, deterministic per seed', () => {
    const a = sceneSpec(1990, 30, true, 's'), b = sceneSpec(1990, 30, true, 's'), r = sceneSpec(1990, 30, false, 's');
    expect(a).toEqual(b);
    expect(a.buildings.length).toBeGreaterThan(r.buildings.length);
    expect(r.props).toContain('field');
  });
  it('era props change over time; svg is self-contained', () => {
    expect(sceneSpec(1955, 10, true, 's').props).toContain('bicycle');
    expect(sceneSpec(2050, 10, true, 's').props).toContain('drone');
    const svg = sceneSvg(sceneSpec(1990, 80, true, 's'), 'x');
    expect(svg).toMatch(/^<svg/); expect(svg).not.toMatch(/href|url\(http/);
  });
});
