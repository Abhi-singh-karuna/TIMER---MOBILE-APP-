import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TouchableWithoutFeedback,
    ScrollView,
    useWindowDimensions,
    GestureResponderEvent,
    PanResponder,
    Platform,
    LayoutAnimation,
    NativeSyntheticEvent,
    NativeScrollEvent,
    Modal,
    Alert,
    Animated,
    ScrollViewInstance,
    HostInstance,
} from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { useSharedValue } from 'react-native-reanimated';
import IdeaTray from './IdeaTray';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Task, Category, TaskStage, StageStatus, Timer, Idea, JournalEntry } from '../../../constants/data';
import AddSubtaskModal from '../../../components/AddSubtaskModal';
import { NotificationButton, NotificationPopup, getApprovalItems, getApprovalType } from './NotificationCenter';
import StageActionPopup from './StageActionPopup';
import FullScreenTimer from './FullScreenTimer';
import AgendaView, { AgendaItem } from './AgendaView';
import { buildTimeOfDayBackgroundSegments, DEFAULT_TIME_OF_DAY_SLOTS, TimeOfDaySlotConfigList } from '../../../utils/timeOfDaySlots';
import { getLogicalDate, getStartOfLogicalDay, getStartOfLogicalDayFromString, isSameLogicalDay, toDisplayMinutes, DEFAULT_DAILY_START_MINUTES } from '../../../utils/dailyStartTime';

type SyncMode = 'none' | 'all' | 'future';
type TaskStageEntry = { task: Task; stage: TaskStage };

interface LiveFocusViewProps {
    tasks: Task[];
    /** Every task (not only the selected day); the Agenda page expands recurring tasks per day from this. */
    allTasks?: Task[];
    selectedDate: Date;
    onDateChange: (date: Date) => void;
    categories: Category[];
    onClose: () => void;
    onToggleTask?: (task: Task) => void;
    onExpandTask?: (task: Task) => void;
    onUpdateStageLayout?: (taskId: number, stageId: number, startTimeMinutes: number, durationMinutes: number) => void;
    onUpdateStages?: (task: Task, stages: TaskStage[], syncMode?: SyncMode) => void;
    /** Idea tray (portrait planner): subtasks not placed on a task yet. */
    ideas?: Idea[];
    onAddIdea?: (title: string, dueDate: string) => void;
    onDeleteIdea?: (id: number) => void;
    /** Day journal (notes + expenses): the pull-up journal in the portrait planner. */
    journal?: JournalEntry[];
    onAddJournal?: (entry: Omit<JournalEntry, 'id' | 'createdAt'>) => void;
    onUpdateJournal?: (entry: JournalEntry) => void;
    onDeleteJournal?: (id: number) => void;
    timeOfDaySlots?: TimeOfDaySlotConfigList;
    /** Daily start time (minutes from midnight) from General Settings. Used for date rollover: when the clock crosses this time, the calendar day changes. Must match the app config (Daily start time) so Live Focus stays in sync with TaskList and TimerList. */
    dailyStartMinutes?: number;
    initialZoom?: number;
    initialScrollX?: number;
    onZoomChange?: (zoom: number) => void;
    onScrollChange?: (x: number) => void;
    /** Running timer from TimerList (HH:MM:SS or MM:SS); shows "Not active timer" when null. */
    runningTimer?: Timer | null;
    /** When the live running timer in the dock is pressed: (timer) => open ActiveTimer if timer, else Timer list. */
    onOpenRunningTimer?: (timer: Timer | null) => void;
    /** Initial view mode (Task / Merge / Category); persisted by parent. */
    initialViewMode?: LiveViewMode;
    /** Called when user changes view mode; parent should persist (e.g. AsyncStorage). */
    onViewModeChange?: (mode: LiveViewMode) => void;
    /** Timer running colour from Settings (Theme); used by full-screen timer display. */
    timerTextColor?: string;
    /** Slider/button accent colour from Settings; used by full-screen timer slide-to-complete. */
    /** Slider/button accent colour from Settings; used by full-screen timer slide-to-complete. */
    sliderButtonColor?: string;
    /** List of dates (YYYY-MM-DD) marked as leave. */
    leaveDays?: string[];
    /** Whether to show disabled tasks in the timeline (passed from parent filter state). */
    showDisabledTasks?: boolean;
    /** Toggle disabled tasks visibility in parent. */
    onToggleDisabledTasks?: () => void;
}

type TaskLiveStatus = 'ACTIVE' | 'DONE' | 'PLANNED';

const getTaskLiveStatus = (task: Task): TaskLiveStatus => {
    if (task.status === 'Completed') return 'DONE';
    if (task.status === 'In Progress') return 'ACTIVE';
    return 'PLANNED';
};

// Stage status configuration for timeline cards
const STAGE_STATUS_CONFIG: Record<StageStatus, { icon: keyof typeof MaterialIcons.glyphMap; color: string }> = {
    Upcoming: { icon: 'schedule', color: '#8E8E93' },
    Process: { icon: 'play-circle-fill', color: '#FFB74D' },
    Done: { icon: 'check-circle', color: '#4CAF50' },
    Undone: { icon: 'cancel', color: '#FF5252' },
};
// Rail accent per stage status (left rail of the timeline bars)
const STAGE_RAIL: Record<StageStatus, string> = {
    Upcoming: '#9AA1AE',
    Process: '#FFB74D',
    Done: '#7BE18A',
    Undone: '#FF8A8A',
};

// How far through its slot a stage is right now (0-100), wraps past midnight
const stageElapsedPct = (startMin: number, durMin: number, nowMin: number): number => {
    if (durMin <= 0) return 0;
    const elapsed = (nowMin - startMin + 1440) % 1440;
    return Math.max(0, Math.min(100, (elapsed / durMin) * 100));
};

// Task progress ring: done (green) + undone (red) arcs over a sunken track, count in the centre
const TrackProgressRing = ({ done, undone, total, size = 44 }: { done: number; undone: number; total: number; size?: number }) => {
    const SIZE = size;
    const STROKE = size >= 40 ? 6 : 5;
    const R = (SIZE - STROKE) / 2;
    const C = 2 * Math.PI * R;
    const doneLen = total > 0 ? (C * done) / total : 0;
    const undoneLen = total > 0 ? (C * undone) / total : 0;
    return (
        <View style={[trackRingStyles.wrap, { width: SIZE, height: SIZE, marginTop: -SIZE / 2 }]} pointerEvents="none">
            <Svg width={SIZE} height={SIZE}>
                <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke="#0B0C0F" strokeWidth={STROKE} fill="none" />
                {doneLen > 0 && (
                    <Circle
                        cx={SIZE / 2} cy={SIZE / 2} r={R} stroke="#4CAF50" strokeWidth={STROKE} fill="none"
                        strokeLinecap="round" strokeDasharray={`${doneLen} ${C}`} rotation={-90} origin={`${SIZE / 2}, ${SIZE / 2}`}
                    />
                )}
                {undoneLen > 0 && (
                    <Circle
                        cx={SIZE / 2} cy={SIZE / 2} r={R} stroke="#FF5252" strokeWidth={STROKE} fill="none"
                        strokeLinecap="round" strokeDasharray={`${undoneLen} ${C}`}
                        rotation={-90 + (total > 0 ? (360 * done) / total : 0)} origin={`${SIZE / 2}, ${SIZE / 2}`}
                    />
                )}
            </Svg>
            <View style={trackRingStyles.center}>
                <Text style={[trackRingStyles.text, size < 40 && { fontSize: 8 }]}>{done}/{total}</Text>
            </View>
        </View>
    );
};
// Progress ring for the collapsed Progress pill: done (green), in progress (amber), undone (red) by time,
// the rest of the ring stays an empty sunken track. The overall percentage sits in the middle.
const PillProgressRing = ({ total, done, active, undone, pct, size = 28, stroke = 4, fontSize = 7 }: { total: number; done: number; active: number; undone: number; pct: number; size?: number; stroke?: number; fontSize?: number }) => {
    const SIZE = size;
    const STROKE = stroke;
    const R = (SIZE - STROKE) / 2;
    const C = 2 * Math.PI * R;
    const frac = (m: number) => (total > 0 ? Math.max(0, Math.min(1, m / total)) : 0);
    const doneF = frac(done);
    const activeF = Math.min(frac(active), 1 - doneF);
    const undoneF = Math.min(frac(undone), Math.max(0, 1 - doneF - activeF));
    const segments = [
        { color: '#4CAF50', start: 0, f: doneF },
        { color: '#FFB74D', start: doneF, f: activeF },
        { color: '#FF5252', start: doneF + activeF, f: undoneF },
    ];
    return (
        <View style={{ width: SIZE, height: SIZE }}>
            <Svg width={SIZE} height={SIZE}>
                <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke="#000" strokeWidth={STROKE} fill="none" opacity={0.55} />
                {segments.filter(seg => seg.f > 0.002).map(seg => (
                    <Circle
                        key={seg.color}
                        cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={seg.color} strokeWidth={STROKE} fill="none"
                        strokeDasharray={`${Math.max(0, C * seg.f - 1.2)} ${C}`}
                        rotation={-90 + 360 * seg.start} origin={`${SIZE / 2}, ${SIZE / 2}`}
                    />
                ))}
            </Svg>
            <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize, fontWeight: '900', color: '#FFFFFF' }}>{pct}%</Text>
            </View>
        </View>
    );
};

const trackRingStyles = StyleSheet.create({
    wrap: { position: 'absolute', left: 16, top: '50%', marginTop: -22, width: 44, height: 44 },
    center: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
    text: { fontSize: 9, fontWeight: '800', color: '#FFFFFF' },
});

// Deep, solid stage bar colours (timeline cards)
const DEEP_STAGE_BG: Record<StageStatus, string> = {
    Upcoming: '#2C3038',
    Process: '#5A3F12',
    Done: '#1E4D2B',
    Undone: '#5A2026',
};
// Labels for the Status button (matches StageActionPopup)
const STAGE_STATUS_LABELS: Record<StageStatus, string> = {
    Upcoming: 'Upcoming',
    Process: 'In Process',
    Done: 'Done',
    Undone: 'Undone',
};

const MONTHS_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTHS_CAL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Special task id used for the single merged track when viewMode is 'merged' (taskHeights, frozen lanes). */
const MERGED_TRACK_ID = -1;

type LiveViewMode = 'task' | 'merged' | 'category';

export default function LiveFocusView({
    tasks,
    allTasks,
    selectedDate,
    onDateChange,
    categories,
    onClose,
    onToggleTask,
    onExpandTask,
    onUpdateStageLayout,
    onUpdateStages,
    ideas = [],
    onAddIdea,
    onDeleteIdea,
    journal = [],
    onAddJournal,
    onUpdateJournal,
    onDeleteJournal,
    timeOfDaySlots,
    dailyStartMinutes = DEFAULT_DAILY_START_MINUTES,
    initialZoom,
    initialScrollX,
    onZoomChange,
    onScrollChange,
    runningTimer,
    onOpenRunningTimer,
    initialViewMode,
    onViewModeChange,
    timerTextColor = '#FFFFFF',
    sliderButtonColor = '#FFFFFF',
    showDisabledTasks = false,
    onToggleDisabledTasks,
}: LiveFocusViewProps) {
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const isLandscape = screenWidth > screenHeight;
    const insets = useSafeAreaInsets();
    const dockBottomPad = Math.round(insets.bottom * 0.5); // portrait sheet: only half of the home-indicator inset stays empty
    const progressDockHeight = isLandscape ? 64 : 170 + dockBottomPad; // portrait: two rows + the home-indicator inset; landscape: single row
    // Ref for live "now" — updated every second with nowHHMMSS so NOW line and getNowPosition stay in sync
    const currentTimeRef = useRef(new Date());
    const DEBUG_LANES = false;
    // Refs to avoid stale state inside PanResponder
    const tasksRef = useRef<Task[]>([]);
    const minutesPerCellRef = useRef(60);
    const isDraggingRef = useRef(false);
    const isResizingRef = useRef(false);
    const activeStageRef = useRef<{ taskId: number; stageId: number } | null>(null);
    const initialStageLayoutRef = useRef<{ left: number; width: number; top: number; lane: number } | null>(null);
    const tempStageLayoutRef = useRef<{ left: number; width: number; top: number; lane: number } | null>(null);
    // Prevent accidental "tap" commits: only save layout if a real move/resize occurred.
    const didEditStageRef = useRef(false);
    const lastPinchDistanceRef = useRef(0);
    const horizontalScrollTimelineRef = useRef<ScrollViewInstance>(null);
    const timelineScrollXRef = useRef(0);
    const lastScrollReportAtRef = useRef(0);
    const animatedScrollX = useRef(new Animated.Value(0)).current;
    const horizontalScrollLockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isScrollingVertically = useRef(false);
    const isScrollingHorizontally = useRef(false);
    const HORIZONTAL_SCROLL_LOCK_MS = 60;

    const scheduleHorizontalScrollLockClear = useCallback(() => {
        if (horizontalScrollLockTimeoutRef.current != null) {
            clearTimeout(horizontalScrollLockTimeoutRef.current);
        }
        horizontalScrollLockTimeoutRef.current = setTimeout(() => {
            horizontalScrollLockTimeoutRef.current = null;
            isScrollingHorizontally.current = false;
        }, HORIZONTAL_SCROLL_LOCK_MS);
    }, []);
    const verticalScrollRef = useRef<ScrollViewInstance>(null);
    const verticalScrollLabelsRef = useRef<ScrollViewInstance>(null);

    // Zoom state (initial from parent for persistence across unmounts)
    const [minutesPerCell, setMinutesPerCell] = useState(initialZoom ?? 60);
    const [lastPinchDistance, setLastPinchDistance] = useState(0);
    const [pinchAnchorTime, setPinchAnchorTime] = useState<number | null>(null); // Time (in minutes) at pinch center
    const [pinchAnchorScreenX, setPinchAnchorScreenX] = useState<number | null>(null); // Screen X position of pinch center
    const previousMinutesPerCell = useRef(minutesPerCell);
    const userHasScrolled = useRef(false); // Track if user has manually scrolled (prevents auto-scroll to NOW)

    // Editing state
    const [activeStage, setActiveStage] = useState<{ taskId: number, stageId: number } | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [initialStageLayout, setInitialStageLayout] = useState<{ left: number, width: number, top: number, lane: number } | null>(null);
    const [tempStageLayout, setTempStageLayout] = useState<{ left: number, width: number, top: number, lane: number } | null>(null);

    // Resize mode state - separate from drag mode
    // resizeModeStage: tracks which stage is in resize mode (showing handles)
    // resizeHandleSide: tracks which handle is being dragged ('left' | 'right' | null)
    const [resizeModeStage, setResizeModeStage] = useState<{ taskId: number, stageId: number } | null>(null);
    const resizeHandleSideRef = useRef<'left' | 'right' | null>(null);
    const resizeModeStageRef = useRef<{ taskId: number, stageId: number } | null>(null);
    const commitLayoutChangeRef = useRef<() => void>(() => { });

    // Dynamic height tracking for each task
    const [taskHeights, setTaskHeights] = useState<Map<number, number>>(new Map());
    const stagesHashRef = useRef<string>('');

    // Freeze lane layout during timed-stage drag so other stages don't "jump"
    const frozenLanesRef = useRef<{ taskId: number; lanes: Map<number, number> } | null>(null);
    // Category view: which category section is being dragged (for frozen lanes)
    const frozenCategoryIdRef = useRef<string | null>(null);

    // Pending layouts: uses REF for synchronous access (avoids React batching issues)
    // This prevents subtasks from snapping back when another subtask is dragged
    const pendingLayoutsRef = useRef<Map<number, { startTimeMinutes: number; durationMinutes: number }>>(new Map());
    // Version counter to trigger re-renders when pending layouts change
    const [pendingLayoutsVersion, setPendingLayoutsVersion] = useState(0);

    const [ideasOpen, setIdeasOpen] = useState(false); // idea popup (portrait: over the planner, landscape: top right)
    const ideaDragX = useSharedValue(0); // landscape has no drag, the tray just needs the values
    const ideaDragY = useSharedValue(0);
    const ideaDragOn = useSharedValue(0);

    // Add subtask modal state
    const [addSubtaskModal, setAddSubtaskModal] = useState<{
        visible: boolean;
        taskId: number | null;
        startTimeMinutes: number;
        mode?: 'add' | 'edit';
        stageId?: number | null;
        existingText?: string;
        existingStartTime?: number;
        existingDuration?: number;
        initialDuration?: number;
        initialText?: string;
        ideaId?: number;
    }>({
        visible: false,
        taskId: null,
        startTimeMinutes: 0,
        mode: 'add',
    });

    // Floating progress bar state (UI-only; resets safely on unmount)
    const [isProgressExpanded, setIsProgressExpanded] = useState(false);
    const progressAnim = useRef(new Animated.Value(0)).current; // 0 collapsed, 1 expanded (bottom dock slide)


    // Task column visibility toggle
    const [isTaskColumnVisible, setIsTaskColumnVisible] = useState(true);
    // View mode: by task (per-task rows) | merged (all subtasks one section) | category (one section per category, ascending order). Initial from parent (persisted).
    const [viewMode, setViewMode] = useState<LiveViewMode>(initialViewMode ?? 'task');
    // Stack subtasks: every subtask of a task gets its own row, each one below the previous (instead of sharing a row when they don't overlap)
    const [stackSubtasks, setStackSubtasks] = useState(false);
    useEffect(() => {
        AsyncStorage.getItem('@live_stack_subtasks').then(v => { if (v === '1') setStackSubtasks(true); }).catch(() => { });
    }, []);
    const toggleStackSubtasks = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setStackSubtasks(prev => {
            const next = !prev;
            AsyncStorage.setItem('@live_stack_subtasks', next ? '1' : '0').catch(() => { });
            return next;
        });
    };
    // View mode selector popup (opened from progress bar button) — same design as StageActionPopup (positioned, compact)
    const [viewModePopupVisible, setViewModePopupVisible] = useState(false);
    const [viewModePopupPosition, setViewModePopupPosition] = useState({ x: 0, y: 0 });
    const viewModeButtonRef = useRef<HostInstance>(null);
    // Category view: measured height per category section (key = categoryId)
    const [categorySectionHeights, setCategorySectionHeights] = useState<Map<string, number>>(new Map());
    // 1 = open, 0 = closed; drives smooth width animation and button position
    const taskColumnWidthAnim = useRef(new Animated.Value(1)).current;

    // Auto-scroll during drag/resize
    const autoScrollIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isAutoScrollingRef = useRef(false);
    const checkAndUpdateAutoScrollRef = useRef<((pageX: number) => void) | null>(null);
    // Track scroll offset during drag to compensate position calculations
    const dragStartScrollXRef = useRef(0);
    const currentAutoScrollOffsetRef = useRef(0);
    const currentAutoScrollDirectionRef = useRef<'left' | 'right' | null>(null);
    const currentAutoScrollSpeedRef = useRef(1);

    const [approvalPopupVisible, setApprovalPopupVisible] = useState(false);
    const approvalButtonScale = useRef(new Animated.Value(1)).current;

    // Stage status popup (reuses timer subtask status popup) — when a stage is selected in the dock
    const [stageStatusPopupVisible, setStageStatusPopupVisible] = useState(false);
    const [statusPopupTarget, setStatusPopupTarget] = useState<{ taskId: number; stageId: number } | null>(null);
    // Tasks the user has minimised (empty set = every task expanded, the default)
    const [collapsedTaskIds, setCollapsedTaskIds] = useState<Set<number>>(() => new Set());
    const [stageStatusPopupPosition, setStageStatusPopupPosition] = useState({ x: 0, y: 0 });
    const statusButtonRef = useRef<HostInstance>(null);

    // Dock calendar: clickable date line (e.g. 21 JAN) opens small calendar to pick date and switch live view
    const [showDockCalendar, setShowDockCalendar] = useState(false);
    const [viewDate, setViewDate] = useState(() => new Date());

    // Task subtasks popup: tap left task card opens popup with all subtasks and status
    const [taskSubtasksPopupTask, setTaskSubtasksPopupTask] = useState<Task | null>(null);

    // Simple timer state (counts up from 00:00:00); shared with dock and full-screen timer
    const [timerSeconds, setTimerSeconds] = useState(0);
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    const timerIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [fullScreenTimerVisible, setFullScreenTimerVisible] = useState(false);
    const [journalToggle, setJournalToggle] = useState(0); // the journal button in the bottom controls bumps this
    const [journalStage, setJournalStage] = useState<1 | 2 | 3>(1); // pull-up journal: 1 handle, 2 half, 3 full screen
    const journalOpen = !isLandscape && journalStage >= 2; // the bottom controls step aside while it covers them
    const [plannerAdding, setPlannerAdding] = useState(false); // portrait planner: the add bar takes the place of the bottom controls

    // Animate progress panel expand/collapse
    useEffect(() => {
        Animated.timing(progressAnim, {
            toValue: isProgressExpanded ? 1 : 0,
            duration: 260,
            useNativeDriver: true, // translateY animation
        }).start();
    }, [isProgressExpanded, progressAnim]);

    // Prevent phone from auto-locking while LiveFocusView is open
    useEffect(() => {
        activateKeepAwakeAsync();
        return () => {
            deactivateKeepAwake();
        };
    }, []);

    // Timer count-up logic
    useEffect(() => {
        if (isTimerRunning) {
            timerIntervalRef.current = setInterval(() => {
                setTimerSeconds(prev => prev + 1);
            }, 1000);
        } else {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
            }
        }
        return () => {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
            }
        };
    }, [isTimerRunning]);

    // Live current time HH:MM:SS for the Now button; also updates currentTimeRef so NOW line moves in real time.
    // Date rollover: when the clock crosses the daily start time, switch to the new logical day.
    // IMPORTANT: Only auto-update date when viewing today (to handle date rollover). Don't override user-selected past/future dates.
    const [nowHHMMSS, setNowHHMMSS] = useState('');
    // State to trigger NOW line re-renders every second for smooth movement
    const [currentTimeForRender, setCurrentTimeForRender] = useState(new Date());
    const wasViewingTodayRef = useRef(false); // Track if we were viewing today in the previous tick
    useEffect(() => {
        const tick = () => {
            const d = new Date();
            currentTimeRef.current = d;
            setCurrentTimeForRender(d); // Update state to trigger NOW line re-render
            setNowHHMMSS(
                `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
            );
            const logicalNow = getLogicalDate(d, dailyStartMinutes);
            const logicalSel = getLogicalDate(selectedDate, dailyStartMinutes);

            // Only auto-update if:
            // 1. We were viewing today in the previous tick (wasViewingTodayRef.current === true)
            // 2. AND now the logical day has changed (rollover occurred)
            // This handles date rollover when viewing today, but doesn't override user-selected past/future dates
            if (wasViewingTodayRef.current && logicalNow !== logicalSel) {
                // We were viewing today, and now the day has rolled over - update to new day
                onDateChange(getStartOfLogicalDay(d, dailyStartMinutes));
            }

            // Update the ref for next tick: are we viewing today now?
            wasViewingTodayRef.current = (logicalNow === logicalSel);
        };
        // Initialize: check if we're viewing today on mount
        const initialD = new Date();
        const initialLogicalNow = getLogicalDate(initialD, dailyStartMinutes);
        const initialLogicalSel = getLogicalDate(selectedDate, dailyStartMinutes);
        wasViewingTodayRef.current = (initialLogicalNow === initialLogicalSel);

        tick();
        // Update every 250ms for smooth NOW line movement (sub-second precision)
        const t = setInterval(tick, 250);
        return () => clearInterval(t);
    }, [dailyStartMinutes, selectedDate, onDateChange]);

    const debugLog = useCallback((...args: any[]) => {
        if (!DEBUG_LANES) return;
        // eslint-disable-next-line no-console
        console.log('[LiveFocusView]', ...args);
    }, [DEBUG_LANES]);

    // Helper function to clear all editing state when switching between subtasks
    const clearEditingState = useCallback(() => {
        frozenLanesRef.current = null;
        frozenCategoryIdRef.current = null;
        resizeHandleSideRef.current = null;
        didEditStageRef.current = false;
        // Clear state first
        setActiveStage(null);
        setIsDragging(false);
        setIsResizing(false);
        setInitialStageLayout(null);
        setTempStageLayout(null);
        setResizeModeStage(null);
        // Also clear refs immediately for synchronous access
        activeStageRef.current = null;
        isDraggingRef.current = false;
        isResizingRef.current = false;
        initialStageLayoutRef.current = null;
        tempStageLayoutRef.current = null;
        resizeModeStageRef.current = null;
    }, []);

    // Auto-scroll functions for drag/resize near edges
    const stopAutoScroll = useCallback(() => {
        if (autoScrollIntervalRef.current) {
            clearInterval(autoScrollIntervalRef.current);
            autoScrollIntervalRef.current = null;
        }
        isAutoScrollingRef.current = false;
        currentAutoScrollDirectionRef.current = null;
        currentAutoScrollSpeedRef.current = 1;
    }, []);

    // Consolidate layout persistence into a single reliable path
    const commitLayoutChange = useCallback(() => {
        // Stop auto-scroll immediately
        stopAutoScroll();

        const a = activeStageRef.current;
        const temp = tempStageLayoutRef.current;
        const mpc = minutesPerCellRef.current;

        // Persist whenever we have a temp layout (meaning user was dragging or resizing).
        // temp.left is in display space (0 = daily start). Convert to minutes-from-midnight:
        // startTimeMinutes = (displayStart + dailyStartMinutes) % 1440
        if (a && temp && (onUpdateStages || onUpdateStageLayout)) {
            const displayStart = (temp.left / CELL_WIDTH) * mpc;
            const startTime = (Math.round(displayStart) + dailyStartMinutes) % 1440;
            let duration = Math.round((temp.width / CELL_WIDTH) * mpc);
            if (!isResizingRef.current) {
                // A plain move keeps the stage's real duration (the drawn width can be clamped at the day end)
                const origStage = tasksRef.current.find(t => t.id === a.taskId)?.stages?.find(st => st.id === a.stageId);
                const origDuration = pendingLayoutsRef.current.get(a.stageId)?.durationMinutes ?? origStage?.durationMinutes;
                if (origDuration != null) duration = origDuration;
            }

            // 1. Synchronously update pending layouts REF
            pendingLayoutsRef.current.set(a.stageId, {
                startTimeMinutes: startTime,
                durationMinutes: duration,
            });

            // 2. Batch Update: Merge ALL pending layouts for this task
            // Use tasksRef so we always have latest tasks (e.g. after approval) without
            // commitLayoutChange depending on [tasks], which would recreate it and could reset state.
            const targetTask = tasksRef.current.find(t => t.id === a.taskId);
            if (targetTask && onUpdateStages) {
                // If we have onUpdateStages, we can send the full list of updated stages
                // which prevents race conditions in the parent component
                const updatedStages = (targetTask.stages || []).map(s => {
                    const pending = pendingLayoutsRef.current.get(s.id);
                    if (pending) {
                        return {
                            ...s,
                            startTimeMinutes: pending.startTimeMinutes,
                            durationMinutes: pending.durationMinutes
                        };
                    }
                    return s;
                });
                onUpdateStages(targetTask, updatedStages);
                debugLog('batch-commit', { taskId: a.taskId, stageCount: updatedStages.length });
            } else if (onUpdateStageLayout) {
                // Fallback to granular update if batch update isn't available
                onUpdateStageLayout(a.taskId, a.stageId, startTime, duration);
            }

            // Trigger re-render to reflect the change in UI
            setPendingLayoutsVersion(v => v + 1);

            // Clear measured height to force recalculation with new lane positions
            setTimeout(() => {
                setTaskHeights(prev => {
                    const newMap = new Map(prev);
                    newMap.delete(a.taskId);
                    return newMap;
                });
            }, 100);
        }

        // Clean up all editing/gesture state
        didEditStageRef.current = false;
        frozenLanesRef.current = null;
        frozenCategoryIdRef.current = null;
        resizeHandleSideRef.current = null;
        currentAutoScrollOffsetRef.current = 0;
        dragStartScrollXRef.current = 0;
        currentAutoScrollDirectionRef.current = null;
        currentAutoScrollSpeedRef.current = 1;

        // Reset React state
        setActiveStage(null);
        setIsDragging(false);
        setIsResizing(false);
        setInitialStageLayout(null);
        setTempStageLayout(null);
        setLastPinchDistance(0);
        setResizeModeStage(null);

        // Also clear refs immediately for synchronous access during next render cycle
        activeStageRef.current = null;
        isDraggingRef.current = false;
        isResizingRef.current = false;
        initialStageLayoutRef.current = null;
        tempStageLayoutRef.current = null;
        resizeModeStageRef.current = null;
    }, [onUpdateStageLayout, onUpdateStages, stopAutoScroll, debugLog, dailyStartMinutes]);

    useEffect(() => {
        commitLayoutChangeRef.current = commitLayoutChange;
    }, [commitLayoutChange]);

    const renderSyncIndicator = useCallback((stage: TaskStage, customStyles?: any, size: number = 8) => {
        if (!stage.syncMode || stage.syncMode === 'none') return null;
        return (
            <View style={[
                styles.stageSyncIndicator,
                stage.syncMode === 'all' ? styles.stageSyncIndicatorAll : styles.stageSyncIndicatorFuture,
                customStyles
            ]}>
                <MaterialIcons
                    name={stage.syncMode === 'all' ? "sync" : "update"}
                    size={size}
                    color={stage.syncMode === 'all' ? "#2196F3" : "#4CAF50"}
                />
            </View>
        );
    }, []);

    const resetScrollTracking = useCallback(() => {
        dragStartScrollXRef.current = timelineScrollXRef.current;
        currentAutoScrollOffsetRef.current = 0;
    }, []);

    const startAutoScroll = useCallback((direction: 'left' | 'right', speed: number = 1) => {
        // If already scrolling in the same direction, just update the speed
        if (isAutoScrollingRef.current &&
            currentAutoScrollDirectionRef.current === direction &&
            autoScrollIntervalRef.current) {
            currentAutoScrollSpeedRef.current = speed;
            return;
        }

        // Stop any existing auto-scroll
        stopAutoScroll();

        isAutoScrollingRef.current = true;
        currentAutoScrollDirectionRef.current = direction;
        currentAutoScrollSpeedRef.current = speed;

        const baseScrollAmount = 5; // Base pixels per interval

        autoScrollIntervalRef.current = setInterval(() => {
            if (!horizontalScrollTimelineRef.current) return;

            // Use current speed (can be updated without restarting interval)
            const scrollAmount = baseScrollAmount * currentAutoScrollSpeedRef.current;
            const currentScrollX = timelineScrollXRef.current;
            const scrollDelta = currentAutoScrollDirectionRef.current === 'right' ? scrollAmount : -scrollAmount;
            const newScrollX = Math.max(0, currentScrollX + scrollDelta);

            // Only scroll if there's actual movement (prevents jitter at boundaries)
            if (newScrollX === currentScrollX) {
                return;
            }

            // Track cumulative scroll offset during drag
            const actualScrollDelta = newScrollX - currentScrollX;
            currentAutoScrollOffsetRef.current += actualScrollDelta;

            // Scroll timeline; header follows via animatedScrollX
            if (horizontalScrollTimelineRef.current) {
                horizontalScrollTimelineRef.current.scrollTo({ x: newScrollX, animated: false });
            }
            animatedScrollX.setValue(newScrollX);

            timelineScrollXRef.current = newScrollX;
        }, 16); // ~60fps
    }, [stopAutoScroll]);

    const checkAndUpdateAutoScroll = useCallback((pageX: number) => {
        const EDGE_THRESHOLD = 100; // Distance from edge to trigger auto-scroll
        const timelineStart = isTaskColumnVisible ? TRACK_LABEL_WIDTH : 0;
        const timelineEnd = screenWidth;
        const timelineWidth = timelineEnd - timelineStart;

        // Calculate position relative to visible timeline
        const relativeX = pageX - timelineStart;

        // Check if near left edge of timeline
        if (relativeX >= 0 && relativeX < EDGE_THRESHOLD) {
            const proximityFactor = 1 - (relativeX / EDGE_THRESHOLD); // 0 to 1 (closer = higher)
            // Smoother speed curve: starts slow, accelerates near edge
            const speed = 0.5 + (proximityFactor * proximityFactor * 2.0); // 0.5 to 2.5x speed (quadratic)
            if (!isAutoScrollingRef.current || autoScrollIntervalRef.current === null) {
                startAutoScroll('left', speed);
            }
        }
        // Check if near right edge of timeline
        else if (relativeX > timelineWidth - EDGE_THRESHOLD && relativeX <= timelineWidth) {
            const proximityFactor = 1 - ((timelineWidth - relativeX) / EDGE_THRESHOLD); // 0 to 1 (closer = higher)
            // Smoother speed curve: starts slow, accelerates near edge
            const speed = 0.5 + (proximityFactor * proximityFactor * 2.0); // 0.5 to 2.5x speed (quadratic)
            if (!isAutoScrollingRef.current || autoScrollIntervalRef.current === null) {
                startAutoScroll('right', speed);
            }
        }
        // Not near any edge - stop auto-scrolling
        else {
            stopAutoScroll();
        }
    }, [isTaskColumnVisible, screenWidth, startAutoScroll, stopAutoScroll]);


    // Calculate timeline based on zoom level.
    // Timeline runs from daily start (e.g. 06:00) to next daily start (06:00) — 1440 display minutes.
    const CELL_WIDTH = 80; // Fixed width per cell
    const TOTAL_MINUTES = 1440;
    const TOTAL_CELLS = Math.ceil(TOTAL_MINUTES / minutesPerCell);
    const TRACK_HEIGHT = 80; // Reduced for compact design
    const TRACK_LABEL_WIDTH = 190;
    /** Space after the last hour of the day: the right rim of a task card (matches the well's right inset). */
    const TIMELINE_END_PAD = 12;
    /** Same as BASE_TOP: space between the last card and the horizontal separator below, so it matches the gap between the top separator and the first card. */
    const TRACK_BOTTOM_PADDING = 12;
    /** Outer gap between two task rows (left cards and timeline rows use the same value). */
    const ROW_GAP = 4;
    /** Height of a minimised task row (left card and timeline strip). */
    const COLLAPSED_ROW_HEIGHT = 48;
    const TIMELINE_WIDTH = TRACK_LABEL_WIDTH + TOTAL_CELLS * CELL_WIDTH + TIMELINE_END_PAD;

    // Generate time labels based on zoom level.
    // Display axis 0..1440; label shows wall clock: (displayMinutes + dailyStartMinutes) % 1440.
    const getTimeLabels = () => {
        const labels = [];
        let labelStep = minutesPerCell;
        if (minutesPerCell < 15) labelStep = 15;
        else if (minutesPerCell < 30) labelStep = 30;
        else if (minutesPerCell < 60) labelStep = 60;
        else if (minutesPerCell < 120) labelStep = 120;

        // Round to nearest integer so floating-point zoom values don't produce decimal time labels
        labelStep = Math.round(labelStep);

        for (let minutes = 0; minutes <= TOTAL_MINUTES; minutes += labelStep) {
            const wallMinutes = Math.round((minutes + dailyStartMinutes) % 1440);
            const hours = Math.floor(wallMinutes / 60);
            const mins = wallMinutes % 60;
            labels.push({
                text: `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`,
                left: (minutes / minutesPerCell) * CELL_WIDTH,
            });
        }
        return labels;
    };

    // Handle smooth pinch gesture for timeline zoom
    const handleTouchMove = useCallback((e: GestureResponderEvent) => {
        if (activeStage) return; // Don't zoom while editing a stage

        if (e.nativeEvent.touches.length === 2) {
            const touch1 = e.nativeEvent.touches[0];
            const touch2 = e.nativeEvent.touches[1];
            const distance = Math.sqrt(
                Math.pow(touch2.pageX - touch1.pageX, 2) +
                Math.pow(touch2.pageY - touch1.pageY, 2)
            );

            // Calculate pinch center for zoom anchoring
            const pinchCenterX = (touch1.pageX + touch2.pageX) / 2;

            // Only store anchor on first pinch (when starting zoom gesture)
            if (lastPinchDistance === 0) {
                // Calculate which time the pinch center represents
                const scrollX = timelineScrollXRef.current;
                const taskColumnWidth = isTaskColumnVisible ? TRACK_LABEL_WIDTH : 0;
                const pinchCenterRelativeToTimeline = pinchCenterX - taskColumnWidth + scrollX;
                const anchorTimeMinutes = (pinchCenterRelativeToTimeline / CELL_WIDTH) * minutesPerCell;
                const anchorScreenX = pinchCenterX - taskColumnWidth;

                setPinchAnchorTime(anchorTimeMinutes);
                setPinchAnchorScreenX(anchorScreenX);
                previousMinutesPerCell.current = minutesPerCell;
            }

            if (lastPinchDistance > 0) {
                const ratio = lastPinchDistance / distance;
                const newMinutesPerCell = minutesPerCell * ratio;

                // Clamp minutesPerCell between 5 minutes and 240 minutes (4 hours)
                const clamped = Math.max(5, Math.min(240, newMinutesPerCell));
                setMinutesPerCell(clamped);
                onZoomChange?.(clamped);
            }
            setLastPinchDistance(distance);
        }
    }, [lastPinchDistance, minutesPerCell, activeStage, onZoomChange, isTaskColumnVisible]);

    const handleTouchEnd = useCallback(() => {
        setLastPinchDistance(0);
        setPinchAnchorTime(null);
        setPinchAnchorScreenX(null);
    }, []);

    // Keep refs in sync
    useEffect(() => { tasksRef.current = tasks; }, [tasks]);
    useEffect(() => { minutesPerCellRef.current = minutesPerCell; }, [minutesPerCell]);
    useEffect(() => { isDraggingRef.current = isDragging; }, [isDragging]);
    useEffect(() => { isResizingRef.current = isResizing; }, [isResizing]);
    useEffect(() => { activeStageRef.current = activeStage; }, [activeStage]);
    useEffect(() => { initialStageLayoutRef.current = initialStageLayout; }, [initialStageLayout]);
    useEffect(() => { tempStageLayoutRef.current = tempStageLayout; }, [tempStageLayout]);
    useEffect(() => { lastPinchDistanceRef.current = lastPinchDistance; }, [lastPinchDistance]);
    useEffect(() => { resizeModeStageRef.current = resizeModeStage; }, [resizeModeStage]);
    useEffect(() => { checkAndUpdateAutoScrollRef.current = checkAndUpdateAutoScroll; }, [checkAndUpdateAutoScroll]);

    // Apply initialViewMode when it changes (e.g. parent restored from AsyncStorage after mount).
    useEffect(() => {
        if (initialViewMode) setViewMode(initialViewMode);
    }, [initialViewMode]);

    // Apply initialZoom when it changes (e.g. parent restored from AsyncStorage after mount).
    // Skip if already the same to avoid echo-updates and flicker when we caused the change.
    useEffect(() => {
        const target = initialZoom ?? 60;
        if (Math.abs(target - minutesPerCellRef.current) <= 0.5) return;
        setMinutesPerCell(target);
    }, [initialZoom]);

    // Apply initialScrollX when it changes (e.g. parent restored from AsyncStorage after mount).
    // Skip if already at that position to avoid programmatic scroll that causes flicker.
    // Set isScrollingHorizontally before programmatic scrollTo so scroll handlers skip onScrollChange.
    useEffect(() => {
        const x = initialScrollX ?? 0;
        if (Date.now() - lastScrollReportAtRef.current < 1500) return; // our own echo, not a restore
        if (Math.abs(x - timelineScrollXRef.current) <= 2) return;
        timelineScrollXRef.current = x;
        isScrollingHorizontally.current = true;
        horizontalScrollTimelineRef.current?.scrollTo({ x, animated: false });
        animatedScrollX.setValue(x);
        scheduleHorizontalScrollLockClear();
    }, [initialScrollX, scheduleHorizontalScrollLockClear]);

    // After pinch-zoom (minutesPerCell change), adjust scroll to keep anchor point stable
    useEffect(() => {
        // Skip if minutesPerCell hasn't actually changed
        if (previousMinutesPerCell.current === minutesPerCell) return;

        let newScrollX = timelineScrollXRef.current;

        // If we have a pinch anchor, use it to calculate new scroll position
        if (pinchAnchorTime !== null && pinchAnchorScreenX !== null) {
            // Calculate where the anchor time should be in pixels at the new zoom level
            const newAnchorPixelPosition = (pinchAnchorTime / minutesPerCell) * CELL_WIDTH;
            // Calculate scroll position to keep anchor at the same screen position
            newScrollX = newAnchorPixelPosition - pinchAnchorScreenX;
        } else {
            // Fallback: anchor to NOW line if no pinch anchor
            // Calculate NOW position before zoom (using previous zoom level)
            const now = currentTimeRef.current;
            const totalSecondsNow = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
            const totalMinutesNow = totalSecondsNow / 60;
            const displayMinutes = (totalMinutesNow - dailyStartMinutes + 1440) % 1440;

            // NOW position before zoom
            const oldNowPosition = (displayMinutes / previousMinutesPerCell.current) * CELL_WIDTH;
            const nowScreenX = oldNowPosition - timelineScrollXRef.current;

            // NOW position after zoom
            const newNowPosition = (displayMinutes / minutesPerCell) * CELL_WIDTH;
            newScrollX = newNowPosition - nowScreenX;
        }

        // Clamp scroll position to valid range
        const taskColumnWidth = isTaskColumnVisible ? TRACK_LABEL_WIDTH : 0;
        const timelineWidth = Math.ceil(TOTAL_MINUTES / minutesPerCell) * CELL_WIDTH + TIMELINE_END_PAD;
        const maxScroll = Math.max(0, timelineWidth - (screenWidth - taskColumnWidth));
        newScrollX = Math.max(0, Math.min(maxScroll, newScrollX));

        // Apply the new scroll position
        timelineScrollXRef.current = newScrollX;
        isScrollingHorizontally.current = true;
        horizontalScrollTimelineRef.current?.scrollTo({ x: newScrollX, animated: false });
        animatedScrollX.setValue(newScrollX);

        // Update previous zoom level
        previousMinutesPerCell.current = minutesPerCell;

        scheduleHorizontalScrollLockClear();
    }, [minutesPerCell, pinchAnchorTime, pinchAnchorScreenX, isTaskColumnVisible, screenWidth, dailyStartMinutes, scheduleHorizontalScrollLockClear]);

    // Cleanup auto-scroll and horizontal scroll lock timeout on unmount
    useEffect(() => {
        return () => {
            stopAutoScroll();
            currentAutoScrollOffsetRef.current = 0;
            dragStartScrollXRef.current = 0;
            currentAutoScrollDirectionRef.current = null;
            currentAutoScrollSpeedRef.current = 1;
            if (horizontalScrollLockTimeoutRef.current != null) {
                clearTimeout(horizontalScrollLockTimeoutRef.current);
                horizontalScrollLockTimeoutRef.current = null;
            }
        };
    }, [stopAutoScroll]);

    // Individual Stage Gesture Handler (timed stages). Uses refs so it works after time is attached.
    // Supports 2D dragging (both horizontal and vertical movement) for MOVE
    // Resize is handled separately via handle drag
    const stagePanResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => {
                // If we're already dragging or resizing, capture immediately to prevent scroll
                return isDraggingRef.current || isResizingRef.current;
            },
            onMoveShouldSetPanResponder: () => {
                // Only an active long-press drag or resize owns the gesture. Capturing every swipe that
                // started on a bar blocked scrolling and ran the commit/reset path after plain swipes.
                return isDraggingRef.current || isResizingRef.current;
            },
            onPanResponderGrant: (evt) => {
                // Provide immediate feedback on successful grab
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            },
            onPanResponderMove: (evt: GestureResponderEvent, gestureState: any) => {
                const a = activeStageRef.current;
                const initial = initialStageLayoutRef.current;
                const temp = tempStageLayoutRef.current;

                // Check for auto-scroll based on touch position
                const { pageX } = evt.nativeEvent;
                if (checkAndUpdateAutoScrollRef.current) {
                    checkAndUpdateAutoScrollRef.current(pageX);
                }

                // Handle MOVE (long-press drag)
                if (isDraggingRef.current && !isResizingRef.current && a && initial) {
                    const dx = gestureState.dx;
                    const dy = gestureState.dy;

                    // CRITICAL: Add scroll offset to compensate for auto-scroll
                    // This keeps the card under the finger even when timeline scrolls
                    const adjustedDx = dx + currentAutoScrollOffsetRef.current;
                    const axisW = Math.ceil(TOTAL_MINUTES / minutesPerCellRef.current) * CELL_WIDTH;
                    const newLeft = Math.max(0, Math.min(axisW - initial.width, initial.left + adjustedDx));

                    const CARD_HEIGHT = 32;
                    const LANE_SPACING = 5;
                    const BASE_TOP = 12;
                    const laneHeight = CARD_HEIGHT + LANE_SPACING;

                    const laneOffset = dy / laneHeight;
                    const newLane = Math.max(0, Math.round(initial.lane + laneOffset));
                    const newTop = BASE_TOP + (newLane * laneHeight);

                    // Ultra-smooth haptics: trigger when switching lanes or every 10 mins of move
                    if (temp && (temp.lane !== newLane || Math.abs(temp.left - newLeft) > (CELL_WIDTH / 6))) {
                        Haptics.selectionAsync();
                    }

                    // Only update state if change is visible (sub-pixel optimization)
                    if (!temp || Math.abs(temp.left - newLeft) > 0.3 || temp.lane !== newLane) {
                        didEditStageRef.current = true;
                        setTempStageLayout({
                            left: newLeft,
                            width: initial.width,
                            top: newTop,
                            lane: newLane
                        });
                    }
                    return;
                }

                // Handle RESIZE (handle drag)
                if (isResizingRef.current && a && initial) {
                    const dx = gestureState.dx;
                    const handleSide = resizeHandleSideRef.current;
                    const mpcCurrent = minutesPerCellRef.current;
                    const pixelsPer5Min = (5 / mpcCurrent) * CELL_WIDTH;

                    // CRITICAL: Add scroll offset to compensate for auto-scroll
                    const adjustedDx = dx + currentAutoScrollOffsetRef.current;

                    if (handleSide === 'right') {
                        const axisW = Math.ceil(TOTAL_MINUTES / mpcCurrent) * CELL_WIDTH;
                        const newWidth = Math.max(30, Math.min(axisW - initial.left, initial.width + adjustedDx));

                        // Haptic feedback for resizing precision
                        if (temp && Math.abs(temp.width - newWidth) >= pixelsPer5Min) {
                            Haptics.selectionAsync();
                        }

                        if (!temp || Math.abs(temp.width - newWidth) > 0.3) {
                            didEditStageRef.current = true;
                            setTempStageLayout({
                                left: initial.left,
                                width: newWidth,
                                top: initial.top,
                                lane: initial.lane
                            });
                        }
                    } else if (handleSide === 'left') {
                        const originalEnd = initial.left + initial.width;
                        const newLeft = Math.max(0, initial.left + adjustedDx);
                        const newWidth = Math.max(30, originalEnd - newLeft);

                        if (temp && Math.abs(temp.left - newLeft) >= pixelsPer5Min) {
                            Haptics.selectionAsync();
                        }

                        if (!temp || Math.abs(temp.left - newLeft) > 0.3) {
                            if (newLeft + newWidth >= originalEnd - 20) {
                                didEditStageRef.current = true;
                                setTempStageLayout({
                                    left: Math.min(newLeft, originalEnd - 30),
                                    width: Math.max(30, originalEnd - Math.min(newLeft, originalEnd - 30)),
                                    top: initial.top,
                                    lane: initial.lane
                                });
                            } else {
                                didEditStageRef.current = true;
                                setTempStageLayout({
                                    left: newLeft,
                                    width: newWidth,
                                    top: initial.top,
                                    lane: initial.lane
                                });
                            }
                        }
                    }
                    return;
                }
            },
            onPanResponderRelease: () => {
                commitLayoutChangeRef.current?.();
            },
            onPanResponderTerminate: () => {
                commitLayoutChangeRef.current?.();
            },
        })
    ).current;

    // Note: Removed automatic current time update to prevent re-renders that reset state
    // The NOW line position is captured once on mount

    // IMPORTANT:
    // This screen must never auto-mutate parent/global task data on mount or when `tasks` changes.
    // Defaults (startTimeMinutes/durationMinutes) are applied at creation time and/or during app rehydration.

    // Sync initial scroll positions on mount
    useEffect(() => {
        // Ensure both vertical scroll views start at the same position
        if (verticalScrollRef.current && verticalScrollLabelsRef.current) {
            // Small delay to ensure refs are ready
            setTimeout(() => {
                if (verticalScrollRef.current && verticalScrollLabelsRef.current) {
                    verticalScrollRef.current.scrollTo({ y: 0, animated: false });
                    verticalScrollLabelsRef.current.scrollTo({ y: 0, animated: false });
                }
            }, 100);
        }
    }, [tasks.length]);

    // NOTE: Pending layouts persist within a date view. When user changes date (dock calendar),
    // we must clear them so the new date's per-instance data (start/duration) is shown.
    const selectedDateKey = getLogicalDate(selectedDate, dailyStartMinutes);
    useEffect(() => {
        pendingLayoutsRef.current.clear();
        setPendingLayoutsVersion(v => v + 1);
        setTaskHeights(new Map());
        setCategorySectionHeights(new Map());
        stagesHashRef.current = '';
        // Exit any in-progress edit (resize/drag) when switching dates
        clearEditingState();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- clearEditingState is stable, only run on date change
    }, [selectedDateKey, dailyStartMinutes]);

    // Clear measured heights when stages change to force recalculation for dynamic lane adjustment
    useEffect(() => {
        // Create a simple hash of task stages to detect changes
        const stagesHash = tasks.map(t =>
            `${t.id}:${(t.stages || []).length}:${(t.stages || []).map(s => `${s.id}:${s.startTimeMinutes ?? 'null'}:${s.durationMinutes ?? 'null'}`).join('|')}`
        ).join('||');

        if (stagesHashRef.current !== stagesHash) {
            stagesHashRef.current = stagesHash;
            // Clear measured heights when stages change to force recalculation with new lane counts
            setTaskHeights(new Map());
        }
    }, [tasks]);

    // Sync vertical scrolling from timeline to labels – smooth, bidirectional
    const lastVerticalSyncY = useRef(0);
    // The list under the finger is the only one that drives the other. The two lists can have slightly
    // different maximum offsets, and letting both write to each other made them fight at the ends.
    const verticalMasterRef = useRef<'timeline' | 'labels' | null>(null);
    const verticalMasterReleaseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const cancelVerticalMasterRelease = useCallback(() => {
        if (verticalMasterReleaseRef.current != null) {
            clearTimeout(verticalMasterReleaseRef.current);
            verticalMasterReleaseRef.current = null;
        }
    }, []);
    const claimVerticalMaster = useCallback((who: 'timeline' | 'labels') => {
        cancelVerticalMasterRelease();
        verticalMasterRef.current = who;
    }, [cancelVerticalMasterRelease]);
    const releaseVerticalMaster = useCallback((delay: number) => {
        cancelVerticalMasterRelease();
        verticalMasterReleaseRef.current = setTimeout(() => {
            verticalMasterReleaseRef.current = null;
            verticalMasterRef.current = null;
        }, delay);
    }, [cancelVerticalMasterRelease]);

    const handleVerticalScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const offsetY = event.nativeEvent.contentOffset.y;
        if (offsetY < 0) return;
        if (verticalMasterRef.current === 'labels') return; // echo of our own scrollTo
        if (verticalMasterRef.current == null) {
            verticalMasterRef.current = 'timeline';
            releaseVerticalMaster(200);
        }
        if (Math.abs(offsetY - lastVerticalSyncY.current) < 0.5) return;
        lastVerticalSyncY.current = offsetY;
        verticalScrollLabelsRef.current?.scrollTo({ y: offsetY, animated: false });
    }, [releaseVerticalMaster]);

    // Sync vertical scrolling from labels to timeline
    const handleVerticalScrollLabels = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const offsetY = event.nativeEvent.contentOffset.y;
        if (offsetY < 0) return;
        if (verticalMasterRef.current === 'timeline') return; // echo of our own scrollTo
        if (verticalMasterRef.current == null) {
            verticalMasterRef.current = 'labels';
            releaseVerticalMaster(200);
        }
        if (Math.abs(offsetY - lastVerticalSyncY.current) < 0.5) return;
        lastVerticalSyncY.current = offsetY;
        verticalScrollRef.current?.scrollTo({ y: offsetY, animated: false });
    }, [releaseVerticalMaster]);

    // Single horizontal scroll source (timeline). Time header follows via Animated transform – no second ScrollView, no flicker.
    const handleHorizontalScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (isScrollingHorizontally.current) return;

        const offsetX = event.nativeEvent.contentOffset.x;
        timelineScrollXRef.current = offsetX;
        lastScrollReportAtRef.current = Date.now();
        onScrollChange?.(offsetX);

        // Mark that user has manually scrolled (prevents auto-scroll to NOW)
        userHasScrolled.current = true;
    }, [onScrollChange]);

    const onTimelineScroll = useMemo(
        () => Animated.event(
            [{ nativeEvent: { contentOffset: { x: animatedScrollX } } }],
            { useNativeDriver: true, listener: handleHorizontalScroll as any }
        ),
        [animatedScrollX, handleHorizontalScroll]
    );
    const negScrollX = useMemo(() => Animated.multiply(animatedScrollX, -1), [animatedScrollX]);

    // NOW position (relative to timeline). Display axis: 0 = daily start, 1440 = next daily start.
    // Includes seconds for smooth sub-minute movement
    // displayMinutes = (minutesFromMidnight - dailyStartMinutes + 1440) % 1440
    const getNowPosition = () => {
        const now = currentTimeRef.current;
        const totalSecondsNow = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
        const totalMinutesNow = totalSecondsNow / 60; // Include seconds as fractional minutes
        const displayMinutes = (totalMinutesNow - dailyStartMinutes + 1440) % 1440;
        return (displayMinutes / minutesPerCell) * CELL_WIDTH;
    };

    // Ref callback: apply initialScrollX (from parent) when ScrollView mounts
    // Stable callback: it must NOT depend on initialScrollX. The parent echoes our own (debounced) scroll
    // position back as that prop; a new callback identity would re-run this and snap the timeline back
    // to a stale offset in the middle of a scroll, which showed up as flicker.
    const latestInitialScrollXRef = useRef(initialScrollX);
    latestInitialScrollXRef.current = initialScrollX;
    // Animated.ScrollView re-invokes its ref callback on re-renders, so only restore for a NEW instance.
    // Restoring on every call threw the timeline back to the last saved offset (06:00 if none yet).
    const lastAttachedTimelineRef = useRef<ScrollViewInstance | null>(null);
    const setTimelineScrollRef = useCallback((ref: ScrollViewInstance | null) => {
        horizontalScrollTimelineRef.current = ref;
        if (ref && ref !== lastAttachedTimelineRef.current) {
            lastAttachedTimelineRef.current = ref;
            const x = latestInitialScrollXRef.current ?? 0;
            timelineScrollXRef.current = x;
            ref.scrollTo({ x, animated: false });
            animatedScrollX.setValue(x);
        }
    }, []);

    // Check if two stages overlap
    const checkStagesOverlap = useCallback((stage1: TaskStage, stage2: TaskStage): boolean => {
        const start1 = stage1.startTimeMinutes ?? 0;
        const duration1 = stage1.durationMinutes ?? 180;
        const end1 = start1 + duration1;

        const start2 = stage2.startTimeMinutes ?? 0;
        const duration2 = stage2.durationMinutes ?? 180;
        const end2 = start2 + duration2;

        // Overlap if they share any time period
        // Two stages overlap if: start1 < end2 AND start2 < end1
        return start1 < end2 && start2 < end1;
    }, []);

    // Lane assignment: 6-to-6 as a single day (display 0–1440). Overlap in DISPLAY space so overnight aligns when it doesn’t overlap last today.
    // - Overlap (in display) => next lane down; no overlap => same lane as previous (align with last card).
    // - Single pass: today (start>=dailyStart) first by start, then overnight (start<dailyStart) by start. No reset: first overnight’s “previous” is last today.
    // - Overlap: (curDisplayStart < prevDisplayEnd) && (prevDisplayStart < curDisplayEnd). Uses pending layouts.
    const calculateStageLanes = useCallback((stages: TaskStage[]): Map<number, number> => {
        if (stages.length === 0) return new Map();

        const getEffectiveTime = (stage: TaskStage) => {
            const pending = pendingLayoutsRef.current.get(stage.id);
            if (pending) return { start: pending.startTimeMinutes, duration: pending.durationMinutes };
            return { start: stage.startTimeMinutes ?? 0, duration: stage.durationMinutes ?? 180 };
        };

        const getDisplayBounds = (stage: TaskStage) => {
            const { start, duration } = getEffectiveTime(stage);
            const displayStart = (start - dailyStartMinutes + 1440) % 1440;
            const displayEnd = Math.min(displayStart + duration, 1440);
            return { displayStart, displayEnd };
        };

        // Order: today (start>=dailyStart) by start, then overnight (start<dailyStart) by start
        const sortedStages = [...stages].sort((a, b) => {
            const timeA = getEffectiveTime(a);
            const timeB = getEffectiveTime(b);
            const inTodayA = timeA.start >= dailyStartMinutes ? 0 : 1;
            const inTodayB = timeB.start >= dailyStartMinutes ? 0 : 1;
            if (inTodayA !== inTodayB) return inTodayA - inTodayB;
            if (timeA.start !== timeB.start) return timeA.start - timeB.start;
            return a.id - b.id;
        });

        const laneMap = new Map<number, number>();
        if (stackSubtasks) {
            // cascade: each subtask sits one row below the previous one
            sortedStages.forEach((st, i) => laneMap.set(st.id, i));
            return laneMap;
        }
        const b0 = getDisplayBounds(sortedStages[0]);
        let prevLane = 0;
        let prevDisplayStart = b0.displayStart;
        let prevDisplayEnd = b0.displayEnd;
        laneMap.set(sortedStages[0].id, 0);

        for (let i = 1; i < sortedStages.length; i++) {
            const cur = sortedStages[i];
            const cb = getDisplayBounds(cur);
            // Overlap in 6–6 display: both intervals share some time
            const overlapsPrev = (cb.displayStart < prevDisplayEnd) && (prevDisplayStart < cb.displayEnd);
            const curLane = overlapsPrev ? prevLane + 1 : prevLane;
            laneMap.set(cur.id, curLane);
            prevLane = curLane;
            prevDisplayStart = cb.displayStart;
            prevDisplayEnd = cb.displayEnd;
        }
        return laneMap;
    }, [dailyStartMinutes, stackSubtasks]);

    // Stage position based on zoom level (relative to timeline start, not including label width)
    const getStageLayout = (stage: TaskStage, stageIndex: number, lane?: number): { left: number; width: number; top: number } => {
        // Constants for lane calculation
        const CARD_HEIGHT = 32; // minHeight from timelineStageCard
        const LANE_SPACING = 5; // 4px gap between consecutive subtasks (lanes)
        const BASE_TOP = 12; // Original top position

        // The day axis is 0..1440 display minutes; a bar must start and end inside it
        const axisWidth = Math.ceil(TOTAL_MINUTES / minutesPerCell) * CELL_WIDTH;
        const fitToAxis = (l: number, w: number) => {
            const left = Math.max(0, Math.min(l, axisWidth - 60));
            return { left, width: Math.min(Math.max(w, 60), axisWidth - left) };
        };

        if (activeStage?.stageId === stage.id && tempStageLayout) {
            // Return temp layout during drag (includes 2D position)
            return {
                left: tempStageLayout.left,
                width: tempStageLayout.width,
                top: tempStageLayout.top
            };
        }

        const top = lane !== undefined ? BASE_TOP + (lane * (CARD_HEIGHT + LANE_SPACING)) : BASE_TOP;

        // Check pending layouts REF first - these are committed changes waiting for props to update.
        // startTimeMinutes is minutes-from-midnight; convert to display: (start - dailyStart + 1440) % 1440
        const pending = pendingLayoutsRef.current.get(stage.id);
        if (pending) {
            const displayStart = (pending.startTimeMinutes - dailyStartMinutes + 1440) % 1440;
            const pendingLeft = (displayStart / minutesPerCell) * CELL_WIDTH;
            const pendingWidth = (pending.durationMinutes / minutesPerCell) * CELL_WIDTH;
            const fitted = fitToAxis(pendingLeft, pendingWidth);
            return { left: fitted.left, width: fitted.width, top };
        }

        // Default values: startTime = 0 (00:00), duration = 180 minutes (3 hours)
        const startTime = stage.startTimeMinutes ?? 0;
        const duration = stage.durationMinutes ?? 180;
        const displayStart = (startTime - dailyStartMinutes + 1440) % 1440;
        const left = (displayStart / minutesPerCell) * CELL_WIDTH;
        const width = (duration / minutesPerCell) * CELL_WIDTH;

        const fitted = fitToAxis(left, width);
        return { left: fitted.left, width: fitted.width, top };
    };

    // Get effective stage time (live during drag/resize, or from pending layouts, or from props).
    // Returns minutes-from-midnight for display (formatTimeCompact etc).
    const getEffectiveStageTime = useCallback((stage: TaskStage): { startTimeMinutes: number; durationMinutes: number } => {
        // LIVE MODE: tempStageLayout.left is in display space; convert to minutes-from-midnight
        if (activeStage?.stageId === stage.id && tempStageLayout) {
            const displayStart = (tempStageLayout.left / CELL_WIDTH) * minutesPerCell;
            const startTimeMinutes = (Math.round(displayStart) + dailyStartMinutes) % 1440;
            const durationMinutes = Math.round((tempStageLayout.width / CELL_WIDTH) * minutesPerCell);
            return { startTimeMinutes, durationMinutes };
        }

        // Check pending layouts REF (synchronous access)
        const pending = pendingLayoutsRef.current.get(stage.id);
        if (pending) {
            return pending;
        }

        // Otherwise use actual values from stage (which comes from local storage via props)
        return {
            startTimeMinutes: stage.startTimeMinutes ?? 0,
            durationMinutes: stage.durationMinutes ?? 180,
        };
    }, [activeStage, tempStageLayout, minutesPerCell, pendingLayoutsVersion, dailyStartMinutes]);

    // Format time for compact display (e.g., "09:00" or "2h30m")
    const formatTimeCompact = (minutes: number): string => {
        const hours = Math.floor(minutes / 60);
        const mins = Math.floor(minutes % 60);
        return `${String(hours % 24).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    };

    // Format duration for compact display (e.g., "2h" or "2h30m" or "45m")
    const formatDurationCompact = (minutes: number): string => {
        const hours = Math.floor(minutes / 60);
        const mins = Math.round(minutes % 60);
        if (hours === 0) return `${mins}m`;
        if (mins === 0) return `${hours}h`;
        return `${hours}h${mins}m`;
    };

    // Format timer as HH:MM:SS (00:00:00 format)
    const formatTimer = (totalSeconds: number): string => {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };

    const formatTimeRange = (startMinutes: number, endMinutes: number) => {
        const startHour = Math.floor(startMinutes / 60);
        const startMin = Math.floor(startMinutes % 60);
        const endHour = Math.floor(endMinutes / 60);
        const endMin = Math.floor(endMinutes % 60);
        return `${String(startHour % 24).padStart(2, '0')}:${String(startMin).padStart(2, '0')} - ${String(endHour % 24).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
    };

    // The part of a stage that falls on this day's axis (daily start -> next daily start).
    // A stage that crosses the day end is cut at the boundary, so its time range and duration are recalculated.
    const visibleOnDay = (t: { startTimeMinutes: number; durationMinutes: number }) => {
        const displayStart = (t.startTimeMinutes - dailyStartMinutes + 1440) % 1440;
        return {
            startTimeMinutes: t.startTimeMinutes,
            durationMinutes: Math.max(0, Math.min(t.durationMinutes, 1440 - displayStart)),
        };
    };

    // Date line for dock: "21 JAN"
    const formatDateLabel = (d: Date) => `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;

    // Calendar helpers (small popup, same design as AddTaskModal)
    const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();
    const changeMonth = (delta: number) => {
        setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    // Sliding month change: swipe the grid left/right (or tap the chevrons) to slide to the next / previous month
    const calSlide = useRef(new Animated.Value(0)).current;
    const slideMonth = useCallback((delta: number) => {
        Animated.timing(calSlide, { toValue: -delta * 40, duration: 90, useNativeDriver: true }).start(() => {
            setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            calSlide.setValue(delta * 40);
            Animated.timing(calSlide, { toValue: 0, duration: 160, useNativeDriver: true }).start();
        });
    }, [calSlide]);
    const calPan = useRef(PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderMove: (_, g) => calSlide.setValue(Math.max(-40, Math.min(40, g.dx * 0.4))),
        onPanResponderRelease: (_, g) => {
            if (g.dx < -40) slideMonth(1);
            else if (g.dx > 40) slideMonth(-1);
            else Animated.spring(calSlide, { toValue: 0, useNativeDriver: true }).start();
        },
        onPanResponderTerminate: () => Animated.spring(calSlide, { toValue: 0, useNativeDriver: true }).start(),
    })).current;

    const renderDockCalendar = () => {
        const days = getDaysInMonth(viewDate.getFullYear(), viewDate.getMonth());
        const firstDay = getFirstDayOfMonth(viewDate.getFullYear(), viewDate.getMonth());
        const daysArray: { day: number; current: boolean }[] = [];
        const prevMonthDays = getDaysInMonth(viewDate.getFullYear(), viewDate.getMonth() - 1);
        for (let i = firstDay - 1; i >= 0; i--) {
            daysArray.push({ day: prevMonthDays - i, current: false });
        }
        for (let i = 1; i <= days; i++) {
            daysArray.push({ day: i, current: true });
        }
        const remaining = 42 - daysArray.length;
        for (let i = 1; i <= remaining; i++) {
            daysArray.push({ day: i, current: false });
        }
        const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
        const todayLogical = getLogicalDate(new Date(), dailyStartMinutes);

        const selectedLogical = getLogicalDate(selectedDate, dailyStartMinutes);
        const goToToday = () => {
            const [ty, tm] = todayLogical.split('-').map(Number);
            setViewDate(new Date(ty, tm - 1, 1));
            onDateChange(getStartOfLogicalDayFromString(todayLogical, dailyStartMinutes));
            setShowDockCalendar(false);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        };

        return (
            <View style={styles.calendarMini}>
                <View style={styles.calHeader}>
                    <Text style={styles.calMonth}>
                        {MONTHS_CAL[viewDate.getMonth()]} <Text style={styles.calYear}>{viewDate.getFullYear()}</Text>
                    </Text>
                    <View style={styles.calNav}>
                        <TouchableOpacity onPress={goToToday} style={styles.calTodayPill} activeOpacity={0.8}>
                            <Text style={styles.calTodayText}>TODAY</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => slideMonth(-1)} style={styles.calNavBtn}>
                            <MaterialIcons name="chevron-left" size={16} color="rgba(255,255,255,0.9)" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => slideMonth(1)} style={styles.calNavBtn}>
                            <MaterialIcons name="chevron-right" size={16} color="rgba(255,255,255,0.9)" />
                        </TouchableOpacity>
                    </View>
                </View>
                <Animated.View
                    {...calPan.panHandlers}
                    style={{
                        opacity: calSlide.interpolate({ inputRange: [-40, 0, 40], outputRange: [0, 1, 0] }),
                        transform: [{ translateX: calSlide }],
                    }}
                >
                <View style={styles.weekRow}>
                    {weekDays.map((d, i) => <Text key={i} style={[styles.weekText, (i === 0 || i === 6) && { color: 'rgba(255,138,138,0.7)' }]}>{d}</Text>)}
                </View>
                <View style={styles.daysGrid}>
                    {daysArray.map((item, i) => {
                        // Use calendar YYYY-MM-DD for the tapped day (avoid midnight rollback: getLogicalDate(00:00) would yield previous day when dailyStart > 0)
                        const cellLogical = item.current
                            ? `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}-${String(item.day).padStart(2, '0')}`
                            : '';
                        const isSelected = item.current && cellLogical === selectedLogical;
                        const isToday = item.current && cellLogical === todayLogical;

                        return (
                            <TouchableOpacity
                                key={i}
                                style={styles.dayCell}
                                disabled={!item.current}
                                activeOpacity={0.7}
                                onPress={() => {
                                    if (item.current && cellLogical) {
                                        onDateChange(getStartOfLogicalDayFromString(cellLogical, dailyStartMinutes));
                                        setShowDockCalendar(false);
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                    }
                                }}
                            >
                                {item.current && (
                                    <View style={[
                                        styles.dayTile,
                                        isToday && styles.todayTile,
                                        isSelected && styles.selectedTile,
                                    ]}>
                                        <Text style={[
                                            styles.dayText,
                                            isToday && !isSelected && { color: '#FFB74D', fontWeight: '800' },
                                            isSelected && { color: '#0A0C10', fontWeight: '900' },
                                        ]}>{item.day}</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </View>
                </Animated.View>
            </View>
        );
    };

    const TIMELINE_ONLY_WIDTH = TOTAL_CELLS * CELL_WIDTH + TIMELINE_END_PAD; // Width without label column

    // Scroll timeline so the NOW line is centered when viewing the current logical day; otherwise scroll to start (daily start).
    const scrollToNow = useCallback(() => {
        const now = new Date();
        const timelineVisibleWidth = screenWidth - (isTaskColumnVisible ? TRACK_LABEL_WIDTH : 0);
        const maxScrollX = Math.max(0, TIMELINE_ONLY_WIDTH - timelineVisibleWidth);

        let scrollX: number;
        if (isSameLogicalDay(selectedDate, now, dailyStartMinutes)) {
            const totalMinutesNow = now.getHours() * 60 + now.getMinutes();
            const displayMinutes = (totalMinutesNow - dailyStartMinutes + 1440) % 1440;
            const nowPosition = (displayMinutes / minutesPerCell) * CELL_WIDTH;
            scrollX = Math.max(0, Math.min(nowPosition - timelineVisibleWidth / 2, maxScrollX));
        } else {
            scrollX = 0; // Start of logical day
        }

        isScrollingHorizontally.current = true;
        timelineScrollXRef.current = scrollX;
        onScrollChange?.(scrollX);
        horizontalScrollTimelineRef.current?.scrollTo({ x: scrollX, animated: true });
        animatedScrollX.setValue(scrollX);

        // Reset flag since user explicitly clicked "Now" button
        userHasScrolled.current = false;

        scheduleHorizontalScrollLockClear();
    }, [screenWidth, isTaskColumnVisible, minutesPerCell, onScrollChange, selectedDate, dailyStartMinutes, scheduleHorizontalScrollLockClear]);

    // When selectedDate changes, update scroll position: scroll to NOW if viewing today, otherwise scroll to start
    // Only auto-scrolls on date change or mount, not on zoom/resize changes
    useEffect(() => {
        // Skip auto-scroll if user has manually scrolled (e.g., during pinch zoom)
        if (userHasScrolled.current) return;

        const now = new Date();
        const timelineVisibleWidth = screenWidth - (isTaskColumnVisible ? TRACK_LABEL_WIDTH : 0);
        const timelineOnlyWidth = TOTAL_CELLS * CELL_WIDTH + TIMELINE_END_PAD; // Recalculate since it depends on minutesPerCell
        const maxScrollX = Math.max(0, timelineOnlyWidth - timelineVisibleWidth);

        let scrollX: number;
        if (isSameLogicalDay(selectedDate, now, dailyStartMinutes)) {
            // Viewing today: center the NOW line
            const totalMinutesNow = now.getHours() * 60 + now.getMinutes();
            const displayMinutes = (totalMinutesNow - dailyStartMinutes + 1440) % 1440;
            const nowPosition = (displayMinutes / minutesPerCell) * CELL_WIDTH;
            scrollX = Math.max(0, Math.min(nowPosition - timelineVisibleWidth / 2, maxScrollX));
        } else {
            // Viewing past/future day: scroll to start (daily start time)
            scrollX = 0;
        }

        // Update scroll position
        timelineScrollXRef.current = scrollX;
        onScrollChange?.(scrollX);
        if (horizontalScrollTimelineRef.current) {
            horizontalScrollTimelineRef.current.scrollTo({ x: scrollX, animated: true });
        }
        animatedScrollX.setValue(scrollX);
    }, [selectedDate, screenWidth, isTaskColumnVisible, minutesPerCell, onScrollChange, dailyStartMinutes]);

    // Time-of-day sliding background segments (timeline-level). Uses dailyStartMinutes so 0 = daily start.
    const timeOfDayBackgroundSegments = useMemo(() => {
        return buildTimeOfDayBackgroundSegments(
            timeOfDaySlots ?? DEFAULT_TIME_OF_DAY_SLOTS,
            minutesPerCell,
            CELL_WIDTH,
            TOTAL_MINUTES,
            dailyStartMinutes
        );
    }, [timeOfDaySlots, minutesPerCell, CELL_WIDTH, TOTAL_MINUTES, dailyStartMinutes]);

    const progressSummary = useMemo(() => {
        const totals = tasks.reduce(
            (acc, task) => {
                const stages = task.stages || [];
                acc.tasks += 1;
                acc.totalStages += stages.length;

                stages.forEach(s => {
                    const status = s.status || 'Upcoming';
                    const isDone = s.isCompleted || status === 'Done';
                    const duration = s.durationMinutes ?? 0;

                    // Stage counts
                    if (isDone) acc.completed += 1;
                    else if (status === 'Process') acc.active += 1;
                    else if (status === 'Undone') acc.undone += 1;
                    else acc.pending += 1;

                    // Time totals (minutes)
                    acc.totalMinutes += duration;
                    if (isDone) acc.doneMinutes += duration;
                    else if (status === 'Undone') acc.undoneMinutes += duration;
                    else {
                        // Pending time includes Upcoming + Process (everything not Done/Undone)
                        acc.pendingMinutes += duration;
                        if (status === 'Process') acc.activeMinutes += duration;
                    }

                    if (status !== 'Done') {
                        acc.remainingMinutes += (s.durationMinutes ?? 0);
                    }
                });

                return acc;
            },
            {
                tasks: 0,
                totalStages: 0,
                completed: 0,
                active: 0,
                pending: 0,
                undone: 0,
                remainingMinutes: 0,
                totalMinutes: 0,
                doneMinutes: 0,
                pendingMinutes: 0,
                activeMinutes: 0,
                undoneMinutes: 0,
            }
        );

        const pct = totals.totalStages > 0 ? Math.round((totals.completed / totals.totalStages) * 100) : 0;
        const undonePct = totals.totalStages > 0 ? Math.round((totals.undone / totals.totalStages) * 100) : 0;
        const remainingHours = Math.floor(totals.remainingMinutes / 60);
        const remainingMins = Math.round(totals.remainingMinutes % 60);

        return { ...totals, pct, undonePct, remainingHours, remainingMins };
    }, [tasks]);

    const displayTasks = showDisabledTasks ? tasks : tasks.filter(t => !t.isDisabled);

    // Filtered view: all timed/untimed entries with task reference; stageId -> task for callbacks
    const mergedTimedEntries = useMemo((): TaskStageEntry[] => {
        const entries: TaskStageEntry[] = [];
        displayTasks.forEach(task => {
            (task.stages || []).forEach(stage => {
                const hasTime = (stage.startTimeMinutes != null) || (stage.durationMinutes != null);
                if (hasTime) entries.push({ task, stage });
            });
        });
        entries.sort((a, b) => {
            const pendingA = pendingLayoutsRef.current.get(a.stage.id);
            const pendingB = pendingLayoutsRef.current.get(b.stage.id);
            const startA = pendingA ? pendingA.startTimeMinutes : (a.stage.startTimeMinutes ?? 0);
            const startB = pendingB ? pendingB.startTimeMinutes : (b.stage.startTimeMinutes ?? 0);
            const inTodayA = startA >= dailyStartMinutes ? 0 : 1;
            const inTodayB = startB >= dailyStartMinutes ? 0 : 1;
            if (inTodayA !== inTodayB) return inTodayA - inTodayB;
            if (startA !== startB) return startA - startB;
            return a.stage.id - b.stage.id;
        });
        return entries;
    }, [displayTasks, dailyStartMinutes]);
    const mergedUntimedEntries = useMemo((): TaskStageEntry[] => {
        const entries: TaskStageEntry[] = [];
        displayTasks.forEach(task => {
            (task.stages || []).forEach(stage => {
                const hasTime = (stage.startTimeMinutes != null) || (stage.durationMinutes != null);
                if (!hasTime) entries.push({ task, stage });
            });
        });
        return entries;
    }, [displayTasks]);
    const stageIdToTask = useMemo(() => {
        const map = new Map<number, Task>();
        displayTasks.forEach(task => {
            (task.stages || []).forEach(s => map.set(s.id, task));
        });
        return map;
    }, [displayTasks]);
    const mergedTimedStages = useMemo(() => mergedTimedEntries.map(e => e.stage), [mergedTimedEntries]);

    // Live stages for full-screen timer (top right): only subtasks whose time range overlaps "now", with remaining countdown (descending) in seconds
    const liveStagesForFullScreen = useMemo((): { text: string; startTimeMinutes: number; durationMinutes: number; remainingSeconds: number; taskId: number; id: number; status: StageStatus }[] => {
        const now = currentTimeRef.current;
        const currentMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
        const nowD = toDisplayMinutes(currentMinutes, dailyStartMinutes); // 0–1440 display space
        const list: { text: string; startTimeMinutes: number; durationMinutes: number; remainingSeconds: number; taskId: number; id: number; status: StageStatus }[] = [];
        displayTasks.forEach(task => {
            (task.stages || []).forEach(stage => {
                const hasTime = (stage.startTimeMinutes != null) || (stage.durationMinutes != null);
                if (!hasTime || (stage.status !== 'Upcoming' && stage.status !== 'Process')) return;
                const pending = pendingLayoutsRef.current.get(stage.id);
                const start = pending ? pending.startTimeMinutes : (stage.startTimeMinutes ?? 0);
                const duration = pending ? pending.durationMinutes : (stage.durationMinutes ?? 180);
                const displayStart = (start - dailyStartMinutes + 1440) % 1440;
                const displayEndRaw = displayStart + duration;
                const overlapsNow =
                    displayEndRaw <= 1440
                        ? nowD >= displayStart && nowD < displayEndRaw
                        : nowD >= displayStart || nowD < displayEndRaw - 1440;
                if (overlapsNow) {
                    const elapsedDisplay = nowD >= displayStart ? nowD - displayStart : (1440 - displayStart) + nowD;
                    const remainingMinutes = duration - elapsedDisplay;
                    const remainingSeconds = Math.max(0, Math.round(remainingMinutes * 60));
                    list.push({
                        text: stage.text,
                        startTimeMinutes: start,
                        durationMinutes: duration,
                        remainingSeconds,
                        taskId: task.id,
                        id: stage.id,
                        status: stage.status
                    });
                }
            });
        });
        list.sort((a, b) => {
            const effectiveA = a.startTimeMinutes < dailyStartMinutes ? a.startTimeMinutes + 1440 : a.startTimeMinutes;
            const effectiveB = b.startTimeMinutes < dailyStartMinutes ? b.startTimeMinutes + 1440 : b.startTimeMinutes;
            return effectiveA - effectiveB;
        });
        return list;
    }, [displayTasks, pendingLayoutsVersion, dailyStartMinutes, currentTimeForRender]);

    // Completed stages for full-screen timer (top left): timed stages with status === 'Done',
    // and only those that start at or after daily start (e.g. 8 AM) so we count "completed since day started"
    const completedStagesForFullScreen = useMemo((): { text: string; startTimeMinutes: number; durationMinutes: number; taskId: number; id: number; status: StageStatus; isOverdueProcess?: boolean }[] => {
        const list: { text: string; startTimeMinutes: number; durationMinutes: number; taskId: number; id: number; status: StageStatus; isOverdueProcess?: boolean }[] = [];
        const now = currentTimeRef.current;
        const currentMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
        const nowD = toDisplayMinutes(currentMinutes, dailyStartMinutes);

        displayTasks.forEach(task => {
            (task.stages || []).forEach(stage => {
                const hasTime = (stage.startTimeMinutes != null) || (stage.durationMinutes != null);
                if (!hasTime) return;

                // Allow "Done" tasks
                // OR "Process" tasks that are overdue (end time passed)
                // Overdue check: displayEnd < nowD

                const pending = pendingLayoutsRef.current.get(stage.id);
                const start = pending ? pending.startTimeMinutes : (stage.startTimeMinutes ?? 0);
                const duration = pending ? pending.durationMinutes : (stage.durationMinutes ?? 180);

                const displayStart = (start - dailyStartMinutes + 1440) % 1440;
                const displayEndRaw = displayStart + duration;

                // Check if it's an overdue process task
                // It is overdue if status is Process AND nowD > displayEndRaw (meaning time has passed)
                // Note: displayEndRaw can be > 1440 if wrapping, so we check logic carefully
                // But simplified: if it's Process, we check if it is NOT overlapping now (i.e. finished)
                // Re-use overlap logic or simple end check?
                // Logic from liveStages: overlapsNow = ...
                // If it DOES NOT overlap now, and is Process, implies it's either future or past.
                // We want PAST. past means nowD >= displayEndRaw (or wrapping equivalent).

                let isOverdueProcess = false;
                if (stage.status === 'Process') {
                    // Check if strictly past
                    if (displayEndRaw <= 1440) {
                        if (nowD >= displayEndRaw) isOverdueProcess = true;
                    } else {
                        // Wraps to next day (e.g. 23:00 to 01:00 -> 1380 to 1500)
                        // It is past if nowD >= displayEndRaw - 1440 AND nowD < displayStart (to avoid confusion with pre-start)
                        // Actually if it wraps, "past" means we are in the next day portion AFTER the end.
                        // e.g. end is 01:00 (1500/60). if now is 02:00 (120), 120 > 60.
                        if (nowD >= displayEndRaw - 1440 && nowD < displayStart) isOverdueProcess = true;
                    }
                }

                if (stage.status !== 'Done' && !isOverdueProcess) return;

                // Allow all times, treating < dailyStart as next day (post-midnight)

                list.push({
                    text: stage.text,
                    startTimeMinutes: start,
                    durationMinutes: duration,
                    taskId: task.id,
                    id: stage.id,
                    status: stage.status,
                    isOverdueProcess
                });
            });
        });
        list.sort((a, b) => {
            // Adjust times relative to dailyStartMinutes
            const effectiveA = a.startTimeMinutes < dailyStartMinutes ? a.startTimeMinutes + 1440 : a.startTimeMinutes;
            const effectiveB = b.startTimeMinutes < dailyStartMinutes ? b.startTimeMinutes + 1440 : b.startTimeMinutes;
            return effectiveA - effectiveB;
        });
        return list;
    }, [displayTasks, pendingLayoutsVersion, dailyStartMinutes, currentTimeForRender]);

    // Upcoming stages for full-screen timer (top left): timed stages with status === 'Upcoming',
    // only those that start at or after daily start (e.g. 8 AM) for the current logical day
    const upcomingStagesForFullScreen = useMemo((): { text: string; startTimeMinutes: number; durationMinutes: number; taskId: number; id: number; isLate: boolean }[] => {
        const list: { text: string; startTimeMinutes: number; durationMinutes: number; taskId: number; id: number; isLate: boolean }[] = [];
        displayTasks.forEach(task => {
            (task.stages || []).forEach(stage => {
                const hasTime = (stage.startTimeMinutes != null) || (stage.durationMinutes != null);
                if (!hasTime || stage.status !== 'Upcoming') return;
                const pending = pendingLayoutsRef.current.get(stage.id);
                const start = pending ? pending.startTimeMinutes : (stage.startTimeMinutes ?? 0);
                const duration = pending ? pending.durationMinutes : (stage.durationMinutes ?? 180);

                // Allow all times, treating < dailyStart as next day (post-midnight)

                // Calculate isLate: compare nowD with displayStart
                const now = currentTimeRef.current;
                const currentMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
                const nowD = toDisplayMinutes(currentMinutes, dailyStartMinutes);

                const displayStart = (start - dailyStartMinutes + 1440) % 1440;
                // It is late if nowD > displayStart (and within reasonable bounds, e.g. same day)
                // Simple check: if nowD > displayStart, it's late.
                const isLate = nowD > displayStart;

                list.push({ text: stage.text, startTimeMinutes: start, durationMinutes: duration, taskId: task.id, id: stage.id, isLate });
            });
        });
        list.sort((a, b) => {
            // Adjust times relative to dailyStartMinutes
            const effectiveA = a.startTimeMinutes < dailyStartMinutes ? a.startTimeMinutes + 1440 : a.startTimeMinutes;
            const effectiveB = b.startTimeMinutes < dailyStartMinutes ? b.startTimeMinutes + 1440 : b.startTimeMinutes;
            return effectiveA - effectiveB;
        });
        return list;
    }, [displayTasks, pendingLayoutsVersion, dailyStartMinutes]);

    // Undone stages for full-screen timer (top left): timed stages with status === 'Undone', start >= daily start
    const undoneStagesForFullScreen = useMemo((): { text: string; startTimeMinutes: number; durationMinutes: number; taskId: number; id: number }[] => {
        const list: { text: string; startTimeMinutes: number; durationMinutes: number; taskId: number; id: number }[] = [];
        displayTasks.forEach(task => {
            (task.stages || []).forEach(stage => {
                const hasTime = (stage.startTimeMinutes != null) || (stage.durationMinutes != null);
                if (!hasTime || stage.status !== 'Undone') return;
                const pending = pendingLayoutsRef.current.get(stage.id);
                const start = pending ? pending.startTimeMinutes : (stage.startTimeMinutes ?? 0);
                const duration = pending ? pending.durationMinutes : (stage.durationMinutes ?? 180);

                // Allow all times, treating < dailyStart as next day (post-midnight)

                list.push({ text: stage.text, startTimeMinutes: start, durationMinutes: duration, taskId: task.id, id: stage.id });
            });
        });
        list.sort((a, b) => {
            // Adjust times relative to dailyStartMinutes
            const effectiveA = a.startTimeMinutes < dailyStartMinutes ? a.startTimeMinutes + 1440 : a.startTimeMinutes;
            const effectiveB = b.startTimeMinutes < dailyStartMinutes ? b.startTimeMinutes + 1440 : b.startTimeMinutes;
            return effectiveA - effectiveB;
        });
        return list;
    }, [displayTasks, pendingLayoutsVersion, dailyStartMinutes]);

    // Category view: one section per category that has tasks; each section has timed (sorted ascending) + untimed entries
    type CategorySection = {
        categoryId: string;
        category: Category | undefined;
        timedEntries: TaskStageEntry[];
        untimedEntries: TaskStageEntry[];
        timedStages: TaskStage[];
        tasks: Task[];
    };
    const categorySections = useMemo((): CategorySection[] => {
        const byCategory = new Map<string, Task[]>();
        displayTasks.forEach(task => {
            const cid = task.categoryId ?? '';
            if (!byCategory.has(cid)) byCategory.set(cid, []);
            byCategory.get(cid)!.push(task);
        });
        const sections: CategorySection[] = [];
        categories.forEach(cat => {
            const catTasks = byCategory.get(cat.id) ?? [];
            if (catTasks.length === 0) return;
            const timedEntries: TaskStageEntry[] = [];
            const untimedEntries: TaskStageEntry[] = [];
            catTasks.forEach(task => {
                (task.stages || []).forEach(stage => {
                    const hasTime = (stage.startTimeMinutes != null) || (stage.durationMinutes != null);
                    if (hasTime) timedEntries.push({ task, stage });
                    else untimedEntries.push({ task, stage });
                });
            });
            timedEntries.sort((a, b) => {
                const pendingA = pendingLayoutsRef.current.get(a.stage.id);
                const pendingB = pendingLayoutsRef.current.get(b.stage.id);
                const startA = pendingA ? pendingA.startTimeMinutes : (a.stage.startTimeMinutes ?? 0);
                const startB = pendingB ? pendingB.startTimeMinutes : (b.stage.startTimeMinutes ?? 0);
                const inTodayA = startA >= dailyStartMinutes ? 0 : 1;
                const inTodayB = startB >= dailyStartMinutes ? 0 : 1;
                if (inTodayA !== inTodayB) return inTodayA - inTodayB;
                if (startA !== startB) return startA - startB;
                return a.stage.id - b.stage.id;
            });
            sections.push({
                categoryId: cat.id,
                category: cat,
                timedEntries,
                untimedEntries,
                timedStages: timedEntries.map(e => e.stage),
                tasks: catTasks,
            });
        });
        const addedIds = new Set(sections.map(s => s.categoryId));
        const buildSection = (categoryId: string, cat: Category | undefined, catTasks: Task[]) => {
            const timedEntries: TaskStageEntry[] = [];
            const untimedEntries: TaskStageEntry[] = [];
            catTasks.forEach(task => {
                (task.stages || []).forEach(stage => {
                    const hasTime = (stage.startTimeMinutes != null) || (stage.durationMinutes != null);
                    if (hasTime) timedEntries.push({ task, stage });
                    else untimedEntries.push({ task, stage });
                });
            });
            timedEntries.sort((a, b) => {
                const pendingA = pendingLayoutsRef.current.get(a.stage.id);
                const pendingB = pendingLayoutsRef.current.get(b.stage.id);
                const startA = pendingA ? pendingA.startTimeMinutes : (a.stage.startTimeMinutes ?? 0);
                const startB = pendingB ? pendingB.startTimeMinutes : (b.stage.startTimeMinutes ?? 0);
                const inTodayA = startA >= dailyStartMinutes ? 0 : 1;
                const inTodayB = startB >= dailyStartMinutes ? 0 : 1;
                if (inTodayA !== inTodayB) return inTodayA - inTodayB;
                if (startA !== startB) return startA - startB;
                return a.stage.id - b.stage.id;
            });
            sections.push({
                categoryId,
                category: cat,
                timedEntries,
                untimedEntries,
                timedStages: timedEntries.map(e => e.stage),
                tasks: catTasks,
            });
        };
        const remaining = Array.from(byCategory.entries()).filter(([cid]) => !addedIds.has(cid) && byCategory.get(cid)!.length > 0);
        remaining.sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : 0)); // uncategorized last
        remaining.forEach(([cid, catTasks]) => {
            const cat = cid === '' ? undefined : categories.find(c => c.id === cid);
            buildSection(cid, cat, catTasks);
        });
        return sections;
    }, [displayTasks, categories, dailyStartMinutes]);

    const zoomLabel = useMemo(() => {
        const m = Math.round(minutesPerCell);
        if (m % 60 === 0) return `${m / 60}HR`;
        if (m < 60) return `${m}MIN`;
        const h = Math.floor(m / 60);
        const mm = m % 60;
        return `${h}H ${mm}M`;
    }, [minutesPerCell]);

    // Calculate content height based on number of tasks and untimed subtasks
    // Calculate content height using measured heights or fallback to estimation
    const calculateContentHeight = useCallback(() => {
        const CARD_HEIGHT = 32;
        const LANE_SPACING = 5;
        const BASE_TOP = 12;

        if (viewMode === 'merged') {
            const untimedListHeight = mergedUntimedEntries.length > 0
                ? (mergedUntimedEntries.length * 24.5) + 7 + 7 + 3.5
                : 0;
            const mergedLanes = calculateStageLanes(mergedTimedStages);
            const maxLane = mergedTimedStages.length > 0
                ? Math.max(...Array.from(mergedLanes.values()), -1)
                : -1;
            const timedStagesHeight = maxLane >= 0
                ? BASE_TOP + ((maxLane + 1) * (CARD_HEIGHT + LANE_SPACING)) - LANE_SPACING + TRACK_BOTTOM_PADDING
                : 0;
            const trackHeight = Math.max(
                taskHeights.get(MERGED_TRACK_ID) ?? 0,
                TRACK_HEIGHT,
                untimedListHeight,
                timedStagesHeight
            );
            return trackHeight + 1 + TRACK_BOTTOM_PADDING + 30;
        }

        if (viewMode === 'category') {
            let totalHeight = 0;
            categorySections.forEach(section => {
                const measured = categorySectionHeights.get(section.categoryId);
                if (measured && measured > 0) {
                    totalHeight += measured + 1 + TRACK_BOTTOM_PADDING;
                } else {
                    const untimedListHeight = section.untimedEntries.length > 0
                        ? (section.untimedEntries.length * 24.5) + 7 + 7 + 3.5
                        : 0;
                    const sectionLanes = calculateStageLanes(section.timedStages);
                    const maxLane = section.timedStages.length > 0
                        ? Math.max(...Array.from(sectionLanes.values()), -1)
                        : -1;
                    const timedStagesHeight = maxLane >= 0
                        ? BASE_TOP + ((maxLane + 1) * (CARD_HEIGHT + LANE_SPACING)) - LANE_SPACING + TRACK_BOTTOM_PADDING
                        : 0;
                    const trackHeight = Math.max(TRACK_HEIGHT, untimedListHeight, timedStagesHeight);
                    totalHeight += trackHeight + 1 + TRACK_BOTTOM_PADDING;
                }
            });
            return totalHeight + 30;
        }

        let totalHeight = 0;
        tasks.forEach(task => {
            // Use measured height if available, otherwise calculate
            const measuredHeight = taskHeights.get(task.id);
            if (measuredHeight && measuredHeight > 0) {
                totalHeight += measuredHeight + 1; // +1 for separator
            } else {
                // Fallback calculation
                const stages = task.stages || [];
                const untimedStages = stages.filter(s =>
                    (s.startTimeMinutes === undefined || s.startTimeMinutes === null) &&
                    (s.durationMinutes === undefined || s.durationMinutes === null)
                );
                const timedStages = stages.filter(s =>
                    (s.startTimeMinutes !== undefined && s.startTimeMinutes !== null) ||
                    (s.durationMinutes !== undefined && s.durationMinutes !== null)
                );

                const untimedListHeight = untimedStages.length > 0
                    ? (untimedStages.length * 24.5) + 7 + 7 + 3.5 // items (35*0.7=24.5) + top padding (10*0.7=7) + bottom padding (10*0.7=7) + extra bottom margin (5*0.7=3.5) to prevent overlap
                    : 0;

                // Calculate max lanes needed for timed stages
                const timedStageLanes = calculateStageLanes(timedStages);
                const maxLane = timedStages.length > 0
                    ? Math.max(...Array.from(timedStageLanes.values()), -1)
                    : -1;
                const CARD_HEIGHT = 32;
                const LANE_SPACING = 5; // 4px gap between consecutive subtasks
                const BASE_TOP = 12;
                const timedStagesHeight = maxLane >= 0
                    ? BASE_TOP + ((maxLane + 1) * (CARD_HEIGHT + LANE_SPACING)) - LANE_SPACING + TRACK_BOTTOM_PADDING
                    : 0;

                const trackHeight = Math.max(TRACK_HEIGHT, untimedListHeight, timedStagesHeight);
                totalHeight += trackHeight + 1 + TRACK_BOTTOM_PADDING; // +1 separator, +marginBottom so scroll height matches
            }
        });
        return totalHeight + 30; // +30 for extra padding at bottom
    }, [tasks, taskHeights, calculateStageLanes, viewMode, mergedUntimedEntries.length, mergedTimedStages, categorySections, categorySectionHeights]);

    const contentHeight = calculateContentHeight();
    const baseBottomSpacing = isProgressExpanded ? progressDockHeight + 20 : 40;
    const BOTTOM_SPACING = isLandscape ? baseBottomSpacing : baseBottomSpacing + insets.bottom;
    // Keep timeline background full-screen when 0 or 1 task (min height = viewport)
    const minScrollHeight = Math.max(contentHeight, screenHeight - (isLandscape ? 25 : 30));

    // Handler to update task height when measured
    const handleTaskHeightMeasured = useCallback((taskId: number, height: number) => {
        setTaskHeights(prev => {
            const newMap = new Map(prev);
            const currentHeight = prev.get(taskId);
            if (currentHeight === undefined || Math.abs(currentHeight - height) > 0.5) {
                newMap.set(taskId, height);
                return newMap;
            }
            return prev;
        });
    }, []);

    const handleCategorySectionHeightMeasured = useCallback((categoryId: string, height: number) => {
        setCategorySectionHeights(prev => {
            const newMap = new Map(prev);
            const current = prev.get(categoryId);
            if (current === undefined || Math.abs(current - height) > 0.5) {
                newMap.set(categoryId, height);
                return newMap;
            }
            return prev;
        });
    }, []);

    const handleApproveAll = useCallback(() => {
        if (!onUpdateStages) return;
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        tasks.forEach(task => {
            let hasChanges = false;
            const updatedStages = (task.stages || []).map(stage => {
                const startTime = stage.startTimeMinutes ?? 0;
                const duration = stage.durationMinutes ?? 0;
                const endTime = startTime + duration;

                if (stage.status === 'Process' && endTime <= currentMinutes) {
                    hasChanges = true;
                    return { ...stage, status: 'Done' as StageStatus };
                }
                return stage;
            });

            if (hasChanges) {
                onUpdateStages(task, updatedStages);
            }
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setApprovalPopupVisible(false);
    }, [tasks, onUpdateStages]);

    const handleUpdateStageStatus = useCallback((taskId: number, stageId: number, status: StageStatus, syncMode?: SyncMode) => {
        if (!onUpdateStages) return;
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        const updatedStages = (task.stages || []).map(s =>
            s.id === stageId ? { ...s, status, isCompleted: status === 'Done' } : s
        );
        onUpdateStages(task, updatedStages, syncMode);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, [tasks, onUpdateStages]);

    const handleStartStage = useCallback((taskId: number, stageId: number) => {
        if (!onUpdateStages) return;
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        // Calculate current time as new start time
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const newStartTime = (currentMinutes + 1440) % 1440;

        const updatedStages = (task.stages || []).map(s => {
            if (s.id === stageId) {
                // Update pending layout ref immediately for responsiveness
                pendingLayoutsRef.current.set(s.id, {
                    startTimeMinutes: newStartTime,
                    durationMinutes: s.durationMinutes || 30
                });
                return { ...s, status: 'Process' as StageStatus, startTimeMinutes: newStartTime };
            }
            return s;
        });

        onUpdateStages(task, updatedStages);
        // Force refresh
        setPendingLayoutsVersion(v => v + 1);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, [tasks, onUpdateStages]);

    const handleExtendStage = useCallback((taskId: number, stageId: number, minutes: number) => {
        if (!onUpdateStages) return;
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        const updatedStages = (task.stages || []).map(s => {
            if (s.id === stageId) {
                // Update pending layout ref
                const currentDuration = pendingLayoutsRef.current.get(s.id)?.durationMinutes || s.durationMinutes || 30;
                const newDuration = currentDuration + minutes;

                // If it has pending layout, update it
                if (pendingLayoutsRef.current.has(s.id)) {
                    const existing = pendingLayoutsRef.current.get(s.id)!;
                    pendingLayoutsRef.current.set(s.id, {
                        ...existing,
                        durationMinutes: newDuration
                    });
                }

                // Also update the stage object itself so the change persists
                return { ...s, durationMinutes: newDuration };
            }
            return s;
        });

        onUpdateStages(task, updatedStages);
        // Force refresh
        setPendingLayoutsVersion(v => v + 1);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, [tasks, onUpdateStages]);

    const handleCompleteStage = useCallback((taskId: number, stageId: number) => {
        if (!onUpdateStages) return;
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        const updatedStages = (task.stages || []).map(s => {
            if (s.id === stageId) {
                const start = s.startTimeMinutes || 0;
                let actualDuration = currentMinutes - start;
                if (actualDuration < 0) actualDuration += 1440;
                actualDuration = Math.max(1, actualDuration);
                return { ...s, status: 'Done' as StageStatus, durationMinutes: actualDuration };
            }
            return s;
        });

        onUpdateStages(task, updatedStages);
        setPendingLayoutsVersion(v => v + 1);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, [tasks, onUpdateStages]);

    // Create a new subtask on a task (used by the add form and by the portrait slide-to-add sheet)
    const handleAddSubtask = useCallback((taskId: number, text: string, startTime: number, duration: number, syncMode?: SyncMode) => {
        if (!onUpdateStages) return;
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        // Generate a stable stage id (avoid collisions within the task)
        const existingIds = new Set((task.stages || []).map(s => s.id));
        let stageId = Date.now();
        while (existingIds.has(stageId)) stageId += 1;

        const newStage: TaskStage = {
            id: stageId,
            text: text,
            isCompleted: false,
            status: 'Upcoming',
            createdAt: new Date().toISOString(),
            // 6-to-6: default start to beginning of logical day (e.g. 06:00) when missing
            startTimeMinutes: startTime ?? dailyStartMinutes,
            durationMinutes: duration ?? 180,
        };

        onUpdateStages(task, [...(task.stages || []), newStage], syncMode);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, [tasks, onUpdateStages, dailyStartMinutes]);

    const handleDeleteStage = useCallback((taskId: number, stageId: number) => {
        if (!onUpdateStages) return;
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        const stage = task.stages?.find(s => s.id === stageId);
        const isLocalOnly = !stage?.syncMode || stage.syncMode === 'none';

        if (task.recurrence && !task.recurrence.repeatSync && !isLocalOnly) {
            Alert.alert(
                'Delete Subtask',
                'Do you want to delete this subtask from all days or just today?',
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Delete Current Day',
                        onPress: () => {
                            const updatedStages = (task.stages || []).filter(s => s.id !== stageId);
                            onUpdateStages(task, updatedStages, 'none');
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        }
                    },
                    {
                        text: 'Delete All Days',
                        style: 'destructive',
                        onPress: () => {
                            const updatedStages = (task.stages || []).filter(s => s.id !== stageId);
                            onUpdateStages(task, updatedStages, 'all');
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        }
                    }
                ]
            );
        } else {
            Alert.alert(
                'Delete Subtask',
                'Are you sure you want to delete this subtask?',
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: () => {
                            const updatedStages = (task.stages || []).filter(s => s.id !== stageId);
                            onUpdateStages(task, updatedStages);
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        }
                    }
                ]
            );
        }
    }, [tasks, onUpdateStages]);

    // 6-to-6 day as one: use toDisplayMinutes so 23:55→00:25 and "now" 01:30 compare correctly across midnight.
    const getApprovalCount = useCallback(() => {
        const currentMinutes = currentTimeRef.current.getHours() * 60 + currentTimeRef.current.getMinutes();
        return getApprovalItems(tasks, categories, dailyStartMinutes, currentMinutes).length;
    }, [tasks, categories, dailyStartMinutes]);

    const approvalCount = getApprovalCount();

    // Same 6-to-6 display comparison as getApprovalCount/ApprovalPopup.
    const stageNeedsApproval = useCallback((stage: TaskStage): 'START' | 'FINISH' | null => {
        const currentMinutes = currentTimeRef.current.getHours() * 60 + currentTimeRef.current.getMinutes();
        return getApprovalType(stage, currentMinutes, dailyStartMinutes);
    }, [dailyStartMinutes]);

    // Round status disc at the start of a timeline bar. Tapping it opens the status picker for that stage.
    const STATUS_DISC_ICON: Record<StageStatus, keyof typeof MaterialIcons.glyphMap> = {
        Upcoming: 'schedule',
        Process: 'schedule',
        Done: 'check',
        Undone: 'close',
    };
    const renderStageStatusDisc = (taskId: number, stage: TaskStage) => {
        const status = (stage.status || 'Upcoming') as StageStatus;
        return (
            // Full-height, vertically centred slot: the disc is always centred in the bar whatever its height
            <View pointerEvents="box-none" style={styles.stageStatusSlotDeep}>
                <TouchableOpacity
                    activeOpacity={0.7}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    style={styles.stageStatusSocketDeep}
                    onPress={(e) => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        const { pageX, pageY } = e.nativeEvent;
                        setStageStatusPopupPosition({ x: pageX, y: pageY + 16 });
                        setStatusPopupTarget({ taskId, stageId: stage.id });
                        setStageStatusPopupVisible(true);
                    }}
                >
                    <View style={[styles.stageStatusDiscDeep, { backgroundColor: STAGE_RAIL[status] }]}>
                        <MaterialIcons name={STATUS_DISC_ICON[status]} size={12} color="#0A0C10" />
                    </View>
                </TouchableOpacity>
            </View>
        );
    };

    const toggleTaskCollapsed = (taskId: number) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        clearEditingState();
        setCollapsedTaskIds(prev => {
            const next = new Set(prev);
            if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
            return next;
        });
    };

    // Minimised row: the task's stages as small status capsules on two thin lanes
    const renderCollapsedStrip = (task: Task, timed: TaskStage[]) => {
        const laneEnds = [-1, -1];
        return timed.map((stage, idx) => {
            const { left, width } = getStageLayout(stage, idx, 0);
            const w = Math.max(18, width);
            const status = (stage.status || 'Upcoming') as StageStatus;
            const lane = laneEnds[0] <= left ? 0 : 1;
            laneEnds[lane] = left + w;
            return (
                <View
                    key={`mini-${task.id}-${stage.id}`}
                    pointerEvents="none"
                    style={[styles.miniCapsuleDeep, { left, width: w, top: 11 + lane * 15, backgroundColor: DEEP_STAGE_BG[status] }]}
                >
                    <View style={[styles.miniCapsuleDotDeep, { backgroundColor: STAGE_RAIL[status] }]} />
                    {w > 64 && <Text style={styles.miniCapsuleTextDeep} numberOfLines={1}>{stage.text}</Text>}
                </View>
            );
        });
    };

    // Sunken well inside each task row (the timeline half of the rail card)
    const renderRailWell = () => (
        <View pointerEvents="none" style={styles.railWellDeep}>
            {timeOfDayBackgroundSegments.map((seg, i) => (
                <View
                    key={`rw-tint-${seg.key}-${i}`}
                    style={[styles.timeOfDayBackgroundSegment, { left: seg.left - 4, width: seg.width, backgroundColor: seg.colorHex }]}
                />
            ))}
            {getTimeLabels().map((label, i) => (
                <View key={`rw-line-${i}`} style={[styles.railWellLineDeep, { left: label.left - 5 }]} />
            ))}
        </View>
    );

    return (
        <View style={[styles.container, !isLandscape && { paddingTop: insets.top }]}>

            {/* Main Container: Fixed Labels + Scrollable Timeline. When progress bar is open, reserve bottom space so time log scrolls above it. */}
            <View style={[styles.mainContainer, isProgressExpanded && { paddingBottom: progressDockHeight }]}>
                {/* Toggle Button for Task Column — smooth pill on the column edge */}
                <Animated.View
                    style={[
                        styles.taskColumnToggleWrapper,
                        {
                            // Fixed vertical centre of the screen: independent of the progress dock opening/closing
                            top: screenHeight / 2,
                            left: taskColumnWidthAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0, TRACK_LABEL_WIDTH - 12],
                            }),
                        },
                    ]}
                >
                    <TouchableOpacity
                        style={styles.taskColumnToggle}
                        onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            const next = !isTaskColumnVisible;
                            setIsTaskColumnVisible(next);
                            Animated.timing(taskColumnWidthAnim, {
                                toValue: next ? 1 : 0,
                                duration: 280,
                                useNativeDriver: false,
                            }).start();
                        }}
                        activeOpacity={0.85}
                    >
                        <View style={styles.taskColumnToggleGrip} />
                        <MaterialIcons
                            name={isTaskColumnVisible ? 'chevron-left' : 'chevron-right'}
                            size={18}
                            color={isTaskColumnVisible ? 'rgba(255,255,255,0.85)' : '#22E3F5'}
                        />
                        <View style={styles.taskColumnToggleGrip} />
                    </TouchableOpacity>
                </Animated.View>

                {/* Fixed Left Column - Task Labels (always mounted; width animates for smooth open/close) */}
                <Animated.View
                    style={[
                        styles.fixedLabelsColumn,
                        styles.mainColumnWhenDockOpen,
                        {
                            width: taskColumnWidthAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0, TRACK_LABEL_WIDTH],
                            }),
                            overflow: 'hidden',
                        },
                    ]}
                >
                    {/* Top left: minimal header (view toggle moved to progress bar) */}
                    <View style={[styles.stickyHeaderFixed, styles.taskListHeaderMinimal, { width: TRACK_LABEL_WIDTH, height: 25 }]}>
                        <Text style={styles.taskHeaderLabelDeep}>TASKS · {tasks.length}</Text>
                        <View style={styles.collapseAllPillDeep}>
                            <TouchableOpacity
                                style={styles.collapseAllBtnDeep}
                                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                                onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                    clearEditingState();
                                    setCollapsedTaskIds(new Set(tasks.map(t => t.id)));
                                }}
                                activeOpacity={0.7}
                            >
                                <MaterialIcons name="unfold-less" size={14} color="#FFFFFF" />
                            </TouchableOpacity>
                            <View style={styles.collapseAllDividerDeep} />
                            <TouchableOpacity
                                style={styles.collapseAllBtnDeep}
                                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                                onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                    setCollapsedTaskIds(new Set());
                                }}
                                activeOpacity={0.7}
                            >
                                <MaterialIcons name="unfold-more" size={14} color="rgba(255,255,255,0.6)" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Vertical Scroll for Labels (synced with timeline) */}
                    <ScrollView
                        ref={verticalScrollLabelsRef}
                        style={styles.verticalScrollLabels}
                        contentContainerStyle={{
                            minHeight: minScrollHeight,
                            paddingBottom: BOTTOM_SPACING,
                        }}
                        showsVerticalScrollIndicator={false}
                        scrollEnabled={!activeStage}
                        onScroll={handleVerticalScrollLabels}
                        onScrollBeginDrag={() => claimVerticalMaster('labels')}
                        onScrollEndDrag={() => releaseVerticalMaster(250)}
                        onMomentumScrollBegin={cancelVerticalMasterRelease}
                        onMomentumScrollEnd={() => releaseVerticalMaster(0)}
                        scrollEventThrottle={16}
                        bounces={false}
                        bouncesZoom={false}
                        alwaysBounceVertical={false}
                        removeClippedSubviews={false}
                        overScrollMode="never"
                        decelerationRate="normal"
                    >
                        <View>
                            {viewMode === 'merged' ? (() => {
                                const totalStages = mergedTimedEntries.length + mergedUntimedEntries.length;
                                const untimedListHeight = mergedUntimedEntries.length > 0
                                    ? (mergedUntimedEntries.length * 24.5) + 7 + 7 + 3.5
                                    : 0;
                                const mergedLanes = calculateStageLanes(mergedTimedStages);
                                const maxLane = mergedTimedStages.length > 0
                                    ? Math.max(...Array.from(mergedLanes.values()), -1)
                                    : -1;
                                const CARD_HEIGHT = 32;
                                const LANE_SPACING = 5;
                                const BASE_TOP = 12;
                                const timedStagesHeight = maxLane >= 0
                                    ? BASE_TOP + ((maxLane + 1) * (CARD_HEIGHT + LANE_SPACING)) - LANE_SPACING + TRACK_BOTTOM_PADDING
                                    : 0;
                                const measuredHeight = taskHeights.get(MERGED_TRACK_ID) ?? 0;
                                const trackHeight = Math.max(measuredHeight, TRACK_HEIGHT, untimedListHeight, timedStagesHeight);
                                const s = [...mergedTimedStages, ...mergedUntimedEntries.map(e => e.stage)];
                                const doneCount = s.filter(i => i.status === 'Done' || i.isCompleted).length;
                                const undoneCount = s.filter(i => i.status === 'Undone').length;
                                const pendingCount = Math.max(0, s.length - doneCount - undoneCount);
                                const den = s.length || 1;
                                return (
                                    <View key="merged">
                                        <View style={styles.trackSeparator} />
                                        <View
                                            style={[styles.trackLabelContainer, { height: trackHeight, marginBottom: ROW_GAP }]}
                                            onLayout={(event: any) => {
                                                const { height } = event.nativeEvent.layout;
                                                if (height > 0) requestAnimationFrame(() => handleTaskHeightMeasured(MERGED_TRACK_ID, height));
                                            }}
                                        >
                                            <TouchableOpacity
                                                activeOpacity={1}
                                                style={[styles.trackLabel, { width: TRACK_LABEL_WIDTH - 8 }]}
                                            >
                                                <View pointerEvents="none" style={styles.trackGrooveDeep} />
                                                <View style={styles.trackLabelInner}>
                                                    <View style={[styles.categoryPill, { borderLeftColor: 'rgba(76,175,80,0.6)' }]}>
                                                        <Text style={[styles.categoryPillText, { color: '#4CAF50' }]}>ALL SUBTASKS</Text>
                                                    </View>
                                                    <View style={styles.titleRow}>
                                                        <Text style={styles.trackTitle} numberOfLines={1}>Merged view</Text>
                                                        <TouchableOpacity
                                                            style={styles.taskAddSubtaskBtn}
                                                            onPress={() => {
                                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                                const firstTask = tasks[0];
                                                                if (firstTask) {
                                                                    const nowMinutes = currentTimeRef.current.getHours() * 60 + currentTimeRef.current.getMinutes();
                                                                    setAddSubtaskModal({
                                                                        visible: true,
                                                                        taskId: firstTask.id,
                                                                        startTimeMinutes: nowMinutes,
                                                                        mode: 'add',
                                                                    });
                                                                }
                                                            }}
                                                            activeOpacity={0.7}
                                                        >
                                                            <MaterialIcons name="add" size={14} color="rgba(255,255,255,0.6)" />
                                                        </TouchableOpacity>
                                                    </View>
                                                    <TrackProgressRing done={doneCount} undone={undoneCount} total={s.length || 0} />
                                                </View>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                );
                            })() : viewMode === 'category' ? categorySections.map((section) => {
                                const totalStages = section.timedEntries.length + section.untimedEntries.length;
                                const untimedListHeight = section.untimedEntries.length > 0
                                    ? (section.untimedEntries.length * 24.5) + 7 + 7 + 3.5
                                    : 0;
                                const sectionLanes = calculateStageLanes(section.timedStages);
                                const maxLane = section.timedStages.length > 0
                                    ? Math.max(...Array.from(sectionLanes.values()), -1)
                                    : -1;
                                const CARD_HEIGHT = 32;
                                const LANE_SPACING = 5;
                                const BASE_TOP = 12;
                                const timedStagesHeight = maxLane >= 0
                                    ? BASE_TOP + ((maxLane + 1) * (CARD_HEIGHT + LANE_SPACING)) - LANE_SPACING + TRACK_BOTTOM_PADDING
                                    : 0;
                                const measuredHeight = categorySectionHeights.get(section.categoryId) ?? 0;
                                const trackHeight = Math.max(measuredHeight, TRACK_HEIGHT, untimedListHeight, timedStagesHeight);
                                const s = [...section.timedStages, ...section.untimedEntries.map(e => e.stage)];
                                const doneCount = s.filter(i => i.status === 'Done' || i.isCompleted).length;
                                const undoneCount = s.filter(i => i.status === 'Undone').length;
                                const pendingCount = Math.max(0, s.length - doneCount - undoneCount);
                                const den = s.length || 1;
                                const cat = section.category;
                                return (
                                    <View key={section.categoryId || 'uncategorized'}>
                                        <View style={styles.trackSeparator} />
                                        <View
                                            style={[styles.trackLabelContainer, { height: trackHeight, marginBottom: ROW_GAP }]}
                                            onLayout={(event: any) => {
                                                const { height } = event.nativeEvent.layout;
                                                if (height > 0) requestAnimationFrame(() => handleCategorySectionHeightMeasured(section.categoryId, height));
                                            }}
                                        >
                                            <TouchableOpacity
                                                activeOpacity={1}
                                                style={[styles.trackLabel, { width: TRACK_LABEL_WIDTH - 8 }]}
                                            >
                                                <View pointerEvents="none" style={styles.trackGrooveDeep} />
                                                <View style={styles.trackLabelInner}>
                                                    <View style={[styles.categoryPill, { borderLeftColor: cat?.color || 'rgba(255,255,255,0.2)' }]}>
                                                        {cat && <MaterialIcons name={cat.icon as any} size={9} color={cat.color} style={styles.categoryPillIcon} />}
                                                        <Text style={[styles.categoryPillText, { color: cat ? cat.color : 'rgba(255,255,255,0.5)' }]} numberOfLines={1}>
                                                            {cat ? cat.name.toUpperCase() : 'GENERAL'}
                                                        </Text>
                                                    </View>
                                                    <View style={styles.titleRow}>
                                                        <Text style={styles.trackTitle} numberOfLines={1}>
                                                            {section.tasks.length} task{section.tasks.length !== 1 ? 's' : ''}
                                                        </Text>
                                                        <TouchableOpacity
                                                            style={styles.taskAddSubtaskBtn}
                                                            onPress={() => {
                                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                                const firstTask = section.tasks[0];
                                                                if (firstTask) {
                                                                    const nowMinutes = currentTimeRef.current.getHours() * 60 + currentTimeRef.current.getMinutes();
                                                                    setAddSubtaskModal({
                                                                        visible: true,
                                                                        taskId: firstTask.id,
                                                                        startTimeMinutes: nowMinutes,
                                                                        mode: 'add',
                                                                    });
                                                                }
                                                            }}
                                                            activeOpacity={0.7}
                                                        >
                                                            <MaterialIcons name="add" size={14} color="rgba(255,255,255,0.6)" />
                                                        </TouchableOpacity>
                                                    </View>
                                                    <TrackProgressRing done={doneCount} undone={undoneCount} total={s.length || 0} />
                                                </View>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                );
                            }) : displayTasks.map((task, taskIndex) => {
                                const stages = task.stages || [];
                                const liveStatus = getTaskLiveStatus(task);
                                const isActive = liveStatus === 'ACTIVE';
                                const category = categories.find(c => c.id === task.categoryId);
                                const isCollapsed = collapsedTaskIds.has(task.id);

                                // Get measured height or calculate fallback (must grow when new lanes appear)
                                const measuredHeight = taskHeights.get(task.id) ?? 0;

                                // Keep filtering consistent with timeline-side logic
                                const untimedStages = stages.filter(s =>
                                    (s.startTimeMinutes === undefined || s.startTimeMinutes === null) &&
                                    (s.durationMinutes === undefined || s.durationMinutes === null)
                                );
                                const timedStages = stages.filter(s =>
                                    (s.startTimeMinutes !== undefined && s.startTimeMinutes !== null) ||
                                    (s.durationMinutes !== undefined && s.durationMinutes !== null)
                                );

                                const untimedListHeight = untimedStages.length > 0
                                    ? (untimedStages.length * 24.5) + 7 + 7 + 3.5 // items + top + bottom + extra bottom margin
                                    : 0;

                                // Timed stages may stack into multiple lanes; include that in row height
                                const timedStageLanes = calculateStageLanes(timedStages);
                                const maxLane = timedStages.length > 0
                                    ? Math.max(...Array.from(timedStageLanes.values()), -1)
                                    : -1;
                                const CARD_HEIGHT = 32;
                                const LANE_SPACING = 5; // 4px gap between consecutive subtasks
                                const BASE_TOP = 12;
                                const timedStagesHeight = maxLane >= 0
                                    ? BASE_TOP + ((maxLane + 1) * (CARD_HEIGHT + LANE_SPACING)) - LANE_SPACING + TRACK_BOTTOM_PADDING
                                    : 0;

                                const computedHeight = Math.max(TRACK_HEIGHT, untimedListHeight, timedStagesHeight);
                                const trackHeight = isCollapsed ? COLLAPSED_ROW_HEIGHT : Math.max(measuredHeight, computedHeight);

                                const handleLabelLayout = (event: any) => {
                                    const { height } = event.nativeEvent.layout;
                                    if (height > 0) {
                                        // Use requestAnimationFrame to ensure layout is complete
                                        requestAnimationFrame(() => {
                                            handleTaskHeightMeasured(task.id, height);
                                        });
                                    }
                                };

                                return (
                                    <View key={task.id}>
                                        <View style={styles.trackSeparator} />
                                        <View
                                            style={[
                                                styles.trackLabelContainer,
                                                { height: trackHeight, marginBottom: ROW_GAP },
                                                task.isDisabled && { opacity: 0.4 },
                                            ]}
                                            onLayout={handleLabelLayout}
                                        >
                                            <TouchableOpacity
                                                activeOpacity={1}
                                                onPress={() => {
                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                    setTaskSubtasksPopupTask(task);
                                                }}
                                                style={[
                                                    styles.trackLabel,
                                                    { width: TRACK_LABEL_WIDTH - 8 },
                                                    isActive && styles.trackLabelActive,
                                                ]}
                                            >
                                                <View pointerEvents="none" style={styles.trackGrooveDeep} />
                                                <TouchableOpacity
                                                    style={[styles.taskCollapseBtnDeep, isCollapsed && styles.taskCollapseBtnDeepCentered]}
                                                    onPress={() => toggleTaskCollapsed(task.id)}
                                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                                    activeOpacity={0.7}
                                                >
                                                    <MaterialIcons name={isCollapsed ? 'keyboard-arrow-down' : 'keyboard-arrow-up'} size={16} color="rgba(255,255,255,0.85)" />
                                                </TouchableOpacity>
                                                <View style={[styles.trackLabelInner, isCollapsed && styles.trackLabelInnerCollapsedDeep]}>
                                                    {/* Category pill: icon + name */}
                                                    {!isCollapsed && (
                                                    <View style={[styles.categoryPill, { borderLeftColor: category?.color || 'rgba(255,255,255,0.2)' }]}>
                                                        {category && (
                                                            <MaterialIcons name={category.icon as any} size={9} color={category.color} style={styles.categoryPillIcon} />
                                                        )}
                                                        <Text style={[styles.categoryPillText, { color: category ? category.color : 'rgba(255,255,255,0.5)' }]} numberOfLines={1}>
                                                            {category ? category.name.toUpperCase() : 'GENERAL'}
                                                        </Text>
                                                    </View>
                                                    )}

                                                    {/* Task title + active indicator + add button */}
                                                    <View style={styles.titleRow}>
                                                        <Text style={[styles.trackTitle, isActive && styles.trackTitleActive]} numberOfLines={1}>
                                                            {task.title}
                                                        </Text>
                                                        {task.isDisabled && (
                                                            <View style={{
                                                                flexDirection: 'row',
                                                                alignItems: 'center',
                                                                backgroundColor: 'rgba(255,145,0,0.12)',
                                                                borderColor: 'rgba(255,145,0,0.4)',
                                                                borderWidth: 1,
                                                                borderRadius: 4,
                                                                paddingHorizontal: 3,
                                                                paddingVertical: 1,
                                                                marginLeft: 4,
                                                                flexShrink: 0,
                                                            }}>
                                                                <MaterialIcons name="block" size={7} color="#FF9100" />
                                                            </View>
                                                        )}
                                                        <View style={styles.titleRowRight}>
                                                            {isActive && <View style={styles.activeDot} />}
                                                            {!isCollapsed && (
                                                            <TouchableOpacity
                                                                style={styles.taskAddSubtaskBtn}
                                                                onPress={() => {
                                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                                    const nowMinutes = currentTimeRef.current.getHours() * 60 + currentTimeRef.current.getMinutes();
                                                                    setAddSubtaskModal({
                                                                        visible: true,
                                                                        taskId: task.id,
                                                                        startTimeMinutes: nowMinutes,
                                                                        mode: 'add',
                                                                    });
                                                                }}
                                                                activeOpacity={0.7}
                                                            >
                                                                <MaterialIcons name="add" size={14} color="rgba(255,255,255,0.6)" />
                                                            </TouchableOpacity>
                                                            )}
                                                        </View>
                                                    </View>

                                                    {/* Progress bar: Done (green) | Undone (red) | Pending (grey) + count */}
                                                    {(() => {
                                                        const s = task.stages || [];
                                                        const total = s.length;
                                                        const doneCount = s.filter(i => i.status === 'Done' || i.isCompleted).length;
                                                        const undoneCount = s.filter(i => i.status === 'Undone').length;
                                                        const pendingCount = Math.max(0, total - doneCount - undoneCount);
                                                        const den = total || 1;
                                                        return (
                                                            <TrackProgressRing done={doneCount} undone={undoneCount} total={total} size={isCollapsed ? 30 : 44} />
                                                        );
                                                    })()}
                                                </View>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                );
                            })}
                            {(viewMode === 'merged' ? 1 : viewMode === 'category' ? categorySections.length : tasks.length) > 0 && <View style={styles.trackSeparator} />}
                            {viewMode === 'task' && tasks.length === 0 && (
                                <View style={[styles.emptyState, { width: TRACK_LABEL_WIDTH }]}>
                                    <Text style={styles.emptyText}>No tracks</Text>
                                </View>
                            )}
                        </View>
                    </ScrollView>
                </Animated.View>

                {/* Scrollable Timeline Section (subtask cards). Same height as task column when dock is open. */}
                <View style={[styles.timelineSection, styles.mainColumnWhenDockOpen]}>
                    {/* Sticky Time Axis Header – driven by timeline scroll via transform (no second ScrollView, smooth, no flicker) */}
                    <View style={[styles.stickyHeaderContainer, { overflow: 'hidden' }]}>
                        <Animated.View
                            style={[
                                styles.timelineContent,
                                { width: TIMELINE_ONLY_WIDTH, height: 25 },
                                { transform: [{ translateX: negScrollX }] }
                            ]}
                        >
                            {/* Time-of-day background layer (behind header labels) */}
                            <View pointerEvents="none" style={styles.timeOfDayBackgroundLayer}>
                                {timeOfDayBackgroundSegments.map((seg, i) => (
                                    <View
                                        key={`${seg.key}-${i}`}
                                        style={[
                                            styles.timeOfDayBackgroundSegment,
                                            { left: seg.left, width: seg.width, backgroundColor: seg.colorHex }
                                        ]}
                                    />
                                ))}
                            </View>

                            {/* Time labels */}
                            {getTimeLabels().map((label, i) => (
                                <View key={i} style={[styles.stickyHourLabel, { left: label.left }]}>
                                    <Text style={styles.hourText}>{label.text}</Text>
                                </View>
                            ))}

                            {/* Ruler ticks: major on each label, minor halfway between */}
                            {(() => {
                                const lb = getTimeLabels();
                                const step = lb.length > 1 ? lb[1].left - lb[0].left : 0;
                                return lb.map((label, i) => (
                                    <React.Fragment key={`tick-${i}`}>
                                        <View pointerEvents="none" style={[styles.hourTickMajor, { left: label.left }]} />
                                        {step > 0 && <View pointerEvents="none" style={[styles.hourTickMinor, { left: label.left + step / 2 }]} />}
                                    </React.Fragment>
                                ));
                            })()}

                            {/* NOW Line Dot (Top portion) — only when selected date is the current logical day (today) */}
                            {isSameLogicalDay(selectedDate, new Date(), dailyStartMinutes) && (
                                <View style={[styles.nowLineSticky, { left: getNowPosition() }]}>
                                    <View style={styles.nowDot} />
                                </View>
                            )}
                        </Animated.View>
                    </View>

                    {/* Vertical Scroll for Timeline Tracks */}
                    <ScrollView
                        ref={verticalScrollRef}
                        style={styles.verticalScroll}
                        contentContainerStyle={{
                            minHeight: minScrollHeight,
                            paddingBottom: BOTTOM_SPACING,
                        }}
                        showsVerticalScrollIndicator={false}
                        scrollEnabled={!activeStage}
                        onScroll={handleVerticalScroll}
                        onScrollBeginDrag={() => claimVerticalMaster('timeline')}
                        onScrollEndDrag={() => releaseVerticalMaster(250)}
                        onMomentumScrollBegin={cancelVerticalMasterRelease}
                        onMomentumScrollEnd={() => releaseVerticalMaster(0)}
                        scrollEventThrottle={16}
                        bounces={false}
                        bouncesZoom={false}
                        alwaysBounceVertical={false}
                        removeClippedSubviews={false}
                        overScrollMode="never"
                        decelerationRate="normal"
                    >
                        <View
                            onTouchMove={handleTouchMove}
                            onTouchEnd={handleTouchEnd}
                            style={{ flex: 1, minHeight: minScrollHeight }}
                        >
                            <Animated.ScrollView
                                horizontal
                                ref={setTimelineScrollRef}
                                showsHorizontalScrollIndicator={true}
                                scrollEnabled={!activeStage && !isDragging}
                                directionalLockEnabled={true}
                                contentContainerStyle={{ width: TIMELINE_ONLY_WIDTH, minHeight: minScrollHeight }}
                                nestedScrollEnabled={true}
                                onScroll={onTimelineScroll}
                                scrollEventThrottle={16}
                                bounces={true}
                                alwaysBounceHorizontal={true}
                                decelerationRate="normal"
                                removeClippedSubviews={Platform.OS === 'android'}
                                style={{ flex: 1 }}
                                overScrollMode="never"
                            >
                                <View style={[styles.timelineContent, { width: TIMELINE_ONLY_WIDTH, minHeight: minScrollHeight }]}>
                                    {/* NOW Line - Vertical segment — only when selected date is the current logical day (today) */}
                                    {isSameLogicalDay(selectedDate, new Date(), dailyStartMinutes) && (
                                        <View style={[styles.nowLine, { left: getNowPosition() }]} />
                                    )}

                                    {/* Tracks Container */}
                                    <View style={styles.tracksContainer}>
                                        {viewMode === 'task' && tasks.length === 0 && (
                                            <View style={styles.timelineEmptyState}>
                                                <Text style={styles.timelineEmptyText}>No tasks for this day</Text>
                                            </View>
                                        )}
                                        {viewMode === 'category' ? categorySections.map((section) => {
                                            const sortedMergedUntimed = section.untimedEntries.map(e => e.stage);
                                            const untimedListHeight = sortedMergedUntimed.length > 0
                                                ? (sortedMergedUntimed.length * 24.5) + 7 + 7 + 3.5
                                                : 0;
                                            const isDraggingThisCategory = isDragging && frozenCategoryIdRef.current === section.categoryId;
                                            const frozen = isDraggingThisCategory && frozenLanesRef.current
                                                ? frozenLanesRef.current.lanes
                                                : null;
                                            const stageLanes = frozen ?? calculateStageLanes(section.timedStages);
                                            let maxLane = section.timedStages.length > 0
                                                ? Math.max(...Array.from(stageLanes.values()), -1)
                                                : -1;
                                            if (activeStage != null && frozenCategoryIdRef.current === section.categoryId && tempStageLayout?.lane != null) {
                                                maxLane = Math.max(maxLane, tempStageLayout.lane);
                                            }
                                            const CARD_HEIGHT = 32;
                                            const LANE_SPACING = 5;
                                            const BASE_TOP = 12;
                                            const timedStagesHeight = maxLane >= 0
                                                ? BASE_TOP + ((maxLane + 1) * (CARD_HEIGHT + LANE_SPACING)) - LANE_SPACING + TRACK_BOTTOM_PADDING
                                                : 0;
                                            const measuredHeight = categorySectionHeights.get(section.categoryId);
                                            const trackHeight = Math.max(measuredHeight ?? 0, TRACK_HEIGHT, untimedListHeight, timedStagesHeight);
                                            const isTrackActive = activeStage != null && section.tasks.some(t => t.id === activeStage.taskId);
                                            const firstTaskInSection = section.tasks[0];
                                            return (
                                                <View key={section.categoryId || 'uncategorized'} style={isTrackActive ? { zIndex: 10000, elevation: 10000 } : undefined}>
                                                    <View style={styles.trackSeparator} />
                                                    <TouchableOpacity
                                                        activeOpacity={1}
                                                        onPress={() => { if (resizeModeStage) setResizeModeStage(null); }}
                                                        style={[
                                                            styles.track,
                                                            { height: trackHeight, marginBottom: ROW_GAP },
                                                            isTrackActive && { overflow: 'visible' as const },
                                                        ]}
                                                        onLayout={(event: any) => {
                                                            const { height } = event.nativeEvent.layout;
                                                            if (height > 0) requestAnimationFrame(() => handleCategorySectionHeightMeasured(section.categoryId, height));
                                                        }}
                                                    >
                                                        {renderRailWell()}
                                                        {section.untimedEntries.length > 0 && (
                                                            <UntimedStagesDraggableList
                                                                entries={section.untimedEntries}
                                                                cellWidth={CELL_WIDTH}
                                                                minutesPerCell={minutesPerCell}
                                                                trackLabelWidth={TRACK_LABEL_WIDTH}
                                                                getTimelineScrollX={() => timelineScrollXRef.current}
                                                                isLandscape={isLandscape}
                                                                getStageNeedsApproval={stageNeedsApproval}
                                                                checkAndUpdateAutoScroll={checkAndUpdateAutoScroll}
                                                                stopAutoScroll={stopAutoScroll}
                                                                onDropOnTimeline={(stageId, xPosition) => {
                                                                    const task = stageIdToTask.get(stageId);
                                                                    if (!task || !onUpdateStages) return;
                                                                    const displayStart = (xPosition / CELL_WIDTH) * minutesPerCell;
                                                                    const startTimeMinutes = (Math.round(displayStart) + dailyStartMinutes) % 1440;
                                                                    const durationMinutes = 180;
                                                                    pendingLayoutsRef.current.set(stageId, { startTimeMinutes, durationMinutes });
                                                                    const updatedStages = (task.stages || []).map(s => {
                                                                        const pending = pendingLayoutsRef.current.get(s.id);
                                                                        if (pending) return { ...s, startTimeMinutes: pending.startTimeMinutes, durationMinutes: pending.durationMinutes };
                                                                        return s;
                                                                    });
                                                                    onUpdateStages(task, updatedStages);
                                                                    setPendingLayoutsVersion(v => v + 1);
                                                                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                                                }}
                                                                onDeleteStage={(stageId) => {
                                                                    const task = stageIdToTask.get(stageId);
                                                                    if (!task || !onUpdateStages) return;
                                                                    const stage = sortedMergedUntimed.find(s => s.id === stageId);
                                                                    if (stage) {
                                                                        handleDeleteStage(task.id, stageId);
                                                                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                                                        setTimeout(() => setCategorySectionHeights(prev => { const m = new Map(prev); m.delete(section.categoryId); return m; }), 150);
                                                                    }
                                                                }}
                                                            />
                                                        )}
                                                        {section.timedEntries.map(({ task, stage }, stageIndex) => {
                                                            const isThisActive = activeStage?.taskId === task.id && activeStage?.stageId === stage.id;
                                                            const lane = isThisActive && tempStageLayout?.lane !== undefined
                                                                ? tempStageLayout.lane
                                                                : (stageLanes.get(stage.id) ?? 0);
                                                            const { left, width, top } = getStageLayout(stage, stageIndex, lane);
                                                            const isBeingEdited = activeStage?.stageId === stage.id;
                                                            const isInResizeMode = resizeModeStage?.taskId === task.id && resizeModeStage?.stageId === stage.id;
                                                            const effectiveTime = getEffectiveStageTime(stage);
                                                            return (
                                                                <React.Fragment key={stage.id}>
                                                                    <View
                                                                        style={[
                                                                            styles.timelineStageCard,
                                                                            { backgroundColor: DEEP_STAGE_BG[stage.status || 'Upcoming'] },
                                                                            isBeingEdited && styles.stageCardDragging,
                                                                            isInResizeMode && styles.stageCardResizeMode,
                                                                            { left, width, top },
                                                                            task.isDisabled && { opacity: 0.35, borderTopWidth: 1, borderTopColor: 'rgba(255,145,0,0.6)' },
                                                                        ]}
                                                                        {...stagePanResponder.panHandlers}
                                                                    >
                                                                        {(stage.status || 'Upcoming') === 'Process' && (
                                                                            <View
                                                                                pointerEvents="none"
                                                                                style={[styles.stageProgressFillDeep, { width: `${stageElapsedPct(effectiveTime.startTimeMinutes, effectiveTime.durationMinutes, currentTimeRef.current.getHours() * 60 + currentTimeRef.current.getMinutes())}%` }]}
                                                                            />
                                                                        )}
                                                                        {renderStageStatusDisc(task.id, stage)}
                                                                        {isInResizeMode && (
                                                                            <TouchableOpacity
                                                                                style={styles.resizeHandleLeft}
                                                                                onPressIn={() => {
                                                                                    if (activeStage && (activeStage.taskId !== task.id || activeStage.stageId !== stage.id)) clearEditingState();
                                                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                                                    resetScrollTracking();
                                                                                    resizeHandleSideRef.current = 'left';
                                                                                    setActiveStage({ taskId: task.id, stageId: stage.id });
                                                                                    setIsResizing(true);
                                                                                    setInitialStageLayout({ left, width, top, lane });
                                                                                    setTempStageLayout({ left, width, top, lane });
                                                                                }}
                                                                                activeOpacity={0.7}
                                                                            >
                                                                                <View style={styles.resizeHandleLine} />
                                                                            </TouchableOpacity>
                                                                        )}
                                                                        <TouchableOpacity
                                                                            onPress={() => {
                                                                                if (!isInResizeMode && !isDragging && !isResizing) {
                                                                                    const isDifferentStage = (activeStage && (activeStage.taskId !== task.id || activeStage.stageId !== stage.id)) || (resizeModeStage && (resizeModeStage.taskId !== task.id || resizeModeStage.stageId !== stage.id));
                                                                                    if (isDifferentStage) clearEditingState();
                                                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                                                    setResizeModeStage({ taskId: task.id, stageId: stage.id });
                                                                                } else if ((isInResizeMode || isDragging || isResizing)) {
                                                                                    const isDifferentStage = (activeStage && (activeStage.taskId !== task.id || activeStage.stageId !== stage.id)) || (resizeModeStage && (resizeModeStage.taskId !== task.id || resizeModeStage.stageId !== stage.id));
                                                                                    if (isDifferentStage) { clearEditingState(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setResizeModeStage({ taskId: task.id, stageId: stage.id }); }
                                                                                }
                                                                            }}
                                                                            onLongPress={() => {
                                                                                if (isInResizeMode) return;
                                                                                const isDifferentStage = (activeStage && (activeStage.taskId !== task.id || activeStage.stageId !== stage.id)) || (resizeModeStage && (resizeModeStage.taskId !== task.id || resizeModeStage.stageId !== stage.id));
                                                                                if (isDifferentStage) clearEditingState();
                                                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                                                                resetScrollTracking();
                                                                                frozenCategoryIdRef.current = section.categoryId;
                                                                                frozenLanesRef.current = { taskId: MERGED_TRACK_ID, lanes: calculateStageLanes(section.timedStages) };
                                                                                setActiveStage({ taskId: task.id, stageId: stage.id });
                                                                                setIsDragging(true);
                                                                                setInitialStageLayout({ left, width, top, lane });
                                                                                setTempStageLayout({ left, width, top, lane });
                                                                            }}
                                                                            delayLongPress={300}
                                                                            activeOpacity={0.8}
                                                                            style={[{ flex: 1, flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 1 }]}
                                                                        >
                                                                            <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
                                                                                <Text style={[styles.untimedStageName, { flexShrink: 1, color: '#FFFFFF', fontSize: 10 }, isBeingEdited && styles.stageTextDragging, isInResizeMode && styles.stageTextResizeMode]} numberOfLines={1} ellipsizeMode="tail">
                                                                                    {stage.text}
                                                                                </Text>
                                                                                {width > 80 && (
                                                                                    <View style={[styles.stageDurationChipDeep, isBeingEdited && { backgroundColor: 'rgba(0,0,0,0.1)' }, isInResizeMode && { backgroundColor: 'rgba(0,0,0,0.1)' }]}>
                                                                                        <Text style={[{ color: '#FFFFFF', fontSize: 7.2, fontWeight: '800' }, isBeingEdited && styles.stageTimeTextEditing, isInResizeMode && styles.stageTimeTextEditing]}>
                                                                                            {formatDurationCompact(visibleOnDay(effectiveTime).durationMinutes)}
                                                                                        </Text>
                                                                                    </View>
                                                                                )}
                                                                                {renderSyncIndicator(stage, { marginLeft: 4, paddingVertical: 1 })}
                                                                                {stageNeedsApproval(stage) != null && (
                                                                                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF9800', marginLeft: 'auto' }} />
                                                                                )}
                                                                            </View>
                                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                                                <Text style={[styles.stageTimeText, { color: 'rgba(255, 255, 255, 0.8)', fontSize: 7.7 }, isBeingEdited && styles.stageTimeTextEditing, isInResizeMode && styles.stageTimeTextEditing]} numberOfLines={1}>
                                                                                    {formatTimeRange(visibleOnDay(effectiveTime).startTimeMinutes, visibleOnDay(effectiveTime).startTimeMinutes + visibleOnDay(effectiveTime).durationMinutes)}
                                                                                </Text>
                                                                                <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.4)', marginTop: 0.5 }} />
                                                                                <Text style={[styles.stageDurationText, { color: 'rgba(255, 255, 255, 0.9)', fontSize: 7.2, fontWeight: '800', textTransform: 'uppercase' }, isBeingEdited && styles.stageTimeTextEditing, isInResizeMode && styles.stageTimeTextEditing]} numberOfLines={1}>
                                                                                    {STAGE_STATUS_LABELS[stage.status || 'Upcoming']}
                                                                                </Text>
                                                                            </View>
                                                                        </TouchableOpacity>
                                                                        {isInResizeMode && (
                                                                            <TouchableOpacity
                                                                                style={styles.resizeHandleRight}
                                                                                onPressIn={() => {
                                                                                    if (activeStage && (activeStage.taskId !== task.id || activeStage.stageId !== stage.id)) clearEditingState();
                                                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                                                    resetScrollTracking();
                                                                                    resizeHandleSideRef.current = 'right';
                                                                                    setActiveStage({ taskId: task.id, stageId: stage.id });
                                                                                    setIsResizing(true);
                                                                                    setInitialStageLayout({ left, width, top, lane });
                                                                                    setTempStageLayout({ left, width, top, lane });
                                                                                }}
                                                                                activeOpacity={0.7}
                                                                            >
                                                                                <View style={styles.resizeHandleLine} />
                                                                            </TouchableOpacity>
                                                                        )}
                                                                        {!isInResizeMode && (
                                                                            <TouchableOpacity
                                                                                style={styles.stageDeleteButton}
                                                                                onPress={() => {
                                                                                    if (!onUpdateStages) return;
                                                                                    handleDeleteStage(task.id, stage.id);
                                                                                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                                                                }}
                                                                                activeOpacity={0.7}
                                                                            >
                                                                                <MaterialIcons name="delete-outline" size={15} color={isBeingEdited ? 'rgba(255,255,255,0.7)' : '#FF3B30'} />
                                                                            </TouchableOpacity>
                                                                        )}
                                                                    </View>
                                                                </React.Fragment>
                                                            );
                                                        })}
                                                        {resizeModeStage && section.tasks.some(t => t.id === resizeModeStage.taskId) && (() => {
                                                            const selectedTask = section.tasks.find(t => t.id === resizeModeStage!.taskId);
                                                            const selectedStage = selectedTask?.stages?.find(s => s.id === resizeModeStage!.stageId);
                                                            if (!selectedStage) return null;
                                                            const isSelectedActive = activeStage?.taskId === resizeModeStage.taskId && activeStage?.stageId === resizeModeStage.stageId;
                                                            const selectedLane = isSelectedActive && tempStageLayout?.lane !== undefined ? tempStageLayout.lane : (stageLanes.get(selectedStage.id) ?? 0);
                                                            const { left, width, top } = getStageLayout(selectedStage, 0, selectedLane);
                                                            const buttonLeft = left + width + 8;
                                                            const effectiveTime = getEffectiveStageTime(selectedStage);
                                                            const selectedStageEndTime = (effectiveTime.startTimeMinutes + effectiveTime.durationMinutes) % 1440;
                                                            return (
                                                                <TouchableOpacity
                                                                    style={[styles.addSubtaskButton, { left: buttonLeft, top }]}
                                                                    onPress={() => {
                                                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                                        setAddSubtaskModal({
                                                                            visible: true,
                                                                            taskId: resizeModeStage.taskId,
                                                                            startTimeMinutes: selectedStageEndTime,
                                                                            mode: 'add',
                                                                        });
                                                                    }}
                                                                    activeOpacity={0.7}
                                                                >
                                                                    <MaterialIcons name="add" size={18} color="rgba(255,255,255,0.85)" />
                                                                </TouchableOpacity>
                                                            );
                                                        })()}
                                                    </TouchableOpacity>
                                                </View>
                                            );
                                        }) : viewMode === 'merged' ? (() => {
                                            const sortedMergedUntimed = mergedUntimedEntries.map(e => e.stage);
                                            const untimedListHeight = sortedMergedUntimed.length > 0
                                                ? (sortedMergedUntimed.length * 24.5) + 7 + 7 + 3.5
                                                : 0;
                                            const isDraggingThisMerged = isDragging && activeStage != null;
                                            const frozen = isDraggingThisMerged && frozenLanesRef.current?.taskId === MERGED_TRACK_ID
                                                ? frozenLanesRef.current.lanes
                                                : null;
                                            const stageLanes = frozen ?? calculateStageLanes(mergedTimedStages);
                                            let maxLane = mergedTimedStages.length > 0
                                                ? Math.max(...Array.from(stageLanes.values()), -1)
                                                : -1;
                                            if (activeStage != null && tempStageLayout?.lane != null) {
                                                maxLane = Math.max(maxLane, tempStageLayout.lane);
                                            }
                                            const CARD_HEIGHT = 32;
                                            const LANE_SPACING = 5;
                                            const BASE_TOP = 12;
                                            const timedStagesHeight = maxLane >= 0
                                                ? BASE_TOP + ((maxLane + 1) * (CARD_HEIGHT + LANE_SPACING)) - LANE_SPACING + TRACK_BOTTOM_PADDING
                                                : 0;
                                            const measuredHeight = taskHeights.get(MERGED_TRACK_ID);
                                            const trackHeight = Math.max(measuredHeight ?? 0, TRACK_HEIGHT, untimedListHeight, timedStagesHeight);
                                            const isTrackActive = activeStage != null;
                                            return (
                                                <View key="merged" style={isTrackActive ? { zIndex: 10000, elevation: 10000 } : undefined}>
                                                    <View style={styles.trackSeparator} />
                                                    <TouchableOpacity
                                                        activeOpacity={1}
                                                        onPress={() => { if (resizeModeStage) setResizeModeStage(null); }}
                                                        style={[
                                                            styles.track,
                                                            { height: trackHeight, marginBottom: ROW_GAP },
                                                            isTrackActive && { overflow: 'visible' as const },
                                                        ]}
                                                        onLayout={(event: any) => {
                                                            const { height } = event.nativeEvent.layout;
                                                            if (height > 0) requestAnimationFrame(() => handleTaskHeightMeasured(MERGED_TRACK_ID, height));
                                                        }}
                                                    >
                                                        {renderRailWell()}
                                                        {sortedMergedUntimed.length > 0 && (
                                                            <UntimedStagesDraggableList
                                                                entries={mergedUntimedEntries}
                                                                cellWidth={CELL_WIDTH}
                                                                minutesPerCell={minutesPerCell}
                                                                trackLabelWidth={TRACK_LABEL_WIDTH}
                                                                getTimelineScrollX={() => timelineScrollXRef.current}
                                                                isLandscape={isLandscape}
                                                                getStageNeedsApproval={stageNeedsApproval}
                                                                checkAndUpdateAutoScroll={checkAndUpdateAutoScroll}
                                                                stopAutoScroll={stopAutoScroll}
                                                                onDropOnTimeline={(stageId, xPosition) => {
                                                                    const task = stageIdToTask.get(stageId);
                                                                    if (!task || !onUpdateStages) return;
                                                                    const displayStart = (xPosition / CELL_WIDTH) * minutesPerCell;
                                                                    const startTimeMinutes = (Math.round(displayStart) + dailyStartMinutes) % 1440;
                                                                    const durationMinutes = 180;
                                                                    pendingLayoutsRef.current.set(stageId, { startTimeMinutes, durationMinutes });
                                                                    const updatedStages = (task.stages || []).map(s => {
                                                                        const pending = pendingLayoutsRef.current.get(s.id);
                                                                        if (pending) return { ...s, startTimeMinutes: pending.startTimeMinutes, durationMinutes: pending.durationMinutes };
                                                                        return s;
                                                                    });
                                                                    onUpdateStages(task, updatedStages);
                                                                    setPendingLayoutsVersion(v => v + 1);
                                                                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                                                }}
                                                                onDeleteStage={(stageId) => {
                                                                    const task = stageIdToTask.get(stageId);
                                                                    if (!task || !onUpdateStages) return;
                                                                    const stage = sortedMergedUntimed.find(s => s.id === stageId);
                                                                    if (stage) {
                                                                        handleDeleteStage(task.id, stageId);
                                                                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                                                        setTimeout(() => setTaskHeights(prev => { const m = new Map(prev); m.delete(MERGED_TRACK_ID); return m; }), 150);
                                                                    }
                                                                }}
                                                            />
                                                        )}
                                                        {mergedTimedEntries.map(({ task, stage }, stageIndex) => {
                                                            const isThisActive = activeStage?.taskId === task.id && activeStage?.stageId === stage.id;
                                                            const lane = isThisActive && tempStageLayout?.lane !== undefined
                                                                ? tempStageLayout.lane
                                                                : (stageLanes.get(stage.id) ?? 0);
                                                            const { left, width, top } = getStageLayout(stage, stageIndex, lane);
                                                            const isBeingEdited = activeStage?.stageId === stage.id;
                                                            const isInResizeMode = resizeModeStage?.taskId === task.id && resizeModeStage?.stageId === stage.id;
                                                            const effectiveTime = getEffectiveStageTime(stage);
                                                            const category = categories.find(c => c.id === task.categoryId);
                                                            return (
                                                                <React.Fragment key={stage.id}>
                                                                    <View
                                                                        style={[
                                                                            styles.timelineStageCard,
                                                                            { backgroundColor: DEEP_STAGE_BG[stage.status || 'Upcoming'] },
                                                                            isBeingEdited && styles.stageCardDragging,
                                                                            isInResizeMode && styles.stageCardResizeMode,
                                                                            { left, width, top },
                                                                            task.isDisabled && { opacity: 0.35, borderTopWidth: 1, borderTopColor: 'rgba(255,145,0,0.6)' },
                                                                        ]}
                                                                        {...stagePanResponder.panHandlers}
                                                                    >
                                                                        {(stage.status || 'Upcoming') === 'Process' && (
                                                                            <View
                                                                                pointerEvents="none"
                                                                                style={[styles.stageProgressFillDeep, { width: `${stageElapsedPct(effectiveTime.startTimeMinutes, effectiveTime.durationMinutes, currentTimeRef.current.getHours() * 60 + currentTimeRef.current.getMinutes())}%` }]}
                                                                            />
                                                                        )}
                                                                        {renderStageStatusDisc(task.id, stage)}
                                                                        {isInResizeMode && (
                                                                            <TouchableOpacity
                                                                                style={styles.resizeHandleLeft}
                                                                                onPressIn={() => {
                                                                                    if (activeStage && (activeStage.taskId !== task.id || activeStage.stageId !== stage.id)) clearEditingState();
                                                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                                                    resetScrollTracking();
                                                                                    resizeHandleSideRef.current = 'left';
                                                                                    setActiveStage({ taskId: task.id, stageId: stage.id });
                                                                                    setIsResizing(true);
                                                                                    setInitialStageLayout({ left, width, top, lane });
                                                                                    setTempStageLayout({ left, width, top, lane });
                                                                                }}
                                                                                activeOpacity={0.7}
                                                                            >
                                                                                <View style={styles.resizeHandleLine} />
                                                                            </TouchableOpacity>
                                                                        )}
                                                                        <TouchableOpacity
                                                                            onPress={() => {
                                                                                if (!isInResizeMode && !isDragging && !isResizing) {
                                                                                    const isDifferentStage = (activeStage && (activeStage.taskId !== task.id || activeStage.stageId !== stage.id)) || (resizeModeStage && (resizeModeStage.taskId !== task.id || resizeModeStage.stageId !== stage.id));
                                                                                    if (isDifferentStage) clearEditingState();
                                                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                                                    setResizeModeStage({ taskId: task.id, stageId: stage.id });
                                                                                } else if ((isInResizeMode || isDragging || isResizing)) {
                                                                                    const isDifferentStage = (activeStage && (activeStage.taskId !== task.id || activeStage.stageId !== stage.id)) || (resizeModeStage && (resizeModeStage.taskId !== task.id || resizeModeStage.stageId !== stage.id));
                                                                                    if (isDifferentStage) { clearEditingState(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setResizeModeStage({ taskId: task.id, stageId: stage.id }); }
                                                                                }
                                                                            }}
                                                                            onLongPress={() => {
                                                                                if (isInResizeMode) return;
                                                                                const isDifferentStage = (activeStage && (activeStage.taskId !== task.id || activeStage.stageId !== stage.id)) || (resizeModeStage && (resizeModeStage.taskId !== task.id || resizeModeStage.stageId !== stage.id));
                                                                                if (isDifferentStage) clearEditingState();
                                                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                                                                resetScrollTracking();
                                                                                frozenLanesRef.current = { taskId: MERGED_TRACK_ID, lanes: calculateStageLanes(mergedTimedStages) };
                                                                                setActiveStage({ taskId: task.id, stageId: stage.id });
                                                                                setIsDragging(true);
                                                                                setInitialStageLayout({ left, width, top, lane });
                                                                                setTempStageLayout({ left, width, top, lane });
                                                                            }}
                                                                            delayLongPress={300}
                                                                            activeOpacity={0.8}
                                                                            style={[{ flex: 1, flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 1 }]}
                                                                        >
                                                                            <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
                                                                                <Text style={[styles.untimedStageName, { flexShrink: 1, color: '#FFFFFF', fontSize: 10 }, isBeingEdited && styles.stageTextDragging, isInResizeMode && styles.stageTextResizeMode]} numberOfLines={1} ellipsizeMode="tail">
                                                                                    {stage.text}
                                                                                </Text>
                                                                                {width > 80 && (
                                                                                    <View style={[styles.stageDurationChipDeep, isBeingEdited && { backgroundColor: 'rgba(0,0,0,0.1)' }, isInResizeMode && { backgroundColor: 'rgba(0,0,0,0.1)' }]}>
                                                                                        <Text style={[{ color: '#FFFFFF', fontSize: 7.2, fontWeight: '800' }, isBeingEdited && styles.stageTimeTextEditing, isInResizeMode && styles.stageTimeTextEditing]}>
                                                                                            {formatDurationCompact(visibleOnDay(effectiveTime).durationMinutes)}
                                                                                        </Text>
                                                                                    </View>
                                                                                )}
                                                                                {renderSyncIndicator(stage, { marginLeft: 4, paddingVertical: 1 })}
                                                                                {stageNeedsApproval(stage) != null && (
                                                                                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF9800', marginLeft: 'auto' }} />
                                                                                )}
                                                                            </View>
                                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                                                <Text style={[styles.stageTimeText, { color: 'rgba(255, 255, 255, 0.8)', fontSize: 7.7 }, isBeingEdited && styles.stageTimeTextEditing, isInResizeMode && styles.stageTimeTextEditing]} numberOfLines={1}>
                                                                                    {formatTimeRange(visibleOnDay(effectiveTime).startTimeMinutes, visibleOnDay(effectiveTime).startTimeMinutes + visibleOnDay(effectiveTime).durationMinutes)}
                                                                                </Text>
                                                                                <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.4)', marginTop: 0.5 }} />
                                                                                <Text style={[styles.stageDurationText, { color: 'rgba(255, 255, 255, 0.9)', fontSize: 7.2, fontWeight: '800', textTransform: 'uppercase' }, isBeingEdited && styles.stageTimeTextEditing, isInResizeMode && styles.stageTimeTextEditing]} numberOfLines={1}>
                                                                                    {STAGE_STATUS_LABELS[stage.status || 'Upcoming']}
                                                                                </Text>
                                                                            </View>
                                                                        </TouchableOpacity>
                                                                        {isInResizeMode && (
                                                                            <TouchableOpacity
                                                                                style={styles.resizeHandleRight}
                                                                                onPressIn={() => {
                                                                                    if (activeStage && (activeStage.taskId !== task.id || activeStage.stageId !== stage.id)) clearEditingState();
                                                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                                                    resetScrollTracking();
                                                                                    resizeHandleSideRef.current = 'right';
                                                                                    setActiveStage({ taskId: task.id, stageId: stage.id });
                                                                                    setIsResizing(true);
                                                                                    setInitialStageLayout({ left, width, top, lane });
                                                                                    setTempStageLayout({ left, width, top, lane });
                                                                                }}
                                                                                activeOpacity={0.7}
                                                                            >
                                                                                <View style={styles.resizeHandleLine} />
                                                                            </TouchableOpacity>
                                                                        )}
                                                                        {!isInResizeMode && (
                                                                            <TouchableOpacity
                                                                                style={styles.stageDeleteButton}
                                                                                onPress={() => {
                                                                                    if (!onUpdateStages) return;
                                                                                    handleDeleteStage(task.id, stage.id);
                                                                                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                                                                }}
                                                                                activeOpacity={0.7}
                                                                            >
                                                                                <MaterialIcons name="delete-outline" size={15} color={isBeingEdited ? 'rgba(255,255,255,0.7)' : '#FF3B30'} />
                                                                            </TouchableOpacity>
                                                                        )}
                                                                    </View>
                                                                </React.Fragment>
                                                            );
                                                        })}
                                                        {resizeModeStage && (() => {
                                                            const selectedTask = tasks.find(t => t.id === resizeModeStage.taskId);
                                                            const selectedStage = selectedTask?.stages?.find(s => s.id === resizeModeStage.stageId);
                                                            if (!selectedStage) return null;
                                                            const isSelectedActive = activeStage?.taskId === resizeModeStage.taskId && activeStage?.stageId === resizeModeStage.stageId;
                                                            const selectedLane = isSelectedActive && tempStageLayout?.lane !== undefined ? tempStageLayout.lane : (stageLanes.get(selectedStage.id) ?? 0);
                                                            const { left, width, top } = getStageLayout(selectedStage, 0, selectedLane);
                                                            const buttonLeft = left + width + 8;
                                                            const effectiveTime = getEffectiveStageTime(selectedStage);
                                                            const selectedStageEndTime = (effectiveTime.startTimeMinutes + effectiveTime.durationMinutes) % 1440;
                                                            return (
                                                                <TouchableOpacity
                                                                    style={[styles.addSubtaskButton, { left: buttonLeft, top }]}
                                                                    onPress={() => {
                                                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                                        setAddSubtaskModal({
                                                                            visible: true,
                                                                            taskId: resizeModeStage.taskId,
                                                                            startTimeMinutes: selectedStageEndTime,
                                                                            mode: 'add',
                                                                        });
                                                                    }}
                                                                    activeOpacity={0.7}
                                                                >
                                                                    <MaterialIcons name="add" size={18} color="rgba(255,255,255,0.85)" />
                                                                </TouchableOpacity>
                                                            );
                                                        })()}
                                                    </TouchableOpacity>
                                                </View>
                                            );
                                        })() : displayTasks.map((task, taskIndex) => {
                                            const stages = task.stages || [];
                                            const liveStatus = getTaskLiveStatus(task);
                                            const isActive = liveStatus === 'ACTIVE';
                                            const category = categories.find(c => c.id === task.categoryId);

                                            // Separate timed and untimed subtasks
                                            // Note: After defaults are applied, all stages should have startTimeMinutes
                                            // But we still check for backwards compatibility
                                            const timedStages = stages.filter(s =>
                                                (s.startTimeMinutes !== undefined && s.startTimeMinutes !== null) ||
                                                (s.durationMinutes !== undefined && s.durationMinutes !== null)
                                            );
                                            const untimedStages = stages.filter(s =>
                                                (s.startTimeMinutes === undefined || s.startTimeMinutes === null) &&
                                                (s.durationMinutes === undefined || s.durationMinutes === null)
                                            );

                                            // Sort timed subtasks: 6–6 day. First: start >= dailyStart (today 6am–midnight); then: start < dailyStart (00:00–6am "overnight" at bottom). Within each, by start asc.
                                            // Uses pending layouts for edited stages. dailyStartMinutes from settings.
                                            const sortedTimedStages = [...timedStages].sort((a, b) => {
                                                const pendingA = pendingLayoutsRef.current.get(a.id);
                                                const pendingB = pendingLayoutsRef.current.get(b.id);
                                                const startA = pendingA ? pendingA.startTimeMinutes : (a.startTimeMinutes || 0);
                                                const startB = pendingB ? pendingB.startTimeMinutes : (b.startTimeMinutes || 0);
                                                // 1) Today (start >= dailyStart) first; overnight (start < dailyStart) at bottom
                                                const inTodayA = startA >= dailyStartMinutes ? 0 : 1;
                                                const inTodayB = startB >= dailyStartMinutes ? 0 : 1;
                                                if (inTodayA !== inTodayB) return inTodayA - inTodayB;
                                                // 2) By start ascending
                                                if (startA !== startB) return startA - startB;
                                                return a.id - b.id;
                                            });

                                            // Sort untimed subtasks - maintain their current order (priority is determined by array position)
                                            // When dragged, the order in the array changes, which updates priority
                                            const sortedUntimedStages = [...untimedStages];

                                            // Get measured height or calculate fallback
                                            const measuredHeight = taskHeights.get(task.id);
                                            const untimedListHeight = sortedUntimedStages.length > 0
                                                ? (sortedUntimedStages.length * 24.5) + 7 + 7 + 3.5 // items (35*0.7=24.5) + top padding (10*0.7=7) + bottom padding (10*0.7=7) + extra bottom margin (5*0.7=3.5) to prevent overlap
                                                : 0;

                                            // Calculate max lanes needed for timed stages (infinite lanes supported)
                                            const timedStageLanes = calculateStageLanes(sortedTimedStages);
                                            let maxLane = sortedTimedStages.length > 0
                                                ? Math.max(...Array.from(timedStageLanes.values()), -1)
                                                : -1;
                                            // During drag in this task, include temp lane so track height fits the dragged card
                                            if (activeStage?.taskId === task.id && tempStageLayout?.lane != null) {
                                                maxLane = Math.max(maxLane, tempStageLayout.lane);
                                            }
                                            const CARD_HEIGHT = 32;
                                            const LANE_SPACING = 5; // 4px gap between consecutive subtasks
                                            const BASE_TOP = 12;
                                            // Calculate height for all lanes: base + (number of lanes * (card height + spacing)) - last spacing + bottom padding (matches top)
                                            const timedStagesHeight = maxLane >= 0
                                                ? BASE_TOP + ((maxLane + 1) * (CARD_HEIGHT + LANE_SPACING)) - LANE_SPACING + TRACK_BOTTOM_PADDING
                                                : 0;

                                            // Dynamic track height: ALWAYS allow growth when new lanes appear
                                            const isCollapsed = collapsedTaskIds.has(task.id);
                                            const trackHeight = isCollapsed ? COLLAPSED_ROW_HEIGHT : Math.max(measuredHeight ?? 0, TRACK_HEIGHT, untimedListHeight, timedStagesHeight);

                                            const handleTrackLayout = (event: any) => {
                                                const { height } = event.nativeEvent.layout;
                                                if (height > 0) {
                                                    // Use requestAnimationFrame to ensure layout is complete
                                                    requestAnimationFrame(() => {
                                                        // Always update height to ensure dynamic adjustment
                                                        handleTaskHeightMeasured(task.id, height);
                                                    });
                                                }
                                            };

                                            const isTrackActive = activeStage?.taskId === task.id; // dragging or resizing a card in this task

                                            return (
                                                <View key={task.id} style={[
                                                    isTrackActive ? { zIndex: 10000, elevation: 10000 } : undefined,
                                                    task.isDisabled && { opacity: 0.35 },
                                                ]}>
                                                    <View style={[styles.trackSeparator, task.isDisabled && { borderColor: 'rgba(255,145,0,0.3)' }]} />
                                                    <TouchableOpacity
                                                        activeOpacity={1}
                                                        onPress={() => {
                                                            // A minimised row expands when tapped
                                                            if (isCollapsed) {
                                                                toggleTaskCollapsed(task.id);
                                                                return;
                                                            }
                                                            // Exit resize mode when tapping on track background
                                                            if (resizeModeStage) {
                                                                setResizeModeStage(null);
                                                            }
                                                        }}
                                                        style={[
                                                            styles.track,
                                                            { height: trackHeight, marginBottom: ROW_GAP },
                                                            isTrackActive && { overflow: 'visible' as const },
                                                            task.isDisabled && { borderLeftWidth: 2, borderLeftColor: 'rgba(255,145,0,0.6)' },
                                                        ]}
                                                        onLayout={handleTrackLayout}
                                                    >
                                                        {renderRailWell()}
                                                        {/* Untimed Subtasks List (on the left) - Draggable */}
                                                        {!isCollapsed && sortedUntimedStages.length > 0 && (
                                                            <UntimedStagesDraggableList
                                                                entries={sortedUntimedStages.map(s => ({ task, stage: s }))}
                                                                cellWidth={CELL_WIDTH}
                                                                minutesPerCell={minutesPerCell}
                                                                trackLabelWidth={TRACK_LABEL_WIDTH}
                                                                getTimelineScrollX={() => timelineScrollXRef.current}
                                                                isLandscape={isLandscape}
                                                                getStageNeedsApproval={stageNeedsApproval}
                                                                checkAndUpdateAutoScroll={checkAndUpdateAutoScroll}
                                                                stopAutoScroll={stopAutoScroll}
                                                                onDropOnTimeline={(stageId, xPosition) => {
                                                                    if (!onUpdateStages) return;
                                                                    // xPosition is in display space (0 = daily start). Convert to minutes-from-midnight.
                                                                    const displayStart = (xPosition / CELL_WIDTH) * minutesPerCell;
                                                                    const startTimeMinutes = (Math.round(displayStart) + dailyStartMinutes) % 1440;
                                                                    const durationMinutes = 180; // Default duration: 3 hours

                                                                    // Synchronously update pending layouts REF to include this drop
                                                                    pendingLayoutsRef.current.set(stageId, {
                                                                        startTimeMinutes,
                                                                        durationMinutes,
                                                                    });

                                                                    // Batch Update: Merge ALL pending layouts for this task
                                                                    const updatedStages = (task.stages || []).map(s => {
                                                                        const pending = pendingLayoutsRef.current.get(s.id);
                                                                        if (pending) {
                                                                            return {
                                                                                ...s,
                                                                                startTimeMinutes: pending.startTimeMinutes,
                                                                                durationMinutes: pending.durationMinutes
                                                                            };
                                                                        }
                                                                        return s;
                                                                    });

                                                                    onUpdateStages(task, updatedStages);
                                                                    setPendingLayoutsVersion(v => v + 1);
                                                                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                                                }}
                                                                onDeleteStage={(stageId) => {
                                                                    if (!onUpdateStages) return;
                                                                    const stage = sortedUntimedStages.find(s => s.id === stageId);
                                                                    if (stage) {
                                                                        handleDeleteStage(task.id, stageId);
                                                                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                                                        setTimeout(() => {
                                                                            setTaskHeights(prev => {
                                                                                const newMap = new Map(prev);
                                                                                newMap.delete(task.id);
                                                                                return newMap;
                                                                            });
                                                                        }, 150);
                                                                    }
                                                                }}
                                                            />
                                                        )}

                                                        {/* Timed Subtasks (on the timeline) */}
                                                        {!isCollapsed && (() => {
                                                            // Lane map for rendering. During a timed-stage drag we freeze lanes so
                                                            // non-dragged stages never jump while you move another one.
                                                            const isDraggingThisTask = isDragging && activeStage?.taskId === task.id;
                                                            const frozen = isDraggingThisTask && frozenLanesRef.current?.taskId === task.id
                                                                ? frozenLanesRef.current.lanes
                                                                : null;
                                                            const stageLanes = frozen ?? calculateStageLanes(sortedTimedStages);

                                                            return sortedTimedStages.map((stage, stageIndex) => {
                                                                const isThisActive = activeStage?.taskId === task.id && activeStage?.stageId === stage.id;
                                                                // For the active stage, use the temporary drag lane if present; otherwise use computed.
                                                                const lane = isThisActive && tempStageLayout?.lane !== undefined
                                                                    ? tempStageLayout.lane
                                                                    : (stageLanes.get(stage.id) ?? 0);
                                                                const { left, width, top } = getStageLayout(stage, stageIndex, lane);
                                                                const isBeingEdited = activeStage?.stageId === stage.id;
                                                                const isInResizeMode = resizeModeStage?.taskId === task.id && resizeModeStage?.stageId === stage.id;
                                                                const effectiveTime = getEffectiveStageTime(stage);

                                                                return (
                                                                    <React.Fragment key={stage.id}>
                                                                        <View
                                                                            style={[
                                                                                styles.timelineStageCard,
                                                                                { backgroundColor: DEEP_STAGE_BG[stage.status || 'Upcoming'] },
                                                                                isBeingEdited && styles.stageCardDragging,
                                                                                isInResizeMode && styles.stageCardResizeMode,
                                                                                { left, width, top },
                                                                            ]}
                                                                            {...stagePanResponder.panHandlers}
                                                                        >
                                                                        {(stage.status || 'Upcoming') === 'Process' && (
                                                                            <View
                                                                                pointerEvents="none"
                                                                                style={[styles.stageProgressFillDeep, { width: `${stageElapsedPct(effectiveTime.startTimeMinutes, effectiveTime.durationMinutes, currentTimeRef.current.getHours() * 60 + currentTimeRef.current.getMinutes())}%` }]}
                                                                            />
                                                                        )}
                                                                        {renderStageStatusDisc(task.id, stage)}
                                                                            {isInResizeMode && (
                                                                                <TouchableOpacity
                                                                                    style={styles.resizeHandleLeft}
                                                                                    onPressIn={() => {
                                                                                        if (activeStage && (activeStage.taskId !== task.id || activeStage.stageId !== stage.id)) {
                                                                                            clearEditingState();
                                                                                        }
                                                                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                                                        resetScrollTracking();
                                                                                        resizeHandleSideRef.current = 'left';
                                                                                        setActiveStage({ taskId: task.id, stageId: stage.id });
                                                                                        setIsResizing(true);
                                                                                        setInitialStageLayout({ left, width, top, lane });
                                                                                        setTempStageLayout({ left, width, top, lane });
                                                                                    }}
                                                                                    activeOpacity={0.7}
                                                                                >
                                                                                    <View style={styles.resizeHandleLine} />
                                                                                </TouchableOpacity>
                                                                            )}

                                                                            <TouchableOpacity
                                                                                onPress={() => {
                                                                                    if (!isInResizeMode && !isDragging && !isResizing) {
                                                                                        const isDifferentStage =
                                                                                            (activeStage && (activeStage.taskId !== task.id || activeStage.stageId !== stage.id)) ||
                                                                                            (resizeModeStage && (resizeModeStage.taskId !== task.id || resizeModeStage.stageId !== stage.id));
                                                                                        if (isDifferentStage) {
                                                                                            clearEditingState();
                                                                                        }
                                                                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                                                        setResizeModeStage({ taskId: task.id, stageId: stage.id });
                                                                                    } else if ((isInResizeMode || isDragging || isResizing)) {
                                                                                        const isDifferentStage =
                                                                                            (activeStage && (activeStage.taskId !== task.id || activeStage.stageId !== stage.id)) ||
                                                                                            (resizeModeStage && (resizeModeStage.taskId !== task.id || resizeModeStage.stageId !== stage.id));

                                                                                        if (isDifferentStage) {
                                                                                            clearEditingState();
                                                                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                                                            setResizeModeStage({ taskId: task.id, stageId: stage.id });
                                                                                        }
                                                                                    }
                                                                                }}
                                                                                onLongPress={() => {
                                                                                    if (isInResizeMode) return;

                                                                                    const isDifferentStage =
                                                                                        (activeStage && (activeStage.taskId !== task.id || activeStage.stageId !== stage.id)) ||
                                                                                        (resizeModeStage && (resizeModeStage.taskId !== task.id || resizeModeStage.stageId !== stage.id));
                                                                                    if (isDifferentStage) {
                                                                                        clearEditingState();
                                                                                    }

                                                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                                                                    resetScrollTracking();

                                                                                    frozenLanesRef.current = {
                                                                                        taskId: task.id,
                                                                                        lanes: calculateStageLanes(sortedTimedStages),
                                                                                    };

                                                                                    setActiveStage({ taskId: task.id, stageId: stage.id });
                                                                                    setIsDragging(true);
                                                                                    setInitialStageLayout({ left, width, top, lane });
                                                                                    setTempStageLayout({ left, width, top, lane });
                                                                                }}
                                                                                delayLongPress={300}
                                                                                activeOpacity={0.8}
                                                                                style={[
                                                                                    { flex: 1, flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 1 }
                                                                                ]}
                                                                            >
                                                                                <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
                                                                                    <Text style={[
                                                                                        styles.untimedStageName,
                                                                                        { flexShrink: 1, color: '#FFFFFF', fontSize: 10 },
                                                                                        isBeingEdited && styles.stageTextDragging,
                                                                                        isInResizeMode && styles.stageTextResizeMode
                                                                                    ]} numberOfLines={1} ellipsizeMode="tail">
                                                                                        {stage.text}
                                                                                    </Text>
                                                                                    {width > 80 && (
                                                                                        <View style={[styles.stageDurationChipDeep, isBeingEdited && { backgroundColor: 'rgba(0,0,0,0.1)' }, isInResizeMode && { backgroundColor: 'rgba(0,0,0,0.1)' }]}>
                                                                                            <Text style={[{ color: '#FFFFFF', fontSize: 7.2, fontWeight: '800' }, isBeingEdited && styles.stageTimeTextEditing, isInResizeMode && styles.stageTimeTextEditing]}>
                                                                                                {formatDurationCompact(visibleOnDay(effectiveTime).durationMinutes)}
                                                                                            </Text>
                                                                                        </View>
                                                                                    )}
                                                                                    {renderSyncIndicator(stage, { marginLeft: 4, paddingVertical: 1 })}
                                                                                    {stageNeedsApproval(stage) != null && (
                                                                                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF9800', marginLeft: 'auto' }} />
                                                                                    )}
                                                                                </View>
                                                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                                                    <Text style={[
                                                                                        styles.stageTimeText,
                                                                                        { color: 'rgba(255, 255, 255, 0.8)', fontSize: 7.7 },
                                                                                        isBeingEdited && styles.stageTimeTextEditing,
                                                                                        isInResizeMode && styles.stageTimeTextEditing
                                                                                    ]} numberOfLines={1}>
                                                                                        {formatTimeRange(visibleOnDay(effectiveTime).startTimeMinutes, visibleOnDay(effectiveTime).startTimeMinutes + visibleOnDay(effectiveTime).durationMinutes)}
                                                                                    </Text>
                                                                                    <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.4)', marginTop: 0.5 }} />
                                                                                    <Text style={[
                                                                                        styles.stageDurationText,
                                                                                        { color: 'rgba(255, 255, 255, 0.9)', fontSize: 7.2, fontWeight: '800', textTransform: 'uppercase' },
                                                                                        isBeingEdited && styles.stageTimeTextEditing,
                                                                                        isInResizeMode && styles.stageTimeTextEditing
                                                                                    ]} numberOfLines={1}>
                                                                                        {STAGE_STATUS_LABELS[stage.status || 'Upcoming']}
                                                                                    </Text>
                                                                                </View>
                                                                            </TouchableOpacity>

                                                                            {isInResizeMode && (
                                                                                <TouchableOpacity
                                                                                    style={styles.resizeHandleRight}
                                                                                    onPressIn={() => {
                                                                                        if (activeStage && (activeStage.taskId !== task.id || activeStage.stageId !== stage.id)) {
                                                                                            clearEditingState();
                                                                                        }
                                                                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                                                        resetScrollTracking();
                                                                                        resizeHandleSideRef.current = 'right';
                                                                                        setActiveStage({ taskId: task.id, stageId: stage.id });
                                                                                        setIsResizing(true);
                                                                                        setInitialStageLayout({ left, width, top, lane });
                                                                                        setTempStageLayout({ left, width, top, lane });
                                                                                    }}
                                                                                    activeOpacity={0.7}
                                                                                >
                                                                                    <View style={styles.resizeHandleLine} />
                                                                                </TouchableOpacity>
                                                                            )}

                                                                            {!isInResizeMode && (
                                                                                <TouchableOpacity
                                                                                    style={styles.stageDeleteButton}
                                                                                    onPress={() => {
                                                                                        if (!onUpdateStages) return;
                                                                                        handleDeleteStage(task.id, stage.id);
                                                                                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                                                                    }}
                                                                                    activeOpacity={0.7}
                                                                                >
                                                                                    <MaterialIcons
                                                                                        name="delete-outline"
                                                                                        size={15}
                                                                                        color={isBeingEdited ? "rgba(255,255,255,0.7)" : "#FF3B30"}
                                                                                    />
                                                                                </TouchableOpacity>
                                                                            )}
                                                                        </View>
                                                                    </React.Fragment>
                                                                );
                                                            });
                                                        })()}

                                                        {isCollapsed && renderCollapsedStrip(task, sortedTimedStages)}

                                                        {/* Add Subtask Plus Button — placed after the selected subtask (when in resize mode) */}
                                                        {(() => {
                                                            // Only show button if a subtask is selected (in resize mode) for this task
                                                            const isTaskSelected = resizeModeStage?.taskId === task.id;
                                                            if (!isTaskSelected) {
                                                                return null;
                                                            }

                                                            // Find the selected stage
                                                            const selectedStage = sortedTimedStages.find(s => s.id === resizeModeStage?.stageId);
                                                            if (!selectedStage) {
                                                                return null;
                                                            }

                                                            // Get the selected stage's layout
                                                            const isSelectedActive = activeStage?.taskId === task.id && activeStage?.stageId === selectedStage.id;
                                                            const selectedLane = isSelectedActive && tempStageLayout?.lane !== undefined
                                                                ? tempStageLayout.lane
                                                                : (calculateStageLanes(sortedTimedStages).get(selectedStage.id) ?? 0);
                                                            const { left, width, top } = getStageLayout(selectedStage, 0, selectedLane);

                                                            // Position button after the selected stage
                                                            const buttonLeft = left + width + 8;
                                                            const buttonTop = top;

                                                            // Calculate the selected stage's end time (completion time)
                                                            const effectiveTime = getEffectiveStageTime(selectedStage);
                                                            const selectedStageEndTime = (effectiveTime.startTimeMinutes + effectiveTime.durationMinutes) % 1440;

                                                            return (
                                                                <TouchableOpacity
                                                                    style={[styles.addSubtaskButton, { left: buttonLeft, top: buttonTop }]}
                                                                    onPress={() => {
                                                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                                        setAddSubtaskModal({
                                                                            visible: true,
                                                                            taskId: task.id,
                                                                            startTimeMinutes: selectedStageEndTime,
                                                                            mode: 'add',
                                                                        });
                                                                    }}
                                                                    activeOpacity={0.7}
                                                                >
                                                                    <MaterialIcons name="add" size={18} color="rgba(255,255,255,0.85)" />
                                                                </TouchableOpacity>
                                                            );
                                                        })()}

                                                    </TouchableOpacity>
                                                </View>
                                            );
                                        })}
                                    </View>
                                </View>
                            </Animated.ScrollView>
                        </View>
                    </ScrollView>
                </View>
            </View >

            {/* Bottom progress dock (slides in/out) */}
            <Animated.View
                pointerEvents={isProgressExpanded ? 'auto' : 'none'}
                style={[
                    styles.bottomProgressDock,
                    { height: progressDockHeight, maxHeight: progressDockHeight, paddingBottom: 0 },
                    {
                        transform: [
                            {
                                translateY: progressAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [progressDockHeight + 20, 0],
                                }),
                            },
                        ],
                    },
                ]}
            >
                {/* Bar header (improved progress) */}
                <View style={[styles.bottomDockPlate, !isLandscape && styles.bottomDockPlateSheet, !isLandscape && { paddingBottom: dockBottomPad }]}>
                    <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
                    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dockGlassTint]} />
                    <LinearGradient
                        pointerEvents="none"
                        colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                        style={styles.dockGlassSheen}
                    />

                    {/* Time progress bar (TOTAL split by Done / Pending / Undone) */}
                    <View style={styles.bottomDockTimeBarTrack}>
                        {progressSummary.totalMinutes > 0 ? (
                            <>
                                {progressSummary.doneMinutes > 0 && (
                                    <View
                                        style={[
                                            styles.bottomDockTimeBarSeg,
                                            { flex: progressSummary.doneMinutes, backgroundColor: '#4CAF50' },
                                        ]}
                                    />
                                )}
                                {progressSummary.pendingMinutes > 0 && (
                                    <View
                                        style={[
                                            styles.bottomDockTimeBarSeg,
                                            { flex: progressSummary.pendingMinutes, backgroundColor: 'rgba(255,255,255,0.35)' },
                                        ]}
                                    />
                                )}
                                {progressSummary.undoneMinutes > 0 && (
                                    <View
                                        style={[
                                            styles.bottomDockTimeBarSeg,
                                            { flex: progressSummary.undoneMinutes, backgroundColor: '#FF5252' },
                                        ]}
                                    />
                                )}
                            </>
                        ) : (
                            <View
                                style={[
                                    styles.bottomDockTimeBarSeg,
                                    { flex: 1, backgroundColor: 'rgba(255,255,255,0.12)' },
                                ]}
                            />
                        )}
                    </View>

                    {isLandscape ? (
                        // LANDSCAPE: Single row layout (original)
                        <View style={styles.bottomDockRow}>
                            {/* Exit button */}
                            <TouchableOpacity
                                style={styles.dockExitBtn}
                                onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                    onClose();
                                }}
                            >
                                <MaterialIcons name="arrow-back" size={13} color="rgba(255,255,255,0.9)" />
                            </TouchableOpacity>

<View style={styles.dockRingSocket}>
    <PillProgressRing size={32} stroke={4.5} fontSize={8}
        total={progressSummary.totalMinutes}
        done={progressSummary.doneMinutes}
        active={progressSummary.activeMinutes}
        undone={progressSummary.undoneMinutes}
        pct={progressSummary.pct}
    />
</View>


                            {/* Time summary OR Selected card details (compact; fits 55px dock) */}
                            {(() => {
                                // If a card is in resize mode, show its details instead of general summary
                                if (resizeModeStage) {
                                    const selectedTask = tasks.find(t => t.id === resizeModeStage.taskId);
                                    const selectedStage = selectedTask?.stages?.find(s => s.id === resizeModeStage.stageId);
                                    if (selectedStage) {
                                        const effectiveTime = getEffectiveStageTime(selectedStage);
                                        const status = selectedStage.status || 'Upcoming';
                                        const statusConfig = STAGE_STATUS_CONFIG[status];
                                        return (
                                            <View style={[styles.bottomDockSummaryRow, { flex: 1 }]}>
                                                <View style={[styles.bottomDockTimeSummary, { flex: 1, minWidth: 0 }]}>
                                                    <Text numberOfLines={1} style={styles.bottomDockTimeSummaryTop}>
                                                        <Text style={styles.bottomDockTimeSummaryLabel}>{selectedTask?.title?.toUpperCase() || 'TASK'} </Text>
                                                        <Text style={styles.bottomDockTimeSummaryValue}>
                                                            {selectedStage.text}
                                                        </Text>
                                                    </Text>
                                                    <Text numberOfLines={1} style={styles.bottomDockTimeSummaryBottom}>
                                                        <Text style={styles.bottomDockTimeSummaryK}>START </Text>
                                                        <Text style={styles.bottomDockTimeSummaryV}>
                                                            {formatTimeCompact(effectiveTime.startTimeMinutes)}
                                                        </Text>
                                                        <Text style={styles.bottomDockTimeSummarySep}>  ·  </Text>
                                                        <Text style={styles.bottomDockTimeSummaryK}>DUR </Text>
                                                        <Text style={styles.bottomDockTimeSummaryV}>
                                                            {formatDurationCompact(effectiveTime.durationMinutes)}
                                                        </Text>
                                                    </Text>
                                                </View>
                                                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                                                    <View ref={statusButtonRef} collapsable={false}>
                                                        <TouchableOpacity
                                                            style={styles.dockStatusBtn}
                                                            onPress={() => {
                                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                                statusButtonRef.current?.measureInWindow((x, y, w, h) => {
                                                                    setStageStatusPopupPosition({ x: x + w / 2, y: y + h });
                                                                    setStageStatusPopupVisible(true);
                                                                });
                                                            }}
                                                            activeOpacity={0.7}
                                                        >
                                                            <MaterialIcons name={statusConfig.icon} size={14} color={statusConfig.color} />
                                                        </TouchableOpacity>
                                                    </View>
                                                    <TouchableOpacity
                                                        style={styles.dockEditBtn}
                                                        onPress={() => {
                                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                            setAddSubtaskModal({
                                                                visible: true,
                                                                taskId: resizeModeStage.taskId,
                                                                startTimeMinutes: effectiveTime.startTimeMinutes,
                                                                mode: 'edit',
                                                                stageId: resizeModeStage.stageId,
                                                                existingText: selectedStage.text,
                                                                existingStartTime: effectiveTime.startTimeMinutes,
                                                                existingDuration: effectiveTime.durationMinutes,
                                                            });
                                                        }}
                                                        activeOpacity={0.7}
                                                    >
                                                        <MaterialIcons name="edit" size={14} color="rgba(255,255,255,0.8)" />
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        );
                                    }
                                }
                                // Default: show general time summary (four sunken cells)
                                return (
                                    <View style={styles.dockStatCells}>
                                        <View style={styles.dockStatCell}>
                                            <Text style={styles.dockStatCellLabel}>TOTAL</Text>
                                            <Text style={styles.dockStatCellValue} numberOfLines={1}>
                                                {formatDurationCompact(progressSummary.totalMinutes)}
                                                <Text style={styles.dockStatCellMeta}> {progressSummary.completed}/{progressSummary.totalStages}</Text>
                                            </Text>
                                        </View>
                                        <View style={styles.dockStatCell}>
                                            <Text style={styles.dockStatCellLabel}>DONE</Text>
                                            <Text style={[styles.dockStatCellValue, { color: '#7BE18A' }]} numberOfLines={1}>
                                                {formatDurationCompact(progressSummary.doneMinutes)}
                                            </Text>
                                        </View>
                                        <View style={styles.dockStatCell}>
                                            <Text style={styles.dockStatCellLabel}>ACTIVE</Text>
                                            <Text style={[styles.dockStatCellValue, { color: '#FFB74D' }]} numberOfLines={1}>
                                                {formatDurationCompact(progressSummary.activeMinutes)}
                                            </Text>
                                        </View>
                                        <View style={styles.dockStatCell}>
                                            <Text style={styles.dockStatCellLabel}>UNDONE</Text>
                                            <Text style={[styles.dockStatCellValue, { color: '#FF6B6B' }]} numberOfLines={1}>
                                                {formatDurationCompact(progressSummary.undoneMinutes)}
                                            </Text>
                                        </View>
                                        <View style={styles.dockStatCell}>
                                            <Text style={styles.dockStatCellLabel}>LEFT</Text>
                                            <Text style={[styles.dockStatCellValue, { color: '#FFB74D' }]} numberOfLines={1}>
                                                {formatDurationCompact(progressSummary.remainingMinutes)}
                                            </Text>
                                        </View>
                                    </View>
                                );
                            })()}

                            {/* Running timer from TimerList: name above, time below; tap opens Timer view (portrait running timer) */}
                            <TouchableOpacity
                                style={styles.liveRunningTimerSection}
                                onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    onOpenRunningTimer?.(runningTimer ?? null);
                                }}
                                activeOpacity={0.7}
                            >
                                {runningTimer != null ? (
                                    <>
                                        <Text style={styles.liveRunningTimerName} numberOfLines={1} ellipsizeMode="tail">{runningTimer.title}</Text>
                                        <Text style={styles.liveRunningTimerValue}>{runningTimer.time}</Text>
                                    </>
                                ) : (
                                    <Text style={styles.liveRunningTimerInactive}>Not active timer</Text>
                                )}
                            </TouchableOpacity>

                            <View style={styles.bottomDockSpacer} />



                            {/* Stack subtasks: each subtask on its own row, one below the other */}
                            <TouchableOpacity
                                style={[styles.dockViewModeBtn, stackSubtasks && { backgroundColor: 'rgba(76,175,80,0.28)' }]}
                                onPress={toggleStackSubtasks}
                                activeOpacity={0.7}
                            >
                                <MaterialIcons name="stairs" size={12} color={stackSubtasks ? '#7BE18A' : 'rgba(255,255,255,0.6)'} />
                            </TouchableOpacity>

                            {/* Date line (e.g. 21 JAN): clickable, opens calendar to pick date and switch live view */}
                            <TouchableOpacity
                                style={styles.dockToolDome}
                                onPress={() => {
                                    setViewDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
                                    setShowDockCalendar(true);
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                }}
                                activeOpacity={0.7}
                            >
                                <MaterialIcons name="calendar-today" size={11} color="rgba(255,255,255,0.9)" />
                            </TouchableOpacity>


                            {/* Now: scroll to center NOW line; shows current time HH:MM:SS */}
                            <TouchableOpacity
                                style={styles.dockToolDome}
                                onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    scrollToNow();
                                }}
                                activeOpacity={0.7}
                            >
                                <MaterialIcons name="schedule" size={12} color="rgba(255,255,255,0.9)" />
                            </TouchableOpacity>


                            {/* View mode: button opens popup to select Task / Merge / Category (persisted); same design as status popup */}
                            <View ref={viewModeButtonRef} collapsable={false} style={styles.dockViewModeBtnContainer}>
                                <TouchableOpacity
                                    style={styles.dockViewModeBtn}
                                    onPress={() => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        viewModeButtonRef.current?.measureInWindow((x, y, w, h) => {
                                            setViewModePopupPosition({ x: x + w / 2, y: y + h });
                                            setViewModePopupVisible(true);
                                        });
                                    }}
                                    activeOpacity={0.7}
                                >
                                    <MaterialIcons
                                        name={viewMode === 'task' ? 'list' : viewMode === 'merged' ? 'merge-type' : 'category'}
                                        size={12}
                                        color="#4CAF50"
                                    />
                                </TouchableOpacity>
                            </View>


                            {/* DISABLED toggle */}
                            <TouchableOpacity
                                style={[styles.dockViewModeBtn, showDisabledTasks && { backgroundColor: 'rgba(255,145,0,0.12)' }]}
                                onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    onToggleDisabledTasks?.();
                                }}
                                activeOpacity={0.7}
                            >
                                <MaterialIcons
                                    name={showDisabledTasks ? 'visibility' : 'visibility-off'}
                                    size={12}
                                    color={showDisabledTasks ? '#FF9100' : 'rgba(255,255,255,0.35)'}
                                />
                            </TouchableOpacity>



                            {/* Vertical divider */}

                            <TouchableOpacity
                                style={styles.dockCancelBtn}
                                onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    setIsProgressExpanded(false);
                                }}
                            >
                                <MaterialIcons name="close" size={13} color="rgba(255,255,255,0.9)" />
                            </TouchableOpacity>
                        </View>
                    ) : (
                        // PORTRAIT: Two-row layout
                        <View style={styles.pdWrap}>
                            <View pointerEvents="none" style={styles.pdGrab} />
                            {/* Row 1: back, progress ring, running timer, close */}
                            <View style={styles.pdRow}>
                                <TouchableOpacity
                                    style={styles.pdDome}
                                    activeOpacity={0.8}
                                    onPress={() => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                        onClose();
                                    }}
                                >
                                    <MaterialIcons name="arrow-back" size={16} color="rgba(255,255,255,0.92)" />
                                </TouchableOpacity>
                                <View style={styles.dockRingSocket}>
                                    <PillProgressRing size={32} stroke={4.5} fontSize={8}
                                        total={progressSummary.totalMinutes}
                                        done={progressSummary.doneMinutes}
                                        active={progressSummary.activeMinutes}
                                        undone={progressSummary.undoneMinutes}
                                        pct={progressSummary.pct}
                                    />
                                </View>
                                <TouchableOpacity
                                    style={styles.pdTimer}
                                    activeOpacity={0.8}
                                    onPress={() => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        onOpenRunningTimer?.(runningTimer ?? null);
                                    }}
                                >
                                    <MaterialIcons name="timer" size={15} color={runningTimer != null ? '#00E5FF' : 'rgba(255,255,255,0.35)'} />
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        {runningTimer != null ? (
                                            <>
                                                <Text style={styles.pdTimerName} numberOfLines={1}>{runningTimer.title}</Text>
                                                <Text style={styles.pdTimerVal}>{runningTimer.time}</Text>
                                            </>
                                        ) : (
                                            <Text style={styles.pdTimerOff} numberOfLines={1}>No timer running</Text>
                                        )}
                                    </View>
                                    <MaterialIcons name="chevron-right" size={16} color="rgba(255,255,255,0.4)" />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.pdDome}
                                    activeOpacity={0.8}
                                    onPress={() => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        setIsProgressExpanded(false);
                                    }}
                                >
                                    <MaterialIcons name="close" size={16} color="rgba(255,255,255,0.92)" />
                                </TouchableOpacity>
                            </View>

                            {/* Row 2: time summary, or the selected subtask with its status / edit buttons */}
                            {(() => {
                                const selectedTask = resizeModeStage ? tasks.find(t => t.id === resizeModeStage.taskId) : undefined;
                                const selectedStage = resizeModeStage ? selectedTask?.stages?.find(s => s.id === resizeModeStage.stageId) : undefined;
                                if (resizeModeStage && selectedStage) {
                                    const effectiveTime = getEffectiveStageTime(selectedStage);
                                    const status = selectedStage.status || 'Upcoming';
                                    const statusConfig = STAGE_STATUS_CONFIG[status];
                                    return (
                                        <View style={styles.pdRow}>
                                            <View style={[styles.pdStat, { flex: 1 }]}>
                                                <Text style={styles.pdStatLabel} numberOfLines={1}>{(selectedTask?.title || 'TASK').toUpperCase()}</Text>
                                                <Text style={styles.pdStatVal} numberOfLines={1}>{selectedStage.text}</Text>
                                                <Text style={styles.pdStatMeta} numberOfLines={1}>
                                                    {formatTimeCompact(effectiveTime.startTimeMinutes)} · {formatDurationCompact(effectiveTime.durationMinutes)}
                                                </Text>
                                            </View>
                                            <View ref={statusButtonRef} collapsable={false}>
                                                <TouchableOpacity
                                                    style={styles.pdDome}
                                                    activeOpacity={0.8}
                                                    onPress={() => {
                                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                        statusButtonRef.current?.measureInWindow((x, y, w, h) => {
                                                            setStageStatusPopupPosition({ x: x + w / 2, y: y + h });
                                                            setStageStatusPopupVisible(true);
                                                        });
                                                    }}
                                                >
                                                    <MaterialIcons name={statusConfig.icon} size={16} color={statusConfig.color} />
                                                </TouchableOpacity>
                                            </View>
                                            <TouchableOpacity
                                                style={styles.pdDome}
                                                activeOpacity={0.8}
                                                onPress={() => {
                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                    setAddSubtaskModal({
                                                        visible: true,
                                                        taskId: resizeModeStage.taskId,
                                                        startTimeMinutes: effectiveTime.startTimeMinutes,
                                                        mode: 'edit',
                                                        stageId: resizeModeStage.stageId,
                                                        existingText: selectedStage.text,
                                                        existingStartTime: effectiveTime.startTimeMinutes,
                                                        existingDuration: effectiveTime.durationMinutes,
                                                    });
                                                }}
                                            >
                                                <MaterialIcons name="edit" size={15} color="rgba(255,255,255,0.85)" />
                                            </TouchableOpacity>
                                        </View>
                                    );
                                }
                                return (
                                    <View style={styles.pdRow}>
                                        <View style={[styles.pdStat, { flex: 1.25 }]}>
                                            <Text style={styles.pdStatLabel} numberOfLines={1}>TOTAL · {progressSummary.completed}/{progressSummary.totalStages}</Text>
                                            <Text style={styles.pdStatVal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{formatDurationCompact(progressSummary.totalMinutes)}</Text>
                                        </View>
                                        <View style={styles.pdStat}>
                                            <Text style={styles.pdStatLabel} numberOfLines={1}>DONE</Text>
                                            <Text style={[styles.pdStatVal, { color: '#7BE18A' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{formatDurationCompact(progressSummary.doneMinutes)}</Text>
                                        </View>
                                        <View style={styles.pdStat}>
                                            <Text style={styles.pdStatLabel} numberOfLines={1}>UNDONE</Text>
                                            <Text style={[styles.pdStatVal, { color: '#FF6B6B' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{formatDurationCompact(progressSummary.undoneMinutes)}</Text>
                                        </View>
                                        <View style={styles.pdStat}>
                                            <Text style={styles.pdStatLabel} numberOfLines={1}>LEFT</Text>
                                            <Text style={[styles.pdStatVal, { color: '#FFB74D' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{formatDurationCompact(progressSummary.remainingMinutes)}</Text>
                                        </View>
                                    </View>
                                );
                            })()}

                            {/* Row 3: tools */}
                            <View style={styles.pdRow}>
                                <TouchableOpacity
                                    style={[styles.pdDome, stackSubtasks && { backgroundColor: 'rgba(76,175,80,0.3)' }]}
                                    activeOpacity={0.8}
                                    onPress={toggleStackSubtasks}
                                >
                                    <MaterialIcons name="stairs" size={16} color={stackSubtasks ? '#7BE18A' : 'rgba(255,255,255,0.65)'} />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.pdTool}
                                    activeOpacity={0.8}
                                    onPress={() => {
                                        setViewDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
                                        setShowDockCalendar(true);
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    }}
                                >
                                    <MaterialIcons name="calendar-today" size={13} color="rgba(255,255,255,0.75)" />
                                    <Text style={styles.pdToolText}>{formatDateLabel(selectedDate)}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.pdTool}
                                    activeOpacity={0.8}
                                    onPress={() => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        scrollToNow();
                                    }}
                                >
                                    <MaterialIcons name="schedule" size={14} color="rgba(255,255,255,0.75)" />
                                    <Text style={[styles.pdToolText, { color: '#00E5FF' }]}>{nowHHMMSS || '--:--:--'}</Text>
                                </TouchableOpacity>
                                <View style={{ flex: 1 }} />
                                <TouchableOpacity
                                    style={[styles.pdDome, showDisabledTasks && { backgroundColor: 'rgba(255,145,0,0.22)' }]}
                                    activeOpacity={0.8}
                                    onPress={() => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        onToggleDisabledTasks?.();
                                    }}
                                >
                                    <MaterialIcons
                                        name={showDisabledTasks ? 'visibility' : 'visibility-off'}
                                        size={16}
                                        color={showDisabledTasks ? '#FF9100' : 'rgba(255,255,255,0.4)'}
                                    />
                                </TouchableOpacity>
                                <View ref={viewModeButtonRef} collapsable={false}>
                                    <TouchableOpacity
                                        style={styles.pdDome}
                                        activeOpacity={0.8}
                                        onPress={() => {
                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                            viewModeButtonRef.current?.measureInWindow((x, y, w, h) => {
                                                setViewModePopupPosition({ x: x + w / 2, y: y + h });
                                                setViewModePopupVisible(true);
                                            });
                                        }}
                                    >
                                        <MaterialIcons
                                            name={viewMode === 'task' ? 'list' : viewMode === 'merged' ? 'merge-type' : 'category'}
                                            size={17}
                                            color="#4CAF50"
                                        />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    )}
                </View>
            </Animated.View>

            {/* Portrait dock backdrop: planner cards fade out behind the bottom controls instead of showing through them */}
            {!isLandscape && !isProgressExpanded && !plannerAdding && !journalOpen && (
                <LinearGradient
                    pointerEvents="none"
                    colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.9)', '#000000']}
                    locations={[0, 0.55, 1]}
                    style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 78 + insets.bottom, zIndex: 6300 }}
                />
            )}

            {/* Bottom open button (visible when dock is collapsed) */}
            {
                !isProgressExpanded && !((plannerAdding || journalOpen) && !isLandscape) && (
                    <View pointerEvents="box-none" style={[styles.bottomOpenProgressBtn, !isLandscape && { bottom: 8 + insets.bottom, alignItems: 'flex-start', paddingLeft: Math.max(14, insets.left + 10) }]}>
                        <TouchableOpacity
                            style={styles.bottomOpenPill}
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                setIsProgressExpanded(true);
                            }}
                            activeOpacity={0.85}
                        >
                            <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
                            <View style={styles.pillRingSocketDeep}>
                                <PillProgressRing
                                    total={progressSummary.totalMinutes}
                                    done={progressSummary.doneMinutes}
                                    active={progressSummary.activeMinutes}
                                    undone={progressSummary.undoneMinutes}
                                    pct={progressSummary.pct}
                                />
                            </View>
                            <View style={styles.pillTextColDeep}>
                                <View style={styles.pillStatRowDeep}>
                                    <Text style={styles.pillStatLabelDeep}>TOTAL</Text>
                                    <Text style={styles.pillStatValueDeep}>{formatDurationCompact(progressSummary.totalMinutes)}</Text>
                                </View>
                                <View style={styles.pillStatRowDeep}>
                                    <Text style={styles.pillStatLabelDeep}>LEFT</Text>
                                    <Text style={[styles.pillStatValueDeep, { color: '#FFB74D' }]}>{formatDurationCompact(progressSummary.remainingMinutes)}</Text>
                                </View>
                            </View>
                        </TouchableOpacity>
                    </View>
                )
            }

            {/* Back button (visible when progress bar is hidden) */}
            {
                !isProgressExpanded && isLandscape && (
                    <TouchableOpacity
                        style={[styles.dockExitBtnFloating, !isLandscape && { bottom: 8 + insets.bottom }]}
                        onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            onClose();
                        }}
                        activeOpacity={0.7}
                    >
                        <MaterialIcons name="arrow-back" size={18} color="rgba(255,255,255,0.9)" />
                    </TouchableOpacity>
                )
            }

            {/* Add Subtask Modal */}
            <AddSubtaskModal
                visible={addSubtaskModal.visible}
                taskId={addSubtaskModal.taskId}
                startTimeMinutes={addSubtaskModal.startTimeMinutes}
                mode={addSubtaskModal.mode || 'add'}
                stageId={addSubtaskModal.stageId || null}
                existingText={addSubtaskModal.existingText}
                existingStartTime={addSubtaskModal.existingStartTime}
                existingDuration={addSubtaskModal.existingDuration}
                initialDuration={addSubtaskModal.initialDuration}
                initialText={addSubtaskModal.initialText}
                onClose={() => setAddSubtaskModal({ visible: false, taskId: null, startTimeMinutes: 0, mode: 'add' })}
                isRecurring={!!tasks.find(t => t.id === addSubtaskModal.taskId)?.recurrence}
                isRepeatSync={tasks.find(t => t.id === addSubtaskModal.taskId)?.recurrence?.repeatSync}
                onAdd={(taskId, text, startTime, duration, syncMode) => {
                    handleAddSubtask(taskId, text, startTime, duration, syncMode);
                    if (addSubtaskModal.ideaId != null) onDeleteIdea?.(addSubtaskModal.ideaId); // the idea became a real subtask
                    setAddSubtaskModal({ visible: false, taskId: null, startTimeMinutes: 0, mode: 'add' });
                }}
                onUpdate={(taskId, stageId, text, startTime, duration, syncMode) => {
                    if (!onUpdateStages) return;
                    const task = tasks.find(t => t.id === taskId);
                    if (!task) return;

                    const updatedStages = (task.stages || []).map(s =>
                        s.id === stageId
                            ? {
                                ...s,
                                text: text,
                                startTimeMinutes: startTime,
                                durationMinutes: duration,
                            }
                            : s
                    );
                    onUpdateStages(task, updatedStages, syncMode);

                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    setAddSubtaskModal({ visible: false, taskId: null, startTimeMinutes: 0, mode: 'add' });
                    // Exit resize mode after update
                    setResizeModeStage(null);
                }}
            />

            <NotificationPopup
                visible={approvalPopupVisible}
                onClose={() => setApprovalPopupVisible(false)}
                tasks={tasks}
                categories={categories}
                dailyStartMinutes={dailyStartMinutes}
                currentMinutes={currentTimeRef.current.getHours() * 60 + currentTimeRef.current.getMinutes()}
                anchorBottom={(isProgressExpanded ? progressDockHeight + 10 : (isLandscape ? 12 : 8 + insets.bottom)) + 50}
                anchorRight={Math.max(14, insets.right + 10)}
                onUpdateStageStatus={handleUpdateStageStatus}
                onFinishAll={handleApproveAll}
            />

            {/* Portrait: the Live Focus screen turns into the vertical planner (same actions as landscape) */}
            {!isLandscape && (
                <AgendaView
                    embedded
                    visible
                    onClose={onClose}
                    allTasks={allTasks ?? tasks}
                    selectedDate={selectedDate}
                    dailyStartMinutes={dailyStartMinutes}
                    nowMinutes={currentTimeRef.current.getHours() * 60 + currentTimeRef.current.getMinutes() + currentTimeRef.current.getSeconds() / 60}
                    showDisabledTasks={showDisabledTasks}
                    onUpdateStages={onUpdateStages}
                    addTargets={displayTasks.map(t => ({ id: t.id, title: t.title, color: categories.find(c => c.id === t.categoryId)?.color }))}
                    ideas={ideas}
                    onAddIdea={onAddIdea}
                    onDeleteIdea={onDeleteIdea}
                    journal={journal}
                    onAddJournal={onAddJournal}
                    onUpdateJournal={onUpdateJournal}
                    onDeleteJournal={onDeleteJournal}
                    onJournalStageChange={setJournalStage}
                    journalToggle={journalToggle}
                    ideasOpen={ideasOpen}
                    onIdeasOpenChange={setIdeasOpen}
                    onAddSubtask={(taskId, startTimeMinutes, durationMinutes, ideaId) => {
                        const idea = ideaId != null ? ideas.find(i => i.id === ideaId) : undefined;
                        setAddSubtaskModal({ visible: true, taskId, startTimeMinutes, mode: 'add', initialDuration: durationMinutes, initialText: idea?.title, ideaId: idea?.id });
                    }}
                    onDayChange={(dayKey) => onDateChange(getStartOfLogicalDayFromString(dayKey, dailyStartMinutes))}
                    onSlideActiveChange={setPlannerAdding}
                    onQuickAdd={(taskId, name, startTimeMinutes, durationMinutes) => handleAddSubtask(taskId, name, startTimeMinutes, durationMinutes)}
                    onEditStage={(item: AgendaItem) => {
                        setAddSubtaskModal({
                            visible: true,
                            taskId: item.taskId,
                            startTimeMinutes: item.startTimeMinutes,
                            mode: 'edit',
                            stageId: item.id,
                            existingText: item.text,
                            existingStartTime: item.startTimeMinutes,
                            existingDuration: item.durationMinutes,
                        });
                    }}
                />
            )}

            <FullScreenTimer
                visible={fullScreenTimerVisible}
                onClose={() => setFullScreenTimerVisible(false)}
                timerSeconds={timerSeconds}
                isTimerRunning={isTimerRunning}
                onPlay={() => setIsTimerRunning(true)}
                onPause={() => setIsTimerRunning(false)}
                onReset={() => {
                    setIsTimerRunning(false);
                    setTimerSeconds(0);
                }}
                tasks={displayTasks.map(t => ({
                    id: t.id,
                    title: t.title,
                    color: categories.find(c => c.id === t.categoryId)?.color
                }))}
                liveStages={liveStagesForFullScreen}
                completedStages={completedStagesForFullScreen}
                upcomingStages={upcomingStagesForFullScreen}
                undoneStages={undoneStagesForFullScreen}
                timerTextColor={timerTextColor}
                sliderButtonColor={sliderButtonColor}
                onStartStage={handleStartStage}
                onCompleteStage={handleCompleteStage}
                onExtendStage={handleExtendStage}
                onUpdateStageStatus={handleUpdateStageStatus}
            />

            <StageActionPopup
                visible={stageStatusPopupVisible}
                position={stageStatusPopupPosition}
                onSelectStatus={(status, sync) => {
                    const target = statusPopupTarget ?? resizeModeStage;
                    if (target) {
                        handleUpdateStageStatus(target.taskId, target.stageId, status, sync);
                    }
                    setStageStatusPopupVisible(false);
                    setStatusPopupTarget(null);
                }}
                onClose={() => {
                    setStageStatusPopupVisible(false);
                    setStatusPopupTarget(null);
                }}
                currentStatus={(() => {
                    const tgt = statusPopupTarget ?? resizeModeStage;
                    if (!tgt) return 'Upcoming';
                    const t = tasks.find(t_ => t_.id === tgt.taskId);
                    const s = t?.stages?.find(s_ => s_.id === tgt.stageId);
                    return (s?.status ?? 'Upcoming') as StageStatus;
                })()}
                showFutureToggle={(() => {
                    const task = tasks.find(t => t.id === (statusPopupTarget ?? resizeModeStage)?.taskId);
                    return !!task?.recurrence && !task.recurrence.repeatSync;
                })()}
                initialSyncMode={(() => {
                    const tgt = statusPopupTarget ?? resizeModeStage;
                    if (!tgt) return 'none';
                    const t = tasks.find(t_ => t_.id === tgt.taskId);
                    const s = t?.stages?.find(s_ => s_.id === tgt.stageId);
                    return s?.syncMode || 'none';
                })()}
            />

            {/* Small calendar popup: tap date line (21 JAN) in dock to pick date and move live view */}
            <Modal
                visible={showDockCalendar}
                transparent
                animationType="fade"
                supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
                onRequestClose={() => setShowDockCalendar(false)}
            >
                <View style={styles.calendarModalBackdrop}>
                    <TouchableWithoutFeedback onPress={() => setShowDockCalendar(false)}>
                        <View style={styles.calendarModalTouchable} />
                    </TouchableWithoutFeedback>
                    <View style={styles.calendarPopup}>
                        <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
                        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dockGlassTint]} />
                        <LinearGradient
                            pointerEvents="none"
                            colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']}
                            start={{ x: 0.5, y: 0 }}
                            end={{ x: 0.5, y: 1 }}
                            style={styles.dockGlassSheen}
                        />
                        {renderDockCalendar()}
                    </View>
                </View>
            </Modal>

            {/* View mode selector: same small/compact design as StageActionPopup (status change); positioned below button */}
            <Modal
                visible={viewModePopupVisible}
                transparent
                animationType="none"
                onRequestClose={() => setViewModePopupVisible(false)}
                supportedOrientations={['portrait', 'landscape']}
                statusBarTranslucent={true}
            >
                <TouchableOpacity
                    style={styles.viewModePopupOverlay}
                    activeOpacity={1}
                    onPress={() => setViewModePopupVisible(false)}
                >
                    {viewModePopupVisible && (() => {
                        const popupWidth = 140;
                        const popupHeight = 130;
                        const padding = 12;
                        let adjustedX = viewModePopupPosition.x - popupWidth / 2;
                        let adjustedY = viewModePopupPosition.y + 10;
                        if (adjustedX + popupWidth > screenWidth - padding) adjustedX = screenWidth - popupWidth - padding;
                        if (adjustedX < padding) adjustedX = padding;
                        if (adjustedY + popupHeight > screenHeight - padding) adjustedY = viewModePopupPosition.y - popupHeight - 15;
                        if (adjustedY < padding) adjustedY = padding;
                        const VIEW_OPTIONS: { mode: LiveViewMode; icon: keyof typeof MaterialIcons.glyphMap; label: string; color: string }[] = [
                            { mode: 'task', icon: 'list', label: 'By task', color: '#4CAF50' },
                            { mode: 'merged', icon: 'merge-type', label: 'Merged', color: '#4CAF50' },
                            { mode: 'category', icon: 'category', label: 'By category', color: '#4CAF50' },
                        ];
                        return (
                            <View style={[styles.viewModePopupCompact, { left: adjustedX, top: adjustedY }]}>
                                <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
                                <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dockGlassTint]} />
                                <LinearGradient
                                    pointerEvents="none"
                                    colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']}
                                    start={{ x: 0.5, y: 0 }}
                                    end={{ x: 0.5, y: 1 }}
                                    style={styles.dockGlassSheen}
                                />
                                {VIEW_OPTIONS.map((opt, index) => (
                                    <React.Fragment key={opt.mode}>
                                        {index > 0 && <View style={styles.viewModePopupSeparator} />}
                                        <TouchableOpacity
                                            style={[styles.viewModePopupOption, viewMode === opt.mode && styles.viewModePopupOptionActive]}
                                            onPress={() => {
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                setViewMode(opt.mode);
                                                onViewModeChange?.(opt.mode);
                                                setViewModePopupVisible(false);
                                            }}
                                            activeOpacity={0.7}
                                        >
                                            <View style={styles.viewModeIconSocket}>
                                                <View style={[styles.viewModeIconDome, viewMode === opt.mode && styles.viewModeIconDomeActive]}>
                                                    <MaterialIcons name={opt.icon} size={13} color={viewMode === opt.mode ? '#7BE18A' : 'rgba(255,255,255,0.8)'} />
                                                </View>
                                            </View>
                                            <Text style={[styles.viewModePopupOptionText, { color: viewMode === opt.mode ? '#fff' : 'rgba(255,255,255,0.75)' }]}>{opt.label}</Text>
                                            {viewMode === opt.mode && (
                                                <View style={styles.viewModeCheckChip}>
                                                    <MaterialIcons name="check" size={11} color="#0A0C10" />
                                                </View>
                                            )}
                                        </TouchableOpacity>
                                    </React.Fragment>
                                ))}
                            </View>
                        );
                    })()}
                </TouchableOpacity>
            </Modal>

            {/* Task subtasks popup: tap left task card to show all subtasks with status */}
            <Modal
                visible={taskSubtasksPopupTask != null}
                transparent
                animationType="fade"
                supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
                onRequestClose={() => setTaskSubtasksPopupTask(null)}
            >
                <View style={styles.calendarModalBackdrop}>
                    <TouchableWithoutFeedback onPress={() => setTaskSubtasksPopupTask(null)}>
                        <View style={styles.calendarModalTouchable} />
                    </TouchableWithoutFeedback>
                    {taskSubtasksPopupTask && (() => {
                        const stages = taskSubtasksPopupTask.stages || [];
                        const totalStages = stages.length;
                        const totalDuration = stages.reduce((sum, s) => sum + (s.durationMinutes ?? 180), 0);
                        const completed = stages.filter(s => s.status === 'Done' || s.isCompleted).length;
                        const undone = stages.filter(s => s.status === 'Undone').length;
                        const inProcess = stages.filter(s => s.status === 'Process').length;
                        const pending = stages.filter(s => s.status === 'Upcoming' || !s.status).length;
                        const analyticsBlock = (
                            <>
                                <View style={styles.taskSubtasksPopupAnalyticsRow}>
                                    <Text style={styles.taskSubtasksPopupAnalyticsLabel}>TOTAL DURATION</Text>
                                    <Text style={styles.taskSubtasksPopupAnalyticsValue}>{formatDurationCompact(totalDuration)}</Text>
                                </View>
                                <View style={styles.taskSubtasksPopupAnalyticsRow}>
                                    <Text style={styles.taskSubtasksPopupAnalyticsLabel}>TOTAL</Text>
                                    <Text style={styles.taskSubtasksPopupAnalyticsValue}>{totalStages}</Text>
                                </View>
                                <View style={styles.taskSubtasksPopupAnalyticsRow}>
                                    <Text style={styles.taskSubtasksPopupAnalyticsLabel}>DONE</Text>
                                    <Text style={[styles.taskSubtasksPopupAnalyticsValue, { color: '#4CAF50' }]}>{completed}</Text>
                                </View>
                                <View style={styles.taskSubtasksPopupAnalyticsRow}>
                                    <Text style={styles.taskSubtasksPopupAnalyticsLabel}>UNDONE</Text>
                                    <Text style={[styles.taskSubtasksPopupAnalyticsValue, { color: '#FF5252' }]}>{undone}</Text>
                                </View>
                                <View style={styles.taskSubtasksPopupAnalyticsRow}>
                                    <Text style={styles.taskSubtasksPopupAnalyticsLabel}>PENDING</Text>
                                    <Text style={styles.taskSubtasksPopupAnalyticsValue}>{pending}</Text>
                                </View>
                                <View style={styles.taskSubtasksPopupAnalyticsRow}>
                                    <Text style={styles.taskSubtasksPopupAnalyticsLabel}>IN PROCESS</Text>
                                    <Text style={[styles.taskSubtasksPopupAnalyticsValue, { color: '#FFB74D' }]}>{inProcess}</Text>
                                </View>
                            </>
                        );

                        const cardsContent = (taskSubtasksPopupTask.stages || []).length === 0 ? (
                            <Text style={styles.taskSubtasksPopupEmpty}>No subtasks</Text>
                        ) : (
                            (taskSubtasksPopupTask.stages || []).map((stage) => {
                                const status = stage.status || 'Upcoming';
                                const config = STAGE_STATUS_CONFIG[status];
                                const startMinutes = stage.startTimeMinutes ?? 0;
                                const durationMinutes = stage.durationMinutes ?? 180;
                                const endMinutes = (startMinutes + durationMinutes) % 1440;
                                const startStr = formatTimeCompact(startMinutes);
                                const endStr = formatTimeCompact(endMinutes);
                                const durationStr = formatDurationCompact(durationMinutes);
                                return (
                                    <View
                                        key={stage.id}
                                        style={[
                                            styles.taskSubtasksPopupRow,
                                            { borderLeftColor: config.color },
                                        ]}
                                    >
                                        <View style={[styles.taskSubtasksPopupStatusCircle, { backgroundColor: config.color }]}>
                                            <MaterialIcons name={config.icon} size={14} color="#FFFFFF" />
                                        </View>
                                        <View style={styles.taskSubtasksPopupCardContent}>
                                            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                                                <Text style={styles.taskSubtasksPopupRowText} numberOfLines={1}>
                                                    {stage.text}
                                                </Text>
                                                {renderSyncIndicator(stage, { marginLeft: 6 }, 10)}
                                            </View>
                                            <Text style={styles.taskSubtasksPopupTimeRow}>
                                                {startStr} – {endStr}  ·  {durationStr}
                                            </Text>
                                        </View>
                                    </View>
                                );
                            })
                        );

                        return (
                            <View
                                style={[
                                    styles.taskSubtasksPopup,
                                    isLandscape && styles.taskSubtasksPopupLandscape,
                                    isLandscape && { height: screenHeight * 0.88, maxHeight: screenHeight * 0.88 },
                                ]}
                            >
                                <View style={styles.taskSubtasksPopupHeader}>
                                    <Text style={styles.taskSubtasksPopupTitle} numberOfLines={1}>
                                        {taskSubtasksPopupTask.title}
                                    </Text>
                                    <TouchableOpacity
                                        style={styles.taskSubtasksPopupClose}
                                        onPress={() => {
                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                            setTaskSubtasksPopupTask(null);
                                        }}
                                    >
                                        <MaterialIcons name="close" size={20} color="#fff" />
                                    </TouchableOpacity>
                                </View>
                                {isLandscape ? (
                                    <View style={styles.taskSubtasksPopupBodyLandscape}>
                                        <View style={styles.taskSubtasksPopupLeftPanel}>
                                            <Text style={styles.taskSubtasksPopupAnalyticsTitle}>ANALYTICS</Text>
                                            <View style={styles.taskSubtasksPopupLeftPanelContent}>
                                                {analyticsBlock}
                                            </View>
                                        </View>
                                        <View style={styles.taskSubtasksPopupRightPanel}>
                                            <ScrollView
                                                style={[styles.taskSubtasksPopupScroll, styles.taskSubtasksPopupScrollLandscape]}
                                                contentContainerStyle={styles.taskSubtasksPopupScrollContent}
                                                showsVerticalScrollIndicator={true}
                                            >
                                                {cardsContent}
                                            </ScrollView>
                                        </View>
                                    </View>
                                ) : (
                                    <>
                                        <View style={styles.taskSubtasksPopupAnalytics}>
                                            <View style={styles.taskSubtasksPopupAnalyticsRow}>
                                                <Text style={styles.taskSubtasksPopupAnalyticsLabel}>TOTAL DURATION</Text>
                                                <Text style={styles.taskSubtasksPopupAnalyticsValue}>{formatDurationCompact(totalDuration)}</Text>
                                            </View>
                                            <View style={styles.taskSubtasksPopupAnalyticsDivider} />
                                            <View style={styles.taskSubtasksPopupAnalyticsRow}>
                                                <Text style={styles.taskSubtasksPopupAnalyticsLabel}>TOTAL</Text>
                                                <Text style={styles.taskSubtasksPopupAnalyticsValue}>{totalStages}</Text>
                                            </View>
                                            <View style={styles.taskSubtasksPopupAnalyticsDivider} />
                                            <View style={styles.taskSubtasksPopupAnalyticsRow}>
                                                <Text style={styles.taskSubtasksPopupAnalyticsLabel}>DONE</Text>
                                                <Text style={[styles.taskSubtasksPopupAnalyticsValue, { color: '#4CAF50' }]}>{completed}</Text>
                                            </View>
                                            <View style={styles.taskSubtasksPopupAnalyticsDivider} />
                                            <View style={styles.taskSubtasksPopupAnalyticsRow}>
                                                <Text style={styles.taskSubtasksPopupAnalyticsLabel}>UNDONE</Text>
                                                <Text style={[styles.taskSubtasksPopupAnalyticsValue, { color: '#FF5252' }]}>{undone}</Text>
                                            </View>
                                            <View style={styles.taskSubtasksPopupAnalyticsDivider} />
                                            <View style={styles.taskSubtasksPopupAnalyticsRow}>
                                                <Text style={styles.taskSubtasksPopupAnalyticsLabel}>PENDING</Text>
                                                <Text style={styles.taskSubtasksPopupAnalyticsValue}>{pending}</Text>
                                            </View>
                                            <View style={styles.taskSubtasksPopupAnalyticsDivider} />
                                            <View style={styles.taskSubtasksPopupAnalyticsRow}>
                                                <Text style={styles.taskSubtasksPopupAnalyticsLabel}>IN PROCESS</Text>
                                                <Text style={[styles.taskSubtasksPopupAnalyticsValue, { color: '#FFB74D' }]}>{inProcess}</Text>
                                            </View>
                                        </View>
                                        <ScrollView
                                            style={styles.taskSubtasksPopupScroll}
                                            contentContainerStyle={styles.taskSubtasksPopupScrollContent}
                                            showsVerticalScrollIndicator={true}
                                        >
                                            {cardsContent}
                                        </ScrollView>
                                    </>
                                )}
                            </View>
                        );
                    })()}
                </View>
            </Modal>


            {/* Landscape idea popup (portrait uses the one inside the planner) */}
            {isLandscape && !!onAddIdea && !!onDeleteIdea && (
                <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 9000 }]}>
                    <IdeaTray
                        landscape
                        ideas={ideas}
                        open={ideasOpen}
                        onOpenChange={setIdeasOpen}
                        todayKey={getLogicalDate(new Date(), dailyStartMinutes)}
                        bottom={0}
                        right={Math.max(14, insets.right + 10)}
                        keyboardHeight={0}
                        onAdd={onAddIdea}
                        onDelete={onDeleteIdea}
                        onPlace={() => { }}
                        onDragStart={() => { }}
                        dragX={ideaDragX}
                        dragY={ideaDragY}
                        dragOn={ideaDragOn}
                        onDragEnd={() => { }}
                        tasks={displayTasks.map(t => ({ id: t.id, title: t.title, color: categories.find(c => c.id === t.categoryId)?.color }))}
                        onPlaceWithTask={(idea, taskId) => {
                            const now = currentTimeRef.current;
                            const start = Math.round((now.getHours() * 60 + now.getMinutes()) / 5) * 5 % 1440;
                            setAddSubtaskModal({ visible: true, taskId, startTimeMinutes: start, mode: 'add', initialText: idea.title, ideaId: idea.id });
                        }}
                    />
                </View>
            )}

            {/* Floating controls, bottom right: notifications + full screen */}
            <View
                pointerEvents="box-none"
                style={[
                    styles.floatingControlsDeep,
                    (plannerAdding || journalOpen) && !isLandscape && { display: 'none' },
                    {
                        right: Math.max(14, insets.right + 10),
                        bottom: isProgressExpanded ? progressDockHeight + 10 : (isLandscape ? 12 : 8 + insets.bottom),
                    },
                ]}
            >
                {!isProgressExpanded && isLandscape && (
                    <TouchableOpacity
                        style={styles.fullScreenSocketDeep2}
                        onPress={toggleStackSubtasks}
                        activeOpacity={0.85}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                        <View style={[styles.fullScreenDomeDeep, stackSubtasks && { backgroundColor: 'rgba(76,175,80,0.28)' }]}>
                            <MaterialIcons name="stairs" size={18} color={stackSubtasks ? '#7BE18A' : 'rgba(255,255,255,0.9)'} />
                        </View>
                    </TouchableOpacity>
                )}
                {!isLandscape && !!onAddJournal && (
                    <NotificationButton
                        count={journal.filter(j => j.day === getLogicalDate(selectedDate, dailyStartMinutes)).length}
                        icon="menu-book"
                        iconActive="menu-book"
                        onPress={() => setJournalToggle(n => n + 1)}
                    />
                )}
                {!!onAddIdea && (
                    <NotificationButton
                        count={ideas.length}
                        icon="lightbulb-outline"
                        iconActive="lightbulb"
                        onPress={() => setIdeasOpen(o => !o)}
                    />
                )}
                <NotificationButton
                    count={approvalCount}
                    onPress={() => setApprovalPopupVisible(true)}
                />
                <TouchableOpacity
                    style={styles.fullScreenSocketDeep2}
                    onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setFullScreenTimerVisible(true);
                    }}
                    activeOpacity={0.85}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                    <View style={styles.fullScreenDomeDeep}>
                        <MaterialIcons name="fullscreen" size={19} color="rgba(255,255,255,0.9)" />
                    </View>
                </TouchableOpacity>
            </View>

        </View >
    );
}

// Untimed Stages Draggable List Component
interface UntimedStagesDraggableListProps {
    entries: TaskStageEntry[];
    cellWidth: number;
    minutesPerCell: number;
    trackLabelWidth: number;
    getTimelineScrollX: () => number;
    isLandscape: boolean;
    getStageNeedsApproval?: (stage: TaskStage) => 'START' | 'FINISH' | null;
    onDeleteStage: (stageId: number) => void;
    onDropOnTimeline: (stageId: number, xPosition: number) => void;
    onHeightChange?: (height: number) => void; // Callback when list height changes
    checkAndUpdateAutoScroll: (pageX: number) => void;
    stopAutoScroll: () => void;
}

function UntimedStagesDraggableList({
    entries,
    cellWidth,
    minutesPerCell,
    trackLabelWidth,
    getTimelineScrollX,
    isLandscape,
    getStageNeedsApproval,
    onDeleteStage,
    onDropOnTimeline,
    onHeightChange,
    checkAndUpdateAutoScroll,
    stopAutoScroll
}: UntimedStagesDraggableListProps) {
    const stages = useMemo(() => entries.map(e => e.stage), [entries]);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [measuredWidths, setMeasuredWidths] = useState<Map<number, number>>(new Map());
    const maxCardWidthRef = useRef(200);

    // Update current time every minute
    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(interval);
    }, []);

    // Helper to get time position
    const getTimePosition = useCallback((stage: TaskStage): 'before' | 'on' | 'after' => {
        const startTime = stage.startTimeMinutes ?? 0;
        const duration = stage.durationMinutes ?? 120;
        const endTime = startTime + duration;
        const currentTimeMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

        if (endTime < currentTimeMinutes) return 'before';
        if (startTime > currentTimeMinutes) return 'after';
        return 'on';
    }, [currentTime]);

    // Handle card layout measurement
    const handleCardLayout = useCallback((stageId: number, width: number) => {
        if (width > 0) {
            setMeasuredWidths(prev => {
                const newMap = new Map(prev);
                const oldWidth = prev.get(stageId);
                // Only update if width changed significantly (avoid unnecessary re-renders)
                if (oldWidth === undefined || Math.abs(oldWidth - width) > 2) {
                    newMap.set(stageId, width);
                    const maxWidth = Math.max(...Array.from(newMap.values()));
                    if (maxWidth > maxCardWidthRef.current) {
                        maxCardWidthRef.current = maxWidth;
                    }
                    return newMap;
                }
                return prev;
            });
        }
    }, []);

    // 2D drag (free drag anywhere) – long-press to start, move anywhere, drop to set start time
    const [drag2DStage, setDrag2DStage] = useState<TaskStage | null>(null);
    const drag2DStageIdRef = useRef<number | null>(null);
    const drag2DAnchorRef = useRef<{ dx: number; dy: number }>({ dx: 80, dy: 16 });
    const drag2DCardWidthRef = useRef<number>(160); // Store original card width to keep it constant
    const [drag2DPos, setDrag2DPos] = useState<{ x: number; y: number } | null>(null);

    const stop2DDrag = useCallback(() => {
        drag2DStageIdRef.current = null;
        setDrag2DStage(null);
        setDrag2DPos(null);
    }, []);

    const start2DDrag = useCallback((stage: TaskStage, e: any) => {
        if (!isLandscape) return;
        const { pageX, pageY } = e.nativeEvent;
        // Store the original card width to keep it constant during drag
        const originalWidth = measuredWidths.get(stage.id) ?? 160;
        drag2DCardWidthRef.current = originalWidth;
        drag2DAnchorRef.current = { dx: originalWidth / 2, dy: 14 };
        drag2DStageIdRef.current = stage.id;
        setDrag2DStage(stage);
        setDrag2DPos({ x: pageX, y: pageY });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }, [measuredWidths]);

    const drag2DPanResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderMove: (evt) => {
                if (!drag2DStageIdRef.current) return;
                const { pageX, pageY } = evt.nativeEvent;

                // Check for auto-scroll
                checkAndUpdateAutoScroll(pageX);

                setDrag2DPos({ x: pageX, y: pageY });
            },
            onPanResponderRelease: (evt) => {
                // Stop auto-scroll
                stopAutoScroll();

                const stageId = drag2DStageIdRef.current;
                if (!stageId) return;

                const { pageX } = evt.nativeEvent;
                // Only set start time if dropped inside timeline area (to the right of fixed task column)
                if (pageX > trackLabelWidth) {
                    const timelineLocalX = pageX - trackLabelWidth;
                    const timelineContentX = getTimelineScrollX() + Math.max(0, timelineLocalX);
                    onDropOnTimeline(stageId, timelineContentX);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                } else {
                    Haptics.selectionAsync();
                }

                stop2DDrag();
            },
            onPanResponderTerminate: () => {
                // Stop auto-scroll
                stopAutoScroll();
                stop2DDrag();
            },
        })
    ).current;

    const renderItem = useCallback((entry: TaskStageEntry) => {
        const { task, stage: item } = entry;
        const status = item.status || 'Upcoming';
        const timePosition = getTimePosition(item);
        const isDragging2D = drag2DStageIdRef.current === item.id;

        const onCardLayout = (event: any) => {
            const { width } = event.nativeEvent.layout;
            handleCardLayout(item.id, width);
        };

        return (
            <View
                key={item.id}
                style={[
                    styles.untimedStageItem,
                    { backgroundColor: STAGE_STATUS_CONFIG[status].color },
                    isDragging2D && styles.stageItemDragging2D,
                    task.isDisabled && { opacity: 0.35 },
                ]}
                onLayout={onCardLayout}
            >
                {/* Card content - draggable in 2D */}
                <TouchableOpacity
                    style={[styles.stageDragArea, { flex: 1, justifyContent: 'flex-start', alignItems: 'center' }]}
                    onLongPress={(e) => start2DDrag(item, e)}
                    delayLongPress={220}
                    activeOpacity={0.9}
                    disabled={!!drag2DStage}
                >
                    {/* Stage Name */}
                    <Text
                        style={[
                            styles.untimedStageName,
                            { marginRight: 0, color: '#FFFFFF' }, // White text for status backgrounds
                            isDragging2D && styles.stageTextDragging
                        ]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                    >
                        {item.text}
                    </Text>
                    {/* REQUEST badge when stage is in the approval/notification list */}
                    {getStageNeedsApproval?.(item) != null && (
                        <View style={styles.stageRequestBadge}>
                            <MaterialIcons name="notification-important" size={10} color="#FFFFFF" />
                            {/* <Text style={styles.stageRequestBadgeText}>REQUEST</Text> */}
                        </View>
                    )}
                </TouchableOpacity>

                {/* Delete Button */}
                <TouchableOpacity
                    style={styles.stageDeleteButton}
                    onPress={() => {
                        onDeleteStage(item.id);
                    }}
                    disabled={isDragging2D}
                    activeOpacity={0.7}
                >
                    <MaterialIcons
                        name="delete-outline"
                        size={15}
                        color="#FFFFFF" // White icons
                    />
                </TouchableOpacity>
            </View>
        );
    }, [handleCardLayout, getTimePosition, getStageNeedsApproval, onDeleteStage, drag2DStage, start2DDrag]);

    // Calculate dynamic width based on measured card widths
    const calculateListWidth = useCallback(() => {
        if (stages.length === 0) return 200;

        // Use measured widths if available
        if (measuredWidths.size > 0) {
            const maxMeasuredWidth = Math.max(...Array.from(measuredWidths.values()));
            // Add padding for container (compressed by 30%)
            const containerWidth = maxMeasuredWidth + 14; // 20 * 0.7 = 14
            // Constrain between min and max (compressed by 30%)
            return Math.min(Math.max(containerWidth, 126), 196); // 180*0.7=126, 280*0.7=196
        }

        // Fallback: estimate based on text length (compressed by 30%)
        const maxNameLength = Math.max(...stages.map(s => s.text.length));
        const baseWidth = 70; // Delete button + padding (100 * 0.7)
        const textWidth = maxNameLength * 4.9; // Approximate 4.9px per character (7 * 0.7)
        return Math.min(Math.max(baseWidth + textWidth, 126), 196); // 180*0.7=126, 280*0.7=196
    }, [stages, measuredWidths]);

    const listWidth = calculateListWidth();

    // Reset measured widths when stages change significantly
    useEffect(() => {
        const currentIds = new Set(stages.map(s => s.id));
        setMeasuredWidths(prev => {
            const filtered = new Map();
            prev.forEach((width, id) => {
                if (currentIds.has(id)) {
                    filtered.set(id, width);
                }
            });
            return filtered;
        });
    }, [stages.length]);

    return (
        <>
            <View style={[styles.untimedStagesList, { width: listWidth, maxWidth: listWidth }]}>
                <View style={{
                    paddingRight: 0,
                    paddingBottom: 10.5, // 7 (base) + 3.5 (extra margin) = 10.5 to prevent overlap
                    width: listWidth,
                    maxWidth: listWidth
                }}>
                    {entries.map((entry) => renderItem(entry))}
                </View>
            </View>

            {/* 2D drag overlay (free drag anywhere) */}
            <Modal
                visible={isLandscape && !!drag2DStage && !!drag2DPos}
                transparent
                animationType="none"
                onRequestClose={stop2DDrag}
                supportedOrientations={['landscape-left', 'landscape-right']}
            >
                <View style={styles.dragOverlay} {...drag2DPanResponder.panHandlers}>
                    {drag2DStage && drag2DPos && (
                        <View
                            style={[
                                styles.dragOverlayCard,
                                {
                                    left: drag2DPos.x - drag2DAnchorRef.current.dx,
                                    top: drag2DPos.y - drag2DAnchorRef.current.dy,
                                    width: drag2DCardWidthRef.current, // Use stored constant width
                                },
                            ]}
                        >
                            <View style={styles.dragOverlayContent}>
                                <Text style={[styles.untimedStageName, styles.stageTextDragging]} numberOfLines={1}>
                                    {drag2DStage.text}
                                </Text>
                            </View>
                        </View>
                    )}
                </View>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
    },
    topStatusBar: {
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(76, 175, 80, 0.35)',
        backgroundColor: '#000000',
    },
    topStatusProgressTrack: {
        height: 3,
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    topStatusProgressFill: {
        height: 3,
        backgroundColor: '#4CAF50',
    },
    topStatusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        gap: 12,
    },
    topStatusBlock: {
        minWidth: 120,
    },
    topStatusLabel: {
        fontSize: 9,
        fontWeight: '900',
        letterSpacing: 2,
        color: 'rgba(255,255,255,0.35)',
    },
    topStatusValue: {
        marginTop: 4,
        fontSize: 12,
        fontWeight: '900',
        color: '#FFFFFF',
    },
    topStatusDivider: {
        width: 1,
        height: 24,
        backgroundColor: 'rgba(255,255,255,0.10)',
    },
    topStatusSpacer: {
        flex: 1,
    },
    topStatusMiniBlock: {
        alignItems: 'flex-start',
        minWidth: 60,
    },
    topStatusMiniLabel: {
        fontSize: 8,
        fontWeight: '900',
        letterSpacing: 2,
        color: 'rgba(255,255,255,0.35)',
    },
    topStatusMiniValue: {
        marginTop: 3,
        fontSize: 11,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.9)',
    },
    topStatusMiniDivider: {
        width: 1,
        height: 18,
        backgroundColor: 'rgba(255,255,255,0.10)',
        marginHorizontal: 4,
    },
    topStatusGear: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
    },
    progressDetailsContainer: {
        backgroundColor: '#000000',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.08)',
        overflow: 'hidden',
    },
    // portrait expanded dock: a sheet that opens from the bottom edge of the screen
    bottomDockPlateSheet: {
        marginHorizontal: 0,
        marginBottom: 0,
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        borderBottomWidth: 0,
        backgroundColor: 'rgba(10,11,14,0.94)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -2px 0 rgba(0,0,0,0.4), 0 -14px 34px rgba(0,0,0,0.85)',
    },
    pdGrab: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, marginBottom: 2, backgroundColor: 'rgba(255,255,255,0.22)' },
    // portrait expanded dock: three roomy rows (no clipped text)
    pdWrap: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 2, paddingBottom: 4 },
    pdRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 42 },
    pdDome: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1D2128',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        boxShadow: '0 0 0 3px rgba(0,0,0,0.5), 0 7px 10px rgba(0,0,0,0.8), 0 2px 0 rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -3px 0 rgba(0,0,0,0.5)',
    },
    pdTimer: {
        flex: 1,
        height: 40,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        borderRadius: 14,
        backgroundColor: 'rgba(0,0,0,0.4)',
        boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.85), 0 1px 0 rgba(255,255,255,0.06)',
    },
    pdTimerName: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
    pdTimerVal: { fontSize: 12, fontWeight: '900', color: '#00E5FF' },
    pdTimerOff: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.5)' },
    pdStat: {
        flex: 1,
        minWidth: 0,
        minHeight: 44,
        justifyContent: 'center',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 14,
        backgroundColor: 'rgba(0,0,0,0.4)',
        boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.85), 0 1px 0 rgba(255,255,255,0.06)',
    },
    pdStatLabel: { fontSize: 7.5, fontWeight: '800', letterSpacing: 1.1, color: 'rgba(255,255,255,0.5)' },
    pdStatVal: { fontSize: 14, fontWeight: '900', color: '#FFFFFF', marginTop: 1 },
    pdStatMeta: { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.55)' },
    pdTool: {
        height: 38,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        borderRadius: 19,
        backgroundColor: '#1D2128',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        boxShadow: '0 0 0 3px rgba(0,0,0,0.5), 0 7px 10px rgba(0,0,0,0.8), 0 2px 0 rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -3px 0 rgba(0,0,0,0.5)',
    },
    pdToolText: { fontSize: 11, fontWeight: '900', color: 'rgba(255,255,255,0.92)' },
    bottomProgressDock: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 64,
        maxHeight: 64,
        zIndex: 6500,
        backgroundColor: 'transparent',
    },
    bottomDockBar: {
        flex: 1,
    },
    bottomDockProgressTrack: {
        height: 3,
        marginBottom: 2,
        backgroundColor: '#0B0C0F',
    },
    bottomDockProgressFill: {
        position: 'absolute',
        left: 0,
        height: '100%',
        backgroundColor: '#4CAF50',
    },
    bottomDockProgressUndone: {
        position: 'absolute',
        height: '100%',
        backgroundColor: '#FF5252',
    },
    bottomDockTimeBarTrack: {
        height: 5,
        flexDirection: 'row',
        overflow: 'hidden',
        marginHorizontal: 14,
        marginTop: 6,
        borderRadius: 3,
        backgroundColor: 'rgba(0,0,0,0.55)',
        boxShadow: 'inset 0 2px 3px rgba(0,0,0,0.9)',
    },
    bottomDockTimeBarSeg: {
        height: '100%',
        borderRightWidth: 1.5,
        borderRightColor: '#050607',
    },
    bottomDockRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 3,
        gap: 7,
    },
    bottomDockPortraitContainer: {
        flex: 1,
        flexDirection: 'column',
        justifyContent: 'space-between',
    },
    bottomDockRowPortraitTop: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingTop: 10,
        paddingBottom: 6,
        gap: 8,
    },
    bottomDockRowPortraitBottom: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingTop: 6,
        paddingBottom: 10,
        gap: 8,
    },
    bottomDockBlock: {
        minWidth: 90,
    },
    bottomDockLabel: {
        fontSize: 9,
        fontWeight: '900',
        letterSpacing: 2,
        color: 'rgba(255,255,255,0.35)',
    },
    bottomDockValue: {
        marginTop: 4,
        fontSize: 12,
        fontWeight: '900',
        color: '#FFFFFF',
    },
    bottomDockDivider: {
        width: 2,
        height: 36,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRightWidth: 1,
        borderRightColor: 'rgba(255,255,255,0.06)',
    },
    bottomDockSummaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        minWidth: 0,
    },
    bottomDockTimeSummary: {
        minWidth: 240,
        justifyContent: 'center',
    },
    bottomDockTimeSummaryTop: {
        fontSize: 9,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.85)',
        letterSpacing: 0.2,
    },
    bottomDockTimeSummaryLabel: {
        fontSize: 8,
        fontWeight: '900',
        letterSpacing: 2,
        color: 'rgba(255,255,255,0.35)',
    },
    bottomDockTimeSummaryValue: {
        fontSize: 11,
        fontWeight: '900',
        color: '#FFFFFF',
    },
    bottomDockTimeSummaryMeta: {
        fontSize: 10,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.35)',
    },
    bottomDockTimeSummaryBottom: {
        marginTop: 2,
        fontSize: 9,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.75)',
        letterSpacing: 0.2,
    },
    bottomDockTimeSummaryK: {
        fontSize: 8,
        fontWeight: '900',
        letterSpacing: 2,
        color: 'rgba(255,255,255,0.35)',
    },
    bottomDockTimeSummaryV: {
        fontSize: 10,
        fontWeight: '900',
        color: '#FFFFFF',
    },
    bottomDockTimeSummarySep: {
        color: 'rgba(255,255,255,0.25)',
        fontSize: 10,
        fontWeight: '900',
    },
    liveRunningTimerSection: {
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'center',
        gap: 1,
        minWidth: 0,
        maxWidth: 130,
        flexShrink: 1,
        overflow: 'hidden',
        paddingVertical: 3,
        paddingHorizontal: 8,
        borderRadius: 9,
        backgroundColor: 'rgba(0,0,0,0.35)',
        boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.85), 0 1px 0 rgba(255,255,255,0.06)',
    },
    liveRunningTimerName: {
        fontSize: 7.5,
        fontWeight: '800',
        color: '#FFFFFF',
        minWidth: 0,
        maxWidth: '100%',
    },
    liveRunningTimerValue: {
        fontSize: 7.5,
        fontWeight: '900',
        color: '#00E5FF',
    },
    liveRunningTimerInactive: {
        fontSize: 9,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.5)',
    },
    bottomDockTimerSection: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        minWidth: 140,
    },
    bottomDockTimerDisplay: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 4,
        paddingHorizontal: 12,
        borderRadius: 14,
        backgroundColor: '#0B0C0F',
        boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.8), inset 0 -1px 0 rgba(255,255,255,0.05)',
    },
    bottomDockTimerLabel: {
        fontSize: 8,
        fontWeight: '900',
        letterSpacing: 2,
        color: 'rgba(255,255,255,0.35)',
    },
    bottomDockTimerValue: {
        fontWeight: '900',
        color: '#FFB74D',
        fontSize: 14,
    },
    bottomDockTimerControls: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    dockTimerBtn: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1D2128',
        borderWidth: 0,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.55,
        shadowRadius: 4,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
    },
    bottomDockSpacer: {
        flex: 1,
    },
    bottomDockMiniBlock: {
        alignItems: 'flex-start',
        minWidth: 60,
    },
    bottomDockMiniLabel: {
        fontSize: 8,
        fontWeight: '900',
        letterSpacing: 2,
        color: 'rgba(255,255,255,0.35)',
    },
    bottomDockMiniValue: {
        marginTop: 3,
        fontSize: 11,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.9)',
    },
    bottomDockMiniDivider: {
        width: 1,
        height: 18,
        backgroundColor: 'rgba(255,255,255,0.10)',
        marginHorizontal: 4,
    },
    bottomOpenProgressBtn: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 12,
        alignItems: 'center',
        zIndex: 6400,
    },
    bottomOpenPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(14,16,20,0.96)',
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.6,
        shadowRadius: 8,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -2px 0 rgba(0,0,0,0.35)',
        height: 38,
        borderRadius: 19,
        paddingLeft: 5,
        paddingRight: 10,
        gap: 7,
    },
    floatingControlsDeep: {
        position: 'absolute',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        zIndex: 9999,
    },
    fullScreenSocketDeep2: {
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0B0C0F',
        boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.85), 0 1px 0 rgba(255,255,255,0.07)',
    },
    pillStatRowDeep: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 8,
    },
    pillStatLabelDeep: {
        fontSize: 6,
        fontWeight: '800',
        letterSpacing: 1.2,
        color: 'rgba(255,255,255,0.5)',
    },
    pillStatValueDeep: {
        fontSize: 10,
        fontWeight: '900',
        color: '#FFFFFF',
    },
    pillRingSocketDeep: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0B0C0F',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.85), 0 1px 0 rgba(255,255,255,0.07)',
        width: 30,
        height: 30,
        borderRadius: 15,
    },
    pillTextColDeep: {
        justifyContent: 'center',
        gap: 0,
        minWidth: 58,
    },
    pillChevronDeep: {
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#22262D',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 4px rgba(0,0,0,0.55)',
    },
    fullScreenSocketDeep: {
        position: 'absolute',
        right: 14,
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0B0C0F',
        zIndex: 9999,
        boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.85), 0 1px 0 rgba(255,255,255,0.07)',
    },
    fullScreenDomeDeep: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1D2128',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.6,
        shadowRadius: 4,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -2px 0 rgba(0,0,0,0.3)',
    },
    bottomOpenPillLabel: {
        color: 'rgba(255,255,255,0.55)',
        fontSize: 7,
        letterSpacing: 1.8,
        fontWeight: '800',
    },
    bottomOpenPillValue: {
        fontWeight: '900',
        color: '#fff',
        fontSize: 14,
        lineHeight: 15,
    },
    mainContainer: {
        flex: 1,
        flexDirection: 'row',
    },
    fixedLabelsColumn: {
        width: 190, // TRACK_LABEL_WIDTH
        zIndex: 100,
        borderRightWidth: 1,
        overflow: 'hidden',
        borderRightColor: 'rgba(255,255,255,0.07)',
        backgroundColor: '#000000',
    },
    /** So task column and timeline get the same height and collapse equally when progress dock is open. */
    mainColumnWhenDockOpen: {
        alignSelf: 'stretch',
    },
    timelineSection: {
        flex: 1,
        flexDirection: 'column',
    },
    collapseAllPillDeep: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 20,
        borderRadius: 10,
        backgroundColor: '#1D2128',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.09), 0 2px 4px rgba(0,0,0,0.55)',
    },
    collapseAllBtnDeep: {
        width: 28,
        height: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    collapseAllDividerDeep: {
        width: 1,
        height: 12,
        backgroundColor: 'rgba(255,255,255,0.12)',
    },
    taskCollapseBtnDeep: {
        position: 'absolute',
        right: 8,
        top: 8,
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#22262D',
        zIndex: 5,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 3px 6px rgba(0,0,0,0.55)',
    },
    taskCollapseBtnDeepCentered: {
        top: '50%',
        marginTop: -12,
    },
    trackLabelInnerCollapsedDeep: {
        paddingLeft: 56,
        paddingRight: 38,
    },
    miniCapsuleDeep: {
        position: 'absolute',
        height: 13,
        borderRadius: 7,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingLeft: 4,
        paddingRight: 5,
        overflow: 'hidden',
        zIndex: 2,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.16), inset 0 -2px 0 rgba(0,0,0,0.3)',
    },
    miniCapsuleDotDeep: {
        width: 7,
        height: 7,
        borderRadius: 4,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)',
    },
    miniCapsuleTextDeep: {
        flexShrink: 1,
        fontSize: 7,
        fontWeight: '800',
        color: '#FFFFFF',
    },
    taskHeaderLabelDeep: {
        fontSize: 8,
        fontWeight: '800',
        letterSpacing: 2,
        color: 'rgba(255,255,255,0.5)',
    },
    stickyHeaderFixed: {
        backgroundColor: '#14171B',
        borderBottomWidth: 0,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.09), inset 0 -3px 0 rgba(0,0,0,0.4)',
    },
    taskListHeader: {
        flexDirection: 'row',
        paddingLeft: 55,
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 10,
    },
    taskListHeaderIconsOnly: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingLeft: 48,
        paddingRight: 8,
        gap: 6,
    },
    taskListHeaderMinimal: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: 14,
        paddingRight: 10,
    },
    dockViewModeBtnContainer: {
        width: 28,
        height: 28,
    },
    dockViewModeBtn: {
        width: 26,
        height: 26,
        borderRadius: 13,
        marginHorizontal: 4,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        shadowColor: '#000',
        shadowOffset: { width: 26, height: 26 },
        shadowOpacity: 0.7,
        shadowRadius: 4,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -2px 0 rgba(0,0,0,0.4), 0 0 0 3px rgba(0,0,0,0.30)',
    },
    viewModeIconBtn: {
        width: 20,
        height: 20,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1D2128',
        borderWidth: 0,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.55,
        shadowRadius: 2,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
    },
    viewModeIconBtnActive: {
        backgroundColor: '#15301B',
        borderColor: 'transparent',
    },
    taskListHeaderTitle: {
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 1.5,
        color: 'rgba(255,255,255,0.6)',
    },
    taskListHeaderBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 8,
        minWidth: 20,
        alignItems: 'center',
        backgroundColor: '#1D2128',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
    },
    taskListHeaderBadgeText: {
        fontSize: 9,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.7)',
    },
    taskListHeaderRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    viewModePills: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    mergedTogglePill: {
        paddingHorizontal: 4,
        paddingVertical: 2,
        borderRadius: 4,
        borderColor: 'rgba(255,255,255,0.12)',
        backgroundColor: '#1D2128',
        borderWidth: 0,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.55,
        shadowRadius: 2,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
    },
    mergedTogglePillActive: {
        backgroundColor: '#15301B',
        borderColor: 'transparent',
    },
    mergedToggleText: {
        fontSize: 7,
        fontWeight: '800',
        letterSpacing: 0.3,
        color: 'rgba(255,255,255,0.5)',
    },
    mergedToggleTextActive: {
        color: '#4CAF50',
    },
    stickyHeaderContainer: {
        height: 25,
        borderBottomColor: 'rgba(76, 175, 80, 0.3)', // Semi-transparent green
        zIndex: 1000,
        backgroundColor: '#14171B',
        borderBottomWidth: 0,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.09), inset 0 -3px 0 rgba(0,0,0,0.4)',
    },
    verticalScrollLabels: {
        flex: 1,
        // Ensure smooth scrolling
        overflow: 'hidden',
        backgroundColor: '#000000',
    },
    trackLabelContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        position: 'relative',
    },
    closeBtnOverlay: {
        position: 'absolute',
        top: 5,
        left: 20,
        padding: 5,
        backgroundColor: 'rgba(255, 255, 255, 0.24)',
        borderRadius: 20,
        zIndex: 3000,
    },
    hourLabelsScroll: {
        height: 30,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.07)',
    },
    hourMarker: {
        position: 'absolute',
        alignItems: 'center',
    },
    hourLineTop: {
        width: 1,
        height: 8,
        backgroundColor: 'rgba(255,255,255,0.3)',
        marginTop: 2,
    },
    verticalScroll: {
        flex: 1,
        // Ensure smooth scrolling
        overflow: 'hidden',
        backgroundColor: '#000000',
    },
    timelineContent: {
        position: 'relative',
    },
    timeOfDayBackgroundLayer: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
    },
    timeOfDayBackgroundSegment: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        opacity: 0.35,
    },
    hourLabelsRow: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
    },
    hourText: {
        fontSize: 11,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.62)',
        letterSpacing: 0.4,
    },
    stickyHeader: {
        position: 'relative',
        height: 25,
        backgroundColor: 'transparent',
    },
    stickyHourLabel: {
        position: 'absolute',
        top: 0,
        alignItems: 'center',
    },
    nowLineSticky: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        zIndex: 10,
        alignItems: 'center',
        justifyContent: 'center',
        width: 3,
        backgroundColor: '#3FBF63',
        borderLeftWidth: 1,
        borderLeftColor: 'rgba(255,255,255,0.35)',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.55), 4px 0 10px rgba(0,0,0,0.55)',
    },
    hourLineOnly: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        alignItems: 'center',
    },
    hourLineExtend: {
        flex: 1,
        minHeight: 1000,
        width: 2,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRightWidth: 1,
        borderRightColor: 'rgba(255,255,255,0.07)',
    },
    hourLine: {
        position: 'absolute',
        bottom: 0,
        height: 2000,
        width: 2,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRightWidth: 1,
        borderRightColor: 'rgba(255,255,255,0.07)',
    },
    nowLine: {
        position: 'absolute',
        bottom: 0,
        zIndex: 100,
        height: 2000,
        width: 3,
        backgroundColor: '#3FBF63',
        borderLeftWidth: 1,
        borderLeftColor: 'rgba(255,255,255,0.35)',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.55), 4px 0 10px rgba(0,0,0,0.55)',
    },
    nowDot: {
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: '#7BE18A',
        borderWidth: 3,
        borderColor: '#08090B',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), 0 3px 6px rgba(0,0,0,0.65)',
    },
    tracksContainer: {
        paddingTop: 0,
        marginTop: 0,
        paddingBottom: 0,
        marginBottom: 0,
    },
    timelineEmptyState: {
        minHeight: 120,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 40,
    },
    timelineEmptyText: {
        fontSize: 14,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.35)',
    },
    trackSeparator: {
        height: 1,
        marginLeft: 0,
        marginRight: 0,
        backgroundColor: '#000000',
    },
    stageStatusSlotDeep: {
        position: 'absolute',
        left: 3,
        top: 0,
        bottom: 0,
        justifyContent: 'center',
        zIndex: 3,
    },
    // sunken socket ...
    stageStatusSocketDeep: {
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.38)',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.65), 0 1px 0 rgba(255,255,255,0.08)',
    },
    // ... with a raised dome inside
    stageStatusDiscDeep: {
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -2px 0 rgba(0,0,0,0.25), 0 2px 3px rgba(0,0,0,0.55)',
    },
    stageRailDeep: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 6,
        boxShadow: 'inset -1px 0 0 rgba(0,0,0,0.3)',
    },
    stageProgressFillDeep: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        backgroundColor: 'rgba(255,255,255,0.09)',
    },
    hourTickMajor: {
        position: 'absolute',
        bottom: 0,
        width: 1,
        height: 10,
        backgroundColor: 'rgba(255,255,255,0.3)',
    },
    hourTickMinor: {
        position: 'absolute',
        bottom: 0,
        width: 1,
        height: 6,
        backgroundColor: 'rgba(255,255,255,0.14)',
    },
    dockStatCells: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    dockStatCell: {
        paddingVertical: 3,
        paddingHorizontal: 8,
        borderRadius: 9,
        backgroundColor: 'rgba(0,0,0,0.35)',
        boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.85), 0 1px 0 rgba(255,255,255,0.06)',
    },
    dockGlassTint: {
        backgroundColor: 'rgba(14,16,20,0.38)',
    },
    dockGlassSheen: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        height: 44,
    },
    bottomDockPlate: {
        flex: 1,
        marginHorizontal: 12,
        marginBottom: 6,
        borderRadius: 22,
        overflow: 'hidden',
        backgroundColor: 'rgba(14,16,20,0.40)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -2px 0 rgba(0,0,0,0.4), 0 -10px 24px rgba(0,0,0,0.7)',
    },
    dockToolDome: {
        width: 26,
        height: 26,
        borderRadius: 13,
        marginHorizontal: 4,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        shadowColor: '#000',
        shadowOffset: { width: 26, height: 26 },
        shadowOpacity: 0.7,
        shadowRadius: 4,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -2px 0 rgba(0,0,0,0.4), 0 0 0 3px rgba(0,0,0,0.30)',
    },
    dockRingSocket: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.35)',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.85), 0 1px 0 rgba(255,255,255,0.07)',
    },
    dockStatCellLabel: {
        fontSize: 5.5,
        fontWeight: '800',
        letterSpacing: 1,
        color: 'rgba(255,255,255,0.5)',
    },
    dockStatCellValue: {
        fontSize: 10,
        fontWeight: '800',
        color: '#FFFFFF',
    },
    dockStatCellMeta: {
        fontSize: 6,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.45)',
    },
    trackGrooveDeep: {
        position: 'absolute',
        right: 2,
        top: 14,
        bottom: 14,
        width: 2,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRightWidth: 1,
        borderRightColor: 'rgba(255,255,255,0.06)',
    },
    railWellDeep: {
        position: 'absolute',
        left: 4,
        right: 12,
        borderRadius: 16,
        overflow: 'hidden',
        top: 8,
        bottom: 8,
        backgroundColor: '#090A0C',
        zIndex: 0,
        borderTopWidth: 2,
        borderTopColor: '#000000',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    railWellLineDeep: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: 2,
        borderRightWidth: 1,
        backgroundColor: 'rgba(0,0,0,0.65)',
        borderRightColor: 'rgba(255,255,255,0.16)',
    },
    track: {
        flexDirection: 'row',
        alignItems: 'flex-start', // Align to top for proper containment
        position: 'relative',
        overflow: 'hidden', // Prevent overflow outside track
        backgroundColor: '#14171B',
        borderTopRightRadius: 24,
        borderBottomRightRadius: 24,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.07)',
        borderBottomWidth: 2,
        borderBottomColor: 'rgba(0,0,0,0.4)',
    },
    trackLabel: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'stretch',
        paddingRight: 8,
        alignSelf: 'stretch',
        shadowColor: '#000',
        marginVertical: 0,
        marginLeft: 8,
        marginRight: 0,
        borderTopLeftRadius: 24,
        borderBottomLeftRadius: 24,
        backgroundColor: '#14171B',
        borderWidth: 1,
        borderRightWidth: 0,
        borderColor: 'rgba(255,255,255,0.06)',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.55,
        shadowRadius: 8,
        borderTopColor: 'rgba(255,255,255,0.08)',
        borderBottomWidth: 2,
        borderBottomColor: 'rgba(0,0,0,0.4)',
    },
    trackLabelActive: {
        backgroundColor: '#1A1D23',
        borderColor: 'rgba(34,227,245,0.45)',
    },
    trackAccentDeep: {
        position: 'absolute',
        left: 7,
        top: 12,
        bottom: 12,
        width: 4,
        borderRadius: 2,
        zIndex: 2,
    },
    stageDurationChipDeep: {
        backgroundColor: 'rgba(0,0,0,0.32)',
        paddingHorizontal: 5,
        paddingVertical: 2,
        borderRadius: 6,
        marginLeft: 5,
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.6)',
    },
    trackLabelInner: {
        flex: 1,
        paddingVertical: 8,
        minWidth: 0,
        paddingRight: 6,
        paddingLeft: 68,
        justifyContent: 'center',
    },
    categoryPill: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingVertical: 2,
        paddingHorizontal: 6,
        paddingLeft: 6,
        borderLeftWidth: 2,
        marginBottom: 4,
        maxWidth: '100%',
        backgroundColor: '#1D2128',
        borderRadius: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.5,
        shadowRadius: 3,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
    },
    categoryPillIcon: {
        marginRight: 4,
    },
    categoryPillText: {
        fontSize: 8,
        fontWeight: '800',
        letterSpacing: 0.8,
    },
    progressBarWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        gap: 6,
    },
    progressBarTrack: {
        flex: 1,
        flexDirection: 'row',
        overflow: 'hidden',
        minWidth: 0,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#0B0C0F',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8)',
    },
    progressBarSegment: {
        minWidth: 0,
    },
    progressBarDone: {
        backgroundColor: '#4CAF50',
    },
    progressBarUndone: {
        backgroundColor: '#FF5252',
    },
    progressBarPending: {
        backgroundColor: 'rgba(255,255,255,0.15)',
    },
    progressBarLabel: {
        fontSize: 8,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.6)',
    },
    categoryAccent: {
        width: 4,
        height: '60%',
        borderRadius: 2,
        position: 'absolute',
        left: 0,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 2,
    },
    titleRowRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    taskAddSubtaskBtn: {
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1D2128',
        borderWidth: 0,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.55,
        shadowRadius: 3,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
    },
    subtitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    activeDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#4CAF50',
        marginLeft: 8,
        shadowColor: '#4CAF50',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 4,
    },
    trackTitle: {
        fontSize: 12,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: 0.4,
    },
    trackTitleActive: {
        color: '#FFFFFF',
        fontWeight: '900',
    },
    trackSubtitle: {
        fontSize: 9,
        fontWeight: '700',
        letterSpacing: 0.8,
    },
    stageStatsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 6,
        gap: 8,
    },
    stageStatItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        paddingHorizontal: 5,
        paddingVertical: 1,
        borderRadius: 4,
    },
    miniStatusDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
    },
    stageStatText: {
        fontSize: 8,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.6)',
    },
    // Modern Material Design 3 - Clean Floating Card
    timelineStageCard: {
        position: 'absolute',
        top: 7,
        backgroundColor: '#FFFFFF',
        paddingVertical: 4, // No vertical padding — height is fixed

        // Modern elevation shadows (two-layer for depth)
        elevation: 4,

        // Subtle border for definition

        // Content layout
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 5.6,
        overflow: 'hidden',
        borderWidth: 0,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.16), inset 0 -3px 0 rgba(0,0,0,0.3), 0 5px 10px rgba(0,0,0,0.55)',
        paddingRight: 8,
        minHeight: 32,
        zIndex: 2,
        borderRadius: 18,
        paddingLeft: 36,
    },

    stageBlock: {
        position: 'absolute',
        top: 15,
        height: 30,
        backgroundColor: 'rgba(20, 20, 20, 0.8)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        paddingHorizontal: 10,
        paddingVertical: 8,
        justifyContent: 'center',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -2px 0 rgba(0,0,0,0.3)',
        borderRadius: 10,
    },
    stageBlockActive: {
        backgroundColor: 'rgba(40, 40, 40, 1)',
        borderColor: 'rgba(255, 255, 255, 0.4)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -2px 0 rgba(0,0,0,0.3)',
    },
    stageBlockDone: {
        backgroundColor: 'rgba(10, 10, 10, 0.6)',
        borderColor: 'rgba(255, 255, 255, 0.05)',
        opacity: 0.6,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -2px 0 rgba(0,0,0,0.3)',
    },
    stageBlockPlanned: {
        backgroundColor: 'rgba(15, 15, 15, 0.8)',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -2px 0 rgba(0,0,0,0.3)',
    },
    stageBlockEditing: {
        // Keep for any future use, but no cyan highlight.
        borderColor: 'rgba(255,255,255,0.18)',
        borderWidth: 1,
        backgroundColor: 'rgba(255,255,255,0.04)',
        zIndex: 1000,
    },
    stageName: {
        fontSize: 12,
        fontWeight: '700',
        color: '#FFFFFF',
        flex: 1,
        marginRight: 8,
    },
    stageStatus: {
        fontSize: 10,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: 0.5,
    },
    stageEndTime: {
        fontSize: 9,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.5)',
        marginTop: 2,
    },
    activeIndicator: {
        position: 'absolute',
        bottom: 10,
        right: 10,
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#4CAF50',
    },
    untimedStagesList: {
        position: 'absolute',
        left: 7, // 10 * 0.7 = 7 (compressed by 30%)
        top: 7, // 10 * 0.7 = 7 (compressed by 30%)
        zIndex: 10,
        overflow: 'hidden', // Prevent overflow
        // Width will be set dynamically based on content
        maxWidth: 196, // 280 * 0.7 = 196 (compressed by 30%)
    },
    untimedStageItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 3.5, // 5 * 0.7 = 3.5 (compressed by 30%)
        borderRadius: 12, // Increased from 4 for modern MD3 look
        backgroundColor: '#FFFFFF',
        minHeight: 23, // 30 * 0.7 = 21 (compressed by 30%)
        paddingHorizontal: 8, // Match timelineStageCard padding
        paddingVertical: 3,
        gap: 5.6, // 8 * 0.7 = 5.6 (compressed by 30%)
        width: '100%', // Take full width of container
        maxWidth: '100%', // Ensure it doesn't exceed container
        overflow: 'hidden', // Prevent content overflow
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 4,
        borderWidth: 0,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -2px 0 rgba(0,0,0,0.18)',
    },
    untimedStageName: {
        fontSize: 9,
        fontWeight: '900',
        color: '#000000',
        flexShrink: 1,
        minWidth: 0, // Allow text to shrink
        letterSpacing: 0.2,
    },
    untimedStageStatus: {
        fontSize: 6.3, // 9 * 0.7 = 6.3 (compressed by 30%)
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: 0.35, // 0.5 * 0.7 = 0.35 (compressed by 30%)
    },
    stageDragHandle: {
        paddingHorizontal: 1.4, // 2 * 0.7 = 1.4 (compressed by 30%)
        paddingVertical: 2.8, // 4 * 0.7 = 2.8 (compressed by 30%)
        opacity: 0.5,
    },
    stageDragArea: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        flexShrink: 1,
    },
    dragOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.05)',
    },
    dragOverlayCard: {
        position: 'absolute',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 6,
        paddingHorizontal: 4.2,
        paddingVertical: 2.8,
        borderRadius: 2.8,
        backgroundColor: '#00E5FF', // Changed from white to cyan for consistency
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.2)',
        minHeight: 23, // Match original card height
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 }, // Reduced for stability
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 6,
    },
    dragOverlayContent: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5.6,
        minWidth: 0,
    },
    stageOrderCircle: {
        width: 18.2, // 26 * 0.7 = 18.2 (compressed by 30%)
        height: 18.2, // 26 * 0.7 = 18.2 (compressed by 30%)
        borderRadius: 9.1, // 13 * 0.7 = 9.1 (compressed by 30%)
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    stageOrderCircleCompleted: {
        backgroundColor: '#4CAF50',
        borderColor: '#4CAF50',
    },
    stageOrderCircleProcess: {
        backgroundColor: 'rgba(255, 183, 77, 0.25)',
        borderColor: '#FFB74D',
    },
    stageOrderCircleUncompleted: {
        backgroundColor: 'rgba(255, 82, 82, 0.25)',
        borderColor: '#FF5252',
    },
    stageOrderCircleUpcoming: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderColor: 'rgba(255,255,255,0.15)',
    },
    stageOrderText: {
        fontSize: 7.7, // 11 * 0.7 = 7.7 (compressed by 30%)
        fontWeight: '700',
        color: 'rgba(255,255,255,0.5)',
    },
    stageOrderTextDragging: {
        color: 'rgba(0,0,0,0.5)',
    },
    stageItemDragging: {
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderRadius: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 12,
        elevation: 8,
    },
    stageItemDragging2D: {
        backgroundColor: '#00E5FF', // Changed from white to cyan for consistency
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 }, // Reduced for stability
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 4, // Reduced from 10
        zIndex: 1000,
    },
    stageCardDragging: {
        backgroundColor: '#00E5FF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 }, // Reduced from 12 for stability
        shadowOpacity: 0.25, // Reduced from 0.5 for stability
        shadowRadius: 8, // Reduced from 16
        elevation: 6, // Reduced from 20 to prevent "lifting" feel
        zIndex: 9999,
        borderColor: '#000000',
        borderWidth: 1,
    },
    stageCardResizeMode: {
        borderColor: '#00E5FF',
        backgroundColor: '#00E5FF',
        borderWidth: 1, // Explicitly match base style
        paddingVertical: 0, // Match fixed-height base style
        // Keep all layout properties exactly the same - only change colors
        height: 32,
        minHeight: 32,
        borderRadius: 18,
    },
    stageTextDragging: {
        color: '#000000',
        fontWeight: '900',
    },
    stageRequestBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        marginLeft: 4,
        paddingHorizontal: 4,
        paddingVertical: 2,
        borderRadius: 4,
        backgroundColor: '#FF9800',
        flexShrink: 0,
    },
    stageDeleteButton: {
        backgroundColor: 'rgba(0,0,0,0.32)',
        opacity: 1,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        width: 22,
        height: 22,
        borderRadius: 11,
    },
    emptyState: {
        height: 100,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyText: {
        fontSize: 12,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.3)',
    },
    // Resize mode styles moved to top level for consistency in previous chunk
    stageTextResizeMode: {
        color: '#000000',
    },
    resizeHandleLeft: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 16,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
    },
    resizeHandleRight: {
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: 16,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
    },
    resizeHandleLine: {
        width: 3,
        height: '70%',
        backgroundColor: '#4CAF50',
        borderRadius: 2,
    },
    resizeDoneButton: {
        marginLeft: 4,
        padding: 3,
        borderRadius: 8,
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    addSubtaskButton: {
        position: 'absolute',
        top: 7,
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#1D2128',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.7,
        shadowRadius: 4,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -2px 0 rgba(0,0,0,0.4), 0 0 0 3px #0B0C0F',
    },
    // Time display styles for subtask cards
    stageTimeDisplay: {
        flexDirection: 'row',
        alignItems: 'center',
        marginLeft: 6,
        gap: 4,
        flexShrink: 0,
    },
    stageTimeText: {
        fontSize: 8,
        fontWeight: '700',
        color: 'rgba(0, 0, 0, 0.5)',
        letterSpacing: 0.2,
    },
    stageDurationText: {
        fontSize: 7,
        fontWeight: '600',
        color: 'rgba(0, 0, 0, 0.35)',
        letterSpacing: 0.1,
    },
    stageTimeTextEditing: {
        color: 'rgba(0, 0, 0, 0.7)',
    },
    // Task column toggle — compact pill on the column edge; left is animated in wrapper
    taskColumnToggleWrapper: {
        position: 'absolute',
        top: '40%',
        zIndex: 5000,
        marginTop: -38,
    },
    taskColumnToggleGrip: {
        width: 10,
        height: 2,
        borderRadius: 1,
        backgroundColor: 'rgba(255,255,255,0.18)',
    },
    taskColumnToggle: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 76,
        gap: 6,
        backgroundColor: '#1D2128',
        borderTopRightRadius: 16,
        borderBottomRightRadius: 16,
        shadowColor: '#000',
        shadowOffset: { width: 4, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 6,
        elevation: 6,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), inset -1px 0 0 rgba(255,255,255,0.05), inset 0 -2px 0 rgba(0,0,0,0.3)',
    },
    dockExitBtn: {
        width: 28,
        height: 28,
        borderRadius: 14,
        marginHorizontal: 4,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        shadowColor: '#000',
        shadowOffset: { width: 28, height: 28 },
        shadowOpacity: 0.7,
        shadowRadius: 4,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -2px 0 rgba(0,0,0,0.4), 0 0 0 3px rgba(0,0,0,0.30)',
    },
    dockExitBtnFloating: {
        position: 'absolute',
        left: 16,
        bottom: 8,
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: '#1D2128',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 6400,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.7,
        shadowRadius: 5,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -2px 0 rgba(0,0,0,0.4), 0 0 0 4px #0B0C0F',
    },
    dockStatusBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 14,
        borderColor: 'rgba(255,255,255,0.12)',
        backgroundColor: '#1D2128',
        borderWidth: 0,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.55,
        shadowRadius: 4,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
    },
    dockStatusBtnText: {
        fontSize: 9,
        fontWeight: '900',
        letterSpacing: 1.5,
        color: 'rgba(255,255,255,0.8)',
    },
    dockEditBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 14,
        borderColor: 'rgba(255,255,255,0.12)',
        backgroundColor: '#1D2128',
        borderWidth: 0,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.55,
        shadowRadius: 4,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
    },
    dockApprovalsBtnContainer: {
        position: 'relative',
        width: 28,
        height: 28,
    },
    dockApprovalsBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 14,
        borderColor: 'rgba(76, 175, 80, 0.3)',
        backgroundColor: '#15301B',
        borderWidth: 0,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.55,
        shadowRadius: 4,
        boxShadow: 'inset 0 1px 0 rgba(123,225,138,0.22)',
    },
    dockApprovalsBtnDisabled: {
        opacity: 0.7,
        backgroundColor: '#1D2128',
        borderColor: 'transparent',
    },
    dockApprovalBadge: {
        position: 'absolute',
        top: -4,
        right: -4,
        backgroundColor: '#4CAF50',
        paddingHorizontal: 4,
        paddingVertical: 1,
        borderRadius: 8,
        minWidth: 16,
        height: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: '#000000',
    },
    dockApprovalBadgeText: {
        color: '#FFFFFF',
        fontSize: 9,
        fontWeight: '900',
    },
    dockDateBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 6,
        paddingVertical: 5,
        borderRadius: 8,
        borderColor: 'rgba(255,255,255,0.12)',
        backgroundColor: 'rgba(255,255,255,0.10)',
        borderWidth: 0,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.55,
        shadowRadius: 4,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -2px 0 rgba(0,0,0,0.4), 0 0 0 2px rgba(0,0,0,0.35)',
    },
    dockDateValue: {
        fontSize: 10,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.9)',
    },
    dockNowBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 10,
        borderColor: 'rgba(255,255,255,0.15)',
        backgroundColor: 'rgba(255,255,255,0.10)',
        borderWidth: 0,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.55,
        shadowRadius: 4,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -2px 0 rgba(0,0,0,0.4), 0 0 0 2px rgba(0,0,0,0.35)',
    },
    dockNowValue: {
        fontSize: 10,
        fontWeight: '900',
        color: '#00E5FF',
    },
    dockCancelBtn: {
        width: 26,
        height: 26,
        borderRadius: 13,
        marginHorizontal: 4,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        shadowColor: '#000',
        shadowOffset: { width: 26, height: 26 },
        shadowOpacity: 0.7,
        shadowRadius: 4,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -2px 0 rgba(0,0,0,0.4), 0 0 0 3px rgba(0,0,0,0.30)',
    },
    // Small calendar popup (same design as AddTaskModal)
    calendarModalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    calendarModalTouchable: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    calendarPopup: {
        width: 252,
        overflow: 'hidden',
        backgroundColor: 'rgba(14,16,20,0.40)',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
        padding: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.55,
        shadowRadius: 18,
        elevation: 12,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.09)',
    },
    /* View mode popup: same small/compact design as StageActionPopup (status change) */
    viewModePopupOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    viewModePopupCompact: {
        position: 'absolute',
        overflow: 'hidden',
        backgroundColor: 'rgba(14,16,20,0.40)',
        borderRadius: 22,
        padding: 6,
        minWidth: 150,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.6,
        shadowRadius: 20,
        elevation: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.09), inset 0 -2px 0 rgba(0,0,0,0.35)',
    },
    viewModePopupOption: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 7,
        gap: 9,
        borderRadius: 16,
    },
    viewModePopupOptionActive: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -2px 0 rgba(0,0,0,0.3)',
    },
    viewModePopupOptionText: {
        fontSize: 12,
        fontWeight: '700',
    },
    viewModePopupSeparator: {
        height: 0,
        marginVertical: 1,
    },
    viewModeIconSocket: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.40)',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8), 0 1px 0 rgba(255,255,255,0.07)',
    },
    viewModeIconDome: {
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.12)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -2px 0 rgba(0,0,0,0.35), 0 2px 3px rgba(0,0,0,0.5)',
    },
    viewModeIconDomeActive: {
        backgroundColor: 'rgba(76,175,80,0.28)',
    },
    viewModeCheckChip: {
        marginLeft: 'auto',
        width: 18,
        height: 18,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#7BE18A',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -2px 0 rgba(0,0,0,0.25), 0 2px 3px rgba(0,0,0,0.55)',
    },
    calTitleCol: {
        alignItems: 'center',
    },
    calMonth: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '800',
    },
    calYear: {
        color: 'rgba(255,255,255,0.45)',
        fontSize: 14,
        fontWeight: '600',
    },
    dayTile: {
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
    },
    todayTile: {
        borderWidth: 1.5,
        borderColor: '#FFB74D',
    },
    selectedTile: {
        backgroundColor: '#7BE18A',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -2px 0 rgba(0,0,0,0.25), 0 2px 4px rgba(0,0,0,0.5)',
    },
    todayPip: {
        position: 'absolute',
        bottom: 3,
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#FFB74D',
    },
    calFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 10,
        gap: 8,
    },
    calSelectedWell: {
        flex: 1,
        paddingVertical: 5,
        paddingHorizontal: 12,
        borderRadius: 14,
        backgroundColor: 'rgba(0,0,0,0.35)',
        boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.8), 0 1px 0 rgba(255,255,255,0.06)',
    },
    calSelectedLabel: {
        fontSize: 6.5,
        fontWeight: '800',
        letterSpacing: 1.6,
        color: 'rgba(255,255,255,0.5)',
    },
    calSelectedValue: {
        fontSize: 12,
        fontWeight: '800',
        color: '#7BE18A',
    },
    calTodayPill: {
        height: 24,
        paddingHorizontal: 9,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,183,77,0.14)',
        borderWidth: 1,
        borderColor: 'rgba(255,183,77,0.4)',
    },
    calTodayBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        height: 36,
        paddingHorizontal: 14,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -2px 0 rgba(0,0,0,0.4), 0 3px 5px rgba(0,0,0,0.5)',
    },
    calTodayText: {
        fontSize: 8,
        fontWeight: '800',
        letterSpacing: 1.4,
        color: '#FFB74D',
    },
    calendarMini: {
        paddingBottom: 4,
    },
    calHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
        paddingLeft: 4,
    },
    calBack: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.6,
        shadowRadius: 4,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -2px 0 rgba(0,0,0,0.4), 0 0 0 3px rgba(0,0,0,0.30)',
    },
    calTitle: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '800',
        letterSpacing: 0.4,
    },
    calNav: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    calNavBtn: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.09)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -1px 0 rgba(0,0,0,0.35)',
    },
    weekRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 2,
    },
    weekText: {
        width: '14.2%',
        textAlign: 'center',
        color: 'rgba(255,255,255,0.4)',
        fontSize: 8.5,
        fontWeight: '700',
    },
    daysGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dayCell: {
        width: '14.28%',
        height: 30,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayCircle: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayText: {
        color: 'rgba(255,255,255,0.85)',
        fontSize: 11,
        fontWeight: '600',
    },
    todayCircle: {
        backgroundColor: 'rgba(255,255,255,0.92)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.6,
        shadowRadius: 3,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -2px 0 rgba(0,0,0,0.18)',
    },
    selectedFutureCircle: {
        backgroundColor: 'rgba(76,175,80,0.22)',
        borderWidth: 1.5,
        borderColor: '#7BE18A',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -2px 0 rgba(0,0,0,0.3)',
    },
    selectedPastCircle: {
        borderWidth: 2,
        borderColor: '#FF5050',
    },
    // Task subtasks popup (tap left task card) — black background, status-colored cards
    taskSubtasksPopup: {
        width: 320,
        maxWidth: '90%',
        maxHeight: '85%',
        borderWidth: 1,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
        flexDirection: 'column',
        backgroundColor: '#121418',
        borderRadius: 26,
        borderColor: 'rgba(255,255,255,0.06)',
        padding: 14,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)',
    },
    taskSubtasksPopupLandscape: {
        width: 520,
        maxWidth: '95%',
    },
    taskSubtasksPopupBodyLandscape: {
        flexDirection: 'row',
        flex: 1,
        minHeight: 220,
        alignItems: 'stretch',
    },
    taskSubtasksPopupLeftPanel: {
        width: 150,
        minWidth: 150,
        paddingRight: 14,
        paddingVertical: 8,
        borderRightWidth: 0,
        borderRadius: 18,
        backgroundColor: '#0B0C0F',
        paddingLeft: 12,
        boxShadow: 'inset 0 3px 8px rgba(0,0,0,0.75), inset 0 -1px 0 rgba(255,255,255,0.05)',
    },
    taskSubtasksPopupLeftPanelContent: {
        gap: 10,
    },
    taskSubtasksPopupRightPanel: {
        flex: 1,
        minWidth: 0,
        paddingLeft: 12,
    },
    taskSubtasksPopupAnalyticsTitle: {
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 1.5,
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 10,
    },
    taskSubtasksPopupHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    taskSubtasksPopupTitle: {
        flex: 1,
        fontSize: 15,
        fontWeight: '700',
        color: '#fff',
        marginRight: 8,
    },
    taskSubtasksPopupClose: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1D2128',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.55,
        shadowRadius: 3,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
    },
    taskSubtasksPopupAnalytics: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 4,
        marginBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
        gap: 4,
    },
    taskSubtasksPopupAnalyticsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    taskSubtasksPopupAnalyticsLabel: {
        fontSize: 8,
        fontWeight: '800',
        letterSpacing: 1,
        color: 'rgba(255,255,255,0.45)',
    },
    taskSubtasksPopupAnalyticsValue: {
        fontSize: 11,
        fontWeight: '800',
        color: '#fff',
    },
    taskSubtasksPopupAnalyticsDivider: {
        width: 1,
        height: 14,
        backgroundColor: 'rgba(255,255,255,0.12)',
    },
    taskSubtasksPopupScroll: {
        flex: 1,
        maxHeight: 360,
    },
    taskSubtasksPopupScrollLandscape: {
        flex: 1,
        maxHeight: 10000,
    },
    taskSubtasksPopupScrollContent: {
        paddingBottom: 12,
    },
    taskSubtasksPopupEmpty: {
        fontSize: 13,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.35)',
        textAlign: 'center',
        paddingVertical: 24,
    },
    taskSubtasksPopupRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderLeftWidth: 3,
        borderColor: 'rgba(255,255,255,0.1)',
        gap: 10,
        minHeight: 44,
        backgroundColor: '#1A1D23',
        borderRadius: 16,
        marginBottom: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 5,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)',
    },
    taskSubtasksPopupStatusCircle: {
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -2px 0 rgba(0,0,0,0.25)',
    },
    taskSubtasksPopupCardContent: {
        flex: 1,
        minWidth: 0,
        justifyContent: 'center',
    },
    taskSubtasksPopupRowText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#fff',
        minWidth: 0,
        marginBottom: 2,
    },
    taskSubtasksPopupTimeRow: {
        fontSize: 10,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: 0.2,
    },
    fullScreenToggleBtn: {
        position: 'absolute',
        top: 50,
        right: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 9,
        height: 38,
        borderRadius: 19,
        borderWidth: 1,
        zIndex: 9999,
        // Elevation/Shadow for premium feel
        shadowColor: '#000',
        elevation: 5,
        backgroundColor: '#14171B',
        borderColor: 'rgba(255,255,255,0.07)',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.6,
        shadowRadius: 8,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
    },
    fullScreenToggleBtnPortrait: {
        width: 38,
        paddingHorizontal: 0,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 0,
    },
    fullScreenToggleBtnText: {
        fontSize: 10,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.55)',
        letterSpacing: 2,
    },
    stageSyncIndicator: {
        marginLeft: 6,
        paddingHorizontal: 4,
        paddingVertical: 2,
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 0.5,
        borderColor: 'rgba(255,255,255,0.1)',
        flexDirection: 'row',
        alignItems: 'center',
    },
    stageSyncIndicatorAll: {
        borderColor: 'rgba(33, 150, 243, 0.3)',
        backgroundColor: 'rgba(33, 150, 243, 0.05)',
    },
    stageSyncIndicatorFuture: {
        borderColor: 'rgba(76, 175, 80, 0.3)',
        backgroundColor: 'rgba(76, 175, 80, 0.05)',
    },
});
