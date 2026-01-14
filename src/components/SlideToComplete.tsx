import React, { useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
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
}

export default function SlideToComplete({
    onComplete,
    vertical = false,
    colorTheme = 'white'
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

    const textColor = colorTheme === 'black' ? '#000' : (vertical ? '#00E5FF' : 'rgba(255,255,255,0.7)');

    return (
        <View style={styles.container}>
            <View style={[styles.track, vertical && styles.trackVertical]} onLayout={handleLayout}>
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
                            backgroundColor: colorTheme === 'black' ? 'rgba(0,0,0,0.8)' : '#00E5FF',
                            shadowColor: colorTheme === 'black' ? '#000' : '#00E5FF',
                        }
                    ]}
                    {...panResponder.panHandlers}
                >
                    <MaterialIcons
                        name={vertical ? "keyboard-double-arrow-down" : "keyboard-double-arrow-right"}
                        size={24}
                        color={colorTheme === 'black' ? '#00E5FF' : '#000'}
                    />
                </Animated.View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 0,
        width: '100%',
    },
    track: {
        width: '100%',
        height: 64,
        backgroundColor: 'rgba(255, 255, 255, 0.12)', // Slightly more visible glass
        borderRadius: 32,
        borderWidth: 1.5, // Thicker border for better definition
        borderColor: 'rgba(255, 255, 255, 0.15)',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    trackVertical: {
        width: 64, // Increased to match 64 height of horizontal track and ensure centering
        height: '100%',
        alignItems: 'center',
        justifyContent: 'flex-start',
        backgroundColor: 'rgba(0, 0, 0, 0.4)', // Darker track to match reference
        borderColor: 'rgba(255, 191, 0, 0.1)',
    },
    handle: {
        position: 'absolute',
        left: PADDING,
        top: PADDING,
        width: HANDLE_SIZE,
        height: HANDLE_SIZE,
        borderRadius: HANDLE_SIZE / 2,
        backgroundColor: '#00E5FF', // Sky blue handle to match theme
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: "#00E5FF", // Sky blue glow
        shadowOffset: {
            width: 0,
            height: 0,
        },
        shadowOpacity: 0.6,
        shadowRadius: 10,
        elevation: 8,
    },
    text: {
        textAlign: 'center',
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 2,
        color: 'rgba(255,255,255,0.7)',
        marginLeft: 48,
    },
    textVertical: {
        transform: [{ rotate: '90deg' }],
        position: 'absolute',
        top: '50%',
        width: 400, // Ensure enough width for rotation
        letterSpacing: 4,
        color: '#00E5FF',
        fontWeight: '800',
        opacity: 0.4,
        marginLeft: 0,
    }
});
