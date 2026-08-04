import type { AutomationKind, AutomationLogEntry, AutomationPreference } from './types';

const PREFS_KEY = 'ascendos.coach-automation-prefs.v1';
const LOG_KEY = 'ascendos.coach-automation-log.v1';

const ALL_KINDS: AutomationKind[] = [
  'reminders',
  'onboarding_reminders',
  'congratulations',
  'inactivity_reminders',
  'birthday_greetings',
  'follow_up_reminders',
];

/** Future automation — default OFF. Messages never send without explicit enable. */
export function defaultAutomationPreferences(): AutomationPreference[] {
  return ALL_KINDS.map((kind) => ({ kind, enabled: false }));
}

function readPrefs(): AutomationPreference[] {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return defaultAutomationPreferences();
    const parsed = JSON.parse(raw) as AutomationPreference[];
    if (!Array.isArray(parsed)) return defaultAutomationPreferences();
    const byKind = new Map(parsed.map((p) => [p.kind, p.enabled]));
    return ALL_KINDS.map((kind) => ({
      kind,
      enabled: Boolean(byKind.get(kind)),
    }));
  } catch {
    return defaultAutomationPreferences();
  }
}

export function listAutomationPreferences(): AutomationPreference[] {
  return readPrefs();
}

export function setAutomationEnabled(
  kind: AutomationKind,
  enabled: boolean
): AutomationPreference[] {
  const next = readPrefs().map((p) => (p.kind === kind ? { ...p, enabled } : p));
  localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  return next;
}

export function disableAllAutomation(): AutomationPreference[] {
  const next = defaultAutomationPreferences();
  localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  return next;
}

export function isAutomationEnabled(kind: AutomationKind): boolean {
  return readPrefs().some((p) => p.kind === kind && p.enabled);
}

function readLog(): AutomationLogEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AutomationLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Every automatic message must be logged (future). */
export function logAutomationEvent(input: {
  kind: AutomationKind;
  targetLabel: string;
  preview: string;
}): AutomationLogEntry {
  const entry: AutomationLogEntry = {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `auto-${Date.now()}`,
    kind: input.kind,
    targetLabel: input.targetLabel,
    createdAt: new Date().toISOString(),
    preview: input.preview.slice(0, 280),
  };
  const all = [entry, ...readLog()].slice(0, 200);
  localStorage.setItem(LOG_KEY, JSON.stringify(all));
  return entry;
}

export function listAutomationLog(): AutomationLogEntry[] {
  return readLog();
}
