import { Driver, Client, Truck, DriverPayType, DriverStatus } from '../../types/domain.types.ts';

export interface DriverWithRelations extends Driver {
  client?: Pick<Client, 'id' | 'company_name' | 'client_type' | 'contact_name' | 'contact_phone' | 'contact_email'> | null;
  assigned_truck?: Pick<Truck, 'id' | 'truck_number' | 'equipment_type' | 'current_location_city' | 'current_location_state' | 'status' | 'vin'> | null;
}

export interface CreateDriverInput {
  client_id?: string | null;
  assigned_truck_id?: string | null;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  pay_type: DriverPayType;
  pay_rate: number;
  status: DriverStatus;
  notes?: string | null;
}

export interface UpdateDriverInput {
  client_id?: string | null;
  assigned_truck_id?: string | null;
  full_name?: string;
  phone?: string | null;
  email?: string | null;
  pay_type?: DriverPayType;
  pay_rate?: number;
  status?: DriverStatus;
  notes?: string | null;
}

export const DRIVER_PAY_TYPE_OPTIONS: { value: DriverPayType; label: string; unit: string; description: string }[] = [
  {
    value: 'percentage_gross',
    label: '% of Gross Revenue',
    unit: '%',
    description: 'Percentage cut of the load rate (e.g. 25% of load gross)',
  },
  {
    value: 'per_mile',
    label: 'Per Loaded/Total Mile',
    unit: '$/mi',
    description: 'Fixed dollar rate per odometer mile (e.g. $0.65 / mile)',
  },
  {
    value: 'flat_rate',
    label: 'Flat Rate per Load / Week',
    unit: '$',
    description: 'Guaranteed flat fee per completed dispatch / cycle',
  },
];

export const DRIVER_STATUS_OPTIONS: { value: DriverStatus; label: string; color: string }[] = [
  { value: 'available', label: 'Available / Ready', color: 'emerald' },
  { value: 'on_load', label: 'On Dispatched Load', color: 'purple' },
  { value: 'off_duty', label: 'Off Duty / Rest Period', color: 'amber' },
  { value: 'inactive', label: 'Inactive / Suspended', color: 'slate' },
];

export function formatDriverPayRate(payType: DriverPayType, payRate: number): string {
  if (payRate === undefined || payRate === null || isNaN(payRate)) {
    return '—';
  }
  switch (payType) {
    case 'percentage_gross':
      return `${payRate}% Gross`;
    case 'per_mile':
      return `$${payRate.toFixed(2)} / mi`;
    case 'flat_rate':
      return `$${payRate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Flat`;
    default:
      return `${payRate}`;
  }
}
