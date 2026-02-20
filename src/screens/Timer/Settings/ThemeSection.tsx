import React, { useRef, useEffect, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Animated,
    StyleSheet,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { LANDSCAPE_PRESETS, COLOR_PRESETS } from '../../../constants/data';
import { styles } from './styles';
import {
    ThemeSectionProps,
    FILLER_COLOR_KEY,
    SLIDER_BUTTON_COLOR_KEY,
    TEXT_COLOR_KEY,
} from './types';

// Helper to convert hue (0-360) to Hex (Full Saturation/Value)
const hsvToHex = (h: number) => {
    const hNorm = h / 360;
    const s = 0.85; // Vibrant
    const v = 0.95; // Bright

    let r, g, b;
    let i = Math.floor(hNorm * 6);
    let f = hNorm * 6 - i;
    let p = v * (1 - s);
    let q = v * (1 - s * f);
    let t = v * (1 - s * (1 - f));

    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
        default: r = v, g = t, b = p;
    }

    const toHex = (x: number) => {
        const hex = Math.round(x * 255).toString(16);
        return hex.padStart(2, '0');
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
};

interface ThemeSectionFullProps extends ThemeSectionProps {
    scrollRef?: React.RefObject<ScrollView>;
    pulseAnim?: Animated.Value;
}

export default function ThemeSection({
    isLandscape,
    fillerColor,
    sliderButtonColor,
    timerTextColor,
    activePresetIndex,
    previewWidth,
    onFillerColorChange,
    onSliderButtonColorChange,
    onTimerTextColorChange,
    onPresetChange,
    onResetToDefaults,
    resetKey,
}: ThemeSectionFullProps) {
    const scrollRef = useRef<ScrollView>(null);
    const pulseAnim = useRef(new Animated.Value(1)).current;

    // Track slider values independently to avoid jitter during drag
    const [fillerHue, setFillerHue] = useState(0);
    const [buttonHue, setButtonHue] = useState(0);
    const [textHue, setTextHue] = useState(0);

    // Reset hues to 0 when global reset is triggered
    useEffect(() => {
        setFillerHue(0);
        setButtonHue(0);
        setTextHue(0);
    }, [resetKey]);

    const lastScrolledIndex = useRef(activePresetIndex);
    const isProgrammaticScroll = useRef(false);

    // Scroll to active preset when it changes (e.g. on reset or mount)
    useEffect(() => {
        if (scrollRef.current) {
            // Use a small delay to ensure layout is ready and avoid race conditions
            const timer = setTimeout(() => {
                isProgrammaticScroll.current = true;
                scrollRef.current?.scrollTo({
                    x: activePresetIndex * previewWidth,
                    animated: true
                });
                lastScrolledIndex.current = activePresetIndex;

                // Reset flag after animation duration
                setTimeout(() => {
                    isProgrammaticScroll.current = false;
                }, 500);
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [activePresetIndex, previewWidth, resetKey]);

    const triggerPulse = () => {
        pulseAnim.setValue(1);
        Animated.sequence([
            Animated.timing(pulseAnim, { toValue: 1.05, duration: 100, useNativeDriver: true }),
            Animated.timing(pulseAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
        ]).start();
    };

    const handleScroll = (event: any) => {
        if (isProgrammaticScroll.current) return;

        const slideSize = event.nativeEvent.layoutMeasurement.width;
        const currentOffset = event.nativeEvent.contentOffset.x;
        const index = Math.round(currentOffset / slideSize);
        if (index !== activePresetIndex && index >= 0 && index < LANDSCAPE_PRESETS.length) {
            lastScrolledIndex.current = index;
            onPresetChange(index);
            triggerPulse();
        }
    };

    const handleFillerColorSelect = (color: string) => {
        onFillerColorChange(color);
        triggerPulse();
        AsyncStorage.setItem(FILLER_COLOR_KEY, color).catch(err => console.error(err));
    };

    const handleSliderButtonColorSelect = (color: string) => {
        onSliderButtonColorChange(color);
        triggerPulse();
        AsyncStorage.setItem(SLIDER_BUTTON_COLOR_KEY, color).catch(err => console.error(err));
    };

    const handleTextColorSelect = (color: string) => {
        onTimerTextColorChange(color);
        triggerPulse();
        AsyncStorage.setItem(TEXT_COLOR_KEY, color).catch(err => console.error(err));
    };

    const renderLandscapePreview = () => (
        <Animated.View style={[styles.phoneFrameContainer, isLandscape && styles.phoneFrameContainerLandscape, { transform: [{ scale: pulseAnim }] }]}>
            <View style={[styles.phoneFrame, { width: previewWidth + 12 }]}>
                <View style={styles.phoneInternalFrame}>
                    <ScrollView
                        ref={scrollRef}
                        horizontal
                        pagingEnabled
                        snapToInterval={previewWidth}
                        decelerationRate="fast"
                        showsHorizontalScrollIndicator={false}
                        onScroll={handleScroll}
                        style={styles.previewScroll}
                        scrollEventThrottle={16}
                        nestedScrollEnabled={true}
                        canCancelContentTouches={false}
                        disallowInterruption={true}
                    >
                        {LANDSCAPE_PRESETS.map((preset, index) => (
                            <View key={index} style={[styles.previewCard, { width: previewWidth }]}>
                                <View style={styles.landscapePreview}>
                                    <Animated.View style={[styles.previewGlow, { backgroundColor: activePresetIndex === index ? fillerColor : preset.filler, shadowColor: activePresetIndex === index ? fillerColor : preset.filler, opacity: activePresetIndex === index ? 0.3 : 0.15 }]} />
                                    <View style={[styles.previewFiller, { backgroundColor: activePresetIndex === index ? fillerColor : preset.filler }]} />
                                    <LinearGradient colors={['rgba(255,255,255,0.08)', 'transparent', 'transparent']} style={StyleSheet.absoluteFill} pointerEvents="none" />
                                    <View style={styles.previewLeftSection}>
                                        <View style={styles.previewSliderTrack}>
                                            <View style={[styles.previewSliderHandle, { backgroundColor: activePresetIndex === index ? sliderButtonColor : preset.slider }]}>
                                                <MaterialIcons name="keyboard-double-arrow-down" size={14} color="#000" />
                                            </View>
                                            <Text style={[styles.previewSliderText, { color: activePresetIndex === index ? sliderButtonColor : preset.slider }]}>SLIDE</Text>
                                        </View>
                                        <View style={{ marginRight: 10 }}>
                                            <View style={[styles.previewPlayButton, { backgroundColor: activePresetIndex === index ? sliderButtonColor : preset.slider }]}>
                                                <MaterialIcons name="pause" size={22} color="#000" />
                                            </View>
                                        </View>
                                        <View style={styles.previewCancelButton}>
                                            <MaterialIcons name="close" size={16} color="#fff" />
                                        </View>
                                    </View>
                                    <View style={styles.previewTimerSection}>
                                        <View style={styles.previewLabelContainer}>
                                            <View style={[styles.labelPill, { backgroundColor: activePresetIndex === index ? fillerColor : preset.filler }]}>
                                                <Text style={styles.previewTimerLabelAlt}>{preset.name.toUpperCase()}</Text>
                                            </View>
                                        </View>
                                        <View style={styles.previewTimerRow}>
                                            <Text style={[styles.previewTimerText, { color: activePresetIndex === index ? timerTextColor : preset.text }, isLandscape && styles.previewTimerTextLandscape]}>00:05:30</Text>
                                        </View>
                                    </View>
                                </View>
                            </View>
                        ))}
                    </ScrollView>
                </View>
            </View >
            <View style={styles.pagination}>
                {LANDSCAPE_PRESETS.map((_, i) => (
                    <View key={i} style={[styles.dot, activePresetIndex === i && { backgroundColor: LANDSCAPE_PRESETS[i].filler, width: 10, height: 10, opacity: 1 }]} />
                ))}
            </View>
        </Animated.View >
    );

    const renderColorPickerRow = (
        title: string,
        icon: keyof typeof MaterialIcons.glyphMap,
        currentColor: string,
        onSelect: (color: string) => void
    ) => (
        <View style={styles.settingsCardBezelSmall}>
            <View style={styles.settingsCardTrackUnified}>
                <View style={[styles.colorPickerCard, isLandscape && styles.colorPickerCardLandscape, { marginBottom: 0, padding: 12 }]}>
                    <View style={styles.colorPickerHeader}>
                        <View style={styles.colorPickerTitleRow}>
                            <View style={styles.iconWell}>
                                <MaterialIcons name={icon} size={16} color={currentColor} />
                            </View>
                            <Text style={[styles.colorPickerTitle, isLandscape && styles.colorPickerTitleLandscape]}>{title}</Text>
                        </View>
                        <View style={[styles.currentColorBadge, { backgroundColor: currentColor }]}>
                            <View style={styles.colorGemInnerGlow} />
                        </View>
                    </View>

                    <View style={styles.sliderContainer}>
                        <View style={styles.sliderTrackBg}>
                            <LinearGradient
                                colors={['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000']}
                                start={{ x: 0, y: 0.5 }}
                                end={{ x: 1, y: 0.5 }}
                                style={styles.hueGradient}
                            />
                            <View style={styles.sliderTrenchShadow} />
                        </View>
                        <Slider
                            style={styles.hueSlider}
                            minimumValue={0}
                            maximumValue={360}
                            step={1}
                            value={title.includes('Filler') ? fillerHue : title.includes('Button') ? buttonHue : textHue}
                            onValueChange={(val) => {
                                const hex = hsvToHex(val);
                                if (title.includes('Filler')) {
                                    setFillerHue(val);
                                    onFillerColorChange(hex);
                                } else if (title.includes('Button')) {
                                    setButtonHue(val);
                                    onSliderButtonColorChange(hex);
                                } else {
                                    setTextHue(val);
                                    onTimerTextColorChange(hex);
                                }
                            }}
                            onSlidingComplete={(val) => {
                                const hex = hsvToHex(val);
                                const key = title.includes('Filler') ? FILLER_COLOR_KEY : title.includes('Button') ? SLIDER_BUTTON_COLOR_KEY : TEXT_COLOR_KEY;
                                AsyncStorage.setItem(key, hex).catch(err => console.error(err));
                                triggerPulse();
                            }}
                            minimumTrackTintColor="transparent"
                            maximumTrackTintColor="transparent"
                            thumbTintColor="#fff"
                        />
                    </View>
                </View>
            </View>
            <View style={styles.settingsCardOuterGlowSmall} pointerEvents="none" />
        </View>
    );

    const renderResetButton = () => (
        <TouchableOpacity
            onPress={onResetToDefaults}
            activeOpacity={0.7}
            style={styles.topRightResetBezel}
        >
            <View style={styles.topRightResetTrack}>
                <MaterialIcons name="refresh" size={14} color="#FFF" />
                <Text style={styles.resetTextCompact}>Reset</Text>
            </View>
        </TouchableOpacity>
    );

    if (isLandscape) {
        return (
            <View>
                <View style={[styles.headerWithReset, { marginBottom: 15 }]}>
                    <Text style={[styles.sectionTitleLandscape, { marginBottom: 0 }]}>CUSTOMIZE COLORS</Text>
                    {renderResetButton()}
                </View>

                {renderColorPickerRow('Filler Color', 'gradient', fillerColor, handleFillerColorSelect)}
                <View style={{ height: 10 }} />
                {renderColorPickerRow('Button Color', 'touch-app', sliderButtonColor, handleSliderButtonColorSelect)}
                <View style={{ height: 10 }} />
                {renderColorPickerRow('Timer Text Color', 'text-fields', timerTextColor, handleTextColorSelect)}
            </View>
        );
    }

    return (
        <>
            <Text style={styles.sectionTitle}>LANDSCAPE PREVIEW</Text>
            {renderLandscapePreview()}
            <View style={[styles.sectionDivider, { marginVertical: 16 }]} />

            <View style={styles.headerWithReset}>
                <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>CUSTOMIZE COLORS</Text>
                {renderResetButton()}
            </View>

            {renderColorPickerRow('Filler Color', 'gradient', fillerColor, handleFillerColorSelect)}
            <View style={{ height: 8 }} />
            {renderColorPickerRow('Button Color', 'touch-app', sliderButtonColor, handleSliderButtonColorSelect)}
            <View style={{ height: 8 }} />
            {renderColorPickerRow('Timer Text Color', 'text-fields', timerTextColor, handleTextColorSelect)}
        </>
    );
}

// Export the preview component separately for use in landscape sidebar
export function LandscapePreviewComponent({
    isLandscape,
    fillerColor,
    sliderButtonColor,
    timerTextColor,
    activePresetIndex,
    previewWidth,
    onPresetChange,
    resetKey,
}: {
    isLandscape: boolean;
    fillerColor: string;
    sliderButtonColor: string;
    timerTextColor: string;
    activePresetIndex: number;
    previewWidth: number;
    onPresetChange: (index: number) => void;
    resetKey?: number;
}) {
    const scrollRef = useRef<ScrollView>(null);
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const lastScrolledIndex = useRef(activePresetIndex);
    const isProgrammaticScroll = useRef(false);

    useEffect(() => {
        if (scrollRef.current) {
            const timer = setTimeout(() => {
                isProgrammaticScroll.current = true;
                scrollRef.current?.scrollTo({
                    x: activePresetIndex * previewWidth,
                    animated: true
                });
                lastScrolledIndex.current = activePresetIndex;

                setTimeout(() => {
                    isProgrammaticScroll.current = false;
                }, 500);
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [activePresetIndex, previewWidth, resetKey]);

    const triggerPulse = () => {
        pulseAnim.setValue(1);
        Animated.sequence([
            Animated.timing(pulseAnim, { toValue: 1.05, duration: 100, useNativeDriver: true }),
            Animated.timing(pulseAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
        ]).start();
    };

    const handleScroll = (event: any) => {
        if (isProgrammaticScroll.current) return;

        const slideSize = event.nativeEvent.layoutMeasurement.width;
        const currentOffset = event.nativeEvent.contentOffset.x;
        const index = Math.round(currentOffset / slideSize);
        if (index !== activePresetIndex && index >= 0 && index < LANDSCAPE_PRESETS.length) {
            lastScrolledIndex.current = index;
            onPresetChange(index);
            triggerPulse();
        }
    };

    return (
        <Animated.View style={[styles.phoneFrameContainer, isLandscape && styles.phoneFrameContainerLandscape, { transform: [{ scale: pulseAnim }] }]}>
            <View style={[styles.phoneFrame, { width: previewWidth + 12 }]}>
                <View style={styles.phoneInternalFrame}>
                    <ScrollView
                        ref={scrollRef}
                        horizontal
                        pagingEnabled
                        snapToInterval={previewWidth}
                        decelerationRate="fast"
                        showsHorizontalScrollIndicator={false}
                        onScroll={handleScroll}
                        style={styles.previewScroll}
                        scrollEventThrottle={16}
                        nestedScrollEnabled={true}
                        canCancelContentTouches={false}
                        disallowInterruption={true}
                    >
                        {LANDSCAPE_PRESETS.map((preset, index) => (
                            <View key={index} style={[styles.previewCard, { width: previewWidth }]}>
                                <View style={styles.landscapePreview}>
                                    <Animated.View style={[styles.previewGlow, { backgroundColor: activePresetIndex === index ? fillerColor : preset.filler, shadowColor: activePresetIndex === index ? fillerColor : preset.filler, opacity: activePresetIndex === index ? 0.3 : 0.15 }]} />
                                    <View style={[styles.previewFiller, { backgroundColor: activePresetIndex === index ? fillerColor : preset.filler }]} />
                                    <LinearGradient colors={['rgba(255,255,255,0.08)', 'transparent', 'transparent']} style={StyleSheet.absoluteFill} pointerEvents="none" />
                                    <View style={styles.previewLeftSection}>
                                        <View style={styles.previewSliderTrack}>
                                            <View style={[styles.previewSliderHandle, { backgroundColor: activePresetIndex === index ? sliderButtonColor : preset.slider }]}>
                                                <MaterialIcons name="keyboard-double-arrow-down" size={14} color="#000" />
                                            </View>
                                            <Text style={[styles.previewSliderText, { color: activePresetIndex === index ? sliderButtonColor : preset.slider }]}>SLIDE</Text>
                                        </View>
                                        <View style={{ marginRight: 10 }}>
                                            <View style={[styles.previewPlayButton, { backgroundColor: activePresetIndex === index ? sliderButtonColor : preset.slider }]}>
                                                <MaterialIcons name="pause" size={22} color="#000" />
                                            </View>
                                        </View>
                                        <View style={styles.previewCancelButton}>
                                            <MaterialIcons name="close" size={16} color="#fff" />
                                        </View>
                                    </View>
                                    <View style={styles.previewTimerSection}>
                                        <View style={styles.previewLabelContainer}>
                                            <View style={[styles.labelPill, { backgroundColor: activePresetIndex === index ? fillerColor : preset.filler }]}>
                                                <Text style={styles.previewTimerLabelAlt}>{preset.name.toUpperCase()}</Text>
                                            </View>
                                        </View>
                                        <View style={styles.previewTimerRow}>
                                            <Text style={[styles.previewTimerText, { color: activePresetIndex === index ? timerTextColor : preset.text }, isLandscape && styles.previewTimerTextLandscape]}>00:05:30</Text>
                                        </View>
                                    </View>
                                </View>
                            </View>
                        ))}
                    </ScrollView>
                </View>
            </View>
            <View style={styles.pagination}>
                {LANDSCAPE_PRESETS.map((_, i) => (
                    <View key={i} style={[styles.dot, activePresetIndex === i && { backgroundColor: LANDSCAPE_PRESETS[i].filler, width: 10, height: 10, opacity: 1 }]} />
                ))}
            </View>
        </Animated.View>
    );
}
