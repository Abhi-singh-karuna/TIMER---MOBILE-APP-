import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Modal,
    Animated,
    PanResponder,
    useWindowDimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Task, Category, TaskStage, StageStatus } from '../../../constants/data';
import { toDisplayMinutes, DEFAULT_DAILY_START_MINUTES } from '../../../utils/dailyStartTime';

/**
 * Live Focus notifications: stages that need the user's attention.
 *   START  - an Upcoming stage whose start time has passed
 *   FINISH - an In Process stage whose end time has passed
 * Everything notification related lives here: the logic, the floating bell button and the popup.
 */

export type ApprovalType = 'START' | 'FINISH';

export interface ApprovalItem {
    task: Task;
    stage: TaskStage;
    category?: Category;
    type: ApprovalType;
    /** Due time in 6-to-6 display minutes. */
    dueD: number;
    /** How many minutes past due, in display minutes. */
    lateMinutes: number;
}

// ---------------------------------------------------------------- logic

/** 6-to-6 as one day: toDisplayMinutes makes 23:55 -> 00:25 and "now" 01:30 compare correctly. */
export function getApprovalType(stage: TaskStage, currentMinutes: number, dailyStartMinutes: number): ApprovalType | null {
    const nowD = toDisplayMinutes(currentMinutes, dailyStartMinutes);
    const startTime = stage.startTimeMinutes ?? 0;
    const endTime = startTime + (stage.durationMinutes ?? 0);
    const startD = toDisplayMinutes(startTime, dailyStartMinutes);
    const endD = toDisplayMinutes(endTime >= 1440 ? endTime - 1440 : endTime, dailyStartMinutes);
    if (stage.status === 'Process' && endD <= nowD) return 'FINISH';
    if (stage.status === 'Upcoming' && startD <= nowD) return 'START';
    return null;
}

/** All stages that need attention, oldest due first. */
export function getApprovalItems(
    tasks: Task[],
    categories: Category[],
    dailyStartMinutes: number,
    currentMinutes: number,
): ApprovalItem[] {
    const nowD = toDisplayMinutes(currentMinutes, dailyStartMinutes);
    const items: ApprovalItem[] = [];
    tasks.forEach(task => {
        const category = categories.find(c => c.id === task.categoryId);
        task.stages?.forEach(stage => {
            const type = getApprovalType(stage, currentMinutes, dailyStartMinutes);
            if (!type) return;
            const startTime = stage.startTimeMinutes ?? 0;
            const endTime = startTime + (stage.durationMinutes ?? 0);
            const dueD = type === 'START'
                ? toDisplayMinutes(startTime, dailyStartMinutes)
                : toDisplayMinutes(endTime >= 1440 ? endTime - 1440 : endTime, dailyStartMinutes);
            items.push({ task, stage, category, type, dueD, lateMinutes: Math.max(0, nowD - dueD) });
        });
    });
    return items.sort((a, b) => a.dueD - b.dueD);
}

const formatClock = (minutes: number) => {
    const h = Math.floor(minutes / 60) % 24;
    const m = Math.floor(minutes % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const formatLate = (minutes: number) => {
    if (minutes < 1) return 'just now';
    const h = Math.floor(minutes / 60);
    const m = Math.floor(minutes % 60);
    return h > 0 ? (m > 0 ? `${h}h ${m}m late` : `${h}h late`) : `${m}m late`;
};

const formatDuration = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = Math.floor(minutes % 60);
    return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
};

// ---------------------------------------------------------------- button

interface NotificationButtonProps {
    count: number;
    onPress: () => void;
    /** Icon names (default: the bell); the idea button reuses this dome with a bulb. */
    icon?: React.ComponentProps<typeof MaterialIcons>['name'];
    iconActive?: React.ComponentProps<typeof MaterialIcons>['name'];
}

/** Small raised bell dome with a count badge. The parent puts it in a sunken tray next to the full screen button. */
export function NotificationButton({ count, onPress, icon = 'notifications-none', iconActive = 'notifications' }: NotificationButtonProps) {
    const active = count > 0;
    return (
        <TouchableOpacity
            style={styles.btnWrap}
            onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onPress();
            }}
            activeOpacity={0.85}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
        >
            <View style={[styles.btnDome, active && styles.btnDomeActive]}>
                <MaterialIcons
                    name={active ? iconActive : icon}
                    size={18}
                    color={active ? '#FFFFFF' : 'rgba(255,255,255,0.55)'}
                />
            </View>
            {active && (
                <View style={styles.btnBadge}>
                    <Text style={styles.btnBadgeText}>{count > 99 ? '99+' : count}</Text>
                </View>
            )}
        </TouchableOpacity>
    );
}

// ---------------------------------------------------------------- popup

type Filter = 'ALL' | ApprovalType;

interface NotificationPopupProps {
    visible: boolean;
    onClose: () => void;
    tasks: Task[];
    categories: Category[];
    dailyStartMinutes?: number;
    currentMinutes: number;
    /** Distance from the bottom / right edge of the screen (above the floating buttons). */
    anchorBottom: number;
    anchorRight: number;
    onUpdateStageStatus: (taskId: number, stageId: number, status: StageStatus) => void;
    /** Finish every In Process stage whose end time has passed. */
    onFinishAll: () => void;
}

export function NotificationPopup({
    visible,
    onClose,
    tasks,
    categories,
    dailyStartMinutes = DEFAULT_DAILY_START_MINUTES,
    currentMinutes,
    anchorBottom,
    anchorRight,
    onUpdateStageStatus,
    onFinishAll,
}: NotificationPopupProps) {
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const fade = useRef(new Animated.Value(0)).current;
    const scale = useRef(new Animated.Value(0.92)).current;
    const lift = useRef(new Animated.Value(10)).current;
    const [filter, setFilter] = useState<Filter>('ALL');
    const [tabsWidth, setTabsWidth] = useState(0);
    const slide = useRef(new Animated.Value(0)).current;
    const FILTERS: Filter[] = ['ALL', 'START', 'FINISH'];
    // 3 equal tabs inside the well (2px padding on each side, 2px gaps)
    const tabWidth = tabsWidth > 0 ? (tabsWidth - 4 - 4) / 3 : 0;

    const tabWidthRef = useRef(0);
    tabWidthRef.current = tabWidth;
    const filterRef = useRef<Filter>('ALL');
    filterRef.current = filter;
    const pickFromX = (x: number) => {
        const w = tabWidthRef.current;
        if (w <= 0) return;
        const idx = Math.max(0, Math.min(2, Math.floor((x - 2) / (w + 2))));
        const next = FILTERS[idx];
        if (next !== filterRef.current) {
            filterRef.current = next;
            Haptics.selectionAsync();
            setFilter(next);
        }
    };
    const selectorPan = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderTerminationRequest: () => false,
            onPanResponderGrant: evt => pickFromX(evt.nativeEvent.locationX),
            onPanResponderMove: evt => pickFromX(evt.nativeEvent.locationX),
        })
    ).current;

    useEffect(() => {
        if (tabWidth <= 0) return;
        Animated.spring(slide, {
            toValue: FILTERS.indexOf(filter) * (tabWidth + 2),
            friction: 9,
            tension: 120,
            useNativeDriver: true,
        }).start();
    }, [filter, tabWidth]);

    useEffect(() => {
        if (visible) {
            setFilter('ALL');
            slide.setValue(0);
            Animated.parallel([
                Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: true }),
                Animated.spring(scale, { toValue: 1, friction: 8, tension: 90, useNativeDriver: true }),
                Animated.spring(lift, { toValue: 0, friction: 8, tension: 90, useNativeDriver: true }),
            ]).start();
        } else {
            fade.setValue(0);
            scale.setValue(0.92);
            lift.setValue(10);
        }
    }, [visible, fade, scale, lift]);

    const items = useMemo(
        () => getApprovalItems(tasks, categories, dailyStartMinutes, currentMinutes),
        [tasks, categories, dailyStartMinutes, currentMinutes],
    );
    const startCount = items.filter(i => i.type === 'START').length;
    const finishCount = items.length - startCount;
    const shown = filter === 'ALL' ? items : items.filter(i => i.type === filter);

    if (!visible) return null;

    const width = Math.min(300, screenWidth - 16);
    const maxHeight = Math.max(200, screenHeight - anchorBottom - 24);

    const tab = (key: Filter, label: string, n: number) => {
        const active = filter === key;
        return (
            <View key={key} style={styles.tab} pointerEvents="none">
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
                <Text style={[styles.tabCount, active && styles.tabCountActive]}>{n}</Text>
            </View>
        );
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            onRequestClose={onClose}
            supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
            statusBarTranslucent
        >
            <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
                <Animated.View
                    style={[
                        styles.cardShadow,
                        { bottom: anchorBottom, right: anchorRight, width },
                        { opacity: fade, transform: [{ translateY: lift }, { scale }] },
                    ]}
                    onStartShouldSetResponder={() => true}
                >
                  <View style={[styles.cardGlass, { maxHeight }]}>
                    {/* frosted glass: blur + dark tint + soft top light */}
                    <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
                    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.glassTint]} />
                    <LinearGradient
                        pointerEvents="none"
                        colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0)']}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                        style={styles.glassSheen}
                    />
                    <View style={styles.cardContent}>
                    {/* header */}
                    <View style={styles.header}>
                        <View style={styles.socket}>
                            <View style={[styles.dome, { backgroundColor: '#FFB74D' }]}>
                                <MaterialIcons name="notifications" size={12} color="#0A0C10" />
                            </View>
                        </View>
                        <View style={styles.headerText}>
                            <Text style={styles.title}>NOTIFICATIONS</Text>
                            <Text style={styles.subtitle}>
                                {items.length === 0 ? 'Nothing needs you right now' : `${items.length} need${items.length === 1 ? 's' : ''} your attention`}
                            </Text>
                        </View>
                        {finishCount > 0 && (
                            <TouchableOpacity
                                style={styles.finishAllBtn}
                                onPress={() => {
                                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                    onFinishAll();
                                }}
                                activeOpacity={0.8}
                            >
                                <MaterialIcons name="done-all" size={12} color="#7BE18A" />
                                <Text style={styles.finishAllText}>FINISH ALL</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8}>
                            <MaterialIcons name="close" size={12} color="rgba(255,255,255,0.85)" />
                        </TouchableOpacity>
                    </View>

                    {/* filter tabs */}
                    <View
                        style={styles.tabsWell}
                        onLayout={e => setTabsWidth(e.nativeEvent.layout.width)}
                        {...selectorPan.panHandlers}
                    >
                        {/* sliding glass selector */}
                        {tabWidth > 0 && (
                            <Animated.View
                                pointerEvents="none"
                                style={[styles.tabSlider, { width: tabWidth, transform: [{ translateX: slide }] }]}
                            >
                                <LinearGradient
                                    colors={['rgba(255,255,255,0.32)', 'rgba(255,255,255,0.08)']}
                                    start={{ x: 0.5, y: 0 }}
                                    end={{ x: 0.5, y: 1 }}
                                    style={StyleSheet.absoluteFill}
                                />
                            </Animated.View>
                        )}
                        {tab('ALL', 'ALL', items.length)}
                        {tab('START', 'TO START', startCount)}
                        {tab('FINISH', 'TO FINISH', finishCount)}
                    </View>

                    {/* list */}
                    <View style={styles.listWell}>
                        <ScrollView
                            style={styles.list}
                            contentContainerStyle={styles.listContent}
                            showsVerticalScrollIndicator={false}
                            nestedScrollEnabled
                        >
                            {shown.length === 0 ? (
                                <View style={styles.empty}>
                                    <View style={styles.emptyDome}>
                                        <MaterialIcons name="done-all" size={16} color="#7BE18A" />
                                    </View>
                                    <Text style={styles.emptyTitle}>All caught up</Text>
                                    <Text style={styles.emptyText}>No stages are waiting to start or finish.</Text>
                                </View>
                            ) : (
                                shown.map(({ task, stage, category, type, lateMinutes }) => {
                                    const isStart = type === 'START';
                                    const accent = isStart ? '#FFB74D' : '#7BE18A';
                                    const start = stage.startTimeMinutes ?? 0;
                                    const dur = stage.durationMinutes ?? 0;
                                    return (
                                        <View key={`${task.id}-${stage.id}-${type}`} style={styles.row}>
                                            <View style={styles.socket}>
                                                <View style={[styles.dome, { backgroundColor: accent }]}>
                                                    <MaterialIcons name={isStart ? 'play-arrow' : 'check'} size={11} color="#0A0C10" />
                                                </View>
                                            </View>
                                            <View style={styles.rowMain}>
                                                <Text style={styles.rowTitle} numberOfLines={1}>{stage.text}</Text>
                                                <View style={styles.rowMeta}>
                                                    <View style={[styles.typeChip, { backgroundColor: isStart ? '#3A2D12' : '#17301D' }]}>
                                                        <Text style={[styles.typeChipText, { color: accent }]}>{isStart ? 'TO START' : 'TO FINISH'}</Text>
                                                    </View>
                                                    <Text style={styles.metaText} numberOfLines={1}>
                                                        {formatClock(start)} - {formatClock(start + dur)} · {formatDuration(dur)}
                                                    </Text>
                                                </View>
                                                <View style={styles.rowMeta}>
                                                    <View style={styles.lateChip}>
                                                        <MaterialIcons name="schedule" size={8} color="#FF8A8A" />
                                                        <Text style={styles.lateText}>{formatLate(lateMinutes)}</Text>
                                                    </View>
                                                    <Text style={styles.taskText} numberOfLines={1}>
                                                        {category ? `${category.name} · ` : ''}{task.title}
                                                    </Text>
                                                </View>
                                            </View>
                                            <View style={styles.actions}>
                                                <TouchableOpacity
                                                    style={styles.declineBtn}
                                                    onPress={() => {
                                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                        onUpdateStageStatus(task.id, stage.id, isStart ? 'Undone' : 'Upcoming');
                                                    }}
                                                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                                                    activeOpacity={0.8}
                                                >
                                                    <MaterialIcons name={isStart ? 'close' : 'undo'} size={12} color="#FF6B6B" />
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={styles.acceptBtn}
                                                    onPress={() => {
                                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                                        onUpdateStageStatus(task.id, stage.id, isStart ? 'Process' : 'Done');
                                                    }}
                                                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                                                    activeOpacity={0.8}
                                                >
                                                    <MaterialIcons name={isStart ? 'play-arrow' : 'check'} size={14} color="#0A0C10" />
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    );
                                })
                            )}
                        </ScrollView>
                    </View>
                    </View>
                  </View>
                </Animated.View>
            </TouchableOpacity>
        </Modal>
    );
}

// ---------------------------------------------------------------- styles

const raised = {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
};

const styles = StyleSheet.create({
    // bell in the top tray
    btnWrap: {
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0B0C0F',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.85), 0 1px 0 rgba(255,255,255,0.07)',
    },
    btnDome: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1D2128',
        ...raised,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 3,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -2px 0 rgba(0,0,0,0.3)',
    },
    btnDomeActive: {
        backgroundColor: '#1E6B35',
        boxShadow: 'inset 0 1px 0 rgba(123,225,138,0.45), inset 0 -2px 0 rgba(0,0,0,0.3)',
    },
    btnBadge: {
        position: 'absolute',
        top: -4,
        right: -4,
        minWidth: 17,
        height: 17,
        paddingHorizontal: 4,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#4CAF50',
        borderWidth: 2,
        borderColor: '#000000',
    },
    btnBadgeText: {
        fontSize: 9,
        fontWeight: '900',
        color: '#FFFFFF',
    },

    // glass card
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.28)',
    },
    cardShadow: {
        position: 'absolute',
        borderRadius: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.55,
        shadowRadius: 18,
        elevation: 24,
    },
    cardGlass: {
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
        backgroundColor: 'rgba(20,23,27,0.35)',
    },
    glassTint: {
        backgroundColor: 'rgba(14,16,20,0.42)',
    },
    glassSheen: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        height: 56,
    },
    cardContent: {
        padding: 8,
        gap: 6,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        paddingHorizontal: 2,
    },
    socket: {
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.35)',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.1)',
    },
    dome: {
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -2px 0 rgba(0,0,0,0.25), 0 2px 3px rgba(0,0,0,0.5)',
    },
    headerText: {
        flex: 1,
        minWidth: 0,
    },
    title: {
        fontSize: 9.5,
        fontWeight: '800',
        letterSpacing: 1.6,
        color: '#FFFFFF',
    },
    subtitle: {
        marginTop: 1,
        fontSize: 8,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.6)',
    },
    finishAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        height: 24,
        paddingHorizontal: 8,
        borderRadius: 12,
        backgroundColor: 'rgba(30,107,53,0.65)',
        borderWidth: 1,
        borderColor: 'rgba(123,225,138,0.25)',
        boxShadow: 'inset 0 1px 0 rgba(123,225,138,0.3)',
    },
    finishAllText: {
        fontSize: 7.5,
        fontWeight: '800',
        letterSpacing: 1,
        color: '#9FE8AC',
    },
    closeBtn: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14)',
    },

    // tabs
    tabsWell: {
        flexDirection: 'row',
        gap: 2,
        padding: 2,
        borderRadius: 15,
        backgroundColor: 'rgba(0,0,0,0.32)',
        boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.6), inset 0 -1px 0 rgba(255,255,255,0.06)',
    },
    tabSlider: {
        position: 'absolute',
        left: 2,
        top: 2,
        height: 24,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.12)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.35,
        shadowRadius: 5,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -1px 0 rgba(255,255,255,0.08)',
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        height: 24,
        borderRadius: 12,
    },
    tabText: {
        fontSize: 7.5,
        fontWeight: '800',
        letterSpacing: 1,
        color: 'rgba(255,255,255,0.55)',
    },
    tabTextActive: {
        color: '#FFFFFF',
    },
    tabCount: {
        fontSize: 8,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.4)',
    },
    tabCountActive: {
        color: 'rgba(255,255,255,0.85)',
    },

    // list
    listWell: {
        flexShrink: 1,
        borderRadius: 17,
        padding: 4,
        backgroundColor: 'rgba(0,0,0,0.3)',
        boxShadow: 'inset 0 3px 8px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.07)',
    },
    list: {
        flexGrow: 0,
    },
    listContent: {
        gap: 4,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        padding: 6,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.09)',
        ...raised,
        shadowOpacity: 0.35,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -2px 0 rgba(0,0,0,0.2)',
    },
    rowMain: {
        flex: 1,
        minWidth: 0,
        gap: 2,
    },
    rowTitle: {
        fontSize: 10.5,
        fontWeight: '800',
        color: '#FFFFFF',
    },
    rowMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    typeChip: {
        paddingHorizontal: 5,
        height: 13,
        borderRadius: 7,
        justifyContent: 'center',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
    },
    typeChipText: {
        fontSize: 6.5,
        fontWeight: '900',
        letterSpacing: 0.7,
    },
    metaText: {
        flexShrink: 1,
        fontSize: 8,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.72)',
    },
    lateChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        paddingHorizontal: 5,
        height: 13,
        borderRadius: 7,
        backgroundColor: 'rgba(120,30,40,0.45)',
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)',
    },
    lateText: {
        fontSize: 7,
        fontWeight: '800',
        color: '#FF9A9A',
    },
    taskText: {
        flexShrink: 1,
        fontSize: 7.5,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.5)',
    },
    actions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    declineBtn: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(120,40,30,0.5)',
        borderWidth: 1,
        borderColor: 'rgba(255,140,110,0.2)',
        boxShadow: 'inset 0 1px 0 rgba(255,140,110,0.25)',
    },
    acceptBtn: {
        width: 27,
        height: 27,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#7BE18A',
        ...raised,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -2px 0 rgba(0,0,0,0.2)',
    },

    // empty state
    empty: {
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 10,
        gap: 5,
    },
    emptyDome: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(30,107,53,0.6)',
        borderWidth: 1,
        borderColor: 'rgba(123,225,138,0.25)',
        boxShadow: 'inset 0 1px 0 rgba(123,225,138,0.35), inset 0 -2px 0 rgba(0,0,0,0.25)',
    },
    emptyTitle: {
        fontSize: 11,
        fontWeight: '800',
        color: '#FFFFFF',
    },
    emptyText: {
        fontSize: 8.5,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.55)',
        textAlign: 'center',
    },
});
