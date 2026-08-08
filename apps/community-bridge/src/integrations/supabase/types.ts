export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      admission_requirements: {
        Row: {
          community_id: string;
          require_username: boolean;
          require_profile_photo: boolean;
          min_account_age_days: number;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          community_id: string;
          require_username?: boolean;
          require_profile_photo?: boolean;
          min_account_age_days?: number;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          community_id?: string;
          require_username?: boolean;
          require_profile_photo?: boolean;
          min_account_age_days?: number;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      brand_tenant_audit: {
        Row: {
          action: string;
          actor_email: string | null;
          actor_id: string | null;
          brand_id: string;
          changes: Json;
          created_at: string;
          id: string;
          ip_address: string | null;
          tenant_id: string | null;
          tenant_name: string | null;
          user_agent: string | null;
        };
        Insert: {
          action: string;
          actor_email?: string | null;
          actor_id?: string | null;
          brand_id: string;
          changes?: Json;
          created_at?: string;
          id?: string;
          ip_address?: string | null;
          tenant_id?: string | null;
          tenant_name?: string | null;
          user_agent?: string | null;
        };
        Update: {
          action?: string;
          actor_email?: string | null;
          actor_id?: string | null;
          brand_id?: string;
          changes?: Json;
          created_at?: string;
          id?: string;
          ip_address?: string | null;
          tenant_id?: string | null;
          tenant_name?: string | null;
          user_agent?: string | null;
        };
        Relationships: [];
      };
      brand_tenants: {
        Row: {
          activate_bot_label: string;
          activate_headline: string;
          activate_steps_title: string;
          activate_subheadline: string;
          activate_submit_label: string;
          activate_success_headline: string;
          after_login_path: string;
          brand_id: string;
          community_id: string;
          community_label: string | null;
          created_at: string;
          created_by: string | null;
          gate_preset: string;
          hostnames: string[];
          id: string;
          is_active: boolean;
          login_forgot_label: string;
          login_headline: string;
          login_signin_label: string;
          login_signup_label: string;
          login_subheadline: string;
          login_terminal_header: string;
          login_terminal_lines: string[];
          logo_url: string | null;
          name: string;
          oauth_return_path: string;
          privacy_url: string;
          providers: string[];
          site_url: string | null;
          tagline: string;
          terminal_command: string;
          terms_url: string;
          theme: Json;
          updated_at: string;
          wordmark_url: string | null;
        };
        Insert: {
          activate_bot_label?: string;
          activate_headline?: string;
          activate_steps_title?: string;
          activate_subheadline?: string;
          activate_submit_label?: string;
          activate_success_headline?: string;
          after_login_path?: string;
          brand_id: string;
          community_id: string;
          community_label?: string | null;
          created_at?: string;
          created_by?: string | null;
          gate_preset?: string;
          hostnames?: string[];
          id?: string;
          is_active?: boolean;
          login_forgot_label?: string;
          login_headline?: string;
          login_signin_label?: string;
          login_signup_label?: string;
          login_subheadline?: string;
          login_terminal_header?: string;
          login_terminal_lines?: string[];
          logo_url?: string | null;
          name: string;
          oauth_return_path?: string;
          privacy_url?: string;
          providers?: string[];
          site_url?: string | null;
          tagline?: string;
          terminal_command?: string;
          terms_url?: string;
          theme?: Json;
          updated_at?: string;
          wordmark_url?: string | null;
        };
        Update: {
          activate_bot_label?: string;
          activate_headline?: string;
          activate_steps_title?: string;
          activate_subheadline?: string;
          activate_submit_label?: string;
          activate_success_headline?: string;
          after_login_path?: string;
          brand_id?: string;
          community_id?: string;
          community_label?: string | null;
          created_at?: string;
          created_by?: string | null;
          gate_preset?: string;
          hostnames?: string[];
          id?: string;
          is_active?: boolean;
          login_forgot_label?: string;
          login_headline?: string;
          login_signin_label?: string;
          login_signup_label?: string;
          login_subheadline?: string;
          login_terminal_header?: string;
          login_terminal_lines?: string[];
          logo_url?: string | null;
          name?: string;
          oauth_return_path?: string;
          privacy_url?: string;
          providers?: string[];
          site_url?: string | null;
          tagline?: string;
          terminal_command?: string;
          terms_url?: string;
          theme?: Json;
          updated_at?: string;
          wordmark_url?: string | null;
        };
        Relationships: [];
      };
      gate_configs: {
        Row: {
          background_url: string | null;
          brand_id: string;
          community_id: string | null;
          created_at: string;
          headline: string;
          id: string;
          logo_url: string | null;
          mascot_url: string | null;
          preset: string;
          slug: string;
          subheadline: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          background_url?: string | null;
          brand_id?: string;
          community_id?: string | null;
          created_at?: string;
          headline?: string;
          id?: string;
          logo_url?: string | null;
          mascot_url?: string | null;
          preset?: string;
          slug: string;
          subheadline?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          background_url?: string | null;
          brand_id?: string;
          community_id?: string | null;
          created_at?: string;
          headline?: string;
          id?: string;
          logo_url?: string | null;
          mascot_url?: string | null;
          preset?: string;
          slug?: string;
          subheadline?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      gate_views: {
        Row: {
          gate_id: string;
          id: string;
          referrer_host: string | null;
          viewed_at: string;
          visitor_key: string | null;
        };
        Insert: {
          gate_id: string;
          id?: string;
          referrer_host?: string | null;
          viewed_at?: string;
          visitor_key?: string | null;
        };
        Update: {
          gate_id?: string;
          id?: string;
          referrer_host?: string | null;
          viewed_at?: string;
          visitor_key?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "gate_views_gate_id_fkey";
            columns: ["gate_id"];
            isOneToOne: false;
            referencedRelation: "gate_configs";
            referencedColumns: ["id"];
          },
        ];
      };
      telegram_link_codes: {
        Row: {
          code: string;
          consumed_at: string | null;
          created_at: string;
          expires_at: string;
          telegram_id: number;
        };
        Insert: {
          code: string;
          consumed_at?: string | null;
          created_at?: string;
          expires_at?: string;
          telegram_id: number;
        };
        Update: {
          code?: string;
          consumed_at?: string | null;
          created_at?: string;
          expires_at?: string;
          telegram_id?: number;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          blocked_at: string | null;
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          telegram_id: number | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          blocked_at?: string | null;
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          telegram_id?: number | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          blocked_at?: string | null;
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          telegram_id?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      app_role: "owner" | "admin" | "user";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "admin", "user"],
    },
  },
} as const;
