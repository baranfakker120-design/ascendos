import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

function slotOrder(source: string): { radar: number; live: number } {
  return {
    radar: source.indexOf('<TodayRadarSlot'),
    live: source.indexOf('<TodayLiveCoachingSlot'),
  };
}

describe('Radar Today slot placement', () => {
  it('renders Radar above Live Coaching on the daily Heute stack', () => {
    const page = readFileSync(join(ROOT, 'src/features/daily-plan/TodayPage.tsx'), 'utf8');
    const { radar, live } = slotOrder(page);
    expect(radar).toBeGreaterThan(-1);
    expect(live).toBeGreaterThan(-1);
    expect(radar).toBeLessThan(live);
  });

  it('renders Radar above Live Coaching on the journey Heute stack', () => {
    const router = readFileSync(join(ROOT, 'src/app/router.tsx'), 'utf8');
    const { radar, live } = slotOrder(router);
    expect(radar).toBeGreaterThan(-1);
    expect(live).toBeGreaterThan(-1);
    expect(radar).toBeLessThan(live);
  });
});
