import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Dimensions,
    Platform,
    Animated,
    Easing,
    useWindowDimensions,
    Modal,
    PanResponder,
    ActivityIndicator,
    LayoutAnimation,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { MaterialIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Timer, Category, SOUND_OPTIONS } from '../../../constants/data';
import { getLogicalDate, getStartOfLogicalDay, DEFAULT_DAILY_START_MINUTES, formatDailyStartRangeCompact } from '../../../utils/dailyStartTime';

// SOUND_OPTIONS moved to constants/data.ts

// Helper function to parse time string (HH:MM:SS or MM:SS) to seconds
const parseTimeToSeconds = (timeStr: string): number => {
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 3) {
        // HH:MM:SS format
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    // MM:SS format (backwards compatibility)
    return parts[0] * 60 + parts[1];
};

// Calculate completion percentage with borrowed time awareness
const getCompletionPercentage = (currentTime: string, totalTime: string, borrowedSeconds: number = 0): number => {
    const current = parseTimeToSeconds(currentTime);
    const originalTotal = parseTimeToSeconds(totalTime);
    const total = originalTotal + borrowedSeconds;
    if (total === 0) return 0;
    const elapsed = total - current;
    return Math.min(100, Math.max(0, (elapsed / total) * 100));
};

// Format seconds to HH:MM:SS
const formatTotalTime = (totalSeconds: number): string => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

// Format borrowed time for display (e.g. +30 min or 1 hr 20 min)
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const formatBorrowedTime = (seconds: number): string => {
    if (seconds <= 0) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) {
        return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
    }
    return `+${m} min`;
};

// Format saved time (e.g. Saved 2 min or Saved 1 hr)
const formatSavedTime = (seconds: number): string => {
    if (seconds <= 0) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) {
        return m > 0 ? `Saved ${h}h ${m}m` : `Saved ${h}h`;
    }
    return `Saved ${m} min`;
};

// Format as 00:00:00 with borrowed time included
const getExpandedTotal = (total: string, borrowedSecs: number): string => {
    const originalSecs = parseTimeToSeconds(total);
    return formatTotalTime(originalSecs + borrowedSecs);
};

const { width, height } = Dimensions.get('window');

interface TimerListProps {
    timers: Timer[];
    onAddTimer: () => void;
    onLongPressTimer: (timer: Timer) => void;
    onStartTimer: (timer: Timer) => void;
    onPlayPause: (timer: Timer) => void;
    onSettings?: () => void;
    onTimerCompleted?: (timer: Timer) => void;
    onBorrowTime?: (timer: Timer, seconds: number) => void;
    onAcknowledgeCompletion?: (timerId: number) => void;
    selectedSound?: number;
    soundRepetition?: number;
    isPastTimersDisabled: boolean;
    categories: Category[];
    activeView?: 'timer' | 'task';
    onViewChange?: (view: 'timer' | 'task') => void;
    /** Called when the live button is clicked - should switch to task view and open live view */
    onRequestLiveView?: () => void;
}

export default function TimerList({
    timers,
    onAddTimer,
    onLongPressTimer,
    onStartTimer,
    onPlayPause,
    onSettings,
    onTimerCompleted,
    onBorrowTime,
    onAcknowledgeCompletion,
    selectedSound = 0,
    soundRepetition = 1,
    selectedDate: propSelectedDate,
    onDateChange,
    isPastTimersDisabled,
    dailyStartMinutes = DEFAULT_DAILY_START_MINUTES,
    categories,
    activeView = 'timer',
    onViewChange,
    onRequestLiveView
}: TimerListProps & { selectedDate: Date; onDateChange: (date: Date) => void; dailyStartMinutes?: number }) {
    const [filterCategoryId, setFilterCategoryId] = useState<string>('All');
    const [filterStatus, setFilterStatus] = useState<string>('All');
    const [isCategoryExpanded, setIsCategoryExpanded] = useState(false);
    const [isStatusExpanded, setIsStatusExpanded] = useState(false);
    const formatISOToTime = (isoString?: string) => {
        if (!isoString || isoString === '--:--') return '--:--';
        try {
            const date = new Date(isoString);
            if (isNaN(date.getTime())) return isoString;
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');
            return `${hours}:${minutes}`;
        } catch (e) {
            return isoString;
        }
    };

    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const isLandscape = screenWidth > screenHeight;
    const [showReportPopup, setShowReportPopup] = useState(false);
    const [showCalendar, setShowCalendar] = useState(false);
    const [showFiltersPortrait, setShowFiltersPortrait] = useState(false);
    const [viewDate, setViewDate] = useState(new Date());
    const [internalSelectedDate, setInternalSelectedDate] = useState(propSelectedDate);
    const slideAnim = useRef(new Animated.Value(0)).current;
    const fadeAnim = useRef(new Animated.Value(1)).current;
    const toggleSlideAnim = useRef(new Animated.Value(activeView === 'task' ? 1 : 0)).current;
    const [completedPopupTimer, setCompletedPopupTimer] = useState<Timer | null>(null);
    const prevTimersRef = React.useRef<Timer[]>([]);
    const soundRef = useRef<Audio.Sound | null>(null);
    const playCountRef = useRef(0);

    // Keep screen awake while any timer is running
    useEffect(() => {
        const isAnyTimerRunning = timers.some(t => t.status === 'Running');
        if (isAnyTimerRunning) {
            activateKeepAwakeAsync();
        } else {
            deactivateKeepAwake();
        }

        return () => {
            deactivateKeepAwake();
        };
    }, [timers]);

    // Play completion sound when popup shows
    useEffect(() => {
        if (!completedPopupTimer) return;

        console.log('Completion popup triggered - playing sound');

        const playSound = async () => {
            try {
                // Small delay to ensure popup is rendered
                await new Promise(resolve => setTimeout(resolve, 100));

                await Audio.setAudioModeAsync({
                    playsInSilentModeIOS: true,
                    staysActiveInBackground: false,
                    shouldDuckAndroid: true,
                    playThroughEarpieceAndroid: false,
                });

                const playSoundOnce = async () => {
                    const soundOption = SOUND_OPTIONS[selectedSound];
                    const soundUri = soundOption?.uri;

                    if (!soundUri) {
                        console.log('Sound is muted or NO URI found for index:', selectedSound);
                        return;
                    }

                    console.log('Playing sound:', soundUri);

                    const { sound } = await Audio.Sound.createAsync(
                        { uri: soundUri },
                        { shouldPlay: true, volume: 1.0 }
                    );
                    soundRef.current = sound;

                    sound.setOnPlaybackStatusUpdate((status) => {
                        if (status.isLoaded && status.didJustFinish) {
                            playCountRef.current += 1;
                            sound.unloadAsync();

                            if (playCountRef.current < soundRepetition) {
                                setTimeout(() => playSoundOnce(), 300);
                            }
                        }
                    });
                };

                playCountRef.current = 0;
                await playSoundOnce();
            } catch (error) {
                console.error('Failed to play completion sound:', error);
            }
        };

        playSound();

        return () => {
            if (soundRef.current) {
                soundRef.current.unloadAsync();
            }
        };
    }, [completedPopupTimer, selectedSound, soundRepetition]);

    // Detect when a timer completes and show popup
    React.useEffect(() => {
        // Check if any timer just transitioned to Completed status OR is Completed but not yet acknowledged
        for (const timer of timers) {
            const prevTimer = prevTimersRef.current.find(t => t.id === timer.id);
            const justCompleted = prevTimer && prevTimer.status === 'Running' && timer.status === 'Completed';
            const completedButNotAcknowledged = timer.status === 'Completed' && timer.isAcknowledged === false;

            if (justCompleted || completedButNotAcknowledged) {
                // Timer just completed or was found in a "new" completed state - show popup
                setCompletedPopupTimer(timer);

                // Acknowledge immediately so it doesn't trigger again on re-render
                if (onAcknowledgeCompletion) {
                    onAcknowledgeCompletion(timer.id);
                }

                if (onTimerCompleted) {
                    onTimerCompleted(timer);
                }
                break;
            }
        }
        // Update ref for next comparison
        prevTimersRef.current = [...timers];
    }, [timers, onTimerCompleted, onAcknowledgeCompletion]);

    // Logical date for the selected day (uses daily start time for rollover)
    const selectedLogical = getLogicalDate(propSelectedDate, dailyStartMinutes);

    const dateFilteredTimers = timers.filter(t => t.forDate === selectedLogical);

    const filteredTimers = dateFilteredTimers
        .filter(t => {
            const matchesCategory = filterCategoryId === 'All' || t.categoryId === filterCategoryId;
            const matchesStatus = filterStatus === 'All' || t.status === filterStatus;
            return matchesCategory && matchesStatus;
        })
        .sort((a, b) => {
            // 1. Pinned timers first
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;

            // 2. Among pinned, latest pinTimestamp first
            if (a.isPinned && b.isPinned) {
                return (b.pinTimestamp || 0) - (a.pinTimestamp || 0);
            }

            // 3. Normal ordering (not explicitly specified, keep current relative order or sort by ID/time)
            return 0;
        });

    // Calculate analytics (based on date matches only, or filtered? Let's keep analytics for the whole day)
    const completedCount = dateFilteredTimers.filter(t => t.status === 'Completed').length;
    const totalCount = dateFilteredTimers.length;
    const completionPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    // Calculate total time (for the selected filters)
    const totalTimeSeconds = filteredTimers.reduce((acc, timer) => {
        return acc + parseTimeToSeconds(timer.total);
    }, 0);
    const totalHours = Math.floor(totalTimeSeconds / 3600);
    const totalMinutes = Math.floor((totalTimeSeconds % 3600) / 60);
    const totalTimeFormatted = formatTotalTime(totalTimeSeconds);

    // Get current date derived from selected date
    const dayName = DAYS[propSelectedDate.getDay()].toUpperCase();
    const dayNum = propSelectedDate.getDate();
    const monthName = MONTHS[propSelectedDate.getMonth()].toUpperCase();

    // Calculate time remaining (sum of current times for non-completed timers)
    const timeRemainingSeconds = filteredTimers
        .filter(t => t.status !== 'Completed')
        .reduce((acc, timer) => acc + parseTimeToSeconds(timer.time), 0);
    const remainingHours = Math.floor(timeRemainingSeconds / 3600);
    const remainingMinutes = Math.floor((timeRemainingSeconds % 3600) / 60);
    const remainingSeconds = timeRemainingSeconds % 60;

    // Calculate total borrowed time
    const totalBorrowedSeconds = filteredTimers.reduce((acc, timer) => acc + (timer.borrowedTime || 0), 0);
    const borrowedHours = Math.floor(totalBorrowedSeconds / 3600);
    const borrowedMinutes = Math.floor((totalBorrowedSeconds % 3600) / 60);
    const borrowedSeconds = totalBorrowedSeconds % 60;

    const isToday = selectedLogical === getLogicalDate(new Date(), dailyStartMinutes);
    const isPast = selectedLogical < getLogicalDate(new Date(), dailyStartMinutes);
    const isReadOnly = isPast && isPastTimersDisabled;
    const dateLabel = isToday ? 'TODAY' : `on ${dayName} ${dayNum}`;
    // Calendar Helpers
    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const days = new Date(year, month + 1, 0).getDate();
        const firstDay = new Date(year, month, 1).getDay();
        return { days, firstDay };
    };

    const changeMonth = (offset: number) => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 150,
                useNativeDriver: true,
            }),
            Animated.timing(slideAnim, {
                toValue: offset > 0 ? -20 : 20,
                duration: 150,
                useNativeDriver: true,
            })
        ]).start(() => {
            const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1);
            setViewDate(newDate);
            slideAnim.setValue(offset > 0 ? 20 : -20);
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 150,
                    useNativeDriver: true,
                }),
                Animated.timing(slideAnim, {
                    toValue: 0,
                    duration: 150,
                    useNativeDriver: true,
                })
            ]).start();
        });
    };

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 20,
            onPanResponderRelease: (evt, gestureState) => {
                if (gestureState.dx > 40) {
                    changeMonth(-1);
                } else if (gestureState.dx < -40) {
                    changeMonth(1);
                }
            },
        })
    ).current;

    const renderCalendar = () => {
        const { days, firstDay } = getDaysInMonth(viewDate);
        const calendarDays = [];
        const prevMonthDays = new Date(viewDate.getFullYear(), viewDate.getMonth(), 0).getDate();

        // Fill empty days from previous month
        for (let i = 0; i < firstDay; i++) {
            calendarDays.push({ day: prevMonthDays - firstDay + i + 1, currentMonth: false });
        }
        // Fill days of current month
        for (let i = 1; i <= days; i++) {
            calendarDays.push({ day: i, currentMonth: true });
        }
        // Fill remaining days for 6-row grid (42 cells)
        const totalCells = 42;
        const remainingCells = totalCells - calendarDays.length;
        for (let i = 1; i <= remainingCells; i++) {
            calendarDays.push({ day: i, currentMonth: false });
        }

        const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

        return (
            <View style={styles.calendarContainer} {...panResponder.panHandlers}>
                {/* Calendar Header */}
                <View style={styles.calendarHeader}>
                    {!isLandscape && (
                        <TouchableOpacity
                            onPress={() => setShowCalendar(false)}
                            style={styles.calendarBackBtn}
                        >
                            <MaterialIcons name="chevron-left" size={24} color="#fff" />
                        </TouchableOpacity>
                    )}
                    <Text style={[styles.calendarTitle, !isLandscape && styles.calendarTitlePortrait]}>
                        {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
                    </Text>
                    <View style={styles.calendarNav}>
                        <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.calNavBtn}>
                            <MaterialIcons name="keyboard-arrow-left" size={isLandscape ? 20 : 24} color="rgba(255,255,255,0.7)" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => changeMonth(1)} style={styles.calNavBtn}>
                            <MaterialIcons name="keyboard-arrow-right" size={isLandscape ? 20 : 24} color="rgba(255,255,255,0.7)" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Weekday Names */}
                <View style={styles.weekDaysRow}>
                    {weekDays.map((d, i) => (
                        <Text key={i} style={styles.weekDayText}>{d}</Text>
                    ))}
                </View>

                {/* Calendar Days Grid */}
                <Animated.View style={[
                    styles.daysGrid,
                    {
                        opacity: fadeAnim,
                        transform: [{ translateX: slideAnim }]
                    }
                ]}>
                    {calendarDays.map((item, index) => {
                        const logicalToday = getLogicalDate(new Date(), dailyStartMinutes);
                        const [ltY, ltM1, ltD] = logicalToday.split('-').map(Number);
                        const isToday = item.currentMonth &&
                            item.day === ltD &&
                            viewDate.getMonth() === ltM1 - 1 &&
                            viewDate.getFullYear() === ltY;

                        const isSelected = item.currentMonth &&
                            item.day === propSelectedDate.getDate() &&
                            viewDate.getMonth() === propSelectedDate.getMonth() &&
                            viewDate.getFullYear() === propSelectedDate.getFullYear();

                        const isPastSelection = isSelected && selectedLogical < getLogicalDate(new Date(), dailyStartMinutes);

                        // Timer count and completion for this date (current month only)
                        let dayTimerCount = 0;
                        let dayTimers: Timer[] = [];
                        let cellLogicalDate = '';
                        if (item.currentMonth) {
                            const y = viewDate.getFullYear(), m = viewDate.getMonth(), d = item.day;
                            const cellDate = new Date(y, m, d, Math.floor(dailyStartMinutes / 60), dailyStartMinutes % 60, 0, 0);
                            cellLogicalDate = getLogicalDate(cellDate, dailyStartMinutes);
                            dayTimers = timers.filter(t => t && t.forDate === cellLogicalDate);
                            dayTimerCount = dayTimers.length;
                        }
                        const isPastDate = item.currentMonth && cellLogicalDate !== '' && cellLogicalDate < logicalToday;
                        const completedCount = dayTimers.filter(t => t.status === 'Completed').length;
                        // Past day bar color: all done = green, all pending/upcoming = red, mixed = yellow (only when has timers)
                        const pastDayBarStyle = isPastDate && dayTimerCount > 0
                            ? (completedCount === dayTimerCount
                                ? { backgroundColor: 'rgba(76,175,80,0.35)' as const }
                                : completedCount === 0
                                    ? { backgroundColor: 'rgba(255,80,80,0.35)' as const }
                                    : { backgroundColor: 'rgba(255,193,7,0.4)' as const })
                            : null;
                        const pastDayTextStyle = isPastDate && dayTimerCount > 0
                            ? (completedCount === dayTimerCount
                                ? { color: '#81C784' as const }
                                : completedCount === 0
                                    ? { color: '#FF8A80' as const }
                                    : { color: '#FFD54F' as const })
                            : null;

                        return (
                            <TouchableOpacity
                                key={index}
                                style={styles.dayCell}
                                onPress={() => {
                                    if (item.currentMonth) {
                                        const y = viewDate.getFullYear(), m = viewDate.getMonth(), d = item.day;
                                        const newSelected = new Date(y, m, d, Math.floor(dailyStartMinutes / 60), dailyStartMinutes % 60, 0, 0);
                                        onDateChange(newSelected);
                                        setInternalSelectedDate(newSelected);
                                    }
                                }}
                            >
                                <View style={[
                                    styles.dayCircle,
                                    !isLandscape && styles.dayCirclePortrait,
                                    isToday && styles.todayCircle,
                                    isSelected && (isPastSelection ? styles.selectedPastDayCircle : styles.selectedDayCircle),
                                    !item.currentMonth && styles.otherMonthDay
                                ]}>
                                    <Text style={[
                                        styles.dayText,
                                        !isLandscape && styles.dayTextPortrait,
                                        isToday && styles.todayText,
                                        isSelected && (isPastSelection ? styles.selectedPastDayText : styles.selectedDayText),
                                        !item.currentMonth && styles.otherMonthText
                                    ]}>
                                        {item.day}
                                    </Text>
                                </View>
                                {item.currentMonth && (
                                    <View style={[
                                        styles.dayTaskCountBar,
                                        !isLandscape && styles.dayTaskCountBarPortrait,
                                        pastDayBarStyle ?? (dayTimerCount > 0
                                            ? { backgroundColor: 'rgba(255,255,255,0.1)' }
                                            : { backgroundColor: 'rgba(255,255,255,0.04)' }),
                                        !pastDayBarStyle && isSelected && (isPastSelection ? { backgroundColor: 'rgba(255,80,80,0.25)' } : { backgroundColor: 'rgba(76,175,80,0.25)' }),
                                        !pastDayBarStyle && isToday && !isSelected && dayTimerCount > 0 && { backgroundColor: 'rgba(255,255,255,0.15)' }
                                    ]}>
                                        <Text style={[
                                            dayTimerCount > 0 ? styles.dayTaskCount : styles.dayTaskCountZero,
                                            pastDayTextStyle ?? (isSelected ? (isPastSelection ? { color: '#FF8080' } : { color: '#81C784' }) : undefined),
                                            !pastDayTextStyle && isToday && !isSelected && dayTimerCount > 0 && { color: 'rgba(255,255,255,0.9)' }
                                        ]}>
                                            {dayTimerCount === 0 ? '–' : dayTimerCount}
                                        </Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </Animated.View>
            </View>
        );
    };

    // Analytics helper: get completion percentage for a timer list
    const getOverallCompletionPercentage = () => {
        return totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    };

    // Render timer cards - for landscape, render in pairs for 2-column grid
    const renderTimerCards = () => {
        if (filteredTimers.length === 0) {
            const renderPlaceholder = (key: string) => (
                <TouchableOpacity
                    key={key}
                    style={[
                        styles.placeholderCard,
                        isLandscape && styles.timerCardLandscape
                    ]}
                    onPress={isReadOnly ? undefined : onAddTimer}
                    activeOpacity={isReadOnly ? 1 : 0.7}
                >
                    <View style={styles.placeholderContent}>
                        <MaterialIcons
                            name={isReadOnly ? "history-toggle-off" : "add-task"}
                            size={32}
                            color="rgba(255,255,255,0.2)"
                        />
                        <Text style={styles.placeholderText}>
                            {isReadOnly ? "NO HISTORY" : "NEW TIMER"}
                        </Text>
                    </View>
                </TouchableOpacity>
            );

            if (isLandscape) {
                return (
                    <>
                        <View style={styles.cardRow}>
                            {renderPlaceholder('p1')}
                            {renderPlaceholder('p2')}
                        </View>
                        <View style={styles.cardRow}>
                            {renderPlaceholder('p3')}
                            {renderPlaceholder('p4')}
                        </View>
                    </>
                );
            }

            return (
                <View style={{ gap: 16 }}>
                    {renderPlaceholder('p1')}
                    {renderPlaceholder('p2')}
                </View>
            );
        }

        if (isLandscape) {
            // Create pairs for 2-column grid
            const pairs: Timer[][] = [];
            for (let i = 0; i < filteredTimers.length; i += 2) {
                pairs.push(filteredTimers.slice(i, i + 2));
            }
            return pairs.map((pair, index) => (
                <View key={index} style={styles.cardRow}>
                    {pair.map((timer) => (
                        <TimerCard
                            key={timer.id}
                            timer={timer}
                            onLongPress={() => !isReadOnly && onLongPressTimer(timer)}
                            onPress={() => onStartTimer(timer)}
                            onPlayPause={() => !isReadOnly && onPlayPause(timer)}
                            isLandscape={true}
                            categories={categories}
                            isReadOnly={isReadOnly}
                        />
                    ))}
                    {pair.length === 1 && <View style={styles.cardPlaceholder} />}
                </View>
            ));
        }

        return filteredTimers.map((timer) => (
            <TimerCard
                key={timer.id}
                timer={timer}
                onLongPress={() => !isReadOnly && onLongPressTimer(timer)}
                onPress={() => onStartTimer(timer)}
                onPlayPause={() => !isReadOnly && onPlayPause(timer)}
                isLandscape={false}
                categories={categories}
                isReadOnly={isReadOnly}
            />
        ));
    };

    return (
        <LinearGradient
            colors={['#000000', '#000000']}
            style={styles.container}
        >
            {/* Background Glow Removed for Pure Black Theme */}

            <SafeAreaView style={[styles.safeArea, isLandscape && styles.safeAreaLandscape]}>
                {isLandscape ? (
                    // LANDSCAPE LAYOUT - Matching Reference Design
                    <>
                        {/* Left Panel - Analytics Dashboard */}
                        <View style={[styles.leftPanel, { width: screenWidth * 0.30 }]}>
                            {/* Single Analytics Card containing all content */}
                            <View style={styles.analyticsCardWrapper}>
                                <ScrollView showsVerticalScrollIndicator={false} style={styles.leftPanelScroll}>
                                    {/* Toggle + Completion Count Row */}
                                    {onViewChange && (
                                        <View style={styles.toggleWithCountRow}>
                                            <View style={styles.viewToggleContainer}>
                                                {/* Animated Sliding Indicator */}
                                                <Animated.View
                                                    style={[
                                                        styles.viewToggleSlider,
                                                        {
                                                            transform: [{
                                                                translateX: toggleSlideAnim.interpolate({
                                                                    inputRange: [0, 1],
                                                                    outputRange: [0, 54] // Adjust based on button width
                                                                })
                                                            }]
                                                        }
                                                    ]}
                                                />
                                                <TouchableOpacity
                                                    style={styles.viewToggleBtn}
                                                    onPress={() => {
                                                        Animated.spring(toggleSlideAnim, {
                                                            toValue: 0,
                                                            useNativeDriver: true,
                                                            friction: 8,
                                                            tension: 100,
                                                        }).start();
                                                        onViewChange('timer');
                                                    }}
                                                    activeOpacity={0.7}
                                                >
                                                    <MaterialIcons
                                                        name="timer"
                                                        size={14}
                                                        color={activeView === 'timer' ? '#fff' : 'rgba(255,255,255,0.4)'}
                                                    />
                                                    <Text style={[
                                                        styles.viewToggleText,
                                                        activeView === 'timer' && styles.viewToggleTextActive
                                                    ]}>TIMER</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={styles.viewToggleBtn}
                                                    onPress={() => {
                                                        Animated.spring(toggleSlideAnim, {
                                                            toValue: 1,
                                                            useNativeDriver: true,
                                                            friction: 8,
                                                            tension: 100,
                                                        }).start();
                                                        onViewChange('task');
                                                    }}
                                                    activeOpacity={0.7}
                                                >
                                                    <MaterialIcons
                                                        name="check-box"
                                                        size={14}
                                                        color={activeView === 'task' ? '#fff' : 'rgba(255,255,255,0.4)'}
                                                    />
                                                    <Text style={[
                                                        styles.viewToggleText,
                                                        activeView === 'task' && styles.viewToggleTextActive
                                                    ]}>TASK</Text>
                                                </TouchableOpacity>
                                            </View>
                                            <View style={styles.completionCountBadge}>
                                                <Text style={styles.completionCountText}>{completedCount}/{totalCount}</Text>
                                            </View>
                                        </View>
                                    )}

                                    {/* Date display with context labeling */}
                                    <View style={styles.dateControlRowLandscape}>
                                        <TouchableOpacity
                                            style={styles.dateLandscapeRow}
                                            onPress={() => {
                                                if (!showCalendar) {
                                                    setViewDate(new Date());
                                                }
                                                setShowCalendar(!showCalendar);
                                            }}
                                            activeOpacity={0.7}
                                        >
                                            <MaterialIcons name="calendar-today" size={14} color="#fff" />
                                            <Text style={styles.dateLandscapeText}>
                                                {isToday ? `  ${dayName}, ${dayNum} ${monthName}` : `  ${dateLabel} ${monthName}`}
                                            </Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={styles.todayNavBtn}
                                            onPress={() => {
                                                if (onRequestLiveView) {
                                                    onRequestLiveView();
                                                } else if (onViewChange) {
                                                    onViewChange('task');
                                                }
                                            }}
                                            activeOpacity={0.7}
                                        >
                                            <MaterialIcons name="sensors" size={12} color="#FF3D00" />
                                        </TouchableOpacity>

                                        {/* Today Navigation Button */}
                                        <TouchableOpacity
                                            style={[styles.todayNavBtn, isToday && styles.todayNavBtnActive]}
                                            onPress={() => {
                                                const start = getStartOfLogicalDay(new Date(), dailyStartMinutes);
                                                onDateChange(start);
                                                setViewDate(start);
                                            }}
                                            activeOpacity={0.7}
                                        >
                                            <MaterialIcons name="today" size={12} color={isToday ? "#4CAF50" : "rgba(255,255,255,0.4)"} />
                                            <View style={styles.todayLabelBlock}>
                                                <Text style={[styles.todayNavText, isToday && styles.todayNavTextActive, { marginLeft: 0 }]}>TODAY</Text>
                                                <Text style={[styles.todayRangeLabel, isToday && styles.todayRangeLabelActive]}>({formatDailyStartRangeCompact(dailyStartMinutes)})</Text>
                                            </View>
                                        </TouchableOpacity>
                                    </View>

                                    {showCalendar ? (
                                        renderCalendar()
                                    ) : (
                                        <>
                                            {/* Compact Stats Grid */}
                                            <View style={styles.compactStatsGrid}>
                                                <View style={styles.compactStatRow}>
                                                    <View style={styles.compactStatItem}>
                                                        <Text style={styles.compactStatLabel}>TOTAL DURATION</Text>
                                                        <Text style={styles.compactStatValue}>
                                                            {String(totalHours).padStart(2, '0')}h {String(totalMinutes).padStart(2, '0')}m
                                                        </Text>
                                                    </View>
                                                    <View style={styles.compactStatItem}>
                                                        <Text style={styles.compactStatLabel}>REMAINING {isToday ? 'TODAY' : ''}</Text>
                                                        <Text style={styles.compactStatValue}>
                                                            {String(remainingHours).padStart(2, '0')}:{String(remainingMinutes).padStart(2, '0')}:{String(remainingSeconds).padStart(2, '0')}
                                                        </Text>
                                                    </View>
                                                </View>
                                            </View>

                                            {/* Expandable Filters Section */}
                                            <View style={styles.filtersSection}>
                                                <Text style={styles.filterHeaderLabel}>FILTERS</Text>

                                                {/* Category Filter */}
                                                <View style={styles.expandableFilterContainer}>
                                                    <TouchableOpacity
                                                        style={styles.expandableHeader}
                                                        onPress={() => setIsCategoryExpanded(!isCategoryExpanded)}
                                                        activeOpacity={0.7}
                                                    >
                                                        <View style={styles.expandableHeaderLeft}>
                                                            <MaterialIcons
                                                                name={filterCategoryId === 'All' ? 'category' : (categories.find(c => c.id === filterCategoryId)?.icon || 'category')}
                                                                size={16}
                                                                color={filterCategoryId === 'All' ? 'rgba(255,255,255,0.4)' : (categories.find(c => c.id === filterCategoryId)?.color || '#fff')}
                                                            />
                                                            <Text style={styles.expandableHeaderText}>
                                                                {filterCategoryId === 'All' ? ' Category' : ` ${categories.find(c => c.id === filterCategoryId)?.name}`}
                                                            </Text>
                                                        </View>
                                                        <MaterialIcons
                                                            name={isCategoryExpanded ? "expand-less" : "expand-more"}
                                                            size={20}
                                                            color="rgba(255,255,255,0.3)"
                                                        />
                                                    </TouchableOpacity>

                                                    {isCategoryExpanded && (
                                                        <View style={styles.expandedContent}>
                                                            <TouchableOpacity
                                                                style={[styles.miniChip, filterCategoryId === 'All' && styles.miniChipActive]}
                                                                onPress={() => setFilterCategoryId('All')}
                                                            >
                                                                <Text style={[styles.miniChipText, filterCategoryId === 'All' && styles.miniChipTextActive]}>All</Text>
                                                            </TouchableOpacity>
                                                            {categories.map(cat => (
                                                                <TouchableOpacity
                                                                    key={cat.id}
                                                                    style={[
                                                                        styles.miniChip,
                                                                        filterCategoryId === cat.id && { backgroundColor: `${cat.color}20`, borderColor: cat.color }
                                                                    ]}
                                                                    onPress={() => setFilterCategoryId(cat.id)}
                                                                >
                                                                    <MaterialIcons name={cat.icon} size={10} color={filterCategoryId === cat.id ? cat.color : 'rgba(255,255,255,0.4)'} />
                                                                    <Text style={[styles.miniChipText, filterCategoryId === cat.id && { color: cat.color }]}> {cat.name}</Text>
                                                                </TouchableOpacity>
                                                            ))}
                                                        </View>
                                                    )}
                                                </View>

                                                {/* Status Filter */}
                                                <View style={styles.expandableFilterContainer}>
                                                    <TouchableOpacity
                                                        style={styles.expandableHeader}
                                                        onPress={() => setIsStatusExpanded(!isStatusExpanded)}
                                                        activeOpacity={0.7}
                                                    >
                                                        <View style={styles.expandableHeaderLeft}>
                                                            <MaterialIcons name="tune" size={16} color={filterStatus === 'All' ? 'rgba(255,255,255,0.4)' : '#fff'} />
                                                            <Text style={styles.expandableHeaderText}>
                                                                {filterStatus === 'All' ? ' Status' : ` ${filterStatus}`}
                                                            </Text>
                                                        </View>
                                                        <MaterialIcons
                                                            name={isStatusExpanded ? "expand-less" : "expand-more"}
                                                            size={20}
                                                            color="rgba(255,255,255,0.3)"
                                                        />
                                                    </TouchableOpacity>

                                                    {isStatusExpanded && (
                                                        <View style={styles.expandedContent}>
                                                            {['All', 'Running', 'Paused', 'Upcoming', 'Completed'].map(status => (
                                                                <TouchableOpacity
                                                                    key={status}
                                                                    style={[styles.miniChip, filterStatus === status && styles.miniChipActive]}
                                                                    onPress={() => setFilterStatus(status)}
                                                                >
                                                                    <Text style={[styles.miniChipText, filterStatus === status && styles.miniChipTextActive]}>{status}</Text>
                                                                </TouchableOpacity>
                                                            ))}
                                                        </View>
                                                    )}
                                                </View>
                                            </View>
                                        </>
                                    )}
                                </ScrollView>

                                {/* Footer Row: Settings icon & Detailed Reports */}
                                <View style={styles.leftPanelFooterRow}>
                                    {onSettings && (
                                        <TouchableOpacity
                                            style={styles.settingsIconBtn}
                                            onPress={onSettings}
                                            activeOpacity={0.7}
                                        >
                                            <MaterialIcons name="settings" size={20} color="rgba(255,255,255,0.7)" />
                                        </TouchableOpacity>
                                    )}

                                    <TouchableOpacity
                                        style={styles.detailedReportsBtn}
                                        onPress={() => setShowReportPopup(true)}
                                    >
                                        <Text style={styles.detailedReportsText}>DETAILED REPORTS</Text>
                                        <MaterialIcons name="chevron-right" size={20} color="rgba(255,255,255,0.5)" />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>

                        {/* Right Panel - Timer Grid */}
                        <View style={styles.rightPanel}>
                            <ScrollView
                                style={styles.scrollViewLandscape}
                                contentContainerStyle={styles.scrollContentLandscape}
                                showsVerticalScrollIndicator={false}
                            >
                                {renderTimerCards()}
                            </ScrollView>

                            {/* Add Button */}
                            <TouchableOpacity style={styles.addButtonLandscape} onPress={onAddTimer} activeOpacity={0.8}>
                                <MaterialIcons name="add" size={28} color="#000" />
                            </TouchableOpacity>
                        </View>
                    </>
                ) : (
                    // PORTRAIT LAYOUT
                    <>
                        <View style={[styles.headerCardPortrait, { flex: 0, minHeight: 0 }]}>
                            <View style={styles.headerMainRowPortrait}>
                                {onSettings && (
                                    <TouchableOpacity
                                        style={styles.headerIconBtnPortrait}
                                        onPress={onSettings}
                                        activeOpacity={0.7}
                                    >
                                        <MaterialIcons name="settings" size={18} color="rgba(255,255,255,0.7)" />
                                    </TouchableOpacity>
                                )}

                                <TouchableOpacity
                                    style={styles.dateSelectorPillPortrait}
                                    onPress={() => {
                                        if (!showCalendar) setViewDate(new Date());
                                        setShowCalendar(!showCalendar);
                                    }}
                                    activeOpacity={0.7}
                                >
                                    <View style={styles.datePillLeft}>
                                        <MaterialIcons name="calendar-today" size={13} color="#fff" />
                                        <Text style={styles.dateSelectorTextPortrait}> {dayName}, {dayNum} {monthName}</Text>
                                    </View>
                                    <MaterialIcons
                                        name={showCalendar ? "keyboard-arrow-up" : "keyboard-arrow-down"}
                                        size={16}
                                        color="rgba(255,255,255,0.3)"
                                    />
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.todayBtnPortrait}
                                    onPress={() => {
                                        if (onRequestLiveView) {
                                            onRequestLiveView();
                                        } else if (onViewChange) {
                                            onViewChange('task');
                                        }
                                    }}
                                    activeOpacity={0.7}
                                >
                                    <MaterialIcons name="sensors" size={12} color="#FF3D00" />
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.todayBtnPortrait, isToday && styles.todayBtnActivePortrait]}
                                    onPress={() => {
                                        const start = getStartOfLogicalDay(new Date(), dailyStartMinutes);
                                        onDateChange(start);
                                        setViewDate(start);
                                    }}
                                    activeOpacity={0.7}
                                >
                                    <MaterialIcons name="today" size={12} color={isToday ? "#4CAF50" : "rgba(255,255,255,0.4)"} />
                                    <View style={styles.todayLabelBlockPortrait}>
                                        <Text style={[styles.todayBtnTextPortrait, isToday && styles.todayBtnTextActivePortrait, { marginLeft: 0 }]}>TODAY</Text>
                                        <Text style={[styles.todayRangeLabel, isToday && styles.todayRangeLabelActive]}>({formatDailyStartRangeCompact(dailyStartMinutes)})</Text>
                                    </View>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[
                                        styles.headerIconBtnPortrait,
                                        { marginLeft: 6 },
                                        showFiltersPortrait && styles.headerIconBtnActivePortrait,
                                        (filterCategoryId !== 'All' || filterStatus !== 'All') && { borderColor: 'rgba(255,255,255,0.3)' }
                                    ]}
                                    onPress={() => {
                                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                        setShowFiltersPortrait(!showFiltersPortrait);
                                    }}
                                    activeOpacity={0.7}
                                >
                                    <MaterialIcons
                                        name="filter-alt"
                                        size={18}
                                        color={showFiltersPortrait ? "#fff" : (filterCategoryId !== 'All' || filterStatus !== 'All' ? "#fff" : "rgba(255,255,255,0.7)")}
                                    />
                                </TouchableOpacity>
                            </View>

                            {showFiltersPortrait && (
                                <View style={styles.portraitFiltersContainer}>
                                    <ScrollView
                                        horizontal
                                        showsHorizontalScrollIndicator={false}
                                        contentContainerStyle={styles.portraitFiltersScroll}
                                        style={{ flexGrow: 0 }}
                                    >
                                        <TouchableOpacity
                                            style={[styles.miniChip, filterCategoryId === 'All' && styles.miniChipActive]}
                                            onPress={() => setFilterCategoryId('All')}
                                        >
                                            <Text style={[styles.miniChipText, filterCategoryId === 'All' && styles.miniChipTextActive]}>All Cal</Text>
                                        </TouchableOpacity>
                                        {categories.map(cat => (
                                            <TouchableOpacity
                                                key={cat.id}
                                                style={[
                                                    styles.miniChip,
                                                    filterCategoryId === cat.id && { backgroundColor: `${cat.color}20`, borderColor: cat.color }
                                                ]}
                                                onPress={() => setFilterCategoryId(cat.id)}
                                            >
                                                <MaterialIcons name={cat.icon} size={10} color={filterCategoryId === cat.id ? cat.color : 'rgba(255,255,255,0.4)'} />
                                                <Text style={[styles.miniChipText, filterCategoryId === cat.id && { color: cat.color }]}> {cat.name}</Text>
                                            </TouchableOpacity>
                                        ))}

                                        <View style={styles.filterDividerPortrait} />

                                        {['All', 'Running', 'Paused', 'Upcoming', 'Completed'].map(status => (
                                            <TouchableOpacity
                                                key={status}
                                                style={[styles.miniChip, filterStatus === status && styles.miniChipActive]}
                                                onPress={() => setFilterStatus(status)}
                                            >
                                                <Text style={[styles.miniChipText, filterStatus === status && styles.miniChipTextActive]}>{status}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                </View>
                            )}

                            {showCalendar && (
                                <View style={styles.portraitCalendarContainer}>
                                    {renderCalendar()}
                                </View>
                            )}
                        </View>

                        {/* Separator Line */}
                        <View style={styles.separatorContainer}>
                            <LinearGradient
                                colors={['transparent', 'rgba(255,255,255,0.2)', 'transparent']}
                                start={{ x: 0, y: 0.5 }}
                                end={{ x: 1, y: 0.5 }}
                                style={styles.separator}
                            />
                        </View>

                        {/* Timer Cards */}
                        <ScrollView
                            style={styles.scrollView}
                            contentContainerStyle={styles.scrollContent}
                            showsVerticalScrollIndicator={false}
                        >
                            {renderTimerCards()}
                        </ScrollView>

                        {/* Add Button */}
                        <TouchableOpacity style={styles.addButton} onPress={onAddTimer} activeOpacity={0.8}>
                            <MaterialIcons name="add" size={28} color="#000" />
                        </TouchableOpacity>
                    </>
                )}
            </SafeAreaView>

            {/* Detailed Report Upcoming Feature Modal */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={showReportPopup}
                supportedOrientations={['portrait', 'landscape']}
                onRequestClose={() => setShowReportPopup(false)}
            >
                <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setShowReportPopup(false)}
                >
                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                    <View style={styles.modalContent}>
                        <LinearGradient
                            colors={['#000000', '#000000']}
                            style={styles.modalGradient}
                        >
                            <View style={styles.modalHeader}>
                                <MaterialIcons name="analytics" size={32} color="#fff" />
                                <Text style={styles.modalTitle}>Detailed Reports</Text>
                            </View>
                            <View style={styles.reportStatsRow}>
                                <View style={styles.reportStatItem}>
                                    <Text style={styles.reportStatLabel}>TOTAL BORROWED</Text>
                                    <Text style={styles.reportStatValue}>
                                        {String(borrowedHours).padStart(2, '0')}:{String(borrowedMinutes).padStart(2, '0')}:{String(borrowedSeconds).padStart(2, '0')}
                                    </Text>
                                </View>
                                <View style={styles.reportStatItem}>
                                    <Text style={styles.reportStatLabel}>TIMERS EXTENDED</Text>
                                    <Text style={styles.reportStatValue}>
                                        {timers.filter(t => (t.borrowedTime || 0) > 0).length}
                                    </Text>
                                </View>
                            </View>
                            <Text style={styles.modalMessage}>
                                You can analyze your timer extensions here to improve your focus/estimation.
                            </Text>
                            <TouchableOpacity
                                style={styles.modalCloseBtn}
                                onPress={() => setShowReportPopup(false)}
                            >
                                <Text style={styles.modalCloseBtnText}>GOT IT</Text>
                            </TouchableOpacity>
                        </LinearGradient>
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* Completion Popup Modal */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={completedPopupTimer !== null}
                supportedOrientations={['portrait', 'landscape']}
                onRequestClose={() => setCompletedPopupTimer(null)}
            >
                <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setCompletedPopupTimer(null)}
                >
                    <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />

                    {isLandscape ? (
                        /* LANDSCAPE: Combined compact layout */
                        <View style={styles.completedPopupCombinedLandscape}>
                            <LinearGradient
                                colors={['#000000', '#000000']}
                                style={styles.completedPopupCombinedGradient}
                            >
                                <View style={styles.completedPopupLandscapeRow}>
                                    {/* Left Section - Info */}
                                    <View style={styles.completedPopupCombinedLeft}>
                                        <View style={styles.completedPopupIconCircleCompact}>
                                            <MaterialIcons name="check" size={20} color="#4CAF50" />
                                        </View>
                                        <Text style={styles.completedPopupTitleLandscapeCompact}>COMPLETED!</Text>
                                        <Text style={styles.completedPopupTimerNameLandscapeCompact}>
                                            {completedPopupTimer?.title || 'Timer'}
                                        </Text>

                                        <View style={styles.completedPopupDetailsContainerCompact}>
                                            <View style={styles.completedPopupDetailRowCompact}>
                                                <MaterialIcons name="play-circle-outline" size={12} color="#fff" />
                                                <Text style={styles.completedPopupDetailLabelCompact}>Started</Text>
                                                <Text style={styles.completedPopupDetailValueCompact}>
                                                    {formatISOToTime(completedPopupTimer?.startTime)}
                                                </Text>
                                            </View>
                                            <View style={styles.completedPopupDetailRowCompact}>
                                                <MaterialIcons name="check-circle-outline" size={12} color="#4CAF50" />
                                                <Text style={styles.completedPopupDetailLabelCompact}>Ended</Text>
                                                <Text style={styles.completedPopupDetailValueCompact}>
                                                    {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                                </Text>
                                            </View>
                                            <View style={styles.completedPopupDetailRowCompact}>
                                                <MaterialIcons name="add-alarm" size={12} color="#FFD740" />
                                                <Text style={styles.completedPopupDetailLabelCompact}>Extended</Text>
                                                <Text style={styles.completedPopupDetailValueCompact}>
                                                    {completedPopupTimer?.borrowedTime
                                                        ? `${Math.floor((completedPopupTimer.borrowedTime || 0) / 60)}m`
                                                        : 'None'}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>

                                    {/* Vertical Divider */}
                                    <View style={styles.completedPopupDividerVerticalLandscape} />

                                    {/* Right Section - Actions */}
                                    <View style={styles.completedPopupCombinedRight}>
                                        <Text style={styles.completedPopupExtendLabelLandscapeCompact}>EXTEND SESSION</Text>
                                        <View style={styles.completedPopupExtendButtonsLandscapeCompact}>
                                            {[1, 5, 10].map((mins) => (
                                                <TouchableOpacity
                                                    key={mins}
                                                    style={styles.completedPopupExtendBtnLandscapeCompact}
                                                    onPress={() => {
                                                        if (completedPopupTimer && onBorrowTime) {
                                                            onBorrowTime(completedPopupTimer, mins * 60);
                                                            setCompletedPopupTimer(null);
                                                        }
                                                    }}
                                                >
                                                    <Text style={styles.completedPopupExtendBtnTextLandscapeCompact}>+{mins}m</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>

                                        <TouchableOpacity
                                            style={styles.completedPopupCloseBtnRedlandscape}
                                            onPress={() => setCompletedPopupTimer(null)}
                                        >
                                            <Text style={styles.completedPopupCloseBtnTextRedlandscape}>CLOSE</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </LinearGradient>
                        </View>
                    ) : (
                        /* PORTRAIT: Combined compact layout (Vertical) */
                        <View style={styles.completedPopupCombinedPortrait}>
                            <LinearGradient
                                colors={['#000000', '#000000']}
                                style={styles.completedPopupCombinedGradient}
                            >
                                <View style={styles.completedPopupPortraitColumn}>
                                    {/* Top Section - Info */}
                                    <View style={styles.completedPopupCombinedTop}>
                                        <View style={styles.completedPopupIconCircleCompact}>
                                            <MaterialIcons name="check" size={24} color="#4CAF50" />
                                        </View>
                                        <Text style={styles.completedPopupTitleLandscapeCompact}>COMPLETED!</Text>
                                        <Text style={styles.completedPopupTimerNameLandscapeCompact}>
                                            {completedPopupTimer?.title || 'Timer'}
                                        </Text>

                                        <View style={styles.completedPopupDetailsContainerPortraitCompact}>
                                            <View style={styles.completedPopupDetailRowCompact}>
                                                <MaterialIcons name="play-circle-outline" size={14} color="#fff" />
                                                <Text style={styles.completedPopupDetailLabelCompact}>Started</Text>
                                                <Text style={styles.completedPopupDetailValueCompact}>
                                                    {formatISOToTime(completedPopupTimer?.startTime)}
                                                </Text>
                                            </View>
                                            <View style={styles.completedPopupDetailRowCompact}>
                                                <MaterialIcons name="check-circle-outline" size={14} color="#4CAF50" />
                                                <Text style={styles.completedPopupDetailLabelCompact}>Ended</Text>
                                                <Text style={styles.completedPopupDetailValueCompact}>
                                                    {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>

                                    {/* Horizontal Divider */}
                                    <View style={styles.completedPopupDividerHorizontalPortrait} />

                                    {/* Bottom Section - Actions */}
                                    <View style={styles.completedPopupCombinedBottom}>
                                        <Text style={styles.completedPopupExtendLabelLandscapeCompact}>EXTEND SESSION</Text>
                                        <View style={styles.completedPopupExtendButtonsLandscapeCompact}>
                                            {[1, 5, 10].map((mins) => (
                                                <TouchableOpacity
                                                    key={mins}
                                                    style={styles.completedPopupExtendBtnLandscapeCompact}
                                                    onPress={() => {
                                                        if (completedPopupTimer && onBorrowTime) {
                                                            onBorrowTime(completedPopupTimer, mins * 60);
                                                            setCompletedPopupTimer(null);
                                                        }
                                                    }}
                                                >
                                                    <Text style={styles.completedPopupExtendBtnTextLandscapeCompact}>+{mins}m</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>

                                        <TouchableOpacity
                                            style={styles.completedPopupCloseBtnRedlandscape}
                                            onPress={() => setCompletedPopupTimer(null)}
                                        >
                                            <Text style={styles.completedPopupCloseBtnTextRedlandscape}>CLOSE</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </LinearGradient>
                        </View>
                    )}
                </TouchableOpacity>
            </Modal>

        </LinearGradient >
    );
}

interface TimerCardProps {
    timer: Timer;
    onLongPress: () => void;
    onPress: () => void;
    onPlayPause: () => void;
    isLandscape: boolean;
    categories: Category[];
    isReadOnly?: boolean;
}

// Status badge configuration
const getStatusConfig = (status: Timer['status']) => {
    switch (status) {
        case 'Running':
            return { label: 'RUNNING', color: '#00E5FF', bgColor: 'rgba(0,229,255,0.1)' };
        case 'Paused':
            return { label: 'PAUSED', color: '#FFA500', bgColor: 'rgba(255,165,0,0.15)' };
        case 'Completed':
            return { label: 'COMPLETED', color: '#4CAF50', bgColor: 'rgba(76,175,80,0.15)' };
        default:
            return { label: 'UPCOMING', color: 'rgba(255,255,255,0.5)', bgColor: 'rgba(255,255,255,0.08)' };
    }
};

function TimerCard({ timer, onLongPress, onPress, onPlayPause, isLandscape, categories, isReadOnly }: TimerCardProps) {
    const isCompleted = timer.status === 'Completed';
    const isRunning = timer.status === 'Running';

    // Find category info
    const category = categories.find(c => c.id === timer.categoryId);
    const categoryColor = category?.color || '#fff';
    const categoryIcon = category?.icon || 'timer';

    const getStatusColor = () => {
        if (isCompleted) return '#4CAF50';
        if (isRunning) return '#00E5FF';
        return 'rgba(255,255,255,0.4)';
    };
    const isPaused = timer.status === 'Paused';
    const isActive = isRunning || isPaused;

    // Calculate completion percentage for progress fill (total including borrowed)
    const borrowedSeconds = timer.borrowedTime || 0;
    const completionPercentage = isActive && timer.total
        ? getCompletionPercentage(timer.time, timer.total, borrowedSeconds)
        : 0;

    const originalTotalSeconds = parseTimeToSeconds(timer.total);
    const totalSeconds = originalTotalSeconds + borrowedSeconds;
    const originalWeight = totalSeconds > 0 ? (originalTotalSeconds / totalSeconds) : 1;

    // Animated value for smooth progress transition
    const animatedProgress = React.useRef(new Animated.Value(completionPercentage)).current;

    // Animate smoothly when percentage changes
    React.useEffect(() => {
        Animated.timing(animatedProgress, {
            toValue: completionPercentage,
            duration: 1000, // 1 second smooth transition
            easing: Easing.linear, // Linear easing for smooth continuous flow
            useNativeDriver: false, // width animation can't use native driver
        }).start();
    }, [completionPercentage]);

    const statusConfig = getStatusConfig(timer.status);

    return (
        <View
            style={[
                styles.timerCard,
                isRunning && styles.timerCardActive,
                isPaused && styles.timerCardPaused,
                isCompleted && styles.timerCardCompleted,
                isLandscape && styles.timerCardLandscape
            ]}
        >
            {/* Background Touchable for the whole card navigation */}
            <TouchableOpacity
                style={StyleSheet.absoluteFill}
                onPress={isReadOnly ? undefined : onPress}
                onLongPress={onLongPress}
                activeOpacity={isReadOnly ? 1 : 0.9}
                delayLongPress={500}
                disabled={isReadOnly && isCompleted} // Still allow viewing completed timers
            />

            {/* Progress Fill - Shows completion percentage */}
            {(isActive || isCompleted) && (
                <View style={styles.progressFillContainer} pointerEvents="none">
                    {isCompleted ? (
                        // Completed timers show three segments: Original Used, Borrowed Used, Saved
                        <View style={styles.multiProgressWrapper}>
                            {/* Segment 1: Original Time Used */}
                            <View
                                style={[
                                    styles.progressFill,
                                    {
                                        width: `${Math.min(originalTotalSeconds, Math.max(0, totalSeconds - (timer.savedTime || 0))) / totalSeconds * 100}%`,
                                        backgroundColor: 'rgba(76,175,80,0.45)' // Slightly more opaque
                                    }
                                ]}
                            />
                            {/* Segment 2: Borrowed Time Used */}
                            {totalSeconds > originalTotalSeconds && (totalSeconds - (timer.savedTime || 0)) > originalTotalSeconds && (
                                <View
                                    style={[
                                        styles.progressFill,
                                        {
                                            left: `${originalTotalSeconds / totalSeconds * 100}%`,
                                            width: `${(Math.min(totalSeconds, totalSeconds - (timer.savedTime || 0)) - originalTotalSeconds) / totalSeconds * 100}%`,
                                            backgroundColor: 'rgba(38,120,40,0.6)' // More distinct dark green
                                        }
                                    ]}
                                />
                            )}
                            {/* Segment 3: Saved Time (Remaining) */}
                            {(timer.savedTime || 0) > 0 && (
                                <View
                                    style={[
                                        styles.progressFill,
                                        {
                                            left: `${Math.max(0, totalSeconds - (timer.savedTime || 0)) / totalSeconds * 100}%`,
                                            width: `${(timer.savedTime || 0) / totalSeconds * 100}%`,
                                            backgroundColor: 'rgba(255,255,255,0.3)' // Even brighter ghost shade
                                        }
                                    ]}
                                />
                            )}
                        </View>
                    ) : (
                        // Active timers show animated progress with two segments
                        <View style={styles.multiProgressWrapper}>
                            {/* Original Segment Fill */}
                            <Animated.View
                                style={[
                                    styles.progressFill,
                                    {
                                        width: animatedProgress.interpolate({
                                            inputRange: [0, originalWeight * 100, 100],
                                            outputRange: ['0%', `${originalWeight * 100}%`, `${originalWeight * 100}%`],
                                        }),
                                        backgroundColor: isRunning ? 'rgba(0, 229, 255, 0.25)' : 'rgba(255,165,0,0.35)'
                                    }
                                ]}
                            />
                            {/* Borrowed Segment Fill */}
                            {borrowedSeconds > 0 && (
                                <Animated.View
                                    style={[
                                        styles.progressFill,
                                        {
                                            left: `${originalWeight * 100}%`,
                                            width: animatedProgress.interpolate({
                                                inputRange: [0, originalWeight * 100, 100],
                                                outputRange: ['0%', '0%', `${(1 - originalWeight) * 100}%`],
                                            }),
                                            backgroundColor: isRunning ? 'rgba(0, 180, 204, 0.45)' : 'rgba(128,82,0,0.5)' // Darker cyan for borrowed segment
                                        }
                                    ]}
                                />
                            )}
                        </View>
                    )}
                </View>
            )}

            {/* Inset shadow */}
            <LinearGradient
                colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0.2)', 'transparent']}
                style={styles.cardInset}
                pointerEvents="none"
            />


            {/* Timer Info and Actions */}
            <View style={styles.cardContent} pointerEvents="box-none">
                <View style={styles.cardLeft} pointerEvents="none">
                    {/* Status Row */}
                    <View style={styles.topStatusRow}>
                        <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor()}15` }]}>
                            <Text style={[styles.statusText, { color: getStatusColor() }]}>
                                {timer.status.toUpperCase()}
                            </Text>
                        </View>
                        {borrowedSeconds > 0 && !isCompleted && (
                            <View style={styles.borrowedBadgeSmall}>
                                <MaterialIcons name="add-alarm" size={10} color="rgba(255,255,255,0.4)" />
                                <Text style={styles.borrowedTextSmall}>
                                    {formatBorrowedTime(borrowedSeconds)}
                                </Text>
                            </View>
                        )}
                        {isCompleted && (timer.savedTime || 0) > 0 && (
                            <View style={styles.savedBadgeSmall}>
                                <MaterialIcons name="speed" size={10} color="rgba(76,175,80,0.6)" />
                                <Text style={styles.savedTextSmall}>
                                    {formatSavedTime(timer.savedTime || 0)}
                                </Text>
                            </View>
                        )}
                    </View>

                    <View style={styles.titleRow}>
                        <Text
                            style={[styles.timerTitle, isCompleted && styles.timerTitleCompleted]}
                            numberOfLines={1}
                        >
                            {timer.title}
                        </Text>
                        <View style={[styles.categoryBadge, { backgroundColor: `${categoryColor}15`, borderColor: `${categoryColor}30` }]}>
                            <MaterialIcons name={categoryIcon} size={10} color={categoryColor} />
                            <Text style={[styles.categoryBadgeText, { color: categoryColor }]}>
                                {category?.name.toUpperCase() || 'GENERAL'}
                            </Text>
                        </View>
                    </View>
                    <View style={styles.timeRow}>
                        <Text style={[styles.timerTime, isCompleted && styles.timerTimeCompleted]}>
                            {timer.time}
                        </Text>
                        <Text style={styles.timerTotal}>
                            / {getExpandedTotal(timer.total, timer.borrowedTime || 0)}
                        </Text>
                    </View>
                </View>

                {timer.isPinned && (
                    <View style={[styles.pinIconContainer, isLandscape ? styles.pinIconContainerLandscape : styles.pinIconContainerPortrait]}>
                        <MaterialIcons
                            name="local-offer"
                            size={10}
                            color="#fff"
                        />
                    </View>
                )}

                {isReadOnly && !isCompleted && (
                    <View style={styles.readOnlyIcon}>
                        <MaterialIcons name="lock" size={20} color="rgba(255,255,255,0.3)" />
                    </View>
                )}

                {isCompleted ? (
                    <View style={styles.completedCheckIcon}>
                        <MaterialIcons name="check-circle" size={28} color="#4CAF50" />
                    </View>
                ) : (
                    <TouchableOpacity
                        style={[
                            styles.playButton,
                            isRunning && styles.playButtonActive,
                        ]}
                        onPress={isReadOnly ? undefined : onPlayPause}
                        hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                        activeOpacity={isReadOnly ? 1 : 0.6}
                        disabled={isReadOnly}
                    >
                        <MaterialIcons
                            name={isRunning ? "pause" : "play-arrow"}
                            size={28}
                            color={isRunning ? "#fff" : "rgba(255,255,255,0.7)"}
                        />
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },

    glowBackground: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        overflow: 'hidden',
    },

    glowOrb: {
        position: 'absolute',
        borderRadius: 9999,
    },

    blueOrb: {
        backgroundColor: '#0a1d37',
        width: width * 1.5,
        height: height * 0.6,
        top: -height * 0.3,
        left: -width * 0.5,
        opacity: 0.04,
    },

    cyanOrb: {
        backgroundColor: '#004a5c',
        width: width * 1.2,
        height: height * 0.5,
        bottom: -height * 0.15,
        right: -width * 0.4,
        opacity: 0.03,
    },

    safeArea: {
        flex: 1,
    },

    headerCard: {
        marginHorizontal: 20,
        marginTop: 8,
        paddingVertical: 28,
        paddingHorizontal: 24,
        borderRadius: 36,
        alignItems: 'center',
        backgroundColor: 'rgba(15, 15, 15, 0.7)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        overflow: 'hidden',
    },

    headerCardPortrait: {
        marginHorizontal: 16,
        marginTop: 10,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 24,
        backgroundColor: 'rgba(15, 15, 15, 0.6)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },

    headerMainRowPortrait: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
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

    headerIconBtnActivePortrait: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderColor: 'rgba(255,255,255,0.3)',
    },

    portraitFiltersContainer: {
        marginTop: 12,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.06)',
    },

    portraitFiltersScroll: {
        paddingRight: 10,
        gap: 8,
        alignItems: 'center',
    },

    filterDividerPortrait: {
        width: 1,
        height: 16,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginHorizontal: 4,
    },

    dateSelectorPillPortrait: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(0,0,0,0.25)',
        marginHorizontal: 6,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },

    datePillLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },

    dateSelectorTextPortrait: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 0.5,
    },

    todayBtnPortrait: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },

    todayBtnActivePortrait: {
        backgroundColor: 'rgba(76, 175, 80, 0.08)',
        borderColor: 'rgba(76, 175, 80, 0.2)',
    },

    todayBtnTextPortrait: {
        fontSize: 9,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.3)',
        marginLeft: 4,
        letterSpacing: 0.5,
    },

    todayBtnTextActivePortrait: {
        color: '#4CAF50',
    },
    todayLabelBlockPortrait: {
        marginLeft: 4,
        alignItems: 'flex-start',
    },

    settingsButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },

    headerInset: {
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: 60,
    },

    headerTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 14,
    },

    // ========== PORTRAIT ANALYTICS HEADER ==========
    headerTopRow: {
        alignItems: 'center',
    },

    headerTitlePortrait: {
        fontSize: 14,
        fontWeight: '700',
        letterSpacing: 2,
        color: '#fff',
    },

    headerDate: {
        fontSize: 13,
        fontWeight: '400',
        color: 'rgba(255,255,255,0.5)',
        textAlign: 'center',
        marginBottom: 20,
    },

    analyticsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
    },

    statsContainer: {
        flex: 1,
    },

    tasksDoneRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginBottom: 6,
    },

    tasksDoneCount: {
        fontSize: 28,
        fontWeight: '700',
        color: '#fff',
    },

    tasksDoneOf: {
        fontSize: 14,
        fontWeight: '400',
        color: 'rgba(255,255,255,0.5)',
    },

    tasksDoneTotal: {
        fontSize: 14,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.7)',
    },

    tasksDoneLabel: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1,
        color: '#4CAF50',
    },

    totalTimeRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },

    totalTimeText: {
        fontSize: 13,
        fontWeight: '400',
        color: 'rgba(255,255,255,0.5)',
    },

    progressCircleContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },

    progressCircleBg: {
        width: 70,
        height: 70,
        borderRadius: 35,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },

    progressCircleTrack: {
        position: 'absolute',
        width: 66,
        height: 66,
        borderRadius: 33,
        borderWidth: 5,
        borderColor: 'rgba(255,255,255,0.1)',
    },

    progressCircleArc: {
        position: 'absolute',
        width: 66,
        height: 66,
        borderRadius: 33,
        borderWidth: 5,
        borderColor: 'transparent',
        transform: [{ rotate: '-90deg' }],
    },

    progressPercentText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
    },

    dailyProgressLabel: {
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 1.5,
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 4,
    },

    completedLabel: {
        fontSize: 14,
        fontWeight: '400',
        color: 'rgba(255,255,255,0.5)',
    },

    datePill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: 'rgba(0,0,0,0.35)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },

    dateText: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1.2,
        color: 'rgba(255,255,255,0.8)',
        marginRight: 6,
    },

    separatorContainer: {
        paddingHorizontal: 40,
        marginVertical: 10,
    },

    separator: {
        height: 1,
    },

    scrollView: {
        flex: 1,
    },

    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 20,
        paddingBottom: 100,
    },

    timerCard: {
        marginBottom: 12,
        borderRadius: 32,
        paddingHorizontal: 16,
        paddingVertical: 24,
        backgroundColor: 'rgba(15, 15, 15, 0.6)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        overflow: 'hidden',
    },

    timerCardActive: {
        backgroundColor: 'rgba(5, 20, 25, 0.7)',
        borderColor: 'rgba(255,255,255,0.15)',
    },

    timerCardPaused: {
        backgroundColor: 'rgba(25, 20, 5, 0.6)',
        borderColor: 'rgba(255,165,0,0.25)',
    },

    timerCardCompleted: {
        backgroundColor: 'rgba(5, 20, 10, 0.6)',
        borderColor: 'rgba(76,175,80,0.15)',
    },

    cardInset: {
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: 50,
        zIndex: 1,
    },

    progressFillContainer: {
        position: 'absolute',
        top: -1,
        left: -1,
        right: -1,
        bottom: -1,
        // No borderRadius - parent timerCard clips with overflow: hidden
    },

    progressFill: {
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
    },

    multiProgressWrapper: {
        flex: 1,
        position: 'relative',
    },

    progressEdge: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: 2,
        marginLeft: -1,
        shadowColor: '#FFFFFF',
        shadowOpacity: 0.8,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 0 },
    },

    topStatusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 6,
    },

    statusBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 99,
        borderWidth: 1,
    },

    borrowedBadgeSmall: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },

    borrowedTextSmall: {
        fontSize: 10,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.4)',
    },

    savedBadgeSmall: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        backgroundColor: 'rgba(76,175,80,0.1)',
        borderWidth: 0.5,
        borderColor: 'rgba(76,175,80,0.2)',
    },

    savedTextSmall: {
        fontSize: 10,
        fontWeight: '600',
        color: 'rgba(76,175,80,0.8)',
    },

    statusText: {
        fontSize: 8,
        fontFamily: 'PlusJakartaSans_800ExtraBold',
        letterSpacing: 1,
    },

    cardContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },

    cardLeft: {
        flex: 1,
    },

    timerTitle: {
        fontSize: 14,
        fontFamily: 'PlusJakartaSans_700Bold',
        color: '#fff',
        marginRight: 8,
    },

    timerTitleCompleted: {
        color: 'rgba(255,255,255,0.6)',
    },

    timeRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },

    timerTime: {
        fontSize: 22,
        fontFamily: 'PlusJakartaSans_700Bold',
        color: '#fff',
        fontVariant: ['tabular-nums'],
    },

    timerTimeCompleted: {
        color: 'rgba(255,255,255,0.4)',
        textDecorationLine: 'line-through',
    },

    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },

    categoryBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        borderWidth: 1,
        gap: 4,
    },

    categoryBadgeText: {
        fontSize: 8,
        fontFamily: 'PlusJakartaSans_800ExtraBold',
        letterSpacing: 0.5,
    },

    timerTotal: {
        fontSize: 13,
        fontFamily: 'PlusJakartaSans_500Medium',
        color: 'rgba(255,255,255,0.4)',
        marginLeft: 4,
        fontVariant: ['tabular-nums'],
        letterSpacing: 0.5,
    },

    playButton: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },

    playButtonActive: {
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderColor: 'rgba(255,255,255,0.3)',
    },

    completedCheckIcon: {
        width: 42,
        height: 42,
        alignItems: 'center',
        justifyContent: 'center',
    },

    addButton: {
        position: 'absolute',
        right: 24,
        bottom: 40,
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#FFFFFF',
        elevation: 8,
    },

    // ========== LANDSCAPE STYLES ==========
    safeAreaLandscape: {
        flexDirection: 'row',
    },

    leftPanel: {
        // Width is set dynamically via inline style (50% of screenWidth)
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
    },

    leftPanelScroll: {
        flex: 1,
    },

    titleRowLandscape: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 4,
    },

    headerTitleLandscape: {
        fontSize: 22,
        fontFamily: 'PlusJakartaSans_800ExtraBold',
        color: '#fff',
        lineHeight: 26,
    },

    percentBadge: {
        fontSize: 12,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.6)',
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

    progressSection: {
        marginBottom: 12,
    },

    progressLabelRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
    },

    progressLabelText: {
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 1,
        color: 'rgba(255,255,255,0.5)',
    },

    progressFraction: {
        fontSize: 12,
        fontWeight: '600',
        color: '#4CAF50',
    },

    completedText: {
        fontSize: 11,
        fontWeight: '400',
        color: '#4CAF50',
        marginBottom: 6,
    },

    progressBarBg: {
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.1)',
        overflow: 'hidden',
    },

    progressBarFill: {
        height: '100%',
        borderRadius: 2,
        backgroundColor: '#FFFFFF',
    },

    statsCardsRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 12,
    },

    statCard: {
        flex: 1,
        padding: 10,
        borderRadius: 16,
        backgroundColor: 'rgba(20, 35, 45, 0.6)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },

    statCardLabel: {
        fontSize: 9,
        fontWeight: '600',
        letterSpacing: 0.5,
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 4,
    },

    statCardValue: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },

    statCardValueLarge: {
        fontSize: 24,
        fontWeight: '700',
        color: '#fff',
    },

    timeRemainingCard: {
        padding: 12,
        borderRadius: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        marginBottom: 12,
    },

    timeRemainingLabel: {
        fontSize: 9,
        fontWeight: '600',
        letterSpacing: 0.5,
        color: 'rgba(255,255,255,0.7)',
        marginBottom: 6,
    },

    timeRemainingValueRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },

    timeRemainingValue: {
        fontSize: 20,
        fontWeight: '700',
        color: '#fff',
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

    leftPanelFooterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderTopWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        marginTop: 8,
    },

    settingsIconBtn: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Keep existing landscape styles
    leftPanelContent: {
        flex: 1,
    },

    leftPanelFooter: {
        gap: 12,
    },

    headerSubtitle: {
        fontSize: 13,
        fontWeight: '400',
        color: 'rgba(255,255,255,0.5)',
        lineHeight: 18,
    },

    dateCardLandscape: {
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 20,
        backgroundColor: 'rgba(20, 35, 45, 0.6)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },

    dateDayName: {
        fontSize: 11,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.6)',
        letterSpacing: 1,
    },

    dateNumRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginVertical: 2,
    },

    dateDayNum: {
        fontSize: 22,
        fontWeight: '700',
        color: '#fff',
    },

    dateMonth: {
        fontSize: 11,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.6)',
        letterSpacing: 1,
    },

    totalTimeCard: {
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 20,
        backgroundColor: 'rgba(20, 35, 45, 0.6)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },

    totalTimeLabel: {
        fontSize: 10,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: 1.5,
        marginBottom: 4,
    },

    totalTimeValue: {
        fontSize: 18,
        fontWeight: '600',
        color: '#fff',
    },

    rightPanel: {
        flex: 1,
        position: 'relative',
    },

    scrollViewLandscape: {
        flex: 1,
    },

    scrollContentLandscape: {
        flexGrow: 1,
        paddingHorizontal: 8,
        paddingVertical: 8,
        paddingBottom: 70,
    },

    cardRow: {
        flexDirection: 'row',
        gap: 4,
        marginBottom: 4,
    },

    cardPlaceholder: {
        flex: 1,
    },

    timerCardLandscape: {
        flex: 1,
        marginBottom: 0,
        borderRadius: 16,
        paddingVertical: 8,
        paddingHorizontal: 8,
        minHeight: 80,
    },

    addButtonLandscape: {
        position: 'absolute',
        right: 16,
        bottom: 16,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 8,
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

    filtersSection: {
        marginTop: 12,
        gap: 6,
    },

    filterHeaderLabel: {
        fontSize: 8,
        fontWeight: '800',
        color: 'rgba(255, 255, 255, 0.25)',
        letterSpacing: 1.2,
        marginBottom: 4,
    },

    expandableFilterContainer: {
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },

    expandableHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 10,
    },

    expandableHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },

    expandableHeaderText: {
        fontSize: 11,
        fontWeight: '600',
        color: 'rgba(255, 255, 255, 0.6)',
    },

    expandedContent: {
        padding: 8,
        paddingTop: 0,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },

    miniChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },

    miniChipActive: {
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        borderColor: 'rgba(255, 255, 255, 0.3)',
    },

    miniChipText: {
        fontSize: 10,
        fontWeight: '700',
        color: 'rgba(255, 255, 255, 0.5)',
    },

    miniChipTextActive: {
        color: '#fff',
        fontWeight: '800',
    },


    pinIconContainer: {
        position: 'absolute',
        zIndex: 21,
    },

    pinIconContainerPortrait: {
        top: -10,
        right: -5,
    },

    pinIconContainerLandscape: {
        top: -3,
        right: -3,
        transform: [{ rotate: '4deg' }],
    },

    // ========== MODAL STYLES ==========
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    modalContent: {
        width: '85%',
        maxWidth: 340,
        borderRadius: 32,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    modalGradient: {
        padding: 32,
        alignItems: 'center',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 20,
    },
    modalTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#fff',
    },
    modalMessage: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.5)',
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 24,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },

    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },

    categoryIconSmall: {
        padding: 4,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },

    reportStatsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        marginBottom: 20,
        gap: 12,
    },
    reportStatItem: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    reportStatLabel: {
        fontSize: 9,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 1,
        marginBottom: 4,
    },
    reportStatValue: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
    },
    modalCloseBtn: {
        width: '100%',
        paddingVertical: 14,
        borderRadius: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
        alignItems: 'center',
    },
    modalCloseBtnText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#FFFFFF',
        letterSpacing: 2,
    },

    filterOption: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 12,
        marginBottom: 4,
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
    },

    filterOptionActive: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },

    filterOptionLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },

    filterOptionText: {
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.7)',
        fontWeight: '500',
    },

    filterOptionTextActive: {
        color: '#FFFFFF',
        fontWeight: '700',
    },

    // UNIFIED COMPACT COMPLETION POPUP STYLES
    completedPopupCombinedLandscape: {
        width: '75%',
        maxWidth: 520,
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    completedPopupCombinedPortrait: {
        width: '85%',
        maxWidth: 340,
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    completedPopupCombinedGradient: {
        padding: 16,
    },
    completedPopupLandscapeRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    completedPopupPortraitColumn: {
        alignItems: 'center',
    },
    completedPopupCombinedLeft: {
        flex: 1.2,
        alignItems: 'center',
        paddingRight: 16,
    },
    completedPopupCombinedRight: {
        flex: 1,
        paddingLeft: 16,
        justifyContent: 'center',
    },
    completedPopupCombinedTop: {
        width: '100%',
        alignItems: 'center',
        paddingBottom: 16,
    },
    completedPopupCombinedBottom: {
        width: '100%',
        paddingTop: 16,
        justifyContent: 'center',
    },
    completedPopupDividerVerticalLandscape: {
        width: 1,
        height: '80%',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    completedPopupDividerHorizontalPortrait: {
        width: '100%',
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    completedPopupIconCircleCompact: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(76, 175, 80, 0.15)',
        borderWidth: 1.5,
        borderColor: 'rgba(76, 175, 80, 0.4)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    completedPopupTitleLandscapeCompact: {
        fontSize: 14,
        fontWeight: '900',
        color: '#4CAF50',
        letterSpacing: 2,
        marginBottom: 2,
        textAlign: 'center',
    },
    completedPopupTimerNameLandscapeCompact: {
        fontSize: 12,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 8,
        textAlign: 'center',
        opacity: 0.8,
    },
    completedPopupDetailsContainerCompact: {
        width: '100%',
        gap: 4,
    },
    completedPopupDetailsContainerPortraitCompact: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'space-around',
        gap: 12,
    },
    completedPopupDetailRowCompact: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    completedPopupDetailLabelCompact: {
        fontSize: 10,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.4)',
    },
    completedPopupDetailValueCompact: {
        fontSize: 10,
        fontWeight: '700',
        color: '#fff',
    },
    completedPopupExtendLabelLandscapeCompact: {
        fontSize: 9,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 1,
        marginBottom: 8,
        textAlign: 'center',
    },
    completedPopupExtendButtonsLandscapeCompact: {
        flexDirection: 'row',
        gap: 6,
        marginBottom: 12,
    },
    completedPopupExtendBtnLandscapeCompact: {
        flex: 1,
        height: 36,
        borderRadius: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    completedPopupExtendBtnTextLandscapeCompact: {
        fontSize: 12,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    completedPopupCloseBtnRedlandscape: {
        width: '100%',
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: 'rgba(255, 80, 80, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255, 80, 80, 0.2)',
        alignItems: 'center',
    },
    completedPopupCloseBtnTextRedlandscape: {
        fontSize: 11,
        fontWeight: '800',
        color: '#FF5050',
        letterSpacing: 1.5,
    },

    // ========== CALENDAR STYLES ==========
    calendarContainer: {
        marginTop: 10,
    },
    calendarHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    calendarBackBtn: {
        padding: 4,
        marginLeft: -8,
    },
    calendarTitle: {
        fontSize: 16,
        fontFamily: 'PlusJakartaSans_700Bold',
        color: '#fff',
    },
    calendarNav: {
        flexDirection: 'row',
        gap: 4,
    },
    calNavBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    weekDaysRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 2,
        paddingHorizontal: 4,
    },
    weekDayText: {
        width: 28,
        textAlign: 'center',
        fontSize: 10,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.5)',
    },
    daysGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
    },
    dayCell: {
        width: '14.28%',
        minHeight: 34,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 2,
    },
    dayCircle: {
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    todayCircle: {
        backgroundColor: '#FFFFFF',
    },
    otherMonthDay: {
        opacity: 0.3,
    },
    dayText: {
        fontSize: 11,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.8)',
    },
    todayText: {
        color: '#000',
        fontWeight: '700',
        fontFamily: 'PlusJakartaSans_700Bold',
    },
    otherMonthText: {
        color: 'rgba(255,255,255,0.4)',
    },
    selectedDayCircle: {
        borderWidth: 2,
        borderColor: '#4CAF50',
        backgroundColor: 'transparent',
    },
    selectedDayText: {
        color: '#4CAF50',
        fontWeight: '800',
    },
    selectedPastDayCircle: {
        borderWidth: 2,
        borderColor: '#FF5050',
        backgroundColor: 'transparent',
    },
    selectedPastDayText: {
        color: '#FF5050',
        fontWeight: '800',
    },
    dayTaskCountBar: {
        width: 20,
        height: 10,
        borderRadius: 5,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 2,
    },
    dayTaskCountBarPortrait: {
        width: 22,
        height: 10,
    },
    dayTaskCount: {
        fontSize: 8,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.7)',
    },
    dayTaskCountZero: {
        fontSize: 8,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.22)',
    },
    datePortraitRow: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingRight: 8,
    },
    datePortraitLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    datePortraitText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
    },
    portraitCalendarContainer: {
        marginTop: 0,
        paddingBottom: 0,
    },
    dayCirclePortrait: {
        width: 22,
        height: 22,
        borderRadius: 11,
    },
    dayTextPortrait: {
        fontSize: 11,
    },
    calendarTitlePortrait: {
        fontSize: 18,
    },
    placeholderCard: {
        width: '100%',
        minHeight: 120,
        backgroundColor: 'rgba(255,255,255,0.02)',
        borderRadius: 24,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    placeholderContent: {
        alignItems: 'center',
        gap: 12,
    },
    placeholderText: {
        fontSize: 12,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 2,
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 40,
        minHeight: 250,
    },
    emptyContainerLandscape: {
        flex: 1,
        paddingHorizontal: 20,
        flexDirection: 'column', // Changed back to column for better centering
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
    },
    emptyTextContainer: {
        alignItems: 'center',
    },
    emptyText: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 15,
        fontWeight: '500',
        marginTop: 12,
        textAlign: 'center',
        maxWidth: 280,
    },
    emptyTextLandscape: {
        fontSize: 13,
        maxWidth: 220,
    },
    emptyAddBtn: {
        marginTop: 24,
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.3)',
    },
    emptyAddText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
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
    dateControlRowLandscape: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    todayNavBtnActive: {
        backgroundColor: 'rgba(76, 175, 80, 0.08)',
        borderColor: 'rgba(76, 175, 80, 0.2)',
    },
    todayNavText: {
        fontSize: 9,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.3)',
        marginLeft: 3,
        letterSpacing: 0.5,
    },
    todayNavTextActive: {
        color: '#4CAF50',
    },
    todayLabelBlock: {
        marginLeft: 3,
        alignItems: 'flex-start',
    },
    todayRangeLabel: {
        fontSize: 8,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: 0.3,
        marginTop: 1,
    },
    todayRangeLabelActive: {
        color: 'rgba(76,175,80,0.85)',
    },
    readOnlyIcon: {
        position: 'absolute',
        right: 50,
        top: '50%',
        marginTop: -10,
        opacity: 0.6,
    },
    viewToggleContainer: {
        flex: 1,
        flexDirection: 'row',
        gap: 4,
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 10,
        padding: 3,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.06)',
    },
    viewToggleBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        backgroundColor: 'transparent',
    },
    viewToggleBtnActive: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.15)',
    },
    viewToggleSlider: {
        position: 'absolute',
        top: 3,
        left: 3,
        width: '48%',
        height: 32,
        backgroundColor: 'rgba(255, 255, 255, 0.12)',
        borderRadius: 8,
    },
    viewToggleText: {
        fontSize: 10,
        fontWeight: '700',
        color: 'rgba(255, 255, 255, 0.4)',
        letterSpacing: 1,
    },
    viewToggleTextActive: {
        color: '#fff',
        fontWeight: '800',
    },
    toggleWithCountRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
        gap: 8,
    },
    completionCountBadge: {
        backgroundColor: 'rgba(76, 175, 80, 0.15)',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(76, 175, 80, 0.25)',
    },
    completionCountText: {
        fontSize: 13,
        fontWeight: '800',
        color: '#4CAF50',
        letterSpacing: 0.5,
    },
});
