import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';
import { SubscriptionProvider } from './context/SubscriptionContext';
import TrialOnboarding from './screens/Paywall/TrialOnboarding';
import { STORAGE_KEYS } from './constants/subscriptionConfig';

export default function RootWithSubscription() {
  const [trialOnboardingVisible, setTrialOnboardingVisible] = useState(false);
  const [checkedOnboarding, setCheckedOnboarding] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const shown = await AsyncStorage.getItem(STORAGE_KEYS.trialOfferShown);
        if (!shown) {
          setTrialOnboardingVisible(true);
        }
      } catch {
        // ignore
      } finally {
        setCheckedOnboarding(true);
      }
    })();
  }, []);

  return (
    <SubscriptionProvider>
      <App />
      {checkedOnboarding && (
        <TrialOnboarding
          visible={trialOnboardingVisible}
          onComplete={() => setTrialOnboardingVisible(false)}
        />
      )}
    </SubscriptionProvider>
  );
}
