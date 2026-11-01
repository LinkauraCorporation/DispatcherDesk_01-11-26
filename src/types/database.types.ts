export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = 'owner_admin' | 'dispatcher' | 'staff' | 'driver';
export type ClientType = 'owner_operator' | 'fleet';
export type CreditStatus = 'approved' | 'caution' | 'blocked' | 'factoring_only';
export type EquipmentType = 'dry_van' | 'reefer' | 'flatbed' | 'step_deck' | 'power_only' | 'box_truck' | 'hotshot';
export type TruckStatus = 'active' | 'maintenance' | 'inactive';
export type DriverStatus = 'available' | 'on_load' | 'off_duty' | 'inactive';
export type DriverPayType = 'percentage_gross' | 'per_mile' | 'flat_rate';
export type PipelineStatus = 'sourced' | 'negotiating' | 'booked' | 'in_transit' | 'delivered' | 'invoiced' | 'paid';
export type DocumentType = 'rate_confirmation' | 'bol' | 'pod' | 'invoice' | 'other';
export type DocumentStatus = 'missing' | 'pending' | 'received' | 'verified';
export type NoteType =
  | 'broker_call'
  | 'driver_check'
  | 'handover'
  | 'general'
  | 'rate_negotiation'
  | 'assignment_change'
  | 'status_change';

export type PlanType = 'starter' | 'growth' | 'agency' | 'enterprise' | 'trial' | 'starter_fleet' | 'growth_agency';
export type BillingState = 'trialing' | 'trial_expired' | 'subscription_pending' | 'active' | 'past_due' | 'suspended' | 'canceled';

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string | null;
          dot_number: string | null;
          mc_number: string | null;
          primary_timezone: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug?: string | null;
          dot_number?: string | null;
          mc_number?: string | null;
          primary_timezone?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string | null;
          dot_number?: string | null;
          mc_number?: string | null;
          primary_timezone?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          phone: string | null;
          preferred_timezone: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          phone?: string | null;
          preferred_timezone?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          phone?: string | null;
          preferred_timezone?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      organization_members: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role: UserRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          role: UserRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          role?: UserRole;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      clients: {
        Row: {
          id: string;
          organization_id: string;
          company_name: string;
          client_type: ClientType;
          contact_name: string | null;
          contact_email: string | null;
          contact_phone: string | null;
          billing_email: string | null;
          preferred_equipment: string | null;
          preferred_lanes: string | null;
          minimum_rate_per_mile: number | null;
          notes: string | null;
          status: 'active' | 'inactive';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          company_name: string;
          client_type: ClientType;
          contact_name?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          billing_email?: string | null;
          preferred_equipment?: string | null;
          preferred_lanes?: string | null;
          minimum_rate_per_mile?: number | null;
          notes?: string | null;
          status?: 'active' | 'inactive';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          company_name?: string;
          client_type?: ClientType;
          contact_name?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          billing_email?: string | null;
          preferred_equipment?: string | null;
          preferred_lanes?: string | null;
          minimum_rate_per_mile?: number | null;
          notes?: string | null;
          status?: 'active' | 'inactive';
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      brokers: {
        Row: {
          id: string;
          organization_id: string;
          company_name: string;
          mc_number: string | null;
          dot_number: string | null;
          contact_name: string | null;
          contact_email: string | null;
          contact_phone: string | null;
          payment_terms_days: number;
          credit_status: CreditStatus;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          company_name: string;
          mc_number?: string | null;
          dot_number?: string | null;
          contact_name?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          payment_terms_days?: number;
          credit_status?: CreditStatus;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          company_name?: string;
          mc_number?: string | null;
          dot_number?: string | null;
          contact_name?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          payment_terms_days?: number;
          credit_status?: CreditStatus;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      trucks: {
        Row: {
          id: string;
          organization_id: string;
          client_id: string | null;
          truck_number: string;
          vin: string | null;
          equipment_type: EquipmentType;
          max_weight_lbs: number | null;
          status: TruckStatus;
          current_location_city: string | null;
          current_location_state: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          client_id?: string | null;
          truck_number: string;
          vin?: string | null;
          equipment_type?: EquipmentType;
          max_weight_lbs?: number | null;
          status?: TruckStatus;
          current_location_city?: string | null;
          current_location_state?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          client_id?: string | null;
          truck_number?: string;
          vin?: string | null;
          equipment_type?: EquipmentType;
          max_weight_lbs?: number | null;
          status?: TruckStatus;
          current_location_city?: string | null;
          current_location_state?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trucks_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trucks_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          }
        ];
      };
      drivers: {
        Row: {
          id: string;
          organization_id: string;
          client_id: string | null;
          assigned_truck_id: string | null;
          full_name: string;
          phone: string | null;
          email: string | null;
          pay_type: DriverPayType;
          pay_rate: number;
          status: DriverStatus;
          notes: string | null;
          created_at: string;
          updated_at: string;
          user_id?: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          client_id?: string | null;
          assigned_truck_id?: string | null;
          full_name: string;
          phone?: string | null;
          email?: string | null;
          pay_type?: DriverPayType;
          pay_rate?: number;
          status?: DriverStatus;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          client_id?: string | null;
          assigned_truck_id?: string | null;
          full_name?: string;
          phone?: string | null;
          email?: string | null;
          pay_type?: DriverPayType;
          pay_rate?: number;
          status?: DriverStatus;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      loads: {
        Row: {
          id: string;
          organization_id: string;
          load_number: string;
          client_id: string | null;
          broker_id: string | null;
          truck_id: string | null;
          driver_id: string | null;
          assigned_dispatcher_id: string | null;
          pipeline_status: PipelineStatus;
          equipment_type: EquipmentType;
          commodity: string | null;
          weight_lbs: number | null;
          origin_facility_name: string | null;
          origin_address: string | null;
          origin_city: string;
          origin_state: string;
          origin_zip: string | null;
          origin_timezone: string;
          pickup_datetime: string | null;
          dest_facility_name: string | null;
          dest_address: string | null;
          dest_city: string;
          dest_state: string;
          dest_zip: string | null;
          dest_timezone: string;
          operational_timezone: string;
          delivery_datetime: string | null;
          pickup_arrival_time: string | null;
          pickup_loading_start_time: string | null;
          pickup_loading_complete_time: string | null;
          pickup_departure_time: string | null;
          delivery_arrival_time: string | null;
          delivery_unloading_start_time: string | null;
          delivery_unloading_complete_time: string | null;
          delivery_departure_time: string | null;
          rate: number;
          loaded_miles: number;
          deadhead_miles: number;
          fuel_expense: number;
          driver_pay: number;
          other_expenses: number;
          special_instructions: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          load_number: string;
          client_id?: string | null;
          broker_id?: string | null;
          truck_id?: string | null;
          driver_id?: string | null;
          assigned_dispatcher_id?: string | null;
          pipeline_status?: PipelineStatus;
          equipment_type?: EquipmentType;
          commodity?: string | null;
          weight_lbs?: number | null;
          origin_facility_name?: string | null;
          origin_address?: string | null;
          origin_city: string;
          origin_state: string;
          origin_zip?: string | null;
          origin_timezone?: string;
          pickup_datetime?: string | null;
          dest_facility_name?: string | null;
          dest_address?: string | null;
          dest_city: string;
          dest_state: string;
          dest_zip?: string | null;
          dest_timezone?: string;
          operational_timezone?: string;
          delivery_datetime?: string | null;
          pickup_arrival_time?: string | null;
          pickup_loading_start_time?: string | null;
          pickup_loading_complete_time?: string | null;
          pickup_departure_time?: string | null;
          delivery_arrival_time?: string | null;
          delivery_unloading_start_time?: string | null;
          delivery_unloading_complete_time?: string | null;
          delivery_departure_time?: string | null;
          rate?: number;
          loaded_miles?: number;
          deadhead_miles?: number;
          fuel_expense?: number;
          driver_pay?: number;
          other_expenses?: number;
          special_instructions?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          load_number?: string;
          client_id?: string | null;
          broker_id?: string | null;
          truck_id?: string | null;
          driver_id?: string | null;
          assigned_dispatcher_id?: string | null;
          pipeline_status?: PipelineStatus;
          equipment_type?: EquipmentType;
          commodity?: string | null;
          weight_lbs?: number | null;
          origin_facility_name?: string | null;
          origin_address?: string | null;
          origin_city?: string;
          origin_state?: string;
          origin_zip?: string | null;
          origin_timezone?: string;
          pickup_datetime?: string | null;
          dest_facility_name?: string | null;
          dest_address?: string | null;
          dest_city?: string;
          dest_state?: string;
          dest_zip?: string | null;
          dest_timezone?: string;
          operational_timezone?: string;
          delivery_datetime?: string | null;
          pickup_arrival_time?: string | null;
          pickup_loading_start_time?: string | null;
          pickup_loading_complete_time?: string | null;
          pickup_departure_time?: string | null;
          delivery_arrival_time?: string | null;
          delivery_unloading_start_time?: string | null;
          delivery_unloading_complete_time?: string | null;
          delivery_departure_time?: string | null;
          rate?: number;
          loaded_miles?: number;
          deadhead_miles?: number;
          fuel_expense?: number;
          driver_pay?: number;
          other_expenses?: number;
          special_instructions?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      documents: {
        Row: {
          id: string;
          organization_id: string;
          load_id: string | null;
          doc_type: DocumentType;
          doc_status: DocumentStatus;
          file_path: string | null;
          file_name: string | null;
          file_size_bytes: number | null;
          mime_type: string | null;
          uploaded_by: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          load_id?: string | null;
          doc_type: DocumentType;
          doc_status?: DocumentStatus;
          file_path?: string | null;
          file_name?: string | null;
          file_size_bytes?: number | null;
          mime_type?: string | null;
          uploaded_by?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          load_id?: string | null;
          doc_type?: DocumentType;
          doc_status?: DocumentStatus;
          file_path?: string | null;
          file_name?: string | null;
          file_size_bytes?: number | null;
          mime_type?: string | null;
          uploaded_by?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      activity_notes: {
        Row: {
          id: string;
          organization_id: string;
          load_id: string | null;
          truck_id: string | null;
          author_id: string | null;
          note_type: NoteType;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          load_id?: string | null;
          truck_id?: string | null;
          author_id?: string | null;
          note_type?: NoteType;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          load_id?: string | null;
          truck_id?: string | null;
          author_id?: string | null;
          note_type?: NoteType;
          content?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      organization_invitations: {
        Row: {
          id: string;
          organization_id: string;
          email: string;
          role: UserRole;
          driver_id: string | null;
          invited_by_user_id: string | null;
          token_hash: string;
          expires_at: string;
          accepted_at: string | null;
          cancelled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          email: string;
          role: UserRole;
          driver_id?: string | null;
          invited_by_user_id?: string | null;
          token_hash: string;
          expires_at: string;
          accepted_at?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          email?: string;
          role?: UserRole;
          driver_id?: string | null;
          invited_by_user_id?: string | null;
          token_hash?: string;
          expires_at?: string;
          accepted_at?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          }
        ];
      };
      load_team_assignments: {
        Row: {
          id: string;
          organization_id: string;
          load_id: string;
          user_id: string;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          load_id: string;
          user_id: string;
          created_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          load_id?: string;
          user_id?: string;
          created_at?: string;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "load_team_assignments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "load_team_assignments_load_id_fkey";
            columns: ["load_id"];
            isOneToOne: false;
            referencedRelation: "loads";
            referencedColumns: ["id"];
          }
        ];
      };
      subscriptions: {
        Row: {
          id: string;
          organization_id: string;
          plan: PlanType;
          billing_state: BillingState;
          trial_starts_at: string;
          trial_ends_at: string;
          current_period_start: string;
          current_period_end: string;
          razorpay_customer_id: string | null;
          razorpay_subscription_id: string | null;
          custom_amt_capacity: number | null;
          last_provider_event_at?: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          plan?: PlanType;
          billing_state?: BillingState;
          trial_starts_at?: string;
          trial_ends_at?: string;
          current_period_start?: string;
          current_period_end?: string;
          razorpay_customer_id?: string | null;
          razorpay_subscription_id?: string | null;
          custom_amt_capacity?: number | null;
          last_provider_event_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          plan?: PlanType;
          billing_state?: BillingState;
          trial_starts_at?: string;
          trial_ends_at?: string;
          current_period_start?: string;
          current_period_end?: string;
          razorpay_customer_id?: string | null;
          razorpay_subscription_id?: string | null;
          custom_amt_capacity?: number | null;
          last_provider_event_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          }
        ];
      };
      truck_activation_history: {
        Row: {
          id: string;
          organization_id: string;
          truck_id: string;
          first_qualifying_load_id: string;
          activated_at: string;
          billing_period_key: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          truck_id: string;
          first_qualifying_load_id: string;
          activated_at?: string;
          billing_period_key?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          truck_id?: string;
          first_qualifying_load_id?: string;
          activated_at?: string;
          billing_period_key?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fk_truck_activation_org";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fk_truck_activation_truck";
            columns: ["organization_id", "truck_id"];
            isOneToOne: false;
            referencedRelation: "trucks";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "fk_truck_activation_load";
            columns: ["organization_id", "first_qualifying_load_id"];
            isOneToOne: false;
            referencedRelation: "loads";
            referencedColumns: ["organization_id", "id"];
          }
        ];
      };
      billing_webhook_events: {
        Row: {
          id: string;
          provider: string;
          provider_event_id: string;
          event_type: string;
          payload: Json;
          status: 'pending' | 'processing' | 'processed' | 'failed' | 'ignored';
          error_message: string | null;
          retry_count: number;
          organization_id: string | null;
          subscription_id: string | null;
          provider_event_created_at: string | null;
          received_at: string;
          processed_at: string | null;
        };
        Insert: {
          id?: string;
          provider?: string;
          provider_event_id: string;
          event_type: string;
          payload: Json;
          status?: 'pending' | 'processing' | 'processed' | 'failed' | 'ignored';
          error_message?: string | null;
          retry_count?: number;
          organization_id?: string | null;
          subscription_id?: string | null;
          provider_event_created_at?: string | null;
          received_at?: string;
          processed_at?: string | null;
        };
        Update: {
          id?: string;
          provider?: string;
          provider_event_id?: string;
          event_type?: string;
          payload?: Json;
          status?: 'pending' | 'processing' | 'processed' | 'failed' | 'ignored';
          error_message?: string | null;
          retry_count?: number;
          organization_id?: string | null;
          subscription_id?: string | null;
          provider_event_created_at?: string | null;
          received_at?: string;
          processed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "billing_webhook_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "billing_webhook_events_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          }
        ];
      };
      billing_payment_transactions: {
        Row: {
          id: string;
          organization_id: string;
          subscription_id: string;
          provider: string;
          provider_payment_id: string | null;
          provider_order_id: string | null;
          provider_invoice_id: string | null;
          amount_cents: number;
          currency: string;
          status: 'created' | 'authorized' | 'captured' | 'failed' | 'refunded';
          billing_period_start: string | null;
          billing_period_end: string | null;
          error_code: string | null;
          error_description: string | null;
          raw_response: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          subscription_id: string;
          provider?: string;
          provider_payment_id?: string | null;
          provider_order_id?: string | null;
          provider_invoice_id?: string | null;
          amount_cents: number;
          currency?: string;
          status: 'created' | 'authorized' | 'captured' | 'failed' | 'refunded';
          billing_period_start?: string | null;
          billing_period_end?: string | null;
          error_code?: string | null;
          error_description?: string | null;
          raw_response?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          subscription_id?: string;
          provider?: string;
          provider_payment_id?: string | null;
          provider_order_id?: string | null;
          provider_invoice_id?: string | null;
          amount_cents?: number;
          currency?: string;
          status?: 'created' | 'authorized' | 'captured' | 'failed' | 'refunded';
          billing_period_start?: string | null;
          billing_period_end?: string | null;
          error_code?: string | null;
          error_description?: string | null;
          raw_response?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "billing_payment_transactions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "billing_payment_transactions_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          }
        ];
      };
      conversations: {
        Row: {
          id: string;
          organization_id: string;
          driver_id: string;
          type: string;
          load_id: string | null;
          status: string;
          created_at: string;
          updated_at: string;
          resolved_at: string | null;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          driver_id: string;
          type: string;
          load_id?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
          resolved_at?: string | null;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          driver_id?: string;
          type?: string;
          load_id?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
          resolved_at?: string | null;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fk_conversations_driver";
            columns: ["organization_id", "driver_id"];
            isOneToOne: false;
            referencedRelation: "drivers";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "fk_conversations_load";
            columns: ["load_id"];
            isOneToOne: false;
            referencedRelation: "loads";
            referencedColumns: ["id"];
          }
        ];
      };
      conversation_messages: {
        Row: {
          id: string;
          organization_id: string;
          conversation_id: string;
          sender_id: string;
          message_type: string;
          channel: string;
          content: string | null;
          created_at: string;
          updated_at: string;
          read_at: string | null;
          acknowledged_at: string | null;
          attachment_id: string | null;
          context: Json | null;
          client_message_id: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          conversation_id: string;
          sender_id: string;
          message_type: string;
          channel: string;
          content?: string | null;
          created_at?: string;
          updated_at?: string;
          read_at?: string | null;
          acknowledged_at?: string | null;
          attachment_id?: string | null;
          context?: Json | null;
          client_message_id: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          conversation_id?: string;
          sender_id?: string;
          message_type?: string;
          channel?: string;
          content?: string | null;
          created_at?: string;
          updated_at?: string;
          read_at?: string | null;
          acknowledged_at?: string | null;
          attachment_id?: string | null;
          context?: Json | null;
          client_message_id?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_messages_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          }
        ];
      };
      check_calls: {
        Row: {
          id: string;
          organization_id: string;
          load_id: string;
          call_type: string;
          status: string;
          location_city: string | null;
          location_state: string | null;
          latitude: number | null;
          longitude: number | null;
          eta_pickup: string | null;
          eta_delivery: string | null;
          notes: string | null;
          created_by: string;
          event_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          load_id: string;
          call_type: string;
          status?: string;
          location_city?: string | null;
          location_state?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          eta_pickup?: string | null;
          eta_delivery?: string | null;
          notes?: string | null;
          created_by: string;
          event_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          load_id?: string;
          call_type?: string;
          status?: string;
          location_city?: string | null;
          location_state?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          eta_pickup?: string | null;
          eta_delivery?: string | null;
          notes?: string | null;
          created_by?: string;
          event_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "check_calls_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fk_check_calls_load";
            columns: ["organization_id", "load_id"];
            isOneToOne: false;
            referencedRelation: "loads";
            referencedColumns: ["organization_id", "id"];
          }
        ];
      };
      load_detention_records: {
        Row: {
          id: string;
          organization_id: string;
          load_id: string;
          facility_type: 'pickup' | 'delivery' | 'intermediate_stop';
          facility_name: string | null;
          facility_address: string | null;
          facility_timezone: string;
          appointment_time: string | null;
          arrival_time: string;
          loading_start_time: string | null;
          loading_complete_time: string | null;
          unloading_start_time: string | null;
          unloading_complete_time: string | null;
          departure_time: string | null;
          free_time_hours: number;
          hourly_rate: number;
          detention_start_time: string | null;
          billable_hours: number;
          detention_amount: number;
          is_active_detention: boolean;
          status: 'draft' | 'submitted_to_broker' | 'approved_on_rate_con' | 'rejected' | 'invoiced';
          check_call_id: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          load_id: string;
          facility_type: 'pickup' | 'delivery' | 'intermediate_stop';
          facility_name?: string | null;
          facility_address?: string | null;
          facility_timezone?: string;
          appointment_time?: string | null;
          arrival_time: string;
          loading_start_time?: string | null;
          loading_complete_time?: string | null;
          unloading_start_time?: string | null;
          unloading_complete_time?: string | null;
          departure_time?: string | null;
          free_time_hours?: number;
          hourly_rate?: number;
          detention_start_time?: string | null;
          billable_hours?: number;
          detention_amount?: number;
          is_active_detention?: boolean;
          status?: 'draft' | 'submitted_to_broker' | 'approved_on_rate_con' | 'rejected' | 'invoiced';
          check_call_id?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          load_id?: string;
          facility_type?: 'pickup' | 'delivery' | 'intermediate_stop';
          facility_name?: string | null;
          facility_address?: string | null;
          facility_timezone?: string;
          appointment_time?: string | null;
          arrival_time?: string;
          loading_start_time?: string | null;
          loading_complete_time?: string | null;
          unloading_start_time?: string | null;
          unloading_complete_time?: string | null;
          departure_time?: string | null;
          free_time_hours?: number;
          hourly_rate?: number;
          detention_start_time?: string | null;
          billable_hours?: number;
          detention_amount?: number;
          is_active_detention?: boolean;
          status?: 'draft' | 'submitted_to_broker' | 'approved_on_rate_con' | 'rejected' | 'invoiced';
          check_call_id?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "load_detention_records_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fk_load_detention_records_load";
            columns: ["organization_id", "load_id"];
            isOneToOne: false;
            referencedRelation: "loads";
            referencedColumns: ["organization_id", "id"];
          }
        ];
      };
      load_detention_audits: {
        Row: {
          id: string;
          organization_id: string;
          load_id: string;
          detention_record_id: string | null;
          audit_version: number;
          audit_status: 'eligible' | 'not_eligible' | 'needs_review';
          overall_confidence: number;
          requires_human_review: boolean;
          pickup_status: 'eligible' | 'not_eligible' | 'needs_review' | 'not_applicable';
          pickup_appointment_time: string | null;
          pickup_arrival_time: string | null;
          pickup_departure_time: string | null;
          pickup_detention_start: string | null;
          pickup_detention_end: string | null;
          pickup_free_time_hours: number;
          pickup_billable_hours: number;
          pickup_hourly_rate: number;
          pickup_verified_amount: number;
          delivery_status: 'eligible' | 'not_eligible' | 'needs_review' | 'not_applicable';
          delivery_appointment_time: string | null;
          delivery_arrival_time: string | null;
          delivery_departure_time: string | null;
          delivery_detention_start: string | null;
          delivery_detention_end: string | null;
          delivery_free_time_hours: number;
          delivery_billable_hours: number;
          delivery_hourly_rate: number;
          delivery_verified_amount: number;
          total_verified_hours: number;
          total_verified_amount: number;
          evidence: Json;
          discrepancies: Json;
          missing_evidence: Json;
          reasoning_summary: string;
          human_review_status: 'pending' | 'accepted' | 'overridden' | 'rejected';
          human_reviewed_by: string | null;
          human_reviewed_by_name: string | null;
          human_reviewed_at: string | null;
          human_override_notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          load_id: string;
          detention_record_id?: string | null;
          audit_version?: number;
          audit_status: 'eligible' | 'not_eligible' | 'needs_review';
          overall_confidence?: number;
          requires_human_review?: boolean;
          pickup_status?: 'eligible' | 'not_eligible' | 'needs_review' | 'not_applicable';
          pickup_appointment_time?: string | null;
          pickup_arrival_time?: string | null;
          pickup_departure_time?: string | null;
          pickup_detention_start?: string | null;
          pickup_detention_end?: string | null;
          pickup_free_time_hours?: number;
          pickup_billable_hours?: number;
          pickup_hourly_rate?: number;
          pickup_verified_amount?: number;
          delivery_status?: 'eligible' | 'not_eligible' | 'needs_review' | 'not_applicable';
          delivery_appointment_time?: string | null;
          delivery_arrival_time?: string | null;
          delivery_departure_time?: string | null;
          delivery_detention_start?: string | null;
          delivery_detention_end?: string | null;
          delivery_free_time_hours?: number;
          delivery_billable_hours?: number;
          delivery_hourly_rate?: number;
          delivery_verified_amount?: number;
          total_verified_hours?: number;
          total_verified_amount?: number;
          evidence?: Json;
          discrepancies?: Json;
          missing_evidence?: Json;
          reasoning_summary?: string;
          human_review_status?: 'pending' | 'accepted' | 'overridden' | 'rejected';
          human_reviewed_by?: string | null;
          human_reviewed_by_name?: string | null;
          human_reviewed_at?: string | null;
          human_override_notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          load_id?: string;
          detention_record_id?: string | null;
          audit_version?: number;
          audit_status?: 'eligible' | 'not_eligible' | 'needs_review';
          overall_confidence?: number;
          requires_human_review?: boolean;
          pickup_status?: 'eligible' | 'not_eligible' | 'needs_review' | 'not_applicable';
          pickup_appointment_time?: string | null;
          pickup_arrival_time?: string | null;
          pickup_departure_time?: string | null;
          pickup_detention_start?: string | null;
          pickup_detention_end?: string | null;
          pickup_free_time_hours?: number;
          pickup_billable_hours?: number;
          pickup_hourly_rate?: number;
          pickup_verified_amount?: number;
          delivery_status?: 'eligible' | 'not_eligible' | 'needs_review' | 'not_applicable';
          delivery_appointment_time?: string | null;
          delivery_arrival_time?: string | null;
          delivery_departure_time?: string | null;
          delivery_detention_start?: string | null;
          delivery_detention_end?: string | null;
          delivery_free_time_hours?: number;
          delivery_billable_hours?: number;
          delivery_hourly_rate?: number;
          delivery_verified_amount?: number;
          total_verified_hours?: number;
          total_verified_amount?: number;
          evidence?: Json;
          discrepancies?: Json;
          missing_evidence?: Json;
          reasoning_summary?: string;
          human_review_status?: 'pending' | 'accepted' | 'overridden' | 'rejected';
          human_reviewed_by?: string | null;
          human_reviewed_by_name?: string | null;
          human_reviewed_at?: string | null;
          human_override_notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "load_detention_audits_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fk_load_detention_audits_load";
            columns: ["organization_id", "load_id"];
            isOneToOne: false;
            referencedRelation: "loads";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "fk_load_detention_audits_record";
            columns: ["detention_record_id"];
            isOneToOne: false;
            referencedRelation: "load_detention_records";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_user_organizations: {
        Args: Record<PropertyKey, never>;
        Returns: string[];
      };
      is_org_owner_admin: {
        Args: {
          org_id: string;
        };
        Returns: boolean;
      };
      create_organization_with_admin: {
        Args: {
          org_name: string;
          org_slug?: string | null;
          primary_tz?: string | null;
        };
        Returns: string;
      };
      create_team_invitation: {
        Args: {
          p_organization_id: string;
          p_email: string;
          p_role: string;
          p_token_hash: string;
          p_expires_at?: string | null;
          p_driver_id?: string | null;
        };
        Returns: Json;
      };
      cancel_team_invitation: {
        Args: {
          p_invitation_id: string;
        };
        Returns: Json;
      };
      get_invitation_details: {
        Args: {
          p_token_hash: string;
        };
        Returns: Json;
      };
      accept_team_invitation: {
        Args: {
          p_token_hash: string;
        };
        Returns: Json;
      };
      update_team_member_role: {
        Args: {
          p_organization_id: string;
          p_member_id: string;
          p_new_role: string;
        };
        Returns: Json;
      };
      remove_team_member: {
        Args: {
          p_organization_id: string;
          p_member_id: string;
        };
        Returns: Json;
      };
      transition_load_status: {
        Args: {
          p_organization_id: string;
          p_load_id: string;
          p_target_status: string;
          p_notes?: string | null;
        };
        Returns: Json;
      };
      assign_load_dispatch: {
        Args: {
          p_organization_id: string;
          p_load_id: string;
          p_truck_id?: string | null;
          p_driver_id?: string | null;
          p_notes?: string | null;
        };
        Returns: Json;
      };
      bulk_assign_load_team_members: {
        Args: {
          p_organization_id: string;
          p_load_ids: string[];
          p_user_ids: string[];
          p_mode?: string;
          p_actor_id?: string | null;
        };
        Returns: Json;
      };
      get_team_workload_overview: {
        Args: {
          p_organization_id: string;
        };
        Returns: Json;
      };
      can_access_freight_document: {
        Args: {
          p_bucket_id: string;
          p_object_name: string;
        };
        Returns: boolean;
      };
      get_current_driver_id: {
        Args: {
          p_organization_id: string;
        };
        Returns: string;
      };
      get_driver_load_documents: {
        Args: {
          p_organization_id: string;
          p_load_id: string;
        };
        Returns: {
          id: string;
          organization_id: string;
          load_id: string | null;
          doc_type: string;
          doc_status: string;
          file_path: string | null;
          file_name: string | null;
          file_size_bytes: number | null;
          mime_type: string | null;
          uploaded_by: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        }[];
      };
      accept_driver_invitation: {
        Args: {
          p_token_hash: string;
        };
        Returns: Json;
      };
      verify_driver_load_access: {
        Args: {
          p_load_id: string;
        };
        Returns: Json;
      };
      admin_unlink_driver_identity: {
        Args: {
          p_driver_id: string;
        };
        Returns: Json;
      };
      get_organization_subscription_usage: {
        Args: {
          p_organization_id: string;
        };
        Returns: Json;
      };
      get_plan_amt_capacity: {
        Args: {
          p_plan: string;
          p_custom_amt_capacity?: number | null;
        };
        Returns: number;
      };
      apply_subscription_payment_transition: {
        Args: {
          p_organization_id: string;
          p_provider?: string;
          p_provider_event_id?: string | null;
          p_provider_event_timestamp?: string | null;
          p_new_billing_state?: string | null;
          p_plan?: string | null;
          p_current_period_start?: string | null;
          p_current_period_end?: string | null;
          p_razorpay_customer_id?: string | null;
          p_razorpay_subscription_id?: string | null;
          p_payment_id?: string | null;
          p_invoice_id?: string | null;
          p_order_id?: string | null;
          p_amount_cents?: number | null;
          p_currency?: string | null;
          p_payment_status?: string | null;
          p_error_code?: string | null;
          p_error_description?: string | null;
        };
        Returns: Json;
      };
      save_load_detention_audit_atomic: {
        Args: {
          p_audit_data: Json;
        };
        Returns: Database['public']['Tables']['load_detention_audits']['Row'];
      };
    };
    Enums: {
      user_role: UserRole;
      client_type: ClientType;
      credit_status: CreditStatus;
      equipment_type: EquipmentType;
      truck_status: TruckStatus;
      driver_status: DriverStatus;
      driver_pay_type: DriverPayType;
      pipeline_status: PipelineStatus;
      document_type: DocumentType;
      document_status: DocumentStatus;
      note_type: NoteType;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
