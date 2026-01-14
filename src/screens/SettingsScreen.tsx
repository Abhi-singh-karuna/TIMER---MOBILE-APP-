import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    useWindowDimensions,
    Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FILLER_COLOR_KEY = '@timer_filler_color';
const SLIDER_BUTTON_COLOR_KEY = '@timer_slider_button_color';
const TEXT_COLOR_KEY = '@timer_text_color';

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

export default function SettingsScreen({
    onBack,
    fillerColor,
    sliderButtonColor,
    timerTextColor,
    onFillerColorChange,
    onSliderButtonColorChange,
    onTimerTextColorChange
}: SettingsScreenProps) {
    const { width, height } = useWindowDimensions();
    const isLandscape = width > height;

    const handleFillerColorSelect = async (color: string) => {
        try {
            await AsyncStorage.setItem(FILLER_COLOR_KEY, color);
            onFillerColorChange(color);
        } catch (e) {
            console.error('Failed to save filler color:', e);
        }
    };

    const handleSliderButtonColorSelect = async (color: string) => {
        try {
            await AsyncStorage.setItem(SLIDER_BUTTON_COLOR_KEY, color);
            onSliderButtonColorChange(color);
        } catch (e) {
            console.error('Failed to save slider/button color:', e);
        }
    };

    const handleTextColorSelect = async (color: string) => {
        try {
            await AsyncStorage.setItem(TEXT_COLOR_KEY, color);
            onTimerTextColorChange(color);
        } catch (e) {
            console.error('Failed to save text color:', e);
        }
    };

    const handleResetToDefaults = async () => {
        try {
            await Promise.all([
                AsyncStorage.setItem(FILLER_COLOR_KEY, DEFAULT_FILLER_COLOR),
                AsyncStorage.setItem(SLIDER_BUTTON_COLOR_KEY, DEFAULT_SLIDER_BUTTON_COLOR),
                AsyncStorage.setItem(TEXT_COLOR_KEY, DEFAULT_TEXT_COLOR),
            ]);
            onFillerColorChange(DEFAULT_FILLER_COLOR);
            onSliderButtonColorChange(DEFAULT_SLIDER_BUTTON_COLOR);
            onTimerTextColorChange(DEFAULT_TEXT_COLOR);
        } catch (e) {
            console.error('Failed to reset colors:', e);
        }
    };

    // Render the landscape preview component
    const renderLandscapePreview = () => {
        return (
            <View style={[styles.previewCard, isLandscape && styles.previewCardLandscape]}>
                <View style={[styles.landscapePreview, isLandscape && styles.landscapePreviewLandscape]}>
                    {/* Progress Filler */}
                    <View style={[styles.previewFiller, { backgroundColor: fillerColor }]} />

                    {/* Left side - Slider and buttons */}
                    <View style={styles.previewLeftSection}>
                        {/* Mini Slider Track */}
                        <View style={styles.previewSliderTrack}>
                            <View style={[styles.previewSliderHandle, { backgroundColor: sliderButtonColor }]}>
                                <MaterialIcons name="keyboard-double-arrow-down" size={12} color="#000" />
                            </View>
                            <Text style={[styles.previewSliderText, { color: sliderButtonColor }]}>SLIDE</Text>
                        </View>

                        {/* Mini Play Button */}
                        <View style={[styles.previewPlayButton, { backgroundColor: sliderButtonColor }]}>
                            <MaterialIcons name="pause" size={20} color="#000" />
                        </View>

                        {/* Mini Cancel Button */}
                        <View style={styles.previewCancelButton}>
                            <MaterialIcons name="close" size={14} color="#fff" />
                        </View>
                    </View>

                    {/* Right side - Timer display */}
                    <View style={styles.previewTimerSection}>
                        <Text style={styles.previewTimerLabel}>TIMER (Preview)</Text>
                        <Text style={[styles.previewTimerText, { color: timerTextColor }, isLandscape && styles.previewTimerTextLandscape]}>00:05:30</Text>
                    </View>
                </View>
            </View>
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
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.colorRow}>
                        {COLOR_PRESETS.map((preset) => (
                            <TouchableOpacity
                                key={preset.value}
                                style={[
                                    styles.colorChip,
                                    currentColor === preset.value && styles.colorChipSelected,
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
                    </View>
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
        paddingHorizontal: 16,
        gap: 16,
    },

    leftPanelSettings: {
        width: '40%',
        justifyContent: 'space-between',
    },

    rightPanelSettings: {
        flex: 1,
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

    // ========== Landscape Preview Styles ==========
    previewCard: {
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },

    previewCardLandscape: {
        flex: 1,
        maxHeight: 160,
    },

    landscapePreview: {
        backgroundColor: '#000',
        height: 120,
        flexDirection: 'row',
        position: 'relative',
    },

    landscapePreviewLandscape: {
        flex: 1,
        height: 'auto',
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
        paddingLeft: 12,
        paddingBottom: 10,
        zIndex: 1,
    },

    previewSliderTrack: {
        width: 24,
        height: 80,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 12,
        alignItems: 'center',
        paddingTop: 4,
        marginRight: 8,
    },

    previewSliderHandle: {
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },

    previewSliderText: {
        fontSize: 6,
        fontWeight: '700',
        marginTop: 2,
        letterSpacing: 0.5,
    },

    previewPlayButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 6,
    },

    previewCancelButton: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },

    previewTimerSection: {
        flex: 1,
        justifyContent: 'flex-end',
        alignItems: 'flex-end',
        paddingRight: 14,
        paddingBottom: 10,
    },

    previewTimerLabel: {
        fontSize: 9,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 1,
        marginBottom: 2,
    },

    previewTimerText: {
        fontSize: 32,
        fontWeight: '700',
        letterSpacing: -1,
    },

    previewTimerTextLandscape: {
        fontSize: 28,
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

    colorRow: {
        flexDirection: 'row',
    },

    colorChip: {
        padding: 3,
        borderRadius: 16,
        borderWidth: 2,
        borderColor: 'transparent',
        marginRight: 8,
    },

    colorChipSelected: {
        borderColor: 'rgba(255,255,255,0.5)',
    },

    colorChipSwatch: {
        width: 28,
        height: 28,
        borderRadius: 14,
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
