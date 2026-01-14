import React, { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { MaterialIcons } from '@expo/vector-icons';
import { Timer } from '../constants/data';

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

// Calculate completion percentage
const getCompletionPercentage = (currentTime: string, totalTime: string): number => {
    const current = parseTimeToSeconds(currentTime);
    const total = parseTimeToSeconds(totalTime);
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

const { width, height } = Dimensions.get('window');

interface TimerListProps {
    timers: Timer[];
    onAddTimer: () => void;
    onDeleteTimer: (timer: Timer) => void;
    onStartTimer: (timer: Timer) => void;
    onPlayPause: (timer: Timer) => void;
}

export default function TimerList({
    timers,
    onAddTimer,
    onDeleteTimer,
    onStartTimer,
    onPlayPause
}: TimerListProps) {
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const isLandscape = screenWidth > screenHeight;
    const [showReportPopup, setShowReportPopup] = useState(false);

    // Calculate analytics
    const completedCount = timers.filter(t => t.status === 'Completed').length;
    const totalCount = timers.length;
    const completionPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    // Calculate total time from all timers
    const totalTimeSeconds = timers.reduce((acc, timer) => {
        return acc + parseTimeToSeconds(timer.total);
    }, 0);
    const totalHours = Math.floor(totalTimeSeconds / 3600);
    const totalMinutes = Math.floor((totalTimeSeconds % 3600) / 60);
    const totalTimeFormatted = formatTotalTime(totalTimeSeconds);

    // Get current date
    const now = new Date();
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayName = days[now.getDay()].toUpperCase();
    const dayNum = now.getDate();
    const monthName = months[now.getMonth()].toUpperCase();

    // Calculate time remaining (sum of current times for non-completed timers)
    const timeRemainingSeconds = timers
        .filter(t => t.status !== 'Completed')
        .reduce((acc, timer) => acc + parseTimeToSeconds(timer.time), 0);
    const remainingHours = Math.floor(timeRemainingSeconds / 3600);
    const remainingMinutes = Math.floor((timeRemainingSeconds % 3600) / 60);
    const remainingSeconds = timeRemainingSeconds % 60;

    // Render timer cards - for landscape, render in pairs for 2-column grid
    const renderTimerCards = () => {
        if (isLandscape) {
            // Create pairs for 2-column grid
            const pairs: Timer[][] = [];
            for (let i = 0; i < timers.length; i += 2) {
                pairs.push(timers.slice(i, i + 2));
            }
            return pairs.map((pair, index) => (
                <View key={index} style={styles.cardRow}>
                    {pair.map((timer) => (
                        <TimerCard
                            key={timer.id}
                            timer={timer}
                            onLongPress={() => onDeleteTimer(timer)}
                            onPress={() => onStartTimer(timer)}
                            onPlayPause={() => onPlayPause(timer)}
                            isLandscape={true}
                        />
                    ))}
                    {pair.length === 1 && <View style={styles.cardPlaceholder} />}
                </View>
            ));
        }

        return timers.map((timer) => (
            <TimerCard
                key={timer.id}
                timer={timer}
                onLongPress={() => onDeleteTimer(timer)}
                onPress={() => onStartTimer(timer)}
                onPlayPause={() => onPlayPause(timer)}
                isLandscape={false}
            />
        ));
    };

    return (
        <LinearGradient
            colors={['#080C1A', '#020305']}
            style={styles.container}
        >
            {/* Background Glow */}
            <View style={styles.glowBackground}>
                <View style={[styles.glowOrb, styles.blueOrb]} />
                <View style={[styles.glowOrb, styles.cyanOrb]} />
            </View>

            <SafeAreaView style={[styles.safeArea, isLandscape && styles.safeAreaLandscape]}>
                {isLandscape ? (
                    // LANDSCAPE LAYOUT - Matching Reference Design
                    <>
                        {/* Left Panel - Analytics Dashboard */}
                        <View style={[styles.leftPanel, { width: screenWidth * 0.30 }]}>
                            {/* Single Analytics Card containing all content */}
                            <View style={styles.analyticsCardWrapper}>
                                <ScrollView showsVerticalScrollIndicator={false} style={styles.leftPanelScroll}>
                                    {/* Title Row with Percentage */}
                                    <View style={styles.titleRowLandscape}>
                                        <Text style={styles.headerTitleLandscape}>Daily{'\n'}Timers</Text>
                                        <Text style={styles.percentBadge}>{completionPercentage}%</Text>
                                    </View>

                                    {/* Date */}
                                    <View style={styles.dateLandscapeRow}>
                                        <MaterialIcons name="calendar-today" size={14} color="rgba(255,255,255,0.5)" />
                                        <Text style={styles.dateLandscapeText}>  {dayName}, {dayNum} {monthName}</Text>
                                    </View>

                                    {/* Progress Section */}
                                    <View style={styles.progressSection}>
                                        <View style={styles.progressLabelRow}>
                                            <Text style={styles.progressLabelText}>PROGRESS</Text>
                                            <Text style={styles.progressFraction}>{completedCount} of {totalCount}</Text>
                                        </View>
                                        <Text style={styles.completedText}>Completed</Text>
                                        <View style={styles.progressBarBg}>
                                            <View style={[styles.progressBarFill, { width: `${completionPercentage}%` }]} />
                                        </View>
                                    </View>

                                    {/* Stats Cards Row */}
                                    <View style={styles.statsCardsRow}>
                                        {/* Total Duration Card */}
                                        <View style={styles.statCard}>
                                            <Text style={styles.statCardLabel}>TOTAL DURATION</Text>
                                            <Text style={styles.statCardValue}>{String(totalHours).padStart(2, '0')}h {String(totalMinutes).padStart(2, '0')}m</Text>
                                        </View>

                                        {/* Completed Card */}
                                        <View style={styles.statCard}>
                                            <Text style={styles.statCardLabel}>COMPLETED</Text>
                                            <Text style={styles.statCardValueLarge}>{completedCount}</Text>
                                        </View>
                                    </View>

                                    {/* Time Remaining Card */}
                                    <View style={styles.timeRemainingCard}>
                                        <Text style={styles.timeRemainingLabel}>TIME REMAINING TODAY</Text>
                                        <View style={styles.timeRemainingValueRow}>
                                            <Text style={styles.timeRemainingValue}>
                                                {String(remainingHours).padStart(2, '0')}:{String(remainingMinutes).padStart(2, '0')}:{String(remainingSeconds).padStart(2, '0')}
                                            </Text>
                                            <MaterialIcons name="bar-chart" size={16} color="#00E5FF" />
                                        </View>
                                    </View>
                                </ScrollView>

                                {/* Detailed Reports Link - Anchored to bottom */}
                                <TouchableOpacity
                                    style={styles.detailedReportsBtn}
                                    onPress={() => setShowReportPopup(true)}
                                >
                                    <Text style={styles.detailedReportsText}>DETAILED REPORTS</Text>
                                    <MaterialIcons name="chevron-right" size={20} color="rgba(255,255,255,0.5)" />
                                </TouchableOpacity>
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
                                <MaterialIcons name="add" size={28} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    </>
                ) : (
                    // PORTRAIT LAYOUT
                    <>
                        {/* HEADER with Analytics - Matching Reference Design */}
                        <View style={styles.headerCard}>
                            {/* Analytics Row - Progress circle left, stats right */}
                            <View style={styles.analyticsRow}>
                                {/* Left Side - Large Progress Circle */}
                                <View style={styles.progressCircleContainer}>
                                    <View style={styles.progressCircleBg}>
                                        {/* Background ring */}
                                        <View style={styles.progressCircleTrack} />
                                        {/* Foreground arc - simplified visual */}
                                        <View style={[
                                            styles.progressCircleArc,
                                            {
                                                borderTopColor: '#00E5FF',
                                                borderRightColor: completionPercentage >= 25 ? '#00E5FF' : 'transparent',
                                                borderBottomColor: completionPercentage >= 50 ? '#00E5FF' : 'transparent',
                                                borderLeftColor: completionPercentage >= 75 ? '#00E5FF' : 'transparent',
                                            }
                                        ]} />
                                        <Text style={styles.progressPercentText}>{completionPercentage}%</Text>
                                    </View>
                                </View>

                                {/* Right Side - Stats */}
                                <View style={styles.statsContainer}>
                                    <Text style={styles.dailyProgressLabel}>DAILY PROGRESS</Text>
                                    <View style={styles.tasksDoneRow}>
                                        <Text style={styles.tasksDoneCount}>{completedCount}</Text>
                                        <Text style={styles.tasksDoneOf}> of </Text>
                                        <Text style={styles.tasksDoneTotal}>{totalCount}</Text>
                                        <Text style={styles.completedLabel}>  Completed</Text>
                                    </View>
                                    <View style={styles.totalTimeRow}>
                                        <MaterialIcons name="schedule" size={14} color="rgba(255,255,255,0.5)" />
                                        <Text style={styles.totalTimeText}>  Total Duration: {String(totalHours).padStart(2, '0')}h {String(totalMinutes).padStart(2, '0')}m</Text>
                                    </View>
                                </View>
                            </View>
                        </View>

                        {/* Separator Line */}
                        <View style={styles.separatorContainer}>
                            <LinearGradient
                                colors={['transparent', 'rgba(0,229,255,0.4)', 'transparent']}
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
                            <MaterialIcons name="add" size={28} color="#fff" />
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
                            colors={['rgba(30, 45, 60, 0.95)', 'rgba(10, 20, 30, 0.98)']}
                            style={styles.modalGradient}
                        >
                            <View style={styles.modalHeader}>
                                <MaterialIcons name="analytics" size={32} color="#00E5FF" />
                                <Text style={styles.modalTitle}>Detailed Reports</Text>
                            </View>
                            <Text style={styles.modalMessage}>
                                This is an upcoming feature you can view in an upcoming version.
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
        </LinearGradient>
    );
}

interface TimerCardProps {
    timer: Timer;
    onLongPress: () => void;
    onPress: () => void;
    onPlayPause: () => void;
    isLandscape: boolean;
}

// Status badge configuration
const getStatusConfig = (status: Timer['status']) => {
    switch (status) {
        case 'Running':
            return { label: 'RUNNING', color: '#00E5FF', bgColor: 'rgba(0,229,255,0.15)' };
        case 'Paused':
            return { label: 'PAUSED', color: '#FFA500', bgColor: 'rgba(255,165,0,0.15)' };
        case 'Completed':
            return { label: 'COMPLETED', color: '#4CAF50', bgColor: 'rgba(76,175,80,0.15)' };
        default:
            return { label: 'UPCOMING', color: 'rgba(255,255,255,0.5)', bgColor: 'rgba(255,255,255,0.08)' };
    }
};

function TimerCard({ timer, onLongPress, onPress, onPlayPause, isLandscape }: TimerCardProps) {
    const isRunning = timer.status === 'Running';
    const isPaused = timer.status === 'Paused';
    const isCompleted = timer.status === 'Completed';
    const isActive = isRunning || isPaused;

    // Calculate completion percentage for progress fill
    const completionPercentage = isActive && timer.total
        ? getCompletionPercentage(timer.time, timer.total)
        : 0;

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
        <TouchableOpacity
            style={[
                styles.timerCard,
                isRunning && styles.timerCardActive,
                isPaused && styles.timerCardPaused,
                isCompleted && styles.timerCardCompleted,
                isLandscape && styles.timerCardLandscape
            ]}
            onLongPress={onLongPress}
            onPress={onPress}
            activeOpacity={0.9}
            delayLongPress={500}
        >
            {/* Progress Fill - Shows completion percentage */}
            {(isActive || isCompleted) && (
                <View style={styles.progressFillContainer}>
                    {isCompleted ? (
                        // Completed timers show the percentage at which they were completed
                        <View
                            style={[
                                styles.progressFill,
                                {
                                    width: `${timer.completedPercentage ?? 100}%`,
                                    backgroundColor: 'rgba(76,175,80,0.35)'
                                }
                            ]}
                        />
                    ) : (
                        // Active timers show animated progress
                        <Animated.View
                            style={[
                                styles.progressFill,
                                {
                                    width: animatedProgress.interpolate({
                                        inputRange: [0, 100],
                                        outputRange: ['0%', '100%'],
                                    }),
                                    backgroundColor: isRunning ? 'rgba(0,229,255,0.35)' : 'rgba(255,165,0,0.35)'
                                }
                            ]}
                        />
                    )}
                </View>
            )}

            {/* Inset shadow */}
            <LinearGradient
                colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0.2)', 'transparent']}
                style={styles.cardInset}
            />

            {/* Status Badge */}
            <View style={[styles.statusBadge, { backgroundColor: statusConfig.bgColor }]}>
                <Text style={[styles.statusText, { color: statusConfig.color }]}>
                    {statusConfig.label}
                </Text>
            </View>

            {/* Timer Info */}
            <View style={styles.cardContent}>
                <View style={styles.cardLeft}>
                    <Text style={[styles.timerTitle, isCompleted && styles.timerTitleCompleted]}>
                        {timer.title}
                    </Text>
                    <View style={styles.timeRow}>
                        <Text style={[styles.timerTime, isCompleted && styles.timerTimeCompleted]}>
                            {timer.time}
                        </Text>
                        {isActive && timer.total && (
                            <Text style={styles.timerTotal}>/{timer.total}</Text>
                        )}
                    </View>
                </View>

                {/* Action Button */}
                {isCompleted ? (
                    <View style={styles.completedIcon}>
                        <MaterialIcons name="check-circle" size={28} color="#4CAF50" />
                    </View>
                ) : (
                    <TouchableOpacity
                        style={[styles.playButton, isRunning && styles.playButtonActive]}
                        onPress={(e) => {
                            e.stopPropagation();
                            onPlayPause();
                        }}
                        activeOpacity={0.7}
                    >
                        <MaterialIcons
                            name={isRunning ? 'pause' : 'play-arrow'}
                            size={24}
                            color={isRunning ? '#00E5FF' : '#fff'}
                        />
                    </TouchableOpacity>
                )}
            </View>
        </TouchableOpacity>
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
        backgroundColor: '#1e40af',
        width: width * 1.5,
        height: height * 0.6,
        top: -height * 0.3,
        left: -width * 0.5,
        opacity: 0.06,
    },

    cyanOrb: {
        backgroundColor: '#00d4ff',
        width: width * 1.2,
        height: height * 0.5,
        bottom: -height * 0.15,
        right: -width * 0.4,
        opacity: 0.05,
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
        backgroundColor: 'rgba(20, 35, 45, 0.6)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        overflow: 'hidden',
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
        color: '#00E5FF',
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
        marginVertical: 20,
    },

    separator: {
        height: 1,
    },

    scrollView: {
        flex: 1,
    },

    scrollContent: {
        paddingHorizontal: 20,
        paddingBottom: 100,
    },

    timerCard: {
        marginBottom: 16,
        borderRadius: 32,
        padding: 20,
        backgroundColor: 'rgba(20, 35, 45, 0.5)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        overflow: 'hidden',
    },

    timerCardActive: {
        backgroundColor: 'rgba(20, 40, 50, 0.7)',
        borderColor: 'rgba(0,229,255,0.15)',
    },

    timerCardPaused: {
        backgroundColor: 'rgba(50, 40, 20, 0.6)',
        borderColor: 'rgba(255,165,0,0.25)',
    },

    timerCardCompleted: {
        backgroundColor: 'rgba(20, 45, 35, 0.5)',
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

    progressEdge: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: 2,
        marginLeft: -1,
        shadowColor: '#00E5FF',
        shadowOpacity: 0.8,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 0 },
    },

    statusBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        marginBottom: 12,
    },

    statusText: {
        fontSize: 9,
        fontWeight: '700',
        letterSpacing: 1.5,
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
        fontSize: 20,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 4,
    },

    timerTitleCompleted: {
        color: 'rgba(255,255,255,0.6)',
    },

    timeRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },

    timerTime: {
        fontSize: 28,
        fontWeight: '300',
        color: '#fff',
    },

    timerTimeCompleted: {
        color: 'rgba(255,255,255,0.4)',
        textDecorationLine: 'line-through',
    },

    timerTotal: {
        fontSize: 16,
        fontWeight: '400',
        color: 'rgba(255,255,255,0.4)',
        marginLeft: 4,
    },

    playButton: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },

    playButtonActive: {
        backgroundColor: 'rgba(0,229,255,0.15)',
        borderColor: 'rgba(0,229,255,0.3)',
    },

    completedIcon: {
        width: 52,
        height: 52,
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
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
        ...Platform.select({
            ios: {
                shadowColor: '#00E5FF',
                shadowOpacity: 0.3,
                shadowRadius: 15,
                shadowOffset: { width: 0, height: 5 },
            },
        }),
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
        backgroundColor: 'rgba(11, 18, 22, 0.6)',
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
        fontWeight: '700',
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
        alignItems: 'flex-start',
        marginBottom: 16,
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
        backgroundColor: '#00E5FF',
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
        backgroundColor: 'rgba(0, 50, 80, 0.5)',
        borderWidth: 1,
        borderColor: 'rgba(0,229,255,0.2)',
        marginBottom: 12,
    },

    timeRemainingLabel: {
        fontSize: 9,
        fontWeight: '600',
        letterSpacing: 0.5,
        color: '#00E5FF',
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
        borderTopWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        marginTop: 8,
    },

    detailedReportsText: {
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 0.5,
        color: 'rgba(255,255,255,0.5)',
        lineHeight: 14,
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
        color: '#00E5FF',
    },

    rightPanel: {
        flex: 1,
        position: 'relative',
    },

    scrollViewLandscape: {
        flex: 1,
    },

    scrollContentLandscape: {
        paddingHorizontal: 8,
        paddingVertical: 8,
        paddingBottom: 70,
    },

    cardRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 8,
    },

    cardPlaceholder: {
        flex: 1,
    },

    timerCardLandscape: {
        flex: 1,
        marginBottom: 0,
        borderRadius: 16,
        padding: 10,
        minHeight: 80,
    },

    addButtonLandscape: {
        position: 'absolute',
        right: 16,
        bottom: 16,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#00E5FF',
        alignItems: 'center',
        justifyContent: 'center',
        ...Platform.select({
            ios: {
                shadowColor: '#00E5FF',
                shadowOpacity: 0.5,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 4 },
            },
        }),
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
        borderColor: 'rgba(0,229,255,0.2)',
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
        fontSize: 15,
        color: 'rgba(255,255,255,0.7)',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 32,
    },
    modalCloseBtn: {
        paddingHorizontal: 40,
        paddingVertical: 14,
        borderRadius: 20,
        backgroundColor: 'rgba(0,229,255,0.12)',
        borderWidth: 1,
        borderColor: 'rgba(0,229,255,0.3)',
    },
    modalCloseBtnText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#00E5FF',
        letterSpacing: 1.2,
    },
});
