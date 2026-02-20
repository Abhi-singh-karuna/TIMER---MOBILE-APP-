import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Modal,
    TextInput,
    Alert,
    Platform,
    TouchableWithoutFeedback,
    KeyboardAvoidingView
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { styles } from './styles';
import { LEAVE_DAYS_KEY, LeaveDay } from '../../../constants/data';

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

// Helper functions for calendar
const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();
const formatDate = (date: Date) => {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
};

function LeaveActionModal({
    visible,
    selectedDate,
    existingReason,
    isLandscape,
    onClose,
    onSave,
    onDelete,
}: {
    visible: boolean;
    selectedDate: string | null;
    existingReason?: string;
    isLandscape: boolean;
    onClose: () => void;
    onSave: (date: string, reason: string) => void;
    onDelete: (date: string) => void;
}) {
    const [mode, setMode] = useState<'view' | 'edit' | 'add'>('add');
    const [reason, setReason] = useState('');

    useEffect(() => {
        if (visible) {
            if (existingReason !== undefined) {
                setMode('view');
                setReason(existingReason);
            } else {
                setMode('add');
                setReason('');
            }
        }
    }, [existingReason, visible]);

    const handleSave = () => {
        if (selectedDate) {
            onSave(selectedDate, reason);
            onClose();
        }
    };

    const handleDelete = () => {
        if (selectedDate) {
            onDelete(selectedDate);
            onClose();
        }
    };

    if (!visible || !selectedDate) return null;

    const formattedDate = new Date(selectedDate).toDateString();

    // Auto-focus only in edit/add mode
    const isEditing = mode === 'edit' || mode === 'add';

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
            supportedOrientations={['portrait', 'landscape']}
        >
            <TouchableWithoutFeedback onPress={onClose}>
                <View style={modalStyles.overlay}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={[modalStyles.keyboardView, isLandscape && { justifyContent: 'center' }]}
                    >
                        <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                            <View style={styles.settingsCardBezel}>
                                <View style={[
                                    styles.settingsCardTrack,
                                    modalStyles.card,
                                    isLandscape && { width: '100%', maxWidth: 500, flexDirection: 'row', gap: 20, alignItems: 'center' }
                                ]}>
                                    <View style={{ flex: 1 }}>
                                        {/* Compact Header */}
                                        <View style={[modalStyles.headerRow, isLandscape && { marginBottom: 12 }]}>
                                            <View>
                                                <Text style={modalStyles.modalTitle}>
                                                    {mode === 'add' ? 'ADD LEAVE' : (mode === 'edit' ? 'EDIT LEAVE' : 'LEAVE DETAILS')}
                                                </Text>
                                                <Text style={modalStyles.modalSubtitle}>
                                                    {formattedDate}
                                                </Text>
                                            </View>

                                            {/* Close Button Top-Right for View Mode */}
                                            {mode === 'view' && (
                                                <TouchableOpacity style={modalStyles.iconBtn} onPress={onClose}>
                                                    <MaterialIcons name="close" size={22} color="rgba(255,255,255,0.6)" />
                                                </TouchableOpacity>
                                            )}
                                        </View>

                                        {mode === 'view' ? (
                                            <View style={modalStyles.viewContent}>
                                                <Text style={modalStyles.inputLabel}>REASON</Text>
                                                <View style={modalStyles.reasonWell}>
                                                    <Text style={[
                                                        modalStyles.viewReasonText,
                                                        !existingReason && { color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }
                                                    ]}>
                                                        {existingReason || "No reason provided"}
                                                    </Text>
                                                </View>

                                                <View style={modalStyles.viewActions}>
                                                    <TouchableOpacity
                                                        style={modalStyles.destructiveBtn}
                                                        onPress={handleDelete}
                                                    >
                                                        <MaterialIcons name="delete-outline" size={20} color="#FF3B30" />
                                                        <Text style={modalStyles.destructiveBtnText}>DELETE</Text>
                                                    </TouchableOpacity>

                                                    <TouchableOpacity
                                                        style={modalStyles.primaryActionBtn}
                                                        onPress={() => setMode('edit')}
                                                    >
                                                        <MaterialIcons name="edit" size={18} color="#000" />
                                                        <Text style={modalStyles.primaryActionBtnText}>EDIT</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        ) : (
                                            <View>
                                                <Text style={modalStyles.inputLabel}>DESCRIBE LEAVE</Text>
                                                <TextInput
                                                    style={modalStyles.input3D}
                                                    value={reason}
                                                    onChangeText={setReason}
                                                    placeholder="Enter reason (optional)..."
                                                    placeholderTextColor="rgba(255,255,255,0.15)"
                                                    autoFocus={true}
                                                    multiline
                                                />

                                                <View style={modalStyles.editActions}>
                                                    <TouchableOpacity
                                                        style={modalStyles.btnCancel3D}
                                                        onPress={() => {
                                                            if (mode === 'edit') setMode('view');
                                                            else onClose();
                                                        }}
                                                    >
                                                        <Text style={modalStyles.btnText3D}>CANCEL</Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity style={modalStyles.btnConfirm3D} onPress={handleSave}>
                                                        <Text style={modalStyles.btnTextPrimary3D}>SAVE</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        )}
                                    </View>
                                    <View style={styles.settingsCardInteriorShadow} pointerEvents="none" />
                                    <View style={styles.settingsCardTopRim} pointerEvents="none" />
                                </View>
                                <View style={styles.settingsCardOuterGlow} pointerEvents="none" />
                            </View>
                        </TouchableWithoutFeedback>
                    </KeyboardAvoidingView>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
}

function MultiDateCalendar({
    leaveDays,
    onDayPress,
    viewDate,
    onChangeViewDate,
    isLandscape,
}: {
    leaveDays: LeaveDay[];
    onDayPress: (dateStr: string) => void;
    viewDate: Date;
    onChangeViewDate: (date: Date) => void;
    isLandscape: boolean;
}) {
    const days = getDaysInMonth(viewDate.getFullYear(), viewDate.getMonth());
    const firstDay = getFirstDayOfMonth(viewDate.getFullYear(), viewDate.getMonth());
    const daysArray: { day: number; current: boolean }[] = [];

    const prevMonthDays = getDaysInMonth(viewDate.getFullYear(), viewDate.getMonth() - 1);
    for (let i = firstDay - 1; i >= 0; i--) {
        daysArray.push({ day: prevMonthDays - i, current: false });
    }
    for (let i = 1; i <= days; i++) {
        daysArray.push({ day: i, current: true });
    }
    const remaining = 42 - daysArray.length;
    for (let i = 1; i <= remaining; i++) {
        daysArray.push({ day: i, current: false });
    }

    const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    return (
        <View style={[styles.settingsCardBezel, isLandscape && { maxWidth: 420, alignSelf: 'center', width: '100%' }]}>
            <View style={[styles.settingsCardTrackUnifiedLarge, modalStyles.calendarCard, isLandscape && { paddingBottom: 16 }]}>
                <View style={modalStyles.calHeader}>
                    <View style={modalStyles.monthDisplayWell}>
                        <Text style={modalStyles.calTitle}>{MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}</Text>
                    </View>
                    <View style={modalStyles.calNavWell}>
                        <TouchableOpacity onPress={() => {
                            const nextDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
                            onChangeViewDate(nextDate);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        }} style={modalStyles.calNavChip}>
                            <MaterialIcons name="chevron-left" size={20} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => {
                            const nextDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
                            onChangeViewDate(nextDate);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        }} style={modalStyles.calNavChip}>
                            <MaterialIcons name="chevron-right" size={20} color="#fff" />
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={modalStyles.weekRow}>
                    {weekDays.map((d, i) => <Text key={i} style={modalStyles.weekText}>{d}</Text>)}
                </View>

                <View style={modalStyles.daysGrid}>
                    {daysArray.map((item, i) => {
                        const dateStr = item.current
                            ? formatDate(new Date(viewDate.getFullYear(), viewDate.getMonth(), item.day))
                            : '';
                        // Check if this date has a leave day
                        const leaveDay = item.current ? leaveDays.find(d => d.date === dateStr) : undefined;
                        const isSelected = !!leaveDay;
                        const isToday = item.current && formatDate(new Date()) === dateStr;

                        return (
                            <TouchableOpacity
                                key={i}
                                style={[modalStyles.dayCell, isLandscape && modalStyles.dayCellLandscape]}
                                disabled={!item.current}
                                onPress={() => {
                                    if (item.current) {
                                        onDayPress(dateStr);
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    }
                                }}
                            >
                                <View style={[
                                    modalStyles.daySlab,
                                    isLandscape && modalStyles.daySlabLandscape,
                                    !item.current && { opacity: 0.15 },
                                    isToday && modalStyles.todaySlab,
                                    isSelected && modalStyles.leaveSlab
                                ]}>
                                    {isSelected && (
                                        <LinearGradient
                                            colors={['rgba(76,175,80,0.3)', 'rgba(76,175,80,0.1)', 'transparent']}
                                            style={StyleSheet.absoluteFill}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 1 }}
                                        />
                                    )}
                                    <Text style={[
                                        modalStyles.dayText,
                                        isToday && { color: '#000', fontWeight: '900' },
                                        isSelected && { color: '#fff', fontWeight: '800' }
                                    ]}>{item.day}</Text>
                                    {isSelected && <View style={modalStyles.leaveIndicatorDot} />}
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>
                <View style={styles.settingsCardInteriorShadow} pointerEvents="none" />
                <View style={styles.settingsCardTopRim} pointerEvents="none" />
            </View>
            <View style={styles.settingsCardOuterGlow} pointerEvents="none" />
        </View>
    );
}

export interface LeaveSectionProps {
    isLandscape: boolean;
}

export default function LeaveSection({ isLandscape }: LeaveSectionProps) {
    const [leaveDays, setLeaveDays] = useState<LeaveDay[]>([]);
    const [viewDate, setViewDate] = useState(new Date());

    // Modal State
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [editingReason, setEditingReason] = useState<string | undefined>(undefined);

    useEffect(() => {
        loadLeaveDays();
    }, []);

    const loadLeaveDays = async () => {
        try {
            const stored = await AsyncStorage.getItem(LEAVE_DAYS_KEY);
            if (stored) {
                setLeaveDays(JSON.parse(stored));
            }
        } catch (e) {
            console.error("Failed to load leave days", e);
        }
    };

    const handleDayPress = (dateStr: string) => {
        const existing = leaveDays.find(d => d.date === dateStr);
        setSelectedDate(dateStr);
        // If existing, pass reason so it opens in View mode. If new, reason is undefined -> Add mode.
        setEditingReason(existing ? existing.reason : undefined);
        setModalVisible(true);
        Haptics.selectionAsync();
    };

    const handleSaveLeave = async (date: string, reason: string) => {
        const newEntry: LeaveDay = { date, reason: reason.trim() };

        // Remove existing if any (to update) or just add
        const others = leaveDays.filter(d => d.date !== date);
        const updated = [...others, newEntry].sort((a, b) => a.date.localeCompare(b.date));

        setLeaveDays(updated);
        await AsyncStorage.setItem(LEAVE_DAYS_KEY, JSON.stringify(updated));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };

    const handleDeleteLeave = async (date: string) => {
        const updated = leaveDays.filter(d => d.date !== date);
        setLeaveDays(updated);
        await AsyncStorage.setItem(LEAVE_DAYS_KEY, JSON.stringify(updated));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };

    return (
        <View style={styles.categoriesSection}>
            <View style={[styles.categoriesHeader, isLandscape && { marginTop: 4, marginBottom: 12 }]}>
                <Text style={isLandscape ? [styles.sectionTitleLandscape, { marginBottom: 0 }] : styles.sectionTitle}>
                    MANAGE LEAVE
                </Text>
            </View>

            <Text style={[styles.sectionDescription, { marginBottom: isLandscape ? 8 : 20 }]}>
                Tap a date to add or edit leave. Leave days are excluded from streak calculations.
            </Text>

            <View style={{ marginTop: isLandscape ? 4 : 16 }}>
                <MultiDateCalendar
                    leaveDays={leaveDays}
                    onDayPress={handleDayPress}
                    viewDate={viewDate}
                    onChangeViewDate={setViewDate}
                    isLandscape={isLandscape}
                />
            </View>

            <LeaveActionModal
                visible={modalVisible}
                selectedDate={selectedDate}
                existingReason={editingReason}
                isLandscape={isLandscape}
                onClose={() => setModalVisible(false)}
                onSave={handleSaveLeave}
                onDelete={handleDeleteLeave}
            />
        </View>
    );
}

const modalStyles = StyleSheet.create({
    calendarCard: {
        backgroundColor: '#0a0a0a',
        borderRadius: 24,
        padding: 16,
        paddingBottom: 24,
    },
    monthDisplayWell: {
        backgroundColor: 'rgba(255,255,255,0.03)',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 16,
        borderWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.3)',
        borderLeftColor: 'rgba(0,0,0,0.2)',
        borderRightColor: 'rgba(255,255,255,0.05)',
        borderBottomColor: 'rgba(255,255,255,0.08)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.5,
        shadowRadius: 4,
    },
    calNavWell: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.02)',
        borderRadius: 14,
        padding: 4,
        gap: 4,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    calNavChip: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
        borderLeftColor: 'rgba(255,255,255,0.05)',
        borderRightColor: 'rgba(0,0,0,0.2)',
        borderBottomColor: 'rgba(0,0,0,0.3)',
    },
    calHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    calTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#fff',
        letterSpacing: 0.5,
    },
    calNav: {
        flexDirection: 'row',
        gap: 16,
    },
    calNavBtn: {
        padding: 4,
    },
    weekRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
        paddingHorizontal: 4,
    },
    weekText: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 12,
        fontWeight: '600',
        width: 32,
        textAlign: 'center',
    },
    daysGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'flex-start',
    },
    dayCell: {
        width: '14.28%',
        aspectRatio: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 6,
    },
    dayCellLandscape: {
        aspectRatio: undefined,
        height: 40,
        marginBottom: 2,
    },
    daySlab: {
        width: 38,
        height: 38,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.08)',
        borderLeftColor: 'rgba(255,255,255,0.04)',
        borderRightColor: 'rgba(0,0,0,0.15)',
        borderBottomColor: 'rgba(0,0,0,0.25)',
        overflow: 'hidden',
    },
    daySlabLandscape: {
        width: 32,
        height: 32,
        borderRadius: 10,
    },
    todaySlab: {
        backgroundColor: '#fff',
        borderTopColor: 'rgba(255,255,255,1)',
        borderLeftColor: 'rgba(255,255,255,0.8)',
        shadowColor: '#fff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
        elevation: 5,
    },
    leaveSlab: {
        backgroundColor: '#1E3A20', // Darker forest green base
        borderColor: '#4CAF50',
        borderWidth: 1.5,
        shadowColor: '#4CAF50',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 8,
        elevation: 6,
    },
    leaveIndicatorDot: {
        position: 'absolute',
        bottom: 4,
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#4CAF50',
        shadowColor: '#4CAF50',
        shadowOpacity: 0.8,
        shadowRadius: 4,
    },
    dayText: {
        color: 'rgba(255,255,255,0.85)',
        fontSize: 14,
        fontWeight: '600',
    },
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.85)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    card: {
        backgroundColor: '#1C1C1E',
        borderRadius: 24,
        padding: 20,
        width: '85%',
        maxWidth: 340,
        borderWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.12)',
        borderLeftColor: 'rgba(255,255,255,0.08)',
        borderRightColor: 'rgba(255,255,255,0.03)',
        borderBottomColor: 'rgba(0,0,0,0.3)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.8,
        shadowRadius: 40,
        elevation: 20,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    modalTitle: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1,
        marginBottom: 4,
        textTransform: 'uppercase',
    },
    modalSubtitle: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '700',
    },
    iconBtn: {
        padding: 4,
        marginRight: -8,
        marginTop: -4,
    },
    viewContent: {
        gap: 20,
    },
    itemDescription: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        lineHeight: 18,
        marginTop: 4,
    },
    keyboardView: {
        width: '100%',
        alignItems: 'center',
    },
    viewActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 12,
    },
    destructiveBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 16,
        backgroundColor: 'rgba(255,59,48,0.1)',
        borderWidth: 1,
        borderTopColor: 'rgba(255,59,48,0.15)',
        borderLeftColor: 'rgba(255,59,48,0.1)',
        borderRightColor: 'rgba(0,0,0,0.15)',
        borderBottomColor: 'rgba(0,0,0,0.2)',
    },
    destructiveBtnText: {
        color: '#FF3B30',
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 1,
    },
    primaryActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#fff',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 16,
        borderWidth: 0.5,
        borderTopColor: 'rgba(255,255,255,1)',
        borderLeftColor: 'rgba(255,255,255,0.8)',
        shadowColor: '#fff',
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 4,
    },
    primaryActionBtnText: {
        color: '#000',
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 1,
    },
    editActions: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 20,
    },
    inputLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 1,
        marginBottom: 8,
    },
    reasonWell: {
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 16,
        padding: 16,
        minHeight: 80,
        borderWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.3)',
        borderLeftColor: 'rgba(0,0,0,0.2)',
        borderRightColor: 'rgba(255,255,255,0.05)',
        borderBottomColor: 'rgba(255,255,255,0.08)',
    },
    viewReasonText: {
        color: '#fff',
        fontSize: 15,
        lineHeight: 22,
        fontWeight: '500',
    },
    input3D: {
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 16,
        padding: 16,
        color: '#fff',
        fontSize: 16,
        minHeight: 100,
        textAlignVertical: 'top',
        borderWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.4)',
        borderLeftColor: 'rgba(0,0,0,0.3)',
        borderRightColor: 'rgba(255,255,255,0.05)',
        borderBottomColor: 'rgba(255,255,255,0.08)',
    },
    btnCancel3D: {
        flex: 1,
        padding: 14,
        alignItems: 'center',
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
        borderLeftColor: 'rgba(255,255,255,0.05)',
        borderRightColor: 'rgba(0,0,0,0.2)',
        borderBottomColor: 'rgba(0,0,0,0.3)',
    },
    btnConfirm3D: {
        flex: 1,
        padding: 14,
        alignItems: 'center',
        borderRadius: 16,
        backgroundColor: '#fff',
        borderWidth: 0.5,
        borderTopColor: 'rgba(255,255,255,1)',
        borderLeftColor: 'rgba(255,255,255,0.8)',
        shadowColor: '#fff',
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 6,
    },
    btnText3D: {
        color: 'rgba(255,255,255,0.5)',
        fontWeight: '800',
        fontSize: 12,
        letterSpacing: 1,
    },
    btnTextPrimary3D: {
        color: '#000',
        fontWeight: '900',
        fontSize: 12,
        letterSpacing: 1,
    },
});
