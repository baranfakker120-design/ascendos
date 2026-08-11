/** Weekday / daypart signals — soft preferences, never hard requirements. */

export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6; // Sun=0 … Sat=6 (JS Date)

export type Daypart = 'morning' | 'midday' | 'afternoon' | 'evening';

const WEEKDAY_CATEGORIES: Record<WeekdayIndex, string[]> = {
  1: ['motivation', 'business', 'goals', 'recruiting', 'weekstart'],
  2: ['education', 'tips', 'product', 'value'],
  3: ['team', 'community', 'storytelling', 'education'],
  4: ['business', 'recruiting', 'product', 'socialproof'],
  5: ['lifestyle', 'personality', 'team', 'community'],
  6: ['lifestyle', 'everyday', 'personality', 'community'],
  0: ['reflection', 'motivation', 'planning', 'personalstory'],
};

const DAYPART_CATEGORIES: Record<Daypart, string[]> = {
  morning: ['motivation', 'daystart', 'personality', 'story'],
  midday: ['education', 'value', 'carousel', 'product'],
  afternoon: ['community', 'lifestyle', 'interaction'],
  evening: ['recruiting', 'storytelling', 'business', 'reel', 'cta'],
};

export function daypartFromHour(hour: number): Daypart {
  if (hour < 11) return 'morning';
  if (hour < 15) return 'midday';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

export function preferredCategoriesForSlot(params: {
  weekday: WeekdayIndex;
  hour: number;
}): string[] {
  const day = WEEKDAY_CATEGORIES[params.weekday] ?? [];
  const part = DAYPART_CATEGORIES[daypartFromHour(params.hour)] ?? [];
  return [...new Set([...day, ...part])];
}

export function inferCategoryFromAsset(params: {
  theme: string | null | undefined;
  keywords: string[] | null | undefined;
  suggestedFormats: string[] | null | undefined;
}): string {
  const blob = [
    params.theme ?? '',
    ...(params.keywords ?? []),
    ...(params.suggestedFormats ?? []),
  ]
    .join(' ')
    .toLowerCase();

  const rules: Array<[string, RegExp]> = [
    ['recruiting', /recruit|team.?aufbau|bewerb|nebenverdienst|network.?market/],
    ['product', /produkt|parfum|duft|fragrance|packaging|product/],
    ['education', /tipp|learn|wissen|howto|erklä|educat|mehrwert/],
    ['lifestyle', /lifestyle|alltag|everyday|leben|mood/],
    ['storytelling', /story|erzähl|journey|weg/],
    ['team', /team|community|zusammen|wir/],
    ['business', /business|umsatz|ziele|fokus|mindset/],
    ['motivation', /motivation|inspiration|start|montag/],
    ['socialproof', /erfolg|proof|testimon|ergebnis|kunden/],
  ];
  for (const [cat, re] of rules) {
    if (re.test(blob)) return cat;
  }
  return 'general';
}
