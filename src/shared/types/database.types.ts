export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      achievements: {
        Row: {
          condition: Json;
          created_at: string;
          description: string;
          icon: string;
          id: string;
          is_active: boolean;
          key: string;
          org_id: string;
          sort_order: number;
          title: string;
        };
        Insert: {
          condition: Json;
          created_at?: string;
          description: string;
          icon?: string;
          id?: string;
          is_active?: boolean;
          key: string;
          org_id: string;
          sort_order?: number;
          title: string;
        };
        Update: {
          condition?: Json;
          created_at?: string;
          description?: string;
          icon?: string;
          id?: string;
          is_active?: boolean;
          key?: string;
          org_id?: string;
          sort_order?: number;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'achievements_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      agents: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          key: string;
          model: string;
          name: string;
          org_id: string;
          retrieval_categories: string[];
          system_prompt: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          key: string;
          model?: string;
          name: string;
          org_id: string;
          retrieval_categories?: string[];
          system_prompt: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          key?: string;
          model?: string;
          name?: string;
          org_id?: string;
          retrieval_categories?: string[];
          system_prompt?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'agents_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      ap_ledger: {
        Row: {
          created_at: string;
          delta: number;
          id: string;
          membership_id: string;
          reason: string;
          rule_id: string | null;
          season_id: string | null;
          source_event_id: string | null;
          source_kind: string;
        };
        Insert: {
          created_at?: string;
          delta: number;
          id?: string;
          membership_id: string;
          reason: string;
          rule_id?: string | null;
          season_id?: string | null;
          source_event_id?: string | null;
          source_kind: string;
        };
        Update: {
          created_at?: string;
          delta?: number;
          id?: string;
          membership_id?: string;
          reason?: string;
          rule_id?: string | null;
          season_id?: string | null;
          source_event_id?: string | null;
          source_kind?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ap_ledger_membership_id_fkey';
            columns: ['membership_id'];
            isOneToOne: false;
            referencedRelation: 'memberships';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ap_ledger_rule_id_fkey';
            columns: ['rule_id'];
            isOneToOne: false;
            referencedRelation: 'ap_rules';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ap_ledger_season_id_fkey';
            columns: ['season_id'];
            isOneToOne: false;
            referencedRelation: 'seasons';
            referencedColumns: ['id'];
          },
        ];
      };
      ap_rules: {
        Row: {
          ap: number;
          created_at: string;
          event_type: string;
          id: string;
          is_active: boolean;
          note: string | null;
          org_id: string;
          season_id: string | null;
          source_kind: string;
          updated_at: string;
          valid_from: string;
          valid_until: string | null;
        };
        Insert: {
          ap?: number;
          created_at?: string;
          event_type: string;
          id?: string;
          is_active?: boolean;
          note?: string | null;
          org_id: string;
          season_id?: string | null;
          source_kind: string;
          updated_at?: string;
          valid_from?: string;
          valid_until?: string | null;
        };
        Update: {
          ap?: number;
          created_at?: string;
          event_type?: string;
          id?: string;
          is_active?: boolean;
          note?: string | null;
          org_id?: string;
          season_id?: string | null;
          source_kind?: string;
          updated_at?: string;
          valid_from?: string;
          valid_until?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'ap_rules_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ap_rules_season_id_fkey';
            columns: ['season_id'];
            isOneToOne: false;
            referencedRelation: 'seasons';
            referencedColumns: ['id'];
          },
        ];
      };
      ap_task_completions: {
        Row: {
          ap_awarded: number;
          completed_at: string | null;
          created_at: string;
          id: string;
          ledger_id: string | null;
          membership_id: string;
          note: string | null;
          started_at: string | null;
          status: string;
          task_id: string;
        };
        Insert: {
          ap_awarded?: number;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          ledger_id?: string | null;
          membership_id: string;
          note?: string | null;
          started_at?: string | null;
          status?: string;
          task_id: string;
        };
        Update: {
          ap_awarded?: number;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          ledger_id?: string | null;
          membership_id?: string;
          note?: string | null;
          started_at?: string | null;
          status?: string;
          task_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ap_task_completions_ledger_id_fkey';
            columns: ['ledger_id'];
            isOneToOne: false;
            referencedRelation: 'ap_ledger';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ap_task_completions_membership_id_fkey';
            columns: ['membership_id'];
            isOneToOne: false;
            referencedRelation: 'memberships';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ap_task_completions_task_id_fkey';
            columns: ['task_id'];
            isOneToOne: false;
            referencedRelation: 'ap_task_defs';
            referencedColumns: ['id'];
          },
        ];
      };
      ap_task_defs: {
        Row: {
          ap: number;
          category: string;
          cooldown_hours: number | null;
          created_at: string;
          description: string | null;
          difficulty: string;
          id: string;
          is_active: boolean;
          key: string;
          org_id: string;
          repeatable: boolean;
          sort_order: number;
          title: string;
        };
        Insert: {
          ap: number;
          category?: string;
          cooldown_hours?: number | null;
          created_at?: string;
          description?: string | null;
          difficulty?: string;
          id?: string;
          is_active?: boolean;
          key: string;
          org_id: string;
          repeatable?: boolean;
          sort_order?: number;
          title: string;
        };
        Update: {
          ap?: number;
          category?: string;
          cooldown_hours?: number | null;
          created_at?: string;
          description?: string | null;
          difficulty?: string;
          id?: string;
          is_active?: boolean;
          key?: string;
          org_id?: string;
          repeatable?: boolean;
          sort_order?: number;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ap_task_defs_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      coach_convos: {
        Row: {
          agent_key: string | null;
          contact_id: string | null;
          created_at: string;
          id: string;
          org_id: string;
          user_id: string;
        };
        Insert: {
          agent_key?: string | null;
          contact_id?: string | null;
          created_at?: string;
          id?: string;
          org_id: string;
          user_id: string;
        };
        Update: {
          agent_key?: string | null;
          contact_id?: string | null;
          created_at?: string;
          id?: string;
          org_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'coach_convos_contact_id_fkey';
            columns: ['contact_id'];
            isOneToOne: false;
            referencedRelation: 'contact_phases';
            referencedColumns: ['contact_id'];
          },
          {
            foreignKeyName: 'coach_convos_contact_id_fkey';
            columns: ['contact_id'];
            isOneToOne: false;
            referencedRelation: 'contacts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'coach_convos_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'coach_convos_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'coach_convos_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'coach_convos_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      coach_messages: {
        Row: {
          content: string;
          convo_id: string;
          created_at: string;
          id: string;
          role: string;
        };
        Insert: {
          content: string;
          convo_id: string;
          created_at?: string;
          id?: string;
          role: string;
        };
        Update: {
          content?: string;
          convo_id?: string;
          created_at?: string;
          id?: string;
          role?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'coach_messages_convo_id_fkey';
            columns: ['convo_id'];
            isOneToOne: false;
            referencedRelation: 'coach_convos';
            referencedColumns: ['id'];
          },
        ];
      };
      contacts: {
        Row: {
          created_at: string;
          email: string | null;
          id: string;
          name: string;
          next_step: string | null;
          next_step_due: string | null;
          notes: string | null;
          org_id: string;
          owner_id: string;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          id?: string;
          name: string;
          next_step?: string | null;
          next_step_due?: string | null;
          notes?: string | null;
          org_id: string;
          owner_id: string;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          id?: string;
          name?: string;
          next_step?: string | null;
          next_step_due?: string | null;
          notes?: string | null;
          org_id?: string;
          owner_id?: string;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'contacts_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contacts_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'contacts_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contacts_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      cosmetic_items: {
        Row: {
          asset_path: string | null;
          created_at: string;
          id: string;
          is_active: boolean;
          key: string;
          kind: string;
          label: string;
          org_id: string;
          rank_key: string | null;
          season_id: string | null;
          sort_order: number;
          unlock_condition: Json | null;
        };
        Insert: {
          asset_path?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          key: string;
          kind: string;
          label: string;
          org_id: string;
          rank_key?: string | null;
          season_id?: string | null;
          sort_order?: number;
          unlock_condition?: Json | null;
        };
        Update: {
          asset_path?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          key?: string;
          kind?: string;
          label?: string;
          org_id?: string;
          rank_key?: string | null;
          season_id?: string | null;
          sort_order?: number;
          unlock_condition?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: 'cosmetic_items_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cosmetic_items_season_id_fkey';
            columns: ['season_id'];
            isOneToOne: false;
            referencedRelation: 'seasons';
            referencedColumns: ['id'];
          },
        ];
      };
      daily_plan_items: {
        Row: {
          contact_id: string | null;
          created_at: string;
          id: string;
          mission_type: string;
          plan_id: string;
          position: number;
          reason: string;
          resolved_at: string | null;
          score: number;
          status: string;
          status_reason: string | null;
          title: string;
        };
        Insert: {
          contact_id?: string | null;
          created_at?: string;
          id?: string;
          mission_type: string;
          plan_id: string;
          position: number;
          reason: string;
          resolved_at?: string | null;
          score: number;
          status?: string;
          status_reason?: string | null;
          title: string;
        };
        Update: {
          contact_id?: string | null;
          created_at?: string;
          id?: string;
          mission_type?: string;
          plan_id?: string;
          position?: number;
          reason?: string;
          resolved_at?: string | null;
          score?: number;
          status?: string;
          status_reason?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'daily_plan_items_contact_id_fkey';
            columns: ['contact_id'];
            isOneToOne: false;
            referencedRelation: 'contact_phases';
            referencedColumns: ['contact_id'];
          },
          {
            foreignKeyName: 'daily_plan_items_contact_id_fkey';
            columns: ['contact_id'];
            isOneToOne: false;
            referencedRelation: 'contacts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'daily_plan_items_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'daily_plans';
            referencedColumns: ['id'];
          },
        ];
      };
      daily_plans: {
        Row: {
          committed_at: string | null;
          created_at: string;
          id: string;
          org_id: string;
          plan_date: string;
          user_id: string;
        };
        Insert: {
          committed_at?: string | null;
          created_at?: string;
          id?: string;
          org_id: string;
          plan_date: string;
          user_id: string;
        };
        Update: {
          committed_at?: string | null;
          created_at?: string;
          id?: string;
          org_id?: string;
          plan_date?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'daily_plans_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'daily_plans_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'daily_plans_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'daily_plans_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      external_tools: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          key: string;
          name: string;
          org_id: string;
          result_event_type: string | null;
          share_event_type: string;
          sort_order: number;
          url: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          key: string;
          name: string;
          org_id: string;
          result_event_type?: string | null;
          share_event_type: string;
          sort_order?: number;
          url: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          key?: string;
          name?: string;
          org_id?: string;
          result_event_type?: string | null;
          share_event_type?: string;
          sort_order?: number;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'external_tools_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      invite_validation_attempts: {
        Row: {
          created_at: string;
          id: string;
          ip: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          ip: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          ip?: string;
        };
        Relationships: [];
      };
      invites: {
        Row: {
          code: string;
          created_at: string;
          created_by: string | null;
          expires_at: string;
          id: string;
          org_id: string;
          role: string;
          sponsor_id: string | null;
          team_id: string;
          used_at: string | null;
          used_by: string | null;
        };
        Insert: {
          code: string;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string;
          id?: string;
          org_id: string;
          role?: string;
          sponsor_id?: string | null;
          team_id: string;
          used_at?: string | null;
          used_by?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string;
          id?: string;
          org_id?: string;
          role?: string;
          sponsor_id?: string | null;
          team_id?: string;
          used_at?: string | null;
          used_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'invites_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'invites_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invites_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invites_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invites_sponsor_id_fkey';
            columns: ['sponsor_id'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'invites_sponsor_id_fkey';
            columns: ['sponsor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invites_sponsor_id_fkey';
            columns: ['sponsor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invites_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invites_used_by_fkey';
            columns: ['used_by'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'invites_used_by_fkey';
            columns: ['used_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invites_used_by_fkey';
            columns: ['used_by'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      journey_steps: {
        Row: {
          content: Json;
          content_type: string;
          created_at: string;
          day_number: number;
          id: string;
          journey_id: string;
          step_order: number;
          title: string;
        };
        Insert: {
          content?: Json;
          content_type?: string;
          created_at?: string;
          day_number: number;
          id?: string;
          journey_id: string;
          step_order?: number;
          title: string;
        };
        Update: {
          content?: Json;
          content_type?: string;
          created_at?: string;
          day_number?: number;
          id?: string;
          journey_id?: string;
          step_order?: number;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'journey_steps_journey_id_fkey';
            columns: ['journey_id'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['journey_id'];
          },
          {
            foreignKeyName: 'journey_steps_journey_id_fkey';
            columns: ['journey_id'];
            isOneToOne: false;
            referencedRelation: 'journeys';
            referencedColumns: ['id'];
          },
        ];
      };
      journeys: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          org_id: string;
          team_id: string | null;
          title: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          org_id: string;
          team_id?: string | null;
          title: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          org_id?: string;
          team_id?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'journeys_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'journeys_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
        ];
      };
      knowledge_chunks: {
        Row: {
          chunk_index: number;
          content: string;
          created_at: string;
          doc_id: string;
          embedding: string | null;
          id: string;
          org_id: string;
        };
        Insert: {
          chunk_index: number;
          content: string;
          created_at?: string;
          doc_id: string;
          embedding?: string | null;
          id?: string;
          org_id: string;
        };
        Update: {
          chunk_index?: number;
          content?: string;
          created_at?: string;
          doc_id?: string;
          embedding?: string | null;
          id?: string;
          org_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'knowledge_chunks_doc_id_fkey';
            columns: ['doc_id'];
            isOneToOne: false;
            referencedRelation: 'knowledge_docs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'knowledge_chunks_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      knowledge_docs: {
        Row: {
          author_id: string | null;
          category: string;
          created_at: string;
          id: string;
          language: string;
          org_id: string;
          source_type: string;
          status: string;
          supersedes_doc_id: string | null;
          tags: string[];
          team_id: string | null;
          title: string;
          valid_from: string;
          valid_until: string | null;
          version: number;
        };
        Insert: {
          author_id?: string | null;
          category: string;
          created_at?: string;
          id?: string;
          language?: string;
          org_id: string;
          source_type?: string;
          status?: string;
          supersedes_doc_id?: string | null;
          tags?: string[];
          team_id?: string | null;
          title: string;
          valid_from?: string;
          valid_until?: string | null;
          version?: number;
        };
        Update: {
          author_id?: string | null;
          category?: string;
          created_at?: string;
          id?: string;
          language?: string;
          org_id?: string;
          source_type?: string;
          status?: string;
          supersedes_doc_id?: string | null;
          tags?: string[];
          team_id?: string | null;
          title?: string;
          valid_from?: string;
          valid_until?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'knowledge_docs_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'knowledge_docs_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'knowledge_docs_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'knowledge_docs_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'knowledge_docs_supersedes_doc_id_fkey';
            columns: ['supersedes_doc_id'];
            isOneToOne: false;
            referencedRelation: 'knowledge_docs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'knowledge_docs_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
        ];
      };
      knowledge_gaps: {
        Row: {
          agent_key: string;
          created_at: string;
          id: string;
          org_id: string;
          question: string;
          user_id: string | null;
        };
        Insert: {
          agent_key: string;
          created_at?: string;
          id?: string;
          org_id: string;
          question: string;
          user_id?: string | null;
        };
        Update: {
          agent_key?: string;
          created_at?: string;
          id?: string;
          org_id?: string;
          question?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'knowledge_gaps_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'knowledge_gaps_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'knowledge_gaps_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'knowledge_gaps_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      leadership_favorites: {
        Row: {
          created_at: string;
          owner_membership_id: string;
          target_membership_id: string;
        };
        Insert: {
          created_at?: string;
          owner_membership_id: string;
          target_membership_id: string;
        };
        Update: {
          created_at?: string;
          owner_membership_id?: string;
          target_membership_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'leadership_favorites_owner_membership_id_fkey';
            columns: ['owner_membership_id'];
            isOneToOne: false;
            referencedRelation: 'memberships';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'leadership_favorites_target_membership_id_fkey';
            columns: ['target_membership_id'];
            isOneToOne: false;
            referencedRelation: 'memberships';
            referencedColumns: ['id'];
          },
        ];
      };
      leadership_notes: {
        Row: {
          body: string;
          id: string;
          owner_membership_id: string;
          target_membership_id: string;
          updated_at: string;
        };
        Insert: {
          body: string;
          id?: string;
          owner_membership_id: string;
          target_membership_id: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          id?: string;
          owner_membership_id?: string;
          target_membership_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'leadership_notes_owner_membership_id_fkey';
            columns: ['owner_membership_id'];
            isOneToOne: false;
            referencedRelation: 'memberships';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'leadership_notes_target_membership_id_fkey';
            columns: ['target_membership_id'];
            isOneToOne: false;
            referencedRelation: 'memberships';
            referencedColumns: ['id'];
          },
        ];
      };
      membership_cosmetics: {
        Row: {
          is_equipped: boolean;
          item_id: string;
          kind: string;
          membership_id: string;
          unlocked_at: string;
        };
        Insert: {
          is_equipped?: boolean;
          item_id: string;
          kind: string;
          membership_id: string;
          unlocked_at?: string;
        };
        Update: {
          is_equipped?: boolean;
          item_id?: string;
          kind?: string;
          membership_id?: string;
          unlocked_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'membership_cosmetics_item_id_fkey';
            columns: ['item_id'];
            isOneToOne: false;
            referencedRelation: 'cosmetic_items';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'membership_cosmetics_membership_id_fkey';
            columns: ['membership_id'];
            isOneToOne: false;
            referencedRelation: 'memberships';
            referencedColumns: ['id'];
          },
        ];
      };
      memberships: {
        Row: {
          ap_total: number;
          country: string | null;
          created_at: string;
          goals: Json;
          id: string;
          identity_id: string;
          joined_at: string;
          last_app_opened_at: string | null;
          left_at: string | null;
          org_id: string;
          role: string;
          sponsor_membership_id: string | null;
          status: string;
          streak_days: number;
          streak_updated_on: string | null;
          team_id: string;
          team_leader_qualified_at: string | null;
          updated_at: string;
        };
        Insert: {
          ap_total?: number;
          country?: string | null;
          created_at?: string;
          goals?: Json;
          id?: string;
          identity_id: string;
          joined_at?: string;
          last_app_opened_at?: string | null;
          left_at?: string | null;
          org_id: string;
          role?: string;
          sponsor_membership_id?: string | null;
          status?: string;
          streak_days?: number;
          streak_updated_on?: string | null;
          team_id: string;
          team_leader_qualified_at?: string | null;
          updated_at?: string;
        };
        Update: {
          ap_total?: number;
          country?: string | null;
          created_at?: string;
          goals?: Json;
          id?: string;
          identity_id?: string;
          joined_at?: string;
          last_app_opened_at?: string | null;
          left_at?: string | null;
          org_id?: string;
          role?: string;
          sponsor_membership_id?: string | null;
          status?: string;
          streak_days?: number;
          streak_updated_on?: string | null;
          team_id?: string;
          team_leader_qualified_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'memberships_identity_id_fkey';
            columns: ['identity_id'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'memberships_identity_id_fkey';
            columns: ['identity_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'memberships_identity_id_fkey';
            columns: ['identity_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'memberships_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'memberships_sponsor_membership_id_fkey';
            columns: ['sponsor_membership_id'];
            isOneToOne: false;
            referencedRelation: 'memberships';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'memberships_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
        ];
      };
      monthly_awards: {
        Row: {
          ap_in_period: number;
          created_at: string;
          id: string;
          membership_id: string;
          org_id: string;
          period: string;
          place: number;
        };
        Insert: {
          ap_in_period: number;
          created_at?: string;
          id?: string;
          membership_id: string;
          org_id: string;
          period: string;
          place: number;
        };
        Update: {
          ap_in_period?: number;
          created_at?: string;
          id?: string;
          membership_id?: string;
          org_id?: string;
          period?: string;
          place?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'monthly_awards_membership_id_fkey';
            columns: ['membership_id'];
            isOneToOne: false;
            referencedRelation: 'memberships';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'monthly_awards_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      organizations: {
        Row: {
          branding: Json;
          created_at: string;
          id: string;
          name: string;
          settings: Json;
        };
        Insert: {
          branding?: Json;
          created_at?: string;
          id?: string;
          name: string;
          settings?: Json;
        };
        Update: {
          branding?: Json;
          created_at?: string;
          id?: string;
          name?: string;
          settings?: Json;
        };
        Relationships: [];
      };
      payouts: {
        Row: {
          amount_cents: number;
          awarded_for_membership_id: string | null;
          confirmed_by: string | null;
          confirmed_paid_at: string | null;
          created_at: string;
          currency: string;
          entitled_at: string;
          id: string;
          identity_id: string;
          kind: string;
          note: string | null;
        };
        Insert: {
          amount_cents: number;
          awarded_for_membership_id?: string | null;
          confirmed_by?: string | null;
          confirmed_paid_at?: string | null;
          created_at?: string;
          currency?: string;
          entitled_at?: string;
          id?: string;
          identity_id: string;
          kind: string;
          note?: string | null;
        };
        Update: {
          amount_cents?: number;
          awarded_for_membership_id?: string | null;
          confirmed_by?: string | null;
          confirmed_paid_at?: string | null;
          created_at?: string;
          currency?: string;
          entitled_at?: string;
          id?: string;
          identity_id?: string;
          kind?: string;
          note?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'payouts_awarded_for_membership_id_fkey';
            columns: ['awarded_for_membership_id'];
            isOneToOne: false;
            referencedRelation: 'memberships';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payouts_confirmed_by_fkey';
            columns: ['confirmed_by'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'payouts_confirmed_by_fkey';
            columns: ['confirmed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payouts_confirmed_by_fkey';
            columns: ['confirmed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payouts_identity_id_fkey';
            columns: ['identity_id'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'payouts_identity_id_fkey';
            columns: ['identity_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payouts_identity_id_fkey';
            columns: ['identity_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      pipeline_events: {
        Row: {
          contact_id: string;
          created_at: string;
          created_by: string | null;
          event_type: string;
          id: string;
          occurred_at: string;
          org_id: string;
          payload: Json;
          source: string;
        };
        Insert: {
          contact_id: string;
          created_at?: string;
          created_by?: string | null;
          event_type: string;
          id?: string;
          occurred_at?: string;
          org_id: string;
          payload?: Json;
          source?: string;
        };
        Update: {
          contact_id?: string;
          created_at?: string;
          created_by?: string | null;
          event_type?: string;
          id?: string;
          occurred_at?: string;
          org_id?: string;
          payload?: Json;
          source?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'pipeline_events_contact_id_fkey';
            columns: ['contact_id'];
            isOneToOne: false;
            referencedRelation: 'contact_phases';
            referencedColumns: ['contact_id'];
          },
          {
            foreignKeyName: 'pipeline_events_contact_id_fkey';
            columns: ['contact_id'];
            isOneToOne: false;
            referencedRelation: 'contacts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pipeline_events_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'pipeline_events_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pipeline_events_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pipeline_events_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          country: string | null;
          created_at: string;
          first_name: string;
          goals: Json;
          id: string;
          language: string;
          last_name: string;
          org_id: string;
          phone: string | null;
          role: string;
          sponsor_id: string | null;
          team_id: string;
          updated_at: string;
          username: string;
        };
        Insert: {
          avatar_url?: string | null;
          country?: string | null;
          created_at?: string;
          first_name: string;
          goals?: Json;
          id: string;
          language?: string;
          last_name: string;
          org_id: string;
          phone?: string | null;
          role?: string;
          sponsor_id?: string | null;
          team_id: string;
          updated_at?: string;
          username: string;
        };
        Update: {
          avatar_url?: string | null;
          country?: string | null;
          created_at?: string;
          first_name?: string;
          goals?: Json;
          id?: string;
          language?: string;
          last_name?: string;
          org_id?: string;
          phone?: string | null;
          role?: string;
          sponsor_id?: string | null;
          team_id?: string;
          updated_at?: string;
          username?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'profiles_sponsor_id_fkey';
            columns: ['sponsor_id'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'profiles_sponsor_id_fkey';
            columns: ['sponsor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'profiles_sponsor_id_fkey';
            columns: ['sponsor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'profiles_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
        ];
      };
      ranks: {
        Row: {
          created_at: string;
          frame_asset: string | null;
          id: string;
          is_active: boolean;
          key: string;
          label: string;
          org_id: string;
          payout_cents: number | null;
          payout_kind: string | null;
          sort_order: number;
          threshold_ap: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          frame_asset?: string | null;
          id?: string;
          is_active?: boolean;
          key: string;
          label: string;
          org_id: string;
          payout_cents?: number | null;
          payout_kind?: string | null;
          sort_order?: number;
          threshold_ap: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          frame_asset?: string | null;
          id?: string;
          is_active?: boolean;
          key?: string;
          label?: string;
          org_id?: string;
          payout_cents?: number | null;
          payout_kind?: string | null;
          sort_order?: number;
          threshold_ap?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ranks_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      seasons: {
        Row: {
          created_at: string;
          ends_at: string | null;
          id: string;
          is_active: boolean;
          key: string;
          label: string;
          org_id: string;
          starts_at: string;
        };
        Insert: {
          created_at?: string;
          ends_at?: string | null;
          id?: string;
          is_active?: boolean;
          key: string;
          label: string;
          org_id: string;
          starts_at: string;
        };
        Update: {
          created_at?: string;
          ends_at?: string | null;
          id?: string;
          is_active?: boolean;
          key?: string;
          label?: string;
          org_id?: string;
          starts_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'seasons_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      teams: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          org_id: string;
          parent_team_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          org_id: string;
          parent_team_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          org_id?: string;
          parent_team_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'teams_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'teams_parent_team_id_fkey';
            columns: ['parent_team_id'];
            isOneToOne: false;
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
        ];
      };
      usage_events: {
        Row: {
          created_at: string;
          event_type: string;
          id: string;
          metadata: Json;
          org_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          event_type: string;
          id?: string;
          metadata?: Json;
          org_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          event_type?: string;
          id?: string;
          metadata?: Json;
          org_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'usage_events_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'usage_events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'usage_events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'usage_events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      user_achievements: {
        Row: {
          achievement_id: string;
          unlocked_at: string;
          user_id: string;
        };
        Insert: {
          achievement_id: string;
          unlocked_at?: string;
          user_id: string;
        };
        Update: {
          achievement_id?: string;
          unlocked_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_achievements_achievement_id_fkey';
            columns: ['achievement_id'];
            isOneToOne: false;
            referencedRelation: 'achievements';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_achievements_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'user_achievements_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_achievements_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      user_progress: {
        Row: {
          completed_at: string;
          step_id: string;
          user_id: string;
        };
        Insert: {
          completed_at?: string;
          step_id: string;
          user_id: string;
        };
        Update: {
          completed_at?: string;
          step_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_progress_step_id_fkey';
            columns: ['step_id'];
            isOneToOne: false;
            referencedRelation: 'journey_steps';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_progress_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'user_progress_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_progress_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      contact_phases: {
        Row: {
          contact_id: string | null;
          last_event_at: string | null;
          owner_id: string | null;
          phase: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'contacts_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'contacts_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contacts_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      effective_pipeline_events: {
        Row: {
          contact_id: string | null;
          created_at: string | null;
          created_by: string | null;
          event_type: string | null;
          id: string | null;
          occurred_at: string | null;
          org_id: string | null;
          payload: Json | null;
          source: string | null;
        };
        Insert: {
          contact_id?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          event_type?: string | null;
          id?: string | null;
          occurred_at?: string | null;
          org_id?: string | null;
          payload?: Json | null;
          source?: string | null;
        };
        Update: {
          contact_id?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          event_type?: string | null;
          id?: string | null;
          occurred_at?: string | null;
          org_id?: string | null;
          payload?: Json | null;
          source?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'pipeline_events_contact_id_fkey';
            columns: ['contact_id'];
            isOneToOne: false;
            referencedRelation: 'contact_phases';
            referencedColumns: ['contact_id'];
          },
          {
            foreignKeyName: 'pipeline_events_contact_id_fkey';
            columns: ['contact_id'];
            isOneToOne: false;
            referencedRelation: 'contacts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pipeline_events_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'pipeline_events_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pipeline_events_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pipeline_events_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      firstline_journey_progress: {
        Row: {
          completed_steps: number | null;
          current_day: number | null;
          first_name: string | null;
          journey_id: string | null;
          journey_title: string | null;
          total_days: number | null;
          total_steps: number | null;
          user_id: string | null;
          username: string | null;
        };
        Relationships: [];
      };
      profiles_public: {
        Row: {
          avatar_url: string | null;
          first_name: string | null;
          id: string | null;
          last_name: string | null;
          org_id: string | null;
          sponsor_id: string | null;
          team_id: string | null;
          username: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'memberships_identity_id_fkey';
            columns: ['sponsor_id'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'memberships_identity_id_fkey';
            columns: ['sponsor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'memberships_identity_id_fkey';
            columns: ['sponsor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'memberships_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'memberships_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      active_membership_id: { Args: never; Returns: string };
      ap_design_score_mission: {
        Args: { p_mission_type: string };
        Returns: number;
      };
      ap_recalculate: { Args: { p_membership_id: string }; Returns: number };
      check_achievements: { Args: never; Returns: string[] };
      coach_messages_today: { Args: { p_user: string }; Returns: number };
      commit_daily_plan: { Args: { p_plan_id: string }; Returns: undefined };
      complete_ap_task: {
        Args: { p_note?: string; p_task_key: string };
        Returns: {
          ap_awarded: number;
          completion_id: string;
          new_ap_total: number;
        }[];
      };
      complete_journey_step: { Args: { p_step_id: string }; Returns: undefined };
      correct_pipeline_event: {
        Args: { p_event_id: string };
        Returns: undefined;
      };
      count_active_firstlines: {
        Args: { p_membership: string };
        Returns: number;
      };
      create_invite: {
        Args: { invite_role?: string };
        Returns: {
          invite_code: string;
          invite_expires_at: string;
        }[];
      };
      current_org_id: { Args: never; Returns: string };
      current_team_id: { Args: never; Returns: string };
      current_user_role: { Args: never; Returns: string };
      evaluate_team_leader_qualification: {
        Args: { p_membership: string };
        Returns: boolean;
      };
      event_phase_rank: { Args: { p_event_type: string }; Returns: number };
      generate_daily_plan: { Args: { p_date: string }; Returns: string };
      get_downline: {
        Args: { root_user_id: string };
        Returns: {
          depth: number;
          user_id: string;
        }[];
      };
      get_genealogy_tree: {
        Args: { p_root_identity?: string };
        Returns: {
          ap_total: number;
          avatar_url: string;
          depth: number;
          direct_count: number;
          first_name: string;
          frame_asset: string;
          icp_month: number;
          identity_id: string;
          is_berater_des_monats: boolean;
          is_favorite: boolean;
          joined_at: string;
          last_app_opened_at: string;
          last_name: string;
          membership_id: string;
          message_badge: number;
          phone: string;
          rank_key: string;
          rank_label: string;
          role: string;
          sponsor_membership_id: string;
          sponsor_name: string;
          streak_days: number;
          team_count: number;
          username: string;
        }[];
      };
      get_leader_dashboard: { Args: never; Returns: Json };
      get_qualification_progress: {
        Args: { p_membership?: string };
        Returns: Json;
      };
      get_smart_warnings: { Args: never; Returns: Json };
      get_team_insights: { Args: never; Returns: Json };
      get_team_leader_progress: {
        Args: { p_membership?: string };
        Returns: {
          active_firstlines: number;
          bonus_amount_cents: number;
          bonus_entitled: boolean;
          bonus_paid: boolean;
          membership_id: string;
          qualified: boolean;
          qualified_at: string;
          required_firstlines: number;
        }[];
      };
      get_team_leaderboard: {
        Args: { p_period?: string; p_sort?: string };
        Returns: {
          ap_total: number;
          avatar_url: string;
          direct_count: number;
          first_name: string;
          frame_asset: string;
          identity_id: string;
          last_name: string;
          membership_id: string;
          metric: number;
          rank_label: string;
        }[];
      };
      is_ancestor_of: { Args: { p_target: string }; Returns: boolean };
      is_super_admin: { Args: never; Returns: boolean };
      list_ap_tasks: {
        Args: never;
        Returns: {
          ap: number;
          category: string;
          cooldown_hours: number | null;
          created_at: string;
          description: string | null;
          difficulty: string;
          id: string;
          is_active: boolean;
          key: string;
          org_id: string;
          repeatable: boolean;
          sort_order: number;
          title: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'ap_task_defs';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      match_knowledge: {
        Args: {
          match_categories?: string[];
          match_count?: number;
          min_similarity?: number;
          p_org_id: string;
          query_embedding: string;
        };
        Returns: {
          category: string;
          content: string;
          doc_id: string;
          doc_title: string;
          similarity: number;
        }[];
      };
      next_rank_for_ap: {
        Args: { p_ap: number; p_org_id: string };
        Returns: {
          key: string;
          label: string;
          threshold_ap: number;
        }[];
      };
      plan_contact_state: {
        Args: never;
        Returns: {
          fit_check_done: boolean;
          id: string;
          last_event_at: string;
          max_rank: number;
          name: string;
          next_step: string;
          next_step_due: string;
          presentation_sent_at: string;
          presentation_viewed: boolean;
          three_way_done: boolean;
        }[];
      };
      plan_signal_fit_check: {
        Args: { p_date: string };
        Returns: {
          contact_id: string;
          mission_type: string;
          reason: string;
          score: number;
          title: string;
        }[];
      };
      plan_signal_follow_up: {
        Args: { p_date: string };
        Returns: {
          contact_id: string;
          mission_type: string;
          reason: string;
          score: number;
          title: string;
        }[];
      };
      plan_signal_next_step: {
        Args: { p_date: string };
        Returns: {
          contact_id: string;
          mission_type: string;
          reason: string;
          score: number;
          title: string;
        }[];
      };
      plan_signal_presentation: {
        Args: { p_date: string };
        Returns: {
          contact_id: string;
          mission_type: string;
          reason: string;
          score: number;
          title: string;
        }[];
      };
      plan_signal_reactivate: {
        Args: { p_date: string };
        Returns: {
          contact_id: string;
          mission_type: string;
          reason: string;
          score: number;
          title: string;
        }[];
      };
      rank_for_ap: {
        Args: { p_ap: number; p_org_id: string };
        Returns: {
          frame_asset: string;
          key: string;
          label: string;
          sort_order: number;
          threshold_ap: number;
        }[];
      };
      redeem_invite: {
        Args: { invite_code: string };
        Returns: {
          membership_id: string;
          org_id: string;
          org_name: string;
        }[];
      };
      toggle_leadership_favorite: {
        Args: { p_target_membership: string };
        Returns: boolean;
      };
      track_usage: {
        Args: { p_event: string; p_meta?: Json; p_user: string };
        Returns: undefined;
      };
      update_mission_status: {
        Args: { p_item_id: string; p_reason?: string; p_status: string };
        Returns: undefined;
      };
      upsert_leadership_note: {
        Args: { p_body: string; p_target_membership: string };
        Returns: string;
      };
      validate_invite: {
        Args: { invite_code: string };
        Returns: {
          org_name: string;
          sponsor_first_name: string;
          team_name: string;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
