import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    useWindowDimensions,
    StatusBar,
    ScrollView,
    PanResponder,
    ScrollViewInstance,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
    FadeIn,
    FadeOut,
    SlideInLeft,
    SlideOutLeft,
    ZoomIn,
    ZoomOut,
    Easing,
    Extrapolation,
    SharedValue,
    cancelAnimation,
    interpolate,
    useFrameCallback,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StageStatus } from '../../../constants/data';

import StageActionPopup from './StageActionPopup';

export interface LiveStageItem {
    text: string;
    startTimeMinutes: number;
    durationMinutes: number;
    /** ID of the parent task for filtering. */
    taskId: number;
    /** Remaining time in seconds (descending countdown); display as HH:MM:SS. */
    remainingSeconds: number;
    id?: number;
    status?: StageStatus;
}

/** Stage item for completed/upcoming lists (name, start time, duration only). */
export interface StageInfoItem {
    text: string;
    startTimeMinutes: number;
    durationMinutes: number;
    /** ID of the parent task for filtering. */
    taskId: number;
    id?: number;
    isLate?: boolean;
    isOverdueProcess?: boolean;
}

export interface FullScreenTimerProps {
    visible: boolean;
    onClose: () => void;
    /** Current timer value in seconds (count-up). */
    timerSeconds: number;
    /** Whether the timer is running. */
    isTimerRunning: boolean;
    /** Called when user taps play. */
    onPlay: () => void;
    /** Called when user taps pause. */
    onPause: () => void;
    /** Called when user taps reset (stop and set to 0). */
    onReset: () => void;
    /** Unique list of tasks for the day (id, title, color). */
    tasks?: { id: number; title: string; color?: string }[];
    /** Live stage(s) to show in top right (name, start time, duration, taskId). */
    liveStages?: LiveStageItem[];
    /** Completed stage(s) to show in top left (name, start time, duration, taskId). */
    completedStages?: StageInfoItem[];
    /** Upcoming stage(s) to show in top left (name, start time, duration, taskId). */
    upcomingStages?: StageInfoItem[];
    /** Undone stage(s) to show in top left (name, start time, duration, taskId). */
    undoneStages?: StageInfoItem[];
    /** Timer display colour from Settings (Theme). */
    timerTextColor?: string;
    /** Slider/button accent colour from Settings. */
    sliderButtonColor?: string;
    /** Called when user taps start on an upcoming live stage. */
    onStartStage?: (taskId: number, stageId: number) => void;
    /** Called when user taps complete on a running live stage. */
    onCompleteStage?: (taskId: number, stageId: number) => void;
    /** Called when user taps +5/10/20 to extend duration. */
    onExtendStage?: (taskId: number, stageId: number, minutes: number) => void;
    /** Called when user changes status via popup. */
    onUpdateStageStatus?: (taskId: number, stageId: number, status: StageStatus) => void;
}

function formatTimerHHMMSS(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Format minutes-from-midnight as HH:MM. */
function formatStartTimeHHMM(startTimeMinutes: number): string {
    const totalMins = Math.round(startTimeMinutes) % (24 * 60);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Format duration in minutes as "Xh Ym" or "Xm". */
function formatDuration(durationMinutes: number): string {
    const d = Math.round(durationMinutes);
    if (d < 60) return `${d}m`;
    const h = Math.floor(d / 60);
    const m = d % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
}


// ---- UI-thread animated helpers (driven by shared values, so the JS thread never blocks them) ----

/** Pulsing "live" dot. */
function PulseDot({ pulse, color, active, style }: { pulse: SharedValue<number>; color: string; active: boolean; style?: any }) {
    const anim = useAnimatedStyle(() => ({
        opacity: active ? interpolate(pulse.value, [0, 1], [1, 0.35]) : 0.5,
    }));
    return <Animated.View style={[style, { backgroundColor: color, shadowColor: color }, anim]} />;
}

/** Gently floating wrapper. */
function FloatView({ floatY, style, children }: { floatY: SharedValue<number>; style?: any; children?: React.ReactNode }) {
    const anim = useAnimatedStyle(() => ({ transform: [{ translateY: floatY.value }] }));
    return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/** Slowly rotating ring. */
function SpinView({ spin, style }: { spin: SharedValue<number>; style?: any }) {
    const anim = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
    return <Animated.View style={[style, anim]} />;
}

/** Soft scale "heartbeat". */
function BeatView({ pulse, style, children }: { pulse: SharedValue<number>; style?: any; children?: React.ReactNode }) {
    const anim = useAnimatedStyle(() => ({ transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 1.06]) }] }));
    return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/**
 * Orbit clock for the maximised view: a progress ring for the stage, a dashed track inside it with a glowing dot
 * (and comet trail) that orbits once per minute in step with the real elapsed seconds, and the remaining time on a
 * raised dome that floats gently.
 */
function ClockDial({ size, accent, elapsedSeconds, fraction, started, label, timeText, sub }: {
    size: number; accent: string; elapsedSeconds: number; fraction: number; started: boolean; label: string; timeText: string; sub: string;
}) {
    const R = size / 2;
    const angle = useSharedValue(0);
    const offset = useSharedValue(0);
    const running = useSharedValue(started ? 1 : 0);
    const synced = useRef(false);

    useEffect(() => {
        running.value = started ? 1 : 0;
        // keep the orbiting dot aligned with the stage's real elapsed seconds, but only correct it when it has
        // drifted (re-syncing on every tick makes the dot jitter)
        const target = (elapsedSeconds % 60) - ((Date.now() / 1000) % 60);
        const diff = ((((target - offset.value) % 60) + 90) % 60) - 30;
        if (!synced.current || Math.abs(diff) > 0.7) {
            offset.value = target;
            synced.current = true;
        }
    }, [elapsedSeconds, started, running, offset]);

    useFrameCallback(() => {
        if (running.value === 0) {
            angle.value = 0;
            return;
        }
        const t = (Date.now() / 1000 + offset.value) % 60;
        angle.value = ((t + 60) % 60) / 60 * 360;
    });

    const orbit = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value}deg` }] }));

    const stroke = Math.max(8, Math.round(size * 0.035));
    const ringR = R - stroke / 2 - 8;        // progress ring
    const orbitR = R - stroke - 30;          // dashed track + orbiting dot
    const ringC = 2 * Math.PI * ringR;
    const orbitC = 2 * Math.PI * orbitR;
    const domeSize = (orbitR - 18) * 2;
    const TRAIL = 14;                         // comet trail segments
    const SEG = 4;                            // degrees per segment

    return (
        <View style={{ width: size, height: size, borderRadius: R, backgroundColor: '#0B0C0F', boxShadow: 'inset 0 6px 16px rgba(0,0,0,0.9), 0 1px 0 rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
                <Circle cx={R} cy={R} r={ringR} stroke="#050607" strokeWidth={stroke} fill="none" />
                {fraction > 0.004 && (
                    <Circle
                        cx={R} cy={R} r={ringR}
                        stroke={accent} strokeWidth={stroke} fill="none" strokeLinecap="round"
                        strokeDasharray={`${ringC * Math.min(1, fraction)} ${ringC}`}
                        rotation={-90} origin={`${R}, ${R}`}
                    />
                )}
                <Circle cx={R} cy={R} r={orbitR} stroke="rgba(255,255,255,0.14)" strokeWidth={1.5} strokeDasharray="2 7" fill="none" />
            </Svg>

            {started && (
                <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, orbit]}>
                    {/* comet trail behind the dot */}
                    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
                        {Array.from({ length: TRAIL }, (_, j) => (
                            <Circle
                                key={j}
                                cx={R} cy={R} r={orbitR}
                                stroke="#FFFFFF"
                                strokeOpacity={0.55 * (1 - j / TRAIL)}
                                strokeWidth={3}
                                fill="none"
                                strokeLinecap="round"
                                strokeDasharray={`${(orbitC * SEG) / 360} ${orbitC}`}
                                rotation={-90 - (j + 1) * SEG}
                                origin={`${R}, ${R}`}
                            />
                        ))}
                    </Svg>
                    <View style={{ position: 'absolute', left: R - 6, top: R - orbitR - 6, width: 12, height: 12, borderRadius: 6, backgroundColor: '#FFFFFF', shadowColor: accent, shadowOpacity: 1, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } }} />
                </Animated.View>
            )}

            <View style={{ width: domeSize, height: domeSize, borderRadius: domeSize / 2, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#171B21', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.1), inset 0 -4px 0 rgba(0,0,0,0.4), 0 14px 24px rgba(0,0,0,0.7)' }}>
                <Text style={{ fontSize: 8, fontWeight: '800', letterSpacing: 2.4, color: 'rgba(255,255,255,0.5)' }}>{label}</Text>
                <Text style={{ fontFamily: 'Inter_900Black', fontWeight: '900', fontSize: Math.max(18, domeSize * 0.17), color: '#FFFFFF', letterSpacing: -0.5, fontVariant: ['tabular-nums'] }} numberOfLines={1}>{timeText}</Text>
                <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 1, color: accent }}>{sub}</Text>
            </View>
        </View>
    );
}

/** The front card of the deck: follows the finger, tilts and fades as it leaves. */
function FrontCard({ deckX, floatY, cardW, style, children, panHandlers }: {
    deckX: SharedValue<number>; floatY: SharedValue<number>; cardW: number; style?: any; children?: React.ReactNode; panHandlers: any;
}) {
    const anim = useAnimatedStyle(() => {
        const x = deckX.value;
        return {
            opacity: interpolate(x, [-cardW * 0.7, -cardW * 0.35, 0, cardW * 0.35, cardW * 0.7], [0, 1, 1, 1, 0], Extrapolation.CLAMP),
            transform: [
                { translateX: x },
                { translateY: floatY.value },
                { rotate: `${interpolate(x, [-cardW, 0, cardW], [-8, 0, 8], Extrapolation.CLAMP)}deg` },
            ],
        };
    });
    return <Animated.View {...panHandlers} style={[style, anim]}>{children}</Animated.View>;
}

/** Full card behind the front card; grows into place as the front card leaves (dir: -1 next / +1 previous). */
function IncomingCard({ deckX, floatY, cardW, dir, style, children }: {
    deckX: SharedValue<number>; floatY: SharedValue<number>; cardW: number; dir: 1 | -1; style?: any; children?: React.ReactNode;
}) {
    const anim = useAnimatedStyle(() => {
        const x = deckX.value;
        const p = dir === -1
            ? interpolate(x, [-cardW * 0.7, 0], [1, 0], Extrapolation.CLAMP)
            : interpolate(x, [0, cardW * 0.7], [0, 1], Extrapolation.CLAMP);
        return {
            opacity: interpolate(p, [0, 0.2, 1], [0, 1, 1]),
            transform: [
                { translateY: floatY.value + interpolate(p, [0, 1], [10, 0]) },
                { scale: interpolate(p, [0, 1], [0.94, 1]) },
            ],
        };
    });
    return <Animated.View pointerEvents="none" style={[style, anim]}>{children}</Animated.View>;
}

/** Strip peeking above the front card; moves forward as the front card leaves. */
function PeekWrap({ deckX, cardW, k, strip, style, children }: {
    deckX: SharedValue<number>; cardW: number; k: number; strip: number; style?: any; children?: React.ReactNode;
}) {
    const anim = useAnimatedStyle(() => {
        const p = interpolate(deckX.value, [-cardW * 0.7, 0], [1, 0], Extrapolation.CLAMP);
        return {
            transform: [
                { translateY: p * strip },
                { scaleX: 1 + p * (0.06 / (1 - 0.06 * k)) },
            ],
        };
    });
    return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

export default function FullScreenTimer({
    visible,
    onClose,
    timerSeconds,
    isTimerRunning,
    onPlay,
    onPause,
    onReset,
    liveStages = [],
    completedStages = [],
    upcomingStages = [],
    undoneStages = [],
    tasks = [],
    timerTextColor = '#FFFFFF',
    sliderButtonColor = '#FFFFFF',
    onStartStage,
    onCompleteStage,
    onExtendStage,
    onUpdateStageStatus,
}: FullScreenTimerProps) {
    const { width, height } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const isLandscape = width > height;

    // rotating the phone: the new layout fades and settles in instead of jumping
    const orientAnim = useSharedValue(1);
    const orientStyle = useAnimatedStyle(() => ({
        opacity: 0.2 + 0.8 * orientAnim.value,
        transform: [{ scale: 0.985 + 0.015 * orientAnim.value }],
    }));
    const lastLandscape = useRef(isLandscape);
    useEffect(() => {
        if (lastLandscape.current === isLandscape) return;
        lastLandscape.current = isLandscape;
        orientAnim.value = 0;
        orientAnim.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) });
    }, [isLandscape, orientAnim]);

    const [focusedStageId, setFocusedStageId] = useState<number | null>(null);

    // Active stage: the focused one, falling back to the first live stage
    const activeStage = useMemo(() => {
        if (liveStages.length === 0) return null;
        if (focusedStageId !== null) {
            const found = liveStages.find(s => s.id === focusedStageId);
            if (found) return found;
        }
        return liveStages[0];
    }, [liveStages, focusedStageId]);

    useEffect(() => {
        if (activeStage && activeStage.id !== undefined && activeStage.id !== focusedStageId) {
            if (focusedStageId === null || !liveStages.some(s => s.id === focusedStageId)) {
                setFocusedStageId(activeStage.id);
            }
        }
    }, [activeStage, focusedStageId, liveStages]);

    const [selectedTaskId, setSelectedTaskId] = useState<number | 'ALL'>('ALL');
    const byTask = <T extends { taskId: number }>(list: T[]) =>
        selectedTaskId === 'ALL' ? list : list.filter(s => s.taskId === selectedTaskId);
    const filteredCompleted = byTask(completedStages);
    const filteredUpcoming = byTask(upcomingStages);
    const filteredUndone = byTask(undoneStages);

    // Stages drawer (slides in from the left edge)
    type DrawerTab = 'done' | 'up' | 'undone';
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerTab, setDrawerTab] = useState<DrawerTab>('up');
    const openDrawer = (tab?: DrawerTab) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (tab) setDrawerTab(tab);
        setDrawerOpen(true);
    };
    useEffect(() => {
        if (!visible) setDrawerOpen(false);
    }, [visible]);

    const [statusPopupVisible, setStatusPopupVisible] = useState(false);
    const [statusPopupPosition, setStatusPopupPosition] = useState({ x: 0, y: 0 });
    const [statusPopupStage, setStatusPopupStage] = useState<{ taskId: number, stageId: number, currentStatus: StageStatus } | null>(null);

    const openStatusPopup = (
        event: any,
        stage: { taskId: number; id?: number },
        currentStatus: StageStatus
    ) => {
        if (stage.id === undefined) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const { pageX, pageY } = event.nativeEvent;
        setStatusPopupPosition({ x: pageX, y: pageY });
        setStatusPopupStage({ taskId: stage.taskId, stageId: stage.id, currentStatus });
        setStatusPopupVisible(true);
    };

    const handlePlay = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (activeStage && activeStage.status === 'Upcoming' && onStartStage && activeStage.id !== undefined) {
            onStartStage(activeStage.taskId, activeStage.id!);
        } else {
            onPlay();
        }
    };

    const handleCancel = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onClose();
    };

    // Next upcoming stage that is not the one on screen
    const nextStage = upcomingStages.find(s => s.id === undefined || s.id !== activeStage?.id) ?? null;
    const sidePad = Math.max(insets.left, insets.right, 20);

    // ---- deck (parallel stages as a stack of cards) ----
    const activeIndex = activeStage ? Math.max(0, liveStages.findIndex(s => s.id === activeStage.id)) : 0;
    const runningCount = liveStages.filter(s => s.status === 'Process').length;
    const deckTitle = runningCount > 1
        ? `${runningCount} RUNNING IN PARALLEL`
        : runningCount === 1 ? '1 RUNNING' : liveStages.length > 0 ? 'READY TO START' : 'NO ACTIVE STAGE';

    const deckX = useSharedValue(0);
    const floatY = useSharedValue(0);
    const pulse = useSharedValue(0);
    const spin = useSharedValue(0);
    // While a swipe commits, the incoming card is frozen on the layer behind the front card so the swap is seamless
    const [heldId, setHeldId] = useState<number | null>(null);
    const dimsRef = useRef({ cardW: 400 });

    useEffect(() => {
        if (!visible) return;
        floatY.value = withRepeat(withSequence(
            withTiming(-6, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
            withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        ), -1, false);
        pulse.value = withRepeat(withSequence(
            withTiming(1, { duration: 800, easing: Easing.inOut(Easing.quad) }),
            withTiming(0, { duration: 800, easing: Easing.inOut(Easing.quad) }),
        ), -1, false);
        spin.value = withRepeat(withTiming(1, { duration: 16000, easing: Easing.linear }), -1, false);
        return () => {
            cancelAnimation(floatY);
            cancelAnimation(pulse);
            cancelAnimation(spin);
        };
    }, [visible, floatY, pulse, spin]);

    // The incoming card is already fully visible underneath: freeze it, swap the data,
    // and only then reset the (invisible) front card (see the effect below)
    const commitSwap = (dir: 1 | -1) => {
        const next = (activeIndex + dir + liveStages.length) % liveStages.length;
        const id = liveStages[next]?.id;
        if (id === undefined) {
            deckX.value = 0;
            return;
        }
        setHeldId(id);
        setFocusedStageId(id);
    };

    const stepDeck = (dir: 1 | -1) => {
        if (liveStages.length < 2) {
            deckX.value = withSpring(0, { damping: 14, stiffness: 220 });
            return;
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        // the front card flies off while the cards behind it move forward (all on the UI thread)
        deckX.value = withTiming(-dir * dimsRef.current.cardW * 0.7, { duration: 200, easing: Easing.out(Easing.cubic) }, (finished) => {
            if (finished) runOnJS(commitSwap)(dir);
        });
    };
    const stepRef = useRef(stepDeck);
    stepRef.current = stepDeck;
    const deckPan = useRef(PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderGrant: () => cancelAnimation(deckX),
        onPanResponderMove: (_, g) => { deckX.value = g.dx; },
        onPanResponderRelease: (_, g) => {
            const far = Math.abs(g.dx) > dimsRef.current.cardW * 0.2 || Math.abs(g.vx) > 0.55;
            if (far && g.dx !== 0) stepRef.current(g.dx < 0 ? 1 : -1);
            else deckX.value = withSpring(0, { damping: 15, stiffness: 240, velocity: g.vx * 1000 });
        },
        onPanResponderTerminate: () => { deckX.value = withSpring(0, { damping: 15, stiffness: 240 }); },
    })).current;

    useEffect(() => {
        if (heldId !== null && activeStage?.id === heldId) {
            cancelAnimation(deckX);
            deckX.value = 0;
            setHeldId(null);
        }
    }, [heldId, activeStage?.id, deckX]);

    // Single accent per card: the task colour, else amber while running / grey while waiting
    const accentFor = (stage: LiveStageItem) =>
        tasks.find(t => t.id === stage.taskId)?.color || (stage.status === 'Process' ? '#FFB74D' : '#9AA1AE');

    // Maximised (full-screen) card
    const [maxId, setMaxId] = useState<number | null>(null);
    const maxStage = maxId !== null ? liveStages.find(s => s.id === maxId) ?? null : null;
    const maxScrollRef = useRef<ScrollViewInstance>(null);
    const maxPageRef = useRef(0);
    const maxIndex = maxStage ? liveStages.findIndex(s => s.id === maxStage.id) : -1;
    useEffect(() => {
        if (maxIndex >= 0) maxPageRef.current = maxIndex;
    }, [maxIndex]);
    useEffect(() => {
        // the maximised stage finished: move to a neighbouring running stage, or close when none are left
        if (maxId !== null && !maxStage) {
            const fallback = liveStages[Math.min(maxPageRef.current, liveStages.length - 1)];
            if (fallback?.id !== undefined) {
                setMaxId(fallback.id);
                setFocusedStageId(fallback.id);
            } else {
                setMaxId(null);
            }
        }
    }, [maxId, maxStage, liveStages]);
    useEffect(() => {
        // keep the pager on the right page (stage removed, rotation)
        if (maxIndex >= 0) maxScrollRef.current?.scrollTo({ x: maxIndex * width, y: 0, animated: false });
    }, [maxIndex, width]);
    useEffect(() => {
        if (!visible) setMaxId(null);
    }, [visible]);
    const openMax = (stage: LiveStageItem) => {
        if (stage.id === undefined) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setFocusedStageId(stage.id);
        setMaxId(stage.id);
    };
    const endsAt = (stage: LiveStageItem) => formatStartTimeHHMM(stage.startTimeMinutes + stage.durationMinutes);

    // Other running stages peek out above the front card with their own remaining time
    const STRIP = 32;
    const peekCount = Math.min(2, Math.max(0, liveStages.length - 1));
    const peekStages = Array.from({ length: peekCount }, (_, i) => liveStages[(activeIndex + 1 + i) % liveStages.length]);
    const cardW = Math.min(width - 2 * sidePad - (isLandscape ? 150 : 0), isLandscape ? 560 : 420);
    // portrait spends extra height on the wrapped top bar, the stacked bottom bar and the pager caption
    const heroAvail = height - Math.max(insets.top, 14) - Math.max(insets.bottom, 14) - (isLandscape ? 138 : 252);
    const cardH = isLandscape
        ? Math.max(180, Math.min(290, heroAvail - STRIP * peekCount))
        : Math.max(400, Math.min(560, heroAvail - STRIP * peekCount));
    dimsRef.current.cardW = cardW;
    const dialSize = isLandscape ? Math.min(cardH - 48, 230) : Math.min(270, cardW - 64, Math.round(cardH * 0.52));

    // ---- building blocks ----
    const renderDome = (onPress: () => void, icon: string, size: number) => (
        <View style={[styles.domeSocket, { width: size + 10, height: size + 10, borderRadius: (size + 10) / 2 }]}>
            <TouchableOpacity
                style={[styles.dome, { width: size, height: size, borderRadius: size / 2 }]}
                onPress={onPress}
                activeOpacity={0.7}
            >
                <MaterialIcons name={icon as any} size={size * 0.46} color="rgba(255,255,255,0.92)" />
            </TouchableOpacity>
        </View>
    );

    const renderPrimaryPill = (text: string, colors: [string, string], textColor: string, onPress: () => void, stretch = false) => (
        <View style={[styles.pillSocket, stretch && { alignSelf: 'stretch' }]}>
            <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.pillTouch}>
                <LinearGradient colors={colors} style={[styles.pill, stretch && { width: '100%', height: 52 }]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}>
                    <Text style={[styles.pillText, { color: textColor }]}>{text}</Text>
                </LinearGradient>
            </TouchableOpacity>
        </View>
    );

    const renderExtendButton = (mins: number, stage: LiveStageItem | null = activeStage, wide = false) => (
        <TouchableOpacity
            key={`+${mins}`}
            style={[styles.extendDome, wide && styles.extendDomeWide]}
            activeOpacity={0.7}
            onPress={() => {
                if (!stage || stage.id === undefined || !onExtendStage) return;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onExtendStage(stage.taskId, stage.id, mins);
            }}
        >
            <Text style={styles.extendText}>+{mins}</Text>
        </TouchableOpacity>
    );

    const renderCountChip = (label: string, count: number, color: string, tab: DrawerTab) => (
        <TouchableOpacity key={label} style={[styles.countChip, !isLandscape && styles.countChipPortrait]} onPress={() => openDrawer(tab)} activeOpacity={0.7}>
            <View style={[styles.countDot, { backgroundColor: color }]} />
            <Text style={styles.countLabel}>{label}</Text>
            <Text style={styles.countValue}>{count}</Text>
        </TouchableOpacity>
    );

    const renderDial = (size: number, fraction: number, accent: string, label: string, timeText: string, sub: string) => {
        const stroke = Math.round(size * 0.075);
        const r = (size - stroke) / 2 - 4;
        const c = size / 2;
        const circ = 2 * Math.PI * r;
        const inner = size - 2 * (stroke + 12);
        return (
            <View style={[styles.dialSocket, { width: size, height: size, borderRadius: size / 2 }]}>
                <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
                    <Circle cx={c} cy={c} r={r} stroke="#050607" strokeWidth={stroke} fill="none" />
                    {fraction > 0.004 && (
                        <Circle
                            cx={c} cy={c} r={r}
                            stroke={accent} strokeWidth={stroke} fill="none" strokeLinecap="round"
                            strokeDasharray={`${circ * Math.min(1, fraction)} ${circ}`}
                            rotation={-90} origin={`${c}, ${c}`}
                        />
                    )}
                </Svg>
                <View style={[styles.dialInner, { width: inner, height: inner, borderRadius: inner / 2 }]}>
                    <Text style={styles.dialLabel}>{label}</Text>
                    <Text style={[styles.dialTime, { fontSize: Math.max(16, inner * 0.17) }]} numberOfLines={1}>{timeText}</Text>
                    <Text style={[styles.dialSub, { color: accent }]}>{sub}</Text>
                </View>
            </View>
        );
    };

    const heldStage = heldId !== null ? liveStages.find(s => s.id === heldId) ?? null : null;
    const nextLayerStage = heldStage ?? liveStages[(activeIndex + 1) % Math.max(1, liveStages.length)];
    const prevLayerStage = heldStage ?? liveStages[(activeIndex - 1 + liveStages.length) % Math.max(1, liveStages.length)];

    // Full card that sits behind the front card and grows into place as the front card leaves
    const renderIncoming = (stage: LiveStageItem | undefined, dir: 1 | -1, key: string) => {
        if (!stage) return null;
        return (
            <IncomingCard
                key={`incoming-${key}`}
                deckX={deckX}
                floatY={floatY}
                cardW={cardW}
                dir={dir}
                style={[
                    styles.deckCard,
                    {
                        position: 'absolute',
                        top: STRIP * peekCount,
                        width: cardW,
                        height: cardH,
                        borderColor: accentFor(stage) + '66',
                        shadowColor: accentFor(stage),
                    },
                ]}
            >
                {renderDeckCard(stage)}
            </IncomingCard>
        );
    };

    const renderPeekStrip = (stage: LiveStageItem, k: number) => {
        const accent = accentFor(stage);
        const started = stage.status !== 'Upcoming';
        const total = Math.max(1, Math.round(stage.durationMinutes * 60));
        const remaining = started ? Math.max(0, stage.remainingSeconds) : total;
        const pct = started ? Math.round(Math.min(1, Math.max(0, (total - remaining) / total)) * 100) : 0;
        return (
            <PeekWrap
                key={`peek-${stage.id ?? k}`}
                deckX={deckX}
                cardW={cardW}
                k={k}
                strip={STRIP}
                style={{
                    position: 'absolute',
                    alignSelf: 'center',
                    width: cardW * (1 - 0.06 * k),
                    height: cardH,
                    top: (peekCount - k) * STRIP,
                }}
            >
                <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => openMax(stage)}
                    style={[styles.peekStrip, { position: 'relative', width: '100%', height: '100%', borderColor: accent + '44' }]}
                >
                    <View style={[styles.peekDot, { backgroundColor: accent, opacity: started ? 1 : 0.5 }]} />
                    <Text style={styles.peekName} numberOfLines={1}>{stage.text}</Text>
                    <Text style={styles.peekPct}>{started ? `${pct}%` : 'READY'}</Text>
                    <View style={styles.peekTimeWell}>
                        <Text style={[styles.peekTime, { color: started ? '#FFFFFF' : 'rgba(255,255,255,0.6)' }]}>{formatTimerHHMMSS(remaining)}</Text>
                    </View>
                </TouchableOpacity>
            </PeekWrap>
        );
    };

    const renderDeckCard = (stage: LiveStageItem) => {
        const accent = accentFor(stage);
        const started = stage.status !== 'Upcoming';
        const total = Math.max(1, Math.round(stage.durationMinutes * 60));
        const remaining = started ? Math.max(0, stage.remainingSeconds) : total;
        const fraction = started ? Math.min(1, Math.max(0, (total - remaining) / total)) : 0;
        const taskTitle = tasks.find(t => t.id === stage.taskId)?.title;
        return (
            <>
                <TouchableOpacity activeOpacity={0.96} onPress={() => openMax(stage)} style={styles.cardTouch}>
                <View style={isLandscape ? styles.cardRow : styles.cardCol}>
                    {renderDial(dialSize, fraction, accent, started ? 'REMAINING' : 'DURATION', formatTimerHHMMSS(remaining), started ? `${Math.round(fraction * 100)}%` : 'READY')}
                    <View style={[styles.cardInfo, !isLandscape && styles.cardInfoPortrait]}>
                        <View style={[styles.cardHead, !isLandscape && { justifyContent: 'center' }]}>
                            <PulseDot pulse={pulse} color={accent} active={started} style={styles.liveDot} />
                            <Text style={[styles.cardName, !isLandscape && { flex: 0, flexShrink: 1, fontSize: 22 }]} numberOfLines={1}>{stage.text}</Text>
                            {!!taskTitle && (
                                <View style={styles.cardChip}>
                                    <Text style={[styles.cardChipText, { color: accent }]} numberOfLines={1}>{taskTitle.toUpperCase()}</Text>
                                </View>
                            )}
                        </View>
                        <Text style={[styles.cardSub, !isLandscape && { textAlign: 'center', fontSize: 12 }]}>of {formatDuration(stage.durationMinutes)} · ends {endsAt(stage)}</Text>
                        <View style={styles.progressTrack}>
                            <View style={[styles.progressFill, { width: `${fraction * 100}%`, backgroundColor: accent, shadowColor: accent }]} />
                        </View>
                        <View style={[styles.actionsRow, !isLandscape && styles.actionsRowPortrait]}>
                            {stage.status === 'Upcoming' && onStartStage && stage.id !== undefined &&
                                renderPrimaryPill('START', ['#FFD83A', '#E6B800'], '#1A1400', () => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                    onStartStage(stage.taskId, stage.id!);
                                }, !isLandscape)}
                            {stage.status === 'Process' && onCompleteStage && stage.id !== undefined && (
                                <>
                                    {renderPrimaryPill('DONE', ['#7BE18A', '#45C45A'], '#06200C', () => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                                        onCompleteStage(stage.taskId, stage.id!);
                                    }, !isLandscape)}
                                    {onExtendStage && (
                                        <View style={[styles.extendRow, !isLandscape && styles.extendRowPortrait]}>
                                            {!isLandscape && <Text style={styles.extendLabel}>EXTEND</Text>}
                                            {[5, 10, 20].map(m => renderExtendButton(m, stage, !isLandscape))}
                                        </View>
                                    )}
                                </>
                            )}
                        </View>
                    </View>
                </View>
                </TouchableOpacity>
            </>
        );
    };

    // One page of the maximised pager (orbit clock + details for a single stage)
    const renderMaxPage = (stage: LiveStageItem, pagePadBottom: number) => {
        const accent = accentFor(stage);
        const started = stage.status !== 'Upcoming';
        const total = Math.max(1, Math.round(stage.durationMinutes * 60));
        const remaining = started ? Math.max(0, stage.remainingSeconds) : total;
        const elapsed = started ? Math.max(0, total - remaining) : 0;
        const fraction = started ? Math.min(1, elapsed / total) : 0;
        const taskTitle = tasks.find(t => t.id === stage.taskId)?.title;
        const avail = height - Math.max(insets.top, 14) - pagePadBottom - 44 - 20;
        const dialMax = isLandscape
            ? Math.max(160, Math.min(avail, width * 0.42, 340))
            : Math.max(160, Math.min(width - 2 * sidePad, avail - 250, 320));
        return (
            <View
                key={`maxpage-${stage.id}`}
                style={{ width, height, paddingTop: Math.max(insets.top, 14), paddingBottom: pagePadBottom, paddingLeft: sidePad, paddingRight: sidePad }}
            >
                <View style={styles.topBar}>
                    {renderDome(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMaxId(null); }, 'fullscreen-exit', 34)}
                    <View style={styles.titleWrap}>
                        <View style={styles.titleRow}>
                            <PulseDot pulse={pulse} color={accent} active={started} style={styles.liveDot} />
                            <Text style={[styles.title, { color: '#FFFFFF' }]} numberOfLines={1}>{stage.text.toUpperCase()}</Text>
                        </View>
                    </View>
                    {!!taskTitle && (
                        <View style={styles.cardChip}>
                            <Text style={[styles.cardChipText, { color: accent }]} numberOfLines={1}>{taskTitle.toUpperCase()}</Text>
                        </View>
                    )}
                </View>

                <View style={[styles.maxBody, isLandscape ? { flexDirection: 'row' } : { flexDirection: 'column' }]}>
                    <ClockDial
                        size={dialMax}
                        accent={accent}
                        elapsedSeconds={elapsed}
                        fraction={fraction}
                        started={started}
                        label={started ? 'REMAINING' : 'DURATION'}
                        timeText={formatTimerHHMMSS(remaining)}
                        sub={started ? `${Math.round(fraction * 100)}%` : 'READY'}
                    />
                    <View style={[styles.maxInfo, isLandscape ? { flex: 1 } : { alignSelf: 'stretch' }]}>
                        <Text style={styles.maxName} numberOfLines={2}>{stage.text}</Text>
                        <Text style={[styles.maxSub, { color: accent }]}>of {formatDuration(stage.durationMinutes)} · ends {endsAt(stage)}</Text>
                        <View>
                            <View style={styles.progressTrack}>
                                <View style={[styles.progressFill, { width: `${fraction * 100}%`, backgroundColor: accent, shadowColor: accent }]} />
                            </View>
                            <View style={styles.maxProgressLabels}>
                                <Text style={styles.maxProgressLabel}>{formatTimerHHMMSS(elapsed)} ELAPSED</Text>
                                <Text style={styles.maxProgressLabel}>{formatTimerHHMMSS(total)} TOTAL</Text>
                            </View>
                        </View>
                        <View style={styles.actionsRow}>
                            {stage.status === 'Upcoming' && onStartStage && stage.id !== undefined &&
                                renderPrimaryPill('START', ['#FFD83A', '#E6B800'], '#1A1400', () => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                    onStartStage(stage.taskId, stage.id!);
                                })}
                            {stage.status === 'Process' && onCompleteStage && stage.id !== undefined && (
                                <>
                                    {renderPrimaryPill('DONE', ['#7BE18A', '#45C45A'], '#06200C', () => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                                        onCompleteStage(stage.taskId, stage.id!);
                                    })}
                                    {onExtendStage && <View style={styles.extendRow}>{[5, 10, 20].map(m => renderExtendButton(m, stage))}</View>}
                                </>
                            )}
                        </View>
                    </View>
                </View>
            </View>
        );
    };

    // Maximised view: swipe (scroll) sideways to move between the stages running in parallel
    const renderMaximised = (_stage: LiveStageItem) => {
        const multi = liveStages.length > 1;
        const pagePadBottom = Math.max(insets.bottom, 14);
        return (
            <Animated.View entering={ZoomIn.duration(240)} exiting={ZoomOut.duration(180)} style={[StyleSheet.absoluteFill, styles.maxWrap]}>
                <ScrollView
                    ref={maxScrollRef}
                    horizontal
                    pagingEnabled
                    scrollEnabled={multi}
                    showsHorizontalScrollIndicator={false}
                    decelerationRate="fast"
                    contentOffset={{ x: Math.max(0, maxIndex) * width, y: 0 }}
                    onLayout={() => {
                        maxScrollRef.current?.scrollTo({ x: Math.max(0, maxIndex) * width, y: 0, animated: false });
                    }}
                    onMomentumScrollEnd={(e) => {
                        const i = Math.round(e.nativeEvent.contentOffset.x / width);
                        const next = liveStages[i];
                        if (!next || next.id === undefined || i === maxPageRef.current) return;
                        maxPageRef.current = i;
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setMaxId(next.id);
                        setFocusedStageId(next.id);
                    }}
                >
                    {liveStages.map(st => renderMaxPage(st, pagePadBottom))}
                </ScrollView>

            </Animated.View>
        );
    };

    const renderEmptyDeck = () => {
        const hasAny = completedStages.length + upcomingStages.length + undoneStages.length > 0;
        return (
            <View style={{ width: cardW, height: cardH + 30, paddingTop: 30 }}>
                <View style={[styles.ghostCard, { width: cardW * 0.84, top: 0, opacity: 0.5 }]} />
                <View style={[styles.ghostCard, { width: cardW * 0.92, top: 14, opacity: 0.8 }]} />
                <FloatView floatY={floatY} style={[styles.deckCard, styles.emptyCard, { width: cardW, height: cardH }]}>
                    <View style={styles.emptyOrbitWrap}>
                        <SpinView spin={spin} style={styles.emptyOrbit} />
                        <BeatView pulse={pulse} style={styles.emptyDomeSocket}>
                            <View style={styles.emptyDome}>
                                <MaterialIcons name="hourglass-empty" size={30} color="rgba(255,255,255,0.8)" />
                            </View>
                        </BeatView>
                    </View>
                    <Text style={styles.emptyTitle}>NOTHING RUNNING</Text>
                    <Text style={styles.emptySub}>
                        {nextStage
                            ? 'Start something from your queue and it will appear here.'
                            : hasAny ? 'Everything is wrapped up for now.' : 'No stages scheduled for this day.'}
                    </Text>
                    {nextStage && (
                        <View style={styles.emptyNext}>
                            <Text style={styles.nextLabel}>UP NEXT</Text>
                            <Text style={styles.nextName} numberOfLines={1}>{nextStage.text}</Text>
                            <Text style={styles.nextTime}>{formatStartTimeHHMM(nextStage.startTimeMinutes)}</Text>
                        </View>
                    )}
                    {hasAny && (
                        <TouchableOpacity style={styles.emptyBtn} onPress={() => openDrawer(nextStage ? 'up' : completedStages.length > 0 ? 'done' : 'undone')} activeOpacity={0.8}>
                            <Text style={styles.emptyBtnText}>VIEW STAGES</Text>
                        </TouchableOpacity>
                    )}
                </FloatView>
            </View>
        );
    };

    // ---- drawer rows ----
    const ROW_BG = { done: '#17301D', up: '#2C3038', undone: '#3A1D22' } as const;
    const renderRow = (kind: DrawerTab, stage: StageInfoItem, index: number) => {
        const overdue = kind === 'done' && stage.isOverdueProcess;
        const nameColor = overdue ? '#FFCC00' : kind === 'done' ? '#9FE8AC' : kind === 'undone' ? '#FFA0A0' : 'rgba(255,255,255,0.88)';
        const chipColor = overdue ? '#FFCC00' : kind === 'done' ? '#7BE18A' : kind === 'undone' ? '#FF8A8A' : (stage.isLate ? '#FF8A8A' : '#FFCC00');
        const chipBg = kind === 'done' && !overdue ? 'rgba(0,0,0,0.32)' : 'rgba(0,0,0,0.38)';
        const status: StageStatus = overdue ? 'Process' : kind === 'undone' ? 'Undone' : 'Upcoming';
        const tappable = kind !== 'done' || overdue;
        return (
            <View key={`${kind}-${stage.id ?? index}-${index}`} style={[styles.row, { backgroundColor: ROW_BG[kind] }]}>
                <Text style={[styles.rowName, { color: nameColor }]} numberOfLines={1}>{stage.text}</Text>
                {tappable ? (
                    <TouchableOpacity
                        style={[styles.rowChip, { backgroundColor: chipBg }]}
                        onPress={(e) => openStatusPopup(e, stage, status)}
                        activeOpacity={0.7}
                    >
                        <Text style={[styles.rowChipText, { color: chipColor }]}>{formatStartTimeHHMM(stage.startTimeMinutes)}</Text>
                    </TouchableOpacity>
                ) : (
                    <View style={[styles.rowChip, { backgroundColor: chipBg }]}>
                        <Text style={[styles.rowChipText, { color: chipColor }]}>{formatStartTimeHHMM(stage.startTimeMinutes)}</Text>
                    </View>
                )}
                <Text style={[styles.rowDur, { color: nameColor }]}>{formatDuration(stage.durationMinutes)}</Text>
            </View>
        );
    };

    const drawerData: Record<DrawerTab, StageInfoItem[]> = { done: filteredCompleted, up: filteredUpcoming, undone: filteredUndone };
    const drawerWidth = Math.min(isLandscape ? 440 : width - 24, width - 40);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            statusBarTranslucent
            supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
            onRequestClose={() => (maxId !== null ? setMaxId(null) : drawerOpen ? setDrawerOpen(false) : onClose())}
        >
            <StatusBar hidden />
            <Animated.View style={[styles.container, { width, height, paddingTop: Math.max(insets.top, 14), paddingBottom: Math.max(insets.bottom, 14), paddingLeft: sidePad, paddingRight: sidePad }, orientStyle]}>

                {/* Top bar: close · stage name · status counts */}
                <View style={[styles.topBar, !isLandscape && styles.topBarPortrait]}>
                    {renderDome(handleCancel, 'close', 34)}
                    <View style={styles.titleWrap}>
                        <View style={styles.titleRow}>
                            <PulseDot pulse={pulse} color={runningCount > 0 ? '#FFB74D' : '#9AA1AE'} active={runningCount > 0} style={styles.liveDot} />
                            <Text style={styles.title} numberOfLines={1}>{deckTitle}</Text>
                        </View>
                    </View>
                    <View style={[styles.countsRow, !isLandscape && styles.countsRowPortrait]}>
                        {renderCountChip('DONE', filteredCompleted.length, '#7BE18A', 'done')}
                        {renderCountChip('LEFT', filteredUpcoming.length, '#9AA1AE', 'up')}
                        {renderCountChip('UNDONE', filteredUndone.length, '#FF8A8A', 'undone')}
                    </View>
                </View>

                {/* Hero: stacked deck of running stages */}
                <View style={styles.hero}>
                    {liveStages.length === 0 || !activeStage ? renderEmptyDeck() : (
                        <>
                            <View style={styles.deckRow}>
                                {isLandscape && liveStages.length > 1 && (
                                    <TouchableOpacity style={styles.swipeHint} onPress={() => stepDeck(-1)} activeOpacity={0.7}>
                                        <MaterialIcons name="chevron-left" size={22} color="rgba(255,255,255,0.6)" />
                                        <Text style={styles.swipeText}>SWIPE</Text>
                                    </TouchableOpacity>
                                )}
                                <View style={{ width: cardW, height: cardH + STRIP * peekCount, paddingTop: STRIP * peekCount }}>
                                    {[...peekStages].reverse().map((stage, ri) => {
                                        const k = peekCount - ri; // 1 = nearest the front card
                                        return renderPeekStrip(stage, k);
                                    })}
                                    {liveStages.length > 1 && renderIncoming(nextLayerStage, -1, 'next')}
                                    {liveStages.length > 1 && renderIncoming(prevLayerStage, 1, 'prev')}
                                    <FrontCard
                                        deckX={deckX}
                                        floatY={floatY}
                                        cardW={cardW}
                                        panHandlers={deckPan.panHandlers}
                                        style={[
                                            styles.deckCard,
                                            {
                                                width: cardW,
                                                height: cardH,
                                                borderColor: accentFor(activeStage) + '66',
                                                shadowColor: accentFor(activeStage),
                                            },
                                        ]}
                                    >
                                        {renderDeckCard(activeStage)}
                                    </FrontCard>
                                </View>
                                {isLandscape && liveStages.length > 1 && (
                                    <TouchableOpacity style={styles.swipeHint} onPress={() => stepDeck(1)} activeOpacity={0.7}>
                                        <MaterialIcons name="chevron-right" size={22} color="rgba(255,255,255,0.6)" />
                                        <Text style={styles.swipeText}>SWIPE</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                            {liveStages.length > 1 && (
                                <Text style={styles.pagerText}>{activeIndex + 1} / {liveStages.length}{isLandscape ? '' : '   ·   SWIPE ↔'}</Text>
                            )}
                        </>
                    )}
                </View>

                {/* Bottom: next stage + attention */}
                <View style={[styles.bottomBar, !isLandscape && styles.bottomBarPortrait]}>
                    <TouchableOpacity style={styles.nextBar} onPress={() => openDrawer('up')} activeOpacity={0.8}>
                        <Text style={styles.nextLabel}>NEXT</Text>
                        {nextStage ? (
                            <>
                                <Text style={styles.nextName} numberOfLines={1}>{nextStage.text}</Text>
                                <Text style={[styles.nextTime, nextStage.isLate && { color: '#FF8A8A' }]}>{formatStartTimeHHMM(nextStage.startTimeMinutes)}</Text>
                                <Text style={styles.nextDur}>{formatDuration(nextStage.durationMinutes)}</Text>
                            </>
                        ) : (
                            <Text style={[styles.nextName, { opacity: 0.5, fontStyle: 'italic' }]}>Nothing scheduled</Text>
                        )}
                    </TouchableOpacity>
                    {undoneStages.length > 0 && (
                        <TouchableOpacity style={styles.attentionBar} onPress={() => openDrawer('undone')} activeOpacity={0.8}>
                            <MaterialIcons name="error-outline" size={14} color="#FF8A8A" />
                            <Text style={styles.attentionText}>{undoneStages.length} NEED ATTENTION</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Drawer handle */}
                {!drawerOpen && (
                    <TouchableOpacity style={[styles.drawerHandle, { top: height / 2 - 55 }]} onPress={() => openDrawer()} activeOpacity={0.8}>
                        <MaterialIcons name="chevron-right" size={18} color="rgba(255,255,255,0.7)" />
                    </TouchableOpacity>
                )}

                {/* Stages drawer */}
                {drawerOpen && (
                    <>
                        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(120)} style={StyleSheet.absoluteFill}>
                            <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setDrawerOpen(false)} />
                        </Animated.View>
                        <Animated.View
                            entering={SlideInLeft.duration(220)}
                            exiting={SlideOutLeft.duration(180)}
                            style={[styles.drawer, { width: drawerWidth, paddingTop: Math.max(insets.top, 14), paddingBottom: Math.max(insets.bottom, 14), paddingLeft: Math.max(insets.left, 14) }]}
                        >
                            <View style={styles.drawerHeader}>
                                <Text style={styles.drawerTitle}>STAGES</Text>
                                {renderDome(() => setDrawerOpen(false), 'chevron-left', 30)}
                            </View>

                            <View style={styles.segment}>
                                {([['done', 'DONE', filteredCompleted.length], ['up', 'UPCOMING', filteredUpcoming.length], ['undone', 'UNDONE', filteredUndone.length]] as [DrawerTab, string, number][]).map(([key, label, count]) => {
                                    const on = drawerTab === key;
                                    return (
                                        <TouchableOpacity
                                            key={key}
                                            style={[styles.segmentItem, on && styles.segmentItemOn]}
                                            onPress={() => {
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                setDrawerTab(key);
                                            }}
                                            activeOpacity={0.8}
                                        >
                                            <Text style={[styles.segmentText, on && { color: '#0A0C10' }]}>{label} {count}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            {tasks.length > 0 && (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.taskChipScroll} contentContainerStyle={styles.taskChipRow}>
                                    {[{ id: 'ALL' as const, title: 'ALL', color: undefined as string | undefined }, ...tasks].map(t => {
                                        const on = selectedTaskId === t.id;
                                        return (
                                            <TouchableOpacity
                                                key={`chip-${t.id}`}
                                                style={[styles.taskChip, on && { backgroundColor: t.color || '#FFFFFF' }]}
                                                onPress={() => {
                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                    setSelectedTaskId(t.id);
                                                }}
                                                activeOpacity={0.8}
                                            >
                                                <Text style={[styles.taskChipText, on && { color: '#0A0C10' }]} numberOfLines={1}>{t.title.toUpperCase()}</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </ScrollView>
                            )}

                            <ScrollView style={styles.listWell} contentContainerStyle={{ padding: 8 }}>
                                {drawerData[drawerTab].length === 0 ? (
                                    <Text style={styles.emptyText}>Nothing here</Text>
                                ) : (
                                    drawerData[drawerTab].map((stage, i) => renderRow(drawerTab, stage, i))
                                )}
                            </ScrollView>
                        </Animated.View>
                    </>
                )}

                {/* Maximised card */}
                {maxStage && renderMaximised(maxStage)}

                <StageActionPopup
                    visible={statusPopupVisible}
                    position={statusPopupPosition}
                    currentStatus={statusPopupStage?.currentStatus || 'Upcoming'}
                    onClose={() => setStatusPopupVisible(false)}
                    onSelectStatus={(status) => {
                        setStatusPopupVisible(false);
                        if (!statusPopupStage) return;
                        if (status === 'Process' && onStartStage) onStartStage(statusPopupStage.taskId, statusPopupStage.stageId);
                        else if (onUpdateStageStatus) onUpdateStageStatus(statusPopupStage.taskId, statusPopupStage.stageId, status);
                    }}
                />
            </Animated.View>
        </Modal>
    );
}

const SUNK_SHADOW = 'inset 0 3px 8px rgba(0,0,0,0.85), 0 1px 0 rgba(255,255,255,0.06)';
const RAISED_SHADOW = 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -3px 0 rgba(0,0,0,0.35)';

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
    },

    // --- Top bar ---
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    titleWrap: {
        flex: 1,
        alignItems: 'center',
        minWidth: 0,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    titleDiscSocket: {
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
        boxShadow: 'inset 0 2px 3px rgba(0,0,0,0.7), 0 1px 0 rgba(255,255,255,0.08)',
    },
    titleDisc: {
        width: 16,
        height: 16,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFD83A',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -2px 0 rgba(0,0,0,0.25)',
    },
    title: {
        flexShrink: 1,
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 2.6,
        color: 'rgba(255,255,255,0.82)',
    },
    pager: {
        gap: 6,
        paddingTop: 6,
    },
    pagerPill: {
        maxWidth: 140,
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 11,
        backgroundColor: '#0B0C0F',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8)',
    },
    pagerPillOn: {
        backgroundColor: '#3A2E10',
    },
    topBarPortrait: {
        flexWrap: 'wrap',
        rowGap: 12,
        marginBottom: 6,
    },
    countsRowPortrait: {
        width: '100%',
        gap: 8,
    },
    countChipPortrait: {
        flex: 1,
        justifyContent: 'center',
    },
    bottomBarPortrait: {
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 8,
    },
    countsRow: {
        flexDirection: 'row',
        gap: 8,
    },
    countChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 30,
        paddingHorizontal: 12,
        borderRadius: 15,
        backgroundColor: '#0B0C0F',
        boxShadow: SUNK_SHADOW,
    },
    countDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    countLabel: {
        fontSize: 8.5,
        fontWeight: '800',
        letterSpacing: 1.5,
        color: 'rgba(255,255,255,0.6)',
    },
    countValue: {
        fontSize: 12,
        fontWeight: '800',
        color: '#FFFFFF',
    },

    // --- Deck ---
    deckRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
    },
    swipeHint: {
        width: 64,
        alignItems: 'center',
        gap: 4,
    },
    swipeText: {
        fontSize: 8,
        fontWeight: '800',
        letterSpacing: 2,
        color: 'rgba(255,255,255,0.45)',
    },
    pagerText: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 2,
        color: 'rgba(255,255,255,0.6)',
    },
    peekStrip: {
        position: 'absolute',
        alignSelf: 'center',
        height: 64,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 9,
        paddingHorizontal: 20,
        paddingTop: 5,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        backgroundColor: '#12151A',
        borderWidth: 1,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
    },
    peekDot: {
        width: 7,
        height: 7,
        borderRadius: 4,
        marginTop: 9,
    },
    peekName: {
        flex: 1,
        marginTop: 5,
        fontSize: 12,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.85)',
    },
    peekPct: {
        marginTop: 7,
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 1,
        color: 'rgba(255,255,255,0.5)',
    },
    peekTimeWell: {
        height: 22,
        paddingHorizontal: 10,
        borderRadius: 11,
        justifyContent: 'center',
        backgroundColor: '#090A0C',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.85)',
    },
    peekTime: {
        fontSize: 12,
        fontWeight: '800',
        fontVariant: ['tabular-nums'],
    },
    ghostCard: {
        position: 'absolute',
        alignSelf: 'center',
        height: 120,
        borderTopLeftRadius: 36,
        borderTopRightRadius: 36,
        backgroundColor: '#101317',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    deckCard: {
        alignSelf: 'center',
        borderRadius: 40,
        padding: 22,
        justifyContent: 'center',
        backgroundColor: '#14171B',
        borderWidth: 1,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.25,
        shadowRadius: 22,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.09), inset 0 -2px 0 rgba(0,0,0,0.4), 0 14px 26px rgba(0,0,0,0.7)',
    },
    cardTouch: {
        flex: 1,
        justifyContent: 'center',
    },
    maxWrap: {
        backgroundColor: '#000000',
        zIndex: 100,
    },
    maxBody: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
    },
    maxInfo: {
        justifyContent: 'center',
        gap: 12,
        maxWidth: 420,
    },
    maxName: {
        fontSize: 26,
        fontWeight: '800',
        color: '#FFFFFF',
    },
    maxTime: {
        fontFamily: 'Inter_900Black',
        fontWeight: '900',
        letterSpacing: -2,
        fontVariant: ['tabular-nums'],
        textAlign: 'center',
        width: '100%',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 24,
    },
    maxSub: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1.6,
    },
    maxProgressWrap: {
        width: '80%',
        marginTop: 6,
    },
    maxProgressLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 6,
    },
    maxProgressLabel: {
        fontSize: 8.5,
        fontWeight: '800',
        letterSpacing: 2,
        color: 'rgba(255,255,255,0.5)',
        fontVariant: ['tabular-nums'],
    },
    maxPagerBar: {
        position: 'absolute',
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    maxSwitchScroll: {
        flexGrow: 0,
    },
    maxSwitchRow: {
        gap: 10,
        paddingVertical: 4,
        justifyContent: 'center',
        flexGrow: 1,
    },
    maxSwitchPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        height: 38,
        paddingHorizontal: 16,
        borderRadius: 19,
        borderWidth: 1,
        backgroundColor: '#14171B',
        boxShadow: RAISED_SHADOW + ', 0 6px 10px rgba(0,0,0,0.55)',
    },
    maxSwitchName: {
        maxWidth: 130,
        fontSize: 12,
        fontWeight: '800',
        color: '#FFFFFF',
    },
    maxSwitchTime: {
        fontSize: 11,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.7)',
        fontVariant: ['tabular-nums'],
    },
    cardRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 22,
    },
    cardCol: {
        alignItems: 'center',
        gap: 16,
    },
    actionsRowPortrait: {
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 12,
    },
    extendRowPortrait: {
        alignItems: 'center',
        gap: 8,
    },
    extendLabel: {
        fontSize: 8,
        fontWeight: '800',
        letterSpacing: 2,
        color: 'rgba(255,255,255,0.4)',
        marginRight: 4,
    },
    extendDomeWide: {
        flex: 1,
        width: undefined,
        height: 42,
        borderRadius: 21,
    },
    cardInfoPortrait: {
        // in the stacked (column) layout the details must take their natural height, not collapse
        flex: 0,
        flexGrow: 0,
        flexShrink: 0,
        width: '100%',
    },
    cardInfo: {
        flex: 1,
        alignSelf: 'stretch',
        justifyContent: 'center',
        gap: 10,
        minWidth: 0,
    },
    cardHead: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
    },
    liveDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 5,
    },
    cardName: {
        flex: 1,
        fontSize: 19,
        fontWeight: '800',
        color: '#FFFFFF',
    },
    cardChip: {
        maxWidth: 110,
        height: 20,
        paddingHorizontal: 10,
        borderRadius: 10,
        justifyContent: 'center',
        backgroundColor: '#0B0C0F',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8)',
    },
    cardChipText: {
        fontSize: 8,
        fontWeight: '800',
        letterSpacing: 1.4,
    },
    cardSub: {
        fontSize: 10.5,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.5)',
    },
    dialSocket: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0B0C0F',
        boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.85), 0 1px 0 rgba(255,255,255,0.06)',
    },
    dialInner: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        paddingHorizontal: 6,
        backgroundColor: '#090A0C',
        boxShadow: 'inset 0 3px 8px rgba(0,0,0,0.85)',
    },
    dialLabel: {
        fontSize: 7.5,
        fontWeight: '800',
        letterSpacing: 2.2,
        color: 'rgba(255,255,255,0.5)',
    },
    dialTime: {
        fontFamily: 'Inter_900Black',
        fontWeight: '900',
        color: '#FFFFFF',
        letterSpacing: -0.5,
        fontVariant: ['tabular-nums'],
    },
    dialSub: {
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 1,
    },
    // empty state
    emptyCard: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    emptyOrbitWrap: {
        width: 120,
        height: 120,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
    },
    emptyOrbit: {
        position: 'absolute',
        width: 116,
        height: 116,
        borderRadius: 58,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: 'rgba(255,255,255,0.22)',
    },
    emptyDomeSocket: {
        width: 84,
        height: 84,
        borderRadius: 42,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0B0C0F',
        boxShadow: SUNK_SHADOW,
    },
    emptyDome: {
        width: 66,
        height: 66,
        borderRadius: 33,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1D2128',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        boxShadow: RAISED_SHADOW + ', 0 8px 14px rgba(0,0,0,0.65)',
    },
    emptyTitle: {
        fontSize: 13,
        fontWeight: '800',
        letterSpacing: 3,
        color: 'rgba(255,255,255,0.85)',
    },
    emptySub: {
        fontSize: 11,
        fontWeight: '600',
        textAlign: 'center',
        color: 'rgba(255,255,255,0.5)',
        maxWidth: 320,
    },
    emptyNext: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        height: 36,
        paddingHorizontal: 16,
        borderRadius: 18,
        backgroundColor: '#090A0C',
        boxShadow: 'inset 0 3px 8px rgba(0,0,0,0.8), 0 1px 0 rgba(255,255,255,0.05)',
    },
    emptyBtn: {
        height: 36,
        paddingHorizontal: 22,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1D2128',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        boxShadow: RAISED_SHADOW + ', 0 5px 9px rgba(0,0,0,0.6)',
    },
    emptyBtnText: {
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 2.2,
        color: 'rgba(255,255,255,0.85)',
    },

    // --- Hero ---
    hero: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    timerDisplay: {
        fontFamily: 'Inter_900Black',
        fontWeight: '900',
        letterSpacing: -1,
        fontVariant: ['tabular-nums'],
        textAlign: 'center',
        width: '100%',
    },
    progressWrap: {
        width: '86%',
    },
    progressTrack: {
        height: 8,
        borderRadius: 4,
        overflow: 'hidden',
        backgroundColor: '#050607',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.9), 0 1px 0 rgba(255,255,255,0.06)',
    },
    progressFill: {
        height: '100%',
        borderRadius: 4,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 6,
    },
    progressLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 6,
    },
    progressLabel: {
        fontSize: 8.5,
        fontWeight: '800',
        letterSpacing: 2,
        color: 'rgba(255,255,255,0.5)',
        fontVariant: ['tabular-nums'],
    },
    actionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        minHeight: 56,
        flexWrap: 'wrap',
    },
    waiting: {
        fontSize: 12,
        fontWeight: '600',
        fontStyle: 'italic',
        color: 'rgba(255,255,255,0.5)',
    },
    extendRow: {
        flexDirection: 'row',
        gap: 10,
    },
    extendDome: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1D2128',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        boxShadow: RAISED_SHADOW + ', 0 4px 7px rgba(0,0,0,0.6)',
    },
    extendText: {
        fontSize: 10,
        fontWeight: '800',
        color: '#FFFFFF',
    },

    // --- Buttons ---
    domeSocket: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0B0C0F',
        boxShadow: SUNK_SHADOW,
    },
    dome: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1D2128',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        boxShadow: RAISED_SHADOW + ', 0 5px 9px rgba(0,0,0,0.6)',
    },
    pillSocket: {
        padding: 5,
        borderRadius: 29,
        backgroundColor: '#0B0C0F',
        boxShadow: SUNK_SHADOW,
    },
    pillTouch: {
        borderRadius: 24,
        overflow: 'hidden',
        boxShadow: '0 6px 12px rgba(0,0,0,0.6)',
    },
    pill: {
        minWidth: 120,
        height: 44,
        paddingHorizontal: 22,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 24,
        boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.55), inset 0 -3px 0 rgba(0,0,0,0.22)',
    },
    pillText: {
        fontSize: 15,
        fontWeight: '800',
        letterSpacing: 2.6,
    },

    // --- Bottom bar ---
    bottomBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    nextBar: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        height: 38,
        paddingHorizontal: 16,
        borderRadius: 19,
        backgroundColor: '#14171B',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        boxShadow: RAISED_SHADOW + ', 0 6px 10px rgba(0,0,0,0.55)',
    },
    nextLabel: {
        fontSize: 8.5,
        fontWeight: '800',
        letterSpacing: 2,
        color: 'rgba(255,255,255,0.5)',
    },
    nextName: {
        flex: 1,
        fontSize: 12,
        fontWeight: '800',
        color: '#FFFFFF',
    },
    nextTime: {
        fontSize: 11,
        fontWeight: '800',
        color: '#FFCC00',
        fontVariant: ['tabular-nums'],
    },
    nextDur: {
        fontSize: 11,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.6)',
    },
    attentionBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 38,
        paddingHorizontal: 18,
        borderRadius: 19,
        backgroundColor: '#3A1D22',
        boxShadow: RAISED_SHADOW + ', 0 6px 10px rgba(0,0,0,0.55)',
    },
    attentionText: {
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 1.8,
        color: '#FFA0A0',
    },

    // --- Drawer ---
    drawerHandle: {
        position: 'absolute',
        left: 0,
        width: 24,
        height: 110,
        alignItems: 'center',
        justifyContent: 'center',
        borderTopRightRadius: 16,
        borderBottomRightRadius: 16,
        backgroundColor: '#14171B',
        borderWidth: 1,
        borderLeftWidth: 0,
        borderColor: 'rgba(255,255,255,0.06)',
        boxShadow: '0 6px 12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)',
    },
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    drawer: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        paddingRight: 14,
        backgroundColor: '#0F1115',
        borderRightWidth: 1,
        borderRightColor: 'rgba(255,255,255,0.06)',
        boxShadow: '12px 0 30px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)',
    },
    drawerHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    drawerTitle: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 3,
        color: 'rgba(255,255,255,0.78)',
    },
    segment: {
        flexDirection: 'row',
        padding: 4,
        borderRadius: 19,
        backgroundColor: '#0B0C0F',
        boxShadow: 'inset 0 3px 8px rgba(0,0,0,0.8), inset 0 -1px 0 rgba(255,255,255,0.05)',
    },
    segmentItem: {
        flex: 1,
        height: 30,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 15,
    },
    segmentItemOn: {
        backgroundColor: '#FFFFFF',
        boxShadow: '0 4px 10px rgba(0,0,0,0.6), inset 0 -2px 0 rgba(0,0,0,0.12)',
    },
    segmentText: {
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 1.4,
        color: 'rgba(255,255,255,0.55)',
    },
    taskChipScroll: {
        flexGrow: 0,
        marginTop: 10,
    },
    taskChipRow: {
        gap: 6,
    },
    taskChip: {
        height: 26,
        paddingHorizontal: 12,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1D2128',
    },
    taskChipText: {
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 1.4,
        color: 'rgba(255,255,255,0.7)',
    },
    listWell: {
        flex: 1,
        marginTop: 12,
        borderRadius: 20,
        backgroundColor: '#090A0C',
        borderTopWidth: 2,
        borderTopColor: '#000',
        boxShadow: 'inset 0 3px 9px rgba(0,0,0,0.8), 0 1px 0 rgba(255,255,255,0.05)',
    },
    emptyText: {
        textAlign: 'center',
        marginTop: 24,
        fontSize: 12,
        fontStyle: 'italic',
        color: 'rgba(255,255,255,0.4)',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        minHeight: 38,
        marginBottom: 6,
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 16,
        boxShadow: RAISED_SHADOW + ', 0 5px 8px rgba(0,0,0,0.55)',
    },
    rowName: {
        flex: 1,
        fontSize: 12,
        fontWeight: '800',
    },
    rowChip: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 9,
    },
    rowChipText: {
        fontSize: 10.5,
        fontWeight: '800',
        fontVariant: ['tabular-nums'],
    },
    rowDur: {
        minWidth: 52,
        textAlign: 'right',
        fontSize: 10.5,
        fontWeight: '800',
        opacity: 0.85,
        fontVariant: ['tabular-nums'],
    },
});
