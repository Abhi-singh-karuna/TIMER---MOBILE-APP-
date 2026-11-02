import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

const DEFAULT_ACCENT = '#4DA3FF';
const EXTENDED_COLOR = '#FFD740';
const SUCCESS_COLOR = '#4CAF50';
const EXTEND_OPTIONS = [1, 5, 10];

// "MM:SS" or "HH:MM:SS" -> seconds
export const parseTimeToSeconds = (time?: string): number => {
    if (!time) return 0;
    const parts = time.split(':').map(Number);
    if (parts.some(isNaN)) return 0;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
};

// ISO string -> "HH:MM" (24h, same format as the rest of the app)
export const formatClock = (value?: string): string => {
    if (!value || value === '--:--') return '--:--';
    const date = new Date(value);
    if (isNaN(date.getTime())) return value;
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
};

const pad = (n: number) => n.toString().padStart(2, '0');

const formatDuration = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

const formatExtended = (seconds: number): string => {
    if (seconds <= 0) return 'None';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `+${m}m ${s}s` : `+${m}m`;
};

export interface CompletionSummaryProps {
    /** 'page' = full screen, 'popup' = compact card inside a modal */
    variant: 'page' | 'popup';
    /** Side-by-side layout (landscape) or stacked (portrait) */
    horizontal: boolean;
    title?: string;
    accentColor?: string;
    categoryName?: string;
    categoryIcon?: keyof typeof MaterialIcons.glyphMap;
    /** ISO string (or "--:--") */
    startTime?: string;
    /** Already formatted "HH:MM" */
    endedAt: string;
    /** Original timer length in seconds (without extensions) */
    totalSeconds: number;
    extendedSeconds: number;
    onExtend: (seconds: number) => void;
    onPrimary: () => void;
    primaryLabel: string;
    primaryIcon: keyof typeof MaterialIcons.glyphMap;
}

const RING_RADIUS = 42;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export default function CompletionSummary({
    variant,
    horizontal,
    title,
    accentColor = DEFAULT_ACCENT,
    categoryName,
    categoryIcon,
    startTime,
    endedAt,
    totalSeconds,
    extendedSeconds,
    onExtend,
    onPrimary,
    primaryLabel,
    primaryIcon,
}: CompletionSummaryProps) {
    const isPage = variant === 'page';
    const ringScale = useRef(new Animated.Value(0.85)).current;
    const ringOpacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
        Animated.parallel([
            Animated.spring(ringScale, { toValue: 1, tension: 40, friction: 7, useNativeDriver: true }),
            Animated.timing(ringOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        ]).start();
    }, []);

    const focusedSeconds = totalSeconds + extendedSeconds;
    const baseFraction = focusedSeconds > 0 ? totalSeconds / focusedSeconds : 1;
    const extFraction = focusedSeconds > 0 ? extendedSeconds / focusedSeconds : 0;
    const gap = extendedSeconds > 0 ? 4 : 0;
    const baseLength = Math.max(RING_CIRCUMFERENCE * baseFraction - gap, 0);
    const extLength = Math.max(RING_CIRCUMFERENCE * extFraction - gap, 0);

    // Ring size: page landscape / page portrait / popup landscape / popup portrait
    const ringSize = isPage ? (horizontal ? 190 : 230) : (horizontal ? 130 : 140);
    const timeFont = Math.round(ringSize * 0.21);

    const ring = (
        <Animated.View style={{ opacity: ringOpacity, transform: [{ scale: ringScale }] }}>
            <View style={{ width: ringSize, height: ringSize, alignItems: 'center', justifyContent: 'center' }}>
                <Svg width={ringSize} height={ringSize} viewBox="0 0 100 100">
                    <Circle
                        cx={50}
                        cy={50}
                        r={RING_RADIUS}
                        stroke="rgba(255,255,255,0.08)"
                        strokeWidth={5}
                        fill="none"
                    />
                    <Circle
                        cx={50}
                        cy={50}
                        r={RING_RADIUS}
                        stroke={accentColor}
                        strokeWidth={5}
                        strokeLinecap="round"
                        fill="none"
                        strokeDasharray={`${baseLength} ${RING_CIRCUMFERENCE}`}
                        transform="rotate(-90 50 50)"
                    />
                    {extLength > 0 && (
                        <Circle
                            cx={50}
                            cy={50}
                            r={RING_RADIUS}
                            stroke={EXTENDED_COLOR}
                            strokeWidth={5}
                            strokeLinecap="round"
                            fill="none"
                            strokeDasharray={`${extLength} ${RING_CIRCUMFERENCE}`}
                            strokeDashoffset={-(RING_CIRCUMFERENCE * baseFraction)}
                            transform="rotate(-90 50 50)"
                        />
                    )}
                </Svg>
                <View style={styles.ringCenter}>
                    <Text style={[styles.completedLabel, { fontSize: isPage ? 11 : 9 }]}>COMPLETED</Text>
                    <Text style={[styles.focusValue, { fontSize: timeFont }]} numberOfLines={1} adjustsFontSizeToFit>
                        {formatDuration(focusedSeconds)}
                    </Text>
                    <Text style={styles.eyebrow}>FOCUSED</Text>
                </View>
            </View>
        </Animated.View>
    );

    const statCell = (label: string, value: string, dotColor?: string, valueColor?: string) => (
        <View style={styles.statCell}>
            <Text style={styles.eyebrow}>{label}</Text>
            <View style={styles.statValueRow}>
                {!!dotColor && <View style={[styles.dot, { backgroundColor: dotColor }]} />}
                <Text style={[styles.statValue, !isPage && styles.statValuePopup, !!valueColor && { color: valueColor }]}>
                    {value}
                </Text>
            </View>
        </View>
    );

    const details = (
        <View style={styles.details}>
            <View style={styles.head}>
                <Text style={[styles.title, !isPage && styles.titlePopup]} numberOfLines={1}>
                    {title || 'Timer'}
                </Text>
                {!!categoryName && (
                    <View style={[styles.categoryChip, { backgroundColor: `${accentColor}1F`, borderColor: `${accentColor}59` }]}>
                        {!!categoryIcon && <MaterialIcons name={categoryIcon} size={12} color={accentColor} />}
                        <Text style={[styles.categoryChipText, { color: accentColor }]}>{categoryName.toUpperCase()}</Text>
                    </View>
                )}
            </View>

            <View style={styles.stats}>
                {statCell('STARTED', formatClock(startTime))}
                {statCell('ENDED', endedAt)}
                {statCell('PLANNED', formatDuration(totalSeconds), accentColor)}
                {statCell('EXTENDED', formatExtended(extendedSeconds), EXTENDED_COLOR, extendedSeconds > 0 ? EXTENDED_COLOR : undefined)}
            </View>

            <View style={[styles.actions, horizontal && styles.actionsHorizontal]}>
                <View style={[styles.extendRow, horizontal && { flex: 1 }]}>
                    {EXTEND_OPTIONS.map((mins) => (
                        <TouchableOpacity
                            key={mins}
                            style={[styles.extendBtn, !isPage && styles.extendBtnPopup]}
                            activeOpacity={0.7}
                            onPress={() => onExtend(mins * 60)}
                        >
                            <Text style={[styles.extendBtnText, !isPage && styles.extendBtnTextPopup]}>+{mins}m</Text>
                        </TouchableOpacity>
                    ))}
                </View>
                <TouchableOpacity
                    style={[styles.primaryBtn, !isPage && styles.primaryBtnPopup, horizontal && { flex: 1.25 }]}
                    activeOpacity={0.85}
                    onPress={onPrimary}
                >
                    <MaterialIcons name={primaryIcon} size={isPage ? 22 : 18} color="#000" />
                    <Text style={[styles.primaryBtnText, !isPage && styles.primaryBtnTextPopup]} numberOfLines={1}>
                        {primaryLabel}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <View style={[styles.root, horizontal && styles.rootHorizontal, isPage && styles.rootPage]}>
            <View style={horizontal ? styles.ringColumnHorizontal : styles.ringColumn}>{ring}</View>
            <View style={horizontal ? styles.detailsColumnHorizontal : styles.detailsColumn}>{details}</View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { gap: 18, alignItems: 'center' },
    rootHorizontal: { flexDirection: 'row', gap: 28 },
    rootPage: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },

    ringColumn: { alignItems: 'center' },
    ringColumnHorizontal: { flexShrink: 0 },
    detailsColumn: { alignSelf: 'stretch' },
    detailsColumnHorizontal: { flex: 1 },

    ringCenter: { position: 'absolute', alignItems: 'center', gap: 2, paddingHorizontal: 24 },
    completedLabel: { color: SUCCESS_COLOR, fontWeight: '800', letterSpacing: 3 },
    focusValue: { color: '#fff', fontWeight: '900', letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
    eyebrow: { fontSize: 10, letterSpacing: 2.5, fontWeight: '700', color: 'rgba(255,255,255,0.5)' },

    details: { gap: 14 },
    head: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
    title: { fontSize: 22, fontWeight: '800', color: '#fff', flexShrink: 1 },
    titlePopup: { fontSize: 17 },
    categoryChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 99,
        borderWidth: 1,
    },
    categoryChipText: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },

    stats: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        rowGap: 12,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    statCell: { width: '50%', gap: 3 },
    statValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    statValue: { fontSize: 18, fontWeight: '700', color: '#fff', fontVariant: ['tabular-nums'] },
    statValuePopup: { fontSize: 15 },

    actions: { gap: 10 },
    actionsHorizontal: { flexDirection: 'row', alignItems: 'center' },
    extendRow: { flexDirection: 'row', gap: 8 },
    extendBtn: {
        flex: 1,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    extendBtnPopup: { height: 40, borderRadius: 13 },
    extendBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
    extendBtnTextPopup: { fontSize: 14 },

    primaryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 48,
        borderRadius: 18,
        backgroundColor: '#FFFFFF',
        ...Platform.select({
            ios: { shadowColor: '#FFFFFF', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
        }),
    },
    primaryBtnPopup: { height: 40, borderRadius: 14 },
    primaryBtnText: { fontSize: 16, fontWeight: '800', color: '#000' },
    primaryBtnTextPopup: { fontSize: 13, letterSpacing: 2 },
});
