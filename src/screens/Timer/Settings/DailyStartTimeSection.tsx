import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    Modal,
    Pressable,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    NativeSyntheticEvent,
    NativeScrollEvent,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { formatDailyStartForDisplay } from '../../../utils/dailyStartTime';
import { styles as sharedStyles } from './styles';

const ITEM_HEIGHT = 44;
const generate = (max: number) => Array.from({ length: max + 1 }, (_, i) => i);
const HOURS = generate(23);
const MINUTES = generate(59);

function WheelPicker({
    data,
    value,
    onChange,
}: { data: number[]; value: number; onChange: (v: number) => void }) {
    const scrollRef = useRef<ScrollView>(null);
    const lastIndex = useRef(data.indexOf(value) >= 0 ? data.indexOf(value) : -1);

    useEffect(() => {
        const idx = data.indexOf(value);
        if (idx >= 0) {
            const timer = setTimeout(() => {
                scrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: false });
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [value, data]);

    const handleScroll = useCallback(
        (e: NativeSyntheticEvent<NativeScrollEvent>) => {
            const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
            const clamped = Math.max(0, Math.min(idx, data.length - 1));
            if (clamped !== lastIndex.current) {
                lastIndex.current = clamped;
                Haptics.selectionAsync();
            }
        },
        [data.length]
    );

    const handleEnd = useCallback(
        (e: NativeSyntheticEvent<NativeScrollEvent>) => {
            const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
            const clamped = Math.max(0, Math.min(idx, data.length - 1));
            onChange(data[clamped]);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
        [data, onChange]
    );

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
                onScrollEndDrag={(e) => {
                    if (e.nativeEvent.velocity?.y === 0) handleEnd(e);
                }}
                contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
                nestedScrollEnabled={true}
                canCancelContentTouches={false}
            >
                {data.map((n) => (
                    <View key={n} style={pickerStyles.item}>
                        <Text style={pickerStyles.text}>{String(n).padStart(2, '0')}</Text>
                    </View>
                ))}
            </ScrollView>
        </View>
    );
}

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
    item: {
        height: ITEM_HEIGHT,
        alignItems: 'center',
        justifyContent: 'center',
    },
    text: {
        fontSize: 24,
        fontWeight: '400',
        color: '#FFFFFF',
    },
});

export interface DailyStartTimeSectionProps {
    isLandscape?: boolean;
    dailyStartMinutes: number;
    onDailyStartMinutesChange: (minutes: number) => void;
}

export default function DailyStartTimeSection({
    isLandscape = false,
    dailyStartMinutes,
    onDailyStartMinutesChange,
}: DailyStartTimeSectionProps) {
    const [pickerVisible, setPickerVisible] = useState(false);
    const [hour, setHour] = useState(Math.floor(dailyStartMinutes / 60));
    const [minute, setMinute] = useState(dailyStartMinutes % 60);

    useEffect(() => {
        if (pickerVisible) {
            setHour(Math.floor(dailyStartMinutes / 60));
            setMinute(dailyStartMinutes % 60);
        }
    }, [pickerVisible, dailyStartMinutes]);

    const open = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setPickerVisible(true);
    };

    const confirm = () => {
        const m = Math.max(0, Math.min(23 * 60 + 59, hour * 60 + minute));
        onDailyStartMinutesChange(m);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPickerVisible(false);
    };

    const cancel = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setPickerVisible(false);
    };

    return (
        <>
            <TouchableOpacity style={sharedStyles.settingRow} onPress={open} activeOpacity={0.7}>
                <View style={sharedStyles.settingInfo}>
                    <Text style={sharedStyles.settingLabel}>Daily start time</Text>
                    <Text style={sharedStyles.settingDescription}>
                        When the calendar day rolls over. Tasks, timers, and Live Focus use this.
                    </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.9)' }}>
                        {formatDailyStartForDisplay(dailyStartMinutes)}
                    </Text>
                    <MaterialIcons name="chevron-right" size={18} color="rgba(255,255,255,0.35)" />
                </View>
            </TouchableOpacity>

            <Modal
                visible={pickerVisible}
                transparent
                animationType="fade"
                onRequestClose={cancel}
                supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}
            >
                <GestureHandlerRootView style={{ flex: 1 }}>
                    <Pressable style={modalStyles.overlay} onPress={cancel}>
                        <Pressable style={modalStyles.card} onPress={(e) => e.stopPropagation()}>
                            <Text style={modalStyles.title}>DAILY START TIME</Text>
                            <Text style={modalStyles.subtitle}>Default: 6:00 AM</Text>
                            <View style={modalStyles.timeWheelRow}>
                                <View style={modalStyles.timeWheelGroup}>
                                    <WheelPicker data={HOURS} value={hour} onChange={setHour} />
                                    <Text style={modalStyles.timeWheelLabel}>HH</Text>
                                </View>
                                <Text style={modalStyles.colon}>:</Text>
                                <View style={modalStyles.timeWheelGroup}>
                                    <WheelPicker data={MINUTES} value={minute} onChange={setMinute} />
                                    <Text style={modalStyles.timeWheelLabel}>MM</Text>
                                </View>
                            </View>
                            <View style={modalStyles.timeModalActions}>
                                <TouchableOpacity style={modalStyles.actionBtn} onPress={cancel} activeOpacity={0.75}>
                                    <Text style={modalStyles.actionBtnText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={modalStyles.actionBtnPrimary} onPress={confirm} activeOpacity={0.75}>
                                    <Text style={modalStyles.actionBtnTextPrimary}>Set</Text>
                                </TouchableOpacity>
                            </View>
                        </Pressable>
                    </Pressable>
                </GestureHandlerRootView>
            </Modal>
        </>
    );
}

// Matches TimeOfDayBackgroundScreen time wheel modal (modalOverlay, timeModal, timeModalTitle, timeWheelRow, actionBtn, actionBtnPrimary)
const modalStyles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.75)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 18,
    },
    card: {
        width: '92%',
        maxWidth: 420,
        backgroundColor: '#000',
        borderRadius: 22,
        padding: 18,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
    },
    title: {
        textAlign: 'center',
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 2,
        color: '#fff',
        marginBottom: 4,
    },
    subtitle: {
        textAlign: 'center',
        fontSize: 11,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.4)',
        marginBottom: 14,
    },
    timeWheelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 14,
    },
    timeWheelGroup: {
        alignItems: 'center',
    },
    timeWheelLabel: {
        marginTop: 8,
        fontSize: 11,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 1,
    },
    colon: {
        fontSize: 28,
        color: 'rgba(255, 255, 255, 0.45)',
        marginHorizontal: 10,
        marginBottom: 24,
    },
    timeModalActions: {
        flexDirection: 'row',
        gap: 12,
        justifyContent: 'space-between',
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    actionBtnText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '800',
    },
    actionBtnPrimary: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 14,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    actionBtnTextPrimary: {
        color: '#000',
        fontSize: 13,
        fontWeight: '900',
    },
});
