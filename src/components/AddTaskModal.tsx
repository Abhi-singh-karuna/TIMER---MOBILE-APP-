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
} from 'react-native';
import { BlurView } from 'expo-blur';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Category, Task } from '../constants/data';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface AddTaskModalProps {
    visible: boolean;
    onCancel: () => void;
    onAdd: (task: { title: string; description?: string; priority: Task['priority']; categoryId?: string; forDate: string; isBacklog?: boolean }) => void;
    onUpdate?: (taskId: number, task: { title: string; description?: string; priority: Task['priority']; categoryId?: string; forDate: string; isBacklog?: boolean }) => void;
    categories: Category[];
    initialDate?: string;
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
    isPastTasksDisabled = false,
    taskToEdit = null,
}: AddTaskModalProps) {
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const isLandscape = screenWidth > screenHeight;

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState<Task['priority']>('Medium');
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(categories[0]?.id);
    const [selectedDate, setSelectedDate] = useState(initialDate || new Date().toISOString().split('T')[0]);
    const [isBacklog, setIsBacklog] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [viewDate, setViewDate] = useState(new Date(selectedDate));
    const [errorTitle, setErrorTitle] = useState(false);

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
            } else {
                setTitle('');
                setDescription('');
                setPriority('Medium');
                setSelectedCategoryId(categories[0]?.id);
                const date = initialDate || new Date().toISOString().split('T')[0];
                setSelectedDate(date);
                setViewDate(new Date(date));
                setIsBacklog(false);
            }
            setShowDatePicker(false);
            setErrorTitle(false);
        }
    }, [visible, initialDate, taskToEdit]);

    const handleAdd = () => {
        if (!title.trim()) {
            setErrorTitle(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            return;
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (taskToEdit && onUpdate) {
            onUpdate(taskToEdit.id, {
                title: title.trim(),
                description: description.trim() || undefined,
                priority,
                categoryId: selectedCategoryId,
                forDate: selectedDate,
                isBacklog,
            });
        } else {
            onAdd({
                title: title.trim(),
                description: description.trim() || undefined,
                priority,
                categoryId: selectedCategoryId,
                forDate: selectedDate,
                isBacklog,
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
                {categories.map((cat) => (
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
                            size={12}
                            color={selectedCategoryId === cat.id ? cat.color : 'rgba(255,255,255,0.4)'}
                        />
                        <Text style={[
                            styles.categoryChipText,
                            selectedCategoryId === cat.id && { color: cat.color }
                        ]}>{cat.name}</Text>
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
            <View style={styles.overlay}>
                {Platform.OS !== 'web' && <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />}
                <View style={styles.dimLayer} />

                <View style={[styles.modal, (isLandscape && !showDatePicker) ? styles.modalLandscape : styles.modalPortrait]}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={styles.keyboardView}
                    >
                        {isLandscape && !showDatePicker ? (
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

                                    <View style={[styles.fieldGroup, { flex: 1 }]}>
                                        <Text style={styles.label}>DESCRIPTION (OPTIONAL)</Text>
                                        <TextInput
                                            style={[styles.input, styles.descriptionInput, styles.compactInput, { flex: 1 }]}
                                            placeholder="Add more details..."
                                            placeholderTextColor="rgba(255,255,255,0.3)"
                                            value={description}
                                            onChangeText={setDescription}
                                            multiline
                                            textAlignVertical="top"
                                        />
                                    </View>
                                </View>

                                {/* Right Column - Priority & Category & Date & Actions */}
                                <View style={styles.rightColumn}>
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

                                    {!isBacklog && (
                                        <View style={styles.fieldGroup}>
                                            <Text style={styles.label}>FOR DATE</Text>
                                            <TouchableOpacity
                                                style={[
                                                    styles.dateDisplay,
                                                    styles.compactInput,
                                                    (isPastTasksDisabled && selectedDate < new Date().toISOString().split('T')[0]) && styles.inputError
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
                                    )}

                                    <View style={styles.landscapeActions}>
                                        <TouchableOpacity
                                            style={[styles.addBtn, { flex: 1, marginBottom: 0 }]}
                                            onPress={handleAdd}
                                            activeOpacity={0.7}
                                        >
                                            <Text style={styles.addBtnText}>{taskToEdit ? 'Update Task' : 'Add Task'}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={handleCancel}
                                            activeOpacity={0.7}
                                            style={styles.landscapeCancel}
                                        >
                                            <Text style={styles.cancelText}>Cancel</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        ) : (
                            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                                {showDatePicker ? (
                                    renderDatePicker()
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
                                            numberOfLines={4}
                                            textAlignVertical="top"
                                        />

                                        <View style={[styles.backlogRow, { marginBottom: 24 }]}>
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

                                        {!isBacklog && (
                                            <>
                                                <Text style={styles.label}>FOR DATE</Text>
                                                <TouchableOpacity
                                                    style={[
                                                        styles.dateDisplay,
                                                        { marginBottom: 24 },
                                                        (isPastTasksDisabled && selectedDate < new Date().toISOString().split('T')[0]) && styles.inputError
                                                    ]}
                                                    onPress={() => {
                                                        setShowDatePicker(true);
                                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                    }}
                                                >
                                                    <Text style={styles.dateDisplayText}>{selectedDate}</Text>
                                                    <MaterialIcons name="event" size={16} color="#fff" />
                                                </TouchableOpacity>
                                            </>
                                        )}

                                        <Text style={styles.label}>PRIORITY</Text>
                                        <View style={[styles.priorityRow, { marginBottom: 24 }]}>
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
        backgroundColor: 'rgba(0,0,0,0.7)',
    },
    keyboardView: {
        width: '100%',
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
    leftColumn: {
        flex: 1.2,
        justifyContent: 'flex-start',
    },
    rightColumn: {
        flex: 1,
        justifyContent: 'center',
    },
    fieldGroup: {
        marginBottom: 14,
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
    compactInput: {
        paddingVertical: 12,
        marginBottom: 0,
    },
    inputError: {
        borderColor: '#FF5050',
        backgroundColor: 'rgba(255, 80, 80, 0.05)',
    },
    descriptionInput: {
        height: 100,
        textAlignVertical: 'top',
    },
    priorityRow: {
        flexDirection: 'row',
        gap: 10,
    },
    priorityBtn: {
        flex: 1,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(255,255,255,0.03)',
        alignItems: 'center',
    },
    priorityText: {
        fontSize: 10,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: 0.5,
    },
    inputSection: {
        marginBottom: 20,
    },
    categoryScroll: {
        gap: 10,
    },
    categoryChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        backgroundColor: 'rgba(255,255,255,0.03)',
    },
    categoryChipText: {
        fontSize: 11,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.4)',
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
    backlogRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    backlogToggle: {
        width: 32,
        height: 18,
        borderRadius: 9,
        backgroundColor: 'rgba(255,255,255,0.1)',
        padding: 2,
    },
    backlogToggleActive: {
        backgroundColor: '#4CAF50',
    },
    backlogToggleCircle: {
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: 'rgba(255,255,255,0.4)',
    },
    backlogToggleCircleActive: {
        backgroundColor: '#fff',
        transform: [{ translateX: 14 }],
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
});
