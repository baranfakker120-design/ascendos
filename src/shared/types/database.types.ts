/**
 * Datenbank-Typen für den Supabase-Client.
 *
 * Sprint 1: handgepflegt, exakt am Schema der Migrationen 1–3.
 * Ab lokal laufender DB gilt: `npm run db:types` überschreibt diese
 * Datei mit dem generierten Stand — DB und Frontend können dann nie
 * auseinanderlaufen (ADR-012). Die Struktur hier entspricht 1:1 dem
 * Generator-Format, damit der Wechsel keinerlei Code-Änderung braucht.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UserRole = 'super_admin' | 'leader' | 'berater';

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          branding: Json;
          settings: Json;
          created_at: string;
        };
        Insert: never;
        Update: { name?: string; branding?: Json; settings?: Json };
        Relationships: [];
      };
      teams: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          parent_team_id: string | null;
          created_at: string;
        };
        Insert: { org_id: string; name: string; parent_team_id?: string | null };
        Update: { name?: string; parent_team_id?: string | null };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          org_id: string;
          team_id: string;
          sponsor_id: string | null;
          role: UserRole;
          first_name: string;
          last_name: string;
          username: string;
          phone: string | null;
          country: string | null;
          language: string;
          avatar_url: string | null;
          goals: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: never; // Profile entstehen nur über den Registrierungs-Trigger
        Update: {
          first_name?: string;
          last_name?: string;
          phone?: string | null;
          country?: string | null;
          language?: string;
          avatar_url?: string | null;
          goals?: Json;
        };
        Relationships: [];
      };
      invites: {
        Row: {
          id: string;
          code: string;
          org_id: string;
          team_id: string;
          sponsor_id: string | null;
          role: UserRole;
          expires_at: string;
          used_by: string | null;
          used_at: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: never; // nur über create_invite()
        Update: never; // nur über den Registrierungs-Trigger
        Relationships: [];
      };
      contacts: {
        Row: {
          id: string;
          owner_id: string;
          org_id: string;
          name: string;
          phone: string | null;
          email: string | null;
          notes: string | null;
          next_step: string | null;
          next_step_due: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          owner_id: string;
          org_id: string;
          name: string;
          phone?: string | null;
          email?: string | null;
          notes?: string | null;
          next_step?: string | null;
          next_step_due?: string | null;
        };
        Update: {
          name?: string;
          phone?: string | null;
          email?: string | null;
          notes?: string | null;
          next_step?: string | null;
          next_step_due?: string | null;
        };
        Relationships: [];
      };
      pipeline_events: {
        Row: {
          id: string;
          contact_id: string;
          org_id: string;
          event_type: PipelineEventType;
          source: string;
          payload: Json;
          created_by: string;
          occurred_at: string;
          created_at: string;
        };
        Insert: {
          contact_id: string;
          org_id: string;
          event_type: PipelineEventType;
          source?: string;
          payload?: Json;
          created_by: string;
          occurred_at?: string;
        };
        Update: never; // Events sind unveränderlich (ADR-003)
        Relationships: [];
      };
      external_tools: {
        Row: {
          id: string;
          org_id: string;
          key: string;
          name: string;
          description: string | null;
          url: string;
          share_event_type: PipelineEventType;
          result_event_type: PipelineEventType | null;
          sort_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: never; // Verwaltung nur durch super_admin (späterer Admin-Sprint)
        Update: never;
        Relationships: [];
      };
      daily_plans: {
        Row: {
          id: string;
          user_id: string;
          org_id: string;
          plan_date: string;
          committed_at: string | null;
          created_at: string;
        };
        Insert: never; // nur über generate_daily_plan()
        Update: never; // nur über commit_daily_plan()
        Relationships: [];
      };
      daily_plan_items: {
        Row: {
          id: string;
          plan_id: string;
          contact_id: string | null;
          mission_type: MissionType;
          title: string;
          reason: string;
          score: number;
          position: number;
          status: MissionStatus;
          status_reason: string | null;
          resolved_at: string | null;
          created_at: string;
        };
        Insert: never; // nur über generate_daily_plan()
        Update: never; // nur über update_mission_status()
        Relationships: [];
      };
      coach_convos: {
        Row: {
          id: string;
          user_id: string;
          org_id: string;
          contact_id: string | null;
          agent_key: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          org_id: string;
          contact_id?: string | null;
          agent_key?: string | null;
        };
        Update: { agent_key?: string | null };
        Relationships: [];
      };
      coach_messages: {
        Row: {
          id: string;
          convo_id: string;
          role: 'user' | 'assistant';
          content: string;
          created_at: string;
        };
        Insert: { convo_id: string; role: 'user' | 'assistant'; content: string };
        Update: never;
        Relationships: [];
      };
      usage_events: {
        Row: {
          id: string;
          user_id: string;
          org_id: string;
          event_type: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          user_id: string;
          org_id: string;
          event_type: string;
          metadata?: Json;
        };
        Update: never;
        Relationships: [];
      };
      journeys: {
        Row: {
          id: string;
          org_id: string;
          team_id: string | null;
          title: string;
          description: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      journey_steps: {
        Row: {
          id: string;
          journey_id: string;
          day_number: number;
          step_order: number;
          title: string;
          content_type: 'info' | 'task' | 'tool';
          content: Json;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      user_progress: {
        Row: { user_id: string; step_id: string; completed_at: string };
        Insert: never; // nur über complete_journey_step()
        Update: never;
        Relationships: [];
      };
      achievements: {
        Row: {
          id: string;
          org_id: string;
          key: string;
          title: string;
          description: string;
          icon: string;
          condition: Json;
          sort_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      user_achievements: {
        Row: { user_id: string; achievement_id: string; unlocked_at: string };
        Insert: never; // nur über check_achievements()
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      firstline_journey_progress: {
        Row: {
          user_id: string;
          first_name: string;
          username: string;
          journey_id: string;
          journey_title: string;
          total_steps: number;
          completed_steps: number;
          current_day: number;
          total_days: number;
        };
        Relationships: [];
      };
      profiles_public: {
        Row: {
          id: string;
          org_id: string;
          team_id: string;
          sponsor_id: string | null;
          role: UserRole;
          first_name: string;
          last_name: string;
          username: string;
          avatar_url: string | null;
        };
        Relationships: [];
      };
      contact_phases: {
        Row: {
          contact_id: string;
          owner_id: string;
          phase: ContactPhase;
          last_event_at: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      create_invite: {
        Args: { invite_role?: UserRole };
        Returns: { invite_code: string; invite_expires_at: string }[];
      };
      validate_invite: {
        Args: { invite_code: string };
        Returns: { org_name: string; team_name: string; sponsor_first_name: string | null }[];
      };
      generate_daily_plan: {
        Args: { p_date: string };
        Returns: string;
      };
      commit_daily_plan: {
        Args: { p_plan_id: string };
        Returns: undefined;
      };
      update_mission_status: {
        Args: { p_item_id: string; p_status: MissionStatus; p_reason?: string | null };
        Returns: undefined;
      };
      complete_journey_step: {
        Args: { p_step_id: string };
        Returns: undefined;
      };
      check_achievements: {
        Args: Record<string, never>;
        Returns: string[];
      };
      correct_pipeline_event: {
        Args: { p_event_id: string };
        Returns: undefined;
      };
      get_downline: {
        Args: { root_user_id: string };
        Returns: { user_id: string; depth: number }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

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

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Contact = Database['public']['Tables']['contacts']['Row'];
export type PipelineEvent = Database['public']['Tables']['pipeline_events']['Row'];
export type ContactPhaseRow = Database['public']['Views']['contact_phases']['Row'];
export type ExternalTool = Database['public']['Tables']['external_tools']['Row'];
export type DailyPlan = Database['public']['Tables']['daily_plans']['Row'];
export type DailyPlanItem = Database['public']['Tables']['daily_plan_items']['Row'];

export type MissionType =
  | 'fit_check_next_step'
  | 'next_step_due'
  | 'presentation_pending'
  | 'follow_up_overdue'
  | 'reactivate_contact'
  | 'new_contacts';

export type MissionStatus = 'pending' | 'done' | 'deferred' | 'skipped';
export type Team = Database['public']['Tables']['teams']['Row'];
export type Organization = Database['public']['Tables']['organizations']['Row'];
