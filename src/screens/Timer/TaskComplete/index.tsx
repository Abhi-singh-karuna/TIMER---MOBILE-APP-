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
import { useAudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { Category, SOUND_OPTIONS } from '../../../constants/data';
import CompletionSummary, { parseTimeToSeconds } from '../../../components/CompletionSummary';



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
    title?: string;
    /** Original timer length ("MM:SS" / "HH:MM:SS"), without extensions */
    totalTime?: string;
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
    title,
    totalTime,
}: TaskCompleteProps) {
    const { width, height } = useWindowDimensions();
    const [isLandscape, setIsLandscape] = React.useState(false);
    const playCountRef = useRef(0);
    // For repetitive playback, we'll use a local player instance in the effect loop.

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
                await setAudioModeAsync({
                    playsInSilentMode: true,
                    interruptionMode: 'doNotMix',
                });

                const playSoundOnce = async () => {
                    const soundSource = SOUND_OPTIONS[selectedSound]?.source;
                    if (soundSource === null || soundSource === undefined) return;

                    const player = createAudioPlayer(soundSource);
                    player.play();

                    const subscription = player.addListener('playbackStatusUpdate', (status: { didJustFinish: boolean }) => {
                        if (status.didJustFinish) {
                            subscription.remove();
                            playCountRef.current += 1;

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

    return (
        <LinearGradient
            colors={['#000000', '#000000']}
            locations={[0, 1]}
            style={styles.container}
        >
            <SafeAreaView style={styles.safeArea}>
                <Animated.View style={{ flex: 1, opacity: opacityAnim, transform: [{ scale: scaleAnim }] }}>
                    <CompletionSummary
                        variant="page"
                        horizontal={isLandscape}
                        title={title}
                        accentColor={category?.color}
                        categoryName={category?.name}
                        categoryIcon={category?.icon}
                        startTime={startTime}
                        endedAt={completedAt}
                        totalSeconds={parseTimeToSeconds(totalTime)}
                        extendedSeconds={borrowedTime}
                        onExtend={onBorrowTime}
                        onPrimary={onDone}
                        primaryLabel="Back to Home"
                        primaryIcon="home"
                    />
                </Animated.View>

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
