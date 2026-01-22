import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
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
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Task, Category, TaskStage, StageStatus } from '../../../constants/data';

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
}

type TaskLiveStatus = 'ACTIVE' | 'DONE' | 'PLANNED';

const getTaskLiveStatus = (task: Task): TaskLiveStatus => {
    if (task.status === 'Completed') return 'DONE';
    if (task.status === 'In Progress') return 'ACTIVE';
    return 'PLANNED';
};

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
}: LiveFocusViewProps) {
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const isLandscape = screenWidth > screenHeight;
    const [currentTime, setCurrentTime] = useState(new Date());
    const DEBUG_LANES = false;
    // Refs to avoid stale state inside PanResponder
    const minutesPerCellRef = useRef(60);
    const isDraggingRef = useRef(false);
    const isResizingRef = useRef(false);
    const activeStageRef = useRef<{ taskId: number; stageId: number } | null>(null);
    const initialStageLayoutRef = useRef<{ left: number; width: number; top: number; lane: number } | null>(null);
    const tempStageLayoutRef = useRef<{ left: number; width: number; top: number; lane: number } | null>(null);
    const lastPinchDistanceRef = useRef(0);
    const horizontalScrollHeaderRef = useRef<ScrollView>(null);
    const horizontalScrollTimelineRef = useRef<ScrollView>(null);
    const timelineScrollXRef = useRef(0);
    const verticalScrollRef = useRef<ScrollView>(null);
    const verticalScrollLabelsRef = useRef<ScrollView>(null);

    // Zoom state
    const [minutesPerCell, setMinutesPerCell] = useState(60); // Default to 60 minutes (1 hour)
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

    // Dynamic height tracking for each task
    const [taskHeights, setTaskHeights] = useState<Map<number, number>>(new Map());
    const stagesHashRef = useRef<string>('');

    // Freeze lane layout during timed-stage drag so other stages don't "jump"
    const frozenLanesRef = useRef<{ taskId: number; lanes: Map<number, number> } | null>(null);

    const debugLog = useCallback((...args: any[]) => {
        if (!DEBUG_LANES) return;
        // eslint-disable-next-line no-console
        console.log('[LiveFocusView]', ...args);
    }, [DEBUG_LANES]);


    // Calculate timeline based on zoom level
    const CELL_WIDTH = 80; // Fixed width per cell
    const START_HOUR = 0;
    const END_HOUR = 24;
    const TOTAL_MINUTES = (END_HOUR - START_HOUR) * 60;
    const TOTAL_CELLS = Math.ceil(TOTAL_MINUTES / minutesPerCell);
    const TRACK_HEIGHT = 80; // Reduced for compact design
    const TRACK_LABEL_WIDTH = 150;
    const TIMELINE_WIDTH = TRACK_LABEL_WIDTH + TOTAL_CELLS * CELL_WIDTH + 100;

    // Generate time labels based on zoom level
    const getTimeLabels = () => {
        const labels = [];
        // Determine label frequency based on zoom to prevent overlap
        let labelStep = minutesPerCell;
        if (minutesPerCell < 15) labelStep = 15;
        else if (minutesPerCell < 30) labelStep = 30;
        else if (minutesPerCell < 60) labelStep = 60;
        else if (minutesPerCell < 120) labelStep = 120;

        for (let minutes = 0; minutes <= TOTAL_MINUTES; minutes += labelStep) {
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            labels.push({
                text: `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`,
                left: (minutes / minutesPerCell) * CELL_WIDTH, // No TRACK_LABEL_WIDTH offset for timeline-only labels
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
                setMinutesPerCell(Math.max(5, Math.min(240, newMinutesPerCell)));
            }
            setLastPinchDistance(distance);
        }
    }, [lastPinchDistance, minutesPerCell, activeStage]);

    const handleTouchEnd = useCallback(() => {
        setLastPinchDistance(0);
    }, []);

    // Keep refs in sync
    useEffect(() => { minutesPerCellRef.current = minutesPerCell; }, [minutesPerCell]);
    useEffect(() => { isDraggingRef.current = isDragging; }, [isDragging]);
    useEffect(() => { isResizingRef.current = isResizing; }, [isResizing]);
    useEffect(() => { activeStageRef.current = activeStage; }, [activeStage]);
    useEffect(() => { initialStageLayoutRef.current = initialStageLayout; }, [initialStageLayout]);
    useEffect(() => { tempStageLayoutRef.current = tempStageLayout; }, [tempStageLayout]);
    useEffect(() => { lastPinchDistanceRef.current = lastPinchDistance; }, [lastPinchDistance]);
    useEffect(() => { resizeModeStageRef.current = resizeModeStage; }, [resizeModeStage]);

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

                // Handle MOVE (long-press drag)
                if (isDraggingRef.current && !isResizingRef.current && a && initial) {
                    const dx = gestureState.dx;
                    const dy = gestureState.dy;

                    const newLeft = Math.max(0, initial.left + dx);

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

                    if (handleSide === 'right') {
                        const newWidth = Math.max(30, initial.width + dx);

                        // Haptic feedback for resizing precision
                        if (temp && Math.abs(temp.width - newWidth) >= pixelsPer5Min) {
                            Haptics.selectionAsync();
                        }

                        if (!temp || Math.abs(temp.width - newWidth) > 0.3) {
                            setTempStageLayout({
                                left: initial.left,
                                width: newWidth,
                                top: initial.top,
                                lane: initial.lane
                            });
                        }
                    } else if (handleSide === 'left') {
                        const originalEnd = initial.left + initial.width;
                        const newLeft = Math.max(0, initial.left + dx);
                        const newWidth = Math.max(30, originalEnd - newLeft);

                        if (temp && Math.abs(temp.left - newLeft) >= pixelsPer5Min) {
                            Haptics.selectionAsync();
                        }

                        if (!temp || Math.abs(temp.left - newLeft) > 0.3) {
                            if (newLeft + newWidth >= originalEnd - 20) {
                                setTempStageLayout({
                                    left: Math.min(newLeft, originalEnd - 30),
                                    width: Math.max(30, originalEnd - Math.min(newLeft, originalEnd - 30)),
                                    top: initial.top,
                                    lane: initial.lane
                                });
                            } else {
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
                const a = activeStageRef.current;
                const temp = tempStageLayoutRef.current;
                const mpc = minutesPerCellRef.current;

                if (a && temp && onUpdateStageLayout) {
                    const startTime = (temp.left / CELL_WIDTH) * mpc;
                    const duration = (temp.width / CELL_WIDTH) * mpc;
                    onUpdateStageLayout(a.taskId, a.stageId, startTime, duration);
                    debugLog('stage-release', {
                        taskId: a.taskId,
                        stageId: a.stageId,
                        startTimeMinutes: Math.round(startTime),
                        durationMinutes: Math.round(duration),
                        lane: temp.lane,
                        wasResizing: isResizingRef.current,
                    });

                    // Clear measured height to force recalculation with new lane positions
                    setTimeout(() => {
                        setTaskHeights(prev => {
                            const newMap = new Map(prev);
                            newMap.delete(a.taskId);
                            return newMap;
                        });
                    }, 100);
                }

                // Clean up all state
                frozenLanesRef.current = null;
                resizeHandleSideRef.current = null;
                setActiveStage(null);
                setIsDragging(false);
                setIsResizing(false);
                setInitialStageLayout(null);
                setTempStageLayout(null);
                setLastPinchDistance(0);
                // Keep resize mode open - user must explicitly exit
            },
            onPanResponderTerminate: () => {
                frozenLanesRef.current = null;
                resizeHandleSideRef.current = null;
                setActiveStage(null);
                setIsDragging(false);
                setIsResizing(false);
                setInitialStageLayout(null);
                setTempStageLayout(null);
                setLastPinchDistance(0);
            },
        })
    ).current;

    // Update current time every minute
    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(interval);
    }, []);

    // Set default startTimeMinutes (00:00) and durationMinutes (3 hours) for stages that don't have them
    useEffect(() => {
        if (!onUpdateStages) return;

        tasks.forEach(task => {
            if (!task.stages || task.stages.length === 0) return;

            const needsUpdate = task.stages.some(s =>
                (s.startTimeMinutes === undefined || s.startTimeMinutes === null) ||
                (s.durationMinutes === undefined || s.durationMinutes === null)
            );

            if (needsUpdate) {
                const updatedStages = task.stages.map(s => ({
                    ...s,
                    startTimeMinutes: s.startTimeMinutes ?? 0, // Default: 00:00
                    durationMinutes: s.durationMinutes ?? 180, // Default: 3 hours
                }));
                onUpdateStages(task, updatedStages);
            }
        });
    }, [tasks, onUpdateStages]);

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
    const lastVerticalScrollTime = useRef(0);
    const lastHorizontalScrollTime = useRef(0);

    // Sync vertical scrolling from timeline to labels - optimized for smooth scrolling
    const handleVerticalScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (isScrollingVertically.current) return;

        const now = Date.now();
        // Throttle to ~60fps for smoother performance
        if (now - lastVerticalScrollTime.current < 16) return;
        lastVerticalScrollTime.current = now;

        const offsetY = event.nativeEvent.contentOffset.y;

        if (verticalScrollLabelsRef.current) {
            isScrollingVertically.current = true;
            verticalScrollLabelsRef.current.scrollTo({ y: offsetY, animated: false });
            // Reset flag immediately using requestAnimationFrame for next frame
            requestAnimationFrame(() => {
                isScrollingVertically.current = false;
            });
        }
    }, []);

    // Sync vertical scrolling from labels to timeline - bidirectional sync
    const handleVerticalScrollLabels = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (isScrollingVertically.current) return;

        const now = Date.now();
        // Throttle to ~60fps for smoother performance
        if (now - lastVerticalScrollTime.current < 16) return;
        lastVerticalScrollTime.current = now;

        const offsetY = event.nativeEvent.contentOffset.y;

        if (verticalScrollRef.current) {
            isScrollingVertically.current = true;
            verticalScrollRef.current.scrollTo({ y: offsetY, animated: false });
            // Reset flag immediately using requestAnimationFrame for next frame
            requestAnimationFrame(() => {
                isScrollingVertically.current = false;
            });
        }
    }, []);

    // Sync horizontal scrolling between header and timeline - optimized to reduce flickering
    const handleHorizontalScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (isScrollingHorizontally.current) return;

        const now = Date.now();
        // Throttle to ~60fps for smoother performance
        if (now - lastHorizontalScrollTime.current < 16) return;
        lastHorizontalScrollTime.current = now;

        const offsetX = event.nativeEvent.contentOffset.x;
        timelineScrollXRef.current = offsetX;

        if (horizontalScrollHeaderRef.current) {
            isScrollingHorizontally.current = true;
            horizontalScrollHeaderRef.current.scrollTo({ x: offsetX, animated: false });
            // Reset flag immediately using requestAnimationFrame for next frame
            requestAnimationFrame(() => {
                isScrollingHorizontally.current = false;
            });
        }
    }, []);

    const handleHorizontalScrollHeader = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (isScrollingHorizontally.current) return;

        const now = Date.now();
        // Throttle to ~60fps for smoother performance
        if (now - lastHorizontalScrollTime.current < 16) return;
        lastHorizontalScrollTime.current = now;

        const offsetX = event.nativeEvent.contentOffset.x;
        timelineScrollXRef.current = offsetX;

        if (horizontalScrollTimelineRef.current) {
            isScrollingHorizontally.current = true;
            horizontalScrollTimelineRef.current.scrollTo({ x: offsetX, animated: false });
            // Reset flag immediately using requestAnimationFrame for next frame
            requestAnimationFrame(() => {
                isScrollingHorizontally.current = false;
            });
        }
    }, []);

    // NOW position (relative to timeline, not including label width)
    const getNowPosition = () => {
        const totalMinutesNow = currentTime.getHours() * 60 + currentTime.getMinutes();
        if (totalMinutesNow < START_HOUR * 60) return 0;
        if (totalMinutesNow > END_HOUR * 60) return TOTAL_CELLS * CELL_WIDTH;
        return (totalMinutesNow / minutesPerCell) * CELL_WIDTH;
    };

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

    // Calculate lane assignment using the "previous-only" rule (matches the table example):
    // - Sort by start time ascending.
    // - For each stage, compare ONLY with the immediately previous stage in this sorted order.
    // - Overlap check is: current.start < previous.end
    // - If overlap: current goes one line BELOW previous (prevLane + 1)
    // - If no overlap: current stays on the SAME line as previous (prevLane)
    // This guarantees:
    // - D aligns with C if D.start >= C.end
    // - E goes below D if E.start < D.end
    // - No stage ever "jumps upward" to an unrelated earlier line
    // - Layout grows only when overlap exists (with the previous stage)
    const calculateStageLanes = useCallback((stages: TaskStage[]): Map<number, number> => {
        if (stages.length === 0) return new Map();

        const laneMap = new Map<number, number>(); // stageId -> lane number

        // Sort by start time asc, tie-breaker id asc (stable)
        const sortedStages = [...stages].sort((a, b) => {
            const startA = a.startTimeMinutes ?? 0;
            const startB = b.startTimeMinutes ?? 0;
            if (startA !== startB) return startA - startB;
            return a.id - b.id;
        });

        // First stage always starts at lane 0
        let prevLane = 0;
        let prevEnd = (sortedStages[0].startTimeMinutes ?? 0) + (sortedStages[0].durationMinutes ?? 180);
        laneMap.set(sortedStages[0].id, 0);

        for (let i = 1; i < sortedStages.length; i++) {
            const cur = sortedStages[i];
            const curStart = cur.startTimeMinutes ?? 0;
            const curDuration = cur.durationMinutes ?? 180;
            const curEnd = curStart + curDuration;

            const overlapsPrev = curStart < prevEnd;
            const curLane = overlapsPrev ? prevLane + 1 : prevLane;

            laneMap.set(cur.id, curLane);

            // Advance "previous" pointer for next comparison (previous-only rule)
            prevLane = curLane;
            prevEnd = curEnd;
        }

        return laneMap;
    }, []);

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

        // Default values: startTime = 0 (00:00), duration = 180 minutes (3 hours)
        const startTime = stage.startTimeMinutes ?? 0;
        const duration = stage.durationMinutes ?? 180; // Default: 3 hours

        const left = (startTime / minutesPerCell) * CELL_WIDTH; // No TRACK_LABEL_WIDTH offset
        const width = (duration / minutesPerCell) * CELL_WIDTH;

        return { left, width: Math.max(width, 60), top }; // Minimum width of 60
    };

    const formatTimeRange = (startMinutes: number, endMinutes: number) => {
        const startHour = Math.floor(startMinutes / 60);
        const startMin = Math.floor(startMinutes % 60);
        const endHour = Math.floor(endMinutes / 60);
        const endMin = Math.floor(endMinutes % 60);
        return `${String(startHour % 24).padStart(2, '0')}:${String(startMin).padStart(2, '0')} - ${String(endHour % 24).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
    };

    const TIMELINE_ONLY_WIDTH = TOTAL_CELLS * CELL_WIDTH + 100; // Width without label column

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
                    ? BASE_TOP + ((maxLane + 1) * (CARD_HEIGHT + LANE_SPACING)) - LANE_SPACING + 7 // +7 for bottom padding
                    : 0;

                const trackHeight = Math.max(TRACK_HEIGHT, untimedListHeight, timedStagesHeight);
                totalHeight += trackHeight + 1; // +1 for separator
            }
        });
        return totalHeight + 30; // +30 for extra padding at bottom
    }, [tasks, taskHeights, calculateStageLanes]);

    const contentHeight = calculateContentHeight();

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

    return (
        <View style={styles.container}>
            <TouchableOpacity style={styles.closeBtnOverlay} onPress={onClose}>
                <MaterialIcons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>

            {/* Main Container: Fixed Labels + Scrollable Timeline */}
            <View style={styles.mainContainer}>
                {/* Fixed Left Column - Task Labels */}
                <View style={styles.fixedLabelsColumn}>
                    {/* Sticky Time Axis Header (empty space for alignment) */}
                    <View style={[styles.stickyHeaderFixed, { width: TRACK_LABEL_WIDTH, height: 25 }]} />

                    {/* Vertical Scroll for Labels (synced with timeline) */}
                    <ScrollView
                        ref={verticalScrollLabelsRef}
                        style={styles.verticalScrollLabels}
                        contentContainerStyle={{ minHeight: contentHeight, paddingBottom: 0 }}
                        showsVerticalScrollIndicator={false}
                        scrollEnabled={!activeStage} // Now scrollable, synced with timeline
                        onScroll={handleVerticalScrollLabels}
                        scrollEventThrottle={16}
                        bounces={true}
                        bouncesZoom={false}
                        alwaysBounceVertical={true}
                        removeClippedSubviews={Platform.OS === 'android'}
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
                                    ? BASE_TOP + ((maxLane + 1) * (CARD_HEIGHT + LANE_SPACING)) - LANE_SPACING + 7
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
                                            style={[styles.trackLabelContainer, { height: trackHeight }]}
                                            onLayout={handleLabelLayout}
                                        >
                                            <TouchableOpacity
                                                activeOpacity={0.7}
                                                onPress={() => { }}
                                                style={[styles.trackLabel, { width: TRACK_LABEL_WIDTH }]}
                                            >
                                                <View style={{ flex: 1 }}>
                                                    <Text style={[styles.trackTitle, isActive && styles.trackTitleActive]} numberOfLines={1}>
                                                        {task.title.toUpperCase()}
                                                    </Text>
                                                    <Text style={styles.trackSubtitle} numberOfLines={1}>
                                                        {category ? category.name.toUpperCase() : 'GENERAL'}
                                                    </Text>
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
                </View>

                {/* Scrollable Timeline Section */}
                <View style={styles.timelineSection}>
                    {/* Sticky Time Axis Header */}
                    <View style={styles.stickyHeaderContainer}>
                        <ScrollView
                            ref={horizontalScrollHeaderRef}
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
                                {/* Time labels */}
                                {getTimeLabels().map((label, i) => (
                                    <View key={i} style={[styles.stickyHourLabel, { left: label.left }]}>
                                        <Text style={styles.hourText}>{label.text}</Text>
                                    </View>
                                ))}

                                {/* NOW Line Dot (Top portion) */}
                                {currentTime.getHours() >= START_HOUR && currentTime.getHours() <= END_HOUR && (
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
                        contentContainerStyle={{ minHeight: contentHeight, paddingBottom: 0 }}
                        showsVerticalScrollIndicator={true}
                        scrollEnabled={!activeStage}
                        onScroll={handleVerticalScroll}
                        scrollEventThrottle={16}
                        bounces={true}
                        bouncesZoom={false}
                        alwaysBounceVertical={true}
                        removeClippedSubviews={Platform.OS === 'android'}
                        overScrollMode="never"
                    >
                        <View
                            onTouchMove={handleTouchMove}
                            onTouchEnd={handleTouchEnd}
                            style={{ flex: 1 }}
                        >
                            <ScrollView
                                horizontal
                                ref={horizontalScrollTimelineRef}
                                showsHorizontalScrollIndicator={true}
                                scrollEnabled={!activeStage && !isDragging}
                                contentContainerStyle={{ width: TIMELINE_ONLY_WIDTH }}
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
                                <View style={[styles.timelineContent, { width: TIMELINE_ONLY_WIDTH }]}>
                                    {/* Vertical Lines (Grid) */}
                                    {getTimeLabels().map((label, i) => (
                                        <View key={i} style={[styles.hourLineOnly, { left: label.left }]}>
                                            <View style={styles.hourLineExtend} />
                                        </View>
                                    ))}

                                    {/* NOW Line - Vertical segment */}
                                    {currentTime.getHours() >= START_HOUR && currentTime.getHours() <= END_HOUR && (
                                        <View style={[styles.nowLine, { left: getNowPosition() }]} />
                                    )}

                                    {/* Tracks Container */}
                                    <View style={styles.tracksContainer}>
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

                                            // Sort timed subtasks by startTimeMinutes (ascending)
                                            const sortedTimedStages = [...timedStages].sort((a, b) => {
                                                const timeDiff = (a.startTimeMinutes || 0) - (b.startTimeMinutes || 0);
                                                if (timeDiff !== 0) return timeDiff;
                                                // Tie-breaker: use id for consistent ordering
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
                                            const maxLane = sortedTimedStages.length > 0
                                                ? Math.max(...Array.from(timedStageLanes.values()), -1)
                                                : -1;
                                            const CARD_HEIGHT = 21;
                                            const LANE_SPACING = 10; // 4px gap between consecutive subtasks
                                            const BASE_TOP = 7;
                                            // Calculate height for all lanes: base + (number of lanes * (card height + spacing)) - last spacing + bottom padding
                                            const timedStagesHeight = maxLane >= 0
                                                ? BASE_TOP + ((maxLane + 1) * (CARD_HEIGHT + LANE_SPACING)) - LANE_SPACING + 7 // +7 for bottom padding
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

                                            return (
                                                <View key={task.id}>
                                                    <View style={styles.trackSeparator} />
                                                    <TouchableOpacity
                                                        activeOpacity={1}
                                                        onPress={() => {
                                                            // Exit resize mode when tapping on track background
                                                            if (resizeModeStage) {
                                                                setResizeModeStage(null);
                                                            }
                                                        }}
                                                        style={[styles.track, { height: trackHeight }]}
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
                                                                onDropOnTimeline={(stageId, xPosition) => {
                                                                    if (!onUpdateStages || !onUpdateStageLayout) return;
                                                                    // Calculate startTimeMinutes from X position
                                                                    const startTimeMinutes = Math.max(0, Math.round((xPosition / CELL_WIDTH) * minutesPerCell));
                                                                    const durationMinutes = 180; // Default duration: 3 hours

                                                                    // Update the stage with startTimeMinutes
                                                                    const updatedStages = (task.stages || []).map(s =>
                                                                        s.id === stageId
                                                                            ? { ...s, startTimeMinutes, durationMinutes }
                                                                            : s
                                                                    );
                                                                    onUpdateStages(task, updatedStages);
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

                                                                return (
                                                                    <View
                                                                        key={stage.id}
                                                                        style={[
                                                                            // Universal card design (same as untimed cards) for timeline too
                                                                            styles.timelineStageCard,
                                                                            { left, width, top },
                                                                            isBeingEdited && styles.stageCardDragging,
                                                                            isInResizeMode && styles.stageCardResizeMode,
                                                                        ]}
                                                                        {...stagePanResponder.panHandlers}
                                                                    >
                                                                        {/* Left Resize Handle - simple vertical line */}
                                                                        {isInResizeMode && (
                                                                            <TouchableOpacity
                                                                                style={styles.resizeHandleLeft}
                                                                                onPressIn={() => {
                                                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
                                                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                                                    setResizeModeStage({ taskId: task.id, stageId: stage.id });
                                                                                }
                                                                            }}
                                                                            onLongPress={() => {
                                                                                // Long-press to move - only if not in resize mode
                                                                                if (isInResizeMode) return;

                                                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

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
                                                                                { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start' },
                                                                                isInResizeMode && { paddingHorizontal: 12 }
                                                                            ]}
                                                                            disabled={isInResizeMode} // Disable tap when in resize mode
                                                                        >
                                                                            <Text style={[
                                                                                styles.untimedStageName,
                                                                                isBeingEdited && styles.stageTextDragging,
                                                                                isInResizeMode && styles.stageTextResizeMode
                                                                            ]} numberOfLines={1}>
                                                                                {stage.text}
                                                                            </Text>
                                                                        </TouchableOpacity>

                                                                        {/* Right Resize Handle - simple vertical line */}
                                                                        {isInResizeMode && (
                                                                            <TouchableOpacity
                                                                                style={styles.resizeHandleRight}
                                                                                onPressIn={() => {
                                                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
                                                                                    size={12.6}
                                                                                    color={isBeingEdited ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.35)"}
                                                                                />
                                                                            </TouchableOpacity>
                                                                        )}
                                                                    </View>
                                                                );
                                                            });
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
    onDeleteStage: (stageId: number) => void;
    onDropOnTimeline: (stageId: number, xPosition: number) => void;
    onHeightChange?: (height: number) => void; // Callback when list height changes
}

function UntimedStagesDraggableList({
    task,
    stages,
    cellWidth,
    minutesPerCell,
    trackLabelWidth,
    getTimelineScrollX,
    isLandscape,
    onDeleteStage,
    onDropOnTimeline,
    onHeightChange
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
                setDrag2DPos({ x: pageX, y: pageY });
            },
            onPanResponderRelease: (evt) => {
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
            onPanResponderTerminate: () => stop2DDrag(),
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
                            { marginRight: 0 },
                            isDragging2D && styles.stageTextDragging
                        ]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                    >
                        {item.text}
                    </Text>
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
                        size={12.6}
                        color={isDragging2D ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.4)"}
                    />
                </TouchableOpacity>
            </View>
        );
    }, [drag2DStage, getTimePosition, handleCardLayout, onDeleteStage, start2DDrag]);

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
    mainContainer: {
        flex: 1,
        flexDirection: 'row',
    },
    fixedLabelsColumn: {
        width: 150, // TRACK_LABEL_WIDTH
        backgroundColor: '#000000',
        zIndex: 100,
        borderRightWidth: 1,
        borderRightColor: 'rgba(255,255,255,0.08)',
        overflow: 'hidden',
    },
    timelineSection: {
        flex: 1,
        flexDirection: 'column',
    },
    stickyHeaderFixed: {
        backgroundColor: '#000000',
        // Removed borderBottom - hour sticks provide visual separation
    },
    stickyHeaderContainer: {
        height: 25,
        backgroundColor: '#000000',
        // Removed borderBottom - hour sticks provide visual separation
        zIndex: 1000,
    },
    verticalScrollLabels: {
        flex: 1,
        backgroundColor: '#000000',
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
        borderBottomColor: 'rgba(255,255,255,0.1)',
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
    trackSeparator: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.15)',
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
        alignItems: 'center',
        gap: 6,
        paddingLeft: 8,
        paddingRight: 10,
        backgroundColor: '#000000',
        height: '100%',
    },
    trackTitle: {
        fontSize: 11,
        fontWeight: '900',
        color: '#FFFFFF',
        letterSpacing: 0.5,
    },
    trackTitleActive: {
        color: '#4CAF50',
    },
    trackSubtitle: {
        fontSize: 8,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.4)',
        marginTop: 1,
    },
    // Universal card design for timed stages on timeline
    timelineStageCard: {
        position: 'absolute',
        top: 7, // align with untimed list top padding (7)
        borderRadius: 2.8,
        backgroundColor: 'rgba(20, 20, 20, 0.8)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        minHeight: 21,
        paddingHorizontal: 4.2,
        paddingVertical: 2.8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 5.6,
        overflow: 'hidden',
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
        borderRadius: 2.8, // 4 * 0.7 = 2.8 (compressed by 30%)
        backgroundColor: 'rgba(20, 20, 20, 0.8)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        minHeight: 21, // 30 * 0.7 = 21 (compressed by 30%)
        paddingHorizontal: 4.2, // 6 * 0.7 = 4.2 (compressed by 30%)
        paddingVertical: 2.8, // 4 * 0.7 = 2.8 (compressed by 30%)
        gap: 5.6, // 8 * 0.7 = 5.6 (compressed by 30%)
        width: '100%', // Take full width of container
        maxWidth: '100%', // Ensure it doesn't exceed container
        overflow: 'hidden', // Prevent content overflow
    },
    untimedStageName: {
        fontSize: 7.7, // 11 * 0.7 = 7.7 (compressed by 30%)
        fontWeight: '700',
        color: '#FFFFFF',
        flexShrink: 1,
        minWidth: 0, // Allow text to shrink
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
        backgroundColor: '#FFFFFF', // White background when dragging
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.1)',
        minHeight: 21, // Match original card height
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.5,
        shadowRadius: 12,
        elevation: 12,
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
        backgroundColor: '#FFFFFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
        zIndex: 1000,
    },
    stageCardDragging: {
        backgroundColor: '#FF9800',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.5,
        shadowRadius: 16,
        elevation: 20,
        zIndex: 9999,
        transform: [{ scale: 1.05 }],
        borderColor: '#FFFFFF',
        borderWidth: 1,
    },
    stageCardResizeMode: {
        borderColor: '#FF9800',
        borderWidth: 2,
        backgroundColor: '#FF9800',
        transform: [{ scale: 1.02 }],
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
    },
    stageTextDragging: {
        color: '#000000',
        fontWeight: '900',
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
});
