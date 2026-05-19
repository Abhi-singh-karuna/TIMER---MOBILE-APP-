import { useContext } from 'react';
import { SubscriptionContext, SubscriptionState } from '../context/SubscriptionContext';

export function useSubscription(): SubscriptionState {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    throw new Error('useSubscription must be used inside <SubscriptionProvider>');
  }
  return ctx;
}
