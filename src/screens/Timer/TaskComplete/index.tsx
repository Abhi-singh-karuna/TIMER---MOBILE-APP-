import React, { useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Platform,
    useWindowDimensions,
    Animated,
    AppState,
    AppStateStatus,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Audio } from 'expo-av';
import { Category } from '../../../constants/data';

// Sound options matching SettingsScreen
const SOUND_OPTIONS = [
    {
        id: 0,
        name: 'Chime',
        uri: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
    },
    {
        id: 1,
        name: 'Success',
        uri: 'https://assets.mixkit.co/active_storage/sfx/2870/2870-preview.mp3',
    },
    {
        id: 2,
        name: 'Alert',
        uri: 'https://assets.mixkit.co/active_storage/sfx/2870/2870-preview.mp3',
    },
];

interface TaskCompleteProps {
    completedAt: string;
    startTime?: string;
    borrowedTime?: number;
    onRestart: () => void;
    onDone: () => void;
    onBorrowTime: (seconds: number) => void;
    onAcknowledgeCompletion?: () => void;
    selectedSound: number;
    soundRepetition: number;
    shouldPlaySound?: boolean;
    category?: Category;
}

export default function TaskComplete({
    completedAt,
    startTime = '--:--',
    borrowedTime = 0,
    onRestart,
    onDone,
    onBorrowTime,
    onAcknowledgeCompletion,
    selectedSound,
    soundRepetition,
    shouldPlaySound = true,
    category,
}: TaskCompleteProps) {
    const { width, height } = useWindowDimensions();
    const [isLandscape, setIsLandscape] = React.useState(false);
    const soundRef = useRef<Audio.Sound | null>(null);
    const playCountRef = useRef(0);

    // Animated values for interactivity
    const scaleAnim = useRef(new Animated.Value(0.9)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.spring(scaleAnim, {
                toValue: 1,
                tension: 20,
                friction: 7,
                useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
                toValue: 1,
                duration: 600,
                useNativeDriver: true,
            }),
        ]).start();

        // Acknowledge completion on mount
        if (onAcknowledgeCompletion) {
            onAcknowledgeCompletion();
        }
    }, []);

    // Play completion sound on mount (only if shouldPlaySound is true)
    useEffect(() => {
        if (!shouldPlaySound) return;

        const playSound = async () => {
            try {
                // Configure audio mode
                await Audio.setAudioModeAsync({
                    playsInSilentModeIOS: true,
                    staysActiveInBackground: false,
                });

                const playSoundOnce = async () => {
                    const soundUri = SOUND_OPTIONS[selectedSound]?.uri;
                    if (!soundUri) return;

                    const { sound } = await Audio.Sound.createAsync(
                        { uri: soundUri },
                        { shouldPlay: true }
                    );
                    soundRef.current = sound;

                    sound.setOnPlaybackStatusUpdate((status) => {
                        if (status.isLoaded && status.didJustFinish) {
                            playCountRef.current += 1;
                            sound.unloadAsync();

                            // Play again if repetitions remaining
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

        // Re-play sound when app comes to foreground
        const handleAppStateChange = (nextAppState: AppStateStatus) => {
            if (nextAppState === 'active' && shouldPlaySound) {
                playSound();
            }
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);

        return () => {
            subscription.remove();
            if (soundRef.current) {
                soundRef.current.unloadAsync();
            }
        };
    }, [selectedSound, soundRepetition, shouldPlaySound]);

    // Check orientation on mount and updates
    useEffect(() => {
        const checkOrientation = async () => {
            const o = await ScreenOrientation.getOrientationAsync();
            setIsLandscape(
                o === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
                o === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
            );
        };
        checkOrientation();

        const subscription = ScreenOrientation.addOrientationChangeListener((event) => {
            const o = event.orientationInfo.orientation;
            setIsLandscape(
                o === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
                o === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
            );
        });

        return () => {
            ScreenOrientation.removeOrientationChangeListener(subscription);
        };
    }, []);

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

    const renderDetailCard = (icon: string, label: string, value: string, color: string, isLandscape: boolean = false) => (
        <View style={[styles.detailCard, isLandscape && styles.detailCardLandscape]}>
            <View style={[styles.detailIconBox, isLandscape && styles.detailIconBoxLandscape, { backgroundColor: `${color}15` }]}>
                <MaterialIcons name={icon as any} size={isLandscape ? 20 : 20} color={color} />
            </View>
            <View style={isLandscape && styles.detailTextContainerLandscape}>
                <Text style={[styles.detailLabel, isLandscape && styles.detailLabelLandscape]}>{label}</Text>
                <Text style={[styles.detailValue, isLandscape && styles.detailValueLandscape]}>{value}</Text>
            </View>
        </View>
    );

    const renderBorrowSection = (isLandscape: boolean) => (
        <View style={[styles.borrowContainerComplete, isLandscape && styles.borrowContainerCompleteLandscape]}>
            <Text style={[styles.borrowLabelComplete, isLandscape && styles.borrowLabelCompleteLandscape]}>
                EXTEND SESSION
            </Text>
            <View style={[styles.borrowButtonsComplete, isLandscape && styles.borrowButtonsCompleteLandscape]}>
                {[1, 5, 10].map((mins) => (
                    <TouchableOpacity
                        key={mins}
                        style={[styles.borrowBtnComplete, isLandscape && styles.borrowBtnCompleteLandscape]}
                        onPress={() => onBorrowTime(mins * 60)}
                    >
                        <Text style={[styles.borrowBtnTextComplete, isLandscape && styles.borrowBtnTextCompleteLandscape]}>
                            +{mins}m
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );

    const renderLandscapeLayout = () => (
        <View style={styles.landscapeWrapper}>
            {/* Left Panel: Detailed Summary (Narrow & Vertical) */}
            <Animated.View style={[styles.leftPanel, { opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}>
                <Text style={styles.summaryTitle}>SESSION SUMMARY</Text>

                <View style={styles.detailsGrid}>
                    {renderDetailCard('play-circle-outline', 'STARTED AT', formatISOToTime(startTime), '#FFFFFF', true)}
                    {renderDetailCard('check-circle-outline', 'FINISHED AT', completedAt, '#FFFFFF', true)}
                    {renderDetailCard('add-alarm', 'BORROWED', borrowedTime > 0 ? `${Math.floor(borrowedTime / 60)}m ${borrowedTime % 60}s` : 'NONE', '#FFD740', true)}
                    {category ? renderDetailCard(category.icon, 'CATEGORY', category.name.toUpperCase(), category.color, true) : renderDetailCard('stars', 'STATUS', 'GOAL REACHED', '#4CAF50', true)}
                </View>
            </Animated.View>

            {/* Right Panel: Actions (Spacious) */}
            <View style={styles.rightPanel}>
                <View style={styles.headerContainerLandscape}>
                    <MaterialIcons name="done-all" size={24} color="#FFFFFF" style={styles.headerIconLandscape} />
                    <Text style={styles.completionLabelLandscape}>TASK SUCCESSFUL</Text>
                </View>

                {renderBorrowSection(true)}

                <TouchableOpacity style={[styles.mainActionButtonLandscape]} onPress={onDone}>
                    <MaterialIcons name="home" size={28} color="#000000" />
                    <Text style={styles.mainActionButtonTextLandscape}>Back to Home</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    const renderPortraitLayout = () => (
        <View style={styles.mainContent}>
            {/* Success Section */}
            <View style={styles.successSection}>
                <View style={styles.successCircleContainer}>
                    {/* Circle Glow Removed */}
                    <View style={styles.successCircle}>
                        <MaterialIcons name="check" size={56} color="#000000" />
                    </View>
                </View>
                <Text style={styles.title}>Task Complete</Text>
                {category && (
                    <View style={[styles.categoryBadge, { backgroundColor: `${category.color}15`, borderColor: `${category.color}40` }]}>
                        <MaterialIcons name={category.icon} size={16} color={category.color} />
                        <Text style={[styles.categoryBadgeText, { color: category.color }]}>{category.name}</Text>
                    </View>
                )}
                <View style={styles.timeInfoContainer}>
                    <Text style={styles.subtitle}>STARTED AT {formatISOToTime(startTime)}</Text>
                    <View style={styles.timeSeparator} />
                    <Text style={styles.subtitle}>FINISHED AT {completedAt}</Text>
                </View>
            </View>

            {/* Action Buttons & Borrow Section */}
            <View style={styles.portraitActionContainer}>
                {renderBorrowSection(false)}

                <TouchableOpacity style={[styles.actionButton, styles.doneButton]} onPress={onDone}>
                    <View style={[styles.buttonIconContainer, styles.doneIconContainer]}>
                        <MaterialIcons name="done-all" size={28} color="#000000" />
                    </View>
                    <View style={styles.buttonTextContainer}>
                        <Text style={[styles.buttonTitle, styles.doneButtonTitle]}>Done</Text>
                        <Text style={[styles.buttonSubtitle, styles.doneButtonSubtitle]}>Complete task</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={24} color="rgba(0,0,0,0.3)" />
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <LinearGradient
            colors={['#000000', '#000000']}
            locations={[0, 1]}
            style={styles.container}
        >
            {/* Background Glow Removed for Pure Black Theme */}

            <SafeAreaView style={styles.safeArea}>
                {!isLandscape && (
                    <View style={styles.header}>
                        <View style={styles.completionBadge}>
                            <MaterialIcons name="check-circle" size={16} color="#000000" />
                            <Text style={styles.completionLabel}>COMPLETED</Text>
                            <Text style={styles.completionPercent}>100%</Text>
                        </View>
                    </View>
                )}

                {isLandscape ? renderLandscapeLayout() : renderPortraitLayout()}

                <View style={styles.bottomIndicator} />
            </SafeAreaView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    safeArea: {
        flex: 1,
    },
    glowOrb1: {
        position: 'absolute',
        width: 300,
        height: 300,
        borderRadius: 150,
        backgroundColor: 'rgba(255, 255, 255, 0.4)',
        top: '30%',
        left: -100,
        ...Platform.select({ ios: { shadowColor: '#FFFFFF', shadowOpacity: 0.3, shadowRadius: 60 } }),
    },
    glowOrb1Landscape: {
        top: '5%',
        left: '5%',
        width: 400,
        height: 400,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 14,
        paddingVertical: 14,
        paddingHorizontal: 24,
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    glowOrb2: {
        position: 'absolute',
        width: 200,
        height: 200,
        borderRadius: 100,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        bottom: '20%',
        right: -60,
    },
    glowOrb2Landscape: {
        bottom: '5%',
        right: '5%',
        width: 300,
        height: 300,
    },
    header: {
        flexDirection: 'row',
        paddingHorizontal: 24,
        paddingTop: 16,
    },
    completionBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    completionLabel: {
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 1,
        color: 'rgba(0,0,0,0.6)',
        marginLeft: 8,
    },
    completionPercent: {
        fontSize: 14,
        fontWeight: '700',
        color: '#000000',
        marginLeft: 6,
    },

    // Portrait Layout
    mainContent: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    successSection: {
        alignItems: 'center',
        marginBottom: 48,
    },
    successCircleContainer: {
        marginBottom: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    successCircleGlow: {
        position: 'absolute',
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
        ...Platform.select({ ios: { shadowColor: '#fff', shadowOpacity: 0.8, shadowRadius: 40 } }),
    },
    successCircle: {
        width: 96,
        height: 96,
        borderRadius: 48,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 38,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 12,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 2,
        color: 'rgba(255,255,255,0.4)',
        textAlign: 'center',
    },
    categoryBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 12,
        borderWidth: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderColor: 'rgba(255, 255, 255, 0.2)',
        marginBottom: 12,
        gap: 6,
    },
    categoryBadgeText: {
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 1,
    },
    timeInfoContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        marginTop: 4,
    },
    timeSeparator: {
        width: 1,
        height: 12,
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    borrowedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 12,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    borrowedBadgeText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#FFFFFF',
        letterSpacing: 1,
    },
    buttonContainer: {
        gap: 16,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 20,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    restartButton: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderColor: 'rgba(255, 255, 255, 0.4)',
    },
    doneButton: {
        backgroundColor: '#FFFFFF',
        borderColor: '#FFFFFF',
    },
    buttonIconContainer: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    doneIconContainer: {
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
    },
    buttonTextContainer: {
        flex: 1,
    },
    buttonTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 2,
    },
    buttonTitleLandscape: {
        fontSize: 20,
        fontWeight: '800',
        color: '#fff',
        marginLeft: 16,
    },
    restartButtonTitle: {
        color: '#FFFFFF',
    },
    doneButtonTitle: {
        color: '#000000',
    },
    buttonSubtitle: {
        fontSize: 12,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.5)',
    },
    doneButtonSubtitle: {
        color: 'rgba(0, 0, 0, 0.5)',
    },
    bottomIndicator: {
        alignSelf: 'center',
        width: 100,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#FFFFFF',
        marginBottom: 24,
    },

    // Landscape Layout
    landscapeWrapper: {
        flex: 1,
        flexDirection: 'row',
        paddingHorizontal: 40,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 40,
    },
    leftPanel: {
        width: 380,
        backgroundColor: 'rgba(15, 15, 15, 0.6)',
        borderRadius: 28,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        padding: 16,
        gap: 12,
    },
    summaryTitle: {
        fontSize: 10,
        fontWeight: '800',
        color: 'rgba(255, 255, 255, 0.6)',
        letterSpacing: 1.5,
        marginBottom: 6,
    },
    detailsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    detailCard: {
        width: '47%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        backgroundColor: 'rgba(20, 20, 20, 0.6)',
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    detailCardLandscape: {
        width: '48%',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        padding: 12,
        gap: 10,
        borderRadius: 14,
    },
    detailIconBox: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    detailIconBoxLandscape: {
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    detailTextContainerLandscape: {
        flex: 1,
        justifyContent: 'center',
    },
    detailLabel: {
        fontSize: 9,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 1.5,
    },
    detailLabelLandscape: {
        fontSize: 8,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 0.5,
        marginBottom: 3,
    },
    detailValue: {
        fontSize: 15,
        fontWeight: '900',
        color: '#fff',
        marginTop: 2,
        letterSpacing: 0.5,
    },
    detailValueLandscape: {
        fontSize: 15,
        fontWeight: '800',
        color: '#fff',
        marginTop: 0,
    },
    portraitActionContainer: {
        gap: 32,
    },
    rightPanel: {
        flex: 1,
        justifyContent: 'center',
        gap: 32,
    },
    headerContainerLandscape: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    headerIconLandscape: {
        transform: [{ scale: 1.2 }],
    },
    completionLabelLandscape: {
        fontSize: 32,
        fontWeight: '900',
        fontStyle: 'italic',
        color: '#fff',
        letterSpacing: 2,
    },
    borrowContainerComplete: {
        gap: 12,
    },
    borrowContainerCompleteLandscape: {
        gap: 12,
        marginTop: 10,
    },
    borrowLabelComplete: {
        fontSize: 11,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 2,
        textAlign: 'center',
    },
    borrowLabelCompleteLandscape: {
        fontSize: 9,
        textAlign: 'left',
        letterSpacing: 2,
    },
    borrowButtonsComplete: {
        flexDirection: 'row',
        gap: 16,
        paddingHorizontal: 10,
    },
    borrowButtonsCompleteLandscape: {
        gap: 12,
        paddingHorizontal: 0,
    },
    borrowBtnComplete: {
        flex: 1,
        height: 52,
        borderRadius: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    borrowBtnCompleteLandscape: {
        height: 48,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'transparent',
    },
    borrowBtnTextComplete: {
        fontSize: 16,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    borrowBtnTextCompleteLandscape: {
        fontSize: 16,
        color: '#FFFFFF',
    },
    mainActionButtonLandscape: {
        backgroundColor: '#FFFFFF',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 70,
        borderRadius: 28,
        gap: 12,
        marginTop: 10,
        ...Platform.select({
            ios: {
                shadowColor: '#FFFFFF',
                shadowOpacity: 0.4,
                shadowRadius: 15,
                shadowOffset: { width: 0, height: 8 },
            }
        })
    },
    mainActionButtonTextLandscape: {
        fontSize: 20,
        fontWeight: '900',
        color: '#000000',
    },
    buttonContainerLandscape: {
        marginTop: 4,
    },
});
