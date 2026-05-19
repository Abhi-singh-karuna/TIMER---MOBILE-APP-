// SubscriptionService — RevenueCat wrapper (mock mode).
//
// This module is the ONLY place that talks to the billing SDK. The rest of the
// app consumes the abstract types defined here. To wire up real RevenueCat:
//   1. `npm install react-native-purchases`
//   2. Add the API key to app.json under plugins.
//   3. Replace the mock bodies below with calls to the `Purchases` SDK
//      (Purchases.configure, Purchases.getCustomerInfo, Purchases.getOfferings,
//      Purchases.purchasePackage, Purchases.restorePurchases). Keep the same
//      method signatures and the rest of the app needs no changes.
//
// Mock behavior: subscription state is persisted to AsyncStorage so trial /
// purchase / restore flows behave realistically across app restarts. Time is
// real — a 7-day trial expires after 7 actual days.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CACHE_STALE_HOURS,
  ENTITLEMENT_ID,
  PRODUCT_ANNUAL,
  PRODUCT_MONTHLY,
  STORAGE_KEYS,
  TRIAL_DAYS,
} from '../constants/subscriptionConfig';

// ====== Public types (replace with RevenueCat's once SDK is wired) ======

export interface PurchasesEntitlementInfo {
  identifier:        string;
  isActive:          boolean;
  willRenew:         boolean;
  periodType:        'normal' | 'trial' | 'intro';
  latestPurchaseDate: string;
  originalPurchaseDate: string;
  expirationDate:    string | null;
  productIdentifier: string;
}

export interface CustomerInfo {
  entitlements: {
    active: Record<string, PurchasesEntitlementInfo>;
    all:    Record<string, PurchasesEntitlementInfo>;
  };
  activeSubscriptions: string[];
  latestExpirationDate: string | null;
  originalAppUserId: string;
  managementURL: string | null;
}

export interface PurchasesPackage {
  identifier:   string;            // 'monthly' | 'annual'
  packageType:  'MONTHLY' | 'ANNUAL';
  product: {
    identifier:    string;         // store product id
    priceString:   string;         // localised price string
    price:         number;
    currencyCode:  string;
    title:         string;
    description:   string;
  };
}

export interface PurchasesOffering {
  identifier:        string;
  serverDescription: string;
  monthly:           PurchasesPackage | null;
  annual:            PurchasesPackage | null;
  availablePackages: PurchasesPackage[];
}

export interface SubscriptionCache {
  isActive:      boolean;
  isTrial:       boolean;
  trialEndsAt:   string | null;
  expiresAt:     string | null;
  productId:     string | null;
  lastValidated: string;
}

export class PurchasesError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export const PurchasesErrorCode = {
  PURCHASE_CANCELLED: 'PURCHASE_CANCELLED',
  STORE_PROBLEM:      'STORE_PROBLEM',
  NETWORK_ERROR:      'NETWORK_ERROR',
  UNKNOWN:            'UNKNOWN',
} as const;

// ====== Mock state ======

interface MockState {
  productId:    string | null;    // PRODUCT_MONTHLY | PRODUCT_ANNUAL | null
  startedAt:    string | null;
  expiresAt:    string | null;
  isTrial:      boolean;
  cancelled:    boolean;
  trialUsed:    boolean;
}

const DEFAULT_MOCK_STATE: MockState = {
  productId: null,
  startedAt: null,
  expiresAt: null,
  isTrial:   false,
  cancelled: false,
  trialUsed: false,
};

async function loadMockState(): Promise<MockState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.mockCustomerInfo);
    if (!raw) return { ...DEFAULT_MOCK_STATE };
    return { ...DEFAULT_MOCK_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_MOCK_STATE };
  }
}

async function saveMockState(s: MockState): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.mockCustomerInfo, JSON.stringify(s));
}

function mockStateToCustomerInfo(s: MockState): CustomerInfo {
  const now = Date.now();
  const expires = s.expiresAt ? new Date(s.expiresAt).getTime() : 0;
  const isActive = !!s.productId && expires > now;

  const ent: PurchasesEntitlementInfo | undefined = isActive
    ? {
        identifier:           ENTITLEMENT_ID,
        isActive:             true,
        willRenew:            !s.cancelled,
        periodType:           s.isTrial ? 'trial' : 'normal',
        latestPurchaseDate:   s.startedAt || new Date().toISOString(),
        originalPurchaseDate: s.startedAt || new Date().toISOString(),
        expirationDate:       s.expiresAt,
        productIdentifier:    s.productId!,
      }
    : undefined;

  return {
    entitlements: {
      active: ent ? { [ENTITLEMENT_ID]: ent } : {},
      all:    ent ? { [ENTITLEMENT_ID]: ent } : {},
    },
    activeSubscriptions:  isActive && s.productId ? [s.productId] : [],
    latestExpirationDate: s.expiresAt,
    originalAppUserId:    'mock-user',
    managementURL:        null,
  };
}

// ====== SubscriptionService ======

class SubscriptionServiceImpl {
  private initialized = false;

  async initialize(_userId?: string): Promise<void> {
    // Real impl: Purchases.configure({ apiKey, appUserID: _userId })
    this.initialized = true;
  }

  async getCustomerInfo(): Promise<CustomerInfo> {
    // Real impl: return Purchases.getCustomerInfo()
    const state = await loadMockState();
    return mockStateToCustomerInfo(state);
  }

  async getOfferings(): Promise<PurchasesOffering | null> {
    // Real impl: const offerings = await Purchases.getOfferings(); return offerings.current
    const monthly: PurchasesPackage = {
      identifier:  'monthly',
      packageType: 'MONTHLY',
      product: {
        identifier:   PRODUCT_MONTHLY,
        priceString:  '$3.99',
        price:        3.99,
        currencyCode: 'USD',
        title:        'Chronoscape Pro Monthly',
        description:  'Pro features billed monthly',
      },
    };
    const annual: PurchasesPackage = {
      identifier:  'annual',
      packageType: 'ANNUAL',
      product: {
        identifier:   PRODUCT_ANNUAL,
        priceString:  '$29.99',
        price:        29.99,
        currencyCode: 'USD',
        title:        'Chronoscape Pro Annual',
        description:  'Pro features billed annually',
      },
    };
    return {
      identifier:        'default',
      serverDescription: 'Default offering',
      monthly,
      annual,
      availablePackages: [monthly, annual],
    };
  }

  isPro(info: CustomerInfo): boolean {
    return !!info.entitlements.active[ENTITLEMENT_ID]?.isActive;
  }

  isTrial(info: CustomerInfo): boolean {
    const ent = info.entitlements.active[ENTITLEMENT_ID];
    return !!ent?.isActive && ent.periodType === 'trial';
  }

  trialDaysLeft(info: CustomerInfo): number | null {
    if (!this.isTrial(info)) return null;
    const exp = info.entitlements.active[ENTITLEMENT_ID]?.expirationDate;
    if (!exp) return null;
    const ms = new Date(exp).getTime() - Date.now();
    if (ms <= 0) return 0;
    return Math.ceil(ms / (24 * 60 * 60 * 1000));
  }

  async purchase(pkg: PurchasesPackage): Promise<CustomerInfo> {
    // Real impl: const { customerInfo } = await Purchases.purchasePackage(pkg)
    // Errors: catch e.userCancelled and throw PurchasesError.PURCHASE_CANCELLED
    const state = await loadMockState();
    const now = new Date();
    const periodMs = pkg.packageType === 'ANNUAL'
      ? 365 * 24 * 60 * 60 * 1000
      : 30 * 24 * 60 * 60 * 1000;

    const startTrial = !state.trialUsed;
    const expiresAt = startTrial
      ? new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)
      : new Date(now.getTime() + periodMs);

    const next: MockState = {
      productId: pkg.product.identifier,
      startedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      isTrial:   startTrial,
      cancelled: false,
      trialUsed: state.trialUsed || startTrial,
    };
    await saveMockState(next);
    return mockStateToCustomerInfo(next);
  }

  async restore(): Promise<CustomerInfo> {
    // Real impl: return Purchases.restorePurchases()
    const state = await loadMockState();
    return mockStateToCustomerInfo(state);
  }

  async updateCache(info: CustomerInfo): Promise<void> {
    const ent = info.entitlements.active[ENTITLEMENT_ID];
    const cache: SubscriptionCache = {
      isActive:      !!ent?.isActive,
      isTrial:       ent?.periodType === 'trial',
      trialEndsAt:   ent?.periodType === 'trial' ? (ent.expirationDate ?? null) : null,
      expiresAt:     ent?.expirationDate ?? null,
      productId:     ent?.productIdentifier ?? null,
      lastValidated: new Date().toISOString(),
    };
    await AsyncStorage.setItem(STORAGE_KEYS.cache, JSON.stringify(cache));
  }

  async loadCache(): Promise<SubscriptionCache | null> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.cache);
      if (!raw) return null;
      const cache = JSON.parse(raw) as SubscriptionCache;
      // Conservative stale check: if older than 48h, treat as untrusted
      const validatedMs = new Date(cache.lastValidated).getTime();
      const ageMs = Date.now() - validatedMs;
      if (ageMs > CACHE_STALE_HOURS * 60 * 60 * 1000) {
        return { ...cache, isActive: false, isTrial: false };
      }
      return cache;
    } catch {
      return null;
    }
  }

  // Mock-only helper for dev testing — reset trial/purchase state
  async _devReset(): Promise<void> {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.mockCustomerInfo,
      STORAGE_KEYS.cache,
      STORAGE_KEYS.trialOfferShown,
      STORAGE_KEYS.gateTimestamps,
    ]);
  }
}

export const SubscriptionService = new SubscriptionServiceImpl();
