import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { MaterialIcons } from '@expo/vector-icons';
import {
  FEATURE_GATE_COPY,
  FREE_LIMITS,
  GatedFeature,
} from '../../constants/subscriptionConfig';
import {
  PurchasesError,
  PurchasesErrorCode,
  PurchasesOffering,
  SubscriptionService,
} from '../../services/SubscriptionService';
import { useSubscription } from '../../hooks/useSubscription';

// ============ PREMIUM PALETTE ============
const GOLD       = '#D4B57E';    // champagne gold accent
const GOLD_SOFT  = '#E8D5A8';    // lighter highlight
const GOLD_DIM   = 'rgba(212,181,126,0.18)';  // tinted fills
const GOLD_LINE  = 'rgba(212,181,126,0.4)';   // tinted borders

interface Props {
  visible:     boolean;
  feature:     GatedFeature;
  onClose:     () => void;
  onViewPlans: () => void;
}

interface Benefit {
  icon:  keyof typeof MaterialIcons.glyphMap;
  title: string;
  sub:   string;
}

interface FeatureVisual {
  icon:        keyof typeof MaterialIcons.glyphMap;
  limitNote:   string | null;
  limitFilled: number;       // 0–1 progress of usage bar
  benefits:    Benefit[];
}

const FEATURE_VISUAL: Record<GatedFeature, FeatureVisual> = {
  timer: {
    icon: 'timer', limitNote: `${FREE_LIMITS.timers} of ${FREE_LIMITS.timers} daily timers used`, limitFilled: 1,
    benefits: [
      { icon: 'all-inclusive', title: 'Unlimited timers',  sub: 'No cap on active or scheduled timers' },
      { icon: 'autorenew',     title: 'Recurring schedules', sub: 'Daily, weekly and custom rhythms' },
      { icon: 'cloud-done',    title: 'Auto cloud backup',   sub: 'Restore on any device, anytime' },
    ],
  },
  task: {
    icon: 'task-alt', limitNote: `${FREE_LIMITS.tasksPerDay} of ${FREE_LIMITS.tasksPerDay} daily tasks used`, limitFilled: 1,
    benefits: [
      { icon: 'all-inclusive', title: 'Unlimited tasks',  sub: 'Plan as much as you want each day' },
      { icon: 'autorenew',     title: 'Recurring tasks',  sub: 'All repeat modes with streak tracking' },
      { icon: 'insights',      title: 'Streaks & analytics', sub: 'Deeper history and progress reports' },
    ],
  },
  goal: {
    icon: 'flag', limitNote: `${FREE_LIMITS.rootGoals} of ${FREE_LIMITS.rootGoals} root goals used`, limitFilled: 1,
    benefits: [
      { icon: 'account-tree', title: 'Nested goals',     sub: 'Break big goals into sub-goals' },
      { icon: 'trending-up',  title: 'Progress rollup',  sub: 'Aggregates up the hierarchy automatically' },
      { icon: 'emoji-events', title: 'Long-term streaks', sub: 'Year-over-year goal tracking' },
    ],
  },
  recurring: {
    icon: 'autorenew', limitNote: null, limitFilled: 0,
    benefits: [
      { icon: 'event-repeat', title: 'All repeat modes',   sub: 'Daily, weekly, monthly, custom days' },
      { icon: 'sync',         title: 'Cross-date sync',    sub: 'Edit once, reflect across instances' },
      { icon: 'local-fire-department', title: 'Streak engine', sub: 'Auto-skip leaves and pause days' },
    ],
  },
  backup: {
    icon: 'cloud-done', limitNote: null, limitFilled: 0,
    benefits: [
      { icon: 'cloud-upload', title: 'Auto sync',        sub: 'Encrypted Google Drive backup' },
      { icon: 'devices',      title: 'Cross-device',     sub: 'Pick up where you left off' },
      { icon: 'restore',      title: 'Restore anywhere', sub: 'One-tap recovery on a new phone' },
    ],
  },
  category: {
    icon: 'category', limitNote: `${FREE_LIMITS.categories} of ${FREE_LIMITS.categories} categories used`, limitFilled: 1,
    benefits: [
      { icon: 'all-inclusive', title: 'Unlimited categories', sub: 'Organise as deeply as you need' },
      { icon: 'apps',          title: 'Custom icons',         sub: 'Pick from the full MaterialIcons set' },
      { icon: 'palette',       title: 'Custom colors',        sub: 'Hex-precision tinting per category' },
    ],
  },
  theme: {
    icon: 'palette', limitNote: null, limitFilled: 0,
    benefits: [
      { icon: 'view-carousel', title: 'All theme presets', sub: 'Premium curated colour sets' },
      { icon: 'colorize',      title: 'Custom hue picker', sub: 'Filler, button & text — all custom' },
      { icon: 'preview',       title: 'Live preview',      sub: 'See changes before applying' },
    ],
  },
  dailyStart: {
    icon: 'schedule', limitNote: null, limitFilled: 0,
    benefits: [
      { icon: 'schedule',  title: 'Custom day start', sub: 'Set when your logical day begins' },
      { icon: 'view-day',  title: 'Time-slot themes', sub: 'Different colours by part of day' },
      { icon: 'auto-mode', title: 'Smart rollover',   sub: 'Midnight tasks stay on the right day' },
    ],
  },
  leave: {
    icon: 'event-busy', limitNote: null, limitFilled: 0,
    benefits: [
      { icon: 'event-busy', title: 'Plan leaves',       sub: 'Mark non-working days in advance' },
      { icon: 'shield',     title: 'Streak protection', sub: 'Leaves never break your streak' },
      { icon: 'calendar-month', title: 'Year overview', sub: 'See all planned days at a glance' },
    ],
  },
  timeSlots: {
    icon: 'today', limitNote: null, limitFilled: 0,
    benefits: [
      { icon: 'color-lens', title: 'Time-of-day colors', sub: 'Set background per part of day' },
      { icon: 'tune',       title: 'Custom hour slots',  sub: 'Define your own time ranges' },
      { icon: 'event',      title: 'Per-day themes',     sub: 'Different palettes for different days' },
    ],
  },
  quickMessage: {
    icon: 'chat', limitNote: `${FREE_LIMITS.quickMessages} of ${FREE_LIMITS.quickMessages} quick messages used`, limitFilled: 1,
    benefits: [
      { icon: 'all-inclusive', title: 'Unlimited messages', sub: 'Save every common task phrase' },
      { icon: 'palette',       title: 'Custom colors',      sub: 'Visually group by colour' },
      { icon: 'drag-handle',   title: 'Drag to reorder',    sub: 'Arrange to match your workflow' },
    ],
  },
  folder: {
    icon: 'folder', limitNote: `${FREE_LIMITS.diaryFolders} of ${FREE_LIMITS.diaryFolders} folders used`, limitFilled: 1,
    benefits: [
      { icon: 'all-inclusive',        title: 'Unlimited folders', sub: 'Organise notes however you like' },
      { icon: 'enhanced-encryption',  title: 'PIN locks',         sub: '4-digit code per folder' },
      { icon: 'palette',              title: 'Custom colors',     sub: 'Visual identity per folder' },
    ],
  },
  note: {
    icon: 'description', limitNote: `${FREE_LIMITS.notesPerFolder} of ${FREE_LIMITS.notesPerFolder} notes used in this folder`, limitFilled: 1,
    benefits: [
      { icon: 'all-inclusive', title: 'Unlimited notes',   sub: 'No per-folder cap' },
      { icon: 'edit-note',     title: 'Rich text editor',  sub: 'Format, lists, images, colours' },
      { icon: 'search',        title: 'Full-text search',  sub: 'Find any note across folders' },
    ],
  },
  folderLock: {
    icon: 'enhanced-encryption', limitNote: null, limitFilled: 0,
    benefits: [
      { icon: 'pin',     title: '4-digit PIN',        sub: 'Per-folder code protection' },
      { icon: 'shield',  title: 'Privacy guard',      sub: 'Hide sensitive notes from preview' },
      { icon: 'autorenew', title: 'Optional re-prompt', sub: 'Ask on every open or just once' },
    ],
  },
  diary: {
    icon: 'menu-book', limitNote: null, limitFilled: 0,
    benefits: [
      { icon: 'today',       title: 'Daily entries', sub: 'Mood, weather and reflections' },
      { icon: 'description', title: 'Templates',     sub: 'Quick-start prompts for every day' },
      { icon: 'auto-stories', title: 'History view', sub: 'Scroll back through past days' },
    ],
  },
  subtask: {
    icon: 'check-circle-outline',
    limitNote: `${FREE_LIMITS.subtasksPerTask} of ${FREE_LIMITS.subtasksPerTask} subtasks used`, limitFilled: 1,
    benefits: [
      { icon: 'all-inclusive', title: 'Unlimited subtasks', sub: 'Break tasks down without caps' },
      { icon: 'schedule',      title: 'Per-subtask times',  sub: 'Plan precise start times & durations' },
      { icon: 'sync',          title: 'Sync across dates',  sub: 'Apply stage changes to all instances' },
    ],
  },
  taskInGoal: {
    icon: 'flag',
    limitNote: `${FREE_LIMITS.tasksPerGoal} of ${FREE_LIMITS.tasksPerGoal} tasks per goal used`, limitFilled: 1,
    benefits: [
      { icon: 'all-inclusive', title: 'Unlimited tasks per goal', sub: 'Link as many tasks as you need' },
      { icon: 'trending-up',   title: 'Aggregate progress',       sub: 'Goal progress rolls up automatically' },
      { icon: 'account-tree',  title: 'Nested goal trees',        sub: 'Combine with sub-goals freely' },
    ],
  },
  liveView: {
    icon: 'sensors', limitNote: null, limitFilled: 0,
    benefits: [
      { icon: 'visibility', title: 'Live timeline focus', sub: 'Real-time view of in-progress work' },
      { icon: 'zoom-in',    title: 'Zoomable timeline',   sub: 'Adjust granularity on the fly' },
      { icon: 'view-day',   title: 'Multiple view modes', sub: 'Task, merged or category views' },
    ],
  },
  liveDetails: {
    icon: 'unfold-more', limitNote: null, limitFilled: 0,
    benefits: [
      { icon: 'description', title: 'Expanded details', sub: 'Full context inside live view' },
      { icon: 'list-alt',    title: 'Stages panel',     sub: 'Inspect all subtasks at a glance' },
      { icon: 'chat',        title: 'Comments tab',     sub: 'Review notes without leaving live' },
    ],
  },
  liveSubtaskAction: {
    icon: 'touch-app', limitNote: null, limitFilled: 0,
    benefits: [
      { icon: 'check-circle', title: 'Status changes', sub: 'Mark subtasks done from live view' },
      { icon: 'flash-on',     title: 'One-tap actions', sub: 'No need to leave the focus view' },
      { icon: 'sync',         title: 'Live sync',       sub: 'Updates reflect everywhere instantly' },
    ],
  },
  extendTime: {
    icon: 'add-circle-outline', limitNote: null, limitFilled: 0,
    benefits: [
      { icon: 'more-time', title: 'Borrow time',         sub: 'Add +1m / +5m / +10m on the fly' },
      { icon: 'pause',     title: 'No-break extensions', sub: 'Keep flow going without resetting' },
      { icon: 'history',   title: 'Borrow log',          sub: 'Track how much you extended' },
    ],
  },
  extendSubtaskDuration: {
    icon: 'more-time', limitNote: null, limitFilled: 0,
    benefits: [
      { icon: 'add-circle-outline', title: 'Extend any subtask', sub: 'Add minutes to a stage on the fly' },
      { icon: 'schedule',           title: 'Flexible planning',  sub: 'Adjust durations without reworking the day' },
      { icon: 'sync',               title: 'Stays in sync',      sub: 'Timeline updates everywhere instantly' },
    ],
  },
};

export default function FeatureLockedModal({ visible, feature, onClose, onViewPlans }: Props) {
  const { purchase } = useSubscription();
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const { width: winW, height: winH } = useWindowDimensions();
  const isLandscape = winW > winH;

  const slide   = useRef(new Animated.Value(0)).current;
  const fade    = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      (async () => {
        const o = await SubscriptionService.getOfferings();
        setOffering(o);
      })();
      Animated.parallel([
        Animated.spring(slide, { toValue: 1, useNativeDriver: true, friction: 11, tension: 80 }),
        Animated.timing(fade,  { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(shimmer, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(shimmer, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ])
      ).start();
    } else {
      slide.setValue(0);
      fade.setValue(0);
      shimmer.setValue(0);
    }
  }, [visible, slide, fade, shimmer]);

  const copy = FEATURE_GATE_COPY[feature];
  const visual = FEATURE_VISUAL[feature];
  const annualPrice  = offering?.annual?.product.priceString  || '$29.99';
  const monthlyPrice = offering?.monthly?.product.priceString || '$3.99';
  const monthlyEq    = offering?.annual ? `$${(offering.annual.product.price / 12).toFixed(2)}/mo` : '$2.50/mo';

  // In landscape we center the sheet (entrance is a soft scale+fade); in
  // portrait it slides up from the bottom. Same animated values, different
  // visual mapping.
  const translateY  = slide.interpolate({ inputRange: [0, 1], outputRange: isLandscape ? [16, 0] : [600, 0] });
  const scale       = slide.interpolate({ inputRange: [0, 1], outputRange: isLandscape ? [0.96, 1] : [1, 1] });
  const shimmerTx   = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-180, 180] });

  const handleDismiss = () => {
    Haptics.selectionAsync();
    onClose();
  };

  const handleStartTrial = async () => {
    if (purchasing) return;
    const annual = offering?.annual;
    if (!annual) {
      Alert.alert('Unavailable', 'Subscription is temporarily unavailable. Please try again later.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPurchasing(true);
    try {
      await purchase(annual);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch (e) {
      if (e instanceof PurchasesError && e.code === PurchasesErrorCode.PURCHASE_CANCELLED) {
        // silent
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Trial Failed', 'Could not start trial. Please try again.');
      }
    } finally {
      setPurchasing(false);
    }
  };

  const handleViewPlans = () => {
    Haptics.selectionAsync();
    onClose();
    setTimeout(onViewPlans, 200);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleDismiss}
      statusBarTranslucent
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
    >
      <View style={[styles.root, isLandscape && styles.rootLandscape]}>
        <TouchableWithoutFeedback onPress={handleDismiss}>
          <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: fade }]}>
            <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.dimLayer} />
          </Animated.View>
        </TouchableWithoutFeedback>

        <Animated.View
          style={[
            styles.sheet,
            isLandscape && styles.sheetLandscape,
            { transform: [{ translateY }, { scale }] },
          ]}
        >
          {/* Gold top hairline */}
          <View style={styles.topHairline} />

          {/* Drag handle — portrait only */}
          {!isLandscape ? (
            <View style={styles.handleRow}>
              <View style={styles.dragHandle} />
            </View>
          ) : null}

          {(() => {
            // Section A: identity + sell (header, body, usage, benefits).
            const sellSection = (
              <>
                <View style={styles.headerRow}>
                  <LinearGradient
                    colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.iconSquare}
                  >
                    <MaterialIcons name={visual.icon} size={22} color="#FFFFFF" />
                    <View style={styles.iconLockBadge}>
                      <MaterialIcons name="lock" size={9} color="#000" />
                    </View>
                  </LinearGradient>
                  <View style={styles.headerTextWrap}>
                    <View style={styles.eyebrowRow}>
                      <MaterialIcons name="auto-awesome" size={10} color={GOLD} />
                      <Text style={styles.eyebrow}>PRO FEATURE</Text>
                    </View>
                    <Text style={styles.title}>{copy.title}</Text>
                  </View>
                </View>

                <Text style={styles.body}>{copy.body}</Text>

                {visual.limitNote ? (
                  <View style={styles.usageWrap}>
                    <View style={styles.usageBarTrack}>
                      <View style={[styles.usageBarFill, { width: `${visual.limitFilled * 100}%` }]} />
                    </View>
                    <Text style={styles.usageNote}>{visual.limitNote}</Text>
                  </View>
                ) : null}

                <View style={styles.benefitsSection}>
                  <View style={styles.sectionHeader}>
                    <View style={styles.sectionHeaderLine} />
                    <Text style={styles.sectionHeaderText}>WHAT YOU UNLOCK</Text>
                    <View style={styles.sectionHeaderLine} />
                  </View>

                  {visual.benefits.map((b) => (
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
              </>
            );

            // Section B: convert (pricing, CTA, trust, secondary, dismiss).
            const convertSection = (
              <>
                <View style={styles.pricingCard}>
                  <View style={styles.pricingHeaderRow}>
                    <Text style={styles.pricingHeaderText}>PRO PLAN</Text>
                    <View style={styles.bestPill}>
                      <MaterialIcons name="star" size={9} color="#000" />
                      <Text style={styles.bestPillText}>BEST VALUE</Text>
                    </View>
                  </View>
                  <View style={styles.pricingMainRow}>
                    <Text style={styles.pricingAnnual}>{annualPrice}</Text>
                    <Text style={styles.pricingPer}>/year</Text>
                  </View>
                  <View style={styles.pricingSubRow}>
                    <Text style={styles.pricingMonthlyEq}>≈ {monthlyEq}</Text>
                    <View style={styles.pricingDot} />
                    <Text style={styles.pricingMonthly}>or {monthlyPrice}/mo</Text>
                  </View>
                </View>

                <Pressable
                  onPress={handleStartTrial}
                  disabled={purchasing}
                  style={({ pressed }) => [
                    styles.cta,
                    purchasing && { opacity: 0.6 },
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
                      <Text style={styles.ctaText}>Start 7-Day Free Trial</Text>
                      <View style={styles.ctaIcon}>
                        <MaterialIcons name="arrow-forward" size={14} color={GOLD} />
                      </View>
                    </>
                  )}
                </Pressable>

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

                <Pressable
                  onPress={handleViewPlans}
                  disabled={purchasing}
                  style={({ pressed }) => [
                    styles.ctaSecondary,
                    pressed && { backgroundColor: 'rgba(255,255,255,0.07)' },
                  ]}
                >
                  <Text style={styles.ctaSecondaryText}>Compare all plans</Text>
                  <MaterialIcons name="chevron-right" size={16} color="rgba(255,255,255,0.55)" />
                </Pressable>

                <Pressable onPress={handleDismiss} hitSlop={10} style={styles.dismissBtn}>
                  <Text style={styles.dismissText}>Not now</Text>
                </Pressable>
              </>
            );

            // Landscape: side-by-side columns inside a centered wider card.
            // Portrait: vertical bottom-sheet (unchanged).
            if (isLandscape) {
              return (
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={[styles.scroll, styles.scrollLandscape]}
                  bounces={false}
                >
                  <View style={styles.twoColRow}>
                    <View style={styles.leftCol}>{sellSection}</View>
                    <View style={styles.colDivider} />
                    <View style={styles.rightCol}>{convertSection}</View>
                  </View>
                </ScrollView>
              );
            }

            return (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scroll}
                bounces={false}
              >
                {sellSection}
                {convertSection}
              </ScrollView>
            );
          })()}
        </Animated.View>
      </View>
    </Modal>
  );
}

// ============ STYLES — monochrome with gold accent ============

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  rootLandscape: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  dimLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },

  sheet: {
    backgroundColor: '#0A0A0A',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    maxHeight: '88%',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.7,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: -10 },
    elevation: 26,
  },
  // Landscape: centered card with all 4 corners rounded and a wider max so
  // the two-column body has room to breathe on tablets and landscape phones.
  sheetLandscape: {
    width: '94%',
    maxWidth: 820,
    maxHeight: '94%',
    borderRadius: 22,
    borderTopWidth: 1,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  topHairline: {
    position: 'absolute',
    top: 0,
    left: 60, right: 60,
    height: 1,
    backgroundColor: GOLD_LINE,
  },
  handleRow: { alignItems: 'center', paddingVertical: 10 },
  dragHandle: {
    width: 38, height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  scroll: {
    paddingHorizontal: 22,
    paddingTop: 4,
    paddingBottom: 24,
  },
  scrollLandscape: {
    paddingHorizontal: 26,
    paddingTop: 22,
    paddingBottom: 22,
  },
  twoColRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 22,
  },
  leftCol: { flex: 1.05, minWidth: 0 },
  rightCol: { flex: 1, minWidth: 0 },
  colDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  // ============ HEADER ============
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 12,
  },
  iconSquare: {
    width: 48, height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GOLD_LINE,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: GOLD,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  iconLockBadge: {
    position: 'absolute',
    bottom: -2, right: -2,
    width: 18, height: 18,
    borderRadius: 9,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0A0A0A',
  },
  headerTextWrap: { flex: 1 },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  eyebrow: {
    fontSize: 9.5,
    fontWeight: '900',
    color: GOLD,
    letterSpacing: 1.8,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  body: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 19,
    marginBottom: 16,
  },

  // ============ USAGE ============
  usageWrap: {
    marginBottom: 18,
  },
  usageBarTrack: {
    width: '100%',
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    marginBottom: 7,
  },
  usageBarFill: {
    height: '100%',
    backgroundColor: GOLD,
    borderRadius: 3,
  },
  usageNote: {
    fontSize: 10.5,
    fontWeight: '700',
    color: GOLD_SOFT,
    letterSpacing: 0.5,
  },

  // ============ BENEFITS ============
  benefitsSection: {
    marginBottom: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  sectionHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  sectionHeaderText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: GOLD,
    letterSpacing: 2,
  },

  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    marginBottom: 6,
  },
  benefitIconWrap: {
    width: 30, height: 30,
    borderRadius: 9,
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
    color: 'rgba(255,255,255,0.45)',
    lineHeight: 15,
  },

  // ============ PRICING CARD ============
  pricingCard: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(212,181,126,0.06)',
    borderWidth: 1,
    borderColor: GOLD_LINE,
    marginBottom: 12,
  },
  pricingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  pricingHeaderText: {
    fontSize: 10,
    fontWeight: '900',
    color: GOLD,
    letterSpacing: 1.5,
  },
  bestPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: GOLD,
  },
  bestPillText: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#000',
    letterSpacing: 1,
  },
  pricingMainRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
    marginBottom: 4,
  },
  pricingAnnual: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.6,
  },
  pricingPer: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
  },
  pricingSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pricingMonthlyEq: {
    fontSize: 12,
    fontWeight: '800',
    color: GOLD_SOFT,
  },
  pricingDot: {
    width: 3, height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  pricingMonthly: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
  },

  // ============ CTA ============
  cta: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    overflow: 'hidden',
    shadowColor: GOLD,
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  ctaShimmer: {
    position: 'absolute',
    top: 0, bottom: 0,
    width: 130,
    opacity: 0.7,
  },
  ctaText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#000',
    letterSpacing: 0.15,
  },
  ctaIcon: {
    width: 22, height: 22,
    borderRadius: 11,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ============ TRUST ROW ============
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginTop: 10,
    gap: 10,
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  trustText: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.2,
  },
  trustDivider: {
    width: 1,
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },

  // ============ SECONDARY ============
  ctaSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginTop: 4,
  },
  ctaSecondaryText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.75)',
  },
  dismissBtn: {
    alignSelf: 'center',
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  dismissText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.38)',
  },
});
