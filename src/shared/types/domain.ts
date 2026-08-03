/**
 * Stabile Domänen-Typen der App [A-1].
 *
 * WARUM DIESE DATEI: `database.types.ts` wird künftig von
 * `npm run db:types` GENERIERT und komplett überschrieben. Die App
 * importiert deshalb ausschließlich von hier — nach einer Regeneration
 * muss nur diese eine Datei ggf. angepasst werden, nie die Features.
 * Die CI erzwingt, dass database.types.ts dem Schema entspricht.
 */
import type { Database } from './database.types';

// ---------- Fachliche Unions (Quelle: CHECK-Constraints im Schema) ----------

/** Rollen an der Mitgliedschaft (Canonical). profiles.role ist nur Spiegel. */
export type UserRole = 'super_admin' | 'admin' | 'leader' | 'berater' | 'developer';

export type PipelineEventType =
  | 'contact_created'
  | 'first_touch'
  | 'follow_up'
  | 'presentation_sent'
  | 'presentation_viewed'
  | 'fit_check_sent'
  | 'fit_check_completed'
  | 'waytomoon_sent'
  | 'three_way_call_done'
  | 'party_scheduled'
  | 'party_done'
  | 'became_customer'
  | 'registered'
  | 'correction';

export type ContactPhase =
  | 'lead'
  | 'im_gespraech'
  | 'praesentation_offen'
  | 'praesentation'
  | 'fit_check'
  | 'three_way_call'
  | 'kunde'
  | 'partner';

export type MissionType =
  | 'fit_check_next_step'
  | 'next_step_due'
  | 'presentation_pending'
  | 'follow_up_overdue'
  | 'reactivate_contact'
  | 'new_contacts';

export type MissionStatus = 'pending' | 'done' | 'deferred' | 'skipped';

// ---------- Zeilen-Aliase (überleben eine Regeneration) ----------

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Team = Database['public']['Tables']['teams']['Row'];
export type Organization = Database['public']['Tables']['organizations']['Row'];
export type Contact = Database['public']['Tables']['contacts']['Row'];
export type PipelineEvent = Database['public']['Tables']['pipeline_events']['Row'];
export type ContactPhaseRow = Database['public']['Views']['contact_phases']['Row'];
export type ExternalTool = Database['public']['Tables']['external_tools']['Row'];
export type DailyPlan = Database['public']['Tables']['daily_plans']['Row'];
export type DailyPlanItem = Database['public']['Tables']['daily_plan_items']['Row'];
export type Journey = Database['public']['Tables']['journeys']['Row'];
export type JourneyStep = Database['public']['Tables']['journey_steps']['Row'];
export type UserProgress = Database['public']['Tables']['user_progress']['Row'];
export type Achievement = Database['public']['Tables']['achievements']['Row'];
export type UserAchievement = Database['public']['Tables']['user_achievements']['Row'];
export type FirstlineProgress = Database['public']['Views']['firstline_journey_progress']['Row'];
export type Membership = Database['public']['Tables']['memberships']['Row'];
export type Rank = Database['public']['Tables']['ranks']['Row'];
export type ProfilesPublic = Database['public']['Views']['profiles_public']['Row'];

/** Rückgabe von public.rank_for_ap — Schwelle + Rahmen-Schlüssel. */
export type RankForAp = Database['public']['Functions']['rank_for_ap']['Returns'][number];

/** Rückgabe von public.next_rank_for_ap — nächste Schwelle oder leer. */
export type NextRankForAp = Database['public']['Functions']['next_rank_for_ap']['Returns'][number];

/** Inhalt eines Journey-Schritts (content-JSONB, ADR-005). */
export interface JourneyStepContent {
  body?: string;
  cta?: string;
  link?: string;
  tool_key?: string;
}
