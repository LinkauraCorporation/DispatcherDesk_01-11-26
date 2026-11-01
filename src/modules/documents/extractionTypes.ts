import { EquipmentType } from '../../types/domain.types.ts';

export interface ExtractedBrokerInfo {
  company_name: string;
  mc_number?: string | null;
  dot_number?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  payment_terms_days?: number | null;
  raw_text?: string | null;
}

export interface ExtractedCarrierInfo {
  company_name?: string | null;
  carrier_name?: string | null;
  mc_number?: string | null;
  dot_number?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  truck_number?: string | null;
  trailer_number?: string | null;
  raw_text?: string | null;
}

export interface ExtractedLoadInfo {
  load_number: string;
  reference_number?: string | null; // PO / Ref # (Broker Reference only)
  pickup_appointment_number?: string | null; // Pickup Appointment / PU Ref #
  delivery_po_number?: string | null; // Delivery PO #
  rate: number; // Total Agreed Carrier Compensation / Gross Pay
  linehaul_rate?: number | null; // Base linehaul amount
  linehaul_rpm?: number | null; // Linehaul rate per mile from contract
  fuel_surcharge?: number | null; // FSC amount (if separated)
  accessorial_reserve?: number | null; // Detention / accessorial reserve amount
  total_carrier_compensation?: number | null; // Explicit total agreed settlement
  mileage?: number | null; // Loaded miles
  equipment_type?: EquipmentType | string | null;
  commodity?: string | null;
  weight_lbs?: number | null;
  special_instructions?: string | null;
  terms?: string | null;
  tracking_requirement?: string | null;
  check_call_requirement?: string | null;
  paperwork_instructions?: string | null;
  payment_terms?: string | null;
  quickpay_percentage?: number | null;
  raw_text?: string | null;
}

export interface ExtractedLocationInfo {
  facility_name?: string | null;
  address?: string | null;
  city: string;
  state: string;
  zip?: string | null;
  pickup_datetime?: string | null;
  delivery_datetime?: string | null;
  date_string?: string | null;
  time_string?: string | null;
  timezone?: string | null;
  appointment_type?: string | null;
  appointment_number?: string | null;
  po_number?: string | null;
  reference_number?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  instructions?: string | null;
  pickup_window_start?: string | null;
  pickup_window_end?: string | null;
  delivery_window_start?: string | null;
  delivery_window_end?: string | null;
  raw_text?: string | null;
}

export interface ExtractedStopInfo {
  stop_number: number;
  stop_type: 'pickup' | 'delivery' | 'stop_off';
  facility_name?: string | null;
  address?: string | null;
  city: string;
  state: string;
  zip?: string | null;
  date_string?: string | null;
  time_string?: string | null;
  timezone?: string | null;
  datetime_iso?: string | null;
  appointment_type?: string | null;
  appointment_number?: string | null;
  po_number?: string | null;
  reference_number?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  instructions?: string | null;
  raw_text?: string | null;
}

export interface ExtractedAccessorial {
  type: string;
  amount?: number | null;
  rate_unit?: string | null;
  condition?: string | null;
  notes?: string | null;
}

export interface FinancialBreakdown {
  linehaul_rate: number;
  linehaul_amount?: number;
  linehaul_rpm?: number | null;
  fuel_surcharge_amount: number;
  fuel_surcharge_included: boolean;
  accessorial_reserve_amount?: number;
  total_carrier_compensation: number;
  calculated_rpm: number | null;
  mileage?: number | null;
}

export interface ExtractionConfidenceScores {
  overall: number; // 0 - 100
  broker?: number;
  carrier?: number;
  load_number?: number;
  reference_number?: number;
  rate?: number;
  linehaul?: number;
  fuel_surcharge?: number;
  origin?: number;
  destination?: number;
  equipment_type?: number;
  commodity?: number;
  weight?: number;
  mileage?: number;
  dates?: number;
  accessorials?: number;
}

export interface RateConfirmationExtraction {
  broker: ExtractedBrokerInfo;
  carrier?: ExtractedCarrierInfo;
  load_info: ExtractedLoadInfo;
  origin: ExtractedLocationInfo;
  destination: ExtractedLocationInfo;
  stops?: ExtractedStopInfo[];
  financial_breakdown?: FinancialBreakdown;
  accessorials?: ExtractedAccessorial[];
  confidence_scores: ExtractionConfidenceScores;
  warnings?: string[];
  provenance?: {
    fileName: string;
    fileSize?: number;
    mimeType?: string;
    extractedAt: string;
    model: string;
    sourceType: 'uploaded_pdf' | 'uploaded_image' | 'sample_document' | 'pasted_text';
  };
}

export interface ExtractionResponse {
  success: boolean;
  extractedData: RateConfirmationExtraction;
  source: string;
  extractedAt: string;
  notice?: string;
  error?: string;
}

export interface ApplyExtractionToLoadInput {
  targetLoadId?: string; // If updating existing load
  createNewLoad?: boolean; // If creating new load
  organizationId: string;
  clientId: string;
  brokerId?: string | null;
  truckId?: string | null;
  driverId?: string | null;
  extractedData: RateConfirmationExtraction;
  overriddenFields: {
    load_number?: string;
    rate?: number;
    origin_facility_name?: string;
    origin_address?: string;
    origin_city?: string;
    origin_state?: string;
    origin_zip?: string;
    pickup_datetime?: string;
    dest_facility_name?: string;
    dest_address?: string;
    dest_city?: string;
    dest_state?: string;
    dest_zip?: string;
    delivery_datetime?: string;
    equipment_type?: EquipmentType;
    commodity?: string;
    weight_lbs?: number;
    loaded_miles?: number;
    deadhead_miles?: number;
    special_instructions?: string;
  };
  attachDocument?: {
    file_name: string;
    file_size_bytes?: number;
    mime_type?: string;
  };
}
