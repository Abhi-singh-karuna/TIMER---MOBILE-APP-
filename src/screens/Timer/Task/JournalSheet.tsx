import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Pressable, Modal, Keyboard, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Extrapolation, FadeIn, FadeOut, cancelAnimation, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { JournalEntry, JOURNAL_CURRENCY } from '../../../constants/data';

export interface JournalSubtask {
    taskId: number;
    stageId: number;
    text: string;
    taskTitle: string;
}

interface JournalSheetProps {
    /** Every journal entry (the sheet shows the ones of `dayKey`). */
    entries: JournalEntry[];
    dayKey: string;
    todayKey: string;
    /** e.g. "TUE · 4 NOV" */
    dayLabel: string;
    onPrevDay: () => void;
    onNextDay: () => void;
    onToday: () => void;
    /** Subtasks of this day an entry can be linked to. */
    subtasks: JournalSubtask[];
    dailyStartMinutes: number;
    /** Current clock time in minutes from midnight. */
    nowMinutes: number;
    topInset: number;
    bottomInset: number;
    /** Tap on the journal button in the bottom controls: each change toggles the sheet. */
    toggleSignal: number;
    keyboardHeight: number;
    onStageChange: (stage: 1 | 2 | 3) => void;
    onAdd: (entry: Omit<JournalEntry, 'id' | 'createdAt'>) => void;
    onUpdate: (entry: JournalEntry) => void;
    onDelete: (id: number) => void;
}

type Filter = 'all' | 'note' | 'expense' | 'day' | 'linked';

const PEEK_H = 54; // header height
const SUNK = 'inset 0 3px 8px rgba(0,0,0,0.95), inset 0 -1px 0 rgba(255,255,255,0.07)';
const DOME = '0 0 0 3px rgba(0,0,0,0.5), 0 6px 9px rgba(0,0,0,0.8), 0 2px 0 rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -3px 0 rgba(0,0,0,0.5)';
const WHITE_DOME = '0 5px 12px rgba(255,255,255,0.14), inset 0 2px 0 #FFFFFF, inset 0 -3px 5px rgba(0,0,0,0.22)';
const NOTE_COLOR = '#9CC2FF';
const MONEY_COLOR = '#FFD54F';

const hhmm = (m: number) => {
    const v = ((Math.round(m) % 1440) + 1440) % 1440;
    return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
};
const money = (n: number) => {
    const fixed = Math.abs(n % 1) > 0.004 ? n.toFixed(2) : String(Math.round(n));
    const [whole, dec] = fixed.split('.');
    return `${JOURNAL_CURRENCY}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${dec ? '.' + dec : ''}`;
};

interface Draft {
    id?: number;
    type: 'note' | 'expense';
    text: string;
    amount: string;
    time: number;
    link: { taskId: number; stageId: number } | null;
    createdAt?: number;
}

interface EditorProps {
    draft: Draft;
    subtasks: JournalSubtask[];
    nowMinutes: number;
    keyboardHeight: number;
    bottomInset: number;
    topInset: number;
    onChange: (d: Draft) => void;
    onCancel: () => void;
    onSave: () => void;
    onDelete?: () => void;
}

const partOfDay = (m: number) => {
    const h = Math.floor((((m % 1440) + 1440) % 1440) / 60);
    return h >= 5 && h < 12 ? 'MORNING' : h < 17 ? 'AFTERNOON' : h < 21 ? 'EVENING' : 'NIGHT';
};

const WHEEL_ITEM = 38;

/** One scroll wheel (three rows tall): the middle row is the value. */
function MiniWheel({ count, value, onChange }: { count: number; value: number; onChange: (v: number) => void }) {
    const ref = useRef<any>(null);
    const cur = useRef(value);
    const pick = (y: number) => {
        const i = Math.max(0, Math.min(count - 1, Math.round(y / WHEEL_ITEM)));
        if (i !== cur.current) { cur.current = i; Haptics.selectionAsync(); onChange(i); }
    };
    useEffect(() => {
        const t = setTimeout(() => ref.current?.scrollTo({ y: value * WHEEL_ITEM, animated: false }), 60);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => {
        if (cur.current !== value) { cur.current = value; ref.current?.scrollTo({ y: value * WHEEL_ITEM, animated: true }); }
    }, [value]);
    return (
        <View style={styles.wheel}>
            <View pointerEvents="none" style={styles.wheelSel} />
            <ScrollView
                ref={ref}
                style={{ height: WHEEL_ITEM * 3 }}
                showsVerticalScrollIndicator={false}
                snapToInterval={WHEEL_ITEM}
                decelerationRate="fast"
                nestedScrollEnabled
                canCancelContentTouches={false}
                scrollEventThrottle={16}
                onScroll={(e) => pick(e.nativeEvent.contentOffset.y)}
                onMomentumScrollEnd={(e) => pick(e.nativeEvent.contentOffset.y)}
                onScrollEndDrag={(e) => pick(e.nativeEvent.contentOffset.y)}
                contentContainerStyle={{ paddingVertical: WHEEL_ITEM }}
            >
                {Array.from({ length: count }, (_, i) => (
                    <View key={i} style={styles.wheelRow}>
                        <Text style={[styles.wheelText, i === value && styles.wheelTextOn]}>{String(i).padStart(2, '0')}</Text>
                    </View>
                ))}
            </ScrollView>
        </View>
    );
}

type Link = { taskId: number; stageId: number } | null;

interface DetailProps {
    time: number;
    link: Link;
    subtasks: JournalSubtask[];
    nowMinutes: number;
}

/** Time and subtask link in one slim button (time starts at now, link at none). Tap it to open the page. */
function DetailsButton({ time, link, subtasks, nowMinutes, onPress }: DetailProps & { onPress: () => void }) {
    const v = ((Math.round(time) % 1440) + 1440) % 1440;
    const nowV = ((Math.floor(nowMinutes) % 1440) + 1440) % 1440;
    const current = link ? subtasks.find(x => x.taskId === link.taskId && x.stageId === link.stageId) : null;
    const linkText = link ? (current?.text ?? 'Subtask') : 'Day entry';
    return (
        <TouchableOpacity style={styles.timeBtn} activeOpacity={0.85} onPress={() => { Keyboard.dismiss(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}>
            <MaterialIcons name="schedule" size={18} color="rgba(255,255,255,0.7)" />
            <Text style={styles.timeBtnText}>{hhmm(v)}</Text>
            <Text style={styles.timePart}>{v === nowV ? 'NOW' : partOfDay(v)}</Text>
            <View style={styles.detailSep} />
            <MaterialIcons name={link ? 'link' : 'today'} size={16} color={link ? NOTE_COLOR : 'rgba(255,255,255,0.55)'} />
            <Text style={[styles.detailLink, link && { color: NOTE_COLOR }]} numberOfLines={1}>{linkText}</Text>
            <MaterialIcons name="keyboard-arrow-right" size={20} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
    );
}

/** A page inside the journal (not a popup): the time wheels on top, the subtask list below. */
function DetailsPage({ time, link, subtasks, nowMinutes, onTime, onLink, onBack }: DetailProps & { onTime: (t: number) => void; onLink: (l: Link) => void; onBack: () => void }) {
    const v = ((Math.round(time) % 1440) + 1440) % 1440;
    const nowV = ((Math.floor(nowMinutes) % 1440) + 1440) % 1440;
    const h = Math.floor(v / 60);
    const m = v % 60;
    const choose = (l: Link) => { Haptics.selectionAsync(); onLink(l); };
    return (
        <View style={{ flex: 1, gap: 10 }}>
            <View style={styles.editHead}>
                <TouchableOpacity style={styles.closeDome} activeOpacity={0.8} onPress={onBack}>
                    <MaterialIcons name="chevron-left" size={18} color="rgba(255,255,255,0.9)" />
                </TouchableOpacity>
                <Text style={styles.editTitle}>TIME AND LINK</Text>
            </View>

            <View style={styles.popSectionHead}>
                <Text style={styles.label}>TIME</Text>
                <Text style={styles.timePart}>{partOfDay(v)}</Text>
            </View>
            <View style={styles.popWheels}>
                <MiniWheel count={24} value={h} onChange={(nh) => onTime(nh * 60 + m)} />
                <Text style={styles.wheelColon}>:</Text>
                <MiniWheel count={60} value={m} onChange={(nm) => onTime(h * 60 + nm)} />
                <TouchableOpacity style={styles.popNowSmall} activeOpacity={0.85} onPress={() => { Haptics.selectionAsync(); onTime(nowV); }}>
                    <Text style={styles.chipText}>NOW</Text>
                </TouchableOpacity>
            </View>

            <Text style={styles.label}>LINK TO A SUBTASK</Text>
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                <TouchableOpacity style={[styles.linkRow, !link && styles.linkRowOn]} activeOpacity={0.85} onPress={() => choose(null)}>
                    <MaterialIcons name="today" size={18} color={!link ? '#000000' : 'rgba(255,255,255,0.7)'} />
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.linkRowText, !link && { color: '#000000' }]}>No link</Text>
                        <Text style={[styles.linkRowSub, !link && { color: 'rgba(0,0,0,0.6)' }]}>Keep it on the day only</Text>
                    </View>
                    {!link && <MaterialIcons name="check" size={18} color="#000000" />}
                </TouchableOpacity>
                {subtasks.length === 0 && <Text style={styles.linkEmpty}>No subtasks on this day</Text>}
                {subtasks.map(sb => {
                    const on = !!link && link.taskId === sb.taskId && link.stageId === sb.stageId;
                    return (
                        <TouchableOpacity key={`${sb.taskId}:${sb.stageId}`} style={[styles.linkRow, on && styles.linkRowOn]} activeOpacity={0.85} onPress={() => choose({ taskId: sb.taskId, stageId: sb.stageId })}>
                            <MaterialIcons name="link" size={18} color={on ? '#000000' : NOTE_COLOR} />
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={[styles.linkRowText, on && { color: '#000000' }]} numberOfLines={2}>{sb.text}</Text>
                                <Text style={[styles.linkRowSub, on && { color: 'rgba(0,0,0,0.6)' }]} numberOfLines={1}>{sb.taskTitle}</Text>
                            </View>
                            {on && <MaterialIcons name="check" size={18} color="#000000" />}
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

            <TouchableOpacity style={[styles.saveBtn, { flex: 0, alignSelf: 'stretch' }]} activeOpacity={0.85} onPress={onBack}>
                <Text style={styles.saveText}>DONE</Text>
            </TouchableOpacity>
        </View>
    );
}

/** The add / edit card: note or expense, the time, and the optional subtask link. */
function EntryEditor({ draft, subtasks, nowMinutes, keyboardHeight, bottomInset, topInset, onChange, onCancel, onSave, onDelete }: EditorProps) {
    const { height: winH } = useWindowDimensions();
    const [page, setPage] = useState<'form' | 'details'>('form');
    const isEdit = draft.id !== undefined;
    const isExpense = draft.type === 'expense';
    const set = (p: Partial<Draft>) => onChange({ ...draft, ...p });
    const valid = isExpense ? parseFloat(draft.amount) > 0 && draft.text.trim().length > 0 : draft.text.trim().length > 0;
    const bottom = keyboardHeight > 0 ? keyboardHeight : 0;
    const maxH = winH - bottom - topInset - 12;

    return (
        <>
            <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(120)} style={styles.editDim}>
                <Pressable style={{ flex: 1 }} onPress={onCancel} />
            </Animated.View>
            <Animated.View
                entering={FadeIn.duration(160)}
                exiting={FadeOut.duration(120)}
                style={[styles.editCard, { bottom, maxHeight: maxH, paddingBottom: keyboardHeight > 0 ? 12 : Math.max(bottomInset, 12) }, page === 'details' && { height: maxH }]}
            >
                {page === 'details' ? (
                    <DetailsPage
                        time={draft.time}
                        link={draft.link}
                        subtasks={subtasks}
                        nowMinutes={nowMinutes}
                        onTime={(t) => set({ time: t })}
                        onLink={(l) => set({ link: l })}
                        onBack={() => setPage('form')}
                    />
                ) : (
                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                    <View style={styles.editHead}>
                        <View style={styles.socket}>
                            <View style={[styles.sockDome, { backgroundColor: isExpense ? MONEY_COLOR : NOTE_COLOR }]}>
                                <MaterialIcons name={isExpense ? 'payments' : 'edit'} size={12} color="#0A0C10" />
                            </View>
                        </View>
                        <Text style={styles.editTitle}>{isEdit ? (isExpense ? 'EDIT EXPENSE' : 'EDIT NOTE') : (isExpense ? 'NEW EXPENSE' : 'NEW NOTE')}</Text>
                        <View style={{ flex: 1 }} />
                        <TouchableOpacity style={styles.closeDome} activeOpacity={0.8} onPress={onCancel}>
                            <MaterialIcons name="close" size={14} color="rgba(255,255,255,0.85)" />
                        </TouchableOpacity>
                    </View>

                    {!isEdit && (
                        <View style={styles.switchWell}>
                            {(['note', 'expense'] as const).map(t => (
                                <TouchableOpacity
                                    key={t}
                                    activeOpacity={0.85}
                                    style={[styles.switchItem, draft.type === t && styles.switchItemOn]}
                                    onPress={() => { Haptics.selectionAsync(); set({ type: t }); }}
                                >
                                    <Text style={[styles.switchText, draft.type === t && { color: '#000000' }]}>{t === 'note' ? 'NOTE' : 'EXPENSE'}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    {isExpense ? (
                        <>
                            <View style={styles.amountRow}>
                                <Text style={styles.amountCur}>{JOURNAL_CURRENCY}</Text>
                                <TextInput
                                    style={styles.amountInput}
                                    value={draft.amount}
                                    onChangeText={(v) => set({ amount: v.replace(/[^0-9.]/g, '') })}
                                    placeholder="0"
                                    placeholderTextColor="rgba(255,255,255,0.25)"
                                    keyboardType="decimal-pad"
                                    autoFocus={!isEdit}
                                />
                            </View>
                            <Text style={styles.label}>REASON</Text>
                            <TextInput
                                style={styles.field}
                                value={draft.text}
                                onChangeText={(v) => set({ text: v })}
                                placeholder="Why did you spend it?"
                                placeholderTextColor="rgba(255,255,255,0.35)"
                            />
                        </>
                    ) : (
                        <TextInput
                            style={[styles.field, { minHeight: 84, textAlignVertical: 'top', paddingTop: 12 }]}
                            value={draft.text}
                            onChangeText={(v) => set({ text: v })}
                            placeholder="Write a note…"
                            placeholderTextColor="rgba(255,255,255,0.35)"
                            multiline
                            autoFocus={!isEdit}
                        />
                    )}

                    <DetailsButton time={draft.time} link={draft.link} subtasks={subtasks} nowMinutes={nowMinutes} onPress={() => setPage('details')} />

                    <View style={styles.editActions}>
                        {isEdit && onDelete && (
                            <TouchableOpacity style={styles.deleteBtn} activeOpacity={0.85} onPress={onDelete}>
                                <MaterialIcons name="delete-outline" size={18} color="#FF6B6B" />
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={[styles.saveBtn, !valid && { opacity: 0.4 }]} activeOpacity={0.85} disabled={!valid} onPress={onSave}>
                            <Text style={styles.saveText}>{isEdit ? 'UPDATE' : isExpense ? 'SAVE EXPENSE' : 'SAVE NOTE'}</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
                )}
            </Animated.View>
        </>
    );
}

/**
 * Pull-up day journal over the planner, in three stages:
 *   1 a slim handle above the bottom controls (counts only)
 *   2 a half-height list of the day's notes and expenses
 *   3 the full-screen time-wise journal
 * Drag the header to move between them. Entries belong to the day and can be linked to one of its subtasks.
 */
export default function JournalSheet({
    entries, dayKey, todayKey, dayLabel, onPrevDay, onNextDay, onToday, subtasks, dailyStartMinutes, nowMinutes,
    topInset, bottomInset, toggleSignal, keyboardHeight, onStageChange, onAdd, onUpdate, onDelete,
}: JournalSheetProps) {
    const { height: winH } = useWindowDimensions();
    const sheetH = winH - topInset;
    const Y1 = sheetH + 12; // stage 1: closed, fully below the screen
    const Y2 = sheetH - Math.round(winH * 0.55);

    const [stage, setStage] = useState<1 | 2 | 3>(1);
    const [filter, setFilter] = useState<Filter>('all');
    const [draft, setDraft] = useState<Draft | null>(null);
    const ty = useSharedValue(Y1);
    const startY = useSharedValue(Y1);

    const stageRef = useRef<1 | 2 | 3>(1);
    const cbRef = useRef(onStageChange);
    cbRef.current = onStageChange;
    const applyStage = (s: 1 | 2 | 3) => {
        if (stageRef.current === s) return;
        stageRef.current = s;
        setStage(s);
        cbRef.current(s);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };
    const stageY = (s: 1 | 2 | 3) => (s === 3 ? 0 : s === 2 ? Y2 : Y1);
    const goStage = (s: 1 | 2 | 3) => {
        ty.value = withSpring(stageY(s), { damping: 24, stiffness: 240, mass: 0.9 });
        applyStage(s);
    };

    // the journal button in the bottom controls opens (or closes) the sheet
    const lastSignal = useRef(toggleSignal);
    useEffect(() => {
        if (lastSignal.current === toggleSignal) return;
        lastSignal.current = toggleSignal;
        goStage(stageRef.current === 1 ? 2 : 1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [toggleSignal]);

    // a fresh sheet is always at stage 1; tell the screen again when it goes away so the bottom controls come back
    useEffect(() => { cbRef.current(stage); }, [stage]); // keeps the screen in step with the sheet (also after a reload)
    useEffect(() => () => cbRef.current(1), []);

    // heights changed (rotation, insets): settle at the current stage
    useEffect(() => {
        cancelAnimation(ty);
        ty.value = stageY(stageRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [Y1, Y2]);

    const pan = useMemo(() => Gesture.Pan()
        .activeOffsetY([-6, 6])
        .onStart(() => {
            'worklet';
            cancelAnimation(ty);
            startY.value = ty.value;
        })
        .onUpdate((e) => {
            'worklet';
            ty.value = Math.max(0, Math.min(Y1, startY.value + e.translationY));
        })
        .onEnd((e) => {
            'worklet';
            const proj = ty.value + e.velocityY * 0.15;
            const d3 = Math.abs(proj);
            const d2 = Math.abs(proj - Y2);
            const d1 = Math.abs(proj - Y1);
            const target = d3 <= d2 && d3 <= d1 ? 0 : d2 <= d1 ? Y2 : Y1;
            ty.value = withSpring(target, { damping: 24, stiffness: 240, mass: 0.9 });
            runOnJS(applyStage)(target === 0 ? 3 : target === Y2 ? 2 : 1);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [Y1, Y2]);

    const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }));
    const dimStyle = useAnimatedStyle(() => ({ opacity: interpolate(ty.value, [Y2, Y1], [1, 0], Extrapolation.CLAMP) }));
    const bodyStyle = useAnimatedStyle(() => ({ opacity: interpolate(ty.value, [Y1, Y1 - 70], [0, 1], Extrapolation.CLAMP) }));

    const dayEntries = useMemo(() => {
        const list = entries.filter(e => e.day === dayKey);
        const ds = (m: number) => ((((m - dailyStartMinutes) % 1440) + 1440) % 1440);
        return list.sort((a, b) => ds(a.timeMinutes) - ds(b.timeMinutes) || a.createdAt - b.createdAt);
    }, [entries, dayKey, dailyStartMinutes]);

    const notesCount = dayEntries.filter(e => e.type === 'note').length;
    const spent = dayEntries.reduce((s, e) => s + (e.type === 'expense' ? e.amount ?? 0 : 0), 0);
    const spentLinked = dayEntries.reduce((s, e) => s + (e.type === 'expense' && e.taskId !== undefined ? e.amount ?? 0 : 0), 0);
    const shown = dayEntries.filter(e => {
        if (filter === 'note') return e.type === 'note';
        if (filter === 'expense') return e.type === 'expense';
        if (filter === 'day') return e.taskId === undefined;
        if (filter === 'linked') return e.taskId !== undefined;
        return true;
    });

    const linkLabel = (e: JournalEntry) => {
        if (e.taskId === undefined || e.stageId === undefined) return null;
        const s = subtasks.find(x => x.taskId === e.taskId && x.stageId === e.stageId);
        return s ? s.text : 'subtask';
    };

    const openNew = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setDraft({ type: 'note', text: '', amount: '', time: Math.floor(nowMinutes) % 1440, link: null });
    };
    const openEdit = (e: JournalEntry) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setDraft({
            id: e.id,
            type: e.type,
            text: e.text,
            amount: e.amount !== undefined ? String(e.amount) : '',
            time: e.timeMinutes,
            link: e.taskId !== undefined && e.stageId !== undefined ? { taskId: e.taskId, stageId: e.stageId } : null,
            createdAt: e.createdAt,
        });
    };
    const save = () => {
        if (!draft) return;
        const isExpense = draft.type === 'expense';
        const amount = parseFloat(draft.amount);
        if ((isExpense && !(amount > 0)) || !draft.text.trim()) return;
        const base = {
            day: dayKey,
            type: draft.type,
            text: draft.text.trim(),
            amount: isExpense ? Math.round(amount * 100) / 100 : undefined,
            timeMinutes: draft.time,
            taskId: draft.link?.taskId,
            stageId: draft.link?.stageId,
        };
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (draft.id !== undefined) onUpdate({ ...base, id: draft.id, createdAt: draft.createdAt ?? Date.now() });
        else onAdd(base);
        setDraft(null);
    };

    const isToday = dayKey === todayKey;
    const chip = (key: Filter, label: string) => (
        <TouchableOpacity key={key} activeOpacity={0.85} style={[styles.filterChip, filter === key && styles.filterChipOn]} onPress={() => { Haptics.selectionAsync(); setFilter(key); }}>
            <Text style={[styles.filterText, filter === key && { color: '#000000' }]}>{label}</Text>
        </TouchableOpacity>
    );

    return (
        <View style={[StyleSheet.absoluteFill, { zIndex: 80 }]} pointerEvents="box-none">
            <Animated.View pointerEvents={stage >= 2 ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, styles.dim, dimStyle]}>
                <Pressable style={{ flex: 1 }} onPress={() => goStage(1)} />
            </Animated.View>

            <Animated.View style={[styles.sheet, { top: topInset, height: sheetH }, sheetStyle]}>
                <GestureDetector gesture={pan}>
                    <View style={styles.header}>
                        <View style={styles.grab} />
                        <View style={styles.headRow}>
                            {stage === 3 ? (
                                <TouchableOpacity style={styles.dome} activeOpacity={0.8} onPress={() => goStage(2)}>
                                    <MaterialIcons name="keyboard-arrow-down" size={20} color="#FFFFFF" />
                                </TouchableOpacity>
                            ) : (
                                <View style={styles.dome}>
                                    <MaterialIcons name="menu-book" size={15} color="#FFFFFF" />
                                </View>
                            )}
                            <TouchableOpacity
                                style={{ flex: 1, minWidth: 0 }}
                                activeOpacity={0.8}
                                onPress={() => (stage === 2 ? goStage(3) : onToday())}
                            >
                                <Text style={styles.headTitle} numberOfLines={1}>JOURNAL · {dayLabel}</Text>
                                <Text style={styles.headSub} numberOfLines={1}>
                                    {isToday ? 'TODAY' : 'TAP FOR TODAY'}
                                </Text>
                            </TouchableOpacity>
                            {stage > 1 && (
                                <>
                                    <TouchableOpacity style={styles.dome} activeOpacity={0.8} onPress={onPrevDay}>
                                        <MaterialIcons name="chevron-left" size={20} color="#FFFFFF" />
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.dome} activeOpacity={0.8} onPress={onNextDay}>
                                        <MaterialIcons name="chevron-right" size={20} color="#FFFFFF" />
                                    </TouchableOpacity>
                                </>
                            )}
                        </View>
                    </View>
                </GestureDetector>

                <Animated.View style={[{ flex: 1 }, bodyStyle]} pointerEvents={stage >= 2 ? 'auto' : 'none'}>
                    <View style={styles.summary}>
                        <Text style={styles.summaryText}>
                            {notesCount} {notesCount === 1 ? 'note' : 'notes'}
                            <Text style={styles.summaryDot}>   ·   </Text>
                            <Text style={{ color: MONEY_COLOR }}>{money(spent)}</Text> spent
                        </Text>
                    </View>
                    <View style={styles.filters}>
                        {chip('all', 'ALL')}
                        {chip('note', 'NOTES')}
                        {chip('expense', 'SPEND')}
                    </View>

                    <ScrollView
                        style={{ flex: 1 }}
                        contentContainerStyle={{ paddingTop: 6, paddingBottom: Y2 + 120, paddingHorizontal: 14 }}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        {shown.length === 0 && (
                            <View style={styles.empty}>
                                <MaterialIcons name="menu-book" size={30} color="rgba(255,255,255,0.22)" />
                                <Text style={styles.emptyText}>{dayEntries.length === 0 ? 'Nothing written for this day' : 'Nothing matches this filter'}</Text>
                                <Text style={styles.emptySub}>Tap + to add a note or an expense</Text>
                            </View>
                        )}
                        {shown.map((e, i) => {
                            const link = linkLabel(e);
                            const note = e.type === 'note';
                            const color = note ? NOTE_COLOR : MONEY_COLOR;
                            const last = i === shown.length - 1;
                            const blob = /\S{28,}/.test(e.text); // long unbroken text (code, links) is set smaller so it does not dominate
                            return (
                                <TouchableOpacity key={e.id} activeOpacity={0.8} style={styles.tlRow} onPress={() => openEdit(e)}>
                                    <Text style={styles.tlTime}>{hhmm(e.timeMinutes)}</Text>
                                    <View style={styles.tlRail}>
                                        <View style={[styles.tlDot, { backgroundColor: color }]} />
                                        {!last && <View style={styles.tlLine} />}
                                    </View>
                                    <View style={styles.tlBody}>
                                        <View style={styles.tlTop}>
                                            <Text style={[styles.tlText, blob && styles.tlBlob]}>{e.text}</Text>
                                            {!note && <Text style={styles.itemAmt}>{money(e.amount ?? 0)}</Text>}
                                        </View>
                                        {!!link && (
                                            <View style={styles.tlTag}>
                                                <Text style={styles.tlTagText} numberOfLines={1}>↳ {link.toUpperCase()}</Text>
                                            </View>
                                        )}
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </Animated.View>
            </Animated.View>

            {stage >= 2 && !draft && (
                <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} pointerEvents="box-none" style={[styles.fabWrap, { bottom: Math.max(bottomInset, 12) + 14 }]}>
                    <TouchableOpacity style={styles.fab} activeOpacity={0.85} onPress={openNew}>
                        <MaterialIcons name="add" size={26} color="#000000" />
                    </TouchableOpacity>
                </Animated.View>
            )}

            {draft && (
                <EntryEditor
                    draft={draft}
                    subtasks={subtasks}
                    nowMinutes={nowMinutes}
                    keyboardHeight={keyboardHeight}
                    bottomInset={bottomInset}
                    topInset={topInset}
                    onChange={setDraft}
                    onCancel={() => setDraft(null)}
                    onSave={save}
                    onDelete={draft.id !== undefined ? () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); onDelete(draft.id!); setDraft(null); } : undefined}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    dim: { backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: {
        position: 'absolute',
        left: 0,
        right: 0,
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        overflow: 'hidden',
        backgroundColor: '#0B0C0F',
        borderWidth: 1,
        borderBottomWidth: 0,
        borderColor: 'rgba(255,255,255,0.12)',
        boxShadow: '0 -14px 34px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.14)',
    },
    header: { height: PEEK_H, paddingHorizontal: 12, paddingTop: 6 },
    grab: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', marginBottom: 6 },
    headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dome: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1D2128',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        boxShadow: DOME,
    },
    headTitle: { fontSize: 10.5, fontWeight: '800', letterSpacing: 1.6, color: '#FFFFFF' },
    headSub: { marginTop: 1, fontSize: 9, fontWeight: '700', letterSpacing: 0.8, color: 'rgba(255,255,255,0.55)' },
    summary: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 2 },
    summaryText: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
    summaryDot: { color: 'rgba(255,255,255,0.3)' },
    item: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.1)' },
    tlRow: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
    tlTime: { width: 42, paddingTop: 3, textAlign: 'right', fontSize: 12, fontWeight: '800', letterSpacing: 0.3, color: 'rgba(255,255,255,0.65)', fontVariant: ['tabular-nums'] },
    tlRail: { width: 12, alignItems: 'center' },
    tlDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
    tlLine: { flex: 1, width: 2, marginTop: 5, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
    tlBody: { flex: 1, minWidth: 0, paddingBottom: 22 },
    tlTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    tlText: { flex: 1, fontSize: 15, lineHeight: 23, fontWeight: '500', color: '#F1F3F8' },
    tlBlob: { fontSize: 12.5, lineHeight: 19, color: 'rgba(255,255,255,0.6)' },
    tlTag: { alignSelf: 'flex-start', marginTop: 8, maxWidth: '100%', borderRadius: 9, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: 'rgba(91,156,255,0.16)' },
    tlTagText: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.8, color: NOTE_COLOR },
    noteItem: { paddingTop: 12, paddingBottom: 4 },
    noteMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7, paddingLeft: 2 },
    noteTime: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: 'rgba(255,255,255,0.5)' },
    noteBody: {
        borderRadius: 16,
        paddingHorizontal: 15,
        paddingVertical: 13,
        backgroundColor: 'rgba(91,156,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(91,156,255,0.2)',
        borderLeftWidth: 3,
        borderLeftColor: NOTE_COLOR,
    },
    noteText: { fontSize: 15, lineHeight: 23, fontWeight: '500', color: '#EAF1FF' },
    itemTime: { width: 40, fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.45)', paddingTop: 2 },
    itemDot: { width: 7, height: 7, borderRadius: 4, marginTop: 7 },
    itemText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF', lineHeight: 21 },
    itemLink: { marginTop: 3, fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.45)' },
    itemAmt: { fontSize: 15, fontWeight: '800', color: MONEY_COLOR, paddingTop: 1 },
    cells: { flexDirection: 'row', gap: 7, paddingHorizontal: 12, paddingTop: 4 },
    cell: { flex: 1, minWidth: 0, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(0,0,0,0.45)', boxShadow: SUNK },
    cellLabel: { fontSize: 7.5, fontWeight: '800', letterSpacing: 1.2, color: 'rgba(255,255,255,0.5)' },
    cellValue: { fontSize: 15, fontWeight: '900', color: '#FFFFFF', marginTop: 1 },
    filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 12 },
    filterChip: {
        height: 30,
        paddingHorizontal: 16,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    filterChipOn: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
    filterText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.9, color: 'rgba(255,255,255,0.7)' },
    empty: { alignItems: 'center', gap: 8, paddingTop: 90 },
    emptyText: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.55)' },
    emptySub: { fontSize: 12, fontWeight: '500', color: 'rgba(255,255,255,0.35)' },
    row: { flexDirection: 'row', alignItems: 'stretch', gap: 6, marginBottom: 2 },
    rowTime: { width: 38, paddingTop: 15, textAlign: 'right', fontSize: 9.5, fontWeight: '800', color: 'rgba(255,255,255,0.5)' },
    railCol: { width: 18, alignItems: 'center' },
    railLine: { position: 'absolute', top: 0, bottom: 0, width: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.12)' },
    railDot: { marginTop: 17, width: 12, height: 12, borderRadius: 6, backgroundColor: '#0B0C0F', borderWidth: 2 },
    entry: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, borderWidth: 1 },
    entryNote: { backgroundColor: 'rgba(91,156,255,0.10)', borderColor: 'rgba(91,156,255,0.28)' },
    entryExp: { backgroundColor: 'rgba(255,213,79,0.09)', borderColor: 'rgba(255,213,79,0.28)' },
    entryText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF', lineHeight: 18 },
    tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
    tag: { maxWidth: 190, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
    tagDay: { backgroundColor: 'rgba(255,255,255,0.1)' },
    tagLink: { backgroundColor: 'rgba(91,156,255,0.16)' },
    tagText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.8, color: 'rgba(255,255,255,0.75)' },
    entryCat: { fontSize: 8, fontWeight: '800', letterSpacing: 0.8, color: 'rgba(255,255,255,0.4)' },
    entryAmt: { fontSize: 15, fontWeight: '900', color: MONEY_COLOR },
    fabWrap: { position: 'absolute', right: 16 },
    fab: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', boxShadow: WHITE_DOME },

    editDim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 5 },
    editCard: {
        position: 'absolute',
        left: 0,
        right: 0,
        zIndex: 6,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingHorizontal: 14,
        paddingTop: 12,
        backgroundColor: '#0B0C0F',
        borderWidth: 1,
        borderBottomWidth: 0,
        borderColor: 'rgba(255,255,255,0.14)',
        boxShadow: '0 -14px 34px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.14)',
    },
    editHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    editTitle: { fontSize: 10.5, fontWeight: '800', letterSpacing: 1.6, color: '#FFFFFF' },
    socket: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.7)' },
    sockDome: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    closeDome: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    switchWell: { flexDirection: 'row', gap: 3, padding: 3, borderRadius: 16, backgroundColor: '#020203', boxShadow: SUNK },
    switchItem: { flex: 1, height: 32, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    switchItemOn: { backgroundColor: '#FFFFFF', boxShadow: WHITE_DOME },
    switchText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 1.2, color: 'rgba(255,255,255,0.55)' },
    field: {
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 11,
        fontSize: 14,
        fontWeight: '600',
        color: '#FFFFFF',
        backgroundColor: '#020203',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        boxShadow: SUNK,
    },
    amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 2 },
    amountCur: { fontSize: 22, fontWeight: '700', color: 'rgba(255,255,255,0.5)' },
    amountInput: { minWidth: 90, fontSize: 38, fontWeight: '900', color: MONEY_COLOR, textAlign: 'center', padding: 0 },
    chipsRow: { flexDirection: 'row', gap: 6 },
    chip: {
        height: 30,
        paddingHorizontal: 12,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#15171C',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 3px 6px rgba(0,0,0,0.55)',
    },
    chipOn: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
    chipText: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.9, color: 'rgba(255,255,255,0.75)' },
    label: { fontSize: 8, fontWeight: '800', letterSpacing: 1.4, color: 'rgba(255,255,255,0.45)', paddingLeft: 2 },
    timeBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, paddingHorizontal: 14, borderRadius: 16, backgroundColor: '#020203', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', boxShadow: SUNK },
    linkBtnText: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
    linkBtnSub: { marginTop: 1, fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.45)' },
    linkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#020203', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', boxShadow: SUNK },
    linkRowOn: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
    linkRowText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
    linkRowSub: { marginTop: 1, fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.45)' },
    linkEmpty: { textAlign: 'center', paddingVertical: 10, fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.4)' },
    detailSep: { width: 1, height: 20, marginHorizontal: 4, backgroundColor: 'rgba(255,255,255,0.12)' },
    detailLink: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
    popSectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    popNowSmall: { height: 34, paddingHorizontal: 12, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#15171C', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', boxShadow: DOME },
    timeBtnText: { fontSize: 18, fontWeight: '900', color: '#FFFFFF', fontVariant: ['tabular-nums'] },
    popBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
    popCard: { width: 250, borderRadius: 26, padding: 16, gap: 12, backgroundColor: '#0B0C0F', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', boxShadow: '0 18px 44px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.14)' },
    popHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    popTitle: { fontSize: 10.5, fontWeight: '800', letterSpacing: 1.8, color: '#FFFFFF' },
    popWheels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    popActions: { flexDirection: 'row', gap: 10 },
    popNow: { flex: 1, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#15171C', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', boxShadow: DOME },
    popDone: { flex: 1, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', boxShadow: WHITE_DOME },
    wheel: { width: 86, height: WHEEL_ITEM * 3, borderRadius: 18, overflow: 'hidden', backgroundColor: '#020203', boxShadow: SUNK },
    wheelSel: { position: 'absolute', left: 6, right: 6, top: WHEEL_ITEM, height: WHEEL_ITEM, borderRadius: 12, backgroundColor: '#1D2128', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
    wheelRow: { height: WHEEL_ITEM, alignItems: 'center', justifyContent: 'center' },
    wheelText: { fontSize: 18, fontWeight: '600', color: 'rgba(255,255,255,0.35)', fontVariant: ['tabular-nums'] },
    wheelTextOn: { fontSize: 24, fontWeight: '900', color: '#FFFFFF' },
    wheelColon: { fontSize: 26, fontWeight: '800', color: 'rgba(255,255,255,0.5)', marginBottom: 2 },
    timeWell: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 22, paddingHorizontal: 8, paddingVertical: 8, backgroundColor: '#020203', boxShadow: SUNK },
    timeStep: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1D2128', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', boxShadow: DOME },
    timeBig: { fontSize: 32, fontWeight: '900', letterSpacing: 1, color: '#FFFFFF', fontVariant: ['tabular-nums'] },
    timePart: { marginTop: 1, fontSize: 8, fontWeight: '800', letterSpacing: 1.6, color: 'rgba(255,255,255,0.45)' },
    timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    stepDome: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1D2128', boxShadow: DOME },
    timeText: { minWidth: 58, textAlign: 'center', fontSize: 17, fontWeight: '900', color: '#FFFFFF' },
    editActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
    deleteBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: '#15171C', borderWidth: 1, borderColor: 'rgba(255,107,107,0.35)', boxShadow: DOME },
    saveBtn: { flex: 1, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', boxShadow: WHITE_DOME },
    saveText: { fontSize: 11, fontWeight: '800', letterSpacing: 1.8, color: '#000000' },
});
