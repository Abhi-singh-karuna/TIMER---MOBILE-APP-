import * as React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { StyleProp, ViewStyle } from 'react-native';
import { RichEditor, RichToolbar, actions } from 'react-native-pell-rich-editor';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DIARY_DEFAULT_TEXT_COLOR = 'rgba(255,255,255,0.86)';
const DIARY_COLOR_OPTIONS = [
    DIARY_DEFAULT_TEXT_COLOR,
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

const DIARY_FONT_SIZE_KEY = '@timer_app_notes_font_size_v1';

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

function normalizeToHtml(content: string): string {
    const c = (content || '').toString().trim();
    if (!c) return '';
    const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(c);
    return looksLikeHtml ? c : plainTextToHtml(c);
}

type DiaryTemplate = {
    id: string;
    label: string;
    emoji: string;
    text: string;
    isCustom?: boolean;
};

export default function DiaryTab(props: {
    styles: any;
    dateKey: string;
    isPortrait: boolean;
    mode: 'view' | 'edit';
    setMode: (v: 'view' | 'edit') => void;
    draftText: string;
    setDraftText: (v: string) => void;
    charCount: number;
    readTime: number;
    showAllDays: boolean;
    allDaysLoading: boolean;
    allDaysNotes: Array<{ dateKey: string; text: string; updatedAt: number }>;
    expandedAllDays: Record<string, boolean>;
    setExpandedAllDays: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    isEditingTemplate: DiaryTemplate | null;
    templateLabel: string;
    setTemplateLabel: (v: string) => void;
    templateContent: string;
    setTemplateContent: (v: string) => void;
    allTemplates: DiaryTemplate[];
    handleCreateTemplate: () => void;
    handleEditTemplate: (t: DiaryTemplate) => void;
    handleSaveTemplate: () => Promise<void>;
    handleDeleteTemplate: (id: string) => Promise<void>;
    setIsEditingTemplate: (v: DiaryTemplate | null) => void;
}) {
    const {
        styles,
        dateKey,
        isPortrait,
        mode,
        setMode,
        draftText,
        setDraftText,
        charCount,
        readTime,
        showAllDays,
        allDaysLoading,
        allDaysNotes,
        expandedAllDays,
        setExpandedAllDays,
        allTemplates,
    } = props;

    const richEditorRef = React.useRef<RichEditor | null>(null);
    const [isExpanded, setIsExpanded] = React.useState(false);
    const [showConfig, setShowConfig] = React.useState(false);
    const [fontSizePx, setFontSizePx] = React.useState(17);
    const [selectedColor, setSelectedColor] = React.useState(DIARY_DEFAULT_TEXT_COLOR);
    const [showMentions, setShowMentions] = React.useState(false);
    const [mentionOptions, setMentionOptions] = React.useState<string[]>([]);
    const [mentionPos, setMentionPos] = React.useState({ x: 0, y: 0 });
    const [isKeyboardVisible, setIsKeyboardVisible] = React.useState(false);

    React.useEffect(() => {
        const showSub = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardVisible(true));
        const hideSub = Keyboard.addListener('keyboardDidHide', () => setIsKeyboardVisible(false));
        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    // templates intentionally removed for diary
    const insets = useSafeAreaInsets();

    const loadFontSize = React.useCallback(async () => {
        try {
            const fs = await AsyncStorage.getItem(DIARY_FONT_SIZE_KEY);
            if (fs) {
                const n = Number(fs);
                if (n >= 12 && n <= 24) setFontSizePx(n);
            }
        } catch {
            // ignore
        }
    }, []);

    React.useEffect(() => {
        loadFontSize();
    }, [loadFontSize]);

    const applyAppearance = React.useCallback(() => {
        const px = Math.max(12, Math.min(24, fontSizePx));
        richEditorRef.current?.commandDOM(
            `document.body.style.fontSize='${px}px';document.body.style.color='${DIARY_DEFAULT_TEXT_COLOR}';`
        );
    }, [fontSizePx]);

    React.useEffect(() => {
        if (mode !== 'edit') setShowConfig(false);
    }, [mode]);

    React.useEffect(() => {
        // keep editor in sync when font size changes
        requestAnimationFrame(() => applyAppearance());
    }, [fontSizePx, applyAppearance]);

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

    const applySelectionColor = React.useCallback((color: string) => {
        setSelectedColor(color);
        richEditorRef.current?.commandDOM(
            `document.execCommand('styleWithCSS', false, true);document.execCommand('foreColor', false, '${color}');`
        );
    }, []);

    if (showAllDays) {
        return (
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
                                {stripHtmlToText(note.text)}
                            </Text>
                        </TouchableOpacity>
                    ))
                )}
            </View>
        );
    }

    return (
        <View style={[styles.fixedEditorContainer, isPortrait ? styles.editorPortrait : styles.editorLandscape]}>
            {/* Diary templates removed */}

            <View style={styles.noteCardFixed}>
                <View style={styles.diaryCardTopRow}>
                    <Text style={styles.diaryDatePill}>{dateKey}</Text>
                    <TouchableOpacity
                        style={styles.diaryTopIconBtn}
                        onPress={() => setIsExpanded(true)}
                        activeOpacity={0.85}
                    >
                        <MaterialIcons name="open-in-full" size={16} color="rgba(255,255,255,0.6)" />
                    </TouchableOpacity>
                </View>


                <ScrollView
                    style={{ height: 300 }}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled={true}
                >
                    <RichEditor
                        ref={(r) => { richEditorRef.current = r; }}
                        initialContentHTML={draftText}
                        placeholder="How was your day? Write your thoughts here..."
                        disabled={mode !== 'edit'}
                        useContainer={false}
                        initialHeight={500}
                        editorStyle={{
                            backgroundColor: 'transparent',
                            color: DIARY_DEFAULT_TEXT_COLOR,
                            placeholderColor: 'rgba(255,255,255,0.2)',
                            cssText: `
                                * { font-family: ${'Georgia'}; }
                                body {
                                    font-size: ${fontSizePx}px;
                                    line-height: 1.55;
                                    padding: 0;
                                    margin: 0;
                                    padding-bottom: ${isKeyboardVisible ? '150px' : '16px'};
                                }
                            `,
                        }}
                        editorInitializedCallback={applyAppearance}
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
                        style={{ minHeight: 500 }}
                    />
                </ScrollView>

                {mode === 'edit' && (
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
                )}

                <View style={styles.cardFooter}>
                    <View style={styles.footerDivider} />
                    <View style={styles.footerStats}>
                        <Text style={styles.statsText}>{charCount} CHARACTERS</Text>
                        <Text style={styles.statsText}>&lt; {readTime} MIN READ</Text>
                    </View>
                </View>

                {/* Mention Suggestions Popup - Floating above cursor */}
                {showMentions && (
                    <View style={[styles.mentionPopupInline, {
                        position: 'absolute',
                        top: Math.max(0, mentionPos.y - 50),
                        left: Math.min(300, mentionPos.x), // reasonable constraint
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

            {/* Diary templates modal removed */}

            {/* Expanded diary editor */}
            <Modal
                visible={isExpanded}
                transparent={false}
                animationType="fade"
                onRequestClose={() => setIsExpanded(false)}
            >
                <View style={{ flex: 1, backgroundColor: '#000' }}>
                    <View
                        style={[
                            styles.expandedEditorRoot,
                            { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 6 },
                        ]}
                    >
                        <View style={[styles.expandedTopBar, { paddingHorizontal: 16 }]}>
                            <TouchableOpacity
                                style={styles.expandedTopIconBtn}
                                onPress={() => setIsExpanded(false)}
                            >
                                <MaterialIcons name="arrow-back" size={20} color="#fff" />
                            </TouchableOpacity>

                            <View style={styles.expandedModeToggle}>
                                <TouchableOpacity
                                    style={[styles.expandedModeBtn, mode === 'view' && styles.expandedModeBtnActive]}
                                    onPress={() => setMode('view')}
                                >
                                    <Text style={[styles.expandedModeText, mode === 'view' && styles.expandedModeTextActive]}>VIEW</Text>
                                </TouchableOpacity>
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
                                        style={[styles.expandedTopBtn, showConfig && styles.expandedTopBtnActive]}
                                        onPress={() => setShowConfig(!showConfig)}
                                        activeOpacity={0.85}
                                    >
                                        <MaterialIcons
                                            name="tune"
                                            size={18}
                                            color={showConfig ? '#4CAF50' : 'rgba(255,255,255,0.6)'}
                                        />
                                    </TouchableOpacity>
                                )}

                                <TouchableOpacity
                                    style={styles.expandedTopBtn}
                                    onPress={() => setIsExpanded(false)}
                                >
                                    <MaterialIcons name="close-fullscreen" size={18} color="rgba(255,255,255,0.6)" />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {mode === 'edit' && showConfig && (
                            <View style={[styles.richToolbarBlockCompact, { paddingHorizontal: 16 }]}>
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
                                                setFontSizePx(v => {
                                                    const next = Math.max(12, v - 1);
                                                    AsyncStorage.setItem(DIARY_FONT_SIZE_KEY, next.toString()).catch(() => {});
                                                    return next;
                                                });
                                            }}
                                        >
                                            <Text style={styles.inlineConfigBtnText}>A-</Text>
                                        </TouchableOpacity>
                                        <Text style={styles.inlineConfigValue}>{fontSizePx}px</Text>
                                        <TouchableOpacity
                                            style={styles.inlineConfigBtn}
                                            onPress={() => {
                                                setFontSizePx(v => {
                                                    const next = Math.min(24, v + 1);
                                                    AsyncStorage.setItem(DIARY_FONT_SIZE_KEY, next.toString()).catch(() => {});
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
                                            {DIARY_COLOR_OPTIONS.map(c => (
                                                <TouchableOpacity
                                                    key={c}
                                                    style={[styles.inlineColorDot, { backgroundColor: c }, selectedColor === c && styles.inlineColorDotActive]}
                                                    onPress={() => applySelectionColor(c)}
                                                />
                                            ))}
                                        </ScrollView>
                                    </View>
                                </View>
                            </View>
                        )}


                        <View style={styles.expandedEditorBody}>
                            <KeyboardAvoidingView
                                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                                style={{ flex: 1 }}
                                keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 60 : 0}
                            >
                                <ScrollView
                                    style={{ flex: 1 }}
                                    contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }}
                                    showsVerticalScrollIndicator={true}
                                    keyboardShouldPersistTaps="handled"
                                    nestedScrollEnabled={true}
                                >
                                    <RichEditor
                                        ref={(r) => { richEditorRef.current = r; }}
                                        key={`diary_${dateKey}`}
                                        initialContentHTML={draftText}
                                        placeholder="How was your day? Write your thoughts here..."
                                        disabled={mode !== 'edit'}
                                        useContainer={false}
                                        initialHeight={200}
                                        editorStyle={{
                                            backgroundColor: 'transparent',
                                            color: DIARY_DEFAULT_TEXT_COLOR,
                                            placeholderColor: 'rgba(255,255,255,0.2)',
                                            cssText: `
                                                * { font-family: ${'Georgia'}; }
                                                body {
                                                    font-size: ${fontSizePx}px;
                                                    line-height: 1.65;
                                                    padding: 0;
                                                    margin: 0;
                                                    padding-bottom: 24px;
                                                    min-height: 90vh;
                                                }
                                            `,
                                        }}
                                        editorInitializedCallback={applyAppearance}
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
                                        style={{ minHeight: 200 }}
                                    />
                                </ScrollView>
                            </KeyboardAvoidingView>
                        </View>

                        {/* Mention Suggestions Popup for Expanded Editor - Floating above cursor */}
                        {showMentions && (
                            <View style={[styles.mentionPopup, {
                                position: 'absolute',
                                top: Math.max(0, mentionPos.y - 50),
                                left: Math.min(300, mentionPos.x),
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
                </View>
            </Modal>
        </View>
    );
}

