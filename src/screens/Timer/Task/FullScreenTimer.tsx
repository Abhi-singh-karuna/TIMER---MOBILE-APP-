import React, { useState, useMemo, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    useWindowDimensions,
    StatusBar,
    ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { Layout, FadeIn, FadeOut } from 'react-native-reanimated';
import { StageStatus } from '../../../constants/data';

import StageActionPopup from './StageActionPopup';

export interface LiveStageItem {
    text: string;
    startTimeMinutes: number;
    durationMinutes: number;
    /** ID of the parent task for filtering. */
    taskId: number;
    /** Remaining time in seconds (descending countdown); display as HH:MM:SS. */
    remainingSeconds: number;
    id?: number;
    status?: StageStatus;
}

/** Stage item for completed/upcoming lists (name, start time, duration only). */
export interface StageInfoItem {
    text: string;
    startTimeMinutes: number;
    durationMinutes: number;
    /** ID of the parent task for filtering. */
    taskId: number;
    id?: number;
    isLate?: boolean;
    isOverdueProcess?: boolean;
}

export interface FullScreenTimerProps {
    visible: boolean;
    onClose: () => void;
    /** Current timer value in seconds (count-up). */
    timerSeconds: number;
    /** Whether the timer is running. */
    isTimerRunning: boolean;
    /** Called when user taps play. */
    onPlay: () => void;
    /** Called when user taps pause. */
    onPause: () => void;
    /** Called when user taps reset (stop and set to 0). */
    onReset: () => void;
    /** Unique list of tasks for the day (id, title, color). */
    tasks?: { id: number; title: string; color?: string }[];
    /** Live stage(s) to show in top right (name, start time, duration, taskId). */
    liveStages?: LiveStageItem[];
    /** Completed stage(s) to show in top left (name, start time, duration, taskId). */
    completedStages?: StageInfoItem[];
    /** Upcoming stage(s) to show in top left (name, start time, duration, taskId). */
    upcomingStages?: StageInfoItem[];
    /** Undone stage(s) to show in top left (name, start time, duration, taskId). */
    undoneStages?: StageInfoItem[];
    /** Timer display colour from Settings (Theme). */
    timerTextColor?: string;
    /** Slider/button accent colour from Settings. */
    sliderButtonColor?: string;
    /** Called when user taps start on an upcoming live stage. */
    onStartStage?: (taskId: number, stageId: number) => void;
    /** Called when user taps complete on a running live stage. */
    onCompleteStage?: (taskId: number, stageId: number) => void;
    /** Called when user taps +5/10/20 to extend duration. */
    onExtendStage?: (taskId: number, stageId: number, minutes: number) => void;
    /** Called when user changes status via popup. */
    onUpdateStageStatus?: (taskId: number, stageId: number, status: StageStatus) => void;
}

function formatTimerHHMMSS(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Format minutes-from-midnight as HH:MM. */
function formatStartTimeHHMM(startTimeMinutes: number): string {
    const totalMins = Math.round(startTimeMinutes) % (24 * 60);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Format duration in minutes as "Xh Ym" or "Xm". */
function formatDuration(durationMinutes: number): string {
    const d = Math.round(durationMinutes);
    if (d < 60) return `${d}m`;
    const h = Math.floor(d / 60);
    const m = d % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
}


export default function FullScreenTimer({
    visible,
    onClose,
    timerSeconds,
    isTimerRunning,
    onPlay,
    onPause,
    onReset,
    liveStages = [],
    completedStages = [],
    upcomingStages = [],
    undoneStages = [],
    tasks = [],
    timerTextColor = '#FFFFFF',
    sliderButtonColor = '#FFFFFF',
    onStartStage,
    onCompleteStage,
    onExtendStage,
    onUpdateStageStatus,
}: FullScreenTimerProps) {
    const { width, height } = useWindowDimensions();
    const isLandscape = width > height;

    const [focusedStageId, setFocusedStageId] = useState<number | null>(null);

    // Initialize/Update active stage based on ID, defaulting to first if no valid selection
    const activeStage = useMemo(() => {
        if (liveStages.length === 0) return null;
        if (focusedStageId !== null) {
            const found = liveStages.find(s => s.id === focusedStageId);
            if (found) return found;
        }
        // Fallback to first stage if selection invalid or not set
        return liveStages[0];
    }, [liveStages, focusedStageId]);

    // Ensure we have a valid ID set if we have stages
    useEffect(() => {
        if (activeStage && activeStage.id !== undefined && activeStage.id !== focusedStageId) {
            // Only set if we don't have a focused ID yet (initial load) or if the current focused ID is gone
            if (focusedStageId === null || !liveStages.some(s => s.id === focusedStageId)) {
                setFocusedStageId(activeStage.id);
            }
        }
    }, [activeStage, focusedStageId, liveStages]);

    const [selectedTaskId, setSelectedTaskId] = useState<number | 'ALL'>('ALL');

    const filteredCompleted = selectedTaskId === 'ALL'
        ? completedStages
        : completedStages.filter(s => s.taskId === selectedTaskId);
    const filteredUpcoming = selectedTaskId === 'ALL'
        ? upcomingStages
        : upcomingStages.filter(s => s.taskId === selectedTaskId);
    const filteredUndone = selectedTaskId === 'ALL'
        ? undoneStages
        : undoneStages.filter(s => s.taskId === selectedTaskId);

    const [completedExpanded, setCompletedExpanded] = useState(true);
    const [upcomingExpanded, setUpcomingExpanded] = useState(true);
    const [undoneExpanded, setUndoneExpanded] = useState(true);

    const [statusPopupVisible, setStatusPopupVisible] = useState(false);
    const [statusPopupPosition, setStatusPopupPosition] = useState({ x: 0, y: 0 });
    const [statusPopupStage, setStatusPopupStage] = useState<{ taskId: number, stageId: number, currentStatus: StageStatus } | null>(null);

    const toggleCompleted = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setCompletedExpanded(prev => !prev);
    };
    const toggleUpcoming = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setUpcomingExpanded(prev => !prev);
    };
    const toggleUndone = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setUndoneExpanded(prev => !prev);
    };

    const handlePlay = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (activeStage && activeStage.status === 'Upcoming' && onStartStage && activeStage.id !== undefined) {
            onStartStage(activeStage.taskId, activeStage.id!);
        } else {
            onPlay();
        }
    };

    const handleCancel = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onClose();
    };

    const renderPrecisionButton = (
        onPress: () => void,
        icon: string,
        isPlay: boolean,
        colorTheme: 'white' | 'black'
    ) => {
        const isBlack = colorTheme === 'black';
        const buttonSize = isPlay ? 88 : 64;
        const bezelSize = buttonSize + 12;
        const iconSize = isPlay ? 44 : 24;

        // Colors for depth and integration
        const surfaceColor = isBlack ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.03)';
        const bezelBorderColor = isBlack ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)';
        const trackBg = 'rgba(0,0,0,0.15)';

        return (
            <View style={[styles.buttonBezel, { width: bezelSize, height: bezelSize, borderRadius: bezelSize / 2, backgroundColor: surfaceColor, borderColor: bezelBorderColor }]}>
                <TouchableOpacity
                    style={[
                        styles.buttonTrack,
                        {
                            width: buttonSize,
                            height: buttonSize,
                            borderRadius: buttonSize / 2,
                            backgroundColor: trackBg
                        }
                    ]}
                    onPress={onPress}
                    activeOpacity={0.7}
                >
                    {/* Concave Gradient */}
                    <LinearGradient
                        colors={isBlack ? ['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.1)'] : ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.15)']}
                        style={StyleSheet.absoluteFill}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                    />

                    {/* Interior Shadow */}
                    <View style={[styles.interiorShadow, { borderRadius: buttonSize / 2, borderBottomWidth: 3, borderRightWidth: 1, borderColor: isBlack ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.2)' }]} pointerEvents="none" />

                    <MaterialIcons
                        name={icon as any}
                        size={iconSize}
                        color={isBlack ? "rgba(0,0,0,0.8)" : "#FFF"}
                    />

                    {/* Top Rim Highlight */}
                    <View style={[styles.topRim, { borderRadius: buttonSize / 2, opacity: isBlack ? 0.3 : 1 }]} pointerEvents="none" />
                </TouchableOpacity>

                {/* Sharp Outer Boundary Highlight */}
                <View style={[styles.outerBoundaryHighlight, { borderRadius: bezelSize / 2, borderColor: isBlack ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.2)' }]} pointerEvents="none" />
            </View>
        );
    };

    const renderPrecisionPill = (
        onPress: () => void,
        text: string,
        backgroundColor: string,
        textColor: string = '#000000'
    ) => {
        const height = 32;
        const minWidth = text.length > 3 ? 80 : 68;
        const borderRadius = 16;
        const bezelPadding = 3;

        const surfaceColor = 'rgba(255,255,255,0.03)';
        const bezelBorderColor = 'rgba(255,255,255,0.12)';

        return (
            <View style={[styles.buttonBezel, { height: height + (bezelPadding * 2), minWidth: minWidth + (bezelPadding * 2), borderRadius: borderRadius + bezelPadding, backgroundColor: surfaceColor, borderColor: bezelBorderColor, padding: bezelPadding }]}>
                <TouchableOpacity
                    style={[
                        styles.buttonTrack,
                        {
                            height: height,
                            minWidth: minWidth,
                            paddingHorizontal: 16,
                            borderRadius: borderRadius,
                            backgroundColor: backgroundColor
                        }
                    ]}
                    onPress={onPress}
                    activeOpacity={0.7}
                >
                    <LinearGradient
                        colors={['rgba(255,255,255,0.1)', 'rgba(0,0,0,0.1)']}
                        style={StyleSheet.absoluteFill}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                    />

                    <View style={[styles.interiorShadow, { borderRadius: borderRadius, borderBottomWidth: 2, borderRightWidth: 1, borderColor: 'rgba(0,0,0,0.2)' }]} pointerEvents="none" />

                    <Text style={[styles.precisionPillText, { color: textColor }]}>{text}</Text>

                    <View style={[styles.topRim, { borderRadius: borderRadius, borderTopWidth: 0.8 }]} pointerEvents="none" />
                </TouchableOpacity>
                <View style={[styles.outerBoundaryHighlight, { borderRadius: borderRadius + bezelPadding, borderColor: 'rgba(0,0,0,0.15)' }]} pointerEvents="none" />
            </View>
        );
    };

    const renderSmallRoundButton = (
        onPress: () => void,
        text: string
    ) => {
        const buttonSize = 32;
        const bezelSize = buttonSize + 6;
        const bezelPadding = 3;

        const surfaceColor = 'rgba(255,255,255,0.03)';
        const bezelBorderColor = 'rgba(255,255,255,0.12)';
        const trackBg = 'rgba(255,255,255,0.15)';

        return (
            <View style={[styles.buttonBezel, { width: bezelSize, height: bezelSize, borderRadius: bezelSize / 2, backgroundColor: surfaceColor, borderColor: bezelBorderColor }]}>
                <TouchableOpacity
                    style={[
                        styles.buttonTrack,
                        {
                            width: buttonSize,
                            height: buttonSize,
                            borderRadius: buttonSize / 2,
                            backgroundColor: trackBg
                        }
                    ]}
                    onPress={onPress}
                    activeOpacity={0.7}
                >
                    <LinearGradient
                        colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.15)']}
                        style={StyleSheet.absoluteFill}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                    />

                    <View style={[styles.interiorShadow, { borderRadius: buttonSize / 2, borderBottomWidth: 2, borderRightWidth: 1, borderColor: 'rgba(0,0,0,0.2)' }]} pointerEvents="none" />

                    <Text style={[styles.smallRoundButtonText, { color: '#FFFFFF' }]}>{text}</Text>

                    <View style={[styles.topRim, { borderRadius: buttonSize / 2, borderTopWidth: 0.8 }]} pointerEvents="none" />
                </TouchableOpacity>
                <View style={[styles.outerBoundaryHighlight, { borderRadius: bezelSize / 2, borderColor: 'rgba(0,0,0,0.15)' }]} pointerEvents="none" />
            </View>
        );
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            statusBarTranslucent
            supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
            onRequestClose={onClose}
        >
            <StatusBar hidden />
            <View style={[styles.container, { width, height }]}>

                {/* 1. Timer & Controls Section */}
                <Animated.View
                    style={[
                        styles.timerSection,
                        isLandscape ? styles.timerSectionLandscape : styles.timerSectionPortrait
                    ]}
                >
                    {/* Controls & Task Name Header */}
                    <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: isLandscape ? 'flex-start' : 'center',
                        width: isLandscape ? '100%' : 'auto',
                        maxWidth: isLandscape ? undefined : '90%',
                        gap: 12
                    }}>
                        {/* Action Buttons Group */}
                        {activeStage?.status === 'Upcoming' && onStartStage && activeStage.id !== undefined && (
                            renderPrecisionPill(
                                handlePlay,
                                'START',
                                '#FFCC00',
                                '#000000'
                            )
                        )}

                        {activeStage?.status === 'Process' && onCompleteStage && activeStage.id !== undefined && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                {renderPrecisionPill(
                                    () => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                                        onCompleteStage(activeStage.taskId, activeStage.id!);
                                    },
                                    'DONE',
                                    '#00E676',
                                    '#000000'
                                )}

                                {onExtendStage && (
                                    <View style={{ flexDirection: 'row', gap: 4 }}>
                                        {[5, 10, 20].map((mins) => (
                                            <View key={`+${mins}`}>
                                                {renderSmallRoundButton(
                                                    () => {
                                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                        onExtendStage(activeStage.taskId, activeStage.id!, mins);
                                                    },
                                                    `+${mins}`
                                                )}
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </View>
                        )}
                        {/* Task Name - Flexible and Truncated */}
                        <Text
                            style={[
                                styles.timerLabelInteractive,
                                { textAlign: 'left', flexShrink: 1 }
                            ]}
                            numberOfLines={1}
                        >
                            {activeStage
                                ? (isLandscape && activeStage.text.length > 25
                                    ? activeStage.text.substring(0, 25).toUpperCase() + '...'
                                    : activeStage.text.toUpperCase())
                                : 'TIMER'}
                        </Text>
                    </View>

                    {/* Timer Display */}
                    <Text
                        style={[
                            styles.timerDisplay,
                            isLandscape ? styles.timerDisplayLandscape : styles.timerDisplayPortrait,
                            { color: timerTextColor },
                        ]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                    >
                        {activeStage && activeStage.status !== 'Upcoming'
                            ? formatTimerHHMMSS(activeStage.remainingSeconds)
                            : '00:00:00'}
                    </Text>
                </Animated.View>

                {/* 2. Live Stages List */}
                <Animated.View
                    style={[
                        styles.liveStagesSection,
                        isLandscape ? styles.liveStagesSectionLandscape : styles.liveStagesSectionPortrait
                    ]}
                >
                    <Text style={[styles.liveStagesLabel, isLandscape ? {} : { textAlign: 'center', width: '100%' }]}>
                        {isLandscape ? "LIVE STAGES" : "QUEUE"}
                    </Text>
                    <ScrollView
                        style={styles.liveStagesScroll}
                        contentContainerStyle={[styles.liveStagesScrollContent, !isLandscape && { alignItems: 'center' }]}
                        showsVerticalScrollIndicator={true}
                    >
                        {liveStages.length === 0 ? (
                            <View style={[styles.liveStageRow, { borderRightColor: 'transparent', opacity: 0.7 }]}>
                                <Text style={[styles.liveStageName, { color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }]}>
                                    Waiting for new task...
                                </Text>
                            </View>
                        ) : (
                            liveStages.map((stage, index) => {
                                const isFocused = activeStage?.id === stage.id;
                                return (
                                    <TouchableOpacity
                                        key={index}
                                        style={[
                                            styles.liveStageRow,
                                            isFocused && styles.liveStageRowSelected,
                                            !isLandscape && { borderRightWidth: 0, paddingRight: 0, borderBottomWidth: 2, paddingBottom: 4, borderBottomColor: isFocused ? '#FFCC00' : 'transparent', alignItems: 'center' }
                                        ]}
                                        onPress={() => {
                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                            if (stage.id !== undefined) {
                                                setFocusedStageId(stage.id);
                                            }
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Text
                                            style={[
                                                styles.liveStageName,
                                                {
                                                    color: stage.status === 'Process'
                                                        ? '#00E676'
                                                        : (isFocused ? '#FFCC00' : 'rgba(255,255,255,0.7)')
                                                }
                                            ]}
                                        >
                                            {stage.text}
                                        </Text>
                                        <View style={styles.liveStageTimeRow}>
                                            <Text style={[
                                                styles.liveStageTimeRunning,
                                                { color: stage.status === 'Process' ? '#00E676' : (isFocused ? '#FFCC00' : 'rgba(255,255,255,0.9)') }
                                            ]}>
                                                {stage.status === 'Upcoming' ? '00:00:00' : formatTimerHHMMSS(stage.remainingSeconds)}
                                            </Text>
                                            <Text style={styles.liveStageTimeTotal}>
                                                / {formatTimerHHMMSS(Math.round(stage.durationMinutes * 60))}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })
                        )}
                    </ScrollView>
                </Animated.View>

                {/* 3. Task Chips (Landscape Only) */}
                {isLandscape && (
                    <Animated.View
                        entering={FadeIn}
                        exiting={FadeOut}
                        style={styles.bottomTaskBarContainer}
                    >
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.bottomTaskBarContent}
                        >
                            <TouchableOpacity
                                style={[styles.taskChip, selectedTaskId === 'ALL' && styles.taskChipSelected]}
                                onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    setSelectedTaskId('ALL');
                                }}
                            >
                                <Text style={selectedTaskId === 'ALL' ? styles.taskChipTextSelected : styles.taskChipText}>ALL</Text>
                            </TouchableOpacity>
                            {tasks.map((task) => (
                                <TouchableOpacity
                                    key={`chip-${task.id}`}
                                    style={[styles.taskChip, selectedTaskId === task.id && { borderBottomColor: task.color || '#FFFFFF' }]}
                                    onPress={() => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        setSelectedTaskId(task.id);
                                    }}
                                >
                                    <Text style={selectedTaskId === task.id ? [styles.taskChipTextSelected, { color: task.color || '#FFFFFF' }] : styles.taskChipText}>
                                        {task.title.toUpperCase()}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </Animated.View>
                )}

                {/* 4. Lists Container (Completed/Upcoming/Undone) */}
                <Animated.View
                    style={[
                        styles.listsContainer,
                        isLandscape ? styles.listsContainerLandscape : styles.listsContainerPortrait
                    ]}
                >
                    {/* Content Logic Same as before, just layout changes */}
                    <View style={[styles.stageSection, isLandscape && styles.stageSectionLandscape]}>
                        <TouchableOpacity style={styles.stageSectionHeader} onPress={toggleCompleted}>
                            <Text style={styles.stageSectionLabel}>COMPLETED ({filteredCompleted.length})</Text>
                            <MaterialIcons name={completedExpanded ? 'expand-less' : 'expand-more'} size={20} color="rgba(255,255,255,0.5)" />
                        </TouchableOpacity>
                        {completedExpanded && (
                            <ScrollView style={[styles.stageSectionScroll, isLandscape && styles.stageSectionScrollLandscape]}>
                                {filteredCompleted.map((stage, index) => {
                                    if (stage.isOverdueProcess) {
                                        return (
                                            <View key={`c-${index}`} style={styles.tableRow}>
                                                <Text style={[styles.tableCellTask, { color: '#FFCC00' }]}>{stage.text}</Text>
                                                <TouchableOpacity
                                                    style={{
                                                        paddingHorizontal: 6,
                                                        paddingVertical: 2,
                                                        borderRadius: 4,
                                                        backgroundColor: 'rgba(255, 204, 0, 0.2)',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        alignSelf: 'center'
                                                    }}
                                                    onPress={(event) => {
                                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                        if (stage.id !== undefined) {
                                                            const { pageX, pageY } = event.nativeEvent;
                                                            setStatusPopupPosition({ x: pageX, y: pageY });
                                                            setStatusPopupStage({
                                                                taskId: stage.taskId,
                                                                stageId: stage.id,
                                                                currentStatus: 'Process'
                                                            });
                                                            setStatusPopupVisible(true);
                                                        }
                                                    }}
                                                >
                                                    <Text style={{
                                                        fontSize: 11,
                                                        fontWeight: '800',
                                                        color: '#FFCC00',
                                                        fontVariant: ['tabular-nums'],
                                                    }}>
                                                        {formatStartTimeHHMM(stage.startTimeMinutes)}
                                                    </Text>
                                                </TouchableOpacity>
                                                <Text style={[styles.tableCellDur, { color: '#FFCC00' }]}>{formatDuration(stage.durationMinutes)}</Text>
                                            </View>
                                        );
                                    }
                                    return (
                                        <View key={`c-${index}`} style={styles.tableRow}>
                                            <Text style={[styles.tableCellTask, { color: '#45d075' }]}>{stage.text}</Text>
                                            <Text style={[styles.tableCellStart, { color: '#45d075' }]}>{formatStartTimeHHMM(stage.startTimeMinutes)}</Text>
                                            <Text style={[styles.tableCellDur, { color: '#45d075' }]}>{formatDuration(stage.durationMinutes)}</Text>
                                        </View>
                                    );
                                })}
                            </ScrollView>
                        )}
                    </View>
                    <View style={[styles.stageSection, isLandscape && styles.stageSectionLandscape]}>
                        <TouchableOpacity style={styles.stageSectionHeader} onPress={toggleUpcoming}>
                            <Text style={styles.stageSectionLabel}>UPCOMING ({filteredUpcoming.length})</Text>
                            <MaterialIcons name={upcomingExpanded ? 'expand-less' : 'expand-more'} size={20} color="rgba(255,255,255,0.5)" />
                        </TouchableOpacity>
                        {upcomingExpanded && (
                            <ScrollView style={[styles.stageSectionScroll, isLandscape && styles.stageSectionScrollLandscape]}>
                                {filteredUpcoming.map((stage, index) => (
                                    <View key={`u-${index}`} style={styles.tableRow}>
                                        <Text style={[styles.tableCellTask, { color: 'rgba(255,255,255,0.5)' }]}>{stage.text}</Text>
                                        <TouchableOpacity
                                            style={{ backgroundColor: stage.isLate ? 'rgba(255, 79, 79, 0.25)' : 'rgba(255, 204, 0, 0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}
                                            onPress={(event) => {
                                                if (stage.id === undefined) return;
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                const { pageX, pageY } = event.nativeEvent;
                                                setStatusPopupPosition({ x: pageX, y: pageY });
                                                setStatusPopupStage({ taskId: stage.taskId, stageId: stage.id, currentStatus: 'Upcoming' });
                                                setStatusPopupVisible(true);
                                            }}
                                        >
                                            <Text style={{ fontSize: 11, fontWeight: '700', color: stage.isLate ? '#FF4F4F' : '#FFCC00' }}>{formatStartTimeHHMM(stage.startTimeMinutes)}</Text>
                                        </TouchableOpacity>
                                        <Text style={[styles.tableCellDur, { color: 'rgba(255,255,255,0.5)' }]}>{formatDuration(stage.durationMinutes)}</Text>
                                    </View>
                                ))}
                            </ScrollView>
                        )}
                    </View>
                    <View style={[styles.stageSection, isLandscape && styles.stageSectionLandscape]}>
                        <TouchableOpacity style={styles.stageSectionHeader} onPress={toggleUndone}>
                            <Text style={styles.stageSectionLabel}>UNDONE ({filteredUndone.length})</Text>
                            <MaterialIcons name={undoneExpanded ? 'expand-less' : 'expand-more'} size={20} color="rgba(255,255,255,0.5)" />
                        </TouchableOpacity>
                        {undoneExpanded && (
                            <ScrollView style={[styles.stageSectionScroll, isLandscape && styles.stageSectionScrollLandscape]}>
                                {filteredUndone.map((stage, index) => (
                                    <View key={`d-${index}`} style={styles.tableRow}>
                                        <Text style={[styles.tableCellTask, { color: '#ff4f4f' }]}>{stage.text}</Text>
                                        <TouchableOpacity
                                            style={{
                                                backgroundColor: 'rgba(255, 79, 79, 0.2)',
                                                paddingHorizontal: 6,
                                                paddingVertical: 2,
                                                borderRadius: 4,
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                alignSelf: 'center'
                                            }}
                                            onPress={(event) => {
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                if (stage.id !== undefined) {
                                                    const { pageX, pageY } = event.nativeEvent;
                                                    setStatusPopupPosition({ x: pageX, y: pageY });
                                                    setStatusPopupStage({
                                                        taskId: stage.taskId,
                                                        stageId: stage.id,
                                                        currentStatus: 'Undone'
                                                    });
                                                    setStatusPopupVisible(true);
                                                }
                                            }}
                                        >
                                            <Text style={{
                                                fontSize: 11,
                                                fontWeight: '800',
                                                color: '#ff4f4f',
                                                fontVariant: ['tabular-nums'],
                                            }}>
                                                {formatStartTimeHHMM(stage.startTimeMinutes)}
                                            </Text>
                                        </TouchableOpacity>
                                        <Text style={[styles.tableCellDur, { color: '#ff4f4f' }]}>{formatDuration(stage.durationMinutes)}</Text>
                                    </View>
                                ))}
                            </ScrollView>
                        )}
                    </View>
                </Animated.View>

                {/* 5. Close Button */}
                <Animated.View
                    style={[
                        styles.controlsContainer,
                        isLandscape ? styles.controlsContainerLandscape : styles.controlsContainerPortrait
                    ]}
                >
                    {renderPrecisionButton(handleCancel, "close", false, 'white')}
                </Animated.View>

                <StageActionPopup
                    visible={statusPopupVisible}
                    position={statusPopupPosition}
                    currentStatus={statusPopupStage?.currentStatus || 'Upcoming'}
                    onClose={() => setStatusPopupVisible(false)}
                    onSelectStatus={(status) => {
                        setStatusPopupVisible(false);
                        if (!statusPopupStage) return;
                        if (status === 'Process' && onStartStage) onStartStage(statusPopupStage.taskId, statusPopupStage.stageId);
                        else if (onUpdateStageStatus) onUpdateStageStatus(statusPopupStage.taskId, statusPopupStage.stageId, status);
                    }}
                />
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
    },

    // --- Timer Section Styles ---
    timerSection: {
        position: 'absolute',
        zIndex: 20,
    },
    timerSectionLandscape: {
        bottom: 20,
        right: 20,
        alignItems: 'flex-end',
    },
    timerSectionPortrait: {
        top: 60,
        left: 0,
        right: 0,
        alignItems: 'center',
        flexDirection: 'column-reverse',
        gap: 8,
    },
    timerDisplay: {
        fontWeight: '900',
        letterSpacing: 2,
        fontVariant: ['tabular-nums'],
    },
    timerDisplayLandscape: {
        fontSize: 96,
        letterSpacing: 4,
    },
    timerDisplayPortrait: {
        fontSize: 80,
        letterSpacing: 2,
    },
    timerLabel: {
        fontSize: 14,
        fontWeight: '700',
        letterSpacing: 2,
        color: 'rgba(255,255,255,0.5)',
    },

    // --- Live Stages Section Styles ---
    liveStagesSection: {
        position: 'absolute',
        zIndex: 10,
    },
    liveStagesSectionLandscape: {
        top: 24,
        right: 20,
        alignItems: 'flex-end',
        maxWidth: 200,
        maxHeight: '45%',
    },
    liveStagesSectionPortrait: {
        top: 220, // Below timer (approx 60 + 100 + gap)
        left: 20,
        right: 20,
        height: 120,
        alignItems: 'center',
    },
    liveStagesLabel: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 2,
        color: 'rgba(255,255,255,0.4)',
        marginBottom: 8,
    },
    liveStagesScroll: {
        maxHeight: 200,
        width: '100%',
    },
    liveStagesScrollContent: {
        paddingVertical: 4,
        paddingLeft: 8,
    },
    liveStageRow: {
        marginBottom: 10,
        alignItems: 'flex-end',
        paddingRight: 8,
        paddingVertical: 4,
        borderRightWidth: 2,
        borderRightColor: 'transparent',
    },
    liveStageRowSelected: {
        borderRightColor: '#FFCC00',
        backgroundColor: 'rgba(255, 204, 0, 0.1)',
    },
    liveStageName: {
        fontSize: 13,
        fontWeight: '700',
        marginBottom: 2,
    },
    liveStageTimeRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 4,
    },
    liveStageTimeRunning: {
        fontSize: 18,
        fontWeight: '800',
        letterSpacing: 0.5,
        fontVariant: ['tabular-nums'],
    },
    liveStageTimeTotal: {
        fontSize: 11,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: 0.3,
        fontVariant: ['tabular-nums'],
    },

    // --- Lists (Table) Section Styles ---
    listsContainer: {
        position: 'absolute',
        zIndex: 10,
    },
    listsContainerLandscape: {
        top: 30,
        left: 20,
        flexDirection: 'row',
        maxWidth: '75%',
        maxHeight: '55%',
        gap: 16,
        alignItems: 'flex-start',
    },
    listsContainerPortrait: {
        top: 360,
        left: 24,
        right: 24,
        bottom: 100,
        flexDirection: 'column',
        gap: 16,
    },
    stageSection: {
        flex: 1, // Take available space in portrait column
        minHeight: 0,
    },
    stageSectionLandscape: {
        flex: 1,
        minWidth: 0,
        maxWidth: '80%',
    },
    stageSectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
        backgroundColor: 'rgba(255,255,255,0.05)',
        padding: 6,
        borderRadius: 4,
    },
    stageSectionLabel: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 2,
        color: 'rgba(255,255,255,0.4)',
    },
    stageSectionScroll: {
        flex: 1,
        marginTop: 4,
    },
    stageSectionScrollLandscape: {
        maxHeight: 160,
    },

    // --- Controls/Buttons ---
    controlsContainer: {
        position: 'absolute',
        zIndex: 50,
    },
    controlsContainerLandscape: {
        bottom: 24,
        left: 24,
    },
    controlsContainerPortrait: {
        bottom: 40,
        alignSelf: 'center',
    },
    buttonBezel: {
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 0.8,
        padding: 4,
        position: 'relative',
    },
    buttonTrack: {
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.15)',
        overflow: 'hidden',
        position: 'relative',
    },
    interiorShadow: {
        ...StyleSheet.absoluteFillObject,
    },
    topRim: {
        ...StyleSheet.absoluteFillObject,
        borderTopWidth: 1,
        borderLeftWidth: 0.5,
        borderRightWidth: 0.5,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    outerBoundaryHighlight: {
        ...StyleSheet.absoluteFillObject,
        borderBottomWidth: 1.5,
        borderRightWidth: 1,
    },
    precisionPillText: {
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 0.5,
    },
    smallRoundButtonText: {
        fontSize: 9,
        fontWeight: '700',
        letterSpacing: 0.2,
    },
    actionBtnStart: {
        backgroundColor: '#FFCC00',
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderRadius: 30,
        shadowColor: '#FFCC00',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 8,
        elevation: 6,
    },
    actionBtnComplete: {
        backgroundColor: '#00E676',
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderRadius: 30,
        shadowColor: '#00E676',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 8,
        elevation: 6,
    },
    actionBtnText: {
        color: '#000000',
        fontSize: 13,
        fontWeight: '900',
        letterSpacing: 1,
    },
    extendBtn: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)'
    },
    extendBtnText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '700',
    },

    // --- Table/List Items ---
    tableRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
        paddingVertical: 2,
    },
    tableCellTask: {
        flex: 1,
        fontSize: 13,
        fontWeight: '700',
        paddingRight: 8,
    },
    tableCellStart: {
        width: 48,
        fontSize: 13,
        fontWeight: '800',
        letterSpacing: 0.5,
        fontVariant: ['tabular-nums'],
        textAlign: 'center',
    },
    tableCellDur: {
        width: 36,
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 0.3,
        fontVariant: ['tabular-nums'],
        textAlign: 'right',
    },

    // --- Bottom Bar ---
    bottomTaskBarContainer: {
        position: 'absolute',
        top: 1,
        left: '20%',
        right: '20%',
        height: 32,
        zIndex: 25,
        alignItems: 'center',
    },
    bottomTaskBarContent: {
        alignItems: 'center',
        paddingHorizontal: 20,
        gap: 24,
    },
    taskChip: {
        paddingHorizontal: 4,
        paddingVertical: 4,
        justifyContent: 'center',
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    taskChipSelected: {
        borderBottomColor: 'rgba(255,255,255,0.7)',
    },
    taskChipText: {
        fontSize: 11,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.25)',
        letterSpacing: 1.8,
    },
    taskChipTextSelected: {
        fontSize: 11,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: 1.8,
    },

    // --- New Compact Controls Styles ---
    actionBtnStartCompact: {
        backgroundColor: '#FFCC00',
        height: 32,
        paddingHorizontal: 16,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#FFCC00',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 4,
        elevation: 4,
    },
    actionBtnCompleteCompact: {
        backgroundColor: '#00E676',
        height: 32,
        paddingHorizontal: 16,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#00E676',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 4,
        elevation: 4,
    },
    actionBtnTextCompact: {
        color: '#000000',
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 0.5,
    },
    extendBtnCompact: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        height: 32,
        minWidth: 32,
        paddingHorizontal: 6,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)'
    },
    extendBtnTextCompact: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: '700',
    },
    timerLabelInteractive: {
        fontSize: 14,
        fontWeight: '700',
        letterSpacing: 1,
        color: 'rgba(255,255,255,0.6)',
    },
});
