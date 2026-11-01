import { PlanType } from '../../types/domain.types.ts';

export interface PlanFeature {
  text: string;
  highlighted?: boolean;
}

export interface BillingPlanDefinition {
  id: PlanType;
  name: string;
  providerPlanId: string;
  badge?: string;
  popular?: boolean;
  amtCapacity: number;
  monthlyPriceUsd: number;
  description: string;
  features: string[];
}

export const BILLING_PLANS: BillingPlanDefinition[] = [
  {
    id: 'starter',
    name: 'Starter Fleet',
    providerPlanId: 'plan_starter_monthly',
    badge: 'Independent & Boutique',
    amtCapacity: 10,
    monthlyPriceUsd: 99,
    description: 'Ideal for independent dispatchers & boutique desks managing up to 10 active managed trucks.',
    features: [
      '10 Active Managed Trucks (AMT) capacity',
      'Unlimited dispatchers & drivers (no seat fees)',
      'Carrier client management & MC tracking',
      'Load assignment & 7-stage pipeline',
      'Document vault (Rate Con, BOL, POD)',
      'Check calls & live transit notes',
      'Operations calendar & dock scheduling',
      'Standard support',
    ],
  },
  {
    id: 'growth',
    name: 'Growth Agency',
    providerPlanId: 'plan_growth_monthly',
    badge: 'Most Popular for Agencies',
    popular: true,
    amtCapacity: 25,
    monthlyPriceUsd: 199,
    description: 'For established dispatch companies coordinating multi-client fleets, shifts, and rate negotiation.',
    features: [
      '25 Active Managed Trucks (AMT) capacity',
      'Unlimited dispatchers & drivers (no seat fees)',
      'Multi-client segregated workspaces',
      'AI Rate Con parsing & document ingestion',
      'Detention clock & accessorial management',
      'Team workload & shift handover',
      'Client & lane profitability reports',
      'Priority agency support',
    ],
  },
  {
    id: 'agency',
    name: 'Agency Fleet',
    providerPlanId: 'plan_agency_monthly',
    badge: 'High-Volume Operations',
    amtCapacity: 50,
    monthlyPriceUsd: 349,
    description: 'High-capacity operations for large dispatch companies managing multi-carrier fleets at scale.',
    features: [
      '50 Active Managed Trucks (AMT) capacity',
      'Unlimited dispatchers & drivers (no seat fees)',
      'Advanced role permissions & team audit logs',
      'High-volume freight assignment',
      'Custom operational exports & invoicing',
      'Dedicated onboarding & account specialist',
      '24/7 priority operational dispatch support',
    ],
  },
];

export function getPlanDefinition(planId: PlanType | string): BillingPlanDefinition {
  // Normalize alias like 'starter_fleet' or 'growth_agency'
  const normalized = planId === 'starter_fleet' ? 'starter' : planId === 'growth_agency' ? 'growth' : planId;
  const found = BILLING_PLANS.find(p => p.id === normalized);
  if (found) return found;

  return {
    id: (planId as PlanType) || 'starter',
    name: planId ? String(planId).toUpperCase() : 'Custom Plan',
    providerPlanId: 'plan_starter_monthly',
    amtCapacity: 10,
    monthlyPriceUsd: 99,
    description: 'Custom fleet configuration',
    features: ['Active managed truck capacity', 'Unlimited team members'],
  };
}

export function getPlanByProviderId(providerPlanId: string): BillingPlanDefinition | undefined {
  return BILLING_PLANS.find(p => p.providerPlanId === providerPlanId);
}
