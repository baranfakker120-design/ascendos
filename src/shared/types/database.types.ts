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
      ai_usage_events: {
        Row: {
          created_at: string;
          estimated_cost_micros: number | null;
          feature: string;
          id: string;
          input_tokens: number;
          metadata: Json;
          model: string | null;
          org_id: string;
          output_tokens: number;
          provider: string | null;
          request_id: string | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          estimated_cost_micros?: number | null;
          feature: string;
          id?: string;
          input_tokens?: number;
          metadata?: Json;
          model?: string | null;
          org_id: string;
          output_tokens?: number;
          provider?: string | null;
          request_id?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          estimated_cost_micros?: number | null;
          feature?: string;
          id?: string;
          input_tokens?: number;
          metadata?: Json;
          model?: string | null;
          org_id?: string;
          output_tokens?: number;
          provider?: string | null;
          request_id?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'ai_usage_events_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_usage_events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
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
      ascend_stories: {
        Row: {
          active: boolean;
          author_label: string;
          body: string;
          created_at: string;
          created_by: string | null;
          expires_at: string;
          id: string;
          media_kind: string;
          media_path: string | null;
          media_url: string | null;
          org_id: string;
          published_at: string;
          source: string;
          story_type: string;
          subject_membership_id: string | null;
          subject_name: string | null;
          title: string;
          tone: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          active?: boolean;
          author_label?: string;
          body: string;
          created_at?: string;
          created_by?: string | null;
          expires_at: string;
          id?: string;
          media_kind?: string;
          media_path?: string | null;
          media_url?: string | null;
          org_id?: string;
          published_at?: string;
          source?: string;
          story_type: string;
          subject_membership_id?: string | null;
          subject_name?: string | null;
          title: string;
          tone?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          active?: boolean;
          author_label?: string;
          body?: string;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string;
          id?: string;
          media_kind?: string;
          media_path?: string | null;
          media_url?: string | null;
          org_id?: string;
          published_at?: string;
          source?: string;
          story_type?: string;
          subject_membership_id?: string | null;
          subject_name?: string | null;
          title?: string;
          tone?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'ascend_stories_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'ascend_stories_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ascend_stories_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ascend_stories_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ascend_stories_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'ascend_stories_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ascend_stories_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      billing_config: {
        Row: {
          base_price_cents: number;
          currency: string;
          id: number;
          plan_key: string;
          seat_price_cents: number;
          updated_at: string;
        };
        Insert: {
          base_price_cents?: number;
          currency?: string;
          id?: number;
          plan_key?: string;
          seat_price_cents?: number;
          updated_at?: string;
        };
        Update: {
          base_price_cents?: number;
          currency?: string;
          id?: number;
          plan_key?: string;
          seat_price_cents?: number;
          updated_at?: string;
        };
        Relationships: [];
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
      coach_knowledge_articles: {
        Row: {
          active: boolean;
          approved_at: string | null;
          approved_by: string | null;
          body_html: string;
          body_markdown: string;
          category: string;
          contradiction_flags: Json;
          contradiction_summary: string | null;
          created_at: string;
          created_by: string | null;
          current_version: number;
          id: string;
          org_id: string;
          slug: string;
          status: string;
          tags: string[];
          title: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          active?: boolean;
          approved_at?: string | null;
          approved_by?: string | null;
          body_html?: string;
          body_markdown?: string;
          category?: string;
          contradiction_flags?: Json;
          contradiction_summary?: string | null;
          created_at?: string;
          created_by?: string | null;
          current_version?: number;
          id?: string;
          org_id?: string;
          slug: string;
          status?: string;
          tags?: string[];
          title: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          active?: boolean;
          approved_at?: string | null;
          approved_by?: string | null;
          body_html?: string;
          body_markdown?: string;
          category?: string;
          contradiction_flags?: Json;
          contradiction_summary?: string | null;
          created_at?: string;
          created_by?: string | null;
          current_version?: number;
          id?: string;
          org_id?: string;
          slug?: string;
          status?: string;
          tags?: string[];
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'coach_knowledge_articles_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'coach_knowledge_articles_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'coach_knowledge_articles_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'coach_knowledge_articles_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'coach_knowledge_articles_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'coach_knowledge_articles_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'coach_knowledge_articles_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'coach_knowledge_articles_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'coach_knowledge_articles_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'coach_knowledge_articles_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      coach_knowledge_change_log: {
        Row: {
          action: string;
          actor_id: string | null;
          article_id: string;
          created_at: string;
          detail: string | null;
          id: string;
          version: number | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          article_id: string;
          created_at?: string;
          detail?: string | null;
          id?: string;
          version?: number | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          article_id?: string;
          created_at?: string;
          detail?: string | null;
          id?: string;
          version?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'coach_knowledge_change_log_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'coach_knowledge_change_log_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'coach_knowledge_change_log_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'coach_knowledge_change_log_article_id_fkey';
            columns: ['article_id'];
            isOneToOne: false;
            referencedRelation: 'coach_knowledge_articles';
            referencedColumns: ['id'];
          },
        ];
      };
      coach_knowledge_versions: {
        Row: {
          article_id: string;
          body_html: string;
          body_markdown: string;
          category: string;
          change_summary: string | null;
          contradiction_flags: Json;
          created_at: string;
          created_by: string | null;
          id: string;
          status: string;
          tags: string[];
          title: string;
          version: number;
        };
        Insert: {
          article_id: string;
          body_html?: string;
          body_markdown: string;
          category: string;
          change_summary?: string | null;
          contradiction_flags?: Json;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          status: string;
          tags?: string[];
          title: string;
          version: number;
        };
        Update: {
          article_id?: string;
          body_html?: string;
          body_markdown?: string;
          category?: string;
          change_summary?: string | null;
          contradiction_flags?: Json;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          status?: string;
          tags?: string[];
          title?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'coach_knowledge_versions_article_id_fkey';
            columns: ['article_id'];
            isOneToOne: false;
            referencedRelation: 'coach_knowledge_articles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'coach_knowledge_versions_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'coach_knowledge_versions_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'coach_knowledge_versions_created_by_fkey';
            columns: ['created_by'];
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
      coaching_notification_outbox: {
        Row: {
          body: string;
          created_at: string;
          event_id: string;
          id: string;
          kind: string;
          org_id: string;
          scheduled_for: string;
          sent_at: string | null;
          title: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          event_id: string;
          id?: string;
          kind: string;
          org_id?: string;
          scheduled_for: string;
          sent_at?: string | null;
          title: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          event_id?: string;
          id?: string;
          kind?: string;
          org_id?: string;
          scheduled_for?: string;
          sent_at?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'coaching_notification_outbox_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'live_coaching_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'coaching_notification_outbox_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
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
      content_assets: {
        Row: {
          analysis_json: Json;
          analysis_status: string;
          aspect_ratio: string | null;
          audience_hint: string | null;
          byte_size: number;
          created_at: string;
          created_by: string;
          detected_summary: string | null;
          file_name: string;
          height_px: number | null;
          id: string;
          keywords: string[];
          last_used_at: string | null;
          media_kind: string;
          mime_type: string;
          mood: string | null;
          org_id: string;
          owner_membership_id: string;
          product_hint: string | null;
          scope: string;
          storage_path: string;
          suggested_formats: string[];
          theme: string | null;
          title: string | null;
          updated_at: string;
          usage_count: number;
          width_px: number | null;
        };
        Insert: {
          analysis_json?: Json;
          analysis_status?: string;
          aspect_ratio?: string | null;
          audience_hint?: string | null;
          byte_size: number;
          created_at?: string;
          created_by: string;
          detected_summary?: string | null;
          file_name: string;
          height_px?: number | null;
          id?: string;
          keywords?: string[];
          last_used_at?: string | null;
          media_kind: string;
          mime_type: string;
          mood?: string | null;
          org_id: string;
          owner_membership_id: string;
          product_hint?: string | null;
          scope?: string;
          storage_path: string;
          suggested_formats?: string[];
          theme?: string | null;
          title?: string | null;
          updated_at?: string;
          usage_count?: number;
          width_px?: number | null;
        };
        Update: {
          analysis_json?: Json;
          analysis_status?: string;
          aspect_ratio?: string | null;
          audience_hint?: string | null;
          byte_size?: number;
          created_at?: string;
          created_by?: string;
          detected_summary?: string | null;
          file_name?: string;
          height_px?: number | null;
          id?: string;
          keywords?: string[];
          last_used_at?: string | null;
          media_kind?: string;
          mime_type?: string;
          mood?: string | null;
          org_id?: string;
          owner_membership_id?: string;
          product_hint?: string | null;
          scope?: string;
          storage_path?: string;
          suggested_formats?: string[];
          theme?: string | null;
          title?: string | null;
          updated_at?: string;
          usage_count?: number;
          width_px?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'content_assets_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'content_assets_owner_membership_id_fkey';
            columns: ['owner_membership_id'];
            isOneToOne: false;
            referencedRelation: 'memberships';
            referencedColumns: ['id'];
          },
        ];
      };
      content_autopilot_plans: {
        Row: {
          created_at: string;
          id: string;
          membership_id: string;
          org_id: string;
          period_end: string;
          period_start: string;
          status: string;
          summary: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          membership_id: string;
          org_id: string;
          period_end: string;
          period_start: string;
          status?: string;
          summary?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          membership_id?: string;
          org_id?: string;
          period_end?: string;
          period_start?: string;
          status?: string;
          summary?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'content_autopilot_plans_membership_id_fkey';
            columns: ['membership_id'];
            isOneToOne: false;
            referencedRelation: 'memberships';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'content_autopilot_plans_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      content_autopilot_settings: {
        Row: {
          consent_confirmed_at: string | null;
          created_at: string;
          enabled: boolean;
          id: string;
          last_activated_at: string | null;
          last_paused_at: string | null;
          max_feed_per_day: number;
          max_stories_per_day: number;
          membership_id: string;
          min_eligible_assets: number;
          org_id: string;
          paused: boolean;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          consent_confirmed_at?: string | null;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          last_activated_at?: string | null;
          last_paused_at?: string | null;
          max_feed_per_day?: number;
          max_stories_per_day?: number;
          membership_id: string;
          min_eligible_assets?: number;
          org_id: string;
          paused?: boolean;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          consent_confirmed_at?: string | null;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          last_activated_at?: string | null;
          last_paused_at?: string | null;
          max_feed_per_day?: number;
          max_stories_per_day?: number;
          membership_id?: string;
          min_eligible_assets?: number;
          org_id?: string;
          paused?: boolean;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'content_autopilot_settings_membership_id_fkey';
            columns: ['membership_id'];
            isOneToOne: false;
            referencedRelation: 'memberships';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'content_autopilot_settings_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      content_autopilot_slots: {
        Row: {
          asset_id: string | null;
          carousel_asset_ids: string[];
          category: string | null;
          content_format: string;
          created_at: string;
          draft_id: string | null;
          error_message: string | null;
          id: string;
          max_retries: number;
          membership_id: string;
          org_id: string;
          performance_json: Json;
          plan_id: string;
          planned_for: string;
          publish_attempt_id: string | null;
          published_at: string | null;
          retry_count: number;
          selection_reason: string | null;
          slot_kind: string;
          status: string;
          theme: string | null;
          updated_at: string;
        };
        Insert: {
          asset_id?: string | null;
          carousel_asset_ids?: string[];
          category?: string | null;
          content_format: string;
          created_at?: string;
          draft_id?: string | null;
          error_message?: string | null;
          id?: string;
          max_retries?: number;
          membership_id: string;
          org_id: string;
          performance_json?: Json;
          plan_id: string;
          planned_for: string;
          publish_attempt_id?: string | null;
          published_at?: string | null;
          retry_count?: number;
          selection_reason?: string | null;
          slot_kind: string;
          status?: string;
          theme?: string | null;
          updated_at?: string;
        };
        Update: {
          asset_id?: string | null;
          carousel_asset_ids?: string[];
          category?: string | null;
          content_format?: string;
          created_at?: string;
          draft_id?: string | null;
          error_message?: string | null;
          id?: string;
          max_retries?: number;
          membership_id?: string;
          org_id?: string;
          performance_json?: Json;
          plan_id?: string;
          planned_for?: string;
          publish_attempt_id?: string | null;
          published_at?: string | null;
          retry_count?: number;
          selection_reason?: string | null;
          slot_kind?: string;
          status?: string;
          theme?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'content_autopilot_slots_asset_id_fkey';
            columns: ['asset_id'];
            isOneToOne: false;
            referencedRelation: 'content_assets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'content_autopilot_slots_draft_id_fkey';
            columns: ['draft_id'];
            isOneToOne: false;
            referencedRelation: 'content_drafts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'content_autopilot_slots_membership_id_fkey';
            columns: ['membership_id'];
            isOneToOne: false;
            referencedRelation: 'memberships';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'content_autopilot_slots_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'content_autopilot_slots_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'content_autopilot_plans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'content_autopilot_slots_publish_attempt_id_fkey';
            columns: ['publish_attempt_id'];
            isOneToOne: false;
            referencedRelation: 'content_publish_attempts';
            referencedColumns: ['id'];
          },
        ];
      };
      content_daily_preparations: {
        Row: {
          asset_id: string | null;
          created_at: string;
          draft_id: string | null;
          id: string;
          membership_id: string;
          org_id: string;
          prep_date: string;
          score: number | null;
          status: string;
          summary: string | null;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          asset_id?: string | null;
          created_at?: string;
          draft_id?: string | null;
          id?: string;
          membership_id: string;
          org_id: string;
          prep_date: string;
          score?: number | null;
          status?: string;
          summary?: string | null;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          asset_id?: string | null;
          created_at?: string;
          draft_id?: string | null;
          id?: string;
          membership_id?: string;
          org_id?: string;
          prep_date?: string;
          score?: number | null;
          status?: string;
          summary?: string | null;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'content_daily_preparations_asset_id_fkey';
            columns: ['asset_id'];
            isOneToOne: false;
            referencedRelation: 'content_assets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'content_daily_preparations_draft_id_fkey';
            columns: ['draft_id'];
            isOneToOne: false;
            referencedRelation: 'content_drafts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'content_daily_preparations_membership_id_fkey';
            columns: ['membership_id'];
            isOneToOne: false;
            referencedRelation: 'memberships';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'content_daily_preparations_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      content_drafts: {
        Row: {
          analysis_json: Json;
          asset_id: string;
          caption: string | null;
          carousel_asset_ids: string[];
          clean_check_notes: string | null;
          clean_check_status: string;
          content_score: number | null;
          created_at: string;
          cta: string | null;
          format: string;
          hashtags: string[];
          hook: string | null;
          id: string;
          instagram_audio_json: Json | null;
          keywords: string[];
          org_id: string;
          owner_membership_id: string;
          posting_hint: string | null;
          status: string;
          target_audience: string | null;
          updated_at: string;
        };
        Insert: {
          analysis_json?: Json;
          asset_id: string;
          caption?: string | null;
          carousel_asset_ids?: string[];
          clean_check_notes?: string | null;
          clean_check_status?: string;
          content_score?: number | null;
          created_at?: string;
          cta?: string | null;
          format: string;
          hashtags?: string[];
          hook?: string | null;
          id?: string;
          instagram_audio_json?: Json | null;
          keywords?: string[];
          org_id: string;
          owner_membership_id: string;
          posting_hint?: string | null;
          status?: string;
          target_audience?: string | null;
          updated_at?: string;
        };
        Update: {
          analysis_json?: Json;
          asset_id?: string;
          caption?: string | null;
          carousel_asset_ids?: string[];
          clean_check_notes?: string | null;
          clean_check_status?: string;
          content_score?: number | null;
          created_at?: string;
          cta?: string | null;
          format?: string;
          hashtags?: string[];
          hook?: string | null;
          id?: string;
          instagram_audio_json?: Json | null;
          keywords?: string[];
          org_id?: string;
          owner_membership_id?: string;
          posting_hint?: string | null;
          status?: string;
          target_audience?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'content_drafts_asset_id_fkey';
            columns: ['asset_id'];
            isOneToOne: false;
            referencedRelation: 'content_assets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'content_drafts_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'content_drafts_owner_membership_id_fkey';
            columns: ['owner_membership_id'];
            isOneToOne: false;
            referencedRelation: 'memberships';
            referencedColumns: ['id'];
          },
        ];
      };
      content_facebook_business_connections: {
        Row: {
          connected_at: string | null;
          created_at: string;
          disconnected_at: string | null;
          fb_user_id: string | null;
          id: string;
          ig_user_id: string | null;
          ig_username: string | null;
          last_error: string | null;
          membership_id: string;
          org_id: string;
          page_id: string | null;
          page_name: string | null;
          page_token_ref: string | null;
          scopes: string[];
          status: string;
          token_expires_at: string | null;
          updated_at: string;
          user_token_ref: string | null;
        };
        Insert: {
          connected_at?: string | null;
          created_at?: string;
          disconnected_at?: string | null;
          fb_user_id?: string | null;
          id?: string;
          ig_user_id?: string | null;
          ig_username?: string | null;
          last_error?: string | null;
          membership_id: string;
          org_id: string;
          page_id?: string | null;
          page_name?: string | null;
          page_token_ref?: string | null;
          scopes?: string[];
          status?: string;
          token_expires_at?: string | null;
          updated_at?: string;
          user_token_ref?: string | null;
        };
        Update: {
          connected_at?: string | null;
          created_at?: string;
          disconnected_at?: string | null;
          fb_user_id?: string | null;
          id?: string;
          ig_user_id?: string | null;
          ig_username?: string | null;
          last_error?: string | null;
          membership_id?: string;
          org_id?: string;
          page_id?: string | null;
          page_name?: string | null;
          page_token_ref?: string | null;
          scopes?: string[];
          status?: string;
          token_expires_at?: string | null;
          updated_at?: string;
          user_token_ref?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'content_facebook_business_connections_membership_id_fkey';
            columns: ['membership_id'];
            isOneToOne: false;
            referencedRelation: 'memberships';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'content_facebook_business_connections_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      content_instagram_connections: {
        Row: {
          connected_at: string | null;
          created_at: string;
          disconnected_at: string | null;
          id: string;
          ig_user_id: string | null;
          ig_username: string | null;
          last_error: string | null;
          membership_id: string;
          org_id: string;
          scopes: string[];
          status: string;
          token_ref: string | null;
          updated_at: string;
        };
        Insert: {
          connected_at?: string | null;
          created_at?: string;
          disconnected_at?: string | null;
          id?: string;
          ig_user_id?: string | null;
          ig_username?: string | null;
          last_error?: string | null;
          membership_id: string;
          org_id: string;
          scopes?: string[];
          status?: string;
          token_ref?: string | null;
          updated_at?: string;
        };
        Update: {
          connected_at?: string | null;
          created_at?: string;
          disconnected_at?: string | null;
          id?: string;
          ig_user_id?: string | null;
          ig_username?: string | null;
          last_error?: string | null;
          membership_id?: string;
          org_id?: string;
          scopes?: string[];
          status?: string;
          token_ref?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'content_instagram_connections_membership_id_fkey';
            columns: ['membership_id'];
            isOneToOne: false;
            referencedRelation: 'memberships';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'content_instagram_connections_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      content_publish_attempts: {
        Row: {
          connection_id: string | null;
          created_at: string;
          draft_id: string;
          error_message: string | null;
          id: string;
          membership_id: string;
          meta_container_id: string | null;
          meta_media_id: string | null;
          org_id: string;
          status: string;
          updated_at: string;
          user_confirmed_at: string | null;
        };
        Insert: {
          connection_id?: string | null;
          created_at?: string;
          draft_id: string;
          error_message?: string | null;
          id?: string;
          membership_id: string;
          meta_container_id?: string | null;
          meta_media_id?: string | null;
          org_id: string;
          status?: string;
          updated_at?: string;
          user_confirmed_at?: string | null;
        };
        Update: {
          connection_id?: string | null;
          created_at?: string;
          draft_id?: string;
          error_message?: string | null;
          id?: string;
          membership_id?: string;
          meta_container_id?: string | null;
          meta_media_id?: string | null;
          org_id?: string;
          status?: string;
          updated_at?: string;
          user_confirmed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'content_publish_attempts_connection_id_fkey';
            columns: ['connection_id'];
            isOneToOne: false;
            referencedRelation: 'content_instagram_connections';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'content_publish_attempts_draft_id_fkey';
            columns: ['draft_id'];
            isOneToOne: false;
            referencedRelation: 'content_drafts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'content_publish_attempts_membership_id_fkey';
            columns: ['membership_id'];
            isOneToOne: false;
            referencedRelation: 'memberships';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'content_publish_attempts_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
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
      knowledge_pdf_documents: {
        Row: {
          article_id: string | null;
          byte_size: number | null;
          coach_rag_enabled: boolean;
          content_sha256: string | null;
          created_at: string;
          created_by: string | null;
          duplicate_of_id: string | null;
          error_message: string | null;
          fast_scan_result: string | null;
          id: string;
          image_page_count: number;
          org_id: string;
          page_count: number;
          rag_doc_id: string | null;
          source_filename: string;
          status: string;
          storage_path: string;
          table_count: number;
          text_page_count: number;
          title: string;
          updated_at: string;
          updated_by: string | null;
          vision_page_count: number;
        };
        Insert: {
          article_id?: string | null;
          byte_size?: number | null;
          coach_rag_enabled?: boolean;
          content_sha256?: string | null;
          created_at?: string;
          created_by?: string | null;
          duplicate_of_id?: string | null;
          error_message?: string | null;
          fast_scan_result?: string | null;
          id?: string;
          image_page_count?: number;
          org_id?: string;
          page_count?: number;
          rag_doc_id?: string | null;
          source_filename: string;
          status?: string;
          storage_path: string;
          table_count?: number;
          text_page_count?: number;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
          vision_page_count?: number;
        };
        Update: {
          article_id?: string | null;
          byte_size?: number | null;
          coach_rag_enabled?: boolean;
          content_sha256?: string | null;
          created_at?: string;
          created_by?: string | null;
          duplicate_of_id?: string | null;
          error_message?: string | null;
          fast_scan_result?: string | null;
          id?: string;
          image_page_count?: number;
          org_id?: string;
          page_count?: number;
          rag_doc_id?: string | null;
          source_filename?: string;
          status?: string;
          storage_path?: string;
          table_count?: number;
          text_page_count?: number;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
          vision_page_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'knowledge_pdf_documents_article_id_fkey';
            columns: ['article_id'];
            isOneToOne: false;
            referencedRelation: 'coach_knowledge_articles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'knowledge_pdf_documents_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'knowledge_pdf_documents_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'knowledge_pdf_documents_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'knowledge_pdf_documents_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'knowledge_pdf_documents_rag_doc_id_fkey';
            columns: ['rag_doc_id'];
            isOneToOne: false;
            referencedRelation: 'knowledge_docs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'knowledge_pdf_documents_duplicate_of_id_fkey';
            columns: ['duplicate_of_id'];
            isOneToOne: false;
            referencedRelation: 'knowledge_pdf_documents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'knowledge_pdf_documents_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'knowledge_pdf_documents_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'knowledge_pdf_documents_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      knowledge_pdf_pages: {
        Row: {
          created_at: string;
          document_id: string;
          error_message: string | null;
          extracted_text: string;
          id: string;
          image_detected: boolean;
          important_terms: Json;
          key_facts: Json;
          needs_review: boolean;
          org_id: string;
          page_number: number;
          page_type: string;
          section: string | null;
          table_data: Json;
          updated_at: string;
          vision_confidence: string | null;
          vision_used: boolean;
          visual_summary: string | null;
        };
        Insert: {
          created_at?: string;
          document_id: string;
          error_message?: string | null;
          extracted_text?: string;
          id?: string;
          image_detected?: boolean;
          important_terms?: Json;
          key_facts?: Json;
          needs_review?: boolean;
          org_id?: string;
          page_number: number;
          page_type: string;
          section?: string | null;
          table_data?: Json;
          updated_at?: string;
          vision_confidence?: string | null;
          vision_used?: boolean;
          visual_summary?: string | null;
        };
        Update: {
          created_at?: string;
          document_id?: string;
          error_message?: string | null;
          extracted_text?: string;
          id?: string;
          image_detected?: boolean;
          important_terms?: Json;
          key_facts?: Json;
          needs_review?: boolean;
          org_id?: string;
          page_number?: number;
          page_type?: string;
          section?: string | null;
          table_data?: Json;
          updated_at?: string;
          vision_confidence?: string | null;
          vision_used?: boolean;
          visual_summary?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'knowledge_pdf_pages_document_id_fkey';
            columns: ['document_id'];
            isOneToOne: false;
            referencedRelation: 'knowledge_pdf_documents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'knowledge_pdf_pages_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
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
      live_coaching_events: {
        Row: {
          active: boolean;
          category: string;
          coach_name: string;
          created_at: string;
          created_by: string | null;
          description: string | null;
          duration_minutes: number;
          guest_speakers: Json;
          id: string;
          language: string;
          library_visible: boolean;
          media_path: string | null;
          media_type: string;
          media_url: string | null;
          org_id: string;
          published_at: string | null;
          published_by: string | null;
          recording_url: string | null;
          repeat_rule: string;
          replay_url: string | null;
          starts_at: string;
          subtitle: string | null;
          title: string;
          updated_at: string;
          updated_by: string | null;
          zoom_url: string | null;
        };
        Insert: {
          active?: boolean;
          category?: string;
          coach_name?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          duration_minutes?: number;
          guest_speakers?: Json;
          id?: string;
          language?: string;
          library_visible?: boolean;
          media_path?: string | null;
          media_type: string;
          media_url?: string | null;
          org_id?: string;
          published_at?: string | null;
          published_by?: string | null;
          recording_url?: string | null;
          repeat_rule?: string;
          replay_url?: string | null;
          starts_at: string;
          subtitle?: string | null;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
          zoom_url?: string | null;
        };
        Update: {
          active?: boolean;
          category?: string;
          coach_name?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          duration_minutes?: number;
          guest_speakers?: Json;
          id?: string;
          language?: string;
          library_visible?: boolean;
          media_path?: string | null;
          media_type?: string;
          media_url?: string | null;
          org_id?: string;
          published_at?: string | null;
          published_by?: string | null;
          recording_url?: string | null;
          repeat_rule?: string;
          replay_url?: string | null;
          starts_at?: string;
          subtitle?: string | null;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
          zoom_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'live_coaching_events_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'live_coaching_events_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'live_coaching_events_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'live_coaching_events_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'live_coaching_events_published_by_fkey';
            columns: ['published_by'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'live_coaching_events_published_by_fkey';
            columns: ['published_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'live_coaching_events_published_by_fkey';
            columns: ['published_by'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'live_coaching_events_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'live_coaching_events_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'live_coaching_events_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
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
      meta_data_deletion_requests: {
        Row: {
          completed_at: string | null;
          confirmation_code: string;
          connections_cleared: number;
          created_at: string;
          id: string;
          meta_user_id: string;
          publish_attempts_cleared: number;
          status: string;
        };
        Insert: {
          completed_at?: string | null;
          confirmation_code: string;
          connections_cleared?: number;
          created_at?: string;
          id?: string;
          meta_user_id: string;
          publish_attempts_cleared?: number;
          status: string;
        };
        Update: {
          completed_at?: string | null;
          confirmation_code?: string;
          connections_cleared?: number;
          created_at?: string;
          id?: string;
          meta_user_id?: string;
          publish_attempts_cleared?: number;
          status?: string;
        };
        Relationships: [];
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
      org_billing_accounts: {
        Row: {
          billing_email: string | null;
          created_at: string;
          currency: string;
          id: string;
          organization_id: string;
          provider_customer_id: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          billing_email?: string | null;
          created_at?: string;
          currency?: string;
          id?: string;
          organization_id: string;
          provider_customer_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          billing_email?: string | null;
          created_at?: string;
          currency?: string;
          id?: string;
          organization_id?: string;
          provider_customer_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'org_billing_accounts_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: true;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      org_invoices: {
        Row: {
          created_at: string;
          currency: string;
          id: string;
          organization_id: string;
          period_end: string | null;
          period_start: string | null;
          status: string;
          subtotal_cents: number;
          total_cents: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          id?: string;
          organization_id: string;
          period_end?: string | null;
          period_start?: string | null;
          status?: string;
          subtotal_cents?: number;
          total_cents?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          currency?: string;
          id?: string;
          organization_id?: string;
          period_end?: string | null;
          period_start?: string | null;
          status?: string;
          subtotal_cents?: number;
          total_cents?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'org_invoices_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      org_subscription_items: {
        Row: {
          created_at: string;
          id: string;
          item_type: string;
          organization_id: string;
          quantity: number;
          subscription_id: string;
          unit_price_cents: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          item_type: string;
          organization_id: string;
          quantity: number;
          subscription_id: string;
          unit_price_cents: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          item_type?: string;
          organization_id?: string;
          quantity?: number;
          subscription_id?: string;
          unit_price_cents?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'org_subscription_items_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'org_subscription_items_subscription_id_fkey';
            columns: ['subscription_id'];
            isOneToOne: false;
            referencedRelation: 'org_subscriptions';
            referencedColumns: ['id'];
          },
        ];
      };
      org_subscriptions: {
        Row: {
          base_price_cents: number;
          created_at: string;
          currency: string;
          current_period_end: string;
          current_period_start: string;
          id: string;
          organization_id: string;
          plan_key: string;
          seat_price_cents: number;
          status: string;
          updated_at: string;
        };
        Insert: {
          base_price_cents: number;
          created_at?: string;
          currency?: string;
          current_period_end?: string;
          current_period_start?: string;
          id?: string;
          organization_id: string;
          plan_key?: string;
          seat_price_cents: number;
          status?: string;
          updated_at?: string;
        };
        Update: {
          base_price_cents?: number;
          created_at?: string;
          currency?: string;
          current_period_end?: string;
          current_period_start?: string;
          id?: string;
          organization_id?: string;
          plan_key?: string;
          seat_price_cents?: number;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'org_subscriptions_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: true;
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
          status: string;
        };
        Insert: {
          branding?: Json;
          created_at?: string;
          id?: string;
          name: string;
          settings?: Json;
          status?: string;
        };
        Update: {
          branding?: Json;
          created_at?: string;
          id?: string;
          name?: string;
          settings?: Json;
          status?: string;
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
      platform_admins: {
        Row: {
          created_at: string;
          granted_at: string;
          granted_by: string | null;
          id: string;
          identity_id: string;
          is_active: boolean;
          notes: string | null;
          revoked_at: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          granted_at?: string;
          granted_by?: string | null;
          id?: string;
          identity_id: string;
          is_active?: boolean;
          notes?: string | null;
          revoked_at?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          granted_at?: string;
          granted_by?: string | null;
          id?: string;
          identity_id?: string;
          is_active?: boolean;
          notes?: string | null;
          revoked_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'platform_admins_granted_by_fkey';
            columns: ['granted_by'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'platform_admins_granted_by_fkey';
            columns: ['granted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'platform_admins_granted_by_fkey';
            columns: ['granted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'platform_admins_identity_id_fkey';
            columns: ['identity_id'];
            isOneToOne: true;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'platform_admins_identity_id_fkey';
            columns: ['identity_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'platform_admins_identity_id_fkey';
            columns: ['identity_id'];
            isOneToOne: true;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          account_status: string;
          avatar_url: string | null;
          country: string | null;
          created_at: string;
          deletion_requested_at: string | null;
          deletion_scheduled_for: string | null;
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
          account_status?: string;
          avatar_url?: string | null;
          country?: string | null;
          created_at?: string;
          deletion_requested_at?: string | null;
          deletion_scheduled_for?: string | null;
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
          account_status?: string;
          avatar_url?: string | null;
          country?: string | null;
          created_at?: string;
          deletion_requested_at?: string | null;
          deletion_scheduled_for?: string | null;
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
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          endpoint: string;
          id: string;
          p256dh: string;
          updated_at: string;
          user_agent: string | null;
          user_id: string;
        };
        Insert: {
          auth: string;
          created_at?: string;
          endpoint: string;
          id?: string;
          p256dh: string;
          updated_at?: string;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          auth?: string;
          created_at?: string;
          endpoint?: string;
          id?: string;
          p256dh?: string;
          updated_at?: string;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'push_subscriptions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'push_subscriptions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'push_subscriptions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
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
      team_radar_items: {
        Row: {
          canonical_url: string | null;
          content_type: string;
          created_at: string;
          detected_at: string;
          external_id: string;
          id: string;
          org_id: string;
          published_at: string;
          resolved_at: string | null;
          source: string;
          user_id: string;
        };
        Insert: {
          canonical_url?: string | null;
          content_type: string;
          created_at?: string;
          detected_at?: string;
          external_id: string;
          id?: string;
          org_id?: string;
          published_at: string;
          resolved_at?: string | null;
          source: string;
          user_id: string;
        };
        Update: {
          canonical_url?: string | null;
          content_type?: string;
          created_at?: string;
          detected_at?: string;
          external_id?: string;
          id?: string;
          org_id?: string;
          published_at?: string;
          resolved_at?: string | null;
          source?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'team_radar_items_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'team_radar_items_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'team_radar_items_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'team_radar_items_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      team_radar_user_state: {
        Row: {
          created_at: string;
          enabled: boolean;
          id: string;
          org_id: string;
          paused: boolean;
          radar_started_at: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          enabled?: boolean;
          id?: string;
          org_id?: string;
          paused?: boolean;
          radar_started_at: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          enabled?: boolean;
          id?: string;
          org_id?: string;
          paused?: boolean;
          radar_started_at?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'team_radar_user_state_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'team_radar_user_state_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'firstline_journey_progress';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'team_radar_user_state_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'team_radar_user_state_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
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
      billing_count_active_seats: {
        Args: { p_org_id: string };
        Returns: number;
      };
      billing_estimate_monthly_cents: {
        Args: {
          p_active_seats: number;
          p_base_price_cents?: number;
          p_seat_price_cents?: number;
        };
        Returns: number;
      };
      billing_get_config: { Args: never; Returns: Json };
      cancel_account_deletion: { Args: never; Returns: Json };
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
      content_asset_limit: { Args: never; Returns: number };
      content_can_upload_asset: { Args: { p_scope?: string }; Returns: boolean };
      content_personal_asset_count: { Args: never; Returns: number };
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
      display_rank_for_ap: {
        Args: { p_ap: number; p_org: string; p_team_leader_qualified?: boolean };
        Returns: {
          frame_asset: string;
          key: string;
          label: string;
          sort_order: number;
          threshold_ap: number;
        }[];
      };
      ensure_org_billing: { Args: { p_org_id: string }; Returns: undefined };
      ensure_role_frame_cosmetics: { Args: never; Returns: undefined };
      equip_frame_cosmetic: { Args: { p_item_id: string }; Returns: undefined };
      evaluate_team_leader_qualification: {
        Args: { p_membership: string };
        Returns: boolean;
      };
      event_phase_rank: { Args: { p_event_type: string }; Returns: number };
      finalize_account_deletion: { Args: { p_user_id: string }; Returns: Json };
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
      is_coach_content_manager: { Args: never; Returns: boolean };
      is_organization_admin: { Args: never; Returns: boolean };
      is_platform_super_admin: { Args: never; Returns: boolean };
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
      list_due_account_deletions: {
        Args: { p_limit?: number };
        Returns: {
          deletion_scheduled_for: string;
          user_id: string;
        }[];
      };
      list_my_frame_cosmetics: {
        Args: never;
        Returns: {
          asset_path: string;
          is_equipped: boolean;
          item_id: string;
          label: string;
          rank_key: string;
          unlocked_at: string;
        }[];
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
      org_admin_get_billing: { Args: never; Returns: Json };
      org_admin_get_usage: { Args: never; Returns: Json };
      org_admin_set_membership_role: {
        Args: { p_membership_id: string; p_role: string };
        Returns: {
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
        SetofOptions: {
          from: '*';
          to: 'memberships';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      org_admin_set_membership_status: {
        Args: { p_membership_id: string; p_status: string };
        Returns: {
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
        SetofOptions: {
          from: '*';
          to: 'memberships';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      org_admin_update_agent: {
        Args: {
          p_agent_key: string;
          p_is_active?: boolean;
          p_name?: string;
          p_system_prompt?: string;
        };
        Returns: {
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
        SetofOptions: {
          from: '*';
          to: 'agents';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      org_admin_update_branding: {
        Args: { p_branding: Json };
        Returns: {
          branding: Json;
          created_at: string;
          id: string;
          name: string;
          settings: Json;
          status: string;
        };
        SetofOptions: {
          from: '*';
          to: 'organizations';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      org_admin_upsert_external_tool: {
        Args: {
          p_description?: string;
          p_is_active?: boolean;
          p_key: string;
          p_name: string;
          p_result_event_type?: string;
          p_share_event_type?: string;
          p_sort_order?: number;
          p_url: string;
        };
        Returns: {
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
        SetofOptions: {
          from: '*';
          to: 'external_tools';
          isOneToOne: true;
          isSetofReturn: false;
        };
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
      platform_add_platform_admin: {
        Args: { p_identity_id: string; p_notes?: string };
        Returns: {
          created_at: string;
          granted_at: string;
          granted_by: string | null;
          id: string;
          identity_id: string;
          is_active: boolean;
          notes: string | null;
          revoked_at: string | null;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'platform_admins';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      platform_config_status: { Args: never; Returns: Json };
      platform_create_org_admin_invite: {
        Args: { p_invite_role?: string; p_org_id: string };
        Returns: {
          invite_code: string;
          invite_expires_at: string;
        }[];
      };
      platform_create_organization: {
        Args: {
          p_admin_identity_id?: string;
          p_display_name?: string;
          p_logo_url?: string;
          p_name: string;
          p_support_url?: string;
          p_website?: string;
        };
        Returns: {
          branding: Json;
          created_at: string;
          id: string;
          name: string;
          settings: Json;
          status: string;
        };
        SetofOptions: {
          from: '*';
          to: 'organizations';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      platform_get_organization: { Args: { p_org_id: string }; Returns: Json };
      platform_list_billing: {
        Args: { p_status?: string };
        Returns: {
          active_seats: number;
          base_price_cents: number;
          billing_status: string;
          currency: string;
          display_name: string;
          estimated_monthly_cents: number;
          organization_id: string;
          organization_name: string;
          plan_key: string;
          seat_price_cents: number;
          seat_total_cents: number;
          subscription_status: string;
        }[];
      };
      platform_list_organizations: {
        Args: never;
        Returns: {
          created_at: string;
          display_name: string;
          id: string;
          member_count: number;
          name: string;
          status: string;
          team_count: number;
        }[];
      };
      platform_list_platform_admins: {
        Args: never;
        Returns: {
          first_name: string;
          granted_at: string;
          id: string;
          identity_id: string;
          is_active: boolean;
          last_name: string;
          notes: string;
          revoked_at: string;
          username: string;
        }[];
      };
      platform_revoke_platform_admin: {
        Args: { p_identity_id: string };
        Returns: {
          created_at: string;
          granted_at: string;
          granted_by: string | null;
          id: string;
          identity_id: string;
          is_active: boolean;
          notes: string | null;
          revoked_at: string | null;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'platform_admins';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      platform_set_organization_status: {
        Args: { p_org_id: string; p_status: string };
        Returns: {
          branding: Json;
          created_at: string;
          id: string;
          name: string;
          settings: Json;
          status: string;
        };
        SetofOptions: {
          from: '*';
          to: 'organizations';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      platform_usage_overview: { Args: never; Returns: Json };
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
      refresh_org_billing_seats: { Args: { p_org_id: string }; Returns: number };
      request_account_deletion: { Args: never; Returns: Json };
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
