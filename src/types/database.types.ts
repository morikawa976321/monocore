export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      goals: {
        Row: {
          created_at: string | null
          slug: string
          sort_order: number
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          slug: string
          sort_order?: number
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          slug?: string
          sort_order?: number
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      inboxes: {
        Row: {
          content: string
          created_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Update: {
          content?: string
          created_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      project_card_decision_answers: {
        Row: {
          answer: string
          answered_at: string
          card_slug: string
          consumed_at: string | null
          decision_id: string
          id: string
          note: string | null
        }
        Insert: {
          answer: string
          answered_at?: string
          card_slug: string
          consumed_at?: string | null
          decision_id: string
          id?: string
          note?: string | null
        }
        Update: {
          answer?: string
          answered_at?: string
          card_slug?: string
          consumed_at?: string | null
          decision_id?: string
          id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_card_decision_answers_card_slug_fkey"
            columns: ["card_slug"]
            isOneToOne: false
            referencedRelation: "project_cards"
            referencedColumns: ["slug"]
          },
        ]
      }
      project_cards: {
        Row: {
          ai_next: Json
          ai_recent: Json
          collapsed: boolean
          created_at: string | null
          deadline: string | null
          deadline_note: string | null
          decisions: Json
          definition_of_done: string
          goal_slug: string | null
          slug: string
          sort_order: number
          sources: string[]
          status: string
          title: string
          updated_at: string | null
          your_turn: string
        }
        Insert: {
          ai_next?: Json
          ai_recent?: Json
          collapsed?: boolean
          created_at?: string | null
          deadline?: string | null
          deadline_note?: string | null
          decisions?: Json
          definition_of_done?: string
          goal_slug?: string | null
          slug: string
          sort_order?: number
          sources?: string[]
          status?: string
          title: string
          updated_at?: string | null
          your_turn?: string
        }
        Update: {
          ai_next?: Json
          ai_recent?: Json
          collapsed?: boolean
          created_at?: string | null
          deadline?: string | null
          deadline_note?: string | null
          decisions?: Json
          definition_of_done?: string
          goal_slug?: string | null
          slug?: string
          sort_order?: number
          sources?: string[]
          status?: string
          title?: string
          updated_at?: string | null
          your_turn?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_cards_goal_slug_fkey"
            columns: ["goal_slug"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["slug"]
          },
        ]
      }
      project_notes: {
        Row: {
          body: string
          card_slug: string | null
          consumed_at: string | null
          created_at: string
          id: string
        }
        Insert: {
          body: string
          card_slug?: string | null
          consumed_at?: string | null
          created_at?: string
          id?: string
        }
        Update: {
          body?: string
          card_slug?: string | null
          consumed_at?: string | null
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      schedule_day_notes: {
        Row: {
          body: string
          created_at: string
          day_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          day_key: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          body?: string
          created_at?: string
          day_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      schedule_day_revisions: {
        Row: {
          day_key: string
          revision: number
          updated_at: string
          user_id: string
        }
        Insert: {
          day_key: string
          revision?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          day_key?: string
          revision?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      schedules: {
        Row: {
          activity: string
          created_at: string | null
          end_at: string | null
          id: string
          start_at: string
          updated_at: string | null
          updated_by: string
          user_id: string
        }
        Insert: {
          activity: string
          created_at?: string | null
          end_at?: string | null
          id?: string
          start_at: string
          updated_at?: string | null
          updated_by?: string
          user_id?: string
        }
        Update: {
          activity?: string
          created_at?: string | null
          end_at?: string | null
          id?: string
          start_at?: string
          updated_at?: string | null
          updated_by?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      replace_schedules_for_day: {
        Args: {
          p_day_end_utc: string
          p_day_key: string
          p_day_start_utc: string
          p_expected_revision: number
          p_items: Json
        }
        Returns: number
      }
      replace_schedules_for_day_as: {
        Args: {
          p_day_end_utc: string
          p_day_start_utc: string
          p_items: Json
          p_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

