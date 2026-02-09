import React, { useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Platform,
    Animated,
    PanResponder,

} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const HANDLE_SIZE = 48;
const PADDING = 8;

interface SlideToCompleteProps {
    onComplete: () => void;
    vertical?: boolean;
    colorTheme?: 'white' | 'black';
    dynamicColor?: string; // Optional: dynamic color for handle and text
}

export default function SlideToComplete({
    onComplete,
    vertical = false,
    colorTheme = 'white',
    dynamicColor = '#FFFFFF'
}: SlideToCompleteProps) {
    // Use a ref to store max slide distance so stable PanResponder can access it
    const maxSlideRef = useRef(0);

    // We can also use state if we need to trigger re-renders, but for PanResponder ref is enough
    // However, text opacity interpolation needs a concrete value derived from measurements.
    // Let's use a ref for logic and standard Animated interpolation for UI which is relative 
    // OR just base interpolation on a fixed large value and clamp it? 
    // Better: Re-create measuring logic. 
    // Actually, simple approach:

    const pan = useRef(new Animated.Value(0)).current;
    const scale = useRef(new Animated.Value(1)).current;
    const [completed, setCompleted] = useState(false);
    // Track dimension for strict interpolation limits
    const [trackDimension, setTrackDimension] = useState(0);

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: () => {
                Animated.spring(scale, {
                    toValue: 1.2,
                    friction: 5,
                    useNativeDriver: false,
                }).start();
            },
            onPanResponderMove: (_, gestureState) => {
                if (completed) return;
                const maxSlide = maxSlideRef.current;
                if (maxSlide <= 0) return;

                if (vertical) {
                    const newY = Math.max(0, Math.min(maxSlide, gestureState.dy));
                    pan.setValue(newY);
                } else {
                    const newX = Math.max(0, Math.min(maxSlide, gestureState.dx));
                    pan.setValue(newX);
                }
            },
            onPanResponderRelease: (_, gestureState) => {
                if (completed) return;
                const maxSlide = maxSlideRef.current;
                const gestureValue = vertical ? gestureState.dy : gestureState.dx;

                Animated.spring(scale, {
                    toValue: 1,
                    friction: 5,
                    useNativeDriver: false,
                }).start();

                if (maxSlide > 0 && gestureValue > maxSlide * 0.8) {
                    setCompleted(true);
                    Animated.timing(pan, {
                        toValue: maxSlide,
                        duration: 200,
                        useNativeDriver: false,
                    }).start(() => {
                        onComplete();
                        setTimeout(() => {
                            setCompleted(false);
                            pan.setValue(0);
                        }, 1000);
                    });
                } else {
                    Animated.spring(pan, {
                        toValue: 0,
                        friction: 5,
                        tension: 40,
                        useNativeDriver: false,
                    }).start();
                }
            },
        })
    ).current;

    const handleLayout = (event: any) => {
        const { width, height } = event.nativeEvent.layout;
        const dimension = vertical ? height : width;
        const calculatedMax = dimension - HANDLE_SIZE - (PADDING * 2);
        maxSlideRef.current = calculatedMax;
        setTrackDimension(calculatedMax); // updating state to maybe assist debug or potential re-renders
    };

    // Interpolate opacity. We can use the maxSlideRef logic implicitly or just 
    // rely on a standard input range that covers most screen sizes, 
    // or better, just use the value 150 (typical half width) as fade out point.
    // Ideally it depends on trackWidth.
    const textOpacity = pan.interpolate({
        inputRange: [0, trackDimension > 0 ? trackDimension / 2 : 150],
        outputRange: [1, 0],
        extrapolate: 'clamp',
    });

    const textColor = colorTheme === 'black'
        ? 'rgba(0,0,0,0.45)' // Tinted dark for filler mode
        : (vertical ? dynamicColor : 'rgba(255,255,255,0.7)');

    // Interactive illumination effect that follows the handle
    const illuminationTranslateX = pan.interpolate({
        inputRange: [-100, 1000],
        outputRange: [-100, 1000],
    });

    return (
        <View style={styles.container}>
            {/* 1. Outer Edge Bezel (The surface contact point) */}
            <View style={[styles.outerWrapper, vertical && styles.outerWrapperVertical]}>
                <View style={[styles.track, vertical && styles.trackVertical]} onLayout={handleLayout}>
                    {/* 2. Base Concave Depth Layer */}
                    <LinearGradient
                        colors={colorTheme === 'black'
                            ? ['rgba(0,0,0,0.25)', 'rgba(0,0,0,0.1)']
                            : ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.15)']
                        }
                        style={StyleSheet.absoluteFill}
                        start={{ x: 0, y: 0 }}
                        end={vertical ? { x: 1, y: 0 } : { x: 0, y: 1 }}
                    />

                    {/* 3. Interior Shadow (Bottom/Right dark edge) */}
                    <View style={[styles.interiorShadow, vertical ? styles.interiorShadowVertical : styles.interiorShadowHorizontal, { borderColor: colorTheme === 'black' ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.25)' }]} pointerEvents="none" />

                    {/* 4. Interactive Luminescence (follows handle) */}
                    <Animated.View
                        style={[
                            styles.luminescence,
                            {
                                transform: [
                                    vertical ? { translateY: pan } : { translateX: pan }
                                ],
                                backgroundColor: colorTheme === 'black' ? '#FFF' : dynamicColor,
                                opacity: colorTheme === 'black' ? 0.3 : 0.15,
                            }
                        ]}
                        pointerEvents="none"
                    />

                    <Animated.Text style={[
                        styles.text,
                        vertical && styles.textVertical,
                        { opacity: textOpacity, color: textColor }
                    ]}>
                        {vertical ? 'SLIDE DOWN TO COMPLETE' : 'SLIDE TO COMPLETE'}
                    </Animated.Text>

                    <Animated.View
                        style={[
                            styles.handle,
                            {
                                transform: [
                                    vertical ? { translateY: pan } : { translateX: pan },
                                    { scale: scale }
                                ],
                                backgroundColor: colorTheme === 'black' ? 'rgba(255,255,255,0.95)' : dynamicColor,
                                shadowColor: colorTheme === 'black' ? '#000' : dynamicColor,
                            },
                            vertical && { left: '50%', marginLeft: -(HANDLE_SIZE / 2) }
                        ]}
                        {...panResponder.panHandlers}
                    >
                        {/* Handle Rim Light / Tactile Edge */}
                        <LinearGradient
                            colors={['rgba(255,255,255,0.4)', 'rgba(0,0,0,0.1)']}
                            style={StyleSheet.absoluteFill}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                        />

                        <View style={styles.handleInner}>
                            <MaterialIcons
                                name={vertical ? "keyboard-double-arrow-down" : "keyboard-double-arrow-right"}
                                size={24}
                                color={colorTheme === 'black' ? '#000' : (dynamicColor === '#FFFFFF' ? '#000' : '#FFF')}
                            />
                        </View>
                    </Animated.View>

                    {/* 5. Top Rim Highlight (The sharp premium edge) */}
                    <View style={styles.topRim} pointerEvents="none" />
                </View>

                {/* 6. Sharp Outer Boundary Line */}
                <View style={styles.outerBoundaryHighlight} pointerEvents="none" />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 0,
        width: '100%',
        alignItems: 'center',
    },
    outerWrapper: {
        width: '100%',
        height: 72, // Slightly larger than track for the "Precision Edge"
        borderRadius: 36,
        padding: 4, // The "Bezel" width
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderWidth: 0.8,
        borderColor: 'rgba(255, 255, 255, 0.12)',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    outerWrapperVertical: {
        width: 72,
        height: '100%',
    },
    track: {
        width: '100%',
        height: '100%',
        backgroundColor: 'transparent',
        borderRadius: 32,
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.15)', // Darker inner edge for depth
        justifyContent: 'center',
        overflow: 'hidden',
        position: 'relative',
    },
    trackVertical: {
        width: 64,
        height: '100%',
        alignItems: 'center',
        justifyContent: 'flex-start',
    },
    topRim: {
        ...StyleSheet.absoluteFillObject,
        borderTopWidth: 1,
        borderLeftWidth: 0.5,
        borderRightWidth: 0.5,
        borderColor: 'rgba(255,255,255,0.1)',
        borderRadius: 32,
    },
    outerBoundaryHighlight: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 36,
        borderBottomWidth: 1.5,
        borderRightWidth: 1,
        borderColor: 'rgba(0,0,0,0.2)',
        pointerEvents: 'none',
    },
    interiorShadow: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 32,
    },
    interiorShadowHorizontal: {
        borderBottomWidth: 3,
        borderRightWidth: 1,
        borderColor: 'rgba(0,0,0,0.15)',
    },
    interiorShadowVertical: {
        borderRightWidth: 3,
        borderBottomWidth: 1,
        borderColor: 'rgba(0,0,0,0.15)',
    },
    luminescence: {
        position: 'absolute',
        width: 120,
        height: 120,
        borderRadius: 60,
        left: -30,
        top: -30,
    },
    handle: {
        position: 'absolute',
        left: PADDING,
        top: PADDING,
        width: HANDLE_SIZE,
        height: HANDLE_SIZE,
        borderRadius: HANDLE_SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderWidth: 0.5,
        borderColor: 'rgba(255,255,255,0.3)',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.35,
                shadowRadius: 10,
            },
            android: {
                elevation: 12,
            },
        }),
    },
    handleInner: {
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
    },
    text: {
        textAlign: 'center',
        fontSize: 10, // Slightly smaller for better hierarchy
        fontWeight: '900',
        letterSpacing: 3,
        color: 'rgba(255,255,255,0.4)',
        marginLeft: 48,
        textTransform: 'uppercase',
        textShadowColor: 'rgba(0, 0, 0, 0.4)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 1,
    },
    textVertical: {
        transform: [{ rotate: '90deg' }],
        position: 'absolute',
        top: '50%',
        width: 400,
        letterSpacing: 5,
        color: '#FFFFFF',
        fontWeight: '900',
        opacity: 0.25,
        marginLeft: 0,
    }
});
