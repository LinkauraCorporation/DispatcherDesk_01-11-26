import {
  Client,
  Broker,
  Truck,
  Driver,
  LoadWithRelations,
  ProfitabilityMetrics,
  EquipmentType,
  PipelineStatus,
} from '../../types/domain.types.ts';

export type ProfitabilityDateRange =
  | 'today'
  | 'last_7_days'
  | 'last_30_days'
  | 'this_month'
  | 'custom'
  | 'all_time';

export type ProfitabilityStatus = 'healthy' | 'review' | 'loss';

export interface ProfitabilityFilters {
  dateRange: ProfitabilityDateRange;
  customStartDate?: string; // YYYY-MM-DD
  customEndDate?: string; // YYYY-MM-DD
  clientId?: string;
  brokerId?: string;
  equipmentType?: EquipmentType | 'all';
  pipelineStatus?: PipelineStatus | 'all';
  healthStatus?: ProfitabilityStatus | 'all';
}

export interface ProfitabilityLoadRow {
  load: LoadWithRelations;
  metrics: ProfitabilityMetrics;
  health: ProfitabilityStatus;
  deadheadPercentage: number;
  isLossMaking: boolean;
  isLowRpm: boolean;
  isHighDeadhead: boolean;
  isMarginReview: boolean;
}

export interface ProfitabilitySummary {
  totalLoads: number;
  grossRevenue: number;
  totalFuelExpense: number;
  totalDriverPay: number;
  totalOtherExpenses: number;
  totalEstimatedCost: number;
  totalEstimatedProfit: number;
  averageMargin: number; // percentage
  totalMiles: number;
  totalLoadedMiles: number;
  totalDeadheadMiles: number;
  deadheadPercentage: number;
  averageRpm: number;
  healthyCount: number;
  reviewCount: number;
  lossCount: number;
  bestMargin: number;
  worstMargin: number;
}

export interface ClientProfitability {
  client: Client;
  loadCount: number;
  grossRevenue: number;
  totalMiles: number;
  averageRpm: number;
  totalEstimatedCost: number;
  estimatedProfit: number;
  averageMargin: number;
  totalDriverPay: number;
}

export interface BrokerProfitability {
  broker: Broker;
  loadCount: number;
  grossRevenue: number;
  totalMiles: number;
  averageRpm: number;
  totalEstimatedCost: number;
  estimatedProfit: number;
  averageMargin: number;
}

export interface TruckProfitability {
  truck: Truck;
  client?: Client | null;
  loadCount: number;
  grossRevenue: number;
  totalMiles: number;
  averageRpm: number;
  totalEstimatedCost: number;
  estimatedProfit: number;
  averageMargin: number;
}

export interface DriverProfitability {
  driver: Driver;
  client?: Client | null;
  loadCount: number;
  grossRevenue: number;
  totalMiles: number;
  totalDriverPay: number;
  totalEstimatedCost: number;
  estimatedProfit: number;
  averageMargin: number;
}

export interface LaneProfitability {
  laneKey: string; // e.g. "IL → TX"
  originState: string;
  destState: string;
  loadCount: number;
  grossRevenue: number;
  totalMiles: number;
  averageRpm: number;
  totalEstimatedCost: number;
  estimatedProfit: number;
  averageMargin: number;
  isStrong: boolean; // margin >= 15% and RPM >= avg
  isWeak: boolean; // margin < 10% or RPM < $1.75
}

export type ProfitabilityAlertCategory = 'loss' | 'low_rpm' | 'high_deadhead' | 'margin_review';

export interface ProfitabilityAlertItem {
  id: string;
  category: ProfitabilityAlertCategory;
  title: string;
  description: string;
  severity: 'high' | 'warning' | 'info';
  load: LoadWithRelations;
  metrics: ProfitabilityMetrics;
}
