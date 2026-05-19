import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSubscription } from '../../../hooks/useSubscription';
import { FREE_LIMITS, PRODUCT_ANNUAL } from '../../../constants/subscriptionConfig';
import { SubscriptionService } from '../../../services/SubscriptionService';
import Paywall from '../../Paywall';

interface Props {
  // Render without the outer bezel/card chrome — used when this section is
  // composed inside another card (e.g. the Personal Space hero).
  embedded?: boolean;
}

export default function SubscriptionSection({ embedded = false }: Props) {
  const { isPro, isTrial, trialDaysLeft, expiresAt, productId, restore, refresh } = useSubscription();
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [clearing, setClearing] = useState(false);

  const manageSubscription = () => {
    const url = Platform.OS === 'ios'
      ? 'itms-apps://apps.apple.com/account/subscriptions'
      : 'https://play.google.com/store/account/subscriptions';
    Linking.openURL(url).catch(() => {
      Alert.alert('Could not open', 'Please open your device store to manage subscriptions.');
    });
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      await restore();
      Alert.alert('Restore', isPro ? 'Your subscription is active.' : 'No previous purchase found.');
    } catch {
      Alert.alert('Restore Failed', 'Could not restore purchases. Please try again.');
    } finally {
      setRestoring(false);
    }
  };

  const handleClearSubscription = () => {
    Haptics.selectionAsync();
    Alert.alert(
      'Clear Subscription (Dev)',
      'This wipes ALL subscription state: trial flag, cache, gate timestamps, and mock purchase data. The app will behave like a fresh install on next reload.\n\nUse only for testing.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setClearing(true);
            try {
              await SubscriptionService._devReset();
              await refresh();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert(
                'Cleared',
                'Subscription state wiped. The trial onboarding will reappear on next app launch.',
              );
            } catch {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Failed', 'Could not clear subscription state.');
            } finally {
              setClearing(false);
            }
          },
        },
      ],
    );
  };

  const planLabel = (() => {
    if (!isPro) return 'FREE PLAN';
    if (isTrial) return 'PRO · Trial';
    return productId === PRODUCT_ANNUAL ? 'PRO — Annual' : 'PRO — Monthly';
  })();

  const dateLine = (() => {
    if (!isPro) return `${FREE_LIMITS.timers} timer/day · ${FREE_LIMITS.tasksPerDay} tasks/day`;
    if (isTrial && trialDaysLeft != null) return `Trial ends in ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'}`;
    if (expiresAt) return `Renews ${formatDate(expiresAt)}`;
    return '';
  })();

  return (
    <View style={embedded ? styles.embedded : styles.bezel}>
      <View style={embedded ? styles.trackEmbedded : styles.track}>
        <View style={styles.headerRow}>
          <Text style={styles.sectionTitle}>SUBSCRIPTION</Text>
          {isPro ? (
            <View style={styles.statusPill}>
              <View style={[styles.dot, { backgroundColor: isTrial ? '#FFB74D' : '#00E5FF' }]} />
              <Text style={styles.statusPillText}>{isTrial ? 'TRIAL' : 'ACTIVE'}</Text>
            </View>
          ) : (
            <View style={styles.freePill}>
              <Text style={styles.freePillText}>FREE</Text>
            </View>
          )}
        </View>

        <View style={styles.statusRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.statusLabel}>Status</Text>
            <Text style={styles.statusValue}>{planLabel}</Text>
          </View>
          {dateLine ? (
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={styles.statusLabel}>{isPro ? (isTrial ? 'Trial' : 'Period') : 'Limits'}</Text>
              <Text style={[styles.statusValue, { textAlign: 'right' }]}>{dateLine}</Text>
            </View>
          ) : null}
        </View>

        {!isPro ? (
          <Pressable
            onPress={() => setPaywallVisible(true)}
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.92 }]}
          >
            <MaterialIcons name="auto-awesome" size={16} color="#000" />
            <Text style={styles.primaryBtnText}>UPGRADE TO PRO</Text>
            <MaterialIcons name="arrow-forward" size={16} color="#000" />
          </Pressable>
        ) : (
          <Pressable
            onPress={manageSubscription}
            style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.85 }]}
          >
            <MaterialIcons name="settings" size={16} color="#FFFFFF" />
            <Text style={styles.secondaryBtnText}>Manage Subscription</Text>
          </Pressable>
        )}

        <Pressable
          onPress={handleRestore}
          disabled={restoring}
          style={({ pressed }) => [
            styles.ghostBtn,
            (restoring || pressed) && { opacity: 0.7 },
          ]}
        >
          {restoring ? (
            <ActivityIndicator color="rgba(255,255,255,0.6)" size="small" />
          ) : (
            <>
              <MaterialIcons name="restore" size={14} color="rgba(255,255,255,0.6)" />
              <Text style={styles.ghostBtnText}>Restore Purchases</Text>
            </>
          )}
        </Pressable>

        {/* === DEV-ONLY: Clear subscription cache for testing === */}
        <Pressable
          onPress={handleClearSubscription}
          disabled={clearing}
          style={({ pressed }) => [
            styles.devBtn,
            (clearing || pressed) && { opacity: 0.6 },
          ]}
        >
          {clearing ? (
            <ActivityIndicator color="#FF6B6B" size="small" />
          ) : (
            <>
              <MaterialIcons name="science" size={13} color="#FF6B6B" />
              <Text style={styles.devBtnText}>Clear Subscription (Dev)</Text>
            </>
          )}
        </Pressable>
      </View>

      <Paywall visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
    </View>
  );
}

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

const styles = StyleSheet.create({
  bezel: {
    marginBottom: 20,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  embedded: {
    width: '100%',
    backgroundColor: 'transparent',
  },
  track: {
    padding: 16,
  },
  trackEmbedded: {
    paddingTop: 14,
    paddingBottom: 4,
    paddingHorizontal: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2.5,
    color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,229,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.3)',
    gap: 6,
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#00E5FF',
    letterSpacing: 1.2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  freePill: {
    paddingHorizontal: 10,
    height: 22,
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  freePillText: {
    fontSize: 9,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1.2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  statusLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  statusValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    height: 48,
    borderRadius: 14,
    gap: 8,
    marginBottom: 8,
  },
  primaryBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#000',
    letterSpacing: 1.4,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    height: 44,
    borderRadius: 12,
    gap: 8,
    marginBottom: 8,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  ghostBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
  },
  devBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 107, 107, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.18)',
    borderStyle: 'dashed',
    gap: 6,
  },
  devBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FF6B6B',
    letterSpacing: 0.3,
  },
});
