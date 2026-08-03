import { describe, expect, it } from 'vitest';
import {
  allMissionScores,
  allPipelineScores,
  comboBonusAp,
  rewardMark,
  scoreDailyMission,
  scoreDimensions,
  scoreJourneyStep,
  scoreLeadPhase,
  scoreMission,
  scorePipelineEvent,
  snapToApTier,
} from './apScoring';

describe('apScoring', () => {
  it('maps low-impact actions near the bottom of the ladder', () => {
    expect(scorePipelineEvent('contact_created')).toBe(10);
    expect(scoreMission('new_contacts')).toBeLessThanOrEqual(50);
  });

  it('pays partner registration like a raid boss kill', () => {
    expect(scorePipelineEvent('registered')).toBe(500);
  });

  it('treats follow-ups as mid-tier gameplay', () => {
    expect(scorePipelineEvent('follow_up')).toBe(50);
    expect(scoreMission('follow_up_overdue')).toBeGreaterThanOrEqual(50);
  });

  it('values fit-check and appointments higher than messages', () => {
    expect(scoreMission('fit_check_next_step')).toBeGreaterThanOrEqual(100);
    expect(scorePipelineEvent('first_touch')).toBeLessThan(scorePipelineEvent('fit_check_completed'));
  });

  it('snaps raw scores onto the reward ladder', () => {
    expect(snapToApTier(0.05)).toBe(10);
    expect([10, 25, 50, 75, 100, 150, 250, 500]).toContain(snapToApTier(0.5));
  });

  it('weights business impact heavily', () => {
    const lowImpact = scoreDimensions({
      difficulty: 1,
      duration: 1,
      businessImpact: 0,
      priority: 0,
      rarity: 0,
    });
    const highImpact = scoreDimensions({
      difficulty: 0,
      duration: 0,
      businessImpact: 1,
      priority: 0,
      rarity: 0,
    });
    expect(highImpact).toBeGreaterThan(lowImpact);
  });

  it('scales lead stickers with pipeline depth', () => {
    expect(scoreLeadPhase('lead')).toBe(50);
    expect(scoreLeadPhase('fit_check')).toBe(150);
    expect(scoreLeadPhase('partner')).toBe(500);
    expect(rewardMark(50)).toBe('fire');
    expect(rewardMark(150)).toBe('star');
  });

  it('grants combo bonuses for mission streaks', () => {
    expect(comboBonusAp(2)).toBe(0);
    expect(comboBonusAp(3)).toBe(25);
    expect(comboBonusAp(5)).toBe(50);
    expect(comboBonusAp(7)).toBe(100);
  });

  it('exports complete catalogs for pipeline and missions', () => {
    expect(Object.keys(allPipelineScores()).length).toBe(13);
    expect(Object.keys(allMissionScores()).length).toBe(6);
  });

  it('scores daily missions from dimensions, never a hardcoded constant', () => {
    const low = scoreDailyMission('new_contacts', { engineScore: 40 });
    const urgent = scoreDailyMission('new_contacts', { engineScore: 100, missionsDoneToday: 4 });
    expect([10, 25, 50, 75, 100, 150, 250, 500]).toContain(low);
    expect(urgent).toBeGreaterThanOrEqual(low);
  });

  it('scores journey steps by type and day depth', () => {
    const day1Info = scoreJourneyStep('info', 1, 0);
    const day7Task = scoreJourneyStep('task', 7, 2);
    expect(day7Task).toBeGreaterThanOrEqual(day1Info);
    expect([10, 25, 50, 75, 100, 150, 250, 500]).toContain(day1Info);
  });
});
