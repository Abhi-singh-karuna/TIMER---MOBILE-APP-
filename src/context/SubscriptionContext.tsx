import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  CustomerInfo,
  PurchasesPackage,
  SubscriptionService,
} from '../services/SubscriptionService';

export interface SubscriptionState {
  isPro:          boolean;
  isTrial:        boolean;
  trialDaysLeft:  number | null;
  expiresAt:      Date | null;
  productId:      string | null;
  isLoading:      boolean;
  customerInfo:   CustomerInfo | null;
  purchase:       (pkg: PurchasesPackage) => Promise<void>;
  restore:        () => Promise<void>;
  refresh:        () => Promise<void>;
}

export const SubscriptionContext = createContext<SubscriptionState | null>(null);

interface ProviderProps {
  children: React.ReactNode;
}

export function SubscriptionProvider({ children }: ProviderProps) {
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Cached / optimistic values rendered immediately on mount so the UI does
  // not flicker between "loading" and "Pro" on resume.
  const [cachedIsPro,   setCachedIsPro]   = useState<boolean>(false);
  const [cachedIsTrial, setCachedIsTrial] = useState<boolean>(false);
  const [cachedExpires, setCachedExpires] = useState<Date | null>(null);
  const [cachedProduct, setCachedProduct] = useState<string | null>(null);

  const initRan = useRef(false);

  const applyCustomerInfo = useCallback(async (info: CustomerInfo) => {
    setCustomerInfo(info);
    await SubscriptionService.updateCache(info);
    const ent = info.entitlements.active['pro'];
    setCachedIsPro(!!ent?.isActive);
    setCachedIsTrial(ent?.periodType === 'trial');
    setCachedExpires(ent?.expirationDate ? new Date(ent.expirationDate) : null);
    setCachedProduct(ent?.productIdentifier ?? null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const info = await SubscriptionService.getCustomerInfo();
      await applyCustomerInfo(info);
    } catch {
      // Network / store unreachable — keep existing cache values
    } finally {
      setIsLoading(false);
    }
  }, [applyCustomerInfo]);

  const purchase = useCallback(async (pkg: PurchasesPackage) => {
    const info = await SubscriptionService.purchase(pkg);
    await applyCustomerInfo(info);
  }, [applyCustomerInfo]);

  const restore = useCallback(async () => {
    const info = await SubscriptionService.restore();
    await applyCustomerInfo(info);
  }, [applyCustomerInfo]);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;

    (async () => {
      // 1. Optimistic load from cache so the UI is correct on first render
      const cache = await SubscriptionService.loadCache();
      if (cache) {
        setCachedIsPro(cache.isActive);
        setCachedIsTrial(cache.isTrial);
        setCachedExpires(cache.expiresAt ? new Date(cache.expiresAt) : null);
        setCachedProduct(cache.productId);
      }

      // 2. Initialize SDK
      await SubscriptionService.initialize();

      // 3. Fetch fresh info
      await refresh();
    })();
  }, [refresh]);

  useEffect(() => {
    const handler = (next: AppStateStatus) => {
      if (next === 'active') {
        refresh();
      }
    };
    const sub = AppState.addEventListener('change', handler);
    return () => sub.remove();
  }, [refresh]);

  const trialDaysLeft = useMemo(() => {
    if (!customerInfo) {
      if (cachedIsTrial && cachedExpires) {
        const ms = cachedExpires.getTime() - Date.now();
        return ms <= 0 ? 0 : Math.ceil(ms / (24 * 60 * 60 * 1000));
      }
      return null;
    }
    return SubscriptionService.trialDaysLeft(customerInfo);
  }, [customerInfo, cachedIsTrial, cachedExpires]);

  const value: SubscriptionState = useMemo(() => ({
    isPro:         customerInfo ? SubscriptionService.isPro(customerInfo) : cachedIsPro,
    isTrial:       customerInfo ? SubscriptionService.isTrial(customerInfo) : cachedIsTrial,
    trialDaysLeft,
    expiresAt:     cachedExpires,
    productId:     cachedProduct,
    isLoading,
    customerInfo,
    purchase,
    restore,
    refresh,
  }), [customerInfo, cachedIsPro, cachedIsTrial, cachedExpires, cachedProduct, isLoading, trialDaysLeft, purchase, restore, refresh]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}
