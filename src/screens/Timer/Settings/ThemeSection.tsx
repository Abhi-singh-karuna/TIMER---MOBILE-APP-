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
import { LANDSCAPE_PRESETS, COLOR_PRESETS } from '../../../constants/data';
import { styles } from './styles';
import {
    ThemeSectionProps,
    FILLER_COLOR_KEY,
    SLIDER_BUTTON_COLOR_KEY,
    TEXT_COLOR_KEY,
    PRESET_INDEX_KEY,
    DEFAULT_FILLER_COLOR,
    DEFAULT_SLIDER_BUTTON_COLOR,
    DEFAULT_TEXT_COLOR,
} from './types';

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

    const renderColorPickerRow = (title: string, icon: keyof typeof MaterialIcons.glyphMap, currentColor: string, onSelect: (color: string) => void) => (
        <View style={[styles.colorPickerCard, isLandscape && styles.colorPickerCardLandscape]}>
            <View style={styles.colorPickerHeader}>
                <View style={styles.colorPickerTitleRow}>
                    <MaterialIcons name={icon} size={18} color={currentColor} />
                    <Text style={[styles.colorPickerTitle, isLandscape && styles.colorPickerTitleLandscape]}>{title}</Text>
                </View>
                <View style={[styles.currentColorBadge, { backgroundColor: currentColor }]} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colorScrollerContent}>
                {COLOR_PRESETS.map((preset) => (
                    <TouchableOpacity key={preset.value} style={[styles.colorChip, currentColor === preset.value && styles.colorChipSelected, { borderColor: currentColor === preset.value ? preset.value : 'transparent' }]} onPress={() => onSelect(preset.value)} activeOpacity={0.7}>
                        <View style={[styles.colorChipSwatch, { backgroundColor: preset.value }]}>
                            {currentColor === preset.value && <MaterialIcons name="check" size={14} color={preset.value === '#FFFFFF' ? '#000' : '#fff'} />}
                        </View>
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>
    );

    if (isLandscape) {
        return (
            <View>
                <Text style={styles.sectionTitleLandscape}>CUSTOMIZE COLORS</Text>
                {renderColorPickerRow('Filler Color', 'gradient', fillerColor, handleFillerColorSelect)}
                <View style={styles.sectionDivider} />
                {renderColorPickerRow('Button Color', 'touch-app', sliderButtonColor, handleSliderButtonColorSelect)}
                <View style={styles.sectionDivider} />
                {renderColorPickerRow('Text Color', 'text-fields', timerTextColor, handleTextColorSelect)}

                <TouchableOpacity
                    style={styles.landscapeResetButton}
                    onPress={onResetToDefaults}
                    activeOpacity={0.7}
                >
                    <MaterialIcons name="refresh" size={18} color="#FFFFFF" />
                    <Text style={styles.resetButtonText}>Reset to Defaults</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <>
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>LANDSCAPE PREVIEW</Text>
                {renderLandscapePreview()}
            </View>
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>CUSTOMIZE COLORS</Text>
                {renderColorPickerRow('Filler Color', 'gradient', fillerColor, handleFillerColorSelect)}
                {renderColorPickerRow('Slider & Button', 'touch-app', sliderButtonColor, handleSliderButtonColorSelect)}
                {renderColorPickerRow('Timer Text', 'text-fields', timerTextColor, handleTextColorSelect)}
            </View>
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
