import * as React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    Platform,
    KeyboardAvoidingView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';

const NOTES_STORAGE_KEY = '@timer_app_day_notes_v1';

type NotesMap = Record<string, { html?: string; text?: string; updatedAt: number }>;

async function readNotesMap(): Promise<NotesMap> {
    try {
        const raw = await AsyncStorage.getItem(NOTES_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object') return {};
        return parsed as NotesMap;
    } catch {
        return {};
    }
}

async function writeNotesMap(map: NotesMap) {
    try {
        await AsyncStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(map));
    } catch {
        // ignore
    }
}

export async function hasDayNote(dateKey: string): Promise<boolean> {
    const t = (await getDayNote(dateKey)).trim();
    return t.length > 0;
}

export async function getDayNote(dateKey: string): Promise<string> {
    const map = await readNotesMap();
    const entry = map?.[dateKey];
    if (!entry) return '';
    if (typeof entry.text === 'string') return entry.text;
    if (typeof entry.html === 'string') {
        // Migration: rich HTML → plain text (user wants simple editor)
        const migrated = stripHtml(entry.html);
        map[dateKey] = { updatedAt: entry.updatedAt || Date.now(), text: migrated };
        await writeNotesMap(map);
        return migrated;
    }
    return '';
}

export async function setDayNote(dateKey: string, text: string): Promise<boolean> {
    const nextText = text ?? '';
    const trimmed = nextText.trim();
    const map = await readNotesMap();

    if (trimmed.length === 0) {
        if (map[dateKey]) {
            delete map[dateKey];
            await writeNotesMap(map);
        }
        return false;
    }

    map[dateKey] = { text: nextText, updatedAt: Date.now() };
    await writeNotesMap(map);
    return true;
}

function stripHtml(html: string) {
    return (html || '')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

export function NotesIconButton({
    active,
    hasNote,
    onPress,
}: {
    active: boolean;
    hasNote: boolean;
    onPress: () => void;
}) {
    return (
        <TouchableOpacity
            style={styles.notesIconBtn}
            onPress={onPress}
            activeOpacity={0.75}
        >
            <View style={[styles.notesIconInner, active && styles.notesIconInnerActive]}>
                <MaterialIcons name="sticky-note-2" size={20} color={active ? '#4CAF50' : 'rgba(255,255,255,0.72)'} />
                {hasNote && <View style={[styles.noteDot, active && styles.noteDotActive]} />}
            </View>
        </TouchableOpacity>
    );
}

type NotesPanelProps = {
    visible: boolean;
    dateKey: string; // logical date: YYYY-MM-DD
    onClose: () => void;
    /** Called after save/clear to update parent badges, etc. */
    onPresenceChange?: (hasNote: boolean) => void;
};

export default function NotesPanel({ visible, dateKey, onClose, onPresenceChange }: NotesPanelProps) {
    const insets = useSafeAreaInsets();
    const { width, height } = useWindowDimensions();
    const isLandscape = width > height;

    const [loading, setLoading] = React.useState(false);
    const [savedText, setSavedText] = React.useState('');
    const [draftText, setDraftText] = React.useState('');
    const [mode, setMode] = React.useState<'view' | 'edit'>('view');
    const [showAllDays, setShowAllDays] = React.useState(false);
    const [allDaysLoading, setAllDaysLoading] = React.useState(false);
    const [allDaysNotes, setAllDaysNotes] = React.useState<Array<{ dateKey: string; text: string; updatedAt: number }>>([]);
    const [expandedAllDays, setExpandedAllDays] = React.useState<Record<string, boolean>>({});
    const [initialLoadedKey, setInitialLoadedKey] = React.useState<string | null>(null);
    const activeKeyRef = React.useRef<string | null>(null);
    const [isAutoSaving, setIsAutoSaving] = React.useState(false);
    const autoSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const isDirty = draftText !== savedText;
    const hasSavedContent = savedText.trim().length > 0;

    const prettyDate = React.useMemo(() => {
        // dateKey: YYYY-MM-DD
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
        if (!m) return dateKey;
        const y = Number(m[1]);
        const mm = Number(m[2]);
        const dd = Number(m[3]);
        const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        return `${dd} ${months[Math.max(0, Math.min(11, mm - 1))]} ${y}`;
    }, [dateKey]);

    const formatPrettyDateKey = React.useCallback((k: string) => {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k);
        if (!m) return k;
        const y = Number(m[1]);
        const mm = Number(m[2]);
        const dd = Number(m[3]);
        const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        return `${dd} ${months[Math.max(0, Math.min(11, mm - 1))]} ${y}`;
    }, []);

    const load = React.useCallback(async (key: string) => {
        setLoading(true);
        try {
            const text = await getDayNote(key);
            setSavedText(text);
            setDraftText(text);
            setMode(text.trim().length > 0 ? 'view' : 'edit');
            setInitialLoadedKey(key);
            activeKeyRef.current = key;
            onPresenceChange?.(text.trim().length > 0);
        } finally {
            setLoading(false);
        }
    }, [onPresenceChange]);

    const loadAllDays = React.useCallback(async () => {
        setAllDaysLoading(true);
        try {
            const map = await readNotesMap();
            const items: Array<{ dateKey: string; text: string; updatedAt: number }> = [];

            Object.keys(map || {}).forEach((k) => {
                if (!k) return;
                // only previous days relative to currently selected dateKey
                if (k >= dateKey) return;
                const entry = map[k];
                if (!entry) return;
                const text = (typeof entry.text === 'string' ? entry.text : (typeof entry.html === 'string' ? stripHtml(entry.html) : '')) || '';
                if (!text.trim()) return;
                items.push({ dateKey: k, text, updatedAt: entry.updatedAt || 0 });
            });

            items.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
            setAllDaysNotes(items);
        } finally {
            setAllDaysLoading(false);
        }
    }, [dateKey]);

    React.useEffect(() => {
        if (!visible) return;
        if (initialLoadedKey === dateKey) return;

        let cancelled = false;
        (async () => {
            // If user changed the selected date while editing, persist the previous date first.
            const prevKey = activeKeyRef.current;
            if (prevKey && prevKey !== dateKey && draftText !== savedText) {
                await setDayNote(prevKey, draftText);
            }
            if (!cancelled) await load(dateKey);
        })();

        return () => { cancelled = true; };
    }, [visible, dateKey, initialLoadedKey, load, draftText, savedText]);

    const persistIfNeeded = React.useCallback(async () => {
        if (!isDirty) return { hasNote: hasSavedContent };
        const hasNote = await setDayNote(dateKey, draftText);
        setSavedText(draftText);
        onPresenceChange?.(hasNote);
        return { hasNote };
    }, [dateKey, draftText, hasSavedContent, isDirty, onPresenceChange]);

    const handleClose = React.useCallback(async () => {
        await persistIfNeeded();
        onClose();
    }, [onClose, persistIfNeeded]);

    const switchToView = React.useCallback(async () => {
        await persistIfNeeded();
        setMode('view');
    }, [persistIfNeeded]);

    // Auto-save (debounced) while typing
    React.useEffect(() => {
        if (!visible) return;
        if (!isDirty) return;

        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        setIsAutoSaving(true);
        autoSaveTimerRef.current = setTimeout(async () => {
            try {
                const hasNote = await setDayNote(dateKey, draftText);
                setSavedText(draftText);
                onPresenceChange?.(hasNote);
            } finally {
                setIsAutoSaving(false);
            }
        }, 450);

        return () => {
            if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        };
    }, [dateKey, draftText, isDirty, onPresenceChange, visible]);

    React.useEffect(() => {
        if (!visible) return;
        if (!showAllDays) return;
        loadAllDays().catch(() => { });
    }, [visible, showAllDays, loadAllDays]);

    if (!visible) return null;

    const statusLabel = loading
        ? 'Loading…'
        : isAutoSaving
            ? 'Saving…'
            : isDirty
                ? 'Typing…'
                : 'Auto-saved';

    const editorMinHeight = Math.max(220, Math.round(height * 0.38));

    const CurrentSection = mode === 'edit' ? (
        <TextInput
            value={draftText}
            onChangeText={setDraftText}
            style={[styles.bodyInput, showAllDays && { minHeight: editorMinHeight }]}
            placeholder="Write your diary for this day…"
            placeholderTextColor="rgba(255,255,255,0.22)"
            multiline
            scrollEnabled
            textAlignVertical="top"
            autoFocus={!hasSavedContent}
        />
    ) : hasSavedContent ? (
        showAllDays ? (
            <View style={styles.bodyReadContainer}>
                <Text style={styles.bodyReadText}>{savedText}</Text>
            </View>
        ) : (
            <TextInput
                value={savedText}
                editable={false}
                scrollEnabled
                multiline
                textAlignVertical="top"
                style={styles.bodyReadInput}
            />
        )
    ) : (
        <View style={styles.emptyStateCompact}>
            <MaterialIcons name="auto-stories" size={22} color="rgba(255,255,255,0.22)" />
            <Text style={styles.emptyTitle}>No diary for this day</Text>
            <Text style={styles.emptySubtitle}>Tap EDIT and start writing. It auto-saves.</Text>
            <TouchableOpacity style={styles.primaryCta} onPress={() => setMode('edit')} activeOpacity={0.85}>
                <MaterialIcons name="edit" size={14} color="#0A0A0A" />
                <Text style={styles.primaryCtaText}>EDIT</Text>
            </TouchableOpacity>
        </View>
    );

    const PreviousDaysSection = (
        <View style={styles.allDaysSection}>
            <View style={styles.allDaysHeaderRow}>
                <Text style={styles.allDaysTitle}>PREVIOUS DAYS</Text>
                <Text style={styles.allDaysCount}>{allDaysLoading ? '…' : String(allDaysNotes.length)}</Text>
            </View>
            {allDaysLoading ? (
                <Text style={styles.allDaysLoadingText}>Loading previous notes…</Text>
            ) : allDaysNotes.length === 0 ? (
                <Text style={styles.allDaysEmptyText}>No previous days with notes.</Text>
            ) : (
                <View style={styles.allDaysList}>
                    {allDaysNotes.map((n) => {
                        const expanded = !!expandedAllDays[n.dateKey];
                        return (
                            <TouchableOpacity
                                key={n.dateKey}
                                style={styles.dayNoteBlock}
                                activeOpacity={0.85}
                                onPress={() => setExpandedAllDays(prev => ({ ...prev, [n.dateKey]: !prev[n.dateKey] }))}
                            >
                                <View style={styles.dayNoteHeader}>
                                    <Text style={styles.dayNoteDate}>{formatPrettyDateKey(n.dateKey)}</Text>
                                    <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={18} color="rgba(255,255,255,0.35)" />
                                </View>
                                <Text style={styles.dayNoteText} numberOfLines={expanded ? undefined : 3}>
                                    {n.text}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            )}
        </View>
    );

    const Body = showAllDays ? (
        <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.allDaysScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
        >
            <View style={styles.bodyArea}>{CurrentSection}</View>
            {PreviousDaysSection}
        </ScrollView>
    ) : (
        <View style={styles.bodyArea}>{CurrentSection}</View>
    );

    return (
        <View style={styles.fullscreenRoot}>
            <LinearGradient
                colors={['rgba(0,0,0,0.92)', 'rgba(0,0,0,0.98)']}
                start={{ x: 0.0, y: 0.0 }}
                end={{ x: 1.0, y: 1.0 }}
                style={StyleSheet.absoluteFill}
            />

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fullscreenRoot}>
                <View style={[styles.fullscreenContent, { paddingTop: Math.max(10, insets.top + 10), paddingBottom: Math.max(10, insets.bottom + 10) }]}>
                    <LinearGradient
                        colors={['rgba(16,16,16,0.92)', 'rgba(6,6,6,0.84)']}
                        start={{ x: 0.05, y: 0.0 }}
                        end={{ x: 0.9, y: 1.0 }}
                        style={styles.panel3D}
                    >
                        <View style={styles.panelOuterRim} pointerEvents="none" />

                        <View style={styles.headerRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.title}>DIARY</Text>
                                <Text style={styles.subtitle}>{prettyDate}</Text>
                                <Text style={styles.statusLine}>{statusLabel}</Text>
                            </View>

                            <View style={styles.modeToggle}>
                                <TouchableOpacity
                                    style={[styles.modeChip, mode === 'view' && styles.modeChipActive]}
                                    onPress={switchToView}
                                    activeOpacity={0.85}
                                >
                                    <Text style={[styles.modeChipText, mode === 'view' && styles.modeChipTextActive]}>VIEW</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.modeChip, mode === 'edit' && styles.modeChipActive]}
                                    onPress={() => setMode('edit')}
                                    activeOpacity={0.85}
                                >
                                    <Text style={[styles.modeChipText, mode === 'edit' && styles.modeChipTextActive]}>EDIT</Text>
                                </TouchableOpacity>
                            </View>

                            <TouchableOpacity
                                style={[styles.allDaysChip, showAllDays && styles.allDaysChipActive]}
                                onPress={() => setShowAllDays(v => !v)}
                                activeOpacity={0.85}
                            >
                                <MaterialIcons name="view-day" size={14} color={showAllDays ? '#fff' : 'rgba(255,255,255,0.55)'} />
                                <Text style={[styles.allDaysChipText, showAllDays && styles.allDaysChipTextActive]}>ALL DAYS</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.closeBtn} onPress={handleClose} activeOpacity={0.8}>
                                <MaterialIcons name="close" size={18} color="rgba(255,255,255,0.75)" />
                            </TouchableOpacity>
                        </View>

                        {loading ? (
                            <View style={styles.loadingBlock}>
                                <Text style={styles.loadingText}>Loading…</Text>
                            </View>
                        ) : (
                            Body
                        )}
                    </LinearGradient>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    notesIconBtn: {
        width: 40,
        height: 40,
        marginLeft: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },
    notesIconInner: {
        width: 34,
        height: 34,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    notesIconInnerActive: {
        backgroundColor: 'rgba(76,175,80,0.12)',
    },
    noteDot: {
        position: 'absolute',
        top: 6,
        right: 6,
        width: 7,
        height: 7,
        borderRadius: 99,
        backgroundColor: 'rgba(255, 61, 0, 0.9)',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.5)',
    },
    noteDotActive: {
        backgroundColor: 'rgba(76, 175, 80, 0.95)',
    },

    fullscreenRoot: {
        flex: 1,
    },
    fullscreenContent: {
        flex: 1,
        paddingHorizontal: 12,
        paddingTop: 12,
        paddingBottom: 12,
    },

    panel3D: {
        flex: 1,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.45,
        shadowRadius: 24,
        elevation: 18,
    },
    panelOuterRim: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.18)',
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 12,
        gap: 10,
    },
    title: {
        fontSize: 13,
        fontWeight: '900',
        letterSpacing: 1.2,
        color: 'rgba(255,255,255,0.92)',
    },
    subtitle: {
        marginTop: 3,
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.6,
        color: 'rgba(255,255,255,0.42)',
    },
    statusLine: {
        marginTop: 6,
        fontSize: 9,
        fontWeight: '900',
        letterSpacing: 0.7,
        color: 'rgba(255,255,255,0.28)',
    },
    closeBtn: {
        width: 34,
        height: 34,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
    },

    loadingBlock: {
        padding: 16,
        minHeight: 160,
        justifyContent: 'center',
    },
    loadingText: {
        color: 'rgba(255,255,255,0.5)',
        fontWeight: '700',
        textAlign: 'center',
    },
    emptyState: {
        minHeight: 220,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 16,
    },
    emptyTitle: {
        marginTop: 4,
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 0.6,
        color: 'rgba(255,255,255,0.7)',
    },
    emptySubtitle: {
        fontSize: 10,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.35)',
        textAlign: 'center',
        paddingHorizontal: 18,
        lineHeight: 14,
    },
    primaryCta: {
        marginTop: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#fff',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.35,
        shadowRadius: 14,
        elevation: 12,
    },
    primaryCtaText: {
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 0.8,
        color: '#0A0A0A',
    },

    modeToggle: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        borderRadius: 14,
        padding: 3,
        gap: 4,
    },
    modeChip: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 11,
        backgroundColor: 'transparent',
    },
    modeChipActive: {
        backgroundColor: 'rgba(255,255,255,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
    },
    modeChipText: {
        fontSize: 9,
        fontWeight: '900',
        letterSpacing: 0.9,
        color: 'rgba(255,255,255,0.35)',
    },
    modeChipTextActive: {
        color: '#fff',
    },

    allDaysChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    allDaysChipActive: {
        backgroundColor: 'rgba(255,255,255,0.10)',
        borderColor: 'rgba(255,255,255,0.14)',
    },
    allDaysChipText: {
        fontSize: 9,
        fontWeight: '900',
        letterSpacing: 0.9,
        color: 'rgba(255,255,255,0.35)',
    },
    allDaysChipTextActive: {
        color: '#fff',
    },

    bodyArea: {
        flex: 1,
        paddingHorizontal: 14,
        paddingBottom: 14,
    },
    bodyInput: {
        flex: 1,
        padding: 14,
        color: 'rgba(255,255,255,0.88)',
        fontSize: 14,
        lineHeight: 20,
        fontWeight: '600',
        borderRadius: 18,
        backgroundColor: 'rgba(0,0,0,0.25)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    bodyReadContainer: {
        padding: 14,
        paddingBottom: 24,
        borderRadius: 18,
        backgroundColor: 'rgba(0,0,0,0.25)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    bodyReadText: {
        color: 'rgba(255,255,255,0.86)',
        fontSize: 14,
        lineHeight: 21,
        fontWeight: '600',
    },
    bodyReadInput: {
        flex: 1,
        padding: 14,
        paddingBottom: 24,
        borderRadius: 18,
        backgroundColor: 'rgba(0,0,0,0.25)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        color: 'rgba(255,255,255,0.86)',
        fontSize: 14,
        lineHeight: 21,
        fontWeight: '600',
    },
    emptyStateCompact: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingHorizontal: 18,
        borderRadius: 18,
        backgroundColor: 'rgba(0,0,0,0.22)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },

    allDaysScrollContent: {
        paddingBottom: 16,
    },
    allDaysSection: {
        paddingHorizontal: 14,
        paddingBottom: 16,
        gap: 10,
    },
    allDaysHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    allDaysTitle: {
        fontSize: 9,
        fontWeight: '900',
        letterSpacing: 1.2,
        color: 'rgba(255,255,255,0.30)',
    },
    allDaysCount: {
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 0.6,
        color: 'rgba(255,255,255,0.22)',
    },
    allDaysLoadingText: {
        fontSize: 10,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.30)',
    },
    allDaysEmptyText: {
        fontSize: 10,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.24)',
    },
    allDaysList: {
        gap: 10,
    },
    dayNoteBlock: {
        borderRadius: 18,
        padding: 12,
        backgroundColor: 'rgba(0,0,0,0.22)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    dayNoteHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    dayNoteDate: {
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 0.8,
        color: 'rgba(255,255,255,0.65)',
    },
    dayNoteText: {
        fontSize: 12,
        lineHeight: 18,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.78)',
    },

    // text-only diary
});

