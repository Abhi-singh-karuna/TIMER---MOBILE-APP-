import React, { useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    useWindowDimensions,
    Platform,
    Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FILLER_COLOR_KEY = '@timer_filler_color';
const SLIDER_BUTTON_COLOR_KEY = '@timer_slider_button_color';
const TEXT_COLOR_KEY = '@timer_text_color';
const PRESET_INDEX_KEY = '@timer_active_preset_index';

// Default colors
const DEFAULT_FILLER_COLOR = '#00E5FF';
const DEFAULT_SLIDER_BUTTON_COLOR = '#00E5FF';
const DEFAULT_TEXT_COLOR = '#FFFFFF';

interface SettingsScreenProps {
    onBack: () => void;
    fillerColor: string;
    sliderButtonColor: string;
    timerTextColor: string;
    onFillerColorChange: (color: string) => void;
    onSliderButtonColorChange: (color: string) => void;
    onTimerTextColorChange: (color: string) => void;
    activePresetIndex: number;
    onPresetChange: (index: number) => void;
}

const COLOR_PRESETS = [
    { name: 'Sky Blue', value: '#00E5FF' },
    { name: 'Gold', value: '#FFD700' },
    { name: 'Coral', value: '#FF6B6B' },
    { name: 'Mint', value: '#4ECDC4' },
    { name: 'Purple', value: '#9B59B6' },
    { name: 'White', value: '#FFFFFF' },
    { name: 'Orange', value: '#FF9500' },
    { name: 'Pink', value: '#FF2D55' },
    { name: 'Green', value: '#34C759' },
    { name: 'Red', value: '#FF3B30' },
];

const LANDSCAPE_PRESETS = [
    {
        name: 'Deep Sea',
        filler: '#00E5FF',
        slider: '#00E5FF',
        text: '#FFFFFF'
    },
    {
        name: 'Lava Glow',
        filler: '#FF9500',
        slider: '#FF9500',
        text: '#FFFFFF'
    },
    {
        name: 'Neon Forest',
        filler: '#34C759',
        slider: '#34C759',
        text: '#FFFFFF'
    },
];

export default function SettingsScreen({
    onBack,
    fillerColor,
    sliderButtonColor,
    timerTextColor,
    onFillerColorChange,
    onSliderButtonColorChange,
    onTimerTextColorChange,
    activePresetIndex,
    onPresetChange
}: SettingsScreenProps) {
    const { width, height } = useWindowDimensions();
    const isLandscape = width > height;

    const previewWidth = isLandscape ? (width - 48 - 32) * 0.38 : width - 48;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const scrollRef = useRef<ScrollView>(null);

    // Initial scroll to active preset
    useEffect(() => {
        if (scrollRef.current) {
            // Small delay to ensure layout is ready
            setTimeout(() => {
                scrollRef.current?.scrollTo({
                    x: activePresetIndex * previewWidth,
                    animated: false
                });
            }, 100);
        }
    }, []);

    const triggerPulse = () => {
        pulseAnim.setValue(1);
        Animated.sequence([
            Animated.timing(pulseAnim, {
                toValue: 1.05,
                duration: 100,
                useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
                toValue: 1,
                duration: 150,
                useNativeDriver: true,
            }),
        ]).start();
    };

    const handleScroll = (event: any) => {
        const slideSize = event.nativeEvent.layoutMeasurement.width;
        const currentOffset = event.nativeEvent.contentOffset.x;

        // Detect preset change when > 50% of the next slide is visible
        const index = Math.round(currentOffset / slideSize);

        if (index !== activePresetIndex && index >= 0 && index < LANDSCAPE_PRESETS.length) {
            onPresetChange(index);
            triggerPulse();
        }
    };

    const handleFillerColorSelect = (color: string) => {
        onFillerColorChange(color);
        triggerPulse();
        AsyncStorage.setItem(FILLER_COLOR_KEY, color).catch(err =>
            console.error('Failed to save filler color:', err)
        );
    };

    const handleSliderButtonColorSelect = (color: string) => {
        onSliderButtonColorChange(color);
        triggerPulse();
        AsyncStorage.setItem(SLIDER_BUTTON_COLOR_KEY, color).catch(err =>
            console.error('Failed to save slider/button color:', err)
        );
    };

    const handleTextColorSelect = (color: string) => {
        onTimerTextColorChange(color);
        triggerPulse();
        AsyncStorage.setItem(TEXT_COLOR_KEY, color).catch(err =>
            console.error('Failed to save text color:', err)
        );
    };

    const handleResetToDefaults = async () => {
        try {
            await Promise.all([
                AsyncStorage.setItem(FILLER_COLOR_KEY, DEFAULT_FILLER_COLOR),
                AsyncStorage.setItem(SLIDER_BUTTON_COLOR_KEY, DEFAULT_SLIDER_BUTTON_COLOR),
                AsyncStorage.setItem(TEXT_COLOR_KEY, DEFAULT_TEXT_COLOR),
                AsyncStorage.setItem(PRESET_INDEX_KEY, '0'),
            ]);
            onFillerColorChange(DEFAULT_FILLER_COLOR);
            onSliderButtonColorChange(DEFAULT_SLIDER_BUTTON_COLOR);
            onTimerTextColorChange(DEFAULT_TEXT_COLOR);
            onPresetChange(0);
        } catch (e) {
            console.error('Failed to reset colors:', e);
        }
    };

    // Render the landscape preview component
    const renderLandscapePreview = () => {
        return (
            <Animated.View
                style={[
                    styles.phoneFrameContainer,
                    isLandscape && styles.phoneFrameContainerLandscape,
                    { transform: [{ scale: pulseAnim }] }
                ]}
            >
                {/* Phone Frame Mockup */}
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
                        >
                            {LANDSCAPE_PRESETS.map((preset, index) => (
                                <View key={index} style={[styles.previewCard, { width: previewWidth }]}>
                                    <View style={styles.landscapePreview}>
                                        {/* Dynamic Glow Effect */}
                                        <Animated.View
                                            style={[
                                                styles.previewGlow,
                                                {
                                                    backgroundColor: activePresetIndex === index ? fillerColor : preset.filler,
                                                    shadowColor: activePresetIndex === index ? fillerColor : preset.filler,
                                                    opacity: activePresetIndex === index ? 0.3 : 0.15,
                                                }
                                            ]}
                                        />

                                        {/* Progress Filler */}
                                        <View
                                            style={[
                                                styles.previewFiller,
                                                { backgroundColor: activePresetIndex === index ? fillerColor : preset.filler }
                                            ]}
                                        />

                                        {/* Glossy Overlay */}
                                        <LinearGradient
                                            colors={['rgba(255,255,255,0.08)', 'transparent', 'transparent']}
                                            style={StyleSheet.absoluteFill}
                                            pointerEvents="none"
                                        />

                                        {/* Left side - Slider and buttons */}
                                        <View style={styles.previewLeftSection}>
                                            <View style={styles.previewSliderTrack}>
                                                <View
                                                    style={[
                                                        styles.previewSliderHandle,
                                                        { backgroundColor: activePresetIndex === index ? sliderButtonColor : preset.slider }
                                                    ]}
                                                >
                                                    <MaterialIcons name="keyboard-double-arrow-down" size={14} color="#000" />
                                                </View>
                                                <Text
                                                    style={[
                                                        styles.previewSliderText,
                                                        { color: activePresetIndex === index ? sliderButtonColor : preset.slider }
                                                    ]}
                                                >
                                                    SLIDE
                                                </Text>
                                            </View>

                                            <View
                                                style={[
                                                    styles.previewPlayButton,
                                                    { backgroundColor: activePresetIndex === index ? sliderButtonColor : preset.slider }
                                                ]}
                                            >
                                                <MaterialIcons name="pause" size={22} color="#000" />
                                            </View>

                                            <View style={styles.previewCancelButton}>
                                                <MaterialIcons name="close" size={16} color="#fff" />
                                            </View>
                                        </View>

                                        {/* Right side - Timer display */}
                                        <View style={styles.previewTimerSection}>
                                            <View style={styles.previewLabelContainer}>
                                                <View style={[styles.labelPill, { backgroundColor: activePresetIndex === index ? fillerColor : preset.filler }]}>
                                                    <Text style={styles.previewTimerLabelAlt}>{preset.name.toUpperCase()}</Text>
                                                </View>
                                            </View>
                                            <View style={styles.previewTimerRow}>
                                                <Text
                                                    style={[
                                                        styles.previewTimerText,
                                                        { color: activePresetIndex === index ? timerTextColor : preset.text },
                                                        isLandscape && styles.previewTimerTextLandscape
                                                    ]}
                                                >
                                                    00:05:30
                                                </Text>
                                            </View>
                                        </View>
                                    </View>
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                </View>

                {/* Pagination Dots */}
                <View style={styles.pagination}>
                    {LANDSCAPE_PRESETS.map((_, i) => (
                        <View
                            key={i}
                            style={[
                                styles.dot,
                                activePresetIndex === i && {
                                    backgroundColor: LANDSCAPE_PRESETS[i].filler,
                                    width: 10,
                                    height: 10,
                                    opacity: 1
                                }
                            ]}
                        />
                    ))}
                </View>
            </Animated.View>
        );
    };

    // Render a color picker row (compact for landscape)
    const renderColorPickerRow = (
        title: string,
        icon: keyof typeof MaterialIcons.glyphMap,
        currentColor: string,
        onSelect: (color: string) => void
    ) => {
        return (
            <View style={[styles.colorPickerCard, isLandscape && styles.colorPickerCardLandscape]}>
                <View style={styles.colorPickerHeader}>
                    <View style={styles.colorPickerTitleRow}>
                        <MaterialIcons name={icon} size={18} color={currentColor} />
                        <Text style={[styles.colorPickerTitle, isLandscape && styles.colorPickerTitleLandscape]}>{title}</Text>
                    </View>
                    <View style={[styles.currentColorBadge, { backgroundColor: currentColor }]} />
                </View>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.colorScrollerContent}
                    decelerationRate="fast"
                >
                    {COLOR_PRESETS.map((preset) => (
                        <TouchableOpacity
                            key={preset.value}
                            style={[
                                styles.colorChip,
                                currentColor === preset.value && styles.colorChipSelected,
                                { borderColor: currentColor === preset.value ? preset.value : 'transparent' }
                            ]}
                            onPress={() => onSelect(preset.value)}
                            activeOpacity={0.7}
                        >
                            <View style={[styles.colorChipSwatch, { backgroundColor: preset.value }]}>
                                {currentColor === preset.value && (
                                    <MaterialIcons name="check" size={14} color={preset.value === '#FFFFFF' ? '#000' : '#fff'} />
                                )}
                            </View>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>
        );
    };

    // Portrait Layout
    const renderPortraitLayout = () => (
        <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
            {/* Landscape Preview Section */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>LANDSCAPE PREVIEW</Text>
                {renderLandscapePreview()}
            </View>

            {/* Color Pickers Section */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>CUSTOMIZE COLORS</Text>
                {renderColorPickerRow('Filler Color', 'gradient', fillerColor, handleFillerColorSelect)}
                {renderColorPickerRow('Slider & Button', 'touch-app', sliderButtonColor, handleSliderButtonColorSelect)}
                {renderColorPickerRow('Timer Text', 'text-fields', timerTextColor, handleTextColorSelect)}
            </View>

            {/* Reset to Defaults Section */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>DEFAULTS</Text>
                <TouchableOpacity style={styles.resetButton} onPress={handleResetToDefaults} activeOpacity={0.7}>
                    <MaterialIcons name="refresh" size={20} color="#00E5FF" />
                    <Text style={styles.resetButtonText}>Reset All to Defaults</Text>
                </TouchableOpacity>
            </View>

            {/* About Section */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>ABOUT</Text>
                <View style={styles.aboutCard}>
                    <Text style={styles.aboutText}>Timer App v1.0.0</Text>
                    <Text style={styles.aboutSubtext}>Built with React Native & Expo</Text>
                </View>
            </View>
        </ScrollView>
    );

    // Landscape Layout - Side by side
    const renderLandscapeLayout = () => (
        <View style={styles.landscapeContainer}>
            {/* Left Panel - Preview */}
            <View style={styles.leftPanelSettings}>
                <Text style={styles.sectionTitleLandscape}>LIVE PREVIEW</Text>
                {renderLandscapePreview()}

                {/* Reset & About below preview */}
                <View style={styles.bottomSection}>
                    <TouchableOpacity style={styles.resetButtonLandscape} onPress={handleResetToDefaults} activeOpacity={0.7}>
                        <MaterialIcons name="refresh" size={18} color="#00E5FF" />
                        <Text style={styles.resetButtonTextLandscape}>Reset Defaults</Text>
                    </TouchableOpacity>
                    <Text style={styles.versionText}>Timer App v1.0.0</Text>
                </View>
            </View>

            {/* Right Panel - Color Pickers */}
            <ScrollView style={styles.rightPanelSettings} contentContainerStyle={styles.rightPanelContent}>
                <Text style={styles.sectionTitleLandscape}>CUSTOMIZE COLORS</Text>
                {renderColorPickerRow('Filler Color', 'gradient', fillerColor, handleFillerColorSelect)}
                {renderColorPickerRow('Slider & Button', 'touch-app', sliderButtonColor, handleSliderButtonColorSelect)}
                {renderColorPickerRow('Timer Text', 'text-fields', timerTextColor, handleTextColorSelect)}
            </ScrollView>
        </View>
    );

    return (
        <LinearGradient
            colors={['#080C1A', '#0a2025', '#0d3a40']}
            locations={[0, 0.6, 1]}
            style={styles.container}
        >
            <SafeAreaView style={styles.safeArea}>
                {/* Header */}
                <View style={[styles.header, isLandscape && styles.headerLandscape]}>
                    <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
                        <MaterialIcons name="arrow-back-ios" size={20} color="rgba(255,255,255,0.7)" style={{ marginLeft: 6 }} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>SETTINGS</Text>
                    <View style={styles.headerSpacer} />
                </View>

                {isLandscape ? renderLandscapeLayout() : renderPortraitLayout()}
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

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 16,
        paddingHorizontal: 24,
        paddingBottom: 16,
    },

    headerLandscape: {
        paddingTop: 8,
        paddingBottom: 8,
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

    headerTitle: {
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 2,
        color: '#fff',
    },

    headerSpacer: {
        width: 44,
    },

    content: {
        flex: 1,
    },

    scrollContent: {
        padding: 24,
        paddingBottom: 40,
    },

    section: {
        marginBottom: 24,
    },

    sectionTitle: {
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 2,
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 12,
    },

    sectionTitleLandscape: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 2,
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 10,
    },

    // ========== Landscape Layout ==========
    landscapeContainer: {
        flex: 1,
        flexDirection: 'row',
        paddingHorizontal: 24,
        gap: 32,
    },

    leftPanelSettings: {
        width: '38%',
        justifyContent: 'space-between',
    },

    rightPanelSettings: {
        flex: 1,
        paddingLeft: 8,
    },

    rightPanelContent: {
        paddingBottom: 20,
    },

    bottomSection: {
        marginTop: 16,
        alignItems: 'center',
    },

    resetButtonLandscape: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 12,
        backgroundColor: 'rgba(0, 229, 255, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(0, 229, 255, 0.3)',
        marginBottom: 8,
    },

    resetButtonTextLandscape: {
        fontSize: 12,
        fontWeight: '600',
        color: '#00E5FF',
        marginLeft: 6,
    },

    versionText: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.3)',
    },

    // ========== Swipeable Preview Styles ==========
    phoneFrameContainer: {
        marginBottom: 20,
    },

    phoneFrameContainerLandscape: {
        flex: 1,
        marginBottom: 0,
    },

    phoneFrame: {
        backgroundColor: '#1A1A1A',
        borderRadius: 38,
        padding: 6,
        borderWidth: 1.5,
        borderColor: '#333',
        alignSelf: 'center',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOpacity: 0.6,
                shadowRadius: 15,
                shadowOffset: { width: 0, height: 10 },
            },
            android: { elevation: 12 }
        }),
    },

    phoneInternalFrame: {
        backgroundColor: '#000',
        borderRadius: 32,
        overflow: 'hidden',
        position: 'relative',
    },



    previewScroll: {
        flexGrow: 0,
    },

    previewCard: {
        overflow: 'hidden',
    },

    landscapePreview: {
        height: 160,
        flexDirection: 'row',
        position: 'relative',
        backgroundColor: '#000',
    },

    previewGlow: {
        position: 'absolute',
        top: -50,
        left: -50,
        width: 150,
        height: 150,
        borderRadius: 75,
        opacity: 0.15,
        shadowRadius: 100,
        shadowOpacity: 1,
        elevation: 10,
    },

    previewFiller: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: '35%',
    },

    previewLeftSection: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingLeft: 16,
        paddingBottom: 16,
        zIndex: 10,
    },

    previewSliderTrack: {
        width: 32,
        height: 120,
        backgroundColor: 'rgba(255,255,255,0.12)',
        borderRadius: 16,
        alignItems: 'center',
        paddingTop: 4,
        marginRight: 12,
    },

    previewSliderHandle: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOpacity: 0.5,
                shadowRadius: 2,
                shadowOffset: { width: 0, height: 1 },
            },
            android: { elevation: 3 }
        }),
    },

    previewSliderText: {
        fontSize: 7,
        fontWeight: '800',
        marginTop: 6,
        letterSpacing: 0.8,
    },

    previewPlayButton: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },

    previewCancelButton: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },

    previewTimerSection: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingRight: 16,
        paddingTop: 10,
    },

    previewLabelContainer: {
        position: 'absolute',
        top: 24,
        right: 16,
        zIndex: 20,
    },

    labelPill: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 10,
        opacity: 0.9,
    },

    previewTimerLabelAlt: {
        fontSize: 9,
        fontWeight: '900',
        color: '#000',
        letterSpacing: 1.2,
    },

    previewTimerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 15,
    },

    previewTimerText: {
        fontSize: 38,
        fontWeight: '800',
        letterSpacing: -1.8,
        fontVariant: ['tabular-nums'],
    },

    previewTimerTextLandscape: {
        fontSize: 34,
    },

    pagination: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 16,
    },

    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: 'rgba(255,255,255,0.25)',
        marginHorizontal: 5,
    },

    // ========== Color Picker Card Styles ==========
    colorPickerCard: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },

    colorPickerCardLandscape: {
        padding: 12,
        marginBottom: 10,
    },

    colorPickerHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },

    colorPickerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },

    colorPickerTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.9)',
        marginLeft: 10,
    },

    colorPickerTitleLandscape: {
        fontSize: 13,
        marginLeft: 8,
    },

    currentColorBadge: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.2)',
    },

    colorScrollerContent: {
        paddingRight: 16,
        paddingVertical: 4,
    },

    colorChip: {
        padding: 4,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: 'transparent',
        marginRight: 12,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOpacity: 0.2,
                shadowRadius: 3,
                shadowOffset: { width: 0, height: 2 },
            },
            android: { elevation: 2 }
        }),
    },

    colorChipSelected: {
        borderColor: 'rgba(255,255,255,0.5)',
    },

    colorChipSwatch: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOpacity: 0.3,
                shadowRadius: 3,
                shadowOffset: { width: 0, height: 2 },
            },
        }),
    },

    // ========== Reset Button Styles ==========
    resetButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        borderRadius: 16,
        backgroundColor: 'rgba(0, 229, 255, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(0, 229, 255, 0.3)',
    },

    resetButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#00E5FF',
        marginLeft: 8,
    },

    aboutCard: {
        padding: 20,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },

    aboutText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 4,
    },

    aboutSubtext: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.5)',
    },
});
