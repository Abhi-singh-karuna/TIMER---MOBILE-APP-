import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TextInput,
    useWindowDimensions,
    Platform,
    Dimensions,
    Pressable,
    Keyboard,
    NativeSyntheticEvent,
    NativeScrollEvent,
} from 'react-native';
import { ScrollView, GestureHandlerRootView } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ITEM_HEIGHT = 39.6; // 44 * 0.9

const generateNumbers = (max: number) => Array.from({ length: max + 1 }, (_, i) => i);
const HOURS_DATA = generateNumbers(23);
const MINUTES_DATA = generateNumbers(59);

// Wheel Picker Component
const WheelPicker = ({ data, value, onChange }: { data: number[]; value: number; onChange: (v: number) => void }) => {
    const scrollRef = useRef<any>(null);
    const lastIndex = useRef(value);

    useEffect(() => {
        const idx = data.indexOf(value);
        if (idx >= 0) {
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
                decelerationRate={0.98}
                bounces={true}
                scrollEventThrottle={8}
                onScroll={handleScroll}
                onMomentumScrollEnd={handleEnd}
                onScrollEndDrag={(e) => { if (e.nativeEvent.velocity?.y === 0) handleEnd(e); }}
                contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
                nestedScrollEnabled={true}
                canCancelContentTouches={false}
                pagingEnabled={false}
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

interface AddSubtaskModalProps {
    visible: boolean;
    taskId: number | null;
    startTimeMinutes: number;
    onClose: () => void;
    onAdd: (taskId: number, title: string, startTimeMinutes: number, durationMinutes: number) => void;
    // Edit mode props
    mode?: 'add' | 'edit';
    stageId?: number | null;
    existingText?: string;
    existingStartTime?: number;
    existingDuration?: number;
    onUpdate?: (taskId: number, stageId: number, title: string, startTimeMinutes: number, durationMinutes: number) => void;
}

export default function AddSubtaskModal({
    visible,
    taskId,
    startTimeMinutes,
    onClose,
    onAdd,
    mode = 'add',
    stageId = null,
    existingText = '',
    existingStartTime,
    existingDuration,
    onUpdate,
}: AddSubtaskModalProps) {
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const isLandscape = screenWidth > screenHeight;

    const [text, setText] = useState('');
    const [selectedStartMinutes, setSelectedStartMinutes] = useState(startTimeMinutes);
    const [selectedDurationMinutes, setSelectedDurationMinutes] = useState(60); // Default 1 hour
    const [activePicker, setActivePicker] = useState<'start' | 'duration'>('start');
    const [errorName, setErrorName] = useState(false);

    useEffect(() => {
        if (visible) {
            if (mode === 'edit' && existingText && existingStartTime !== undefined && existingDuration !== undefined) {
                // Edit mode: pre-fill with existing data
                setText(existingText);
                setSelectedStartMinutes(existingStartTime);
                setSelectedDurationMinutes(existingDuration);
            } else {
                // Add mode: use defaults
                setText('');
                setSelectedStartMinutes(startTimeMinutes);
                setSelectedDurationMinutes(60);
            }
            setActivePicker('start');
            setErrorName(false);
        }
    }, [visible, startTimeMinutes, mode, existingText, existingStartTime, existingDuration]);

    const handleConfirm = () => {
        const hasName = text.trim().length > 0;
        setErrorName(!hasName);

        if (hasName && taskId !== null) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            if (mode === 'edit' && stageId !== null && onUpdate) {
                onUpdate(taskId, stageId, text.trim(), selectedStartMinutes, selectedDurationMinutes);
            } else {
                onAdd(taskId, text.trim(), selectedStartMinutes, selectedDurationMinutes);
            }
        } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
    };

    const startHours = Math.floor(selectedStartMinutes / 60);
    const startMins = selectedStartMinutes % 60;

    const durationHours = Math.floor(selectedDurationMinutes / 60);
    const durationMins = selectedDurationMinutes % 60;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={() => {
                // Prevent closing on back button - only allow Cancel button
                Keyboard.dismiss();
            }}
            supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}
        >
            <GestureHandlerRootView style={{ flex: 1 }}>
                <Pressable
                    style={styles.overlay}
                    onPress={() => {
                        // Prevent closing on backdrop press - only dismiss keyboard
                        Keyboard.dismiss();
                    }}
                >
                    {Platform.OS !== 'web' && <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />}
                    <View style={styles.dimLayer} pointerEvents="none" />

                    <Pressable
                        style={[styles.modal, isLandscape ? styles.modalLandscape : styles.modalPortrait]}
                        onPress={(e) => e.stopPropagation()}
                    >
                        <Text style={styles.title}>{mode === 'edit' ? 'EDIT SUBTASK' : 'ADD SUBTASK'}</Text>

                        {isLandscape ? (
                            <View style={styles.landscapeContainer}>
                                {/* Left Column: Input + Selected Times */}
                                <View style={styles.leftColumn}>
                                    <View style={styles.fieldGroup}>
                                        <Text style={styles.label}>SUBTASK NAME</Text>
                                        <TextInput
                                            style={[
                                                styles.input,
                                                styles.compactInput,
                                                errorName && styles.inputError
                                            ]}
                                            placeholder="Subtask name..."
                                            placeholderTextColor="rgba(255,255,255,0.3)"
                                            value={text}
                                            onChangeText={(val) => {
                                                setText(val);
                                                if (val.trim()) setErrorName(false);
                                            }}
                                            autoFocus
                                        />
                                    </View>

                                    <View style={styles.infoSelectorsLandscape}>
                                        <Pressable
                                            style={[styles.infoCard, activePicker === 'start' && styles.infoCardActive]}
                                            onPress={() => {
                                                setActivePicker('start');
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                            }}
                                        >
                                            <Text style={styles.infoCardLabel}>START</Text>
                                            <Text style={[styles.infoCardValue, activePicker === 'start' && styles.infoCardValueActive]}>
                                                {String(startHours).padStart(2, '0')}:{String(startMins).padStart(2, '0')}
                                            </Text>
                                        </Pressable>

                                        <Pressable
                                            style={[styles.infoCard, activePicker === 'duration' && styles.infoCardActive]}
                                            onPress={() => {
                                                setActivePicker('duration');
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                            }}
                                        >
                                            <Text style={styles.infoCardLabel}>DURATION</Text>
                                            <Text style={[styles.infoCardValue, activePicker === 'duration' && styles.infoCardValueActive]}>
                                                {durationHours}h {durationMins}m
                                            </Text>
                                        </Pressable>
                                    </View>

                                    <View style={styles.schedulerHint}>
                                        <MaterialIcons name="auto-awesome" size={12.6} color="rgba(255,255,255,0.4)" />
                                        <Text style={styles.timeText}>
                                            At {String(startHours).padStart(2, '0')}:{String(startMins).padStart(2, '0')} for {durationHours}h {durationMins}m
                                        </Text>
                                    </View>
                                </View>

                                {/* Right Column: Scroller + Actions */}
                                <View style={styles.rightColumn}>
                                    <Text style={[styles.label, { textAlign: 'center' }]}>
                                        {activePicker === 'start' ? 'START TIME' : 'DURATION'}
                                    </Text>

                                    <View style={[styles.pickerRow, styles.pickerRowLandscape]}>
                                        <View style={styles.pickerGroup}>
                                            <WheelPicker
                                                data={HOURS_DATA}
                                                value={activePicker === 'start' ? startHours : durationHours}
                                                onChange={(h) => {
                                                    if (activePicker === 'start') setSelectedStartMinutes(h * 60 + startMins);
                                                    else setSelectedDurationMinutes(h * 60 + durationMins);
                                                }}
                                            />
                                            <Text style={styles.pickerLabel}>{activePicker === 'start' ? 'HH' : 'HRS'}</Text>
                                        </View>

                                        <Text style={[styles.colon, styles.colonLandscape]}>:</Text>

                                        <View style={styles.pickerGroup}>
                                            <WheelPicker
                                                data={MINUTES_DATA}
                                                value={activePicker === 'start' ? startMins : durationMins}
                                                onChange={(m) => {
                                                    if (activePicker === 'start') setSelectedStartMinutes(startHours * 60 + m);
                                                    else setSelectedDurationMinutes(durationHours * 60 + m);
                                                }}
                                            />
                                            <Text style={styles.pickerLabel}>{activePicker === 'start' ? 'MM' : 'MIN'}</Text>
                                        </View>
                                    </View>

                                    <View style={styles.landscapeActions}>
                                        <Pressable
                                            style={styles.addBtn}
                                            onPress={handleConfirm}
                                        >
                                            <Text style={styles.addBtnText}>{mode === 'edit' ? 'Update' : 'Add'}</Text>
                                        </Pressable>
                                        <Pressable onPress={onClose} style={styles.landscapeCancel}>
                                            <Text style={styles.cancelText}>Cancel</Text>
                                        </Pressable>
                                    </View>
                                </View>
                            </View>
                        ) : (
                            <>
                                <TextInput
                                    style={[styles.input, errorName && styles.inputError]}
                                    placeholder="Subtask name..."
                                    placeholderTextColor="rgba(255,255,255,0.4)"
                                    value={text}
                                    onChangeText={(val) => {
                                        setText(val);
                                        if (val.trim()) setErrorName(false);
                                    }}
                                    autoFocus
                                />

                                <View style={[styles.pickerContainer]}>
                                    <View style={styles.toggleContainer}>
                                        <Pressable
                                            style={[styles.toggleBtn, activePicker === 'start' && styles.toggleBtnActive]}
                                            onPress={() => {
                                                setActivePicker('start');
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                            }}
                                        >
                                            <Text style={[styles.toggleText, activePicker === 'start' && styles.toggleTextActive]}>START TIME</Text>
                                        </Pressable>
                                        <Pressable
                                            style={[styles.toggleBtn, activePicker === 'duration' && styles.toggleBtnActive]}
                                            onPress={() => {
                                                setActivePicker('duration');
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                            }}
                                        >
                                            <Text style={[styles.toggleText, activePicker === 'duration' && styles.toggleTextActive]}>DURATION</Text>
                                        </Pressable>
                                    </View>

                                    <View style={styles.timePickerRow}>
                                        <View style={styles.pickerGroup}>
                                            <WheelPicker
                                                data={HOURS_DATA}
                                                value={activePicker === 'start' ? startHours : durationHours}
                                                onChange={(h) => {
                                                    if (activePicker === 'start') setSelectedStartMinutes(h * 60 + startMins);
                                                    else setSelectedDurationMinutes(h * 60 + durationMins);
                                                }}
                                            />
                                            <Text style={styles.pickerLabel}>{activePicker === 'start' ? 'HH' : 'HRS'}</Text>
                                        </View>

                                        <Text style={styles.colon}>:</Text>

                                        <View style={styles.pickerGroup}>
                                            <WheelPicker
                                                data={MINUTES_DATA}
                                                value={activePicker === 'start' ? startMins : durationMins}
                                                onChange={(m) => {
                                                    if (activePicker === 'start') setSelectedStartMinutes(startHours * 60 + m);
                                                    else setSelectedDurationMinutes(durationHours * 60 + m);
                                                }}
                                            />
                                            <Text style={styles.pickerLabel}>{activePicker === 'start' ? 'MM' : 'MIN'}</Text>
                                        </View>
                                    </View>
                                </View>

                                <View style={styles.timeInfo}>
                                    <MaterialIcons name="schedule" size={14.4} color="rgba(255,255,255,0.5)" />
                                    <Text style={styles.timeText}>
                                        {durationHours > 0 ? `${durationHours}h ` : ''}{durationMins}m from {String(startHours).padStart(2, '0')}:{String(startMins).padStart(2, '0')}
                                    </Text>
                                </View>

                                <View style={styles.actions}>
                                    <Pressable
                                        style={[styles.button, styles.cancelButton]}
                                        onPress={onClose}
                                    >
                                        <Text style={styles.buttonText}>CANCEL</Text>
                                    </Pressable>

                                    <Pressable
                                        style={[styles.button, styles.confirmButton]}
                                        onPress={handleConfirm}
                                    >
                                        <Text style={[styles.buttonText, styles.confirmText]}>
                                            {mode === 'edit' ? 'UPDATE SUBTASK' : 'ADD SUBTASK'}
                                        </Text>
                                    </Pressable>
                                </View>
                            </>
                        )}
                    </Pressable>
                </Pressable>
            </GestureHandlerRootView>
        </Modal >
    );
}

const pickerStyles = StyleSheet.create({
    container: {
        height: ITEM_HEIGHT * 3,
        width: 63, // 70 * 0.9
        borderRadius: 12.6, // 14 * 0.9
        overflow: 'hidden',
        backgroundColor: 'rgba(30,30,30,0.4)',
    },
    highlight: {
        position: 'absolute',
        top: ITEM_HEIGHT,
        left: 2.7, // 3 * 0.9
        right: 2.7, // 3 * 0.9
        height: ITEM_HEIGHT,
        borderRadius: 9.9, // 11 * 0.9
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
        fontSize: 21.6, // 24 * 0.9
        fontWeight: '400',
        color: '#FFFFFF',
    },
});

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 18, // 20 * 0.9
    },
    dimLayer: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.7)',
    },
    modal: {
        width: SCREEN_WIDTH * 0.88,
        maxWidth: 360, // 400 * 0.9
        backgroundColor: '#000',
        borderRadius: 25.2, // 28 * 0.9
        paddingTop: 18, // 20 * 0.9
        paddingBottom: 18, // 20 * 0.9
        paddingHorizontal: 18, // 20 * 0.9
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 9 }, // 10 * 0.9
        shadowOpacity: 0.5,
        shadowRadius: 18, // 20 * 0.9
        elevation: 20,
        ...(Platform.OS !== 'web' && { maxHeight: '90%' }),
    },
    modalPortrait: {
        // keeps defaults
    },
    modalLandscape: {
        width: '90%',
        maxWidth: 585, // 650 * 0.9
        paddingTop: 25.2, // 28 * 0.9
        paddingBottom: 21.6, // 24 * 0.9
        paddingHorizontal: 21.6, // 24 * 0.9
    },
    landscapeContainer: {
        flexDirection: 'row',
        gap: 36, // 40 * 0.9
        alignItems: 'center',
    },
    leftColumn: {
        flex: 1.2,
        justifyContent: 'flex-start',
    },
    rightColumn: {
        flex: 1,
        justifyContent: 'center',
    },
    fieldGroup: {
        marginBottom: 18, // 20 * 0.9
        width: '100%',
    },
    compactInput: {
        marginBottom: 0,
        paddingVertical: 10.8, // 12 * 0.9
        width: '100%',
    },
    infoSelectors: {
        gap: 10.8, // 12 * 0.9
        marginBottom: 18, // 20 * 0.9
    },
    infoSelectorsLandscape: {
        flexDirection: 'row',
        gap: 10.8, // 12 * 0.9
        marginBottom: 21.6, // 24 * 0.9
    },
    schedulerHint: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 9, // 10 * 0.9
    },
    infoCard: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 14.4, // 16 * 0.9
        padding: 14.4, // 16 * 0.9
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
    },
    infoCardActive: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderColor: 'rgba(255,255,255,0.2)',
    },
    infoCardLabel: {
        fontSize: 8.1, // 9 * 0.9
        fontWeight: '800',
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 1.35, // 1.5 * 0.9
        marginBottom: 5.4, // 6 * 0.9
        textAlign: 'center',
    },
    infoCardValue: {
        fontSize: 16.2, // 18 * 0.9
        fontWeight: '700',
        color: 'rgba(255,255,255,0.5)',
    },
    infoCardValueActive: {
        color: '#FFFFFF',
    },
    title: {
        fontSize: 12.6, // 14 * 0.9
        fontWeight: '800',
        color: '#FFFFFF',
        marginBottom: 21.6, // 24 * 0.9
        textAlign: 'center',
        letterSpacing: 1.8, // 2 * 0.9
    },
    label: {
        fontSize: 9.9, // 11 * 0.9
        fontWeight: '600',
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 1.35, // 1.5 * 0.9
        marginBottom: 9, // 10 * 0.9
    },
    input: {
        backgroundColor: 'rgba(20,20,20,0.5)',
        borderRadius: 14.4, // 16 * 0.9
        paddingHorizontal: 16.2, // 18 * 0.9
        paddingVertical: 14.4, // 16 * 0.9
        fontSize: 14.4, // 16 * 0.9
        color: '#FFFFFF',
        marginBottom: 14.4, // 16 * 0.9
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        width: '100%',
    },
    inputError: {
        borderColor: '#FF5050',
        backgroundColor: 'rgba(255, 80, 80, 0.05)',
    },
    pickerContainer: {
        marginBottom: 18, // 20 * 0.9
    },
    pickerContainerLandscape: {
        marginBottom: 10.8, // 12 * 0.9
    },
    toggleContainer: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 10.8, // 12 * 0.9
        padding: 3.6, // 4 * 0.9
        marginBottom: 14.4, // 16 * 0.9
    },
    toggleBtn: {
        flex: 1,
        paddingVertical: 7.2, // 8 * 0.9
        alignItems: 'center',
        borderRadius: 7.2, // 8 * 0.9
    },
    toggleBtnActive: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    toggleText: {
        fontSize: 9, // 10 * 0.9
        fontWeight: '700',
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 0.9, // 1 * 0.9
    },
    toggleTextActive: {
        color: '#FFFFFF',
    },
    timePickerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    pickerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 14.4, // 16 * 0.9
        padding: 3.6, // 4 * 0.9
        borderRadius: 16.2, // 18 * 0.9
        borderWidth: 1,
        borderColor: 'transparent',
    },
    pickerRowLandscape: {
        marginBottom: 10.8, // 12 * 0.9
        paddingHorizontal: 10.8, // 12 * 0.9
        paddingVertical: 1.8, // 2 * 0.9
    },
    pickerGroup: {
        alignItems: 'center',
    },
    pickerLabel: {
        fontSize: 9.9, // 11 * 0.9
        color: 'rgba(255,255,255,0.4)',
        marginTop: 7.2, // 8 * 0.9
        fontWeight: '500',
        letterSpacing: 0.9, // 1 * 0.9
    },
    colon: {
        fontSize: 25.2, // 28 * 0.9
        color: 'rgba(255, 255, 255, 0.45)',
        marginHorizontal: 9, // 10 * 0.9
        marginBottom: 21.6, // 24 * 0.9
    },
    colonLandscape: {
        marginHorizontal: 5.4, // 6 * 0.9
        marginBottom: 12.6, // 14 * 0.9
    },
    timeInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 21.6, // 24 * 0.9
        justifyContent: 'center',
    },
    timeText: {
        fontSize: 10.8, // 12 * 0.9
        fontWeight: '500',
        color: 'rgba(255,255,255,0.35)',
        marginLeft: 5.4, // 6 * 0.9
        letterSpacing: 0.9, // 1 * 0.9
    },
    actions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 10.8, // 12 * 0.9
    },
    landscapeActions: {
        flexDirection: 'row',
        width: '100%',
        alignItems: 'center',
        gap: 14.4, // 16 * 0.9
        marginTop: 7.2, // 8 * 0.9
    },
    landscapeCancel: {
        paddingHorizontal: 10.8, // 12 * 0.9
    },
    button: {
        flex: 1,
        paddingVertical: 12.6, // 14 * 0.9
        borderRadius: 12.6, // 14 * 0.9
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelButton: {
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    confirmButton: {
        backgroundColor: '#FFFFFF',
    },
    confirmButtonDisabled: {
        opacity: 0.5,
    },
    buttonText: {
        fontSize: 10.8, // 12 * 0.9
        fontWeight: '700',
        color: 'rgba(255,255,255,0.6)',
        letterSpacing: 1.08, // 1.2 * 0.9
    },
    confirmText: {
        color: '#000',
        fontWeight: '800',
    },
    addBtn: {
        flex: 1,
        borderRadius: 14.4, // 16 * 0.9
        backgroundColor: '#FFFFFF',
        paddingVertical: 12.6, // 14 * 0.9
        alignItems: 'center',
    },
    addBtnDisabled: {
        opacity: 0.5,
    },
    addBtnText: {
        fontSize: 14.4, // 16 * 0.9
        fontWeight: '700',
        color: '#000000',
    },
    cancelText: {
        fontSize: 13.5, // 15 * 0.9
        fontWeight: '500',
        color: 'rgba(255,255,255,0.45)',
        textAlign: 'center',
    },
});
