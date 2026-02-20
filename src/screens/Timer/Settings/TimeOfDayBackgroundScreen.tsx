import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, GestureHandlerRootView } from 'react-native-gesture-handler';
import { MaterialIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import {
  DEFAULT_TIME_OF_DAY_SLOTS,
  DEFAULT_TIME_OF_DAY_BACKGROUND_CONFIG,
  normalizeTimeOfDaySlotConfig,
  normalizeTimeOfDayBackgroundConfig,
  WEEKDAY_LABEL,
  WEEKDAY_ORDER,
  TimeOfDaySlotConfig,
  TimeOfDaySlotConfigList,
  TimeOfDayBackgroundConfig,
  WeekdayKey,
} from '../../../utils/timeOfDaySlots';
import { getLogicalDate, DEFAULT_DAILY_START_MINUTES } from '../../../utils/dailyStartTime';
import { styles as sharedStyles } from './styles';

type SlotDraft = {
  key: TimeOfDaySlotConfig['key'];
  label: string;
  start: string; // "HH:MM"
  end: string;   // "HH:MM" (allow "24:00")
  colorHex: string;
};

const minutesToTime = (m: number) => {
  const mm = Math.max(0, Math.min(1440, Math.floor(m)));
  const hours = Math.floor(mm / 60);
  const mins = mm % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const parseTimeToMinutes = (s: string, allow24 = false) => {
  const trimmed = (s || '').trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (m < 0 || m > 59) return null;
  if (allow24) {
    if (h < 0 || h > 24) return null;
    if (h === 24 && m !== 0) return null;
  } else {
    if (h < 0 || h > 23) return null;
  }
  return h * 60 + m;
};

const isHex = (s: string) => /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test((s || '').trim());

/** Hue/HSV Helpers */
const hsvToHex = (h: number) => {
  const hNorm = h / 360;
  const s = 0.85; // Vibrant
  const v = 0.95; // Bright
  let r, g, b;
  let i = Math.floor(hNorm * 6);
  let f = hNorm * 6 - i;
  let p = v * (1 - s);
  let q = v * (1 - s * f);
  let t = v * (1 - s * (1 - f));
  switch (i % 6) {
    case 0: r = v, g = t, b = p; break;
    case 1: r = q, g = v, b = p; break;
    case 2: r = p, g = v, b = t; break;
    case 3: r = p, g = q, b = v; break;
    case 4: r = t, g = p, b = v; break;
    case 5: r = v, g = p, b = q; break;
    default: r = v, g = t, b = p;
  }
  const toHex = (x: number) => {
    const hex = Math.round(x * 255).toString(16);
    return hex.padStart(2, '0');
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
};

const hexToHue = (hex: string) => {
  if (!isHex(hex)) return 0;
  const cleanHex = hex.trim().replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0;
  if (max !== min) {
    const d = max - min;
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return Math.round(h * 360);
};

/** Returns the WeekdayKey for the current logical day (6am–6am). */
const getCurrentLogicalWeekday = (dailyStartMinutes: number): WeekdayKey => {
  const logical = getLogicalDate(new Date(), dailyStartMinutes);
  const [y, mo, day] = logical.split('-').map(Number);
  const d = new Date(y, mo - 1, day);
  const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const keys: WeekdayKey[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return keys[dayOfWeek];
};

const ITEM_HEIGHT = 44;
const generateNumbers = (max: number) => Array.from({ length: max + 1 }, (_, i) => i);
const HOURS_START_DATA = generateNumbers(23); // 00..23
const HOURS_END_DATA = generateNumbers(24);   // 00..24 (allow 24:00)
const MINUTES_DATA = generateNumbers(59);     // 00..59

const COLOR_SWATCHES = [
  '#0B1520',
  '#102A43',
  '#243B53',
  '#334E68',
  '#486581',
  '#627D98',
  '#829AB1',
  '#BCCCDC',
  '#FFB74D',
  '#4CAF50',
  '#00E5FF',
  '#FF5252',
];

const buildPreviewSegmentsFromDraft = (draft: SlotDraft[]) => {
  const segments: Array<{ key: SlotDraft['key']; leftPct: number; widthPct: number; colorHex: string }> = [];
  const clamp = (n: number) => Math.max(0, Math.min(1440, n));

  for (const s of draft) {
    const start = clamp(parseTimeToMinutes(s.start, false) ?? 0);
    const end = clamp(parseTimeToMinutes(s.end, true) ?? 0);
    const colorHex = isHex(s.colorHex) ? s.colorHex.trim() : '#000000';

    if (start < end) {
      segments.push({
        key: s.key,
        leftPct: (start / 1440) * 100,
        widthPct: ((end - start) / 1440) * 100,
        colorHex,
      });
    } else if (start > end) {
      // Cross-midnight: [0..end) and [start..1440)
      if (end > 0) {
        segments.push({
          key: s.key,
          leftPct: 0,
          widthPct: (end / 1440) * 100,
          colorHex,
        });
      }
      if (start < 1440) {
        segments.push({
          key: s.key,
          leftPct: (start / 1440) * 100,
          widthPct: ((1440 - start) / 1440) * 100,
          colorHex,
        });
      }
    }
  }

  return segments;
};

// Wheel Picker Component (same behavior as AddSubtaskModal)
const WheelPicker = ({ data, value, onChange }: { data: number[]; value: number; onChange: (v: number) => void }) => {
  const scrollRef = React.useRef<any>(null);
  const lastIndex = React.useRef(value);

  React.useEffect(() => {
    const idx = data.indexOf(value);
    if (idx >= 0) {
      const timer = setTimeout(() => {
        scrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: false });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [value, data]);

  const handleScroll = React.useCallback((e: NativeSyntheticEvent<any>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(idx, data.length - 1));
    if (clamped !== lastIndex.current) {
      lastIndex.current = clamped;
      Haptics.selectionAsync();
    }
  }, [data.length]);

  const handleEnd = React.useCallback((e: NativeSyntheticEvent<any>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(idx, data.length - 1));
    onChange(data[clamped]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [data, onChange]);

  return (
    <View style={pickerStyles.container}>
      <LinearGradient colors={['#000000', 'transparent']} style={pickerStyles.fadeTop} pointerEvents="none" />
      <LinearGradient colors={['transparent', '#000000']} style={pickerStyles.fadeBottom} pointerEvents="none" />
      <View style={pickerStyles.highlight} pointerEvents="none" />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate={0.92}
        bounces={true}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        onMomentumScrollEnd={handleEnd}
        onScrollEndDrag={(e) => { if (e.nativeEvent.velocity?.y === 0) handleEnd(e); }}
        contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
        nestedScrollEnabled={true}
        canCancelContentTouches={false}
      >
        {data.map((item) => (
          <View key={item} style={pickerStyles.item}>
            <Text style={pickerStyles.text}>{item.toString().padStart(2, '0')}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

export default function TimeOfDayBackgroundScreen({
  config,
  dailyStartMinutes = DEFAULT_DAILY_START_MINUTES,
  onSave,
  onBack,
}: {
  config: TimeOfDayBackgroundConfig;
  dailyStartMinutes?: number;
  onSave: (config: TimeOfDayBackgroundConfig) => void;
  onBack: () => void;
}) {
  const initialDraftByDay = useMemo<Record<WeekdayKey, SlotDraft[]>>(() => {
    const normalizedCfg = normalizeTimeOfDayBackgroundConfig(config ?? DEFAULT_TIME_OF_DAY_BACKGROUND_CONFIG);
    const out = {} as Record<WeekdayKey, SlotDraft[]>;
    for (const day of WEEKDAY_ORDER) {
      const normalizedSlots = normalizeTimeOfDaySlotConfig(normalizedCfg.byDay[day]);
      out[day] = normalizedSlots.map(s => ({
        key: s.key,
        label: s.label,
        start: minutesToTime(s.startMinute),
        end: minutesToTime(s.endMinute),
        colorHex: s.colorHex,
      }));
    }
    return out;
  }, [config]);

  const [activeDay, setActiveDay] = useState<WeekdayKey>(() => getCurrentLogicalWeekday(dailyStartMinutes));
  const [draftByDay, setDraftByDay] = useState<Record<WeekdayKey, SlotDraft[]>>(initialDraftByDay);
  const [activeKey, setActiveKey] = useState<SlotDraft['key']>('morning');
  const [timePicker, setTimePicker] = useState<{
    visible: boolean;
    slotKey: SlotDraft['key'] | null;
    field: 'start' | 'end';
    hours: number;
    minutes: number;
  }>({ visible: false, slotKey: null, field: 'start', hours: 0, minutes: 0 });
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const update = (key: SlotDraft['key'], patch: Partial<SlotDraft>) => {
    setDraftByDay(prev => ({
      ...prev,
      [activeDay]: prev[activeDay].map(d => (d.key === key ? { ...d, ...patch } : d)),
    }));
  };

  const handleReset = () => {
    Alert.alert(
      'Reset to Defaults',
      'Reset time-of-day background slots to the default values?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            const normalized = normalizeTimeOfDaySlotConfig(DEFAULT_TIME_OF_DAY_SLOTS);
            setDraftByDay(prev => ({
              ...prev,
              [activeDay]: normalized.map(s => ({
                key: s.key,
                label: s.label,
                start: minutesToTime(s.startMinute),
                end: minutesToTime(s.endMinute),
                colorHex: s.colorHex,
              })),
            }));
          },
        },
      ]
    );
  };

  const handleCopyFromDay = (sourceDay: WeekdayKey) => {
    if (sourceDay === activeDay) return;
    setDraftByDay(prev => ({
      ...prev,
      [activeDay]: prev[sourceDay].map(s => ({
        key: s.key,
        label: s.label,
        start: s.start,
        end: s.end,
        colorHex: s.colorHex,
      })),
    }));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const showCopyFromDayPicker = () => {
    const otherDays = WEEKDAY_ORDER.filter(d => d !== activeDay);
    Alert.alert(
      'Copy from day',
      `Copy slot settings from another day to ${WEEKDAY_LABEL[activeDay]}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        ...otherDays.map(day => ({
          text: WEEKDAY_LABEL[day],
          onPress: () => handleCopyFromDay(day),
        })),
      ]
    );
  };

  const handleSave = () => {
    const byDay = {} as Record<WeekdayKey, TimeOfDaySlotConfigList>;

    for (const day of WEEKDAY_ORDER) {
      const next: TimeOfDaySlotConfigList = [];
      for (const s of draftByDay[day]) {
        if (!s.label.trim()) {
          Alert.alert('Invalid label', `Please enter a label for "${s.key}" (${WEEKDAY_LABEL[day]}).`);
          return;
        }
        if (!isHex(s.colorHex)) {
          Alert.alert('Invalid color', `Color for "${s.key}" (${WEEKDAY_LABEL[day]}) must be a hex value like #123ABC.`);
          return;
        }

        const startMinute = parseTimeToMinutes(s.start, false);
        const endMinute = parseTimeToMinutes(s.end, true);
        if (startMinute == null) {
          Alert.alert('Invalid start time', `Start time for "${s.key}" (${WEEKDAY_LABEL[day]}) must be HH:MM (00:00–23:59).`);
          return;
        }
        if (endMinute == null || endMinute > 1440) {
          Alert.alert('Invalid end time', `End time for "${s.key}" (${WEEKDAY_LABEL[day]}) must be HH:MM (00:00–24:00).`);
          return;
        }

        next.push({
          key: s.key,
          label: s.label.trim(),
          startMinute,
          endMinute,
          colorHex: s.colorHex.trim(),
        });
      }
      byDay[day] = normalizeTimeOfDaySlotConfig(next);
    }

    onSave(normalizeTimeOfDayBackgroundConfig({ byDay }));
    onBack();
  };

  const renderColorSlider = (s: SlotDraft, compact?: boolean) => {
    const currentHue = hexToHue(s.colorHex);
    return (
      <View style={[sharedStyles.sliderContainer, { marginTop: compact ? 12 : 16 }]}>
        <View style={sharedStyles.sliderTrackBg}>
          <LinearGradient
            colors={['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={sharedStyles.hueGradient}
          />
          <View style={sharedStyles.sliderTrenchShadow} />
        </View>
        <Slider
          style={sharedStyles.hueSlider}
          minimumValue={0}
          maximumValue={360}
          step={1}
          value={currentHue}
          onValueChange={(val) => {
            const hex = hsvToHex(val);
            update(s.key, { colorHex: hex });
          }}
          onSlidingComplete={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          minimumTrackTintColor="transparent"
          maximumTrackTintColor="transparent"
          thumbTintColor="#fff"
        />
      </View>
    );
  };

  const renderSlotRow = (s: SlotDraft, compact?: boolean) => (
    <View style={[sharedStyles.settingsCardBezel, { marginBottom: 12 }]}>
      <View style={sharedStyles.settingsCardTrackUnifiedLarge}>
        <View style={[styles.cardHeader, compact && styles.cardHeaderCompact]}>
          <Text style={[styles.cardTitle, compact && styles.cardTitleCompact]}>{s.label || s.key.toUpperCase()}</Text>
          <View style={[styles.colorSwatch, compact && styles.colorSwatchCompact, { backgroundColor: isHex(s.colorHex) ? s.colorHex : '#000' }]} />
        </View>

        <View style={[styles.fieldRow, compact && styles.fieldRowCompact]}>
          <Text style={[styles.fieldLabel, compact && styles.fieldLabelCompact]}>Label</Text>
          <View style={styles.inputWell}>
            <TextInput
              value={s.label}
              onChangeText={(v) => update(s.key, { label: v })}
              placeholder="e.g. Morning"
              placeholderTextColor="rgba(255,255,255,0.35)"
              style={[styles.input, compact && styles.inputCompact]}
            />
            <View style={sharedStyles.settingsCardInteriorShadowExtraSmall} pointerEvents="none" />
            <View style={sharedStyles.settingsCardTopRimExtraSmall} pointerEvents="none" />
          </View>
        </View>

        <View style={[styles.fieldRow, compact && styles.fieldRowCompact]}>
          <Text style={[styles.fieldLabel, compact && styles.fieldLabelCompact]}>Color</Text>
          <View style={styles.inputWell}>
            <TextInput
              value={s.colorHex}
              onChangeText={(v) => update(s.key, { colorHex: v })}
              placeholder="#102A43"
              placeholderTextColor="rgba(255,255,255,0.35)"
              autoCapitalize="none"
              style={[styles.input, compact && styles.inputCompact]}
            />
            <View style={sharedStyles.settingsCardInteriorShadowExtraSmall} pointerEvents="none" />
            <View style={sharedStyles.settingsCardTopRimExtraSmall} pointerEvents="none" />
          </View>
          {renderColorSlider(s, compact)}
        </View>

        <View style={[styles.timeRow, compact && styles.timeRowCompact]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.fieldLabel, compact && styles.fieldLabelCompact]}>Start</Text>
            <TouchableOpacity
              style={[styles.timePickerButton, compact && styles.timePickerButtonCompact]}
              onPress={() => {
                const startMin = parseTimeToMinutes(s.start, false) ?? 0;
                setTimePicker({
                  visible: true,
                  slotKey: s.key,
                  field: 'start',
                  hours: Math.floor(startMin / 60),
                  minutes: startMin % 60,
                });
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.timePickerValue, compact && styles.timePickerValueCompact]}>{s.start}</Text>
              <MaterialIcons name="keyboard-arrow-down" size={compact ? 14 : 18} color="rgba(255,255,255,0.35)" />
            </TouchableOpacity>
          </View>
          <View style={{ width: compact ? 8 : 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.fieldLabel, compact && styles.fieldLabelCompact]}>End</Text>
            <TouchableOpacity
              style={[styles.timePickerButton, compact && styles.timePickerButtonCompact]}
              onPress={() => {
                const endMin = parseTimeToMinutes(s.end, true) ?? 0;
                setTimePicker({
                  visible: true,
                  slotKey: s.key,
                  field: 'end',
                  hours: Math.floor(endMin / 60),
                  minutes: endMin % 60,
                });
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.timePickerValue, compact && styles.timePickerValueCompact]}>{s.end}</Text>
              <MaterialIcons name="keyboard-arrow-down" size={compact ? 14 : 18} color="rgba(255,255,255,0.35)" />
            </TouchableOpacity>
          </View>
        </View>

        {!compact && (
          <Text style={styles.hint}>
            Tip: set end earlier than start to cross midnight (e.g. Night 20:00 → 06:00).
          </Text>
        )}
        <View style={sharedStyles.settingsCardInteriorShadow} pointerEvents="none" />
        <View style={sharedStyles.settingsCardTopRim} pointerEvents="none" />
      </View>
      <View style={sharedStyles.settingsCardOuterGlow} pointerEvents="none" />
    </View>
  );

  const draft = draftByDay[activeDay];
  const activeSlot = draft.find(d => d.key === activeKey) || draft[0];

  const timeWheelModal = (
    <Modal
      visible={timePicker.visible}
      transparent
      animationType="fade"
      onRequestClose={() => setTimePicker(prev => ({ ...prev, visible: false }))}
      supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setTimePicker(prev => ({ ...prev, visible: false }))}
        >
          <View style={sharedStyles.settingsCardBezel}>
            <Pressable style={[sharedStyles.settingsCardTrack, styles.timeModal]} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.timeModalTitle}>
                {timePicker.field === 'start' ? 'START TIME' : 'END TIME'}
              </Text>

              <View style={styles.timeWheelRow}>
                <View style={styles.timeWheelGroup}>
                  <WheelPicker
                    data={timePicker.field === 'end' ? HOURS_END_DATA : HOURS_START_DATA}
                    value={timePicker.hours}
                    onChange={(h) => {
                      setTimePicker(prev => {
                        const nextH = h;
                        const nextM = (prev.field === 'end' && nextH === 24) ? 0 : prev.minutes;
                        return { ...prev, hours: nextH, minutes: nextM };
                      });
                    }}
                  />
                  <Text style={styles.timeWheelLabel}>HH</Text>
                </View>

                <Text style={styles.colon}>:</Text>

                <View style={styles.timeWheelGroup}>
                  <WheelPicker
                    data={(timePicker.field === 'end' && timePicker.hours === 24) ? [0] : MINUTES_DATA}
                    value={(timePicker.field === 'end' && timePicker.hours === 24) ? 0 : timePicker.minutes}
                    onChange={(m) => setTimePicker(prev => ({ ...prev, minutes: m }))}
                  />
                  <Text style={styles.timeWheelLabel}>MM</Text>
                </View>
              </View>

              <View style={styles.timeModalActions}>
                <TouchableOpacity
                  style={styles.timeModalBtn}
                  onPress={() => setTimePicker(prev => ({ ...prev, visible: false }))}
                  activeOpacity={0.75}
                >
                  <Text style={styles.timeModalBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.timeModalBtnPrimary}
                  onPress={() => {
                    if (!timePicker.slotKey) return;
                    const hh = String(timePicker.hours).padStart(2, '0');
                    const mm = String(timePicker.minutes).padStart(2, '0');
                    update(
                      timePicker.slotKey,
                      timePicker.field === 'start' ? { start: `${hh}:${mm}` } : { end: `${hh}:${mm}` }
                    );
                    setTimePicker(prev => ({ ...prev, visible: false }));
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={styles.timeModalBtnTextPrimary}>Set</Text>
                </TouchableOpacity>
              </View>
              <View style={sharedStyles.settingsCardInteriorShadow} pointerEvents="none" />
              <View style={sharedStyles.settingsCardTopRim} pointerEvents="none" />
            </Pressable>
            <View style={sharedStyles.settingsCardOuterGlow} pointerEvents="none" />
          </View>
        </Pressable>
      </GestureHandlerRootView>
    </Modal >
  );

  if (isLandscape) {
    const previewSegments = buildPreviewSegmentsFromDraft(draft);
    const sidebarWidth = width * 0.38;
    const previewWidth = sidebarWidth - 34;

    return (
      <LinearGradient colors={['#000000', '#000000']} locations={[0, 1]} style={sharedStyles.container}>
        <SafeAreaView style={sharedStyles.safeArea} edges={['left', 'right']}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={sharedStyles.landscapeContainer}
          >
            {/* Left Panel - Phone preview (same as Theme) + day + slots + back */}
            <View style={[sharedStyles.leftSidebarCard, { width: '38%' }]}>
              <Text style={sharedStyles.sidebarSectionTitle}>LIVE PREVIEW</Text>
              <View style={sharedStyles.sidebarPreviewWrapper}>
                <View style={[sharedStyles.phoneFrameContainer, sharedStyles.phoneFrameContainerLandscape]}>
                  <View style={[sharedStyles.phoneFrame, { width: previewWidth + 12 }]}>
                    <View style={sharedStyles.phoneInternalFrame}>
                      <View style={[styles.phonePreviewInner, { width: previewWidth }]}>
                        {previewSegments.map((seg, idx) => (
                          <View
                            key={`${seg.key}-${idx}`}
                            style={[
                              styles.phonePreviewSlotSeg,
                              { left: `${seg.leftPct}%`, width: `${seg.widthPct}%`, backgroundColor: seg.colorHex },
                            ]}
                          />
                        ))}
                        <View style={styles.phonePreviewTicks}>
                          <Text style={styles.phonePreviewTick}>00</Text>
                          <Text style={styles.phonePreviewTick}>06</Text>
                          <Text style={styles.phonePreviewTick}>12</Text>
                          <Text style={styles.phonePreviewTick}>18</Text>
                          <Text style={styles.phonePreviewTick}>24</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                </View>
              </View>

              <Text style={sharedStyles.sidebarSectionTitle}>SLOTS</Text>
              <View style={sharedStyles.sidebarNavSection}>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={[sharedStyles.sidebarButtonsScroll, { flexGrow: 1 }]}
                  alwaysBounceVertical={true}
                >
                  {draft.map((s) => {
                    const isActive = s.key === activeKey;
                    return (
                      <View key={s.key} style={sharedStyles.settingsCardBezelExtraSmall}>
                        <View style={[sharedStyles.settingsCardTrackExtraSmall, isActive && { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
                          <TouchableOpacity
                            style={[styles.landscapeSlotRow, isActive && styles.landscapeSlotRowActive]}
                            onPress={() => {
                              setActiveKey(s.key);
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }}
                            activeOpacity={0.75}
                          >
                            <View style={[styles.landscapeSlotSwatch, { backgroundColor: isHex(s.colorHex) ? s.colorHex : '#000' }]} />
                            <View style={styles.landscapeSlotInfo}>
                              <Text style={[styles.landscapeSlotTitle, isActive && styles.landscapeSlotTitleActive]} numberOfLines={1}>
                                {s.label || s.key.toUpperCase()}
                              </Text>
                              <Text style={styles.landscapeSlotTime} numberOfLines={1}>{s.start} → {s.end}</Text>
                            </View>
                            {isActive ? (
                              <View style={sharedStyles.activeIndicatorSmall} />
                            ) : (
                              <MaterialIcons name="chevron-right" size={14} color="rgba(255,255,255,0.15)" />
                            )}
                          </TouchableOpacity>
                          <View style={sharedStyles.settingsCardInteriorShadowExtraSmall} pointerEvents="none" />
                          <View style={sharedStyles.settingsCardTopRimExtraSmall} pointerEvents="none" />
                        </View>
                        {isActive && <View style={sharedStyles.settingsCardOuterGlowExtraSmall} pointerEvents="none" />}
                      </View>
                    );
                  })}
                </ScrollView>
              </View>

              <TouchableOpacity style={sharedStyles.smallBackButton} onPress={onBack} activeOpacity={0.7}>
                <MaterialIcons name="arrow-back" size={18} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
            </View>

            {/* Right Panel - header + slot editor + day at bottom */}
            <View style={sharedStyles.rightContentCard}>
              <View style={[styles.landscapeRightHeader, { marginBottom: 16 }]}>
                <View style={{ flex: 1 }} />
                <View style={[styles.landscapeRightActions, { gap: 10 }]}>
                  <TouchableOpacity
                    style={[sharedStyles.actionBtn, { width: 'auto', height: 'auto', paddingHorizontal: 16, paddingVertical: 10 }]}
                    onPress={showCopyFromDayPicker}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name="content-copy" size={16} color="rgba(255,255,255,0.8)" />
                    <Text style={[sharedStyles.addCategoryBtnText, { marginLeft: 8 }]}>Copy from day</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[sharedStyles.actionBtn, { width: 'auto', height: 'auto', paddingHorizontal: 16, paddingVertical: 10 }]}
                    onPress={handleReset}
                    activeOpacity={0.7}
                  >
                    <Text style={sharedStyles.categoryCancelText}>Reset</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[sharedStyles.categorySaveBtn, { width: 'auto', height: 'auto', paddingHorizontal: 22, paddingVertical: 10 }]}
                    onPress={handleSave}
                    activeOpacity={0.7}
                  >
                    <Text style={sharedStyles.categorySaveText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <ScrollView
                style={sharedStyles.rightContentScroll}
                contentContainerStyle={[sharedStyles.rightContentScrollPadding, { flexGrow: 1 }]}
                showsVerticalScrollIndicator={false}
                alwaysBounceVertical={true}
              >
                {activeSlot ? renderSlotRow(activeSlot, true) : null}
                <Text style={styles.landscapeHint}>End earlier than start = slot spans midnight.</Text>
              </ScrollView>
              <View style={styles.landscapeRightDaySection}>
                <Text style={sharedStyles.sidebarSectionTitle}>DAY</Text>
                <View style={styles.landscapeDayRow}>
                  {WEEKDAY_ORDER.map((day) => {
                    const active = day === activeDay;
                    return (
                      <View key={day} style={sharedStyles.settingsCardBezelExtraSmall}>
                        <View style={[
                          sharedStyles.settingsCardTrackExtraSmall,
                          active && { backgroundColor: '#fff', borderColor: 'rgba(255,255,255,0.2)' }
                        ]}>
                          <TouchableOpacity
                            style={[
                              styles.landscapeDayChip,
                              { backgroundColor: 'transparent', borderWidth: 0 }
                            ]}
                            onPress={() => {
                              setActiveDay(day);
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }}
                            activeOpacity={0.8}
                          >
                            <Text style={[
                              styles.landscapeDayChipText,
                              active && { color: '#000', fontWeight: '900' }
                            ]}>
                              {WEEKDAY_LABEL[day]}
                            </Text>
                          </TouchableOpacity>
                          <View style={sharedStyles.settingsCardInteriorShadowExtraSmall} pointerEvents="none" />
                          <View style={sharedStyles.settingsCardTopRimExtraSmall} pointerEvents="none" />
                        </View>
                        {active && <View style={sharedStyles.settingsCardOuterGlowExtraSmall} pointerEvents="none" />}
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
        {timeWheelModal}
      </LinearGradient>
    );
  }

  // Portrait - same layout as main Settings screen
  return (
    <LinearGradient colors={['#000000', '#000000']} locations={[0, 1]} style={sharedStyles.container}>
      <SafeAreaView style={sharedStyles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <View style={sharedStyles.header}>
          <TouchableOpacity style={sharedStyles.backButton} onPress={onBack} activeOpacity={0.7}>
            <MaterialIcons name="arrow-back-ios" size={20} color="rgba(255,255,255,0.7)" style={{ marginLeft: 6 }} />
          </TouchableOpacity>
          <Text style={sharedStyles.headerTitle}>TIME-OF-DAY BACKGROUND</Text>
          <TouchableOpacity style={sharedStyles.backButton} onPress={handleSave} activeOpacity={0.7}>
            <MaterialIcons name="check" size={20} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={sharedStyles.content}
          contentContainerStyle={sharedStyles.scrollContent}
          showsVerticalScrollIndicator={false}
          alwaysBounceVertical={true}
        >
          <View style={sharedStyles.section}>
            <Text style={sharedStyles.sectionTitle}>LIVE PREVIEW</Text>
            <View style={sharedStyles.phoneFrameContainer}>
              <View style={[sharedStyles.phoneFrame, { width: (width - 48) + 12 }]}>
                <View style={sharedStyles.phoneInternalFrame}>
                  <View style={[styles.phonePreviewInner, { width: width - 48 }]}>
                    {buildPreviewSegmentsFromDraft(draft).map((seg, idx) => (
                      <View
                        key={`${seg.key}-${idx}`}
                        style={[
                          styles.phonePreviewSlotSeg,
                          { left: `${seg.leftPct}%`, width: `${seg.widthPct}%`, backgroundColor: seg.colorHex },
                        ]}
                      />
                    ))}
                    <View style={styles.phonePreviewTicks}>
                      <Text style={styles.phonePreviewTick}>00</Text>
                      <Text style={styles.phonePreviewTick}>06</Text>
                      <Text style={styles.phonePreviewTick}>12</Text>
                      <Text style={styles.phonePreviewTick}>18</Text>
                      <Text style={styles.phonePreviewTick}>24</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </View>

          <View style={sharedStyles.section}>
            <Text style={sharedStyles.sectionTitle}>DAY</Text>
            <View style={styles.weekdayRow}>
              {WEEKDAY_ORDER.map((day) => {
                const active = day === activeDay;
                return (
                  <TouchableOpacity
                    key={day}
                    style={[styles.weekdayChip, active && styles.weekdayChipActive]}
                    onPress={() => setActiveDay(day)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.weekdayChipText, active && styles.weekdayChipTextActive]}>
                      {WEEKDAY_LABEL[day]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={sharedStyles.section}>
            <Text style={sharedStyles.sectionTitle}>SLOTS</Text>
            {draft.map((s) => renderSlotRow(s))}
          </View>

          <View style={sharedStyles.section}>
            <View style={sharedStyles.categoryFormActions}>
              <TouchableOpacity style={sharedStyles.addCategoryBtn} onPress={showCopyFromDayPicker} activeOpacity={0.7}>
                <MaterialIcons name="content-copy" size={20} color="#FFFFFF" />
                <Text style={sharedStyles.addCategoryBtnText}>Copy from day</Text>
              </TouchableOpacity>
              <TouchableOpacity style={sharedStyles.categoryCancelBtn} onPress={handleReset} activeOpacity={0.7}>
                <Text style={sharedStyles.categoryCancelText}>Reset to defaults</Text>
              </TouchableOpacity>
              <TouchableOpacity style={sharedStyles.categorySaveBtn} onPress={handleSave} activeOpacity={0.7}>
                <Text style={sharedStyles.categorySaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
        {timeWheelModal}
      </SafeAreaView>
    </LinearGradient>
  );
}

const pickerStyles = StyleSheet.create({
  container: {
    height: ITEM_HEIGHT * 3,
    width: 70,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(30,30,30,0.4)',
  },
  highlight: {
    position: 'absolute',
    top: ITEM_HEIGHT,
    left: 3,
    right: 3,
    height: ITEM_HEIGHT,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  fadeTop: { position: 'absolute', top: 0, left: 0, right: 0, height: ITEM_HEIGHT * 0.7, zIndex: 5 },
  fadeBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: ITEM_HEIGHT * 0.7, zIndex: 5 },
  item: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 24,
    fontWeight: '400',
    color: '#FFFFFF',
  },
});

const styles = StyleSheet.create({
  phonePreviewInner: {
    height: 160,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#000',
    borderRadius: 24,
  },
  inputWell: {
    backgroundColor: '#050505',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    position: 'relative',
    overflow: 'hidden',
  },
  phonePreviewSlotSeg: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    opacity: 0.9,
  },
  phonePreviewTicks: {
    position: 'absolute',
    bottom: 6,
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  phonePreviewTick: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.35)',
  },
  landscapePreviewWrap: {
    borderRadius: 10,
    padding: 8,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  landscapePreviewBar: {
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.3)',
    overflow: 'hidden',
    position: 'relative',
  },
  landscapePreviewSeg: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    opacity: 0.85,
  },
  landscapePreviewTicks: {
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  landscapeTick: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.3)',
  },
  landscapeLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 1,
    marginBottom: 4,
    paddingLeft: 2,
  },
  landscapeDayRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  landscapeDayChip: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  landscapeDayChipActive: {
  },
  landscapeDayChipText: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.45)',
  },
  landscapeDayChipTextActive: {
    color: '#000',
  },
  landscapeSlotList: {
    paddingBottom: 8,
  },
  landscapeSlotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  landscapeSlotRowActive: {
  },
  landscapeSlotSwatch: {
    width: 14,
    height: 14,
    borderRadius: 5,
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  landscapeSlotInfo: {
    flex: 1,
    minWidth: 0,
  },
  landscapeSlotTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.6)',
  },
  landscapeSlotTitleActive: {
    color: '#fff',
  },
  landscapeSlotTime: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 1,
  },
  landscapeRight: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    minWidth: 0,
  },
  landscapeEditorScroll: {
    flex: 1,
  },
  landscapeEditorContent: {
    padding: 12,
    paddingBottom: 20,
  },
  landscapeHint: {
    marginTop: 8,
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
  },
  landscapeRightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: 12,
    flexWrap: 'wrap',
  },
  landscapeRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  landscapeRightDaySection: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  weekdayRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  weekdayChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  weekdayChipActive: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderColor: 'rgba(255,255,255,0.22)',
  },
  weekdayChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.55)',
  },
  weekdayChipTextActive: {
    color: '#fff',
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  cardCompact: {
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardHeaderCompact: {
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  cardTitleCompact: {
    fontSize: 11,
  },
  colorSwatch: {
    width: 18,
    height: 18,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  colorSwatchCompact: {
    width: 14,
    height: 14,
    borderRadius: 4,
  },
  fieldRow: {
    marginBottom: 10,
  },
  fieldRowCompact: {
    marginBottom: 6,
  },
  colorPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  colorPickerRowCompact: {
    gap: 5,
    marginTop: 6,
  },
  colorDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  colorDotCompact: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  colorDotSelected: {
    borderColor: '#fff',
    borderWidth: 2,
  },
  timeRow: {
    flexDirection: 'row',
    marginTop: 2,
  },
  timeRowCompact: {
    marginTop: 0,
  },
  timePickerButton: {
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timePickerButtonCompact: {
    height: 32,
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  timePickerValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  timePickerValueCompact: {
    fontSize: 12,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 6,
  },
  fieldLabelCompact: {
    fontSize: 9,
    marginBottom: 3,
  },
  input: {
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  inputCompact: {
    height: 32,
    borderRadius: 8,
    paddingHorizontal: 8,
    fontSize: 11,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  timeModal: {
    width: '92%',
    maxWidth: 420,
    backgroundColor: '#000',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  timeModalTitle: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
    color: '#fff',
    marginBottom: 14,
  },
  timeWheelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  timeWheelGroup: {
    alignItems: 'center',
  },
  timeWheelLabel: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1,
  },
  colon: {
    fontSize: 28,
    color: 'rgba(255, 255, 255, 0.45)',
    marginHorizontal: 10,
    marginBottom: 24,
  },
  timeModalActions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  timeModalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
  },
  timeModalBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  timeModalBtnPrimary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
  },
  timeModalBtnTextPrimary: {
    color: '#000',
    fontSize: 13,
    fontWeight: '800',
  },
  hint: {
    marginTop: 10,
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    lineHeight: 16,
  },
});

