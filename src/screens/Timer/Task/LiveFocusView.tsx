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
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Task, Category, TaskStage, StageStatus, Timer } from '../../../constants/data';
import AddSubtaskModal from '../../../components/AddSubtaskModal';
import ApprovalPopup from './ApprovalPopup';
import StageActionPopup from './StageActionPopup';
import { buildTimeOfDayBackgroundSegments, DEFAULT_TIME_OF_DAY_SLOTS, TimeOfDaySlotConfigList } from '../../../utils/timeOfDaySlots';
import { getLogicalDate, getStartOfLogicalDay, getStartOfLogicalDayFromString, isSameLogicalDay, toDisplayMinutes, DEFAULT_DAILY_START_MINUTES } from '../../../utils/dailyStartTime';

interface LiveFocusViewProps {
    tasks: Task[];
    selectedDate: Date;
    onDateChange: (date: Date) => void;
    categories: Category[];
    onClose: () => void;
    onToggleTask?: (task: Task) => void;
    onExpandTask?: (task: Task) => void;
    onUpdateStageLayout?: (taskId: number, stageId: number, startTimeMinutes: number, durationMinutes: number) => void;
    onUpdateStages?: (task: Task, stages: TaskStage[]) => void;
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
// Labels for the Status button (matches StageActionPopup)
const STAGE_STATUS_LABELS: Record<StageStatus, string> = {
    Upcoming: 'Upcoming',
    Process: 'In Process',
    Done: 'Done',
    Undone: 'Undone',
};

const MONTHS_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTHS_CAL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function LiveFocusView({
    tasks,
    selectedDate,
    onDateChange,
    categories,
    onClose,
    onToggleTask,
    onExpandTask,
    onUpdateStageLayout,
    onUpdateStages,
    timeOfDaySlots,
    dailyStartMinutes = DEFAULT_DAILY_START_MINUTES,
    initialZoom,
    initialScrollX,
    onZoomChange,
    onScrollChange,
    runningTimer,
    onOpenRunningTimer,
}: LiveFocusViewProps) {
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const isLandscape = screenWidth > screenHeight;
    const progressDockHeight = 55; // Fixed ultra-compact height
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
    const horizontalScrollHeaderRef = useRef<ScrollView>(null);
    const horizontalScrollTimelineRef = useRef<ScrollView>(null);
    const timelineScrollXRef = useRef(0);
    const verticalScrollRef = useRef<ScrollView>(null);
    const verticalScrollLabelsRef = useRef<ScrollView>(null);

    // Zoom state (initial from parent for persistence across unmounts)
    const [minutesPerCell, setMinutesPerCell] = useState(initialZoom ?? 60);
    const [lastPinchDistance, setLastPinchDistance] = useState(0);

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
    const commitLayoutChangeRef = useRef<() => void>(() => {});

    // Dynamic height tracking for each task
    const [taskHeights, setTaskHeights] = useState<Map<number, number>>(new Map());
    const stagesHashRef = useRef<string>('');

    // Freeze lane layout during timed-stage drag so other stages don't "jump"
    const frozenLanesRef = useRef<{ taskId: number; lanes: Map<number, number> } | null>(null);

    // Pending layouts: uses REF for synchronous access (avoids React batching issues)
    // This prevents subtasks from snapping back when another subtask is dragged
    const pendingLayoutsRef = useRef<Map<number, { startTimeMinutes: number; durationMinutes: number }>>(new Map());
    // Version counter to trigger re-renders when pending layouts change
    const [pendingLayoutsVersion, setPendingLayoutsVersion] = useState(0);

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
    // 1 = open, 0 = closed; drives smooth width animation and button position
    const taskColumnWidthAnim = useRef(new Animated.Value(1)).current;

    // Auto-scroll during drag/resize
    const autoScrollIntervalRef = useRef<NodeJS.Timeout | null>(null);
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
    const [stageStatusPopupPosition, setStageStatusPopupPosition] = useState({ x: 0, y: 0 });
    const statusButtonRef = useRef<View>(null);

    // Dock calendar: clickable date line (e.g. 21 JAN) opens small calendar to pick date and switch live view
    const [showDockCalendar, setShowDockCalendar] = useState(false);
    const [viewDate, setViewDate] = useState(() => new Date());

    // Simple timer state (counts up from 00:00:00)
    const [timerSeconds, setTimerSeconds] = useState(0);
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
            const duration = Math.round((temp.width / CELL_WIDTH) * mpc);

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

            // Scroll both timeline and header smoothly
            if (horizontalScrollTimelineRef.current) {
                horizontalScrollTimelineRef.current.scrollTo({ x: newScrollX, animated: false });
            }
            if (horizontalScrollHeaderRef.current) {
                horizontalScrollHeaderRef.current.scrollTo({ x: newScrollX, animated: false });
            }

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
    const TRACK_LABEL_WIDTH = 150;
    /** Same as BASE_TOP: space between the last card and the horizontal separator below, so it matches the gap between the top separator and the first card. */
    const TRACK_BOTTOM_PADDING = 7;
    const TIMELINE_WIDTH = TRACK_LABEL_WIDTH + TOTAL_CELLS * CELL_WIDTH + 100;

    // Generate time labels based on zoom level.
    // Display axis 0..1440; label shows wall clock: (displayMinutes + dailyStartMinutes) % 1440.
    const getTimeLabels = () => {
        const labels = [];
        let labelStep = minutesPerCell;
        if (minutesPerCell < 15) labelStep = 15;
        else if (minutesPerCell < 30) labelStep = 30;
        else if (minutesPerCell < 60) labelStep = 60;
        else if (minutesPerCell < 120) labelStep = 120;

        for (let minutes = 0; minutes <= TOTAL_MINUTES; minutes += labelStep) {
            const wallMinutes = (minutes + dailyStartMinutes) % 1440;
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
    }, [lastPinchDistance, minutesPerCell, activeStage, onZoomChange]);

    const handleTouchEnd = useCallback(() => {
        setLastPinchDistance(0);
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
        if (Math.abs(x - timelineScrollXRef.current) <= 2) return;
        timelineScrollXRef.current = x;
        isScrollingHorizontally.current = true;
        horizontalScrollTimelineRef.current?.scrollTo({ x, animated: false });
        horizontalScrollHeaderRef.current?.scrollTo({ x, animated: false });
        requestAnimationFrame(() => {
            isScrollingHorizontally.current = false;
        });
    }, [initialScrollX]);

    // Cleanup auto-scroll on unmount
    useEffect(() => {
        return () => {
            stopAutoScroll();
            currentAutoScrollOffsetRef.current = 0;
            dragStartScrollXRef.current = 0;
            currentAutoScrollDirectionRef.current = null;
            currentAutoScrollSpeedRef.current = 1;
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
            onMoveShouldSetPanResponder: (evt, gestureState) => {
                // If already dragging or resizing, always capture to prevent scroll interference
                if (isDraggingRef.current || isResizingRef.current) return true;

                // Require minimum movement to avoid accidental drags
                // Allow both horizontal and vertical movement for 2D drag
                const shouldCapture = Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3;

                // If we're about to drag, disable scrolling immediately
                if (shouldCapture && activeStageRef.current) {
                    // Scroll will be disabled via scrollEnabled={!activeStage} prop
                }

                return shouldCapture;
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
                    const newLeft = Math.max(0, initial.left + adjustedDx);

                    const CARD_HEIGHT = 21;
                    const LANE_SPACING = 10;
                    const BASE_TOP = 7;
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
                        const newWidth = Math.max(30, initial.width + adjustedDx);

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

    // NOTE: Removed the cleanup effect for pendingLayoutsRef
    // Pending layouts now persist for the lifetime of the component
    // This prevents any race conditions where A1 reverts when A2 is edited

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

    // Track if we're programmatically scrolling to prevent infinite loops
    const isScrollingVertically = useRef(false);
    const isScrollingHorizontally = useRef(false);
    const lastHorizontalScrollTime = useRef(0);

    // Sync vertical scrolling from timeline to labels – smooth, bidirectional
    const handleVerticalScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (isScrollingVertically.current) return;
        const offsetY = event.nativeEvent.contentOffset.y;
        if (verticalScrollLabelsRef.current) {
            isScrollingVertically.current = true;
            verticalScrollLabelsRef.current.scrollTo({ y: offsetY, animated: false });
            setTimeout(() => { isScrollingVertically.current = false; }, 50);
        }
    }, []);

    // Sync vertical scrolling from labels to timeline – smooth, bidirectional
    const handleVerticalScrollLabels = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (isScrollingVertically.current) return;
        const offsetY = event.nativeEvent.contentOffset.y;
        if (verticalScrollRef.current) {
            isScrollingVertically.current = true;
            verticalScrollRef.current.scrollTo({ y: offsetY, animated: false });
            setTimeout(() => { isScrollingVertically.current = false; }, 50);
        }
    }, []);

    // Sync horizontal scrolling between header and timeline - optimized to reduce flickering
    // onScrollChange is only called for user-initiated scrolls; programmatic sync (from the
    // other ScrollView) returns early via isScrollingHorizontally and does not call onScrollChange.
    const handleHorizontalScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (isScrollingHorizontally.current) return;

        const now = Date.now();
        // Throttle to ~60fps for smoother performance
        if (now - lastHorizontalScrollTime.current < 16) return;
        lastHorizontalScrollTime.current = now;

        const offsetX = event.nativeEvent.contentOffset.x;
        timelineScrollXRef.current = offsetX;
        onScrollChange?.(offsetX);

        if (horizontalScrollHeaderRef.current) {
            isScrollingHorizontally.current = true;
            horizontalScrollHeaderRef.current.scrollTo({ x: offsetX, animated: false });
            // Reset flag immediately using requestAnimationFrame for next frame
            requestAnimationFrame(() => {
                isScrollingHorizontally.current = false;
            });
        }
    }, [onScrollChange]);

    const handleHorizontalScrollHeader = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (isScrollingHorizontally.current) return;

        const now = Date.now();
        // Throttle to ~60fps for smoother performance
        if (now - lastHorizontalScrollTime.current < 16) return;
        lastHorizontalScrollTime.current = now;

        const offsetX = event.nativeEvent.contentOffset.x;
        timelineScrollXRef.current = offsetX;
        onScrollChange?.(offsetX);

        if (horizontalScrollTimelineRef.current) {
            isScrollingHorizontally.current = true;
            horizontalScrollTimelineRef.current.scrollTo({ x: offsetX, animated: false });
            // Reset flag immediately using requestAnimationFrame for next frame
            requestAnimationFrame(() => {
                isScrollingHorizontally.current = false;
            });
        }
    }, [onScrollChange]);

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

    // Ref callbacks: apply initialScrollX (from parent) when ScrollView mounts
    const setTimelineScrollRef = useCallback((ref: ScrollView | null) => {
        horizontalScrollTimelineRef.current = ref;
        if (ref) {
            const x = initialScrollX ?? 0;
            timelineScrollXRef.current = x;
            ref.scrollTo({ x, animated: false });
        }
    }, [initialScrollX]);

    const setHeaderScrollRef = useCallback((ref: ScrollView | null) => {
        horizontalScrollHeaderRef.current = ref;
        if (ref) {
            const x = initialScrollX ?? 0;
            timelineScrollXRef.current = x;
            ref.scrollTo({ x, animated: false });
        }
    }, [initialScrollX]);

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
    }, [dailyStartMinutes]);

    // Stage position based on zoom level (relative to timeline start, not including label width)
    const getStageLayout = (stage: TaskStage, stageIndex: number, lane?: number): { left: number; width: number; top: number } => {
        // Constants for lane calculation
        const CARD_HEIGHT = 21; // minHeight from timelineStageCard
        const LANE_SPACING = 10; // 4px gap between consecutive subtasks (lanes)
        const BASE_TOP = 7; // Original top position

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
            return { left: pendingLeft, width: Math.max(pendingWidth, 60), top };
        }

        // Default values: startTime = 0 (00:00), duration = 180 minutes (3 hours)
        const startTime = stage.startTimeMinutes ?? 0;
        const duration = stage.durationMinutes ?? 180;
        const displayStart = (startTime - dailyStartMinutes + 1440) % 1440;
        const left = (displayStart / minutesPerCell) * CELL_WIDTH;
        const width = (duration / minutesPerCell) * CELL_WIDTH;

        return { left, width: Math.max(width, 60), top };
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

    // Date line for dock: "21 JAN"
    const formatDateLabel = (d: Date) => `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;

    // Calendar helpers (small popup, same design as AddTaskModal)
    const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();
    const changeMonth = (delta: number) => {
        setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

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

        return (
            <View style={styles.calendarMini}>
                <View style={styles.calHeader}>
                    <TouchableOpacity onPress={() => { setShowDockCalendar(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} style={styles.calBack}>
                        <MaterialIcons name="arrow-back" size={20} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.calTitle}>{MONTHS_CAL[viewDate.getMonth()]} {viewDate.getFullYear()}</Text>
                    <View style={styles.calNav}>
                        <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.calNavBtn}>
                            <MaterialIcons name="chevron-left" size={20} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => changeMonth(1)} style={styles.calNavBtn}>
                            <MaterialIcons name="chevron-right" size={20} color="#fff" />
                        </TouchableOpacity>
                    </View>
                </View>
                <View style={styles.weekRow}>
                    {weekDays.map((d, i) => <Text key={i} style={styles.weekText}>{d}</Text>)}
                </View>
                <View style={styles.daysGrid}>
                    {daysArray.map((item, i) => {
                        // Use calendar YYYY-MM-DD for the tapped day (avoid midnight rollback: getLogicalDate(00:00) would yield previous day when dailyStart > 0)
                        const cellLogical = item.current
                            ? `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}-${String(item.day).padStart(2, '0')}`
                            : '';
                        const isSelected = item.current && cellLogical === getLogicalDate(selectedDate, dailyStartMinutes);
                        const isToday = item.current && cellLogical === todayLogical;

                        return (
                            <TouchableOpacity
                                key={i}
                                style={styles.dayCell}
                                disabled={!item.current}
                                onPress={() => {
                                    if (item.current && cellLogical) {
                                        onDateChange(getStartOfLogicalDayFromString(cellLogical, dailyStartMinutes));
                                        setShowDockCalendar(false);
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                    }
                                }}
                            >
                                <View style={[
                                    styles.dayCircle,
                                    !item.current && { opacity: 0.2 },
                                    isToday && styles.todayCircle,
                                    isSelected && styles.selectedFutureCircle,
                                ]}>
                                    <Text style={[
                                        styles.dayText,
                                        isToday && { color: '#000' },
                                        isSelected && { color: '#4CAF50', fontWeight: '800' },
                                    ]}>{item.day}</Text>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>
        );
    };

    const TIMELINE_ONLY_WIDTH = TOTAL_CELLS * CELL_WIDTH + 100; // Width without label column

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
        horizontalScrollHeaderRef.current?.scrollTo({ x: scrollX, animated: true });
        requestAnimationFrame(() => {
            isScrollingHorizontally.current = false;
        });
    }, [screenWidth, isTaskColumnVisible, minutesPerCell, onScrollChange, selectedDate, dailyStartMinutes]);

    // When selectedDate changes, update scroll position: scroll to NOW if viewing today, otherwise scroll to start
    useEffect(() => {
        const now = new Date();
        const timelineVisibleWidth = screenWidth - (isTaskColumnVisible ? TRACK_LABEL_WIDTH : 0);
        const timelineOnlyWidth = TOTAL_CELLS * CELL_WIDTH + 100; // Recalculate since it depends on minutesPerCell
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
        if (horizontalScrollHeaderRef.current) {
            horizontalScrollHeaderRef.current.scrollTo({ x: scrollX, animated: true });
        }
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
                const CARD_HEIGHT = 21;
                const LANE_SPACING = 10; // 4px gap between consecutive subtasks
                const BASE_TOP = 7;
                const timedStagesHeight = maxLane >= 0
                    ? BASE_TOP + ((maxLane + 1) * (CARD_HEIGHT + LANE_SPACING)) - LANE_SPACING + TRACK_BOTTOM_PADDING
                    : 0;

                const trackHeight = Math.max(TRACK_HEIGHT, untimedListHeight, timedStagesHeight);
                totalHeight += trackHeight + 1 + TRACK_BOTTOM_PADDING; // +1 separator, +marginBottom so scroll height matches
            }
        });
        return totalHeight + 30; // +30 for extra padding at bottom
    }, [tasks, taskHeights, calculateStageLanes]);

    const contentHeight = calculateContentHeight();
    // Keep timeline background full-screen when 0 or 1 task (min height = viewport)
    const minScrollHeight = Math.max(contentHeight, screenHeight - 100);

    // Handler to update task height when measured
    const handleTaskHeightMeasured = useCallback((taskId: number, height: number) => {
        setTaskHeights(prev => {
            const newMap = new Map(prev);
            // Always update to ensure dynamic adjustment for infinite lanes
            // Reduced threshold to 0.5px for more accurate updates, especially with many lanes
            const currentHeight = prev.get(taskId);
            if (currentHeight === undefined || Math.abs(currentHeight - height) > 0.5) {
                newMap.set(taskId, height);
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

    const handleUpdateStageStatus = useCallback((taskId: number, stageId: number, status: StageStatus) => {
        if (!onUpdateStages) return;
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        const updatedStages = (task.stages || []).map(s =>
            s.id === stageId ? { ...s, status } : s
        );
        onUpdateStages(task, updatedStages);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, [tasks, onUpdateStages]);

    const handleDeleteStage = useCallback((taskId: number, stageId: number) => {
        if (!onUpdateStages) return;
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        Alert.alert(
            'Delete Stage',
            'Are you sure you want to delete this stage?',
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
    }, [tasks, onUpdateStages]);

    // 6-to-6 day as one: use toDisplayMinutes so 23:55→00:25 and "now" 01:30 compare correctly across midnight.
    const getApprovalCount = useCallback(() => {
        const currentMinutes = currentTimeRef.current.getHours() * 60 + currentTimeRef.current.getMinutes();
        const nowD = toDisplayMinutes(currentMinutes, dailyStartMinutes);
        let count = 0;

        tasks.forEach(task => {
            task.stages?.forEach(stage => {
                const startTime = stage.startTimeMinutes ?? 0;
                const duration = stage.durationMinutes ?? 0;
                const endTime = startTime + duration;

                const startD = toDisplayMinutes(startTime, dailyStartMinutes);
                const endD = toDisplayMinutes(endTime >= 1440 ? endTime - 1440 : endTime, dailyStartMinutes);

                const needsFinishApproval = stage.status === 'Process' && endD <= nowD;
                const needsStartApproval = stage.status === 'Upcoming' && startD <= nowD;

                if (needsFinishApproval || needsStartApproval) {
                    count++;
                }
            });
        });
        return count;
    }, [tasks, dailyStartMinutes]);

    const approvalCount = getApprovalCount();

    // Same 6-to-6 display comparison as getApprovalCount/ApprovalPopup.
    const stageNeedsApproval = useCallback((stage: TaskStage): 'START' | 'FINISH' | null => {
        const currentMinutes = currentTimeRef.current.getHours() * 60 + currentTimeRef.current.getMinutes();
        const nowD = toDisplayMinutes(currentMinutes, dailyStartMinutes);
        const startTime = stage.startTimeMinutes ?? 0;
        const duration = stage.durationMinutes ?? 0;
        const endTime = startTime + duration;
        const startD = toDisplayMinutes(startTime, dailyStartMinutes);
        const endD = toDisplayMinutes(endTime >= 1440 ? endTime - 1440 : endTime, dailyStartMinutes);
        if (stage.status === 'Process' && endD <= nowD) return 'FINISH';
        if (stage.status === 'Upcoming' && startD <= nowD) return 'START';
        return null;
    }, [dailyStartMinutes]);

    return (
        <View style={styles.container}>

            {/* Main Container: Fixed Labels + Scrollable Timeline. When progress dock is open, reserve bottom space so nothing is hidden. */}
            <View style={[styles.mainContainer, isProgressExpanded && { paddingBottom: progressDockHeight }]}>
                {/* Toggle Button for Task Column — smooth pill on the column edge */}
                <Animated.View
                    style={[
                        styles.taskColumnToggleWrapper,
                        {
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
                        <MaterialIcons
                            name={isTaskColumnVisible ? 'chevron-left' : 'chevron-right'}
                            size={16}
                            color="rgba(255,255,255,0.9)"
                        />
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
                        {/* Task list heading: TASKS + count badge (aligns with timeline time-axis header) */}
                        <View style={[styles.stickyHeaderFixed, styles.taskListHeader, { width: TRACK_LABEL_WIDTH, height: 25 }]}>
                            <Text style={styles.taskListHeaderTitle}>TASKS</Text>
                            <View style={styles.taskListHeaderBadge}>
                                <Text style={styles.taskListHeaderBadgeText}>{tasks.length}</Text>
                            </View>
                        </View>

                        {/* Vertical Scroll for Labels (synced with timeline) */}
                        <ScrollView
                            ref={verticalScrollLabelsRef}
                            style={styles.verticalScrollLabels}
                            contentContainerStyle={{
                                minHeight: minScrollHeight,
                                paddingBottom: 20,
                            }}
                            showsVerticalScrollIndicator={false}
                            scrollEnabled={!activeStage}
                            onScroll={handleVerticalScrollLabels}
                            scrollEventThrottle={8}
                            bounces={true}
                            bouncesZoom={false}
                            alwaysBounceVertical={true}
                            removeClippedSubviews={false}
                            overScrollMode="never"
                        >
                            <View>
                                {tasks.map((task, taskIndex) => {
                                    const stages = task.stages || [];
                                    const liveStatus = getTaskLiveStatus(task);
                                    const isActive = liveStatus === 'ACTIVE';
                                    const category = categories.find(c => c.id === task.categoryId);

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
                                    const CARD_HEIGHT = 21;
                                    const LANE_SPACING = 10; // 4px gap between consecutive subtasks
                                    const BASE_TOP = 7;
                                    const timedStagesHeight = maxLane >= 0
                                        ? BASE_TOP + ((maxLane + 1) * (CARD_HEIGHT + LANE_SPACING)) - LANE_SPACING + TRACK_BOTTOM_PADDING
                                        : 0;

                                    const computedHeight = Math.max(TRACK_HEIGHT, untimedListHeight, timedStagesHeight);
                                    const trackHeight = Math.max(measuredHeight, computedHeight);

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
                                                style={[styles.trackLabelContainer, { height: trackHeight, marginBottom: TRACK_BOTTOM_PADDING }]}
                                                onLayout={handleLabelLayout}
                                            >
                                                <TouchableOpacity
                                                    activeOpacity={1}
                                                    onPress={() => {}}
                                                    style={[
                                                        styles.trackLabel,
                                                        { width: TRACK_LABEL_WIDTH, borderLeftWidth: 3, borderLeftColor: category?.color || 'rgba(255,255,255,0.12)' },
                                                        isActive && styles.trackLabelActive,
                                                    ]}
                                                >
                                                    <View style={styles.trackLabelInner}>
                                                        {/* Category pill: icon + name */}
                                                        <View style={[styles.categoryPill, { borderLeftColor: category?.color || 'rgba(255,255,255,0.2)' }]}>
                                                            {category && (
                                                                <MaterialIcons name={category.icon as any} size={9} color={category.color} style={styles.categoryPillIcon} />
                                                            )}
                                                            <Text style={[styles.categoryPillText, { color: category ? category.color : 'rgba(255,255,255,0.5)' }]} numberOfLines={1}>
                                                                {category ? category.name.toUpperCase() : 'GENERAL'}
                                                            </Text>
                                                        </View>

                                                        {/* Task title + active indicator + add button */}
                                                        <View style={styles.titleRow}>
                                                            <Text style={[styles.trackTitle, isActive && styles.trackTitleActive]} numberOfLines={1}>
                                                                {task.title}
                                                            </Text>
                                                            <View style={styles.titleRowRight}>
                                                                {isActive && <View style={styles.activeDot} />}
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
                                                                <View style={styles.progressBarWrap}>
                                                                    <View style={styles.progressBarTrack}>
                                                                        {total > 0 ? (
                                                                            <>
                                                                                <View style={[styles.progressBarSegment, styles.progressBarDone, { flex: doneCount / den }]} />
                                                                                <View style={[styles.progressBarSegment, styles.progressBarUndone, { flex: undoneCount / den }]} />
                                                                                <View style={[styles.progressBarSegment, styles.progressBarPending, { flex: pendingCount / den }]} />
                                                                            </>
                                                                        ) : (
                                                                            <View style={[styles.progressBarSegment, styles.progressBarPending, { flex: 1 }]} />
                                                                        )}
                                                                    </View>
                                                                    <Text style={styles.progressBarLabel}>{doneCount}/{total}</Text>
                                                                </View>
                                                            );
                                                        })()}
                                                    </View>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    );
                                })}
                                {tasks.length > 0 && <View style={styles.trackSeparator} />}
                                {tasks.length === 0 && (
                                    <View style={[styles.emptyState, { width: TRACK_LABEL_WIDTH }]}>
                                        <Text style={styles.emptyText}>No tracks</Text>
                                    </View>
                                )}
                            </View>
                        </ScrollView>
                </Animated.View>

                {/* Scrollable Timeline Section (subtask cards). Same height as task column when dock is open. */}
                <View style={[styles.timelineSection, styles.mainColumnWhenDockOpen]}>
                    {/* Sticky Time Axis Header */}
                    <View style={styles.stickyHeaderContainer}>
                        <ScrollView
                            ref={setHeaderScrollRef}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            scrollEnabled={!activeStage && !isDragging}
                            contentContainerStyle={{ width: TIMELINE_ONLY_WIDTH }}
                            onScroll={handleHorizontalScrollHeader}
                            scrollEventThrottle={16}
                            bounces={true}
                            alwaysBounceHorizontal={true}
                            decelerationRate="normal"
                            removeClippedSubviews={Platform.OS === 'android'}
                            nestedScrollEnabled={false}
                            overScrollMode="never"
                        >
                            <View style={[styles.timelineContent, { width: TIMELINE_ONLY_WIDTH, height: 25 }]}>
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

                                {/* NOW Line Dot (Top portion) — only when selected date is the current logical day (today) */}
                                {isSameLogicalDay(selectedDate, new Date(), dailyStartMinutes) && (
                                    <View style={[styles.nowLineSticky, { left: getNowPosition() }]}>
                                        <View style={styles.nowDot} />
                                    </View>
                                )}
                            </View>
                        </ScrollView>
                    </View>

                    {/* Vertical Scroll for Timeline Tracks */}
                    <ScrollView
                        ref={verticalScrollRef}
                        style={styles.verticalScroll}
                        contentContainerStyle={{
                            minHeight: minScrollHeight,
                            paddingBottom: 20,
                        }}
                        showsVerticalScrollIndicator={true}
                        scrollEnabled={!activeStage}
                        onScroll={handleVerticalScroll}
                        scrollEventThrottle={8}
                        bounces={true}
                        bouncesZoom={false}
                        alwaysBounceVertical={true}
                        removeClippedSubviews={false}
                        overScrollMode="never"
                    >
                        <View
                            onTouchMove={handleTouchMove}
                            onTouchEnd={handleTouchEnd}
                            style={{ flex: 1, minHeight: minScrollHeight }}
                        >
                            <ScrollView
                                horizontal
                                ref={setTimelineScrollRef}
                                showsHorizontalScrollIndicator={true}
                                scrollEnabled={!activeStage && !isDragging}
                                directionalLockEnabled={true}
                                contentContainerStyle={{ width: TIMELINE_ONLY_WIDTH, minHeight: minScrollHeight }}
                                nestedScrollEnabled={true}
                                onScroll={handleHorizontalScroll}
                                scrollEventThrottle={16}
                                bounces={true}
                                alwaysBounceHorizontal={true}
                                decelerationRate="normal"
                                removeClippedSubviews={Platform.OS === 'android'}
                                style={{ flex: 1 }}
                                overScrollMode="never"
                            >
                                <View style={[styles.timelineContent, { width: TIMELINE_ONLY_WIDTH, minHeight: minScrollHeight }]}>
                                    {/* Time-of-day background layer (behind grid lines & cards) */}
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

                                    {/* Vertical Lines (Grid) */}
                                    {getTimeLabels().map((label, i) => (
                                        <View key={i} style={[styles.hourLineOnly, { left: label.left }]}>
                                            <View style={styles.hourLineExtend} />
                                        </View>
                                    ))}

                                    {/* NOW Line - Vertical segment — only when selected date is the current logical day (today) */}
                                    {isSameLogicalDay(selectedDate, new Date(), dailyStartMinutes) && (
                                        <View style={[styles.nowLine, { left: getNowPosition() }]} />
                                    )}

                                    {/* Tracks Container */}
                                    <View style={styles.tracksContainer}>
                                        {tasks.length === 0 && (
                                            <View style={styles.timelineEmptyState}>
                                                <Text style={styles.timelineEmptyText}>No tasks for this day</Text>
                                            </View>
                                        )}
                                        {tasks.map((task, taskIndex) => {
                                            const stages = task.stages || [];
                                            const liveStatus = getTaskLiveStatus(task);
                                            const isActive = liveStatus === 'ACTIVE';

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
                                            const CARD_HEIGHT = 21;
                                            const LANE_SPACING = 10; // 4px gap between consecutive subtasks
                                            const BASE_TOP = 7;
                                            // Calculate height for all lanes: base + (number of lanes * (card height + spacing)) - last spacing + bottom padding (matches top)
                                            const timedStagesHeight = maxLane >= 0
                                                ? BASE_TOP + ((maxLane + 1) * (CARD_HEIGHT + LANE_SPACING)) - LANE_SPACING + TRACK_BOTTOM_PADDING
                                                : 0;

                                            // Dynamic track height: ALWAYS allow growth when new lanes appear
                                            const trackHeight = Math.max(measuredHeight ?? 0, TRACK_HEIGHT, untimedListHeight, timedStagesHeight);

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
                                                <View key={task.id} style={isTrackActive ? { zIndex: 10000, elevation: 10000 } : undefined}>
                                                    <View style={styles.trackSeparator} />
                                                    <TouchableOpacity
                                                        activeOpacity={1}
                                                        onPress={() => {
                                                            // Exit resize mode when tapping on track background
                                                            if (resizeModeStage) {
                                                                setResizeModeStage(null);
                                                            }
                                                        }}
                                                        style={[
                                                            styles.track,
                                                            { height: trackHeight, marginBottom: TRACK_BOTTOM_PADDING },
                                                            isTrackActive && { overflow: 'visible' as const },
                                                        ]}
                                                        onLayout={handleTrackLayout}
                                                    >
                                                        {/* Untimed Subtasks List (on the left) - Draggable */}
                                                        {sortedUntimedStages.length > 0 && (
                                                            <UntimedStagesDraggableList
                                                                task={task}
                                                                stages={sortedUntimedStages}
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
                                                                        Alert.alert(
                                                                            'Delete Stage',
                                                                            `Are you sure you want to delete "${stage.text}"?`,
                                                                            [
                                                                                { text: 'Cancel', style: 'cancel' },
                                                                                {
                                                                                    text: 'Delete',
                                                                                    style: 'destructive',
                                                                                    onPress: () => {
                                                                                        // Delete the stage
                                                                                        const updatedStages = (task.stages || []).filter(s => s.id !== stageId);
                                                                                        onUpdateStages(task, updatedStages);
                                                                                        // Force height recalculation after deletion
                                                                                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                                                                        // Clear measured height to force recalculation on next render
                                                                                        setTimeout(() => {
                                                                                            setTaskHeights(prev => {
                                                                                                const newMap = new Map(prev);
                                                                                                newMap.delete(task.id);
                                                                                                return newMap;
                                                                                            });
                                                                                        }, 150);
                                                                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                                                                    }
                                                                                }
                                                                            ]
                                                                        );
                                                                    }
                                                                }}
                                                            />
                                                        )}

                                                        {/* Timed Subtasks (on the timeline) */}
                                                        {(() => {
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
                                                                                // Universal card design (same as untimed cards) for timeline too
                                                                                styles.timelineStageCard,
                                                                                { backgroundColor: STAGE_STATUS_CONFIG[stage.status || 'Upcoming'].color },
                                                                                isBeingEdited && styles.stageCardDragging,
                                                                                isInResizeMode && styles.stageCardResizeMode,
                                                                                { left, width, top }, // Apply position/size last to ensure it overrides any style changes
                                                                            ]}
                                                                            {...stagePanResponder.panHandlers}
                                                                        >
                                                                            {/* Left Resize Handle - simple vertical line */}
                                                                            {isInResizeMode && (
                                                                                <TouchableOpacity
                                                                                    style={styles.resizeHandleLeft}
                                                                                    onPressIn={() => {
                                                                                        // Clear any previous drag state if switching to a different stage
                                                                                        if (activeStage && (activeStage.taskId !== task.id || activeStage.stageId !== stage.id)) {
                                                                                            clearEditingState();
                                                                                        }
                                                                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                                                        // Reset scroll tracking for smooth resize during auto-scroll
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

                                                                            {/* Main content area */}
                                                                            <TouchableOpacity
                                                                                onPress={() => {
                                                                                    // Tap to enter resize mode (if not already in it)
                                                                                    if (!isInResizeMode && !isDragging && !isResizing) {
                                                                                        // Clear any previous editing state if switching to a different stage
                                                                                        const isDifferentStage =
                                                                                            (activeStage && (activeStage.taskId !== task.id || activeStage.stageId !== stage.id)) ||
                                                                                            (resizeModeStage && (resizeModeStage.taskId !== task.id || resizeModeStage.stageId !== stage.id));
                                                                                        if (isDifferentStage) {
                                                                                            clearEditingState();
                                                                                        }
                                                                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                                                        setResizeModeStage({ taskId: task.id, stageId: stage.id });
                                                                                    } else if ((isInResizeMode || isDragging || isResizing)) {
                                                                                        // If already in resize mode for this stage, do nothing (captures touch to prevent background dismissal)
                                                                                        const isDifferentStage =
                                                                                            (activeStage && (activeStage.taskId !== task.id || activeStage.stageId !== stage.id)) ||
                                                                                            (resizeModeStage && (resizeModeStage.taskId !== task.id || resizeModeStage.stageId !== stage.id));

                                                                                        if (isDifferentStage) {
                                                                                            clearEditingState();
                                                                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                                                            setResizeModeStage({ taskId: task.id, stageId: stage.id });
                                                                                        }
                                                                                        // If same stage, we do nothing - but we CAPTURE the touch
                                                                                    }
                                                                                }}
                                                                                onLongPress={() => {
                                                                                    // Long-press to move - only if not in resize mode
                                                                                    if (isInResizeMode) return;

                                                                                    // Clear any previous editing state if switching to a different stage
                                                                                    const isDifferentStage =
                                                                                        (activeStage && (activeStage.taskId !== task.id || activeStage.stageId !== stage.id)) ||
                                                                                        (resizeModeStage && (resizeModeStage.taskId !== task.id || resizeModeStage.stageId !== stage.id));
                                                                                    if (isDifferentStage) {
                                                                                        clearEditingState();
                                                                                    }

                                                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

                                                                                    // Reset scroll tracking for smooth drag during auto-scroll
                                                                                    resetScrollTracking();

                                                                                    // Freeze lanes for this task at drag start so other stages stay put.
                                                                                    frozenLanesRef.current = {
                                                                                        taskId: task.id,
                                                                                        lanes: calculateStageLanes(sortedTimedStages),
                                                                                    };
                                                                                    debugLog('freeze-lanes', {
                                                                                        taskId: task.id,
                                                                                        stageId: stage.id,
                                                                                        maxLane: Math.max(
                                                                                            ...Array.from(frozenLanesRef.current.lanes.values()),
                                                                                            0
                                                                                        ),
                                                                                    });

                                                                                    // Set active stage FIRST to disable scrolling immediately
                                                                                    setActiveStage({ taskId: task.id, stageId: stage.id });
                                                                                    setIsDragging(true);
                                                                                    // Store initial layout including lane information for 2D drag
                                                                                    setInitialStageLayout({ left, width, top, lane });
                                                                                    setTempStageLayout({ left, width, top, lane });
                                                                                }}
                                                                                delayLongPress={300}
                                                                                activeOpacity={0.8}
                                                                                style={[
                                                                                    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start' }
                                                                                ]}
                                                                            >
                                                                                {/* Stage Name */}
                                                                                <Text style={[
                                                                                    styles.untimedStageName,
                                                                                    { flexShrink: 1, color: '#FFFFFF' }, // White text for status backgrounds
                                                                                    isBeingEdited && styles.stageTextDragging,
                                                                                    isInResizeMode && styles.stageTextResizeMode
                                                                                ]} numberOfLines={1} ellipsizeMode="tail">
                                                                                    {stage.text}
                                                                                </Text>
                                                                                {/* Time Display: Start Time & Duration */}
                                                                                {(() => {
                                                                                    const { startTimeMinutes, durationMinutes } = effectiveTime;
                                                                                    const startTimeStr = formatTimeCompact(startTimeMinutes);
                                                                                    const durationStr = formatDurationCompact(durationMinutes);
                                                                                    return (
                                                                                        <View style={styles.stageTimeDisplay}>
                                                                                            <Text style={[
                                                                                                styles.stageTimeText,
                                                                                                { color: 'rgba(255, 255, 255, 0.8)' },
                                                                                                isBeingEdited && styles.stageTimeTextEditing,
                                                                                                isInResizeMode && styles.stageTimeTextEditing
                                                                                            ]}>
                                                                                                {startTimeStr}
                                                                                            </Text>
                                                                                            <Text style={[
                                                                                                styles.stageDurationText,
                                                                                                { color: 'rgba(255, 255, 255, 0.6)' },
                                                                                                isBeingEdited && styles.stageTimeTextEditing,
                                                                                                isInResizeMode && styles.stageTimeTextEditing
                                                                                            ]}>
                                                                                                {durationStr}
                                                                                            </Text>
                                                                                        </View>
                                                                                    );
                                                                                })()}
                                                                                {/* REQUEST badge when stage is in the approval/notification list */}
                                                                                {stageNeedsApproval(stage) != null && (
                                                                                    <View style={styles.stageRequestBadge}>
                                                                                        <MaterialIcons name="notification-important" size={10} color="#FFFFFF" />
                                                                                        {/* <Text style={styles.stageRequestBadgeText}>REQUEST</Text> */}
                                                                                    </View>
                                                                                )}
                                                                            </TouchableOpacity>

                                                                            {/* Right Resize Handle - simple vertical line */}
                                                                            {isInResizeMode && (
                                                                                <TouchableOpacity
                                                                                    style={styles.resizeHandleRight}
                                                                                    onPressIn={() => {
                                                                                        // Clear any previous drag state if switching to a different stage
                                                                                        if (activeStage && (activeStage.taskId !== task.id || activeStage.stageId !== stage.id)) {
                                                                                            clearEditingState();
                                                                                        }
                                                                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                                                        // Reset scroll tracking for smooth resize during auto-scroll
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

                                                                            {/* Delete button - visible only when NOT in resize mode */}
                                                                            {!isInResizeMode && (
                                                                                <TouchableOpacity
                                                                                    style={styles.stageDeleteButton}
                                                                                    onPress={() => {
                                                                                        if (!onUpdateStages) return;
                                                                                        Alert.alert(
                                                                                            'Delete Stage',
                                                                                            `Are you sure you want to delete "${stage.text}"?`,
                                                                                            [
                                                                                                { text: 'Cancel', style: 'cancel' },
                                                                                                {
                                                                                                    text: 'Delete',
                                                                                                    style: 'destructive',
                                                                                                    onPress: () => {
                                                                                                        const updatedStages = (task.stages || []).filter(s => s.id !== stage.id);
                                                                                                        onUpdateStages(task, updatedStages);
                                                                                                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                                                                                    },
                                                                                                },
                                                                                            ]
                                                                                        );
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
                                                                    <MaterialIcons name="add" size={18} color="#808080" />
                                                                </TouchableOpacity>
                                                            );
                                                        })()}

                                                    </TouchableOpacity>
                                                </View>
                                            );
                                        })}
                                    </View>
                                </View>
                            </ScrollView>
                        </View>
                    </ScrollView>
                </View>
            </View >

            {/* Bottom progress dock (slides in/out) */}
            <Animated.View
                pointerEvents={isProgressExpanded ? 'auto' : 'none'}
                style={[
                    styles.bottomProgressDock,
                    { height: progressDockHeight, maxHeight: progressDockHeight },
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
                <View style={styles.bottomDockBar}>
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

                    <View style={styles.bottomDockRow}>
                        {/* Exit button */}
                        <TouchableOpacity
                            style={styles.dockExitBtn}
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                onClose();
                            }}
                        >
                            <MaterialIcons name="arrow-back" size={18} color="rgb(0, 0, 0)" />
                        </TouchableOpacity>

                        <View style={styles.bottomDockDivider} />

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
                            // Default: show general time summary
                            return (
                                <View style={styles.bottomDockTimeSummary}>
                                    <Text numberOfLines={1} style={styles.bottomDockTimeSummaryTop}>
                                        <Text style={styles.bottomDockTimeSummaryLabel}>TOTAL </Text>
                                        <Text style={styles.bottomDockTimeSummaryValue}>
                                            {formatDurationCompact(progressSummary.totalMinutes)}
                                        </Text>
                                        <Text style={styles.bottomDockTimeSummaryMeta}>
                                            {' '}
                                            · {progressSummary.completed}/{progressSummary.totalStages}
                                        </Text>
                                    </Text>
                                    <Text numberOfLines={1} style={styles.bottomDockTimeSummaryBottom}>
                                        <Text style={styles.bottomDockTimeSummaryK}>DONE </Text>
                                        <Text style={[styles.bottomDockTimeSummaryV, { color: '#4CAF50' }]}>
                                            {formatDurationCompact(progressSummary.doneMinutes)}
                                        </Text>
                                        <Text style={styles.bottomDockTimeSummarySep}>  ·  </Text>
                                        <Text style={styles.bottomDockTimeSummaryK}>UNDONE </Text>
                                        <Text style={[styles.bottomDockTimeSummaryV, { color: '#FF5252' }]}>
                                            {formatDurationCompact(progressSummary.undoneMinutes)}
                                        </Text>
                                        <Text style={styles.bottomDockTimeSummarySep}>  ·  </Text>
                                        <Text style={styles.bottomDockTimeSummaryK}>PENDING </Text>
                                        <Text style={styles.bottomDockTimeSummaryV}>
                                            {formatDurationCompact(progressSummary.pendingMinutes)}
                                        </Text>
                                    </Text>
                                </View>
                            );
                        })()}

                        {/* Running timer from TimerList: name above, time below; tap opens Timer view (portrait running timer) */}
                        <View style={styles.bottomDockDivider} />
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
                                    <Text style={styles.liveRunningTimerName} numberOfLines={1}>{runningTimer.title}</Text>
                                    <Text style={styles.liveRunningTimerValue}>{runningTimer.time}</Text>
                                </>
                            ) : (
                                <Text style={styles.liveRunningTimerInactive}>Not active timer</Text>
                            )}
                        </TouchableOpacity>
                        <View style={styles.bottomDockDivider} />

                        <View style={styles.bottomDockSpacer} />

                        {/* Timer controls (always visible, on right side) */}
                        <View style={styles.bottomDockTimerSection}>
                            <View style={styles.bottomDockTimerDisplay}>
                                <Text style={styles.bottomDockTimerLabel}>TIMER</Text>
                                <Text style={styles.bottomDockTimerValue}>
                                    {formatTimer(timerSeconds)}
                                </Text>
                            </View>
                            <View style={styles.bottomDockTimerControls}>
                                <TouchableOpacity
                                    style={styles.dockTimerBtn}
                                    onPress={() => {
                                        setIsTimerRunning(!isTimerRunning);
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                    }}
                                    activeOpacity={0.7}
                                >
                                    <MaterialIcons 
                                        name={isTimerRunning ? 'pause' : 'play-arrow'} 
                                        size={16} 
                                        color="#FFFFFF" 
                                    />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.dockTimerBtn}
                                    onPress={() => {
                                        setIsTimerRunning(false);
                                        setTimerSeconds(0);
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                    }}
                                    activeOpacity={0.7}
                                >
                                    <MaterialIcons name="refresh" size={16} color="#FFFFFF" />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Horizontal divider */}
                        <View style={styles.bottomDockDivider} />

                        {/* Date line (e.g. 21 JAN): clickable, opens calendar to pick date and switch live view */}
                        <TouchableOpacity
                            style={styles.dockDateBtn}
                            onPress={() => {
                                setViewDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
                                setShowDockCalendar(true);
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }}
                            activeOpacity={0.7}
                        >
                            <MaterialIcons name="calendar-today" size={12} color="rgba(255,255,255,0.7)" />
                            <Text style={styles.dockDateValue}>{formatDateLabel(selectedDate)}</Text>
                        </TouchableOpacity>

                        <View style={styles.bottomDockDivider} />

                        {/* Now: scroll to center NOW line; shows current time HH:MM:SS */}
                        <TouchableOpacity
                            style={styles.dockNowBtn}
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                scrollToNow();
                            }}
                            activeOpacity={0.7}
                        >
                            <MaterialIcons name="schedule" size={14} color="rgba(255,255,255,0.7)" />
                            <Text style={styles.dockNowValue}>{nowHHMMSS || '--:--:--'}</Text>
                        </TouchableOpacity>

                        <View style={styles.bottomDockDivider} />

                        {/* Notifications: one list (To START + To FINISH), one count, one popup */}
                        <View style={styles.dockApprovalsBtnContainer}>
                            <TouchableOpacity
                                style={[styles.dockApprovalsBtn, approvalCount === 0 && styles.dockApprovalsBtnDisabled]}
                                onPress={approvalCount > 0 ? () => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                    setApprovalPopupVisible(true);
                                } : undefined}
                                disabled={approvalCount === 0}
                                activeOpacity={0.7}
                            >
                                <MaterialIcons
                                    name="notification-important"
                                    size={14}
                                    color={approvalCount > 0 ? '#FFFFFF' : 'rgba(255,255,255,0.4)'}
                                />
                            </TouchableOpacity>
                            {approvalCount > 0 && (
                                <View style={styles.dockApprovalBadge}>
                                    <Text style={styles.dockApprovalBadgeText}>{approvalCount}</Text>
                                </View>
                            )}
                        </View>

                        {/* Vertical divider */}
                        <View style={styles.bottomDockDivider} />

                        <TouchableOpacity
                            style={styles.dockCancelBtn}
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                setIsProgressExpanded(false);
                            }}
                        >
                            <MaterialIcons name="close" size={20} color="rgb(1, 1, 1)" />
                        </TouchableOpacity>
                    </View>
                </View>
            </Animated.View>

            {/* Bottom open button (visible when dock is collapsed) */}
            {
                !isProgressExpanded && (
                    <View style={styles.bottomOpenProgressBtn}>
                        <TouchableOpacity
                            style={styles.bottomOpenPill}
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                setIsProgressExpanded(true);
                            }}
                            activeOpacity={0.85}
                        >
                            <Text style={styles.bottomOpenPillLabel}>PROGRESS</Text>
                            <Text style={styles.bottomOpenPillValue}>{progressSummary.pct}%</Text>
                        </TouchableOpacity>
                    </View>
                )
            }

            {/* Back button (visible when progress bar is hidden) */}
            {
                !isProgressExpanded && (
                    <TouchableOpacity
                        style={styles.dockExitBtnFloating}
                        onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            onClose();
                        }}
                        activeOpacity={0.7}
                    >
                        <MaterialIcons name="arrow-back" size={18} color="rgb(3, 3, 3)" />
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
                timeOfDaySlots={timeOfDaySlots}
                onClose={() => setAddSubtaskModal({ visible: false, taskId: null, startTimeMinutes: 0, mode: 'add' })}
                onAdd={(taskId, text, startTime, duration) => {
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

                    const updatedStages = [...(task.stages || []), newStage];
                    onUpdateStages(task, updatedStages);

                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    setAddSubtaskModal({ visible: false, taskId: null, startTimeMinutes: 0, mode: 'add' });
                }}
                onUpdate={(taskId, stageId, text, startTime, duration) => {
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
                    onUpdateStages(task, updatedStages);

                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    setAddSubtaskModal({ visible: false, taskId: null, startTimeMinutes: 0, mode: 'add' });
                    // Exit resize mode after update
                    setResizeModeStage(null);
                }}
            />

            <ApprovalPopup
                visible={approvalPopupVisible}
                onClose={() => setApprovalPopupVisible(false)}
                tasks={tasks}
                categories={categories}
                dailyStartMinutes={dailyStartMinutes}
                currentMinutes={currentTimeRef.current.getHours() * 60 + currentTimeRef.current.getMinutes()}
                onUpdateStageStatus={handleUpdateStageStatus}
                onDeleteStage={handleDeleteStage}
                onApproveAll={handleApproveAll}
            />

            <StageActionPopup
                visible={stageStatusPopupVisible}
                position={stageStatusPopupPosition}
                onSelectStatus={(status) => {
                    if (resizeModeStage) {
                        handleUpdateStageStatus(resizeModeStage.taskId, resizeModeStage.stageId, status);
                    }
                    setStageStatusPopupVisible(false);
                }}
                onClose={() => setStageStatusPopupVisible(false)}
                currentStatus={(() => {
                    if (!resizeModeStage) return 'Upcoming';
                    const t = tasks.find(t_ => t_.id === resizeModeStage.taskId);
                    const s = t?.stages?.find(s_ => s_.id === resizeModeStage.stageId);
                    return (s?.status ?? 'Upcoming') as StageStatus;
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
                        {renderDockCalendar()}
                    </View>
                </View>
            </Modal>

        </View >
    );
}

// Untimed Stages Draggable List Component
interface UntimedStagesDraggableListProps {
    task: Task;
    stages: TaskStage[];
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
    task,
    stages,
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

    const renderItem = useCallback((item: TaskStage) => {
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
                        Alert.alert(
                            'Delete Stage',
                            `Are you sure you want to delete "${item.text}"?`,
                            [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                    text: 'Delete',
                                    style: 'destructive',
                                    onPress: () => onDeleteStage(item.id)
                                }
                            ]
                        );
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
                    {stages.map((stage) => renderItem(stage))}
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
        backgroundColor: '#000000',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(76, 175, 80, 0.35)',
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
    bottomProgressDock: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 55,
        maxHeight: 55,
        backgroundColor: 'rgba(0,0,0,0.98)',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.14)',
        overflow: 'hidden',
        zIndex: 6500,
    },
    bottomDockBar: {
        flex: 1,
    },
    bottomDockProgressTrack: {
        height: 3,
        backgroundColor: 'rgba(255,255,255,0.06)',
        marginBottom: 2,
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
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.06)',
        flexDirection: 'row',
        overflow: 'hidden',
    },
    bottomDockTimeBarSeg: {
        height: '100%',
    },
    bottomDockRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 19,
        paddingVertical: 8,
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
        width: 1,
        height: 24,
        backgroundColor: 'rgba(255,255,255,0.10)',
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
        gap: 2,
        minWidth: 0,
        maxWidth: 200,
    },
    liveRunningTimerName: {
        fontSize: 11,
        fontWeight: '800',
        color: '#FFFFFF',
        minWidth: 0,
    },
    liveRunningTimerValue: {
        fontSize: 10,
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
        gap: 4,
    },
    bottomDockTimerLabel: {
        fontSize: 8,
        fontWeight: '900',
        letterSpacing: 2,
        color: 'rgba(255,255,255,0.35)',
    },
    bottomDockTimerValue: {
        fontSize: 11,
        fontWeight: '900',
        color: '#FFB74D',
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
        backgroundColor: 'rgba(255,255,255,0.12)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
        alignItems: 'center',
        justifyContent: 'center',
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
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 18,
        backgroundColor: 'rgba(0,0,0,0.85)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    bottomOpenPillLabel: {
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 2,
        color: 'rgba(255,255,255,0.55)',
    },
    bottomOpenPillValue: {
        fontSize: 12,
        fontWeight: '900',
        color: '#fff',
    },
    mainContainer: {
        flex: 1,
        flexDirection: 'row',
    },
    fixedLabelsColumn: {
        width: 150, // TRACK_LABEL_WIDTH
        backgroundColor: '#0C0C0C',
        zIndex: 100,
        borderRightWidth: 1,
        borderRightColor: 'rgba(255,255,255,0.06)',
        overflow: 'hidden',
    },
    /** So task column and timeline get the same height and collapse equally when progress dock is open. */
    mainColumnWhenDockOpen: {
        alignSelf: 'stretch',
    },
    timelineSection: {
        flex: 1,
        flexDirection: 'column',
    },
    stickyHeaderFixed: {
        backgroundColor: '#0C0C0C',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(76, 175, 80, 0.3)', // Semi-transparent green
    },
    taskListHeader: {
        flexDirection: 'row',
        paddingLeft: 55,
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 10,
    },
    taskListHeaderTitle: {
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 1.5,
        color: 'rgba(255,255,255,0.6)',
    },
    taskListHeaderBadge: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 8,
        minWidth: 20,
        alignItems: 'center',
    },
    taskListHeaderBadgeText: {
        fontSize: 9,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.7)',
    },
    stickyHeaderContainer: {
        height: 25,
        backgroundColor: '#000000',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(76, 175, 80, 0.3)', // Semi-transparent green
        zIndex: 1000,
    },
    verticalScrollLabels: {
        flex: 1,
        backgroundColor: '#0C0C0C',
        // Ensure smooth scrolling
        overflow: 'hidden',
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
        borderBottomColor: 'rgba(76, 175, 80, 0.3)',
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
        backgroundColor: '#000000',
        // Ensure smooth scrolling
        overflow: 'hidden',
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
        fontWeight: '600',
        color: 'rgba(255,255,255,0.5)',
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
        width: 2,
        backgroundColor: '#4CAF50',
        zIndex: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    hourLineOnly: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        alignItems: 'center',
    },
    hourLineExtend: {
        width: 1,
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.15)',
        minHeight: 1000,
    },
    hourLine: {
        position: 'absolute',
        bottom: 0,
        width: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
        height: 2000,
    },
    nowLine: {
        position: 'absolute',
        bottom: 0,
        width: 2,
        backgroundColor: '#4CAF50',
        zIndex: 100,
        height: 2000,
    },
    nowDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#4CAF50',
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
        backgroundColor: 'rgba(76, 175, 80, 0.4)', // Slightly more visible green
        marginLeft: 0,
        marginRight: 0,
    },
    track: {
        flexDirection: 'row',
        alignItems: 'flex-start', // Align to top for proper containment
        position: 'relative',
        overflow: 'hidden', // Prevent overflow outside track
    },
    trackLabel: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'stretch',
        paddingRight: 8,
        backgroundColor: '#0C0C0C',
        height: '100%',
    },
    trackLabelActive: {
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
    },
    trackLabelInner: {
        flex: 1,
        paddingVertical: 8,
        paddingHorizontal: 8,
        justifyContent: 'flex-start',
        minWidth: 0,
    },
    categoryPill: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingVertical: 2,
        paddingHorizontal: 6,
        paddingLeft: 6,
        borderLeftWidth: 2,
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.06)',
        marginBottom: 4,
        maxWidth: '100%',
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
        height: 4,
        borderRadius: 2,
        flexDirection: 'row',
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.08)',
        minWidth: 0,
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
        color: 'rgba(255,255,255,0.5)',
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
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        alignItems: 'center',
        justifyContent: 'center',
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
    // Universal card design for timed stages on timeline
    timelineStageCard: {
        position: 'absolute',
        top: 7, // align with untimed list top padding (7)
        borderRadius: 8,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.15)',
        minHeight: 21,
        paddingHorizontal: 6,
        paddingVertical: 3,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 5.6,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    stageBlock: {
        position: 'absolute',
        top: 15,
        height: 30,
        borderRadius: 6,
        backgroundColor: 'rgba(20, 20, 20, 0.8)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        paddingHorizontal: 10,
        paddingVertical: 8,
        justifyContent: 'center',
    },
    stageBlockActive: {
        backgroundColor: 'rgba(40, 40, 40, 1)',
        borderColor: 'rgba(255, 255, 255, 0.4)',
    },
    stageBlockDone: {
        backgroundColor: 'rgba(10, 10, 10, 0.6)',
        borderColor: 'rgba(255, 255, 255, 0.05)',
        opacity: 0.6,
    },
    stageBlockPlanned: {
        backgroundColor: 'rgba(15, 15, 15, 0.8)',
        borderColor: 'rgba(255, 255, 255, 0.1)',
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
        borderRadius: 4, // Slightly more rounded for premium look
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.15)',
        minHeight: 21, // 30 * 0.7 = 21 (compressed by 30%)
        paddingHorizontal: 6, // Slightly more padding
        paddingVertical: 3,
        gap: 5.6, // 8 * 0.7 = 5.6 (compressed by 30%)
        width: '100%', // Take full width of container
        maxWidth: '100%', // Ensure it doesn't exceed container
        overflow: 'hidden', // Prevent content overflow
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
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
        minHeight: 21, // Match original card height
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
        borderRadius: 8, // Explicitly match base style
        paddingHorizontal: 6, // Explicitly match base style
        paddingVertical: 3, // Explicitly match base style
        minHeight: 21, // Explicitly match base style
        // Keep all layout properties exactly the same - only change colors
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
        padding: 2.8, // 4 * 0.7 = 2.8 (compressed by 30%)
        opacity: 0.6,
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
        backgroundColor: '#1E1E1E',
        borderWidth: 1,
        borderColor: '#2F2F2F',
        alignItems: 'center',
        justifyContent: 'center',
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
        marginTop: -40,
        zIndex: 5000,
    },
    taskColumnToggle: {
        width: 19,
        height: 200,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderLeftWidth: 0,
        borderColor: 'rgba(255,255,255,0.12)',
        borderTopRightRadius: 8,
        borderBottomRightRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 1, height: 0 },
        shadowOpacity: 0.12,
        shadowRadius: 2,
        elevation: 4,
    },
    dockExitBtn: {
        paddingHorizontal: 5,
        paddingVertical: 5,
        borderRadius: 20,
        backgroundColor: 'rgb(255, 255, 255)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.12)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    dockExitBtnFloating: {
        position: 'absolute',
        left: 19,
        bottom: 8,
        paddingHorizontal: 5,
        paddingVertical: 5,
        borderRadius: 20,
        backgroundColor: 'rgb(254, 254, 254)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 6400,
    },
    dockStatusBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
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
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
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
        backgroundColor: 'rgba(76, 175, 80, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(76, 175, 80, 0.3)',
    },
    dockApprovalsBtnDisabled: {
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderColor: 'rgba(255,255,255,0.1)',
        opacity: 0.7,
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
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
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
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    dockNowValue: {
        fontSize: 10,
        fontWeight: '900',
        color: '#00E5FF',
    },
    dockCancelBtn: {
        paddingHorizontal: 5,
        paddingVertical: 5,
        borderRadius: 20,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.12)',
        alignItems: 'center',
        justifyContent: 'center',
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
        width: 280,
        backgroundColor: 'rgba(20,20,20,0.98)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        padding: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    calendarMini: {
        paddingBottom: 4,
    },
    calHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    calBack: {
        padding: 4,
    },
    calTitle: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
    },
    calNav: {
        flexDirection: 'row',
        gap: 10,
    },
    calNavBtn: {
        padding: 4,
    },
    weekRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    weekText: {
        width: '14.2%',
        textAlign: 'center',
        color: 'rgba(255,255,255,0.4)',
        fontSize: 10,
        fontWeight: '600',
    },
    daysGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dayCell: {
        width: '14.28%',
        height: 28,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 2,
    },
    dayCircle: {
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayText: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 10,
        fontWeight: '500',
    },
    todayCircle: {
        backgroundColor: '#fff',
    },
    selectedFutureCircle: {
        borderWidth: 2,
        borderColor: '#4CAF50',
    },
    selectedPastCircle: {
        borderWidth: 2,
        borderColor: '#FF5050',
    },
});
