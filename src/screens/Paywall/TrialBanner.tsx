import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSubscription } from '../../hooks/useSubscription';
import Paywall from './index';

interface Props {
  // Show the banner starting at this many days remaining. Default 3.
  showFromDaysLeft?: number;
}

export default function TrialBanner({ showFromDaysLeft = 3 }: Props) {
  const { isTrial, trialDaysLeft } = useSubscription();
  const [dismissed, setDismissed] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);

  if (dismissed) return null;
  if (!isTrial || trialDaysLeft == null) return null;
  if (trialDaysLeft > showFromDaysLeft) return null;

  const colors = colorsForDaysLeft(trialDaysLeft);
  const label =
    trialDaysLeft <= 0 ? 'Trial expires today'
    : trialDaysLeft === 1 ? '1 day left in your free trial'
    : `${trialDaysLeft} days left in your free trial`;

  return (
    <>
      <View style={[styles.bar, { backgroundColor: colors.bg, borderColor: colors.border }]}>
        <MaterialIcons name="schedule" size={14} color={colors.text} />
        <Text style={[styles.label, { color: colors.text }]} numberOfLines={1}>
          {label}
        </Text>
        <Pressable onPress={() => setPaywallVisible(true)} hitSlop={8} style={styles.upgradeBtn}>
          <Text style={[styles.upgradeText, { color: colors.text }]}>UPGRADE</Text>
        </Pressable>
        <Pressable onPress={() => setDismissed(true)} hitSlop={8} style={styles.closeBtn}>
          <MaterialIcons name="close" size={14} color={colors.text} />
        </Pressable>
      </View>

      <Paywall visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
    </>
  );
}

function colorsForDaysLeft(days: number) {
  if (days <= 1) {
    return {
      bg:     'rgba(255,82,82,0.2)',
      border: 'rgba(255,82,82,0.4)',
      text:   '#FF5252',
    };
  }
  if (days <= 2) {
    return {
      bg:     'rgba(255,152,0,0.2)',
      border: 'rgba(255,152,0,0.4)',
      text:   '#FF9800',
    };
  }
  return {
    bg:     'rgba(255,183,77,0.15)',
    border: 'rgba(255,183,77,0.3)',
    text:   '#FFB74D',
  };
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginHorizontal: 12,
    marginTop: 6,
    marginBottom: 4,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    minHeight: 36,
  },
  label: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  upgradeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  upgradeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  closeBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
