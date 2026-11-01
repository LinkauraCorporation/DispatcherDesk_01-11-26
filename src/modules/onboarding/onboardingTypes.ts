import { Client, Truck, Driver, Broker, Load, Organization } from '../../types/domain.types.ts';
import { DriverWithRelations } from '../drivers/driverTypes.ts';
import { BrokerWithPerformance } from '../brokers/brokerTypes.ts';

export type OnboardingStepNumber = 1 | 2 | 3 | 4 | 5;

export interface OnboardingState {
  orgId: string;
  step: OnboardingStepNumber;
  client: Client | null;
  truck: Truck | null;
  driver: DriverWithRelations | Driver | null;
  broker: BrokerWithPerformance | Broker | null;
  isComplete: boolean;
  lastUpdated?: string;
}

export interface OnboardingStepConfig {
  step: OnboardingStepNumber;
  title: string;
  shortName: string;
  subtitle: string;
  isOptional?: boolean;
}

export const ONBOARDING_STEPS: OnboardingStepConfig[] = [
  {
    step: 1,
    title: 'Carrier Client',
    shortName: 'Carrier Client',
    subtitle: 'Register your first motor carrier or owner-operator client',
  },
  {
    step: 2,
    title: 'Truck & Equipment',
    shortName: 'Truck & Equipment',
    subtitle: 'Set up equipment assigned to this carrier for dispatch',
  },
  {
    step: 3,
    title: 'Driver',
    shortName: 'Driver Profile',
    subtitle: 'Add the driver assigned to this truck and set pay terms',
  },
  {
    step: 4,
    title: 'Freight Broker (Optional)',
    shortName: 'Broker (Optional)',
    subtitle: 'Add a freight broker partner or skip for open/direct loads',
    isOptional: true,
  },
  {
    step: 5,
    title: 'Book First Load',
    shortName: 'First Load',
    subtitle: 'Create and book your maiden dispatch load into the pipeline',
  },
];
