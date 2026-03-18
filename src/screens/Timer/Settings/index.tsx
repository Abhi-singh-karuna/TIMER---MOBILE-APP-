import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    KeyboardAvoidingView,
    Platform,
    Modal,
    TextInput,
    TouchableWithoutFeedback,
    Keyboard,
    Image,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { ScrollView, GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons, AntDesign } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import ThemeSection, { LandscapePreviewComponent } from './ThemeSection';
import LeaveSection from './LeaveSection';
import AudioSection from './AudioSection';
import CategorySection from './CategorySection';
import GeneralSection from './GeneralSection';
import InfoSection from './InfoSection';
import QuickMessageSection from './QuickMessageSection';
import DataManagementSection from './DataManagementSection';
import AccountSection from './AccountSection';
import { getCurrentUser, signInWithGoogle, configureGoogleSignIn } from '../../../services/GoogleDriveService';
import type { User } from '@react-native-google-signin/google-signin';
import Constants, { AppOwnership } from 'expo-constants';
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
    TIMERS_STORAGE_KEY,
    TASKS_STORAGE_KEY,
} from './types';

const CONFIRM_PHRASE = 'clear all';

/** Modal content uses its own useWindowDimensions so orientation is correct when popup is open (e.g. in landscape). */
function ConfirmClearModalContent({
    clearConfirmType,
    confirmInput,
    confirmError,
    onInputChange,
    onConfirmClear,
    onClose,
}: {
    clearConfirmType: 'time' | 'task' | 'alldata';
    confirmInput: string;
    confirmError: boolean;
    onInputChange: (text: string) => void;
    onConfirmClear: () => void;
    onClose: () => void;
}) {
    const { width, height } = useWindowDimensions();
    const isLandscape = width > height;

    return (
        <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={[styles.restoreOverlay, { width, height }]}
            >
                <View style={[styles.restoreDimLayer, { width, height }]} pointerEvents="none" />
                <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                    <View style={[
                        styles.restoreModal,
                        isLandscape && styles.restoreModalLandscape
                    ]}>
                        <View style={{
                            width: 42,
                            height: 42,
                            borderRadius: 21,
                            backgroundColor: 'rgba(255, 60, 60, 0.15)',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginBottom: 16
                        }}>
                            <MaterialIcons name="report-problem" size={24} color="#FF5050" />
                        </View>

                        <Text style={styles.restoreTitle}>
                            {clearConfirmType === 'alldata' ? 'Wipe All Data?' : clearConfirmType === 'time' ? 'Clear Timers?' : 'Clear Tasks?'}
                        </Text>

                        <Text style={styles.restoreSubtitle}>
                            {clearConfirmType === 'alldata'
                                ? 'This will permanently remove everything. Type "clear all" to confirm.'
                                : 'This action cannot be undone. Type "clear all" to confirm.'}
                        </Text>

                        <TextInput
                            style={[
                                styles.restoreInput,
                                confirmError && styles.restoreInputError
                            ]}
                            placeholder="clear all"
                            placeholderTextColor="rgba(255,255,255,0.15)"
                            value={confirmInput}
                            onChangeText={onInputChange}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />

                        {confirmError && (
                            <Text style={{ color: '#FF5050', marginBottom: 16, fontSize: 11, fontWeight: '700' }}>
                                ERR: TYPE "CLEAR ALL"
                            </Text>
                        )}

                        <View style={[
                            styles.restoreButtonRow,
                            isLandscape && styles.restoreButtonRowLandscape
                        ]}>
                            <TouchableOpacity
                                style={styles.restoreSecondaryBtn}
                                onPress={onClose}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.restoreSecondaryBtnText}>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.restorePrimaryBtn}
                                onPress={onConfirmClear}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.restorePrimaryBtnText}>Confirm</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
    );
}

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
    dailyStartMinutes,
    onDailyStartMinutesChange,
    quickMessages,
    onQuickMessagesChange,
    timeOfDayBackgroundConfig,
    onTimeOfDayBackgroundConfigChange,
    onAfterClearTimers,
    onAfterClearTasks,
}: SettingsScreenProps) {
    const { width, height } = useWindowDimensions();
    const isLandscape = width > height;

    const [activeTab, setActiveTab] = useState<'customization' | 'sound' | 'categories' | 'quickmsg' | 'general' | 'datamgmt' | 'account' | 'about' | 'leave' | null>(isLandscape ? 'account' : null);
    const [resetKey, setResetKey] = useState(0);
    const [isHidePreview, setIsHidePreview] = useState(false);
    const [activeSubPage, setActiveSubPage] = useState<null | 'timeOfDayBackground'>(null);

    const wasAutoSelected = useRef(isLandscape);

    // Auto-select a section when rotating to landscape if no section is active
    useEffect(() => {
        if (isLandscape && !activeTab) {
            setActiveTab('account');
            wasAutoSelected.current = true;
        } else if (!isLandscape && activeTab === 'account' && wasAutoSelected.current) {
            setActiveTab(null);
            wasAutoSelected.current = false;
        }
    }, [isLandscape, activeTab]);

    // Clear confirm popup (type "Clear all" to confirm)
    const [clearConfirmType, setClearConfirmType] = useState<'time' | 'task' | 'alldata' | null>(null);
    const [confirmInput, setConfirmInput] = useState('');
    const [confirmError, setConfirmError] = useState(false);

    const [user, setUser] = useState<User | null>(null);
    const [isLoginLoading, setIsLoginLoading] = useState(false);

    useEffect(() => {
        configureGoogleSignIn();
        const fetchUser = async () => {
            const userInfo = await getCurrentUser();
            if (userInfo) setUser(userInfo);
        };
        fetchUser();
    }, []);

    const handleHeaderLogin = async () => {
        if (Constants.appOwnership === AppOwnership.Expo) {
            Alert.alert('Not Supported', 'Cloud Sync requires a native builds.');
            return;
        }
        setIsLoginLoading(true);
        try {
            const userInfo = await signInWithGoogle();
            if (userInfo) {
                setUser(userInfo);
            }
        } catch (error: any) {
            Alert.alert('Sign In Error', error.message);
        } finally {
            setIsLoginLoading(false);
        }
    };

    // Adjusted sidebar width to 40% for better symmetry
    const sidebarWidth = width * 0.40;
    const previewWidth = isLandscape ? sidebarWidth * 0.9 : width * 0.94;

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

    const openClearConfirm = (type: 'time' | 'task' | 'alldata') => {
        setClearConfirmType(type);
        setConfirmInput('');
        setConfirmError(false);
    };

    const closeClearConfirm = () => {
        setClearConfirmType(null);
        setConfirmInput('');
        setConfirmError(false);
    };

    const handleConfirmClear = async () => {
        if (confirmInput.trim().toLowerCase() !== CONFIRM_PHRASE) {
            setConfirmError(true);
            return;
        }
        if (!clearConfirmType) return;
        try {
            if (clearConfirmType === 'alldata') {
                await AsyncStorage.clear();
                onAfterClearTimers?.();
                onAfterClearTasks?.();
            } else if (clearConfirmType === 'time') {
                await AsyncStorage.removeItem(TIMERS_STORAGE_KEY);
                onAfterClearTimers?.();
            } else {
                await AsyncStorage.removeItem(TASKS_STORAGE_KEY);
                onAfterClearTasks?.();
            }
            closeClearConfirm();
        } catch (e) {
            console.error('Failed to clear:', e);
            setConfirmError(true);
        }
    };

    if (activeSubPage === 'timeOfDayBackground') {
        return (
            <TimeOfDayBackgroundScreen
                config={timeOfDayBackgroundConfig}
                dailyStartMinutes={dailyStartMinutes}
                onSave={onTimeOfDayBackgroundConfigChange}
                onBack={() => setActiveSubPage(null)}
            />
        );
    }


    const renderPortraitMenuCard = (id: 'customization' | 'sound' | 'categories' | 'quickmsg' | 'general' | 'datamgmt' | 'account' | 'about' | 'leave' | 'timeline', icon: keyof typeof MaterialIcons.glyphMap, title: string, desc: string) => (
        <View style={styles.portraitMenuCardBezel}>
            <TouchableOpacity
                style={[styles.portraitMenuCardTrack, { flexDirection: 'row', alignItems: 'center', padding: 18 }]}
                onPress={() => {
                    if (id === 'timeline') {
                        setActiveSubPage('timeOfDayBackground');
                    } else {
                        setActiveTab(id);
                    }
                }}
                activeOpacity={0.8}
            >
                <View style={styles.portraitMenuIconWrap}>
                    <MaterialIcons name={icon} size={20} color="#FFFFFF" />
                </View>
                <View style={styles.portraitMenuTextWrap}>
                    <Text style={styles.portraitMenuTitle}>{title}</Text>
                    <Text style={styles.portraitMenuDesc} numberOfLines={1}>{desc}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color="rgba(255,255,255,0.1)" />
            </TouchableOpacity>
        </View>
    );


    const renderProfileHeader = () => {
        const photo = user?.user?.photo;
        const name = user?.user?.name || (user ? 'Authenticated User' : 'Guest User');
        const email = user?.user?.email || 'Login to sync your data';
        const initials = user?.user?.givenName?.[0] || user?.user?.email?.[0] || 'G';

        return (
            <View style={styles.premiumAccountContainer}>
                <View style={[styles.avatarGlowWrapper, { marginBottom: 18 }]}>
                    <View style={[styles.premiumAvatarGlow, { backgroundColor: user ? 'rgba(90, 80, 255, 0.2)' : 'rgba(255, 255, 255, 0.05)' }]} />
                    {photo ? (
                        <Image source={{ uri: photo }} style={styles.premiumAvatar} />
                    ) : (
                        <View style={[styles.premiumAvatar, { backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: 0 }]}>
                            <Text style={[styles.portraitProfileAvatarText, { fontSize: 36, opacity: 0.9 }]}>
                                {initials}
                            </Text>
                        </View>
                    )}
                </View>

                <Text style={styles.premiumTitle}>{name}</Text>
                <Text style={[styles.premiumSubtitle, { marginBottom: user ? 14 : 28 }]}>{email}</Text>

                {user ? (
                    <View style={styles.proMemberPill}>
                        <MaterialIcons name="verified" size={14} color="#7A9AFF" />
                        <Text style={styles.proMemberText}>PRO MEMBER</Text>
                    </View>
                ) : (
                    <TouchableOpacity 
                        style={[styles.premiumLoginButton, { width: '85%', alignSelf: 'center' }]} 
                        onPress={handleHeaderLogin}
                        activeOpacity={0.8}
                    >
                        <View style={styles.premiumGoogleIconWrap}>
                            <AntDesign name="google" size={20} color="#EA4335" />
                        </View>
                        <Text style={styles.premiumLoginButtonText}>Login with Google</Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    const renderPortraitLayout = () => {
        if (!activeTab) {
            return (
                <ScrollView
                    style={styles.content}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {renderProfileHeader()}

                    <View style={styles.portraitMenuSection}>
                        <Text style={styles.portraitSectionLabel}>APPEARANCE</Text>
                        {renderPortraitMenuCard('customization', 'palette', 'Theme', 'Colors, presets and visual style')}
                        {renderPortraitMenuCard('timeline', 'timeline', 'Timeline BG', 'Customize time-of-day slots')}
                    </View>

                    <View style={styles.portraitMenuSection}>
                        <Text style={styles.portraitSectionLabel}>PREFERENCES</Text>
                        {renderPortraitMenuCard('sound', 'volume-up', 'Audio', 'Completion sounds and repetitions')}
                        {renderPortraitMenuCard('categories', 'category', 'Category', 'Manage task and timer categories')}
                        {renderPortraitMenuCard('quickmsg', 'chat', 'Quick Messages', 'Manage reusable task messages')}
                    </View>

                    <View style={styles.portraitMenuSection}>
                        <Text style={styles.portraitSectionLabel}>SYSTEM</Text>
                        {renderPortraitMenuCard('general', 'settings', 'General', 'App behavior and restrictions')}
                        {renderPortraitMenuCard('account', 'account-circle', 'Account', 'Profile and synchronization')}
                        {renderPortraitMenuCard('datamgmt', 'storage', 'Data Mgmt', 'Cloud sync, cleanup and export')}
                        {renderPortraitMenuCard('about', 'info', 'About', 'App version and information')}
                    </View>

                    <View style={{ height: 40 }} />
                </ScrollView>
            );
        }

        // Separate render for full-page screens in portrait
        if (activeTab === 'account') {
            return (
                <AccountSection
                    isLandscape={false}
                    onBack={() => setActiveTab(null)}
                />
            );
        }

        return (
            <ScrollView
                style={styles.content}
                contentContainerStyle={styles.scrollContent}
                alwaysBounceVertical={true}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.settingsCardBezel}>
                    <View style={styles.settingsCardTrackUnifiedLarge}>
                        {activeTab === 'customization' && (
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
                        )}

                        {activeTab === 'sound' && (
                            <AudioSection
                                isLandscape={false}
                                selectedSound={selectedSound}
                                soundRepetition={soundRepetition}
                                onSoundChange={onSoundChange}
                                onRepetitionChange={onRepetitionChange}
                            />
                        )}

                        {activeTab === 'categories' && (
                            <CategorySection
                                isLandscape={false}
                                categories={categories}
                                onCategoriesChange={onCategoriesChange}
                            />
                        )}

                        {activeTab === 'leave' && <LeaveSection isLandscape={false} />}

                        {activeTab === 'quickmsg' && (
                            <QuickMessageSection
                                isLandscape={false}
                                quickMessages={quickMessages}
                                onQuickMessagesChange={onQuickMessagesChange}
                            />
                        )}

                        {activeTab === 'general' && (
                            <GeneralSection
                                isLandscape={false}
                                isPastTimersDisabled={isPastTimersDisabled}
                                onPastTimersDisabledChange={onPastTimersDisabledChange}
                                isPastTasksDisabled={isPastTasksDisabled}
                                onPastTasksDisabledChange={onPastTasksDisabledChange}
                                dailyStartMinutes={dailyStartMinutes}
                                onDailyStartMinutesChange={onDailyStartMinutesChange}
                            />
                        )}

                        {activeTab === 'datamgmt' && (
                            <DataManagementSection
                                isLandscape={false}
                                onClearTime={() => openClearConfirm('time')}
                                onClearTask={() => openClearConfirm('task')}
                                onClearAllData={() => openClearConfirm('alldata')}
                            />
                        )}

                        {activeTab === 'about' && <InfoSection isLandscape={false} />}
                    </View>
                    <View style={styles.settingsCardOuterGlow} pointerEvents="none" />
                </View>
                <View style={{ height: 40 }} />
            </ScrollView>
        );
    };

    const renderLandscapeLayout = () => {
        const renderSidebarButton = (id: 'customization' | 'sound' | 'categories' | 'quickmsg' | 'general' | 'timeline' | 'datamgmt' | 'account' | 'about' | 'leave', icon: keyof typeof MaterialIcons.glyphMap, label: string) => {
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
                        if (id === 'datamgmt') {
                            setActiveTab('datamgmt');
                            return;
                        }
                        // The 'leave' tab is handled directly by setActiveTab
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
                <View style={[styles.leftSidebarCard, { width: '40%' }]}>
                    {isHidePreview ? (
                        <TouchableOpacity
                            style={styles.showPreviewButton}
                            onPress={() => setIsHidePreview(false)}
                            activeOpacity={0.7}
                        >
                            <MaterialIcons
                                name="visibility"
                                size={12}
                                color="rgba(255,255,255,0.6)"
                                style={{ marginRight: 6 }}
                            />
                            <Text style={styles.showPreviewText}>
                                SHOW PREVIEW
                            </Text>
                        </TouchableOpacity>
                    ) : (
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
                                isMinimized={false}
                                onToggleMinimize={() => setIsHidePreview(true)}
                            />
                        </View>
                    )}

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
                                {renderSidebarButton('leave', 'event-busy', 'Leave Mgmt')}
                                {renderSidebarButton('quickmsg', 'chat', 'Quick Msg')}
                                {renderSidebarButton('general', 'settings', 'General')}
                                {renderSidebarButton('timeline', 'timeline', 'Timeline BG')}
                                {renderSidebarButton('account', 'account-circle', 'Account')}
                                {renderSidebarButton('datamgmt', 'storage', 'Data Mgmt')}
                                {renderSidebarButton('about', 'info', 'About')}
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

                    {/* Bezel rim overlays */}
                    <View style={styles.settingsCardInteriorShadow} pointerEvents="none" />
                    <View style={styles.settingsCardTopRim} pointerEvents="none" />
                    <View style={styles.settingsCardOuterGlow} pointerEvents="none" />
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

                        {activeTab === 'leave' && (
                            <LeaveSection isLandscape={true} />
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
                                dailyStartMinutes={dailyStartMinutes}
                                onDailyStartMinutesChange={onDailyStartMinutesChange}
                            />
                        )}

                        {activeTab === 'datamgmt' && (
                            <DataManagementSection
                                isLandscape={true}
                                onClearTime={() => openClearConfirm('time')}
                                onClearTask={() => openClearConfirm('task')}
                                onClearAllData={() => openClearConfirm('alldata')}
                            />
                        )}

                        {activeTab === 'account' && (
                            <AccountSection
                                isLandscape={true}
                            />
                        )}

                        {activeTab === 'about' && (
                            <InfoSection isLandscape={true} />
                        )}
                    </ScrollView>

                    {/* Bezel rim overlays */}
                    <View style={styles.settingsCardInteriorShadow} pointerEvents="none" />
                    <View style={styles.settingsCardTopRim} pointerEvents="none" />
                    <View style={styles.settingsCardOuterGlow} pointerEvents="none" />
                </View>
            </KeyboardAvoidingView>
        );
    };

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <LinearGradient
                colors={['#0A0A12', '#050508', '#000000']}
                locations={[0, 0.4, 1]}
                style={[styles.container, { backgroundColor: '#000000' }]}
            >
                <SafeAreaView
                    style={styles.safeArea}
                    edges={['left', 'right']}
                >
                    {/* Header - Only visible in portrait, Hidden if account page is active */}
                    {!isLandscape && activeTab !== 'account' && (
                        <View style={[styles.header, styles.headerGlass, { borderBottomWidth: 0, paddingBottom: 0 }]}>
                            <TouchableOpacity
                                style={styles.backButton}
                                onPress={() => activeTab ? setActiveTab(null) : onBack()}
                                activeOpacity={0.7}
                            >
                                <MaterialIcons
                                    name="chevron-left"
                                    size={30}
                                    color="rgba(255,255,255,0.8)"
                                />
                            </TouchableOpacity>
                            <View style={styles.headerSpacer} />
                        </View>
                    )}

                    {isLandscape ? renderLandscapeLayout() : renderPortraitLayout()}

                    {/* Confirm clear popup: type "Clear all" to confirm. supportedOrientations so popup opens in landscape too. */}
                    <Modal
                        visible={clearConfirmType !== null}
                        transparent
                        animationType="fade"
                        onRequestClose={closeClearConfirm}
                        supportedOrientations={['portrait', 'landscape']}
                        statusBarTranslucent={Platform.OS === 'android'}
                        presentationStyle="overFullScreen"
                    >
                        {clearConfirmType !== null && (
                            <ConfirmClearModalContent
                                clearConfirmType={clearConfirmType}
                                confirmInput={confirmInput}
                                confirmError={confirmError}
                                onInputChange={(text) => {
                                    setConfirmInput(text);
                                    if (text.trim()) setConfirmError(false);
                                }}
                                onConfirmClear={handleConfirmClear}
                                onClose={closeClearConfirm}
                            />
                        )}
                    </Modal>
                </SafeAreaView>
            </LinearGradient>
        </GestureHandlerRootView>
    );
}
