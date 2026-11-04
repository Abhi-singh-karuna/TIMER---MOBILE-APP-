import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ScrollViewInstance } from 'react-native';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, runOnJS, useAnimatedStyle } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Idea } from '../../../constants/data';

interface IdeaTrayProps {
    ideas: Idea[];
    /** The popup is opened from the idea button in the bottom controls. */
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The current logical day (YYYY-MM-DD); an idea stays visible until its due day is over. */
    todayKey: string;
    /** Distance from the screen bottom / right edge to the popup (above the floating buttons). */
    bottom: number;
    right: number;
    keyboardHeight: number;
    onAdd: (title: string, dueDate: string) => void;
    onDelete: (id: number) => void;
    /** Tap on an idea: place it (the planner picks a time near the middle of the screen). */
    onPlace: (idea: Idea) => void;
    onDragStart: (idea: Idea) => void;
    /** Finger position (screen coordinates) while an idea is dragged; written on the UI thread so the drag stays smooth. */
    dragX: SharedValue<number>;
    dragY: SharedValue<number>;
    dragOn: SharedValue<number>;
    onDragEnd: (idea: Idea, pageX: number, pageY: number) => void;
    /** Landscape: no drag onto the planner; a tapped idea asks for its task here, then onPlaceWithTask runs. */
    landscape?: boolean;
    tasks?: { id: number; title: string; color?: string }[];
    onPlaceWithTask?: (idea: Idea, taskId: number) => void;
}

const HOLD_MS = 300;
const CARD_W = 230;
const CARD_H = 50;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const SUNK = 'inset 0 3px 8px rgba(0,0,0,0.95), inset 0 -1px 0 rgba(255,255,255,0.07)';
const WHITE_DOME = '0 5px 12px rgba(255,255,255,0.14), inset 0 2px 0 #FFFFFF, inset 0 -3px 5px rgba(0,0,0,0.22)';
const DOME = 'inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -2px 0 rgba(0,0,0,0.35), 0 3px 6px rgba(0,0,0,0.55)';

// YYYY-MM-DD helpers (local calendar days, the same keys the planner uses)
const toDate = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
};
const toKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDaysKey = (key: string, n: number) => {
    const d = toDate(key);
    d.setDate(d.getDate() + n);
    return toKey(d);
};
const daysBetween = (from: string, to: string) => Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86400000);
const dateLabel = (key: string, todayKey: string) => {
    const n = daysBetween(todayKey, key);
    if (n === 0) return 'Today';
    if (n === 1) return 'Tomorrow';
    const d = toDate(key);
    return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
/** Short "time left" label for a row. */
const leftLabel = (due: string | undefined, todayKey: string) => {
    if (!due) return '';
    const n = daysBetween(todayKey, due);
    if (n <= 0) return 'TODAY';
    if (n === 1) return 'TOMORROW';
    return `${n} DAYS`;
};

interface IdeaRowProps {
    idea: Idea;
    dragEnabled: boolean;
    todayKey: string;
    dragX: SharedValue<number>;
    dragY: SharedValue<number>;
    dragOn: SharedValue<number>;
    onDelete: (id: number) => void;
    onPlace: (idea: Idea) => void;
    onArm: (idea: Idea) => void;
    onRelease: (idea: Idea, x: number, y: number) => void;
}

/** One idea: tap places it, hold (about 0.3s) then drag moves it onto the planner. The drag runs on the UI thread. */
function IdeaRow({ idea, dragEnabled, todayKey, dragX, dragY, dragOn, onDelete, onPlace, onArm, onRelease }: IdeaRowProps) {
    const cb = useRef({ onArm, onRelease, idea });
    cb.current = { onArm, onRelease, idea };
    const arm = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        cb.current.onArm(cb.current.idea);
    }, []);
    const release = useCallback((x: number, y: number) => cb.current.onRelease(cb.current.idea, x, y), []);

    const pan = useMemo(() => Gesture.Pan()
        .enabled(dragEnabled)
        .activateAfterLongPress(HOLD_MS)
        .onStart((e) => {
            'worklet';
            dragX.value = e.absoluteX;
            dragY.value = e.absoluteY;
            dragOn.value = 1;
            runOnJS(arm)();
        })
        .onUpdate((e) => {
            'worklet';
            dragX.value = e.absoluteX;
            dragY.value = e.absoluteY;
        })
        .onFinalize((e) => {
            'worklet';
            if (dragOn.value === 1) {
                dragOn.value = 0;
                runOnJS(release)(e.absoluteX, e.absoluteY);
            }
        }), [dragX, dragY, dragOn, arm, release, dragEnabled]);

    const left = leftLabel(idea.dueDate, todayKey);
    const urgent = !!idea.dueDate && daysBetween(todayKey, idea.dueDate) <= 0;

    return (
        <GestureDetector gesture={pan}>
            <View>
                <TouchableOpacity style={styles.row} activeOpacity={0.8} onPress={() => onPlace(idea)}>
                    <View style={styles.socket}>
                        <View style={[styles.dome, { backgroundColor: urgent ? '#FFB74D' : '#FFFFFF' }]}>
                            <MaterialIcons name="lightbulb-outline" size={11} color="#0A0C10" />
                        </View>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.rowTitle} numberOfLines={1}>{idea.title}</Text>
                        {!!left && <Text style={[styles.rowDue, urgent && { color: '#FFB74D' }]}>DUE {left}</Text>}
                    </View>
                    <TouchableOpacity
                        hitSlop={8}
                        activeOpacity={0.6}
                        style={styles.rowDelete}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onDelete(idea.id); }}
                    >
                        <MaterialIcons name="close" size={12} color="rgba(255,255,255,0.6)" />
                    </TouchableOpacity>
                </TouchableOpacity>
            </View>
        </GestureDetector>
    );
}

export default function IdeaTray({
    ideas, open, onOpenChange, todayKey, bottom, right, keyboardHeight, onAdd, onDelete, onPlace, onDragStart, dragX, dragY, dragOn, onDragEnd, landscape = false, tasks = [], onPlaceWithTask,
}: IdeaTrayProps) {
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const [placing, setPlacing] = useState<Idea | null>(null); // landscape: the idea waiting for a task
    const [adding, setAdding] = useState(false);
    const [text, setText] = useState('');
    const [due, setDue] = useState(() => addDaysKey(todayKey, 1));
    const [drag, setDrag] = useState<Idea | null>(null);
    const listRef = useRef<ScrollViewInstance>(null);
    const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateX: dragX.value - CARD_W / 2 }, { translateY: dragY.value - CARD_H - 18 }] }));

    useEffect(() => { if (open && ideas.length === 0) setAdding(true); }, [open, ideas.length]);
    useEffect(() => { if (open) setDue(d => (d < todayKey ? addDaysKey(todayKey, 1) : d)); }, [open, todayKey]);

    // soonest due first
    const sorted = useMemo(
        () => [...ideas].sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || b.createdAt - a.createdAt),
        [ideas],
    );

    const submit = () => {
        const t = text.trim();
        if (!t) return;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onAdd(t, due);
        setText('');
    };
    const close = () => { onOpenChange(false); setAdding(false); setText(''); setPlacing(null); };
    const lockScroll = (locked: boolean) => {
        (listRef.current as any)?.setNativeProps?.({ scrollEnabled: !locked });
    };
    const popupBottom = keyboardHeight > 0 ? keyboardHeight + 8 : bottom;
    const width = Math.min(300, screenWidth - 16);
    const chip = (label: string, key: string) => {
        const on = due === key;
        return (
            <TouchableOpacity
                key={label}
                activeOpacity={0.8}
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => { Haptics.selectionAsync(); setDue(key); }}
            >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
            </TouchableOpacity>
        );
    };

    return (
        <View style={[StyleSheet.absoluteFill, { zIndex: 100 }]} pointerEvents="box-none">
            {open && (
                <>
                    {!drag && <Pressable style={styles.dim} onPress={close} />}
                    <Animated.View
                        entering={FadeIn.duration(160)}
                        exiting={FadeOut.duration(120)}
                        style={[styles.cardShadow, landscape ? { top: 8, right, width, maxHeight: screenHeight - 16 } : { bottom: popupBottom, right, width }, drag && { opacity: 0 }]}
                    >
                        <View style={styles.cardGlass}>
                            {/* frosted glass: blur + dark tint + soft top light (same as the notification popup) */}
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
                                <View style={styles.header}>
                                    <View style={styles.socket}>
                                        <View style={[styles.dome, { backgroundColor: '#FFD54F' }]}>
                                            <MaterialIcons name="lightbulb" size={12} color="#0A0C10" />
                                        </View>
                                    </View>
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Text style={styles.title}>IDEAS</Text>
                                        <Text style={styles.subtitle}>
                                            {ideas.length === 0 ? 'Capture a thought for later' : `${ideas.length} waiting · tap to place, hold to drag`}
                                        </Text>
                                    </View>
                                    <TouchableOpacity
                                        activeOpacity={0.85}
                                        style={styles.newBtn}
                                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setAdding(a => !a); }}
                                    >
                                        <MaterialIcons name={adding ? 'close' : 'add'} size={12} color="#000000" />
                                        <Text style={styles.newBtnText}>{adding ? 'DONE' : 'NEW'}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.closeBtn} onPress={close} activeOpacity={0.8}>
                                        <MaterialIcons name="close" size={12} color="rgba(255,255,255,0.85)" />
                                    </TouchableOpacity>
                                </View>

                                {adding && (
                                    <View style={styles.addBox}>
                                        <View style={styles.inputRow}>
                                            <TextInput
                                                style={styles.input}
                                                placeholder="What is on your mind…"
                                                placeholderTextColor="rgba(255,255,255,0.35)"
                                                value={text}
                                                onChangeText={setText}
                                                onSubmitEditing={submit}
                                                returnKeyType="done"
                                                blurOnSubmit={false}
                                                autoFocus
                                            />
                                            <TouchableOpacity activeOpacity={0.85} style={[styles.saveBtn, !text.trim() && { opacity: 0.4 }]} onPress={submit}>
                                                <MaterialIcons name="check" size={17} color="#000000" />
                                            </TouchableOpacity>
                                        </View>
                                        {!landscape && <Text style={styles.label}>VISIBLE UNTIL</Text>}
                                        <View style={styles.chipsRow}>
                                            {chip('TODAY', todayKey)}
                                            {chip('TOMORROW', addDaysKey(todayKey, 1))}
                                            {chip('3 DAYS', addDaysKey(todayKey, 3))}
                                            {chip('1 WEEK', addDaysKey(todayKey, 7))}
                                        </View>
                                        {!landscape && <View style={styles.stepper}>
                                            <TouchableOpacity
                                                activeOpacity={0.8}
                                                style={[styles.stepBtn, due <= todayKey && { opacity: 0.35 }]}
                                                onPress={() => { if (due > todayKey) { Haptics.selectionAsync(); setDue(addDaysKey(due, -1)); } }}
                                            >
                                                <MaterialIcons name="chevron-left" size={18} color="#FFFFFF" />
                                            </TouchableOpacity>
                                            <Text style={styles.stepLabel}>{dateLabel(due, todayKey)}</Text>
                                            <TouchableOpacity
                                                activeOpacity={0.8}
                                                style={styles.stepBtn}
                                                onPress={() => { Haptics.selectionAsync(); setDue(addDaysKey(due, 1)); }}
                                            >
                                                <MaterialIcons name="chevron-right" size={18} color="#FFFFFF" />
                                            </TouchableOpacity>
                                        </View>}
                                    </View>
                                )}

                                {placing ? (
                                    <View style={{ gap: 6 }}>
                                        <Text style={styles.label}>ADD "{placing.title.toUpperCase()}" TO</Text>
                                        <ScrollView style={{ maxHeight: landscape ? Math.max(90, screenHeight - 150) : 200 }} contentContainerStyle={{ gap: 6 }} showsVerticalScrollIndicator={false}>
                                            {tasks.map(t => (
                                                <TouchableOpacity
                                                    key={t.id}
                                                    activeOpacity={0.8}
                                                    style={styles.row}
                                                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); const i = placing; close(); onPlaceWithTask?.(i, t.id); }}
                                                >
                                                    <View style={[styles.taskDot, { backgroundColor: t.color || '#FFFFFF' }]} />
                                                    <Text style={[styles.rowTitle, { flex: 1 }]} numberOfLines={1}>{t.title}</Text>
                                                    <MaterialIcons name="chevron-right" size={16} color="rgba(255,255,255,0.5)" />
                                                </TouchableOpacity>
                                            ))}
                                        </ScrollView>
                                        <TouchableOpacity activeOpacity={0.8} style={[styles.chip, { height: 30 }]} onPress={() => setPlacing(null)}>
                                            <Text style={styles.chipText}>BACK</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (landscape && adding) ? null : sorted.length > 0 ? (
                                    <ScrollView ref={listRef} style={[styles.list, landscape && { maxHeight: Math.max(90, screenHeight - 130) }]} contentContainerStyle={{ gap: 6 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                                        {sorted.map(idea => (
                                            <IdeaRow
                                                key={idea.id}
                                                idea={idea}
                                                dragEnabled={!landscape}
                                                todayKey={todayKey}
                                                dragX={dragX}
                                                dragY={dragY}
                                                dragOn={dragOn}
                                                onDelete={onDelete}
                                                onPlace={(i) => { if (landscape) { setPlacing(i); } else { close(); onPlace(i); } }}
                                                onArm={(i) => { lockScroll(true); setDrag(i); onDragStart(i); }}
                                                onRelease={(i, x, y) => { lockScroll(false); setDrag(null); close(); onDragEnd(i, x, y); }}
                                            />
                                        ))}
                                    </ScrollView>
                                ) : (
                                    !adding && <Text style={styles.empty}>NO IDEAS YET</Text>
                                )}
                            </View>
                        </View>
                    </Animated.View>
                </>
            )}

            {drag && (
                <Animated.View pointerEvents="none" style={[styles.floatCard, cardStyle]}>
                    <Text style={styles.floatTitle} numberOfLines={1}>{drag.title}</Text>
                    <Text style={styles.floatSub}>DROP ON THE PLANNER</Text>
                </Animated.View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    dim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.28)' },
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
    glassTint: { backgroundColor: 'rgba(14,16,20,0.42)' },
    glassSheen: { position: 'absolute', left: 0, right: 0, top: 0, height: 56 },
    cardContent: { padding: 8, gap: 6 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 2 },
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
    title: { fontSize: 9.5, fontWeight: '800', letterSpacing: 1.6, color: '#FFFFFF' },
    subtitle: { marginTop: 1, fontSize: 8, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
    newBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 24, paddingLeft: 6, paddingRight: 9, borderRadius: 12, backgroundColor: '#FFFFFF', boxShadow: WHITE_DOME },
    newBtnText: { fontSize: 8, fontWeight: '800', letterSpacing: 1.1, color: '#000000' },
    closeBtn: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    addBox: { gap: 7, padding: 7, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.3)', boxShadow: SUNK },
    inputRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    input: {
        flex: 1,
        height: 38,
        borderRadius: 12,
        paddingHorizontal: 12,
        fontSize: 13,
        fontWeight: '600',
        color: '#FFFFFF',
        backgroundColor: '#020203',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    saveBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', boxShadow: WHITE_DOME },
    label: { fontSize: 7.5, fontWeight: '800', letterSpacing: 1.4, color: 'rgba(255,255,255,0.45)', paddingLeft: 3 },
    chipsRow: { flexDirection: 'row', gap: 5 },
    chip: {
        flex: 1,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#15171C',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        boxShadow: DOME,
    },
    chipOn: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF', boxShadow: WHITE_DOME },
    chipText: { fontSize: 7, fontWeight: '800', letterSpacing: 0.6, color: 'rgba(255,255,255,0.7)' },
    chipTextOn: { color: '#000000' },
    stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    stepBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#15171C', boxShadow: DOME },
    stepLabel: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
    list: { maxHeight: 200 },
    taskDot: { width: 10, height: 10, borderRadius: 5, marginLeft: 4 },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        minHeight: 44,
        paddingLeft: 8,
        paddingRight: 8,
        borderRadius: 14,
        backgroundColor: 'rgba(0,0,0,0.38)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        boxShadow: SUNK,
    },
    rowTitle: { fontSize: 12.5, fontWeight: '700', color: '#FFFFFF' },
    rowDue: { marginTop: 1, fontSize: 7.5, fontWeight: '800', letterSpacing: 1, color: 'rgba(255,255,255,0.45)' },
    rowDelete: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.07)' },
    empty: { textAlign: 'center', paddingVertical: 10, fontSize: 8.5, fontWeight: '800', letterSpacing: 1.3, color: 'rgba(255,255,255,0.35)' },
    floatCard: {
        position: 'absolute',
        left: 0,
        top: 0,
        width: CARD_W,
        height: CARD_H,
        borderRadius: 16,
        paddingHorizontal: 14,
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.22)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.65)',
        boxShadow: '0 0 30px rgba(255,255,255,0.25), 0 14px 26px rgba(0,0,0,0.6)',
    },
    floatTitle: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
    floatSub: { fontSize: 8.5, fontWeight: '700', letterSpacing: 1.2, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
});
