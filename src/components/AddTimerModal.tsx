import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Modal,
    TextInput,
    Platform,
    StyleSheet,
    ScrollView,
    NativeSyntheticEvent,
    NativeScrollEvent,
    Dimensions,
    useWindowDimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { MaterialIcons } from '@expo/vector-icons';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ITEM_HEIGHT = 44;

interface AddTimerModalProps {
    visible: boolean;
    onCancel: () => void;
    onAdd: (name: string, hours: number, minutes: number, seconds: number, date: string) => void;
    initialDate?: string; // YYYY-MM-DD
}

const generateNumbers = (max: number) => Array.from({ length: max + 1 }, (_, i) => i);
const HOURS = generateNumbers(23);
const MINUTES = generateNumbers(59);
const SECONDS = generateNumbers(59);

// Wheel Picker Component
const WheelPicker = ({ data, value, onChange }: { data: number[]; value: number; onChange: (v: number) => void }) => {
    const scrollRef = useRef<ScrollView>(null);
    const lastIndex = useRef(value);

    useEffect(() => {
        const idx = data.indexOf(value);
        if (idx >= 0) {
            setTimeout(() => scrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: false }), 50);
        }
    }, []);

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
            <LinearGradient colors={['rgba(25,35,45,1)', 'transparent']} style={pickerStyles.fadeTop} pointerEvents="none" />
            <LinearGradient colors={['transparent', 'rgba(25,35,45,1)']} style={pickerStyles.fadeBottom} pointerEvents="none" />
            <View style={pickerStyles.highlight} />
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
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    highlight: {
        position: 'absolute',
        top: ITEM_HEIGHT,
        left: 3,
        right: 3,
        height: ITEM_HEIGHT,
        borderRadius: 11,
        backgroundColor: 'rgba(0,229,255,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(0,229,255,0.3)',
    },
    fadeTop: { position: 'absolute', top: 0, left: 0, right: 0, height: ITEM_HEIGHT * 0.7, zIndex: 5 },
    fadeBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: ITEM_HEIGHT * 0.7, zIndex: 5 },
    item: { height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
    text: { fontSize: 24, fontWeight: '400', color: '#fff' },
});

export default function AddTimerModal({ visible, onCancel, onAdd, initialDate }: AddTimerModalProps) {
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const isLandscape = screenWidth > screenHeight;
    const [name, setName] = useState('');
    const [hours, setHours] = useState(0);
    const [minutes, setMinutes] = useState(25);
    const [seconds, setSeconds] = useState(0);
    const [selectedDate, setSelectedDate] = useState(initialDate || new Date().toISOString().split('T')[0]);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [viewDate, setViewDate] = useState(new Date(selectedDate));

    // Update selectedDate when initialDate changes (e.g. when opening modal from a specific day)
    useEffect(() => {
        if (visible && initialDate) {
            setSelectedDate(initialDate);
            setViewDate(new Date(initialDate));
        }
    }, [visible, initialDate]);

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
                        const todayStr = formatDate(new Date());
                        const isToday = item.current && dateStr === todayStr;
                        const isPast = item.current && dateStr < todayStr;

                        return (
                            <TouchableOpacity
                                key={i}
                                style={styles.dayCell}
                                disabled={!item.current}
                                onPress={() => {
                                    if (item.current) {
                                        setSelectedDate(dateStr);
                                        setShowDatePicker(false);
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                    }
                                }}
                            >
                                <View style={[
                                    styles.dayCircle,
                                    !isLandscape && styles.dayCirclePortrait,
                                    !item.current && { opacity: 0.2 },
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
        if (name.trim()) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onAdd(name, hours, minutes, seconds, selectedDate);
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
        setMinutes(25);
        setSeconds(0);
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            supportedOrientations={['portrait', 'landscape']}
            onRequestClose={handleCancel}
        >
            <View style={styles.overlay}>
                {Platform.OS !== 'web' && <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />}
                <View style={styles.dimLayer} />

                <View style={[styles.modal, isLandscape ? styles.modalLandscape : styles.modalPortrait]}>
                    {isLandscape ? (
                        <View style={styles.landscapeContainer}>
                            {/* Left Column - Info & Name or Date Selector */}
                            <View style={styles.leftColumn}>
                                {showDatePicker ? (
                                    renderDatePicker()
                                ) : (
                                    <>
                                        <Text style={styles.title}>New Timer</Text>
                                        <Text style={styles.subtitle}>FOCUS SESSION</Text>

                                        <Text style={styles.label}>TIMER NAME</Text>
                                        <TextInput
                                            style={styles.input}
                                            value={name}
                                            onChangeText={setName}
                                            placeholder="e.g. Creative Flow"
                                            placeholderTextColor="rgba(255,255,255,0.3)"
                                        />

                                        <Text style={styles.label}>FOR DATE</Text>
                                        <TouchableOpacity
                                            style={styles.dateDisplay}
                                            onPress={() => {
                                                setShowDatePicker(true);
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                            }}
                                        >
                                            <Text style={styles.dateDisplayText}>{selectedDate}</Text>
                                            <MaterialIcons name="event" size={16} color="#00E5FF" />
                                        </TouchableOpacity>
                                    </>
                                )}
                            </View>

                            {/* Right Column - Duration & Actions */}
                            <View style={styles.rightColumn}>
                                <Text style={[styles.label, { textAlign: 'center' }]}>DURATION</Text>
                                <View style={styles.pickerRow}>
                                    <View style={styles.pickerGroup}>
                                        <WheelPicker data={HOURS} value={hours} onChange={setHours} />
                                        <Text style={styles.pickerLabel}>HRS</Text>
                                    </View>
                                    <Text style={styles.colon}>:</Text>
                                    <View style={styles.pickerGroup}>
                                        <WheelPicker data={MINUTES} value={minutes} onChange={setMinutes} />
                                        <Text style={styles.pickerLabel}>MIN</Text>
                                    </View>
                                    <Text style={styles.colon}>:</Text>
                                    <View style={styles.pickerGroup}>
                                        <WheelPicker data={SECONDS} value={seconds} onChange={setSeconds} />
                                        <Text style={styles.pickerLabel}>SEC</Text>
                                    </View>
                                </View>

                                <View style={styles.landscapeActions}>
                                    <TouchableOpacity onPress={handleAdd} style={[styles.addBtn, { flex: 1, marginBottom: 0 }]} activeOpacity={0.7}>
                                        <Text style={styles.addBtnText}>Add Timer</Text>
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
                                    {/* Title */}
                                    <Text style={styles.title}>New Timer</Text>
                                    <Text style={styles.subtitle}>FOCUS SESSION</Text>

                                    {/* Timer Name */}
                                    <Text style={styles.label}>TIMER NAME</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={name}
                                        onChangeText={setName}
                                        placeholder="e.g. Creative Flow"
                                        placeholderTextColor="rgba(255,255,255,0.3)"
                                    />

                                    <Text style={styles.label}>FOR DATE</Text>
                                    <TouchableOpacity
                                        style={[styles.dateDisplay, { marginBottom: 24 }]}
                                        onPress={() => {
                                            setShowDatePicker(true);
                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        }}
                                    >
                                        <Text style={styles.dateDisplayText}>{selectedDate}</Text>
                                        <MaterialIcons name="event" size={16} color="#00E5FF" />
                                    </TouchableOpacity>

                                    {/* Duration with Wheel Pickers */}
                                    <Text style={styles.label}>DURATION</Text>
                                    <View style={styles.pickerRow}>
                                        <View style={styles.pickerGroup}>
                                            <WheelPicker data={HOURS} value={hours} onChange={setHours} />
                                            <Text style={styles.pickerLabel}>HRS</Text>
                                        </View>
                                        <Text style={styles.colon}>:</Text>
                                        <View style={styles.pickerGroup}>
                                            <WheelPicker data={MINUTES} value={minutes} onChange={setMinutes} />
                                            <Text style={styles.pickerLabel}>MIN</Text>
                                        </View>
                                        <Text style={styles.colon}>:</Text>
                                        <View style={styles.pickerGroup}>
                                            <WheelPicker data={SECONDS} value={seconds} onChange={setSeconds} />
                                            <Text style={styles.pickerLabel}>SEC</Text>
                                        </View>
                                    </View>

                                    {/* Add Timer Button */}
                                    <TouchableOpacity onPress={handleAdd} style={styles.addBtn} activeOpacity={0.7}>
                                        <Text style={styles.addBtnText}>Add Timer</Text>
                                    </TouchableOpacity>

                                    {/* Cancel */}
                                    <TouchableOpacity onPress={handleCancel} activeOpacity={0.7}>
                                        <Text style={styles.cancelText}>Cancel</Text>
                                    </TouchableOpacity>
                                </>
                            )}
                        </>
                    )}
                </View>
            </View>
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
        backgroundColor: 'rgba(0,0,0,0.5)',
    },

    modal: {
        width: SCREEN_WIDTH * 0.88,
        maxWidth: 400,
        backgroundColor: 'rgba(25, 35, 45, 0.95)',
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
        paddingTop: 24,
        paddingBottom: 20,
    },

    landscapeContainer: {
        flexDirection: 'row',
        gap: 24,
    },

    leftColumn: {
        flex: 1.2,
        justifyContent: 'center',
    },

    rightColumn: {
        flex: 1,
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
        marginBottom: 32,
    },

    label: {
        fontSize: 11,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 1.5,
        marginBottom: 10,
    },

    input: {
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderRadius: 16,
        paddingHorizontal: 18,
        paddingVertical: 16,
        color: '#fff',
        fontSize: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        marginBottom: 24,
    },

    pickerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 32,
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
        color: 'rgba(0,229,255,0.4)',
        marginHorizontal: 10,
        marginBottom: 24,
    },

    addBtn: {
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: 'rgba(0,229,255,0.5)',
        paddingVertical: 16,
        alignItems: 'center',
        marginBottom: 16,
    },

    addBtnText: {
        fontSize: 17,
        fontWeight: '600',
        color: '#00E5FF',
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
        color: '#00E5FF',
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
        backgroundColor: '#00E5FF',
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
});
