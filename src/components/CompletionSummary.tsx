import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

const DEFAULT_ACCENT = '#4CAF50';
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

const formatDuration = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
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
    const ringScale = useRef(new Animated.Value(0.6)).current;
    const ringOpacity = useRef(new Animated.Value(0)).current;
    const glow = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
        Animated.parallel([
            Animated.spring(ringScale, { toValue: 1, tension: 40, friction: 6, useNativeDriver: true }),
            Animated.timing(ringOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        ]).start();
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(glow, { toValue: 1, duration: 1400, useNativeDriver: true }),
                Animated.timing(glow, { toValue: 0, duration: 1400, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, []);

    const focusedSeconds = totalSeconds + extendedSeconds;
    const ringSize = isPage ? 96 : 64;

    const summary = (
        <View style={[styles.summary, horizontal && styles.summaryHorizontal]}>
            <View style={{ width: ringSize + 24, height: ringSize + 24, alignItems: 'center', justifyContent: 'center' }}>
                <Animated.View
                    style={[
                        styles.glow,
                        {
                            width: ringSize + 24,
                            height: ringSize + 24,
                            borderRadius: (ringSize + 24) / 2,
                            backgroundColor: accentColor,
                            opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.06, 0.2] }),
                        },
                    ]}
                />
                <Animated.View
                    style={[
                        styles.ring,
                        {
                            width: ringSize,
                            height: ringSize,
                            borderRadius: ringSize / 2,
                            borderColor: accentColor,
                            backgroundColor: `${accentColor}1A`,
                            opacity: ringOpacity,
                            transform: [{ scale: ringScale }],
                        },
                    ]}
                >
                    <MaterialIcons name="check" size={ringSize * 0.5} color={accentColor} />
                </Animated.View>
            </View>

            <View style={[styles.summaryText, horizontal && styles.summaryTextHorizontal]}>
                <Text style={[styles.completedLabel, { color: accentColor }, !isPage && styles.completedLabelPopup]}>
                    COMPLETED
                </Text>
                {!!title && (
                    <Text style={[styles.title, !isPage && styles.titlePopup]} numberOfLines={1}>
                        {title}
                    </Text>
                )}

                <View style={styles.focusRow}>
                    <Text style={[styles.focusValue, !isPage && styles.focusValuePopup]}>
                        {formatDuration(focusedSeconds)}
                    </Text>
                    <Text style={styles.focusUnit}>focused</Text>
                </View>

                {!!categoryName && (
                    <View style={[styles.categoryChip, { backgroundColor: `${accentColor}15`, borderColor: `${accentColor}40` }]}>
                        {!!categoryIcon && <MaterialIcons name={categoryIcon} size={13} color={accentColor} />}
                        <Text style={[styles.categoryChipText, { color: accentColor }]}>{categoryName}</Text>
                    </View>
                )}

                {/* Start -> End timeline */}
                <View style={styles.timeline}>
                    <Text style={styles.timelineTime}>{formatClock(startTime)}</Text>
                    <View style={styles.timelineTrack}>
                        <View style={[styles.timelineDot, { backgroundColor: '#fff' }]} />
                        <View style={[styles.timelineLine, { backgroundColor: `${accentColor}80` }]} />
                        <View style={[styles.timelineDot, { backgroundColor: accentColor }]} />
                    </View>
                    <Text style={styles.timelineTime}>{endedAt}</Text>
                </View>
                <View style={styles.timelineCaptions}>
                    <Text style={styles.timelineCaption}>Started</Text>
                    <Text style={[styles.extendedText, extendedSeconds > 0 && { color: '#FFD740' }]}>
                        Extended {formatExtended(extendedSeconds)}
                    </Text>
                    <Text style={styles.timelineCaption}>Ended</Text>
                </View>
            </View>
        </View>
    );

    const actions = (
        <View style={[styles.actions, horizontal && styles.actionsHorizontal]}>
            <Text style={styles.extendLabel}>EXTEND SESSION</Text>
            <View style={styles.extendRow}>
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
                style={[styles.primaryBtn, !isPage && styles.primaryBtnPopup]}
                activeOpacity={0.85}
                onPress={onPrimary}
            >
                <MaterialIcons name={primaryIcon} size={isPage ? 26 : 20} color="#000" />
                <Text style={[styles.primaryBtnText, !isPage && styles.primaryBtnTextPopup]}>{primaryLabel}</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <View style={[styles.root, horizontal && styles.rootHorizontal, isPage && styles.rootPage]}>
            {summary}
            {horizontal && <View style={styles.divider} />}
            {actions}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { gap: 18 },
    rootHorizontal: { flexDirection: 'row', alignItems: 'center', gap: 24 },
    rootPage: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },

    summary: { alignItems: 'center', gap: 12 },
    summaryHorizontal: { flex: 1.15, flexDirection: 'row', alignItems: 'center' },
    summaryText: { alignItems: 'center', gap: 6 },
    summaryTextHorizontal: { flex: 1, alignItems: 'flex-start' },

    glow: { position: 'absolute' },
    ring: { alignItems: 'center', justifyContent: 'center', borderWidth: 2.5 },

    completedLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 4 },
    completedLabelPopup: { fontSize: 11, letterSpacing: 3 },
    title: { fontSize: 20, fontWeight: '700', color: '#fff' },
    titlePopup: { fontSize: 15 },

    focusRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    focusValue: { fontSize: 44, fontWeight: '800', color: '#fff', letterSpacing: 1 },
    focusValuePopup: { fontSize: 28 },
    focusUnit: { fontSize: 13, color: 'rgba(255,255,255,0.45)', fontWeight: '600', letterSpacing: 1 },

    categoryChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        borderWidth: 1,
    },
    categoryChipText: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },

    timeline: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch', marginTop: 4 },
    timelineTime: { fontSize: 14, fontWeight: '700', color: '#fff' },
    timelineTrack: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    timelineLine: { flex: 1, height: 2, borderRadius: 1 },
    timelineDot: { width: 8, height: 8, borderRadius: 4 },
    timelineCaptions: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch' },
    timelineCaption: { fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 },
    extendedText: { fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 1, fontWeight: '700' },

    divider: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.1)' },

    actions: { gap: 12, alignSelf: 'stretch' },
    actionsHorizontal: { flex: 1 },
    extendLabel: { fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: 3, fontWeight: '700', textAlign: 'center' },
    extendRow: { flexDirection: 'row', gap: 10 },
    extendBtn: {
        flex: 1,
        height: 54,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
    },
    extendBtnPopup: { height: 42, borderRadius: 14 },
    extendBtnText: { fontSize: 18, fontWeight: '700', color: '#fff' },
    extendBtnTextPopup: { fontSize: 15 },

    primaryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        height: 66,
        borderRadius: 26,
        backgroundColor: '#FFFFFF',
        ...Platform.select({
            ios: { shadowColor: '#FFFFFF', shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
        }),
    },
    primaryBtnPopup: { height: 46, borderRadius: 16 },
    primaryBtnText: { fontSize: 20, fontWeight: '800', color: '#000' },
    primaryBtnTextPopup: { fontSize: 14, letterSpacing: 2 },
});
