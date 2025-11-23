import Stripe from 'stripe';
import { type IStorage } from './storage';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-11-17.clover',
});

export interface BillingResult {
  success: boolean;
  merchantId: number;
  transactionCount: number;
  amountCharged: number;
  error?: string;
}

/**
 * Process billing for a single merchant based on their unbilled transactions
 */
export async function processMerchantBilling(
  merchantId: number,
  storage: IStorage
): Promise<BillingResult> {
  try {
    // Get merchant subscription
    const subscription = await storage.getSubscription(merchantId);
    
    if (!subscription) {
      return {
        success: false,
        merchantId,
        transactionCount: 0,
        amountCharged: 0,
        error: 'No subscription found'
      };
    }

    // Don't process if no unbilled transactions
    if (!subscription.unbilledTransactionCount || subscription.unbilledTransactionCount === 0) {
      return {
        success: true,
        merchantId,
        transactionCount: 0,
        amountCharged: 0,
      };
    }

    // Don't process if merchant cancelled or has no payment method
    if (subscription.status === 'cancelled' || !subscription.stripePaymentMethodId) {
      return {
        success: false,
        merchantId,
        transactionCount: subscription.unbilledTransactionCount,
        amountCharged: 0,
        error: subscription.status === 'cancelled' ? 'Subscription cancelled' : 'No payment method'
      };
    }

    // Calculate charge amount (10 cents per transaction)
    const transactionCount = subscription.unbilledTransactionCount;
    const amountInCents = transactionCount * 10; // 10 cents = $0.10 per transaction

    // Create Stripe charge
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: 'nzd',
        customer: subscription.stripeCustomerId || undefined,
        payment_method: subscription.stripePaymentMethodId,
        off_session: true,
        confirm: true,
        description: `Transaction fees for ${transactionCount} transactions`,
        metadata: {
          merchantId: merchantId.toString(),
          transactionCount: transactionCount.toString(),
          billingType: 'transaction_fees'
        }
      });

      // Create billing history record
      await storage.createBillingHistory({
        merchantId,
        subscriptionId: subscription.id,
        amount: (amountInCents / 100).toFixed(2),
        transactionCount,
        billingPeriodStart: subscription.lastBillingDate || new Date().toISOString(),
        billingPeriodEnd: new Date().toISOString(),
        status: paymentIntent.status === 'succeeded' ? 'paid' : 'pending',
        stripePaymentIntentId: paymentIntent.id,
      });

      // Reset unbilled counters if payment succeeded
      if (paymentIntent.status === 'succeeded') {
        await storage.resetUnbilledTransactions(merchantId);
      }

      return {
        success: paymentIntent.status === 'succeeded',
        merchantId,
        transactionCount,
        amountCharged: amountInCents / 100,
      };
    } catch (stripeError: any) {
      console.error('Stripe payment error:', stripeError);
      
      // Create failed billing history record
      await storage.createBillingHistory({
        merchantId,
        subscriptionId: subscription.id,
        amount: (amountInCents / 100).toFixed(2),
        transactionCount,
        billingPeriodStart: subscription.lastBillingDate || new Date().toISOString(),
        billingPeriodEnd: new Date().toISOString(),
        status: 'failed',
        stripePaymentIntentId: null,
      });

      return {
        success: false,
        merchantId,
        transactionCount,
        amountCharged: 0,
        error: stripeError.message
      };
    }
  } catch (error: any) {
    console.error('Billing processing error:', error);
    return {
      success: false,
      merchantId,
      transactionCount: 0,
      amountCharged: 0,
      error: error.message
    };
  }
}

/**
 * Process billing for all merchants based on their billing frequency
 */
export async function processBillingForAllMerchants(
  storage: IStorage,
  billingFrequency?: 'weekly' | 'bi_weekly' | 'monthly'
): Promise<BillingResult[]> {
  try {
    // Get all active subscriptions
    const subscriptions = await storage.getAllActiveSubscriptions(billingFrequency);
    
    const results: BillingResult[] = [];
    
    // Process each subscription
    for (const subscription of subscriptions) {
      // Check if billing is due based on last billing date and frequency
      const isDue = isBillingDue(
        subscription.lastBillingDate,
        subscription.billingFrequency || 'monthly'
      );
      
      if (isDue && subscription.unbilledTransactionCount && subscription.unbilledTransactionCount > 0) {
        const result = await processMerchantBilling(subscription.merchantId, storage);
        results.push(result);
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error processing billing for all merchants:', error);
    return [];
  }
}

/**
 * Check if billing is due based on last billing date and frequency
 */
function isBillingDue(lastBillingDate: string | null, frequency: string): boolean {
  if (!lastBillingDate) {
    return true; // First billing
  }
  
  const lastBilling = new Date(lastBillingDate);
  const now = new Date();
  const daysSinceLastBilling = Math.floor((now.getTime() - lastBilling.getTime()) / (1000 * 60 * 60 * 24));
  
  switch (frequency) {
    case 'weekly':
      return daysSinceLastBilling >= 7;
    case 'bi_weekly':
      return daysSinceLastBilling >= 14;
    case 'monthly':
      return daysSinceLastBilling >= 30;
    default:
      return daysSinceLastBilling >= 30;
  }
}
