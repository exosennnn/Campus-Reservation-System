// Sandbox payment provider. It records a payment reference but moves no money.
//
// To take real payments, replace `processPayment` with a call to a payment provider
// (for example PayMongo or Stripe) using your secret key from an environment variable,
// and return the provider's reference only after it confirms the payment succeeded.
import { randomBytes } from 'node:crypto';
import { PAYMENT_METHODS } from '../src/config.js';

export const PAYMENT_METHOD_IDS = PAYMENT_METHODS.map((m) => m.id);

export function processPayment({ amount, method }) {
  if (!PAYMENT_METHOD_IDS.includes(method)) throw new Error(`Unknown payment method: ${method}`);
  return {
    status: 'succeeded',
    reference: `SBX-${randomBytes(4).toString('hex').toUpperCase()}`,
    amount,
  };
}

// Sandbox refund. Replace with the provider's refund call, the same way as processPayment.
export function processRefund({ amount, reference }) {
  return {
    status: 'succeeded',
    reference: `RFD-${randomBytes(4).toString('hex').toUpperCase()}`,
    amount,
    originalReference: reference,
  };
}
