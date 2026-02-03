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
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
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
        // But we ideally want to set the ID so it sticks
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

    const handlePause = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPause();
    };

    const handleReset = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onReset();
    };

    const handleCancel = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onClose();
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
                {/* Top Center: All Tasks Bar (Landscape only) */}
                {isLandscape && (
                    <View style={styles.bottomTaskBarContainer}>
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
                                activeOpacity={0.7}
                            >
                                <Text style={selectedTaskId === 'ALL' ? styles.taskChipTextSelected : styles.taskChipText}>ALL</Text>
                            </TouchableOpacity>
                            {tasks.map((task, index) => {
                                const isSelected = selectedTaskId === task.id;
                                const taskColor = task.color || '#FFFFFF';
                                return (
                                    <TouchableOpacity
                                        key={`chip-${task.id}`}
                                        style={[
                                            styles.taskChip,
                                            isSelected && { borderBottomColor: taskColor }
                                        ]}
                                        onPress={() => {
                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                            setSelectedTaskId(task.id);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={isSelected ? [styles.taskChipTextSelected, { color: taskColor }] : styles.taskChipText}>
                                            {task.title.toUpperCase()}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>
                )}

                {/* Top left: Completed and Upcoming stages (table form, collapsible, side-by-side in landscape) */}
                <View style={[styles.topLeftSections, isLandscape && styles.topLeftSectionsLandscape]}>
                    <View style={[styles.stageSection, isLandscape && styles.stageSectionLandscape]}>
                        <TouchableOpacity
                            style={styles.stageSectionHeader}
                            onPress={toggleCompleted}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.stageSectionLabel}>COMPLETED</Text>
                            <MaterialIcons
                                name={completedExpanded ? 'expand-less' : 'expand-more'}
                                size={20}
                                color="rgba(255,255,255,0.5)"
                            />
                        </TouchableOpacity>
                        {completedExpanded && (
                            <>
                                <View style={styles.tableSeparator} />
                                <View style={styles.tableHeaderRow}>
                                    <Text style={styles.tableHeaderTask}>TASK NAME</Text>
                                    <Text style={styles.tableHeaderStart}>START</Text>
                                    <Text style={styles.tableHeaderDur}>DUR.</Text>
                                </View>
                                <ScrollView
                                    style={[styles.stageSectionScroll, isLandscape && styles.stageSectionScrollLandscape]}
                                    contentContainerStyle={styles.stageSectionScrollContent}
                                    showsVerticalScrollIndicator={true}
                                >
                                    {filteredCompleted.map((stage, index) => {
                                        // Overdue process tasks: render yellow, clickable start button
                                        if (stage.isOverdueProcess) {
                                            return (
                                                <View key={`c-${index}`} style={styles.tableRow}>
                                                    <Text style={[styles.tableCellTask, { color: '#FFCC00' }]}>
                                                        {stage.text}
                                                    </Text>
                                                    <TouchableOpacity
                                                        style={{
                                                            paddingHorizontal: 6,
                                                            paddingVertical: 2,
                                                            borderRadius: 4,
                                                            borderWidth: 1,
                                                            borderColor: '#FFCC00',
                                                            backgroundColor: 'rgba(255, 204, 0, 0.1)',
                                                            minWidth: 42,
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
                                                                    currentStatus: 'Process' // Current status is Process
                                                                });
                                                                setStatusPopupVisible(true);
                                                            }
                                                        }}
                                                    >
                                                        <Text style={{
                                                            fontSize: 11,
                                                            fontWeight: '800',
                                                            color: '#FFCC00', // Yellow text
                                                            fontVariant: ['tabular-nums'],
                                                        }}>
                                                            {formatStartTimeHHMM(stage.startTimeMinutes)}
                                                        </Text>
                                                    </TouchableOpacity>
                                                    <Text style={[styles.tableCellDur, { color: '#FFCC00' }]}>
                                                        {formatDuration(stage.durationMinutes)}
                                                    </Text>
                                                </View>
                                            );
                                        }
                                        // Standard completed tasks: render green
                                        return (
                                            <View key={`c-${index}`} style={styles.tableRow}>
                                                <Text style={[styles.tableCellTask, { color: '#45d075' }]}>
                                                    {stage.text}
                                                </Text>
                                                <Text style={[styles.tableCellStart, { color: '#45d075' }]}>
                                                    {formatStartTimeHHMM(stage.startTimeMinutes)}
                                                </Text>
                                                <Text style={[styles.tableCellDur, { color: '#45d075' }]}>
                                                    {formatDuration(stage.durationMinutes)}
                                                </Text>
                                            </View>
                                        );
                                    })}
                                </ScrollView>
                            </>
                        )}
                    </View>
                    <View style={[styles.stageSection, isLandscape && styles.stageSectionLandscape]}>
                        <TouchableOpacity
                            style={styles.stageSectionHeader}
                            onPress={toggleUpcoming}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.stageSectionLabel}>UPCOMING</Text>
                            <MaterialIcons
                                name={upcomingExpanded ? 'expand-less' : 'expand-more'}
                                size={20}
                                color="rgba(255,255,255,0.5)"
                            />
                        </TouchableOpacity>
                        {upcomingExpanded && (
                            <>
                                <View style={styles.tableSeparator} />
                                <View style={styles.tableHeaderRow}>
                                    <Text style={styles.tableHeaderTask}>TASK NAME</Text>
                                    <Text style={styles.tableHeaderStart}>START</Text>
                                    <Text style={styles.tableHeaderDur}>DUR.</Text>
                                </View>
                                <ScrollView
                                    style={[styles.stageSectionScroll, isLandscape && styles.stageSectionScrollLandscape]}
                                    contentContainerStyle={styles.stageSectionScrollContent}
                                    showsVerticalScrollIndicator={true}
                                >
                                    {filteredUpcoming.map((stage, index) => (
                                        <View key={`u-${index}`} style={styles.tableRow}>
                                            <Text style={[styles.tableCellTask, { color: 'rgba(255,255,255,0.5)' }]}>
                                                {stage.text}
                                            </Text>
                                            <TouchableOpacity
                                                style={{
                                                    backgroundColor: stage.isLate ? '#FF4F4F' : '#FFCC00',
                                                    paddingHorizontal: 6,
                                                    paddingVertical: 4,
                                                    borderRadius: 4,
                                                    minWidth: 42,
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
                                                            currentStatus: 'Upcoming'
                                                        });
                                                        setStatusPopupVisible(true);
                                                    }
                                                }}
                                            >
                                                <Text style={{
                                                    fontSize: 11,
                                                    fontWeight: '800',
                                                    color: stage.isLate ? '#FFFFFF' : '#000000',
                                                    fontVariant: ['tabular-nums'],
                                                }}>
                                                    {formatStartTimeHHMM(stage.startTimeMinutes)}
                                                </Text>
                                            </TouchableOpacity>
                                            <Text style={[styles.tableCellDur, { color: 'rgba(255,255,255,0.5)' }]}>
                                                {formatDuration(stage.durationMinutes)}
                                            </Text>
                                        </View>
                                    ))}
                                </ScrollView>
                            </>
                        )}
                    </View>
                    <View style={[styles.stageSection, isLandscape && styles.stageSectionLandscape]}>
                        <TouchableOpacity
                            style={styles.stageSectionHeader}
                            onPress={toggleUndone}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.stageSectionLabel}>UNDONE</Text>
                            <MaterialIcons
                                name={undoneExpanded ? 'expand-less' : 'expand-more'}
                                size={20}
                                color="rgba(255,255,255,0.5)"
                            />
                        </TouchableOpacity>
                        {undoneExpanded && (
                            <>
                                <View style={styles.tableSeparator} />
                                <View style={styles.tableHeaderRow}>
                                    <Text style={styles.tableHeaderTask}>TASK NAME</Text>
                                    <Text style={styles.tableHeaderStart}>START</Text>
                                    <Text style={styles.tableHeaderDur}>DUR.</Text>
                                </View>
                                <ScrollView
                                    style={[styles.stageSectionScroll, isLandscape && styles.stageSectionScrollLandscape]}
                                    contentContainerStyle={styles.stageSectionScrollContent}
                                    showsVerticalScrollIndicator={true}
                                >
                                    {filteredUndone.map((stage, index) => (
                                        <View key={`d-${index}`} style={styles.tableRow}>
                                            <Text style={[styles.tableCellTask, { color: '#ff4f4f' }]}>
                                                {stage.text}
                                            </Text>
                                            <Text style={[styles.tableCellStart, { color: '#ff4f4f' }]}>
                                                {formatStartTimeHHMM(stage.startTimeMinutes)}
                                            </Text>
                                            <Text style={[styles.tableCellDur, { color: '#ff4f4f' }]}>
                                                {formatDuration(stage.durationMinutes)}
                                            </Text>
                                        </View>
                                    ))}
                                </ScrollView>
                            </>
                        )}
                    </View>
                </View>

                {/* Bottom left: Cancel (X) */}
                <View style={[styles.controlsContainer, isLandscape && styles.controlsContainerLandscape]}>
                    <TouchableOpacity
                        style={styles.cancelBtn}
                        onPress={handleCancel}
                        activeOpacity={0.7}
                    >
                        <MaterialIcons name="close" size={24} color="#FFFFFF" />
                    </TouchableOpacity>
                </View>

                {/* Top right: live stage name(s) with start time and descending countdown HH:MM:SS */}
                <View style={[styles.liveStagesContainer, isLandscape && styles.liveStagesContainerLandscape]}>
                    <Text style={styles.liveStagesLabel}>LIVE STAGES</Text>
                    <ScrollView
                        style={styles.liveStagesScroll}
                        contentContainerStyle={styles.liveStagesScrollContent}
                        showsVerticalScrollIndicator={true}
                    >
                        {liveStages.length === 0 ? (
                            <View style={[styles.liveStageRow, { borderRightColor: 'transparent', opacity: 0.7 }]}>
                                <Text
                                    style={[
                                        styles.liveStageName,
                                        { color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }
                                    ]}
                                >
                                    Waiting for new task...
                                </Text>
                            </View>
                        ) : (
                            liveStages.map((stage, index) => {
                                const isFocused = activeStage?.id === stage.id;
                                return (
                                    <TouchableOpacity
                                        key={index}
                                        style={[styles.liveStageRow, isFocused && styles.liveStageRowSelected]}
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
                                                        ? '#00E676' // Green for running
                                                        : (isFocused ? '#FFCC00' : 'rgba(255,255,255,0.7)') // Yellow for focused
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
                </View>

                {/* Bottom right: running timer display (Live Stage Countdown) */}
                <View style={[styles.timerBottomRight, isLandscape && styles.timerBottomRightLandscape]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                        {activeStage?.status === 'Upcoming' && onStartStage && activeStage.id !== undefined && (
                            <TouchableOpacity
                                onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                    onStartStage(activeStage.taskId, activeStage.id!);
                                }}
                                style={{
                                    backgroundColor: '#FFCC00',
                                    paddingHorizontal: 20,
                                    paddingVertical: 8,
                                    borderRadius: 30,
                                    shadowColor: '#FFCC00',
                                    shadowOffset: { width: 0, height: 0 },
                                    shadowOpacity: 0.6,
                                    shadowRadius: 8,
                                    elevation: 6,
                                }}
                            >
                                <Text style={{
                                    color: '#000000',
                                    fontSize: 13,
                                    fontWeight: '900',
                                    letterSpacing: 1,
                                }}>
                                    START
                                </Text>
                            </TouchableOpacity>
                        )}
                        {activeStage?.status === 'Process' && onCompleteStage && activeStage.id !== undefined && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                <TouchableOpacity
                                    onPress={() => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                                        onCompleteStage(activeStage.taskId, activeStage.id!);
                                    }}
                                    style={{
                                        backgroundColor: '#00E676',
                                        paddingHorizontal: 20,
                                        paddingVertical: 8,
                                        borderRadius: 30,
                                        shadowColor: '#00E676',
                                        shadowOffset: { width: 0, height: 0 },
                                        shadowOpacity: 0.6,
                                        shadowRadius: 8,
                                        elevation: 6,
                                    }}
                                >
                                    <Text style={{
                                        color: '#000000',
                                        fontSize: 13,
                                        fontWeight: '900',
                                        letterSpacing: 1,
                                    }}>
                                        COMPLETE
                                    </Text>
                                </TouchableOpacity>

                                {onExtendStage && (
                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        {[5, 10, 20].map((mins) => (
                                            <TouchableOpacity
                                                key={`+${mins}`}
                                                onPress={() => {
                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                    onExtendStage(activeStage.taskId, activeStage.id!, mins);
                                                }}
                                                style={{
                                                    backgroundColor: 'rgba(255,255,255,0.1)',
                                                    paddingHorizontal: 10,
                                                    paddingVertical: 8,
                                                    borderRadius: 20,
                                                    borderWidth: 1,
                                                    borderColor: 'rgba(255,255,255,0.2)'
                                                }}
                                            >
                                                <Text style={{
                                                    color: '#FFFFFF',
                                                    fontSize: 11,
                                                    fontWeight: '700',
                                                }}>
                                                    +{mins}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )}
                            </View>
                        )}
                        <Text style={styles.timerLabel} numberOfLines={1}>
                            {activeStage ? (activeStage.text.length > 8 ? '...' + activeStage.text.slice(-14).toUpperCase() : activeStage.text.toUpperCase()) : 'TIMER'}
                        </Text>
                    </View>
                    <Text
                        style={[
                            styles.timerDisplay,
                            isLandscape && styles.timerDisplayLandscape,
                            { color: timerTextColor },
                        ]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                    >
                        {activeStage && activeStage.status !== 'Upcoming'
                            ? formatTimerHHMMSS(activeStage.remainingSeconds)
                            : '00:00:00'}
                    </Text>
                </View>

                <StageActionPopup
                    visible={statusPopupVisible}
                    position={statusPopupPosition}
                    currentStatus={statusPopupStage?.currentStatus || 'Upcoming'}
                    onClose={() => setStatusPopupVisible(false)}
                    onSelectStatus={(status) => {
                        setStatusPopupVisible(false);
                        if (!statusPopupStage) return;

                        if (status === 'Process') {
                            if (onStartStage) onStartStage(statusPopupStage.taskId, statusPopupStage.stageId);
                        } else if (onUpdateStageStatus) {
                            onUpdateStageStatus(statusPopupStage.taskId, statusPopupStage.stageId, status);
                        }
                    }}
                />
            </View>
        </Modal >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
    },
    controlsContainer: {
        position: 'absolute',
        bottom: 24,
        left: 24,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        zIndex: 10,
    },
    controlsContainerLandscape: {
        bottom: 0,
        left: 0,
        paddingBottom: 20,
        paddingLeft: 20,
        gap: 20,
    },
    playPauseBtn: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(255,255,255,0.12)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    resetBtn: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    cancelBtn: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: 'rgba(0,0,0,0.6)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    topLeftSections: {
        position: 'absolute',
        top: 24,
        left: 24,
        flexDirection: 'column',
        maxWidth: 550,
        maxHeight: '58%',
        zIndex: 10,
        gap: 20,
    },
    topLeftSectionsLandscape: {
        top: 30,
        left: 20,
        flexDirection: 'row',
        maxWidth: '75%',
        maxHeight: '55%',
        gap: 16,
        alignItems: 'flex-start',
    },
    stageSection: {
        flex: 0,
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
    },
    stageSectionLabel: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 2,
        color: 'rgba(255,255,255,0.4)',
    },
    tableSeparator: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.25)',
        marginBottom: 8,
        width: '100%',
    },
    tableHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
        paddingRight: 4,
    },
    tableHeaderTask: {
        flex: 1,
        fontSize: 9,
        fontWeight: '700',
        letterSpacing: 1.2,
        color: 'rgba(255,255,255,0.4)',
    },
    tableHeaderStart: {
        width: 48,
        fontSize: 9,
        fontWeight: '700',
        letterSpacing: 1.2,
        color: 'rgba(255,255,255,0.4)',
        textAlign: 'center',
    },
    tableHeaderDur: {
        width: 36,
        fontSize: 9,
        fontWeight: '700',
        letterSpacing: 1.2,
        color: 'rgba(255,255,255,0.4)',
        textAlign: 'right',
    },
    stageSectionScroll: {
        maxHeight: 220,
    },
    stageSectionScrollLandscape: {
        maxHeight: 160,
    },
    stageSectionScrollContent: {
        paddingVertical: 4,
        paddingRight: 4,
    },
    tableRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 12,
        minHeight: 24,
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
        alignSelf: 'center',
    },
    tableCellDur: {
        width: 36,
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 0.3,
        fontVariant: ['tabular-nums'],
        textAlign: 'right',
        alignSelf: 'center',
    },
    liveStagesContainer: {
        position: 'absolute',
        top: 80,
        right: 24,
        alignItems: 'flex-end',
        maxWidth: 220,
        maxHeight: '50%',
        zIndex: 10,
    },
    liveStagesContainerLandscape: {
        top: 24,
        right: 20,
        maxWidth: 200,
        maxHeight: '45%',
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
        fontSize: 20,
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
    timerBottomRight: {
        position: 'absolute',
        bottom: 24,
        right: 24,
        alignItems: 'flex-start',
        justifyContent: 'flex-end',
        zIndex: 5,
    },
    timerBottomRightLandscape: {
        bottom: 20,
        right: 20,
    },
    timerLabel: {
        fontSize: 14,
        fontWeight: '700',
        letterSpacing: 2,
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 8,
        textAlign: 'left',
        maxWidth: 300,
    },
    timerDisplay: {
        fontSize: 72,
        fontWeight: '900',
        letterSpacing: 2,
        fontVariant: ['tabular-nums'],
    },
    timerDisplayLandscape: {
        fontSize: 96,
        letterSpacing: 4,
    },
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
});
