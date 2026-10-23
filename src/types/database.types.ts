export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
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
      articles: {
        Row: {
          collected_at: string
          image_url: string | null
          link: string
          published: string | null
          source: string
          title: string
        }
        Insert: {
          collected_at?: string
          image_url?: string | null
          link: string
          published?: string | null
          source: string
          title: string
        }
        Update: {
          collected_at?: string
          image_url?: string | null
          link?: string
          published?: string | null
          source?: string
          title?: string
        }
        Relationships: []
      }
      blocked_projects: {
        Row: {
          created_at: string
          id: string
          name: string
          tasks: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
          tasks?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          tasks?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      default_schedule_applications: {
        Row: {
          applied_at: string
          day_key: string
          default_schedule_id: string
          user_id: string
        }
        Insert: {
          applied_at?: string
          day_key: string
          default_schedule_id: string
          user_id: string
        }
        Update: {
          applied_at?: string
          day_key?: string
          default_schedule_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "default_schedule_applications_default_schedule_id_fkey"
            columns: ["default_schedule_id"]
            isOneToOne: false
            referencedRelation: "default_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      default_schedules: {
        Row: {
          activity: string
          created_at: string
          effective_from: string
          end_time: string | null
          id: string
          start_time: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activity: string
          created_at?: string
          effective_from?: string
          end_time?: string | null
          id?: string
          start_time: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          activity?: string
          created_at?: string
          effective_from?: string
          end_time?: string | null
          id?: string
          start_time?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      finance_events: {
        Row: {
          cash_delta: number
          created_at: string
          end_month: string | null
          id: string
          memo: string
          name: string
          nisa_delta: number
          start_month: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cash_delta?: number
          created_at?: string
          end_month?: string | null
          id?: string
          memo?: string
          name?: string
          nisa_delta?: number
          start_month: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          cash_delta?: number
          created_at?: string
          end_month?: string | null
          id?: string
          memo?: string
          name?: string
          nisa_delta?: number
          start_month?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      finance_measurements: {
        Row: {
          cash: number
          created_at: string
          month: string
          nisa: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cash: number
          created_at?: string
          month: string
          nisa: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          cash?: number
          created_at?: string
          month?: string
          nisa?: number
          updated_at?: string
          user_id?: string
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
      reports: {
        Row: {
          body_html: string
          body_md5: string | null
          slug: string
          title: string
          toc: Json
          updated_at: string
        }
        Insert: {
          body_html: string
          body_md5?: never
          slug: string
          title: string
          toc?: Json
          updated_at: string
        }
        Update: {
          body_html?: string
          body_md5?: never
          slug?: string
          title?: string
          toc?: Json
          updated_at?: string
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
      apply_default_schedules: {
        Args: {
          p_end_day: string
          p_start_day: string
          p_timezone: string
        }
        Returns: number
      }
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
