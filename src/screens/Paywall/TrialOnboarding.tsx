import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import {
  PurchasesError,
  PurchasesErrorCode,
  PurchasesOffering,
  PurchasesPackage,
  SubscriptionService,
} from '../../services/SubscriptionService';
import { useSubscription } from '../../hooks/useSubscription';
import { STORAGE_KEYS } from '../../constants/subscriptionConfig';
import Paywall from './index';

const APP_LOGO = require('../../../assets/logo-transparent.png');

// ============ PREMIUM PALETTE ============
const GOLD       = '#D4B57E';
const GOLD_SOFT  = '#E8D5A8';
const GOLD_DIM   = 'rgba(212,181,126,0.18)';
const GOLD_LINE  = 'rgba(212,181,126,0.4)';

interface Props {
  visible: boolean;
  onComplete: () => void;
}

type PlanKey = 'annual' | 'monthly';

interface Benefit {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  sub: string;
}

const BENEFITS: Benefit[] = [
  { icon: 'all-inclusive', title: 'Unlimited everything',   sub: 'No caps on timers, tasks, goals or notes' },
  { icon: 'autorenew',     title: 'Recurring engine',       sub: 'Daily, weekly, custom rhythms · streaks' },
  { icon: 'cloud-done',    title: 'Cloud backup & sync',    sub: 'Auto-sync across all your devices' },
  { icon: 'palette',       title: 'Themes & customisation', sub: 'All presets · custom hue · live preview' },
  { icon: 'insights',      title: 'Extended analytics',     sub: 'Streaks, history, deep reports' },
  { icon: 'enhanced-encryption', title: 'PIN-locked notes', sub: 'Per-folder 4-digit codes for privacy' },
];

export default function TrialOnboarding({ visible, onComplete }: Props) {
  const { purchase } = useSubscription();
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [trialMode, setTrialMode] = useState(true);
  const [plan, setPlan] = useState<PlanKey>('annual');
  const [paywallVisible, setPaywallVisible] = useState(false);

  // Animations
  const heroEntry = useRef(new Animated.Value(0)).current;
  const cardEntry = useRef(new Animated.Value(0)).current;
  const ctaEntry  = useRef(new Animated.Value(0)).current;
  const logoFloat = useRef(new Animated.Value(0)).current;
  const haloPulse = useRef(new Animated.Value(0)).current;
  const annualScale  = useRef(new Animated.Value(1)).current;
  const monthlyScale = useRef(new Animated.Value(0.98)).current;
  const ctaShine = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    (async () => {
      const o = await SubscriptionService.getOfferings();
      setOffering(o);
    })();

    Animated.stagger(140, [
      Animated.spring(heroEntry, { toValue: 1, useNativeDriver: true, friction: 7, tension: 60 }),
      Animated.spring(cardEntry, { toValue: 1, useNativeDriver: true, friction: 8, tension: 60 }),
      Animated.spring(ctaEntry,  { toValue: 1, useNativeDriver: true, friction: 8, tension: 60 }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(logoFloat, { toValue: 1, duration: 3200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(logoFloat, { toValue: 0, duration: 3200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(haloPulse, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(haloPulse, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(ctaShine, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(ctaShine, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    ).start();
  }, [visible, heroEntry, cardEntry, ctaEntry, logoFloat, haloPulse, ctaShine]);

  useEffect(() => {
    Animated.spring(annualScale,  { toValue: plan === 'annual'  ? 1 : 0.97, useNativeDriver: true, friction: 7, tension: 90 }).start();
    Animated.spring(monthlyScale, { toValue: plan === 'monthly' ? 1 : 0.97, useNativeDriver: true, friction: 7, tension: 90 }).start();
  }, [plan, annualScale, monthlyScale]);

  const markOnboardingShown = async () => {
    try { await AsyncStorage.setItem(STORAGE_KEYS.trialOfferShown, 'true'); } catch { /* */ }
  };

  const choosePlan = (next: PlanKey) => {
    if (plan === next) return;
    Haptics.selectionAsync();
    setPlan(next);
  };

  const toggleMode = (next: boolean) => {
    if (trialMode === next) return;
    Haptics.selectionAsync();
    setTrialMode(next);
  };

  const handlePurchase = async () => {
    if (purchasing) return;
    const pkg: PurchasesPackage | null = plan === 'annual' ? offering?.annual ?? null : offering?.monthly ?? null;
    if (!pkg) {
      Alert.alert('Unavailable', 'Subscription temporarily unavailable. Please try again later.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPurchasing(true);
    try {
      await purchase(pkg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await markOnboardingShown();
      onComplete();
    } catch (e) {
      if (e instanceof PurchasesError && e.code === PurchasesErrorCode.PURCHASE_CANCELLED) {
        // silent
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Purchase Failed', 'Something went wrong. Please try again.');
      }
    } finally {
      setPurchasing(false);
    }
  };

  const handleContinueFree = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await markOnboardingShown();
    onComplete();
  };

  const openTerms = () => {
    Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/').catch(() => {});
  };

  const annualPrice  = offering?.annual?.product.priceString  || '$29.99';
  const monthlyPrice = offering?.monthly?.product.priceString || '$3.99';
  const annualMonthlyEq = offering?.annual ? `$${(offering.annual.product.price / 12).toFixed(2)}/mo` : '$2.50/mo';

  // Interpolations
  const heroOpacity   = heroEntry;
  const heroTranslate = heroEntry.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });
  const cardOpacity   = cardEntry;
  const cardTranslate = cardEntry.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });
  const ctaOpacity    = ctaEntry;
  const ctaTranslate  = ctaEntry.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });
  const logoLift      = logoFloat.interpolate({ inputRange: [0, 1], outputRange: [-3, 3] });
  const haloOpacity   = haloPulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.55] });
  const haloScale     = haloPulse.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.10] });
  const shimmerTx     = ctaShine.interpolate({ inputRange: [0, 1], outputRange: [-160, 200] });
  const ctaGlow       = ctaShine.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.45] });

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent>
      <View style={styles.root}>
        {/* Dual-tone background */}
        <LinearGradient
          colors={['#0E0E10', '#06070A', '#000000']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />

        <SafeAreaView style={styles.safe} edges={['top']}>
          {/* TOP BAR */}
          <Animated.View
            style={[styles.topBar, { opacity: heroOpacity, transform: [{ translateY: heroTranslate }] }]}
          >
            <View style={styles.brandLockup}>
              <Image source={APP_LOGO} style={styles.brandLogo} resizeMode="contain" />
              <Text style={styles.brand}>CHRONOSCAPE</Text>
            </View>
            <View style={styles.proBadge}>
              <MaterialIcons name="auto-awesome" size={10} color={GOLD} />
              <Text style={styles.proBadgeText}>PRO</Text>
            </View>
          </Animated.View>

          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            bounces
          >
            {/* HERO LOGO ORB */}
            <Animated.View
              style={[
                styles.hero,
                { opacity: heroOpacity, transform: [{ translateY: heroTranslate }] },
              ]}
            >
              <View style={styles.orbStage} pointerEvents="none">
                <Animated.View style={[styles.haloOuter, { opacity: haloOpacity, transform: [{ scale: haloScale }] }]} />
                <Animated.View style={[styles.haloInner, { opacity: haloOpacity, transform: [{ scale: haloScale }] }]} />
              </View>

              <Animated.View style={{ transform: [{ translateY: logoLift }] }}>
                <LinearGradient
                  colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.02)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.logoOrb}
                >
                  <View style={styles.logoOrbInner}>
                    <Image source={APP_LOGO} style={styles.logo} resizeMode="contain" />
                  </View>
                  <View style={styles.logoSheen} pointerEvents="none" />
                </LinearGradient>
              </Animated.View>

              <Text style={styles.heroTitle}>
                Own every minute.{'\n'}
                <Text style={styles.heroTitleAccent}>Free for 7 days.</Text>
              </Text>
              <Text style={styles.heroSubtitle}>
                Try every Pro feature. No charge until your trial ends.
              </Text>
            </Animated.View>

            {/* MODE TOGGLE */}
            <Animated.View
              style={[
                styles.modeToggle,
                { opacity: cardOpacity, transform: [{ translateY: cardTranslate }] },
              ]}
            >
              <Pressable
                onPress={() => toggleMode(true)}
                style={[styles.modePill, trialMode && styles.modePillActive]}
              >
                <Text style={[styles.modePillText, trialMode && styles.modePillTextActive]}>
                  7-DAY TRIAL
                </Text>
              </Pressable>
              <Pressable
                onPress={() => toggleMode(false)}
                style={[styles.modePill, !trialMode && styles.modePillActive]}
              >
                <Text style={[styles.modePillText, !trialMode && styles.modePillTextActive]}>
                  SUBSCRIBE
                </Text>
              </Pressable>
            </Animated.View>

            {/* PLAN CARDS */}
            <Animated.View
              style={[
                styles.planRow,
                { opacity: cardOpacity, transform: [{ translateY: cardTranslate }] },
              ]}
            >
              <Animated.View style={{ flex: 1, transform: [{ scale: annualScale }] }}>
                <Pressable onPress={() => choosePlan('annual')}>
                  <View style={[styles.planCard, plan === 'annual' && styles.planCardActive]}>
                    <View style={styles.bestBadge}>
                      <MaterialIcons name="star" size={9} color="#000" />
                      <Text style={styles.bestBadgeText}>SAVE 37%</Text>
                    </View>
                    <Text style={[styles.planLabel, plan === 'annual' && styles.planLabelActive]}>ANNUAL</Text>
                    <View style={styles.planPriceRow}>
                      <Text style={styles.planPrice}>{annualPrice}</Text>
                      <Text style={styles.planPeriod}>/ yr</Text>
                    </View>
                    <Text style={[styles.planFootnote, plan === 'annual' && { color: GOLD_SOFT }]}>
                      ≈ {annualMonthlyEq}
                    </Text>
                    <View style={[styles.radio, plan === 'annual' && styles.radioActive]}>
                      {plan === 'annual' ? <MaterialIcons name="check" size={11} color="#000" /> : null}
                    </View>
                  </View>
                </Pressable>
              </Animated.View>

              <Animated.View style={{ flex: 1, transform: [{ scale: monthlyScale }] }}>
                <Pressable onPress={() => choosePlan('monthly')}>
                  <View style={[styles.planCard, plan === 'monthly' && styles.planCardActive]}>
                    <Text style={[styles.planLabel, plan === 'monthly' && styles.planLabelActive]}>MONTHLY</Text>
                    <View style={styles.planPriceRow}>
                      <Text style={styles.planPrice}>{monthlyPrice}</Text>
                      <Text style={styles.planPeriod}>/ mo</Text>
                    </View>
                    <Text style={[styles.planFootnote, plan === 'monthly' && { color: GOLD_SOFT }]}>
                      Flexible
                    </Text>
                    <View style={[styles.radio, plan === 'monthly' && styles.radioActive]}>
                      {plan === 'monthly' ? <MaterialIcons name="check" size={11} color="#000" /> : null}
                    </View>
                  </View>
                </Pressable>
              </Animated.View>
            </Animated.View>

            {/* SECTION HEADER */}
            <Animated.View
              style={[
                styles.sectionHeader,
                { opacity: cardOpacity, transform: [{ translateY: cardTranslate }] },
              ]}
            >
              <View style={styles.sectionLine} />
              <Text style={styles.sectionTitle}>WHAT YOU UNLOCK</Text>
              <View style={styles.sectionLine} />
            </Animated.View>

            {/* BENEFITS LIST */}
            <Animated.View
              style={[
                styles.benefitsList,
                { opacity: cardOpacity, transform: [{ translateY: cardTranslate }] },
              ]}
            >
              {BENEFITS.map((b) => (
                <View key={b.title} style={styles.benefitRow}>
                  <View style={styles.benefitIconWrap}>
                    <MaterialIcons name={b.icon} size={16} color={GOLD} />
                  </View>
                  <View style={styles.benefitTextWrap}>
                    <Text style={styles.benefitTitle}>{b.title}</Text>
                    <Text style={styles.benefitSub}>{b.sub}</Text>
                  </View>
                  <MaterialIcons name="check-circle" size={14} color={GOLD} />
                </View>
              ))}
            </Animated.View>

            {/* TRUST ROW */}
            <Animated.View
              style={[
                styles.trustRow,
                { opacity: cardOpacity, transform: [{ translateY: cardTranslate }] },
              ]}
            >
              <View style={styles.trustItem}>
                <MaterialIcons name="block" size={12} color={GOLD} />
                <Text style={styles.trustText}>No charge today</Text>
              </View>
              <View style={styles.trustDivider} />
              <View style={styles.trustItem}>
                <MaterialIcons name="event-available" size={12} color={GOLD} />
                <Text style={styles.trustText}>Cancel anytime</Text>
              </View>
              <View style={styles.trustDivider} />
              <View style={styles.trustItem}>
                <MaterialIcons name="lock" size={12} color={GOLD} />
                <Text style={styles.trustText}>Secure</Text>
              </View>
            </Animated.View>

            <View style={{ height: 220 }} />
          </ScrollView>

          {/* STICKY BOTTOM DRAWER */}
          <Animated.View
            style={[
              styles.drawerWrap,
              { opacity: ctaOpacity, transform: [{ translateY: ctaTranslate }] },
            ]}
          >
            <BlurView intensity={Platform.OS === 'ios' ? 55 : 40} tint="dark" style={StyleSheet.absoluteFill} />
            <LinearGradient
              colors={['rgba(8,9,12,0.5)', 'rgba(4,4,6,0.95)']}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.drawerHairline} />

            <SafeAreaView edges={['bottom']}>
              <View style={styles.drawerInner}>
                {/* Summary line */}
                <View style={styles.drawerSummary}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.drawerSummaryTop}>
                      {trialMode ? '7 days free, then ' : 'Billed '}
                      <Text style={styles.drawerSummaryTopAccent}>
                        {plan === 'annual' ? `${annualPrice}/yr` : `${monthlyPrice}/mo`}
                      </Text>
                    </Text>
                    <Text style={styles.drawerSummaryBottom}>
                      {trialMode ? 'No charge today · Cancel anytime' : 'Pay immediately · Cancel anytime'}
                    </Text>
                  </View>
                  {plan === 'annual' ? (
                    <View style={styles.savingsPill}>
                      <MaterialIcons name="savings" size={11} color="#000" />
                      <Text style={styles.savingsPillText}>SAVE 37%</Text>
                    </View>
                  ) : null}
                </View>

                {/* Primary CTA */}
                <View style={styles.ctaShadowMount}>
                  <Animated.View style={[styles.ctaGlow, { opacity: ctaGlow }]} />
                  <Pressable
                    onPress={handlePurchase}
                    disabled={purchasing}
                    style={({ pressed }) => [
                      styles.cta,
                      purchasing && { opacity: 0.6 },
                      pressed && { transform: [{ scale: 0.985 }] },
                    ]}
                  >
                    <Animated.View
                      style={[styles.ctaSheen, { transform: [{ translateX: shimmerTx }] }]}
                      pointerEvents="none"
                    >
                      <LinearGradient
                        colors={['rgba(212,181,126,0)', GOLD_SOFT, 'rgba(212,181,126,0)']}
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 1, y: 0.5 }}
                        style={StyleSheet.absoluteFill}
                      />
                    </Animated.View>

                    {purchasing ? (
                      <ActivityIndicator color="#000" />
                    ) : (
                      <>
                        <Text style={styles.ctaText}>
                          {trialMode ? 'Start Free Trial' : 'Subscribe Now'}
                        </Text>
                        <View style={styles.ctaIcon}>
                          <MaterialIcons name="arrow-forward" size={14} color={GOLD} />
                        </View>
                      </>
                    )}
                  </Pressable>
                </View>

                {/* Footer row */}
                <View style={styles.drawerFooter}>
                  <Pressable onPress={handleContinueFree} hitSlop={10} disabled={purchasing}>
                    <Text style={styles.footerLink}>Continue Free</Text>
                  </Pressable>
                  <View style={styles.footerDot} />
                  <Pressable onPress={() => setPaywallVisible(true)} hitSlop={10}>
                    <Text style={styles.footerLink}>Compare plans</Text>
                  </Pressable>
                  <View style={styles.footerDot} />
                  <Pressable onPress={openTerms} hitSlop={8}>
                    <Text style={styles.footerLink}>Terms</Text>
                  </Pressable>
                </View>
              </View>
            </SafeAreaView>
          </Animated.View>
        </SafeAreaView>

        <Paywall
          visible={paywallVisible}
          onClose={async () => {
            setPaywallVisible(false);
            const info = await SubscriptionService.getCustomerInfo();
            if (SubscriptionService.isPro(info)) {
              await markOnboardingShown();
              onComplete();
            }
          }}
        />
      </View>
    </Modal>
  );
}

// ============ STYLES ============

const ORB_SIZE = 110;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  safe: { flex: 1 },

  // TOP BAR
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: Platform.OS === 'ios' ? 6 : 14,
    paddingBottom: 4,
  },
  brandLockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandLogo: { width: 20, height: 20 },
  brand: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 4,
  },
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD_LINE,
  },
  proBadgeText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: GOLD,
    letterSpacing: 1.6,
  },

  scroll: {
    paddingHorizontal: 22,
    paddingTop: 6,
  },

  // ============ HERO ============
  hero: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 22,
  },
  orbStage: {
    position: 'absolute',
    top: 8,
    width: ORB_SIZE * 2.4,
    height: ORB_SIZE * 2.4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  haloOuter: {
    position: 'absolute',
    width: ORB_SIZE * 2.4,
    height: ORB_SIZE * 2.4,
    borderRadius: ORB_SIZE * 1.2,
    backgroundColor: 'rgba(212,181,126,0.07)',
  },
  haloInner: {
    position: 'absolute',
    width: ORB_SIZE * 1.6,
    height: ORB_SIZE * 1.6,
    borderRadius: ORB_SIZE * 0.8,
    backgroundColor: 'rgba(212,181,126,0.12)',
  },
  logoOrb: {
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
    padding: 5,
    borderWidth: 1,
    borderColor: GOLD_LINE,
    shadowColor: GOLD,
    shadowOpacity: 0.5,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 10 },
    elevation: 18,
  },
  logoOrbInner: {
    flex: 1,
    borderRadius: (ORB_SIZE - 10) / 2,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: {
    width: ORB_SIZE - 28,
    height: ORB_SIZE - 28,
  },
  logoSheen: {
    position: 'absolute',
    top: 4,
    left: 18,
    width: 50, height: 12,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
    opacity: 0.65,
    transform: [{ rotate: '-22deg' }],
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.6,
    lineHeight: 34,
    marginTop: 22,
  },
  heroTitleAccent: {
    color: GOLD,
    fontWeight: '900',
  },
  heroSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 10,
    paddingHorizontal: 8,
  },

  // ============ MODE TOGGLE ============
  modeToggle: {
    flexDirection: 'row',
    alignSelf: 'center',
    padding: 4,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 16,
    gap: 4,
  },
  modePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  modePillActive: {
    backgroundColor: '#FFFFFF',
  },
  modePillText: {
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 1.4,
    color: 'rgba(255,255,255,0.5)',
  },
  modePillTextActive: {
    color: '#000',
  },

  // ============ PLAN CARDS ============
  planRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  planCard: {
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderWidth: 1.4,
    borderColor: 'rgba(255,255,255,0.08)',
    minHeight: 122,
    position: 'relative',
  },
  planCardActive: {
    borderColor: GOLD_LINE,
    backgroundColor: 'rgba(212,181,126,0.05)',
    shadowColor: GOLD,
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  bestBadge: {
    position: 'absolute',
    top: -8, alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: GOLD,
    paddingHorizontal: 9, paddingVertical: 3,
    borderRadius: 8,
  },
  bestBadgeText: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#000',
    letterSpacing: 1,
  },
  planLabel: {
    fontSize: 9.5,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 2,
    marginTop: 4,
    marginBottom: 10,
  },
  planLabelActive: { color: GOLD },
  planPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  planPrice: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  planPeriod: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
  },
  planFootnote: {
    fontSize: 10.5,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    marginTop: 8,
  },
  radio: {
    position: 'absolute',
    top: 12, right: 12,
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 1.4,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {
    backgroundColor: GOLD,
    borderColor: GOLD,
  },

  // ============ SECTION HEADER ============
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    marginBottom: 12,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: GOLD,
    letterSpacing: 2,
  },

  // ============ BENEFITS ============
  benefitsList: {
    gap: 6,
    marginBottom: 18,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  benefitIconWrap: {
    width: 32, height: 32,
    borderRadius: 10,
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD_LINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitTextWrap: { flex: 1 },
  benefitTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 1,
  },
  benefitSub: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 15,
  },

  // ============ TRUST ============
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  trustText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.2,
  },
  trustDivider: {
    width: 1, height: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },

  // ============ DRAWER ============
  drawerWrap: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    overflow: 'hidden',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  drawerHairline: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 1,
    backgroundColor: GOLD_LINE,
  },
  drawerInner: {
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 12,
  },
  drawerSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  drawerSummaryTop: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  drawerSummaryTopAccent: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  drawerSummaryBottom: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.4)',
    marginTop: 3,
  },
  savingsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: GOLD,
  },
  savingsPillText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#000',
    letterSpacing: 1,
  },

  // CTA
  ctaShadowMount: {
    position: 'relative',
  },
  ctaGlow: {
    position: 'absolute',
    top: 6, left: 18, right: 18, bottom: -2,
    borderRadius: 22,
    backgroundColor: GOLD,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    height: 56,
    borderRadius: 18,
    gap: 10,
    overflow: 'hidden',
    shadowColor: GOLD,
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  ctaSheen: {
    position: 'absolute',
    top: 0, bottom: 0,
    width: 130,
    opacity: 0.7,
  },
  ctaText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#000',
    letterSpacing: 0.2,
  },
  ctaIcon: {
    width: 22, height: 22,
    borderRadius: 11,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },

  drawerFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  footerLink: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    paddingVertical: 4,
  },
  footerDot: {
    width: 3, height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
});
