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

const NOTES_STORAGE_KEY = '@timer_app_day_notes_v2';
const TEMPLATES_STORAGE_KEY = '@timer_app_diary_templates';
const FOLDERS_STORAGE_KEY = '@timer_app_diary_folders';
const GENERAL_NOTES_STORAGE_KEY = '@timer_app_general_notes';

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
    createdAt: number;
};

type GeneralNote = {
    id: string;
    folderId: string;
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

    const [loading, setLoading] = React.useState(false);
    const [savedText, setSavedText] = React.useState('');
    const [draftText, setDraftText] = React.useState('');
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
    
    const [isKeyboardVisible, setIsKeyboardVisible] = React.useState(false);

    const isPortrait = height > width;

    const isDirty = draftText !== savedText;
    const charCount = draftText.length;
    const readTime = Math.max(1, Math.ceil(charCount / 500));

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
            setSavedText(data.text);
            setDraftText(data.text);
            setMood(data.mood);
            setWeather(data.weather);
            setMode(data.text.trim().length > 0 ? 'view' : 'edit');
            onPresenceChange?.(data.text.trim().length > 0);
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
                if (!entry || !entry.text.trim()) return;
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
        const storedFolders = await readFolders();
        const storedNotes = await readGeneralNotes();
        setFolders(storedFolders);
        setGeneralNotes(storedNotes);
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

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        
        if (folderToEdit) {
            // UPDATE EXISTING
            const updated = folders.map(f => f.id === folderToEdit.id ? {
                ...f,
                name: newFolderName,
                emoji: newFolderEmoji,
                color: newFolderColor
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
                createdAt: Date.now(),
            };
            const updated = [...folders, newFolder];
            setFolders(updated);
            await saveFolders(updated);
        }

        setNewFolderName('');
        setNewFolderEmoji(PRESET_FOLDER_EMOJIS[0]);
        setNewFolderColor(PRESET_FOLDER_COLORS[0]);
        setFolderToEdit(null);
        setIsCreatingFolder(false);
    };

    const handleCreateNote = async () => {
        if (!currentFolderId) return;
        const newNote: GeneralNote = {
            id: Date.now().toString(),
            folderId: currentFolderId,
            text: '',
            updatedAt: Date.now(),
        };
        const updated = [...generalNotes, newNote];
        setGeneralNotes(updated);
        await saveGeneralNotes(updated);
        setCurrentNoteId(newNote.id);
        setDraftText('');
        setSavedText('');
        setMode('edit');
    };

    const handleDeleteGeneralNote = async (id: string) => {
        const remaining = generalNotes.filter(n => n.id !== id);
        setGeneralNotes(remaining);
        await saveGeneralNotes(remaining);
        if (currentNoteId === id) {
            setCurrentNoteId(null);
            setDraftText('');
            setSavedText('');
        }
    };

    const handleDeleteFolder = async (id: string) => {
        // Find notes to delete as well
        const remainingNotes = generalNotes.filter(n => n.folderId !== id);
        const remainingFolders = folders.filter(f => f.id !== id);
        
        setFolders(remainingFolders);
        setGeneralNotes(remainingNotes);
        
        await saveFolders(remainingFolders);
        await saveGeneralNotes(remainingNotes);
        
        if (currentFolderId === id) {
            setCurrentFolderId(null);
            setCurrentNoteId(null);
        }
    };

    const handleSaveGeneralNote = async (text: string) => {
        if (!currentNoteId) return;
        const updated = generalNotes.map(n => 
            n.id === currentNoteId ? { ...n, text, updatedAt: Date.now() } : n
        );
        setGeneralNotes(updated);
        await saveGeneralNotes(updated);
        setSavedText(text);
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
                    await handleSaveGeneralNote(draftText);
                }
                setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
                onPresenceChange?.(draftText.trim().length > 0);
            } finally {
                setIsAutoSaving(false);
            }
        }, 1500);

        return () => {
            if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        };
    }, [visible, isDirty, draftText, dateKey, mood, weather, currentTab, currentNoteId]);

    React.useEffect(() => {
        if (visible) load(dateKey);
    }, [visible, dateKey, load]);

    React.useEffect(() => {
        if (visible && showAllDays) loadAllDays();
    }, [visible, showAllDays, loadAllDays]);

    if (!visible) return null;

    return (
        <View style={styles.container}>
            <LinearGradient colors={['#000', '#0A0A0A']} style={StyleSheet.absoluteFill} />
            
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <View style={[styles.safeArea, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 10 }]}>
                    
                    {/* Header Section */}
                    <View style={styles.headerContainer}>
                        <View style={styles.headerTop}>
                            <View style={styles.tabToggle}>
                                <TouchableOpacity 
                                    onPress={() => {
                                        setCurrentTab('diary');
                                        setCurrentFolderId(null);
                                        setCurrentNoteId(null);
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
                                        setDraftText('');
                                        setSavedText('');
                                    }}
                                    style={[styles.tabBtn, currentTab === 'notes' && styles.tabBtnActive]}
                                >
                                    <Text style={[styles.tabText, currentTab === 'notes' && styles.tabTextActive]}>NOTES</Text>
                                </TouchableOpacity>
                            </View>

                            <TouchableOpacity style={styles.closeCircle} onPress={onClose} activeOpacity={0.7}>
                                <MaterialIcons name="close" size={20} color="#fff" />
                            </TouchableOpacity>
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

                            <TouchableOpacity 
                                style={[styles.allDaysBtn, showAllDays && styles.allDaysBtnActive]}
                                onPress={() => setShowAllDays(!showAllDays)}
                            >
                                <MaterialIcons name="segment" size={18} color={showAllDays ? '#fff' : 'rgba(255,255,255,0.4)'} />
                                <Text style={[styles.allDaysText, showAllDays && styles.allDaysTextActive]}>ALL DAYS</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Main Content Card ScrollArea */}
                    <ScrollView 
                        style={styles.scrollArea} 
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {currentTab === 'diary' ? (
                            showAllDays ? (
                                <View style={styles.allDaysContainer}>
                                    <Text style={styles.allDaysSectionTitle}>ENTRIES</Text>
                                    {allDaysLoading ? (
                                        <View style={styles.loadingWrapper}>
                                            <Text style={styles.loadingText}>Loading history...</Text>
                                        </View>
                                    ) : allDaysNotes.length === 0 ? (
                                        <View style={styles.loadingWrapper}>
                                            <Text style={styles.emptyHistoryText}>No entries found.</Text>
                                        </View>
                                    ) : (
                                        allDaysNotes.map((note) => (
                                            <TouchableOpacity 
                                                key={note.dateKey} 
                                                style={[styles.historyCard, note.dateKey === dateKey && styles.historyCardActive]}
                                                onPress={() => setExpandedAllDays(prev => ({ ...prev, [note.dateKey]: !prev[note.dateKey] }))}
                                            >
                                                <View style={styles.historyCardHeader}>
                                                    <Text style={styles.historyDate}>{note.dateKey === dateKey ? 'TODAY' : note.dateKey}</Text>
                                                    {note.dateKey === dateKey && <View style={styles.todayIndicator} />}
                                                </View>
                                                <Text 
                                                    style={styles.historyText} 
                                                    numberOfLines={expandedAllDays[note.dateKey] ? undefined : 3}
                                                >
                                                    {note.text}
                                                </Text>
                                            </TouchableOpacity>
                                        ))
                                    )}
                                </View>
                            ) : isEditingTemplate ? (
                                <View style={styles.templateEditCard}>
                                    <Text style={styles.templateHeader}>CUSTOM TEMPLATE</Text>
                                    <TextInput
                                        style={styles.templateInputLabel}
                                        placeholder="Template Name (e.g., Workout Log)"
                                        placeholderTextColor="rgba(255,255,255,0.2)"
                                        value={templateLabel}
                                        onChangeText={setTemplateLabel}
                                    />
                                    <TextInput
                                        style={styles.templateInputContent}
                                        placeholder="Template Content..."
                                        placeholderTextColor="rgba(255,255,255,0.2)"
                                        multiline
                                        value={templateContent}
                                        onChangeText={setTemplateContent}
                                    />
                                    <View style={styles.templateSaveActions}>
                                        <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsEditingTemplate(null)}>
                                            <Text style={styles.cancelText}>CANCEL</Text>
                                        </TouchableOpacity>
                                        
                                        <View style={{ flexDirection: 'row', gap: 12 }}>
                                            {isEditingTemplate.isCustom !== false && (
                                                <TouchableOpacity 
                                                    style={[styles.cancelBtn, { borderColor: 'rgba(255, 61, 0, 0.2)', borderWidth: 1, borderRadius: 12 }]} 
                                                    onPress={() => handleDeleteTemplate(isEditingTemplate.id)}
                                                >
                                                    <Text style={[styles.cancelText, { color: '#FF3D00' }]}>DELETE</Text>
                                                </TouchableOpacity>
                                            )}
                                            <TouchableOpacity style={styles.saveTemplateBtn} onPress={handleSaveTemplate}>
                                                <Text style={styles.saveTemplateText}>SAVE TEMPLATE</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </View>
                            ) : (
                                <View style={[styles.fixedEditorContainer, isPortrait ? styles.editorPortrait : styles.editorLandscape]}>
                                    {mode === 'edit' && draftText.trim() === '' && (
                                        <View style={styles.templateSelection}>
                                            <View style={styles.templateHeaderRow}>
                                                <Text style={styles.templateLabel}>TEMPLATES</Text>
                                                <TouchableOpacity onPress={handleCreateTemplate}>
                                                    <MaterialIcons name="add" size={16} color="rgba(255,255,255,0.3)" />
                                                </TouchableOpacity>
                                            </View>
                                            <ScrollView 
                                                horizontal 
                                                showsHorizontalScrollIndicator={false}
                                                contentContainerStyle={styles.templateScroll}
                                            >
                                                {allTemplates.map(t => (
                                                    <View key={t.id} style={styles.templateItemContainer}>
                                                        <TouchableOpacity 
                                                            style={styles.templateBtn}
                                                            onPress={() => setDraftText(t.text)}
                                                            onLongPress={() => handleEditTemplate(t)}
                                                        >
                                                            <Text style={styles.templateEmoji}>{t.emoji}</Text>
                                                            <Text style={styles.templateBtnText}>{t.label}</Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                ))}
                                            </ScrollView>
                                        </View>
                                    )}

                                    <View style={styles.noteCardFixed}>
                                        <ScrollView style={styles.editorScroll} showsVerticalScrollIndicator={false}>
                                            <TextInput
                                                style={styles.textInput}
                                                value={draftText}
                                                onChangeText={setDraftText}
                                                placeholder="How was your day? Write your thoughts here..."
                                                placeholderTextColor="rgba(255,255,255,0.2)"
                                                multiline
                                                editable={mode === 'edit'}
                                                scrollEnabled={false}
                                            />
                                        </ScrollView>

                                        <View style={styles.cardFooter}>
                                            <View style={styles.footerDivider} />
                                            <View style={styles.footerStats}>
                                                <Text style={styles.statsText}>{charCount} CHARACTERS</Text>
                                                <Text style={styles.statsText}>&lt; {readTime} MIN READ</Text>
                                            </View>
                                        </View>
                                    </View>
                                </View>
                            )
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
                                            onRequestClose={() => {
                                                setIsCreatingFolder(false);
                                                setFolderToEdit(null);
                                            }}
                                        >
                                            <TouchableWithoutFeedback onPress={() => {
                                                setIsCreatingFolder(false);
                                                setFolderToEdit(null);
                                            }}>
                                                <View style={styles.modalOverlay}>
                                                    <TouchableWithoutFeedback onPress={e => e.stopPropagation()}>
                                                        <View style={styles.premiumPopup}>
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
                                                                style={[styles.popupPrimaryBtn, !newFolderName.trim() && { opacity: 0.5 }]}
                                                                onPress={handleCreateFolder}
                                                                disabled={!newFolderName.trim()}
                                                            >
                                                                <Text style={styles.popupPrimaryBtnText}>{folderToEdit ? 'Update Folder' : 'Create Folder'}</Text>
                                                            </TouchableOpacity>

                                                            {folderToEdit && (
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
                                                        </View>
                                                    </TouchableWithoutFeedback>
                                                </View>
                                            </TouchableWithoutFeedback>
                                        </Modal>

                                        <View style={styles.folderGrid}>
                                            {folders.map(f => (
                                                <View key={f.id} style={styles.folderCardWrapper}>
                                                        <TouchableOpacity 
                                                            style={styles.folderCard}
                                                            onPress={() => setCurrentFolderId(f.id)}
                                                            onLongPress={() => {
                                                                setFolderToEdit(f);
                                                                setNewFolderName(f.name);
                                                                setNewFolderEmoji(f.emoji);
                                                                setNewFolderColor(f.color || PRESET_FOLDER_COLORS[0]);
                                                                setIsCreatingFolder(true);
                                                            }}
                                                        >
                                                        <View style={[styles.folderEmojiBox, { backgroundColor: f.color ? `${f.color}15` : 'rgba(255,255,255,0.05)' }]}>
                                                            <Text style={styles.folderEmojiText}>{f.emoji}</Text>
                                                        </View>
                                                        <Text style={styles.folderNameText} numberOfLines={1}>{f.name}</Text>
                                                        <Text style={styles.folderCountText}>
                                                            {generalNotes.filter(n => n.folderId === f.id).length} notes
                                                        </Text>
                                                    </TouchableOpacity>
                                                </View>
                                            ))}
                                        </View>

                                        {folders.length === 0 && !isCreatingFolder && (
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
                                            <Text style={styles.sectionTitle}>NOTES IN {currentFolder?.name.toUpperCase()}</Text>
                                            <TouchableOpacity onPress={handleCreateNote}>
                                                <MaterialIcons name="add-circle" size={20} color="#4CAF50" />
                                            </TouchableOpacity>
                                        </View>

                                        <View style={styles.notesGrid}>
                                            {generalNotes.filter(n => n.folderId === currentFolderId).map(n => (
                                                <View key={n.id} style={styles.generalNoteCardWrapper}>
                                                    <TouchableOpacity 
                                                        style={styles.generalNoteCard}
                                                        onPress={() => {
                                                            setCurrentNoteId(n.id);
                                                            setDraftText(n.text);
                                                            setSavedText(n.text);
                                                            setMode(n.text.trim().length > 0 ? 'view' : 'edit');
                                                        }}
                                                    >
                                                        <Text style={styles.generalNotePreview} numberOfLines={3}>
                                                            {n.text || 'Empty note...'}
                                                        </Text>
                                                        <Text style={styles.generalNoteDate}>
                                                            {new Date(n.updatedAt).toLocaleDateString()}
                                                        </Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity 
                                                        style={styles.generalNoteDeleteBtn}
                                                        onPress={() => handleDeleteGeneralNote(n.id)}
                                                    >
                                                        <MaterialIcons name="delete-outline" size={14} color="rgba(255, 61, 0, 0.3)" />
                                                    </TouchableOpacity>
                                                </View>
                                            ))}
                                        </View>

                                        {generalNotes.filter(n => n.folderId === currentFolderId).length === 0 && (
                                            <View style={styles.emptyItemsWrapper}>
                                                <Text style={styles.emptyItemsText}>No notes in this folder yet.</Text>
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
                                            onPress={() => setCurrentNoteId(null)}
                                        >
                                            <MaterialIcons name="arrow-back" size={16} color="rgba(255,255,255,0.4)" />
                                            <Text style={styles.backBtnText}>BACK TO LIST</Text>
                                        </TouchableOpacity>

                                        {mode === 'edit' && draftText.trim() === '' && (
                                            <View style={styles.templateSelection}>
                                                <View style={styles.templateHeaderRow}>
                                                    <Text style={styles.templateLabel}>TEMPLATES</Text>
                                                    <TouchableOpacity onPress={handleCreateTemplate}>
                                                        <MaterialIcons name="add" size={16} color="rgba(255,255,255,0.3)" />
                                                    </TouchableOpacity>
                                                </View>
                                                <ScrollView 
                                                    horizontal 
                                                    showsHorizontalScrollIndicator={false}
                                                    contentContainerStyle={styles.templateScroll}
                                                >
                                                    {allTemplates.map(t => (
                                                        <View key={t.id} style={styles.templateItemContainer}>
                                                            <TouchableOpacity 
                                                                style={styles.templateBtn}
                                                                onPress={() => setDraftText(t.text)}
                                                                onLongPress={() => handleEditTemplate(t)}
                                                            >
                                                                <Text style={styles.templateEmoji}>{t.emoji}</Text>
                                                                <Text style={styles.templateBtnText}>{t.label}</Text>
                                                            </TouchableOpacity>
                                                        </View>
                                                    ))}
                                                </ScrollView>
                                            </View>
                                        )}

                                        <View style={styles.noteCardFixed}>
                                            <ScrollView style={styles.editorScroll} showsVerticalScrollIndicator={false}>
                                                <TextInput
                                                    style={styles.textInput}
                                                    value={draftText}
                                                    onChangeText={setDraftText}
                                                    placeholder="Write your note here..."
                                                    placeholderTextColor="rgba(255,255,255,0.2)"
                                                    multiline
                                                    editable={mode === 'edit'}
                                                    scrollEnabled={false}
                                                />
                                            </ScrollView>
                                        </View>
                                    </View>
                                )}
                            </View>
                        )}
                    </ScrollView>


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
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    folderEmojiText: {
        fontSize: 18,
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
    generalNotePreview: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 12,
    },
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
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'center',
        padding: 20,
    },
    premiumPopup: {
        backgroundColor: '#111',
        borderRadius: 24,
        padding: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.5,
        shadowRadius: 40,
        elevation: 10,
    },
    popupHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    popupTitle: {
        fontSize: 10,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 2,
    },
    folderPopupInput: {
        fontSize: 24,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 32,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    popupLabel: {
        fontSize: 9,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 1,
        marginBottom: 12,
    },
    colorPickerRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 32,
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
        marginBottom: 32,
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
        paddingVertical: 16,
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

