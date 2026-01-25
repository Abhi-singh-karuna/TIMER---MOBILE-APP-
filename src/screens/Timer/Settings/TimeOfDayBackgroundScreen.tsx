import React, { useMemo, useState } from 'react';
import {
  Alert,
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
  onSave,
  onBack,
}: {
  config: TimeOfDayBackgroundConfig;
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

  const [activeDay, setActiveDay] = useState<WeekdayKey>('monday');
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

  const renderColorPicker = (s: SlotDraft) => (
    <View style={styles.colorPickerRow}>
      {COLOR_SWATCHES.map((c) => {
        const selected = (s.colorHex || '').trim().toLowerCase() === c.toLowerCase();
        return (
          <TouchableOpacity
            key={c}
            style={[
              styles.colorDot,
              { backgroundColor: c },
              selected && styles.colorDotSelected,
            ]}
            onPress={() => update(s.key, { colorHex: c })}
            activeOpacity={0.8}
          />
        );
      })}
    </View>
  );

  const renderSlotRow = (s: SlotDraft) => (
    <View key={s.key} style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{s.label || s.key.toUpperCase()}</Text>
        <View style={[styles.colorSwatch, { backgroundColor: isHex(s.colorHex) ? s.colorHex : '#000' }]} />
      </View>

      <View style={styles.fieldRow}>
        <Text style={styles.fieldLabel}>Label</Text>
        <TextInput
          value={s.label}
          onChangeText={(v) => update(s.key, { label: v })}
          placeholder="e.g. Morning"
          placeholderTextColor="rgba(255,255,255,0.35)"
          style={styles.input}
        />
      </View>

      <View style={styles.fieldRow}>
        <Text style={styles.fieldLabel}>Color</Text>
        <TextInput
          value={s.colorHex}
          onChangeText={(v) => update(s.key, { colorHex: v })}
          placeholder="#102A43"
          placeholderTextColor="rgba(255,255,255,0.35)"
          autoCapitalize="none"
          style={styles.input}
        />
        {renderColorPicker(s)}
      </View>

      <View style={styles.timeRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>Start (inclusive)</Text>
          <Pressable
            style={styles.timePickerButton}
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
          >
            <Text style={styles.timePickerValue}>{s.start}</Text>
            <MaterialIcons name="keyboard-arrow-down" size={18} color="rgba(255,255,255,0.35)" />
          </Pressable>
        </View>
        <View style={{ width: 12 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>End (exclusive)</Text>
          <Pressable
            style={styles.timePickerButton}
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
          >
            <Text style={styles.timePickerValue}>{s.end}</Text>
            <MaterialIcons name="keyboard-arrow-down" size={18} color="rgba(255,255,255,0.35)" />
          </Pressable>
        </View>
      </View>

      <Text style={styles.hint}>
        Tip: set end earlier than start to cross midnight (e.g. Night 20:00 → 06:00).
      </Text>
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
          <Pressable style={styles.timeModal} onPress={(e) => e.stopPropagation()}>
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
                style={styles.actionBtn}
                onPress={() => setTimePicker(prev => ({ ...prev, visible: false }))}
                activeOpacity={0.75}
              >
                <Text style={styles.actionBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtnPrimary}
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
                <Text style={styles.actionBtnTextPrimary}>Set</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );

  if (isLandscape) {
    const previewSegments = buildPreviewSegmentsFromDraft(draft);
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'top', 'bottom']}>
        <View style={styles.landscapeRoot}>
          {/* Left card: preview + slot selector + back */}
          <View style={styles.leftCard}>
            <Text style={styles.sidebarSectionTitle}>LIVE PREVIEW</Text>

            <View style={styles.timelinePreviewCard}>
              <View style={styles.timelinePreviewBar}>
                {previewSegments.map((seg, idx) => (
                  <View
                    key={`${seg.key}-${idx}`}
                    style={[
                      styles.timelinePreviewSeg,
                      { left: `${seg.leftPct}%`, width: `${seg.widthPct}%`, backgroundColor: seg.colorHex },
                    ]}
                  />
                ))}
              </View>
              <View style={styles.timelinePreviewTicks}>
                <Text style={styles.tickText}>00</Text>
                <Text style={styles.tickText}>06</Text>
                <Text style={styles.tickText}>12</Text>
                <Text style={styles.tickText}>18</Text>
                <Text style={styles.tickText}>24</Text>
              </View>
            </View>

            <Text style={[styles.sidebarSectionTitle, { marginTop: 12 }]}>SLOTS</Text>
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
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 18 }}
              alwaysBounceVertical={true}
            >
              {draft.map((s) => {
                const isActive = s.key === activeKey;
                return (
                  <TouchableOpacity
                    key={s.key}
                    style={[styles.slotNavRow, isActive && styles.slotNavRowActive]}
                    onPress={() => setActiveKey(s.key)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.slotNavLeft}>
                      <View style={[styles.slotNavSwatch, { backgroundColor: isHex(s.colorHex) ? s.colorHex : '#000' }]} />
                      <View>
                        <Text style={[styles.slotNavTitle, isActive ? styles.slotNavTitleActive : styles.slotNavTitleInactive]}>
                          {s.label || s.key.toUpperCase()}
                        </Text>
                        <Text style={styles.slotNavSub}>
                          {s.start} → {s.end}
                        </Text>
                      </View>
                    </View>
                    <MaterialIcons name="chevron-right" size={18} color="rgba(255,255,255,0.15)" />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity style={styles.smallBackButton} onPress={onBack} activeOpacity={0.75}>
              <MaterialIcons name="arrow-back" size={18} color="rgba(255,255,255,0.65)" />
            </TouchableOpacity>
          </View>

          {/* Right card: editor */}
          <View style={styles.rightCard}>
            <View style={styles.rightHeaderRow}>
              <View>
                <Text style={styles.rightTitle}>TIME-OF-DAY BACKGROUND</Text>
                <Text style={styles.rightSubtitle}>Edit a slot. Save applies instantly to the timeline.</Text>
              </View>
              <View style={styles.rightHeaderActions}>
                <TouchableOpacity style={styles.actionBtn} onPress={handleReset} activeOpacity={0.75}>
                  <MaterialIcons name="refresh" size={18} color="#FFFFFF" />
                  <Text style={styles.actionBtnText}>Reset</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtnPrimary} onPress={handleSave} activeOpacity={0.75}>
                  <MaterialIcons name="check" size={18} color="#000" />
                  <Text style={styles.actionBtnTextPrimary}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
              showsVerticalScrollIndicator={false}
              alwaysBounceVertical={true}
            >
              {activeSlot ? renderSlotRow(activeSlot) : null}
              <Text style={styles.hint}>
                Note: end earlier than start means the slot spans midnight.
              </Text>
            </ScrollView>
          </View>
        </View>
        {timeWheelModal}
      </SafeAreaView>
    );
  }

  // Portrait (current behavior)
  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={onBack} activeOpacity={0.7}>
          <MaterialIcons name="arrow-back-ios" size={18} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>TIME-OF-DAY BACKGROUND</Text>
        <TouchableOpacity style={styles.headerBtn} onPress={handleSave} activeOpacity={0.7}>
          <MaterialIcons name="check" size={20} color="rgba(255,255,255,0.9)" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>DAY</Text>
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

        <Text style={styles.sectionTitle}>SLOTS</Text>
        {draft.map(renderSlotRow)}

        <View style={{ height: 12 }} />
        <TouchableOpacity style={styles.resetBtn} onPress={handleReset} activeOpacity={0.75}>
          <MaterialIcons name="refresh" size={18} color="#FFFFFF" />
          <Text style={styles.resetText}>Reset to defaults</Text>
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>
      {timeWheelModal}
    </SafeAreaView>
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
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  landscapeRoot: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 18,
  },
  leftCard: {
    width: '38%',
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: 'transparent',
  },
  rightCard: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  rightHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    gap: 12,
  },
  rightTitle: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
    color: '#fff',
  },
  rightSubtitle: {
    marginTop: 6,
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
  },
  rightHeaderActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  actionBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  actionBtnTextPrimary: {
    color: '#000',
    fontSize: 13,
    fontWeight: '900',
  },
  sidebarSectionTitle: {
    fontSize: 9,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.25)',
    letterSpacing: 2,
    marginBottom: 8,
    paddingLeft: 4,
    textTransform: 'uppercase',
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
  timelinePreviewCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  timelinePreviewBar: {
    height: 18,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
    position: 'relative',
  },
  timelinePreviewSeg: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    opacity: 0.85,
  },
  timelinePreviewTicks: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tickText: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.30)',
  },
  slotNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 8,
  },
  slotNavRowActive: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.14)',
  },
  slotNavLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  slotNavSwatch: {
    width: 16,
    height: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  slotNavTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  slotNavTitleActive: {
    color: '#fff',
  },
  slotNavTitleInactive: {
    color: 'rgba(255,255,255,0.65)',
  },
  slotNavSub: {
    marginTop: 2,
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
  },
  smallBackButton: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    color: '#fff',
  },
  headerBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  content: {
    padding: 18,
    paddingBottom: 30,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 10,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  colorSwatch: {
    width: 18,
    height: 18,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  fieldRow: {
    marginBottom: 10,
  },
  colorPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  colorDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  colorDotSelected: {
    borderColor: '#fff',
    borderWidth: 2,
  },
  timeRow: {
    flexDirection: 'row',
    marginTop: 2,
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
  timePickerValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 6,
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
  hint: {
    marginTop: 10,
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    lineHeight: 16,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  resetText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});

