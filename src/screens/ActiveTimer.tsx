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

import SlideToComplete from '../components/SlideToComplete';

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
    onComplete
}: ActiveTimerProps) {
    const { width, height } = useWindowDimensions();
    const [isLandscape, setIsLandscape] = React.useState(false);

    // Animated value for water fill effect
    const waterLevel = useRef(new Animated.Value(progress)).current;
    const wavePhase = useRef(new Animated.Value(0)).current;

    const orientationAnim = useRef(new Animated.Value(1)).current;

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

    // Animate water level smoothly when progress changes - LINEAR for smooth continuous flow
    useEffect(() => {
        Animated.timing(waterLevel, {
            toValue: progress,
            duration: 1000, // Match timer update interval
            easing: Easing.linear, // Smooth linear animation
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

    const toggleOrientation = async () => {
        if (isLandscape) {
            await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        } else {
            await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_LEFT);
        }
    };

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
                    <SlideToComplete onComplete={onComplete} colorTheme={colorTheme} vertical={true} />
                </View>

                {/* Bottom Left: Controls (Repositioned to the right of the slider) */}
                <View style={[styles.landscapeControlsContainer, { zIndex: 10 }]} pointerEvents="box-none">
                    <TouchableOpacity
                        style={[
                            styles.landscapePlayBtn,
                            { backgroundColor: btnBg, borderColor: btnBorder },
                            isRunning && styles.landscapePlayBtnActive
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
                        style={[styles.landscapeTimeText, { color: textColor }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                    >
                        {hours}:{minutes}:{seconds}
                    </Text>
                </View>
            </View>
        );
    };

    const renderPortraitContent = () => {
        return (
            <View style={styles.mainContent} pointerEvents="box-none">
                <View style={styles.timerSection}>
                    <View style={styles.timerCard}>
                        <View style={styles.waterContainer}>
                            <Animated.View style={[styles.waterFill, { height: waterHeight }]}>
                                <LinearGradient
                                    colors={['rgba(0, 229, 255, 0.4)', 'rgba(0, 180, 220, 0.6)', 'rgba(0, 140, 180, 0.8)']}
                                    style={StyleSheet.absoluteFill}
                                />
                                <Animated.View style={[styles.waveLayer1, { transform: [{ translateX: waveTranslateX }, { scaleX: waveScale }] }]} />
                                <Animated.View style={[styles.waveLayer2, { transform: [{ translateX: wave2TranslateX }] }]} />
                                <Animated.View style={[styles.waveLayer3, { transform: [{ translateX: wave3TranslateX }, { scaleY: wave3ScaleY }] }]} />
                            </Animated.View>
                        </View>
                        <LinearGradient colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0.2)', 'transparent']} style={styles.cardInset} />
                        <View style={styles.timeDisplay}>
                            <Text style={styles.timeText}>
                                <Text style={styles.timeWhite}>{hours}</Text>
                                <Text style={styles.timeCyan}>:</Text>
                                <Text style={styles.timeWhite}>{minutes}</Text>
                                <Text style={styles.timeCyan}>:</Text>
                                <Text style={styles.timeCyanText}>{seconds}</Text>
                            </Text>
                            <View style={styles.timeLabels}>
                                <Text style={styles.timeLabel}>HRS</Text>
                                <Text style={styles.timeLabelSpacer} />
                                <Text style={styles.timeLabel}>MIN</Text>
                                <Text style={styles.timeLabelSpacer} />
                                <Text style={styles.timeLabel}>SEC</Text>
                            </View>
                        </View>
                        <View style={styles.progressBadge}>
                            <Text style={styles.progressBadgeText}>{progress}%</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.controlsSection}>
                    <View style={styles.controlsContainer}>
                        <View style={styles.controlButton}>
                            <TouchableOpacity style={[styles.circleButton, isRunning && styles.circleButtonActive]} onPress={onPlayPause} activeOpacity={0.7}>
                                <MaterialIcons name={isRunning ? 'pause' : 'play-arrow'} size={28} color={isRunning ? '#00E5FF' : '#fff'} />
                            </TouchableOpacity>
                            <Text style={styles.controlLabel}>{isRunning ? 'PAUSE' : 'PLAY'}</Text>
                        </View>
                        <View style={styles.controlButton}>
                            <TouchableOpacity style={styles.circleButton} onPress={onCancel} activeOpacity={0.7}>
                                <MaterialIcons name="close" size={28} color="#fff" />
                            </TouchableOpacity>
                            <Text style={styles.controlLabel}>CANCEL</Text>
                        </View>
                    </View>
                    <View style={styles.slideContainer}>
                        <SlideToComplete onComplete={onComplete} />
                    </View>
                </View>
            </View>
        );
    };

    return (
        <LinearGradient
            colors={isLandscape
                ? ['#000000', '#000000', '#000000']
                : ['#080C1A', '#0a2025', '#0d3a40']}
            locations={[0, 0.6, 1]}
            style={styles.container}
        >
            {/* Cyan wave at bottom - Hidden in landscape */}
            {!isLandscape && (
                <View style={[styles.waveContainer, { height: height * 0.25 }]}>
                    <View style={[styles.wave, { height: height * 0.3 }]} />
                </View>
            )}

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
                                backgroundColor: '#00E5FF',
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
                                    <Text style={styles.timerName}>{timerName.toUpperCase()}</Text>
                                    <View style={styles.headerInfo}>
                                        <Text style={styles.progressText}>{progress}%</Text>
                                        <Text style={styles.dotSeparator}>•</Text>
                                        <Text style={styles.endTimeText}>{isRunning ? 'RUNNING' : 'PAUSED'}</Text>
                                    </View>
                                </View>
                                <View style={styles.headerRight}>
                                    <TouchableOpacity style={styles.backButton} onPress={toggleOrientation} activeOpacity={0.7}>
                                        <MaterialIcons name="crop-landscape" size={20} color="rgba(255,255,255,0.7)" />
                                    </TouchableOpacity>
                                </View>
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
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
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
        color: '#00E5FF',
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

    timerCard: {
        flex: 1,
        marginHorizontal: 32,
        marginTop: 32,
        marginBottom: 24,
        borderRadius: 40,
        backgroundColor: 'rgba(10, 30, 40, 0.9)',
        borderWidth: 2,
        borderColor: 'rgba(0, 229, 255, 0.2)',
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
        ...Platform.select({
            ios: {
                shadowColor: '#00E5FF',
                shadowOpacity: 0.3,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: 10 },
            },
        }),
    },

    // Water fill effect styles
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

    // Wave layer 1 - Main curved wave
    waveLayer1: {
        position: 'absolute',
        top: -15,
        left: -40,
        right: -40,
        height: 30,
        backgroundColor: 'rgba(0, 229, 255, 0.4)',
        borderTopLeftRadius: 100,
        borderTopRightRadius: 150,
        borderBottomLeftRadius: 80,
        borderBottomRightRadius: 120,
    },

    // Wave layer 2 - Secondary wave (opposite curvature)
    waveLayer2: {
        position: 'absolute',
        top: -8,
        left: -30,
        right: -30,
        height: 22,
        backgroundColor: 'rgba(0, 200, 240, 0.35)',
        borderTopLeftRadius: 120,
        borderTopRightRadius: 80,
        borderBottomLeftRadius: 100,
        borderBottomRightRadius: 60,
    },

    // Wave layer 3 - Top foam/crest (lighter, smaller)
    waveLayer3: {
        position: 'absolute',
        top: -4,
        left: -20,
        right: -20,
        height: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.25)',
        borderTopLeftRadius: 60,
        borderTopRightRadius: 100,
        borderBottomLeftRadius: 40,
        borderBottomRightRadius: 80,
    },

    bubble: {
        position: 'absolute',
        backgroundColor: 'rgba(255, 255, 255, 0.5)',
        borderRadius: 50,
    },

    bubble1: {
        width: 8,
        height: 8,
        bottom: 20,
        left: '20%',
    },

    bubble2: {
        width: 12,
        height: 12,
        bottom: 30,
        right: '25%',
    },

    bubble3: {
        width: 6,
        height: 6,
        bottom: 15,
        left: '50%',
    },

    bubble4: {
        width: 10,
        height: 10,
        bottom: 25,
        left: '35%',
    },

    bubble5: {
        width: 7,
        height: 7,
        bottom: 10,
        right: '40%',
    },

    cardInset: {
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: 80,
        zIndex: 2,
    },

    timeDisplay: {
        alignItems: 'center',
        zIndex: 10,
    },

    timeText: {
        fontSize: 64,
        fontWeight: '200',
    },

    timeWhite: {
        color: '#fff',
    },

    timeCyan: {
        color: 'rgba(0, 229, 255, 0.4)',
    },

    timeCyanText: {
        color: '#00E5FF',
        fontWeight: '500', // Making seconds pop more
    },

    timeLabels: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
        gap: 4,
    },

    timeLabel: {
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 1,
        color: 'rgba(255, 255, 255, 0.4)',
        width: 36,
        textAlign: 'center',
    },

    timeLabelSpacer: {
        width: 20,
    },

    progressBadge: {
        position: 'absolute',
        bottom: 20,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: 'rgba(0, 229, 255, 0.2)',
        borderWidth: 1,
        borderColor: 'rgba(0, 229, 255, 0.3)',
    },

    progressBadgeText: {
        fontSize: 12,
        fontWeight: '800',
        color: '#00E5FF',
        letterSpacing: 2,
    },

    progressBadgeLandscape: {
        backgroundColor: 'transparent',
        borderWidth: 0,
        bottom: 40,
    },

    controlsContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginBottom: 24,
    },

    controlButton: {
        alignItems: 'center',
        marginHorizontal: 24,
    },

    circleButton: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: 'rgba(20, 40, 50, 0.9)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        marginBottom: 8,
    },

    circleButtonActive: {
        backgroundColor: 'rgba(0, 229, 255, 0.15)',
        borderColor: 'rgba(0, 229, 255, 0.3)',
    },

    controlLabel: {
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 1.5,
        color: 'rgba(255,255,255,0.5)',
    },

    slideContainer: {
        paddingHorizontal: 32,
        paddingBottom: 16,
    },

    // Main Layout Containers
    mainContent: {
        flex: 1,
        flexDirection: 'column',
    },

    mainContentLandscape: {
        flex: 1,
    },

    timerSection: {
        flex: 1,
        justifyContent: 'center',
    },

    controlsSection: {
        width: '100%',
    },

    landscapeWrapper: {
        flex: 1,
        flexDirection: 'row',
    },

    landscapeControlsContainer: {
        position: 'absolute',
        bottom: 40,
        left: 125, // Shifted 5px right from 120
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

    landscapePlayBtnActive: {
        backgroundColor: '#00E5FF',
        borderColor: '#00E5FF',
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
        bottom: 20, // Anchored to bottom-right corner per reference image
        right: 30,
        alignItems: 'flex-start', // Keeps text left-aligned for stability
        justifyContent: 'center',
        width: 320, // Give it enough fixed space
        // 
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
        fontWeight: '700',
        color: '#fff',
        letterSpacing: -6,
        lineHeight: 180,
        textAlign: 'left', // Critical for stability when digits change
    },

    landscapeSlideContainer: {
        position: 'absolute',
        top: 40,
        bottom: 40,
        left: 50, // Shifted 2px right as requested
        width: 64, // Vertical track width
    },

    landscapeProgressFiller: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
    },
});
