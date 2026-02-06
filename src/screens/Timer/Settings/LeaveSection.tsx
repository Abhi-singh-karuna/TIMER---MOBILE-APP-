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
                            <View style={[
                                modalStyles.card,
                                isLandscape && { width: '60%', maxWidth: 500, flexDirection: 'row', gap: 20, alignItems: 'center' }
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
                                            <View style={modalStyles.reasonBox}>
                                                <Text style={[
                                                    modalStyles.viewReasonText,
                                                    !existingReason && { color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }
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
                                                    <Text style={modalStyles.destructiveBtnText}>Delete</Text>
                                                </TouchableOpacity>

                                                <TouchableOpacity
                                                    style={modalStyles.primaryActionBtn}
                                                    onPress={() => setMode('edit')}
                                                >
                                                    <MaterialIcons name="edit" size={18} color="#000" />
                                                    <Text style={modalStyles.primaryActionBtnText}>Edit</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    ) : (
                                        <View>
                                            <TextInput
                                                style={modalStyles.input}
                                                value={reason}
                                                onChangeText={setReason}
                                                placeholder="Enter reason (optional)..."
                                                placeholderTextColor="rgba(255,255,255,0.3)"
                                                autoFocus={true}
                                                multiline
                                            />

                                            <View style={modalStyles.editActions}>
                                                <TouchableOpacity
                                                    style={modalStyles.btnCancel}
                                                    onPress={() => {
                                                        if (mode === 'edit') setMode('view');
                                                        else onClose();
                                                    }}
                                                >
                                                    <Text style={modalStyles.btnText}>Cancel</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity style={modalStyles.btnConfirm} onPress={handleSave}>
                                                    <Text style={modalStyles.btnTextPrimary}>Save</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    )}
                                </View>
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
}: {
    leaveDays: LeaveDay[];
    onDayPress: (dateStr: string) => void;
    viewDate: Date;
    onChangeViewDate: (date: Date) => void;
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
        <View style={modalStyles.calendarCard}>
            <View style={modalStyles.calHeader}>
                <View style={{ width: 24 }} />
                <Text style={modalStyles.calTitle}>{MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}</Text>
                <View style={modalStyles.calNav}>
                    <TouchableOpacity onPress={() => {
                        const nextDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
                        onChangeViewDate(nextDate);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }} style={modalStyles.calNavBtn}>
                        <MaterialIcons name="chevron-left" size={20} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => {
                        const nextDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
                        onChangeViewDate(nextDate);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }} style={modalStyles.calNavBtn}>
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
                            style={modalStyles.dayCell}
                            disabled={!item.current}
                            onPress={() => {
                                if (item.current) {
                                    onDayPress(dateStr);
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                }
                            }}
                        >
                            <View style={[
                                modalStyles.dayCircle,
                                !item.current && { opacity: 0.2 },
                                isToday && modalStyles.todayCircle,
                                isSelected && modalStyles.selectedCircle
                            ]}>
                                <Text style={[
                                    modalStyles.dayText,
                                    isToday && { color: '#000' },
                                    isSelected && { color: '#000', fontWeight: '800' }
                                ]}>{item.day}</Text>
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </View>
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
                <Text style={isLandscape ? [styles.sectionTitleLandscape, { marginBottom: 0 }] : styles.inputLabel}>
                    MANAGE LEAVE
                </Text>
            </View>

            <Text style={styles.sectionDescription}>
                Tap a date to add or edit leave. Leave days are excluded from streak calculations.
            </Text>

            <View style={{ marginTop: 16 }}>
                <MultiDateCalendar
                    leaveDays={leaveDays}
                    onDayPress={handleDayPress}
                    viewDate={viewDate}
                    onChangeViewDate={setViewDate}
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
        backgroundColor: '#111',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        padding: 16,
        paddingBottom: 20,
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
        width: '14.28%', // 7 days
        aspectRatio: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
    },
    dayCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    todayCircle: {
        backgroundColor: '#fff',
    },
    selectedCircle: {
        backgroundColor: '#4CAF50',
    },
    dayText: {
        color: '#fff',
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
        borderColor: 'rgba(255,255,255,0.08)',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 10,
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
    reasonBox: {
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 12,
        padding: 12,
        minHeight: 60,
    },
    viewReasonText: {
        color: '#fff',
        fontSize: 15,
        lineHeight: 22,
    },
    viewActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 8,
    },
    destructiveBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        backgroundColor: 'rgba(255,59,48,0.1)',
    },
    destructiveBtnText: {
        color: '#FF3B30',
        fontSize: 14,
        fontWeight: '600',
    },
    primaryActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#fff',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 20,
    },
    primaryActionBtnText: {
        color: '#000',
        fontSize: 14,
        fontWeight: '700',
    },
    editActions: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 16,
    },
    btnCancel: {
        flex: 1,
        padding: 12,
        alignItems: 'center',
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    btnConfirm: {
        flex: 1,
        padding: 12,
        alignItems: 'center',
        borderRadius: 12,
        backgroundColor: '#fff',
    },
    btnText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 15,
    },
    btnTextPrimary: {
        color: '#000',
        fontWeight: '700',
        fontSize: 15,
    },
    keyboardView: {
        width: '100%',
        alignItems: 'center',
    },
    input: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: 16,
        color: '#fff',
        fontSize: 16,
        minHeight: 80,
        textAlignVertical: 'top',
    },
});
