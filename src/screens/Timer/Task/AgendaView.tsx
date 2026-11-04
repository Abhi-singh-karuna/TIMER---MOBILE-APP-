import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    ScrollView,
    FlatList,
    PanResponder,
    Alert,
    LayoutAnimation,
    HostInstance,
    TextInput,
    TextInputInstance,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    StatusBar,
    useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
    Easing,
    FadeIn,
    ZoomIn,
    FadeOut,
    SlideInUp,
    SlideOutDown,
    Extrapolation,
    interpolate,
    cancelAnimation,
    runOnJS,
    withSpring,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Task, TaskStage, StageStatus, Idea, JournalEntry, JOURNAL_CURRENCY } from '../../../constants/data';
import IdeaTray from './IdeaTray';
import JournalSheet, { JournalSubtask } from './JournalSheet';
import { getLogicalDate, toDisplayMinutes } from '../../../utils/dailyStartTime';
import { expandTasksForDate } from '../../../utils/recurrenceUtils';
import StageActionPopup from './StageActionPopup';

const STATUS_ICON: Record<string, keyof typeof MaterialIcons.glyphMap> = { Done: 'check', Undone: 'close', Process: 'timelapse', Upcoming: 'schedule' };
const SNAP_MIN = 1; // moving / resizing is per minute
const MIN_DURATION = 1;

type SyncModeArg = 'none' | 'all' | 'future' | undefined;

/** One stage on one day (the task is the day's expanded copy, so updates land on the right date). */
export interface AgendaItem {
    id: number;
    taskId: number;
    task: Task;
    text: string;
    startTimeMinutes: number;
    durationMinutes: number;
    status: StageStatus;
    /** Minutes from the day start (0–1440). */
    ds: number;
}

export interface AgendaViewProps {
    visible: boolean;
    onClose: () => void;
    /** Every task (recurring ones are expanded per day inside the agenda). */
    allTasks: Task[];
    /** The day the agenda opens on. */
    selectedDate: Date;
    dailyStartMinutes: number;
    /** Current time as minutes from midnight (fractions allowed). */
    nowMinutes: number;
    showDisabledTasks?: boolean;
    onUpdateStages?: (task: Task, stages: TaskStage[], syncMode?: SyncModeArg) => void;
    /** Render in place (no modal): used as the portrait version of Live Focus. Always shows the planner. */
    embedded?: boolean;
    /** Tasks a new subtask can be added to (embedded mode shows a + button). */
    addTargets?: { id: number; title: string; color?: string }[];
    onAddSubtask?: (taskId: number, startTimeMinutes: number, durationMinutes?: number, ideaId?: number) => void;
    /** Idea tray (embedded planner): subtasks not placed on any task yet. */
    ideas?: Idea[];
    onAddIdea?: (title: string, dueDate: string) => void;
    onDeleteIdea?: (id: number) => void;
    ideasOpen?: boolean;
    onIdeasOpenChange?: (open: boolean) => void;
    /** Day journal (embedded planner): notes and expenses, pulled up from the bottom. */
    journal?: JournalEntry[];
    onAddJournal?: (entry: Omit<JournalEntry, 'id' | 'createdAt'>) => void;
    onUpdateJournal?: (entry: JournalEntry) => void;
    onDeleteJournal?: (id: number) => void;
    onJournalStageChange?: (stage: 1 | 2 | 3) => void;
    /** Changes each time the journal button in the bottom controls is tapped (opens / closes the journal). */
    journalToggle?: number;
    /** Create a subtask straight from the slide-to-add sheet (name + task + range), without opening the form. */
    onQuickAdd?: (taskId: number, name: string, startTimeMinutes: number, durationMinutes: number) => void;
    /** Edit a stage's name / time (only offered for stages on the selected day). */
    onEditStage?: (item: AgendaItem) => void;
    /** Embedded mode: the day switcher in the header asks the parent to show another day (YYYY-MM-DD logical day). */
    onDayChange?: (dayKey: string) => void;
    /** Embedded mode: tells the parent when a slide-to-add selection is active (it hides the bottom controls the bar replaces). */
    onSlideActiveChange?: (active: boolean) => void;
}

const VIEW_MODE_KEY = '@agenda_view_mode';
const SEL_ACCENT = '#7BE18A'; // slide-to-add selection colour (green)
const PART_COLORS = { night: '#6EA8FF', morning: '#FFB74D', afternoon: '#22E3F5', evening: '#B08CFF' };
const QUICK_DURATIONS = [15, 30, 60, 120, 180];
const PLANNER_HOUR_PX = 46; // default height of one hour in the planner view
const MIN_HOUR_PX = 20;     // most zoomed out (pinch in)
const MAX_HOUR_PX = 1800;   // most zoomed in: 30pt per minute (pinch out / the 1m step)
const HOUR_PX_KEY = '@agenda_hour_px';
const PLANNER_AXIS_W = 54;   // width of the time labels column
const LOAD_STEP = 7;         // days added when the end of the list is reached
const HEADER_H = 52;         // height of a day header

const THEME: Record<'Done' | 'Undone' | 'Upcoming' | 'Live', { bg: string; name: string; dot: string; chip: string; border: string }> = {
    Done: { bg: '#17301D', name: '#9FE8AC', dot: '#7BE18A', chip: '#24472B', border: 'rgba(123,225,138,0.12)' },
    Undone: { bg: '#3A1D22', name: '#FFA0A0', dot: '#FF8A8A', chip: '#552329', border: 'rgba(255,138,138,0.12)' },
    Upcoming: { bg: '#2C3038', name: 'rgba(255,255,255,0.88)', dot: '#9AA1AE', chip: '#3A3F49', border: 'rgba(255,255,255,0.06)' },
    Live: { bg: '#3A2E10', name: '#FFD83A', dot: '#FFD83A', chip: '#5A4515', border: 'rgba(255,216,58,0.55)' },
};

const RAISED = 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -3px 0 rgba(0,0,0,0.3), 0 6px 10px rgba(0,0,0,0.55)';
const SUNK = 'inset 0 3px 8px rgba(0,0,0,0.85), 0 1px 0 rgba(255,255,255,0.06)';

const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function keyToDate(key: string): Date {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function dateToKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(key: string, n: number): string {
    const d = keyToDate(key);
    d.setDate(d.getDate() + n);
    return dateToKey(d);
}

function dayParts(key: string): { weekday: string; date: string } {
    const d = keyToDate(key);
    return { weekday: WEEKDAYS[d.getDay()], date: `${d.getDate()} ${MONTHS[d.getMonth()]}` };
}

function formatHHMM(minutes: number): string {
    const t = ((Math.round(minutes) % 1440) + 1440) % 1440;
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

function formatDuration(minutes: number): string {
    const d = Math.round(minutes);
    if (d < 60) return `${d}m`;
    const h = Math.floor(d / 60);
    const m = d % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function themeFor(status: StageStatus) {
    return status === 'Done' ? THEME.Done : status === 'Undone' ? THEME.Undone : status === 'Process' ? THEME.Live : THEME.Upcoming;
}

/** Soft pulsing dot used for the live stage. */
function LiveDot({ color }: { color: string }) {
    const p = useSharedValue(0);
    useEffect(() => {
        p.value = withRepeat(withSequence(
            withTiming(1, { duration: 800, easing: Easing.inOut(Easing.quad) }),
            withTiming(0, { duration: 800, easing: Easing.inOut(Easing.quad) }),
        ), -1, false);
        return () => cancelAnimation(p);
    }, [p]);
    const anim = useAnimatedStyle(() => ({
        transform: [{ scale: interpolate(p.value, [0, 1], [1, 1.35]) }],
        opacity: interpolate(p.value, [0, 1], [1, 0.55]),
    }));
    return <Animated.View style={[styles.dot, { backgroundColor: color, shadowColor: color, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } }, anim]} />;
}

interface EditCallbacks {
    onSelect: (key: string | null) => void;
    onDragState: (dragging: boolean) => void;
    onCommit: (item: AgendaItem, newStart: number, newDuration: number) => void;
    onDelete: (item: AgendaItem) => void;
    onStatus: (item: AgendaItem, x: number, y: number) => void;
    onEdit?: (item: AgendaItem) => void;
}

/** Small raised round action button (status / delete) shown on the selected stage. */
function ActionDome({ icon, color, onPress }: { icon: keyof typeof MaterialIcons.glyphMap; color: string; onPress: (x: number, y: number) => void }) {
    return (
        <TouchableOpacity
            style={styles.actionDome}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            onPress={(e) => onPress(e.nativeEvent.pageX, e.nativeEvent.pageY)}
        >
            <MaterialIcons name={icon} size={14} color={color} />
        </TouchableOpacity>
    );
}

interface PlannerBlockProps extends EditCallbacks {
    item: AgendaItem;
    itemKey: string;
    left: number;
    width: number;
    hr: number;
    dailyStartMinutes: number;
    selected: boolean;
    /** Another card is selected: this one steps back (fades) so the selected one stands out. */
    dimmed?: boolean;
    /** Journal entries linked to this subtask: how many notes, and how much money was spent. */
    notes?: number;
    spend?: number;
}

/** A planner block: tap to select, then drag to move (5-minute steps), drag the bottom grip to resize, or delete. */
function PlannerBlock({ item, itemKey, left, width, hr, dailyStartMinutes, selected, dimmed, notes, spend, onSelect, onDragState, onCommit, onDelete, onStatus, onEdit }: PlannerBlockProps) {
    const th = themeFor(item.status);
    const live = item.status === 'Process';
    const dy = useSharedValue(0);
    const dh = useSharedValue(0);
    const [preview, setPreview] = useState<{ ds: number; dur: number } | null>(null);
    const [local, setLocal] = useState<{ ds: number; dur: number } | null>(null);

    const ds = local?.ds ?? item.ds;
    const dur = local?.dur ?? item.durationMinutes;

    // drop the optimistic position once the real data catches up (or after a moment if the update never lands)
    useEffect(() => {
        if (!local) return;
        if (Math.abs(item.ds - local.ds) < 1 && Math.abs(item.durationMinutes - local.dur) < 1) { setLocal(null); return; }
        const t = setTimeout(() => setLocal(null), 1800);
        return () => clearTimeout(t);
    }, [item.ds, item.durationMinutes, local]);

    const baseTop = (ds / 60) * hr + 2;
    const baseH = Math.max(36, (Math.min(dur, 1440 - ds) / 60) * hr - 4);

    // selection look (frosted spotlight): the card turns frosted white glass with a glowing rim, a shine sweeps across it,
    // and the rest of the planner steps back like a spotlight
    const sel = useSharedValue(0);
    const pop = useSharedValue(1);
    const sweep = useSharedValue(0);
    const dim = useSharedValue(0);
    useEffect(() => {
        dim.value = withTiming(dimmed ? 1 : 0, { duration: 260 });
    }, [dimmed, dim]);
    useEffect(() => {
        if (selected) {
            sel.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
            pop.value = withSequence(
                withTiming(1.045, { duration: 130, easing: Easing.out(Easing.quad) }),
                withSpring(1.02, { damping: 12, stiffness: 220 }),
            );
            sweep.value = withRepeat(withSequence(
                withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.cubic) }),
                withTiming(1, { duration: 1300 }),
                withTiming(0, { duration: 0 }),
            ), -1, false);
        } else {
            cancelAnimation(sweep);
            sweep.value = 0;
            sel.value = withTiming(0, { duration: 200 });
            pop.value = withTiming(1, { duration: 200 });
        }
    }, [selected, sel, pop, sweep]);
    const selGlass = useAnimatedStyle(() => ({ opacity: sel.value }));
    const selSweep = useAnimatedStyle(() => ({
        opacity: sel.value * interpolate(sweep.value, [0, 0.12, 0.88, 1], [0, 1, 1, 0]),
        transform: [{ translateX: interpolate(sweep.value, [0, 1], [-width * 0.9, width * 1.2]) }, { skewX: '-18deg' }],
    }));
    const anim = useAnimatedStyle(() => ({
        top: baseTop + dy.value,
        height: Math.max(36, baseH + dh.value),
        opacity: 1 - 0.4 * dim.value,
        transform: [{ scale: pop.value }],
    }));

    const latest = useRef({ ds, dur, selected, item, hr, dailyStartMinutes });
    latest.current = { ds, dur, selected, item, hr, dailyStartMinutes };
    const cbs = useRef({ onSelect, onDragState, onCommit, itemKey });
    cbs.current = { onSelect, onDragState, onCommit, itemKey };

    const snap = (minutes: number) => Math.round(minutes / SNAP_MIN) * SNAP_MIN;

    // finish a move (from the handle or from hold-and-slide): save the new start, or snap back if it did not change
    const commitMove = () => {
        const L = latest.current;
        const newDs = L.ds + (dy.value / L.hr) * 60;
        setPreview(null);
        cbs.current.onDragState(false);
        if (Math.abs(newDs - L.ds) >= 1) {
            setLocal({ ds: newDs, dur: L.dur });
            dy.value = 0;
            cbs.current.onCommit(L.item, (Math.round(newDs) + L.dailyStartMinutes) % 1440, L.dur);
        } else {
            dy.value = 0;
        }
    };
    const moveTo = (deltaY: number) => {
        const L = latest.current;
        const newDs = Math.max(0, Math.min(1440 - L.dur, snap(L.ds + (deltaY / L.hr) * 60)));
        dy.value = ((newDs - L.ds) / 60) * L.hr;
        setPreview(prev => (prev && prev.ds === newDs ? prev : { ds: newDs, dur: L.dur }));
    };

    // Hold-and-slide: press and hold a block (about 0.4s), then slide it up or down. A normal swipe still scrolls the page,
    // because the hold only starts if the finger stays put. Raw touch events are used so the page scroll is never fought.
    const hold = useRef<{ timer: ReturnType<typeof setTimeout> | null; armed: boolean; startY: number; startX: number; held: boolean; wasSelected: boolean }>({ timer: null, armed: false, startY: 0, startX: 0, held: false, wasSelected: false });
    const cancelHoldTimer = () => { if (hold.current.timer) { clearTimeout(hold.current.timer); hold.current.timer = null; } };
    useEffect(() => cancelHoldTimer, []);
    const holdHandlers = {
        onTouchStart: (e: any) => {
            const ne = e.nativeEvent;
            if (ne.touches.length !== 1) { cancelHoldTimer(); return; }
            hold.current.startY = ne.pageY;
            hold.current.startX = ne.pageX;
            hold.current.held = false;
            cancelHoldTimer();
            hold.current.timer = setTimeout(() => {
                hold.current.timer = null;
                hold.current.armed = true;
                hold.current.held = true;
                hold.current.wasSelected = latest.current.selected;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                if (!latest.current.selected) cbs.current.onSelect(cbs.current.itemKey);
                cbs.current.onDragState(true);
            }, 380);
        },
        onTouchMove: (e: any) => {
            const ne = e.nativeEvent;
            if (ne.touches.length > 1) { cancelHoldTimer(); return; }
            if (!hold.current.armed) {
                // the finger moved before the hold finished: it is a scroll, not a move
                if (Math.abs(ne.pageY - hold.current.startY) > 8 || Math.abs(ne.pageX - hold.current.startX) > 8) cancelHoldTimer();
                return;
            }
            moveTo(ne.pageY - hold.current.startY);
        },
        onTouchEnd: () => {
            cancelHoldTimer();
            if (hold.current.armed) {
                hold.current.armed = false;
                const moved = Math.abs(dy.value) > 0.5;
                commitMove();
                // hold + release without sliding: it only selects (or, if it was already selected, deselects)
                if (!moved && hold.current.wasSelected) cbs.current.onSelect(null);
            }
        },
        onTouchCancel: () => {
            cancelHoldTimer();
            if (hold.current.armed) { hold.current.armed = false; commitMove(); }
        },
    };

    const movePan = useRef(PanResponder.create({
        onStartShouldSetPanResponder: () => latest.current.selected,
        onMoveShouldSetPanResponder: () => latest.current.selected,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => cbs.current.onDragState(true),
        onPanResponderMove: (_, g) => moveTo(g.dy),
        onPanResponderRelease: () => commitMove(),
        onPanResponderTerminate: () => { dy.value = 0; setPreview(null); cbs.current.onDragState(false); },
    })).current;

    const resizePan = useRef(PanResponder.create({
        onStartShouldSetPanResponder: () => latest.current.selected,
        onMoveShouldSetPanResponder: () => latest.current.selected,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => cbs.current.onDragState(true),
        onPanResponderMove: (_, g) => {
            const L = latest.current;
            const newDur = Math.max(MIN_DURATION, Math.min(1440 - L.ds, snap(L.dur + (g.dy / L.hr) * 60)));
            dh.value = ((newDur - L.dur) / 60) * L.hr;
            setPreview({ ds: L.ds, dur: newDur });
        },
        onPanResponderRelease: () => {
            const L = latest.current;
            const newDur = L.dur + (dh.value / L.hr) * 60;
            setPreview(null);
            cbs.current.onDragState(false);
            if (Math.abs(newDur - L.dur) >= 1) {
                setLocal({ ds: L.ds, dur: newDur });
                dh.value = 0;
                cbs.current.onCommit(L.item, L.item.startTimeMinutes, Math.round(newDur));
            } else {
                dh.value = 0;
            }
        },
        onPanResponderTerminate: () => { dh.value = 0; setPreview(null); cbs.current.onDragState(false); },
    })).current;

    const shownDs = preview?.ds ?? ds;
    const shownDur = preview?.dur ?? dur;
    const startShown = (Math.round(shownDs) + dailyStartMinutes) % 1440;
    const range = `${formatHHMM(startShown)} – ${formatHHMM(startShown + shownDur)}`;
    const compact = baseH < 52 && !selected;
    const tall = baseH >= 84 || selected;

    return (
        <Animated.View
            {...holdHandlers}
            style={[
                styles.block,
                { left, width, backgroundColor: th.bg, borderColor: th.border },
                live && styles.blockLive,
                selected && styles.blockSelected,
                anim,
            ]}
        >
            <View style={styles.blockClip}>
                <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, selGlass]}>
                    <LinearGradient colors={['rgba(255,255,255,0.34)', 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0.18)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                </Animated.View>
                <Animated.View pointerEvents="none" style={[styles.blockSweep, selSweep]}>
                    <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
                </Animated.View>
            </View>
            <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => { hold.current.held = false; }}
                style={[styles.blockTouch, compact && { flexDirection: 'row', alignItems: 'center', gap: 6 }]}
            >
                <View style={[styles.blockHead, compact && { flex: 1 }]}>
                    <View style={[styles.blockDisc, { backgroundColor: th.dot }]} />
                    <Text style={[styles.blockName, { color: selected ? '#FFFFFF' : th.name, flex: 1 }, selected && { paddingRight: onEdit ? 94 : 62 }]} numberOfLines={compact ? 1 : 2}>{item.text}</Text>
                </View>
                <View style={compact ? undefined : styles.blockMeta}>
                    <View style={[styles.durChip, { backgroundColor: th.chip }]}>
                        <Text style={[styles.durChipText, { color: th.name }]} numberOfLines={1}>{formatDuration(shownDur)}</Text>
                    </View>
                    {!compact && tall && <Text style={[styles.blockRange, preview && { color: '#FFD83A' }]} numberOfLines={1}>{range}</Text>}
                </View>
                {!!(notes || spend) && (
                    <View style={styles.blockBadges}>
                        {!!notes && (
                            <View style={styles.badge}>
                                <MaterialIcons name="edit" size={9} color="#9CC2FF" />
                                <Text style={[styles.badgeText, { color: '#9CC2FF' }]}>{notes}</Text>
                            </View>
                        )}
                        {!!spend && (
                            <View style={styles.badge}>
                                <Text style={[styles.badgeText, { color: '#FFD54F' }]}>{JOURNAL_CURRENCY}{Math.round(spend).toLocaleString('en-US')}</Text>
                            </View>
                        )}
                    </View>
                )}
            </TouchableOpacity>

            {selected && (
                <>
                    <View style={styles.blockActions}>
                        {onEdit && <ActionDome icon="edit" color="rgba(255,255,255,0.85)" onPress={() => onEdit(item)} />}
                        <ActionDome icon={STATUS_ICON[item.status] ?? 'schedule'} color={th.name} onPress={(x, y) => onStatus(item, x, y)} />
                        <ActionDome icon="delete-outline" color="#FF6B6B" onPress={() => onDelete(item)} />
                    </View>
                    <View {...resizePan.panHandlers} style={styles.resizeGrip}>
                        <View style={styles.resizeBar} />
                    </View>
                </>
            )}
        </Animated.View>
    );
}

/** Slide-to-confirm track: drag the thumb to the end to add. onConfirm returns false to refuse (the thumb springs back). */
function SlideToAdd({ label, onConfirm }: { label: string; onConfirm: () => boolean }) {
    const THUMB = 46;
    const PAD = 5;
    const x = useSharedValue(0);
    const maxSV = useSharedValue(240);
    const maxRef = useRef(240);
    const startRef = useRef(0);
    const confirmRef = useRef(onConfirm);
    confirmRef.current = onConfirm;
    const pan = useRef(PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => { cancelAnimation(x); startRef.current = x.value; },
        onPanResponderMove: (_, g) => { x.value = Math.max(0, Math.min(maxRef.current, startRef.current + g.dx)); },
        onPanResponderRelease: () => {
            if (x.value >= maxRef.current * 0.82) {
                x.value = withTiming(maxRef.current, { duration: 90 });
                if (!confirmRef.current()) x.value = withSpring(0, { damping: 16, stiffness: 220 });
            } else {
                x.value = withSpring(0, { damping: 16, stiffness: 220 });
            }
        },
        onPanResponderTerminate: () => { x.value = withSpring(0, { damping: 16, stiffness: 220 }); },
    })).current;
    const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
    const fill = useAnimatedStyle(() => ({ width: x.value + THUMB + PAD }));
    const text = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [0, maxSV.value * 0.6], [1, 0], Extrapolation.CLAMP) }));
    return (
        <View
            style={styles.s2aTrack}
            onLayout={(e) => { const m = e.nativeEvent.layout.width - THUMB - 2 * PAD; maxRef.current = m; maxSV.value = m; }}
        >
            <Animated.View pointerEvents="none" style={[styles.s2aFill, fill]} />
            <Animated.View pointerEvents="none" style={[styles.s2aLabelWrap, text]}>
                <Text style={styles.s2aLabel}>SLIDE TO ADD · {label}</Text>
                <MaterialIcons name="chevron-right" size={18} color="#7BE18A" />
                <MaterialIcons name="chevron-right" size={18} color="rgba(123,225,138,0.5)" style={{ marginLeft: -12 }} />
            </Animated.View>
            <Animated.View {...pan.panHandlers} style={[styles.s2aThumbWrap, thumb]}>
                <LinearGradient colors={['#8FE89B', '#5FD070']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.s2aThumb}>
                    <MaterialIcons name="add" size={22} color="#06200C" />
                </LinearGradient>
            </Animated.View>
        </View>
    );
}

interface SlideRange { a: number; b: number }

interface SlideLayerProps {
    hr: number;
    snap: number;
    enabled: boolean;
    selectedActive: boolean;
    onSlide: (range: SlideRange | null) => void;
    onSliding: (sliding: boolean) => void;
    onLock: (locked: boolean) => void;
    onDeselect: () => void;
    width: number;
    height: number;
    /** Subtask cards (px, inside this view): touches that start on one belong to the card, not to the slide. */
    rects: Array<{ l: number; r: number; t: number; b: number }>;
    children?: React.ReactNode;
}

/**
 * Empty planner space: hold (about 0.4s) then slide to select a time range, the same as sliding on the time ruler.
 * A normal swipe still scrolls the page, and a plain tap deselects the selected subtask.
 */
function SlideLayer({ hr, snap, enabled, selectedActive, onSlide, onSliding, onLock, onDeselect, width, height, rects, children }: SlideLayerProps) {
    const ref = useRef<HostInstance>(null);
    const [hint, setHint] = useState<{ x: number; y: number } | null>(null); // press-and-hold cue under the finger
    const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const clearHint = () => { if (hintTimer.current) { clearTimeout(hintTimer.current); hintTimer.current = null; } setHint(null); };
    useEffect(() => () => { if (hintTimer.current) clearTimeout(hintTimer.current); }, []);
    const latest = useRef({ hr, snap, enabled, selectedActive, onSlide, onSliding, onLock, onDeselect, rects });
    latest.current = { hr, snap, enabled, selectedActive, onSlide, onSliding, onLock, onDeselect, rects };
    const st = useRef<{ timer: ReturnType<typeof setTimeout> | null; armed: boolean; moved: boolean; startY: number; startX: number; top: number; left: number; measured: boolean; anchor: number; last: number }>({
        timer: null, armed: false, moved: false, startY: 0, startX: 0, top: 0, left: 0, measured: false, anchor: 0, last: 0,
    });
    const clearTimer = () => { if (st.current.timer) { clearTimeout(st.current.timer); st.current.timer = null; } };
    useEffect(() => clearTimer, []);
    const minuteAt = (pageY: number) => {
        const L = latest.current;
        return Math.max(0, Math.min(1440, Math.round((((pageY - st.current.top) / L.hr) * 60) / L.snap) * L.snap));
    };
    const onCard = (pageX: number, pageY: number) => {
        const S = st.current;
        if (!S.measured) return true;
        const x = pageX - S.left, y = pageY - S.top;
        return latest.current.rects.some(r => x >= r.l && x <= r.r && y >= r.t && y <= r.b);
    };
    const finish = () => {
        const S = st.current;
        const L = latest.current;
        let a = Math.min(S.anchor, S.last);
        let b = Math.max(S.anchor, S.last);
        const tapLen = L.snap <= 1 ? 5 : 30;
        if (b - a < L.snap) b = Math.min(1440, a + tapLen);
        if (b - a < L.snap) a = Math.max(0, b - tapLen);
        L.onSlide({ a, b });
        L.onSliding(false);
        L.onLock(false);
    };
    const handlers = {
        onTouchStart: (e: any) => {
            const ne = e.nativeEvent;
            clearTimer();
            clearHint();
            if (ne.touches.length !== 1) return;
            const S = st.current;
            S.armed = false;
            S.moved = false;
            S.startY = ne.pageY;
            S.startX = ne.pageX;
            if (!latest.current.enabled) return;
            S.measured = false;
            ref.current?.measureInWindow((x, y) => { S.left = x; S.top = y; S.measured = true; }); // the container's corner on screen
            const hx = ne.locationX, hy = ne.locationY;
            hintTimer.current = setTimeout(() => { hintTimer.current = null; setHint({ x: hx, y: hy }); }, 90);
            S.timer = setTimeout(() => {
                S.timer = null;
                if (onCard(S.startX, S.startY)) { clearHint(); return; } // the touch is on a card, which handles it itself
                // lock the page scroll right away so it cannot take over the touch
                clearHint();
                latest.current.onLock(true);
                const m = minuteAt(S.startY);
                S.armed = true;
                S.anchor = m;
                S.last = m;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                latest.current.onSliding(true);
                latest.current.onSlide({ a: m, b: m });
            }, 260);
        },
        onTouchMove: (e: any) => {
            const ne = e.nativeEvent;
            const S = st.current;
            if (ne.touches.length > 1) { clearTimer(); return; }
            if (Math.abs(ne.pageY - S.startY) > 12 || Math.abs(ne.pageX - S.startX) > 12) S.moved = true;
            if (!S.armed) {
                if (S.moved) { clearTimer(); clearHint(); } // moved before the hold finished: it is a scroll
                return;
            }
            const m = minuteAt(ne.pageY);
            S.last = m;
            latest.current.onSlide({ a: S.anchor, b: m });
        },
        onTouchEnd: () => {
            const S = st.current;
            clearTimer();
            clearHint();
            if (S.armed) { S.armed = false; finish(); return; }
            // a plain tap on empty space deselects the selected subtask
            if (!S.moved && latest.current.selectedActive && !onCard(S.startX, S.startY)) latest.current.onDeselect();
        },
        onTouchCancel: () => {
            const S = st.current;
            clearTimer();
            if (S.armed) { S.armed = false; finish(); }
        },
    };
    return (
        <View ref={ref} collapsable={false} style={{ width, height }} {...handlers}>
            {hint && (
                <Animated.View
                    pointerEvents="none"
                    entering={ZoomIn.duration(180)}
                    style={{ position: 'absolute', left: hint.x - 26, top: hint.y - 26, width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: 'rgba(76,175,80,0.9)', backgroundColor: 'rgba(76,175,80,0.14)' }}
                />
            )}
            {children}
        </View>
    );
} // display minutes (0-1440) from the day start

interface SlideAxisProps {
    hr: number;
    total: number;
    marks: number[];
    dailyStartMinutes: number;
    isToday: boolean;
    nowY: number;
    nowMinutes: number;
    enabled: boolean;
    slide: SlideRange | null;
    onSlide: (range: SlideRange | null) => void;
    onSliding: (sliding: boolean) => void;
    snap: number; // minutes per selection step
}

/** The hour labels column. Slide a finger up or down along it to select a time range (tap = 30 minutes). */
function SlideAxis({ hr, total, marks, dailyStartMinutes, isToday, nowY, nowMinutes, enabled, slide, onSlide, onSliding, snap }: SlideAxisProps) {
    const latest = useRef({ hr, enabled, onSlide, onSliding, snap });
    latest.current = { hr, enabled, onSlide, onSliding, snap };
    const anchor = useRef({ y: 0, min: 0 });
    const lastMin = useRef(0);
    const finish = () => {
        const m = lastMin.current;
        let a = Math.min(anchor.current.min, m);
        let b = Math.max(anchor.current.min, m);
        const tapLen = latest.current.snap <= 1 ? 5 : 30; // a tap selects a short default range
        if (b - a < latest.current.snap) b = Math.min(1440, a + tapLen);
        if (b - a < latest.current.snap) a = Math.max(0, b - tapLen);
        latest.current.onSlide({ a, b });
        latest.current.onSliding(false);
    };
    const snapMin = (y: number) => Math.max(0, Math.min(1440, Math.round(((y / latest.current.hr) * 60) / latest.current.snap) * latest.current.snap));
    const pan = useRef(PanResponder.create({
        onStartShouldSetPanResponder: () => latest.current.enabled,
        onMoveShouldSetPanResponder: () => latest.current.enabled,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
            const y = e.nativeEvent.locationY;
            const m = snapMin(y);
            anchor.current = { y, min: m };
            lastMin.current = m;
            latest.current.onSliding(true);
            latest.current.onSlide({ a: m, b: m });
        },
        onPanResponderMove: (_, g) => {
            const m = snapMin(anchor.current.y + g.dy);
            lastMin.current = m;
            latest.current.onSlide({ a: anchor.current.min, b: m });
        },
        onPanResponderRelease: () => finish(),
        // if something else takes the touch (e.g. the page scroll), keep the range selected instead of losing it
        onPanResponderTerminate: () => finish(),
    })).current;

    const lo = slide ? Math.min(slide.a, slide.b) : -1;
    const hi = slide ? Math.max(slide.a, slide.b) : -1;
    const nowD = isToday ? toDisplayMinutes(nowMinutes, dailyStartMinutes) : -1;
    return (
        <View style={{ width: PLANNER_AXIS_W, height: total + 10 }} {...pan.panHandlers}>
            {/* day-part rail: the spine is coloured by night / morning / afternoon / evening, ticks and hours sit on it */}
            <View style={styles.rulerGroove} pointerEvents="none" />
            {(() => {
                const breaks = [0, 1440];
                [0, 360, 720, 1080].forEach(clock => {
                    const d = (((clock - dailyStartMinutes) % 1440) + 1440) % 1440;
                    if (d > 0 && d < 1440) breaks.push(d);
                });
                breaks.sort((x, y) => x - y);
                return breaks.slice(0, -1).map((from, i) => {
                    const to = breaks[i + 1];
                    const clockStart = (dailyStartMinutes + from) % 1440;
                    const part = clockStart >= 1080 ? 'evening' : clockStart >= 720 ? 'afternoon' : clockStart >= 360 ? 'morning' : 'night';
                    return (
                        <View
                            key={`part-${from}`}
                            pointerEvents="none"
                            style={[styles.rulerPart, { top: (from / 60) * hr, height: ((to - from) / 60) * hr, backgroundColor: PART_COLORS[part] }]}
                        />
                    );
                });
            })()}
            {slide && (
                <View
                    pointerEvents="none"
                    style={[styles.rulerLit, { top: (lo / 60) * hr, height: Math.max(3, ((hi - lo) / 60) * hr) }]}
                />
            )}
            {marks.map((m) => {
                const inRange = slide != null && m >= lo && m <= hi;
                const isHour = m % 60 === 0;
                const isMid = !isHour && m % 15 === 0;
                const y = (m / 60) * hr;
                const past = isToday && m < nowD;
                const tickW = isHour ? 11 : isMid ? 7 : 4;
                const tickColor = inRange ? '#FFFFFF' : isHour ? (past ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.85)') : isMid ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.22)';
                const numColor = inRange ? SEL_ACCENT : past ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.88)';
                return (
                    <React.Fragment key={`hl-${m}`}>
                        <View pointerEvents="none" style={[styles.rulerTick, { top: y - 1, width: tickW, backgroundColor: tickColor }]} />
                        {isHour ? (
                            <Text pointerEvents="none" style={[styles.rulerHour, { top: y - 7, color: numColor }]}>{String(Math.floor((((dailyStartMinutes + m) % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:00</Text>
                        ) : (
                            <Text pointerEvents="none" style={[styles.rulerMinor, { top: y - 5, color: inRange ? SEL_ACCENT : isMid ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.28)' }]}>
                                :{String((((dailyStartMinutes + m) % 60) + 60) % 60).padStart(2, '0')}
                            </Text>
                        )}
                    </React.Fragment>
                );
            })}
            {isToday && (
                <View style={[styles.plannerNowChip, { top: nowY - 12 }]} pointerEvents="none">
                    <Text style={styles.plannerNowText}>{formatHHMM(nowMinutes)}</Text>
                </View>
            )}
        </View>
    );
}

interface DaySectionProps extends EditCallbacks {
    dayKey: string;
    mode: 'list' | 'planner';
    allTasks: Task[];
    showDisabledTasks: boolean;
    dailyStartMinutes: number;
    nowMinutes: number;
    isToday: boolean;
    width: number;
    padLeft: number;
    padRight: number;
    selectedKey: string | null;
    dragging: boolean;
    /** Pixels per hour in the planner (changes with pinch zoom). */
    hourPx: number;
    hideHeader?: boolean;
    /** Visible part of the day (minutes from the day start); used to limit the fine time marks. */
    win?: { lo: number; hi: number };
    /** Slide-to-add selection (portrait planner). */
    canSlide?: boolean;
    slide?: SlideRange | null;
    onSlide?: (range: SlideRange | null) => void;
    onSliding?: (sliding: boolean) => void;
    onLockScroll?: (locked: boolean) => void;
    /** Journal badges by `${taskId}:${stageId}` (planner cards show them). */
    badges?: Record<string, { notes: number; spend: number }>;
    /** Reports the y offset (within this section) of the NOW marker. */
    onNowY?: (y: number) => void;
}

/** One day of the infinite agenda: header + either the list timeline or the 24h planner grid. */
const DaySection = React.memo(function DaySection({
    dayKey, mode, allTasks, showDisabledTasks, dailyStartMinutes, nowMinutes, isToday, width, padLeft, padRight, onNowY,
    selectedKey, dragging, hourPx, hideHeader, win, canSlide, slide, onSlide, onSliding, onLockScroll, badges, onSelect, onDragState, onCommit, onDelete, onStatus, onEdit,
}: DaySectionProps) {
    const { weekday, date } = dayParts(dayKey);
    const nowD = toDisplayMinutes(nowMinutes, dailyStartMinutes);

    const items = useMemo((): AgendaItem[] => {
        const list: AgendaItem[] = [];
        expandTasksForDate(allTasks, dayKey)
            .filter(t => t && !t.isBacklog && (showDisabledTasks || !t.isDisabled))
            .forEach(task => {
                (task.stages || []).forEach(stage => {
                    if (stage.startTimeMinutes == null && stage.durationMinutes == null) return;
                    const start = stage.startTimeMinutes ?? 0;
                    list.push({
                        id: stage.id,
                        taskId: task.id,
                        task,
                        text: stage.text,
                        startTimeMinutes: start,
                        durationMinutes: stage.durationMinutes ?? 180,
                        status: (stage.status ?? 'Upcoming') as StageStatus,
                        ds: (((start - dailyStartMinutes) % 1440) + 1440) % 1440,
                    });
                });
            });
        return list.sort((a, b) => a.ds - b.ds);
    }, [allTasks, dayKey, showDisabledTasks, dailyStartMinutes]);

    const header = (
        <View style={[styles.dayHeader, { paddingLeft: 18 + padLeft, paddingRight: 18 + padRight }]}>
            <Text style={styles.dayWeekday}>{weekday}</Text>
            <Text style={styles.dayDate}>{date}</Text>
            {isToday && (
                <View style={styles.todayChip}>
                    <Text style={styles.todayChipText}>TODAY</Text>
                </View>
            )}
            <View style={styles.dayRule} />
            <Text style={styles.dayCount}>{items.length}</Text>
        </View>
    );

    if (mode === 'planner') {
        const HR = hourPx;
        const total = 24 * HR;
        // the closer you zoom in, the finer the time marks: hourly -> half-hourly -> quarter-hourly (and 2-hourly when zoomed far out)
        const stepMin = HR >= 1200 ? 1 : HR >= 360 ? 5 : HR >= 200 ? 15 : HR >= 110 ? 30 : HR < 30 ? 120 : 60;
        // at 5- and 1-minute steps there are hundreds of marks: only build the ones around what is on screen
        let marks: number[];
        if (stepMin <= 5 && win) {
            const from = Math.max(0, Math.floor(win.lo / stepMin) * stepMin);
            const to = Math.min(1440, Math.ceil(win.hi / stepMin) * stepMin);
            marks = [];
            for (let m = from; m <= to; m += stepMin) marks.push(m);
        } else {
            marks = Array.from({ length: 1440 / stepMin + 1 }, (_, i) => i * stepMin);
        }
        const slideSnap = stepMin <= 1 ? 1 : 5; // slide-to-add selects in whole minutes at the 1m zoom
        const GAP = 5;
        const MIN_W = 96;
        const availW = width - 2 * 14 - padLeft - padRight - PLANNER_AXIS_W;
        const nowY = (nowD / 60) * HR;

        // overlapping stages share the width in lanes (per cluster of overlaps)
        const evs = items
            .map(e => ({ e, start: e.ds, end: Math.min(1440, e.ds + Math.max(e.durationMinutes, 20)), lane: 0, lanes: 1 }))
            .sort((a, b) => a.start - b.start || b.end - a.end);
        let cluster: typeof evs = [];
        let clusterEnd = -1;
        const flush = () => {
            if (cluster.length === 0) return;
            const laneEnds: number[] = [];
            cluster.forEach(ev => {
                let l = laneEnds.findIndex(end => end <= ev.start);
                if (l === -1) { l = laneEnds.length; laneEnds.push(ev.end); } else laneEnds[l] = ev.end;
                ev.lane = l;
            });
            cluster.forEach(ev => { ev.lanes = laneEnds.length; });
            cluster = [];
        };
        evs.forEach(ev => {
            if (ev.start >= clusterEnd) { flush(); clusterEnd = ev.end; } else clusterEnd = Math.max(clusterEnd, ev.end);
            cluster.push(ev);
        });
        flush();
        const laid = evs.map(({ e, lane, lanes }) => {
            const w = Math.max(MIN_W, (availW - GAP * (lanes - 1)) / lanes);
            return { e, left: lane * (w + GAP), w };
        });
        const innerW = Math.max(availW, ...laid.map(l => l.left + l.w), 0) + 6;

        return (
            <View>
                {hideHeader ? null : header}
                <View style={{ flexDirection: 'row', height: total + 10, paddingLeft: 14 + padLeft, paddingRight: 14 + padRight }}>
                    <SlideAxis
                        hr={HR}
                        total={total}
                        marks={marks}
                        dailyStartMinutes={dailyStartMinutes}
                        isToday={isToday}
                        nowY={nowY}
                        nowMinutes={nowMinutes}
                        enabled={!!canSlide}
                        snap={slideSnap}
                        slide={slide ?? null}
                        onSlide={onSlide ?? (() => {})}
                        onSliding={onSliding ?? (() => {})}
                    />
                    <ScrollView
                        horizontal
                        nestedScrollEnabled
                        scrollEnabled={!dragging}
                        pinchGestureEnabled={false}
                        showsHorizontalScrollIndicator={false}
                        style={{ flex: 1 }}
                        contentContainerStyle={{ width: innerW }}
                    >
                        <SlideLayer
                            width={innerW}
                            height={total + 10}
                            rects={laid.map(({ e, left, w }) => ({ l: left, r: left + w, t: (e.ds / 60) * HR, b: ((e.ds + Math.max(e.durationMinutes, 20)) / 60) * HR }))}
                            hr={HR}
                            snap={slideSnap}
                            enabled={!!canSlide}
                            selectedActive={selectedKey != null}
                            onSlide={onSlide ?? (() => {})}
                            onSliding={onSliding ?? (() => {})}
                            onLock={onLockScroll ?? (() => {})}
                            onDeselect={() => onSelect(null)}
                        >
                            {/* spotlight: while a card is selected the rest of the planner darkens */}
                            {selectedKey != null && (
                                <Animated.View
                                    pointerEvents="none"
                                    entering={FadeIn.duration(220)}
                                    exiting={FadeOut.duration(180)}
                                    style={[StyleSheet.absoluteFill, styles.spotlight]}
                                />
                            )}
                            {marks.map((m) => (
                                <View key={`hr-${m}`} style={[styles.hourRule, m % 60 !== 0 && { backgroundColor: m % 15 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.025)' }, { top: (m / 60) * HR }]} pointerEvents="none" />
                            ))}
                            {slide && (() => {
                                const lo = Math.min(slide.a, slide.b);
                                const hi = Math.max(slide.a, slide.b);
                                const bandH = Math.max(3, ((hi - lo) / 60) * HR);
                                const dMin = hi - lo;
                                const label = dMin >= 60 ? `${Math.floor(dMin / 60)}h${dMin % 60 ? ` ${dMin % 60}m` : ''}` : `${dMin}m`;
                                return (
                                    <View pointerEvents="none" style={[styles.slideBand, { top: (lo / 60) * HR, height: bandH, width: innerW }]}>
                                        <View style={[styles.slideChip, { top: 4 }]}><Text style={styles.slideChipText}>{formatHHMM(dailyStartMinutes + lo)}</Text></View>
                                        {bandH > 56 && <Text style={styles.slideDuration}>{label}</Text>}
                                        {bandH > 36 && <View style={[styles.slideChip, { bottom: 4 }]}><Text style={styles.slideChipText}>{formatHHMM(dailyStartMinutes + hi)}</Text></View>}
                                    </View>
                                );
                            })()}
                            {laid.map(({ e, left, w }) => {
                                const itemKey = `${dayKey}|${e.task.id}|${e.id}`;
                                return (
                                    <PlannerBlock
                                        key={itemKey}
                                        item={e}
                                        itemKey={itemKey}
                                        left={left}
                                        width={w}
                                        hr={HR}
                                        dailyStartMinutes={dailyStartMinutes}
                                        selected={selectedKey === itemKey}
                                        dimmed={selectedKey != null && selectedKey !== itemKey}
                                        notes={badges?.[`${e.taskId}:${e.id}`]?.notes}
                                        spend={badges?.[`${e.taskId}:${e.id}`]?.spend}
                                        onSelect={onSelect}
                                        onDragState={onDragState}
                                        onCommit={onCommit}
                                        onDelete={onDelete}
                                        onStatus={onStatus}
                                        onEdit={onEdit}
                                    />
                                );
                            })}
                            {isToday && (
                                <LinearGradient
                                    pointerEvents="none"
                                    colors={['#4CAF50', 'rgba(76,175,80,0.15)']}
                                    start={{ x: 0, y: 0.5 }}
                                    end={{ x: 1, y: 0.5 }}
                                    style={[styles.plannerNowLine, { top: nowY - 1.5, width: innerW }]}
                                />
                            )}
                        </SlideLayer>
                    </ScrollView>
                </View>
            </View>
        );
    }

    // ---- list timeline ----
    const nowIndex = isToday ? (() => {
        const i = items.findIndex(e => e.ds > nowD);
        return i === -1 ? items.length : i;
    })() : -1;

    const rows: React.ReactNode[] = [];
    const renderNow = (key: string) => (
        <View
            key={key}
            style={styles.nowRow}
            onLayout={(ev) => onNowY?.(ev.nativeEvent.layout.y)}
        >
            <View style={styles.nowChip}>
                <Text style={styles.nowChipText}>NOW {formatHHMM(nowMinutes)}</Text>
            </View>
            <LinearGradient
                colors={['rgba(255,204,0,0.85)', 'rgba(255,204,0,0)']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.nowLine}
            />
        </View>
    );
    items.forEach((e, i) => {
        if (i === nowIndex) rows.push(renderNow('now'));
        const live = e.status === 'Process';
        const th = themeFor(e.status);
        const remaining = live ? Math.max(0, Math.round(e.ds + e.durationMinutes - nowD)) : null;
        const itemKey = `${dayKey}|${e.task.id}|${e.id}`;
        const sel = selectedKey === itemKey;
        rows.push(
            <View key={`row-${e.task.id}-${e.id}`} style={styles.row}>
                <Text style={styles.time}>{formatHHMM(e.startTimeMinutes)}</Text>
                <View style={styles.dotCol}>
                    {live ? <LiveDot color={th.dot} /> : <View style={[styles.dot, { backgroundColor: th.dot }]} />}
                </View>
                <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => onSelect(sel ? null : itemKey)}
                    style={[styles.pill, { backgroundColor: th.bg, borderColor: th.border }, live && styles.pillLive, sel && styles.pillSelected]}
                >
                    <View style={styles.pillText}>
                        <Text style={[styles.pillName, { color: th.name }, live && { fontSize: 14 }]} numberOfLines={1}>{e.text}</Text>
                        {(live || !!e.task.title) && (
                            <Text style={styles.pillSub} numberOfLines={1}>
                                {live ? `IN PROGRESS · ${formatDuration(remaining ?? 0)} LEFT` : e.task.title.toUpperCase()}
                            </Text>
                        )}
                    </View>
                    <Text style={[styles.pillDur, { color: th.name }]}>{formatDuration(e.durationMinutes)}</Text>
                    {sel && (
                        <View style={styles.rowActions}>
                            <ActionDome icon={STATUS_ICON[e.status] ?? 'schedule'} color={th.name} onPress={(x, y) => onStatus(e, x, y)} />
                            <ActionDome icon="delete-outline" color="#FF6B6B" onPress={() => onDelete(e)} />
                        </View>
                    )}
                </TouchableOpacity>
            </View>
        );
    });
    if (isToday && nowIndex === items.length && items.length > 0) rows.push(renderNow('now'));

    return (
        <View>
            {header}
            <View style={{ paddingLeft: 14 + padLeft, paddingRight: 14 + padRight, paddingBottom: 8 }}>
                {items.length === 0 ? (
                    <View style={styles.emptyDay}>
                        <Text style={styles.emptyDayText}>Nothing scheduled</Text>
                    </View>
                ) : (
                    <View>
                        <View style={styles.spine} pointerEvents="none" />
                        {rows}
                    </View>
                )}
            </View>
        </View>
    );
});

export default function AgendaView({
    visible,
    onClose,
    allTasks,
    selectedDate,
    dailyStartMinutes,
    nowMinutes,
    showDisabledTasks = false,
    onUpdateStages,
    embedded = false,
    addTargets = [],
    onAddSubtask,
    onQuickAdd,
    onEditStage,
    onDayChange,
    onSlideActiveChange,
    ideas,
    onAddIdea,
    onDeleteIdea,
    ideasOpen = false,
    onIdeasOpenChange,
    journal,
    onAddJournal,
    onUpdateJournal,
    onDeleteJournal,
    onJournalStageChange,
    journalToggle = 0,
}: AgendaViewProps) {
    const { width, height: winH } = useWindowDimensions();
    const headerH = embedded ? 0 : HEADER_H; // the embedded (portrait) planner shows a single day without a day header
    const insets = useSafeAreaInsets();
    const listRef = useRef<FlatList<string>>(null);

    const todayKey = getLogicalDate(new Date(), dailyStartMinutes);
    const selectedKey = getLogicalDate(selectedDate, dailyStartMinutes);

    const [modeState, setMode] = useState<'list' | 'planner'>('list');
    const mode: 'list' | 'planner' = embedded ? 'planner' : modeState;
    const [pickerOpen, setPickerOpen] = useState(false);
    const [slide, setSlide] = useState<SlideRange | null>(null);          // slide-to-add selection on the time axis
    const [sliding, setSliding] = useState(false);
    const [pickerPayload, setPickerPayload] = useState<{ start: number; dur?: number } | null>(null);
    // slide-to-add sheet: task + name, keyboard-aware, drag the grabber down to dismiss
    const [addTaskId, setAddTaskId] = useState<number | null>(null);
    const [addName, setAddName] = useState('');
    const [nameError, setNameError] = useState(false);
    const [kbH, setKbH] = useState(0);
    const nameRef = useRef<TextInputInstance>(null);
    const sheetY = useSharedValue(0);
    const sheetAnim = useAnimatedStyle(() => ({ transform: [{ translateY: sheetY.value }] }));
    const dismissRef = useRef<() => void>(() => {});
    const sheetPan = useRef(PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => cancelAnimation(sheetY),
        onPanResponderMove: (_, g) => { sheetY.value = Math.max(0, g.dy); },
        onPanResponderRelease: (_, g) => {
            if (g.dy > 70 || g.vy > 0.9) { sheetY.value = withTiming(400, { duration: 160 }); dismissRef.current(); }
            else sheetY.value = withSpring(0, { damping: 18, stiffness: 220 });
        },
        onPanResponderTerminate: () => { sheetY.value = withSpring(0); },
    })).current;
    useEffect(() => {
        const show = Keyboard.addListener('keyboardWillShow', (e) => setKbH(e.endCoordinates.height));
        const showA = Keyboard.addListener('keyboardDidShow', (e) => setKbH(e.endCoordinates.height));
        const hide = Keyboard.addListener('keyboardWillHide', () => setKbH(0));
        const hideA = Keyboard.addListener('keyboardDidHide', () => setKbH(0));
        return () => { show.remove(); showA.remove(); hide.remove(); hideA.remove(); };
    }, []);
    useEffect(() => {
        if (!slide) { setPendingIdea(null); setAddName(''); setNameError(false); sheetY.value = 0; Keyboard.dismiss(); setTaskPick(false); }
    }, [slide, sheetY]);
    dismissRef.current = () => { Keyboard.dismiss(); setSlide(null); };

    useEffect(() => { onSlideActiveChange?.(embedded && !!slide); }, [embedded, slide, onSlideActiveChange]);
    // idea tray: the idea being placed (its name pre-fills the add sheet) and whether one is being dragged
    const [pendingIdea, setPendingIdea] = useState<Idea | null>(null);
    const [ideaDragging, setIdeaDragging] = useState(false);
    const [taskPick, setTaskPick] = useState(false); // slide-to-add: the task choice opens inside the same block
    const [zoomOpen, setZoomOpen] = useState(false); // the floating zoom controller shows / hides with one button
    const [days, setDays] = useState<string[]>([]);
    const [ready, setReady] = useState(false);       // initial scroll done: safe to load earlier days
    const [headerKey, setHeaderKey] = useState(selectedKey);
    const [popup, setPopup] = useState<{ item: AgendaItem; x: number; y: number } | null>(null);
    const didInitialScroll = useRef(false);
    const headerKeyRef = useRef(selectedKey);
    const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);

    // ---- pinch to zoom the planner's time axis (interval small <-> big) ----
    // The whole pinch runs on the UI thread (gesture-handler + reanimated worklets): the planner is only stretched with a
    // transform while the fingers move, and the real hour height is applied once on release.
    const [hourPx, setHourPx] = useState(PLANNER_HOUR_PX);
    const [pinching, setPinching] = useState(false);
    const hourSV = useSharedValue(PLANNER_HOUR_PX);
    const scrollYSV = useSharedValue(0);
    const pinchScale = useSharedValue(1);
    const focal0 = useSharedValue(0);   // where the fingers first were (y inside the panel)
    const focalT = useSharedValue(0);   // where the fingers are now
    const panelH = useSharedValue(600);
    const [win, setWin] = useState<{ lo: number; hi: number }>({ lo: 0, hi: 1440 });
    const viewHRef = useRef(600);
    const panelRef = useRef<HostInstance>(null);
    const panelTopRef = useRef(0);
    // idea drag: the finger and the drop preview run on the UI thread so the drag stays smooth
    const ideaX = useSharedValue(0);
    const ideaY = useSharedValue(0);
    const ideaOn = useSharedValue(0);
    const panelTopSV = useSharedValue(0);
    const zoneTopSV = useSharedValue(99999);
    const winBucket = useRef(-1);
    const initHr = useSharedValue(PLANNER_HOUR_PX);
    const anchorDay = useSharedValue(0);
    const anchorT = useSharedValue(0);
    const commitRef = useRef({ day: 0, t: 0, focalY: 0 });
    const pendingCommit = useRef(false);
    const draggingSV = useSharedValue(false);
    useEffect(() => { draggingSV.value = dragging; }, [dragging, draggingSV]);
    const modeRef = useRef<'list' | 'planner'>('list');

    useEffect(() => {
        AsyncStorage.getItem(HOUR_PX_KEY).then(v => {
            const n = v ? parseFloat(v) : NaN;
            if (!isNaN(n)) {
                const c = Math.max(MIN_HOUR_PX, Math.min(MAX_HOUR_PX, n));
                hourSV.value = c;
                setHourPx(c);
            }
        }).catch(() => {});
    }, [hourSV]);

    const pinchStyle = useAnimatedStyle(() => {
        const sc = pinchScale.value;
        return {
            transform: [
                { translateY: (focal0.value - panelH.value / 2) * (1 - sc) + (focalT.value - focal0.value) },
                { scaleY: sc },
            ],
        };
    });

    const startPinchJS = useCallback(() => setPinching(true), []);
    const finishPinchJS = useCallback((newHr: number, day: number, t: number, focalY: number, changed: boolean) => {
        setPinching(false);
        if (!changed) return;
        commitRef.current = { day, t, focalY };
        pendingCommit.current = true;
        setHourPx(newHr);
        AsyncStorage.setItem(HOUR_PX_KEY, String(newHr)).catch(() => {});
    }, []);

    const pinchGesture = useMemo(() => Gesture.Pinch()
        .enabled(mode === 'planner')
        .onStart((e) => {
            'worklet';
            if (draggingSV.value) return;
            initHr.value = hourSV.value;
            // which day / time of day sits between the fingers; held there for the whole pinch
            const focalY = e.focalY;
            const Hnow = headerH + 24 * hourSV.value + 10;
            const contentY = scrollYSV.value + focalY;
            const day = Math.max(0, Math.floor(contentY / Hnow));
            const within = contentY - day * Hnow - headerH;
            anchorDay.value = day;
            anchorT.value = Math.max(0, Math.min(1, within / (24 * hourSV.value)));
            pinchScale.value = 1;
            focal0.value = focalY;
            focalT.value = focalY;
            runOnJS(startPinchJS)();
        })
        .onUpdate((e) => {
            'worklet';
            const lo = MIN_HOUR_PX / initHr.value;
            const hi = MAX_HOUR_PX / initHr.value;
            pinchScale.value = Math.max(lo, Math.min(hi, e.scale));
            focalT.value = e.focalY;
        })
        .onEnd(() => {
            'worklet';
            const newHr = Math.max(MIN_HOUR_PX, Math.min(MAX_HOUR_PX, initHr.value * pinchScale.value));
            const changed = Math.abs(newHr - initHr.value) >= 0.5;
            if (changed) hourSV.value = newHr;
            else pinchScale.value = withSpring(1, { damping: 18, stiffness: 220 });
            runOnJS(finishPinchJS)(newHr, anchorDay.value, anchorT.value, focalT.value, changed);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode]);

    // zoom changed: rebuild the window of fine time marks around what is on screen
    useEffect(() => {
        winBucket.current = -1;
        const viewMin = (viewHRef.current / hourPx) * 60;
        const top = ((scrollYSV.value - headerH) / hourPx) * 60;
        setWin({ lo: top - viewMin, hi: top + 2 * viewMin });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hourPx]);

    // after the zoom is committed: scroll so the anchored time sits under the fingers, then drop the temporary transform
    useEffect(() => {
        if (!pendingCommit.current) return;
        pendingCommit.current = false;
        const a = commitRef.current;
        const H = headerH + 24 * hourPx + 10;
        const y = a.day * H + headerH + a.t * 24 * hourPx - a.focalY;
        const id = requestAnimationFrame(() => {
            listRef.current?.scrollToOffset({ offset: Math.max(0, y), animated: false });
            requestAnimationFrame(() => { pinchScale.value = 1; focal0.value = 0; focalT.value = 0; });
        });
        return () => cancelAnimationFrame(id);
    }, [hourPx, pinchScale, focal0, focalT]);

    const handleSelect = useCallback((key: string | null) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setSelectedItemKey(key);
    }, []);

    const handleCommit = useCallback((item: AgendaItem, newStart: number, newDuration: number) => {
        if (!onUpdateStages) return;
        const stages = (item.task.stages || []).map(st =>
            st.id === item.id ? { ...st, startTimeMinutes: newStart, durationMinutes: newDuration } : st
        );
        onUpdateStages(item.task, stages);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }, [onUpdateStages]);

    const handleDelete = useCallback((item: AgendaItem) => {
        if (!onUpdateStages) return;
        const task = item.task;
        const without = (task.stages || []).filter(st => st.id !== item.id);
        const stage = task.stages?.find(st => st.id === item.id);
        const isLocalOnly = !stage?.syncMode || stage.syncMode === 'none';
        const done = () => { setSelectedItemKey(null); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); };
        if (task.recurrence && !task.recurrence.repeatSync && !isLocalOnly) {
            Alert.alert('Delete Subtask', 'Do you want to delete this subtask from all days or just this day?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'This Day', onPress: () => { onUpdateStages(task, without, 'none'); done(); } },
                { text: 'All Days', style: 'destructive', onPress: () => { onUpdateStages(task, without, 'all'); done(); } },
            ]);
        } else {
            Alert.alert('Delete Subtask', 'Are you sure you want to delete this subtask?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => { onUpdateStages(task, without); done(); } },
            ]);
        }
    }, [onUpdateStages]);

    const handleStatus = useCallback((item: AgendaItem, x: number, y: number) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setPopup({ item, x, y });
    }, []);

    const makeWindow = useCallback((startKey: string) => Array.from({ length: embedded ? 1 : LOAD_STEP }, (_, i) => addDays(startKey, i)), [embedded]);

    useEffect(() => {
        if (embedded) return;
        AsyncStorage.getItem(VIEW_MODE_KEY)
            .then(v => { if (v === 'list' || v === 'planner') setMode(v); })
            .catch(() => {});
    }, []);

    // (re)open: start on the selected day
    useEffect(() => {
        if (visible) {
            setDays(makeWindow(selectedKey));
            setHeaderKey(selectedKey);
            headerKeyRef.current = selectedKey;
            didInitialScroll.current = false;
            setReady(false);
        } else {
            setPopup(null);
            setSelectedItemKey(null);
            setDragging(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, embedded ? selectedKey : null]);

    const finishInitialScroll = useCallback((offset: number) => {
        if (didInitialScroll.current) return;
        didInitialScroll.current = true;
        listRef.current?.scrollToOffset({ offset: Math.max(0, offset), animated: false });
        setTimeout(() => setReady(true), 150);
    }, []);

    // when there is no NOW marker to scroll to, unlock earlier days shortly after the first layout
    useEffect(() => {
        if (!visible || days.length === 0) return;
        const t = setTimeout(() => {
            if (!didInitialScroll.current) finishInitialScroll(0);
        }, 600);
        return () => clearTimeout(t);
    }, [visible, mode, days, finishInitialScroll]);

    // ---- idea tray: place an idea by tap (near the middle of the screen) or by dragging it onto the planner ----
    const ideaBottom = 64 + Math.max(insets.bottom, 0);
    const ideaZoneTop = winH - ideaBottom - 60; // below this line a dropped idea is cancelled (back on the tray)
    const minuteAtY = (pageY: number) => {
        const m = ((scrollYSV.value + (pageY - panelTopRef.current)) / hourPx) * 60;
        return Math.max(0, Math.min(1410, Math.round(m / 5) * 5));
    };
    const placeIdea = (idea: Idea) => {
        const mid = minuteAtY(panelTopRef.current + viewHRef.current / 2);
        setPendingIdea(idea);
        setSlide({ a: mid, b: mid + 30 });
    };
    useEffect(() => { zoneTopSV.value = ideaZoneTop; }, [ideaZoneTop, zoneTopSV]);
    const ideaBandStyle = useAnimatedStyle(() => {
        if (ideaOn.value !== 1 || ideaY.value >= zoneTopSV.value) return { opacity: 0 };
        const hr = hourSV.value;
        const m = Math.max(0, Math.min(1410, Math.round((((scrollYSV.value + ideaY.value - panelTopSV.value) / hr) * 60) / 5) * 5));
        return { opacity: 1, top: (m / 60) * hr - scrollYSV.value, height: Math.max(10, (30 / 60) * hr) };
    });
    const dragIdeaStart = (idea: Idea) => {
        panelRef.current?.measureInWindow((_x, y) => { panelTopRef.current = y; panelTopSV.value = y; });
        setPendingIdea(idea);
        setIdeaDragging(true);
    };
    const dragIdeaEnd = (_idea: Idea, _x: number, y: number) => {
        setIdeaDragging(false);
        if (y >= ideaZoneTop) { setPendingIdea(null); return; }
        const m = minuteAtY(y);
        setSlide({ a: m, b: m + 30 });
    };

    const changeMode = (m: 'list' | 'planner') => {
        if (m === modeState) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setMode(m);
        setSelectedItemKey(null);
        AsyncStorage.setItem(VIEW_MODE_KEY, m).catch(() => {});
        // restart from the day currently on screen
        setDays(makeWindow(headerKeyRef.current));
        didInitialScroll.current = false;
        setReady(false);
    };

    const jumpToToday = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setDays(makeWindow(todayKey));
        setHeaderKey(todayKey);
        headerKeyRef.current = todayKey;
        didInitialScroll.current = false;
        setReady(false);
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
    };

    const loadLater = () => {
        if (embedded) return;
        setDays(prev => (prev.length ? [...prev, ...Array.from({ length: LOAD_STEP }, (_, i) => addDays(prev[prev.length - 1], i + 1))] : prev));
    };
    const loadEarlier = () => {
        if (embedded) return;
        if (!ready) return;
        setDays(prev => (prev.length ? [...Array.from({ length: LOAD_STEP }, (_, i) => addDays(prev[0], i - LOAD_STEP)), ...prev] : prev));
    };

    const viewableRef = useRef(({ viewableItems }: { viewableItems: Array<{ item: string }> }) => {
        const first = viewableItems[0]?.item;
        if (first && first !== headerKeyRef.current) {
            headerKeyRef.current = first;
            setHeaderKey(first);
        }
    });
    const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 20 }).current;

    const sidePadL = Math.max(insets.left, 0);
    const sidePadR = Math.max(insets.right, 0);
    const planner = mode === 'planner';
    const plannerWidth = embedded ? width - 8 : width; // the zoom controller floats over the planner (portrait)
    modeRef.current = mode;

    // planner: open scrolled to NOW when the first day is today
    useEffect(() => {
        if (!visible || !planner || days.length === 0 || didInitialScroll.current) return;
        if (days[0] === todayKey) {
            const nowY = (toDisplayMinutes(nowMinutes, dailyStartMinutes) / 60) * hourPx;
            const t = setTimeout(() => finishInitialScroll(headerH + nowY - 160), 80);
            return () => clearTimeout(t);
        }
    }, [visible, planner, days, todayKey, nowMinutes, dailyStartMinutes, finishInitialScroll]);

    // ---- day journal: badges on cards and the subtasks an entry can link to ----
    const journalBadges = useMemo(() => {
        const map: Record<string, { notes: number; spend: number }> = {};
        (journal ?? []).forEach(e => {
            if (e.day !== selectedKey || e.taskId === undefined || e.stageId === undefined) return;
            const k = `${e.taskId}:${e.stageId}`;
            const b = map[k] ?? (map[k] = { notes: 0, spend: 0 });
            if (e.type === 'note') b.notes += 1;
            else b.spend += e.amount ?? 0;
        });
        return map;
    }, [journal, selectedKey]);
    const journalSubtasks = useMemo((): JournalSubtask[] => {
        const list: JournalSubtask[] = [];
        expandTasksForDate(allTasks, selectedKey)
            .filter(t => t && !t.isBacklog && (showDisabledTasks || !t.isDisabled))
            .forEach(task => (task.stages || []).forEach(stage => {
                if (stage.startTimeMinutes == null && stage.durationMinutes == null) return;
                list.push({ taskId: task.id, stageId: stage.id, text: stage.text, taskTitle: task.title });
            }));
        return list;
    }, [allTasks, selectedKey, showDisabledTasks]);

    // locks the page scroll synchronously (a state update arrives a frame too late once the finger moves)
    const lockScroll = useCallback((locked: boolean) => {
        (listRef.current as any)?.getNativeScrollRef?.()?.setNativeProps?.({ scrollEnabled: !locked });
    }, []);

    const renderDay = useCallback(({ item: key, index }: { item: string; index: number }) => (
        <DaySection
            dayKey={key}
            mode={mode}
            allTasks={allTasks}
            showDisabledTasks={showDisabledTasks}
            dailyStartMinutes={dailyStartMinutes}
            nowMinutes={nowMinutes}
            isToday={key === todayKey}
            width={plannerWidth}
            padLeft={sidePadL}
            padRight={sidePadR}
            selectedKey={selectedItemKey}
            dragging={dragging}
            hourPx={hourPx}
            hideHeader={embedded}
            win={win}
            canSlide={embedded && !!onAddSubtask && addTargets.length > 0}
            slide={embedded && key === selectedKey ? slide : null}
            onSlide={setSlide}
            onSliding={(v) => { setSliding(v); setDragging(v); if (v) setSelectedItemKey(null); }}
            onSelect={handleSelect}
            onLockScroll={lockScroll}
            badges={journalBadges}
            onDragState={setDragging}
            onCommit={handleCommit}
            onDelete={handleDelete}
            onStatus={handleStatus}
            onEdit={onEditStage && key === selectedKey ? onEditStage : undefined}
            onNowY={index === 0 && key === todayKey && mode === 'list' ? (y) => finishInitialScroll(headerH + y - 150) : undefined}
        />
    ), [mode, allTasks, showDisabledTasks, dailyStartMinutes, nowMinutes, todayKey, width, sidePadL, sidePadR, finishInitialScroll, selectedItemKey, dragging, hourPx, handleSelect, handleCommit, handleDelete, handleStatus, onEditStage, selectedKey, embedded, plannerWidth, slide, lockScroll, journalBadges, onAddSubtask, addTargets.length, win]);

    // ---- zoom rail (portrait): + / - and one-tap steps for the time interval ----
    const ZOOM_STEPS = [{ label: '1m', px: 1500 }, { label: '5m', px: 480 }, { label: '15m', px: 240 }, { label: '30m', px: 130 }, { label: '1h', px: 60 }, { label: '2h', px: 28 }];
    const activeZoom = ZOOM_STEPS.reduce((best, st) => (Math.abs(Math.log(st.px / hourPx)) < Math.abs(Math.log(best.px / hourPx)) ? st : best), ZOOM_STEPS[4]);
    const applyZoom = (px: number) => {
        const newHr = Math.max(MIN_HOUR_PX, Math.min(MAX_HOUR_PX, px));
        if (Math.abs(newHr - hourPx) < 0.5) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        // keep the time at the middle of the screen where it was
        const viewH = panelH.value;
        const contentY = scrollYSV.value + viewH / 2;
        const t = Math.max(0, Math.min(1, (contentY - headerH) / (24 * hourPx)));
        commitRef.current = { day: 0, t, focalY: viewH / 2 };
        pendingCommit.current = true;
        hourSV.value = newHr;
        setHourPx(newHr);
        AsyncStorage.setItem(HOUR_PX_KEY, String(newHr)).catch(() => {});
    };
    const jumpToNow = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const nowY = (toDisplayMinutes(nowMinutes, dailyStartMinutes) / 60) * hourPx;
        listRef.current?.scrollToOffset({ offset: Math.max(0, headerH + nowY - panelH.value * 0.4), animated: true });
    };

    const { weekday, date } = dayParts(headerKey);

    const content = (
        <View style={[styles.container, { paddingTop: Math.max(insets.top, 14) }]}>
            {/* Header */}
            <View style={[styles.header, { paddingHorizontal: Math.max(insets.left, insets.right, 16) }]}>
                <View style={styles.domeSocket}>
                    <TouchableOpacity
                        style={styles.dome}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onClose(); }}
                        activeOpacity={0.7}
                    >
                        <MaterialIcons name="close" size={16} color="rgba(255,255,255,0.92)" />
                    </TouchableOpacity>
                </View>
                {embedded ? (
                    <View style={styles.daySwitch}>
                        <TouchableOpacity style={styles.daySwitchBtn} activeOpacity={0.7} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onDayChange?.(addDays(selectedKey, -1)); }}>
                            <MaterialIcons name="chevron-left" size={20} color="#FFFFFF" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.daySwitchMid} activeOpacity={0.8} onPress={() => { if (selectedKey !== todayKey) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onDayChange?.(todayKey); } }}>
                            <Text style={styles.daySwitchTitle}>{dayParts(selectedKey).weekday.slice(0, 3)} · {dayParts(selectedKey).date}</Text>
                            <Text style={[styles.daySwitchSub, selectedKey !== todayKey && { color: 'rgba(255,255,255,0.5)' }]}>
                                {selectedKey === todayKey ? 'TODAY' : 'TAP FOR TODAY'}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.daySwitchBtn} activeOpacity={0.7} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onDayChange?.(addDays(selectedKey, 1)); }}>
                            <MaterialIcons name="chevron-right" size={20} color="#FFFFFF" />
                        </TouchableOpacity>
                    </View>
                ) : (
                <View style={styles.titleWrap}>
                    <Text style={styles.title}>AGENDA</Text>
                    <Text style={styles.titleSub}>{weekday.slice(0, 3)} · {date}</Text>
                </View>
                )}
                {embedded && addTargets.length > 0 && !!onAddSubtask && (
                    <TouchableOpacity
                        style={styles.jumpBtn}
                        activeOpacity={0.8}
                        onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            const startAt = (Math.round(nowMinutes / 5) * 5) % 1440;
                            if (addTargets.length === 1) onAddSubtask(addTargets[0].id, startAt);
                            else { setPickerPayload({ start: startAt }); setPickerOpen(true); }
                        }}
                    >
                        <MaterialIcons name="add" size={15} color="#7BE18A" />
                        <Text style={[styles.jumpText, { color: '#7BE18A' }]}>ADD</Text>
                    </TouchableOpacity>
                )}
                {!embedded && headerKey !== todayKey && (
                    <TouchableOpacity style={styles.jumpBtn} onPress={jumpToToday} activeOpacity={0.8}>
                        <MaterialIcons name="today" size={13} color="#FFD83A" />
                        <Text style={styles.jumpText}>TODAY</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* View switch: list timeline / day planner */}
            {!embedded && <View style={styles.modeWrap}>
                <View style={styles.modeWell}>
                    {([['list', 'LIST', 'view-agenda'], ['planner', 'PLANNER', 'calendar-view-day']] as const).map(([key, label, icon]) => {
                        const on = mode === key;
                        return (
                            <TouchableOpacity key={key} style={[styles.modeItem, on && styles.modeItemOn]} onPress={() => changeMode(key)} activeOpacity={0.85}>
                                <MaterialIcons name={icon as any} size={14} color={on ? '#0A0C10' : 'rgba(255,255,255,0.6)'} />
                                <Text style={[styles.modeText, on && { color: '#0A0C10' }]}>{label}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>}

            {/* Infinite, day after day (portrait: one day + zoom rail) */}
            <View style={styles.panelRow}>
            <GestureDetector gesture={pinchGesture}>
            <View
                ref={panelRef}
                style={styles.panel}
                onLayout={(e) => { panelH.value = e.nativeEvent.layout.height; viewHRef.current = e.nativeEvent.layout.height; }}
            >
                <Animated.View style={[{ flex: 1 }, pinchStyle]}>
                <FlatList
                    key={mode}
                    ref={listRef}
                    data={days}
                    keyExtractor={(k) => k}
                    renderItem={renderDay}
                    extraData={`${mode}|${Math.floor(nowMinutes)}|${allTasks.length}|${selectedItemKey}|${dragging}|${hourPx}|${slide ? `${slide.a}-${slide.b}` : 'none'}`}
                    scrollEnabled={!dragging && !pinching}
                    pinchGestureEnabled={false}
                    onScroll={(e) => {
                        const y = e.nativeEvent.contentOffset.y;
                        scrollYSV.value = y;
                        // fine zoom: keep a window of the day (a screen either side) for the minute marks
                        const viewMin = (viewHRef.current / hourPx) * 60;
                        const top = ((y - headerH) / hourPx) * 60;
                        const bucket = Math.floor(top / Math.max(1, viewMin / 3));
                        if (bucket !== winBucket.current) {
                            winBucket.current = bucket;
                            setWin({ lo: top - viewMin, hi: top + 2 * viewMin });
                        }
                    }}
                    scrollEventThrottle={16}
                    showsVerticalScrollIndicator={false}
                    onEndReached={loadLater}
                    onEndReachedThreshold={1.2}
                    onStartReached={loadEarlier}
                    onStartReachedThreshold={1.2}
                    maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
                    onViewableItemsChanged={viewableRef.current}
                    viewabilityConfig={viewabilityConfig}
                    initialNumToRender={2}
                    windowSize={5}
                    maxToRenderPerBatch={2}
                    contentContainerStyle={{ paddingBottom: (embedded ? 150 : 30) + Math.max(insets.bottom, 0) }}
                />
                </Animated.View>
                {embedded && (
                    <Animated.View
                        pointerEvents="none"
                        style={[styles.ideaBand, { left: 14 + sidePadL + PLANNER_AXIS_W, right: 14 + sidePadR }, ideaBandStyle]}
                    />
                )}
            </View>
            </GestureDetector>

            {embedded && (
                <View style={styles.zoomRailWrap} pointerEvents="box-none">
                    <TouchableOpacity
                        style={[styles.zoomToggle, zoomOpen && styles.zoomToggleOn]}
                        activeOpacity={0.8}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setZoomOpen(v => !v); }}
                    >
                        <MaterialIcons name={zoomOpen ? 'close' : 'zoom-in'} size={16} color={zoomOpen ? '#0A0C10' : '#FFFFFF'} />
                    </TouchableOpacity>
                    {zoomOpen && (
                        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={styles.zoomPanel}>
                    <View style={styles.zoomRail}>
                                <TouchableOpacity style={styles.zoomBtn} activeOpacity={0.7} onPress={() => applyZoom(hourPx * 1.5)}>
                                    <MaterialIcons name="add" size={16} color="#FFFFFF" />
                                </TouchableOpacity>
                                <View style={styles.zoomSteps}>
                                    {ZOOM_STEPS.map(st => {
                                        const on = st.label === activeZoom.label;
                                        return (
                                            <TouchableOpacity key={st.label} style={[styles.zoomStep, on && styles.zoomStepOn]} activeOpacity={0.8} onPress={() => applyZoom(st.px)}>
                                                <Text style={[styles.zoomStepText, on && { color: '#0A0C10' }]}>{st.label}</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                                <TouchableOpacity style={styles.zoomBtn} activeOpacity={0.7} onPress={() => applyZoom(hourPx / 1.5)}>
                                    <MaterialIcons name="remove" size={16} color="#FFFFFF" />
                                </TouchableOpacity>
                            </View>
                            <Text style={styles.zoomLabel}>ZOOM</Text>
                            <TouchableOpacity style={styles.nowJumpBtn} activeOpacity={0.8} onPress={jumpToNow}>
                                <Text style={styles.nowJumpText}>NOW</Text>
                                <MaterialIcons name="south" size={15} color="#7BE18A" />
                            </TouchableOpacity>
                        </Animated.View>
                    )}
                </View>
            )}
            </View>

            {embedded && !!onAddJournal && !!onUpdateJournal && !!onDeleteJournal && !slide && (
                <JournalSheet
                    entries={journal ?? []}
                    dayKey={selectedKey}
                    todayKey={todayKey}
                    dayLabel={`${dayParts(selectedKey).weekday.slice(0, 3)} · ${dayParts(selectedKey).date}`}
                    onPrevDay={() => onDayChange?.(addDays(selectedKey, -1))}
                    onNextDay={() => onDayChange?.(addDays(selectedKey, 1))}
                    onToday={() => { if (selectedKey !== todayKey) onDayChange?.(todayKey); }}
                    subtasks={journalSubtasks}
                    dailyStartMinutes={dailyStartMinutes}
                    nowMinutes={nowMinutes}
                    topInset={Math.max(insets.top, 0)}
                    bottomInset={Math.max(insets.bottom, 0)}
                    toggleSignal={journalToggle}
                    keyboardHeight={kbH}
                    onStageChange={(s) => onJournalStageChange?.(s)}
                    onAdd={onAddJournal}
                    onUpdate={onUpdateJournal}
                    onDelete={onDeleteJournal}
                />
            )}

            {embedded && !!onAddIdea && !!onDeleteIdea && (!slide || ideaDragging) && (
                <IdeaTray
                    ideas={ideas ?? []}
                    open={ideasOpen}
                    todayKey={todayKey}
                    right={Math.max(14, insets.right + 10)}
                    onOpenChange={(o) => onIdeasOpenChange?.(o)}
                    bottom={ideaBottom}
                    keyboardHeight={kbH}
                    onAdd={onAddIdea}
                    onDelete={onDeleteIdea}
                    onPlace={placeIdea}
                    onDragStart={dragIdeaStart}
                    dragX={ideaX}
                    dragY={ideaY}
                    dragOn={ideaOn}
                    onDragEnd={dragIdeaEnd}
                />
            )}

            <StageActionPopup
                visible={!!popup}
                position={popup ? { x: popup.x, y: popup.y } : { x: 0, y: 0 }}
                currentStatus={popup?.item.status ?? 'Upcoming'}
                onClose={() => setPopup(null)}
                onSelectStatus={(status) => {
                    const p = popup;
                    setPopup(null);
                    if (!p || !onUpdateStages) return;
                    const stages = (p.item.task.stages || []).map(s =>
                        s.id === p.item.id ? { ...s, status, isCompleted: status === 'Done' } : s
                    );
                    onUpdateStages(p.item.task, stages);
                }}
            />
            {embedded && slide && !sliding && !pickerOpen && !!onAddSubtask && addTargets.length > 0 && (() => {
                const lo = Math.min(slide.a, slide.b);
                const hi = Math.max(slide.a, slide.b);
                const dMin = hi - lo;
                const startAt = (lo + dailyStartMinutes) % 1440;
                const label = dMin >= 60 ? `${Math.floor(dMin / 60)}h${dMin % 60 ? ` ${dMin % 60}m` : ''}` : `${dMin}m`;
                const addTo = (taskId: number) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); if (pendingIdea && onQuickAdd) {
                        // a dropped idea: only the task is asked, it is placed with the idea's own name
                        onQuickAdd(taskId, pendingIdea.title, startAt, dMin);
                        onDeleteIdea?.(pendingIdea.id);
                    } else {
                        onAddSubtask(taskId, startAt, dMin);
                    }
                    setSlide(null);
                };
                return (
                    <Animated.View
                        entering={FadeIn.duration(170)}
                        exiting={FadeOut.duration(130)}
                        style={[styles.slideBarWrap, { bottom: 8 + Math.max(insets.bottom, 0) }]}
                        pointerEvents="box-none"
                    >
                        <View style={styles.slideBarOne}>
                            {!taskPick ? (
                                <>
                                    <View style={[styles.deepSocket, { width: 46, height: 46, borderRadius: 23 }]}>
                                        <TouchableOpacity
                                            style={[styles.deepDome, { width: 36, height: 36, borderRadius: 18 }]}
                                            activeOpacity={0.85}
                                            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSlide(null); }}
                                        >
                                            <MaterialIcons name="close" size={18} color="#FFFFFF" />
                                        </TouchableOpacity>
                                    </View>
                                    <View style={styles.slideBarMid}>
                                        <Text style={styles.slideCardRange}>{formatHHMM(startAt)} – {formatHHMM(startAt + dMin)}</Text>
                                        <View style={styles.slideCardLen}><Text style={styles.slideCardLenText}>{label}</Text></View>
                                    </View>
                                    <View style={[styles.deepSocket, { width: 52, height: 52, borderRadius: 26 }]}>
                                        <TouchableOpacity
                                            style={[styles.deepDome, styles.deepDomePrimary, { width: 42, height: 42, borderRadius: 21 }]}
                                            activeOpacity={0.85}
                                            onPress={() => {
                                                // one task: straight to the add form; several: the task choice opens in this same line
                                                if (addTargets.length === 1) { addTo(addTargets[0].id); return; }
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                                setTaskPick(true);
                                            }}
                                        >
                                            <MaterialIcons name="add" size={26} color="#FFFFFF" />
                                        </TouchableOpacity>
                                    </View>
                                </>
                            ) : (
                                <>
                                    <View style={[styles.deepSocket, { width: 46, height: 46, borderRadius: 23 }]}>
                                        <TouchableOpacity
                                            style={[styles.deepDome, { width: 36, height: 36, borderRadius: 18 }]}
                                            activeOpacity={0.85}
                                            onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setTaskPick(false); }}
                                        >
                                            <MaterialIcons name="arrow-back" size={18} color="#FFFFFF" />
                                        </TouchableOpacity>
                                    </View>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={styles.slideBarTasks}>
                                        {addTargets.map(t => (
                                            <TouchableOpacity key={t.id} style={styles.slideBarTask} activeOpacity={0.85} onPress={() => addTo(t.id)}>
                                                <View style={[styles.slideTaskDot, { backgroundColor: t.color || '#9AA1AE' }]} />
                                                <Text style={styles.slideBarTaskText} numberOfLines={1}>{t.title}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                    <View style={[styles.deepSocket, { width: 46, height: 46, borderRadius: 23 }]}>
                                        <TouchableOpacity
                                            style={[styles.deepDome, { width: 36, height: 36, borderRadius: 18 }]}
                                            activeOpacity={0.85}
                                            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSlide(null); }}
                                        >
                                            <MaterialIcons name="close" size={18} color="#FFFFFF" />
                                        </TouchableOpacity>
                                    </View>
                                </>
                            )}
                        </View>
                    </Animated.View>
                );
            })()}

            {pickerOpen && (
                <View style={styles.pickerBackdrop}>
                    <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setPickerOpen(false)} />
                    <View style={styles.pickerCard}>
                        <Text style={styles.pickerTitle}>ADD SUBTASK TO</Text>
                        <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
                            {addTargets.map(t => (
                                <TouchableOpacity
                                    key={t.id}
                                    style={styles.pickerRow}
                                    activeOpacity={0.8}
                                    onPress={() => {
                                        setPickerOpen(false);
                                        onAddSubtask?.(t.id, pickerPayload?.start ?? ((Math.round(nowMinutes / 5) * 5) % 1440), pickerPayload?.dur);
                                        setSlide(null);
                                    }}
                                >
                                    <View style={[styles.pickerDot, { backgroundColor: t.color || '#9AA1AE' }]} />
                                    <Text style={styles.pickerName} numberOfLines={1}>{t.title}</Text>
                                    <MaterialIcons name="add" size={16} color="rgba(255,255,255,0.6)" />
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            )}
        </View>
    );

    if (embedded) {
        return <View style={[StyleSheet.absoluteFill, { zIndex: 6000 }]}>{content}</View>;
    }

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            statusBarTranslucent
            supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
            onRequestClose={onClose}
        >
            <GestureHandlerRootView style={{ flex: 1 }}>
                <StatusBar hidden />
                {content}
            </GestureHandlerRootView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    ideaBand: {
        position: 'absolute',
        zIndex: 20,
        borderRadius: 12,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: 'rgba(123,225,138,0.9)',
        backgroundColor: 'rgba(76,175,80,0.16)',
    },
    container: {
        flex: 1,
        backgroundColor: '#000000',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingBottom: 12,
    },
    domeSocket: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0B0C0F',
        boxShadow: SUNK,
    },
    dome: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1D2128',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -3px 0 rgba(0,0,0,0.35), 0 5px 9px rgba(0,0,0,0.6)',
    },
    daySwitch: {
        flex: 1,
        minWidth: 0,
        height: 40,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
        borderRadius: 20,
        backgroundColor: '#0B0C0F',
        boxShadow: 'inset 0 3px 8px rgba(0,0,0,0.85), 0 1px 0 rgba(255,255,255,0.06)',
    },
    daySwitchBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1D2128',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -2px 0 rgba(0,0,0,0.35), 0 3px 6px rgba(0,0,0,0.6)',
    },
    daySwitchMid: {
        flex: 1,
        alignItems: 'center',
    },
    daySwitchTitle: {
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 2,
        color: '#FFFFFF',
    },
    daySwitchSub: {
        marginTop: 2,
        fontSize: 7.5,
        fontWeight: '800',
        letterSpacing: 2,
        color: '#7BE18A',
    },
    titleWrap: {
        flex: 1,
        minWidth: 90,
    },
    title: {
        fontSize: 15,
        fontWeight: '800',
        letterSpacing: 3.4,
        color: '#FFFFFF',
    },
    titleSub: {
        marginTop: 2,
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 2.2,
        color: 'rgba(255,255,255,0.45)',
    },
    jumpBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        height: 32,
        paddingHorizontal: 12,
        flexShrink: 0,
        borderRadius: 16,
        backgroundColor: '#1D2128',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -2px 0 rgba(0,0,0,0.35), 0 4px 7px rgba(0,0,0,0.55)',
    },
    jumpText: {
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 1.8,
        color: '#FFD83A',
    },
    pickerBackdrop: {
        ...StyleSheet.absoluteFill,
        backgroundColor: 'rgba(0,0,0,0.6)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
    },
    pickerCard: {
        width: 300,
        maxWidth: '86%',
        padding: 14,
        borderRadius: 26,
        backgroundColor: '#14171B',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.09), 0 18px 30px rgba(0,0,0,0.7)',
    },
    pickerTitle: {
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 2.4,
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 10,
        marginLeft: 6,
    },
    pickerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        height: 44,
        paddingHorizontal: 14,
        marginBottom: 6,
        borderRadius: 22,
        backgroundColor: '#1D2128',
        boxShadow: RAISED,
    },
    pickerDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    pickerName: {
        flex: 1,
        fontSize: 13,
        fontWeight: '800',
        color: '#FFFFFF',
    },
    modeWrap: {
        alignItems: 'center',
        paddingBottom: 12,
    },
    modeWell: {
        flexDirection: 'row',
        padding: 4,
        borderRadius: 20,
        backgroundColor: '#0B0C0F',
        boxShadow: 'inset 0 3px 8px rgba(0,0,0,0.8), inset 0 -1px 0 rgba(255,255,255,0.05)',
    },
    modeItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 32,
        paddingHorizontal: 18,
        borderRadius: 16,
    },
    modeItemOn: {
        backgroundColor: '#FFFFFF',
        boxShadow: '0 4px 10px rgba(0,0,0,0.6), inset 0 -2px 0 rgba(0,0,0,0.12)',
    },
    modeText: {
        fontSize: 9.5,
        fontWeight: '800',
        letterSpacing: 2,
        color: 'rgba(255,255,255,0.6)',
    },
    panel: {
        flex: 1,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        overflow: 'hidden',
        backgroundColor: '#0A0B0D',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.05)',
        boxShadow: 'inset 0 3px 10px rgba(0,0,0,0.6)',
    },
    // day header
    dayHeader: {
        height: HEADER_H,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingTop: 10,
    },
    dayWeekday: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 2.4,
        color: '#FFFFFF',
    },
    dayDate: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1.6,
        color: 'rgba(255,255,255,0.5)',
    },
    todayChip: {
        height: 18,
        paddingHorizontal: 8,
        borderRadius: 9,
        justifyContent: 'center',
        backgroundColor: '#3A2E10',
        borderWidth: 1,
        borderColor: 'rgba(255,204,0,0.55)',
    },
    todayChipText: {
        fontSize: 7.5,
        fontWeight: '800',
        letterSpacing: 1.6,
        color: '#FFD83A',
    },
    dayRule: {
        flex: 1,
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.07)',
    },
    dayCount: {
        fontSize: 10,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.4)',
    },
    emptyDay: {
        height: 40,
        justifyContent: 'center',
        paddingLeft: 8,
    },
    emptyDayText: {
        fontSize: 11,
        fontWeight: '600',
        fontStyle: 'italic',
        color: 'rgba(255,255,255,0.3)',
    },
    // list
    spine: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 48 + 12 - 2,
        width: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.07)',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 48,
        marginBottom: 4,
    },
    time: {
        width: 48,
        fontSize: 11,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.55)',
        fontVariant: ['tabular-nums'],
    },
    dotCol: {
        width: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dot: {
        width: 16,
        height: 16,
        borderRadius: 8,
        borderWidth: 3,
        borderColor: '#0A0B0D',
    },
    pill: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        minHeight: 42,
        marginLeft: 8,
        paddingHorizontal: 16,
        paddingVertical: 5,
        borderRadius: 21,
        borderWidth: 1,
        boxShadow: RAISED,
    },
    pillLive: {
        minHeight: 52,
        borderWidth: 1.5,
    },
    pillText: {
        flex: 1,
        minWidth: 0,
    },
    pillName: {
        fontSize: 13,
        fontWeight: '800',
    },
    pillSub: {
        marginTop: 1,
        fontSize: 7,
        fontWeight: '800',
        letterSpacing: 1.4,
        color: 'rgba(255,255,255,0.45)',
    },
    pillDur: {
        fontSize: 11,
        fontWeight: '800',
        opacity: 0.9,
        fontVariant: ['tabular-nums'],
    },
    nowRow: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 32,
        marginVertical: 2,
    },
    nowChip: {
        height: 24,
        paddingHorizontal: 12,
        borderRadius: 12,
        justifyContent: 'center',
        backgroundColor: '#3A2E10',
        borderWidth: 1.5,
        borderColor: 'rgba(255,204,0,0.6)',
    },
    nowChipText: {
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 1.8,
        color: '#FFD83A',
        fontVariant: ['tabular-nums'],
    },
    nowLine: {
        flex: 1,
        height: 3,
        marginLeft: 10,
        borderRadius: 2,
    },
    // planner
    axisWell: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 50,
        borderRadius: 16,
        backgroundColor: '#08090B',
        boxShadow: 'inset 3px 0 8px rgba(0,0,0,0.85), inset 0 0 0 1px rgba(255,255,255,0.03), 1px 0 0 rgba(255,255,255,0.06)',
    },
    axisTick: {
        position: 'absolute',
        left: 36,
        height: 1.5,
        borderRadius: 1,
        boxShadow: '0 1px 0 rgba(255,255,255,0.1)',
    },
    axisChip: {
        position: 'absolute',
        left: 3,
        width: 38,
        height: 18,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#171B21',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -2px 0 rgba(0,0,0,0.4), 0 3px 5px rgba(0,0,0,0.55)',
    },
    axisChipOn: {
        backgroundColor: '#1B3A1F',
        borderColor: 'rgba(76,175,80,0.8)',
    },
    axisChipText: {
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 0.3,
        color: 'rgba(255,255,255,0.9)',
        fontVariant: ['tabular-nums'],
    },
    axisMinor: {
        position: 'absolute',
        left: 8,
        fontSize: 8,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.26)',
        fontVariant: ['tabular-nums'],
    },
    hourLabel: {
        position: 'absolute',
        left: 0,
        width: PLANNER_AXIS_W,
        fontSize: 10.5,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.55)',
        fontVariant: ['tabular-nums'],
    },
    hourRule: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.07)',
    },
    block: {
        position: 'absolute',
        borderRadius: 16,
        borderWidth: 1,
        boxShadow: RAISED,
    },
    blockTouch: {
        flex: 1,
        paddingHorizontal: 9,
        paddingVertical: 7,
    },
    blockSelected: {
        borderColor: 'rgba(255,255,255,0.6)',
        borderWidth: 1.5,
        zIndex: 30,
        boxShadow: '0 0 34px rgba(255,255,255,0.2), 0 16px 30px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.5)',
    },
    spotlight: {
        backgroundColor: 'rgba(0,0,0,0.34)',
        zIndex: 10,
    },
    blockClip: {
        ...StyleSheet.absoluteFill,
        borderRadius: 15,
        overflow: 'hidden',
    },
    blockRipple: {
        borderRadius: 16,
        borderWidth: 2,
    },
    blockEdgeGlow: {
        borderRadius: 15,
        borderWidth: 3,
    },
    blockSweep: {
        position: 'absolute',
        top: -10,
        bottom: -10,
        left: 0,
        width: 60,
    },
    blockActions: {
        position: 'absolute',
        top: 6,
        right: 6,
        flexDirection: 'row',
        gap: 6,
    },
    actionDome: {
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.45)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 2px 4px rgba(0,0,0,0.5)',
    },
    resizeGrip: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 26,
        alignItems: 'center',
        justifyContent: 'center',
    },
    resizeBar: {
        width: 34,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.7)',
    },
    pillSelected: {
        borderColor: 'rgba(255,255,255,0.7)',
        borderWidth: 1.5,
    },
    rowActions: {
        flexDirection: 'row',
        gap: 6,
        marginLeft: 4,
    },
    blockLive: {
        borderWidth: 1.5,
    },
    blockBadges: { flexDirection: 'row', gap: 5, marginTop: 5, flexWrap: 'wrap' },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: 'rgba(0,0,0,0.4)', boxShadow: 'inset 0 2px 3px rgba(0,0,0,0.7)' },
    badgeText: { fontSize: 9, fontWeight: '800' },
    blockMeta: {
        marginTop: 5,
        gap: 4,
        alignItems: 'flex-start',
    },
    durChip: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 9,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 2px 3px rgba(0,0,0,0.5)',
    },
    durChipText: {
        fontSize: 10,
        fontWeight: '800',
        fontVariant: ['tabular-nums'],
    },
    blockRange: {
        fontSize: 9,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.45)',
        fontVariant: ['tabular-nums'],
    },
    blockHead: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    blockDisc: {
        width: 12,
        height: 12,
        borderRadius: 6,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55), 0 1px 2px rgba(0,0,0,0.5)',
    },
    panelRow: {
        flex: 1,
        flexDirection: 'row',
    },
    zoomRailWrap: {
        position: 'absolute',
        right: 6,
        top: 0,
        bottom: 0,
        width: 50,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 40,
    },
    zoomToggle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(29,33,40,0.92)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -2px 0 rgba(0,0,0,0.35), 0 8px 14px rgba(0,0,0,0.6)',
    },
    zoomToggleOn: {
        backgroundColor: '#FFFFFF',
    },
    zoomPanel: {
        alignItems: 'center',
        marginTop: 10,
    },
    zoomRail: {
        width: 38,
        paddingVertical: 6,
        alignItems: 'center',
        gap: 8,
        borderRadius: 19,
        backgroundColor: 'rgba(11,12,15,0.88)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        boxShadow: 'inset 0 3px 8px rgba(0,0,0,0.6), 0 10px 20px rgba(0,0,0,0.6)',
    },
    zoomBtn: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1D2128',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 4px 7px rgba(0,0,0,0.6)',
    },
    zoomSteps: {
        alignItems: 'center',
        gap: 4,
        paddingVertical: 4,
    },
    zoomStep: {
        width: 28,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
    },
    zoomStepOn: {
        backgroundColor: '#FFFFFF',
        boxShadow: '0 3px 7px rgba(0,0,0,0.6)',
    },
    zoomStepText: {
        fontSize: 8.5,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.55)',
    },
    zoomLabel: {
        marginTop: 8,
        fontSize: 7,
        fontWeight: '800',
        letterSpacing: 1.6,
        color: 'rgba(255,255,255,0.55)',
    },
    nowJumpBtn: {
        marginTop: 10,
        width: 46,
        height: 58,
        borderRadius: 23,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        backgroundColor: 'rgba(20,23,27,0.9)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 10px 18px rgba(0,0,0,0.6)',
    },
    nowJumpText: {
        fontSize: 7.5,
        fontWeight: '800',
        letterSpacing: 1.4,
        color: 'rgba(255,255,255,0.55)',
    },
    blockName: {
        fontSize: 12,
        fontWeight: '800',
    },
    slideBand: {
        position: 'absolute',
        left: 0,
        backgroundColor: 'rgba(76,175,80,0.16)',
        borderTopWidth: 2,
        borderBottomWidth: 2,
        borderColor: '#4CAF50',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 12,
    },
    slideChip: {
        position: 'absolute',
        left: 6,
        height: 18,
        paddingHorizontal: 7,
        borderRadius: 9,
        justifyContent: 'center',
        backgroundColor: '#1B3A1F',
        borderWidth: 1,
        borderColor: 'rgba(76,175,80,0.8)',
    },
    slideChipText: {
        fontSize: 8.5,
        fontWeight: '800',
        color: '#7BE18A',
        fontVariant: ['tabular-nums'],
    },
    slideDuration: {
        fontSize: 15,
        fontWeight: '800',
        color: 'rgba(123,225,138,0.9)',
    },
    rulerPart: {
        position: 'absolute',
        left: 43,
        width: 6,
        opacity: 0.92,
    },
    rulerGroove: {
        position: 'absolute',
        left: 43,
        top: 0,
        bottom: 0,
        width: 6,
        borderRadius: 3,
        backgroundColor: '#050607',
        boxShadow: 'inset 0 2px 3px rgba(0,0,0,0.9), 0 1px 0 rgba(255,255,255,0.07)',
    },
    rulerLit: {
        position: 'absolute',
        left: 40,
        width: 12,
        borderRadius: 6,
        borderWidth: 1.5,
        borderColor: '#FFFFFF',
        backgroundColor: 'rgba(255,255,255,0.12)',
        boxShadow: '0 0 12px rgba(255,255,255,0.35)',
    },
    rulerTick: {
        position: 'absolute',
        left: 40,
        height: 2,
        borderRadius: 1,
    },
    rulerHour: {
        position: 'absolute',
        left: 2,
        width: 36,
        textAlign: 'right',
        fontSize: 11,
        fontWeight: '800',
        fontVariant: ['tabular-nums'],
    },
    rulerMinor: {
        position: 'absolute',
        left: 2,
        width: 36,
        textAlign: 'right',
        fontSize: 8,
        fontWeight: '800',
        fontVariant: ['tabular-nums'],
    },
    slidePlusWrap: {
        position: 'absolute',
        left: 0,
        right: 0,
        alignItems: 'center',
        gap: 10,
        zIndex: 60,
    },
    slidePlusCaption: {
        height: 26,
        paddingHorizontal: 12,
        borderRadius: 13,
        justifyContent: 'center',
        backgroundColor: 'rgba(14,16,20,0.92)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    slidePlusCaptionText: {
        fontSize: 11,
        fontWeight: '800',
        color: '#FFFFFF',
        fontVariant: ['tabular-nums'],
    },
    slideBarWrap: {
        position: 'absolute',
        left: 12,
        right: 12,
        zIndex: 6500,
    },
    slideBarOne: {
        height: 62,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 8,
        borderRadius: 31,
        backgroundColor: 'rgba(14,16,20,0.98)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        boxShadow: '0 14px 30px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.1)',
    },
    slideBarMid: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    slideBarTasks: {
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 2,
    },
    slideBarTask: {
        height: 40,
        maxWidth: 160,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 14,
        borderRadius: 20,
        backgroundColor: '#1D2128',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -3px 0 rgba(0,0,0,0.35), 0 4px 8px rgba(0,0,0,0.5)',
    },
    slideBarTaskText: {
        flexShrink: 1,
        fontSize: 13,
        fontWeight: '800',
        color: '#FFFFFF',
    },
    slideCard: {
        minWidth: 280,
        maxWidth: 330,
        paddingTop: 14,
        paddingBottom: 14,
        paddingHorizontal: 16,
        alignItems: 'center',
        gap: 12,
        borderRadius: 32,
        backgroundColor: 'rgba(14,16,20,0.97)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        boxShadow: '0 16px 36px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.1)',
    },
    slideCardTop: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    slideCardRange: {
        fontSize: 15,
        fontWeight: '800',
        color: '#FFFFFF',
        fontVariant: ['tabular-nums'],
    },
    slideCardLen: {
        height: 24,
        paddingHorizontal: 10,
        borderRadius: 12,
        justifyContent: 'center',
        backgroundColor: '#1B3A1F',
        borderWidth: 1,
        borderColor: 'rgba(76,175,80,0.7)',
    },
    slideCardLenText: {
        fontSize: 11,
        fontWeight: '800',
        color: '#7BE18A',
    },
    slideTaskList: {
        alignSelf: 'stretch',
        gap: 10,
    },
    slideTaskHead: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    slideTaskTitle: {
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 2,
        color: 'rgba(255,255,255,0.6)',
    },
    slideTaskBack: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1D2128',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.09)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 3px 6px rgba(0,0,0,0.55)',
    },
    slideTaskRow: {
        height: 46,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 16,
        borderRadius: 23,
        backgroundColor: '#1D2128',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -3px 0 rgba(0,0,0,0.35), 0 4px 8px rgba(0,0,0,0.5)',
    },
    slideTaskDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    slideTaskName: {
        flex: 1,
        fontSize: 14,
        fontWeight: '800',
        color: '#FFFFFF',
    },
    slideBtnPair: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    deepSocket: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#08090B',
        boxShadow: 'inset 0 4px 10px rgba(0,0,0,0.9), 0 1px 0 rgba(255,255,255,0.07), 0 10px 22px rgba(0,0,0,0.55)',
    },
    deepDome: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1D2128',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.09)',
        boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.16), inset 0 -4px 0 rgba(0,0,0,0.42), 0 8px 14px rgba(0,0,0,0.65)',
    },
    deepDomePrimary: {
        backgroundColor: '#2A3038',
        borderColor: 'rgba(255,255,255,0.22)',
        boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.22), inset 0 -4px 0 rgba(0,0,0,0.45), 0 8px 14px rgba(0,0,0,0.65), 0 0 18px rgba(255,255,255,0.12)',
    },
    slidePlusBox: {
        width: 64,
        height: 64,
    },
    slidePlus: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
        boxShadow: '0 10px 22px rgba(0,0,0,0.65), 0 0 0 4px rgba(255,255,255,0.12)',
    },
    slidePlusX: {
        position: 'absolute',
        top: -6,
        right: -6,
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1D2128',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.25)',
    },
    sheetModalRoot: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    sheetBackdrop: {
        backgroundColor: '#000000',
    },
    sheetFull: {
        paddingTop: 4,
        paddingHorizontal: 20,
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        backgroundColor: '#101216',
        borderTopWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        boxShadow: '0 -16px 40px rgba(0,0,0,0.8)',
    },
    slideSheetOuter: {
        position: 'absolute',
        left: 12,
        right: 12,
        zIndex: 60,
    },
    slideSheet: {
        paddingTop: 4,
        paddingBottom: 12,
        paddingHorizontal: 14,
        borderRadius: 30,
        overflow: 'hidden',
        backgroundColor: 'rgba(14,16,20,0.97)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.09)',
        boxShadow: '0 -14px 30px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.1)',
    },
    slideSheetEdge: {
        position: 'absolute',
        left: 24,
        right: 24,
        top: 0,
        height: 3,
        borderBottomLeftRadius: 2,
        borderBottomRightRadius: 2,
    },
    sheetClose: {
        position: 'absolute',
        top: 14,
        right: 14,
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
        zIndex: 5,
        boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
    },
    sheetHeading: {
        fontSize: 17,
        fontWeight: '800',
        color: '#FFFFFF',
        marginTop: 2,
    },
    sheetRangeLine: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 6,
        marginBottom: 14,
    },
    sheetRangeMain: {
        fontSize: 13,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.65)',
        fontVariant: ['tabular-nums'],
    },
    sheetDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.3)',
    },
    sheetRangeLen: {
        fontSize: 13,
        fontWeight: '800',
        color: '#7BE18A',
    },
    taskPickOn: {
        backgroundColor: '#FFFFFF',
        borderColor: '#FFFFFF',
    },
    sheetAddBtn: {
        marginTop: 16,
        height: 50,
        borderRadius: 25,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
        boxShadow: '0 6px 14px rgba(0,0,0,0.5)',
    },
    sheetAddText: {
        fontSize: 14,
        fontWeight: '800',
        letterSpacing: 0.4,
        color: '#0A0C10',
    },
    sheetGrabArea: {
        height: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sheetGrabber: {
        width: 44,
        height: 5,
        borderRadius: 3,
        backgroundColor: 'rgba(255,255,255,0.3)',
    },
    sheetTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
    },
    sheetRangeText: {
        fontSize: 12,
        fontWeight: '800',
        color: '#FFFFFF',
        fontVariant: ['tabular-nums'],
    },
    sheetLabel: {
        marginTop: 10,
        marginBottom: 6,
        fontSize: 7.5,
        fontWeight: '800',
        letterSpacing: 1.8,
        color: 'rgba(255,255,255,0.45)',
    },
    taskChipsRow: {
        gap: 8,
        paddingRight: 8,
    },
    taskPick: {
        height: 32,
        maxWidth: 150,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        paddingHorizontal: 12,
        borderRadius: 16,
        backgroundColor: '#15181D',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
    },
    taskPickDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    taskPickText: {
        flexShrink: 1,
        fontSize: 10.5,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.62)',
    },
    nameField: {
        marginTop: 0,
        height: 50,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 16,
        borderRadius: 16,
        backgroundColor: '#0D0F13',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    nameFieldError: {
        borderColor: 'rgba(255,138,138,0.8)',
    },
    nameInput: {
        flex: 1,
        height: 50,
        fontSize: 15,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    s2aTrack: {
        marginTop: 12,
        height: 56,
        borderRadius: 28,
        overflow: 'hidden',
        justifyContent: 'center',
        backgroundColor: '#0B0C0F',
        boxShadow: 'inset 0 3px 8px rgba(0,0,0,0.85), 0 1px 0 rgba(255,255,255,0.06)',
    },
    s2aFill: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        borderRadius: 28,
        backgroundColor: 'rgba(123,225,138,0.22)',
    },
    s2aLabelWrap: {
        ...StyleSheet.absoluteFill,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingLeft: 40,
    },
    s2aLabel: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 2.2,
        color: 'rgba(255,255,255,0.72)',
    },
    s2aThumbWrap: {
        position: 'absolute',
        left: 5,
        top: 5,
        width: 46,
        height: 46,
    },
    s2aThumb: {
        width: 46,
        height: 46,
        borderRadius: 23,
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.6), inset 0 -3px 0 rgba(0,0,0,0.22), 0 6px 12px rgba(0,0,0,0.6)',
    },
    slideTitle: {
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 2.2,
        color: 'rgba(255,255,255,0.55)',
        flex: 1,
    },
    slideChipsRow: {
        flexDirection: 'row',
        gap: 8,
    },
    quickChip: {
        flex: 1,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1D2128',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 3px 6px rgba(0,0,0,0.5)',
    },
    quickChipOn: {
        backgroundColor: '#FFFFFF',
        boxShadow: '0 4px 10px rgba(0,0,0,0.6)',
    },
    quickChipText: {
        fontSize: 11,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.82)',
    },
    slideRangeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
    },
    slideTimePill: {
        height: 32,
        paddingHorizontal: 14,
        borderRadius: 16,
        justifyContent: 'center',
        backgroundColor: '#0B0C0F',
        boxShadow: 'inset 0 2px 5px rgba(0,0,0,0.85), 0 1px 0 rgba(255,255,255,0.05)',
    },
    slideTimeText: {
        fontSize: 14,
        fontWeight: '800',
        color: '#FFFFFF',
        fontVariant: ['tabular-nums'],
    },
    slideLenChip: {
        height: 26,
        paddingHorizontal: 11,
        borderRadius: 13,
        justifyContent: 'center',
        backgroundColor: '#08262B',
        borderWidth: 1,
        borderColor: 'rgba(34,227,245,0.7)',
    },
    slideLenText: {
        fontSize: 11,
        fontWeight: '800',
        color: '#7CF0FF',
    },
    slideBtnRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginTop: 12,
    },
    slideAddWrap: {
        flex: 1,
        borderRadius: 24,
        boxShadow: '0 8px 18px rgba(0,0,0,0.6), 0 0 22px rgba(123,225,138,0.3)',
    },
    slideAddBtn: {
        height: 48,
        borderRadius: 24,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.45), inset 0 -3px 0 rgba(0,0,0,0.2)',
    },
    slideHint: {
        marginTop: 9,
        textAlign: 'center',
        fontSize: 7.5,
        fontWeight: '800',
        letterSpacing: 1.6,
        color: 'rgba(255,255,255,0.38)',
    },
    slideBar: {
        position: 'absolute',
        left: 14,
        right: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        zIndex: 60,
    },
    slideCancel: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1D2128',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 6px 12px rgba(0,0,0,0.6)',
    },
    slideAdd: {
        flex: 1,
        maxWidth: 330,
        height: 46,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingHorizontal: 12,
        borderRadius: 23,
        backgroundColor: '#7BE18A',
        boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.55), inset 0 -3px 0 rgba(0,0,0,0.22), 0 8px 16px rgba(0,0,0,0.6)',
    },
    slideAddText: {
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 2.4,
        color: '#06200C',
    },
    slideAddChip: {
        height: 22,
        paddingHorizontal: 8,
        borderRadius: 11,
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.25)',
    },
    slideAddChipText: {
        fontSize: 8.5,
        fontWeight: '800',
        color: '#06200C',
        fontVariant: ['tabular-nums'],
    },
    plannerNowChip: {
        position: 'absolute',
        left: 0,
        width: PLANNER_AXIS_W - 4,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1B3A1F',
        borderWidth: 1.5,
        borderColor: 'rgba(76,175,80,0.8)',
        boxShadow: '0 0 10px rgba(76,175,80,0.45)',
        zIndex: 20,
    },
    plannerNowText: {
        fontSize: 9.5,
        fontWeight: '800',
        color: '#7BE18A',
        fontVariant: ['tabular-nums'],
    },
    plannerNowLine: {
        position: 'absolute',
        left: 0,
        height: 3,
        borderRadius: 2,
        boxShadow: '0 0 12px rgba(76,175,80,0.6)',
        zIndex: 20,
    },
});
