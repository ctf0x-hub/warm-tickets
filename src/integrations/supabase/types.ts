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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      cart_reservations: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          payment_session_id: string | null
          quantity: number
          sslcommerz_tran_id: string | null
          tier_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          payment_session_id?: string | null
          quantity: number
          sslcommerz_tran_id?: string | null
          tier_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          payment_session_id?: string | null
          quantity?: number
          sslcommerz_tran_id?: string | null
          tier_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_reservations_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "ticket_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      event_approval_requests: {
        Row: {
          created_at: string
          event_id: string
          id: string
          organizer_id: string
          request_type: Database["public"]["Enums"]["approval_request_type"]
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          snapshot: Json
          status: Database["public"]["Enums"]["approval_status"]
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          organizer_id: string
          request_type: Database["public"]["Enums"]["approval_request_type"]
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          snapshot: Json
          status?: Database["public"]["Enums"]["approval_status"]
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          organizer_id?: string
          request_type?: Database["public"]["Enums"]["approval_request_type"]
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          snapshot?: Json
          status?: Database["public"]["Enums"]["approval_status"]
        }
        Relationships: [
          {
            foreignKeyName: "event_approval_requests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_booths: {
        Row: {
          checkpoint_id: string
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          checkpoint_id: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          checkpoint_id?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_booths_checkpoint_id_fkey"
            columns: ["checkpoint_id"]
            isOneToOne: false
            referencedRelation: "event_checkpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      event_checkpoints: {
        Row: {
          created_at: string
          event_id: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_checkpoints_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_staff: {
        Row: {
          added_by: string
          created_at: string
          event_id: string
          id: string
          invited_email: string
          user_id: string
        }
        Insert: {
          added_by: string
          created_at?: string
          event_id: string
          id?: string
          invited_email: string
          user_id: string
        }
        Update: {
          added_by?: string
          created_at?: string
          event_id?: string
          id?: string
          invited_email?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_staff_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_tag_map: {
        Row: {
          event_id: string
          tag_id: string
        }
        Insert: {
          event_id: string
          tag_id: string
        }
        Update: {
          event_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_tag_map_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tag_map_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "event_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      event_tags: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      event_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          banner_image: string | null
          city: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          ends_at: string
          id: string
          organizer_id: string
          rejection_reason: string | null
          search_vector: unknown
          slug: string
          starts_at: string
          status: Database["public"]["Enums"]["event_status"]
          title: string
          type_id: string | null
          updated_at: string
          venue: string | null
        }
        Insert: {
          banner_image?: string | null
          city?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          ends_at: string
          id?: string
          organizer_id: string
          rejection_reason?: string | null
          search_vector?: unknown
          slug: string
          starts_at: string
          status?: Database["public"]["Enums"]["event_status"]
          title: string
          type_id?: string | null
          updated_at?: string
          venue?: string | null
        }
        Update: {
          banner_image?: string | null
          city?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          ends_at?: string
          id?: string
          organizer_id?: string
          rejection_reason?: string | null
          search_vector?: unknown
          slug?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["event_status"]
          title?: string
          type_id?: string | null
          updated_at?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "event_types"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          deleted_at: string | null
          email: string
          id: string
          is_suspended: boolean
          name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          email: string
          id?: string
          is_suspended?: boolean
          name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          email?: string
          id?: string
          is_suspended?: boolean
          name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ticket_scans: {
        Row: {
          booth_id: string | null
          checkpoint_id: string | null
          event_id: string
          id: string
          scanned_at: string
          scanned_by: string
          ticket_id: string
        }
        Insert: {
          booth_id?: string | null
          checkpoint_id?: string | null
          event_id: string
          id?: string
          scanned_at?: string
          scanned_by: string
          ticket_id: string
        }
        Update: {
          booth_id?: string | null
          checkpoint_id?: string | null
          event_id?: string
          id?: string
          scanned_at?: string
          scanned_by?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_scans_booth_id_fkey"
            columns: ["booth_id"]
            isOneToOne: false
            referencedRelation: "event_booths"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_scans_checkpoint_id_fkey"
            columns: ["checkpoint_id"]
            isOneToOne: false
            referencedRelation: "event_checkpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_scans_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_scans_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_tiers: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          event_id: string
          id: string
          max_per_order: number
          name: string
          price_cents: number
          sales_end_at: string | null
          sales_start_at: string | null
          sold_seats: number
          sort_order: number
          total_seats: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          event_id: string
          id?: string
          max_per_order?: number
          name: string
          price_cents?: number
          sales_end_at?: string | null
          sales_start_at?: string | null
          sold_seats?: number
          sort_order?: number
          total_seats: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          event_id?: string
          id?: string
          max_per_order?: number
          name?: string
          price_cents?: number
          sales_end_at?: string | null
          sales_start_at?: string | null
          sold_seats?: number
          sort_order?: number
          total_seats?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_tiers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          booth_id: string | null
          checked_in_at: string | null
          checked_in_by: string | null
          checkpoint_id: string | null
          created_at: string
          event_id: string
          id: string
          payment_ref: string | null
          qr_code: string
          status: Database["public"]["Enums"]["ticket_status"]
          tier_id: string
          user_id: string
        }
        Insert: {
          booth_id?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          checkpoint_id?: string | null
          created_at?: string
          event_id: string
          id?: string
          payment_ref?: string | null
          qr_code?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          tier_id: string
          user_id: string
        }
        Update: {
          booth_id?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          checkpoint_id?: string | null
          created_at?: string
          event_id?: string
          id?: string
          payment_ref?: string | null
          qr_code?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          tier_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_booth_id_fkey"
            columns: ["booth_id"]
            isOneToOne: false
            referencedRelation: "event_booths"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_checkpoint_id_fkey"
            columns: ["checkpoint_id"]
            isOneToOne: false
            referencedRelation: "event_checkpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "ticket_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_event_staff_by_email: {
        Args: { _email: string; _event_id: string }
        Returns: Json
      }
      available_seats: { Args: { _tier_id: string }; Returns: number }
      become_organizer: { Args: never; Returns: undefined }
      can_scan_event: {
        Args: { _event_id: string; _user_id: string }
        Returns: boolean
      }
      check_in_ticket:
        | { Args: { _event_id: string; _qr_code: string }; Returns: Json }
        | {
            Args: {
              _booth_id?: string
              _checkpoint_id?: string
              _event_id: string
              _qr_code: string
            }
            Returns: Json
          }
      checkout_cart: {
        Args: never
        Returns: {
          booth_id: string | null
          checked_in_at: string | null
          checked_in_by: string | null
          checkpoint_id: string | null
          created_at: string
          event_id: string
          id: string
          payment_ref: string | null
          qr_code: string
          status: Database["public"]["Enums"]["ticket_status"]
          tier_id: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "tickets"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      checkout_paid_cart: { Args: { _session_id: string }; Returns: undefined }
      event_analytics: { Args: { _event_id: string }; Returns: Json }
      expire_stale_reservations: { Args: never; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_event_staff: {
        Args: { _event_id: string; _user_id: string }
        Returns: boolean
      }
      release_cart_by_session: {
        Args: { _session_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "attendee" | "organizer" | "admin"
      approval_request_type: "publish" | "edit"
      approval_status: "pending" | "approved" | "rejected"
      event_status:
        | "draft"
        | "pending_approval"
        | "approved"
        | "published"
        | "pending_edit_approval"
        | "cancelled"
        | "rejected"
      ticket_status: "valid" | "cancelled" | "checked_in"
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
  public: {
    Enums: {
      app_role: ["attendee", "organizer", "admin"],
      approval_request_type: ["publish", "edit"],
      approval_status: ["pending", "approved", "rejected"],
      event_status: [
        "draft",
        "pending_approval",
        "approved",
        "published",
        "pending_edit_approval",
        "cancelled",
        "rejected",
      ],
      ticket_status: ["valid", "cancelled", "checked_in"],
    },
  },
} as const
