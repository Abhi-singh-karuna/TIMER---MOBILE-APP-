import React, { useState, useMemo, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Dimensions,
    LayoutAnimation,
    Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { MaterialIcons } from '@expo/vector-icons';

import { Goal, GoalType, Task } from '../../../constants/data';
import { shouldRecurOnDate, expandRecurringTaskForDate } from '../../../utils/recurrenceUtils';


interface GoalManagementProps {
    goals: Goal[];
    onAddGoal: (parentId: string | null, type: GoalType) => void;
    onEditGoal: (goal: Goal) => void;
    onDeleteGoal: (goalId: string) => void;
    onUpdateProgress: (goalId: string, progress: number) => void;
    isLandscape: boolean;
    tasks: Task[];
    onUnlinkTask: (goalId: string, taskId: number) => void;
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
}: GoalManagementProps) {
    const [expandedGoalIds, setExpandedGoalIds] = useState<string[]>([]);
    const [menuGoalId, setMenuGoalId] = useState<string | null>(null);
    const [selectedTaskIdPerGoal, setSelectedTaskIdPerGoal] = useState<Record<string, number | null>>({});
    const [hiddenGraphIds, setHiddenGraphIds] = useState<string[]>([]);
    const [expandedGraphIds, setExpandedGraphIds] = useState<string[]>([]);
    const [selectedDayData, setSelectedDayData] = useState<{ date: string, segments: any[], title: string } | null>(null);




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
        if (s === 'process' || s === 'in progress') return '#FFD700';
        
        // Pending/other
        if (isFuture) return 'rgba(255,255,255,0.1)'; 
        return '#FF5252'; 
    };

    const GoalActivityGraph = ({ data, title, goalId }: { data: any[], title?: string, goalId: string }) => {
        if (data.length === 0) return null;
        const todayStr = new Date().toISOString().split('T')[0];
        const isExpanded = expandedGraphIds.includes(goalId + (title || ''));

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

        return (
            <View style={[styles.graphWrapper, { marginBottom: isExpanded ? 24 : 12 }]}>
                <View style={styles.graphHeaderRow}>
                    <Text style={styles.graphSubLabel}>{title?.toUpperCase()}</Text>
                    
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        {data.length > 0 && (
                            <Text style={styles.graphLegendText}>
                                <Text style={{ color: '#00E676' }}>● DONE  </Text>
                                <Text style={{ color: '#FFD700' }}>● PROCESS  </Text>
                                <Text style={{ color: 'rgba(255,255,255,0.4)' }}>● PENDING</Text>
                            </Text>
                        )}
                        <TouchableOpacity onPress={toggleGraphExpand} style={styles.expandToggleBtn}>
                            <MaterialIcons 
                                name={isExpanded ? "unfold-less" : "unfold-more"} 
                                size={14} 
                                color="#fff" 
                            />
                            <Text style={styles.expandToggleText}>{isExpanded ? 'CLOSE' : 'EXPAND'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={[styles.mathGraphMain, { height: maxHeight + 35 }]}>
                    <View style={[styles.yAxisContainer, { height: maxHeight + 25 }]}>
                        {yAxisLabelsHr.map((label, idx) => {
                            const bottom = isExpanded ? (gridLines[4 - idx] + 25) : (gridLines[2 - idx] + 25);
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

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.graphScroll}>
                        <View style={[styles.graphContainer, { height: maxHeight + 30 }]}>
                            {gridLines.map((bottom, idx) => (
                                <View 
                                    key={idx} 
                                    style={[
                                        styles.gridLine, 
                                        { bottom: bottom + 25 },
                                        bottom === 0 && { backgroundColor: 'rgba(255,255,255,0.2)', height: 2 } 
                                    ]} 
                                />
                            ))}

                            {data.map((day, i) => {
                                const segments = day.segments || [];
                                const totalMins = segments.reduce((acc: number, s: any) => acc + (s.durationMinutes || 0), 0);
                                const maxMinutes = topHr * 60;
                                const scale = maxHeight / maxMinutes;

                                return (
                                    <TouchableOpacity 
                                        key={i} 
                                        style={[styles.barOuter, { height: maxHeight + 25 }]}
                                        onPress={() => setSelectedDayData({
                                            date: day.date,
                                            segments: day.segments,
                                            title: title || 'PERFORMANCE LOG'
                                        })}
                                    >
                                        <View style={[styles.barContainer, { height: maxHeight, marginBottom: 0 }]}>
                                            {segments.length > 0 ? (
                                                [...segments].reverse().map((seg: any, idx: number) => (
                                                    <View 
                                                        key={idx}
                                                        style={[
                                                            styles.barFill,
                                                            {
                                                                height: Math.max(3, seg.durationMinutes * scale),
                                                                backgroundColor: getSegmentColor(seg.status, day.date),
                                                                marginBottom: 1,
                                                                opacity: day.hasTasks ? 1 : 0.1
                                                            }
                                                        ]}
                                                    />
                                                ))
                                            ) : (
                                                <View style={[
                                                    styles.barFill,
                                                    {
                                                        height: 2,
                                                        backgroundColor: 'rgba(255,255,255,0.03)',
                                                        borderRadius: 1,
                                                    }
                                                ]} />
                                            )}
                                        </View>
                                        <View style={{ height: 25, width: '100%', alignItems: 'center', justifyContent: 'center' }}>
                                            <Text style={[styles.barDate, day.date === todayStr && styles.barDateToday]}>
                                                {day.date.split('-')[2]}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </ScrollView>
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
                    isSelected && styles.miniTaskCardSelected
                ]}
            >
                <View style={styles.miniTaskHeaderCompact}>
                    <View style={[styles.statusIndicatorSmall, { backgroundColor: statusColor }]} />
                    <Text style={[styles.miniTaskTitleCompact, isSelected && { color: '#00E5FF' }]} numberOfLines={1}>
                        {task.title.toUpperCase()}
                    </Text>
                </View>

                <View style={styles.miniTaskMidCompact}>
                    <Text style={styles.miniTaskMetaCompact}>{stages.length} SUBTASKS</Text>
                </View>

                <View style={styles.miniTaskFooterCompact}>
                    <View style={styles.miniProgressBarTrackCompact}>
                        <View style={[styles.miniProgressBarFillCompact, { width: `${displayProgress}%`, backgroundColor: isSelected ? '#00E5FF' : statusColor }]} />
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
        const accentColor = '#00E5FF';
        const startLabel = formatDateCompact(goal.startDate || goal.createdAt);
        const endLabel = formatDateCompact(goal.endDate);

        return (
            <View key={goal.id} style={styles.dashboardCardWrapper}>
                <BlurView intensity={45} tint="dark" style={styles.dashboardCard}>
                    <LinearGradient
                        colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.02)']}
                        style={styles.cardContent}
                    >
                        {/* Unified HUD Content */}
                        <View style={[styles.hudBody, isLandscape && styles.hudBodyLandscape]}>

                            {/* Left Pane: Core Objective */}
                            <View style={[styles.hudLeft, isLandscape && styles.hudLeftLandscape]}>
                                <View style={styles.hudHeaderTactical}>
                                    <View style={styles.goalIconContainer}>
                                        <LinearGradient
                                            colors={[accentColor, 'rgba(0,229,255,0.3)']}
                                            style={styles.iconGradient}
                                        >
                                            <MaterialIcons name="track-changes" size={22} color="#000" />
                                        </LinearGradient>
                                    </View>
                                    <View style={styles.titleTextContainer}>
                                        <View style={styles.badgeRow}>
                                            <View style={styles.idBadge}>
                                                <Text style={styles.idBadgeText}>ID-{goal.id.slice(-4)}</Text>
                                            </View>
                                            <Text style={styles.typeLabelText}>{getGoalTypeLabel(goal.type).toUpperCase()}</Text>
                                        </View>
                                        <Text style={styles.unifiedTitleText}>{displayTitle.toUpperCase()}</Text>
                                    </View>
                                    <View style={styles.integratedActions}>
                                        <TouchableOpacity onPress={() => onAddGoal(goal.id, 'task')} style={styles.hudActionBtnSmall}>
                                            <MaterialIcons name="add" size={14} color={accentColor} />
                                        </TouchableOpacity>
                                        <View style={{ position: 'relative' }}>
                                            <TouchableOpacity
                                                onPress={() => {
                                                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                                    setMenuGoalId(menuGoalId === goal.id ? null : goal.id);
                                                }}
                                                style={styles.hudActionBtnSmall}
                                            >
                                                <MaterialIcons name="more-vert" size={14} color="rgba(255,255,255,0.4)" />
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
                            </View>

                            {/* Main Tactical Body */}
                            <View style={[styles.hudRightUnified, isLandscape && styles.hudRightLandscapeUnified]}>
                                <View style={styles.rightHeaderIntegrated}>
                                    <View style={styles.deploymentHeaderRow}>
                                        <Text style={styles.rightHeaderTextUnified}>ACTIVITY & DEPLOYMENT</Text>
                                        <View style={styles.activeStatusPill}>
                                            <View style={styles.pulseContainer}>
                                                <View style={[styles.activePulseOuter, { opacity: 0.2 }]} />
                                                <View style={styles.activePulse} />
                                            </View>
                                            <Text style={styles.rightHeaderCountUnified}>{associatedTasks.length} LINKED</Text>
                                        </View>
                                    </View>
                                    <TouchableOpacity 
                                        onPress={() => {
                                            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                            setHiddenGraphIds(prev => 
                                                prev.includes(goal.id) ? prev.filter(id => id !== goal.id) : [...prev, goal.id]
                                            );
                                        }}
                                        style={styles.telemetryToggleBtn}
                                    >
                                        <MaterialIcons 
                                            name={hiddenGraphIds.includes(goal.id) ? "unfold-more" : "unfold-less"} 
                                            size={14} 
                                            color="rgba(0,229,255,0.6)" 
                                        />
                                    </TouchableOpacity>
                                </View>

                                {associatedTasks.length > 0 ? (
                                    <View style={[styles.activityContent, isLandscape && { flex: 1 }]}>
                                        {!hiddenGraphIds.includes(goal.id) && (
                                            <View style={styles.combinedSystemGraphWrapper}>
                                                <View style={styles.combinedGraphHeader}>
                                                    <MaterialIcons name="analytics" size={10} color="rgba(0,229,255,0.4)" />
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
                                            <BlurView intensity={30} tint="dark" style={styles.unifiedAnalyticsPanel}>
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
        );
    };

    const rootGoals = useMemo(() => goals.filter(g => g.parentId === null), [goals]);

    return (
        <View style={styles.container}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={[
                    styles.scrollContent,
                    isLandscape && styles.scrollContentLandscape
                ]}
                showsVerticalScrollIndicator={false}
            >
                <View style={[styles.dashboardContainer, isLandscape && styles.dashboardContainerLandscape]}>
                    {goals.filter(g => !g.parentId).map(renderDashboardCard)}
                </View>
                {goals.filter(g => !g.parentId).length === 0 && (
                    <View style={styles.emptySection}>
                        <BlurView intensity={20} tint="dark" style={styles.emptyBox}>
                            <MaterialIcons name="security" size={40} color="rgba(0,229,255,0.2)" />
                            <Text style={styles.emptyBoxTitle}>SYSTEM OFFLINE</Text>
                            <Text style={styles.emptyBoxText}>No strategic objectives detected in current neural space.</Text>
                            <TouchableOpacity
                                style={styles.rebootBtn}
                                onPress={() => onAddGoal(null, 'goal')}
                            >
                                <LinearGradient
                                    colors={['#00E5FF', '#2196F3']}
                                    style={styles.rebootBtnGradient}
                                >
                                    <Text style={styles.rebootText}>INITIALIZE SYSTEM</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        </BlurView>
                    </View>
                )}
            </ScrollView>

            <TouchableOpacity
                style={styles.fab}
                onPress={() => onAddGoal(null, 'goal')}
            >
                <LinearGradient
                    colors={['#00E5FF', '#2196F3']}
                    style={styles.fabGradient}
                >
                    <MaterialIcons name="add" size={32} color="#fff" />
                </LinearGradient>
            </TouchableOpacity>

            {selectedDayData && (
                <View style={styles.modalOverlay}>
                    <TouchableOpacity 
                        style={styles.overlayDismiss} 
                        activeOpacity={1} 
                        onPress={() => setSelectedDayData(null)} 
                    />
                    <BlurView intensity={90} tint="dark" style={styles.detailPopup}>
                        <LinearGradient
                            colors={['rgba(255,255,255,0.1)', 'transparent']}
                            style={styles.popupGradient}
                        >
                            <View style={styles.popupHeader}>
                                <View>
                                    <Text style={styles.popupDateText}>{formatDateCompact(selectedDayData.date)}</Text>
                                    <Text style={styles.popupTitleText}>{selectedDayData.title}</Text>
                                </View>
                                <TouchableOpacity 
                                    onPress={() => setSelectedDayData(null)}
                                    style={styles.popupCloseBtn}
                                >
                                    <MaterialIcons name="close" size={20} color="#fff" />
                                </TouchableOpacity>
                            </View>

                            <ScrollView style={styles.popupScroll} showsVerticalScrollIndicator={false}>
                                {selectedDayData.segments.length > 0 ? (
                                    selectedDayData.segments.map((seg, idx) => (
                                        <View key={idx} style={styles.logItem}>
                                            <View style={[styles.logStatusDot, { backgroundColor: getSegmentColor(seg.status, selectedDayData.date) }]} />
                                            <View style={styles.logInfo}>
                                                <Text style={styles.logTaskTitle}>{seg.taskTitle?.toUpperCase()}</Text>
                                                <Text style={styles.logStageTitle}>{seg.stageTitle} <Text style={styles.logTimeRange}>{formatTimeRange(seg.startMin, seg.endMin)}</Text></Text>
                                            </View>
                                            <Text style={styles.logDuration}>{seg.durationMinutes}m</Text>
                                        </View>
                                    ))
                                ) : (
                                    <View style={styles.emptyLog}>
                                        <MaterialIcons name="event-busy" size={24} color="rgba(255,255,255,0.1)" />
                                        <Text style={styles.emptyLogText}>NO DEPLOYMENT DATA FOR THIS DATE</Text>
                                    </View>
                                )}
                            </ScrollView>

                            <View style={styles.popupFooter}>
                                <Text style={styles.totalLabel}>TOTAL DURATION</Text>
                                <Text style={styles.totalVal}>
                                    {Math.floor(selectedDayData.segments.reduce((acc, s) => acc + s.durationMinutes, 0) / 60)}h {selectedDayData.segments.reduce((acc, s) => acc + s.durationMinutes, 0) % 60}m
                                </Text>
                            </View>
                        </LinearGradient>
                    </BlurView>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 120,
    },
    scrollContentLandscape: {
        paddingHorizontal: 20,
    },
    dashboardContainer: {
        gap: 16,
    },
    dashboardContainerLandscape: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dashboardCardWrapper: {
        width: '100%',
    },
    dashboardCard: {
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        elevation: 10,
        backgroundColor: 'rgba(20,20,20,0.4)',
    },
    cardContent: {
        padding: 16,
    },
    hudBody: {
        flexDirection: 'column',
    },
    hudBodyLandscape: {
        flexDirection: 'row',
        gap: 20,
    },
    hudLeft: {
        flex: 1,
    },
    hudLeftLandscape: {
        flex: 0.45,
    },
    hudHeaderTactical: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 20,
        gap: 12,
    },
    goalIconContainer: {
        width: 44,
        height: 44,
    },
    iconGradient: {
        width: '100%',
        height: '100%',
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#00E5FF',
        shadowOpacity: 0.4,
        shadowRadius: 10,
    },
    badgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    idBadge: {
        backgroundColor: 'rgba(0,229,255,0.08)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: 'rgba(0,229,255,0.2)',
    },
    idBadgeText: {
        fontSize: 8,
        fontWeight: '900',
        color: '#00E5FF',
        letterSpacing: 0.5,
    },
    typeLabelText: {
        fontSize: 8,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 1.5,
    },
    unifiedTitleText: {
        fontSize: 20,
        fontWeight: '900',
        color: '#fff',
        letterSpacing: 1.2,
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
    timelineTrackUnified: {
        height: 6,
        justifyContent: 'center',
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
    titleTextContainer: {
        flex: 1,
    },
    integratedActions: {
        flexDirection: 'row',
        gap: 8,
        marginLeft: 'auto',
    },
    hudActionBtnSmall: {
        width: 32,
        height: 32,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.04)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
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
        flex: 0.55,
        borderLeftWidth: 1,
        borderLeftColor: 'rgba(255,255,255,0.05)',
        paddingLeft: 20,
    },
    rightHeaderIntegrated: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    rightHeaderActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    telemetryToggleBtn: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(0,229,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(0,229,255,0.1)',
    },
    rightHeaderTextUnified: {
        fontSize: 8,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 2,
    },
    activeStatusPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,229,255,0.05)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        gap: 6,
    },
    pulseContainer: {
        width: 10,
        height: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    activePulseOuter: {
        position: 'absolute',
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#00E5FF',
    },
    activePulse: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#00E5FF',
    },
    rightHeaderCountUnified: {
        fontSize: 7,
        fontWeight: '900',
        color: '#00E5FF',
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
        marginBottom: 12,
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
        borderColor: 'rgba(0,229,255,0.3)',
        backgroundColor: 'rgba(0,229,255,0.04)',
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
        backgroundColor: '#00E5FF',
    },
    unifiedAnalyticsPanel: {
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        padding: 14,
        backgroundColor: 'rgba(0,0,0,0.2)',
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
        borderColor: 'rgba(0,229,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
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
        color: '#fff',
        letterSpacing: 1,
    },
    fab: {
        position: 'absolute',
        bottom: 30,
        right: 30,
        width: 60,
        height: 60,
        borderRadius: 18,
        elevation: 10,
    },
    fabGradient: {
        flex: 1,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    deploymentHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    compactMissionFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 12,
        marginTop: 12,
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
        marginTop: 10,
    },
    combinedSystemGraphWrapper: {
        marginBottom: 16,
        backgroundColor: 'rgba(255,255,255,0.01)',
        borderRadius: 12,
        padding: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.03)',
    },
    combinedGraphHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 8,
        paddingLeft: 4,
    },
    combinedGraphLabelText: {
        fontSize: 7,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 1.5,
    },
    graphWrapper: {
        marginBottom: 10,
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
        alignItems: 'center',
        width: 16,
    },
    barContainer: {
        width: '100%',
        justifyContent: 'flex-end',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.02)',
        borderRadius: 2,
        overflow: 'hidden',
    },
    barFill: {
        width: '100%',
        borderRadius: 2,
    },
    barDate: {
        fontSize: 6,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.2)',
    },
    barDateToday: {
        color: '#00E5FF',
    },
    graphSubLabel: {
        fontSize: 7,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 1,
        marginBottom: 4,
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
        marginBottom: 8,
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
        color: 'rgba(255,255,255,0.3)',
    },
    gridLine: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.05)',
        zIndex: -1,
    },
    expandToggleBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        gap: 4,
    },
    expandToggleText: {
        fontSize: 7,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.4)',
    },
    modalOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
    },
    overlayDismiss: {
        ...StyleSheet.absoluteFillObject,
    },
    detailPopup: {
        width: '92%',
        maxHeight: '80%',
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    popupGradient: {
        padding: 16,
    },
    popupHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    popupDateText: {
        fontSize: 9,
        fontWeight: '900',
        color: '#00E5FF',
        letterSpacing: 1.5,
    },
    popupTitleText: {
        fontSize: 14,
        fontWeight: '900',
        color: '#fff',
        marginTop: 2,
    },
    popupCloseBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    popupScroll: {
        maxHeight: 450,
    },
    logItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.02)',
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 8,
        marginBottom: 4,
    },
    logStatusDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        marginRight: 8,
    },
    logInfo: {
        flex: 1,
    },
    logTaskTitle: {
        fontSize: 7,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.35)',
        letterSpacing: 0.5,
    },
    logStageTitle: {
        fontSize: 11,
        fontWeight: '600',
        color: '#fff',
        marginTop: 1,
    },
    logTimeRange: {
        fontSize: 9,
        fontWeight: '400',
        color: 'rgba(255,255,255,0.3)',
        marginLeft: 4,
    },
    logDuration: {
        fontSize: 11,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.8)',
    },
    emptyLog: {
        alignItems: 'center',
        paddingVertical: 30,
        gap: 8,
    },
    emptyLogText: {
        fontSize: 9,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.15)',
        letterSpacing: 1,
    },
    popupFooter: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.08)',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    totalLabel: {
        fontSize: 9,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 1,
    },
    totalVal: {
        fontSize: 14,
        fontWeight: '900',
        color: '#fff',
    },
    inlineGraphSection: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.05)',
        marginBottom: 8,
    },
});
