import React, { useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Platform,
    useWindowDimensions,
    Animated,
    Easing,
    LayoutAnimation,
    UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import SlideToComplete from '../components/SlideToComplete';
import { Category } from '../constants/data';

interface ActiveTimerProps {
    timerName: string;
    currentTime: string; // HH:MM:SS format
    progress: number; // 0-100
    endTime: string;
    isRunning: boolean;
    onBack: () => void;
    onPlayPause: () => void;
    onCancel: () => void;
    onComplete: () => void;
    onBorrowTime: (seconds: number) => void;
    fillerColor?: string;
    sliderButtonColor?: string;
    timerTextColor?: string;
    categoryId?: string;
    categories: Category[];
}

export default function ActiveTimer({
    timerName,
    currentTime,
    progress,
    endTime,
    isRunning,
    onBack,
    onPlayPause,
    onCancel,
    onComplete,
    onBorrowTime,
    fillerColor = '#FFFFFF',
    sliderButtonColor = '#FFFFFF',
    timerTextColor = '#FFFFFF',
    categoryId,
    categories
}: ActiveTimerProps) {
    const { width, height } = useWindowDimensions();
    const [isLandscape, setIsLandscape] = React.useState(false);

    // Animated value for water fill effect
    const waterLevel = useRef(new Animated.Value(progress)).current;
    const wavePhase = useRef(new Animated.Value(0)).current;

    const orientationAnim = useRef(new Animated.Value(1)).current;

    // Keep screen awake while timer is running
    useEffect(() => {
        if (isRunning) {
            activateKeepAwakeAsync();
        } else {
            deactivateKeepAwake();
        }

        return () => {
            deactivateKeepAwake();
        };
    }, [isRunning]);

    // Handle orientation changes and animations
    useEffect(() => {
        const currentLandscape = width > height;
        if (isLandscape !== currentLandscape) {
            if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
                UIManager.setLayoutAnimationEnabledExperimental(true);
            }

            // Smooth layout movement
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

            // Cross-fade effect
            orientationAnim.setValue(0);
            Animated.timing(orientationAnim, {
                toValue: 1,
                duration: 400,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
            }).start();

            setIsLandscape(currentLandscape);
        }
    }, [width, height, isLandscape]);

    // Animated bubbles - 5 bubbles with different animations
    const bubble1Y = useRef(new Animated.Value(0)).current;
    const bubble2Y = useRef(new Animated.Value(0)).current;
    const bubble3Y = useRef(new Animated.Value(0)).current;
    const bubble4Y = useRef(new Animated.Value(0)).current;
    const bubble5Y = useRef(new Animated.Value(0)).current;
    const bubble1Opacity = useRef(new Animated.Value(0)).current;
    const bubble2Opacity = useRef(new Animated.Value(0)).current;
    const bubble3Opacity = useRef(new Animated.Value(0)).current;
    const bubble4Opacity = useRef(new Animated.Value(0)).current;
    const bubble5Opacity = useRef(new Animated.Value(0)).current;

    // Parse time - supports both HH:MM:SS and MM:SS formats
    const timeParts = currentTime.split(':');
    const hours = timeParts.length === 3 ? timeParts[0] : '00';
    const minutes = timeParts.length === 3 ? timeParts[1] : timeParts[0];
    const seconds = timeParts.length === 3 ? timeParts[2] : timeParts[1];

    // Animate water level smoothly - matches the 1 second timer interval for seamless flow
    // Using 1000ms duration means the animation completes exactly as the next update arrives
    // This creates a perfectly continuous visual flow without stepping or flickering
    useEffect(() => {
        // Stop any existing animation
        waterLevel.stopAnimation();

        // Start fresh animation to the new target
        Animated.timing(waterLevel, {
            toValue: progress,
            duration: 1000, // Matches timer update interval for seamless continuous flow
            easing: Easing.linear, // Linear = constant speed = no visible steps
            useNativeDriver: false,
        }).start();
    }, [progress]);

    // Continuous wave animation when running
    useEffect(() => {
        let waveAnimation: Animated.CompositeAnimation;
        let bubbleAnimations: Animated.CompositeAnimation[] = [];

        if (isRunning) {
            // Wave animation
            waveAnimation = Animated.loop(
                Animated.sequence([
                    Animated.timing(wavePhase, {
                        toValue: 1,
                        duration: 1500,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                    Animated.timing(wavePhase, {
                        toValue: 0,
                        duration: 1500,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                ])
            );
            waveAnimation.start();

            // Bubble animations - each bubble floats up continuously
            const createBubbleAnimation = (bubbleY: Animated.Value, bubbleOpacity: Animated.Value, duration: number, delay: number) => {
                return Animated.loop(
                    Animated.sequence([
                        Animated.delay(delay),
                        Animated.parallel([
                            Animated.timing(bubbleY, {
                                toValue: -200,
                                duration: duration,
                                easing: Easing.out(Easing.quad),
                                useNativeDriver: true,
                            }),
                            Animated.sequence([
                                Animated.timing(bubbleOpacity, {
                                    toValue: 0.8,
                                    duration: duration * 0.2,
                                    useNativeDriver: true,
                                }),
                                Animated.timing(bubbleOpacity, {
                                    toValue: 0.6,
                                    duration: duration * 0.6,
                                    useNativeDriver: true,
                                }),
                                Animated.timing(bubbleOpacity, {
                                    toValue: 0,
                                    duration: duration * 0.2,
                                    useNativeDriver: true,
                                }),
                            ]),
                        ]),
                        Animated.timing(bubbleY, {
                            toValue: 0,
                            duration: 0,
                            useNativeDriver: true,
                        }),
                    ])
                );
            };

            // Start bubble animations with different timings
            const b1 = createBubbleAnimation(bubble1Y, bubble1Opacity, 3000, 0);
            const b2 = createBubbleAnimation(bubble2Y, bubble2Opacity, 2500, 500);
            const b3 = createBubbleAnimation(bubble3Y, bubble3Opacity, 3500, 1000);
            const b4 = createBubbleAnimation(bubble4Y, bubble4Opacity, 2800, 1500);
            const b5 = createBubbleAnimation(bubble5Y, bubble5Opacity, 3200, 2000);

            bubbleAnimations = [b1, b2, b3, b4, b5];
            bubbleAnimations.forEach(anim => anim.start());
        } else {
            wavePhase.setValue(0);
            // Reset bubbles
            [bubble1Y, bubble2Y, bubble3Y, bubble4Y, bubble5Y].forEach(b => b.setValue(0));
            [bubble1Opacity, bubble2Opacity, bubble3Opacity, bubble4Opacity, bubble5Opacity].forEach(b => b.setValue(0));
        }

        return () => {
            if (waveAnimation) waveAnimation.stop();
            bubbleAnimations.forEach(anim => anim.stop());
        };
    }, [isRunning]);

    // Calculate water height based on progress
    const waterHeight = waterLevel.interpolate({
        inputRange: [0, 100],
        outputRange: ['0%', '100%'],
    });

    // Wave translation for better ripple effect
    const waveTranslateX = wavePhase.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [-20, 20, -20],
    });

    const waveScale = wavePhase.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [1, 1.15, 1],
    });

    // Second wave (opposite direction)
    const wave2TranslateX = wavePhase.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [15, -15, 15],
    });

    // Third wave (slower, larger movement)
    const wave3TranslateX = wavePhase.interpolate({
        inputRange: [0, 0.25, 0.5, 0.75, 1],
        outputRange: [-10, 5, 10, 5, -10],
    });

    const wave3ScaleY = wavePhase.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [1, 0.8, 1],
    });

    const renderBorrowTime = (isLandscape: boolean, colorTheme: 'white' | 'black' = 'white') => {
        const isBlack = colorTheme === 'black';
        const textColor = isBlack ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)';
        const btnBg = isBlack ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
        const btnBorder = isBlack ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';

        return (
            <View style={[styles.borrowContainer, isLandscape && styles.borrowContainerLandscape]}>
                <Text style={[styles.borrowLabel, { color: textColor }]}>BORROW TIME</Text>
                <View style={[styles.borrowButtons, isLandscape && styles.borrowButtonsLandscape]}>
                    {[1, 5, 10].map((mins) => (
                        <TouchableOpacity
                            key={mins}
                            style={[
                                styles.borrowBtn,
                                { backgroundColor: btnBg, borderColor: btnBorder }
                            ]}
                            onPress={() => onBorrowTime(mins * 60)}
                            activeOpacity={0.7}
                        >
                            <Text style={[styles.borrowBtnText, { color: timerTextColor }]}>+{mins}m</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
        );
    };

    const renderLandscapeContent = (colorTheme: 'white' | 'black') => {
        const isBlack = colorTheme === 'black';
        const textColor = isBlack ? '#000' : '#fff';
        const labelColor = isBlack ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)';
        const btnBg = isBlack ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
        const btnBorder = isBlack ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)';

        return (
            <View
                style={[styles.landscapeWrapper, { width, height }]}
                pointerEvents="box-none"
            >
                {/* Left Side: Vertical Slider (Upside to Downside) */}
                <View style={styles.landscapeSlideContainer} pointerEvents="box-none">
                    <SlideToComplete onComplete={onComplete} colorTheme={colorTheme} vertical={true} dynamicColor={sliderButtonColor} />
                </View>

                {/* Bottom Left: Controls (Repositioned to the right of the slider) */}
                <View style={[styles.landscapeControlsContainer, { zIndex: 10 }]} pointerEvents="box-none">
                    <TouchableOpacity
                        style={[
                            styles.landscapePlayBtn,
                            { backgroundColor: btnBg, borderColor: btnBorder },
                            isRunning && { backgroundColor: sliderButtonColor, borderColor: sliderButtonColor }
                        ]}
                        onPress={onPlayPause}
                        activeOpacity={0.7}
                    >
                        <MaterialIcons name={isRunning ? "pause" : "play-arrow"} size={44} color={isRunning ? "#000" : textColor} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.landscapeCancelBtn, { backgroundColor: btnBg }]}
                        onPress={onCancel}
                        activeOpacity={0.7}
                    >
                        <MaterialIcons name="close" size={24} color={textColor} />
                    </TouchableOpacity>
                </View>

                {/* Right Side: Timer (Left Aligned for Stability) */}
                <View style={styles.landscapeTimerContainer} pointerEvents="none">
                    <Text style={[styles.landscapeTimerLabel, { color: labelColor }]}>TIMER ({timerName})</Text>
                    <Text
                        style={[styles.landscapeTimeText, { color: isBlack ? '#000' : timerTextColor }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                    >
                        {hours}:{minutes}:{seconds}
                    </Text>
                </View>

                {/* Time Borrow Section for Landscape - Top Right Corner */}
                {renderBorrowTime(true, colorTheme)}
            </View>
        );
    };

    const renderPortraitContent = () => {
        return (
            <View style={styles.mainContent} pointerEvents="box-none">
                {/* Immersive Timer Section */}
                <View style={styles.timerSection}>
                    {/* Floating Glow Layer */}
                    <View style={styles.floatingGlow} />

                    <View style={styles.vesselWrapper}>
                        {/* The Living Water Pill */}
                        <View style={styles.vesselContainer}>
                            <View style={styles.waterContainer}>
                                <Animated.View style={[styles.waterFill, { height: waterHeight }]}>
                                    <LinearGradient
                                        colors={[`${fillerColor}73`, `${fillerColor}A6`, `${fillerColor}D9`]}
                                        style={StyleSheet.absoluteFill}
                                    />
                                    <Animated.View style={[styles.waveLayer1, { transform: [{ translateX: waveTranslateX }, { scaleX: waveScale }], backgroundColor: `${fillerColor}66` }]} />
                                    <Animated.View style={[styles.waveLayer2, { transform: [{ translateX: wave2TranslateX }], backgroundColor: `${fillerColor}59` }]} />
                                    <Animated.View style={[styles.waveLayer3, { transform: [{ translateX: wave3TranslateX }, { scaleY: wave3ScaleY }] }]} />
                                </Animated.View>
                            </View>

                            {/* Inner Shine Effect */}
                            <LinearGradient
                                colors={['rgba(255,255,255,0.1)', 'transparent', 'rgba(0,0,0,0.3)']}
                                style={styles.vesselShine}
                            />
                        </View>

                        {/* Centered Timer Content */}
                        <View style={styles.timeDisplayPortrait}>
                            <Text style={styles.timeTextPortrait}>
                                <Text style={styles.timeUnitPortrait}>{hours}</Text>
                                <Text style={styles.timeSepPortrait}>:</Text>
                                <Text style={styles.timeUnitPortrait}>{minutes}</Text>
                                <Text style={styles.timeSepPortrait}>:</Text>
                                <Text style={styles.timeSecPortrait}>{seconds}</Text>
                            </Text>
                            <View style={styles.timeLabelsPortrait}>
                                <Text style={styles.timeLabelSmall}>HOURS</Text>
                                <Text style={styles.timeLabelSpacerSmall} />
                                <Text style={styles.timeLabelSmall}>MINUTES</Text>
                                <Text style={styles.timeLabelSpacerSmall} />
                                <Text style={styles.timeLabelSmall}>SECONDS</Text>
                            </View>
                        </View>
                    </View>

                    {/* Simple Progress Pill */}
                    <View style={styles.progressPillPortrait}>
                        <View style={[styles.progressPillFill, { width: `${progress}%`, backgroundColor: `${fillerColor}25` }]} />
                        <Text style={[styles.progressPillText, { color: fillerColor }]}>{progress}% COMPLETE</Text>
                    </View>
                </View>

                {/* Controls Section with Glass Finish */}
                <View style={styles.controlsSectionPortrait}>
                    {/* Borrow Time integrated more cleanly */}
                    <View style={styles.borrowSectionPortrait}>
                        <View style={styles.borrowDivider} />
                        {renderBorrowTime(false)}
                        <View style={styles.borrowDivider} />
                    </View>

                    <View style={styles.mainControlsRow}>
                        <View style={styles.controlBtnWrapper}>
                            <TouchableOpacity
                                style={[
                                    styles.actionButton,
                                    isRunning && styles.actionButtonActive,
                                    isRunning && { borderColor: `${sliderButtonColor}60`, backgroundColor: `${sliderButtonColor}15` }
                                ]}
                                onPress={onPlayPause}
                                activeOpacity={0.8}
                            >
                                <MaterialIcons
                                    name={isRunning ? 'pause' : 'play-arrow'}
                                    size={32}
                                    color={isRunning ? sliderButtonColor : '#fff'}
                                />
                            </TouchableOpacity>
                            <Text style={styles.actionBtnLabel}>{isRunning ? 'PAUSE' : 'START'}</Text>
                        </View>

                        <View style={styles.controlBtnWrapper}>
                            <TouchableOpacity style={styles.actionButton} onPress={onCancel} activeOpacity={0.8}>
                                <MaterialIcons name="close" size={28} color="rgba(255,255,255,0.8)" />
                            </TouchableOpacity>
                            <Text style={styles.actionBtnLabel}>CANCEL</Text>
                        </View>
                    </View>

                    <View style={styles.slideAreaPortrait}>
                        <SlideToComplete onComplete={onComplete} />
                    </View>
                </View>
            </View>
        );
    };

    return (
        <LinearGradient
            colors={['#000000', '#000000']}
            locations={[0, 1]}
            style={styles.container}
        >
            {/* Landscape Overlays - Moved outside SafeAreaView for true fullscreen */}
            {isLandscape && (
                <Animated.View
                    style={[StyleSheet.absoluteFill, { opacity: orientationAnim }]}
                    pointerEvents="box-none"
                >
                    {renderLandscapeContent('white')}
                    <Animated.View
                        pointerEvents="box-none"
                        style={[
                            styles.landscapeProgressFiller,
                            {
                                width: waterLevel.interpolate({
                                    inputRange: [0, 100],
                                    outputRange: ['0%', '100%'],
                                }),
                                backgroundColor: fillerColor,
                                overflow: 'hidden',
                                zIndex: 1,
                            }
                        ]}
                    >
                        {renderLandscapeContent('black')}
                    </Animated.View>
                </Animated.View>
            )}

            <SafeAreaView style={styles.safeArea} pointerEvents="box-none">
                <Animated.View style={[{ flex: 1, opacity: orientationAnim }]} pointerEvents="box-none">
                    {!isLandscape && (
                        <>
                            <View style={styles.header}>
                                <View style={styles.headerLeft}>
                                    <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
                                        <MaterialIcons name="arrow-back-ios" size={20} color="rgba(255,255,255,0.7)" style={{ marginLeft: 6 }} />
                                    </TouchableOpacity>
                                </View>
                                <View style={styles.headerPill}>
                                    <View style={styles.categoryRow}>
                                        <Text style={styles.timerName}>{timerName.toUpperCase()}</Text>
                                    </View>
                                    <View style={styles.headerInfo}>
                                        <Text style={[styles.progressText, { color: fillerColor }]}>{progress}%</Text>
                                        <Text style={styles.dotSeparator}>•</Text>
                                        <Text style={styles.endTimeText}>{isRunning ? 'RUNNING' : 'PAUSED'}</Text>
                                    </View>
                                </View>
                                <View style={styles.headerRight} />
                            </View>
                            {renderPortraitContent()}
                        </>
                    )}
                </Animated.View>
            </SafeAreaView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },

    waveContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        overflow: 'hidden',
    },

    wave: {
        position: 'absolute',
        bottom: -50,
        left: -50,
        right: -50,
        backgroundColor: '#00a0a0',
        borderTopLeftRadius: 200,
        borderTopRightRadius: 300,
        opacity: 0.6,
    },

    safeArea: {
        flex: 1,
    },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 16,
        paddingHorizontal: 24,
    },

    headerLeft: {
        width: 44,
        alignItems: 'flex-start',
    },

    headerRight: {
        width: 44,
    },

    backButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },

    headerPill: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
    },

    categoryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 2,
    },

    timerName: {
        fontSize: 14,
        fontWeight: '700',
        letterSpacing: 2,
        color: '#fff',
        marginBottom: 4,
    },

    headerInfo: {
        flexDirection: 'row',
        alignItems: 'center',
    },

    progressText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#FFFFFF',
        marginRight: 6,
    },

    dotSeparator: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        marginRight: 6,
    },

    endTimeText: {
        fontSize: 12,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.6)',
    },

    // ========== PORTRAIT STYLES REDESIGN ==========
    mainContent: {
        flex: 1,
        paddingHorizontal: 24,
    },

    timerSection: {
        flex: 1.8,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 20,
    },

    floatingGlow: {
        position: 'absolute',
        width: 300,
        height: 300,
        borderRadius: 150,
        backgroundColor: 'transparent',
        zIndex: -1,
    },

    vesselWrapper: {
        width: 260,
        height: 320,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },

    vesselContainer: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 140,
        backgroundColor: 'rgba(15, 30, 45, 0.4)',
        borderWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        overflow: 'hidden',
    },

    vesselShine: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 140,
    },

    timeDisplayPortrait: {
        alignItems: 'center',
        zIndex: 10,
    },

    timeTextPortrait: {
        fontSize: 72,
        fontWeight: '800',
        color: '#fff',
        letterSpacing: -2,
        fontVariant: ['tabular-nums'],
    },

    timeUnitPortrait: {
        color: '#fff',
    },

    timeSepPortrait: {
        color: 'rgba(255, 255, 255, 0.3)',
        fontSize: 56,
        marginHorizontal: -4,
    },

    timeSecPortrait: {
        color: '#FFFFFF',
    },

    timeLabelsPortrait: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },

    timeLabelSmall: {
        fontSize: 9,
        fontWeight: '800',
        color: 'rgba(255, 255, 255, 0.4)',
        letterSpacing: 1.5,
        width: 50,
        textAlign: 'center',
    },

    timeLabelSpacerSmall: {
        width: 12,
    },

    progressPillPortrait: {
        marginTop: 32,
        width: 180,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
    },

    progressPillFill: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
    },

    progressPillText: {
        fontSize: 10,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: 1.5,
    },

    controlsSectionPortrait: {
        flex: 1.4,
        width: '100%',
        paddingBottom: 10,
    },

    borrowSectionPortrait: {
        marginBottom: 16,
    },

    borrowDivider: {
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        width: '100%',
        marginVertical: 4,
    },

    mainControlsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 40,
        marginBottom: 24,
    },

    controlBtnWrapper: {
        alignItems: 'center',
        gap: 10,
    },

    actionButton: {
        width: 68,
        height: 68,
        borderRadius: 34,
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOpacity: 0.3,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 },
            },
        }),
    },

    actionButtonActive: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderColor: 'rgba(255, 255, 255, 0.4)',
    },

    actionBtnLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: 'rgba(255, 255, 255, 0.4)',
        letterSpacing: 2,
    },

    slideAreaPortrait: {
        width: '100%',
        paddingBottom: 10,
    },

    // ========== LANDSCAPE LAYOUT STYLES ==========
    landscapeWrapper: {
        flex: 1,
        flexDirection: 'row',
    },

    landscapeControlsContainer: {
        position: 'absolute',
        bottom: 40,
        left: 125,
        flexDirection: 'row',
        alignItems: 'center',
    },

    landscapePlayBtn: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 20,
        borderWidth: 1,
    },

    landscapeCancelBtn: {
        width: 56,
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },

    landscapeTimerContainer: {
        position: 'absolute',
        bottom: 20,
        right: 30,
        alignItems: 'flex-start',
        justifyContent: 'center',
        width: 420,
    },

    landscapeTimerLabel: {
        fontSize: 18,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 2,
        marginBottom: -10,
    },

    landscapeTimeText: {
        fontSize: 180,
        fontFamily: 'Inter_900Black',
        fontWeight: '900',
        color: '#fff',
        letterSpacing: -3,
        lineHeight: 150,
        fontVariant: ['tabular-nums'],
        transform: [{ scaleY: 1.18 }],
    },

    landscapeSlideContainer: {
        position: 'absolute',
        top: 40,
        bottom: 40,
        left: 50,
        width: 64,
    },

    landscapeProgressFiller: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
    },

    // ========== SHARED COMPONENTS ==========
    borrowContainer: {
        marginTop: 20,
        alignItems: 'center',
        width: '100%',
    },

    borrowContainerLandscape: {
        position: 'absolute',
        top: 40,
        right: 30,
        alignItems: 'flex-end',
    },

    borrowLabel: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 2,
        marginBottom: 12,
    },

    borrowButtons: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 12,
    },

    borrowButtonsLandscape: {
        justifyContent: 'flex-end',
    },

    borrowBtn: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        minWidth: 70,
        alignItems: 'center',
    },

    borrowBtnText: {
        fontSize: 14,
        fontWeight: '700',
    },

    waterContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        top: 0,
        overflow: 'hidden',
    },

    waterFill: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        overflow: 'hidden',
    },

    waveLayer1: {
        position: 'absolute',
        top: -15,
        left: -40,
        right: -40,
        height: 30,
        backgroundColor: 'rgba(255, 255, 255, 0.4)',
        borderTopLeftRadius: 120,
        borderTopRightRadius: 180,
    },

    waveLayer2: {
        position: 'absolute',
        top: -8,
        left: -30,
        right: -30,
        height: 22,
        backgroundColor: 'rgba(255, 255, 255, 0.35)',
        borderTopLeftRadius: 140,
        borderTopRightRadius: 100,
    },

    waveLayer3: {
        position: 'absolute',
        top: -4,
        left: -20,
        right: -20,
        height: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderTopLeftRadius: 80,
        borderTopRightRadius: 120,
    },
});
