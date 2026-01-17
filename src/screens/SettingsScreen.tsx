import React, { useRef, useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    useWindowDimensions,
    Platform,
    Animated,
    ActivityIndicator,
    TextInput,
    Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { Category, DEFAULT_CATEGORIES, CATEGORIES_KEY, SOUND_OPTIONS, LANDSCAPE_PRESETS, COLOR_PRESETS } from '../constants/data';

const FILLER_COLOR_KEY = '@timer_filler_color';
const SLIDER_BUTTON_COLOR_KEY = '@timer_slider_button_color';
const TEXT_COLOR_KEY = '@timer_text_color';
const PRESET_INDEX_KEY = '@timer_active_preset_index';
const COMPLETION_SOUND_KEY = '@timer_completion_sound';
const SOUND_REPETITION_KEY = '@timer_sound_repetition';
const ENABLE_FUTURE_TIMERS_KEY = '@timer_enable_future';
const ENABLE_PAST_TIMERS_KEY = '@timer_enable_past';

// Default colors
const DEFAULT_FILLER_COLOR = '#FFFFFF';
const DEFAULT_SLIDER_BUTTON_COLOR = '#FFFFFF';
const DEFAULT_TEXT_COLOR = '#FFFFFF';

const CATEGORY_ICONS: (keyof typeof MaterialIcons.glyphMap)[] = [
    'category', 'work', 'fitness-center', 'menu-book', 'fastfood', 'local-hospital',
    'home', 'laptop', 'shopping-cart', 'brush', 'code', 'sports-esports'
];

const REPETITION_OPTIONS = [1, 2, 3, 4, 5];

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
    selectedSound: number;
    soundRepetition: number;
    onSoundChange: (index: number) => void;
    onRepetitionChange: (count: number) => void;
    categories: Category[];
    onCategoriesChange: (categories: Category[]) => void;
    enablePastTimers: boolean;
    onPastTimersChange: (val: boolean) => void;
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
    enablePastTimers,
    onPastTimersChange,
}: SettingsScreenProps) {
    const { width, height } = useWindowDimensions();
    const isLandscape = width > height;

    const [activeTab, setActiveTab] = useState<'customization' | 'sound' | 'categories' | 'general' | 'about'>('customization');
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [selectedCategoryColor, setSelectedCategoryColor] = useState('#FFFFFF');
    const [selectedCategoryIcon, setSelectedCategoryIcon] = useState<keyof typeof MaterialIcons.glyphMap>('category');

    // Widen sidebar to 38% for a larger preview
    const sidebarWidth = width * 0.38;
    const previewWidth = isLandscape ? sidebarWidth - 34 : width - 48;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const scrollRef = useRef<ScrollView>(null);
    const [playingSound, setPlayingSound] = useState<number | null>(null);
    const soundRef = useRef<Audio.Sound | null>(null);

    // Initial scroll to active preset
    useEffect(() => {
        if (scrollRef.current) {
            setTimeout(() => {
                scrollRef.current?.scrollTo({
                    x: activePresetIndex * previewWidth,
                    animated: false
                });
            }, 100);
        }
    }, []);

    // Cleanup sound on unmount
    useEffect(() => {
        return () => {
            if (soundRef.current) {
                soundRef.current.unloadAsync();
            }
        };
    }, []);

    const triggerPulse = () => {
        pulseAnim.setValue(1);
        Animated.sequence([
            Animated.timing(pulseAnim, { toValue: 1.05, duration: 100, useNativeDriver: true }),
            Animated.timing(pulseAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
        ]).start();
    };

    const handleScroll = (event: any) => {
        const slideSize = event.nativeEvent.layoutMeasurement.width;
        const currentOffset = event.nativeEvent.contentOffset.x;
        const index = Math.round(currentOffset / slideSize);
        if (index !== activePresetIndex && index >= 0 && index < LANDSCAPE_PRESETS.length) {
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

    const handleSoundSelect = async (soundIndex: number) => {
        onSoundChange(soundIndex);
        triggerPulse();
        try {
            await AsyncStorage.setItem(COMPLETION_SOUND_KEY, soundIndex.toString());
        } catch (err) { console.error(err); }
    };

    const handleRepetitionSelect = async (count: number) => {
        onRepetitionChange(count);
        triggerPulse();
        try {
            await AsyncStorage.setItem(SOUND_REPETITION_KEY, count.toString());
        } catch (err) { console.error(err); }
    };

    const handlePreviewSound = async (soundIndex: number) => {
        const soundOption = SOUND_OPTIONS[soundIndex];
        if (!soundOption || !soundOption.uri) return;
        try {
            if (soundRef.current) {
                await soundRef.current.stopAsync();
                await soundRef.current.unloadAsync();
                soundRef.current = null;
            }
            setPlayingSound(soundIndex);
            await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false });
            const { sound } = await Audio.Sound.createAsync({ uri: soundOption.uri }, { shouldPlay: true });
            soundRef.current = sound;
            sound.setOnPlaybackStatusUpdate((status: any) => {
                if (status.isLoaded && status.didJustFinish) {
                    setPlayingSound(null);
                    sound.unloadAsync();
                    if (soundRef.current === sound) soundRef.current = null;
                }
            });
        } catch (error) {
            console.error('Failed to play sound:', error);
            setPlayingSound(null);
        }
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

            if (scrollRef.current) {
                scrollRef.current.scrollTo({ x: 0, animated: true });
            }
        } catch (e) { console.error('Failed to reset defaults:', e); }
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

    const renderSoundSection = () => (
        <View style={[styles.soundSection, isLandscape && styles.soundSectionLandscape]}>
            <View style={styles.soundOptionsRow}>
                {SOUND_OPTIONS.map((sound) => (
                    <TouchableOpacity key={sound.id} style={[styles.soundCard, isLandscape && styles.soundCardLandscape, selectedSound === sound.id && styles.soundCardSelected, selectedSound === sound.id && { borderColor: sound.color }, sound.uri === null && { opacity: 0.8 }]} onPress={() => handleSoundSelect(sound.id)} activeOpacity={0.7}>
                        <View style={[styles.soundIconContainer, selectedSound === sound.id && { backgroundColor: `${sound.color}20` }]}>
                            <MaterialIcons name={sound.icon} size={24} color={selectedSound === sound.id ? sound.color : 'rgba(255,255,255,0.5)'} />
                        </View>
                        <Text style={[styles.soundName, selectedSound === sound.id && { color: sound.color }]}>{sound.name}</Text>
                        {sound.uri ? (
                            <TouchableOpacity style={[styles.previewButton, { backgroundColor: `${sound.color}20`, borderColor: sound.color }]} onPress={() => handlePreviewSound(sound.id)} activeOpacity={0.7}>
                                {playingSound === sound.id ? <ActivityIndicator size="small" color={sound.color} /> : <MaterialIcons name="play-arrow" size={18} color={sound.color} />}
                            </TouchableOpacity>
                        ) : <View style={{ height: 36 }} />}
                        {selectedSound === sound.id && (
                            <View style={[styles.selectedIndicator, { backgroundColor: sound.color }]}><MaterialIcons name="check" size={12} color="#000" /></View>
                        )}
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );

    const renderRepetitionSection = () => (
        <View style={[styles.repetitionSection, isLandscape && styles.repetitionSectionLandscape]}>
            <View style={styles.repetitionHeader}>
                <View style={styles.repetitionTitleRow}><MaterialIcons name="repeat" size={18} color="#FFFFFF" /><Text style={styles.repetitionTitle}>Repeat Count</Text></View>
                <Text style={styles.repetitionValue}>{soundRepetition}x</Text>
            </View>
            <View style={styles.repetitionOptionsRow}>
                {REPETITION_OPTIONS.map((count) => (
                    <TouchableOpacity key={count} style={[styles.repetitionPill, soundRepetition === count && styles.repetitionPillSelected]} onPress={() => handleRepetitionSelect(count)} activeOpacity={0.7}>
                        <Text style={[styles.repetitionPillText, soundRepetition === count && styles.repetitionPillTextSelected]}>{count}x</Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );

    const handleSaveCategory = async () => {
        if (!newCategoryName.trim()) return;
        let updatedCategories;
        if (editingCategory) {
            updatedCategories = categories.map(cat => cat.id === editingCategory.id ? { ...cat, name: newCategoryName, color: selectedCategoryColor, icon: selectedCategoryIcon } : cat);
        } else {
            updatedCategories = [...categories, { id: Date.now().toString(), name: newCategoryName, color: selectedCategoryColor, icon: selectedCategoryIcon }];
        }
        onCategoriesChange(updatedCategories);
        try {
            await AsyncStorage.setItem(CATEGORIES_KEY, JSON.stringify(updatedCategories));
            setIsAddingCategory(false);
            setEditingCategory(null);
            setNewCategoryName('');
        } catch (err) { console.error(err); }
    };

    const handleDeleteCategory = (id: string) => {
        Alert.alert("Delete Category", "Are you sure you want to delete this category?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete", style: "destructive", onPress: async () => {
                    const updatedCategories = categories.filter(cat => cat.id !== id);
                    onCategoriesChange(updatedCategories);
                    try { await AsyncStorage.setItem(CATEGORIES_KEY, JSON.stringify(updatedCategories)); } catch (err) { console.error(err); }
                }
            }
        ]);
    };

    const startEditCategory = (cat: Category) => {
        setEditingCategory(cat);
        setNewCategoryName(cat.name);
        setSelectedCategoryColor(cat.color);
        setSelectedCategoryIcon(cat.icon);
        setIsAddingCategory(true);
    };

    const renderCategoriesTab = () => (
        <View style={styles.categoriesSection}>
            <View style={[styles.categoriesHeader, isLandscape && { marginTop: 4, marginBottom: 12 }]}>
                <Text style={isLandscape ? [styles.sectionTitleLandscape, { marginBottom: 0 }] : styles.inputLabel}>
                    MANAGE CATEGORIES
                </Text>
                <TouchableOpacity style={styles.addCategoryBtn} onPress={() => { setEditingCategory(null); setNewCategoryName(''); setSelectedCategoryColor('#FFFFFF'); setSelectedCategoryIcon('category'); setIsAddingCategory(true); }}>
                    <MaterialIcons name="add" size={20} color="#FFFFFF" /><Text style={styles.addCategoryBtnText}>ADD NEW</Text>
                </TouchableOpacity>
            </View>
            {isAddingCategory ? (
                <View style={styles.categoryForm}>
                    <View style={styles.categoryInputContainer}>
                        <MaterialIcons name={selectedCategoryIcon} size={20} color={selectedCategoryColor} />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={styles.inputLabel}>CATEGORY NAME</Text>
                            <TextInput style={styles.categoryInput} value={newCategoryName} onChangeText={setNewCategoryName} placeholder="Enter name..." placeholderTextColor="rgba(255,255,255,0.2)" autoFocus />
                        </View>
                    </View>
                    <Text style={styles.inputLabel}>SELECT ICON</Text>
                    <View style={styles.iconsGrid}>
                        {CATEGORY_ICONS.map(icon => (
                            <TouchableOpacity key={icon} style={[styles.iconPickerItem, selectedCategoryIcon === icon && { backgroundColor: `${selectedCategoryColor}30`, borderColor: selectedCategoryColor }]} onPress={() => setSelectedCategoryIcon(icon)}>
                                <MaterialIcons name={icon} size={20} color={selectedCategoryIcon === icon ? selectedCategoryColor : 'rgba(255,255,255,0.4)'} />
                            </TouchableOpacity>
                        ))}
                    </View>
                    <Text style={styles.inputLabel}>PICK COLOR</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 8 }}>
                        {COLOR_PRESETS.map(preset => (
                            <TouchableOpacity key={preset.value} style={[styles.catColorChip, selectedCategoryColor === preset.value && { borderColor: '#fff' }]} onPress={() => setSelectedCategoryColor(preset.value)}>
                                <View style={[styles.catColorInner, { backgroundColor: preset.value }]} />
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    <View style={styles.categoryFormActions}>
                        <TouchableOpacity style={styles.categoryCancelBtn} onPress={() => setIsAddingCategory(false)}><Text style={styles.categoryCancelText}>CANCEL</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.categorySaveBtn} onPress={handleSaveCategory}><Text style={styles.categorySaveText}>{editingCategory ? 'UPDATE' : 'SAVE'}</Text></TouchableOpacity>
                    </View>
                </View>
            ) : (
                <View style={styles.categoriesList}>
                    {categories.map((cat, index) => (
                        <React.Fragment key={cat.id}>
                            <View style={styles.categoryItem}>
                                <View style={styles.categoryIconCircle}><MaterialIcons name={cat.icon} size={20} color={cat.color} /></View>
                                <View style={styles.categoryInfo}>
                                    <Text style={styles.categoryNameText}>{cat.name}</Text>
                                    <View style={[styles.categoryColorPill, { backgroundColor: `${cat.color}15` }]}>
                                        <View style={[styles.colorDot, { backgroundColor: cat.color }]} /><Text style={[styles.categoryColorText, { color: cat.color }]}>{cat.color}</Text>
                                    </View>
                                </View>
                                <View style={styles.categoryActions}>
                                    <TouchableOpacity style={styles.actionBtn} onPress={() => startEditCategory(cat)}><MaterialIcons name="edit" size={18} color="rgba(255,255,255,0.4)" /></TouchableOpacity>
                                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleDeleteCategory(cat.id)}><MaterialIcons name="delete" size={18} color="#FF3B30" /></TouchableOpacity>
                                </View>
                            </View>
                            {index < categories.length - 1 && <View style={styles.sectionDivider} />}
                        </React.Fragment>
                    ))}
                </View>
            )}
        </View>
    );

    const renderGeneralTab = () => (
        <View style={styles.generalTabContainer}>
            {isLandscape && <Text style={styles.sectionTitleLandscape}>GENERAL SETTINGS</Text>}
            <View style={styles.behaviorList}>
                <View style={styles.settingRow}>
                    <View style={styles.settingInfo}>
                        <Text style={styles.settingLabel}>Disable Past Timers</Text>
                        <Text style={styles.settingDescription}>Restrict interactions and prevent edits on previous dates.</Text>
                    </View>
                    <TouchableOpacity onPress={() => onPastTimersChange(!enablePastTimers)} style={[styles.customSwitch, enablePastTimers && styles.customSwitchActive]}>
                        <View style={[styles.switchKnob, enablePastTimers && styles.switchKnobActive]} />
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );

    const renderPortraitLayout = () => (
        <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
            <View style={styles.section}><Text style={styles.sectionTitle}>LANDSCAPE PREVIEW</Text>{renderLandscapePreview()}</View>
            <View style={styles.section}><Text style={styles.sectionTitle}>CUSTOMIZE COLORS</Text>
                {renderColorPickerRow('Filler Color', 'gradient', fillerColor, handleFillerColorSelect)}
                {renderColorPickerRow('Slider & Button', 'touch-app', sliderButtonColor, handleSliderButtonColorSelect)}
                {renderColorPickerRow('Timer Text', 'text-fields', timerTextColor, handleTextColorSelect)}
            </View>
            <View style={styles.section}><Text style={styles.sectionTitle}>COMPLETION SOUND</Text>{renderSoundSection()}</View>
            <View style={styles.section}><Text style={styles.sectionTitle}>SOUND REPETITION</Text>{renderRepetitionSection()}</View>
            <View style={styles.section}><Text style={styles.sectionTitle}>CATEGORIES</Text>{renderCategoriesTab()}</View>
            <View style={styles.section}><Text style={styles.sectionTitle}>GENERAL SETTINGS</Text>{renderGeneralTab()}</View>
            <View style={styles.section}><Text style={styles.sectionTitle}>DEFAULTS</Text>
                <TouchableOpacity style={styles.resetButton} onPress={handleResetToDefaults} activeOpacity={0.7}>
                    <MaterialIcons name="refresh" size={20} color="#FFFFFF" /><Text style={styles.resetButtonText}>Reset Theme to Defaults</Text>
                </TouchableOpacity>
            </View>
            <View style={styles.section}><Text style={styles.sectionTitle}>ABOUT</Text>
                <View style={styles.aboutCard}><Text style={styles.aboutText}>Timer App v1.0.0</Text><Text style={styles.aboutSubtext}>Built with React Native & Expo</Text></View>
            </View>
        </ScrollView>
    );

    // Landscape Layout - Side by side with Sidebar
    const renderLandscapeLayout = () => {
        const renderSidebarButton = (id: 'customization' | 'sound' | 'categories' | 'general' | 'about', icon: keyof typeof MaterialIcons.glyphMap, label: string) => {
            const isActive = activeTab === id;
            return (
                <TouchableOpacity
                    key={id}
                    style={[
                        styles.sidebarButtonRow,
                        isActive && styles.sidebarButtonRowActive
                    ]}
                    onPress={() => setActiveTab(id)}
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
            <View style={styles.landscapeContainer}>
                {/* Left Panel - Permanent Preview + Sidebar Buttons */}
                <View style={[styles.leftSidebarCard, { width: '38%' }]}>
                    <Text style={styles.sidebarSectionTitle}>LIVE PREVIEW</Text>

                    <View style={styles.sidebarPreviewWrapper}>
                        {renderLandscapePreview()}
                    </View>

                    {/* Sidebar Navigation */}
                    <View style={styles.sidebarNavSection}>
                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={styles.sidebarButtonsScroll}
                        >
                            <View style={styles.sidebarButtonsList}>
                                {renderSidebarButton('customization', 'palette', 'Theme')}
                                {renderSidebarButton('sound', 'volume-up', 'Audio')}
                                {renderSidebarButton('categories', 'category', 'Category')}
                                {renderSidebarButton('general', 'settings', 'General')}
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
                        contentContainerStyle={styles.rightContentScrollPadding}
                        showsVerticalScrollIndicator={false}
                    >
                        {activeTab === 'customization' && (
                            <View>
                                <Text style={styles.sectionTitleLandscape}>CUSTOMIZE COLORS</Text>
                                {renderColorPickerRow('Filler Color', 'gradient', fillerColor, handleFillerColorSelect)}
                                <View style={styles.sectionDivider} />
                                {renderColorPickerRow('Button Color', 'touch-app', sliderButtonColor, handleSliderButtonColorSelect)}
                                <View style={styles.sectionDivider} />
                                {renderColorPickerRow('Text Color', 'text-fields', timerTextColor, handleTextColorSelect)}

                                <TouchableOpacity
                                    style={styles.landscapeResetButton}
                                    onPress={handleResetToDefaults}
                                    activeOpacity={0.7}
                                >
                                    <MaterialIcons name="refresh" size={18} color="#FFFFFF" />
                                    <Text style={styles.resetButtonText}>Reset to Defaults</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {activeTab === 'sound' && (
                            <View>
                                <Text style={styles.sectionTitleLandscape}>COMPLETION SOUND</Text>
                                {renderSoundSection()}

                                <View style={[styles.sectionDivider, { marginVertical: 24 }]} />

                                <Text style={styles.sectionTitleLandscape}>SOUND REPETITION</Text>
                                {renderRepetitionSection()}
                            </View>
                        )}

                        {activeTab === 'categories' && renderCategoriesTab()}

                        {activeTab === 'general' && renderGeneralTab()}

                        {activeTab === 'about' && (
                            <View style={styles.aboutContainerLandscape}>
                                <Text style={styles.sectionTitleLandscape}>ABOUT</Text>
                                <View style={styles.aboutHeaderLandscape}>
                                    <LinearGradient
                                        colors={['#FFFFFF', '#CCCCCC']}
                                        style={styles.aboutIconContainer}
                                    >
                                        <MaterialIcons name="timer" size={28} color="#000" />
                                    </LinearGradient>
                                    <View>
                                        <Text style={styles.aboutTextMain}>Timer App</Text>
                                        <Text style={styles.aboutTextSub}>Version 1.0.0</Text>
                                    </View>
                                </View>
                                <Text style={styles.aboutDescription}>
                                    A high-precision timer designed for focus and productivity. Customize your experience with unique themes and alert sounds.
                                </Text>
                                <View style={styles.sectionDivider} />
                                <View style={styles.aboutFooterRow}>
                                    <Text style={styles.aboutFooterText}>Built with React Native & Expo</Text>
                                    <Text style={styles.aboutFooterText}>© 2026</Text>
                                </View>
                            </View>
                        )}
                    </ScrollView>
                </View>
            </View>
        );
    };

    return (
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

    landscapeContainer: {
        flex: 1,
        flexDirection: 'row',
        paddingVertical: 12,
        gap: 25,
    },

    leftSidebarCard: {
        backgroundColor: 'transparent',
        paddingVertical: 12,
        paddingHorizontal: 8,
        justifyContent: 'flex-start',
    },

    sidebarSectionTitle: {
        fontSize: 9,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.25)',
        letterSpacing: 2,
        marginBottom: 8,
        paddingLeft: 4,
        textTransform: 'uppercase',
    },

    sidebarPreviewWrapper: {
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        minHeight: 140, // Ensure it doesn't collapse
    },

    sidebarNavSection: {
        flex: 1,
        marginTop: 10,
        marginBottom: 50, // Added margin to avoid overlap with back button
    },

    sidebarButtonsScroll: {
        paddingBottom: 20,
    },

    sidebarButtonsList: {
        gap: 4,
    },

    sidebarIconLabelContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },

    rightContentCard: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        display: 'flex',
    },

    sectionDivider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.06)',
        marginVertical: 12,
        width: '100%',
    },

    sidebarButtonRow: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 9,
        paddingHorizontal: 12,
        borderRadius: 12,
        backgroundColor: 'transparent',
    },

    sidebarButtonRowActive: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
    },

    sidebarButtonText: {
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },

    sidebarButtonTextActive: {
        color: '#FFFFFF',
    },

    sidebarButtonTextInactive: {
        color: 'rgba(255,255,255,0.35)',
    },

    activeIndicatorSmall: {
        width: 5,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: '#FFFFFF',
        shadowColor: '#FFFFFF',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 3,
    },

    smallBackButton: {
        position: 'absolute',
        bottom: 12,
        left: 16,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },

    permanentPreviewHeader: {
        padding: 16,
        paddingBottom: 0,
        backgroundColor: 'rgba(0,0,0,0.2)',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },

    rightContentScroll: {
        flex: 1,
    },

    rightContentScrollPadding: {
        paddingHorizontal: 20,
        paddingVertical: 16,
    },

    aboutIconContainer: {
        width: 60,
        height: 60,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },

    aboutDescription: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.5)',
        lineHeight: 20,
        marginBottom: 24,
        paddingHorizontal: 4,
    },

    aboutDivider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginBottom: 16,
    },

    aboutFooterText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.3)',
        textAlign: 'center',
    },

    sidebarContent: {
        flex: 1,
    },

    aboutHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },

    // ========== Swipeable Preview Styles ==========
    phoneFrameContainer: {
        marginBottom: 20,
    },

    phoneFrameContainerLandscape: {
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
        backgroundColor: 'transparent',
        borderWidth: 0,
        padding: 0,
        paddingHorizontal: 4,
        marginBottom: 8,
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

    // ========== Sound Section Styles ==========
    soundSection: {
        marginBottom: 8,
    },

    soundSectionLandscape: {
        marginBottom: 4,
    },

    soundOptionsRow: {
        flexDirection: 'row',
        gap: 12,
    },

    soundCard: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.05)',
        position: 'relative',
    },

    soundCardLandscape: {
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderColor: 'transparent',
        padding: 12,
    },

    soundCardSelected: {
        backgroundColor: 'rgba(255,255,255,0.08)',
    },

    soundIconContainer: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 6,
    },

    soundName: {
        fontSize: 12,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.7)',
        marginBottom: 12,
    },

    previewButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },

    selectedIndicator: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // ========== Repetition Section Styles ==========
    repetitionSection: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },

    repetitionSectionLandscape: {
        backgroundColor: 'transparent',
        borderWidth: 0,
        padding: 0,
        paddingHorizontal: 4,
    },

    repetitionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },

    repetitionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },

    repetitionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.9)',
        marginLeft: 10,
    },

    repetitionValue: {
        fontSize: 16,
        fontWeight: '700',
        color: '#FFFFFF',
    },

    repetitionOptionsRow: {
        flexDirection: 'row',
        gap: 8,
    },

    repetitionPill: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },

    repetitionPillSelected: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },

    repetitionPillText: {
        fontSize: 14,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.6)',
    },

    repetitionPillTextSelected: {
        color: '#FFFFFF',
    },

    // ========== Reset Button Styles ==========
    resetButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        borderRadius: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.3)',
    },

    resetButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#FFFFFF',
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

    aboutContainerLandscape: {
        paddingHorizontal: 4,
    },

    aboutHeaderLandscape: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        paddingTop: 4,
    },

    aboutTextMain: {
        fontSize: 18,
        fontWeight: '800',
        color: '#fff',
        letterSpacing: 0.5,
    },

    aboutTextSub: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.4)',
        marginTop: 2,
    },

    aboutFooterRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 8,
    },

    landscapeResetButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 14,
        borderRadius: 14,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
        marginTop: 20,
    },

    // ========== Category Management Styles ==========
    categoriesSection: {
        flex: 1,
    },

    categoriesHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },

    addCategoryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },

    addCategoryBtnText: {
        fontSize: 10,
        fontWeight: '800',
        color: '#FFFFFF',
        marginLeft: 4,
    },

    categoriesList: {
        // Gap removed to rely on item padding for tighter spacing
    },

    categoryItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 4,
    },

    categoryIconCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },

    categoryInfo: {
        flex: 1,
    },

    categoryNameText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 4,
    },

    categoryColorPill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        alignSelf: 'flex-start',
    },

    colorDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginRight: 6,
    },

    categoryColorText: {
        fontSize: 10,
        fontWeight: '600',
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    },

    categoryActions: {
        flexDirection: 'row',
        gap: 8,
    },

    actionBtn: {
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.03)',
        alignItems: 'center',
        justifyContent: 'center',
    },

    categoryForm: {
        paddingVertical: 8,
    },

    categoryInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },

    inputLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 1,
        marginBottom: 6,
    },

    categoryInput: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },

    iconsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 20,
    },

    iconPickerItem: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1.5,
        borderColor: 'transparent',
    },

    catColorChip: {
        width: 32,
        height: 32,
        borderRadius: 16,
        padding: 3,
        borderWidth: 2,
        borderColor: 'transparent',
        marginRight: 10,
    },

    catColorInner: {
        flex: 1,
        borderRadius: 13,
    },

    categoryFormActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 12,
        marginTop: 24,
    },

    categoryCancelBtn: {
        paddingVertical: 10,
        paddingHorizontal: 16,
    },

    categoryCancelText: {
        fontSize: 12,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.4)',
    },

    categorySaveBtn: {
        backgroundColor: '#FFFFFF',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 12,
    },

    categorySaveText: {
        fontSize: 12,
        fontWeight: '800',
        color: '#000',
    },

    // ========== General/Behavior Styles ==========
    generalTabContainer: {
        flex: 1,
    },

    behaviorList: {
        marginTop: 8,
    },

    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
    },

    settingInfo: {
        flex: 1,
        marginRight: 20,
    },

    settingLabel: {
        fontSize: 14,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 2,
    },

    settingDescription: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.4)',
        lineHeight: 14,
    },

    customSwitch: {
        width: 44,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.1)',
        padding: 2,
    },

    customSwitchActive: {
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
    },

    switchKnob: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,1)',
    },

    switchKnobActive: {
        backgroundColor: '#FFFFFF',
        transform: [{ translateX: 20 }],
    },
});
