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

import SlideToComplete from '../../../components/SlideToComplete';
import { Category } from '../../../constants/data';

interface ActiveTimerProps {
    timerName: string;
    currentTime: string; // HH:MM:SS format
    progress: number; // 0-100
    endTime: string;
    isRunning: boolean;
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
        const trackBg = isPlay && isRunning ? sliderButtonColor : 'rgba(0,0,0,0.15)';

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
                        color={isPlay && isRunning ? "#000" : (isBlack ? "rgba(0,0,0,0.8)" : "#FFF")}
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
        colorTheme: 'white' | 'black'
    ) => {
        const isBlack = colorTheme === 'black';
        const height = 32; // Reduced from 44
        const width = 68;  // Reduced from 84
        const borderRadius = 10; // Adjusted for smaller size
        const bezelPadding = 3;  // Reduced from 4

        const surfaceColor = isBlack ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.03)';
        const bezelBorderColor = isBlack ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)';

        return (
            <View style={[styles.buttonBezel, { width: width + (bezelPadding * 2), height: height + (bezelPadding * 2), borderRadius: borderRadius + bezelPadding, backgroundColor: surfaceColor, borderColor: bezelBorderColor, padding: bezelPadding }]}>
                <TouchableOpacity
                    style={[
                        styles.buttonTrack,
                        {
                            width: width,
                            height: height,
                            borderRadius: borderRadius,
                            backgroundColor: 'rgba(0,0,0,0.1)'
                        }
                    ]}
                    onPress={onPress}
                    activeOpacity={0.7}
                >
                    <LinearGradient
                        colors={isBlack ? ['rgba(0,0,0,0.25)', 'rgba(0,0,0,0.1)'] : ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.15)']}
                        style={StyleSheet.absoluteFill}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                    />

                    <View style={[styles.interiorShadow, { borderRadius: borderRadius, borderBottomWidth: 2, borderRightWidth: 1, borderColor: isBlack ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.2)' }]} pointerEvents="none" />

                    <Text style={[styles.borrowBtnText, { color: isBlack ? "rgba(0,0,0,0.6)" : timerTextColor }]}>{text}</Text>

                    <View style={[styles.topRim, { borderRadius: borderRadius, borderTopWidth: 0.8, opacity: isBlack ? 0.3 : 1 }]} pointerEvents="none" />
                </TouchableOpacity>
                <View style={[styles.outerBoundaryHighlight, { borderRadius: borderRadius + bezelPadding, borderColor: isBlack ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.15)' }]} pointerEvents="none" />
            </View>
        );
    };

    const renderBorrowTime = (isLandscape: boolean, colorTheme: 'white' | 'black' = 'white') => {
        const isBlack = colorTheme === 'black';
        const textColor = isBlack ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.4)';

        return (
            <View style={[styles.borrowContainer, isLandscape && styles.borrowContainerLandscape]}>
                <Text style={[styles.borrowLabel, { color: textColor }]}>BORROW TIME</Text>
                <View style={[styles.borrowButtons, isLandscape && styles.borrowButtonsLandscape]}>
                    {[1, 5, 10].map((mins) => (
                        <View key={mins}>
                            {renderPrecisionPill(() => onBorrowTime(mins * 60), `+${mins}m`, colorTheme)}
                        </View>
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
                    {renderPrecisionButton(onPlayPause, isRunning ? "pause" : "play-arrow", true, colorTheme)}
                    {renderPrecisionButton(onCancel, "close", false, colorTheme)}
                </View>

                {/* Right Side: Timer (Left Aligned for Stability) */}
                <View style={styles.landscapeTimerContainer} pointerEvents="none">
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

    const renderPortraitContent = (colorTheme: 'white' | 'black') => {
        const isBlack = colorTheme === 'black';
        const textColor = isBlack ? '#000' : '#fff';
        const labelColor = isBlack ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)';
        const btnBg = isBlack ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
        const btnBorder = isBlack ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';

        return (
            <View style={[styles.mainContent, { width, height }]} pointerEvents="box-none">
                {/* Immersive Timer Section */}
                <View style={styles.portraitTimerContainer} pointerEvents="none">
                    <Text
                        style={[styles.portraitTimeText, { color: isBlack ? '#000' : timerTextColor }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                    >
                        {hours}:{minutes}:{seconds}
                    </Text>
                </View>

                {/* Controls Section */}
                <View style={styles.portraitControlsWrapper} pointerEvents="box-none">
                    {/* Borrow Time - Integrated inside controls for better spacing */}
                    {renderBorrowTime(false, colorTheme)}

                    <View style={styles.portraitMainControlsRow}>
                        {renderPrecisionButton(onPlayPause, isRunning ? "pause" : "play-arrow", true, colorTheme)}
                        {renderPrecisionButton(onCancel, "close", false, colorTheme)}
                    </View>

                    <View style={styles.portraitSlideContainer}>
                        <SlideToComplete onComplete={onComplete} colorTheme={colorTheme} dynamicColor={sliderButtonColor} />
                    </View>
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            {/* Absolute Base Layer (Always Black Background) */}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} />

            {/* Content Layer (White Theme / Base) */}
            <Animated.View
                style={[StyleSheet.absoluteFill, { opacity: orientationAnim }]}
                pointerEvents="box-none"
            >
                <SafeAreaView style={styles.safeArea} pointerEvents="box-none">
                    <View style={styles.contentContainer} pointerEvents="box-none">
                        {isLandscape ? renderLandscapeContent('white') : renderPortraitContent('white')}
                    </View>
                </SafeAreaView>
            </Animated.View>

            {/* Filler Mask Layer (Black Theme / Progress) */}
            <Animated.View
                pointerEvents="box-none"
                style={[StyleSheet.absoluteFill, { opacity: orientationAnim, zIndex: 1 }]}
            >
                <Animated.View
                    pointerEvents="box-none"
                    style={[
                        isLandscape ? styles.landscapeProgressFiller : styles.portraitProgressFiller,
                        {
                            [isLandscape ? 'width' : 'height']: waterLevel.interpolate({
                                inputRange: [0, 100],
                                outputRange: ['0%', '100%'],
                            }),
                            backgroundColor: fillerColor,
                            overflow: 'hidden',
                        }
                    ]}
                >
                    {/* Waves for Portrait Mode */}
                    {!isLandscape && (
                        <View style={styles.waveContainer} pointerEvents="none">
                            <Animated.View style={[styles.waveLayer1, { transform: [{ translateX: waveTranslateX }, { scaleY: waveScale }], backgroundColor: `${fillerColor}`, top: -30 }]} />
                            <Animated.View style={[styles.waveLayer2, { transform: [{ translateX: wave2TranslateX }], backgroundColor: `${fillerColor}`, opacity: 0.8, top: -25 }]} />
                            <Animated.View style={[styles.waveLayer3, { transform: [{ translateX: wave3TranslateX }, { scaleY: wave3ScaleY }], backgroundColor: `${fillerColor}`, opacity: 0.6, top: -20 }]} />
                        </View>
                    )}

                    {/* Content inside filler - perfectly identical to base layer for alignment */}
                    <View
                        style={{
                            width,
                            height,
                            position: 'absolute',
                            bottom: 0,
                            left: 0
                        }}
                        pointerEvents="box-none"
                    >
                        <SafeAreaView style={styles.safeArea} pointerEvents="box-none">
                            <View style={styles.contentContainer} pointerEvents="box-none">
                                {isLandscape ? renderLandscapeContent('black') : renderPortraitContent('black')}
                            </View>
                        </SafeAreaView>
                    </View>
                </Animated.View>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },

    waveContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 100, // Area for waves to oscillate
    },

    safeArea: {
        flex: 1,
    },

    // ========== PORTRAIT STYLES REDESIGN ==========
    mainContent: {
        flex: 1,
        paddingHorizontal: 24,
        paddingBottom: 40,
        paddingTop: 40, // Added top padding to push content down
        justifyContent: 'flex-start', // Shift to top-aligned flex to control spacing better
        alignItems: 'center',
    },

    contentContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },

    portraitTimerContainer: {
        alignItems: 'center',
        marginTop: 100, // Lowering the timer for better vertical weight
        marginBottom: 40,
    },

    portraitTimerLabel: {
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 8, // More aggressive letter spacing
        marginBottom: 8,
        opacity: 0.5,
    },

    portraitTimeText: {
        fontSize: 120, // Reverting to larger size for "Impact"
        fontWeight: '900',
        letterSpacing: -5,
        lineHeight: 120,
        fontVariant: ['tabular-nums'],
    },

    portraitControlsWrapper: {
        width: '100%',
        alignItems: 'center',
        position: 'absolute',
        bottom: 70, // Raising the controls for better balance
    },

    portraitMainControlsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 30, // Balanced gap for bezels
        marginTop: 24,
        marginBottom: 40,
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

    portraitSlideContainer: {
        width: '100%',
        height: 64,
        paddingHorizontal: 20,
    },

    portraitProgressFiller: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
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
        gap: 20, // Spacious gap for bezels
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
        transform: [{ scaleY: 1.07 }, { scaleX: 1.07 }],
    },

    landscapeSlideContainer: {
        position: 'absolute',
        top: 30,
        bottom: 30,
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

    borrowBtnText: {
        fontSize: 12, // Reduced from 14
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
