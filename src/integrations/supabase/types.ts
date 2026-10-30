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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          office_id: string
          summary: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          office_id: string
          summary?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          office_id?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          assigned_employee_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          external_ref: string | null
          id: string
          notes: string | null
          number: number
          office_id: string
          provider: string | null
          request_id: string | null
          service_date: string | null
          service_id: string | null
          status: Database["public"]["Enums"]["booking_status"]
          updated_at: string
        }
        Insert: {
          assigned_employee_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          external_ref?: string | null
          id?: string
          notes?: string | null
          number?: never
          office_id: string
          provider?: string | null
          request_id?: string | null
          service_date?: string | null
          service_id?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
        }
        Update: {
          assigned_employee_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          external_ref?: string | null
          id?: string
          notes?: string | null
          number?: never
          office_id?: string
          provider?: string | null
          request_id?: string | null
          service_date?: string | null
          service_id?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          nationality: string | null
          notes: string | null
          office_id: string
          passport_number: string | null
          phone: string | null
          referring_partner_id: string | null
          source: Database["public"]["Enums"]["customer_source"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          nationality?: string | null
          notes?: string | null
          office_id: string
          passport_number?: string | null
          phone?: string | null
          referring_partner_id?: string | null
          source?: Database["public"]["Enums"]["customer_source"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          nationality?: string | null
          notes?: string | null
          office_id?: string
          passport_number?: string | null
          phone?: string | null
          referring_partner_id?: string | null
          source?: Database["public"]["Enums"]["customer_source"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_referring_partner_id_fkey"
            columns: ["referring_partner_id"]
            isOneToOne: false
            referencedRelation: "partner_offices"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          booking_id: string | null
          created_at: string
          customer_id: string | null
          file_name: string
          id: string
          mime_type: string | null
          office_id: string
          request_id: string | null
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          customer_id?: string | null
          file_name: string
          id?: string
          mime_type?: string | null
          office_id: string
          request_id?: string | null
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          customer_id?: string | null
          file_name?: string
          id?: string
          mime_type?: string | null
          office_id?: string
          request_id?: string | null
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      office_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          failed_accepts: number
          id: string
          invited_by: string
          last_sent_at: string | null
          office_id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["app_role"]
          send_attempts: number
          send_error: string | null
          send_status: string
          status: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at: string
          failed_accepts?: number
          id?: string
          invited_by: string
          last_sent_at?: string | null
          office_id: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          send_attempts?: number
          send_error?: string | null
          send_status?: string
          status?: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          failed_accepts?: number
          id?: string
          invited_by?: string
          last_sent_at?: string | null
          office_id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          send_attempts?: number
          send_error?: string | null
          send_status?: string
          status?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "office_invitations_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      office_members: {
        Row: {
          created_at: string
          id: string
          office_id: string
          role: Database["public"]["Enums"]["app_role"]
          status: string
          status_changed_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          office_id: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          status_changed_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          office_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          status_changed_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "office_members_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      offices: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          created_by: string
          email: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      partner_offices: {
        Row: {
          city: string | null
          contact_person: string | null
          country: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          office_id: string
          phone: string | null
          status: Database["public"]["Enums"]["partner_status"]
          updated_at: string
        }
        Insert: {
          city?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          office_id: string
          phone?: string | null
          status?: Database["public"]["Enums"]["partner_status"]
          updated_at?: string
        }
        Update: {
          city?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          office_id?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["partner_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_offices_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_owners: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      requests: {
        Row: {
          assigned_to: string | null
          booked_at: string | null
          booking_ref: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          details: string | null
          id: string
          notes: string | null
          number: number
          office_id: string
          priority: Database["public"]["Enums"]["request_priority"]
          referring_partner_id: string | null
          service_date: string | null
          service_details: Json
          service_id: string | null
          source: Database["public"]["Enums"]["request_source"]
          status: Database["public"]["Enums"]["request_status"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          booked_at?: string | null
          booking_ref?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          details?: string | null
          id?: string
          notes?: string | null
          number?: never
          office_id: string
          priority?: Database["public"]["Enums"]["request_priority"]
          referring_partner_id?: string | null
          service_date?: string | null
          service_details?: Json
          service_id?: string | null
          source?: Database["public"]["Enums"]["request_source"]
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          booked_at?: string | null
          booking_ref?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          details?: string | null
          id?: string
          notes?: string | null
          number?: never
          office_id?: string
          priority?: Database["public"]["Enums"]["request_priority"]
          referring_partner_id?: string | null
          service_date?: string | null
          service_details?: Json
          service_id?: string | null
          source?: Database["public"]["Enums"]["request_source"]
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_referring_partner_id_fkey"
            columns: ["referring_partner_id"]
            isOneToOne: false
            referencedRelation: "partner_offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          code: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          office_id: string | null
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          office_id?: string | null
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          office_id?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "services_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          airport: string | null
          arrival_at: string | null
          assigned_to: string | null
          booking_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          due_at: string | null
          flight_number: string | null
          id: string
          notes: string | null
          office_id: string
          priority: Database["public"]["Enums"]["task_priority"]
          request_id: string | null
          service_id: string | null
          status: Database["public"]["Enums"]["task_status"]
          task_type: Database["public"]["Enums"]["task_type"]
          title: string
          updated_at: string
        }
        Insert: {
          airport?: string | null
          arrival_at?: string | null
          assigned_to?: string | null
          booking_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          due_at?: string | null
          flight_number?: string | null
          id?: string
          notes?: string | null
          office_id: string
          priority?: Database["public"]["Enums"]["task_priority"]
          request_id?: string | null
          service_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_type?: Database["public"]["Enums"]["task_type"]
          title: string
          updated_at?: string
        }
        Update: {
          airport?: string | null
          arrival_at?: string | null
          assigned_to?: string | null
          booking_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          due_at?: string | null
          flight_number?: string | null
          id?: string
          notes?: string | null
          office_id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          request_id?: string | null
          service_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_type?: Database["public"]["Enums"]["task_type"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      umrah_participants: {
        Row: {
          actual_entry: string | null
          actual_exit: string | null
          created_at: string
          customer_id: string
          id: string
          notes: string | null
          office_id: string
          planned_entry: string | null
          planned_exit: string | null
          request_id: string | null
          status: Database["public"]["Enums"]["umrah_pilgrim_status"]
          trip_id: string
          updated_at: string
        }
        Insert: {
          actual_entry?: string | null
          actual_exit?: string | null
          created_at?: string
          customer_id: string
          id?: string
          notes?: string | null
          office_id: string
          planned_entry?: string | null
          planned_exit?: string | null
          request_id?: string | null
          status?: Database["public"]["Enums"]["umrah_pilgrim_status"]
          trip_id: string
          updated_at?: string
        }
        Update: {
          actual_entry?: string | null
          actual_exit?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          notes?: string | null
          office_id?: string
          planned_entry?: string | null
          planned_exit?: string | null
          request_id?: string | null
          status?: Database["public"]["Enums"]["umrah_pilgrim_status"]
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "umrah_participants_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "umrah_participants_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "umrah_participants_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "umrah_participants_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "umrah_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      umrah_trips: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          office_id: string
          planned_end: string | null
          planned_start: string | null
          status: Database["public"]["Enums"]["umrah_trip_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          office_id: string
          planned_end?: string | null
          planned_start?: string | null
          status?: Database["public"]["Enums"]["umrah_trip_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          office_id?: string
          planned_end?: string | null
          planned_start?: string | null
          status?: Database["public"]["Enums"]["umrah_trip_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "umrah_trips_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _invite_hash: { Args: { _token: string }; Returns: string }
      accept_invitation: { Args: { _token: string }; Returns: Json }
      add_office_member: {
        Args: {
          _email: string
          _office: string
          _role?: Database["public"]["Enums"]["app_role"]
        }
        Returns: string
      }
      create_invitation: {
        Args: {
          _email: string
          _office: string
          _role?: Database["public"]["Enums"]["app_role"]
        }
        Returns: Json
      }
      create_office: {
        Args: {
          _city?: string
          _country?: string
          _email?: string
          _name: string
          _phone?: string
        }
        Returns: string
      }
      invitation_preview: { Args: { _token: string }; Returns: Json }
      is_office_admin: { Args: { _office: string }; Returns: boolean }
      is_office_member: { Args: { _office: string }; Returns: boolean }
      is_platform_owner: { Args: never; Returns: boolean }
      mark_invitation_sent: {
        Args: { _error?: string; _id: string; _status: string }
        Returns: undefined
      }
      platform_stats: { Args: never; Returns: Json }
      resend_invitation: { Args: { _id: string }; Returns: Json }
      revoke_invitation: { Args: { _id: string }; Returns: undefined }
      set_member_status: {
        Args: { _office: string; _status: string; _user: string }
        Returns: undefined
      }
      shares_office: { Args: { _user: string }; Returns: boolean }
      team_last_activity: {
        Args: { _office: string }
        Returns: {
          last_activity_at: string
          user_id: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "employee"
      booking_status:
        | "new"
        | "in_progress"
        | "awaiting_confirmation"
        | "confirmed"
        | "completed"
        | "cancelled"
      customer_source: "direct" | "online" | "phone" | "partner" | "other"
      partner_status: "active" | "inactive"
      request_priority: "low" | "normal" | "high" | "urgent"
      request_source: "direct" | "phone_online" | "partner" | "other"
      request_status:
        | "new"
        | "in_progress"
        | "awaiting_customer"
        | "awaiting_approval"
        | "confirmed"
        | "completed"
        | "cancelled"
      task_priority: "low" | "medium" | "high"
      task_status: "new" | "in_progress" | "done" | "cancelled"
      task_type:
        | "customer_followup"
        | "booking_confirmation"
        | "ticket_booking"
        | "hotel_confirmation"
        | "visa_followup"
        | "airport_pickup"
        | "medical_followup"
        | "other"
      umrah_pilgrim_status:
        | "registered"
        | "preparing"
        | "arrived"
        | "departed"
        | "cancelled"
      umrah_trip_status:
        | "planned"
        | "preparing"
        | "in_progress"
        | "completed"
        | "cancelled"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "employee"],
      booking_status: [
        "new",
        "in_progress",
        "awaiting_confirmation",
        "confirmed",
        "completed",
        "cancelled",
      ],
      customer_source: ["direct", "online", "phone", "partner", "other"],
      partner_status: ["active", "inactive"],
      request_priority: ["low", "normal", "high", "urgent"],
      request_source: ["direct", "phone_online", "partner", "other"],
      request_status: [
        "new",
        "in_progress",
        "awaiting_customer",
        "awaiting_approval",
        "confirmed",
        "completed",
        "cancelled",
      ],
      task_priority: ["low", "medium", "high"],
      task_status: ["new", "in_progress", "done", "cancelled"],
      task_type: [
        "customer_followup",
        "booking_confirmation",
        "ticket_booking",
        "hotel_confirmation",
        "visa_followup",
        "airport_pickup",
        "medical_followup",
        "other",
      ],
      umrah_pilgrim_status: [
        "registered",
        "preparing",
        "arrived",
        "departed",
        "cancelled",
      ],
      umrah_trip_status: [
        "planned",
        "preparing",
        "in_progress",
        "completed",
        "cancelled",
      ],
    },
  },
} as const
