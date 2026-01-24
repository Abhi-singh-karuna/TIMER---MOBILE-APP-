import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { ScrollView, GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';

import ThemeSection, { LandscapePreviewComponent } from './ThemeSection';
import AudioSection from './AudioSection';
import CategorySection from './CategorySection';
import GeneralSection from './GeneralSection';
import InfoSection from './InfoSection';
import QuickMessageSection from './QuickMessageSection';
import TimeOfDayBackgroundScreen from './TimeOfDayBackgroundScreen';
import { styles } from './styles';
import {
    SettingsScreenProps,
    FILLER_COLOR_KEY,
    SLIDER_BUTTON_COLOR_KEY,
    TEXT_COLOR_KEY,
    PRESET_INDEX_KEY,
    DEFAULT_FILLER_COLOR,
    DEFAULT_SLIDER_BUTTON_COLOR,
    DEFAULT_TEXT_COLOR,
} from './types';

export default function SettingsScreen({
    onBack,
    fillerColor,
    sliderButtonColor,
    timerTextColor,
    onFillerColorChange,
    onSliderButtonColorChange,
    onTimerTextColorChange,
    activePresetIndex,
    onPresetChange,
    selectedSound,
    soundRepetition,
    onSoundChange,
    onRepetitionChange,
    categories,
    onCategoriesChange,
    isPastTimersDisabled,
    onPastTimersDisabledChange,
    isPastTasksDisabled,
    onPastTasksDisabledChange,
    quickMessages,
    onQuickMessagesChange,
    timeOfDayBackgroundConfig,
    onTimeOfDayBackgroundConfigChange,
}: SettingsScreenProps) {
    const { width, height } = useWindowDimensions();
    const isLandscape = width > height;

    const [activeTab, setActiveTab] = useState<'customization' | 'sound' | 'categories' | 'quickmsg' | 'general' | 'about'>('customization');
    const [resetKey, setResetKey] = useState(0);
    const [activeSubPage, setActiveSubPage] = useState<null | 'timeOfDayBackground'>(null);

    // Widen sidebar to 38% for a larger preview
    const sidebarWidth = width * 0.38;
    const previewWidth = isLandscape ? sidebarWidth - 34 : width - 48;

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
            setResetKey(prev => prev + 1);
        } catch (e) { console.error('Failed to reset defaults:', e); }
    };

    if (activeSubPage === 'timeOfDayBackground') {
        return (
            <TimeOfDayBackgroundScreen
                config={timeOfDayBackgroundConfig}
                onSave={onTimeOfDayBackgroundConfigChange}
                onBack={() => setActiveSubPage(null)}
            />
        );
    }

    const renderPortraitLayout = () => (
        <ScrollView
            style={styles.content}
            contentContainerStyle={styles.scrollContent}
            alwaysBounceVertical={true}
            showsVerticalScrollIndicator={false}
        >
            <ThemeSection
                isLandscape={false}
                fillerColor={fillerColor}
                sliderButtonColor={sliderButtonColor}
                timerTextColor={timerTextColor}
                activePresetIndex={activePresetIndex}
                previewWidth={previewWidth}
                onFillerColorChange={onFillerColorChange}
                onSliderButtonColorChange={onSliderButtonColorChange}
                onTimerTextColorChange={onTimerTextColorChange}
                onPresetChange={onPresetChange}
                onResetToDefaults={handleResetToDefaults}
                resetKey={resetKey}
            />
            <AudioSection
                isLandscape={false}
                selectedSound={selectedSound}
                soundRepetition={soundRepetition}
                onSoundChange={onSoundChange}
                onRepetitionChange={onRepetitionChange}
            />
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>CATEGORIES</Text>
                <CategorySection
                    isLandscape={false}
                    categories={categories}
                    onCategoriesChange={onCategoriesChange}
                />
            </View>
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>QUICK MESSAGES</Text>
                <QuickMessageSection
                    isLandscape={false}
                    quickMessages={quickMessages}
                    onQuickMessagesChange={onQuickMessagesChange}
                />
            </View>
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>GENERAL SETTINGS</Text>
                <GeneralSection
                    isLandscape={false}
                    isPastTimersDisabled={isPastTimersDisabled}
                    onPastTimersDisabledChange={onPastTimersDisabledChange}
                    isPastTasksDisabled={isPastTasksDisabled}
                    onPastTasksDisabledChange={onPastTasksDisabledChange}
                />
            </View>
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>TIMELINE</Text>
                <TouchableOpacity
                    style={styles.resetButton}
                    onPress={() => setActiveSubPage('timeOfDayBackground')}
                    activeOpacity={0.7}
                >
                    <MaterialIcons name="timeline" size={20} color="#FFFFFF" />
                    <Text style={styles.resetButtonText}>Time-of-Day Background</Text>
                </TouchableOpacity>
            </View>
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>DEFAULTS</Text>
                <TouchableOpacity style={styles.resetButton} onPress={handleResetToDefaults} activeOpacity={0.7}>
                    <MaterialIcons name="refresh" size={20} color="#FFFFFF" /><Text style={styles.resetButtonText}>Reset Theme to Defaults</Text>
                </TouchableOpacity>
            </View>
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>ABOUT</Text>
                <InfoSection isLandscape={false} />
            </View>
        </ScrollView>
    );

    // Landscape Layout - Side by side with Sidebar
    const renderLandscapeLayout = () => {
        const renderSidebarButton = (id: 'customization' | 'sound' | 'categories' | 'quickmsg' | 'general' | 'timeline' | 'about', icon: keyof typeof MaterialIcons.glyphMap, label: string) => {
            const isActive = activeTab === id;
            return (
                <TouchableOpacity
                    key={id}
                    style={[
                        styles.sidebarButtonRow,
                        isActive && styles.sidebarButtonRowActive
                    ]}
                    onPress={() => {
                        if (id === 'timeline') {
                            setActiveSubPage('timeOfDayBackground');
                            return;
                        }
                        setActiveTab(id as any);
                    }}
                    activeOpacity={0.7}
                >
                    <View style={styles.sidebarIconLabelContainer}>
                        <MaterialIcons
                            name={icon}
                            size={18}
                            color={isActive ? '#FFFFFF' : 'rgba(255,255,255,0.4)'}
                        />
                        <Text style={[
                            styles.sidebarButtonText,
                            isActive ? styles.sidebarButtonTextActive : styles.sidebarButtonTextInactive
                        ]}>
                            {label}
                        </Text>
                    </View>
                    {isActive ? (
                        <View style={styles.activeIndicatorSmall} />
                    ) : (
                        <MaterialIcons name="chevron-right" size={14} color="rgba(255,255,255,0.1)" />
                    )}
                </TouchableOpacity>
            );
        };

        return (
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.landscapeContainer}
            >
                {/* Left Panel - Permanent Preview + Sidebar Buttons */}
                <View style={[styles.leftSidebarCard, { width: '38%' }]}>
                    <Text style={styles.sidebarSectionTitle}>LIVE PREVIEW</Text>

                    <View style={styles.sidebarPreviewWrapper}>
                        <LandscapePreviewComponent
                            isLandscape={true}
                            fillerColor={fillerColor}
                            sliderButtonColor={sliderButtonColor}
                            timerTextColor={timerTextColor}
                            activePresetIndex={activePresetIndex}
                            previewWidth={previewWidth}
                            onPresetChange={onPresetChange}
                            resetKey={resetKey}
                        />
                    </View>

                    {/* Sidebar Navigation */}
                    <View style={styles.sidebarNavSection}>
                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={[styles.sidebarButtonsScroll, { flexGrow: 1 }]}
                            alwaysBounceVertical={true}
                        >
                            <View style={styles.sidebarButtonsList}>
                                {renderSidebarButton('customization', 'palette', 'Theme')}
                                {renderSidebarButton('sound', 'volume-up', 'Audio')}
                                {renderSidebarButton('categories', 'category', 'Category')}
                                {renderSidebarButton('quickmsg', 'chat', 'Quick Msg')}
                                {renderSidebarButton('general', 'settings', 'General')}
                                {renderSidebarButton('timeline', 'timeline', 'Timeline BG')}
                                {renderSidebarButton('about', 'info', 'Info')}
                            </View>
                        </ScrollView>
                    </View>

                    {/* Small Back Button */}
                    <TouchableOpacity
                        style={styles.smallBackButton}
                        onPress={onBack}
                        activeOpacity={0.7}
                    >
                        <MaterialIcons name="arrow-back" size={18} color="rgba(255,255,255,0.6)" />
                    </TouchableOpacity>
                </View>

                {/* Right Panel - Content Card */}
                <View style={styles.rightContentCard}>
                    <ScrollView
                        style={styles.rightContentScroll}
                        contentContainerStyle={[styles.rightContentScrollPadding, { flexGrow: 1 }]}
                        showsVerticalScrollIndicator={false}
                        alwaysBounceVertical={true}
                    >
                        {activeTab === 'customization' && (
                            <ThemeSection
                                isLandscape={true}
                                fillerColor={fillerColor}
                                sliderButtonColor={sliderButtonColor}
                                timerTextColor={timerTextColor}
                                activePresetIndex={activePresetIndex}
                                previewWidth={previewWidth}
                                onFillerColorChange={onFillerColorChange}
                                onSliderButtonColorChange={onSliderButtonColorChange}
                                onTimerTextColorChange={onTimerTextColorChange}
                                onPresetChange={onPresetChange}
                                onResetToDefaults={handleResetToDefaults}
                                resetKey={resetKey}
                            />
                        )}

                        {activeTab === 'sound' && (
                            <AudioSection
                                isLandscape={true}
                                selectedSound={selectedSound}
                                soundRepetition={soundRepetition}
                                onSoundChange={onSoundChange}
                                onRepetitionChange={onRepetitionChange}
                            />
                        )}

                        {activeTab === 'categories' && (
                            <CategorySection
                                isLandscape={true}
                                categories={categories}
                                onCategoriesChange={onCategoriesChange}
                            />
                        )}

                        {activeTab === 'quickmsg' && (
                            <QuickMessageSection
                                isLandscape={true}
                                quickMessages={quickMessages}
                                onQuickMessagesChange={onQuickMessagesChange}
                            />
                        )}

                        {activeTab === 'general' && (
                            <GeneralSection
                                isLandscape={true}
                                isPastTimersDisabled={isPastTimersDisabled}
                                onPastTimersDisabledChange={onPastTimersDisabledChange}
                                isPastTasksDisabled={isPastTasksDisabled}
                                onPastTasksDisabledChange={onPastTasksDisabledChange}
                            />
                        )}

                        {activeTab === 'about' && (
                            <InfoSection isLandscape={true} />
                        )}
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
        );
    };

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <LinearGradient
                colors={['#000000', '#000000']}
                locations={[0, 1]}
                style={styles.container}
            >
                <SafeAreaView
                    style={styles.safeArea}
                    edges={isLandscape ? ['left', 'right'] : ['top', 'left', 'right', 'bottom']}
                >
                    {/* Header - Only visible in portrait */}
                    {!isLandscape && (
                        <View style={styles.header}>
                            <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
                                <MaterialIcons name="arrow-back-ios" size={20} color="rgba(255,255,255,0.7)" style={{ marginLeft: 6 }} />
                            </TouchableOpacity>
                            <Text style={styles.headerTitle}>SETTINGS</Text>
                            <View style={styles.headerSpacer} />
                        </View>
                    )}

                    {isLandscape ? renderLandscapeLayout() : renderPortraitLayout()}
                </SafeAreaView>
            </LinearGradient>
        </GestureHandlerRootView>
    );
}
