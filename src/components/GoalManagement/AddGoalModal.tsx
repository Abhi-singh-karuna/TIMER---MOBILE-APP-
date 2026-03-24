import React, { useState, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    TextInput,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
    useWindowDimensions,
    LayoutAnimation,
    UIManager,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Goal, GoalType, GoalTargetSettings, Task, Category } from '../../constants/data';
import { shouldRecurOnDate } from '../../utils/recurrenceUtils';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();
const formatDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};
const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return 'Select Date';
    const date = new Date(dateStr);
    return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
};

interface AddGoalModalProps {
    visible: boolean;
    onCancel: () => void;
    onAdd: (goal: Partial<Goal>) => void;
    onUpdate: (id: string, goal: Partial<Goal>) => void;
    goalToEdit?: Goal | null;
    parentId: string | null;
    tasks: Task[];
    categories: Category[];
}

export default function AddGoalModal({
    visible,
    onCancel,
    onAdd,
    onUpdate,
    goalToEdit,
    parentId,
    tasks,
    categories,
}: AddGoalModalProps) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [type, setType] = useState<GoalType>('goal');
    const [isLinkingTask, setIsLinkingTask] = useState(true);
    const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Picker State
    const [showStartPicker, setShowStartPicker] = useState(false);
    const [showEndPicker, setShowEndPicker] = useState(false);
    const [startViewDate, setStartViewDate] = useState(new Date());
    const [endViewDate, setEndViewDate] = useState(new Date());
    const [errorTitle, setErrorTitle] = useState(false);
    const [errorStartDate, setErrorStartDate] = useState(false);
    const [errorEndDate, setErrorEndDate] = useState(false);

    // Target Settings
    const [hoursPerDay, setHoursPerDay] = useState('1');
    const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]); // Mon-Fri default
    const [monthlyGoal, setMonthlyGoal] = useState('');

    // Selection Filters
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const isLandscape = windowWidth > windowHeight;
    const isTaskFlow = type === 'task';
    const overlayPad = Math.max(6, Math.min(16, Math.round(windowWidth * 0.03)));
    const modalMaxW = isLandscape
        ? Math.min(windowWidth * 0.96 - overlayPad * 2, selectedTaskId != null ? 820 : 520)
        : Math.min(windowWidth - overlayPad * 2, isTaskFlow ? 440 : 400);
    const modalMaxH = (() => {
        const cap = Math.min(windowHeight * (isLandscape ? 0.92 : 0.88), windowHeight - overlayPad * 2);
        if (isLandscape && isTaskFlow && selectedTaskId == null) return Math.min(cap, 340);
        return cap;
    })();

    // Smooth layout transitions for orientation and expansion
    useEffect(() => {
        const config = {
            duration: 350,
            create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
            update: { type: LayoutAnimation.Types.spring, springDamping: 0.8 },
            delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        };
        LayoutAnimation.configureNext(config);
    }, [isLandscape, selectedTaskId, visible]);

    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
    const [dateFilter, setDateFilter] = useState<'week' | 'month' | 'all'>('month');
    const [selectedCalendarMonth, setSelectedCalendarMonth] = useState<string>('');
    const [selectedFullDate, setSelectedFullDate] = useState<string | null>(null);

    useEffect(() => {
        if (visible) {
            if (goalToEdit) {
                setTitle(goalToEdit.title);
                setDescription(goalToEdit.description || '');
                setType(goalToEdit.type);
                setIsLinkingTask(!!(goalToEdit.taskIds?.[0] || goalToEdit.taskId));
                setSelectedTaskId(goalToEdit.taskIds?.[0] || goalToEdit.taskId || null);
                if (goalToEdit.targetSettings) {
                    setHoursPerDay(String(goalToEdit.targetSettings.hoursPerDay));
                    setSelectedDays(goalToEdit.targetSettings.daysPerWeek || [1, 2, 3, 4, 5]);
                    setMonthlyGoal(goalToEdit.targetSettings.monthlyGoal || '');
                }
                setStartDate(goalToEdit.startDate || goalToEdit.createdAt.split('T')[0]);
                setEndDate(goalToEdit.endDate || '');
                setStartViewDate(new Date(goalToEdit.startDate || goalToEdit.createdAt));
                if (goalToEdit.endDate) setEndViewDate(new Date(goalToEdit.endDate));
            } else {
                setTitle('');
                setDescription('');
                const defaultType = parentId ? 'task' : 'goal';
                setType(defaultType);
                setIsLinkingTask(defaultType === 'task');
                setSelectedTaskId(null);
                setHoursPerDay('1');
                setSelectedDays([1, 2, 3, 4, 5]);
                setMonthlyGoal('');
                const today = new Date().toISOString().split('T')[0];
                setStartDate(today);
                setEndDate('');
                setErrorStartDate(false);
                setErrorEndDate(false);
                setStartViewDate(new Date());
            }
            setErrorTitle(false);
            setSelectedFullDate(null); // Reset selected date when modal opens/closes
        }
    }, [visible, goalToEdit, parentId]);

    const getMonthlyLabel = () => {
        const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const current = new Date();
        return `${months[current.getMonth()]} ${current.getFullYear()}`;
    };

    const getTaskDateRange = (task: Task | null) => {
        if (!task) return null;
        if (task.recurrence) {
            const startStr = new Date(task.recurrence.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            const endStr = task.recurrence.endDate ? new Date(task.recurrence.endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Ongoing';
            return `${startStr} - ${endStr}`;
        }
        return new Date(task.forDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    const renderCalendarPicker = (isStart: boolean) => {
        const currentViewDate = isStart ? startViewDate : endViewDate;
        const setViewDateFn = isStart ? setStartViewDate : setEndViewDate;
        const selectedDateStr = isStart ? startDate : endDate;
        const setSelectedDateFn = isStart ? setStartDate : setEndDate;
        const setShowPicker = isStart ? setShowStartPicker : setShowEndPicker;

        const days = getDaysInMonth(currentViewDate.getFullYear(), currentViewDate.getMonth());
        const firstDay = getFirstDayOfMonth(currentViewDate.getFullYear(), currentViewDate.getMonth());
        const daysArray = [];

        const prevMonthDays = getDaysInMonth(currentViewDate.getFullYear(), currentViewDate.getMonth() - 1);
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

        const weekDaysCaps = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

        return (
            <View style={styles.calendarMini}>
                <View style={styles.calHeader}>
                    <TouchableOpacity onPress={() => setShowPicker(false)} style={styles.calBack}>
                        <MaterialIcons name="arrow-back" size={16} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.calTitle}>{MONTHS[currentViewDate.getMonth()]} {currentViewDate.getFullYear()}</Text>
                    <View style={styles.calNav}>
                        <TouchableOpacity onPress={() => {
                            const nextDate = new Date(currentViewDate.getFullYear(), currentViewDate.getMonth() - 1, 1);
                            setViewDateFn(nextDate);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }} style={styles.calNavBtn}>
                            <MaterialIcons name="chevron-left" size={16} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => {
                            const nextDate = new Date(currentViewDate.getFullYear(), currentViewDate.getMonth() + 1, 1);
                            setViewDateFn(nextDate);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }} style={styles.calNavBtn}>
                            <MaterialIcons name="chevron-right" size={16} color="#fff" />
                        </TouchableOpacity>
                    </View>
                </View>
                <View style={styles.weekRowPicker}>
                    {weekDaysCaps.map((d, i) => <Text key={i} style={styles.weekTextPicker}>{d}</Text>)}
                </View>
                <View style={styles.daysGridPicker}>
                    {daysArray.map((item, i) => {
                        const dateStr = item.current ? formatDate(new Date(currentViewDate.getFullYear(), currentViewDate.getMonth(), item.day)) : '';
                        const isSelected = item.current && dateStr === selectedDateStr;
                        const todayStr = new Date().toISOString().split('T')[0];
                        const isToday = item.current && todayStr === dateStr;

                        return (
                            <TouchableOpacity
                                key={i}
                                style={styles.dayCellPicker}
                                disabled={!item.current}
                                onPress={() => {
                                    if (item.current) {
                                        setSelectedDateFn(dateStr);
                                        setShowPicker(false);
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                    }
                                }}
                            >
                                <View style={[
                                    styles.dayCirclePicker,
                                    !item.current && { opacity: 0.15 },
                                    isToday && styles.todayCirclePicker,
                                    isSelected && styles.selectedCirclePicker
                                ]}>
                                    <Text style={[
                                        styles.dayTextPicker,
                                        isToday && { color: '#000', fontWeight: '900' },
                                        isSelected && { color: '#fff', fontWeight: '900' }
                                    ]}>{item.day}</Text>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>
        );
    };

    const getRecurrenceFrequency = (task: Task | null) => {
        if (!task || !task.recurrence) return '1 day';
        if (task.recurrence.type === 'daily') return '7 days';
        if (task.recurrence.type === 'weekly' && task.recurrence.days) {
            return `${task.recurrence.days.length} days`;
        }
        if (task.recurrence.type === 'monthly') return '1 day (monthly)';
        return '1 day';
    };

    const getTaskSchedule = (task: Task | null): { date: string; label: string; duration: number; status: string }[] => {
        if (!task) return [];

        const now = new Date();
        const dates: { date: string, label: string, duration: number, status: string }[] = [];

        const getDurationForDate = (dateStr: string) => {
            // 1. Check if we have an explicit instance for this date
            const instance = task.recurrenceInstances?.[dateStr];
            if (instance?.stages && instance.stages.length > 0) {
                return instance.stages.reduce((acc, s) => acc + (s.durationMinutes || 0), 0) / 60;
            }

            // 2. Fallback to base stages with syncMode filtering
            const baseStages = task.stages || [];
            if (baseStages.length === 0) return 0;

            const isOriginalDate = dateStr === task.forDate;
            const isFutureDate = dateStr > task.forDate;

            return baseStages.reduce((acc, stage) => {
                // Determine if this stage applies to this date based on syncMode
                const applies =
                    stage.syncMode === 'all' ||
                    (stage.syncMode === 'future' && (isOriginalDate || isFutureDate)) ||
                    (stage.syncMode === 'none' && isOriginalDate) ||
                    (!stage.syncMode && isOriginalDate); // Default none-synced to original only

                return acc + (applies ? (stage.durationMinutes || 0) : 0);
            }, 0) / 60;
        };

        // If single task, just return its date
        if (!task.recurrence) {
            dates.push({
                date: task.forDate,
                label: new Date(task.forDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                duration: getDurationForDate(task.forDate),
                status: task.status || 'Pending'
            });
            return dates;
        }

        // For recurring, get next 6 months worth
        const endDate = task.recurrence.endDate ? new Date(task.recurrence.endDate) : new Date(now.getFullYear(), now.getMonth() + 6, 0);
        const startDate = new Date(task.recurrence.startDate);
        const loopStart = startDate;

        const nowStr = now.toISOString().split('T')[0];
        let currentDate = new Date(loopStart);
        while (currentDate <= endDate && dates.length < 100) {
            const dateStr = currentDate.toISOString().split('T')[0];
            if (shouldRecurOnDate(task.recurrence, dateStr)) {
                let status = 'Pending';
                if (task.recurrenceInstances && task.recurrenceInstances[dateStr]) {
                    status = task.recurrenceInstances[dateStr].status || 'Pending';
                }

                // If past and still pending, mark as missed
                const finalStatus = (dateStr < nowStr && status === 'Pending') ? 'Missed' : status;

                dates.push({
                    date: dateStr,
                    label: currentDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                    duration: getDurationForDate(dateStr),
                    status: finalStatus
                });
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
        return dates;
    };

    const filteredTasks = useMemo(() => {
        let result = tasks;

        // Filter by Category
        if (selectedCategoryId !== 'all') {
            result = result.filter(t => t.categoryId === selectedCategoryId);
        }

        // Filter by Date (Overlapping with filter range)
        const now = new Date();
        let filterStart: Date | null = null;
        let filterEnd: Date | null = null;

        if (dateFilter === 'week') {
            const currentDay = now.getDay();
            filterStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - currentDay);
            filterEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - currentDay + 6);
        } else if (dateFilter === 'month') {
            filterStart = new Date(now.getFullYear(), now.getMonth(), 1);
            filterEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        }

        if (filterStart && filterEnd) {
            const startStr = filterStart.toISOString().split('T')[0];
            const endStr = filterEnd.toISOString().split('T')[0];

            result = result.filter(t => {
                if (!t.recurrence) return t.forDate >= startStr && t.forDate <= endStr;
                // For recurring, if it has an endDate, check overlap. If no endDate, it's ongoing.
                if (t.recurrence.endDate && t.recurrence.endDate < startStr) return false;
                return t.recurrence.startDate <= endStr;
            });
        }

        return result;
    }, [tasks, selectedCategoryId, dateFilter]);

    const taskSchedule = useMemo(() => {
        const task = tasks.find(t => t.id === selectedTaskId) || null;
        return getTaskSchedule(task);
    }, [selectedTaskId, tasks]);

    const groupedDates = useMemo(() => {
        const groups: { [key: string]: { date: string, label: string, duration: number, status: string }[] } = {};
        taskSchedule.forEach(item => {
            const date = new Date(item.date);
            const monthName = date.toLocaleString('default', { month: 'long', year: 'numeric' });
            if (!groups[monthName]) groups[monthName] = [];
            groups[monthName].push(item);
        });
        return groups;
    }, [taskSchedule]);

    const subtaskAnalytics = useMemo(() => {
        if (selectedTaskId == null) return null;
        const task = tasks.find(t => t.id === selectedTaskId);
        if (!task) return null;

        let stages = task.stages || [];
        // For recurring tasks, if root stages are empty, find them in instances
        if (stages.length === 0 && task.recurrenceInstances) {
            const instanceKeys = Object.keys(task.recurrenceInstances);
            for (const key of instanceKeys) {
                const instStages = task.recurrenceInstances[key].stages || [];
                if (instStages.length > stages.length) {
                    stages = instStages;
                }
            }
        }

        if (stages.length === 0) return null;

        return {
            total: stages.length,
            syncAll: stages.filter(s => s.syncMode === 'all').length,
            syncFuture: stages.filter(s => s.syncMode === 'future').length,
            localOnly: stages.filter(s => s.syncMode === 'none' || !s.syncMode).length,
        };
    }, [selectedTaskId, tasks]);

    const selectedMonthTotal = useMemo(() => {
        if (!selectedCalendarMonth || !groupedDates[selectedCalendarMonth]) return 0;
        return groupedDates[selectedCalendarMonth].reduce((acc, item) => acc + item.duration, 0);
    }, [selectedCalendarMonth, groupedDates]);

    useEffect(() => {
        const months = Object.keys(groupedDates);
        if (months.length > 0 && (!selectedCalendarMonth || !months.includes(selectedCalendarMonth))) {
            const now = new Date();
            const currentMonthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });
            if (months.includes(currentMonthName)) {
                setSelectedCalendarMonth(currentMonthName);
            } else {
                setSelectedCalendarMonth(months[0]);
            }
        }
    }, [groupedDates]);

    const handleTaskSelect = (taskId: number) => {
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        setSelectedTaskId(task.id);
        setIsLinkingTask(true);
        setTitle(task.title);
        setDescription(task.description || '');
        setSelectedFullDate(null); // Reset selected date when a new task is selected

        // Auto-calculate Target Settings
        let stagesToUse = task.stages || [];
        if (stagesToUse.length === 0 && task.recurrenceInstances) {
            const instanceKeys = Object.keys(task.recurrenceInstances);
            for (const key of instanceKeys) {
                const instStages = task.recurrenceInstances[key].stages || [];
                if (instStages.length > stagesToUse.length) {
                    stagesToUse = instStages;
                }
            }
        }

        const totalMinutes = stagesToUse.reduce((acc, s) => acc + (s.durationMinutes || 0), 0);
        const calculatedHours = (totalMinutes / 60).toFixed(1);
        setHoursPerDay(calculatedHours === '0.0' ? '1' : calculatedHours);

        if (task.recurrence) {
            if (task.recurrence.type === 'weekly') {
                setSelectedDays(task.recurrence.days);
            } else if (task.recurrence.type === 'daily') {
                setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
            } else {
                setSelectedDays([new Date(task.recurrence.startDate).getDay()]);
            }
        } else {
            const taskDay = new Date(task.forDate).getDay();
            setSelectedDays([taskDay]);
        }

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    };

    const renderCTA = (compact = false) => (
        <View style={[
            styles.ctaRow,
            isLandscape && styles.ctaRowLandscape,
            isLandscape && {
                justifyContent: 'flex-end',
                marginTop: compact ? 12 : 16,
                gap: 12,
                paddingRight: compact ? 4 : 8
            }
        ]}>
            <TouchableOpacity
                style={[
                    styles.saveBtn,
                    isLandscape && styles.saveBtnLandscape,
                    isLandscape && {
                        flex: 0,
                        minWidth: 100,
                        backgroundColor: '#fff',
                        paddingVertical: compact ? 8 : 10,
                        justifyContent: 'center',
                        marginTop: 0,
                        marginBottom: 0
                    },
                    compact && {
                        paddingHorizontal: 0,
                    }
                ]}
                onPress={handleSave}
            >
                <Text style={[
                    styles.saveBtnText,
                    isLandscape && styles.saveBtnTextLandscape,
                    compact && { fontSize: 11 }
                ]}>
                    {goalToEdit ? 'UPDATE' : (type === 'task' ? 'LINK' : 'CREATE')}
                </Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={[
                    isLandscape ? styles.cancelBtnLandscape : styles.cancelLink,
                    isLandscape && {
                        minWidth: 100,
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.08)',
                        backgroundColor: 'rgba(255,255,255,0.01)',
                        paddingVertical: compact ? 8 : 10,
                        justifyContent: 'center',
                        alignItems: 'center',
                        marginTop: 0,
                        marginBottom: 0
                    }
                ]}
                onPress={onCancel}
            >
                <Text style={[
                    styles.cancelLinkText,
                    isLandscape && styles.cancelBtnTextLandscape,
                    compact && { fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: '800' }
                ]}>
                    CANCEL
                </Text>
            </TouchableOpacity>
        </View>
    );

    const handleSave = () => {
        if (!title.trim() || (type === 'goal' && !endDate.trim())) {
            if (!title.trim()) setErrorTitle(true);
            if (type === 'goal' && !endDate.trim()) setErrorEndDate(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            return;
        }

        // Basic date validation: Ensure end date is not before start date if both exist
        if (startDate && endDate && endDate < startDate) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            // Optionally could show a specific error here
            return;
        }

        const goalData: Partial<Goal> = {
            title: title.trim(),
            description: description.trim(),
            type,
            parentId,
            taskIds: (isLinkingTask || type === 'task') && selectedTaskId != null ? [selectedTaskId] : undefined,
            ...(type === 'goal' && {
                startDate: startDate.trim() || undefined,
                endDate: endDate.trim() || undefined,
            })
        };

        if (type === 'task') {
            goalData.targetSettings = {
                hoursPerDay: parseFloat(hoursPerDay) || 0,
                daysPerWeek: selectedDays,
                monthlyGoal: monthlyGoal.trim(),
            };
        }

        if (goalToEdit) {
            onUpdate(goalToEdit.id, goalData);
        } else {
            onAdd(goalData);
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'High': return '#FF5252';
            case 'Medium': return '#FFB300';
            case 'Low': return '#4CAF50';
            default: return 'rgba(255,255,255,0.2)';
        }
    };

    const getStagesForDate = (dateStr: string) => {
        const task = tasks.find(t => t.id === selectedTaskId);
        if (!task) return [];

        // Check recurrence instances first
        if (task.recurrenceInstances && task.recurrenceInstances[dateStr]?.stages) {
            return task.recurrenceInstances[dateStr].stages;
        }

        // Fallback to base stages with syncMode filtering
        const baseStages = task.stages || [];
        if (baseStages.length === 0) return [];

        const isOriginalDate = dateStr === task.forDate;
        const isFutureDate = dateStr > task.forDate;

        return baseStages.filter(stage => {
            return stage.syncMode === 'all' ||
                (stage.syncMode === 'future' && (isOriginalDate || isFutureDate)) ||
                (stage.syncMode === 'none' && isOriginalDate) ||
                (!stage.syncMode && isOriginalDate); // Default none-synced to original only
        });
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onCancel}
            supportedOrientations={['portrait', 'landscape']}
        >
            <View style={[styles.modalOverlay, { padding: overlayPad }]}>
                <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={[
                        styles.keyboardView,
                        { maxWidth: modalMaxW, width: '100%', alignSelf: 'center' },
                    ]}
                >
                    <View style={[
                        styles.modalContent,
                        isTaskFlow && styles.modalContentTaskCompact,
                        isLandscape && styles.modalContentLandscape,
                        { maxWidth: modalMaxW, maxHeight: modalMaxH },
                    ]}>
                        <View style={[styles.header, isLandscape && styles.headerLandscape, isTaskFlow && styles.headerCompact]}>
                            <Text style={styles.headerTitle}>{goalToEdit ? 'EDIT ITEM' : (type === 'task' ? 'LINK EXISTING TASK' : `NEW ${type?.toUpperCase() || 'ITEM'}`)}</Text>
                            <TouchableOpacity onPress={onCancel} style={styles.closeBtn}>
                                <MaterialIcons name="close" size={20} color="#fff" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView
                            style={styles.scroll}
                            contentContainerStyle={
                                isTaskFlow
                                    ? [styles.scrollContentTask, isLandscape && styles.scrollContentTaskLandscape]
                                    : undefined
                            }
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                        >
                            {type === 'task' && (
                                <View
                                    style={[
                                        styles.selectionView,
                                        isLandscape && selectedTaskId != null && styles.selectionViewLandscape,
                                        isLandscape && selectedTaskId == null && styles.selectionViewLandscapePickerOnly,
                                    ]}
                                >
                                    <View
                                        style={[
                                            isLandscape && selectedTaskId != null && styles.landscapeLeftPane,
                                            isLandscape && selectedTaskId == null && styles.landscapePickerFullWidth,
                                        ]}
                                    >
                                        <View style={[styles.filterSection, isTaskFlow && styles.filterSectionCompact, isLandscape && styles.filterSectionLandscape]}>
                                            <Text style={[styles.sectionLabel, isLandscape && styles.sectionLabelLandscape, isTaskFlow && styles.sectionLabelCompact]}>FIRST SELECT CATEGORY</Text>
                                            <ScrollView
                                                horizontal
                                                showsHorizontalScrollIndicator={false}
                                                style={styles.filterScroll}
                                            >
                                                <TouchableOpacity
                                                    style={[styles.filterChip, selectedCategoryId === 'all' && styles.filterChipActive]}
                                                    onPress={() => {
                                                        setSelectedCategoryId('all');
                                                        setSelectedTaskId(null);
                                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                    }}
                                                >
                                                    <Text style={[styles.filterChipText, selectedCategoryId === 'all' && styles.filterChipTextActive]}>ALL</Text>
                                                </TouchableOpacity>
                                                {categories.map(cat => (
                                                    <TouchableOpacity
                                                        key={cat.id}
                                                        style={[styles.filterChip, selectedCategoryId === cat.id && styles.filterChipActive]}
                                                        onPress={() => {
                                                            setSelectedCategoryId(cat.id);
                                                            setSelectedTaskId(null);
                                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                        }}
                                                    >
                                                        <MaterialIcons name={cat.icon} size={14} color={selectedCategoryId === cat.id ? '#fff' : cat.color} />
                                                        <Text style={[styles.filterChipText, selectedCategoryId === cat.id && styles.filterChipTextActive]}>{cat.name.toUpperCase()}</Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </ScrollView>
                                        </View>

                                        <View style={[styles.filterSection, isTaskFlow && styles.filterSectionCompact, isLandscape && styles.filterSectionLandscape]}>
                                            <Text style={[styles.sectionLabel, isLandscape && styles.sectionLabelLandscape, isTaskFlow && styles.sectionLabelCompact]}>REFINE DATE RANGE</Text>
                                            <View style={styles.toggleRow}>
                                                {(['week', 'month', 'all'] as const).map(f => (
                                                    <TouchableOpacity
                                                        key={f}
                                                        style={[styles.toggleBtn, dateFilter === f && styles.toggleBtnActive]}
                                                        onPress={() => {
                                                            setDateFilter(f);
                                                            setSelectedTaskId(null);
                                                        }}
                                                    >
                                                        <Text style={[styles.toggleBtnText, dateFilter === f && styles.toggleBtnTextActive]}>{f.toUpperCase()}</Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        </View>

                                        <View style={[styles.taskListGrid, isTaskFlow && styles.taskListGridCompact]}>
                                            <Text style={[styles.sectionLabel, isLandscape && styles.sectionLabelLandscape, isTaskFlow && styles.sectionLabelCompact]}>CHOOSE FROM {filteredTasks.length} MATCHING TASKS</Text>
                                            {filteredTasks.length === 0 ? (
                                                <View style={styles.emptyTasks}>
                                                    <MaterialIcons name="search-off" size={24} color="rgba(255,255,255,0.1)" />
                                                    <Text style={styles.emptyTasksText}>No tasks found for this category</Text>
                                                </View>
                                            ) : (
                                                <ScrollView
                                                    horizontal
                                                    showsHorizontalScrollIndicator={false}
                                                    style={styles.taskCardsScroll}
                                                >
                                                    {filteredTasks.map(task => (
                                                        <TouchableOpacity
                                                            key={task.id}
                                                            style={[styles.taskCard, selectedTaskId === task.id && styles.taskCardSelected]}
                                                            onPress={() => handleTaskSelect(task.id)}
                                                        >
                                                            <View style={styles.taskCardHeader}>
                                                                <View style={[styles.priorityDot, { backgroundColor: getPriorityColor(task.priority) }]} />
                                                                <Text style={styles.taskCardTitle} numberOfLines={1}>{task.title}</Text>
                                                            </View>
                                                            <Text style={styles.taskCardSub}>
                                                                {task.recurrence?.startDate || task.forDate} - {task.recurrence?.endDate || 'Ongoing'}
                                                            </Text>
                                                            {selectedTaskId === task.id && (
                                                                <View style={styles.taskCheck}>
                                                                    <MaterialIcons name="check" size={10} color="#fff" />
                                                                </View>
                                                            )}
                                                        </TouchableOpacity>
                                                    ))}
                                                </ScrollView>
                                            )}
                                        </View>

                                        {!isLandscape && isLinkingTask && taskSchedule.length > 0 && (
                                            <View style={styles.dateListContainer}>
                                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateListContent}>
                                                    {taskSchedule.slice(0, 15).map((item, index) => (
                                                        <View key={index} style={styles.dateBubble}>
                                                            <Text style={styles.dateBubbleText}>{item.label}</Text>
                                                        </View>
                                                    ))}
                                                    {taskSchedule.length > 15 && (
                                                        <View style={[styles.dateBubble, { backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.1)' }]}>
                                                            <Text style={[styles.dateBubbleText, { color: 'rgba(255,255,255,0.3)' }]}>+{taskSchedule.length - 15} more</Text>
                                                        </View>
                                                    )}
                                                </ScrollView>
                                            </View>
                                        )}

                                        {isLandscape && selectedTaskId != null && (
                                            <View style={styles.landscapeCtaInline}>
                                                {renderCTA(true)}
                                            </View>
                                        )}
                                    </View>

                                    {selectedTaskId != null ? (
                                        <View style={isLandscape ? styles.landscapeRightPane : styles.portraitAnalyticsColumn}>
                                            <View style={[styles.unifiedScheduleCard, isLandscape && styles.unifiedScheduleCardLandscape]}>
                                                {/* Left Pane: Commitment Analytics */}
                                                <View style={styles.leftPane}>
                                                    <View style={styles.commitmentHeaderRow}>
                                                        <MaterialIcons name={selectedFullDate ? "event" : "analytics"} size={12} color="#00E5FF" />
                                                        <Text style={styles.commitmentTitleSmall}>{selectedFullDate ? "DAY ANALYTICS" : "ANALYTICS"}</Text>
                                                    </View>

                                                    {!selectedFullDate ? (
                                                        <View style={styles.statsColumn}>
                                                            <View style={styles.statItemCompact}>
                                                                <Text style={styles.statLabel}>TOTAL TIME</Text>
                                                                <Text style={[styles.statValueLarge, isLandscape && styles.statValueLargeLandscape]}>
                                                                    {isLinkingTask
                                                                        ? taskSchedule.filter(i => {
                                                                            const d = new Date(i.date);
                                                                            const now = new Date();
                                                                            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                                                                        }).reduce((acc, item) => acc + item.duration, 0).toFixed(1)
                                                                        : (parseFloat(hoursPerDay || '0') * selectedDays.length * 4.3).toFixed(1)}
                                                                    <Text style={styles.statUnit}>h</Text>
                                                                </Text>
                                                            </View>

                                                            <View style={styles.statRowCompact}>
                                                                <View style={styles.statItemHalf}>
                                                                    <Text style={styles.statLabel}>{selectedCalendarMonth ? selectedCalendarMonth.split(' ')[0].toUpperCase() : 'SELECTED'}</Text>
                                                                    <Text style={styles.statValueSmall}>{selectedMonthTotal.toFixed(1)}h</Text>
                                                                </View>
                                                                <View style={styles.statItemHalf}>
                                                                    <Text style={styles.statLabel}>AVG/DAY</Text>
                                                                    <Text style={styles.statValueSmall}>
                                                                        {isLinkingTask
                                                                            ? (selectedMonthTotal / (groupedDates[selectedCalendarMonth]?.length || 1)).toFixed(1)
                                                                            : hoursPerDay}h
                                                                    </Text>
                                                                </View>
                                                            </View>
                                                        </View>
                                                    ) : null}
                                                    {subtaskAnalytics && !selectedFullDate && (
                                                        <View style={styles.subtaskLegendInLeftPane}>
                                                            <View style={styles.subtaskRowMini}>
                                                                <View style={[styles.subtaskDotMini, { backgroundColor: '#4CAF50' }]} />
                                                                <Text style={styles.subtaskLabelMini}>SNC: {subtaskAnalytics.syncAll}</Text>
                                                            </View>
                                                            <View style={styles.subtaskRowMini}>
                                                                <View style={[styles.subtaskDotMini, { backgroundColor: '#FFC107' }]} />
                                                                <Text style={styles.subtaskLabelMini}>FUT: {subtaskAnalytics.syncFuture}</Text>
                                                            </View>
                                                            <View style={styles.subtaskRowMini}>
                                                                <View style={[styles.subtaskDotMini, { backgroundColor: '#2196F3' }]} />
                                                                <Text style={styles.subtaskLabelMini}>LOC: {subtaskAnalytics.localOnly}</Text>
                                                            </View>
                                                        </View>
                                                    )}
                                                    {selectedFullDate ? (
                                                        <View style={styles.statsColumn}>
                                                            <View style={styles.statItemCompact}>
                                                                <Text style={styles.statLabel}>DATE SELECTED</Text>
                                                                <Text style={styles.statValueMedium}>
                                                                    {new Date(selectedFullDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
                                                                </Text>
                                                            </View>
                                                            <View style={styles.statItemCompact}>
                                                                <Text style={styles.statLabel}>DAY DURATION</Text>
                                                                <Text style={[styles.statValueLarge, isLandscape && styles.statValueLargeLandscape]}>
                                                                    {(taskSchedule.find(i => i.date === selectedFullDate)?.duration || 0).toFixed(1)}
                                                                    <Text style={styles.statUnit}>h</Text>
                                                                </Text>
                                                            </View>
                                                            <View style={styles.statItemCompact}>
                                                                <Text style={styles.statLabel}>STATUS</Text>
                                                                <Text style={[
                                                                    styles.statValueSmall,
                                                                    {
                                                                        color: taskSchedule.find(i => i.date === selectedFullDate)?.status === 'Completed' ? '#4CAF50' :
                                                                            taskSchedule.find(i => i.date === selectedFullDate)?.status === 'Missed' ? '#FF5252' : '#00E5FF'
                                                                    }
                                                                ]}>
                                                                    {(taskSchedule.find(i => i.date === selectedFullDate)?.status || 'PENDING').toUpperCase()}
                                                                </Text>
                                                            </View>
                                                        </View>
                                                    ) : null}
                                                </View>

                                                {/* Right Pane: Month Slider + Calendar Grid OR Subtask Details */}
                                                <View style={styles.rightPane}>
                                                    {!selectedFullDate ? (
                                                        <>
                                                            <ScrollView
                                                                horizontal
                                                                showsHorizontalScrollIndicator={false}
                                                                style={styles.monthSliderCompact}
                                                                contentContainerStyle={styles.monthSliderContent}
                                                            >
                                                                {Object.keys(groupedDates).map(m => (
                                                                    <TouchableOpacity
                                                                        key={m}
                                                                        style={[styles.monthTabCompact, selectedCalendarMonth === m && styles.monthTabActiveCompact]}
                                                                        onPress={() => setSelectedCalendarMonth(m)}
                                                                    >
                                                                        <Text style={[styles.monthTabTextCompact, selectedCalendarMonth === m && styles.monthTabTextActiveCompact]}>
                                                                            {m.split(' ')[0].substring(0, 3).toUpperCase()}
                                                                        </Text>
                                                                    </TouchableOpacity>
                                                                ))}
                                                            </ScrollView>

                                                            {selectedCalendarMonth && groupedDates[selectedCalendarMonth] && (
                                                                <View style={styles.calendarContainerCompact}>
                                                                    <View style={styles.weekHeaderCompact}>
                                                                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                                                                            <Text key={i} style={styles.weekDayTextCompact}>{d}</Text>
                                                                        ))}
                                                                    </View>
                                                                    <View style={styles.calendarGridCompact}>
                                                                        {(() => {
                                                                            const monthItems = groupedDates[selectedCalendarMonth];
                                                                            const firstDate = new Date(monthItems[0].date);
                                                                            const year = firstDate.getFullYear();
                                                                            const month = firstDate.getMonth();
                                                                            const firstDayOfMonth = new Date(year, month, 1).getDay();
                                                                            const daysInMonth = new Date(year, month + 1, 0).getDate();
                                                                            const days = [];
                                                                            for (let i = 0; i < firstDayOfMonth; i++) days.push(null);
                                                                            for (let i = 1; i <= daysInMonth; i++) {
                                                                                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
                                                                                const scheduledItem = monthItems.find(item => item.date === dateStr);
                                                                                days.push({
                                                                                    day: i,
                                                                                    dateStr: dateStr,
                                                                                    isScheduled: !!scheduledItem,
                                                                                    duration: scheduledItem ? scheduledItem.duration : 0,
                                                                                    status: scheduledItem ? scheduledItem.status : 'Pending'
                                                                                });
                                                                            }
                                                                            const remaining = 7 - (days.length % 7);
                                                                            if (remaining < 7) {
                                                                                for (let i = 0; i < remaining; i++) days.push(null);
                                                                            }

                                                                            return days.map((dayInfo, idx) => (
                                                                                <View key={idx} style={styles.calendarCellCompact}>
                                                                                    {dayInfo ? (
                                                                                        <TouchableOpacity
                                                                                            style={[
                                                                                                styles.calendarDayCompact,
                                                                                                dayInfo.isScheduled && styles.calendarDayActiveCompact,
                                                                                                dayInfo.isScheduled && dayInfo.status === 'Completed' && styles.calendarDayCompletedCompact,
                                                                                                dayInfo.isScheduled && dayInfo.status === 'Missed' && styles.calendarDayMissedCompact,
                                                                                                dayInfo.isScheduled && dayInfo.status === 'Process' && styles.calendarDayProgressCompact,
                                                                                                selectedFullDate === dayInfo.dateStr && styles.calendarDaySelectedCompact,
                                                                                            ]}
                                                                                            onPress={() => {
                                                                                                if (dayInfo.isScheduled) {
                                                                                                    setSelectedFullDate(dayInfo.dateStr);
                                                                                                }
                                                                                            }}
                                                                                        >
                                                                                            <Text style={[
                                                                                                styles.calendarDayTextCompact,
                                                                                                dayInfo.isScheduled && styles.calendarDayTextActiveCompact
                                                                                            ]}>
                                                                                                {dayInfo.day}
                                                                                            </Text>
                                                                                            {dayInfo.isScheduled && (
                                                                                                <Text style={styles.calendarDayDurationCompact}>
                                                                                                    {dayInfo.duration.toFixed(1)}h
                                                                                                </Text>
                                                                                            )}
                                                                                        </TouchableOpacity>
                                                                                    ) : <View style={styles.calendarDayPlaceholderCompact} />}
                                                                                </View>
                                                                            ));
                                                                        })()}
                                                                    </View>
                                                                </View>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <View style={styles.dayDetailsContainer}>
                                                            <View style={styles.dayDetailsHeader}>
                                                                <Text style={styles.dayDetailsTitle}>SUBTASK DETAILS</Text>
                                                                <TouchableOpacity
                                                                    onPress={() => setSelectedFullDate(null)}
                                                                    style={styles.dayDetailsBack}
                                                                >
                                                                    <MaterialIcons name="close" size={14} color="rgba(255,255,255,0.4)" />
                                                                </TouchableOpacity>
                                                            </View>
                                                            <ScrollView style={styles.subtaskListScroll} showsVerticalScrollIndicator={false}>
                                                                {getStagesForDate(selectedFullDate).map((stage, idx) => (
                                                                    <View key={idx} style={styles.subtaskItemDetail}>
                                                                        <View style={styles.subtaskItemMain}>
                                                                            <View style={[
                                                                                styles.subtaskStatusDot,
                                                                                {
                                                                                    backgroundColor: stage.status === 'Done' ? '#4CAF50' :
                                                                                        stage.status === 'Process' ? '#FFC107' :
                                                                                            (selectedFullDate < new Date().toISOString().split('T')[0] ? '#FF5252' : 'rgba(255,255,255,0.2)')
                                                                                }
                                                                            ]} />
                                                                            <Text style={styles.subtaskItemText} numberOfLines={1}>{stage.text}</Text>
                                                                        </View>
                                                                        <Text style={styles.subtaskItemDuration}>{(stage.durationMinutes || 0) / 60}h</Text>
                                                                    </View>
                                                                ))}
                                                                {getStagesForDate(selectedFullDate).length === 0 && (
                                                                    <Text style={styles.noSubtasksText}>No subtasks for this date</Text>
                                                                )}
                                                            </ScrollView>
                                                        </View>
                                                    )}
                                                </View>
                                            </View>

                                            {isLandscape && isLinkingTask && taskSchedule.length > 0 && (
                                                <View style={styles.landscapeAnalyticsFooter}>
                                                    <View style={[styles.dateListContainer, styles.dateListContainerLandscape]}>
                                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateListContent}>
                                                            {taskSchedule.slice(0, 10).map((item, index) => (
                                                                <View key={index} style={[styles.dateBubble, styles.dateBubbleLandscape]}>
                                                                    <Text style={[styles.dateBubbleText, styles.dateBubbleTextLandscape]}>{item.label}</Text>
                                                                </View>
                                                            ))}
                                                            {taskSchedule.length > 10 && (
                                                                <View style={[styles.dateBubble, { backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.1)' }]}>
                                                                    <Text style={[styles.dateBubbleText, styles.dateBubbleTextLandscape, { color: 'rgba(255,255,255,0.3)' }]}>+{taskSchedule.length - 10} more</Text>
                                                                </View>
                                                            )}
                                                        </ScrollView>
                                                    </View>
                                                </View>
                                            )}
                                        </View>
                                    ) : null}
                                </View>
                            )}

                            {isLandscape && type === 'goal' ? (
                                <View style={styles.goalLandscapeRow}>
                                    <View style={styles.goalLandscapeLeftPane}>
                                        <View style={styles.inputGroup}>
                                            <Text style={styles.inputLabel}>GOAL TITLE</Text>
                                            <TextInput
                                                style={[styles.textInput, errorTitle && styles.inputError]}
                                                placeholder="Enter goal name..."
                                                placeholderTextColor="rgba(255,255,255,0.2)"
                                                value={title}
                                                onChangeText={(text) => {
                                                    setTitle(text);
                                                    if (text.trim()) setErrorTitle(false);
                                                }}
                                            />
                                            <View style={{ height: 16 }} />
                                            <Text style={styles.inputLabel}>DESCRIPTION</Text>
                                            <TextInput
                                                style={[styles.textInput, styles.descriptionInput]}
                                                placeholder="What do you want to achieve?"
                                                placeholderTextColor="rgba(255,255,255,0.2)"
                                                value={description}
                                                onChangeText={setDescription}
                                                multiline
                                            />
                                        </View>
                                    </View>

                                    <View style={styles.goalLandscapeRightPane}>
                                        {showStartPicker ? (
                                            renderCalendarPicker(true)
                                        ) : showEndPicker ? (
                                            renderCalendarPicker(false)
                                        ) : (
                                            <View style={styles.timelineInputSectionLandscape}>
                                                <Text style={styles.inputLabel}>STRATEGIC TIMELINE</Text>
                                                <View style={styles.dateInputRowLandscape}>
                                                    <View style={styles.dateInputHalf}>
                                                        <Text style={styles.dateLabelMini}>START DATE</Text>
                                                        <TouchableOpacity
                                                            style={styles.dateDisplayBtn}
                                                            onPress={() => {
                                                                setShowStartPicker(true);
                                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                            }}
                                                        >
                                                            <Text style={styles.dateDisplayBtnText}>{formatDisplayDate(startDate)}</Text>
                                                            <MaterialIcons name="event" size={14} color="rgba(255,255,255,0.4)" />
                                                        </TouchableOpacity>
                                                    </View>
                                                    <View style={styles.dateInputHalf}>
                                                        <Text style={styles.dateLabelMini}>END DATE (OPTIONAL)</Text>
                                                        <TouchableOpacity
                                                            style={styles.dateDisplayBtn}
                                                            onPress={() => {
                                                                setShowEndPicker(true);
                                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                            }}
                                                        >
                                                            <Text style={styles.dateDisplayBtnText}>{endDate ? formatDisplayDate(endDate) : 'Not Set'}</Text>
                                                            <MaterialIcons name="event" size={14} color="rgba(255,255,255,0.4)" />
                                                        </TouchableOpacity>
                                                    </View>
                                                </View>
                                            </View>
                                        )}
                                    </View>
                                </View>
                            ) : (
                                <>
                                    {type === 'goal' && (
                                        <View style={styles.inputGroup}>
                                            <Text style={styles.inputLabel}>GOAL TITLE</Text>
                                            <TextInput
                                                style={[styles.textInput, errorTitle && styles.inputError]}
                                                placeholder="Enter goal name..."
                                                placeholderTextColor="rgba(255,255,255,0.2)"
                                                value={title}
                                                onChangeText={(text) => {
                                                    setTitle(text);
                                                    if (text.trim()) setErrorTitle(false);
                                                }}
                                            />
                                            <View style={{ height: 16 }} />
                                            <Text style={styles.inputLabel}>DESCRIPTION</Text>
                                            <TextInput
                                                style={[styles.textInput, styles.descriptionInput]}
                                                placeholder="What do you want to achieve?"
                                                placeholderTextColor="rgba(255,255,255,0.2)"
                                                value={description}
                                                onChangeText={setDescription}
                                                multiline
                                            />
                                        </View>
                                    )}

                                    {type === 'goal' && (
                                        <>
                                            {showStartPicker ? (
                                                renderCalendarPicker(true)
                                            ) : showEndPicker ? (
                                                renderCalendarPicker(false)
                                            ) : (
                                                <View style={styles.timelineInputSection}>
                                                    <Text style={styles.inputLabel}>STRATEGIC TIMELINE</Text>
                                                    <View style={styles.dateInputRow}>
                                                        <View style={styles.dateInputHalf}>
                                                            <Text style={[styles.dateLabelMini, errorStartDate && { color: '#FF5252' }]}>START TARGET</Text>
                                                            <TouchableOpacity
                                                                style={styles.dateDisplayBtn}
                                                                onPress={() => {
                                                                    setShowStartPicker(true);
                                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                                }}
                                                            >
                                                                <Text style={styles.dateDisplayBtnText}>{formatDisplayDate(startDate)}</Text>
                                                                <MaterialIcons name="event" size={14} color="rgba(255,255,255,0.4)" />
                                                            </TouchableOpacity>
                                                        </View>
                                                        <View style={styles.dateInputHalf}>
                                                            <Text style={[styles.dateLabelMini, errorEndDate && { color: '#FF5252' }]}>END TARGET</Text>
                                                            <TouchableOpacity
                                                                style={styles.dateDisplayBtn}
                                                                onPress={() => {
                                                                    setShowEndPicker(true);
                                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                                }}
                                                            >
                                                                <Text style={styles.dateDisplayBtnText}>{endDate ? formatDisplayDate(endDate) : 'Select End Date'}</Text>
                                                                <MaterialIcons name="event" size={14} color="rgba(255,255,255,0.4)" />
                                                            </TouchableOpacity>
                                                        </View>
                                                    </View>
                                                </View>
                                            )}
                                        </>
                                    )}
                                </>
                            )}
                        </ScrollView>

                        {(!isLandscape || (isLandscape && selectedTaskId == null)) && (
                            <View style={[
                                styles.footerCtaWrap,
                                isLandscape && styles.footerCtaWrapLandscape,
                                isTaskFlow && styles.footerCtaWrapCompact,
                            ]}>
                                {renderCTA(isLandscape && selectedTaskId == null)}
                            </View>
                        )}
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.78)',
    },
    keyboardView: {
        width: '100%',
    },
    modalContent: {
        backgroundColor: '#0a0a0a',
        borderRadius: 18,
        padding: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    modalContentTaskCompact: {
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 16,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    headerCompact: {
        marginBottom: 6,
    },
    headerTitle: {
        fontSize: 12,
        fontWeight: '900',
        color: '#fff',
        letterSpacing: 2,
    },
    closeBtn: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    scroll: {
        marginBottom: 0,
    },
    scrollContentTask: {
        paddingBottom: 4,
    },
    scrollContentTaskLandscape: {
        flexGrow: 0,
    },
    selectionView: {
        marginBottom: 8,
    },
    filterSection: {
        marginBottom: 14,
    },
    filterSectionCompact: {
        marginBottom: 8,
    },
    sectionLabel: {
        fontSize: 9,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 1.2,
        marginBottom: 6,
    },
    sectionLabelCompact: {
        marginBottom: 4,
        fontSize: 8,
        letterSpacing: 0.8,
    },
    filterScroll: {
        gap: 8,
    },
    filterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        gap: 6,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    filterChipActive: {
        backgroundColor: '#4CAF50',
        borderColor: '#4CAF50',
    },
    filterChipText: {
        fontSize: 10,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.5)',
    },
    filterChipTextActive: {
        color: '#fff',
    },
    toggleRow: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 12,
        padding: 3,
        gap: 2,
    },
    toggleBtn: {
        flex: 1,
        paddingVertical: 6,
        alignItems: 'center',
        borderRadius: 10,
    },
    toggleBtnActive: {
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    toggleBtnText: {
        fontSize: 10,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.3)',
    },
    toggleBtnTextActive: {
        color: '#fff',
    },
    taskListGrid: {
        marginTop: 2,
    },
    taskListGridCompact: {
        marginTop: 0,
    },
    taskCardsScroll: {
        gap: 8,
        paddingVertical: 2,
    },
    taskCard: {
        width: 124,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 10,
        padding: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        position: 'relative',
    },
    taskCardSelected: {
        borderColor: '#4CAF50',
        backgroundColor: 'rgba(76, 175, 80, 0.08)',
    },
    taskCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        marginBottom: 2,
    },
    priorityDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    taskCardTitle: {
        fontSize: 10,
        fontWeight: '700',
        color: '#fff',
        flex: 1,
    },
    taskCardSub: {
        fontSize: 8,
        color: 'rgba(255,255,255,0.3)',
        fontWeight: '500',
    },
    taskCheck: {
        position: 'absolute',
        top: -4,
        right: -4,
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: '#4CAF50',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#000',
    },
    emptyTasks: {
        padding: 14,
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.01)',
        borderRadius: 12,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: 'rgba(255,255,255,0.05)',
        gap: 8,
    },
    emptyTasksText: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.2)',
        fontStyle: 'italic',
    },
    expandToggleBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        marginTop: 12,
        backgroundColor: 'rgba(76, 175, 80, 0.05)',
        borderRadius: 10,
        gap: 6,
        borderWidth: 1,
        borderColor: 'rgba(76, 175, 80, 0.1)',
    },
    expandToggleBtnActive: {
        backgroundColor: 'rgba(76, 175, 80, 0.1)',
    },
    expandToggleText: {
        fontSize: 9,
        fontWeight: '900',
        color: '#4CAF50',
        letterSpacing: 1,
    },
    detailedSchedule: {
        marginTop: 16,
        backgroundColor: 'rgba(255,255,255,0.015)',
        borderRadius: 20,
        padding: 4,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    monthGroup: {
        marginBottom: 20,
    },
    monthHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: 'rgba(255,255,255,0.02)',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
    },
    monthLabel: {
        fontSize: 9,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: 2,
    },
    monthBadge: {
        backgroundColor: 'rgba(0, 229, 255, 0.1)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(0, 229, 255, 0.2)',
    },
    monthBadgeText: {
        fontSize: 8,
        fontWeight: '900',
        color: '#00E5FF',
    },
    monthSlider: {
        marginTop: 8,
        marginBottom: 12,
        paddingHorizontal: 8,
    },
    monthSliderContent: {
        gap: 8,
    },
    monthTab: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    monthTabActive: {
        backgroundColor: 'rgba(76, 175, 80, 0.15)',
        borderColor: 'rgba(76, 175, 80, 0.3)',
    },
    monthTabText: {
        fontSize: 9,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 0.8,
    },
    monthTabTextActive: {
        color: '#4CAF50',
    },
    calendarContainer: {
        padding: 6,
        backgroundColor: 'rgba(255,255,255,0.01)',
        borderRadius: 16,
    },
    weekHeader: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 8,
    },
    weekDayText: {
        fontSize: 8,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.15)',
        width: 28,
        textAlign: 'center',
    },
    calendarGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'flex-start',
    },
    calendarCell: {
        width: '14.28%',
        aspectRatio: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 3,
    },
    calendarDay: {
        width: '100%',
        aspectRatio: 1,
        borderRadius: 999, // Perfect circle
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    calendarDayActive: {
        backgroundColor: '#4CAF50',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        shadowColor: '#4CAF50',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
    },
    calendarDayEmpty: {
        width: '100%',
        height: '100%',
    },
    calendarDayText: {
        fontSize: 10,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.3)',
    },
    calendarDayTextActive: {
        color: '#fff',
        fontWeight: '900',
    },
    calendarDayDur: {
        fontSize: 6,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.8)',
        marginTop: -1,
    },
    commitmentContainer: {
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    commitmentHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 12,
    },
    commitmentTitle: {
        fontSize: 9,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: 1,
    },
    durationGrid: {
        marginBottom: 12,
    },
    durationCol: {
        flex: 1,
    },
    durationLabel: {
        fontSize: 8,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.25)',
        marginBottom: 4,
    },
    durationValueContainer: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    durationValue: {
        fontWeight: '900',
    },
    durationUnit: {
        fontSize: 9,
        color: 'rgba(255, 255, 255, 0.3)',
        marginLeft: 1,
        fontWeight: '600',
    },
    durationSubText: {
        fontSize: 9,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.15)',
        marginTop: 2,
    },
    dateListContainer: {
        marginTop: 4,
        paddingTop: 6,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.03)',
    },
    dateListContent: {
        gap: 6,
    },
    dateBubble: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        backgroundColor: 'rgba(0, 229, 255, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(0, 229, 255, 0.1)',
    },
    dateBubbleText: {
        fontSize: 8,
        fontWeight: '700',
        color: '#00E5FF',
    },
    inputGroup: {
        marginBottom: 20,
    },
    inputLabel: {
        fontSize: 9,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 1,
        marginBottom: 8,
    },
    textInput: {
        backgroundColor: 'rgba(20,20,20,0.5)',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        color: '#fff',
        fontSize: 13,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    inputError: {
        borderColor: '#FF5252',
        backgroundColor: 'rgba(255, 82, 82, 0.05)',
    },
    descriptionInput: {
        height: 80,
        textAlignVertical: 'top',
    },
    saveBtn: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12.8,
        paddingVertical: 12.8,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 16,
        marginBottom: 12.8,
    },
    saveBtnText: {
        color: '#000',
        fontSize: 13.6,
        fontWeight: '700',
    },
    unifiedScheduleCard: {
        flexDirection: 'row',
        alignItems: 'stretch',
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        overflow: 'hidden',
        marginTop: 6,
        marginBottom: 8,
    },
    leftPane: {
        flex: 0.75,
        flexDirection: 'column',
        paddingVertical: 8,
        paddingLeft: 10,
        paddingRight: 14,
        backgroundColor: 'rgba(12, 14, 12, 0.55)',
        borderRightWidth: 2,
        borderRightColor: 'rgba(76, 175, 80, 0.22)',
        justifyContent: 'flex-start',
    },
    rightPane: {
        flex: 1.25,
        paddingVertical: 8,
        paddingLeft: 14,
        paddingRight: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.025)',
    },
    commitmentHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginBottom: 4,
    },
    timelineInputSection: {
        marginTop: 20,
        backgroundColor: 'rgba(255,255,255,0.03)',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    dateInputRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
    },
    dateInputHalf: {
        flex: 1,
    },
    dateLabelMini: {
        fontSize: 7,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.2)',
        letterSpacing: 1,
        marginBottom: 6,
    },
    dateTextInput: {
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: '#fff',
        fontSize: 12,
        fontWeight: '700',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    dateDisplayBtn: {
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    dateDisplayBtnText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '700',
    },
    calendarMini: {
        padding: 12,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        marginTop: 10,
    },
    calHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    calBack: {
        padding: 4,
    },
    calTitle: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '700',
    },
    calNav: {
        flexDirection: 'row',
        gap: 12,
    },
    calNavBtn: {
        padding: 4,
    },
    weekRowPicker: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    weekTextPicker: {
        width: '14.2%',
        textAlign: 'center',
        color: 'rgba(255,255,255,0.3)',
        fontSize: 10,
        fontWeight: '600',
    },
    daysGridPicker: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dayCellPicker: {
        width: '14.28%',
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayCirclePicker: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayTextPicker: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '500',
    },
    todayCirclePicker: {
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    selectedCirclePicker: {
        backgroundColor: '#4CAF50',
    },
    goalLandscapeRow: {
        flexDirection: 'row',
        gap: 16,
        alignItems: 'flex-start',
    },
    goalLandscapeLeftPane: {
        flex: 1,
    },
    goalLandscapeRightPane: {
        flex: 1,
    },
    timelineInputSectionLandscape: {
        backgroundColor: 'rgba(255,255,255,0.03)',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    dateInputRowLandscape: {
        flexDirection: 'column',
        gap: 12,
        marginTop: 8,
    },
    commitmentTitleSmall: {
        fontSize: 9,
        fontWeight: '900',
        color: '#00E5FF',
        letterSpacing: 1.5,
    },
    statsColumn: {
        gap: 5,
    },
    statItemCompact: {
        gap: 0,
    },
    statRowCompact: {
        flexDirection: 'row',
        gap: 8,
    },
    statItemHalf: {
        flex: 1,
        gap: 0,
    },
    statLabel: {
        fontSize: 6.5,
        fontWeight: '900',
        color: 'rgba(255, 255, 255, 0.25)',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
    },
    statValueLarge: {
        fontSize: 24,
        fontWeight: '900',
        color: '#fff',
    },
    statValueLargeLandscape: {
        fontSize: 18,
    },
    statValueSmall: {
        fontSize: 13,
        fontWeight: '700',
        color: 'rgba(255, 255, 255, 0.9)',
    },
    statUnit: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.4)',
        marginLeft: 2,
        fontWeight: '600',
    },
    subtaskLegendInLeftPane: {
        marginTop: 'auto',
        paddingTop: 10,
        gap: 4,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.1)',
        alignSelf: 'stretch',
    },
    subtaskRowMini: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    subtaskDotMini: {
        width: 3.5,
        height: 3.5,
        borderRadius: 2,
    },
    subtaskLabelMini: {
        fontSize: 7,
        fontWeight: '800',
        color: 'rgba(255, 255, 255, 0.35)',
        letterSpacing: 0.3,
    },
    monthSliderCompact: {
        marginBottom: 8,
        paddingHorizontal: 1,
    },
    monthTabCompact: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        marginRight: 6,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.04)',
    },
    monthTabActiveCompact: {
        backgroundColor: '#4CAF50',
        borderColor: '#66bb6a',
    },
    monthTabTextCompact: {
        fontSize: 9,
        fontWeight: '800',
        color: 'rgba(255, 255, 255, 0.4)',
        letterSpacing: 0.5,
    },
    monthTabTextActiveCompact: {
        color: '#fff',
    },
    calendarContainerCompact: {
        flex: 1,
    },
    weekHeaderCompact: {
        flexDirection: 'row',
        marginBottom: 4,
    },
    weekDayTextCompact: {
        flex: 1,
        textAlign: 'center',
        fontSize: 8,
        fontWeight: '800',
        color: 'rgba(255, 255, 255, 0.2)',
    },
    calendarGridCompact: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    calendarCellCompact: {
        width: '14.28%',
        aspectRatio: 1,
        padding: 2,
    },
    calendarDayCompact: {
        width: '100%',
        height: '100%',
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
    },
    calendarDayActiveCompact: {
        backgroundColor: 'rgba(76, 175, 80, 0.2)', // Pending/Upcoming: Subtle Green
        borderColor: 'rgba(76, 175, 80, 0.4)',
        borderWidth: 1,
    },
    calendarDayCompletedCompact: {
        backgroundColor: '#4CAF50', // Completed: Solid Green
        borderColor: '#4CAF50',
    },
    calendarDayMissedCompact: {
        backgroundColor: '#FF5252', // Missed: Solid Red
        borderColor: '#FF5252',
    },
    calendarDayProgressCompact: {
        backgroundColor: '#FFC107', // In Progress: Amber
        borderColor: '#FFC107',
    },
    calendarDayTextCompact: {
        fontSize: 9,
        fontWeight: '700',
        color: 'rgba(255, 255, 255, 0.5)',
    },
    calendarDayTextActiveCompact: {
        color: '#fff',
        marginBottom: 1,
    },
    calendarDayDurationCompact: {
        fontSize: 6,
        fontWeight: '800',
        color: 'rgba(255, 255, 255, 0.7)',
        marginTop: -2,
    },
    calendarDayPlaceholderCompact: {
        width: '100%',
        aspectRatio: 1,
    },
    cancelLink: {
        alignItems: 'center',
        paddingVertical: 8,
    },
    cancelLinkText: {
        fontSize: 12,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.45)',
    },
    noSubtasksText: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.2)',
        textAlign: 'center',
        marginTop: 12,
        fontStyle: 'italic',
    },
    calendarDaySelectedCompact: {
        borderColor: '#00E5FF',
        borderWidth: 1.5,
    },
    statValueMedium: {
        fontSize: 14,
        fontWeight: '800',
        color: '#fff',
    },
    dayDetailsContainer: {
        padding: 10,
        backgroundColor: 'rgba(255,255,255,0.01)',
        borderRadius: 16,
        flex: 1,
    },
    dayDetailsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
        paddingBottom: 4,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    dayDetailsTitle: {
        fontSize: 9,
        fontWeight: '900',
        color: '#00E5FF',
        letterSpacing: 1,
    },
    dayDetailsBack: {
        padding: 4,
    },
    subtaskListScroll: {
        flex: 1,
    },
    subtaskItemDetail: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.03)',
    },
    subtaskItemMain: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    subtaskStatusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    subtaskItemText: {
        fontSize: 10,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.7)',
        flex: 1,
    },
    subtaskItemDuration: {
        fontSize: 9,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.3)',
        marginLeft: 8,
    },
    modalContentLandscape: {
        width: '100%',
        padding: 8,
        paddingHorizontal: 10,
        paddingBottom: 4,
        height: 'auto',
    },
    selectionViewLandscape: {
        flexDirection: 'row-reverse',
        gap: 6,
        alignItems: 'flex-start',
        marginBottom: 4,
    },
    selectionViewLandscapePickerOnly: {
        flexDirection: 'column',
        width: '100%',
        marginBottom: 0,
    },
    landscapePickerFullWidth: {
        width: '100%',
        flexShrink: 0,
    },
    landscapeLeftPane: {
        width: '47%',
        flexShrink: 0,
        paddingLeft: 6,
        borderLeftWidth: 1,
        borderLeftColor: 'rgba(255,255,255,0.06)',
    },
    landscapeRightPane: {
        width: '51%',
        flexShrink: 0,
        alignSelf: 'stretch',
        paddingRight: 2,
        paddingLeft: 0,
        flexDirection: 'column',
        backgroundColor: 'transparent',
    },
    portraitAnalyticsColumn: {
        width: '100%',
        marginTop: 8,
    },
    landscapeAnalyticsFooter: {
        marginTop: 8,
        paddingHorizontal: 0,
        width: '100%',
    },
    dateListContainerLandscape: {
        marginTop: 0,
        marginBottom: 0,
        paddingTop: 6,
        paddingBottom: 2,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.06)',
    },
    dateBubbleLandscape: {
        paddingVertical: 2,
        paddingHorizontal: 6,
    },
    dateBubbleTextLandscape: {
        fontSize: 8,
    },
    unifiedScheduleCardLandscape: {
        marginTop: 0,
        marginBottom: 0,
        width: '100%',
        alignSelf: 'stretch',
        backgroundColor: 'rgba(255, 255, 255, 0.045)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        alignItems: 'stretch',
    },
    headerLandscape: {
        marginBottom: 2,
    },
    landscapeCtaInline: {
        marginTop: 6,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.06)',
        paddingTop: 6,
        paddingBottom: 2,
    },
    footerCtaWrap: {
        paddingTop: 8,
        marginTop: 2,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.06)',
    },
    footerCtaWrapLandscape: {
        paddingTop: 6,
        marginTop: 0,
    },
    footerCtaWrapCompact: {
        paddingTop: 4,
        marginTop: 0,
    },
    filterSectionLandscape: {
        marginBottom: 6,
    },
    sectionLabelLandscape: {
        fontSize: 8,
        marginBottom: 4,
    },
    ctaRow: {
        marginTop: 6,
    },
    ctaRowLandscape: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginTop: 2,
    },
    saveBtnLandscape: {
        flex: 1,
        marginTop: 0,
        borderRadius: 10,
    },
    saveBtnTextLandscape: {
        fontSize: 12,
    },
    cancelBtnLandscape: {
        paddingHorizontal: 20,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 10,
    },
    cancelBtnTextLandscape: {
        fontSize: 10,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.6)',
    },
});
