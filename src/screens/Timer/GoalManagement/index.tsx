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
}: GoalManagementProps) {
    const insets = useSafeAreaInsets();
    const [expandedGoalIds, setExpandedGoalIds] = useState<string[]>([]);
    const [menuGoalId, setMenuGoalId] = useState<string | null>(null);
    const [selectedTaskIdPerGoal, setSelectedTaskIdPerGoal] = useState<Record<string, number | null>>({});
    const [hiddenGraphIds, setHiddenGraphIds] = useState<string[]>([]);
    const [expandedGraphIds, setExpandedGraphIds] = useState<string[]>([]);
    const [selectedDayData, setSelectedDayData] = useState<{ date: string, segments: any[], title: string } | null>(null);
    const [containerWidth, setContainerWidth] = useState(0);
    const [deckContainerWidth, setDeckContainerWidth] = useState(0);
    const [isToggleInteracting, setIsToggleInteracting] = useState(false);
    
    // Notes state
    const [showNotesPanel, setShowNotesPanel] = useState(false);
    const [selectedDateHasNote, setSelectedDateHasNote] = useState(false);

    // Get logical date for notes tracking
    const selectedLogical = useMemo(() => {
        const date = selectedDate || new Date();
        return getLogicalDate(date, DEFAULT_DAILY_START_MINUTES);
    }, [selectedDate]);

    // Per-tab animated values
    const NAV_TABS = [
        { key: 'timer' as const, icon: 'timer',     label: 'TIMER' },
        { key: 'task'  as const, icon: 'check-box', label: 'TASK'  },
        { key: 'goal'  as const, icon: 'track-changes', label: 'GOAL'  },
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
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
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

    const GoalActivityGraph = ({ data, title, goalId }: { data: any[], title?: string, goalId: string }) => {
        const todayStr = new Date().toISOString().split('T')[0];
        const isExpanded = expandedGraphIds.includes(goalId + (title || ''));

        if (data.length === 0) return null;

        const toggleGraphExpand = () => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            const key = goalId + (title || '');
            setExpandedGraphIds(prev => 
                prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
            );
        };

        const maxHeight = isExpanded ? 180 : 50;
        
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

        /** Space below the 0h baseline for x-axis date labels (labels sit entirely under the line). */
        const GRAPH_X_AXIS_PX = 30;

        return (
            <View style={[styles.graphWrapper, { marginBottom: isExpanded ? 24 : 12 }]}>
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

                <View style={styles.graphChartPanel}>
                    <View style={[styles.mathGraphMain, { height: maxHeight + GRAPH_X_AXIS_PX + 6 }]}>
                    <View style={[styles.yAxisContainer, { height: maxHeight + GRAPH_X_AXIS_PX }]}>
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
                    >
                        <View style={[styles.graphContainer, { height: maxHeight + GRAPH_X_AXIS_PX }]}>
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

                            {data.map((day, i) => {
                                const segments = day.segments || [];
                                const maxMinutes = topHr * 60;
                                const scale = maxHeight / maxMinutes;
                                const isToday = day.date === todayStr;
                                const dayNum = day.date.split('-')[2];

                                return (
                                    <TouchableOpacity 
                                        key={i} 
                                        style={[styles.barOuter, { height: maxHeight + GRAPH_X_AXIS_PX }]}
                                        onPress={() => setSelectedDayData({
                                            date: day.date,
                                            segments: day.segments,
                                            title: title || 'PERFORMANCE LOG'
                                        })}
                                        activeOpacity={0.85}
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

    const renderTaskItem = (task: Task, isSelected: boolean, onSelect: () => void, goal: Goal) => {
        const stages = task.stages || [];
        let displayProgress = 0;
        let statusColor = '#00E676';

        if (stages.length > 0) {
            displayProgress = (stages.filter(s => s.status === 'Done').length / stages.length) * 100;
        } else {
            if (task.status === 'Completed') displayProgress = 100;
            else if (task.status === 'In Progress') displayProgress = 50;
            else displayProgress = 0;
        }

        if (task.status === 'In Progress') statusColor = '#FFB300';
        else if (task.status === 'Completed') statusColor = '#00E676';
        else statusColor = 'rgba(255,255,255,0.2)';

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
                    <Text style={styles.miniTaskMetaCompact}>{stages.length} SUBTASKS</Text>
                </View>

                <View style={styles.miniTaskFooterCompact}>
                    <View style={styles.miniProgressBarTrackCompact}>
                        <View style={[styles.miniProgressBarFillCompact, { width: `${displayProgress}%`, backgroundColor: isSelected ? '#fff' : statusColor }]} />
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
        const accentColor = '#FFFFFF';
        const startLabel = formatDateCompact(goal.startDate || goal.createdAt);
        const endLabel = formatDateCompact(goal.endDate);

        return (
            <View key={goal.id} style={styles.dashboardCardWrapper}>
                <View style={styles.dashboardCardDepthOuter}>
                    <BlurView intensity={32} tint="dark" style={styles.dashboardCard}>
                        <LinearGradient
                            colors={['rgba(34, 36, 44, 0.98)', 'rgba(22, 24, 30, 0.99)']}
                            locations={[0, 1]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 0, y: 1 }}
                            style={styles.cardContent}
                        >
                        {/* Unified HUD Content */}
                        <View style={styles.hudBody}>
                            <View style={styles.goalCardHeaderMinimal}>
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
                                <View style={styles.integratedActions}>
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

                                        {menuGoalId === goal.id && (
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

                            <View style={[styles.hudRightUnified, isLandscape && styles.hudRightLandscapeUnified]}>
                                {associatedTasks.length > 0 ? (
                                    <View style={[styles.activityContent, isLandscape && { flex: 1 }]}>
                                        {!hiddenGraphIds.includes(goal.id) && (
                                            <View style={styles.combinedSystemGraphWrapper}>
                                                <View style={styles.combinedGraphHeader}>
                                                    <MaterialIcons name="analytics" size={10} color="rgba(255,255,255,0.55)" />
                                                    <Text style={styles.combinedGraphLabelText}>STRATEGIC SYSTEM PERFORMANCE</Text>
                                                </View>
                                                <GoalActivityGraph 
                                                    data={getGoalActivityData(goal, tasks)} 
                                                    title="TOTAL TELEMETRY" 
                                                    goalId={`combined-${goal.id}`}
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

                                {/* Ultra-Compact Strategic Status Bar */}
                                <View style={styles.compactMissionFooter}>
                                    <View style={styles.statusPillGroup}>
                                        <View style={styles.compactPill}>
                                            <Text style={styles.compactPillLabel}>STRT</Text>
                                            <Text style={styles.compactPillVal}>{startLabel}</Text>
                                        </View>
                                        <View style={styles.compactPill}>
                                            <Text style={styles.compactPillLabel}>DLIN</Text>
                                            <Text style={styles.compactPillVal}>{endLabel}</Text>
                                        </View>
                                    </View>
                                    
                                    <View style={styles.compactProgressSection}>
                                        <View style={styles.slimProgressBarTrack}>
                                            <View style={[styles.slimProgressBarFill, { width: `${displayProgress}%`, backgroundColor: accentColor }]} />
                                        </View>
                                        <Text style={styles.compactProgressText}>{Math.round(displayProgress)}% COMPLETE</Text>
                                    </View>
                                </View>
                            </View>
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
                                            <MaterialIcons name="event" size={12} color="rgba(0, 229, 255, 0.85)" />
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
                                        grouped.map(g => (
                                            <View key={g.key} style={styles.logGroupCard}>
                                                <View
                                                    style={[
                                                        styles.logRowAccent,
                                                        {
                                                            backgroundColor: getSegmentColor(
                                                                g.status,
                                                                selectedDayData.date
                                                            ),
                                                        },
                                                    ]}
                                                />
                                                <View style={styles.logGroupBody}>
                                                    <View style={styles.logGroupTopRow}>
                                                        <Text style={styles.logGroupTaskTitle} numberOfLines={2}>
                                                            {g.taskTitle}
                                                        </Text>
                                                        <Text style={styles.logGroupDuration}>
                                                            {g.totalMinutes >= 60
                                                                ? `${Math.floor(g.totalMinutes / 60)}h${g.totalMinutes % 60 ? ` ${g.totalMinutes % 60}m` : ''}`
                                                                : `${g.totalMinutes}m`}
                                                        </Text>
                                                    </View>
                                                    {g.stageLabels.length === 1 ? (
                                                        <Text style={styles.logGroupMeta} numberOfLines={2}>
                                                            {g.stageLabels[0]}
                                                            {g.timeLabel ? ` · ${g.timeLabel}` : ''}
                                                        </Text>
                                                    ) : (
                                                        <>
                                                            <Text style={styles.logGroupMeta} numberOfLines={1}>
                                                                {g.timeLabel}
                                                                {g.partCount > 1
                                                                    ? ` · ${g.partCount} parts`
                                                                    : ''}
                                                            </Text>
                                                            {g.stageLabels.length > 0 && (
                                                                <View style={styles.logStageChipsRow}>
                                                                    {g.stageLabels.map(st => (
                                                                        <View key={st} style={styles.logStageChip}>
                                                                            <Text
                                                                                style={styles.logStageChipText}
                                                                                numberOfLines={1}
                                                                            >
                                                                                {st}
                                                                            </Text>
                                                                        </View>
                                                                    ))}
                                                                </View>
                                                            )}
                                                        </>
                                                    )}
                                                </View>
                                            </View>
                                        ))
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
    },
    dashboardCardDepthOuter: {
        borderRadius: 22,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 12 },
                shadowOpacity: 0.5,
                shadowRadius: 24,
            },
            android: {
                elevation: 16,
            },
            default: {},
        }),
    },
    dashboardCard: {
        borderRadius: 22,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
        backgroundColor: 'rgba(24, 26, 32, 0.96)',
    },
    cardContent: {
        paddingVertical: 12,
        paddingHorizontal: 12,
    },
    hudBody: {
        flexDirection: 'column',
    },
    goalCardHeaderMinimal: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
        paddingBottom: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(255,255,255,0.08)',
    },
    goalCardHeaderIcon: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.06)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    goalCardHeaderTextCol: {
        flex: 1,
        minWidth: 0,
        gap: 2,
    },
    goalCardTitleCompact: {
        fontSize: 15,
        fontWeight: '800',
        color: '#fff',
        letterSpacing: 0.2,
    },
    goalCardMetaCompact: {
        fontSize: 10,
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
        backgroundColor: 'rgba(255,255,255,0.06)',
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
        marginBottom: 8,
    },
    deploymentDeckContent: {
        paddingRight: 20,
        gap: 10,
    },
    miniTaskCardHorizontal: {
        width: 150,
        backgroundColor: 'rgba(255,255,255,0.02)',
        borderRadius: 12,
        padding: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.04)',
        position: 'relative',
        overflow: 'hidden',
    },
    miniTaskCardSelected: {
        borderColor: 'rgba(255,255,255,0.4)',
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    miniTaskHeaderCompact: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 6,
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
        marginBottom: 8,
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
    miniProgressBarTrackCompact: {
        flex: 1,
        height: 2,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 1,
        overflow: 'hidden',
    },
    miniProgressBarFillCompact: {
        height: '100%',
        borderRadius: 1,
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
        height: 2,
        backgroundColor: '#fff',
    },
    unifiedAnalyticsPanel: {
        borderRadius: 14,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        padding: 12,
        backgroundColor: '#181b24',
    },
    analyticsHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    analyticsLabelText: {
        fontSize: 8,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 1.5,
    },
    unlinkActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(255,82,82,0.05)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: 'rgba(255,82,82,0.1)',
    },
    unlinkActionText: {
        fontSize: 7,
        fontWeight: '900',
        color: '#FF5252',
        letterSpacing: 1,
    },

    microMetricsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(255,255,255,0.02)',
        borderRadius: 8,
        padding: 10,
        marginBottom: 12,
    },
    microMetric: {
        alignItems: 'center',
        flex: 1,
    },
    microMetricLabel: {
        fontSize: 6,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.2)',
        letterSpacing: 1,
        marginBottom: 2,
    },
    microMetricVal: {
        fontSize: 10,
        fontWeight: '900',
        color: '#fff',
    },
    metricDivider: {
        width: 1,
        height: 12,
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
        borderColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: '100%',
        backgroundColor: 'rgba(255,255,255,0.01)',
    },
    emptyTasksHUDTextUnified: {
        fontSize: 8,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.15)',
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
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.05)',
    },
    statusPillGroup: {
        flexDirection: 'row',
        gap: 8,
    },
    compactPill: {
        backgroundColor: 'rgba(255,255,255,0.02)',
        paddingHorizontal: 6,
        paddingVertical: 4,
        borderRadius: 4,
        alignItems: 'center',
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
        gap: 10,
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
    activityContent: {
        marginTop: 6,
    },
    combinedSystemGraphWrapper: {
        marginBottom: 10,
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingTop: 8,
        paddingBottom: 8,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        backgroundColor: '#181b24',
        position: 'relative',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.35,
                shadowRadius: 12,
            },
            android: { elevation: 6 },
            default: {},
        }),
    },
    combinedGraphHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 4,
        paddingLeft: 2,
    },
    combinedGraphLabelText: {
        fontSize: 7,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.55)',
        letterSpacing: 1.5,
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
        borderColor: 'rgba(255, 255, 255, 0.11)',
        backgroundColor: '#12141a',
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
    graphScroll: {
        flex: 1,
    },
    graphContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 4,
        paddingHorizontal: 4,
    },
    barOuter: {
        alignItems: 'stretch',
        width: 16,
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
    yAxisContainer: {
        width: 25,
        alignItems: 'flex-end',
        paddingRight: 4,
        marginTop: 0,
        position: 'relative',
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
        maxHeight: '56%',
        borderRadius: 14,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.12)',
        backgroundColor: '#12151c',
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
        paddingHorizontal: 12,
        paddingTop: 10,
        paddingBottom: 10,
    },
    popupHeaderCompact: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 8,
        marginBottom: 8,
        paddingBottom: 8,
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
        fontSize: 10,
        fontWeight: '800',
        color: 'rgba(255, 255, 255, 0.88)',
        letterSpacing: 0.4,
    },
    popupCountPill: {
        minWidth: 18,
        height: 18,
        paddingHorizontal: 5,
        borderRadius: 6,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
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
        fontSize: 11,
        fontWeight: '700',
        color: 'rgba(255, 255, 255, 0.45)',
    },
    popupCloseBtnCompact: {
        width: 28,
        height: 28,
        borderRadius: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: -2,
    },
    popupScrollCompact: {
        maxHeight: 260,
    },
    popupScrollContentCompact: {
        paddingBottom: 4,
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
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(255, 255, 255, 0.1)',
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
        color: '#00E5FF',
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
});
