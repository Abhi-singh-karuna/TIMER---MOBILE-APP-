import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Dimensions,
    LayoutAnimation,
    Alert,
    Image,
    Platform,
    Animated,
    Easing,
    useWindowDimensions,
    SafeAreaView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

const APP_LOGO = require('../../../../assets/logo-transparent.png');

const { width } = Dimensions.get('window');

import { Goal, GoalType, Task } from '../../../constants/data';
import { shouldRecurOnDate, expandRecurringTaskForDate } from '../../../utils/recurrenceUtils';
import NotesPanel, { NotesIconButton, hasDayNote } from '../Task/NotesPanel';
import { getLogicalDate, getStartOfLogicalDay, DEFAULT_DAILY_START_MINUTES } from '../../../utils/dailyStartTime';


interface GoalManagementProps {
    goals: Goal[];
    onAddGoal: (parentId: string | null, type: GoalType) => void;
    onEditGoal: (goal: Goal) => void;
    onDeleteGoal: (goalId: string) => void;
    onUpdateProgress: (goalId: string, progress: number) => void;
    isLandscape: boolean;
    tasks: Task[];
    onUnlinkTask: (goalId: string, taskId: number) => void;
    onClose: () => void;
    onViewChange: (view: 'timer' | 'task' | 'goal') => void;
    activeView?: 'timer' | 'task' | 'goal';
    onSettings?: () => void;
    onShowNotes?: () => void;
    selectedDate?: Date;
    hideLeftPanel?: boolean;
    dailyStartMinutes?: number;
}

export default function GoalManagement({
    goals,
    onAddGoal,
    onEditGoal,
    onDeleteGoal,
    onUpdateProgress,
    isLandscape,
    tasks,
    onUnlinkTask,
    onClose,
    onViewChange,
    activeView,
    onSettings,
    onShowNotes,
    selectedDate,
    hideLeftPanel,
    dailyStartMinutes = DEFAULT_DAILY_START_MINUTES,
}: GoalManagementProps) {
    const insets = useSafeAreaInsets();
    const [expandedGoalIds, setExpandedGoalIds] = useState<string[]>([]);
    const [menuGoalId, setMenuGoalId] = useState<string | null>(null);
    const [selectedTaskIdPerGoal, setSelectedTaskIdPerGoal] = useState<Record<string, number | null>>({});
    const [hiddenGraphIds, setHiddenGraphIds] = useState<string[]>([]);
    const [expandedGraphIds, setExpandedGraphIds] = useState<string[]>([]);
    const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);
    const [selectedDayData, setSelectedDayData] = useState<{ date: string, segments: any[], title: string } | null>(null);
    const [containerWidth, setContainerWidth] = useState(0);
    const [deckContainerWidth, setDeckContainerWidth] = useState(0);
    const [isToggleInteracting, setIsToggleInteracting] = useState(false);

    // Notes state
    const [showNotesPanel, setShowNotesPanel] = useState(false);
    const [selectedDateHasNote, setSelectedDateHasNote] = useState(false);

    const selectedLogical = useMemo(() => {
        const date = selectedDate || new Date();
        return getLogicalDate(date, dailyStartMinutes);
    }, [selectedDate, dailyStartMinutes]);

    // Per-tab animated values
    const NAV_TABS = [
        { key: 'timer' as const, icon: 'timer', label: 'TIMER' },
        { key: 'task' as const, icon: 'check-box', label: 'TASK' },
        { key: 'goal' as const, icon: 'track-changes', label: 'GOAL' },
    ];
    const NAV_LOOP_COPIES = 7;
    const navTabCount = NAV_TABS.length;
    const navMiddleCopyIndex = Math.floor(NAV_LOOP_COPIES / 2);
    const currentActiveView = activeView || 'goal';

    const initialTabIdxRaw = NAV_TABS.findIndex(t => t.key === currentActiveView);
    const initialTabIdx = initialTabIdxRaw >= 0 ? initialTabIdxRaw : 0;
    const initialCenteredLoopIndex = (navMiddleCopyIndex * navTabCount) + initialTabIdx;
    const toggleScrollRef = useRef<ScrollView | null>(null);
    const didInitInfiniteToggleRef = useRef(false);
    const toggleInteractionAnim = useRef(new Animated.Value(0)).current;
    const [activeLoopIndex, setActiveLoopIndex] = useState(initialCenteredLoopIndex);

    const loopedNavTabs = useMemo(
        () =>
            Array.from({ length: navTabCount * NAV_LOOP_COPIES }, (_, loopIndex) => {
                const realIndex = loopIndex % navTabCount;
                const tab = NAV_TABS[realIndex];
                return { ...tab, realIndex, loopIndex };
            }),
        [navTabCount]
    );

    // iconScale uses native driver (transform only)
    const tabIconScale = useRef(
        NAV_TABS.map((_, idx) => new Animated.Value(idx === initialTabIdx ? 1.16 : 0.94))
    ).current;
    const tabContainerScale = useRef(
        NAV_TABS.map((_, idx) => new Animated.Value(idx === initialTabIdx ? 1 : 0.96))
    ).current;
    const tabContainerLift = useRef(
        NAV_TABS.map((_, idx) => new Animated.Value(idx === initialTabIdx ? -1 : 0))
    ).current;

    // labelOpacity is non-native (opacity needs layout)
    const tabLabelOpacity = useRef(
        NAV_TABS.map((_, idx) => new Animated.Value(idx === initialTabIdx ? 1 : 0.72))
    ).current;

    // Keep only 2 tabs visible at once; remaining tabs are reachable by horizontal scroll.
    const headerToggleItemWidth = useMemo(() => {
        if (!containerWidth) return 100;
        return Math.max(92, Math.floor((containerWidth - 4) / 2));
    }, [containerWidth]);
    const headerToggleSideInset = useMemo(() => {
        if (!containerWidth) return 2;
        return Math.max(2, Math.floor((containerWidth - headerToggleItemWidth) / 2));
    }, [containerWidth, headerToggleItemWidth]);

    const centerToggleLoopIndex = (loopIndex: number, animated: boolean = true) => {
        if (!containerWidth) return;
        const contentWidth = (headerToggleItemWidth * loopedNavTabs.length) + (headerToggleSideInset * 2);
        const maxOffset = Math.max(0, contentWidth - containerWidth);
        const targetX = Math.max(0, Math.min(loopIndex * headerToggleItemWidth, maxOffset));
        toggleScrollRef.current?.scrollTo({ x: targetX, animated });
    };
    const triggerSelectionHaptic = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
    };

    const getTabIndexByView = (view: 'timer' | 'task' | 'goal') => {
        const idx = NAV_TABS.findIndex(t => t.key === view);
        return idx >= 0 ? idx : 0;
    };

    const centerToggleForView = (view: 'timer' | 'task' | 'goal', animated: boolean = true) => {
        const baseIdx = getTabIndexByView(view);
        const centeredLoopIndex = (navMiddleCopyIndex * navTabCount) + baseIdx;
        setActiveLoopIndex(centeredLoopIndex);
        centerToggleLoopIndex(centeredLoopIndex, animated);
    };

    const settleInfiniteToggle = (offsetX: number) => {
        if (!containerWidth || headerToggleItemWidth <= 0) return;

        const nearestLoopIndex = Math.round(offsetX / headerToggleItemWidth);
        const safeLoopIndex = Math.max(0, Math.min(loopedNavTabs.length - 1, nearestLoopIndex));
        const baseIdx = ((safeLoopIndex % navTabCount) + navTabCount) % navTabCount;
        const selectedTab = NAV_TABS[baseIdx];

        if (selectedTab && selectedTab.key !== currentActiveView) {
            onViewChange && onViewChange(selectedTab.key);
            triggerSelectionHaptic();
        }

        // Re-anchor to middle copy to keep the loop infinite in both directions.
        const centeredLoopIndex = (navMiddleCopyIndex * navTabCount) + baseIdx;
        setActiveLoopIndex(centeredLoopIndex);
        const centeredOffset = centeredLoopIndex * headerToggleItemWidth;
        if (Math.abs(centeredOffset - offsetX) > 0.5) {
            centerToggleLoopIndex(centeredLoopIndex, false);
        }
    };

    // Constrain the horizontal task deck to max 2 visible cards.
    const taskCardWidth = useMemo(() => {
        if (!deckContainerWidth) return 150;
        const gutter = 10; // matches `deploymentDeckContent` gap
        const raw = deckContainerWidth / 2 - gutter / 2;
        return Math.max(120, Math.floor(raw));
    }, [deckContainerWidth]);

    useEffect(() => {
        const targetValue = ((activeLoopIndex % navTabCount) + navTabCount) % navTabCount;

        // Animate each tab independently
        NAV_TABS.forEach((_, idx) => {
            const isActive = idx === targetValue;
            // Icon scale — native driver OK (transform)
            Animated.spring(tabIconScale[idx], {
                toValue: isActive ? 1.16 : 0.94,
                useNativeDriver: true,
                friction: 6,
                tension: 120,
            }).start();
            Animated.spring(tabContainerScale[idx], {
                toValue: isActive ? 1 : 0.96,
                useNativeDriver: true,
                friction: 7,
                tension: 110,
            }).start();
            Animated.spring(tabContainerLift[idx], {
                toValue: isActive ? -1 : 0,
                useNativeDriver: true,
                friction: 7,
                tension: 120,
            }).start();
            // Label fade — non-native (opacity layout interplay)
            Animated.timing(tabLabelOpacity[idx], {
                toValue: isActive ? 1 : 0.72,
                duration: 180,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: false,
            }).start();
        });
    }, [activeLoopIndex, navTabCount]);

    useEffect(() => {
        if (!containerWidth) return;
        if (!didInitInfiniteToggleRef.current) {
            centerToggleForView(currentActiveView, false);
            didInitInfiniteToggleRef.current = true;
            return;
        }
        centerToggleForView(currentActiveView, true);
    }, [containerWidth, currentActiveView, headerToggleItemWidth, headerToggleSideInset]);

    useEffect(() => {
        Animated.timing(toggleInteractionAnim, {
            toValue: isToggleInteracting ? 1 : 0,
            duration: isToggleInteracting ? 120 : 220,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
        }).start();
    }, [isToggleInteracting]);

    // Track if current date has a note
    useEffect(() => {
        const checkNote = async () => {
            const hasNote = await hasDayNote(selectedLogical);
            setSelectedDateHasNote(hasNote);
        };
        checkNote();
    }, [selectedLogical]);

    const renderInfiniteViewToggle = (isPortrait: boolean = false) => (
        <Animated.View
            style={[
                styles.viewToggleContainer,
                isPortrait && styles.viewToggleContainerPortrait,
                isToggleInteracting && styles.viewToggleContainerInteracting,
                {
                    transform: [{
                        scale: toggleInteractionAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 1.015],
                        }),
                    }],
                },
            ]}
        >
            {NAV_TABS.map((tab, idx) => {
                const isActive = currentActiveView === tab.key;
                return (
                    <TouchableOpacity
                        key={tab.key}
                        style={[
                            styles.viewToggleBtn,
                            styles.viewToggleBtnCompact,
                            isActive && styles.viewToggleBtnActive,
                        ]}
                        onPress={() => {
                            const centeredLoopIndex = (navMiddleCopyIndex * navTabCount) + idx;
                            setActiveLoopIndex(centeredLoopIndex);
                            triggerSelectionHaptic();
                            onViewChange && onViewChange(tab.key);
                        }}
                        activeOpacity={0.75}
                    >
                        <View style={styles.viewToggleBtnInner}>
                            <Animated.View style={{ transform: [{ scale: tabIconScale[idx] }] }}>
                                <MaterialIcons
                                    name={tab.icon as any}
                                    size={13}
                                    color={isActive ? '#000' : 'rgba(255,255,255,0.45)'}
                                />
                            </Animated.View>
                            <Animated.Text
                                style={[
                                    styles.viewToggleText,
                                    isActive && styles.viewToggleTextActive,
                                    { opacity: tabLabelOpacity[idx] },
                                ]}
                            >
                                {tab.label}
                            </Animated.Text>
                        </View>
                    </TouchableOpacity>
                );
            })}
        </Animated.View>
    );




    const toggleExpand = (goalId: string) => {
        LayoutAnimation.configureNext({
            duration: 350,
            create: { type: 'easeInEaseOut', property: 'opacity' },
            update: { type: 'spring', springDamping: 0.8 },
            delete: { type: 'easeInEaseOut', property: 'opacity' },
        });
        setExpandedGoalIds(prev =>
            prev.includes(goalId)
                ? prev.filter(id => id !== goalId)
                : [...prev, goalId]
        );
    };

    const getGoalTypeLabel = (type: GoalType) => {
        switch (type) {
            case 'goal': return 'STRATEGIC OBJECTIVE';
            case 'task': return 'OPERATIONAL TARGET';
            default: return '';
        }
    };

    const formatTimeRange = (startMin?: number, endMin?: number) => {
        if (!startMin && !endMin) return '';
        const format = (m: number) => {
            const h = Math.floor(m / 60);
            const mins = m % 60;
            return `${h.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
        };
        return `${format(startMin || 0)} - ${format(endMin || 0)}`;
    };

    const formatDateCompact = (dateStr?: string) => {
        if (!dateStr) return '---';
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }).toUpperCase();
        } catch {
            return dateStr;
        }
    };

    const FALLBACK_GOAL_TINT = '#8A9099';
    const DEEP_BLACK_GOAL_COLOR = '#000000';
    const hexToRgba = (hex: string, alpha: number) => {
        if (!hex || !hex.startsWith('#')) return `rgba(255,255,255,${alpha})`;
        const normalized = hex.length === 4
            ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
            : hex;
        const r = parseInt(normalized.slice(1, 3), 16);
        const g = parseInt(normalized.slice(3, 5), 16);
        const b = parseInt(normalized.slice(5, 7), 16);
        if ([r, g, b].some(Number.isNaN)) return `rgba(255,255,255,${alpha})`;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    /** One popup row per task + time slot; merges duplicate stage lines into chips. */
    const groupSegmentsForDayPopup = (segments: any[]) => {
        const map = new Map<
            string,
            { segs: any[]; order: number }
        >();
        let seq = 0;
        for (const seg of segments) {
            const task = String(seg.taskTitle ?? '').trim() || 'Untitled';
            const sk = seg.startMin ?? -1;
            const ek = seg.endMin ?? -1;
            const key = `${task}|${sk}|${ek}`;
            if (!map.has(key)) {
                map.set(key, { segs: [], order: seq++ });
            }
            map.get(key)!.segs.push(seg);
        }
        const entries = [...map.entries()].sort((a, b) => a[1].order - b[1].order);
        return entries.map(([key, { segs }]) => {
            const first = segs[0];
            const totalMinutes = segs.reduce((acc, s) => acc + (s.durationMinutes || 0), 0);
            const stageLabels: string[] = [];
            for (const s of segs) {
                const st = String(s.stageTitle ?? '').trim();
                if (st && !stageLabels.includes(st)) stageLabels.push(st);
            }
            return {
                key,
                taskTitle: String(first.taskTitle ?? '').trim() || 'Untitled',
                timeLabel: formatTimeRange(first.startMin, first.endMin),
                totalMinutes,
                stageLabels,
                status: String(first.status ?? ''),
                partCount: segs.length,
            };
        });
    };

    const getGoalActivityData = (goal: Goal, allTasks: Task[]) => {
        if (!goal.startDate || !goal.endDate) return [];

        const start = new Date(goal.startDate);
        const end = new Date(goal.endDate);
        const days = [];

        // Aggregate taskIds from the goal itself and its children
        const children = goals.filter(g => g.parentId === goal.id);
        const taskIds = Array.from(new Set([
            ...(goal.taskIds || []),
            ...(goal.taskId ? [goal.taskId] : []),
            ...children.flatMap(c => c.taskIds || []),
            ...children.flatMap(c => c.taskId ? [c.taskId] : [])
        ]));

        const associatedTasks = allTasks.filter(t => taskIds.includes(t.id));

        let curr = new Date(start);
        let count = 0;
        const todayStr = new Date().toISOString().split('T')[0];

        while (curr <= end && count < 366) {
            const dateStr = curr.toISOString().split('T')[0];

            let totalMinutes = 0;
            let completedMinutes = 0;
            let hasTasks = false;
            let anyInProgress = false;
            const segments: { durationMinutes: number, status: string }[] = [];

            associatedTasks.forEach(task => {
                const instance = expandRecurringTaskForDate(task, dateStr);
                if (instance) {
                    hasTasks = true;
                    const stages = instance.stages || [];
                    if (stages.length > 0) {
                        stages.forEach(s => {
                            const dur = s.durationMinutes || 0;
                            const startMin = s.startTimeMinutes || 0;
                            totalMinutes += dur;
                            (segments as any[]).push({
                                durationMinutes: dur,
                                status: s.status,
                                taskTitle: task.title,
                                stageTitle: s.text,
                                startMin: startMin,
                                endMin: startMin + dur
                            });
                            if (s.status === 'Done') {
                                completedMinutes += dur;
                            } else if (s.status === 'Process') {
                                anyInProgress = true;
                            }
                        });
                    } else {
                        totalMinutes += 60;
                        (segments as any[]).push({
                            durationMinutes: 60,
                            status: instance.status === 'Completed' ? 'Done' : (instance.status === 'In Progress' ? 'Process' : 'Pending'),
                            taskTitle: task.title,
                            stageTitle: 'CORE TARGET'
                        });
                        if (instance.status === 'Completed') completedMinutes += 60;
                        else if (instance.status === 'In Progress') anyInProgress = true;
                    }
                }
            });

            let status: 'completed' | 'pending' | 'missed' = 'pending';
            if (hasTasks) {
                if (totalMinutes > 0 && completedMinutes >= totalMinutes) {
                    status = 'completed';
                } else if (anyInProgress || completedMinutes > 0 || dateStr >= todayStr) {
                    status = 'pending';
                } else {
                    status = 'missed';
                }
            }

            days.push({
                date: dateStr,
                durationHrs: totalMinutes / 60,
                status,
                hasTasks,
                segments
            });

            curr.setDate(curr.getDate() + 1);
            count++;
        }
        return days;
    };

    const getTaskActivityData = (task: Task, startDate: string, endDate: string) => {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const days = [];
        const todayStr = new Date().toISOString().split('T')[0];

        let curr = new Date(start);
        let count = 0;
        while (curr <= end && count < 366) {
            const dateStr = curr.toISOString().split('T')[0];
            const instance = expandRecurringTaskForDate(task, dateStr);

            let totalMinutes = 0;
            let completedMinutes = 0;
            let status: 'completed' | 'pending' | 'missed' = 'pending';
            const segments: { durationMinutes: number, status: string }[] = [];

            if (instance) {
                const stages = instance.stages || [];
                if (stages.length > 0) {
                    stages.forEach(s => {
                        const dur = s.durationMinutes || 0;
                        const startMin = s.startTimeMinutes || 0;
                        totalMinutes += dur;
                        (segments as any[]).push({
                            durationMinutes: dur,
                            status: s.status,
                            taskTitle: task.title,
                            stageTitle: s.text,
                            startMin: startMin,
                            endMin: startMin + dur
                        });
                        if (s.status === 'Done') completedMinutes += dur;
                    });
                } else {
                    totalMinutes = 60;
                    (segments as any[]).push({
                        durationMinutes: 60,
                        status: instance.status === 'Completed' ? 'Done' : (instance.status === 'In Progress' ? 'Process' : 'Pending'),
                        taskTitle: task.title,
                        stageTitle: 'CORE TARGET'
                    });
                    if (instance.status === 'Completed') completedMinutes = 60;
                }

                if (totalMinutes > 0 && completedMinutes >= totalMinutes) status = 'completed';
                else if (totalMinutes > 0 && (completedMinutes > 0 || dateStr >= todayStr)) status = 'pending';
                else status = 'missed';
            }

            days.push({
                date: dateStr,
                durationHrs: totalMinutes / 60,
                status,
                hasTasks: !!instance,
                segments
            });

            curr.setDate(curr.getDate() + 1);
            count++;
        }
        return days;
    };

    const getSegmentColor = (status: string, date: string) => {
        const todayStr = new Date().toISOString().split('T')[0];
        const isFuture = date >= todayStr;
        const s = status.toLowerCase();

        if (s === 'done' || s === 'completed') return '#00E676';
        if (s === 'process' || s === 'in progress') return '#FFCA28';

        // Pending — readable on dark chart (not near-black)
        if (isFuture) return 'rgba(120, 132, 156, 0.95)';
        return '#FF6E6E';
    };

    const GoalActivityGraph = ({ data, title, goalId, minimal, minimalControls, tintColor }: { data: any[], title?: string, goalId: string, minimal?: boolean, minimalControls?: React.ReactNode, tintColor?: string }) => {
        const todayStr = new Date().toISOString().split('T')[0];
        const isExpanded = expandedGraphIds.includes(goalId + (title || ''));
        const [graphViewportWidth, setGraphViewportWidth] = useState(0);

        if (data.length === 0) return null;

        const toggleGraphExpand = () => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            const key = goalId + (title || '');
            setExpandedGraphIds(prev =>
                prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
            );
        };

        const maxHeight = isExpanded ? 180 : (minimal ? 42 : 50);

        // Calculate dynamic Max Duration for Y-axis scaling
        const maxDataMins = Math.max(...data.map(day =>
            (day.segments || []).reduce((acc: number, s: any) => acc + (s.durationMinutes || 0), 0)
        ), 0);
        const maxDataHrs = maxDataMins / 60;

        // Determine a 'Nice' top hour for the Y-axis
        let topHr = isExpanded ? 10 : 4;
        if (maxDataHrs > 0) {
            if (isExpanded) {
                topHr = Math.max(4, Math.ceil(maxDataHrs / 2) * 2);
            } else {
                topHr = Math.max(2, Math.ceil(maxDataHrs));
            }
        }

        const yAxisLabelsHr = isExpanded
            ? [topHr + 'h', (topHr * 0.75).toFixed(1).replace('.0', '') + 'h', (topHr * 0.5).toFixed(1).replace('.0', '') + 'h', (topHr * 0.25).toFixed(1).replace('.0', '') + 'h', '0h']
            : [topHr + 'h', (topHr * 0.5).toFixed(1).replace('.0', '') + 'h', '0h'];

        const gridLines = isExpanded
            ? [0, 45, 90, 135, 180]
            : [0, 25, 50];

        // Dynamic width behavior:
        // - At least 5 bars visible within card width
        // - At most 20 bars visible within card width
        // - If data > 20, keep card width stable and allow horizontal scroll
        const minVisibleBars = 5;
        const maxVisibleBars = 20;
        const visibleBars = Math.max(minVisibleBars, Math.min(maxVisibleBars, data.length));
        const placeholderCount = Math.max(0, minVisibleBars - data.length);
        const displayData = placeholderCount > 0
            ? [
                ...data,
                ...Array.from({ length: placeholderCount }, (_, idx) => ({
                    __placeholder: true,
                    date: `placeholder-${idx}`,
                    segments: [],
                    hasTasks: false,
                })),
            ]
            : data;
        const chartGap = minimal ? 3 : 4;
        const chartPaddingX = minimal ? 2 : 4;
        const computedBarWidth = graphViewportWidth > 0
            ? Math.max(
                minimal ? 10 : 12,
                Math.floor((graphViewportWidth - (chartPaddingX * 2) - ((visibleBars - 1) * chartGap)) / visibleBars)
            )
            : (minimal ? 13 : 16);
        const graphContentWidth = (displayData.length * computedBarWidth) + ((Math.max(0, displayData.length - 1)) * chartGap) + (chartPaddingX * 2);

        /** Space below the 0h baseline for x-axis date labels (labels sit entirely under the line). */
        const GRAPH_X_AXIS_PX = minimal ? 20 : 30;

        return (
            <View style={[styles.graphWrapper, { marginBottom: isExpanded ? 24 : (minimal ? 6 : 12) }]}>
                {!minimal && (
                    <View style={styles.graphHeaderRow}>
                        <Text style={styles.graphSubLabel}>{title?.toUpperCase()}</Text>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            {data.length > 0 && (
                                <Text style={styles.graphLegendText}>
                                    <Text style={{ color: '#00E676' }}>● DONE  </Text>
                                    <Text style={{ color: '#FFD700' }}>● PROCESS  </Text>
                                    <Text style={{ color: 'rgba(140, 152, 176, 0.95)' }}>● PENDING</Text>
                                </Text>
                            )}
                            <TouchableOpacity onPress={toggleGraphExpand} style={styles.expandToggleBtn}>
                                <MaterialIcons
                                    name={isExpanded ? "unfold-less" : "unfold-more"}
                                    size={12}
                                    color="#fff"
                                />
                                <Text style={styles.expandToggleText}>{isExpanded ? 'CLOSE' : 'EXPAND'}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
                {minimal && (
                    <View style={styles.graphHeaderRowMinimal}>
                        <View style={styles.graphHeaderMinimalCenter}>
                            {minimalControls}
                        </View>
                        <TouchableOpacity onPress={toggleGraphExpand} style={styles.expandToggleBtnMinimalRight} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                            <MaterialIcons
                                name={isExpanded ? "unfold-less" : "unfold-more"}
                                size={10}
                                color="rgba(255,255,255,0.55)"
                            />
                        </TouchableOpacity>
                    </View>
                )}

                <View
                    style={[
                        styles.graphChartPanel,
                        minimal && styles.graphChartPanelMinimal,
                        tintColor && {
                            backgroundColor: hexToRgba(tintColor, minimal ? 0.12 : 0.1),
                            borderColor: hexToRgba(tintColor, minimal ? 0.28 : 0.24),
                        }
                    ]}
                >
                    <View style={[styles.mathGraphMain, minimal && styles.mathGraphMainMinimal, { height: maxHeight + GRAPH_X_AXIS_PX + 6 }]}>
                        <View style={[styles.yAxisContainer, minimal && styles.yAxisContainerMinimal, { height: maxHeight + GRAPH_X_AXIS_PX }]}>
                            {yAxisLabelsHr.map((label, idx) => {
                                const bottom = isExpanded ? (gridLines[4 - idx] + GRAPH_X_AXIS_PX) : (gridLines[2 - idx] + GRAPH_X_AXIS_PX);
                                return (
                                    <Text
                                        key={idx}
                                        style={[
                                            styles.yAxisLabel,
                                            { position: 'absolute', bottom: bottom - 5, right: 4 }
                                        ]}
                                    >
                                        {label}
                                    </Text>
                                );
                            })}
                        </View>

                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={styles.graphScroll}
                            onLayout={(e) => setGraphViewportWidth(e.nativeEvent.layout.width)}
                        >
                            <View
                                style={[
                                    styles.graphContainer,
                                    minimal && styles.graphContainerMinimal,
                                    {
                                        height: maxHeight + GRAPH_X_AXIS_PX,
                                        width: Math.max(graphViewportWidth || 0, graphContentWidth),
                                        gap: chartGap,
                                        paddingHorizontal: chartPaddingX,
                                    },
                                ]}
                            >
                                {gridLines.map((bottom, idx) => (
                                    <View
                                        key={idx}
                                        style={[
                                            styles.gridLine,
                                            { bottom: bottom + GRAPH_X_AXIS_PX },
                                            bottom === 0 && { backgroundColor: 'rgba(255,255,255,0.28)', height: 2 }
                                        ]}
                                    />
                                ))}

                                {displayData.map((day: any, i) => {
                                    const isPlaceholder = !!day.__placeholder;
                                    const segments = day.segments || [];
                                    const maxMinutes = topHr * 60;
                                    const scale = maxHeight / maxMinutes;
                                    const isToday = !isPlaceholder && day.date === todayStr;
                                    const dayNum = isPlaceholder ? '' : day.date.split('-')[2];

                                    return (
                                        <TouchableOpacity
                                            key={isPlaceholder ? `ph-${i}` : `${day.date}-${i}`}
                                            style={[styles.barOuter, minimal && styles.barOuterMinimal, { height: maxHeight + GRAPH_X_AXIS_PX, width: computedBarWidth }]}
                                            onPress={() => {
                                                if (isPlaceholder) return;
                                                setSelectedDayData({
                                                    date: day.date,
                                                    segments: day.segments,
                                                    title: title || 'PERFORMANCE LOG'
                                                });
                                            }}
                                            activeOpacity={isPlaceholder ? 1 : 0.85}
                                        >
                                            <View style={styles.barTrackColumn}>
                                                <View
                                                    style={[
                                                        styles.barContainer,
                                                        { height: maxHeight },
                                                        isToday && styles.barContainerToday,
                                                        isToday && styles.barContainerTodayHighlight,
                                                    ]}
                                                >
                                                    {segments.length > 0 ? (
                                                        [...segments].reverse().map((seg: any, idx: number) => (
                                                            <View
                                                                key={idx}
                                                                style={[
                                                                    styles.barFill,
                                                                    isToday && styles.barFillToday,
                                                                    {
                                                                        height: Math.max(3, seg.durationMinutes * scale),
                                                                        backgroundColor: getSegmentColor(seg.status, day.date),
                                                                        marginBottom: 1,
                                                                        opacity: day.hasTasks ? 1 : 0.45
                                                                    }
                                                                ]}
                                                            />
                                                        ))
                                                    ) : (
                                                        <View style={[
                                                            styles.barFill,
                                                            {
                                                                height: 3,
                                                                backgroundColor: isToday ? 'rgba(0, 229, 255, 0.35)' : 'rgba(255,255,255,0.14)',
                                                                borderRadius: 1,
                                                            }
                                                        ]} />
                                                    )}
                                                </View>
                                                <View style={[styles.barDateColumn, { height: GRAPH_X_AXIS_PX }]}>
                                                    <Text
                                                        style={[styles.barDate, isToday && styles.barDateTodayNum]}
                                                        numberOfLines={1}
                                                    >
                                                        {dayNum}
                                                    </Text>
                                                </View>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </View>
        );
    };

    const GoalMonthlyAnalytics = ({ data, goal }: { data: any[], goal: Goal }) => {
        const [selectedDay, setSelectedDay] = useState<number | null>(null);
        const [viewDate, setViewDate] = useState(new Date());

        const today = new Date();
        const viewMonth = viewDate.getMonth();
        const viewYear = viewDate.getFullYear();

        const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
        const monthLabel = monthNames[viewMonth];

        // Available months extraction
        const availableMonths = useMemo(() => {
            const monthsMap = new Map();
            const now = new Date();

            // Collect months from data
            data.forEach(d => {
                const date = new Date(d.date);
                const key = `${date.getFullYear()}-${date.getMonth()}`;
                if (!monthsMap.has(key)) {
                    monthsMap.set(key, {
                        month: date.getMonth(),
                        year: date.getFullYear(),
                        label: monthNames[date.getMonth()],
                        hasData: d.durationHrs > 0
                    });
                } else if (d.durationHrs > 0) {
                    monthsMap.get(key).hasData = true;
                }
            });

            // Ensure current month is always present
            const currentKey = `${now.getFullYear()}-${now.getMonth()}`;
            if (!monthsMap.has(currentKey)) {
                monthsMap.set(currentKey, {
                    month: now.getMonth(),
                    year: now.getFullYear(),
                    label: monthNames[now.getMonth()],
                    hasData: false
                });
            }

            // Sort ascending: JAN -> DEC
            return Array.from(monthsMap.values()).sort((a, b) => a.year - b.year || a.month - b.month);
        }, [data]);

        // Filter data for view month
        const monthData = useMemo(() => data.filter(d => {
            const dDate = new Date(d.date);
            return dDate.getMonth() === viewMonth && dDate.getFullYear() === viewYear;
        }), [data, viewMonth, viewYear]);

        const totalMinutes = monthData.reduce((acc, d) =>
            acc + (d.segments || []).reduce((sAcc: number, s: any) => sAcc + (s.durationMinutes || 0), 0), 0
        );
        const totalHours = (totalMinutes / 60).toFixed(1);
        const activeDays = monthData.filter(d => d.durationHrs > 0).length;
        const avgPerDay = activeDays > 0 ? (parseFloat(totalHours) / activeDays).toFixed(1) : '0.0';

        // Calendar Grid Logic
        const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
        const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

        const calendarDays = [];
        for (let i = 0; i < firstDayOfMonth; i++) calendarDays.push(null);
        for (let i = 1; i <= daysInMonth; i++) calendarDays.push(i);

        const handleDayPress = (day: number) => {
            const dateStr = `${viewYear}-${(viewMonth + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
            const dayInfo = monthData.find(d => d.date === dateStr);
            if (dayInfo && dayInfo.durationHrs > 0) {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setSelectedDay(day);
                triggerSelectionHaptic();
            }
        };
        const formatTime = (totalMinutes: number) => {
            const hours = Math.floor(totalMinutes / 60) % 24;
            const mins = totalMinutes % 60;
            const ampm = hours >= 12 ? 'PM' : 'AM';
            const displayHours = hours % 12 || 12;
            return `${displayHours}:${mins.toString().padStart(2, '0')} ${ampm}`;
        };

        const renderDayDetail = () => {
            if (selectedDay === null) return null;

            const dateStr = `${viewYear}-${(viewMonth + 1).toString().padStart(2, '0')}-${selectedDay.toString().padStart(2, '0')}`;
            const dayInfo = monthData.find(d => d.date === dateStr);
            if (!dayInfo) return null;

            const displayDate = `${selectedDay} ${monthLabel} ${viewYear}`;
            const segments = dayInfo.segments || [];

            return (
                <BlurView intensity={94} tint="dark" style={[StyleSheet.absoluteFill, styles.dayDetailOverlay]}>
                    <View style={styles.dayDetailContent}>
                        <View style={styles.dayDetailLeft}>
                            <View style={styles.detailTitleRow}>
                                <MaterialIcons name="event-note" size={12} color="#00E5FF" />
                                <Text style={styles.detailHeaderText}>DAY ANALYTICS</Text>
                            </View>

                            <View style={styles.detailSection}>
                                <Text style={styles.detailLabelMini}>DATE SELECTED</Text>
                                <Text style={styles.detailDateValue}>{displayDate}</Text>
                            </View>

                            <View style={styles.detailSection}>
                                <Text style={styles.detailLabelMini}>DAY DURATION</Text>
                                <Text style={styles.detailDurationValue}>
                                    {dayInfo.durationHrs.toFixed(1)}
                                    <Text style={styles.detailDurationUnit}>h</Text>
                                </Text>
                            </View>

                            <View style={styles.detailSection}>
                                <Text style={styles.detailLabelMini}>STATUS</Text>
                                <Text style={styles.detailStatusText}>IN PROGRESS</Text>
                            </View>
                        </View>

                        <View style={styles.detailVerticalSeparator} />

                        <View style={styles.dayDetailRight}>
                            <View style={styles.detailListHeader}>
                                <Text style={styles.detailListTitle}>SUBTASK DETAILS</Text>
                                <TouchableOpacity
                                    onPress={() => {
                                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                        setSelectedDay(null);
                                    }}
                                    style={styles.detailCloseBtn}
                                >
                                    <MaterialIcons name="close" size={14} color="rgba(255,255,255,0.5)" />
                                </TouchableOpacity>
                            </View>

                            <ScrollView
                                style={styles.minimalSubtaskList}
                                showsVerticalScrollIndicator={false}
                                contentContainerStyle={{ paddingBottom: 20 }}
                                nestedScrollEnabled={true}
                            >
                                {(() => {
                                    const taskGroupsMap = segments.reduce((acc: any, seg: any) => {
                                        const key = seg.taskId || seg.taskTitle || 'unlinked';
                                        if (!acc[key]) {
                                            acc[key] = {
                                                title: seg.taskTitle || 'Untitled Mission',
                                                totalMinutes: 0,
                                                segments: []
                                            };
                                        }
                                        acc[key].segments.push(seg);
                                        acc[key].totalMinutes += (seg.durationMinutes || 0);
                                        return acc;
                                    }, {});
                                    const taskGroups = Object.values(taskGroupsMap);

                                    return taskGroups.map((group: any, gIdx: number) => (
                                        <View key={gIdx} style={styles.taskGroupContainer}>
                                            <View style={styles.taskGroupHeader}>
                                                <MaterialIcons name="folder-special" size={10} color="#00E5FF" />
                                                <Text style={styles.taskGroupName} numberOfLines={1}>
                                                    {group.title.toUpperCase()}
                                                </Text>
                                                <Text style={styles.taskGroupTotalTime}>
                                                    {(group.totalMinutes / 60).toFixed(1)}h
                                                </Text>
                                            </View>

                                            <View style={styles.taskGroupTree}>
                                                {group.segments.map((seg: any, sIdx: number) => {
                                                    const isDone = seg.status === 'Done';
                                                    const statusColor = isDone ? '#00E676' : '#FFCA28';
                                                    const startTimeStr = seg.startMin !== undefined ? formatTime(seg.startMin) : '--:--';
                                                    const endTimeStr = (seg.startMin !== undefined && seg.durationMinutes !== undefined)
                                                        ? formatTime(seg.startMin + seg.durationMinutes)
                                                        : '--:--';
                                                    const isLast = sIdx === group.segments.length - 1;

                                                    return (
                                                        <View key={sIdx} style={styles.treeNodeRow}>
                                                            <View style={styles.treeConnectorContainer}>
                                                                <View style={[styles.treeVerticalLine, isLast && { bottom: '50%' }]} />
                                                                <View style={styles.treeHorizontalLine} />
                                                            </View>
                                                            <View style={styles.treeContentBody}>
                                                                <View style={styles.treeNodeMainRow}>
                                                                    <View style={[styles.treeStatusDot, { backgroundColor: statusColor }]} />
                                                                    <Text style={styles.treeNodeName} numberOfLines={1}>
                                                                        {(seg.stageTitle || 'SEGMENT').toUpperCase()}
                                                                    </Text>
                                                                    <Text style={styles.treeNodeDuration}>
                                                                        {(seg.durationMinutes / 60).toFixed(1)}h
                                                                    </Text>
                                                                </View>
                                                                <View style={styles.treeNodeSubRow}>
                                                                    <Text style={styles.treeNodeTime}>
                                                                        {startTimeStr} — {endTimeStr}
                                                                    </Text>
                                                                    <Text style={[styles.treeNodeStatusText, { color: statusColor }]}>
                                                                        {isDone ? 'DONE' : 'ACTIVE'}
                                                                    </Text>
                                                                </View>
                                                            </View>
                                                        </View>
                                                    );
                                                })}
                                            </View>
                                        </View>
                                    ));
                                })()}
                                {segments.length === 0 && (
                                    <Text style={styles.emptyDetailText}>NO ACTIVE TELEMETRY</Text>
                                )}
                            </ScrollView>
                        </View>
                    </View>
                </BlurView>
            );
        };

        return (
            <View style={styles.monthlyAnalyticsContainer}>
                {/* Left Side: Stats */}
                <View style={styles.analyticsStatsSide}>
                    <View style={styles.analyticsTitleRow}>
                        <MaterialIcons name="insert-chart" size={14} color="#00E5FF" />
                        <Text style={styles.analyticsTitleText}>ANALYTICS</Text>
                    </View>

                    <View style={styles.statLargeGroup}>
                        <Text style={styles.statLabelMini}>TOTAL TIME</Text>
                        <Text style={styles.statValueLarge}>{totalHours}<Text style={styles.statUnit}>h</Text></Text>
                    </View>

                    <View style={styles.statSmallRow}>
                        <View style={styles.statSmallItem}>
                            <Text style={styles.statLabelMini}>{monthLabel} ACTIVITY</Text>
                            <Text style={styles.statValueMed}>{totalHours}h</Text>
                        </View>
                        <View style={styles.statSmallItem}>
                            <Text style={styles.statLabelMini}>AVG/DAY</Text>
                            <Text style={styles.statValueMed}>{avgPerDay}h</Text>
                        </View>
                    </View>

                    <View style={styles.analyticsLegendBottom}>
                        <View style={styles.legendItemMini}><View style={[styles.legendDot, { backgroundColor: '#00E676' }]} /><Text style={styles.legendTextMini}>SNC: {activeDays}</Text></View>
                        <View style={styles.legendItemMini}><View style={[styles.legendDot, { backgroundColor: '#FFD700' }]} /><Text style={styles.legendTextMini}>FUT: 0</Text></View>
                        <View style={styles.legendItemMini}><View style={[styles.legendDot, { backgroundColor: '#00E5FF' }]} /><Text style={styles.legendTextMini}>LOC: ACTIVE</Text></View>
                    </View>
                </View>

                {/* Right Side: Calendar */}
                <View style={styles.analyticsCalendarSide}>
                    <View style={styles.calendarMonthHeader}>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.monthScrollContent}
                            decelerationRate="fast"
                            style={{ flex: 1 }}
                            nestedScrollEnabled={true}
                        >
                            {availableMonths.map((m, idx) => {
                                const isActive = m.month === viewMonth && m.year === viewYear;
                                return (
                                    <TouchableOpacity
                                        key={`${m.year}-${m.month}`}
                                        onPress={() => {
                                            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                            setViewDate(new Date(m.year, m.month, 1));
                                            setSelectedDay(null);
                                            triggerSelectionHaptic();
                                        }}
                                        style={[styles.monthBubble, isActive && styles.monthBubbleActive]}
                                    >
                                        <Text style={[styles.monthBubbleText, isActive && styles.monthBubbleTextActive]}>
                                            {m.label}
                                        </Text>
                                        {m.hasData && !isActive && <View style={styles.monthDataDot} />}
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>

                    <View style={styles.calendarGrid}>
                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                            <Text key={i} style={styles.calendarDayHeader}>{d}</Text>
                        ))}
                        {calendarDays.map((day, i) => {
                            if (!day) return <View key={`empty-${i}`} style={styles.calendarDayCell} />;

                            const dateStr = `${viewYear}-${(viewMonth + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                            const todayStr = today.toISOString().split('T')[0];
                            const dayInfo = monthData.find(d => d.date === dateStr);
                            const hasActivity = dayInfo && dayInfo.durationHrs > 0;
                            const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
                            const isSelected = selectedDay === day;
                            const isPast = dateStr < todayStr;

                            // Determine mission status color coding
                            let statusColorStyle = null;
                            let hasStatus = false;

                            if (dayInfo && dayInfo.hasTasks) {
                                hasStatus = true;
                                if (dayInfo.status === 'completed') {
                                    statusColorStyle = styles.dayCircleCompleted;
                                } else if (isPast) {
                                    statusColorStyle = styles.dayCircleIncomplete;
                                } else if (hasActivity || isToday) {
                                    statusColorStyle = styles.dayCircleActive;
                                }
                            }

                            return (
                                <TouchableOpacity
                                    key={day}
                                    style={styles.calendarDayCell}
                                    activeOpacity={hasActivity ? 0.7 : 1}
                                    onPress={() => day && handleDayPress(day)}
                                >
                                    <View style={[
                                        styles.dayCircle,
                                        statusColorStyle,
                                        isToday && styles.dayCircleToday,
                                        isSelected && styles.dayCircleSelected
                                    ]}>
                                        <Text style={[
                                            styles.calendarDayText,
                                            hasStatus && styles.calendarDayTextActive,
                                            isSelected && styles.calendarDayTextSelected
                                        ]}>{day}</Text>
                                        {hasActivity && <Text style={styles.dayDurationText}>{dayInfo.durationHrs.toFixed(1)}h</Text>}
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>

                {renderDayDetail()}
            </View>
        );
    };

    const GoalViewToggle = ({ activeView, onViewChange, minimal }: { activeView: 'chart' | 'analytics', onViewChange: (view: 'chart' | 'analytics') => void, minimal?: boolean }) => (
        <View style={[styles.graphViewToggleContainer, minimal && styles.graphViewToggleContainerMinimal]}>
            <TouchableOpacity
                onPress={() => onViewChange('chart')}
                style={[styles.graphViewToggleBtn, minimal && styles.graphViewToggleBtnMinimal, activeView === 'chart' && styles.graphViewToggleBtnActive]}
                activeOpacity={0.7}
            >
                <Text style={[styles.graphViewToggleText, minimal && styles.graphViewToggleTextMinimal, activeView === 'chart' && styles.graphViewToggleTextActive]}>CHART</Text>
            </TouchableOpacity>
            <TouchableOpacity
                onPress={() => onViewChange('analytics')}
                style={[styles.graphViewToggleBtn, minimal && styles.graphViewToggleBtnMinimal, activeView === 'analytics' && styles.graphViewToggleBtnActive]}
                activeOpacity={0.7}
            >
                <Text style={[styles.graphViewToggleText, minimal && styles.graphViewToggleTextMinimal, activeView === 'analytics' && styles.graphViewToggleTextActive]}>ANALYTICS</Text>
            </TouchableOpacity>
        </View>
    );

    const GoalGraphController = ({ data, goal, minimal }: { data: any[], goal: Goal, minimal?: boolean }) => {
        const [activeView, setActiveView] = useState<'chart' | 'analytics'>('chart');
        const isDeepBlackGoal = (goal.color || '').toUpperCase() === DEEP_BLACK_GOAL_COLOR;

        const handleViewChange = (view: 'chart' | 'analytics') => {
            if (activeView !== view) {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setActiveView(view);
                triggerSelectionHaptic();
            }
        };

        const chartMinH = minimal ? 80 : 100;
        const analyticsMinH = minimal ? 152 : 180;

        return (
            <View style={[styles.graphControllerContainer, minimal && styles.graphControllerContainerMinimal]}>
                {!minimal && (
                    <GoalViewToggle activeView={activeView} onViewChange={handleViewChange} />
                )}
                <View style={[styles.graphContentArea, { minHeight: activeView === 'chart' ? chartMinH : analyticsMinH }]}>
                    {activeView === 'chart' ? (
                        <GoalActivityGraph
                            data={data}
                            title="TOTAL TELEMETRY"
                            goalId={`combined-${goal.id}`}
                            minimal={minimal}
                            minimalControls={minimal ? <GoalViewToggle activeView={activeView} onViewChange={handleViewChange} minimal /> : undefined}
                            tintColor={isDeepBlackGoal ? undefined : (goal.color || FALLBACK_GOAL_TINT)}
                        />
                    ) : (
                        <GoalMonthlyAnalytics data={data} goal={goal} />
                    )}
                </View>
            </View>
        );
    };

    const renderTaskItem = (task: Task, isSelected: boolean, onSelect: () => void, goal: Goal) => {
        const stages = task.stages || [];
        let displayProgress = 0;
        let statusColor = '#00E676';
        let doneCount = 0;
        let activeCount = 0;
        let leftCount = 0;

        if (stages.length > 0) {
            doneCount = stages.filter(s => s.status === 'Done').length;
            activeCount = stages.filter(s => s.status === 'Process').length;
            leftCount = Math.max(0, stages.length - doneCount - activeCount);
            displayProgress = (doneCount / stages.length) * 100;
        } else {
            if (task.status === 'Completed') displayProgress = 100;
            else if (task.status === 'In Progress') displayProgress = 50;
            else displayProgress = 0;
            doneCount = task.status === 'Completed' ? 1 : 0;
            activeCount = task.status === 'In Progress' ? 1 : 0;
            leftCount = task.status === 'Completed' || task.status === 'In Progress' ? 0 : 1;
        }

        if (task.status === 'In Progress') statusColor = '#FFB300';
        else if (task.status === 'Completed') statusColor = '#00E676';
        else statusColor = 'rgba(255,255,255,0.2)';

        const totalUnits = Math.max(1, doneCount + activeCount + leftCount);
        const donePct = (doneCount / totalUnits) * 100;
        const activePct = (activeCount / totalUnits) * 100;
        const leftPct = Math.max(0, 100 - donePct - activePct);

        return (
            <TouchableOpacity
                key={task.id}
                onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    onSelect();
                }}
                activeOpacity={0.7}
                style={[
                    styles.miniTaskCardHorizontal,
                    { width: taskCardWidth },
                    isSelected && styles.miniTaskCardSelected
                ]}
            >
                <View style={styles.miniTaskHeaderCompact}>
                    <View style={[styles.statusIndicatorSmall, { backgroundColor: statusColor }]} />
                    <Text style={[styles.miniTaskTitleCompact, isSelected && { color: '#fff' }]} numberOfLines={1}>
                        {task.title.toUpperCase()}
                    </Text>
                </View>

                <View style={styles.miniTaskMidCompact}>
                    <Text style={styles.miniTaskMetaCompact}>{stages.length > 0 ? `${stages.length} SUBTASKS` : '1 TARGET'}</Text>
                </View>

                <View style={styles.taskStatusPillsRow}>
                    <View style={[styles.taskStatusPill, styles.taskStatusPillDone]}>
                        <Text style={styles.taskStatusPillText}>DONE {doneCount}</Text>
                    </View>
                    <View style={[styles.taskStatusPill, styles.taskStatusPillActive]}>
                        <Text style={styles.taskStatusPillText}>ACTIVE {activeCount}</Text>
                    </View>
                    <View style={[styles.taskStatusPill, styles.taskStatusPillLeft]}>
                        <Text style={styles.taskStatusPillText}>LEFT {leftCount}</Text>
                    </View>
                </View>

                <View style={styles.miniTaskFooterCompact}>
                    <View style={[styles.miniProgressBarTrackCompact, styles.miniProgressBarTrackStatus]}>
                        <View style={[styles.miniProgressSegment, styles.miniProgressSegmentDone, { width: `${donePct}%` }]} />
                        <View style={[styles.miniProgressSegment, styles.miniProgressSegmentActive, { width: `${activePct}%` }]} />
                        <View style={[styles.miniProgressSegment, styles.miniProgressSegmentLeft, { width: `${leftPct}%` }]} />
                    </View>
                    <Text style={styles.miniPercentTextCompact}>{Math.round(displayProgress)}%</Text>
                </View>

                {isSelected && (
                    <View style={styles.selectedIndicatorBar} />
                )}
            </TouchableOpacity>
        );
    };

    const renderDashboardCard = (goal: Goal) => {
        const isExpanded = expandedGoalId === goal.id;
        const children = goals.filter(g => g.parentId === goal.id);
        const taskIds = [
            ...(goal.taskIds || []),
            ...(goal.taskId ? [goal.taskId] : []),
            ...children.flatMap(c => c.taskIds || []),
            ...children.flatMap(c => c.taskId ? [c.taskId] : [])
        ];
        const associatedIds = Array.from(new Set(taskIds));
        const associatedTasks = tasks.filter(t => associatedIds.includes(t.id));

        let displayProgress = goal.progress;
        if (associatedTasks.length > 0) {
            const allStages = associatedTasks.flatMap(t => t.stages || []);
            if (allStages.length > 0) {
                displayProgress = (allStages.filter(s => s.status === 'Done').length / allStages.length) * 100;
            } else {
                const totalComp = associatedTasks.filter(t => t.status === 'Completed').length;
                displayProgress = (totalComp / associatedTasks.length) * 100;
            }
        }

        const displayTitle = goal.title;
        const isDeepBlackGoal = (goal.color || '').toUpperCase() === DEEP_BLACK_GOAL_COLOR;
        const accentColor = '#FFFFFF';
        const startLabel = formatDateCompact(goal.startDate || goal.createdAt);
        const endLabel = formatDateCompact(goal.endDate);
        const taskDoneCount = associatedTasks.filter(t => t.status === 'Completed').length;
        const totalTaskCount = associatedTasks.length;
        const activeTaskCount = associatedTasks.filter(t => t.status === 'In Progress').length;
        const pendingTaskCount = Math.max(0, totalTaskCount - taskDoneCount - activeTaskCount);
        const todayStr = new Date().toISOString().split('T')[0];
        const goalStartStr = (goal.startDate || goal.createdAt || '').split('T')[0];
        const goalEndStr = (goal.endDate || '').split('T')[0];
        const hasProgress = taskDoneCount > 0 || activeTaskCount > 0 || displayProgress > 0;
        const isCompleted = totalTaskCount > 0 && taskDoneCount === totalTaskCount;
        const isUpcoming = !!goalStartStr && goalStartStr > todayStr;
        const isPastDeadline = !!goalEndStr && goalEndStr < todayStr;
        const goalStatusLabel =
            isCompleted
                ? 'COMPLETED'
                : isPastDeadline && !isCompleted
                    ? 'FAILED'
                    : isUpcoming && !hasProgress
                        ? 'UPCOMING'
                        : 'RUNNING';
        const goalStatusStyle =
            goalStatusLabel === 'COMPLETED'
                ? styles.goalStatusPillDone
                : goalStatusLabel === 'RUNNING'
                    ? styles.goalStatusPillActive
                    : goalStatusLabel === 'FAILED'
                        ? styles.goalStatusPillFailed
                        : styles.goalStatusPillPending;
        const goalStatusTextStyle =
            goalStatusLabel === 'COMPLETED'
                ? styles.goalStatusTextDone
                : goalStatusLabel === 'RUNNING'
                    ? styles.goalStatusTextActive
                    : goalStatusLabel === 'FAILED'
                        ? styles.goalStatusTextFailed
                        : styles.goalStatusTextPending;

        return (
            <View key={goal.id} style={styles.dashboardCardWrapper}>
                <View style={[styles.goalCardBezel, isLandscape && styles.goalCardBezelLandscape]}>
                    <View
                        style={[
                            styles.goalCardOuterBoundaryHighlight,
                            isLandscape && styles.goalCardOuterBoundaryHighlightLandscape,
                        ]}
                    />
                    <BlurView
                        intensity={32}
                        tint="dark"
                        style={[
                            styles.goalCardBlurTrack,
                            isLandscape && styles.goalCardBlurTrackLandscape,
                            !isExpanded && styles.dashboardCardCollapsed,
                            !isExpanded && menuGoalId === goal.id && styles.dashboardCardCollapsedMenuOpen,
                        ]}
                    >
                        <View
                            style={[
                                styles.goalCardInteriorShadow,
                                isLandscape && styles.goalCardInteriorShadowLandscape,
                            ]}
                            pointerEvents="none"
                        />
                        <View
                            style={[styles.goalCardTopRim, isLandscape && styles.goalCardTopRimLandscape]}
                            pointerEvents="none"
                        />
                        <LinearGradient
                            colors={[
                                isDeepBlackGoal
                                    ? '#000000'
                                    : hexToRgba(goal.color || FALLBACK_GOAL_TINT, goal.color ? 0.22 : 0.1),
                                isDeepBlackGoal ? '#000000' : '#050608',
                            ]}
                            locations={[0, 1]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 0, y: 1 }}
                            style={[
                                styles.cardContent,
                                !isExpanded && styles.cardContentCollapsed
                            ]}
                        >
                            {/* Unified HUD Content */}
                            <View style={styles.hudBody}>
                                <View style={styles.goalCardHeaderMinimal}>
                                    <TouchableOpacity
                                        style={styles.headerTapArea}
                                        activeOpacity={0.85}
                                        onPress={() => {
                                            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                            setExpandedGoalId(prev => (prev === goal.id ? null : goal.id));
                                            setMenuGoalId(null);
                                        }}
                                    >
                                        <View style={styles.goalCardHeaderIcon}>
                                            <MaterialIcons name="track-changes" size={16} color="rgba(255,255,255,0.55)" />
                                        </View>
                                        <View style={styles.goalCardHeaderTextCol}>
                                            <Text style={styles.goalCardTitleCompact} numberOfLines={1}>
                                                {displayTitle}
                                            </Text>
                                            <Text style={styles.goalCardMetaCompact} numberOfLines={1}>
                                                {getGoalTypeLabel(goal.type)} · ID {goal.id.slice(-4)} · {associatedTasks.length} linked
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                    <View style={styles.integratedActions}>
                                        <TouchableOpacity
                                            onPress={() => {
                                                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                                setExpandedGoalId(prev => (prev === goal.id ? null : goal.id));
                                            }}
                                            style={styles.hudActionBtnMinimal}
                                            activeOpacity={0.75}
                                        >
                                            <MaterialIcons name={isExpanded ? "unfold-less" : "unfold-more"} size={18} color="rgba(255,255,255,0.75)" />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => onAddGoal(goal.id, 'task')}
                                            style={styles.hudActionBtnMinimal}
                                            activeOpacity={0.75}
                                        >
                                            <MaterialIcons name="add" size={18} color={accentColor} />
                                        </TouchableOpacity>
                                        <View style={{ position: 'relative' }}>
                                            <TouchableOpacity
                                                onPress={() => {
                                                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                                    setMenuGoalId(menuGoalId === goal.id ? null : goal.id);
                                                }}
                                                style={styles.hudActionBtnMinimal}
                                                activeOpacity={0.75}
                                            >
                                                <MaterialIcons name="more-vert" size={18} color="rgba(255,255,255,0.5)" />
                                            </TouchableOpacity>

                                            {menuGoalId === goal.id && isExpanded && (
                                                <BlurView intensity={80} tint="dark" style={styles.tacticalTooltip}>
                                                    <TouchableOpacity
                                                        style={styles.tooltipItem}
                                                        onPress={() => {
                                                            onEditGoal(goal);
                                                            setMenuGoalId(null);
                                                        }}
                                                    >
                                                        <MaterialIcons name="edit" size={10} color={accentColor} />
                                                        <Text style={styles.tooltipText}>UPDATE</Text>
                                                    </TouchableOpacity>
                                                    <View style={styles.tooltipSeparator} />
                                                    <TouchableOpacity
                                                        style={styles.tooltipItem}
                                                        onPress={() => {
                                                            onDeleteGoal(goal.id);
                                                            setMenuGoalId(null);
                                                        }}
                                                    >
                                                        <MaterialIcons name="delete-outline" size={10} color="#FF5252" />
                                                        <Text style={[styles.tooltipText, { color: '#FF5252' }]}>DELETE</Text>
                                                    </TouchableOpacity>
                                                </BlurView>
                                            )}
                                        </View>
                                    </View>
                                </View>

                                {menuGoalId === goal.id && !isExpanded && (
                                    <View style={styles.minimizedMenuRow}>
                                        <TouchableOpacity
                                            style={styles.minimizedMenuBtn}
                                            onPress={() => {
                                                onEditGoal(goal);
                                                setMenuGoalId(null);
                                            }}
                                        >
                                            <MaterialIcons name="edit" size={12} color="#fff" />
                                            <Text style={styles.minimizedMenuText}>UPDATE</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.minimizedMenuBtn, styles.minimizedMenuBtnDanger]}
                                            onPress={() => {
                                                onDeleteGoal(goal.id);
                                                setMenuGoalId(null);
                                            }}
                                        >
                                            <MaterialIcons name="delete-outline" size={12} color="#FF6E6E" />
                                            <Text style={[styles.minimizedMenuText, styles.minimizedMenuTextDanger]}>DELETE</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}

                                {isExpanded ? (
                                    <View style={[styles.hudRightUnified, isLandscape && styles.hudRightLandscapeUnified]}>
                                        {associatedTasks.length > 0 ? (
                                            <View style={[styles.activityContent, styles.activityContentMinimal, isLandscape && { flex: 1 }]}>
                                                {!hiddenGraphIds.includes(goal.id) && (
                                                    <View style={styles.combinedSystemGraphWrapperMinimal}>
                                                        <GoalGraphController
                                                            data={getGoalActivityData(goal, tasks)}
                                                            goal={goal}
                                                            minimal
                                                        />
                                                    </View>
                                                )}

                                                <ScrollView
                                                    horizontal
                                                    style={styles.deploymentDeckScroll}
                                                    contentContainerStyle={styles.deploymentDeckContent}
                                                    showsHorizontalScrollIndicator={false}
                                                    onLayout={(e) => setDeckContainerWidth(e.nativeEvent.layout.width)}
                                                >
                                                    {associatedTasks.map(task =>
                                                        renderTaskItem(
                                                            task,
                                                            selectedTaskIdPerGoal[goal.id] === task.id,
                                                            () => {
                                                                const currentSelected = selectedTaskIdPerGoal[goal.id];
                                                                setSelectedTaskIdPerGoal(prev => ({
                                                                    ...prev,
                                                                    [goal.id]: currentSelected === task.id ? null : task.id
                                                                }));
                                                            },
                                                            goal
                                                        )
                                                    )}
                                                </ScrollView>

                                                {/* Unified Drill-Down Analytics Panel */}
                                                {selectedTaskIdPerGoal[goal.id] && (
                                                    <BlurView intensity={24} tint="dark" style={styles.unifiedAnalyticsPanel}>
                                                        {(() => {
                                                            const selectedTask = associatedTasks.find(t => t.id === selectedTaskIdPerGoal[goal.id]);
                                                            if (!selectedTask) return null;

                                                            const stages = selectedTask.stages || [];
                                                            let progress = 0;
                                                            if (stages.length > 0) progress = (stages.filter(s => s.status === 'Done').length / stages.length) * 100;
                                                            else progress = selectedTask.status === 'Completed' ? 100 : (selectedTask.status === 'In Progress' ? 50 : 0);

                                                            return (
                                                                <>
                                                                    <View style={styles.analyticsHeaderRow}>
                                                                        <Text style={styles.analyticsLabelText}>DEPLOYMENT ANALYTICS</Text>
                                                                        <TouchableOpacity
                                                                            onPress={() => {
                                                                                Alert.alert(
                                                                                    "DECOUPLE OPERATIONAL TARGET",
                                                                                    `Are you sure you want to decouple "${selectedTask.title.toUpperCase()}" from this Strategic Objective?`,
                                                                                    [
                                                                                        { text: "CANCEL", style: "cancel" },
                                                                                        {
                                                                                            text: "CONFIRM UNLINK",
                                                                                            onPress: () => onUnlinkTask(goal.id, selectedTask.id),
                                                                                            style: "destructive"
                                                                                        }
                                                                                    ]
                                                                                );
                                                                            }}
                                                                            style={styles.unlinkActionBtn}
                                                                        >
                                                                            <MaterialIcons name="link-off" size={10} color="#FF5252" />
                                                                            <Text style={styles.unlinkActionText}>UNLINK</Text>
                                                                        </TouchableOpacity>
                                                                    </View>

                                                                    <View style={styles.microMetricsRow}>
                                                                        <View style={styles.microMetric}>
                                                                            <Text style={styles.microMetricLabel}>EST. AIRTIME</Text>
                                                                            <Text style={styles.microMetricVal}>12.4H</Text>
                                                                        </View>
                                                                        <View style={styles.metricDivider} />
                                                                        <View style={styles.microMetric}>
                                                                            <Text style={styles.microMetricLabel}>STREAK</Text>
                                                                            <Text style={styles.microMetricVal}>4 DAYS</Text>
                                                                        </View>
                                                                        <View style={styles.metricDivider} />
                                                                        <View style={styles.microMetric}>
                                                                            <Text style={styles.microMetricLabel}>COMPLETION</Text>
                                                                            <Text style={styles.microMetricVal}>{Math.round(progress)}%</Text>
                                                                        </View>
                                                                    </View>

                                                                    <GoalActivityGraph
                                                                        data={getTaskActivityData(selectedTask, goal.startDate || goal.createdAt, goal.endDate || new Date().toISOString())}
                                                                        title={`DRILL-DOWN: ${selectedTask.title.toUpperCase()}`}
                                                                        goalId={`${goal.id}-${selectedTask.id}`}
                                                                        minimal
                                                                        tintColor={isDeepBlackGoal ? undefined : (goal.color || FALLBACK_GOAL_TINT)}
                                                                    />
                                                                </>
                                                            );
                                                        })()}
                                                    </BlurView>
                                                )}
                                            </View>
                                        ) : (
                                            <TouchableOpacity
                                                style={styles.emptyTasksHUDUnified}
                                                onPress={() => onAddGoal(goal.id, 'task')}
                                            >
                                                <MaterialIcons name="link" size={14} color="rgba(255,255,255,0.1)" />
                                                <Text style={styles.emptyTasksHUDTextUnified}>LINK EXISTING TASKS TO BEGIN</Text>
                                            </TouchableOpacity>
                                        )}

                                        <View style={styles.goalExpandedFooter}>
                                            <View style={styles.goalFooterRowPrimary}>
                                                <View style={styles.goalFooterDateGroup}>
                                                    <View style={styles.compactPillFooter}>
                                                        <Text style={styles.compactPillFooterLabel}>STRT</Text>
                                                        <Text style={styles.compactPillFooterVal}>{startLabel}</Text>
                                                    </View>
                                                    <View style={styles.compactPillFooter}>
                                                        <Text style={styles.compactPillFooterLabel}>DLIN</Text>
                                                        <Text style={styles.compactPillFooterVal}>{endLabel}</Text>
                                                    </View>
                                                </View>
                                                <View style={styles.goalFooterMetricsGroup}>
                                                    <View style={[styles.goalStatusPill, styles.goalStatusPillFooter, goalStatusStyle]}>
                                                        <Text style={[styles.goalStatusText, styles.goalStatusTextFooter, goalStatusTextStyle]}>{goalStatusLabel}</Text>
                                                    </View>
                                                    <Text style={styles.goalFooterMetricSep}>·</Text>
                                                    <View style={styles.goalFooterMetricChip}>
                                                        <Text style={styles.goalFooterMetricChipLabel}>LNK</Text>
                                                        <Text style={styles.goalFooterMetricChipValCyan}>{totalTaskCount}</Text>
                                                    </View>
                                                    <Text style={styles.goalFooterMetricSep}>·</Text>
                                                    <View style={styles.goalFooterMetricChip}>
                                                        <Text style={styles.goalFooterMetricChipLabel}>DN</Text>
                                                        <Text style={styles.goalFooterMetricChipValGreen}>{taskDoneCount}</Text>
                                                    </View>
                                                    <Text style={styles.goalFooterMetricSep}>·</Text>
                                                    <View style={styles.goalFooterMetricChip}>
                                                        <Text style={styles.goalFooterMetricChipLabel}>LFT</Text>
                                                        <Text style={styles.goalFooterMetricChipValSlate}>{pendingTaskCount}</Text>
                                                    </View>
                                                </View>
                                            </View>
                                            <View style={styles.goalFooterRowProgress}>
                                                <View style={styles.slimProgressBarTrackWide}>
                                                    <View style={[styles.slimProgressBarFill, { width: `${displayProgress}%`, backgroundColor: accentColor }]} />
                                                </View>
                                                <Text style={styles.goalFooterProgressPct}>{Math.round(displayProgress)}%</Text>
                                            </View>
                                        </View>
                                    </View>
                                ) : (
                                    <TouchableOpacity
                                        style={styles.minimizedSummaryWrap}
                                        activeOpacity={0.85}
                                        onPress={() => {
                                            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                            setExpandedGoalId(goal.id);
                                            setMenuGoalId(null);
                                        }}
                                    >
                                        <View style={styles.minimizedSummaryTop}>
                                            <View style={[styles.minimizedInfoPill, styles.minimizedInfoPillLinked]}>
                                                <Text style={styles.minimizedInfoLabel}>LINKED</Text>
                                                <Text style={styles.minimizedInfoValue}>{associatedTasks.length}</Text>
                                            </View>
                                            <View style={[styles.minimizedInfoPill, styles.minimizedInfoPillDone]}>
                                                <Text style={styles.minimizedInfoLabel}>DONE</Text>
                                                <Text style={[styles.minimizedInfoValue, styles.minimizedInfoValueGreen]}>{taskDoneCount}</Text>
                                            </View>
                                            <View style={[styles.minimizedInfoPill, styles.minimizedInfoPillLeft]}>
                                                <Text style={styles.minimizedInfoLabel}>LEFT</Text>
                                                <Text style={[styles.minimizedInfoValue, styles.minimizedInfoValueSlate]}>{pendingTaskCount}</Text>
                                            </View>
                                        </View>
                                        <View style={styles.minimizedGoalStatusRow}>
                                            <View style={[styles.goalStatusPill, goalStatusStyle]}>
                                                <Text style={[styles.goalStatusText, goalStatusTextStyle]}>
                                                    {goalStatusLabel}
                                                </Text>
                                            </View>
                                            <Text style={styles.minimizedRangeText}>{startLabel} - {endLabel}</Text>
                                        </View>
                                        <View style={styles.minimizedProgressRow}>
                                            <View style={styles.slimProgressBarTrack}>
                                                <View style={[styles.slimProgressBarFill, { width: `${displayProgress}%`, backgroundColor: accentColor }]} />
                                            </View>
                                            <Text style={styles.compactProgressText}>{Math.round(displayProgress)}% COMPLETE</Text>
                                        </View>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </LinearGradient>
                    </BlurView>
                </View>
            </View>
        );
    };

    const rootGoals = useMemo(() => goals.filter(g => g.parentId === null), [goals]);
    const linkedTaskCount = useMemo(() => {
        const ids = new Set<number>();
        goals.forEach(g => {
            (g.taskIds || []).forEach(id => ids.add(id));
            if (g.taskId) ids.add(g.taskId);
        });
        return ids.size;
    }, [goals]);
    const goalHeaderStats = useMemo(() => ({
        goalCount: rootGoals.length || 3,
        totalHours: '42.0H', // dummy analytics
    }), [rootGoals.length]);

    // Pad the scroll content so it starts below our absolute header (portrait)
    // or has appropriate padding in landscape.
    const scrollTopPad = isLandscape ? 20 : 0;
    const { width: screenWidth } = useWindowDimensions();

    return (
        <View style={[styles.container, isLandscape && styles.landscapeContainer]}>
            {/* 1. PORTRAIT LAYOUT - NO HEADER (HANDLED BY ORCHESTRATOR) */}

            {/* 2. LANDSCAPE LAYOUT */}
            {isLandscape ? (
                hideLeftPanel ? (
                    <View style={[styles.rightPanel, { width: '100%', flex: 1 }]}>
                        <ScrollView
                            style={styles.scrollView}
                            contentContainerStyle={[
                                styles.scrollContent,
                                { paddingTop: scrollTopPad },
                                { paddingBottom: 100 },
                            ]}
                            showsVerticalScrollIndicator={false}
                        >
                            <View style={[styles.dashboardContainer, styles.dashboardContainerLandscape]}>
                                {goals.filter(g => !g.parentId).map(renderDashboardCard)}
                            </View>
                            {goals.filter(g => !g.parentId).length === 0 && (
                                <View style={[styles.dashboardContainer, { paddingHorizontal: 20 }]}>
                                    {[1, 2].map(i => (
                                        <TouchableOpacity
                                            key={`empty-goal-${i}`}
                                            style={styles.placeholderCard}
                                            onPress={() => onAddGoal(null, 'goal')}
                                            activeOpacity={0.7}
                                        >
                                            <View style={styles.placeholderContent}>
                                                <MaterialIcons name="track-changes" size={32} color="rgba(255,255,255,0.2)" />
                                                <Text style={styles.placeholderText}>NEW GOAL</Text>
                                            </View>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                        </ScrollView>
                    </View>
                ) : (
                    <SafeAreaView style={[styles.safeArea, styles.safeAreaLandscape]}>
                        <View style={[styles.leftPanel, { width: screenWidth * 0.30 }]}>
                            <View style={styles.analyticsCardWrapper}>
                                <ScrollView showsVerticalScrollIndicator={false} style={styles.leftPanelScroll}>
                                    {/* App Logo Row - Landscape */}
                                    <View style={styles.landscapeLogoSection}>
                                        <Image source={APP_LOGO} style={styles.landscapeLogo} resizeMode="contain" />
                                        <View style={styles.landscapeLogoDivider} />
                                        <Text style={styles.landscapeBrandName}>CHRONOSCAPE</Text>
                                    </View>

                                    {/* View Toggle */}
                                    <View style={styles.landscapeToggleWrapper}>
                                        {renderInfiniteViewToggle(false)}
                                    </View>

                                    {/* Date display (Matching Task Layout) */}
                                    <View style={styles.dateControlRowLandscape}>
                                        <View style={styles.dateLandscapeRow}>
                                            <MaterialIcons name="calendar-today" size={14} color="rgba(255,255,255,0.5)" />
                                            <Text style={styles.dateLandscapeText}>
                                                {`  ${new Date().toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()}`}
                                            </Text>
                                        </View>
                                        <View style={[styles.todayNavBtn, styles.todayNavBtnActive]}>
                                            <MaterialIcons name="today" size={12} color="#4CAF50" />
                                            <Text style={styles.todayNavTextActive}>  TODAY</Text>
                                        </View>
                                    </View>

                                    {/* Metrics Section (Stats Grid Layout from Task) */}
                                    <View style={styles.compactStatsGrid}>
                                        <View style={styles.compactStatRow}>
                                            <View style={styles.compactStatItem}>
                                                <Text style={styles.compactStatLabel}>TOTAL GOALS</Text>
                                                <Text style={styles.compactStatValue}>
                                                    {goals ? goals.filter(g => !g.parentId).length : 0}
                                                </Text>
                                            </View>
                                            <View style={styles.compactStatItem}>
                                                <Text style={styles.compactStatLabel}>STRATEGIC HR</Text>
                                                <Text style={styles.compactStatValue}>{goalHeaderStats.totalHours}</Text>
                                            </View>
                                        </View>
                                    </View>

                                </ScrollView>

                                {/* Footer Actions (Bottom of left capsule - Matching Task) */}
                                <View style={styles.landscapeLeftFooter}>
                                    <View style={styles.footerIconGroup}>
                                        <TouchableOpacity onPress={onSettings} activeOpacity={0.7} style={styles.footerActionBtn}>
                                            <MaterialIcons name="settings" size={20} color="rgba(255,255,255,0.7)" />
                                        </TouchableOpacity>
                                        <NotesIconButton
                                            active={showNotesPanel}
                                            hasNote={selectedDateHasNote}
                                            onPress={() => setShowNotesPanel(!showNotesPanel)}
                                        />
                                    </View>
                                </View>
                            </View>
                        </View>

                        {/* 3. MAIN CONTENT (RIGHT PANEL IN LANDSCAPE - STANDALONE) */}
                        <View style={styles.rightPanel}>
                            <ScrollView
                                style={styles.scrollView}
                                contentContainerStyle={[
                                    styles.scrollContent,
                                    { paddingTop: scrollTopPad },
                                    { paddingBottom: 100 },
                                ]}
                                showsVerticalScrollIndicator={false}
                            >
                                <View style={[styles.dashboardContainer, styles.dashboardContainerLandscape]}>
                                    {goals.filter(g => !g.parentId).map(renderDashboardCard)}
                                </View>
                                {goals.filter(g => !g.parentId).length === 0 && (
                                    <View style={[styles.dashboardContainer, { paddingHorizontal: 20 }]}>
                                        {[1, 2].map(i => (
                                            <TouchableOpacity
                                                key={`empty-goal-${i}`}
                                                style={styles.placeholderCard}
                                                onPress={() => onAddGoal(null, 'goal')}
                                                activeOpacity={0.7}
                                            >
                                                <View style={styles.placeholderContent}>
                                                    <MaterialIcons name="track-changes" size={32} color="rgba(255,255,255,0.2)" />
                                                    <Text style={styles.placeholderText}>NEW GOAL</Text>
                                                </View>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )}
                            </ScrollView>
                        </View>
                    </SafeAreaView>
                )
            ) : (
                /* 4. PORTRAIT CONTENT (MAIN SCROLL) */
                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={[
                        styles.scrollContent,
                        { paddingTop: scrollTopPad },
                        { paddingBottom: 100 },
                    ]}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.dashboardContainer}>
                        {goals.filter(g => !g.parentId).map(renderDashboardCard)}
                    </View>
                    {goals.filter(g => !g.parentId).length === 0 && (
                        <View style={[styles.dashboardContainer, { paddingHorizontal: 20 }]}>
                            {[1, 2].map(i => (
                                <TouchableOpacity
                                    key={`empty-goal-${i}`}
                                    style={styles.placeholderCard}
                                    onPress={() => onAddGoal(null, 'goal')}
                                    activeOpacity={0.7}
                                >
                                    <View style={styles.placeholderContent}>
                                        <MaterialIcons name="track-changes" size={32} color="rgba(255,255,255,0.2)" />
                                        <Text style={styles.placeholderText}>NEW GOAL</Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </ScrollView>
            )}

            {/* Notes Panel Overlay */}
            {showNotesPanel && (
                <View style={styles.notesTakeoverOverlay}>
                    <NotesPanel
                        visible={showNotesPanel}
                        dateKey={selectedLogical}
                        onClose={() => setShowNotesPanel(false)}
                        onPresenceChange={setSelectedDateHasNote}
                    />
                </View>
            )}

            <View style={[
                styles.fabContainer,
                {
                    bottom: isLandscape ? (Math.max(insets.bottom, 16) + 12) : 24,
                    right: isLandscape ? (Math.max(insets.right, 20)) : 24,
                }
            ]}>
                <TouchableOpacity
                    style={styles.fab}
                    onPress={() => onAddGoal(null, 'goal')}
                    activeOpacity={0.75}
                >
                    <MaterialIcons name="add" size={28} color="#000" />
                </TouchableOpacity>
            </View>

            {selectedDayData && (() => {
                const totalMins = selectedDayData.segments.reduce((acc, s) => acc + (s.durationMinutes || 0), 0);
                const grouped = groupSegmentsForDayPopup(selectedDayData.segments);
                const titleShort =
                    selectedDayData.title.length > 40
                        ? `${selectedDayData.title.slice(0, 38)}…`
                        : selectedDayData.title;
                return (
                    <View style={styles.modalOverlay}>
                        <TouchableOpacity
                            style={styles.overlayDismiss}
                            activeOpacity={1}
                            onPress={() => setSelectedDayData(null)}
                        />
                        <View style={styles.detailPopup}>
                            <View style={styles.detailPopupInner}>
                                <View style={styles.popupHeaderCompact}>
                                    <View style={styles.popupHeaderTextBlock}>
                                        <View style={styles.popupDateRow}>
                                            <MaterialIcons name="event" size={12} color="rgba(255, 255, 255, 0.75)" />
                                            <Text style={styles.popupDateCompact}>
                                                {formatDateCompact(selectedDayData.date)}
                                            </Text>
                                            {grouped.length > 0 && (
                                                <View style={styles.popupCountPill}>
                                                    <Text style={styles.popupCountPillText}>{grouped.length}</Text>
                                                </View>
                                            )}
                                            {selectedDayData.segments.length > grouped.length && grouped.length > 0 && (
                                                <Text style={styles.popupCountHint}>
                                                    {selectedDayData.segments.length} parts
                                                </Text>
                                            )}
                                        </View>
                                        <Text style={styles.popupTitleCompact} numberOfLines={1}>
                                            {titleShort}
                                        </Text>
                                    </View>
                                    <TouchableOpacity
                                        onPress={() => setSelectedDayData(null)}
                                        style={styles.popupCloseBtnCompact}
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    >
                                        <MaterialIcons name="close" size={18} color="rgba(255,255,255,0.7)" />
                                    </TouchableOpacity>
                                </View>

                                <ScrollView
                                    style={styles.popupScrollCompact}
                                    contentContainerStyle={styles.popupScrollContentCompact}
                                    showsVerticalScrollIndicator={false}
                                    keyboardShouldPersistTaps="handled"
                                >
                                    {grouped.length > 0 ? (
                                        (() => {
                                            const formatClock = (totalMinutes: number) => {
                                                const h = Math.floor(totalMinutes / 60);
                                                const m = totalMinutes % 60;
                                                return `${h}:${m.toString().padStart(2, '0')}`;
                                            };
                                            const taskGroupsMap = selectedDayData.segments.reduce((acc: any, seg: any) => {
                                                const key = seg.taskId || seg.taskTitle || 'unlinked';
                                                if (!acc[key]) {
                                                    acc[key] = {
                                                        title: seg.taskTitle || 'Untitled Mission',
                                                        totalMinutes: 0,
                                                        segments: []
                                                    };
                                                }
                                                acc[key].segments.push(seg);
                                                acc[key].totalMinutes += (seg.durationMinutes || 0);
                                                return acc;
                                            }, {});
                                            const taskGroups = Object.values(taskGroupsMap) as any[];

                                            return taskGroups.map((group: any, gIdx: number) => (
                                                <View key={`popup-tree-${gIdx}`} style={styles.taskGroupContainer}>
                                                    <View style={styles.taskGroupHeader}>
                                                        <MaterialIcons name="folder-special" size={10} color="rgba(255,255,255,0.7)" />
                                                        <Text style={styles.taskGroupName} numberOfLines={1}>
                                                            {String(group.title).toUpperCase()}
                                                        </Text>
                                                        <Text style={styles.taskGroupTotalTime}>
                                                            {(group.totalMinutes / 60).toFixed(1)}h
                                                        </Text>
                                                    </View>

                                                    <View style={styles.taskGroupTree}>
                                                        {group.segments.map((seg: any, sIdx: number) => {
                                                            const segStatus = String(seg.status || '').toLowerCase();
                                                            const isDone = segStatus === 'done' || segStatus === 'completed';
                                                            const statusColor = isDone ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.58)';
                                                            const startMin = Number(seg.startMin ?? 0);
                                                            const duration = Number(seg.durationMinutes ?? 0);
                                                            const startTimeStr = seg.startMin !== undefined ? formatClock(startMin) : '--:--';
                                                            const endTimeStr = seg.startMin !== undefined ? formatClock(startMin + duration) : '--:--';
                                                            const isLast = sIdx === group.segments.length - 1;

                                                            return (
                                                                <View key={`popup-node-${sIdx}`} style={styles.treeNodeRow}>
                                                                    <View style={styles.treeConnectorContainer}>
                                                                        <View style={[styles.treeVerticalLine, isLast && { bottom: '50%' }]} />
                                                                        <View style={styles.treeHorizontalLine} />
                                                                    </View>
                                                                    <View style={styles.treeContentBody}>
                                                                        <View style={styles.treeNodeMainRow}>
                                                                            <View style={[styles.treeStatusDot, { backgroundColor: statusColor }]} />
                                                                            <Text style={styles.treeNodeName} numberOfLines={1}>
                                                                                {String(seg.stageTitle || 'SEGMENT').toUpperCase()}
                                                                            </Text>
                                                                            <Text style={styles.treeNodeDuration}>
                                                                                {(duration / 60).toFixed(1)}h
                                                                            </Text>
                                                                        </View>
                                                                        <View style={styles.treeNodeSubRow}>
                                                                            <Text style={styles.treeNodeTime}>
                                                                                {startTimeStr} — {endTimeStr}
                                                                            </Text>
                                                                            <Text style={[styles.treeNodeStatusText, { color: statusColor }]}>
                                                                                {isDone ? 'DONE' : 'ACTIVE'}
                                                                            </Text>
                                                                        </View>
                                                                    </View>
                                                                </View>
                                                            );
                                                        })}
                                                    </View>
                                                </View>
                                            ));
                                        })()
                                    ) : (
                                        <View style={styles.emptyLogCompact}>
                                            <MaterialIcons name="event-busy" size={20} color="rgba(255,255,255,0.12)" />
                                            <Text style={styles.emptyLogTextCompact}>No segments this day</Text>
                                        </View>
                                    )}
                                </ScrollView>

                                <View style={styles.popupFooterCompact}>
                                    <Text style={styles.totalLabelCompact}>Total</Text>
                                    <Text style={styles.totalValCompact}>
                                        {Math.floor(totalMins / 60)}h {totalMins % 60}m
                                    </Text>
                                </View>
                            </View>
                        </View>
                    </View>
                );
            })()}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    statusBarMask: {
        width: '100%',
        backgroundColor: '#000',
    },
    headerGradientFade: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 140, // Fade out content smoothly as it scrolls up
        zIndex: -1,
    },
    // Unified Header Styles
    headerCardPortrait: {
        marginHorizontal: 16,
        marginTop: 10,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 24,
        backgroundColor: '#0c0c0f',
        borderWidth: 1,
        borderColor: 'rgba(0, 229, 255, 0.07)',
        shadowColor: '#00E5FF',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
    },
    toggleWithCountRowPortrait: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        marginBottom: 10,
    },
    toggleClusterPortrait: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        minWidth: 0,
        gap: 6,
        marginRight: 8,
    },
    portraitLogoWrapper: {
        width: 32,
        height: 32,
        marginRight: 4,
        justifyContent: 'center',
        alignItems: 'center',
    },
    portraitLogo: {
        width: 32,
        height: 32,
    },
    headerRightActionsPortrait: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    headerCollapseBtnTop: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    dateControlRowPortrait: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
    },
    goalHeaderMetricsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    goalHeaderMetricCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.3)',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        gap: 6,
    },
    goalHeaderMetricLabel: {
        fontSize: 7,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 1,
    },
    goalHeaderMetricValue: {
        fontSize: 10,
        fontWeight: '900',
        color: '#fff',
    },
    headerIconBtnPortrait: {
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    separatorContainer: {
        paddingHorizontal: 40,
        marginVertical: 10,
        backgroundColor: '#000',
    },
    separator: {
        height: 1,
    },
    emptyBoxTitle: {
        fontSize: 16,
        fontWeight: '900',
        color: '#fff',
        letterSpacing: 2,
        marginTop: 20,
        marginBottom: 8,
    },
    emptyBoxText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.3)',
        textAlign: 'center',
        lineHeight: 18,
    },
    rebootBtn: {
        marginTop: 32,
        width: '100%',
    },
    rebootBtnGradient: {
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
    },
    rebootText: {
        fontSize: 12,
        fontWeight: '900',
        color: '#000',
        letterSpacing: 1,
    },
    fabContainer: {
        position: 'absolute',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    fab: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        elevation: 8,
        shadowColor: '#000',
        shadowOpacity: 0.35,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
    },
    fabSecondary: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(30,30,32,0.9)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        elevation: 4,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
    },
    headerLogoContainer: {
        paddingLeft: 4,
    },
    headerLogo: {
        width: 32,
        height: 32,
    },
    headerToggleContainer: {
        flex: 1,
        justifyContent: 'center',
    },
    viewToggleContainer: {
        flex: 1,
        flexDirection: 'row',
        backgroundColor: 'rgba(15, 15, 15, 0.5)',
        borderRadius: 12,
        padding: 2,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        gap: 0,
    },
    viewToggleContainerPortrait: {
        minWidth: 0,
    },
    viewToggleContainerInteracting: {
        borderColor: 'rgba(255, 255, 255, 0.2)',
        backgroundColor: 'rgba(20, 20, 20, 0.8)',
    },
    viewToggleBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingVertical: 8,
        paddingHorizontal: 8,
        borderRadius: 10,
        backgroundColor: 'transparent',
    },
    viewToggleBtnActive: {
        backgroundColor: '#fff',
    },
    viewToggleText: {
        fontSize: 9,
        fontWeight: '800',
        color: 'rgba(255, 255, 255, 0.4)',
        letterSpacing: 0.8,
    },
    viewToggleTextActive: {
        color: '#000',
        fontWeight: '900',
    },
    viewToggleContainerCompact: {
        flex: 1,
        flexDirection: 'row',
        backgroundColor: 'rgba(15, 15, 15, 0.5)',
        borderRadius: 12,
        padding: 2,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        overflow: 'hidden',
    },
    viewToggleContainerCompactInteracting: {
        borderColor: 'rgba(255, 255, 255, 0.2)',
        backgroundColor: 'rgba(20, 20, 20, 0.8)',
    },
    viewToggleScroll: {
        flex: 1,
    },
    viewToggleScrollContent: {
        alignItems: 'center',
    },
    viewToggleBtnCompact: {
        flex: 1,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 1,
    },
    viewToggleBtnInner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
    },
    viewToggleBtnCompactActive: {
        backgroundColor: '#fff',
    },
    viewToggleButtonsOverlay: {
        zIndex: 10,
    },
    viewToggleTextCompact: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 0.8,
    },
    viewToggleTextActiveCompact: {
        color: '#000',
        fontWeight: '900',
    },
    viewToggleSlider: {
        position: 'absolute',
        top: 2,
        bottom: 2,
        left: 2,
        backgroundColor: '#fff',
        borderRadius: 10,
        zIndex: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
        elevation: 4,
    },
    headerActionsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginLeft: 8,
    },
    headerActionBtn: {
        width: 32,
        height: 32,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.04)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    headerActionBtnActive: {
        backgroundColor: 'rgba(76, 175, 80, 0.08)',
        borderColor: 'rgba(76, 175, 80, 0.2)',
    },
    headerActionBtnActiveBW: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderColor: 'rgba(255, 255, 255, 0.3)',
    },
    notesTakeoverOverlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 2000,
        backgroundColor: '#000',
    },
    scrollView: {
        flex: 1,
        zIndex: 0,
    },
    scrollContent: {
        padding: 16,
    },
    scrollContentLandscape: {
        paddingHorizontal: 20,
    },
    dashboardContainer: {
        gap: 12,
    },
    dashboardContainerLandscape: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dashboardCardWrapper: {
        width: '100%',
        marginBottom: 4,
    },
    /** Matches Task screen `taskCardBezel` — recessed 3D frame on true black */
    goalCardBezel: {
        borderRadius: 32,
        padding: 4,
        backgroundColor: '#0a0a0a',
        borderColor: 'rgba(255,255,255,0.14)',
        borderWidth: 1.5,
        overflow: 'hidden',
        position: 'relative',
    },
    goalCardBezelLandscape: {
        borderRadius: 24,
        padding: 3,
    },
    goalCardOuterBoundaryHighlight: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 32,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    goalCardOuterBoundaryHighlightLandscape: {
        borderRadius: 24,
    },
    /** Inner face — matches `taskCardTrack` radii */
    goalCardBlurTrack: {
        borderRadius: 28,
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: '#000000',
    },
    goalCardBlurTrackLandscape: {
        borderRadius: 20,
    },
    goalCardInteriorShadow: {
        ...StyleSheet.absoluteFillObject,
        borderBottomWidth: 2,
        borderRightWidth: 1,
        borderColor: 'rgba(0,0,0,0.25)',
        borderRadius: 28,
    },
    goalCardInteriorShadowLandscape: {
        borderRadius: 20,
    },
    goalCardTopRim: {
        ...StyleSheet.absoluteFillObject,
        borderTopWidth: 1,
        borderLeftWidth: 0.5,
        borderColor: 'rgba(255,255,255,0.15)',
        borderRadius: 28,
    },
    goalCardTopRimLandscape: {
        borderRadius: 20,
    },
    dashboardCardCollapsed: {
        minHeight: 108,
    },
    dashboardCardCollapsedMenuOpen: {
        minHeight: 164,
    },
    cardContent: {
        paddingVertical: 12,
        paddingHorizontal: 12,
    },
    cardContentCollapsed: {
        paddingVertical: 10,
        paddingHorizontal: 10,
    },
    hudBody: {
        flexDirection: 'column',
    },
    goalCardAccentLine: {
        height: 2,
        borderRadius: 999,
        marginBottom: 8,
        width: '72%',
    },
    goalCardHeaderMinimal: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
        paddingBottom: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(0, 229, 255, 0.12)',
    },
    headerTapArea: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    goalCardHeaderIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(0, 229, 255, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(0, 229, 255, 0.18)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    goalCardHeaderTextCol: {
        flex: 1,
        minWidth: 0,
        gap: 2,
    },
    goalCardTitleCompact: {
        fontSize: 14,
        fontWeight: '800',
        color: '#fff',
        letterSpacing: 0.2,
    },
    goalCardMetaCompact: {
        fontSize: 9,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.42)',
    },
    missionTimeline: {
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderRadius: 16,
        padding: 14,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    timelineLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    timelinePill: {
        gap: 2,
    },
    timelinePillLabel: {
        fontSize: 7,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.25)',
        letterSpacing: 1.5,
    },
    timelinePillVal: {
        fontSize: 11,
        fontWeight: '700',
        color: '#fff',
    },
    progressCounterText: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 10,
        alignItems: 'center',
    },
    progressLabel: {
        fontSize: 7,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 1,
    },
    progressValue: {
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 1,
    },
    segmentedProgressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        height: 6,
    },
    progressSegment: {
        flex: 1,
        borderRadius: 2,
    },
    integratedActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginLeft: 'auto',
    },
    hudActionBtnMinimal: {
        width: 32,
        height: 32,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    tacticalTooltip: {
        position: 'absolute',
        top: 38,
        right: 0,
        width: 110,
        borderRadius: 14,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        zIndex: 1000,
    },
    tooltipItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        gap: 8,
    },
    tooltipText: {
        fontSize: 8,
        fontWeight: '900',
        color: '#fff',
        letterSpacing: 1,
    },
    tooltipSeparator: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },




    hudRightUnified: {
        flex: 1,
    },
    hudRightLandscapeUnified: {
        flex: 1,
        marginTop: 0,
    },
    tasksScrollUnified: {
        flex: 1,
    },
    tasksContainerUnified: {
        gap: 10,
    },
    tasksContainerHorizontalUnified: {
        flexDirection: 'row',
    },
    deploymentDeckScroll: {
        marginBottom: 6,
    },
    deploymentDeckContent: {
        paddingRight: 20,
        gap: 8,
    },
    miniTaskCardHorizontal: {
        width: 150,
        backgroundColor: '#0c0e12',
        borderRadius: 12,
        padding: 8,
        paddingLeft: 9,
        borderWidth: 1,
        borderColor: 'rgba(0, 229, 255, 0.12)',
        borderLeftWidth: 3,
        borderLeftColor: 'rgba(0, 229, 255, 0.45)',
        position: 'relative',
        overflow: 'hidden',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.45,
                shadowRadius: 8,
            },
            android: { elevation: 3 },
            default: {},
        }),
    },
    miniTaskCardSelected: {
        borderColor: 'rgba(0, 229, 255, 0.45)',
        backgroundColor: 'rgba(0, 229, 255, 0.09)',
        borderLeftColor: '#00E5FF',
    },
    miniTaskHeaderCompact: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        marginBottom: 4,
    },
    statusIndicatorSmall: {
        width: 4,
        height: 4,
        borderRadius: 2,
    },
    miniTaskTitleCompact: {
        fontSize: 9,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.6)',
        letterSpacing: 0.5,
        flex: 1,
    },
    miniTaskMidCompact: {
        marginBottom: 4,
    },
    miniTaskMetaCompact: {
        fontSize: 7,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.2)',
        letterSpacing: 0.5,
    },
    miniTaskFooterCompact: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 6,
    },
    taskStatusPillsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        marginBottom: 6,
    },
    taskStatusPill: {
        flex: 1,
        borderRadius: 4,
        paddingVertical: 2,
        paddingHorizontal: 3,
        borderWidth: 1,
    },
    taskStatusPillDone: {
        backgroundColor: 'rgba(0,230,118,0.14)',
        borderColor: 'rgba(0,230,118,0.28)',
    },
    taskStatusPillActive: {
        backgroundColor: 'rgba(255,202,40,0.14)',
        borderColor: 'rgba(255,202,40,0.28)',
    },
    taskStatusPillLeft: {
        backgroundColor: 'rgba(120,132,156,0.16)',
        borderColor: 'rgba(120,132,156,0.3)',
    },
    taskStatusPillText: {
        fontSize: 5,
        fontWeight: '900',
        letterSpacing: 0.35,
        color: 'rgba(255,255,255,0.9)',
        textAlign: 'center',
    },
    miniProgressBarTrackCompact: {
        flex: 1,
        height: 2,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 1,
        overflow: 'hidden',
        flexDirection: 'row',
    },
    miniProgressBarTrackStatus: {
        height: 3,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    miniProgressBarFillCompact: {
        height: '100%',
        borderRadius: 1,
    },
    miniProgressSegment: {
        height: '100%',
    },
    miniProgressSegmentDone: {
        backgroundColor: '#00E676',
    },
    miniProgressSegmentActive: {
        backgroundColor: '#FFCA28',
    },
    miniProgressSegmentLeft: {
        backgroundColor: 'rgba(120,132,156,0.9)',
    },
    miniPercentTextCompact: {
        fontSize: 7,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.3)',
    },
    selectedIndicatorBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 3,
        backgroundColor: '#00E5FF',
    },
    unifiedAnalyticsPanel: {
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(0, 229, 255, 0.2)',
        padding: 8,
        backgroundColor: '#05070a',
        borderLeftWidth: 2,
        borderLeftColor: 'rgba(0, 229, 255, 0.45)',
    },
    analyticsHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    analyticsLabelText: {
        fontSize: 7,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 1.1,
    },
    unlinkActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: 'rgba(255,82,82,0.05)',
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: 'rgba(255,82,82,0.1)',
    },
    unlinkActionText: {
        fontSize: 6,
        fontWeight: '900',
        color: '#FF5252',
        letterSpacing: 0.8,
    },

    microMetricsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(0, 229, 255, 0.05)',
        borderRadius: 8,
        padding: 8,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: 'rgba(0, 229, 255, 0.12)',
    },
    microMetric: {
        alignItems: 'center',
        flex: 1,
    },
    microMetricLabel: {
        fontSize: 5,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.2)',
        letterSpacing: 0.8,
        marginBottom: 1,
    },
    microMetricVal: {
        fontSize: 9,
        fontWeight: '900',
        color: '#fff',
    },
    metricDivider: {
        width: 1,
        height: 10,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    miniTaskPercent: {
        fontSize: 9,
        fontWeight: '900',
    },
    priorityTag: {
        fontSize: 8,
        fontWeight: '900',
        letterSpacing: 0.5,
    },
    emptyTasksHUDUnified: {
        height: 90,
        borderRadius: 14,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: 'rgba(0, 229, 255, 0.22)',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: '100%',
        backgroundColor: 'rgba(0, 229, 255, 0.04)',
    },
    emptyTasksHUDTextUnified: {
        fontSize: 8,
        fontWeight: '900',
        color: 'rgba(0, 229, 255, 0.35)',
        letterSpacing: 2,
    },
    emptySection: {
        paddingTop: 80,
    },
    emptyBox: {
        padding: 40,
        borderRadius: 32,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    placeholderCard: {
        width: '100%',
        minHeight: 120,
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
        borderRadius: 24,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: 'rgba(255, 255, 255, 0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        marginVertical: 10,
    },
    placeholderContent: {
        alignItems: 'center',
        gap: 12,
    },
    placeholderText: {
        fontSize: 12,
        fontWeight: '900',
        color: 'rgba(255, 255, 255, 0.3)',
        letterSpacing: 2,
    },
    compactMissionFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 8,
        marginTop: 8,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(0, 229, 255, 0.1)',
    },
    statusPillGroup: {
        flexDirection: 'row',
        gap: 8,
    },
    compactPill: {
        backgroundColor: 'rgba(255,255,255,0.04)',
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 8,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(0, 229, 255, 0.15)',
    },
    compactPillLabel: {
        fontSize: 5,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.2)',
        letterSpacing: 1,
    },
    compactPillVal: {
        fontSize: 8,
        fontWeight: '900',
        color: '#fff',
    },
    compactProgressSection: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
        justifyContent: 'flex-end',
    },
    slimProgressBarTrack: {
        height: 2,
        backgroundColor: 'rgba(255,255,255,0.05)',
        width: 80,
        borderRadius: 1,
        overflow: 'hidden',
    },
    slimProgressBarFill: {
        height: '100%',
        borderRadius: 1,
    },
    compactProgressText: {
        fontSize: 8,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 1,
    },
    minimizedSummaryWrap: {
        marginTop: 2,
        gap: 6,
    },
    minimizedSummaryTop: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    minimizedInfoPill: {
        flex: 1,
        borderRadius: 11,
        borderWidth: 1,
        paddingHorizontal: 8,
        paddingVertical: 6,
        minWidth: 0,
    },
    minimizedInfoPillLinked: {
        backgroundColor: 'rgba(0, 229, 255, 0.07)',
        borderColor: 'rgba(0, 229, 255, 0.22)',
        borderLeftWidth: 2,
        borderLeftColor: '#00E5FF',
    },
    minimizedInfoPillDone: {
        backgroundColor: 'rgba(0, 230, 118, 0.08)',
        borderColor: 'rgba(0, 230, 118, 0.22)',
        borderLeftWidth: 2,
        borderLeftColor: '#00E676',
    },
    minimizedInfoPillLeft: {
        backgroundColor: 'rgba(144, 164, 194, 0.08)',
        borderColor: 'rgba(144, 164, 194, 0.2)',
        borderLeftWidth: 2,
        borderLeftColor: 'rgba(180, 198, 224, 0.75)',
    },
    minimizedInfoValueGreen: {
        color: '#69F0AE',
    },
    minimizedInfoValueSlate: {
        color: '#CFD8DC',
    },
    minimizedInfoLabel: {
        fontSize: 7,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.35)',
        letterSpacing: 0.9,
    },
    minimizedInfoValue: {
        fontSize: 9,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.92)',
        marginTop: 2,
    },
    minimizedProgressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingTop: 2,
    },
    minimizedGoalStatusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        marginBottom: 4,
    },
    minimizedRangeText: {
        fontSize: 8,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.45)',
        flexShrink: 1,
        textAlign: 'right',
    },
    goalStatusPill: {
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderWidth: 1,
    },
    goalStatusPillDone: {
        backgroundColor: 'rgba(0,230,118,0.14)',
        borderColor: 'rgba(0,230,118,0.35)',
    },
    goalStatusPillActive: {
        backgroundColor: 'rgba(255,202,40,0.14)',
        borderColor: 'rgba(255,202,40,0.35)',
    },
    goalStatusPillPending: {
        backgroundColor: 'rgba(120,132,156,0.16)',
        borderColor: 'rgba(120,132,156,0.35)',
    },
    goalStatusPillFailed: {
        backgroundColor: 'rgba(255,82,82,0.14)',
        borderColor: 'rgba(255,82,82,0.35)',
    },
    goalStatusText: {
        fontSize: 7,
        fontWeight: '900',
        letterSpacing: 0.9,
    },
    goalStatusTextDone: {
        color: '#00E676',
    },
    goalStatusTextActive: {
        color: '#FFCA28',
    },
    goalStatusTextPending: {
        color: 'rgba(206,214,230,0.9)',
    },
    goalStatusTextFailed: {
        color: '#FF6E6E',
    },
    minimizedMenuRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 8,
    },
    minimizedMenuBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
        backgroundColor: 'rgba(255,255,255,0.05)',
        paddingVertical: 8,
    },
    minimizedMenuBtnDanger: {
        borderColor: 'rgba(255,110,110,0.24)',
        backgroundColor: 'rgba(255,82,82,0.08)',
    },
    minimizedMenuText: {
        fontSize: 8,
        fontWeight: '900',
        letterSpacing: 1,
        color: 'rgba(255,255,255,0.82)',
    },
    minimizedMenuTextDanger: {
        color: '#FF6E6E',
    },
    activityContent: {
        marginTop: 6,
    },
    activityContentMinimal: {
        marginTop: 2,
    },
    combinedSystemGraphWrapperMinimal: {
        marginBottom: 6,
        borderRadius: 10,
        paddingHorizontal: 6,
        paddingTop: 8,
        paddingBottom: 6,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(0, 229, 255, 0.1)',
        backgroundColor: '#020203',
        position: 'relative',
    },
    goalExpandedFooter: {
        marginTop: 4,
        paddingTop: 6,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(0, 229, 255, 0.1)',
        gap: 5,
    },
    goalFooterRowPrimary: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        rowGap: 6,
        columnGap: 8,
    },
    goalFooterDateGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        flexShrink: 0,
    },
    compactPillFooter: {
        backgroundColor: 'rgba(255,255,255,0.035)',
        paddingHorizontal: 5,
        paddingVertical: 3,
        borderRadius: 6,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(0, 229, 255, 0.12)',
    },
    compactPillFooterLabel: {
        fontSize: 4,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.28)',
        letterSpacing: 0.6,
    },
    compactPillFooterVal: {
        fontSize: 7,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.88)',
        marginTop: 1,
    },
    goalFooterMetricsGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 3,
        flex: 1,
        justifyContent: 'flex-end',
        minWidth: 0,
    },
    goalStatusPillFooter: {
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    goalStatusTextFooter: {
        fontSize: 6,
        letterSpacing: 0.5,
    },
    goalFooterMetricSep: {
        fontSize: 8,
        color: 'rgba(255,255,255,0.18)',
        fontWeight: '600',
        marginHorizontal: -1,
    },
    goalFooterMetricChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    goalFooterMetricChipLabel: {
        fontSize: 6,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.32)',
        letterSpacing: 0.3,
    },
    goalFooterMetricChipValCyan: {
        fontSize: 9,
        fontWeight: '900',
        color: '#00E5FF',
        fontVariant: ['tabular-nums'],
    },
    goalFooterMetricChipValGreen: {
        fontSize: 9,
        fontWeight: '900',
        color: '#69F0AE',
        fontVariant: ['tabular-nums'],
    },
    goalFooterMetricChipValSlate: {
        fontSize: 9,
        fontWeight: '900',
        color: '#B0BEC5',
        fontVariant: ['tabular-nums'],
    },
    goalFooterRowProgress: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    goalFooterProgressPct: {
        fontSize: 9,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.55)',
        letterSpacing: 0.3,
        fontVariant: ['tabular-nums'],
        minWidth: 32,
        textAlign: 'right',
    },
    slimProgressBarTrackWide: {
        flex: 1,
        height: 2,
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderRadius: 1,
        overflow: 'hidden',
        minWidth: 0,
    },
    graphWrapper: {
        marginBottom: 6,
    },
    graphChartPanel: {
        borderRadius: 10,
        overflow: 'hidden',
        paddingHorizontal: 6,
        paddingVertical: 8,
        marginTop: 4,
        borderWidth: 1,
        borderColor: 'rgba(0, 229, 255, 0.1)',
        backgroundColor: '#050608',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.4,
                shadowRadius: 8,
            },
            android: { elevation: 4 },
            default: {},
        }),
    },
    graphChartPanelMinimal: {
        paddingHorizontal: 5,
        paddingVertical: 5,
        marginTop: 2,
        borderRadius: 7,
    },
    graphScroll: {
        flex: 1,
    },
    graphContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 4,
        paddingHorizontal: 4,
    },
    graphContainerMinimal: {
        gap: 3,
        paddingHorizontal: 2,
    },
    barOuter: {
        alignItems: 'stretch',
        width: 16,
    },
    barOuterMinimal: {
        width: 13,
    },
    barTrackColumn: {
        flex: 1,
        width: '100%',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    barContainer: {
        width: '100%',
        justifyContent: 'flex-end',
        alignItems: 'center',
        backgroundColor: '#2a2f3c',
        borderRadius: 4,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
    },
    barContainerToday: {
        backgroundColor: '#343a4a',
        borderColor: 'rgba(0, 229, 255, 0.4)',
    },
    barContainerTodayHighlight: {
        borderWidth: 2,
        borderColor: 'rgba(0, 229, 255, 0.85)',
        backgroundColor: 'rgba(0, 229, 255, 0.1)',
        ...Platform.select({
            ios: {
                shadowColor: '#00E5FF',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.45,
                shadowRadius: 6,
            },
            default: {},
        }),
    },
    barFill: {
        width: '100%',
        borderRadius: 2,
    },
    barFillToday: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(255,255,255,0.35)',
    },
    barDate: {
        fontSize: 6,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.5)',
        textAlign: 'center',
    },
    barDateColumn: {
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 2,
    },
    barDateTodayNum: {
        color: '#00E5FF',
        fontSize: 7,
        fontWeight: '900',
        lineHeight: 10,
        textAlign: 'center',
    },
    graphSubLabel: {
        fontSize: 7,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.62)',
        letterSpacing: 1,
        marginBottom: 2,
        textTransform: 'uppercase',
    },
    barHrLabel: {
        position: 'absolute',
        top: 2,
        fontSize: 5,
        fontWeight: '900',
        color: '#000',
        textAlign: 'center',
    },
    miniTaskTitleSection: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        flex: 1,
    },
    taskActionIcons: {
        flexDirection: 'row',
        gap: 8,
        marginLeft: 4,
    },
    taskSpecificGraphSection: {
        marginTop: 15,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.05)',
        paddingTop: 10,
    },
    graphHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    graphHeaderRowMinimal: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: 18,
        marginBottom: 4,
        position: 'relative',
    },
    graphHeaderMinimalCenter: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    expandToggleBtnMinimal: {
        padding: 2,
        borderRadius: 4,
    },
    expandToggleBtnMinimalRight: {
        position: 'absolute',
        right: 0,
        padding: 2,
        borderRadius: 4,
    },
    graphLegendText: {
        fontSize: 7,
        fontWeight: '900',
        letterSpacing: 1,
    },
    barHrPill: {
        position: 'absolute',
        top: 2,
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 3,
        paddingVertical: 1,
        borderRadius: 4,
    },
    barHrLabelText: {
        fontSize: 5,
        fontWeight: '900',
        color: '#fff',
        textAlign: 'center',
    },
    mathGraphMain: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    mathGraphMainMinimal: {
        marginTop: -1,
    },
    yAxisContainer: {
        width: 25,
        alignItems: 'flex-end',
        paddingRight: 4,
        marginTop: 0,
        position: 'relative',
    },
    yAxisContainerMinimal: {
        width: 20,
        paddingRight: 2,
    },
    yAxisLabel: {
        fontSize: 7,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.52)',
    },
    gridLine: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.16)',
        zIndex: 0,
    },
    expandToggleBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.08)',
        paddingHorizontal: 5,
        paddingVertical: 2,
        borderRadius: 4,
        gap: 3,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
    },
    expandToggleText: {
        fontSize: 7,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.4)',
    },
    modalOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.72)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2500,
        paddingHorizontal: 20,
    },
    overlayDismiss: {
        ...StyleSheet.absoluteFillObject,
    },
    detailPopup: {
        width: '100%',
        maxWidth: 340,
        maxHeight: '62%',
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.18)',
        backgroundColor: '#0b0b0e',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 12 },
                shadowOpacity: 0.5,
                shadowRadius: 24,
            },
            android: { elevation: 16 },
            default: {},
        }),
    },
    detailPopupInner: {
        paddingHorizontal: 14,
        paddingTop: 12,
        paddingBottom: 12,
    },
    popupHeaderCompact: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 8,
        marginBottom: 10,
        paddingBottom: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    },
    popupHeaderTextBlock: {
        flex: 1,
        minWidth: 0,
    },
    popupDateRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
        marginBottom: 3,
    },
    popupDateCompact: {
        fontSize: 11,
        fontWeight: '800',
        color: 'rgba(255, 255, 255, 0.94)',
        letterSpacing: 0.4,
    },
    popupCountPill: {
        minWidth: 18,
        height: 18,
        paddingHorizontal: 5,
        borderRadius: 6,
        backgroundColor: 'rgba(255, 255, 255, 0.12)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    popupCountPillText: {
        fontSize: 9,
        fontWeight: '900',
        color: 'rgba(255, 255, 255, 0.65)',
    },
    popupCountHint: {
        fontSize: 8,
        fontWeight: '700',
        color: 'rgba(255, 255, 255, 0.28)',
        marginLeft: 2,
    },
    popupTitleCompact: {
        fontSize: 12,
        fontWeight: '700',
        color: 'rgba(255, 255, 255, 0.62)',
    },
    popupCloseBtnCompact: {
        width: 28,
        height: 28,
        borderRadius: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: -2,
    },
    popupScrollCompact: {
        maxHeight: 310,
    },
    popupScrollContentCompact: {
        paddingBottom: 8,
        gap: 0,
    },
    logGroupCard: {
        flexDirection: 'row',
        alignItems: 'stretch',
        backgroundColor: 'rgba(255, 255, 255, 0.035)',
        borderRadius: 10,
        marginBottom: 6,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.06)',
    },
    logRowAccent: {
        width: 3,
    },
    logGroupBody: {
        flex: 1,
        paddingVertical: 8,
        paddingHorizontal: 10,
        paddingRight: 8,
        minWidth: 0,
    },
    logGroupTopRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 8,
    },
    logGroupTaskTitle: {
        flex: 1,
        fontSize: 12,
        fontWeight: '800',
        color: '#fff',
        lineHeight: 15,
    },
    logGroupDuration: {
        fontSize: 11,
        fontWeight: '900',
        color: 'rgba(0, 229, 255, 0.9)',
        marginTop: 1,
    },
    logGroupMeta: {
        fontSize: 9,
        fontWeight: '600',
        color: 'rgba(255, 255, 255, 0.4)',
        marginTop: 4,
    },
    logStageChipsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 4,
        marginTop: 6,
    },
    logStageChip: {
        maxWidth: '100%',
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 5,
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    logStageChipText: {
        fontSize: 8,
        fontWeight: '800',
        color: 'rgba(255, 255, 255, 0.72)',
    },
    emptyLogCompact: {
        alignItems: 'center',
        paddingVertical: 20,
        gap: 6,
    },
    emptyLogTextCompact: {
        fontSize: 10,
        fontWeight: '700',
        color: 'rgba(255, 255, 255, 0.22)',
    },
    popupFooterCompact: {
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(255, 255, 255, 0.14)',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    totalLabelCompact: {
        fontSize: 9,
        fontWeight: '800',
        color: 'rgba(255, 255, 255, 0.35)',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
    },
    totalValCompact: {
        fontSize: 13,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.95)',
        fontVariant: ['tabular-nums'],
    },
    inlineGraphSection: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.05)',
        marginBottom: 8,
    },
    // LANDSCAPE LAYOUT STYLES - MATCHING TASK/TIMER EXACTLY
    safeArea: {
        flex: 1,
    },
    safeAreaLandscape: {
        flex: 1,
        flexDirection: 'row',
    },
    landscapeContainer: {
        flex: 1,
        flexDirection: 'row',
    },
    leftPanel: {
        paddingHorizontal: 0,
        paddingVertical: 0,
    },
    analyticsCardWrapper: {
        flex: 1,
        padding: 15,
        borderRadius: 24,
        backgroundColor: 'rgba(10, 10, 10, 0.7)',
        borderWidth: 1,
        borderColor: 'rgba(17, 17, 17, 0.08)',
        justifyContent: 'space-between',
    },
    leftPanelScroll: {
        flex: 1,
    },
    rightPanel: {
        flex: 1,
    },
    landscapeLogoSection: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
        paddingHorizontal: 4,
    },
    landscapeLogo: {
        width: 26,
        height: 26,
    },
    landscapeLogoDivider: {
        width: 1,
        height: 16,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    landscapeBrandName: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 10,
        letterSpacing: 2,
        fontWeight: '600',
    },
    landscapeToggleWrapper: {
        marginBottom: 12,
    },
    dateControlRowLandscape: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    dateLandscapeRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    dateLandscapeText: {
        fontSize: 12,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.5)',
        lineHeight: 16,
    },
    todayNavBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    todayNavBtnActive: {
        backgroundColor: 'rgba(76, 175, 80, 0.08)',
        borderColor: 'rgba(76, 175, 80, 0.2)',
    },
    todayNavTextActive: {
        fontSize: 9,
        fontWeight: '800',
        color: '#4CAF50',
        marginLeft: 3,
        letterSpacing: 0.5,
    },
    compactStatsGrid: {
        marginBottom: 16,
    },
    compactStatRow: {
        flexDirection: 'row',
        gap: 8,
    },
    compactStatItem: {
        flex: 1,
        padding: 10,
        borderRadius: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    compactStatLabel: {
        fontSize: 8,
        fontWeight: '700',
        color: 'rgba(255, 255, 255, 0.4)',
        letterSpacing: 0.8,
        marginBottom: 4,
    },
    compactStatValue: {
        fontSize: 14,
        fontWeight: '700',
        color: '#fff',
    },
    landscapeLeftFooter: {
        paddingTop: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    footerIconGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 0,
    },
    footerActionBtn: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    detailedReportsBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        paddingHorizontal: 4,
    },
    detailedReportsText: {
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 0.5,
        color: 'rgba(255,255,255,0.5)',
        lineHeight: 14,
    },
    // NEW ANALYTICS TOGGLE STYLES
    graphControllerContainer: {
        width: '100%',
    },
    graphControllerContainerMinimal: {
        marginBottom: 0,
    },
    graphMinimalToolbar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        marginBottom: 3,
    },
    graphContentArea: {
        width: '100%',
    },
    graphViewToggleContainer: {
        flexDirection: 'row',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        borderRadius: 8,
        padding: 2,
        marginBottom: 10,
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderColor: 'rgba(0, 229, 255, 0.12)',
    },
    graphViewToggleContainerMinimal: {
        marginBottom: 0,
        alignSelf: 'center',
        padding: 1,
        borderRadius: 7,
    },
    graphViewToggleBtn: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
    },
    graphViewToggleBtnMinimal: {
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 5,
    },
    graphViewToggleBtnActive: {
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    graphViewToggleText: {
        fontSize: 7,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.25)',
        letterSpacing: 1,
    },
    graphViewToggleTextMinimal: {
        fontSize: 6,
        letterSpacing: 0.8,
    },
    graphViewToggleTextActive: {
        color: '#00E5FF',
    },
    monthlyAnalyticsContainer: {
        flexDirection: 'row',
        backgroundColor: '#030305',
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: 'rgba(0, 229, 255, 0.12)',
        minHeight: 180,
    },
    analyticsStatsSide: {
        flex: 1,
        justifyContent: 'space-between',
        paddingRight: 12,
        borderRightWidth: 1,
        borderRightColor: 'rgba(0, 229, 255, 0.08)',
    },
    analyticsTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 8,
    },
    analyticsTitleText: {
        fontSize: 9,
        fontWeight: '900',
        color: '#00E5FF',
        letterSpacing: 1.5,
    },
    statLargeGroup: {
        marginBottom: 12,
    },
    statLabelMini: {
        fontSize: 7,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 1,
        marginBottom: 2,
    },
    statValueLarge: {
        fontSize: 28,
        fontWeight: '900',
        color: '#fff',
    },
    statUnit: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        fontWeight: '600',
    },
    statSmallRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 12,
    },
    statSmallItem: {
        flex: 1,
    },
    statValueMed: {
        fontSize: 14,
        fontWeight: '800',
        color: '#fff',
    },
    analyticsLegendBottom: {
        gap: 4,
    },
    legendItemMini: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    legendDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
    },
    legendTextMini: {
        fontSize: 8,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.45)',
    },
    analyticsCalendarSide: {
        flex: 1.4,
        paddingLeft: 12,
    },
    calendarMonthHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
        height: 32,
        width: '100%',
    },
    monthScrollContent: {
        gap: 6,
        paddingRight: 20,
        alignItems: 'center',
    },
    monthBubble: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    monthBubbleActive: {
        backgroundColor: '#00E676',
        borderColor: 'rgba(255,255,255,0.1)',
    },
    monthBubbleText: {
        fontSize: 9,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.3)',
    },
    monthBubbleTextActive: {
        color: '#000',
    },
    monthDataDot: {
        width: 3,
        height: 3,
        borderRadius: 1.5,
        backgroundColor: '#00E676',
        position: 'absolute',
        top: 4,
        right: 4,
    },
    calendarGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    calendarDayHeader: {
        width: '14.28%',
        textAlign: 'center',
        fontSize: 8,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.2)',
        marginBottom: 8,
    },
    calendarDayCell: {
        width: '14.28%',
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 2,
    },
    dayCircle: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayCircleActive: {
        backgroundColor: '#00E676',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    dayCircleCompleted: {
        backgroundColor: '#00E676',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    dayCircleIncomplete: {
        backgroundColor: '#FF5252',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    dayCircleToday: {
        borderWidth: 1.5,
        borderColor: '#00E5FF',
    },
    dayCircleSelected: {
        borderWidth: 2,
        borderColor: '#00E5FF',
        shadowColor: '#00E5FF',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 4,
    },
    calendarDayText: {
        fontSize: 9,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.4)',
    },
    calendarDayTextActive: {
        color: '#000',
        fontWeight: '800',
    },
    calendarDayTextSelected: {
        color: '#00E5FF',
        fontWeight: '900',
    },
    dayDurationText: {
        position: 'absolute',
        bottom: -6,
        fontSize: 6,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.4)',
    },
    // DETAIL OVERLAY STYLES
    dayDetailOverlay: {
        borderRadius: 12,
        overflow: 'hidden',
    },
    dayDetailContent: {
        flex: 1,
        flexDirection: 'row',
        padding: 12,
    },
    dayDetailLeft: {
        flex: 1,
        justifyContent: 'space-between',
        paddingRight: 12,
    },
    detailTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 8,
    },
    detailHeaderText: {
        fontSize: 9,
        fontWeight: '900',
        color: '#00E5FF',
        letterSpacing: 1,
    },
    detailSection: {
        marginBottom: 8,
    },
    detailLabelMini: {
        fontSize: 7,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 0.5,
        marginBottom: 2,
    },
    detailDateValue: {
        fontSize: 14,
        fontWeight: '900',
        color: '#fff',
    },
    detailDurationValue: {
        fontSize: 24,
        fontWeight: '900',
        color: '#fff',
    },
    detailDurationUnit: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.4)',
    },
    detailStatusText: {
        fontSize: 12,
        fontWeight: '900',
        color: '#00E5FF',
    },
    detailVerticalSeparator: {
        width: 1,
        backgroundColor: 'rgba(0, 229, 255, 0.2)',
        marginHorizontal: 4,
    },
    dayDetailRight: {
        flex: 1.8,
        paddingLeft: 12,
        flexShrink: 1,
    },
    detailListHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
        paddingBottom: 2,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    detailListTitle: {
        fontSize: 9,
        fontWeight: '900',
        color: '#00E5FF',
        letterSpacing: 1,
    },
    detailCloseBtn: {
        padding: 4,
    },
    taskGroupContainer: {
        marginBottom: 12,
    },
    taskGroupHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 10,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 8,
    },
    taskGroupName: {
        flex: 1,
        fontSize: 10,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.93)',
        letterSpacing: 0.4,
    },
    taskGroupTotalTime: {
        fontSize: 10,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.95)',
    },
    taskGroupTree: {
        paddingLeft: 4,
    },
    treeNodeRow: {
        flexDirection: 'row',
        marginBottom: 5,
    },
    treeConnectorContainer: {
        width: 18,
        alignItems: 'center',
    },
    treeVerticalLine: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 8,
        width: 1,
        backgroundColor: 'rgba(255,255,255,0.16)',
    },
    treeHorizontalLine: {
        position: 'absolute',
        top: 10,
        left: 8,
        width: 6,
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.16)',
    },
    treeContentBody: {
        flex: 1,
        paddingBottom: 6,
    },
    treeNodeMainRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    treeStatusDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
    },
    treeNodeName: {
        flex: 1,
        fontSize: 9,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.9)',
        letterSpacing: 0.3,
    },
    treeNodeDuration: {
        fontSize: 9,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.9)',
    },
    treeNodeSubRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingLeft: 8,
    },
    treeNodeTime: {
        fontSize: 7,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.45)',
        letterSpacing: 0.1,
    },
    treeNodeStatusText: {
        fontSize: 7,
        fontWeight: '800',
        letterSpacing: 0.25,
    },
    minimalSubtaskList: {
        flex: 1,
        marginTop: 0,
    },
    emptyDetailText: {
        fontSize: 8,
        color: 'rgba(255,255,255,0.3)',
        textAlign: 'center',
        marginTop: 20,
    },
});
