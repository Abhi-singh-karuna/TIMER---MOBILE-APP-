import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Modal,
    TextInput,
    Platform,
    StyleSheet,
    ScrollView as RNScrollView,
    NativeSyntheticEvent,
    NativeScrollEvent,
    Dimensions,
    useWindowDimensions,
    Keyboard,
    Pressable,
} from 'react-native';
import { ScrollView, GestureHandlerRootView } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { MaterialIcons } from '@expo/vector-icons';
import { Timer, Category } from '../constants/data';
import { getLogicalDate, DEFAULT_DAILY_START_MINUTES } from '../utils/dailyStartTime';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ITEM_HEIGHT = 44;

interface AddTimerModalProps {
    visible: boolean;
    onCancel: () => void;
    onAdd: (name: string, hours: number, minutes: number, seconds: number, date: string, categoryId?: string) => void;
    onUpdate?: (timerId: number, name: string, hours: number, minutes: number, seconds: number, date: string, categoryId?: string) => void;
    initialDate?: string; // YYYY-MM-DD
    /** Daily start (minutes from midnight). Used so "today" and isPast match 06:00–06:00 logical day. */
    dailyStartMinutes?: number;
    categories: Category[];
    timerToEdit?: Timer | null;
    isPastTimersDisabled?: boolean;
}

const generateNumbers = (max: number) => Array.from({ length: max + 1 }, (_, i) => i);
const HOURS = generateNumbers(23);
const MINUTES = generateNumbers(59);
const SECONDS = generateNumbers(59);

// Wheel Picker Component
const WheelPicker = ({ data, value, onChange }: { data: number[]; value: number; onChange: (v: number) => void }) => {
    const scrollRef = useRef<any>(null);
    const lastIndex = useRef(value);

    useEffect(() => {
        const idx = data.indexOf(value);
        if (idx >= 0) {
            // Use a slightly longer timeout to ensure the modal layout is ready
            const timer = setTimeout(() => {
                scrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: false });
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [value, data]);

    const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
        const clamped = Math.max(0, Math.min(idx, data.length - 1));
        if (clamped !== lastIndex.current) {
            lastIndex.current = clamped;
            Haptics.selectionAsync();
        }
    }, [data.length]);

    const handleEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
        const clamped = Math.max(0, Math.min(idx, data.length - 1));
        onChange(data[clamped]);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, [data, onChange]);

    return (
        <View style={pickerStyles.container}>
            <LinearGradient colors={['#000000', 'transparent']} style={pickerStyles.fadeTop} pointerEvents="none" />
            <LinearGradient colors={['transparent', '#000000']} style={pickerStyles.fadeBottom} pointerEvents="none" />
            <View style={pickerStyles.highlight} pointerEvents="none" />
            <ScrollView
                ref={scrollRef}
                showsVerticalScrollIndicator={false}
                snapToInterval={ITEM_HEIGHT}
                decelerationRate={0.92}
                bounces={true}
                scrollEventThrottle={16}
                onScroll={handleScroll}
                onMomentumScrollEnd={handleEnd}
                onScrollEndDrag={(e) => { if (e.nativeEvent.velocity?.y === 0) handleEnd(e); }}
                contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
                nestedScrollEnabled={true}
                canCancelContentTouches={false}
            >
                {data.map((item) => (
                    <View key={item} style={pickerStyles.item}>
                        <Text style={pickerStyles.text}>{item.toString().padStart(2, '0')}</Text>
                    </View>
                ))}
            </ScrollView>
        </View>
    );
};

const pickerStyles = StyleSheet.create({
    container: {
        height: ITEM_HEIGHT * 3,
        width: 70,
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: 'rgba(30,30,30,0.4)',
    },
    highlight: {
        position: 'absolute',
        top: ITEM_HEIGHT,
        left: 3,
        right: 3,
        height: ITEM_HEIGHT,
        borderRadius: 11,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.3)',
    },
    fadeTop: { position: 'absolute', top: 0, left: 0, right: 0, height: ITEM_HEIGHT * 0.7, zIndex: 5 },
    fadeBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: ITEM_HEIGHT * 0.7, zIndex: 5 },
    item: { height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
    text: { fontSize: 24, fontWeight: '400', color: '#fff' },
});

export default function AddTimerModal({ visible, onCancel, onAdd, onUpdate, initialDate, dailyStartMinutes = DEFAULT_DAILY_START_MINUTES, categories, timerToEdit, isPastTimersDisabled }: AddTimerModalProps) {
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const isLandscape = screenWidth > screenHeight;
    const [name, setName] = useState('');
    const [hours, setHours] = useState(0);
    const [minutes, setMinutes] = useState(0);
    const [seconds, setSeconds] = useState(0);
    const [selectedDate, setSelectedDate] = useState(initialDate || getLogicalDate(new Date(), dailyStartMinutes));
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(categories[0]?.id);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [viewDate, setViewDate] = useState(new Date(selectedDate));
    const [errorName, setErrorName] = useState(false);
    const [errorTime, setErrorTime] = useState(false);

    // Update selectedDate when initialDate changes (e.g. when opening modal from a specific day)
    useEffect(() => {
        if (visible) {
            if (timerToEdit) {
                // Pre-fill form for editing
                setName(timerToEdit.title);
                setSelectedDate(timerToEdit.forDate || initialDate || getLogicalDate(new Date(), dailyStartMinutes));
                setSelectedCategoryId(timerToEdit.categoryId || categories[0]?.id);

                // Parse time HH:MM:SS or MM:SS
                const parts = timerToEdit.total.split(':').map(Number);
                if (parts.length === 3) {
                    setHours(parts[0]);
                    setMinutes(parts[1]);
                    setSeconds(parts[2]);
                } else if (parts.length === 2) {
                    setHours(0);
                    setMinutes(parts[0]);
                    setSeconds(parts[1]);
                }
            } else if (initialDate) {
                // New timer with initial date
                setSelectedDate(initialDate);
                setViewDate(new Date(initialDate));
                resetForm();
            } else {
                const d = getLogicalDate(new Date(), dailyStartMinutes);
                setSelectedDate(d);
                setViewDate(new Date(d));
                resetForm();
            }
        }
    }, [visible, initialDate, timerToEdit, dailyStartMinutes]);

    const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

    const changeMonth = (delta: number) => {
        const nextDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + delta, 1);
        setViewDate(nextDate);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const formatDate = (date: Date) => {
        return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    };

    const renderDatePicker = () => {
        const days = getDaysInMonth(viewDate.getFullYear(), viewDate.getMonth());
        const firstDay = getFirstDayOfMonth(viewDate.getFullYear(), viewDate.getMonth());
        const daysArray = [];

        // Previous month filler
        const prevMonthDays = getDaysInMonth(viewDate.getFullYear(), viewDate.getMonth() - 1);
        for (let i = firstDay - 1; i >= 0; i--) {
            daysArray.push({ day: prevMonthDays - i, current: false });
        }
        // Current month
        for (let i = 1; i <= days; i++) {
            daysArray.push({ day: i, current: true });
        }
        // Next month filler
        const remaining = 42 - daysArray.length;
        for (let i = 1; i <= remaining; i++) {
            daysArray.push({ day: i, current: false });
        }

        const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

        return (
            <View style={styles.calendarMini}>
                <View style={styles.calHeader}>
                    <TouchableOpacity onPress={() => setShowDatePicker(false)} style={styles.calBack}>
                        <MaterialIcons name="arrow-back" size={20} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.calTitle}>{MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}</Text>
                    <View style={styles.calNav}>
                        <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.calNavBtn}>
                            <MaterialIcons name="chevron-left" size={20} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => changeMonth(1)} style={styles.calNavBtn}>
                            <MaterialIcons name="chevron-right" size={20} color="#fff" />
                        </TouchableOpacity>
                    </View>
                </View>
                <View style={styles.weekRow}>
                    {weekDays.map((d, i) => <Text key={i} style={styles.weekText}>{d}</Text>)}
                </View>
                <View style={styles.daysGrid}>
                    {daysArray.map((item, i) => {
                        const dateStr = item.current ? formatDate(new Date(viewDate.getFullYear(), viewDate.getMonth(), item.day)) : '';
                        const isSelected = item.current && dateStr === selectedDate;
                        const todayStr = getLogicalDate(new Date(), dailyStartMinutes);
                        const isToday = item.current && dateStr === todayStr;
                        const isPast = item.current && dateStr < todayStr;

                        return (
                            <TouchableOpacity
                                key={i}
                                style={styles.dayCell}
                                disabled={!item.current}
                                onPress={() => {
                                    if (item.current && (!isPastTimersDisabled || !isPast)) {
                                        setSelectedDate(dateStr);
                                        setShowDatePicker(false);
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                    }
                                }}
                            >
                                <View style={[
                                    styles.dayCircle,
                                    !isLandscape && styles.dayCirclePortrait,
                                    (!item.current || (isPastTimersDisabled && isPast)) && { opacity: 0.2 },
                                    isToday && styles.todayCircle,
                                    isSelected && (isPast ? styles.selectedPastCircle : styles.selectedFutureCircle)
                                ]}>
                                    <Text style={[
                                        styles.dayText,
                                        !isLandscape && styles.dayTextPortrait,
                                        isToday && { color: '#000' },
                                        isSelected && { color: isPast ? '#FF5050' : '#4CAF50', fontWeight: '800' }
                                    ]}>{item.day}</Text>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>
        );
    };

    const handleAdd = () => {
        const logicalToday = getLogicalDate(new Date(), dailyStartMinutes);
        const isDateInvalid = selectedDate < logicalToday && isPastTimersDisabled;
        const hasName = name.trim().length > 0;
        const hasTime = (hours + minutes + seconds) > 0;

        setErrorName(!hasName);
        setErrorTime(!hasTime);

        if (hasName && hasTime && !isDateInvalid) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            if (timerToEdit && onUpdate) {
                onUpdate(timerToEdit.id, name, hours, minutes, seconds, selectedDate, selectedCategoryId);
            } else {
                onAdd(name, hours, minutes, seconds, selectedDate, selectedCategoryId);
            }
            resetForm();
        } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
    };

    const handleCancel = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        resetForm();
        onCancel();
    };

    const resetForm = () => {
        setName('');
        setHours(0);
        setMinutes(0);
        setSeconds(0);
        setSelectedCategoryId(categories[0]?.id);
        setErrorName(false);
        setErrorTime(false);
    };

    const renderCategoryPicker = () => (
        <View style={styles.categoryPickerContainer}>
            <Text style={styles.label}>CATEGORY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
                {categories.filter(c => c.isEnabled !== false).map((cat) => (
                    <TouchableOpacity
                        key={cat.id}
                        style={[
                            styles.categoryChip,
                            selectedCategoryId === cat.id && { backgroundColor: `${cat.color}20`, borderColor: cat.color }
                        ]}
                        onPress={() => {
                            setSelectedCategoryId(cat.id);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                    >
                        <MaterialIcons
                            name={cat.icon}
                            size={16}
                            color={selectedCategoryId === cat.id ? cat.color : 'rgba(255,255,255,0.4)'}
                        />
                        <Text style={[
                            styles.categoryChipText,
                            selectedCategoryId === cat.id && { color: cat.color }
                        ]}>
                            {cat.name}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>
    );

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            supportedOrientations={['portrait', 'landscape']}
            onRequestClose={handleCancel}
        >
            <GestureHandlerRootView style={{ flex: 1 }}>
                <Pressable style={styles.overlay} onPress={Keyboard.dismiss}>
                    {Platform.OS !== 'web' && <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />}
                    <View style={styles.dimLayer} pointerEvents="none" />

                    <Pressable
                        style={[styles.modal, isLandscape ? styles.modalLandscape : styles.modalPortrait]}
                        onPress={(e) => e.stopPropagation()}
                    >
                        {isLandscape ? (
                            <View style={styles.landscapeContainer}>
                                {/* Left Column - Info & Name or Date Selector */}
                                <View style={styles.leftColumn}>
                                    {showDatePicker ? (
                                        renderDatePicker()
                                    ) : (
                                        <View style={[styles.leftFieldsContent, { justifyContent: 'center', flex: 1 }]}>
                                            <View style={styles.fieldGroup}>
                                                <Text style={styles.label}>TIMER NAME</Text>
                                                <TextInput
                                                    style={[
                                                        styles.input,
                                                        styles.compactInput,
                                                        errorName && styles.inputError
                                                    ]}
                                                    value={name}
                                                    onChangeText={(text) => {
                                                        setName(text);
                                                        if (text.trim()) setErrorName(false);
                                                    }}
                                                    placeholder="e.g. Creative Flow"
                                                    placeholderTextColor="rgba(255,255,255,0.3)"
                                                />
                                            </View>

                                            <View style={styles.fieldGroup}>
                                                <Text style={styles.label}>FOR DATE</Text>
                                                <TouchableOpacity
                                                    style={[
                                                        styles.dateDisplay,
                                                        styles.compactInput,
                                                        (selectedDate < getLogicalDate(new Date(), dailyStartMinutes) && isPastTimersDisabled) && styles.inputError
                                                    ]}
                                                    onPress={() => {
                                                        setShowDatePicker(true);
                                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                    }}
                                                >
                                                    <Text style={styles.dateDisplayText}>{selectedDate}</Text>
                                                    <MaterialIcons name="event" size={16} color="#fff" />
                                                </TouchableOpacity>
                                            </View>

                                            {renderCategoryPicker()}
                                        </View>
                                    )}
                                </View>

                                {/* Right Column - Duration & Actions */}
                                <View style={styles.rightColumn}>
                                    <Text style={[styles.label, { textAlign: 'center' }]}>DURATION</Text>
                                    <View style={[
                                        styles.pickerRow,
                                        isLandscape && styles.pickerRowLandscape,
                                        errorTime && styles.pickerRowError
                                    ]}>
                                        <View style={styles.pickerGroup}>
                                            <WheelPicker data={HOURS} value={hours} onChange={(v) => {
                                                setHours(v);
                                                setErrorTime(false);
                                            }} />
                                            <Text style={styles.pickerLabel}>HRS</Text>
                                        </View>
                                        <Text style={[styles.colon, isLandscape && styles.colonLandscape]}>:</Text>
                                        <View style={styles.pickerGroup}>
                                            <WheelPicker data={MINUTES} value={minutes} onChange={(v) => {
                                                setMinutes(v);
                                                setErrorTime(false);
                                            }} />
                                            <Text style={styles.pickerLabel}>MIN</Text>
                                        </View>
                                        <Text style={[styles.colon, isLandscape && styles.colonLandscape]}>:</Text>
                                        <View style={styles.pickerGroup}>
                                            <WheelPicker data={SECONDS} value={seconds} onChange={(v) => {
                                                setSeconds(v);
                                                setErrorTime(false);
                                            }} />
                                            <Text style={styles.pickerLabel}>SEC</Text>
                                        </View>
                                    </View>

                                    <View style={styles.landscapeActions}>
                                        <TouchableOpacity onPress={handleAdd} style={[styles.addBtn, { flex: 1, marginBottom: 0 }]} activeOpacity={0.7}>
                                            <Text style={styles.addBtnText}>{timerToEdit ? 'Update' : 'Add Timer'}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={handleCancel} activeOpacity={0.7} style={styles.landscapeCancel}>
                                            <Text style={styles.cancelText}>Cancel</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        ) : (
                            <>
                                {showDatePicker ? (
                                    renderDatePicker()
                                ) : (
                                    <>
                                        {/* Timer Name */}
                                        <Text style={styles.label}>TIMER NAME</Text>
                                        <TextInput
                                            style={[styles.input, errorName && styles.inputError]}
                                            value={name}
                                            onChangeText={(text) => {
                                                setName(text);
                                                if (text.trim()) setErrorName(false);
                                            }}
                                            placeholder="e.g. Creative Flow"
                                            placeholderTextColor="rgba(255,255,255,0.3)"
                                        />

                                        <Text style={styles.label}>FOR DATE</Text>
                                        <TouchableOpacity
                                            style={[
                                                styles.dateDisplay,
                                                { marginBottom: 24 },
                                                (selectedDate < getLogicalDate(new Date(), dailyStartMinutes) && isPastTimersDisabled) && styles.inputError
                                            ]}
                                            onPress={() => {
                                                setShowDatePicker(true);
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                            }}
                                        >
                                            <Text style={styles.dateDisplayText}>{selectedDate}</Text>
                                            <MaterialIcons name="event" size={16} color="#fff" />
                                        </TouchableOpacity>

                                        {renderCategoryPicker()}

                                        {/* Duration with Wheel Pickers */}
                                        <Text style={styles.label}>DURATION</Text>
                                        <View style={[
                                            styles.pickerRow,
                                            isLandscape && styles.pickerRowLandscape,
                                            errorTime && styles.pickerRowError
                                        ]}>
                                            <View style={styles.pickerGroup}>
                                                <WheelPicker data={HOURS} value={hours} onChange={(v) => {
                                                    setHours(v);
                                                    setErrorTime(false);
                                                }} />
                                                <Text style={styles.pickerLabel}>HRS</Text>
                                            </View>
                                            <Text style={[styles.colon, isLandscape && styles.colonLandscape]}>:</Text>
                                            <View style={styles.pickerGroup}>
                                                <WheelPicker data={MINUTES} value={minutes} onChange={(v) => {
                                                    setMinutes(v);
                                                    setErrorTime(false);
                                                }} />
                                                <Text style={styles.pickerLabel}>MIN</Text>
                                            </View>
                                            <Text style={[styles.colon, isLandscape && styles.colonLandscape]}>:</Text>
                                            <View style={styles.pickerGroup}>
                                                <WheelPicker data={SECONDS} value={seconds} onChange={(v) => {
                                                    setSeconds(v);
                                                    setErrorTime(false);
                                                }} />
                                                <Text style={styles.pickerLabel}>SEC</Text>
                                            </View>
                                        </View>

                                        {/* Add Timer Button */}
                                        <TouchableOpacity onPress={handleAdd} style={styles.addBtn} activeOpacity={0.7}>
                                            <Text style={styles.addBtnText}>{timerToEdit ? 'Update' : 'Add Timer'}</Text>
                                        </TouchableOpacity>

                                        {/* Cancel */}
                                        <TouchableOpacity onPress={handleCancel} activeOpacity={0.7}>
                                            <Text style={styles.cancelText}>Cancel</Text>
                                        </TouchableOpacity>
                                    </>
                                )}
                            </>
                        )}
                    </Pressable>
                </Pressable>
            </GestureHandlerRootView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    dimLayer: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.7)',
    },

    modal: {
        width: SCREEN_WIDTH * 0.88,
        maxWidth: 400,
        backgroundColor: '#000000',
        borderRadius: 28,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        paddingTop: 32,
        paddingBottom: 28,
        paddingHorizontal: 24,
        ... (Platform.OS !== 'web' && { maxHeight: '90%' }),
    },
    modalPortrait: {
        paddingTop: 20,
        paddingBottom: 20,
        paddingHorizontal: 20,
    },

    modalLandscape: {
        width: '90%',
        maxWidth: 650,
        paddingTop: 32,
        paddingBottom: 28,
        justifyContent: 'center',
    },

    landscapeContainer: {
        flexDirection: 'row',
        gap: 40,
    },

    landscapeHeader: {
        alignItems: 'center',
        marginBottom: 10,
    },

    leftColumn: {
        flex: 1.2,
        justifyContent: 'flex-start',
    },

    leftFieldsContent: {
        gap: 0,
    },

    rightColumn: {
        flex: 1,
        justifyContent: 'center',
    },

    landscapeActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        marginTop: 8,
    },

    landscapeCancel: {
        paddingHorizontal: 12,
    },

    title: {
        fontSize: 28,
        fontWeight: '600',
        color: '#fff',
        textAlign: 'center',
        marginBottom: 8,
    },

    subtitle: {
        fontSize: 12,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.4)',
        textAlign: 'center',
        letterSpacing: 3,
        marginBottom: 20,
    },

    label: {
        fontSize: 11,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 1.5,
        marginBottom: 10,
    },

    input: {
        backgroundColor: 'rgba(20,20,20,0.5)',
        borderRadius: 16,
        paddingHorizontal: 18,
        paddingVertical: 16,
        color: '#fff',
        fontSize: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        marginBottom: 24,
    },
    inputError: {
        borderColor: '#FF5050',
        backgroundColor: 'rgba(255, 80, 80, 0.05)',
    },

    fieldGroup: {
        marginBottom: 14,
    },

    compactInput: {
        paddingVertical: 12,
        marginBottom: 0,
    },

    pickerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 32,
        padding: 4,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    pickerRowLandscape: {
        marginBottom: 12,
        paddingHorizontal: 12,
        paddingVertical: 2,
    },
    pickerRowError: {
        borderColor: '#FF5050',
        backgroundColor: 'rgba(255, 80, 80, 0.05)',
    },

    pickerGroup: {
        alignItems: 'center',
    },

    pickerLabel: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.4)',
        marginTop: 8,
        fontWeight: '500',
        letterSpacing: 1,
    },

    colon: {
        fontSize: 28,
        color: 'rgba(255, 255, 255, 0.45)',
        marginHorizontal: 10,
        marginBottom: 24,
    },
    colonLandscape: {
        marginHorizontal: 6,
        marginBottom: 14,
    },

    addBtn: {
        borderRadius: 16,
        backgroundColor: '#FFFFFF',
        paddingVertical: 16,
        alignItems: 'center',
        marginBottom: 16,
    },

    addBtnText: {
        fontSize: 17,
        fontWeight: '700',
        color: '#000000',
    },

    cancelText: {
        fontSize: 15,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.45)',
        textAlign: 'center',
    },
    dateDisplay: {
        backgroundColor: 'rgba(0,0,0,0.2)',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    dateDisplayText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    calendarMini: {
        paddingBottom: 5,
    },
    calHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    calBack: {
        padding: 4,
    },
    calTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    calNav: {
        flexDirection: 'row',
        gap: 12,
    },
    calNavBtn: {
        padding: 4,
    },
    weekRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    weekText: {
        width: '14.2%',
        textAlign: 'center',
        color: 'rgba(255,255,255,0.4)',
        fontSize: 10,
        fontWeight: '600',
    },
    daysGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dayCell: {
        width: '14.28%',
        height: 30,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 2,
    },
    dayCircle: {
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayText: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 10,
        fontWeight: '500',
    },
    todayCircle: {
        backgroundColor: '#fff',
    },
    selectedFutureCircle: {
        borderWidth: 2,
        borderColor: '#4CAF50',
    },
    selectedPastCircle: {
        borderWidth: 2,
        borderColor: '#FF5050',
    },
    dayCirclePortrait: {
        width: 26,
        height: 26,
        borderRadius: 13,
    },
    dayTextPortrait: {
        fontSize: 12,
    },
    categoryPickerContainer: {
        marginBottom: 20,
    },
    categoryScroll: {
        paddingVertical: 4,
        gap: 8,
    },
    categoryChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'transparent',
    },
    categoryChipText: {
        fontSize: 12,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.4)',
        marginLeft: 6,
    },
});
