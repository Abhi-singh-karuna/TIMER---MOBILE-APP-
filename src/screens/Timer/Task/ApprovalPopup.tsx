import React, { useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Modal,
    Platform,
    Animated,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Task, Category, TaskStage } from '../../../constants/data';
import { toDisplayMinutes, DEFAULT_DAILY_START_MINUTES } from '../../../utils/dailyStartTime';

interface ApprovalPopupProps {
    visible: boolean;
    onClose: () => void;
    tasks: Task[];
    categories: Category[];
    /** Daily start (e.g. 360=6am). Used for 6-to-6 display so 23:55→00:25 and now 01:30 compare correctly. */
    dailyStartMinutes?: number;
    /** Current time as minutes-from-midnight; if not provided, uses new Date(). Aligns with Now button. */
    currentMinutes?: number;
    onUpdateStageStatus: (taskId: number, stageId: number, status: 'Done' | 'Upcoming' | 'Undone' | 'Process') => void;
    onDeleteStage: (taskId: number, stageId: number) => void;
    onApproveAll: () => void;
}

export default function ApprovalPopup({
    visible,
    onClose,
    tasks,
    categories,
    dailyStartMinutes = DEFAULT_DAILY_START_MINUTES,
    currentMinutes: currentMinutesProp,
    onUpdateStageStatus,
    onDeleteStage,
    onApproveAll,
}: ApprovalPopupProps) {
    const slideAnim = useRef(new Animated.Value(400)).current; // Start from right (off-screen)
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.8)).current;

    useEffect(() => {
        if (visible) {
            // Animate in: slide from right, fade in, and scale up
            Animated.parallel([
                Animated.spring(slideAnim, {
                    toValue: 0,
                    useNativeDriver: true,
                    tension: 50,
                    friction: 8,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 250,
                    useNativeDriver: true,
                }),
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    useNativeDriver: true,
                    tension: 50,
                    friction: 8,
                }),
            ]).start();
        } else {
            // Reset animations when closing
            slideAnim.setValue(400);
            fadeAnim.setValue(0);
            scaleAnim.setValue(0.8);
        }
    }, [visible]);

    const currentMinutes = currentMinutesProp != null
        ? currentMinutesProp
        : (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); })();

    const nowD = toDisplayMinutes(currentMinutes, dailyStartMinutes);

    // 6-to-6 as one: toDisplayMinutes so 23:55→00:25 and now 01:30 compare correctly. Sorted by due in display space.
    const approvalStages: { task: Task; stage: TaskStage; category?: Category; type: 'START' | 'FINISH'; dueD: number }[] = [];

    tasks.forEach(task => {
        const category = categories.find(c => c.id === task.categoryId);
        task.stages?.forEach(stage => {
            const startTime = stage.startTimeMinutes ?? 0;
            const duration = stage.durationMinutes ?? 0;
            const endTime = startTime + duration;

            const startD = toDisplayMinutes(startTime, dailyStartMinutes);
            const endD = toDisplayMinutes(endTime >= 1440 ? endTime - 1440 : endTime, dailyStartMinutes);

            if (stage.status === 'Process' && endD <= nowD) {
                approvalStages.push({ task, stage, category, type: 'FINISH', dueD: endD });
            }
            if (stage.status === 'Upcoming' && startD <= nowD) {
                approvalStages.push({ task, stage, category, type: 'START', dueD: startD });
            }
        });
    });

    approvalStages.sort((a, b) => a.dueD - b.dueD);

    const formatTime = (minutes: number) => {
        const h = Math.floor(minutes / 60) % 24;
        const m = Math.floor(minutes % 60);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    const formatDuration = (minutes: number) => {
        const h = Math.floor(minutes / 60);
        const m = Math.floor(minutes % 60);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            onRequestClose={onClose}
            supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
        >
            <TouchableOpacity
                style={styles.overlay}
                activeOpacity={1}
                onPress={onClose}
            >
                <Animated.View
                    style={[
                        styles.popupContainer,
                        {
                            transform: [
                                { translateX: slideAnim },
                                { scale: scaleAnim },
                            ],
                            opacity: fadeAnim,
                        },
                    ]}
                    onStartShouldSetResponder={() => true}
                >
                    <View
                        style={styles.content}
                        onStartShouldSetResponder={() => true}
                    >
                        {/* List: max 6 visible; scroll when more. Min 1: empty state when 0. */}
                        <ScrollView
                            style={styles.list}
                            contentContainerStyle={styles.listContent}
                            showsVerticalScrollIndicator={approvalStages.length > 6}
                            nestedScrollEnabled
                        >
                            {approvalStages.length === 0 ? (
                                <View style={styles.emptyRow}>
                                    <Text style={styles.emptyRowText}>No pending approvals</Text>
                                </View>
                            ) : (
                            approvalStages.map(({ task, stage, category, type }) => (
                                <View key={`${stage.id}-${type}`} style={styles.itemCard}>
                                    <View style={[styles.categoryBar, { backgroundColor: category?.color || '#333' }]} />
                                    <View style={styles.itemMain}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <Text style={styles.itemTitle}>{stage.text.toUpperCase()}</Text>
                                            <View style={[
                                                styles.typeBadge,
                                                { backgroundColor: type === 'START' ? '#FFB74D30' : '#4CAF5030' }
                                            ]}>
                                                <Text style={[
                                                    styles.typeBadgeText,
                                                    { color: type === 'START' ? '#FFB74D' : '#4CAF50' }
                                                ]}>
                                                    {type === 'START' ? 'TO START' : 'TO FINISH'}
                                                </Text>
                                            </View>
                                        </View>
                                        <View style={styles.itemDetails}>
                                            <View style={styles.detailRow}>
                                                <MaterialIcons name="play-arrow" size={7} color="#8E8E93" style={styles.detailIcon} />
                                                <Text style={styles.detailText}>{formatTime(stage.startTimeMinutes ?? 0)}</Text>
                                            </View>
                                            <View style={styles.detailRow}>
                                                <MaterialIcons name="stop" size={7} color="#8E8E93" style={styles.detailIcon} />
                                                <Text style={styles.detailText}>{formatTime((stage.startTimeMinutes ?? 0) + (stage.durationMinutes ?? 0))}</Text>
                                            </View>
                                            <View style={styles.detailRow}>
                                                <MaterialIcons name="access-time" size={7} color="#4CAF50" style={styles.detailIcon} />
                                                <Text style={styles.durationText}>{formatDuration(stage.durationMinutes ?? 0)}</Text>
                                            </View>
                                        </View>
                                    </View>

                                    {/* Action Buttons */}
                                    <View style={styles.actions}>
                                        <TouchableOpacity
                                            style={styles.actionBtn}
                                            onPress={() => onUpdateStageStatus(task.id, stage.id, type === 'START' ? 'Undone' : 'Upcoming')}
                                        >
                                            <MaterialIcons name={type === 'START' ? "close" : "undo"} size={10} color="#FF5252" />
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[styles.actionBtn, styles.doneBtn]}
                                            onPress={() => onUpdateStageStatus(task.id, stage.id, type === 'START' ? 'Process' : 'Done')}
                                        >
                                            <MaterialIcons name={type === 'START' ? "play-arrow" : "check"} size={12} color="#FFF" />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ))
                            )}
                        </ScrollView>
                    </View>
                </Animated.View>
            </TouchableOpacity>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    popupContainer: {
        position: 'absolute',
        top: 5,
        right: 10,
        width: 280,
        maxHeight: '100%',
        backgroundColor: '#111111',
        borderRadius: 20,
        borderTopLeftRadius: 16,
        borderBottomLeftRadius: 16,
        padding: 8,
        paddingTop: Platform.OS === 'ios' ? 15 : 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 15,
        borderWidth: 0.5,
        borderRightWidth: 0,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    content: {
        flex: 0,
    },
    list: {
        maxHeight: 330, /* ~6 items × 55px; when more than 6, list scrolls */
    },
    listContent: {
        paddingVertical: 0,
    },
    emptyRow: {
        paddingVertical: 16,
        paddingHorizontal: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyRowText: {
        fontSize: 12,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.45)',
    },
    itemCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 10,
        marginBottom: 3,
        padding: 6,
        borderWidth: 0.5,
        borderColor: 'rgba(255,255,255,0.04)',
    },
    categoryBar: {
        width: 2.5,
        height: 10,
        borderRadius: 1.25,
        marginRight: 5,
    },
    itemMain: {
        flex: 1,
    },
    itemTitle: {
        color: '#FFFFFF',
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 0.2,
    },
    typeBadge: {
        paddingHorizontal: 4,
        paddingVertical: 1,
        borderRadius: 4,
        marginLeft: 6,
    },
    typeBadgeText: {
        fontSize: 7,
        fontWeight: '900',
        letterSpacing: 0.4,
    },
    itemDetails: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 2,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    detailIcon: {
        marginRight: 2,
        opacity: 0.6,
    },
    detailText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 7,
        fontWeight: '700',
    },
    durationText: {
        color: '#4CAF50',
        fontSize: 7,
        fontWeight: '800',
    },
    actions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        marginLeft: 3,
    },
    actionBtn: {
        width: 18,
        height: 18,
        borderRadius: 5,
        backgroundColor: 'rgba(255,255,255,0.06)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 0.5,
        borderColor: 'rgba(255,255,255,0.04)',
    },
    doneBtn: {
        backgroundColor: '#00E5FF',
        borderColor: '#00E5FF',
        shadowColor: '#00E5FF',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 4, // Compressed from 8
    },
});
