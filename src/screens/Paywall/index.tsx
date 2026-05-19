import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import * as Haptics from 'expo-haptics';
import { MaterialIcons } from '@expo/vector-icons';
import {
  PurchasesOffering,
  PurchasesPackage,
  PurchasesError,
  PurchasesErrorCode,
  SubscriptionService,
} from '../../services/SubscriptionService';
import { useSubscription } from '../../hooks/useSubscription';
import { FREE_LIMITS } from '../../constants/subscriptionConfig';

const APP_LOGO = require('../../../assets/logo-transparent.png');

// ============ PALETTE ============
const GOLD       = '#D4B57E';
const GOLD_SOFT  = '#E8D5A8';
const GOLD_DIM   = 'rgba(212,181,126,0.18)';
const GOLD_LINE  = 'rgba(212,181,126,0.4)';

interface Props {
  visible: boolean;
  onClose: () => void;
}

type PlanKey = 'annual' | 'monthly';

interface Benefit {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  sub: string;
}

const BENEFITS: Benefit[] = [
  { icon: 'all-inclusive',      title: 'Unlimited everything',  sub: 'No caps on timers, tasks, goals, categories or notes' },
  { icon: 'autorenew',          title: 'Recurring engine',      sub: 'Daily, weekly, monthly and custom rhythms with streaks' },
  { icon: 'cloud-done',         title: 'Cloud backup & sync',   sub: 'Google Drive auto-sync · restore on any device' },
  { icon: 'palette',            title: 'Themes & customisation', sub: 'All presets · custom hue picker · live preview' },
  { icon: 'schedule',           title: 'Custom day & time slots', sub: 'Set when your day starts · per-slot themes' },
  { icon: 'event-busy',         title: 'Leave tracking',        sub: 'Plan non-working days · streak-safe' },
  { icon: 'insights',           title: 'Extended analytics',    sub: 'Streaks, historical reports, deep stats' },
  { icon: 'enhanced-encryption', title: 'PIN-locked folders',   sub: 'Per-folder 4-digit codes for private notes' },
  { icon: 'menu-book',          title: 'Daily diary',           sub: 'Mood, weather, templates and history' },
];

// Numeric free-tier limits render as the number; a limit of 0 means the feature
// is gated entirely on Free, so we show an em dash instead.
const freeCount = (n: number) => (n > 0 ? String(n) : '—');
const freeFlag  = (on: boolean) => (on ? '✓' : '—');

const COMPARISON: Array<{ label: string; free: string; pro: string }> = [
  { label: 'Timers per day',   free: freeCount(FREE_LIMITS.timers),         pro: 'Unlimited' },
  { label: 'Tasks per day',    free: freeCount(FREE_LIMITS.tasksPerDay),    pro: 'Unlimited' },
  { label: 'Subtasks per task', free: freeCount(FREE_LIMITS.subtasksPerTask), pro: 'Unlimited' },
  { label: 'Root goals',       free: freeCount(FREE_LIMITS.rootGoals),      pro: 'Unlimited' },
  { label: 'Tasks per goal',   free: freeCount(FREE_LIMITS.tasksPerGoal),   pro: 'Unlimited' },
  { label: 'Categories',       free: freeCount(FREE_LIMITS.categories),     pro: 'Unlimited' },
  { label: 'Quick messages',   free: freeCount(FREE_LIMITS.quickMessages),  pro: 'Unlimited' },
  { label: 'Notes folders',    free: freeCount(FREE_LIMITS.diaryFolders),   pro: 'Unlimited' },
  { label: 'Notes per folder', free: freeCount(FREE_LIMITS.notesPerFolder), pro: 'Unlimited' },
  { label: 'Recurring tasks',  free: '—',                                   pro: '✓' },
  { label: 'Cloud backup',     free: '—',                                   pro: '✓' },
  { label: 'Daily diary',      free: freeFlag(FREE_LIMITS.diaryEnabled),    pro: '✓' },
  { label: 'Folder PIN locks', free: freeFlag(FREE_LIMITS.folderLockEnabled), pro: '✓' },
  { label: 'Custom themes',    free: '—',                                   pro: '✓' },
];

const FAQS: Array<{ q: string; a: string }> = [
  { q: 'How does the free trial work?', a: 'Start the 7-day free trial and use every Pro feature without paying. You can cancel any time before day 7 and you won\'t be charged.' },
  { q: 'Can I cancel anytime?',          a: 'Yes — cancel from your device subscriptions page. Your Pro features stay active until the current billing period ends.' },
  { q: 'What happens after my trial?',   a: 'Unless you cancel, your selected plan begins automatically at the listed price. We\'ll send a reminder before the trial ends.' },
  { q: 'Is my data safe?',               a: 'All data stays on your device unless you enable Google Drive backup, which uses your private Drive app-data folder.' },
];

export default function Paywall({ visible, onClose }: Props) {
  const { purchase, restore, isPro } = useSubscription();
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [selected, setSelected] = useState<PlanKey>('annual');
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    (async () => {
      const o = await SubscriptionService.getOfferings();
      setOffering(o);
    })();

    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    ).start();
  }, [visible, shimmer]);

  const monthlyPkg = offering?.monthly ?? null;
  const annualPkg  = offering?.annual  ?? null;
  const monthlyEq  = annualPkg ? `$${(annualPkg.product.price / 12).toFixed(2)}` : '$2.50';

  const selectedPkg: PurchasesPackage | null = useMemo(() => {
    return selected === 'annual' ? annualPkg : monthlyPkg;
  }, [selected, monthlyPkg, annualPkg]);

  const selectPlan = (next: PlanKey) => {
    if (next === selected) return;
    Haptics.selectionAsync();
    setSelected(next);
  };

  const handleSubscribe = async () => {
    if (!selectedPkg) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPurchasing(true);
    try {
      await purchase(selectedPkg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
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

  const handleRestore = async () => {
    Haptics.selectionAsync();
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

  const openTerms = () => {
    Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/').catch(() => {});
  };

  const handleClose = () => {
    Haptics.selectionAsync();
    onClose();
  };

  const toggleFaq = (i: number) => {
    Haptics.selectionAsync();
    setOpenFaq(openFaq === i ? null : i);
  };

  const shimmerTx = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-180, 220] });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose} statusBarTranslucent>
      <View style={styles.root}>
        <LinearGradient
          colors={['#0E0E10', '#06070A', '#000000']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />

        <SafeAreaView style={styles.safe} edges={['top']}>
          {/* ============ TOP BAR ============ */}
          <View style={styles.topBar}>
            <Pressable onPress={handleClose} style={styles.closeBtn} hitSlop={12}>
              <MaterialIcons name="close" size={20} color="rgba(255,255,255,0.7)" />
            </Pressable>
            <View style={styles.brandLockup}>
              <Image source={APP_LOGO} style={styles.brandLogo} resizeMode="contain" />
              <Text style={styles.brandText}>CHRONOSCAPE</Text>
            </View>
            <View style={{ width: 44 }} />
          </View>

          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            {/* ============ HERO ============ */}
            <View style={styles.hero}>
              <View style={styles.proBadge}>
                <MaterialIcons name="auto-awesome" size={11} color={GOLD} />
                <Text style={styles.proBadgeText}>CHRONOSCAPE PRO</Text>
              </View>
              <Text style={styles.heroTitle}>
                Master your time.{'\n'}
                <Text style={styles.heroTitleAccent}>Without limits.</Text>
              </Text>
              <Text style={styles.heroSubtitle}>
                Unlock every Pro feature with a 7-day free trial. No charge until your trial ends.
              </Text>
            </View>

            {/* ============ PLAN CARDS ============ */}
            <View style={styles.planRow}>
              <PlanCard
                label="MONTHLY"
                price={monthlyPkg?.product.priceString || '$3.99'}
                period="/ month"
                selected={selected === 'monthly'}
                onSelect={() => selectPlan('monthly')}
                sub="Flexible — pay each month"
              />
              <PlanCard
                label="ANNUAL"
                price={annualPkg?.product.priceString || '$29.99'}
                period="/ year"
                selected={selected === 'annual'}
                onSelect={() => selectPlan('annual')}
                badge="BEST VALUE"
                sub={`≈ ${monthlyEq}/mo · Save 37%`}
              />
            </View>

            {/* ============ CTA ============ */}
            <Pressable
              onPress={handleSubscribe}
              disabled={purchasing || !selectedPkg}
              style={({ pressed }) => [
                styles.cta,
                (purchasing || !selectedPkg) && { opacity: 0.55 },
                pressed && { transform: [{ scale: 0.985 }] },
              ]}
            >
              <Animated.View
                style={[styles.ctaShimmer, { transform: [{ translateX: shimmerTx }] }]}
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
                    {isPro ? 'Change Plan' : 'Start 7-Day Free Trial'}
                  </Text>
                  <View style={styles.ctaIcon}>
                    <MaterialIcons name="arrow-forward" size={14} color={GOLD} />
                  </View>
                </>
              )}
            </Pressable>

            {/* ============ TRUST ROW ============ */}
            <View style={styles.trustRow}>
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
            </View>

            {/* ============ BENEFITS LIST ============ */}
            <SectionHeader title="WHAT YOU UNLOCK" />
            <View style={styles.benefitsList}>
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
            </View>

            {/* ============ COMPARISON TABLE ============ */}
            <SectionHeader title="FREE VS PRO" />
            <View style={styles.compareCard}>
              <View style={styles.compareHeader}>
                <View style={{ flex: 1.4 }} />
                <Text style={[styles.compareColHeader, { color: 'rgba(255,255,255,0.55)' }]}>FREE</Text>
                <Text style={[styles.compareColHeader, { color: GOLD }]}>PRO</Text>
              </View>
              {COMPARISON.map((row, i) => (
                <View
                  key={row.label}
                  style={[styles.compareRow, i === COMPARISON.length - 1 && { borderBottomWidth: 0 }]}
                >
                  <Text style={styles.compareLabel}>{row.label}</Text>
                  <Text style={styles.compareFree}>{row.free}</Text>
                  <Text style={styles.comparePro}>{row.pro}</Text>
                </View>
              ))}
            </View>

            {/* ============ FAQ ============ */}
            <SectionHeader title="FREQUENTLY ASKED" />
            <View style={styles.faqList}>
              {FAQS.map((f, i) => (
                <Pressable
                  key={f.q}
                  onPress={() => toggleFaq(i)}
                  style={styles.faqItem}
                >
                  <View style={styles.faqQuestionRow}>
                    <Text style={styles.faqQuestion}>{f.q}</Text>
                    <MaterialIcons
                      name={openFaq === i ? 'expand-less' : 'expand-more'}
                      size={20}
                      color={GOLD}
                    />
                  </View>
                  {openFaq === i ? (
                    <Text style={styles.faqAnswer}>{f.a}</Text>
                  ) : null}
                </Pressable>
              ))}
            </View>

            {/* ============ FOOTER LINKS ============ */}
            <View style={styles.footerLinks}>
              <Pressable onPress={handleRestore} hitSlop={8} disabled={restoring}>
                <Text style={styles.footerLink}>
                  {restoring ? 'Restoring…' : 'Restore Purchases'}
                </Text>
              </Pressable>
              <View style={styles.footerDot} />
              <Pressable onPress={openTerms} hitSlop={8}>
                <Text style={styles.footerLink}>Terms of Use</Text>
              </Pressable>
              <View style={styles.footerDot} />
              <Pressable onPress={openTerms} hitSlop={8}>
                <Text style={styles.footerLink}>Privacy</Text>
              </Pressable>
            </View>

            <Text style={styles.smallPrint}>
              Subscriptions auto-renew until cancelled. Manage from your device subscriptions page.
            </Text>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

// ============ PLAN CARD ============
function PlanCard({
  label, price, period, sub, badge, selected, onSelect,
}: {
  label: string;
  price: string;
  period: string;
  sub: string;
  badge?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [
        styles.planCard,
        selected && styles.planCardSelected,
        pressed && { opacity: 0.92 },
      ]}
    >
      {badge ? (
        <View style={styles.planBadge}>
          <MaterialIcons name="star" size={9} color="#000" />
          <Text style={styles.planBadgeText}>{badge}</Text>
        </View>
      ) : null}
      <Text style={[styles.planLabel, selected && styles.planLabelSelected]}>{label}</Text>
      <View style={styles.planPriceRow}>
        <Text style={styles.planPrice}>{price}</Text>
        <Text style={styles.planPeriod}>{period}</Text>
      </View>
      <Text style={[styles.planSub, selected && styles.planSubSelected]}>{sub}</Text>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <MaterialIcons name="check" size={12} color="#000" /> : null}
      </View>
    </Pressable>
  );
}

// ============ SECTION HEADER ============
function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionLine} />
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionLine} />
    </View>
  );
}

// ============ STYLES ============
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  safe: { flex: 1 },

  // ============ TOP BAR ============
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 4 : 12,
    paddingBottom: 4,
  },
  closeBtn: {
    width: 44, height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  brandLockup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  brandLogo: { width: 18, height: 18 },
  brandText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 3.5,
  },

  scroll: {
    paddingHorizontal: 22,
    paddingBottom: 40,
    paddingTop: 8,
  },

  // ============ HERO ============
  hero: {
    alignItems: 'center',
    paddingTop: 18,
    paddingBottom: 24,
  },
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: GOLD_LINE,
    marginBottom: 18,
  },
  proBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: GOLD,
    letterSpacing: 2,
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.6,
    lineHeight: 36,
  },
  heroTitleAccent: {
    color: GOLD,
    fontWeight: '900',
  },
  heroSubtitle: {
    fontSize: 13.5,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 12,
    paddingHorizontal: 10,
  },

  // ============ PLAN CARDS ============
  planRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  planCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 14,
    borderWidth: 1.4,
    borderColor: 'rgba(255,255,255,0.08)',
    position: 'relative',
    minHeight: 142,
  },
  planCardSelected: {
    borderColor: GOLD_LINE,
    backgroundColor: 'rgba(212,181,126,0.06)',
    shadowColor: GOLD,
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  planBadge: {
    position: 'absolute',
    top: -8, alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: GOLD,
    paddingHorizontal: 9, paddingVertical: 3,
    borderRadius: 8,
  },
  planBadgeText: {
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
  planLabelSelected: { color: GOLD },
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
    fontSize: 10.5,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
  },
  planSub: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    marginTop: 8,
    letterSpacing: 0.1,
  },
  planSubSelected: { color: GOLD_SOFT },
  radio: {
    position: 'absolute',
    top: 12, right: 12,
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 1.4,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    backgroundColor: GOLD,
    borderColor: GOLD,
  },

  // ============ CTA ============
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    height: 56,
    borderRadius: 16,
    gap: 10,
    overflow: 'hidden',
    shadowColor: GOLD,
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
    marginTop: 4,
  },
  ctaShimmer: {
    position: 'absolute',
    top: 0, bottom: 0,
    width: 140,
    opacity: 0.65,
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

  // ============ TRUST ============
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 12,
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

  // ============ SECTION HEADER ============
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 26,
    marginBottom: 14,
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
  benefitsList: { gap: 6 },
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

  // ============ COMPARE TABLE ============
  compareCard: {
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  compareHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  compareColHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  compareLabel: {
    flex: 1.4,
    fontSize: 12.5,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  compareFree: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
  },
  comparePro: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12.5,
    fontWeight: '800',
    color: GOLD_SOFT,
  },

  // ============ FAQ ============
  faqList: { gap: 6 },
  faqItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  faqQuestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  faqQuestion: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  faqAnswer: {
    fontSize: 12.5,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 18,
    marginTop: 8,
  },

  // ============ FOOTER ============
  footerLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 24,
  },
  footerLink: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
    paddingVertical: 4,
  },
  footerDot: {
    width: 3, height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  smallPrint: {
    fontSize: 10.5,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    marginTop: 14,
    paddingHorizontal: 20,
    lineHeight: 15,
  },
});
