import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    TextInput,
    ScrollView,
    useWindowDimensions,
    KeyboardAvoidingView,
    Platform,
    Dimensions,
    Keyboard,
    TouchableWithoutFeedback,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Category, Task, Recurrence, RecurrenceType, RecurrenceBase } from '../constants/data';
import { getLogicalDate, DEFAULT_DAILY_START_MINUTES } from '../utils/dailyStartTime';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface AddTaskModalProps {
    visible: boolean;
    onCancel: () => void;
    onAdd: (task: { title: string; description?: string; priority: Task['priority']; categoryId?: string; forDate: string; isBacklog?: boolean; recurrence?: Recurrence }) => void;
    onUpdate?: (taskId: number, task: { title: string; description?: string; priority: Task['priority']; categoryId?: string; forDate: string; isBacklog?: boolean; recurrence?: Recurrence }) => void;
    categories: Category[];
    initialDate?: string;
    /** Daily start (minutes from midnight). Used so "today" and isPast match 06:00–06:00 logical day. */
    dailyStartMinutes?: number;
    isPastTasksDisabled?: boolean;
    taskToEdit?: Task | null;
}

export default function AddTaskModal({
    visible,
    onCancel,
    onAdd,
    onUpdate,
    categories,
    initialDate,
    dailyStartMinutes = DEFAULT_DAILY_START_MINUTES,
    isPastTasksDisabled = false,
    taskToEdit = null,
}: AddTaskModalProps) {
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const isLandscape = screenWidth > screenHeight;

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState<Task['priority']>('Medium');
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(categories[0]?.id);
    const [selectedDate, setSelectedDate] = useState(initialDate || getLogicalDate(new Date(), dailyStartMinutes));
    const [isBacklog, setIsBacklog] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [viewDate, setViewDate] = useState(new Date(selectedDate));
    const [errorTitle, setErrorTitle] = useState(false);

    // Recurrence state
    const [isRecurring, setIsRecurring] = useState(false);
    const [repeatSync, setRepeatSync] = useState(false);
    const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>('daily');
    const [recurrenceStartDate, setRecurrenceStartDate] = useState(getLogicalDate(new Date(), dailyStartMinutes));
    const [recurrenceEndDate, setRecurrenceEndDate] = useState<string | undefined>(undefined);
    const [recurrenceEndEnabled, setRecurrenceEndEnabled] = useState(false);
    const [recurrenceDays, setRecurrenceDays] = useState<number[]>([new Date().getDay()]); // Default to current weekday
    const [recurrenceMonthlyMode, setRecurrenceMonthlyMode] = useState<'date' | 'weekday'>('date');
    const [recurrenceMonthlyDates, setRecurrenceMonthlyDates] = useState<number[]>([new Date().getDate()]);
    const [recurrenceMonthlyWeekOfMonth, setRecurrenceMonthlyWeekOfMonth] = useState<Array<1 | 2 | 3 | 4 | -1>>([1]);
    const [recurrenceMonthlyWeekdays, setRecurrenceMonthlyWeekdays] = useState<number[]>([new Date().getDay()]);
    const [showMonthlyWeekdayCalendar, setShowMonthlyWeekdayCalendar] = useState(false);
    const [monthlyWeekdayPickedDate, setMonthlyWeekdayPickedDate] = useState<number | null>(null); // day-of-month highlight
    const [showWeeklyCalendar, setShowWeeklyCalendar] = useState(false);
    const [weeklyViewDate, setWeeklyViewDate] = useState(new Date());
    const [showRecurrenceStartPicker, setShowRecurrenceStartPicker] = useState(false);
    const [showRecurrenceEndPicker, setShowRecurrenceEndPicker] = useState(false);
    const [recurrenceViewDate, setRecurrenceViewDate] = useState(new Date());
    const [recurrenceEndViewDate, setRecurrenceEndViewDate] = useState(new Date());

    useEffect(() => {
        if (visible) {
            if (taskToEdit) {
                setTitle(taskToEdit.title);
                setDescription(taskToEdit.description || '');
                setPriority(taskToEdit.priority);
                setSelectedCategoryId(taskToEdit.categoryId);
                setSelectedDate(taskToEdit.forDate);
                setViewDate(new Date(taskToEdit.forDate));
                setIsBacklog(!!taskToEdit.isBacklog);

                // Load recurrence if exists
                if (taskToEdit.recurrence) {
                    setIsRecurring(true);
                    setRepeatSync(!!taskToEdit.recurrence.repeatSync);
                    setRecurrenceType(taskToEdit.recurrence.type);
                    setRecurrenceStartDate(taskToEdit.recurrence.startDate);
                    setRecurrenceEndDate(taskToEdit.recurrence.endDate);
                    setRecurrenceEndEnabled(!!taskToEdit.recurrence.endDate);
                    if (taskToEdit.recurrence.type === 'weekly') {
                        setRecurrenceDays(taskToEdit.recurrence.days);
                    }
                    if (taskToEdit.recurrence.type === 'monthly') {
                        setRecurrenceMonthlyMode(taskToEdit.recurrence.mode);
                        if (taskToEdit.recurrence.mode === 'date') {
                            setRecurrenceMonthlyDates(taskToEdit.recurrence.dates?.length ? taskToEdit.recurrence.dates : [new Date(taskToEdit.recurrence.startDate).getDate()]);
                        } else {
                            setRecurrenceMonthlyWeekOfMonth((taskToEdit.recurrence.weekOfMonth?.length ? taskToEdit.recurrence.weekOfMonth : [1]) as Array<1 | 2 | 3 | 4 | -1>);
                            setRecurrenceMonthlyWeekdays(taskToEdit.recurrence.weekdays?.length ? taskToEdit.recurrence.weekdays : [new Date(taskToEdit.recurrence.startDate).getDay()]);
                        }
                    }
                } else {
                    setIsRecurring(false);
                    setRepeatSync(false);
                }
            } else {
                setTitle('');
                setDescription('');
                setPriority('Medium');
                setSelectedCategoryId(categories[0]?.id);
                const date = initialDate || getLogicalDate(new Date(), dailyStartMinutes);
                setSelectedDate(date);
                setViewDate(new Date(date));
                setIsBacklog(false);

                // Reset recurrence
                setIsRecurring(false);
                setRepeatSync(false);
                setRecurrenceType('daily');
                setRecurrenceStartDate(date);
                setRecurrenceEndDate(undefined);
                setRecurrenceEndEnabled(false);
                setRecurrenceDays([new Date().getDay()]);
                setRecurrenceMonthlyMode('date');
                setRecurrenceMonthlyDates([new Date(date).getDate()]);
                setRecurrenceMonthlyWeekOfMonth([1]);
                setRecurrenceMonthlyWeekdays([new Date().getDay()]);
                setShowMonthlyWeekdayCalendar(false);
                setMonthlyWeekdayPickedDate(null);
                setShowWeeklyCalendar(false);
            }
            setShowDatePicker(false);
            setShowRecurrenceStartPicker(false);
            setShowRecurrenceEndPicker(false);
            setShowWeeklyCalendar(false);
            setShowMonthlyWeekdayCalendar(false);
            setErrorTitle(false);
            if (!taskToEdit || !taskToEdit.recurrence) {
                const initDate = initialDate || getLogicalDate(new Date(), dailyStartMinutes);
                setRecurrenceViewDate(new Date(initDate));
                setWeeklyViewDate(new Date(initDate));
                setRecurrenceEndViewDate(new Date());
            } else {
                setRecurrenceViewDate(new Date(taskToEdit.recurrence.startDate));
                setWeeklyViewDate(new Date(taskToEdit.recurrence.startDate));
                setRecurrenceEndViewDate(taskToEdit.recurrence.endDate ? new Date(taskToEdit.recurrence.endDate) : new Date());
            }
        }
    }, [visible, initialDate, taskToEdit, dailyStartMinutes]);

    const buildRecurrence = (): Recurrence | undefined => {
        if (!isRecurring) return undefined;

        const base: RecurrenceBase = {
            startDate: recurrenceStartDate,
            ...(recurrenceEndEnabled && recurrenceEndDate ? { endDate: recurrenceEndDate } : {}),
            ...(repeatSync ? { repeatSync: true } : {}),
        };

        switch (recurrenceType) {
            case 'daily':
                return { ...base, type: 'daily' };
            case 'weekly':
                if (recurrenceDays.length === 0) return undefined; // Validation: at least one day
                return { ...base, type: 'weekly', days: recurrenceDays };
            case 'monthly':
                if (recurrenceMonthlyMode === 'date') {
                    if (recurrenceMonthlyDates.length === 0) return undefined;
                    return { ...base, type: 'monthly', mode: 'date', dates: recurrenceMonthlyDates };
                }
                if (recurrenceMonthlyWeekdays.length === 0) return undefined;
                if (recurrenceMonthlyWeekOfMonth.length === 0) return undefined;
                return { ...base, type: 'monthly', mode: 'weekday', weekOfMonth: recurrenceMonthlyWeekOfMonth, weekdays: recurrenceMonthlyWeekdays };
            default:
                return undefined;
        }
    };

    const handleAdd = () => {
        if (!title.trim()) {
            setErrorTitle(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            return;
        }

        // Validate recurrence
        if (isRecurring) {
            if (recurrenceType === 'weekly' && recurrenceDays.length === 0) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                return;
            }
            if (recurrenceType === 'monthly') {
                if (recurrenceMonthlyMode === 'date' && recurrenceMonthlyDates.length === 0) {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    return;
                }
                if (recurrenceMonthlyMode === 'weekday' && recurrenceMonthlyWeekdays.length === 0) {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    return;
                }
                if (recurrenceMonthlyMode === 'weekday' && recurrenceMonthlyWeekOfMonth.length === 0) {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    return;
                }
            }
            if (recurrenceEndEnabled && recurrenceEndDate && recurrenceEndDate < recurrenceStartDate) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                return;
            }
        }

        const recurrence = buildRecurrence();

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (taskToEdit && onUpdate) {
            onUpdate(taskToEdit.id, {
                title: title.trim(),
                description: description.trim() || undefined,
                priority,
                categoryId: selectedCategoryId,
                forDate: selectedDate,
                isBacklog,
                recurrence,
            });
        } else {
            onAdd({
                title: title.trim(),
                description: description.trim() || undefined,
                priority,
                categoryId: selectedCategoryId,
                forDate: selectedDate,
                isBacklog,
                recurrence,
            });
        }
    };

    const handleCancel = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onCancel();
    };

    const priorities: Task['priority'][] = ['Low', 'Medium', 'High'];

    const getPriorityColor = (p: Task['priority']) => {
        switch (p) {
            case 'High': return '#FF5252';
            case 'Medium': return '#FFB74D';
            case 'Low': return 'rgba(255,255,255,0.4)';
        }
    };

    const getRecurrenceSummary = (): string => {
        if (!isRecurring) {
            const date = new Date(selectedDate);
            const dateStr = selectedDate === getLogicalDate(new Date(), dailyStartMinutes)
                ? 'today'
                : `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
            return `One-time task on ${dateStr}`;
        }

        const weekDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const startDate = new Date(recurrenceStartDate);
        const startDateStr = recurrenceStartDate === getLogicalDate(new Date(), dailyStartMinutes)
            ? 'today'
            : `${MONTHS[startDate.getMonth()]} ${startDate.getDate()}, ${startDate.getFullYear()}`;

        let frequencyPart = '';

        switch (recurrenceType) {
            case 'daily':
                frequencyPart = 'Daily task';
                break;
            case 'weekly':
                const sortedDays = [...recurrenceDays].sort((a, b) => a - b);
                const dayNames = sortedDays.map(d => weekDayNames[d]);
                if (dayNames.length === 1) {
                    frequencyPart = `Weekly task on ${dayNames[0]}`;
                } else if (dayNames.length === 2) {
                    frequencyPart = `Weekly task on ${dayNames[0]} and ${dayNames[1]}`;
                } else {
                    const lastDay = dayNames.pop();
                    frequencyPart = `Weekly task on ${dayNames.join(', ')}, and ${lastDay}`;
                }
                break;
            case 'monthly':
                if (recurrenceMonthlyMode === 'date') {
                    const sortedDates = [...recurrenceMonthlyDates].sort((a, b) => a - b);
                    if (sortedDates.length === 1) {
                        const suffix = sortedDates[0] === 1 ? 'st' : sortedDates[0] === 2 ? 'nd' : sortedDates[0] === 3 ? 'rd' : 'th';
                        frequencyPart = `Monthly task on the ${sortedDates[0]}${suffix}`;
                    } else {
                        const datesStr = sortedDates.map(d => {
                            const suffix = d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th';
                            return `${d}${suffix}`;
                        }).join(', ');
                        frequencyPart = `Monthly task on the ${datesStr}`;
                    }
                } else {
                    const weekLabels = ['1st', '2nd', '3rd', '4th', 'Last'];
                    const weekNames = recurrenceMonthlyWeekOfMonth
                        .sort((a, b) => {
                            if (a === -1) return 1;
                            if (b === -1) return -1;
                            return a - b;
                        })
                        .map(w => w === -1 ? 'Last' : weekLabels[w - 1]);
                    const weekdayNames = [...recurrenceMonthlyWeekdays]
                        .sort((a, b) => a - b)
                        .map(d => weekDayNames[d]);

                    if (weekNames.length === 1 && weekdayNames.length === 1) {
                        frequencyPart = `Monthly task on the ${weekNames[0]} ${weekdayNames[0]}`;
                    } else {
                        const weekStr = weekNames.join(' and ');
                        const weekdayStr = weekdayNames.length === 1
                            ? weekdayNames[0]
                            : weekdayNames.slice(0, -1).join(', ') + ', and ' + weekdayNames[weekdayNames.length - 1];
                        frequencyPart = `Monthly task on the ${weekStr} ${weekdayStr}`;
                    }
                }
                break;
        }

        const endPart = recurrenceEndEnabled && recurrenceEndDate
            ? (() => {
                const endDate = new Date(recurrenceEndDate);
                return ` until ${MONTHS[endDate.getMonth()]} ${endDate.getDate()}, ${endDate.getFullYear()}`;
            })()
            : '';

        return `${frequencyPart} starting ${startDateStr}${endPart}`;
    };

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
                        <MaterialIcons name="arrow-back" size={16} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.calTitle}>{MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}</Text>
                    <View style={styles.calNav}>
                        <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.calNavBtn}>
                            <MaterialIcons name="chevron-left" size={16} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => changeMonth(1)} style={styles.calNavBtn}>
                            <MaterialIcons name="chevron-right" size={16} color="#fff" />
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
                        const isToday = item.current && todayStr === dateStr;
                        const isPast = item.current && dateStr < todayStr;

                        return (
                            <TouchableOpacity
                                key={i}
                                style={styles.dayCell}
                                disabled={!item.current}
                                onPress={() => {
                                    if (item.current && (!isPastTasksDisabled || !isPast)) {
                                        setSelectedDate(dateStr);
                                        setShowDatePicker(false);
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                    }
                                }}
                            >
                                <View style={[
                                    styles.dayCircle,
                                    (!item.current || (isPastTasksDisabled && isPast)) && { opacity: 0.2 },
                                    isToday && styles.todayCircle,
                                    isSelected && (isPast ? styles.selectedPastCircle : styles.selectedFutureCircle)
                                ]}>
                                    <Text style={[
                                        styles.dayText,
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

    const renderCategoryPicker = () => (
        <View style={styles.inputSection}>
            <Text style={styles.label}>CATEGORY</Text>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryScroll}
            >
                {categories.filter(c => c.isEnabled !== false).map((cat) => (
                    <TouchableOpacity
                        key={cat.id}
                        style={[
                            styles.categoryChip,
                            selectedCategoryId === cat.id && {
                                backgroundColor: `${cat.color}20`,
                                borderColor: cat.color,
                            }
                        ]}
                        onPress={() => {
                            setSelectedCategoryId(cat.id);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                    >
                        <MaterialIcons
                            name={cat.icon}
                            size={9.6}
                            color={selectedCategoryId === cat.id ? cat.color : 'rgba(255,255,255,0.4)'}
                        />
                        <Text style={[
                            styles.categoryChipText,
                            selectedCategoryId === cat.id && { color: cat.color }
                        ]}>{cat.name}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>
            <Text style={styles.recurrenceSummaryText} numberOfLines={2} ellipsizeMode="tail">{getRecurrenceSummary()}</Text>
        </View>
    );

    const toggleRecurrenceDay = (day: number) => {
        setRecurrenceDays(prev => {
            const newDays = prev.includes(day)
                ? prev.filter(d => d !== day)
                : [...prev, day].sort();
            return newDays.length > 0 ? newDays : prev; // Prevent removing all days
        });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const toggleMonthlyDate = (dayOfMonth: number) => {
        setRecurrenceMonthlyDates(prev => {
            const next = prev.includes(dayOfMonth) ? prev.filter(d => d !== dayOfMonth) : [...prev, dayOfMonth].sort((a, b) => a - b);
            return next.length > 0 ? next : prev; // keep at least one
        });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const toggleMonthlyWeekday = (weekday: number) => {
        setRecurrenceMonthlyWeekdays(prev => {
            const next = prev.includes(weekday) ? prev.filter(d => d !== weekday) : [...prev, weekday].sort((a, b) => a - b);
            return next.length > 0 ? next : prev; // keep at least one
        });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const toggleMonthlyWeekOfMonthChip = (w: 1 | 2 | 3 | 4 | -1) => {
        setRecurrenceMonthlyWeekOfMonth(prev => {
            const next = prev.includes(w) ? prev.filter(x => x !== w) : [...prev, w];
            // keep at least one
            return next.length > 0 ? next : prev;
        });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const getWeekOfMonthForDate = (year: number, month: number, day: number): 1 | 2 | 3 | 4 | -1 => {
        const d = new Date(year, month, day);
        const weekday = d.getDay();

        // occurrence index (1..5) for that weekday in this month
        let count = 0;
        for (let i = 1; i <= day; i++) {
            const di = new Date(year, month, i);
            if (di.getDay() === weekday) count += 1;
        }

        // last occurrence?
        const nextWeek = new Date(year, month, day + 7);
        const isLast = nextWeek.getMonth() !== month;
        if (isLast) return -1;
        // clamp to 4 (we don't expose 5th separately; non-last 5th shouldn't happen)
        return (Math.min(count, 4) as 1 | 2 | 3 | 4);
    };

    const isWithinRecurrenceRange = (dateStr: string) => {
        if (dateStr < recurrenceStartDate) return false;
        if (recurrenceEndEnabled && recurrenceEndDate && dateStr > recurrenceEndDate) return false;
        return true;
    };

    const computeMonthlyWeekdayMatches = (
        year: number,
        month: number,
        weeks: Array<1 | 2 | 3 | 4 | -1>,
        weekdays: number[]
    ) => {
        const daysInMonth = getDaysInMonth(year, month);
        const weekSet = new Set(weeks);
        const weekdaySet = new Set(weekdays);
        const result = new Set<number>();

        for (let day = 1; day <= daysInMonth; day++) {
            const d = new Date(year, month, day);
            const wd = d.getDay();
            if (!weekdaySet.has(wd)) continue;
            const dateStr = formatDate(d);
            if (!isWithinRecurrenceRange(dateStr)) continue;
            const wom = getWeekOfMonthForDate(year, month, day);
            if (weekSet.has(wom)) result.add(day);
        }

        return result;
    };

    const renderWeeklyCalendar = () => {
        const days = getDaysInMonth(weeklyViewDate.getFullYear(), weeklyViewDate.getMonth());
        const firstDay = getFirstDayOfMonth(weeklyViewDate.getFullYear(), weeklyViewDate.getMonth());
        const daysArray: { day: number; current: boolean }[] = [];

        const prevMonthDays = getDaysInMonth(weeklyViewDate.getFullYear(), weeklyViewDate.getMonth() - 1);
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
        const weekdaySet = new Set(recurrenceDays);

        return (
            <View style={styles.monthlyCalendarCard}>
                <View style={styles.calHeader}>
                    <View style={{ width: 24 }} />
                    <Text style={styles.calTitle}>{MONTHS[weeklyViewDate.getMonth()]} {weeklyViewDate.getFullYear()}</Text>
                    <View style={styles.calNav}>
                        <TouchableOpacity onPress={() => {
                            const nextDate = new Date(weeklyViewDate.getFullYear(), weeklyViewDate.getMonth() - 1, 1);
                            setWeeklyViewDate(nextDate);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }} style={styles.calNavBtn}>
                            <MaterialIcons name="chevron-left" size={16} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => {
                            const nextDate = new Date(weeklyViewDate.getFullYear(), weeklyViewDate.getMonth() + 1, 1);
                            setWeeklyViewDate(nextDate);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }} style={styles.calNavBtn}>
                            <MaterialIcons name="chevron-right" size={16} color="#fff" />
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.weekRow}>
                    {weekDays.map((d, i) => <Text key={i} style={styles.weekText}>{d}</Text>)}
                </View>

                <View style={styles.daysGrid}>
                    {daysArray.map((item, i) => {
                        const dateStr = item.current
                            ? formatDate(new Date(weeklyViewDate.getFullYear(), weeklyViewDate.getMonth(), item.day))
                            : '';
                        const inRange = item.current ? isWithinRecurrenceRange(dateStr) : false;
                        const d = item.current ? new Date(weeklyViewDate.getFullYear(), weeklyViewDate.getMonth(), item.day) : null;
                        const matchesWeekday = d && weekdaySet.has(d.getDay());
                        const isSelected = item.current && inRange && matchesWeekday;
                        return (
                            <TouchableOpacity
                                key={i}
                                style={styles.dayCell}
                                disabled={!item.current || !inRange}
                                activeOpacity={0.75}
                            >
                                <View style={[
                                    styles.dayCircle,
                                    (!item.current || !inRange) && { opacity: 0.2 },
                                    isSelected && styles.monthlySelectedCircle,
                                ]}>
                                    <Text style={[
                                        styles.dayText,
                                        isSelected && styles.monthlySelectedText,
                                    ]}>
                                        {item.day}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>
        );
    };

    const renderMonthlyWeekdayCalendar = () => {
        const days = getDaysInMonth(recurrenceViewDate.getFullYear(), recurrenceViewDate.getMonth());
        const firstDay = getFirstDayOfMonth(recurrenceViewDate.getFullYear(), recurrenceViewDate.getMonth());
        const daysArray: { day: number; current: boolean }[] = [];

        const prevMonthDays = getDaysInMonth(recurrenceViewDate.getFullYear(), recurrenceViewDate.getMonth() - 1);
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
        const matchSet = computeMonthlyWeekdayMatches(
            recurrenceViewDate.getFullYear(),
            recurrenceViewDate.getMonth(),
            recurrenceMonthlyWeekOfMonth,
            recurrenceMonthlyWeekdays
        );

        return (
            <View style={styles.monthlyCalendarCard}>
                <View style={styles.calHeader}>
                    <View style={{ width: 24 }} />
                    <Text style={styles.calTitle}>{MONTHS[recurrenceViewDate.getMonth()]} {recurrenceViewDate.getFullYear()}</Text>
                    <View style={styles.calNav}>
                        <TouchableOpacity onPress={() => {
                            const nextDate = new Date(recurrenceViewDate.getFullYear(), recurrenceViewDate.getMonth() - 1, 1);
                            setRecurrenceViewDate(nextDate);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }} style={styles.calNavBtn}>
                            <MaterialIcons name="chevron-left" size={16} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => {
                            const nextDate = new Date(recurrenceViewDate.getFullYear(), recurrenceViewDate.getMonth() + 1, 1);
                            setRecurrenceViewDate(nextDate);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }} style={styles.calNavBtn}>
                            <MaterialIcons name="chevron-right" size={16} color="#fff" />
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.weekRow}>
                    {weekDays.map((d, i) => <Text key={i} style={styles.weekText}>{d}</Text>)}
                </View>

                <View style={styles.daysGrid}>
                    {daysArray.map((item, i) => {
                        const dateStr = item.current
                            ? formatDate(new Date(recurrenceViewDate.getFullYear(), recurrenceViewDate.getMonth(), item.day))
                            : '';
                        const inRange = item.current ? isWithinRecurrenceRange(dateStr) : false;
                        const isSelected = item.current && inRange && (matchSet.has(item.day) || monthlyWeekdayPickedDate === item.day);
                        return (
                            <TouchableOpacity
                                key={i}
                                style={styles.dayCell}
                                disabled={!item.current || !inRange}
                                onPress={() => {
                                    if (!item.current || !inRange) return;
                                    const y = recurrenceViewDate.getFullYear();
                                    const m = recurrenceViewDate.getMonth();
                                    const d = item.day;
                                    const picked = new Date(y, m, d);
                                    const weekday = picked.getDay();
                                    const wom = getWeekOfMonthForDate(y, m, d);

                                    setMonthlyWeekdayPickedDate(d);
                                    // Per request: auto-select weekday based on tapped date
                                    setRecurrenceMonthlyWeekdays([weekday]);
                                    // Add the computed week-of-month to multi-select set
                                    setRecurrenceMonthlyWeekOfMonth(prev => (prev.includes(wom) ? prev : [...prev, wom]));
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                }}
                                activeOpacity={0.75}
                            >
                                <View style={[
                                    styles.dayCircle,
                                    (!item.current || !inRange) && { opacity: 0.2 },
                                    isSelected && styles.monthlySelectedCircle,
                                ]}>
                                    <Text style={[
                                        styles.dayText,
                                        isSelected && styles.monthlySelectedText,
                                    ]}>
                                        {item.day}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>
        );
    };

    const renderMonthlyMultiDateCalendar = () => {
        // Uses recurrenceViewDate only for month layout; stored selection is day-of-month (1–31)
        const days = getDaysInMonth(recurrenceViewDate.getFullYear(), recurrenceViewDate.getMonth());
        const firstDay = getFirstDayOfMonth(recurrenceViewDate.getFullYear(), recurrenceViewDate.getMonth());
        const daysArray: { day: number; current: boolean }[] = [];

        const prevMonthDays = getDaysInMonth(recurrenceViewDate.getFullYear(), recurrenceViewDate.getMonth() - 1);
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
            <View style={styles.monthlyCalendarCard}>
                <View style={styles.calHeader}>
                    <View style={{ width: 24 }} />
                    <Text style={styles.calTitle}>{MONTHS[recurrenceViewDate.getMonth()]} {recurrenceViewDate.getFullYear()}</Text>
                    <View style={styles.calNav}>
                        <TouchableOpacity onPress={() => {
                            const nextDate = new Date(recurrenceViewDate.getFullYear(), recurrenceViewDate.getMonth() - 1, 1);
                            setRecurrenceViewDate(nextDate);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }} style={styles.calNavBtn}>
                            <MaterialIcons name="chevron-left" size={16} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => {
                            const nextDate = new Date(recurrenceViewDate.getFullYear(), recurrenceViewDate.getMonth() + 1, 1);
                            setRecurrenceViewDate(nextDate);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }} style={styles.calNavBtn}>
                            <MaterialIcons name="chevron-right" size={16} color="#fff" />
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.weekRow}>
                    {weekDays.map((d, i) => <Text key={i} style={styles.weekText}>{d}</Text>)}
                </View>

                <View style={styles.daysGrid}>
                    {daysArray.map((item, i) => {
                        const dateStr = item.current
                            ? formatDate(new Date(recurrenceViewDate.getFullYear(), recurrenceViewDate.getMonth(), item.day))
                            : '';
                        const inRange = item.current ? isWithinRecurrenceRange(dateStr) : false;
                        const isSelected = item.current && inRange && recurrenceMonthlyDates.includes(item.day);
                        return (
                            <TouchableOpacity
                                key={i}
                                style={styles.dayCell}
                                disabled={!item.current || !inRange}
                                onPress={() => {
                                    if (item.current && inRange) toggleMonthlyDate(item.day);
                                }}
                                activeOpacity={0.75}
                            >
                                <View style={[
                                    styles.dayCircle,
                                    (!item.current || !inRange) && { opacity: 0.2 },
                                    isSelected && styles.monthlySelectedCircle,
                                ]}>
                                    <Text style={[
                                        styles.dayText,
                                        isSelected && styles.monthlySelectedText,
                                    ]}>
                                        {item.day}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>
        );
    };

    const renderRecurrenceSection = () => {
        if (!isRecurring) return null;

        const weekDayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
        const weekDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const formatRecurrenceDate = (dateStr: string) => {
            const d = new Date(dateStr);
            return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
        };
        const weeklySummary = recurrenceDays
            .slice()
            .sort((a, b) => a - b)
            .map((d) => weekDayNames[d] ?? '')
            .filter(Boolean)
            .join(', ');

        return (
            <View style={styles.recurrenceSection}>
                {/* Recurrence Type Segmented Control */}
                <View style={styles.fieldGroup}>
                    <Text style={styles.label}>REPEAT EVERY</Text>
                    <View style={styles.segmentedControl}>
                        {(['daily', 'weekly', 'monthly'] as RecurrenceType[]).map((type) => (
                            <TouchableOpacity
                                key={type}
                                style={[
                                    styles.segmentedBtn,
                                    recurrenceType === type && styles.segmentedBtnActive
                                ]}
                                onPress={() => {
                                    setRecurrenceType(type);
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                }}
                            >
                                <Text style={[
                                    styles.segmentedText,
                                    recurrenceType === type && styles.segmentedTextActive
                                ]}>
                                    {type === 'daily' ? 'DAILY' : type === 'weekly' ? 'WEEKLY' : 'MONTHLY'}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Repeat On (type-specific) */}
                {recurrenceType === 'weekly' && (
                    <View style={styles.fieldGroup}>
                        <Text style={styles.label}>REPEAT ON</Text>
                        <View style={styles.weekDaysRow}>
                            {weekDayLabels.map((label, index) => {
                                const isSelected = recurrenceDays.includes(index);
                                return (
                                    <TouchableOpacity
                                        key={index}
                                        style={[
                                            styles.weekDayBtn,
                                            isSelected && styles.weekDayBtnActive
                                        ]}
                                        onPress={() => toggleRecurrenceDay(index)}
                                    >
                                        <Text style={[
                                            styles.weekDayText,
                                            isSelected && styles.weekDayTextActive
                                        ]}>{label}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <TouchableOpacity
                            style={styles.weeklySummaryRow}
                            onPress={() => {
                                setShowWeeklyCalendar(!showWeeklyCalendar);
                                if (!showWeeklyCalendar) {
                                    setWeeklyViewDate(new Date(recurrenceStartDate));
                                }
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }}
                            activeOpacity={0.8}
                        >
                            <MaterialIcons name="calendar-today" size={14} color="rgba(255,255,255,0.65)" />
                            <Text style={styles.weeklySummaryText} numberOfLines={2}>
                                {weeklySummary || 'Select at least one day'}
                            </Text>
                        </TouchableOpacity>

                        {showWeeklyCalendar && (
                            <View style={{ marginTop: 8 }}>
                                {renderWeeklyCalendar()}
                            </View>
                        )}
                    </View>
                )}

                {recurrenceType === 'monthly' && (
                    <View style={styles.fieldGroup}>
                        <Text style={styles.label}>REPEAT ON</Text>
                        <View style={styles.monthlyRepeatOnRow}>
                            <TouchableOpacity
                                style={[styles.radioOption, styles.monthlyRepeatOnOption]}
                                onPress={() => {
                                    setRecurrenceMonthlyMode('date');
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                }}
                            >
                                <View style={styles.radioCircle}>
                                    {recurrenceMonthlyMode === 'date' && <View style={styles.radioCircleInner} />}
                                </View>
                                <Text style={styles.radioText} numberOfLines={2}>Same date each month</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.radioOption, styles.monthlyRepeatOnOption]}
                                onPress={() => {
                                    setRecurrenceMonthlyMode('weekday');
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                }}
                            >
                                <View style={styles.radioCircle}>
                                    {recurrenceMonthlyMode === 'weekday' && <View style={styles.radioCircleInner} />}
                                </View>
                                <Text style={styles.radioText} numberOfLines={2}>Same weekday (e.g. 3rd Monday)</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Monthly options body */}
                        {recurrenceMonthlyMode === 'date' ? (
                            <View style={{ marginTop: 8 }}>
                                {renderMonthlyMultiDateCalendar()}
                            </View>
                        ) : (
                            <View style={{ marginTop: 8 }}>
                                <View style={styles.monthlyWeekOfMonthRow}>
                                    {([
                                        { label: '1st', value: 1 as const },
                                        { label: '2nd', value: 2 as const },
                                        { label: '3rd', value: 3 as const },
                                        { label: '4th', value: 4 as const },
                                        { label: 'Last', value: -1 as const },
                                    ]).map(opt => {
                                        const active = recurrenceMonthlyWeekOfMonth.includes(opt.value);
                                        return (
                                            <TouchableOpacity
                                                key={opt.label}
                                                style={[styles.monthlyWeekChip, active && styles.monthlyWeekChipActive]}
                                                onPress={() => {
                                                    toggleMonthlyWeekOfMonthChip(opt.value);
                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                }}
                                                activeOpacity={0.8}
                                            >
                                                <Text style={[styles.monthlyWeekChipText, active && styles.monthlyWeekChipTextActive]}>{opt.label}</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>

                                <View style={[styles.weekDaysRow, { marginTop: 8 }]}>
                                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, idx) => {
                                        const selected = recurrenceMonthlyWeekdays.includes(idx);
                                        return (
                                            <TouchableOpacity
                                                key={idx}
                                                style={[styles.weekDayBtn, selected && styles.weekDayBtnActive]}
                                                onPress={() => toggleMonthlyWeekday(idx)}
                                                activeOpacity={0.75}
                                            >
                                                <Text style={[styles.weekDayText, selected && styles.weekDayTextActive]}>{label}</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>

                                {/* Calendar toggle + picker (auto-select weekday/week-of-month) */}
                                <TouchableOpacity
                                    style={[styles.dateDisplay, styles.compactInput, { marginTop: 8 }]}
                                    onPress={() => {
                                        setShowMonthlyWeekdayCalendar(v => !v);
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    }}
                                    activeOpacity={0.8}
                                >
                                    <Text style={styles.dateDisplayText}>
                                        {showMonthlyWeekdayCalendar ? 'Hide calendar' : 'Open calendar'}
                                    </Text>
                                    <MaterialIcons name="event" size={12.8} color="#fff" />
                                </TouchableOpacity>

                                {showMonthlyWeekdayCalendar && (
                                    <View style={{ marginTop: 8 }}>
                                        {renderMonthlyWeekdayCalendar()}
                                    </View>
                                )}
                            </View>
                        )}
                    </View>
                )}

                {/* End Condition */}
                <View style={styles.fieldGroup}>
                    <Text style={styles.label}>ENDS</Text>
                    <View style={styles.endsInlineRow}>
                        <TouchableOpacity
                            style={styles.radioOption}
                            onPress={() => {
                                setRecurrenceEndEnabled(false);
                                setRecurrenceEndDate(undefined);
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }}
                        >
                            <View style={styles.radioCircle}>
                                {!recurrenceEndEnabled && <View style={styles.radioCircleInner} />}
                            </View>
                            <Text style={styles.radioText}>Never</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.radioOption}
                            onPress={() => {
                                setRecurrenceEndEnabled(true);
                                if (!recurrenceEndDate) {
                                    const endDate = new Date(recurrenceStartDate);
                                    endDate.setMonth(endDate.getMonth() + 1);
                                    setRecurrenceEndDate(formatDate(endDate));
                                }
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }}
                        >
                            <View style={styles.radioCircle}>
                                {recurrenceEndEnabled && <View style={styles.radioCircleInner} />}
                            </View>
                            <Text style={styles.radioText}>On date</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Start/End dates row (aligned in landscape) */}
                <View style={[styles.recurrenceDatesRow, isLandscape && styles.recurrenceDatesRowLandscape]}>
                    <View style={styles.recurrenceDateCol}>
                        <Text style={styles.label}>START DAY</Text>
                        <TouchableOpacity
                            style={[styles.dateDisplay, styles.compactInput]}
                            onPress={() => {
                                setShowRecurrenceStartPicker(true);
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }}
                        >
                            <Text style={styles.dateDisplayText}>
                                {recurrenceStartDate === getLogicalDate(new Date(), dailyStartMinutes)
                                    ? 'Today'
                                    : formatRecurrenceDate(recurrenceStartDate)}
                            </Text>
                            <MaterialIcons name="event" size={12.8} color="#fff" />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.recurrenceDateCol}>
                        <Text style={styles.label}>END DATE</Text>
                        {recurrenceEndEnabled ? (
                            <TouchableOpacity
                                style={[styles.dateDisplay, styles.compactInput]}
                                onPress={() => {
                                    setShowRecurrenceEndPicker(true);
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                }}
                            >
                                <Text style={styles.dateDisplayText}>
                                    {recurrenceEndDate ? formatRecurrenceDate(recurrenceEndDate) : 'Select'}
                                </Text>
                                <MaterialIcons name="event" size={12.8} color="#fff" />
                            </TouchableOpacity>
                        ) : (
                            <View style={[styles.dateDisplay, styles.compactInput, styles.endDateDisabled]}>
                                <Text style={styles.dateDisplayText}>No end</Text>
                            </View>
                        )}
                    </View>
                </View>
            </View>
        );
    };

    // Keep the underlying task "forDate" aligned with recurrence start date when Repeat is enabled.
    useEffect(() => {
        if (isRecurring) {
            setSelectedDate(recurrenceStartDate);
            setViewDate(new Date(recurrenceStartDate));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isRecurring, recurrenceStartDate]);

    // When Repeat is enabled, recurring tasks shouldn't be added to backlog.
    useEffect(() => {
        if (isRecurring && isBacklog) {
            setIsBacklog(false);
        }
    }, [isRecurring, isBacklog]);

    const renderRecurrenceDatePicker = (isStart: boolean) => {
        const currentViewDate = isStart
            ? recurrenceViewDate
            : recurrenceEndViewDate;
        const setViewDateFn = isStart ? setRecurrenceViewDate : setRecurrenceEndViewDate;
        const selectedDateStr = isStart ? recurrenceStartDate : (recurrenceEndDate || '');
        const setSelectedDateFn = isStart ? setRecurrenceStartDate : setRecurrenceEndDate;
        const setShowPicker = isStart ? setShowRecurrenceStartPicker : setShowRecurrenceEndPicker;

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

        const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

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
                <View style={styles.weekRow}>
                    {weekDays.map((d, i) => <Text key={i} style={styles.weekText}>{d}</Text>)}
                </View>
                <View style={styles.daysGrid}>
                    {daysArray.map((item, i) => {
                        const dateStr = item.current ? formatDate(new Date(currentViewDate.getFullYear(), currentViewDate.getMonth(), item.day)) : '';
                        const isSelected = item.current && dateStr === selectedDateStr;
                        const todayStr = getLogicalDate(new Date(), dailyStartMinutes);
                        const isToday = item.current && todayStr === dateStr;
                        const minDate = isStart ? undefined : recurrenceStartDate;
                        const isBeforeMin = minDate && item.current && dateStr < minDate;

                        return (
                            <TouchableOpacity
                                key={i}
                                style={styles.dayCell}
                                disabled={!item.current || !!isBeforeMin}
                                onPress={() => {
                                    if (item.current && !isBeforeMin) {
                                        setSelectedDateFn(dateStr);
                                        setShowPicker(false);
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                    }
                                }}
                            >
                                <View style={[
                                    styles.dayCircle,
                                    (!item.current || isBeforeMin) && { opacity: 0.2 },
                                    isToday && styles.todayCircle,
                                    isSelected && styles.selectedFutureCircle
                                ]}>
                                    <Text style={[
                                        styles.dayText,
                                        isToday && { color: '#000' },
                                        isSelected && { color: '#4CAF50', fontWeight: '800' }
                                    ]}>{item.day}</Text>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>
        );
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            supportedOrientations={['portrait', 'landscape']}
            onRequestClose={handleCancel}
        >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                <View style={styles.overlay}>
                    {Platform.OS !== 'web' && <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />}
                    <View style={styles.dimLayer} />

                    <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                        <View style={[styles.modal, (isLandscape && !showDatePicker) ? styles.modalLandscape : styles.modalPortrait]}>
                            <KeyboardAvoidingView
                                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                                style={styles.keyboardView}
                            >
                                {isLandscape && !showDatePicker && !showRecurrenceStartPicker && !showRecurrenceEndPicker ? (
                                    <View style={styles.landscapeContainer}>
                                        {/* Left Column - Inputs */}
                                        <View style={styles.leftColumn}>
                                            <View style={styles.fieldGroup}>
                                                <Text style={styles.label}>TASK TITLE</Text>
                                                <TextInput
                                                    style={[styles.input, styles.compactInput, errorTitle && styles.inputError]}
                                                    placeholder="What do you need to do?"
                                                    placeholderTextColor="rgba(255,255,255,0.3)"
                                                    value={title}
                                                    onChangeText={(text) => {
                                                        setTitle(text);
                                                        if (text.trim()) setErrorTitle(false);
                                                    }}
                                                />
                                            </View>

                                            <View style={styles.fieldGroup}>
                                                <Text style={styles.label}>DESCRIPTION (OPTIONAL)</Text>
                                                <TextInput
                                                    style={[styles.input, styles.descriptionInput, styles.compactInput]}
                                                    placeholder="Add more details..."
                                                    placeholderTextColor="rgba(255,255,255,0.3)"
                                                    value={description}
                                                    onChangeText={setDescription}
                                                    multiline
                                                    textAlignVertical="top"
                                                />
                                            </View>

                                            {/* Priority + Category moved to LEFT in landscape */}
                                            <View style={styles.fieldGroup}>
                                                <Text style={styles.label}>PRIORITY</Text>
                                                <View style={styles.priorityRow}>
                                                    {priorities.map((p) => (
                                                        <TouchableOpacity
                                                            key={p}
                                                            style={[
                                                                styles.priorityBtn,
                                                                priority === p && {
                                                                    backgroundColor: `${getPriorityColor(p)}20`,
                                                                    borderColor: getPriorityColor(p),
                                                                }
                                                            ]}
                                                            onPress={() => {
                                                                setPriority(p);
                                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                            }}
                                                        >
                                                            <Text style={[
                                                                styles.priorityText,
                                                                priority === p && { color: getPriorityColor(p) }
                                                            ]}>{p.toUpperCase()}</Text>
                                                        </TouchableOpacity>
                                                    ))}
                                                </View>
                                            </View>

                                            {renderCategoryPicker()}
                                        </View>

                                        {/* Right Column - scheduling + fixed actions footer */}
                                        <View style={styles.rightColumn}>
                                            <ScrollView
                                                style={styles.rightColumnScroll}
                                                showsVerticalScrollIndicator={false}
                                                contentContainerStyle={styles.rightColumnScrollContent}
                                                keyboardShouldPersistTaps="handled"
                                            >
                                                {!isRecurring && (
                                                    <View style={styles.fieldGroup}>
                                                        <View style={styles.backlogRow}>
                                                            <Text style={styles.label}>ADD TO BACKLOG</Text>
                                                            <TouchableOpacity
                                                                style={[styles.backlogToggle, isBacklog && styles.backlogToggleActive]}
                                                                onPress={() => {
                                                                    setIsBacklog(!isBacklog);
                                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                                }}
                                                            >
                                                                <View style={[styles.backlogToggleCircle, isBacklog && styles.backlogToggleCircleActive]} />
                                                            </TouchableOpacity>
                                                        </View>
                                                    </View>
                                                )}

                                                {!isBacklog && (
                                                    <>
                                                        <View style={styles.fieldGroup}>
                                                            <View style={styles.backlogRow}>
                                                                <Text style={styles.label}>REPEAT</Text>
                                                                <View style={styles.toggleRow}>
                                                                    <Text style={[styles.toggleLabel, !isRecurring && styles.toggleLabelActive]}>Off</Text>
                                                                    <TouchableOpacity
                                                                        style={[styles.backlogToggle, isRecurring && styles.backlogToggleActive]}
                                                                        onPress={() => {
                                                                            setIsRecurring(!isRecurring);
                                                                            if (!isRecurring) {
                                                                                setRecurrenceStartDate(selectedDate);
                                                                            }
                                                                            if (isRecurring) setRepeatSync(false);
                                                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                                        }}
                                                                    >
                                                                        <View style={[styles.backlogToggleCircle, isRecurring && styles.backlogToggleCircleActive]} />
                                                                    </TouchableOpacity>
                                                                    <Text style={[styles.toggleLabel, isRecurring && styles.toggleLabelActive]}>On</Text>
                                                                </View>
                                                            </View>
                                                        </View>

                                                        {isRecurring && (
                                                            <View style={styles.fieldGroup}>
                                                                <View style={styles.backlogRow}>
                                                                    <Text style={styles.label}>REPEAT SYNC</Text>
                                                                    <View style={styles.toggleRow}>
                                                                        <Text style={[styles.toggleLabel, !repeatSync && styles.toggleLabelActive]}>Off</Text>
                                                                        <TouchableOpacity
                                                                            style={[styles.backlogToggle, repeatSync && styles.backlogToggleActive]}
                                                                            onPress={() => {
                                                                                setRepeatSync(!repeatSync);
                                                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                                            }}
                                                                        >
                                                                            <View style={[styles.backlogToggleCircle, repeatSync && styles.backlogToggleCircleActive]} />
                                                                        </TouchableOpacity>
                                                                        <Text style={[styles.toggleLabel, repeatSync && styles.toggleLabelActive]}>On</Text>
                                                                    </View>
                                                                </View>
                                                            </View>
                                                        )}

                                                        {renderRecurrenceSection()}

                                                        {/* When Repeat is enabled, "Starts on" becomes the effective date. Hide FOR DATE. */}
                                                        {!isRecurring && (
                                                            <View style={styles.fieldGroup}>
                                                                <Text style={styles.label}>FOR DATE</Text>
                                                                <TouchableOpacity
                                                                    style={[
                                                                        styles.dateDisplay,
                                                                        styles.compactInput,
                                                                        (isPastTasksDisabled && selectedDate < getLogicalDate(new Date(), dailyStartMinutes)) && styles.inputError
                                                                    ]}
                                                                    onPress={() => {
                                                                        setShowDatePicker(true);
                                                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                                    }}
                                                                >
                                                                    <Text style={styles.dateDisplayText}>{selectedDate}</Text>
                                                                    <MaterialIcons name="event" size={12.8} color="#fff" />
                                                                </TouchableOpacity>
                                                            </View>
                                                        )}
                                                    </>
                                                )}
                                            </ScrollView>

                                            {/* Fixed footer: always at bottom in landscape */}
                                            <View style={styles.landscapeActionsFooter}>
                                                <TouchableOpacity
                                                    style={[styles.addBtn, styles.addBtnLandscapeSmall, { flex: 1, marginBottom: 0 }]}
                                                    onPress={handleAdd}
                                                    activeOpacity={0.7}
                                                >
                                                    <Text style={[styles.addBtnText, styles.addBtnTextLandscapeSmall]}>
                                                        {taskToEdit ? 'Update Task' : 'Add Task'}
                                                    </Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={handleCancel}
                                                    activeOpacity={0.7}
                                                    style={styles.landscapeCancel}
                                                >
                                                    <Text style={[styles.cancelText, styles.cancelTextLandscapeSmall]}>Cancel</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    </View>
                                ) : (
                                    <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                                        {showDatePicker ? (
                                            renderDatePicker()
                                        ) : showRecurrenceStartPicker ? (
                                            renderRecurrenceDatePicker(true)
                                        ) : showRecurrenceEndPicker ? (
                                            renderRecurrenceDatePicker(false)
                                        ) : (
                                            <>
                                                <Text style={styles.label}>TASK TITLE</Text>
                                                <TextInput
                                                    style={[styles.input, errorTitle && styles.inputError]}
                                                    placeholder="What do you need to do?"
                                                    placeholderTextColor="rgba(255,255,255,0.3)"
                                                    value={title}
                                                    onChangeText={(text) => {
                                                        setTitle(text);
                                                        if (text.trim()) setErrorTitle(false);
                                                    }}
                                                />

                                                <Text style={styles.label}>DESCRIPTION (OPTIONAL)</Text>
                                                <TextInput
                                                    style={[styles.input, styles.descriptionInput]}
                                                    placeholder="Add more details..."
                                                    placeholderTextColor="rgba(255,255,255,0.3)"
                                                    value={description}
                                                    onChangeText={setDescription}
                                                    multiline
                                                    numberOfLines={3}
                                                    textAlignVertical="top"
                                                />

                                                {!isRecurring && (
                                                    <View style={[styles.backlogRow, { marginBottom: 19.2 }]}>
                                                        <Text style={styles.label}>ADD TO BACKLOG</Text>
                                                        <TouchableOpacity
                                                            style={[styles.backlogToggle, isBacklog && styles.backlogToggleActive]}
                                                            onPress={() => {
                                                                setIsBacklog(!isBacklog);
                                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                            }}
                                                        >
                                                            <View style={[styles.backlogToggleCircle, isBacklog && styles.backlogToggleCircleActive]} />
                                                        </TouchableOpacity>
                                                    </View>
                                                )}

                                                {!isBacklog && (
                                                    <>
                                                        <View style={[styles.backlogRow, { marginBottom: 19.2 }]}>
                                                            <Text style={styles.label}>REPEAT</Text>
                                                            <View style={styles.toggleRow}>
                                                                <Text style={[styles.toggleLabel, !isRecurring && styles.toggleLabelActive]}>Off</Text>
                                                                <TouchableOpacity
                                                                    style={[styles.backlogToggle, isRecurring && styles.backlogToggleActive]}
                                                                    onPress={() => {
                                                                        setIsRecurring(!isRecurring);
                                                                        if (!isRecurring) {
                                                                            setRecurrenceStartDate(selectedDate);
                                                                        }
                                                                        if (isRecurring) setRepeatSync(false);
                                                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                                    }}
                                                                >
                                                                    <View style={[styles.backlogToggleCircle, isRecurring && styles.backlogToggleCircleActive]} />
                                                                </TouchableOpacity>
                                                                <Text style={[styles.toggleLabel, isRecurring && styles.toggleLabelActive]}>On</Text>
                                                            </View>
                                                        </View>

                                                        {isRecurring && (
                                                            <View style={[styles.backlogRow, { marginBottom: 19.2 }]}>
                                                                <Text style={styles.label}>REPEAT SYNC</Text>
                                                                <View style={styles.toggleRow}>
                                                                    <Text style={[styles.toggleLabel, !repeatSync && styles.toggleLabelActive]}>Off</Text>
                                                                    <TouchableOpacity
                                                                        style={[styles.backlogToggle, repeatSync && styles.backlogToggleActive]}
                                                                        onPress={() => {
                                                                            setRepeatSync(!repeatSync);
                                                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                                        }}
                                                                    >
                                                                        <View style={[styles.backlogToggleCircle, repeatSync && styles.backlogToggleCircleActive]} />
                                                                    </TouchableOpacity>
                                                                    <Text style={[styles.toggleLabel, repeatSync && styles.toggleLabelActive]}>On</Text>
                                                                </View>
                                                            </View>
                                                        )}

                                                        {renderRecurrenceSection()}

                                                        {/* When Repeat is enabled, "Starts on" becomes the effective date. Hide FOR DATE. */}
                                                        {!isRecurring && (
                                                            <>
                                                                <Text style={styles.label}>FOR DATE</Text>
                                                                <TouchableOpacity
                                                                    style={[
                                                                        styles.dateDisplay,
                                                                        { marginBottom: 19.2 },
                                                                        (isPastTasksDisabled && selectedDate < getLogicalDate(new Date(), dailyStartMinutes)) && styles.inputError
                                                                    ]}
                                                                    onPress={() => {
                                                                        setShowDatePicker(true);
                                                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                                    }}
                                                                >
                                                                    <Text style={styles.dateDisplayText}>{selectedDate}</Text>
                                                                    <MaterialIcons name="event" size={12.8} color="#fff" />
                                                                </TouchableOpacity>
                                                            </>
                                                        )}
                                                    </>
                                                )}

                                                <Text style={styles.label}>PRIORITY</Text>
                                                <View style={[styles.priorityRow, { marginBottom: 19.2 }]}>
                                                    {priorities.map((p) => (
                                                        <TouchableOpacity
                                                            key={p}
                                                            style={[
                                                                styles.priorityBtn,
                                                                priority === p && {
                                                                    backgroundColor: `${getPriorityColor(p)}20`,
                                                                    borderColor: getPriorityColor(p),
                                                                }
                                                            ]}
                                                            onPress={() => {
                                                                setPriority(p);
                                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                            }}
                                                        >
                                                            <Text style={[
                                                                styles.priorityText,
                                                                priority === p && { color: getPriorityColor(p) }
                                                            ]}>{p.toUpperCase()}</Text>
                                                        </TouchableOpacity>
                                                    ))}
                                                </View>

                                                {renderCategoryPicker()}

                                                <TouchableOpacity
                                                    style={styles.addBtn}
                                                    onPress={handleAdd}
                                                    activeOpacity={0.7}
                                                >
                                                    <Text style={styles.addBtnText}>{taskToEdit ? 'Update Task' : 'Add Task'}</Text>
                                                </TouchableOpacity>

                                                <TouchableOpacity
                                                    onPress={handleCancel}
                                                    activeOpacity={0.7}
                                                >
                                                    <Text style={styles.cancelText}>Cancel</Text>
                                                </TouchableOpacity>
                                            </>
                                        )}
                                    </ScrollView>
                                )}
                            </KeyboardAvoidingView>
                        </View>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
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
    keyboardView: {
        width: '100%',
    },
    modal: {
        width: SCREEN_WIDTH * 0.88,
        maxWidth: 400,
        backgroundColor: '#000000',
        borderRadius: 22.4, // 28 * 0.8
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        paddingTop: 25.6, // 32 * 0.8
        paddingBottom: 22.4, // 28 * 0.8
        paddingHorizontal: 19.2, // 24 * 0.8
        ... (Platform.OS !== 'web' && { maxHeight: '90%' }),
    },
    modalPortrait: {
        paddingTop: 16, // 20 * 0.8
        paddingBottom: 16, // 20 * 0.8
        paddingHorizontal: 16, // 20 * 0.8
    },
    modalLandscape: {
        width: '90%',
        maxWidth: 650,
        paddingTop: 25.6, // 32 * 0.8
        paddingBottom: 22.4, // 28 * 0.8
        justifyContent: 'center',
    },
    landscapeContainer: {
        flexDirection: 'row',
        gap: 32, // 40 * 0.8
    },
    leftColumn: {
        flex: 1.2,
        justifyContent: 'flex-start',
    },
    rightColumn: {
        flex: 1,
        maxHeight: '100%',
    },
    rightColumnScroll: {
        flex: 1,
        minHeight: 0,
    },
    rightColumnScrollContent: {
        paddingRight: 4,
        paddingBottom: 64, // keep content clear of footer
    },
    fieldGroup: {
        marginBottom: 11.2, // 14 * 0.8
    },
    label: {
        fontSize: 8.8, // 11 * 0.8
        fontWeight: '600',
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 1.2, // 1.5 * 0.8
        marginBottom: 8, // 10 * 0.8
    },
    input: {
        backgroundColor: 'rgba(20,20,20,0.5)',
        borderRadius: 12.8, // 16 * 0.8
        paddingHorizontal: 14.4, // 18 * 0.8
        paddingVertical: 12.8, // 16 * 0.8
        color: '#fff',
        fontSize: 12.8, // 16 * 0.8
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        marginBottom: 19.2, // 24 * 0.8
    },
    compactInput: {
        paddingVertical: 9.6, // 12 * 0.8
        marginBottom: 0,
    },
    inputError: {
        borderColor: '#FF5050',
        backgroundColor: 'rgba(255, 80, 80, 0.05)',
    },
    descriptionInput: {
        height: 45, // Reduced from 60 to make it smaller
        textAlignVertical: 'top',
    },
    priorityRow: {
        flexDirection: 'row',
        gap: 8, // 10 * 0.8
    },
    priorityBtn: {
        flex: 1,
        paddingVertical: 6.4, // 8 * 0.8
        borderRadius: 6.4, // 8 * 0.8
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(255,255,255,0.03)',
        alignItems: 'center',
    },
    priorityText: {
        fontSize: 8, // 10 * 0.8
        fontWeight: '700',
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: 0.4, // 0.5 * 0.8
    },
    inputSection: {
        marginBottom: 16, // 20 * 0.8
    },
    categoryScroll: {
        gap: 8, // 10 * 0.8
    },
    categoryChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4.8, // 6 * 0.8
        paddingHorizontal: 8, // 10 * 0.8
        paddingVertical: 4.8, // 6 * 0.8
        borderRadius: 8, // 10 * 0.8
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        backgroundColor: 'rgba(255,255,255,0.03)',
    },
    categoryChipText: {
        fontSize: 8.8, // 11 * 0.8
        fontWeight: '600',
        color: 'rgba(255,255,255,0.4)',
    },
    landscapeActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12.8, // 16 * 0.8
        marginTop: 6.4, // 8 * 0.8
    },
    landscapeActionsFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12.8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.08)',
        marginTop: 8,
    },
    addBtnLandscapeSmall: {
        paddingVertical: 10, // smaller than 12.8
        borderRadius: 10,
    },
    addBtnTextLandscapeSmall: {
        fontSize: 12, // smaller than 13.6
    },
    landscapeCancel: {
        paddingHorizontal: 9.6, // 12 * 0.8
    },
    cancelTextLandscapeSmall: {
        fontSize: 10.5, // smaller than 12
    },
    addBtn: {
        borderRadius: 12.8, // 16 * 0.8
        backgroundColor: '#FFFFFF',
        paddingVertical: 12.8, // 16 * 0.8
        alignItems: 'center',
        marginBottom: 12.8, // 16 * 0.8
    },
    addBtnText: {
        fontSize: 13.6, // 17 * 0.8
        fontWeight: '700',
        color: '#000000',
    },
    cancelText: {
        fontSize: 12, // 15 * 0.8
        fontWeight: '500',
        color: 'rgba(255,255,255,0.45)',
        textAlign: 'center',
    },
    dateDisplay: {
        backgroundColor: 'rgba(0,0,0,0.2)',
        borderRadius: 9.6, // 12 * 0.8
        paddingHorizontal: 12.8, // 16 * 0.8
        paddingVertical: 9.6, // 12 * 0.8
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    dateDisplayText: {
        color: '#fff',
        fontSize: 11.2, // 14 * 0.8
        fontWeight: '600',
    },
    backlogRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    backlogToggle: {
        width: 25.6, // 32 * 0.8
        height: 14.4, // 18 * 0.8
        borderRadius: 7.2, // 9 * 0.8
        backgroundColor: 'rgba(255,255,255,0.1)',
        padding: 1.6, // 2 * 0.8
    },
    backlogToggleActive: {
        backgroundColor: '#4CAF50',
    },
    backlogToggleCircle: {
        width: 11.2, // 14 * 0.8
        height: 11.2, // 14 * 0.8
        borderRadius: 5.6, // 7 * 0.8
        backgroundColor: 'rgba(255,255,255,0.4)',
    },
    backlogToggleCircleActive: {
        backgroundColor: '#fff',
        transform: [{ translateX: 11.2 }], // 14 * 0.8
    },
    calendarMini: {
        paddingBottom: 4, // 5 * 0.8
    },
    calHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6.4, // 8 * 0.8
    },
    calBack: {
        padding: 3.2, // 4 * 0.8
    },
    calTitle: {
        color: '#fff',
        fontSize: 12.8, // 16 * 0.8
        fontWeight: '700',
    },
    calNav: {
        flexDirection: 'row',
        gap: 9.6, // 12 * 0.8
    },
    calNavBtn: {
        padding: 3.2, // 4 * 0.8
    },
    weekRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 3.2, // 4 * 0.8
    },
    weekText: {
        width: '14.2%',
        textAlign: 'center',
        color: 'rgba(255,255,255,0.4)',
        fontSize: 8, // 10 * 0.8
        fontWeight: '600',
    },
    daysGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dayCell: {
        width: '14.28%',
        height: 24, // 30 * 0.8
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 1.6, // 2 * 0.8
    },
    dayCircle: {
        width: 16, // 20 * 0.8
        height: 16, // 20 * 0.8
        borderRadius: 8, // 10 * 0.8
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayText: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 8, // 10 * 0.8
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
    // Recurrence styles
    recurrenceSection: {
        marginBottom: 16, // 20 * 0.8
        paddingTop: 9.6, // 12 * 0.8
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.06)',
    },
    endsInlineRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'nowrap',
        marginTop: 3.2,
    },
    recurrenceDatesRow: {
        marginTop: 6.4,
        gap: 8,
    },
    recurrenceDatesRowLandscape: {
        flexDirection: 'row',
        gap: 12,
    },
    recurrenceDateCol: {
        flex: 1,
    },
    endDateDisabled: {
        opacity: 0.5,
    },
    toggleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6.4, // 8 * 0.8
    },
    toggleLabel: {
        fontSize: 8.8, // 11 * 0.8
        fontWeight: '600',
        color: 'rgba(255,255,255,0.3)',
    },
    toggleLabelActive: {
        color: '#fff',
        fontWeight: '700',
    },
    segmentedControl: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 8, // 10 * 0.8
        padding: 2.4, // 3 * 0.8
        gap: 2.4, // 3 * 0.8
    },
    segmentedBtn: {
        flex: 1,
        paddingVertical: 6.4, // 8 * 0.8
        borderRadius: 6.4, // 8 * 0.8
        alignItems: 'center',
        backgroundColor: 'transparent',
    },
    segmentedBtnActive: {
        backgroundColor: '#fff',
    },
    segmentedText: {
        fontSize: 7.2, // 9 * 0.8
        fontWeight: '700',
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 0.4, // 0.5 * 0.8
    },
    segmentedTextActive: {
        color: '#000',
        fontWeight: '800',
    },
    weekDaysRow: {
        flexDirection: 'row',
        gap: 4.8, // 6 * 0.8
        marginTop: 3.2, // 4 * 0.8
    },
    weekDayBtn: {
        flex: 1,
        paddingVertical: 8, // 10 * 0.8
        borderRadius: 6.4, // 8 * 0.8
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(255,255,255,0.03)',
        alignItems: 'center',
    },
    weekDayBtnActive: {
        backgroundColor: '#fff',
        borderColor: '#fff',
    },
    weekDayText: {
        fontSize: 8.8, // 11 * 0.8
        fontWeight: '700',
        color: 'rgba(255,255,255,0.5)',
    },
    weekDayTextActive: {
        color: '#000',
        fontWeight: '800',
    },
    weeklySummaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 6,
        paddingHorizontal: 6,
        paddingVertical: 6,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    weeklySummaryText: {
        flex: 1,
        fontSize: 10,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.55)',
        lineHeight: 14,
    },
    radioGroup: {
        gap: 9.6, // 12 * 0.8
        marginTop: 3.2, // 4 * 0.8
    },
    radioOption: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8, // 10 * 0.8
    },
    radioCircle: {
        width: 16, // 20 * 0.8
        height: 16, // 20 * 0.8
        borderRadius: 8, // 10 * 0.8
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.3)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    radioCircleInner: {
        width: 8, // 10 * 0.8
        height: 8, // 10 * 0.8
        borderRadius: 4, // 5 * 0.8
        backgroundColor: '#fff',
    },
    radioText: {
        fontSize: 10.4, // 13 * 0.8
        fontWeight: '500',
        color: 'rgba(255,255,255,0.7)',
    },
    monthlyRepeatOnRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
        marginTop: 3.2,
    },
    monthlyRepeatOnOption: {
        flex: 1,
    },
    monthlyCalendarCard: {
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        padding: 10,
    },
    monthlySelectedCircle: {
        backgroundColor: '#FFFFFF',
    },
    monthlySelectedText: {
        color: '#000',
        fontWeight: '800',
    },
    monthlyWeekOfMonthRow: {
        flexDirection: 'row',
        gap: 6,
        flexWrap: 'wrap',
    },
    monthlyWeekChip: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(255,255,255,0.03)',
    },
    monthlyWeekChipActive: {
        backgroundColor: '#fff',
        borderColor: '#fff',
    },
    monthlyWeekChipText: {
        fontSize: 8.8,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.55)',
    },
    monthlyWeekChipTextActive: {
        color: '#000',
        fontWeight: '800',
    },
    recurrenceSummaryText: {
        fontSize: 9.6, // 12 * 0.8
        fontWeight: '500',
        color: 'rgba(237, 253, 6, 0.72)',
        marginTop: 6.4, // 8 * 0.8
        fontStyle: 'italic',
        lineHeight: 13.6, // 17 * 0.8
        height: 27.2, // Fixed height for 2 lines (13.6 * 2) to prevent popup resizing
        overflow: 'hidden',
    },
});
