import { UrlSegment, type Route } from '@angular/router';
import { guidIdMatcher, isGuid } from './guid-id-matcher';

const route = {} as Route;
const run = (path: string) =>
  guidIdMatcher(route, path === '' ? [] : [new UrlSegment(path, {})], {} as never);

describe('guidIdMatcher', () => {
  it.each([
    ['3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b', true],
    ['3F2B8C1E-9A4D-4E6F-8B7A-1C2D3E4F5A6B', true],
    ['00000000-0000-0000-0000-000000000000', true],
    ['3f2b8c1e9a4d4e6f8b7a1c2d3e4f5a6b', false],
    ['3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6', false],
    ['3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6bb', false],
    ['3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6g', false],
    ['not-a-guid', false],
    ['123', false],
    ['', false],
  ])('%j matches: %s', (path, expected) => {
    expect(run(path)).toBe(expected);
    expect(isGuid(path)).toBe(expected);
  });
});
