import { describe, it, expect } from 'vitest';
import { fitWithin, shrinkImageFile, THUMB_MAX_SIDE } from './imageShrink';

describe('product photo thumbnails', () => {
  it('fits the long side to 256 and keeps the shape', () => {
    expect(THUMB_MAX_SIDE).toBe(256);
    expect(fitWithin(4000, 3000)).toEqual({ width: 256, height: 192 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 192, height: 256 });
    expect(fitWithin(1000, 1000)).toEqual({ width: 256, height: 256 });
  });
  it('never enlarges a picture that is already small', () => {
    expect(fitWithin(120, 80)).toEqual({ width: 120, height: 80 });
  });
  it('survives a very thin picture and nonsense sizes', () => {
    expect(fitWithin(5000, 3)).toEqual({ width: 256, height: 1 });
    expect(fitWithin(0, 100)).toEqual({ width: 0, height: 0 });
    expect(fitWithin(undefined, null)).toEqual({ width: 0, height: 0 });
  });
  it('refuses a file that is not a picture, and says so', async () => {
    const res = await shrinkImageFile({ name: 'list.pdf', type: 'application/pdf' });
    expect(res.file).toBeNull();
    expect(res.error).toMatch(/not a picture/);
  });
  it('reports a picture it cannot read instead of passing the original through', async () => {
    const res = await shrinkImageFile({ name: 'a.heic', type: 'image/heic' });
    expect(res.file).toBeNull();
    expect(res.error).toMatch(/could not be read/);
  });
});
