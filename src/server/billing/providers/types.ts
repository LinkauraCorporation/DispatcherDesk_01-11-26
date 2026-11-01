/**
 * DispatcherDesk Payment Provider Architecture
 * File: src/server/billing/providers/types.ts
 *
 * Provider-neutral interfaces and normalization contracts for payment gateway integration.
 * Guarantees that external provider representations (Razorpay, etc.) remain decoupled
 * from internal DispatcherDesk authoritative domain models.
 */

import { PlanType, BillingState } from '../../../types/domain.types.ts';

export interface ProviderCustomerRef {
  id: string;
  email?: string;
  name?: string;
}

export interface ProviderSubscriptionRef {
  id: string;
  customerId: string;
  planId: string;
  status: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
}

export interface PaymentVerificationRequest {
  paymentId: string;
  subscriptionId?: string;
  orderId?: string;
  signature: string;
}

export interface PaymentVerificationResult {
  isValid: boolean;
  paymentId: string;
  subscriptionId?: string;
  orderId?: string;
  error?: string;
}

export interface WebhookVerificationRequest {
  rawBody: Buffer | string;
  signature: string;
  secret: string;
}

export type NormalizedBillingEventType =
  | 'subscription.authenticated'
  | 'subscription.activated'
  | 'subscription.charged'
  | 'subscription.pending'
  | 'subscription.halted'
  | 'subscription.paused'
  | 'subscription.resumed'
  | 'subscription.cancelled'
  | 'payment.failed'
  | 'unknown';

export interface NormalizedBillingEvent {
  provider: 'razorpay';
  eventId: string;
  eventType: NormalizedBillingEventType;
  rawEventType: string;
  providerTimestamp: Date;
  providerSubscriptionId?: string;
  providerCustomerId?: string;
  providerPaymentId?: string;
  providerInvoiceId?: string;
  providerOrderId?: string;
  amountCents?: number;
  currency?: string;
  periodStart?: Date;
  periodEnd?: Date;
  targetState?: BillingState;
  organizationIdHint?: string;
  rawPayload: Record<string, any>;
}

export interface ProviderPaymentRef {
  id: string;
  amount: number;
  currency: string;
  status: string;
  invoiceId?: string;
  orderId?: string;
}

export interface PaymentProviderAdapter {
  readonly providerName: 'razorpay';
  verifyWebhookSignature(request: WebhookVerificationRequest): boolean;
  verifyPaymentSignature(request: PaymentVerificationRequest): PaymentVerificationResult;
  normalizeWebhookEvent(payload: Record<string, any>, headerEventId?: string): NormalizedBillingEvent;
  createCustomer?(params: { organizationId: string; name: string; email: string }): Promise<ProviderCustomerRef>;
  createSubscription?(params: { customerId: string; plan: PlanType; organizationId: string }): Promise<ProviderSubscriptionRef>;
  cancelSubscription?(subscriptionId: string): Promise<boolean>;
  getSubscription?(subscriptionId: string): Promise<ProviderSubscriptionRef | null>;
  getPayment?(paymentId: string): Promise<ProviderPaymentRef | null>;
}
