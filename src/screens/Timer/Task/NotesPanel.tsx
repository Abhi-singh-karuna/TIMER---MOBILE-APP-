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
    Keyboard,
    Modal,
    TouchableWithoutFeedback,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { RichEditor, RichToolbar, actions } from 'react-native-pell-rich-editor';
import DiaryTab from './DiaryTab';

const NOTES_STORAGE_KEY = '@timer_app_day_notes_v2';
const TEMPLATES_STORAGE_KEY = '@timer_app_diary_templates';
const FOLDERS_STORAGE_KEY = '@timer_app_diary_folders';
const GENERAL_NOTES_STORAGE_KEY = '@timer_app_general_notes';
const NOTES_LOCKS_ENABLED_KEY = '@timer_app_notes_locks_enabled_v1';
const NOTES_LOCKS_REQUIRE_EVERY_TIME_KEY = '@timer_app_notes_locks_require_every_time_v1';
const NOTES_LOCKS_MAX_ATTEMPTS_KEY = '@timer_app_notes_locks_max_attempts_v1';

const TRASH_FOLDER_ID = '__trash__';
const NOTES_DEFAULT_TEXT_COLOR = 'rgba(255,255,255,0.86)';
const NOTES_COLOR_OPTIONS = [
    NOTES_DEFAULT_TEXT_COLOR,
    'rgba(255,255,255,0.72)',
    '#E91E63', // pink
    '#9C27B0', // purple
    '#2196F3', // blue
    '#00BCD4', // cyan
    '#4CAF50', // green
    '#FF9800', // orange
    '#FFEB3B', // yellow
    '#FF3D00', // red
] as const;

type NotesMap = Record<string, { 
    text: string; 
    updatedAt: number;
    mood?: string;
    weather?: string;
}>;

type DiaryTemplate = {
    id: string;
    label: string;
    emoji: string;
    text: string;
    isCustom?: boolean;
};

type Folder = {
    id: string;
    name: string;
    emoji: string;
    color?: string;
    isLocked?: boolean;
    lockCode?: string; // 4 digits
    createdAt: number;
    trashedAt?: number;
};

type GeneralNote = {
    id: string;
    folderId: string;
    trashedFromFolderId?: string;
    trashedAt?: number;
    title?: string;
    text: string;
    updatedAt: number;
};

const MOODS = [
    { id: 'inspired', label: 'Inspired', emoji: '✨' },
    { id: 'happy', label: 'Happy', emoji: '😊' },
    { id: 'calm', label: 'Calm', emoji: '🧘' },
    { id: 'focused', label: 'Focused', emoji: '🎯' },
    { id: 'sleepy', label: 'Sleepy', emoji: '😴' },
];

const WEATHERS = [
    { id: 'sunny', label: 'Sunny', emoji: '☀️' },
    { id: 'overcast', label: 'Overcast', emoji: '☁️' },
    { id: 'rainy', label: 'Rainy', emoji: '🌧️' },
    { id: 'cloudy', label: 'Cloudy', emoji: '⛅' },
];

const DIARY_TEMPLATES: DiaryTemplate[] = [
    { 
        id: 'gratitude', 
        label: 'Gratitude', 
        emoji: '🙏',
        text: "1. Three things I'm grateful for today:\n• \n• \n• \n\n2. What would have made today even better?\n• \n\n3. My affirmation for today:\n• ",
        isCustom: false
    },
    { 
        id: 'reflection', 
        label: 'Daily Reflection', 
        emoji: '💭',
        text: "• Best thing that happened today: \n\n• What was a challenge today and how did I handle it? \n\n• One thing I learned today: \n\n• How am I feeling right now?",
        isCustom: false
    },
    { 
        id: 'productivity', 
        label: 'Quick Log', 
        emoji: '📝',
        text: "• Focus of the day: \n• Key achievements: \n   - \n   - \n• Tomorrow's top priority: ",
        isCustom: false
    },
    { 
        id: 'morning', 
        label: 'Morning Routine', 
        emoji: '☀️',
        text: "• Wake up time: \n• First thing I did: \n• Top goal for today: \n• One thing I'm looking forward to: ",
        isCustom: false
    },
    { 
        id: 'weekly', 
        label: 'Weekly Review', 
        emoji: '📅',
        text: "• Wins of the week: \n• What went well? \n• What could be improved? \n• Plan for next week: ",
        isCustom: false
    },
    { 
        id: 'ideas', 
        label: 'Idea Dump', 
        emoji: '💡',
        text: "• Category: \n• Idea description: \n• Possible next steps: \n• Why this excites me: ",
        isCustom: false
    },
    { 
        id: 'workout', 
        label: 'Workout Log', 
        emoji: '💪',
        text: "• Type of exercise: \n• Duration: \n• Intensity (1-10): \n• How I feel afterwards: ",
        isCustom: false
    },
    { 
        id: 'mood_tracker', 
        label: 'Mood Tracker', 
        emoji: '🌈',
        text: "• Current Mood: \n• What triggered this feeling? \n• What can I do to feel better? ",
        isCustom: false
    },
];

const PRESET_FOLDER_COLORS = ['#4CAF50', '#2196F3', '#9C27B0', '#FF9800', '#E91E63', '#00BCD4', '#795548'];
const PRESET_FOLDER_EMOJIS = ['📁', '📂', '📝', '💼', '🏠', '🌟', '🎯', '💡', '🎨', '🚀'];

function getTrashFolder(): Folder {
    return {
        id: TRASH_FOLDER_ID,
        name: 'Trash',
        emoji: '🗑️',
        color: '#FF3D00',
        createdAt: 0,
    };
}

function ensureTrashFolder(folders: Folder[]): { folders: Folder[]; changed: boolean } {
    const hasTrash = folders.some(f => f.id === TRASH_FOLDER_ID);
    if (hasTrash) return { folders, changed: false };
    return { folders: [getTrashFolder(), ...folders], changed: true };
}

function sortFoldersWithTrashLast(list: Folder[]): Folder[] {
    const trash = list.find(f => f.id === TRASH_FOLDER_ID);
    const rest = list.filter(f => f.id !== TRASH_FOLDER_ID).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return trash ? [...rest, trash] : rest;
}

function stripHtmlToText(html: string): string {
    const input = (html || '').toString();
    return input
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<\/(p|div|br|li|h1|h2|h3|h4|h5|h6)>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<li[^>]*>/gi, '• ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function plainTextToHtml(text: string): string {
    const t = (text || '').toString();
    const escaped = t
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    return `<div>${escaped.replace(/\n/g, '<br/>')}</div>`;
}

function normalizeNoteContentToHtml(content: string): string {
    const c = (content || '').toString().trim();
    if (!c) return '';
    const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(c);
    return looksLikeHtml ? c : plainTextToHtml(c);
}

async function readNotesMap(): Promise<NotesMap> {
    try {
        const raw = await AsyncStorage.getItem(NOTES_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object') ? parsed : {};
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

async function readTemplates(): Promise<DiaryTemplate[]> {
    try {
        const raw = await AsyncStorage.getItem(TEMPLATES_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

async function saveTemplates(templates: DiaryTemplate[]) {
    try {
        await AsyncStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
    } catch {
        // ignore
    }
}

async function readFolders(): Promise<Folder[]> {
    try {
        const raw = await AsyncStorage.getItem(FOLDERS_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

async function saveFolders(folders: Folder[]) {
    try {
        await AsyncStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(folders));
    } catch {
        // ignore
    }
}

async function readBool(key: string, fallback: boolean): Promise<boolean> {
    try {
        const raw = await AsyncStorage.getItem(key);
        if (raw === null) return fallback;
        return raw === '1' || raw === 'true';
    } catch {
        return fallback;
    }
}

async function writeBool(key: string, value: boolean) {
    try {
        await AsyncStorage.setItem(key, value ? '1' : '0');
    } catch {
        // ignore
    }
}

async function readGeneralNotes(): Promise<GeneralNote[]> {
    try {
        const raw = await AsyncStorage.getItem(GENERAL_NOTES_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

async function saveGeneralNotes(notes: GeneralNote[]) {
    try {
        await AsyncStorage.setItem(GENERAL_NOTES_STORAGE_KEY, JSON.stringify(notes));
    } catch {
        // ignore
    }
}

export async function hasDayNote(dateKey: string): Promise<boolean> {
    const text = (await getDayNote(dateKey)).text.trim();
    return text.length > 0;
}

export async function getDayNote(dateKey: string): Promise<{ text: string, mood?: string, weather?: string }> {
    const map = await readNotesMap();
    const entry = map?.[dateKey];
    if (!entry) return { text: '' };
    return { 
        text: entry.text || '', 
        mood: entry.mood, 
        weather: entry.weather 
    };
}

export async function setDayNote(
    dateKey: string, 
    text: string, 
    mood?: string, 
    weather?: string
): Promise<boolean> {
    const map = await readNotesMap();
    const trimmed = (text || '').trim();

    if (trimmed.length === 0 && !mood && !weather) {
        if (map[dateKey]) {
            delete map[dateKey];
            await writeNotesMap(map);
        }
        return false;
    }

    map[dateKey] = { 
        text: text || '', 
        updatedAt: Date.now(),
        mood,
        weather
    };
    await writeNotesMap(map);
    return true;
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
    dateKey: string; 
    onClose: () => void;
    onPresenceChange?: (hasNote: boolean) => void;
};

export default function NotesPanel({ visible, dateKey, onClose, onPresenceChange }: NotesPanelProps) {
    const insets = useSafeAreaInsets();
    const { width, height } = useWindowDimensions();
    const isLandscape = width > height;
    const folderModalMaxHeight = React.useMemo(() => {
        // Prevent content from overlapping the create button in landscape/smaller heights
        return Math.floor(height * (isLandscape ? 0.72 : 0.82));
    }, [height, isLandscape]);

    const [loading, setLoading] = React.useState(false);
    const [savedText, setSavedText] = React.useState('');
    const [draftText, setDraftText] = React.useState('');
    const [savedTitle, setSavedTitle] = React.useState('');
    const [draftTitle, setDraftTitle] = React.useState('');
    const [mood, setMood] = React.useState<string | undefined>();
    const [weather, setWeather] = React.useState<string | undefined>();
    
    const [mode, setMode] = React.useState<'view' | 'edit'>('edit');
    const [showAllDays, setShowAllDays] = React.useState(false);
    const [allDaysLoading, setAllDaysLoading] = React.useState(false);
    const [allDaysNotes, setAllDaysNotes] = React.useState<Array<{ dateKey: string; text: string; updatedAt: number }>>([]);
    const [expandedAllDays, setExpandedAllDays] = React.useState<Record<string, boolean>>({});
    
    const [isAutoSaving, setIsAutoSaving] = React.useState(false);
    const [lastSavedTime, setLastSavedTime] = React.useState<string>('');
    const autoSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const [customTemplates, setCustomTemplates] = React.useState<DiaryTemplate[]>([]);
    const [isEditingTemplate, setIsEditingTemplate] = React.useState<DiaryTemplate | null>(null);
    const [templateLabel, setTemplateLabel] = React.useState('');
    const [templateContent, setTemplateContent] = React.useState('');

    // Notes & Folders System State
    const [currentTab, setCurrentTab] = React.useState<'diary' | 'notes'>('diary');
    const [folders, setFolders] = React.useState<Folder[]>([]);
    const [currentFolderId, setCurrentFolderId] = React.useState<string | null>(null);
    const [currentNoteId, setCurrentNoteId] = React.useState<string | null>(null);
    const [generalNotes, setGeneralNotes] = React.useState<GeneralNote[]>([]);
    const [isCreatingFolder, setIsCreatingFolder] = React.useState(false);
    const [folderToEdit, setFolderToEdit] = React.useState<Folder | null>(null);
    const [newFolderName, setNewFolderName] = React.useState('');
    const [newFolderEmoji, setNewFolderEmoji] = React.useState(PRESET_FOLDER_EMOJIS[0]);
    const [newFolderColor, setNewFolderColor] = React.useState(PRESET_FOLDER_COLORS[0]);
    const [newFolderLocked, setNewFolderLocked] = React.useState(false);
    const [newFolderLockCode, setNewFolderLockCode] = React.useState('');

    const [confirmMoveToTrashNoteId, setConfirmMoveToTrashNoteId] = React.useState<string | null>(null);
    const [confirmDeleteForeverNoteId, setConfirmDeleteForeverNoteId] = React.useState<string | null>(null);
    const [confirmDeleteAllTrashVisible, setConfirmDeleteAllTrashVisible] = React.useState(false);
    const [confirmDeleteForeverFolderId, setConfirmDeleteForeverFolderId] = React.useState<string | null>(null);
    
    const [isKeyboardVisible, setIsKeyboardVisible] = React.useState(false);
    const richEditorRef = React.useRef<RichEditor | null>(null);
    const [isNotesEditorExpanded, setIsNotesEditorExpanded] = React.useState(false);
    const [showNotesInlineConfig, setShowNotesInlineConfig] = React.useState(false);
    const [notesEditorFontSizePx, setNotesEditorFontSizePx] = React.useState(17);
    const [folderActionsPopupFolder, setFolderActionsPopupFolder] = React.useState<Folder | null>(null);
    const [folderLockModalFolder, setFolderLockModalFolder] = React.useState<Folder | null>(null);
    const [folderLockPin, setFolderLockPin] = React.useState('');
    const [isDeletingLockedFolder, setIsDeletingLockedFolder] = React.useState(false);
    const [notesEditorTextColor, setNotesEditorTextColor] = React.useState(NOTES_DEFAULT_TEXT_COLOR);

    const [pinModalVisible, setPinModalVisible] = React.useState(false);
    const [pinDraft, setPinDraft] = React.useState('');
    const [pinError, setPinError] = React.useState<string | null>(null);
    const [pendingLockedFolderId, setPendingLockedFolderId] = React.useState<string | null>(null);
    const [unlockedFolderIds, setUnlockedFolderIds] = React.useState<Record<string, boolean>>({});

    const [notesLocksEnabled, setNotesLocksEnabled] = React.useState(true);
    const [notesLocksRequireEveryTime, setNotesLocksRequireEveryTime] = React.useState(false);
    const [notesLocksMaxAttempts, setNotesLocksMaxAttempts] = React.useState(5);
    const [failedUnlockAttempts, setFailedUnlockAttempts] = React.useState<Record<string, number>>({});
    const [lockedOutFolderIds, setLockedOutFolderIds] = React.useState<Record<string, boolean>>({});

    const [showMentions, setShowMentions] = React.useState(false);
    const [mentionOptions, setMentionOptions] = React.useState<string[]>([]);
    const [mentionPos, setMentionPos] = React.useState({ x: 0, y: 0 });

    const isPortrait = height > width;

    const isDirty = React.useMemo(() => {
        if (currentTab === 'notes') return draftText !== savedText || draftTitle !== savedTitle;
        return draftText !== savedText;
    }, [currentTab, draftText, savedText, draftTitle, savedTitle]);
    const plainDraftText = React.useMemo(() => stripHtmlToText(draftText), [draftText]);
    const charCount = plainDraftText.length;
    const readTime = Math.max(1, Math.ceil(charCount / 500));
    const trashCount = React.useMemo(() => {
        const notesInTrash = generalNotes.filter(n => n.folderId === TRASH_FOLDER_ID).length;
        const trashedFolders = folders.filter(f => f.id !== TRASH_FOLDER_ID && f.trashedAt).length;
        return notesInTrash + trashedFolders;
    }, [generalNotes, folders]);

    const noteTitleFor = React.useCallback((note?: GeneralNote | null) => {
        const t = (note?.title || '').trim();
        return t.length ? t : 'Untitled note';
    }, []);

    const fullDateDisplay = React.useMemo(() => {
        const [y, m, d] = dateKey.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
        const monthName = date.toLocaleDateString('en-US', { month: 'short' });
        return `${dayName}, ${d} ${monthName}`;
    }, [dateKey]);

    const load = React.useCallback(async (key: string) => {
        setLoading(true);
        try {
            const data = await getDayNote(key);
            const html = normalizeNoteContentToHtml(data.text);
            setSavedText(html);
            setDraftText(html);
            setSavedTitle('');
            setDraftTitle('');
            setMood(data.mood);
            setWeather(data.weather);
            const has = stripHtmlToText(data.text).trim().length > 0;
            setMode(has ? 'view' : 'edit');
            onPresenceChange?.(has);
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
                const entry = map[k];
                if (!entry || !stripHtmlToText(entry.text).trim()) return;
                items.push({ dateKey: k, text: entry.text, updatedAt: entry.updatedAt || 0 });
            });

            items.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
            setAllDaysNotes(items);
        } finally {
            setAllDaysLoading(false);
        }
    }, []);

    const loadTemplates = React.useCallback(async () => {
        let stored = await readTemplates();
        
        // Auto-sync missing defaults
        const missingDefaults = DIARY_TEMPLATES.filter(d => !stored.some(s => s.id === d.id));
        if (missingDefaults.length > 0) {
            stored = [...stored, ...missingDefaults];
            await saveTemplates(stored);
        }
        
        setCustomTemplates(stored);
    }, []);

    const loadFoldersData = React.useCallback(async () => {
        const storedFoldersRaw = await readFolders();
        const storedNotes = await readGeneralNotes();
        const ensured = ensureTrashFolder(storedFoldersRaw || []);
        const nextFolders = sortFoldersWithTrashLast(ensured.folders);
        setFolders(nextFolders);
        setGeneralNotes(storedNotes);
        if (ensured.changed) {
            await saveFolders(nextFolders);
        }
    }, []);

    React.useEffect(() => {
        const showSubscription = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardVisible(true));
        const hideSubscription = Keyboard.addListener('keyboardDidHide', () => setIsKeyboardVisible(false));
        return () => {
            showSubscription.remove();
            hideSubscription.remove();
        };
    }, []);

    React.useEffect(() => {
        loadTemplates();
        loadFoldersData();
    }, [loadTemplates, loadFoldersData]);

    React.useEffect(() => {
        (async () => {
            const [enabled, requireEveryTime] = await Promise.all([
                readBool(NOTES_LOCKS_ENABLED_KEY, true),
                readBool(NOTES_LOCKS_REQUIRE_EVERY_TIME_KEY, false),
            ]);
            setNotesLocksEnabled(enabled);
            setNotesLocksRequireEveryTime(requireEveryTime);
            try {
                const raw = await AsyncStorage.getItem(NOTES_LOCKS_MAX_ATTEMPTS_KEY);
                const n = raw ? Number(raw) : 5;
                setNotesLocksMaxAttempts(Number.isFinite(n) ? Math.max(1, Math.min(20, Math.floor(n))) : 5);
            } catch {
                setNotesLocksMaxAttempts(5);
            }
        })();
    }, []);

    React.useEffect(() => {
        if (!visible) return;
        (async () => {
            const [enabled, requireEveryTime] = await Promise.all([
                readBool(NOTES_LOCKS_ENABLED_KEY, true),
                readBool(NOTES_LOCKS_REQUIRE_EVERY_TIME_KEY, false),
            ]);
            setNotesLocksEnabled(enabled);
            setNotesLocksRequireEveryTime(requireEveryTime);
            try {
                const raw = await AsyncStorage.getItem(NOTES_LOCKS_MAX_ATTEMPTS_KEY);
                const n = raw ? Number(raw) : 5;
                setNotesLocksMaxAttempts(Number.isFinite(n) ? Math.max(1, Math.min(20, Math.floor(n))) : 5);
            } catch {
                setNotesLocksMaxAttempts(5);
            }
        })();
    }, [visible]);

    const handleCreateTemplate = () => {
        setIsEditingTemplate({ id: Date.now().toString(), label: '', emoji: '📝', text: '', isCustom: true });
        setTemplateLabel('');
        setTemplateContent('');
    };

    const handleEditTemplate = (template: DiaryTemplate) => {
        setIsEditingTemplate(template);
        setTemplateLabel(template.label);
        setTemplateContent(template.text);
    };

    const handleSaveTemplate = async () => {
        if (!templateLabel.trim() || !templateContent.trim() || !isEditingTemplate) return;
        
        const newTemplate = { ...isEditingTemplate, label: templateLabel, text: templateContent };
        const updated = customTemplates.filter(t => t.id !== isEditingTemplate.id).concat(newTemplate);
        
        setCustomTemplates(updated);
        await saveTemplates(updated);
        setIsEditingTemplate(null);
    };

    const handleDeleteTemplate = async (id: string) => {
        const remaining = customTemplates.filter(t => t.id !== id);
        setCustomTemplates(remaining);
        await saveTemplates(remaining);
    };

    const allTemplates = customTemplates;

    const currentFolder = React.useMemo(() => 
        folders.find(f => f.id === currentFolderId), [folders, currentFolderId]);
    
    const currentNote = React.useMemo(() => 
        generalNotes.find(n => n.id === currentNoteId), [generalNotes, currentNoteId]);

    const isExpandedNotesEditor = currentTab === 'notes' && !!currentNoteId && isNotesEditorExpanded;

    React.useEffect(() => {
        if (currentTab !== 'notes' || !currentNoteId) setIsNotesEditorExpanded(false);
    }, [currentTab, currentNoteId]);

    React.useEffect(() => {
        if (mode !== 'edit') setShowNotesInlineConfig(false);
    }, [mode]);

    const applyNotesEditorAppearance = React.useCallback(() => {
        const px = Math.max(12, Math.min(24, notesEditorFontSizePx));
        richEditorRef.current?.commandDOM(
            `document.body.style.fontSize='${px}px';document.body.style.color='${NOTES_DEFAULT_TEXT_COLOR}';`
        );
    }, [notesEditorFontSizePx]);

    const applySelectionTextColor = React.useCallback((color: string) => {
        setNotesEditorTextColor(color);
        richEditorRef.current?.commandDOM(
            `document.execCommand('styleWithCSS', false, true);document.execCommand('foreColor', false, '${color}');`
        );
    }, []);

    const openFolderWithLockCheck = React.useCallback((folderId: string) => {
        const folder = folders.find(f => f.id === folderId);
        if (!folder) return;
        if (lockedOutFolderIds[folderId]) return;
        if (!notesLocksEnabled || !folder.isLocked || !folder.lockCode) {
            setCurrentFolderId(folderId);
            return;
        }
        if (!notesLocksRequireEveryTime && unlockedFolderIds[folderId]) {
            setCurrentFolderId(folderId);
            return;
        }
        setPendingLockedFolderId(folderId);
        setPinDraft('');
        setPinError(null);
        setPinModalVisible(true);
    }, [folders, unlockedFolderIds, notesLocksEnabled, notesLocksRequireEveryTime, lockedOutFolderIds]);

    const openEditFolderModal = React.useCallback((folder: Folder) => {
        setFolderToEdit(folder);
        setNewFolderName(folder.name);
        setNewFolderEmoji(folder.emoji);
        setNewFolderColor(folder.color || PRESET_FOLDER_COLORS[0]);
        setNewFolderLocked(!!folder.isLocked);
        setNewFolderLockCode((folder.lockCode || '').toString());
        setIsCreatingFolder(true);
    }, []);

    const openEditFolderModalWithLockToggle = React.useCallback((folder: Folder) => {
        // Toggle lock/unlock, but still open the "EDIT FOLDER" popup so user can confirm/update.
        const nextLocked = !folder.isLocked;
        setFolderToEdit(folder);
        setNewFolderName(folder.name);
        setNewFolderEmoji(folder.emoji);
        setNewFolderColor(folder.color || PRESET_FOLDER_COLORS[0]);
        setNewFolderLocked(nextLocked);
        // If we are locking, require user to enter the 4-digit code.
        setNewFolderLockCode(nextLocked ? '' : (folder.lockCode || '').toString());
        setIsCreatingFolder(true);
    }, []);


    const onSubmitPin = React.useCallback(async () => {
        const pin = pinDraft.trim();
        if (!/^\d{4}$/.test(pin)) return;

        const folder = pendingLockedFolderId ? folders.find(f => f.id === pendingLockedFolderId) : null;
        if (folder?.lockCode && pin === folder.lockCode) {
            setPinModalVisible(false);
            setPinDraft('');
            setPinError(null);
            if (pendingLockedFolderId) {
                setUnlockedFolderIds(prev => ({ ...prev, [pendingLockedFolderId]: true }));
                setCurrentFolderId(pendingLockedFolderId);
                setFailedUnlockAttempts(prev => ({ ...prev, [pendingLockedFolderId]: 0 }));
                setLockedOutFolderIds(prev => ({ ...prev, [pendingLockedFolderId]: false }));
                setPendingLockedFolderId(null);
            }
        } else {
            if (pendingLockedFolderId) {
                setFailedUnlockAttempts(prev => {
                    const nextCount = (prev[pendingLockedFolderId] || 0) + 1;
                    const remaining = Math.max(0, notesLocksMaxAttempts - nextCount);
                    setPinError(remaining === 0 ? 'Too many attempts. Folder locked.' : `Wrong code. ${remaining} attempts left.`);
                    if (nextCount >= notesLocksMaxAttempts) {
                        setLockedOutFolderIds(p => ({ ...p, [pendingLockedFolderId]: true }));
                        setPinModalVisible(false);
                        setPendingLockedFolderId(null);
                    }
                    return { ...prev, [pendingLockedFolderId]: nextCount };
                });
            } else {
                setPinError('Wrong code.');
            }
            setPinDraft('');
        }
    }, [pinDraft, pendingLockedFolderId, folders, notesLocksMaxAttempts]);

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        if (folderToEdit?.id === TRASH_FOLDER_ID) return;
        if (newFolderLocked && !/^\d{4}$/.test(newFolderLockCode.trim())) return;
        
        if (folderToEdit) {
            // UPDATE EXISTING
            const updated = folders.map(f => f.id === folderToEdit.id ? {
                ...f,
                name: newFolderName,
                emoji: newFolderEmoji,
                color: newFolderColor,
                isLocked: newFolderLocked,
                lockCode: newFolderLocked ? newFolderLockCode.trim() : undefined,
            } : f);
            setFolders(updated);
            await saveFolders(updated);
        } else {
            // CREATE NEW
            const newFolder: Folder = {
                id: Date.now().toString(),
                name: newFolderName,
                emoji: newFolderEmoji,
                color: newFolderColor,
                isLocked: newFolderLocked,
                lockCode: newFolderLocked ? newFolderLockCode.trim() : undefined,
                createdAt: Date.now(),
            };
            const updated = [...folders, newFolder];
            setFolders(updated);
            await saveFolders(updated);
        }

        setNewFolderName('');
        setNewFolderEmoji(PRESET_FOLDER_EMOJIS[0]);
        setNewFolderColor(PRESET_FOLDER_COLORS[0]);
        setNewFolderLocked(false);
        setNewFolderLockCode('');
        setFolderToEdit(null);
        setIsCreatingFolder(false);
    };

    const handleCreateNote = async () => {
        if (!currentFolderId) return;
        const newNote: GeneralNote = {
            id: Date.now().toString(),
            folderId: currentFolderId,
            title: '',
            text: '',
            updatedAt: Date.now(),
        };
        const updated = [...generalNotes, newNote];
        setGeneralNotes(updated);
        await saveGeneralNotes(updated);
        setCurrentNoteId(newNote.id);
        setDraftTitle('');
        setSavedTitle('');
        setDraftText('');
        setSavedText('');
        setMode('edit');
    };

    const moveNoteToTrash = React.useCallback(async (id: string) => {
        const note = generalNotes.find(n => n.id === id);
        if (!note) return;
        if (note.folderId === TRASH_FOLDER_ID) return;
        const updated = generalNotes.map(n => n.id === id ? ({
            ...n,
            folderId: TRASH_FOLDER_ID,
            trashedFromFolderId: n.folderId,
            trashedAt: Date.now(),
            updatedAt: Date.now(),
        }) : n);
        setGeneralNotes(updated);
        await saveGeneralNotes(updated);
        if (currentNoteId === id) {
            setCurrentNoteId(null);
            setDraftText('');
            setSavedText('');
        }
    }, [generalNotes, currentNoteId]);

    const deleteNoteForever = React.useCallback(async (id: string) => {
        const remaining = generalNotes.filter(n => n.id !== id);
        setGeneralNotes(remaining);
        await saveGeneralNotes(remaining);
        if (currentNoteId === id) {
            setCurrentNoteId(null);
            setDraftText('');
            setSavedText('');
        }
    }, [generalNotes, currentNoteId]);

    const deleteAllTrashNotes = React.useCallback(async () => {
        const trashNotes = generalNotes.filter(n => n.folderId === TRASH_FOLDER_ID);
        const trashedFolders = folders.filter(f => f.trashedAt);
        
        if (trashNotes.length === 0 && trashedFolders.length === 0) {
            setConfirmDeleteAllTrashVisible(false);
            return;
        }

        const remainingFolders = folders.filter(f => !f.trashedAt);
        const remainingNotes = generalNotes.filter(n => {
            const isNoteIndividuallyTrashed = n.folderId === TRASH_FOLDER_ID;
            const isNoteInTrashedFolder = trashedFolders.some(f => f.id === n.folderId);
            return !isNoteIndividuallyTrashed && !isNoteInTrashedFolder;
        });

        setFolders(remainingFolders);
        setGeneralNotes(remainingNotes);
        await saveFolders(remainingFolders);
        await saveGeneralNotes(remainingNotes);

        if (currentNoteId && (trashNotes.some(n => n.id === currentNoteId) || trashedFolders.some(f => f.id === currentNoteId))) {
            setCurrentNoteId(null);
            setDraftTitle('');
            setSavedTitle('');
            setDraftText('');
            setSavedText('');
            setMode('edit');
            setIsNotesEditorExpanded(false);
        }

        setConfirmDeleteAllTrashVisible(false);
    }, [generalNotes, folders, currentNoteId]);

    const restoreNoteFromTrash = React.useCallback(async (id: string) => {
        const note = generalNotes.find(n => n.id === id);
        if (!note) return;
        if (note.folderId !== TRASH_FOLDER_ID) return;

        const desiredFolderId = note.trashedFromFolderId;
        const desiredFolder = desiredFolderId ? folders.find(f => f.id === desiredFolderId && f.id !== TRASH_FOLDER_ID) : null;
        let targetFolderId = desiredFolder?.id ?? null;
        let nextFolders = folders;

        if (desiredFolder && desiredFolder.trashedAt) {
            // Restore the folder too if it was trashed
            nextFolders = folders.map(f => f.id === desiredFolderId ? { ...f, trashedAt: undefined } : f);
            setFolders(nextFolders);
            await saveFolders(nextFolders);
        } else if (!targetFolderId) {
            const fallbackFolder = folders.find(f => f.id !== TRASH_FOLDER_ID && !f.trashedAt);
            if (fallbackFolder) {
                targetFolderId = fallbackFolder.id;
            } else {
                const restoredFolder: Folder = {
                    id: `restored_${Date.now().toString()}`,
                    name: 'Restored',
                    emoji: '📥',
                    color: '#2196F3',
                    createdAt: Date.now(),
                };
                nextFolders = sortFoldersWithTrashLast([restoredFolder, ...folders.filter(f => f.id !== TRASH_FOLDER_ID), getTrashFolder()]);
                targetFolderId = restoredFolder.id;
                setFolders(nextFolders);
                await saveFolders(nextFolders);
            }
        }

        const updated = generalNotes.map(n => n.id === id ? ({
            ...n,
            folderId: targetFolderId!,
            trashedAt: undefined,
            trashedFromFolderId: undefined,
            updatedAt: Date.now(),
        }) : n);

        setGeneralNotes(updated);
        await saveGeneralNotes(updated);
    }, [generalNotes, folders]);

    const handleDeleteFolder = async (id: string) => {
        if (id === TRASH_FOLDER_ID) return;

        const now = Date.now();
        const updatedFolders = folders.map(f => f.id === id ? { ...f, trashedAt: now } : f);
        
        setFolders(updatedFolders);
        await saveFolders(updatedFolders);
        
        const deletingFolderIsOpen = currentFolderId === id;
        const deletingNoteIsOpen = !!currentNoteId && generalNotes.some(n => n.id === currentNoteId && n.folderId === id);

        if (deletingFolderIsOpen || deletingNoteIsOpen) {
            // After trashing a folder, show the Trash so the user can see it.
            setCurrentFolderId(TRASH_FOLDER_ID);
            setCurrentNoteId(null);
            setIsNotesEditorExpanded(false);
            setDraftTitle('');
            setSavedTitle('');
            setDraftText('');
            setSavedText('');
            setMode('edit');
        }
    };

    const handleToggleFolderLock = React.useCallback(async () => {
        if (!folderLockModalFolder) return;
        const pin = folderLockPin.trim();
        if (!/^\d{4}$/.test(pin)) return;

        const f = folderLockModalFolder;
        const isLocking = !f.isLocked;

        if (!isLocking) {
            // Unlocking: verify PIN
            if (pin !== (f.lockCode || '').toString()) {
                // We'll reset PIN on error
                setFolderLockPin('');
                return;
            }
        }

        const updatedFolders = folders.map(folder => {
            if (folder.id === f.id) {
                return {
                    ...folder,
                    isLocked: isLocking,
                    lockCode: isLocking ? pin : '',
                };
            }
            return folder;
        });

        setFolders(updatedFolders);
        await saveFolders(updatedFolders);
        
        if (isDeletingLockedFolder) {
            handleDeleteFolder(f.id);
            setIsDeletingLockedFolder(false);
        }

        setFolderLockModalFolder(null);
        setFolderLockPin('');
    }, [folderLockModalFolder, folderLockPin, folders, isDeletingLockedFolder, handleDeleteFolder]);

    const restoreFolderFromTrash = React.useCallback(async (id: string) => {
        const updated = folders.map(f => f.id === id ? { ...f, trashedAt: undefined } : f);
        setFolders(updated);
        await saveFolders(updated);
    }, [folders]);

    const deleteFolderForever = React.useCallback(async (id: string) => {
        if (id === TRASH_FOLDER_ID) return;
        const remainingFolders = folders.filter(f => f.id !== id);
        const remainingNotes = generalNotes.filter(n => n.folderId !== id);
        
        setFolders(remainingFolders);
        setGeneralNotes(remainingNotes);
        
        await saveFolders(remainingFolders);
        await saveGeneralNotes(remainingNotes);
        
        if (currentFolderId === id) {
            setCurrentFolderId(null);
        }
    }, [folders, generalNotes, currentFolderId]);

    const handleSaveGeneralNote = async (text: string, title: string) => {
        if (!currentNoteId) return;
        const updated = generalNotes.map(n => 
            n.id === currentNoteId ? { ...n, text, title, updatedAt: Date.now() } : n
        );
        setGeneralNotes(updated);
        await saveGeneralNotes(updated);
        setSavedText(text);
        setSavedTitle(title);
    };

    // Auto-save logic updated for general notes
    React.useEffect(() => {
        if (!visible || !isDirty) return;

        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        setIsAutoSaving(true);
        
        autoSaveTimerRef.current = setTimeout(async () => {
            try {
                if (currentTab === 'diary') {
                    await setDayNote(dateKey, draftText, mood, weather);
                    setSavedText(draftText);
                } else {
                    await handleSaveGeneralNote(draftText, draftTitle);
                }
                setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
                onPresenceChange?.(plainDraftText.trim().length > 0);
            } finally {
                setIsAutoSaving(false);
            }
        }, 1500);

        return () => {
            if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        };
    }, [visible, isDirty, draftText, draftTitle, dateKey, mood, weather, currentTab, currentNoteId, plainDraftText, onPresenceChange]);

    React.useEffect(() => {
        if (visible) load(dateKey);
    }, [visible, dateKey, load]);

    React.useEffect(() => {
        if (visible && showAllDays) loadAllDays();
    }, [visible, showAllDays, loadAllDays]);

    const triggerMentionCoords = React.useCallback(() => {
        richEditorRef.current?.commandDOM(`
            (function(){
                var sel = window.getSelection();
                if (sel.rangeCount > 0) {
                    var range = sel.getRangeAt(0);
                    var rect = range.getBoundingClientRect();
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'MENTION_COORDS',
                        data: { x: rect.left, y: rect.top }
                    }));
                }
            })()
        `);
    }, []);

    const handleEditorMessage = React.useCallback((event: any) => {
        try {
            const data = (event && event.nativeEvent && event.nativeEvent.data) || event;
            const msg = typeof data === 'string' ? JSON.parse(data) : data;
            if (msg.type === 'MENTION_COORDS') {
                setMentionPos(msg.data);
            }
        } catch (e) {
            // ignore
        }
    }, []);

    if (!visible) return null;

    return (
        <View style={styles.container}>
            <LinearGradient colors={['#000', '#0A0A0A']} style={StyleSheet.absoluteFill} />
            
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <View style={[styles.safeArea, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 10 }]}>
                    
                    {/* Header Section */}
                    {!isExpandedNotesEditor && (
                    <View style={styles.headerContainer}>
                        <View style={styles.headerTop}>
                            <View style={styles.tabToggle}>
                                <TouchableOpacity 
                                    onPress={() => {
                                        setCurrentTab('diary');
                                        setCurrentFolderId(null);
                                        setCurrentNoteId(null);
                                        setIsNotesEditorExpanded(false);
                                        load(dateKey);
                                    }}
                                    style={[styles.tabBtn, currentTab === 'diary' && styles.tabBtnActive]}
                                >
                                    <Text style={[styles.tabText, currentTab === 'diary' && styles.tabTextActive]}>DIARY</Text>
                                </TouchableOpacity>
                                <View style={styles.tabDivider} />
                                <TouchableOpacity 
                                    onPress={() => {
                                        setCurrentTab('notes');
                                        setCurrentFolderId(null);
                                        setCurrentNoteId(null);
                                        setIsNotesEditorExpanded(false);
                                        setDraftTitle('');
                                        setSavedTitle('');
                                        setDraftText('');
                                        setSavedText('');
                                    }}
                                    style={[styles.tabBtn, currentTab === 'notes' && styles.tabBtnActive]}
                                >
                                    <Text style={[styles.tabText, currentTab === 'notes' && styles.tabTextActive]}>NOTES</Text>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.headerTopRight}>
                                {currentTab === 'notes' && (
                                    <TouchableOpacity
                                        style={[
                                            styles.trashHeaderBtn,
                                            currentFolderId === TRASH_FOLDER_ID && styles.trashHeaderBtnActive,
                                        ]}
                                        activeOpacity={0.8}
                                        onPress={() => {
                                            setCurrentTab('notes');
                                            setCurrentFolderId(TRASH_FOLDER_ID);
                                            setCurrentNoteId(null);
                                            setIsNotesEditorExpanded(false);
                                            setDraftTitle('');
                                            setSavedTitle('');
                                            setDraftText('');
                                            setSavedText('');
                                        }}
                                    >
                                        <MaterialIcons
                                            name="delete-outline"
                                            size={18}
                                            color={currentFolderId === TRASH_FOLDER_ID ? 'rgba(255,255,255,0.92)' : 'rgba(255, 61, 0, 0.85)'}
                                        />
                                        <Text style={[
                                            styles.trashHeaderText,
                                            currentFolderId === TRASH_FOLDER_ID && styles.trashHeaderTextActive,
                                        ]}>
                                            {trashCount}
                                        </Text>
                                    </TouchableOpacity>
                                )}

                                <TouchableOpacity style={styles.closeCircle} onPress={onClose} activeOpacity={0.7}>
                                    <MaterialIcons name="close" size={20} color="#fff" />
                                </TouchableOpacity>
                            </View>
                        </View>
                        
                        <Text style={styles.headerTitle}>
                            {currentTab === 'diary' 
                                ? fullDateDisplay 
                                : (currentNote ? 'Editing Note' : (currentFolder ? currentFolder.name : 'All Folders'))}
                        </Text>
                        
                        {(currentTab === 'diary' || currentNote) && (
                            <View style={styles.statusRow}>
                                <View style={[styles.statusDot, { backgroundColor: isAutoSaving ? '#FFC107' : '#4CAF50' }]} />
                                <Text style={styles.statusText}>
                                    {isAutoSaving ? 'Saving...' : `Auto-saved ${lastSavedTime || 'just now'}`}
                                </Text>
                            </View>
                        )}

                        {/* Toggles Row */}
                        <View style={styles.headerControls}>
                            <View style={styles.segmentedControl}>
                                <TouchableOpacity 
                                    style={[styles.segmentBtn, mode === 'view' && styles.segmentBtnActive]}
                                    onPress={() => setMode('view')}
                                >
                                    <Text style={[styles.segmentText, mode === 'view' && styles.segmentTextActive]}>VIEW</Text>
                                </TouchableOpacity>
                                <TouchableOpacity 
                                    style={[styles.segmentBtn, mode === 'edit' && styles.segmentBtnActive]}
                                    onPress={() => setMode('edit')}
                                >
                                    <Text style={[styles.segmentText, mode === 'edit' && styles.segmentTextActive]}>EDIT</Text>
                                </TouchableOpacity>
                            </View>

                            {currentTab === 'diary' && (
                                <TouchableOpacity 
                                    style={[styles.allDaysBtn, showAllDays && styles.allDaysBtnActive]}
                                    onPress={() => setShowAllDays(!showAllDays)}
                                >
                                    <MaterialIcons name="segment" size={18} color={showAllDays ? '#fff' : 'rgba(255,255,255,0.4)'} />
                                    <Text style={[styles.allDaysText, showAllDays && styles.allDaysTextActive]}>ALL DAYS</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                    )}

                    {isExpandedNotesEditor ? (
                        <View style={styles.expandedEditorRoot}>
                            <View style={styles.expandedTopBar}>
                                <TouchableOpacity
                                    style={styles.expandedTopBtn}
                                    onPress={() => {
                                        setIsNotesEditorExpanded(false);
                                        setCurrentNoteId(null);
                                    }}
                                >
                                    <MaterialIcons name="arrow-back" size={18} color="rgba(255,255,255,0.6)" />
                                </TouchableOpacity>

                                <View style={styles.expandedModeToggle}>
                                    <TouchableOpacity
                                        style={[styles.expandedModeBtn, mode === 'view' && styles.expandedModeBtnActive]}
                                        onPress={() => setMode('view')}
                                    >
                                        <Text style={[styles.expandedModeText, mode === 'view' && styles.expandedModeTextActive]}>VIEW</Text>
                                    </TouchableOpacity>
                                    <View style={styles.expandedModeDivider} />
                                    <TouchableOpacity
                                        style={[styles.expandedModeBtn, mode === 'edit' && styles.expandedModeBtnActive]}
                                        onPress={() => setMode('edit')}
                                    >
                                        <Text style={[styles.expandedModeText, mode === 'edit' && styles.expandedModeTextActive]}>EDIT</Text>
                                    </TouchableOpacity>
                                </View>

                                <View style={styles.expandedTopRightIcons}>
                                    {mode === 'edit' && (
                                        <TouchableOpacity
                                            style={[styles.expandedTopBtn, showNotesInlineConfig && styles.expandedTopBtnActive]}
                                            onPress={() => setShowNotesInlineConfig(v => !v)}
                                            activeOpacity={0.85}
                                        >
                                            <MaterialIcons
                                                name="tune"
                                                size={18}
                                                color={showNotesInlineConfig ? '#4CAF50' : 'rgba(255,255,255,0.6)'}
                                            />
                                        </TouchableOpacity>
                                    )}

                                    <TouchableOpacity
                                        style={styles.expandedTopBtn}
                                        onPress={() => setIsNotesEditorExpanded(false)}
                                    >
                                        <MaterialIcons name="close-fullscreen" size={18} color="rgba(255,255,255,0.6)" />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <View style={styles.expandedTitleRow}>
                                <TextInput
                                    style={styles.expandedTitleInput}
                                    value={draftTitle}
                                    onChangeText={setDraftTitle}
                                    placeholder="Title"
                                    placeholderTextColor="rgba(255,255,255,0.22)"
                                    editable={mode === 'edit'}
                                    maxLength={80}
                                />
                            </View>

                            {mode === 'edit' && showNotesInlineConfig && (
                                <View style={styles.richToolbarBlockCompact}>
                                    <RichToolbar
                                        editor={richEditorRef}
                                        actions={[
                                            actions.undo,
                                            actions.redo,
                                            actions.setBold,
                                            actions.setItalic,
                                            actions.setUnderline,
                                            actions.heading1,
                                            actions.heading2,
                                            actions.insertBulletsList,
                                            actions.insertOrderedList,
                                            actions.insertLink,
                                        ]}
                                        iconTint="rgba(255,255,255,0.55)"
                                        selectedIconTint="#4CAF50"
                                        selectedButtonStyle={{ backgroundColor: 'rgba(76,175,80,0.14)' }}
                                        iconSize={15}
                                        style={styles.richToolbarTop}
                                    />
                                    <View style={styles.inlineConfigRow}>
                                        <View style={styles.inlineConfigGroup}>
                                            <Text style={styles.inlineConfigLabel}>SIZE</Text>
                                            <TouchableOpacity
                                                style={styles.inlineConfigBtn}
                                                onPress={() => {
                                                    setNotesEditorFontSizePx((v) => {
                                                        const next = Math.max(12, v - 1);
                                                        requestAnimationFrame(() => applyNotesEditorAppearance());
                                                        return next;
                                                    });
                                                }}
                                            >
                                                <Text style={styles.inlineConfigBtnText}>A-</Text>
                                            </TouchableOpacity>
                                            <Text style={styles.inlineConfigValue}>{notesEditorFontSizePx}px</Text>
                                            <TouchableOpacity
                                                style={styles.inlineConfigBtn}
                                                onPress={() => {
                                                    setNotesEditorFontSizePx((v) => {
                                                        const next = Math.min(24, v + 1);
                                                        requestAnimationFrame(() => applyNotesEditorAppearance());
                                                        return next;
                                                    });
                                                }}
                                            >
                                                <Text style={styles.inlineConfigBtnText}>A+</Text>
                                            </TouchableOpacity>
                                        </View>

                                        <View style={styles.inlineConfigGroup}>
                                            <Text style={styles.inlineConfigLabel}>COLOR</Text>
                                        <ScrollView
                                            horizontal
                                            showsHorizontalScrollIndicator={false}
                                            contentContainerStyle={styles.inlineColorsScroll}
                                        >
                                            {NOTES_COLOR_OPTIONS.map(c => {
                                                const active = notesEditorTextColor === c;
                                                return (
                                                    <TouchableOpacity
                                                        key={c}
                                                        style={[styles.inlineColorDot, { backgroundColor: c }, active && styles.inlineColorDotActive]}
                                                        onPress={() => {
                                                            applySelectionTextColor(c);
                                                        }}
                                                    />
                                                );
                                            })}
                                        </ScrollView>
                                        </View>
                                    </View>
                                </View>
                            )}

                            <View style={styles.expandedEditorBody}>
                                <RichEditor
                                    ref={(r) => { richEditorRef.current = r; }}
                                    initialContentHTML={draftText}
                                    placeholder="Write your note here..."
                                    editorStyle={{
                                        backgroundColor: 'transparent',
                                        color: '#fff',
                                        placeholderColor: 'rgba(255,255,255,0.2)',
                                        cssText: `
                                            * { font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
                                            body { font-size: ${notesEditorFontSizePx}px; line-height: 1.55; padding: 0; margin: 0; }
                                        `,
                                    }}
                                    onKeyUp={(d: any) => {
                                        const key = typeof d === 'string' ? d : d?.key;
                                        if (key === '@') {
                                            const now = new Date();
                                            const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                                            const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                            setMentionOptions([dateStr, timeStr, `${dateStr} ${timeStr}`]);
                                            setShowMentions(true);
                                            triggerMentionCoords();
                                        } else {
                                            if (showMentions) setShowMentions(false);
                                        }
                                    }}
                                    onChange={(html) => {
                                        setDraftText(html);
                                        if (html.endsWith('@') || html.endsWith('@</div>') || html.endsWith('@<br>')) {
                                            const now = new Date();
                                            const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                                            const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                            setMentionOptions([dateStr, timeStr, `${dateStr} ${timeStr}`]);
                                            setShowMentions(true);
                                            triggerMentionCoords();
                                        }
                                    }}
                                    onMessage={handleEditorMessage}
                                    editorInitializedCallback={applyNotesEditorAppearance}
                                    style={styles.richEditor}
                                />
                            </View>

                            {/* Mention Suggestions Popup - Floating above cursor */}
                            {showMentions && (
                                <View style={[styles.mentionPopup, { 
                                    position: 'absolute',
                                    top: Math.max(0, mentionPos.y - 50), // 2px above the ~44px height 
                                    left: Math.min(width - 250, mentionPos.x), // keep within bounds
                                    bottom: undefined 
                                }]}>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                        {mentionOptions.map((opt, idx) => (
                                            <TouchableOpacity 
                                                key={idx} 
                                                style={styles.mentionItem}
                                                onPress={() => {
                                                    richEditorRef.current?.insertText(opt);
                                                    setShowMentions(false);
                                                }}
                                            >
                                                <Text style={styles.mentionItemText}>{opt}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                </View>
                            )}
                        </View>
                    ) : (
                        /* Main Content Card ScrollArea */
                        <ScrollView 
                            style={styles.scrollArea} 
                            contentContainerStyle={styles.scrollContent}
                            showsVerticalScrollIndicator={false}
                            scrollEnabled={!(currentTab === 'notes' && !!currentNoteId)}
                        >
                            {currentTab === 'diary' ? (
                                <DiaryTab
                                    styles={styles}
                                    dateKey={dateKey}
                                    isPortrait={isPortrait}
                                    mode={mode}
                                    setMode={setMode}
                                    draftText={draftText}
                                    setDraftText={setDraftText}
                                    charCount={charCount}
                                    readTime={readTime}
                                    showAllDays={showAllDays}
                                    allDaysLoading={allDaysLoading}
                                    allDaysNotes={allDaysNotes}
                                    expandedAllDays={expandedAllDays}
                                    setExpandedAllDays={setExpandedAllDays}
                                    isEditingTemplate={isEditingTemplate}
                                    templateLabel={templateLabel}
                                    setTemplateLabel={setTemplateLabel}
                                    templateContent={templateContent}
                                    setTemplateContent={setTemplateContent}
                                    allTemplates={allTemplates}
                                    handleCreateTemplate={handleCreateTemplate}
                                    handleEditTemplate={handleEditTemplate}
                                    handleSaveTemplate={handleSaveTemplate}
                                    handleDeleteTemplate={handleDeleteTemplate}
                                    setIsEditingTemplate={setIsEditingTemplate}
                                />
                            ) : (
                                /* NOTES MODE */
                                <View style={styles.notesModeContainer}>
                                {!currentFolderId ? (
                                    /* FOLDER LIST VIEW */
                                    <View style={styles.foldersView}>
                                        <View style={styles.sectionHeaderRow}>
                                            <Text style={styles.sectionTitle}>FOLDERS</Text>
                                            <TouchableOpacity onPress={() => {
                                                setFolderToEdit(null);
                                                setNewFolderName('');
                                                setNewFolderEmoji(PRESET_FOLDER_EMOJIS[0]);
                                                setNewFolderColor(PRESET_FOLDER_COLORS[0]);
                                                setNewFolderLocked(false);
                                                setNewFolderLockCode('');
                                                setIsCreatingFolder(true);
                                            }}>
                                                <MaterialIcons name="create-new-folder" size={20} color="#4CAF50" />
                                            </TouchableOpacity>
                                        </View>

                                        {/* Premium Folder Creation/Edit Modal */}
                                        <Modal
                                            visible={isCreatingFolder}
                                            transparent
                                            animationType="fade"
                                            supportedOrientations={['portrait', 'landscape']}
                                            onRequestClose={() => {
                                                setIsCreatingFolder(false);
                                                setFolderToEdit(null);
                                            }}
                                        >
                                            <TouchableWithoutFeedback onPress={() => {
                                                setIsCreatingFolder(false);
                                                setFolderToEdit(null);
                                            }}>
                                                <View style={[styles.modalOverlay, isLandscape && styles.modalOverlayLandscape]}>
                                                    <TouchableWithoutFeedback onPress={e => e.stopPropagation()}>
                                                        <KeyboardAvoidingView
                                                            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                                                            // Do not use flex:1 here; otherwise the modal content
                                                            // stretches to full height and no longer looks like a centered popup.
                                                            style={{ alignSelf: 'stretch' }}
                                                        >
                                                            <ScrollView
                                                                style={[
                                                                    styles.premiumPopup,
                                                                    isLandscape ? { maxHeight: folderModalMaxHeight } : undefined,
                                                                ]}
                                                                showsVerticalScrollIndicator={false}
                                                                keyboardShouldPersistTaps="handled"
                                                                contentContainerStyle={{ paddingBottom: 6 }}
                                                            >
                                                            <View style={styles.popupHeader}>
                                                                <Text style={styles.popupTitle}>{folderToEdit ? 'EDIT FOLDER' : 'NEW FOLDER'}</Text>
                                                                <TouchableOpacity onPress={() => {
                                                                    setIsCreatingFolder(false);
                                                                    setFolderToEdit(null);
                                                                }}>
                                                                    <MaterialIcons name="close" size={20} color="rgba(255,255,255,0.4)" />
                                                                </TouchableOpacity>
                                                            </View>

                                                            <TextInput
                                                                style={styles.folderPopupInput}
                                                                placeholder="Folder Name"
                                                                placeholderTextColor="rgba(255,255,255,0.2)"
                                                                value={newFolderName}
                                                                onChangeText={setNewFolderName}
                                                                autoFocus
                                                            />

                                                            <Text style={styles.popupLabel}>COLOR</Text>
                                                            <View style={styles.colorPickerRow}>
                                                                {PRESET_FOLDER_COLORS.map(c => (
                                                                    <TouchableOpacity
                                                                        key={c}
                                                                        style={[
                                                                            styles.colorDot,
                                                                            { backgroundColor: c },
                                                                            newFolderColor === c && styles.colorDotActive
                                                                        ]}
                                                                        onPress={() => setNewFolderColor(c)}
                                                                    />
                                                                ))}
                                                            </View>

                                                            <Text style={styles.popupLabel}>ICON</Text>
                                                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.emojiPickerScroll}>
                                                                {PRESET_FOLDER_EMOJIS.map(e => (
                                                                    <TouchableOpacity
                                                                        key={e}
                                                                        style={[
                                                                            styles.emojiBtn,
                                                                            newFolderEmoji === e && styles.emojiBtnActive
                                                                        ]}
                                                                        onPress={() => setNewFolderEmoji(e)}
                                                                    >
                                                                        <Text style={styles.emojiBtnText}>{e}</Text>
                                                                    </TouchableOpacity>
                                                                ))}
                                                            </ScrollView>

                                                            <TouchableOpacity
                                                                style={[
                                                                    styles.popupPrimaryBtn,
                                                                    !newFolderName.trim() && { opacity: 0.5 }
                                                                ]}
                                                                onPress={handleCreateFolder}
                                                                disabled={!newFolderName.trim()}
                                                            >
                                                                <Text style={styles.popupPrimaryBtnText}>{folderToEdit ? 'Update Folder' : 'Create Folder'}</Text>
                                                            </TouchableOpacity>

                                                            {folderToEdit && folderToEdit.id !== TRASH_FOLDER_ID && (
                                                                <TouchableOpacity
                                                                    style={styles.popupDeleteBtn}
                                                                    onPress={() => {
                                                                        handleDeleteFolder(folderToEdit.id);
                                                                        setIsCreatingFolder(false);
                                                                        setFolderToEdit(null);
                                                                    }}
                                                                >
                                                                    <MaterialIcons name="delete" size={16} color="#FF3D00" />
                                                                    <Text style={styles.popupDeleteBtnText}>Delete Folder</Text>
                                                                </TouchableOpacity>
                                                            )}
                                                            </ScrollView>
                                                        </KeyboardAvoidingView>
                                                    </TouchableWithoutFeedback>
                                                </View>
                                            </TouchableWithoutFeedback>
                                        </Modal>

                                        <View style={styles.folderGrid}>
                                            {folders.filter(f => f.id !== TRASH_FOLDER_ID && !f.trashedAt).map(f => (
                                                <View key={f.id} style={styles.folderCardWrapper}>
                                                    <TouchableOpacity
                                                        style={[
                                                            styles.folderCard,
                                                            f.isLocked ? styles.folderCardLocked : styles.folderCardUnlocked,
                                                            lockedOutFolderIds[f.id] && styles.folderCardLockedOut,
                                                        ]}
                                                        onPress={() => openFolderWithLockCheck(f.id)}
                                                        disabled={!!lockedOutFolderIds[f.id]}
                                                        onLongPress={() => {
                                                            if (f.id === TRASH_FOLDER_ID) return;
                                                            setFolderActionsPopupFolder(f);
                                                        }}
                                                    >
                                                        <View style={styles.folderCardTopRow}>
                                                            <View style={[
                                                                styles.folderEmojiBox,
                                                                { backgroundColor: f.color ? `${f.color}18` : 'rgba(255,255,255,0.06)' }
                                                            ]}>
                                                                <Text style={styles.folderEmojiText}>{f.emoji}</Text>
                                                            </View>

                                                        <TouchableOpacity
                                                            activeOpacity={0.85}
                                                            onLongPress={() => {
                                                                if (f.id === TRASH_FOLDER_ID) return;
                                                                if (lockedOutFolderIds[f.id]) return;
                                                                setFolderActionsPopupFolder(f);
                                                            }}
                                                        >
                                                        {f.isLocked && (
                                                            <View
                                                                style={[
                                                                    styles.folderStatusPill,
                                                                    styles.folderStatusPillLocked,
                                                                ]}
                                                            >
                                                                <MaterialIcons
                                                                    name="lock"
                                                                    size={14}
                                                                    color="#FF9800"
                                                                />
                                                                <Text
                                                                    style={[
                                                                        styles.folderStatusText,
                                                                        styles.folderStatusTextLocked,
                                                                    ]}
                                                                >
                                                                    LOCKED
                                                                </Text>
                                                            </View>
                                                        )}
                                                        </TouchableOpacity>
                                                        </View>

                                                        <Text style={styles.folderNameText} numberOfLines={1}>{f.name}</Text>
                                                        <Text style={styles.folderCountText}>
                                                            {generalNotes.filter(n => n.folderId === f.id).length} notes
                                                        </Text>
                                                    </TouchableOpacity>
                                                </View>
                                            ))}
                                        </View>

                                        {folders.filter(f => f.id !== TRASH_FOLDER_ID && !f.trashedAt).length === 0 && !isCreatingFolder && (
                                            <View style={styles.emptyItemsWrapper}>
                                                <Text style={styles.emptyItemsText}>No folders yet. Tap the icon to create one.</Text>
                                            </View>
                                        )}
                                    </View>
                                ) : !currentNoteId ? (
                                    /* NOTE LIST VIEW WITHIN FOLDER */
                                    <View style={styles.notesListView}>
                                        <TouchableOpacity
                                            style={styles.backToFoldersBtn}
                                            onPress={() => setCurrentFolderId(null)}
                                        >
                                            <MaterialIcons name="arrow-back" size={16} color="rgba(255,255,255,0.4)" />
                                            <Text style={styles.backBtnText}>BACK TO FOLDERS</Text>
                                        </TouchableOpacity>

                                        <View style={styles.sectionHeaderRow}>
                                            <Text style={styles.sectionTitle}>
                                                {currentFolderId === TRASH_FOLDER_ID ? 'TRASH' : `NOTES IN ${currentFolder?.name.toUpperCase()}`}
                                            </Text>
                                            {currentFolderId === TRASH_FOLDER_ID ? (
                                                <TouchableOpacity
                                                    onPress={() => setConfirmDeleteAllTrashVisible(true)}
                                                    disabled={trashCount === 0}
                                                    activeOpacity={0.8}
                                                    style={[
                                                        styles.trashDeleteAllBtn,
                                                        trashCount === 0 && styles.trashDeleteAllBtnDisabled,
                                                    ]}
                                                >
                                                    <MaterialIcons
                                                        name="delete-sweep"
                                                        size={18}
                                                        color={trashCount === 0 ? 'rgba(255,255,255,0.25)' : '#FF3D00'}
                                                    />
                                                    <Text style={styles.trashDeleteAllBtnText}>DELETE ALL</Text>
                                                </TouchableOpacity>
                                            ) : (
                                                <TouchableOpacity onPress={handleCreateNote}>
                                                    <MaterialIcons name="add-circle" size={20} color="#4CAF50" />
                                                </TouchableOpacity>
                                            )}
                                        </View>

                                        <View style={styles.notesGrid}>
                                            {currentFolderId === TRASH_FOLDER_ID && folders
                                                .filter(f => f.id !== TRASH_FOLDER_ID && f.trashedAt)
                                                .sort((a, b) => (b.trashedAt || 0) - (a.trashedAt || 0))
                                                .map(f => (
                                                    <View key={f.id} style={styles.folderCardWrapper}>
                                                        <View style={[styles.folderCard, styles.trashFolderCard]}>
                                                            <View style={styles.folderCardTopRow}>
                                                                <View style={styles.folderEmojiBox}>
                                                                    <Text style={styles.folderEmojiText}>{f.emoji}</Text>
                                                                </View>
                                                                <View style={styles.trashNoteActions}>
                                                                    <TouchableOpacity
                                                                        style={styles.trashActionBtn}
                                                                        onPress={() => restoreFolderFromTrash(f.id)}
                                                                    >
                                                                        <MaterialIcons name="restore" size={16} color="rgba(76, 175, 80, 0.85)" />
                                                                    </TouchableOpacity>
                                                                    <TouchableOpacity
                                                                        style={[styles.trashActionBtn, styles.trashActionBtnDanger]}
                                                                        onPress={() => setConfirmDeleteForeverFolderId(f.id)}
                                                                    >
                                                                        <MaterialIcons name="delete-outline" size={16} color="rgba(255, 61, 0, 0.75)" />
                                                                    </TouchableOpacity>
                                                                </View>
                                                            </View>
                                                            <Text style={styles.folderNameText} numberOfLines={1}>{f.name}</Text>
                                                            <Text style={styles.folderCountText}>
                                                                {generalNotes.filter(n => n.folderId === f.id).length} notes
                                                            </Text>
                                                            <Text style={styles.noteCardMeta} numberOfLines={1}>
                                                                Trashed {new Date(f.trashedAt!).toLocaleDateString()}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                ))
                                            }
                                            {generalNotes
                                                .filter(n => n.folderId === currentFolderId)
                                                .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
                                                .map(n => (
                                                    <View key={n.id} style={styles.generalNoteCardWrapper}>
                                                        <TouchableOpacity
                                                            style={styles.generalNoteCard}
                                                            onPress={() => {
                                                                setCurrentNoteId(n.id);
                                                                setDraftTitle(n.title || '');
                                                                setSavedTitle(n.title || '');
                                                            const html = normalizeNoteContentToHtml(n.text);
                                                            setDraftText(html);
                                                            setSavedText(html);
                                                            setMode(stripHtmlToText(n.text).trim().length > 0 ? 'view' : 'edit');
                                                            }}
                                                        >
                                                            <View style={styles.noteCardHeadingRow}>
                                                                <Text style={styles.noteCardHeading} numberOfLines={1}>
                                                                    {noteTitleFor(n)}
                                                                </Text>
                                                                {currentFolderId === TRASH_FOLDER_ID && !!n.trashedAt && (
                                                                    <Text style={styles.noteCardMeta} numberOfLines={1}>
                                                                        Trashed {new Date(n.trashedAt).toLocaleDateString()}
                                                                    </Text>
                                                                )}
                                                            </View>
                                                            <Text style={styles.generalNotePreview} numberOfLines={3}>
                                                                {stripHtmlToText(n.text) || 'Empty note...'}
                                                            </Text>
                                                            <Text style={styles.generalNoteDate}>
                                                                {new Date(n.updatedAt).toLocaleDateString()}
                                                            </Text>
                                                        </TouchableOpacity>
                                                        {currentFolderId === TRASH_FOLDER_ID ? (
                                                            <View style={styles.trashNoteActions}>
                                                                <TouchableOpacity
                                                                    style={styles.trashActionBtn}
                                                                    onPress={() => restoreNoteFromTrash(n.id)}
                                                                >
                                                                    <MaterialIcons name="restore" size={16} color="rgba(76, 175, 80, 0.85)" />
                                                                </TouchableOpacity>
                                                                <TouchableOpacity
                                                                    style={[styles.trashActionBtn, styles.trashActionBtnDanger]}
                                                                    onPress={() => setConfirmDeleteForeverNoteId(n.id)}
                                                                >
                                                                    <MaterialIcons name="delete-outline" size={16} color="rgba(255, 61, 0, 0.75)" />
                                                                </TouchableOpacity>
                                                            </View>
                                                        ) : (
                                                            <TouchableOpacity
                                                                style={styles.generalNoteDeleteBtn}
                                                                onPress={() => setConfirmMoveToTrashNoteId(n.id)}
                                                            >
                                                                <MaterialIcons name="delete-outline" size={14} color="rgba(255, 61, 0, 0.3)" />
                                                            </TouchableOpacity>
                                                        )}
                                                    </View>
                                                ))}
                                        </View>

                                        {generalNotes.filter(n => n.folderId === currentFolderId).length === 0 && (
                                            <View style={styles.emptyItemsWrapper}>
                                                <Text style={styles.emptyItemsText}>
                                                    {currentFolderId === TRASH_FOLDER_ID ? 'Trash is empty.' : 'No notes in this folder yet.'}
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                ) : (
                                    /* NOTE EDITOR VIEW */
                                    <View style={[
                                        styles.fixedEditorContainer,
                                        isPortrait
                                            ? (isKeyboardVisible ? styles.editorPortrait : { flex: 1, minHeight: 500 })
                                            : (isKeyboardVisible ? styles.editorLandscape : { flex: 1, minHeight: 300 })
                                    ]}>
                                        <TouchableOpacity
                                            style={styles.backToFoldersBtn}
                                            onPress={() => {
                                                setCurrentNoteId(null);
                                                setIsNotesEditorExpanded(false);
                                            }}
                                        >
                                            <MaterialIcons name="arrow-back" size={16} color="rgba(255,255,255,0.4)" />
                                            <Text style={styles.backBtnText}>BACK TO LIST</Text>
                                        </TouchableOpacity>

                                        <View style={styles.noteCardFixed}>
                                            <View style={styles.editorTitleRow}>
                                                <TextInput
                                                    style={styles.editorTitleInput}
                                                    value={draftTitle}
                                                    onChangeText={setDraftTitle}
                                                    placeholder="Title"
                                                    placeholderTextColor="rgba(255,255,255,0.22)"
                                                    editable={mode === 'edit'}
                                                    maxLength={80}
                                                />
                                                <View style={styles.editorTitleActions}>
                                                    {!!currentNote?.updatedAt && (
                                                        <Text style={styles.editorMeta} numberOfLines={1}>
                                                            {new Date(currentNote.updatedAt).toLocaleString()}
                                                        </Text>
                                                    )}
                                                    <TouchableOpacity
                                                        style={styles.expandBtn}
                                                        onPress={() => setIsNotesEditorExpanded(true)}
                                                        activeOpacity={0.8}
                                                    >
                                                        <MaterialIcons name="open-in-full" size={16} color="rgba(255,255,255,0.6)" />
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                            <View style={styles.editorTitleDivider} />
                                            
                                            <View style={styles.richEditorWrap}>
                                                <RichEditor
                                                    ref={(r) => { richEditorRef.current = r; }}
                                                    initialContentHTML={draftText}
                                                    placeholder="Type your note here..."
                                                    editorStyle={{
                                                        backgroundColor: 'transparent',
                                                        color: '#fff',
                                                        placeholderColor: 'rgba(255,255,255,0.2)',
                                                        cssText: `
                                                            * { font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
                                                            body { font-size: ${notesEditorFontSizePx}px; line-height: 1.55; padding: 0; margin: 0; }
                                                        `,
                                                    }}
                                                    onKeyUp={(d: any) => {
                                                        const key = typeof d === 'string' ? d : d?.key;
                                                        if (key === '@') {
                                                            const now = new Date();
                                                            const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                                                            const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                                            setMentionOptions([dateStr, timeStr, `${dateStr} ${timeStr}`]);
                                                            setShowMentions(true);
                                                            triggerMentionCoords();
                                                        } else {
                                                            if (showMentions) setShowMentions(false);
                                                        }
                                                    }}
                                                    onChange={(html) => {
                                                        setDraftText(html);
                                                        if (html.endsWith('@') || html.endsWith('@</div>') || html.endsWith('@<br>')) {
                                                            const now = new Date();
                                                            const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                                                            const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                                            setMentionOptions([dateStr, timeStr, `${dateStr} ${timeStr}`]);
                                                            setShowMentions(true);
                                                            triggerMentionCoords();
                                                        }
                                                    }}
                                                    onMessage={handleEditorMessage}
                                                    editorInitializedCallback={applyNotesEditorAppearance}
                                                    style={styles.richEditor}
                                                />
                                            </View>
                                            
                                            {/* Mention Suggestions Popup for Inline Editor - Floating above cursor */}
                                            {showMentions && (
                                                <View style={[styles.mentionPopupInline, {
                                                    position: 'absolute',
                                                    top: Math.max(0, mentionPos.y - 50),
                                                    left: Math.min(width - 200, mentionPos.x),
                                                    bottom: undefined
                                                }]}>
                                                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                                        {mentionOptions.map((opt, idx) => (
                                                            <TouchableOpacity 
                                                                key={idx} 
                                                                style={styles.mentionItem}
                                                                onPress={() => {
                                                                    richEditorRef.current?.insertText(opt);
                                                                    setShowMentions(false);
                                                                }}
                                                            >
                                                                <Text style={styles.mentionItemText}>{opt}</Text>
                                                            </TouchableOpacity>
                                                        ))}
                                                    </ScrollView>
                                                </View>
                                            )}

                                            {mode === 'edit' && (
                                                <View style={styles.richToolbarBlock}>
                                                    <RichToolbar
                                                        editor={richEditorRef}
                                                        actions={[
                                                            actions.undo,
                                                            actions.redo,
                                                            actions.setBold,
                                                            actions.setItalic,
                                                            actions.setUnderline,
                                                            actions.heading1,
                                                            actions.heading2,
                                                            actions.insertBulletsList,
                                                            actions.insertOrderedList,
                                                            actions.insertLink,
                                                        ]}
                                                        iconTint="rgba(255,255,255,0.55)"
                                                        selectedIconTint="#4CAF50"
                                                        selectedButtonStyle={{ backgroundColor: 'rgba(76,175,80,0.14)' }}
                                                        iconSize={16}
                                                        style={styles.richToolbar}
                                                    />
                                                </View>
                                            )}
                                        </View>
                                        </View>
                                    )}
                                </View>
                            )}
                        </ScrollView>
                    )}

                    {/* Folder Actions Popup */}
                    <Modal
                        visible={!!folderActionsPopupFolder}
                        transparent
                        animationType="fade"
                        supportedOrientations={['portrait', 'landscape']}
                        onRequestClose={() => setFolderActionsPopupFolder(null)}
                    >
                        <TouchableWithoutFeedback onPress={() => setFolderActionsPopupFolder(null)}>
                            <View style={styles.modalOverlay}>
                                <TouchableWithoutFeedback onPress={e => e.stopPropagation()}>
                                    <View style={styles.folderActionsPopup}>
                                        <View style={styles.popupHeader}>
                                            <Text style={styles.popupTitle}>FOLDER ACTIONS</Text>
                                            <TouchableOpacity onPress={() => setFolderActionsPopupFolder(null)}>
                                                <MaterialIcons name="close" size={20} color="rgba(255,255,255,0.4)" />
                                            </TouchableOpacity>
                                        </View>
                                        
                                        <View style={styles.folderActionsGrid}>
                                            <TouchableOpacity 
                                                style={styles.folderActionBtn}
                                                onPress={() => {
                                                    const f = folderActionsPopupFolder;
                                                    setFolderActionsPopupFolder(null);
                                                    if (f) openEditFolderModal(f);
                                                }}
                                            >
                                                <View style={[styles.folderActionIconBox, { backgroundColor: 'rgba(76, 175, 80, 0.1)' }]}>
                                                    <MaterialIcons name="edit" size={20} color="#4CAF50" />
                                                </View>
                                                <Text style={styles.folderActionBtnText}>UPDATE</Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity 
                                                 style={styles.folderActionBtn}
                                                 onPress={() => {
                                                     const f = folderActionsPopupFolder;
                                                     if (f && f.isLocked) {
                                                         setIsDeletingLockedFolder(true);
                                                         setFolderLockModalFolder(f);
                                                         setFolderLockPin('');
                                                         setFolderActionsPopupFolder(null);
                                                     } else {
                                                         setFolderActionsPopupFolder(null);
                                                         if (f) handleDeleteFolder(f.id);
                                                     }
                                                 }}
                                             >
                                                 <View style={[styles.folderActionIconBox, { backgroundColor: 'rgba(255, 61, 0, 0.1)' }]}>
                                                     <MaterialIcons name="delete" size={20} color="#FF3D00" />
                                                 </View>
                                                 <Text style={styles.folderActionBtnText}>DELETE</Text>
                                             </TouchableOpacity>

                                            <TouchableOpacity 
                                                style={styles.folderActionBtn}
                                                onPress={() => {
                                                    const f = folderActionsPopupFolder;
                                                    setFolderActionsPopupFolder(null);
                                                    if (f) {
                                                        if (lockedOutFolderIds[f.id]) return;
                                                        setFolderLockModalFolder(f);
                                                        setFolderLockPin('');
                                                    }
                                                }}
                                            >
                                                <View style={[styles.folderActionIconBox, { backgroundColor: 'rgba(255, 152, 0, 0.1)' }]}>
                                                    <MaterialIcons 
                                                        name={folderActionsPopupFolder?.isLocked ? 'lock-open' : 'lock'} 
                                                        size={20} 
                                                        color="#FF9800" 
                                                    />
                                                </View>
                                                <Text style={styles.folderActionBtnText}>
                                                    {folderActionsPopupFolder?.isLocked ? 'UNLOCK' : 'LOCK'}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </TouchableWithoutFeedback>
                            </View>
                        </TouchableWithoutFeedback>
                    </Modal>

                    {/* Dedicated Folder Lock/Unlock Modal */}
                    <Modal
                        visible={!!folderLockModalFolder}
                        transparent
                        animationType="slide"
                        supportedOrientations={['portrait', 'landscape']}
                        onRequestClose={() => setFolderLockModalFolder(null)}
                    >
                        <TouchableWithoutFeedback onPress={() => setFolderLockModalFolder(null)}>
                            <View style={styles.modalOverlay}>
                                <TouchableWithoutFeedback onPress={e => e.stopPropagation()}>
                                    <View style={styles.folderLockPopup}>
                                        <View style={styles.popupHeader}>
                                            <Text style={styles.popupTitle}>
                                                {folderLockModalFolder?.isLocked ? 'UNLOCK FOLDER' : 'LOCK FOLDER'}
                                            </Text>
                                            <TouchableOpacity onPress={() => setFolderLockModalFolder(null)}>
                                                <MaterialIcons name="close" size={20} color="rgba(255,255,255,0.4)" />
                                            </TouchableOpacity>
                                        </View>

                                        <Text style={styles.confirmText}>
                                            {isDeletingLockedFolder 
                                                ? 'Unlock this folder to proceed with moving it to trash.'
                                                : folderLockModalFolder?.isLocked 
                                                    ? 'Enter your 4-digit PIN to remove the lock from this folder.' 
                                                    : 'Set a 4-digit PIN to restrict access to this folder and its notes.'}
                                        </Text>

                                        <View style={styles.lockInputContainer}>
                                            <TextInput
                                                style={styles.folderLockPinInput}
                                                value={folderLockPin}
                                                onChangeText={(t) => setFolderLockPin(t.replace(/[^\d]/g, '').slice(0, 4))}
                                                placeholder="••••"
                                                placeholderTextColor="rgba(255,255,255,0.15)"
                                                keyboardType="number-pad"
                                                secureTextEntry
                                                maxLength={4}
                                                autoFocus
                                            />
                                        </View>

                                        <View style={styles.confirmActions}>
                                            <TouchableOpacity 
                                                style={styles.confirmBtn} 
                                                onPress={() => {
                                                    setFolderLockModalFolder(null);
                                                    setIsDeletingLockedFolder(false);
                                                }}
                                            >
                                                <Text style={styles.confirmBtnText}>CANCEL</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[
                                                    styles.confirmBtn,
                                                    styles.confirmBtnPrimary,
                                                    (!/^\d{4}$/.test(folderLockPin)) && { opacity: 0.5 }
                                                ]}
                                                onPress={handleToggleFolderLock}
                                                disabled={!/^\d{4}$/.test(folderLockPin)}
                                            >
                                                <Text style={[styles.confirmBtnText, styles.confirmBtnTextPrimary]}>
                                                    {isDeletingLockedFolder ? 'UNLOCK & DELETE' : (folderLockModalFolder?.isLocked ? 'UNLOCK' : 'CONFIRM')}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </TouchableWithoutFeedback>
                            </View>
                        </TouchableWithoutFeedback>
                    </Modal>

                    {/* Confirm: Delete Folder Forever */}
                    <Modal
                        visible={!!confirmDeleteForeverFolderId}
                        transparent
                        animationType="fade"
                        supportedOrientations={['portrait', 'landscape']}
                        onRequestClose={() => setConfirmDeleteForeverFolderId(null)}
                    >
                        <TouchableWithoutFeedback onPress={() => setConfirmDeleteForeverFolderId(null)}>
                            <View style={styles.modalOverlay}>
                                <TouchableWithoutFeedback onPress={e => e.stopPropagation()}>
                                    <View style={styles.confirmPopup}>
                                        <View style={styles.popupHeader}>
                                            <Text style={styles.popupTitle}>DELETE FOLDER FOREVER?</Text>
                                            <TouchableOpacity onPress={() => setConfirmDeleteForeverFolderId(null)}>
                                                <MaterialIcons name="close" size={20} color="rgba(255,255,255,0.4)" />
                                            </TouchableOpacity>
                                        </View>
                                        <Text style={styles.confirmText}>
                                            This will permanently delete the folder and all notes inside it. This action can’t be undone.
                                        </Text>
                                        <View style={styles.confirmActions}>
                                            <TouchableOpacity style={styles.confirmBtn} onPress={() => setConfirmDeleteForeverFolderId(null)}>
                                                <Text style={styles.confirmBtnText}>CANCEL</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.confirmBtn, styles.confirmBtnDanger]}
                                                onPress={async () => {
                                                    const id = confirmDeleteForeverFolderId;
                                                    setConfirmDeleteForeverFolderId(null);
                                                    if (id) await deleteFolderForever(id);
                                                }}
                                            >
                                                <Text style={[styles.confirmBtnText, styles.confirmBtnTextDanger]}>DELETE</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </TouchableWithoutFeedback>
                            </View>
                        </TouchableWithoutFeedback>
                    </Modal>

                    {/* Confirm: Move to Trash */}
                    <Modal
                        visible={!!confirmMoveToTrashNoteId}
                        transparent
                        animationType="fade"
                        supportedOrientations={['portrait', 'landscape']}
                        onRequestClose={() => setConfirmMoveToTrashNoteId(null)}
                    >
                        <TouchableWithoutFeedback onPress={() => setConfirmMoveToTrashNoteId(null)}>
                            <View style={styles.modalOverlay}>
                                <TouchableWithoutFeedback onPress={e => e.stopPropagation()}>
                                    <View style={styles.confirmPopup}>
                                        <View style={styles.popupHeader}>
                                            <Text style={styles.popupTitle}>MOVE TO TRASH?</Text>
                                            <TouchableOpacity onPress={() => setConfirmMoveToTrashNoteId(null)}>
                                                <MaterialIcons name="close" size={20} color="rgba(255,255,255,0.4)" />
                                            </TouchableOpacity>
                                        </View>
                                        <Text style={styles.confirmText}>
                                            This note will be moved to Trash. You can restore it later.
                                        </Text>
                                        <View style={styles.confirmActions}>
                                            <TouchableOpacity style={styles.confirmBtn} onPress={() => setConfirmMoveToTrashNoteId(null)}>
                                                <Text style={styles.confirmBtnText}>CANCEL</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.confirmBtn, styles.confirmBtnDanger]}
                                                onPress={async () => {
                                                    const id = confirmMoveToTrashNoteId;
                                                    setConfirmMoveToTrashNoteId(null);
                                                    if (id) await moveNoteToTrash(id);
                                                }}
                                            >
                                                <Text style={[styles.confirmBtnText, styles.confirmBtnTextDanger]}>MOVE</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </TouchableWithoutFeedback>
                            </View>
                        </TouchableWithoutFeedback>
                    </Modal>

                    {/* Confirm: Delete Forever */}
                    <Modal
                        visible={!!confirmDeleteForeverNoteId}
                        transparent
                        animationType="fade"
                        supportedOrientations={['portrait', 'landscape']}
                        onRequestClose={() => setConfirmDeleteForeverNoteId(null)}
                    >
                        <TouchableWithoutFeedback onPress={() => setConfirmDeleteForeverNoteId(null)}>
                            <View style={styles.modalOverlay}>
                                <TouchableWithoutFeedback onPress={e => e.stopPropagation()}>
                                    <View style={styles.confirmPopup}>
                                        <View style={styles.popupHeader}>
                                            <Text style={styles.popupTitle}>DELETE FOREVER?</Text>
                                            <TouchableOpacity onPress={() => setConfirmDeleteForeverNoteId(null)}>
                                                <MaterialIcons name="close" size={20} color="rgba(255,255,255,0.4)" />
                                            </TouchableOpacity>
                                        </View>
                                        <Text style={styles.confirmText}>
                                            This will permanently delete the note. This action can’t be undone.
                                        </Text>
                                        <View style={styles.confirmActions}>
                                            <TouchableOpacity style={styles.confirmBtn} onPress={() => setConfirmDeleteForeverNoteId(null)}>
                                                <Text style={styles.confirmBtnText}>CANCEL</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.confirmBtn, styles.confirmBtnDanger]}
                                                onPress={async () => {
                                                    const id = confirmDeleteForeverNoteId;
                                                    setConfirmDeleteForeverNoteId(null);
                                                    if (id) await deleteNoteForever(id);
                                                }}
                                            >
                                                <Text style={[styles.confirmBtnText, styles.confirmBtnTextDanger]}>DELETE</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </TouchableWithoutFeedback>
                            </View>
                        </TouchableWithoutFeedback>
                    </Modal>

                    {/* Confirm: Delete All Trash */}
                    <Modal
                        visible={confirmDeleteAllTrashVisible}
                        transparent
                        animationType="fade"
                        supportedOrientations={['portrait', 'landscape']}
                        onRequestClose={() => setConfirmDeleteAllTrashVisible(false)}
                    >
                        <TouchableWithoutFeedback onPress={() => setConfirmDeleteAllTrashVisible(false)}>
                            <View style={styles.modalOverlay}>
                                <TouchableWithoutFeedback onPress={e => e.stopPropagation()}>
                                    <View style={styles.confirmPopup}>
                                        <View style={styles.popupHeader}>
                                            <Text style={styles.popupTitle}>DELETE ALL TRASH?</Text>
                                            <TouchableOpacity onPress={() => setConfirmDeleteAllTrashVisible(false)}>
                                                <MaterialIcons name="close" size={20} color="rgba(255,255,255,0.4)" />
                                            </TouchableOpacity>
                                        </View>

                                        <Text style={styles.confirmText}>
                                            This will permanently delete {trashCount} note{trashCount === 1 ? '' : 's'} in Trash.
                                        </Text>

                                        <View style={styles.confirmActions}>
                                            <TouchableOpacity
                                                style={styles.confirmBtn}
                                                onPress={() => setConfirmDeleteAllTrashVisible(false)}
                                            >
                                                <Text style={styles.confirmBtnText}>CANCEL</Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                style={[styles.confirmBtn, styles.confirmBtnDanger]}
                                                onPress={async () => {
                                                    await deleteAllTrashNotes();
                                                }}
                                                disabled={trashCount === 0}
                                            >
                                                <Text style={[styles.confirmBtnText, styles.confirmBtnTextDanger]}>DELETE</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </TouchableWithoutFeedback>
                            </View>
                        </TouchableWithoutFeedback>
                    </Modal>

                    {/* PIN modal for locked folders */}
                    <Modal
                        visible={pinModalVisible}
                        transparent
                        animationType="fade"
                        supportedOrientations={['portrait', 'landscape']}
                        onRequestClose={() => setPinModalVisible(false)}
                    >
                        <TouchableWithoutFeedback onPress={() => setPinModalVisible(false)}>
                            <View style={styles.modalOverlay}>
                                <TouchableWithoutFeedback onPress={e => e.stopPropagation()}>
                                    <View style={styles.confirmPopup}>
                                        <View style={styles.popupHeader}>
                                            <Text style={styles.popupTitle}>ENTER CODE</Text>
                                            <TouchableOpacity onPress={() => setPinModalVisible(false)}>
                                                <MaterialIcons name="close" size={20} color="rgba(255,255,255,0.4)" />
                                            </TouchableOpacity>
                                        </View>

                                        <Text style={styles.confirmText}>
                                            Enter the 4-digit code to unlock this folder.
                                        </Text>

                                        {!!pinError && (
                                            <Text style={styles.pinErrorText}>{pinError}</Text>
                                        )}

                                        <TextInput
                                            style={styles.pinInput}
                                            value={pinDraft}
                                            onChangeText={(t) => setPinDraft(t.replace(/[^\d]/g, '').slice(0, 4))}
                                            placeholder="••••"
                                            placeholderTextColor="rgba(255,255,255,0.2)"
                                            keyboardType="number-pad"
                                            secureTextEntry
                                            maxLength={4}
                                            autoFocus
                                        />

                                        <View style={styles.confirmActions}>
                                            <TouchableOpacity style={styles.confirmBtn} onPress={() => setPinModalVisible(false)}>
                                                <Text style={styles.confirmBtnText}>CANCEL</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.confirmBtn, styles.confirmBtnDanger]}
                                                onPress={onSubmitPin}
                                                disabled={pinDraft.trim().length !== 4}
                                            >
                                                <Text style={[styles.confirmBtnText, styles.confirmBtnTextDanger]}>
                                                    UNLOCK
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </TouchableWithoutFeedback>
                            </View>
                        </TouchableWithoutFeedback>
                    </Modal>

                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    safeArea: {
        flex: 1,
        paddingHorizontal: 16,
    },
    headerContainer: {
        marginBottom: 20,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    headerTopRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: '#fff',
        letterSpacing: -0.5,
        marginBottom: 2,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    headerControls: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 4,
    },
    statusDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        marginRight: 6,
    },
    statusText: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.4)',
        fontWeight: '500',
    },
    closeCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.06)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    trashHeaderBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 10,
        height: 32,
        borderRadius: 14,
        backgroundColor: 'rgba(255, 61, 0, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255, 61, 0, 0.18)',
    },
    trashHeaderBtnActive: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderColor: 'rgba(255,255,255,0.10)',
    },
    trashHeaderText: {
        fontSize: 12,
        fontWeight: '900',
        color: 'rgba(255, 61, 0, 0.9)',
        letterSpacing: 0.2,
    },
    trashHeaderTextActive: {
        color: 'rgba(255,255,255,0.9)',
    },
    trashDeleteAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 10,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(255, 61, 0, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255, 61, 0, 0.18)',
    },
    trashDeleteAllBtnDisabled: {
        opacity: 0.4,
    },
    trashDeleteAllBtnText: {
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 0.2,
        color: '#FF3D00',
    },
    segmentedControl: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 10,
        padding: 2,
    },
    segmentBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    segmentBtnActive: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    segmentText: {
        fontSize: 11,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.4)',
    },
    segmentTextActive: {
        color: '#fff',
    },
    allDaysBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
        gap: 5,
    },
    allDaysBtnActive: {
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    allDaysText: {
        fontSize: 11,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.4)',
    },
    allDaysTextActive: {
        color: '#fff',
    },
    scrollArea: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 20,
    },
    fixedEditorContainer: {
        flex: 1,
    },
    editorPortrait: {
        height: 480,
    },
    editorLandscape: {
        height: 220,
    },
    noteCardFixed: {
        backgroundColor: '#111111',
        borderRadius: 24,
        padding: 16,
        flex: 1,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.03)',
    },
    editorScroll: {
        flex: 1,
    },
    textInput: {
        fontSize: 18,
        color: 'rgba(255,255,255,0.8)',
        lineHeight: 28,
        fontWeight: '400',
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    },
    cardFooter: {
        paddingTop: 16,
    },
    footerDivider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.05)',
        marginBottom: 12,
        width: '100%',
    },
    footerStats: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    statsText: {
        fontSize: 8,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.2)',
        letterSpacing: 1,
    },
    allDaysContainer: {
        gap: 10,
    },
    allDaysSectionTitle: {
        fontSize: 10,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 1.5,
        marginBottom: 4,
    },
    historyCard: {
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 16,
        padding: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    historyCardActive: {
        borderColor: 'rgba(76, 175, 80, 0.3)',
        backgroundColor: 'rgba(76, 175, 80, 0.05)',
    },
    historyCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    historyDate: {
        fontSize: 12,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.6)',
    },
    todayIndicator: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#4CAF50',
    },
    historyText: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.5)',
        lineHeight: 18,
    },
    loadingWrapper: {
        height: 120,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingText: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 12,
    },
    emptyHistoryText: {
        color: 'rgba(255,255,255,0.2)',
        fontSize: 12,
    },
    templateSelection: {
        marginBottom: 16,
    },
    templateHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    templateLabel: {
        fontSize: 9,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.2)',
        letterSpacing: 1,
    },
    templateScroll: {
        gap: 12,
        paddingRight: 20,
    },
    templateItemContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    templateBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.04)',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        gap: 6,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.03)',
    },
    templateActions: {
        flexDirection: 'row',
        gap: 8,
        backgroundColor: 'rgba(255,255,255,0.02)',
        paddingHorizontal: 6,
        paddingVertical: 4,
        borderRadius: 8,
    },
    templateEmoji: {
        fontSize: 12,
    },
    templateBtnText: {
        fontSize: 11,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.5)',
    },
    templateEditCard: {
        backgroundColor: '#111',
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    templateHeader: {
        fontSize: 10,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.2)',
        letterSpacing: 2,
        marginBottom: 20,
    },
    templateInputLabel: {
        fontSize: 16,
        color: '#fff',
        fontWeight: '700',
        marginBottom: 16,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    templateInputContent: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.6)',
        lineHeight: 22,
        minHeight: 150,
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    },
    templateSaveActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 12,
        marginTop: 20,
    },
    cancelBtn: {
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    cancelText: {
        fontSize: 11,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.3)',
    },
    saveTemplateBtn: {
        backgroundColor: '#fff',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
    },
    saveTemplateText: {
        fontSize: 11,
        fontWeight: '900',
        color: '#000',
    },
    notesIconBtn: {
        width: 40,
        height: 40,
        marginLeft: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tabToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 14,
        padding: 2,
    },
    tabBtn: {
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 10,
    },
    tabBtnActive: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    tabText: {
        fontSize: 10,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 1,
    },
    tabTextActive: {
        color: '#fff',
    },
    tabDivider: {
        width: 1,
        height: 10,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    notesModeContainer: {
        flex: 1,
    },
    diaryTopActionsRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginBottom: 10,
    },
    diaryTemplatesBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        height: 34,
        paddingHorizontal: 12,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    diaryTemplatesBtnText: {
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 1.2,
        color: 'rgba(255,255,255,0.55)',
    },
    diaryCardTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    diaryDatePill: {
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 1.2,
        color: 'rgba(255,255,255,0.4)',
        textTransform: 'uppercase',
    },
    diaryTopIconBtn: {
        width: 32,
        height: 32,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    mentionPopup: {
        position: 'absolute',
        bottom: 70, // Float above the footer/toolbar
        left: 20,
        right: 20,
        backgroundColor: 'rgba(20,20,20,0.95)',
        paddingVertical: 6,
        paddingHorizontal: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        zIndex: 1000,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    mentionPopupInline: {
        position: 'absolute',
        bottom: 20, // Float over bottom of card
        left: 10,
        right: 10,
        backgroundColor: 'rgba(20,20,20,0.98)',
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
        flexDirection: 'row',
        alignItems: 'center',
        zIndex: 2000,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 6,
    },
    mentionItem: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        marginHorizontal: 4,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    mentionItemText: {
        color: 'rgba(255,255,255,0.9)',
        fontSize: 12,
        fontWeight: '500',
    },
    diaryTemplatesModal: {
        backgroundColor: '#111',
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    diaryTemplatesGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginTop: 14,
    },
    diaryTemplateCard: {
        width: '48%',
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 18,
        padding: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    diaryTemplateEmoji: {
        fontSize: 18,
        marginBottom: 8,
    },
    diaryTemplateLabel: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '900',
        marginBottom: 6,
    },
    diaryTemplatePreview: {
        color: 'rgba(255,255,255,0.45)',
        fontSize: 11,
        lineHeight: 16,
    },
    foldersView: {
        flex: 1,
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 10,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 2,
    },
    folderGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    folderCardWrapper: {
        width: '48%',
    },
    folderCard: {
        width: '100%',
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 20,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    folderCardLocked: {
        borderColor: 'rgba(255, 152, 0, 0.22)',
        backgroundColor: 'rgba(255, 152, 0, 0.045)',
    },
    folderCardUnlocked: {
        borderColor: 'rgba(76, 175, 80, 0.16)',
        backgroundColor: 'rgba(255,255,255,0.03)',
    },
    folderCardLockedOut: {
        opacity: 0.45,
    },
    trashFolderCard: {
        borderColor: 'rgba(255, 61, 0, 0.25)',
        backgroundColor: 'rgba(255, 61, 0, 0.04)',
    },
    folderCardTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    folderDeleteBtn: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 24,
        height: 24,
        borderRadius: 8,
        backgroundColor: 'rgba(255, 61, 0, 0.05)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    folderEmojiBox: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.06)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    folderEmojiText: {
        fontSize: 18,
    },
    folderStatusPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        height: 28,
        borderRadius: 999,
        borderWidth: 1,
    },
    folderStatusPillLocked: {
        backgroundColor: 'rgba(255, 152, 0, 0.10)',
        borderColor: 'rgba(255, 152, 0, 0.18)',
    },
    folderStatusPillUnlocked: {
        backgroundColor: 'rgba(76, 175, 80, 0.08)',
        borderColor: 'rgba(76, 175, 80, 0.18)',
    },
    folderStatusText: {
        fontSize: 9,
        fontWeight: '900',
        letterSpacing: 1.1,
    },
    folderStatusTextLocked: {
        color: '#FF9800',
    },
    folderStatusTextUnlocked: {
        color: 'rgba(76,175,80,0.95)',
    },
    folderNameText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 4,
    },
    folderCountText: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 10,
        fontWeight: '600',
    },
    folderInputCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: 4,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#4CAF50',
    },
    folderInput: {
        flex: 1,
        height: 40,
        paddingHorizontal: 12,
        color: '#fff',
        fontSize: 14,
    },
    folderAddBtn: {
        width: 32,
        height: 32,
        borderRadius: 10,
        backgroundColor: '#4CAF50',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 4,
    },
    folderCancelBtn: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    notesListView: {
        flex: 1,
    },
    backToFoldersBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 20,
    },
    backBtnText: {
        fontSize: 10,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 0.5,
    },
    notesGrid: {
        gap: 12,
    },
    generalNoteCardWrapper: {
        width: '100%',
    },
    generalNoteCard: {
        width: '100%',
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    generalNoteDeleteBtn: {
        position: 'absolute',
        top: 12,
        right: 12,
        width: 32,
        height: 32,
        borderRadius: 10,
        backgroundColor: 'rgba(255, 61, 0, 0.05)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    trashNoteActions: {
        position: 'absolute',
        top: 10,
        right: 10,
        flexDirection: 'row',
        gap: 10,
    },
    trashActionBtn: {
        width: 34,
        height: 34,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    trashActionBtnDanger: {
        backgroundColor: 'rgba(255, 61, 0, 0.06)',
        borderColor: 'rgba(255, 61, 0, 0.12)',
    },
    generalNotePreview: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 12,
    },
    noteCardHeadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        marginBottom: 8,
    },
    noteCardHeading: {
        flex: 1,
        color: '#fff',
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 0.3,
    },
    noteCardMeta: {
        color: 'rgba(255,255,255,0.25)',
        fontSize: 9,
        fontWeight: '700',
        letterSpacing: 0.6,
        textTransform: 'uppercase',
    },
    editorTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        marginBottom: 10,
    },
    editorTitleActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    expandBtn: {
        width: 30,
        height: 30,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    editorTitle: {
        flex: 1,
        color: '#fff',
        fontSize: 13,
        fontWeight: '900',
        letterSpacing: 0.2,
    },
    editorTitleInput: {
        flex: 1,
        color: '#fff',
        fontSize: 14,
        fontWeight: '900',
        letterSpacing: 0.2,
        paddingVertical: 0,
        paddingHorizontal: 0,
    },
    editorMeta: {
        color: 'rgba(255,255,255,0.25)',
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
    },
    editorTitleDivider: {
        height: 1,
        width: '100%',
        backgroundColor: 'rgba(255,255,255,0.06)',
        marginBottom: 12,
    },
    richEditorWrap: {
        flex: 1,
        minHeight: 260,
    },
    richEditor: {
        flex: 1,
        minHeight: 260,
    },
    richToolbar: {
        marginTop: 12,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        paddingHorizontal: 6,
        paddingVertical: 6,
    },
    expandedEditorRoot: {
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 2,
        paddingBottom: 6,
    },
    expandedTopBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    expandedTopRightIcons: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    expandedTopBtnActive: {
        backgroundColor: 'rgba(76,175,80,0.12)',
        borderColor: 'rgba(76,175,80,0.18)',
    },
    expandedTopBtn: {
        paddingHorizontal: 10,
        height: 34,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    expandedModeToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        padding: 2,
        height: 34,
    },
    expandedModeBtn: {
        paddingHorizontal: 12,
        height: 30,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    expandedModeBtnActive: {
        backgroundColor: 'rgba(255,255,255,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    expandedModeText: {
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 1.2,
        color: 'rgba(255,255,255,0.35)',
    },
    expandedModeTextActive: {
        color: '#fff',
    },
    expandedModeDivider: {
        width: 1,
        height: 12,
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    expandedTopBtnText: {
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 1.2,
        color: 'rgba(255,255,255,0.55)',
    },
    expandedTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 6,
    },
    expandedTitleInput: {
        flex: 1,
        color: '#fff',
        fontSize: 16,
        fontWeight: '900',
        letterSpacing: 0.2,
        paddingVertical: 4,
        paddingHorizontal: 0,
    },
    richToolbarTop: {
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        paddingHorizontal: 4,
        paddingVertical: 4,
        marginBottom: 6,
    },
    richToolbarBlockCompact: {
        marginBottom: 8,
    },
    expandedEditorBody: {
        flex: 1,
    },
    richToolbarBlock: {
        marginTop: 12,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        paddingHorizontal: 6,
        paddingTop: 6,
        paddingBottom: 10,
    },
    inlineConfigRow: {
        marginTop: 0,
        paddingHorizontal: 6,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        marginBottom: 6,
    },
    inlineConfigGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    inlineColorsScroll: {
        paddingLeft: 6,
        paddingRight: 2,
        gap: 10,
        alignItems: 'center',
    },
    inlineConfigLabel: {
        fontSize: 8,
        fontWeight: '900',
        letterSpacing: 1.2,
        color: 'rgba(255,255,255,0.28)',
    },
    inlineConfigBtn: {
        height: 24,
        paddingHorizontal: 10,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    inlineConfigBtnText: {
        fontSize: 10,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.6)',
        letterSpacing: 0.2,
    },
    inlineConfigValue: {
        fontSize: 9,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.55)',
        letterSpacing: 0.3,
        minWidth: 42,
        textAlign: 'center',
    },
    inlineColorDot: {
        width: 16,
        height: 16,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.10)',
    },
    inlineColorDotActive: {
        borderColor: '#fff',
        transform: [{ scale: 1.08 }],
    },
    pinInput: {
        marginTop: 16,
        height: 52,
        borderRadius: 16,
        paddingHorizontal: 16,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        color: '#fff',
        fontSize: 18,
        fontWeight: '800',
        letterSpacing: 6,
        textAlign: 'center',
    },
    // config toggle UI lives in expanded top bar (icon-only)
    generalNoteDate: {
        color: 'rgba(255,255,255,0.2)',
        fontSize: 9,
        fontWeight: '700',
    },
    emptyItemsWrapper: {
        padding: 40,
        alignItems: 'center',
    },
    emptyItemsText: {
        color: 'rgba(255,255,255,0.2)',
        fontSize: 12,
        textAlign: 'center',
        lineHeight: 18,
    },
    notesIconInner: {
        width: 30,
        height: 30,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    notesIconInnerActive: {
        backgroundColor: 'rgba(76,175,80,0.12)',
    },
    noteDot: {
        position: 'absolute',
        top: 4,
        right: 4,
        width: 5,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: 'rgba(255, 61, 0, 0.9)',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.5)',
    },
    noteDotActive: {
        backgroundColor: 'rgba(76, 175, 80, 0.95)',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.96)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
    },
    modalOverlayLandscape: {
        padding: 12,
        // Keep popup centered; prevent overlap via ScrollView maxHeight in landscape.
    },
    premiumPopup: {
        backgroundColor: '#050505',
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.6,
        shadowRadius: 30,
        elevation: 12,
        width: '92%',
        maxWidth: 360,
    },
    confirmPopup: {
        backgroundColor: '#050505',
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.6,
        shadowRadius: 30,
        elevation: 12,
        width: '90%',
        maxWidth: 340,
    },
    confirmText: {
        color: 'rgba(255,255,255,0.55)',
        fontSize: 13,
        lineHeight: 18,
        marginTop: 6,
    },
    folderActionsPopup: {
        backgroundColor: '#050505',
        borderRadius: 28,
        padding: 20,
        width: '92%',
        maxWidth: 350,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.6,
        shadowRadius: 30,
        elevation: 15,
        alignSelf: 'center',
    },
    folderLockPopup: {
        backgroundColor: '#050505',
        borderRadius: 24,
        padding: 20,
        width: '92%',
        maxWidth: 330,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    lockInputContainer: {
        alignItems: 'center',
        marginVertical: 18,
    },
    folderLockPinInput: {
        backgroundColor: 'rgba(255,255,255,0.03)',
        width: 110,
        height: 52,
        borderRadius: 14,
        textAlign: 'center',
        fontSize: 22,
        color: '#fff',
        fontWeight: '700',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    confirmBtnPrimary: {
        backgroundColor: 'rgba(76, 175, 80, 0.15)',
        borderColor: 'rgba(76, 175, 80, 0.2)',
    },
    confirmBtnTextPrimary: {
        color: '#4CAF50',
    },
    folderActionsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 20,
        gap: 10,
    },
    folderActionBtn: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 12,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    folderActionIconBox: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    folderActionBtnText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    confirmActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 10,
        marginTop: 18,
    },
    confirmBtn: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    confirmBtnDanger: {
        backgroundColor: 'rgba(255, 61, 0, 0.12)',
        borderColor: 'rgba(255, 61, 0, 0.16)',
    },
    confirmBtnText: {
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 1,
        color: 'rgba(255,255,255,0.5)',
    },
    confirmBtnTextDanger: {
        color: 'rgba(255, 61, 0, 0.95)',
    },
    popupHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    popupTitle: {
        fontSize: 10,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 2,
    },
    pinErrorText: {
        marginTop: 10,
        color: 'rgba(255, 61, 0, 0.9)',
        fontSize: 12,
        fontWeight: '800',
    },
    folderPopupInput: {
        fontSize: 20,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 14,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    popupLabel: {
        fontSize: 9,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 1,
        marginBottom: 6,
    },
    colorPickerRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 14,
    },
    colorDot: {
        width: 30,
        height: 30,
        borderRadius: 15,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    colorDotActive: {
        borderColor: '#fff',
        transform: [{ scale: 1.1 }],
    },
    emojiPickerScroll: {
        marginBottom: 12,
    },
    emojiBtn: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.03)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    emojiBtnActive: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    emojiBtnText: {
        fontSize: 20,
    },
    popupPrimaryBtn: {
        backgroundColor: '#fff',
        borderRadius: 16,
        paddingVertical: 12,
        alignItems: 'center',
    },
    popupPrimaryBtnText: {
        color: '#000',
        fontSize: 14,
        fontWeight: '800',
    },
    popupDeleteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 16,
        paddingVertical: 12,
    },
    popupDeleteBtnText: {
        color: '#FF3D00',
        fontSize: 12,
        fontWeight: '700',
    },
});

