import { describe, expect, it } from 'vitest';
import { isHighTierReward, rewardTierClass } from './ApRewardSticker';

describe('ApRewardSticker tiers', () => {
  it('treats 250+ as high-tier collectibles with particles', () => {
    expect(isHighTierReward(100)).toBe(false);
    expect(isHighTierReward(250)).toBe(true);
    expect(isHighTierReward(500)).toBe(true);
    expect(isHighTierReward(1000)).toBe(true);
  });

  it('maps values onto collectible rarity classes', () => {
    expect(rewardTierClass(25)).toBe('ap-reward-sticker--common');
    expect(rewardTierClass(100)).toBe('ap-reward-sticker--rare');
    expect(rewardTierClass(250)).toBe('ap-reward-sticker--epic');
    expect(rewardTierClass(500)).toBe('ap-reward-sticker--legendary');
    expect(rewardTierClass(1000)).toBe('ap-reward-sticker--mythic');
  });
});
