import * as React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Dimensions,
    Platform,
    Animated,
    Easing,
    useWindowDimensions,
    Modal,
    PanResponder,
    TextInput,
    LayoutAnimation,
    UIManager,
    Alert,
    FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { MaterialIcons } from '@expo/vector-icons';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { Category, Task, TaskStage, QuickMessage, StageStatus, Timer, LEAVE_DAYS_KEY } from '../../../constants/data';
import TaskActionModal from '../../../components/TaskActionModal';
import LiveFocusView from './LiveFocusView';
import StageActionPopup from './StageActionPopup';
import * as Haptics from 'expo-haptics';
import { TimeOfDaySlotConfigList } from '../../../utils/timeOfDaySlots';
import { getLogicalDate, getStartOfLogicalDay, DEFAULT_DAILY_START_MINUTES, formatDailyStartRangeCompact } from '../../../utils/dailyStartTime';
import { expandTasksForDate, findOriginalRecurringTask, getRecentRecurringDatesStatus } from '../../../utils/recurrenceUtils';
// import { useFocusEffect } from '@react-navigation/native'; // Removed to avoid crash outside NavContainer

const { width, height } = Dimensions.get('window');

// AsyncStorage keys for LiveFocusView zoom, scroll, and view mode persistence
const LIVE_FOCUS_ZOOM_KEY = '@timer_app_live_focus_zoom';
const LIVE_FOCUS_SCROLL_KEY = '@timer_app_live_focus_scroll_x';
const LIVE_FOCUS_VIEW_MODE_KEY = '@timer_app_live_focus_view_mode';

// Days and months for date formatting
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    safeArea: {
        flex: 1,
    },
    safeAreaLandscape: {
        flex: 1,
        flexDirection: 'row',
    },

    // Left Panel
    leftPanel: {
        paddingHorizontal: 0,
        paddingVertical: 0,
    },
    analyticsCardWrapper: {
        flex: 1,
        padding: 15,
        borderRadius: 24,
        backgroundColor: 'rgba(10, 10, 10, 0.7)',
        borderWidth: 1,
        borderColor: 'rgba(17, 17, 17, 0.08)',
    },
    leftPanelScroll: {
        flex: 1,
    },
    titleRowLandscape: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    headerTitleLandscape: {
        fontSize: 22,
        fontWeight: '800',
        color: '#fff',
        lineHeight: 26,
    },
    percentBadge: {
        fontSize: 12,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.6)',
    },
    dateControlRowLandscape: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    dateLandscapeRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    dateLandscapeText: {
        fontSize: 12,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.5)',
        lineHeight: 16,
    },
    todayNavBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    todayNavBtnActive: {
        backgroundColor: 'rgba(76, 175, 80, 0.08)',
        borderColor: 'rgba(76, 175, 80, 0.2)',
    },
    todayNavText: {
        fontSize: 9,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.3)',
        marginLeft: 3,
        letterSpacing: 0.5,
    },
    todayNavTextActive: {
        color: '#4CAF50',
    },
    todayLabelBlock: {
        marginLeft: 3,
        alignItems: 'flex-start',
    },
    todayRangeLabel: {
        fontSize: 8,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: 0.3,
        marginTop: 1,
    },
    todayRangeLabelActive: {
        color: 'rgba(76,175,80,0.85)',
    },

    // Stats
    compactStatsGrid: {
        marginBottom: 16,
    },
    compactStatRow: {
        flexDirection: 'row',
        gap: 8,
    },
    compactStatItem: {
        flex: 1,
        padding: 10,
        borderRadius: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    compactStatLabel: {
        fontSize: 8,
        fontWeight: '700',
        color: 'rgba(255, 255, 255, 0.4)',
        letterSpacing: 0.8,
        marginBottom: 4,
    },
    compactStatValue: {
        fontSize: 14,
        fontWeight: '700',
        color: '#fff',
    },

    // Filters
    filtersSection: {
        marginTop: 12,
        gap: 6,
    },
    filterHeaderLabel: {
        fontSize: 8,
        fontWeight: '800',
        color: 'rgba(255, 255, 255, 0.25)',
        letterSpacing: 1.2,
        marginBottom: 4,
    },
    expandableFilterContainer: {
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    expandableHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    expandableHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    expandableHeaderText: {
        fontSize: 11,
        fontWeight: '600',
        color: 'rgba(255, 255, 255, 0.6)',
    },
    expandedContent: {
        padding: 8,
        paddingTop: 0,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    miniChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    miniChipActive: {
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        borderColor: 'rgba(255, 255, 255, 0.3)',
    },
    miniChipText: {
        fontSize: 10,
        fontWeight: '700',
        color: 'rgba(255, 255, 255, 0.5)',
    },
    miniChipTextActive: {
        color: '#fff',
        fontWeight: '800',
    },

    // Right Panel
    rightPanel: {
        flex: 1,
        position: 'relative',
    },
    scrollViewLandscape: {
        flex: 1,
    },
    scrollContentLandscape: {
        flexGrow: 1,
        paddingHorizontal: 8,
        paddingVertical: 8,
        paddingBottom: 70,
    },
    cardRow: {
        flexDirection: 'row',
        gap: 4,
        marginBottom: -8,
    },
    cardPlaceholder: {
        flex: 1,
    },
    addButtonLandscape: {
        position: 'absolute',
        right: 16,
        bottom: 16,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 8,
    },

    // Portrait Header
    headerCardPortrait: {
        marginHorizontal: 16,
        marginTop: 10,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 24,
        backgroundColor: 'rgba(15, 15, 15, 0.6)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    headerMainRowPortrait: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
    },

    dateControlRowPortrait: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    headerCollapseBtnTop: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    headerIconBtnPortrait: {
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    headerIconBtnActivePortrait: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderColor: 'rgba(255,255,255,0.3)',
    },
    dateSelectorPillPortrait: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(0,0,0,0.25)',
        marginHorizontal: 6,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    datePillLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    dateSelectorTextPortrait: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    todayBtnPortrait: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    todayBtnActivePortrait: {
        backgroundColor: 'rgba(76, 175, 80, 0.08)',
        borderColor: 'rgba(76, 175, 80, 0.2)',
    },
    todayBtnTextPortrait: {
        fontSize: 9,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.3)',
        marginLeft: 4,
        letterSpacing: 0.5,
    },
    todayBtnTextActivePortrait: {
        color: '#4CAF50',
    },
    todayLabelBlockPortrait: {
        marginLeft: 4,
        alignItems: 'flex-start',
    },
    portraitFiltersContainer: {
        marginTop: 12,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.06)',
    },
    portraitFiltersScroll: {
        paddingRight: 10,
        gap: 8,
        alignItems: 'center',
    },
    filterDividerPortrait: {
        width: 1,
        height: 16,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginHorizontal: 4,
    },
    portraitCalendarContainer: {
        marginTop: 0,
        paddingBottom: 0,
    },

    // Separator
    separatorContainer: {
        paddingHorizontal: 40,
        marginVertical: 10,
    },
    separator: {
        height: 1,
    },

    // Scroll
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 20,
        paddingBottom: 100,
    },

    // Add Button
    addButton: {
        position: 'absolute',
        right: 24,
        bottom: 40,
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#FFFFFF',
        elevation: 8,
    },
    addButtonPortrait: {
        bottom: 24,
    },

    // Precision Task Card Styles
    taskCardBezel: {
        marginBottom: 4,
        borderRadius: 32,
        padding: 4,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderColor: 'rgba(255,255,255,0.12)',
        borderWidth: 1.5,
        overflow: 'hidden',
        position: 'relative',
    },

    taskCardBezelLandscape: {
        borderRadius: 24,
        padding: 3,
        marginBottom: 0,
        flex: 1,
    },

    taskCardTrack: {
        borderRadius: 28,
        paddingHorizontal: 12,
        paddingVertical: 20,
        backgroundColor: 'rgba(0,0,0,0.15)',
        overflow: 'hidden',
        position: 'relative',
    },

    taskCardTrackLandscape: {
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 12,
        minHeight: 88,
        flex: 1,
    },

    taskCardInteriorShadow: {
        ...StyleSheet.absoluteFillObject,
        borderBottomWidth: 2,
        borderRightWidth: 1,
        borderColor: 'rgba(0,0,0,0.25)',
        borderRadius: 28,
    },

    taskCardInteriorShadowLandscape: {
        borderRadius: 20,
    },

    taskCardTopRim: {
        ...StyleSheet.absoluteFillObject,
        borderTopWidth: 1,
        borderLeftWidth: 0.5,
        borderColor: 'rgba(255,255,255,0.15)',
        borderRadius: 28,
    },

    taskCardTopRimLandscape: {
        borderRadius: 20,
    },

    taskCardOuterBoundaryHighlight: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 32,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },

    taskCardOuterBoundaryHighlightLandscape: {
        borderRadius: 24,
    },

    // Original Task Card Styles (kept for backward compatibility)
    taskCard: {
        marginBottom: 4,
        borderRadius: 32,
        paddingHorizontal: 16,
        paddingVertical: 24,
        backgroundColor: 'rgba(15, 15, 15, 0.6)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        overflow: 'hidden',
    },
    taskCardActive: {
        backgroundColor: 'rgba(5, 20, 25, 0.7)',
        borderColor: 'rgba(0,229,255,0.15)',
    },
    taskCardCompleted: {
        backgroundColor: 'rgba(5, 20, 10, 0.6)',
        borderColor: 'rgba(76,175,80,0.15)',
    },
    taskCardExpanded: {
        borderColor: 'rgba(255, 255, 255, 0.15)',
        backgroundColor: 'rgba(25, 25, 25, 0.8)',
    },
    taskCardFullView: {
        flex: 1,
        marginHorizontal: 0,
        marginBottom: 0,
        borderRadius: 24,
        padding: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(15,15,15,0.8)',
        height: '100%',
        overflow: 'hidden',
    },
    taskCardLandscape: {
        flex: 1,
        marginBottom: 0,
        borderRadius: 16,
        paddingVertical: 4,
        paddingHorizontal: 8,
        minHeight: 80,
    },
    completedFillContainer: {
        position: 'absolute',
        top: -1,
        left: -1,
        right: -1,
        bottom: -1,
    },
    completedFill: {
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
        width: '100%',
        backgroundColor: 'rgba(76,175,80,0.15)',
    },
    cardInset: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 50,
        zIndex: 1,
    },
    cardContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    cardLeft: {
        flex: 1,
        minWidth: 0,
    },
    topStatusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 6,
    },
    statusBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 99,
        borderWidth: 1,
    },
    statusText: {
        fontSize: 8,
        fontWeight: '800',
        letterSpacing: 1,
    },
    priorityBadge: {
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 6,
        borderWidth: 1,
        backgroundColor: 'rgba(255,255,255,0.03)',
    },
    priorityBadgeText: {
        fontSize: 8,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
        minWidth: 0,
    },
    titleTextWrapper: {
        flex: 1,
        minWidth: 0,
        marginRight: 8,
    },
    taskTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#fff',
    },
    taskTitleCompleted: {
        color: 'rgba(255,255,255,0.6)',
        textDecorationLine: 'line-through',
    },
    categoryBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        borderWidth: 1,
        gap: 4,
        flexShrink: 0,
    },
    categoryBadgeText: {
        fontSize: 8,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    taskDescription: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        marginTop: 2,
    },
    taskDescriptionExpanded: {
        color: 'rgba(255,255,255,0.6)',
        marginTop: 8,
        lineHeight: 18,
    },
    streakContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        gap: 1,
        flexWrap: 'wrap',
    },
    streakContainerSingleLine: {
        flexWrap: 'nowrap',
        maxWidth: '100%',
    },
    streakRemainingBadge: {
        marginLeft: 2,
        paddingHorizontal: 4,
        paddingVertical: 2,
        borderRadius: 6,
        backgroundColor: 'rgba(0,229,255,0.2)',
        borderWidth: 1,
        borderColor: 'rgba(0,229,255,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    streakRemainingBadgeText: {
        fontSize: 8,
        fontWeight: '900',
        color: '#00E5FF',
        lineHeight: 10,
    },
    streakStar: {
        position: 'relative',
        marginRight: -2,
    },
    streakStarBadge: {
        position: 'absolute',
        top: -6,
        right: -6,
        backgroundColor: '#00E5FF',
        borderRadius: 7,
        minWidth: 18,
        height: 14,
        paddingHorizontal: 3,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: '#000',
        zIndex: 10,
    },
    streakStarBadgeText: {
        fontSize: 8,
        fontWeight: '900',
        color: '#000',
        lineHeight: 10,
    },
    streakText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#FF6B35',
        letterSpacing: 0.5,
    },
    cardExpandedContent: {
        marginTop: 16,
        flex: 1,
        overflow: 'hidden',
    },
    expandedDivider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.06)',
        marginBottom: 16,
    },
    inlineAddComment: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 4,
    },
    inlineCommentInput: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 10,
        color: '#fff',
        fontSize: 14,
        maxHeight: 80,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    inlineSendBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    inlineSendBtnDisabled: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        opacity: 0.5,
    },
    inlineCommentsList: {
        backgroundColor: 'rgba(255,255,255,0.02)',
        borderRadius: 16,
        padding: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.04)',
        flex: 1,
    },
    quickMessagesScroll: {
        marginTop: 6,
        marginBottom: 6,
        height: 36,
        maxHeight: 36,
    },
    quickMessageChip: {
        backgroundColor: 'rgba(255,255,255,0.06)',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 14,
        marginRight: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        height: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    quickMessageText: {
        fontSize: 9,
        fontWeight: '800',
        textAlign: 'center',
        letterSpacing: 0.5,
    },
    portraitHeaderActions: {
        position: 'absolute',
        top: 24,
        right: 24,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        zIndex: 100,
    },
    portraitCloseBtnStatic: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    inlineCommentItem: {
        marginBottom: 4,
        paddingVertical: 4,
        paddingHorizontal: 8,
    },
    commentCard: {
        marginBottom: 6,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    commentCardTop: {
        marginBottom: 2,
    },
    commentCardChat: {
        marginTop: 0,
        minWidth: 0,
    },
    commentCardFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        marginTop: 2,
        minHeight: 0,
    },
    commentCardActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 0,
        marginLeft: 'auto',
    },
    commentCardActionBtn: {
        padding: 3,
        margin: 0,
    },
    inlineCommentTime: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.25)',
        fontWeight: '700',
    },
    inlineCommentText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.85)',
        lineHeight: 15,
    },
    inlineCommentDivider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.04)',
        marginVertical: 10,
    },
    completedCheckIcon: {
        width: 42,
        height: 42,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    checkboxContainer: {
        width: 42,
        height: 42,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },

    // Precision Status Button Styles
    statusButtonBezel: {
        width: 36,
        height: 36,
        borderRadius: 999,
        padding: 3,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderColor: 'rgba(255,255,255,0.12)',
        borderWidth: 1.5,
        overflow: 'hidden',
        position: 'relative',
    },

    statusButtonTrack: {
        borderRadius: 999,
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },

    statusButtonInteriorShadow: {
        ...StyleSheet.absoluteFillObject,
        borderBottomWidth: 1.5,
        borderRightWidth: 0.8,
        borderColor: 'rgba(0,0,0,0.25)',
        borderRadius: 999,
    },

    statusButtonTopRim: {
        ...StyleSheet.absoluteFillObject,
        borderTopWidth: 0.8,
        borderLeftWidth: 0.5,
        borderColor: 'rgba(255,255,255,0.15)',
        borderRadius: 999,
    },

    statusButtonActive: {
        backgroundColor: 'rgba(0,229,255,0.15)',
    },

    // Original checkbox styles (kept for compatibility)
    checkbox: {
        width: 28,
        height: 28,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxActive: {
        borderColor: '#00E5FF',
        backgroundColor: 'rgba(0,229,255,0.1)',
    },

    // Placeholder
    placeholderCard: {
        width: '100%',
        minHeight: 120,
        backgroundColor: 'rgba(255,255,255,0.02)',
        borderRadius: 24,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    placeholderContent: {
        alignItems: 'center',
        gap: 12,
    },
    placeholderText: {
        fontSize: 12,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 2,
    },

    // Calendar
    calendarContainer: {
        marginTop: 10,
    },
    calendarHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    calendarBackBtn: {
        padding: 4,
        marginLeft: -8,
    },
    calendarTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
    },
    calendarTitlePortrait: {
        fontSize: 18,
    },
    calendarNav: {
        flexDirection: 'row',
        gap: 4,
    },
    calNavBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    weekDaysRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 2,
        paddingHorizontal: 4,
    },
    weekDayText: {
        width: 28,
        textAlign: 'center',
        fontSize: 10,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.5)',
    },
    daysGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
    },
    dayCell: {
        width: '14.28%',
        minHeight: 34,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 2,
    },
    dayCircle: {
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayCirclePortrait: {
        width: 22,
        height: 22,
        borderRadius: 11,
    },
    todayCircle: {
        backgroundColor: '#FFFFFF',
    },
    otherMonthDay: {
        opacity: 0.3,
    },
    dayText: {
        fontSize: 11,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.8)',
    },
    dayTextPortrait: {
        fontSize: 11,
    },
    todayText: {
        color: '#000',
        fontWeight: '700',
    },
    otherMonthText: {
        color: 'rgba(255,255,255,0.4)',
    },
    dayTaskCountBar: {
        width: 20,
        height: 10,
        borderRadius: 5,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 2,
    },
    dayTaskCountBarPortrait: {
        width: 22,
        height: 10,
    },
    dayTaskCount: {
        fontSize: 8,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.7)',
    },
    dayTaskCountZero: {
        fontSize: 8,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.22)',
    },
    selectedDayCircle: {
        borderWidth: 2,
        borderColor: '#4CAF50',
        backgroundColor: 'transparent',
    },
    selectedDayText: {
        color: '#4CAF50',
        fontWeight: '800',
    },
    selectedPastDayCircle: {
        borderWidth: 2,
        borderColor: '#FF5050',
        backgroundColor: 'transparent',
    },
    selectedPastDayText: {
        color: '#FF5050',
        fontWeight: '800',
    },
    toggleWithCountRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
        gap: 8,
    },
    toggleWithCountRowPortrait: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
        gap: 8,
    },
    viewToggleContainer: {
        flex: 1,
        flexDirection: 'row',
        gap: 4,
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 10,
        padding: 3,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.06)',
        // Ensure consistent width constraints if needed, but flex:1 usually handles it.
        // If specific width is needed, we can add minWidth or width here.
    },
    viewToggleBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        backgroundColor: 'transparent',
    },
    viewToggleBtnActive: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.15)',
    },
    viewToggleText: {
        fontSize: 10,
        fontWeight: '700',
        color: 'rgba(255, 255, 255, 0.4)',
        letterSpacing: 1,
    },
    viewToggleTextActive: {
        color: '#fff',
        fontWeight: '800',
    },
    completionCountBadge: {
        backgroundColor: 'rgba(76, 175, 80, 0.15)',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(76, 175, 80, 0.25)',
    },
    completionCountText: {
        fontSize: 13,
        fontWeight: '800',
        color: '#4CAF50',
        letterSpacing: 0.5,
    },
    leftPanelFooterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderTopWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        marginTop: 8,
    },
    settingsIconBtn: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    detailedReportsBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        paddingHorizontal: 4,
    },
    detailedReportsText: {
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 0.5,
        color: 'rgba(255,255,255,0.5)',
        lineHeight: 14,
    },
    filterHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    backlogHeaderBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    backlogHeaderBtnActive: {
        backgroundColor: 'rgba(76, 175, 80, 0.1)',
        borderColor: 'rgba(76, 175, 80, 0.2)',
    },
    backlogHeaderBtnText: {
        fontSize: 9,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 0.5,
    },
    backlogHeaderBtnTextActive: {
        color: '#4CAF50',
    },
    expandedTakeoverContainer: {
        flex: 1,
        padding: 15,
        overflow: 'hidden', // Contain child cards
    },
    expandedTakeoverHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 15,
        paddingHorizontal: 5,
    },
    takeoverBackBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'rgba(255,255,255,0.05)',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
    },
    takeoverBackText: {
        fontSize: 11,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.6)',
        letterSpacing: 1,
    },
    takeoverTitle: {
        fontSize: 12,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 2,
    },
    fullViewCloseBtn: {
        position: 'absolute',
        top: 20,
        right: 20,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    fullViewLandscapeLayout: {
        flex: 1,
        flexDirection: 'row',
        gap: 32,
        overflow: 'hidden',
    },
    fullViewLeftCol: {
        flex: 1,
    },
    fullViewRightCol: {
        flex: 1.3,
        backgroundColor: 'rgba(255,255,255,0.02)',
        borderRadius: 20,
        padding: 6,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.04)',
        minHeight: 0,
        overflow: 'hidden',
    },
    fullViewDescScroll: {
        flex: 1,
        marginVertical: 10,
    },
    fullViewCommentScroll: {
        flex: 1,
        minHeight: 0,
    },
    fullViewToggleBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    fullViewToggleBtnCompleted: {
        backgroundColor: 'rgba(76,175,80,0.1)',
        borderColor: 'rgba(76,175,80,0.2)',
    },
    fullViewToggleText: {
        fontSize: 14,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.6)',
        letterSpacing: 1,
    },
    noCommentsContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        opacity: 0.5,
    },
    noCommentsText: {
        fontSize: 13,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.4)',
    },
    fullViewFooterLandscape: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginTop: 'auto',
        paddingTop: 16,
    },
    fullViewBackTab: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        width: 56,
        height: 52,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    fullViewStatusToggleWrapper: {
        flex: 1,
    },
    fullViewRightColHeader: {
        flex: 0,
    },
    fullViewCommentListWrapper: {
        flex: 1,
        marginTop: 8,
        minHeight: 0, // Critical for ScrollView in flex container
        overflow: 'hidden',
    },
    fullViewCompactFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 'auto', // Back to auto for bottom alignment
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.06)',
    },
    fullViewBackBtnCompact: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    fullViewToggleBtnCompact: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(255,255,255,0.08)',
        paddingHorizontal: 12,
        height: 36,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    fullViewToggleTextCompact: {
        fontSize: 10,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: 0.5,
    },
    fullViewMetaSection: {
        marginTop: 16,
        gap: 8,
        paddingBottom: 20,
    },
    metaDivider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.06)',
        marginTop: 4,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    metaLabel: {
        fontSize: 10,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.3)',
        width: 100,
        letterSpacing: 0.5,
    },
    metaValue: {
        fontSize: 11,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.6)',
    },
    stagesProgressWrapper: {
        flex: 1,
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 2,
        overflow: 'hidden',
    },
    stagesProgressBar: {
        height: '100%',
        backgroundColor: '#4CAF50',
    },
    landscapeStagesScroll: {
        maxHeight: 120,
        marginVertical: 8,
    },
    landscapeStageItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
    },
    stageTextCompleted: {
        textDecorationLine: 'line-through',
        color: 'rgba(255,255,255,0.3)',
    },
    inlineAddStage: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 4,
        paddingRight: 8,
    },
    inlineStageInput: {
        flex: 1,
        fontSize: 12,
        color: '#fff',
        paddingVertical: 4,
    },
    portraitStagesSection: {
        marginTop: 0,
        paddingHorizontal: 0,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 10,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 1.5,
    },
    sectionSubtitle: {
        fontSize: 10,
        fontWeight: '700',
        color: '#4CAF50',
        letterSpacing: 0.5,
    },
    progressCountRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        gap: 6,
    },
    progressCountText: {
        fontSize: 8,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 0.3,
    },
    portraitStageItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 3,
        backgroundColor: 'transparent',
        paddingVertical: 6,
        paddingHorizontal: 6,
        borderRadius: 8,
        minHeight: 38,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    portraitStageText: {
        fontSize: 13,
        color: '#fff',
        flex: 1,
        fontWeight: '500',
    },
    deleteStageBtn: {
        padding: 6,
        opacity: 0.4,
    },
    stageOrderCircle: {
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    stageOrderCircleCompleted: {
        backgroundColor: '#4CAF50',
        borderColor: '#4CAF50',
    },
    stageOrderCircleProcess: {
        backgroundColor: 'rgba(255, 183, 77, 0.25)',
        borderColor: '#FFB74D',
    },
    stageOrderCircleUncompleted: {
        backgroundColor: 'rgba(255, 82, 82, 0.25)',
        borderColor: '#FF5252',
    },
    stageOrderCircleUpcoming: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderColor: 'rgba(255,255,255,0.15)',
    },
    stageOrderText: {
        fontSize: 11,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.5)',
    },
    stageOrderTextDragging: {
        color: 'rgba(0,0,0,0.5)',
    },
    stageItemDragging: {
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderRadius: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 10,
        zIndex: 1000,
    },
    stageTextDragging: {
        color: '#1a1a1a',
        fontWeight: '600',
    },
    stageDragHandle: {
        paddingHorizontal: 2,
        paddingVertical: 4,
        opacity: 0.5,
    },
    portraitAddStageRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginTop: 4,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        paddingLeft: 12,
        paddingRight: 6,
        height: 44,
    },
    portraitStageInput: {
        flex: 1,
        color: '#fff',
        fontSize: 14,
    },
    addStageBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    addStageBtnDisabled: {
        opacity: 0.3,
    },
    landscapeTabToggle: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 10,
        padding: 2,
        marginBottom: 6,
        marginTop: 6,
        alignSelf: 'center',
        width: 'auto',
        minWidth: 180,
    },
    landscapeTab: {
        flex: 1,
        paddingHorizontal: 14,
        height: 26,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
    },
    landscapeTabActive: {
        backgroundColor: '#FFFFFF',
    },
    landscapeTabText: {
        fontSize: 9,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 0.8,
    },
    landscapeTabTextActive: {
        color: '#000',
    },
    noStagesContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        opacity: 0.5,
    },
    noStagesText: {
        fontSize: 13,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.4)',
    },
    pinIconContainer: {
        position: 'absolute',
        zIndex: 20,
    },
    pinIconContainerPortrait: {
        top: 15,
        right: 15,
    },
    pinIconContainerLandscape: {
        top: 5,
        right: 6,
        transform: [{ rotate: '4deg' }],
    },
});
interface TaskListProps {
    tasks: Task[];
    onAddTask: () => void;
    onToggleTask: (task: Task) => void;
    onDeleteTask: (task: Task) => void;
    onEditTask?: (task: Task) => void;
    categories: Category[];
    selectedDate: Date;
    onDateChange: (date: Date) => void;
    activeView?: 'timer' | 'task';
    onViewChange?: (view: 'timer' | 'task') => void;
    onSettings?: () => void;
    isPastTasksDisabled?: boolean;
    dailyStartMinutes?: number;
    onUpdateComment?: (task: Task, comment: string) => void;
    onEditComment?: (task: Task, commentId: number, newText: string) => void;
    onDeleteComment?: (task: Task, commentId: number) => void;
    onUpdateStages?: (task: Task, stages: TaskStage[]) => void;
    onPinTask?: (task: Task) => void;
    quickMessages?: QuickMessage[];
    timeOfDaySlots?: TimeOfDaySlotConfigList;
    runningTimer?: Timer | null;
    /** Open the active/expanded running timer (ActiveTimer) or Timer list when the dock live timer is tapped. */
    onOpenActiveTimer?: (timer: Timer | null) => void;
    /** If true, automatically show LiveFocusView when component mounts or when this prop changes to true */
    initialShowLive?: boolean;
    /** Callback to reset initialShowLive after it's been consumed */
    onLiveViewShown?: () => void;
    /** Timer running colour from Settings (Theme) (used by full-screen timer). */
    timerTextColor?: string;
    /** Slider/button accent colour from Settings (used by full-screen timer slide-to-complete). */
    sliderButtonColor?: string;
}

export default function TaskList({
    tasks,
    onAddTask,
    onToggleTask,
    onDeleteTask,
    onEditTask,
    categories,
    selectedDate,
    onDateChange,
    activeView = 'task',
    onViewChange,
    onSettings,
    isPastTasksDisabled,
    dailyStartMinutes = DEFAULT_DAILY_START_MINUTES,
    onUpdateComment,
    onEditComment,
    onDeleteComment,
    onUpdateStages,
    onPinTask,
    quickMessages,
    timeOfDaySlots,
    runningTimer,
    onOpenActiveTimer,
    initialShowLive = false,
    onLiveViewShown,
    timerTextColor = '#FFFFFF',
    sliderButtonColor = '#FFFFFF',
}: TaskListProps) {
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const isLandscape = screenWidth > screenHeight;

    useEffect(() => {
        if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
            UIManager.setLayoutAnimationEnabledExperimental(true);
        }
    }, []);

    const [filterCategoryIds, setFilterCategoryIds] = useState<string[]>([]); // empty = All; multi-select
    const [filterStatus, setFilterStatus] = useState<string>('All');
    const [isCategoryExpanded, setIsCategoryExpanded] = useState(false);
    const [isStatusExpanded, setIsStatusExpanded] = useState(false);
    const [isPortraitHeaderExpanded, setIsPortraitHeaderExpanded] = useState(true); // Default expanded
    const [showCalendar, setShowCalendar] = useState(false);
    const [showFiltersPortrait, setShowFiltersPortrait] = useState(false);
    const [viewDate, setViewDate] = useState(new Date());
    const [showBacklog, setShowBacklog] = useState(false);
    const [showLive, setShowLive] = useState(initialShowLive);
    const [actionModalVisible, setActionModalVisible] = useState(false);
    const [leaveDays, setLeaveDays] = useState<string[]>([]);
    const cameFromTimerView = useRef(false);

    // Load leave days on initial mount
    useEffect(() => {
        AsyncStorage.getItem(LEAVE_DAYS_KEY).then((json) => {
            if (json) {
                const days = JSON.parse(json) as { date: string }[];
                setLeaveDays(days.map(d => d.date));
            } else {
                setLeaveDays([]);
            }
        }).catch(e => console.error("Failed to load leave days", e));
    }, []);

    // Handle initialShowLive prop changes
    useEffect(() => {
        if (initialShowLive && !showLive) {
            setShowLive(true);
            cameFromTimerView.current = true; // Track that we came from timer view
            if (onLiveViewShown) {
                onLiveViewShown();
            }
        }
    }, [initialShowLive, showLive, onLiveViewShown]);
    const [selectedActionTask, setSelectedActionTask] = useState<Task | null>(null);
    const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);

    // LiveFocusView: zoom (minutesPerCell), scroll X, and view mode — persisted across close/reopen
    const [liveFocusZoom, setLiveFocusZoom] = useState(60);
    const [liveFocusScrollX, setLiveFocusScrollX] = useState(0);
    const [liveFocusViewMode, setLiveFocusViewMode] = useState<'task' | 'merged' | 'category'>('task');
    const liveFocusScrollXRef = useRef(0);
    const liveFocusZoomRef = useRef(60);
    const saveScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const saveZoomTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const slideAnim = useRef(new Animated.Value(0)).current;
    const fadeAnim = useRef(new Animated.Value(1)).current;

    // Load LiveFocus zoom, scroll, and view mode from AsyncStorage on mount
    useEffect(() => {
        AsyncStorage.getItem(LIVE_FOCUS_ZOOM_KEY).then((v) => {
            if (v != null) {
                const n = Number(v);
                if (!Number.isNaN(n) && n >= 5 && n <= 240) setLiveFocusZoom(n);
            }
        });
        AsyncStorage.getItem(LIVE_FOCUS_SCROLL_KEY).then((v) => {
            if (v != null) {
                const n = Number(v);
                if (!Number.isNaN(n) && n >= 0) setLiveFocusScrollX(n);
            }
        });
        AsyncStorage.getItem(LIVE_FOCUS_VIEW_MODE_KEY).then((v) => {
            if (v === 'task' || v === 'merged' || v === 'category') setLiveFocusViewMode(v);
        });
    }, []);

    // Reset expanded task when date or backlog filter changes
    useEffect(() => {
        setExpandedTaskId(null);
    }, [selectedDate, showBacklog, showLive]);

    // Logical date for the selected day (uses daily start time for rollover)
    const selectedLogical = getLogicalDate(selectedDate, dailyStartMinutes);

    // Filter tasks by selected date OR backlog status
    // For recurring tasks, expand them to show instances for the selected date
    const dateFilteredTasks = showBacklog
        ? tasks.filter(t => t && !!t.isBacklog)
        : expandTasksForDate(tasks, selectedLogical).filter(t => t && !t.isBacklog);

    // Apply category and status filters (category: multi-select; empty = All)
    const filteredTasks = dateFilteredTasks.filter(t => {
        // Safety check: ensure task exists and has required properties
        if (!t || !t.id || !t.status || !t.forDate) return false;
        const matchesCategory = filterCategoryIds.length === 0 || (t.categoryId != null && filterCategoryIds.includes(t.categoryId));
        const matchesStatus = filterStatus === 'All' || t.status === filterStatus;
        return matchesCategory && matchesStatus;
    }).sort((a, b) => {
        // 1. Pinned tasks first
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;

        // 2. Among pinned, latest pinTimestamp first
        if (a.isPinned && b.isPinned) {
            return (b.pinTimestamp || 0) - (a.pinTimestamp || 0);
        }

        // 3. Keep relative order for others
        return 0;
    });

    // Calculate analytics
    // Safety check: ensure tasks have status property
    const completedCount = dateFilteredTasks.filter(t => t && t.status === 'Completed').length;
    const totalCount = dateFilteredTasks.length;
    const pendingCount = dateFilteredTasks.filter(t => t && t.status === 'Pending').length;
    const inProgressCount = dateFilteredTasks.filter(t => t && t.status === 'In Progress').length;

    // Get current date info
    const dayName = DAYS[selectedDate.getDay()].toUpperCase();
    const dayNum = selectedDate.getDate();
    const monthName = MONTHS[selectedDate.getMonth()].toUpperCase();

    const isToday = selectedLogical === getLogicalDate(new Date(), dailyStartMinutes);
    const dateLabel = isToday ? 'TODAY' : `on ${dayName} ${dayNum}`;

    // Calendar helpers
    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const days = new Date(year, month + 1, 0).getDate();
        const firstDay = new Date(year, month, 1).getDay();
        return { days, firstDay };
    };

    const changeMonth = (offset: number) => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 150,
                useNativeDriver: true,
            }),
            Animated.timing(slideAnim, {
                toValue: offset > 0 ? -20 : 20,
                duration: 150,
                useNativeDriver: true,
            })
        ]).start(() => {
            const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1);
            setViewDate(newDate);
            slideAnim.setValue(offset > 0 ? 20 : -20);
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 150,
                    useNativeDriver: true,
                }),
                Animated.timing(slideAnim, {
                    toValue: 0,
                    duration: 150,
                    useNativeDriver: true,
                })
            ]).start();
        });
    };

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 20,
            onPanResponderRelease: (evt, gestureState) => {
                if (gestureState.dx > 40) {
                    changeMonth(-1);
                } else if (gestureState.dx < -40) {
                    changeMonth(1);
                }
            },
        })
    ).current;

    const renderCalendar = () => {
        const { days, firstDay } = getDaysInMonth(viewDate);
        const calendarDays = [];
        const prevMonthDays = new Date(viewDate.getFullYear(), viewDate.getMonth(), 0).getDate();

        for (let i = 0; i < firstDay; i++) {
            calendarDays.push({ day: prevMonthDays - firstDay + i + 1, currentMonth: false });
        }
        for (let i = 1; i <= days; i++) {
            calendarDays.push({ day: i, currentMonth: true });
        }
        const totalCells = 42;
        const remainingCells = totalCells - calendarDays.length;
        for (let i = 1; i <= remainingCells; i++) {
            calendarDays.push({ day: i, currentMonth: false });
        }

        const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

        return (
            <View style={styles.calendarContainer} {...panResponder.panHandlers}>
                <View style={styles.calendarHeader}>
                    {!isLandscape && (
                        <TouchableOpacity
                            onPress={() => setShowCalendar(false)}
                            style={styles.calendarBackBtn}
                        >
                            <MaterialIcons name="chevron-left" size={24} color="#fff" />
                        </TouchableOpacity>
                    )}
                    <Text style={[styles.calendarTitle, !isLandscape && styles.calendarTitlePortrait]}>
                        {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
                    </Text>
                    <View style={styles.calendarNav}>
                        <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.calNavBtn}>
                            <MaterialIcons name="keyboard-arrow-left" size={isLandscape ? 20 : 24} color="rgba(255,255,255,0.7)" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => changeMonth(1)} style={styles.calNavBtn}>
                            <MaterialIcons name="keyboard-arrow-right" size={isLandscape ? 20 : 24} color="rgba(255,255,255,0.7)" />
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.weekDaysRow}>
                    {weekDays.map((d, i) => (
                        <Text key={i} style={styles.weekDayText}>{d}</Text>
                    ))}
                </View>

                <Animated.View style={[
                    styles.daysGrid,
                    {
                        opacity: fadeAnim,
                        transform: [{ translateX: slideAnim }]
                    }
                ]}>
                    {calendarDays.map((item, index) => {
                        const logicalToday = getLogicalDate(new Date(), dailyStartMinutes);
                        const [ltY, ltM1, ltD] = logicalToday.split('-').map(Number);
                        const isTodayDate = item.currentMonth &&
                            item.day === ltD &&
                            viewDate.getMonth() === ltM1 - 1 &&
                            viewDate.getFullYear() === ltY;

                        const isSelected = item.currentMonth &&
                            item.day === selectedDate.getDate() &&
                            viewDate.getMonth() === selectedDate.getMonth() &&
                            viewDate.getFullYear() === selectedDate.getFullYear();

                        const isPastSelection = isSelected && selectedLogical < getLogicalDate(new Date(), dailyStartMinutes);

                        // Task count and completion for this date (current month only)
                        let dayTaskCount = 0;
                        let dayTasks: Task[] = [];
                        let cellLogicalDate = '';
                        if (item.currentMonth) {
                            const y = viewDate.getFullYear(), m = viewDate.getMonth(), d = item.day;
                            const cellDate = new Date(y, m, d, Math.floor(dailyStartMinutes / 60), dailyStartMinutes % 60, 0, 0);
                            cellLogicalDate = getLogicalDate(cellDate, dailyStartMinutes);
                            dayTasks = expandTasksForDate(tasks, cellLogicalDate).filter(t => t && !t.isBacklog);
                            // Apply same category filter as task list (calendar count includes category filter)
                            if (filterCategoryIds.length > 0) {
                                dayTasks = dayTasks.filter(t => t.categoryId != null && filterCategoryIds.includes(t.categoryId));
                            }
                            dayTaskCount = dayTasks.length;
                        }
                        const isPastDate = item.currentMonth && cellLogicalDate !== '' && cellLogicalDate < logicalToday;
                        const completedCount = dayTasks.filter(t => t.status === 'Completed').length;
                        // Past day bar color: all done = green, all pending = red, mixed = yellow (only when has tasks)
                        const pastDayBarStyle = isPastDate && dayTaskCount > 0
                            ? (completedCount === dayTaskCount
                                ? { backgroundColor: 'rgba(76,175,80,0.35)' as const }
                                : completedCount === 0
                                    ? { backgroundColor: 'rgba(255,80,80,0.35)' as const }
                                    : { backgroundColor: 'rgba(255,193,7,0.4)' as const })
                            : null;
                        const pastDayTextStyle = isPastDate && dayTaskCount > 0
                            ? (completedCount === dayTaskCount
                                ? { color: '#81C784' as const }
                                : completedCount === 0
                                    ? { color: '#FF8A80' as const }
                                    : { color: '#FFD54F' as const })
                            : null;

                        return (
                            <TouchableOpacity
                                key={index}
                                style={styles.dayCell}
                                onPress={() => {
                                    if (item.currentMonth) {
                                        const y = viewDate.getFullYear(), m = viewDate.getMonth(), d = item.day;
                                        onDateChange(new Date(y, m, d, Math.floor(dailyStartMinutes / 60), dailyStartMinutes % 60, 0, 0));
                                    }
                                }}
                            >
                                <View style={[
                                    styles.dayCircle,
                                    !isLandscape && styles.dayCirclePortrait,
                                    isTodayDate && styles.todayCircle,
                                    isSelected && (isPastSelection ? styles.selectedPastDayCircle : styles.selectedDayCircle),
                                    !item.currentMonth && styles.otherMonthDay
                                ]}>
                                    <Text style={[
                                        styles.dayText,
                                        !isLandscape && styles.dayTextPortrait,
                                        isTodayDate && styles.todayText,
                                        isSelected && (isPastSelection ? styles.selectedPastDayText : styles.selectedDayText),
                                        !item.currentMonth && styles.otherMonthText
                                    ]}>
                                        {item.day}
                                    </Text>
                                </View>
                                {item.currentMonth && (
                                    <View style={[
                                        styles.dayTaskCountBar,
                                        !isLandscape && styles.dayTaskCountBarPortrait,
                                        pastDayBarStyle ?? (dayTaskCount > 0
                                            ? { backgroundColor: 'rgba(255,255,255,0.1)' }
                                            : { backgroundColor: 'rgba(255,255,255,0.04)' }),
                                        !pastDayBarStyle && isSelected && (isPastSelection ? { backgroundColor: 'rgba(255,80,80,0.25)' } : { backgroundColor: 'rgba(76,175,80,0.25)' }),
                                        !pastDayBarStyle && isTodayDate && !isSelected && dayTaskCount > 0 && { backgroundColor: 'rgba(255,255,255,0.15)' }
                                    ]}>
                                        <Text style={[
                                            dayTaskCount > 0 ? styles.dayTaskCount : styles.dayTaskCountZero,
                                            pastDayTextStyle ?? (isSelected ? (isPastSelection ? { color: '#FF8080' } : { color: '#81C784' }) : undefined),
                                            !pastDayTextStyle && isTodayDate && !isSelected && dayTaskCount > 0 && { color: 'rgba(255,255,255,0.9)' }
                                        ]}>
                                            {dayTaskCount === 0 ? '–' : dayTaskCount}
                                        </Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </Animated.View>
            </View>
        );
    };


    const handleUpdateStageLayout = (taskId: number, stageId: number, startTimeMinutes: number, durationMinutes: number) => {
        // Find the task from filteredTasks (which includes expanded recurring tasks)
        const task = filteredTasks.find(t => t.id === taskId);
        if (!task || !task.stages) return;

        const updatedStages = task.stages.map(s =>
            s.id === stageId ? { ...s, startTimeMinutes, durationMinutes } : s
        );

        if (onUpdateStages) {
            // Pass the expanded task with its forDate so it can be saved to the correct instance
            onUpdateStages(task, updatedStages);
        }
    };

    const handleLiveFocusZoomChange = useCallback((z: number) => {
        liveFocusZoomRef.current = z;
        if (saveZoomTimeoutRef.current) clearTimeout(saveZoomTimeoutRef.current);
        saveZoomTimeoutRef.current = setTimeout(() => {
            setLiveFocusZoom(liveFocusZoomRef.current);
            AsyncStorage.setItem(LIVE_FOCUS_ZOOM_KEY, String(liveFocusZoomRef.current)).catch(() => { });
            saveZoomTimeoutRef.current = null;
        }, 120);
    }, []);

    const handleLiveFocusScrollChange = useCallback((x: number) => {
        liveFocusScrollXRef.current = x;
        if (saveScrollTimeoutRef.current) clearTimeout(saveScrollTimeoutRef.current);
        saveScrollTimeoutRef.current = setTimeout(() => {
            setLiveFocusScrollX(liveFocusScrollXRef.current);
            AsyncStorage.setItem(LIVE_FOCUS_SCROLL_KEY, String(liveFocusScrollXRef.current)).catch(() => { });
            saveScrollTimeoutRef.current = null;
        }, 250);
    }, []);

    useEffect(() => {
        return () => {
            if (saveScrollTimeoutRef.current) clearTimeout(saveScrollTimeoutRef.current);
            if (saveZoomTimeoutRef.current) clearTimeout(saveZoomTimeoutRef.current);
        };
    }, []);

    if (showLive) {
        return (
            <View style={styles.container}>
                <LiveFocusView
                    tasks={filteredTasks}
                    selectedDate={selectedDate}
                    onDateChange={onDateChange}
                    categories={categories}
                    timerTextColor={timerTextColor}
                    sliderButtonColor={sliderButtonColor}
                    leaveDays={leaveDays}
                    onClose={() => {
                        setShowLive(false);
                        // If we came from timer view, switch back to timer view
                        if (cameFromTimerView.current && onViewChange) {
                            cameFromTimerView.current = false; // Reset the flag
                            onViewChange('timer');
                        }
                    }}
                    onExpandTask={(task) => {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        setExpandedTaskId(task.id);
                        setShowLive(false);
                        // If we came from timer view, switch back to timer view
                        if (cameFromTimerView.current && onViewChange) {
                            cameFromTimerView.current = false; // Reset the flag
                            onViewChange('timer');
                        }
                    }}
                    onUpdateStageLayout={handleUpdateStageLayout}
                    onUpdateStages={onUpdateStages}
                    timeOfDaySlots={timeOfDaySlots}
                    dailyStartMinutes={dailyStartMinutes}
                    initialZoom={liveFocusZoom}
                    initialScrollX={liveFocusScrollX}
                    onZoomChange={handleLiveFocusZoomChange}
                    onScrollChange={handleLiveFocusScrollChange}
                    initialViewMode={liveFocusViewMode}
                    onViewModeChange={(mode) => {
                        setLiveFocusViewMode(mode);
                        AsyncStorage.setItem(LIVE_FOCUS_VIEW_MODE_KEY, mode).catch(() => { });
                    }}
                    runningTimer={runningTimer ?? null}
                    onOpenRunningTimer={(timer) => {
                        setShowLive(false);
                        // If we came from timer view, switch back to timer view
                        if (cameFromTimerView.current && onViewChange) {
                            cameFromTimerView.current = false; // Reset the flag
                            onViewChange('timer');
                        }
                        onOpenActiveTimer?.(timer);
                    }}
                />
            </View>
        );
    }

    return (
        <LinearGradient
            colors={['#000000', '#000000']}
            style={styles.container}
        >
            <SafeAreaView style={[styles.safeArea, isLandscape && styles.safeAreaLandscape]}>
                {isLandscape ? (
                    <>
                        {/* Left Panel - Analytics Dashboard */}
                        <View style={[styles.leftPanel, { width: screenWidth * 0.30 }]}>
                            <View style={styles.analyticsCardWrapper}>
                                <ScrollView showsVerticalScrollIndicator={false} style={styles.leftPanelScroll}>
                                    {/* Toggle + Completion Count Row */}
                                    {onViewChange && (
                                        <View style={styles.toggleWithCountRow}>
                                            <View style={[styles.viewToggleContainer, { flex: 1 }]}>
                                                <TouchableOpacity
                                                    style={[
                                                        styles.viewToggleBtn,
                                                        activeView === 'timer' && styles.viewToggleBtnActive
                                                    ]}
                                                    onPress={() => onViewChange('timer')}
                                                    activeOpacity={0.7}
                                                >
                                                    <MaterialIcons
                                                        name="timer"
                                                        size={14}
                                                        color={activeView === 'timer' ? '#fff' : 'rgba(255,255,255,0.4)'}
                                                    />
                                                    <Text style={[
                                                        styles.viewToggleText,
                                                        activeView === 'timer' && styles.viewToggleTextActive
                                                    ]}>TIMER</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={[
                                                        styles.viewToggleBtn,
                                                        activeView === 'task' && styles.viewToggleBtnActive
                                                    ]}
                                                    onPress={() => onViewChange('task')}
                                                    activeOpacity={0.7}
                                                >
                                                    <MaterialIcons
                                                        name="check-box"
                                                        size={14}
                                                        color={activeView === 'task' ? '#fff' : 'rgba(255,255,255,0.4)'}
                                                    />
                                                    <Text style={[
                                                        styles.viewToggleText,
                                                        activeView === 'task' && styles.viewToggleTextActive
                                                    ]}>TASK</Text>
                                                </TouchableOpacity>
                                            </View>
                                            <View style={styles.completionCountBadge}>
                                                <Text style={styles.completionCountText}>{completedCount}/{totalCount}</Text>
                                            </View>
                                        </View>
                                    )}

                                    {/* Date display */}
                                    <View style={styles.dateControlRowLandscape}>
                                        <TouchableOpacity
                                            style={styles.dateLandscapeRow}
                                            onPress={() => {
                                                if (!showCalendar) {
                                                    setViewDate(new Date());
                                                }
                                                setShowCalendar(!showCalendar);
                                            }}
                                            activeOpacity={0.7}
                                        >
                                            <MaterialIcons name="calendar-today" size={14} color="#fff" />
                                            <Text style={styles.dateLandscapeText}>
                                                {isToday ? `  ${dayName}, ${dayNum} ${monthName}` : `  ${dateLabel} ${monthName}`}
                                            </Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[styles.todayNavBtn, showLive && { backgroundColor: 'rgba(255, 61, 0, 0.08)', borderColor: 'rgba(255, 61, 0, 0.2)' }]}
                                            onPress={() => setShowLive(!showLive)}
                                            activeOpacity={0.7}
                                        >
                                            <MaterialIcons name="sensors" size={12} color={showLive ? "#FF3D00" : "#FF3D00"} />
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[styles.todayNavBtn, isToday && styles.todayNavBtnActive]}
                                            onPress={() => {
                                                const start = getStartOfLogicalDay(new Date(), dailyStartMinutes);
                                                onDateChange(start);
                                                setViewDate(start);
                                            }}
                                            activeOpacity={0.7}
                                        >
                                            <MaterialIcons name="today" size={12} color={isToday ? "#4CAF50" : "rgba(255,255,255,0.4)"} />
                                            <View style={styles.todayLabelBlock}>
                                                <Text style={[styles.todayNavText, isToday && styles.todayNavTextActive, { marginLeft: 0 }]}>TODAY</Text>
                                                <Text style={[styles.todayRangeLabel, isToday && styles.todayRangeLabelActive]}>({formatDailyStartRangeCompact(dailyStartMinutes)})</Text>
                                            </View>
                                        </TouchableOpacity>
                                    </View>

                                    {showCalendar ? (
                                        renderCalendar()
                                    ) : (
                                        <>
                                            {/* Stats Grid */}
                                            <View style={styles.compactStatsGrid}>
                                                <View style={styles.compactStatRow}>
                                                    <View style={styles.compactStatItem}>
                                                        <Text style={styles.compactStatLabel}>PENDING</Text>
                                                        <Text style={styles.compactStatValue}>{pendingCount}</Text>
                                                    </View>
                                                    <View style={styles.compactStatItem}>
                                                        <Text style={styles.compactStatLabel}>IN PROGRESS</Text>
                                                        <Text style={styles.compactStatValue}>{inProgressCount}</Text>
                                                    </View>
                                                </View>
                                            </View>

                                            {/* Filters Section */}
                                            <View style={styles.filtersSection}>
                                                <View style={styles.filterHeaderRow}>
                                                    <Text style={styles.filterHeaderLabel}>FILTERS</Text>
                                                    <TouchableOpacity
                                                        style={[styles.backlogHeaderBtn, showBacklog && styles.backlogHeaderBtnActive]}
                                                        onPress={() => setShowBacklog(!showBacklog)}
                                                        activeOpacity={0.7}
                                                    >
                                                        <MaterialIcons
                                                            name={showBacklog ? "event-note" : "event-busy"}
                                                            size={14}
                                                            color={showBacklog ? "#4CAF50" : "rgba(255,255,255,0.4)"}
                                                        />
                                                        <Text style={[styles.backlogHeaderBtnText, showBacklog && styles.backlogHeaderBtnTextActive]}>
                                                            BACKLOG
                                                        </Text>
                                                    </TouchableOpacity>
                                                </View>

                                                {/* Category Filter (multi-select) */}
                                                <View style={styles.expandableFilterContainer}>
                                                    <TouchableOpacity
                                                        style={styles.expandableHeader}
                                                        onPress={() => setIsCategoryExpanded(!isCategoryExpanded)}
                                                        activeOpacity={0.7}
                                                    >
                                                        <View style={styles.expandableHeaderLeft}>
                                                            <MaterialIcons
                                                                name={filterCategoryIds.length === 0 ? 'category' : (categories.find(c => c.id === filterCategoryIds[0])?.icon || 'category')}
                                                                size={16}
                                                                color={filterCategoryIds.length === 0 ? 'rgba(255,255,255,0.4)' : (categories.find(c => c.id === filterCategoryIds[0])?.color || '#fff')}
                                                            />
                                                            <Text style={styles.expandableHeaderText}>
                                                                {filterCategoryIds.length === 0 ? ' Category (All)' : filterCategoryIds.length === 1 ? ` ${categories.find(c => c.id === filterCategoryIds[0])?.name}` : ` ${filterCategoryIds.length} categories`}
                                                            </Text>
                                                        </View>
                                                        <MaterialIcons
                                                            name={isCategoryExpanded ? "expand-less" : "expand-more"}
                                                            size={20}
                                                            color="rgba(255,255,255,0.3)"
                                                        />
                                                    </TouchableOpacity>

                                                    {isCategoryExpanded && (
                                                        <View style={styles.expandedContent}>
                                                            <TouchableOpacity
                                                                style={[styles.miniChip, filterCategoryIds.length === 0 && styles.miniChipActive]}
                                                                onPress={() => setFilterCategoryIds([])}
                                                            >
                                                                <Text style={[styles.miniChipText, filterCategoryIds.length === 0 && styles.miniChipTextActive]}>All</Text>
                                                            </TouchableOpacity>
                                                            {categories.map(cat => {
                                                                const isSelected = filterCategoryIds.includes(cat.id);
                                                                return (
                                                                    <TouchableOpacity
                                                                        key={cat.id}
                                                                        style={[
                                                                            styles.miniChip,
                                                                            isSelected && { backgroundColor: `${cat.color}20`, borderColor: cat.color }
                                                                        ]}
                                                                        onPress={() => {
                                                                            setFilterCategoryIds(prev => prev.includes(cat.id) ? prev.filter(id => id !== cat.id) : [...prev, cat.id]);
                                                                        }}
                                                                    >
                                                                        <MaterialIcons name={cat.icon} size={10} color={isSelected ? cat.color : 'rgba(255,255,255,0.4)'} />
                                                                        <Text style={[styles.miniChipText, isSelected && { color: cat.color }]}> {cat.name}</Text>
                                                                    </TouchableOpacity>
                                                                );
                                                            })}
                                                        </View>
                                                    )}
                                                </View>

                                                {/* Status Filter */}
                                                <View style={styles.expandableFilterContainer}>
                                                    <TouchableOpacity
                                                        style={styles.expandableHeader}
                                                        onPress={() => setIsStatusExpanded(!isStatusExpanded)}
                                                        activeOpacity={0.7}
                                                    >
                                                        <View style={styles.expandableHeaderLeft}>
                                                            <MaterialIcons name="tune" size={16} color={filterStatus === 'All' ? 'rgba(255,255,255,0.4)' : '#fff'} />
                                                            <Text style={styles.expandableHeaderText}>
                                                                {filterStatus === 'All' ? ' Status' : ` ${filterStatus}`}
                                                            </Text>
                                                        </View>
                                                        <MaterialIcons
                                                            name={isStatusExpanded ? "expand-less" : "expand-more"}
                                                            size={20}
                                                            color="rgba(255,255,255,0.3)"
                                                        />
                                                    </TouchableOpacity>

                                                    {isStatusExpanded && (
                                                        <View style={styles.expandedContent}>
                                                            {['All', 'Pending', 'In Progress', 'Completed'].map(status => (
                                                                <TouchableOpacity
                                                                    key={status}
                                                                    style={[styles.miniChip, filterStatus === status && styles.miniChipActive]}
                                                                    onPress={() => setFilterStatus(status)}
                                                                >
                                                                    <Text style={[styles.miniChipText, filterStatus === status && styles.miniChipTextActive]}>{status}</Text>
                                                                </TouchableOpacity>
                                                            ))}
                                                        </View>
                                                    )}
                                                </View>

                                            </View>
                                        </>
                                    )}
                                </ScrollView>

                                {/* Footer Row: Settings icon & Detailed Reports */}
                                <View style={styles.leftPanelFooterRow}>
                                    {onSettings && (
                                        <TouchableOpacity
                                            style={styles.settingsIconBtn}
                                            onPress={onSettings}
                                            activeOpacity={0.7}
                                        >
                                            <MaterialIcons name="settings" size={20} color="rgba(255,255,255,0.7)" />
                                        </TouchableOpacity>
                                    )}

                                    <TouchableOpacity
                                        style={styles.detailedReportsBtn}
                                        onPress={() => {/* TODO: Add reports popup */ }}
                                    >
                                        <Text style={styles.detailedReportsText}>DETAILED REPORTS</Text>
                                        <MaterialIcons name="chevron-right" size={20} color="rgba(255,255,255,0.5)" />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>

                        {/* Right Panel - Task Grid */}
                        <View style={styles.rightPanel}>
                            {isLandscape && expandedTaskId ? (
                                <View style={styles.expandedTakeoverContainer}>
                                    {(() => {
                                        const expandedTask = filteredTasks.find(t => t && t.id === expandedTaskId);
                                        if (!expandedTask) {
                                            setExpandedTaskId(null);
                                            return null;
                                        }
                                        return (
                                            <TaskCard
                                                task={expandedTask}
                                                onToggle={() => onToggleTask(filteredTasks.find(t => t.id === expandedTaskId)!)}
                                                onDelete={() => onDeleteTask(filteredTasks.find(t => t.id === expandedTaskId)!)}
                                                onEdit={() => onEditTask?.(filteredTasks.find(t => t.id === expandedTaskId)!)}
                                                isLandscape={true}
                                                categories={categories}
                                                dailyStartMinutes={dailyStartMinutes}
                                                isPastTasksDisabled={isPastTasksDisabled}
                                                onOpenMenu={() => {
                                                    const t = filteredTasks.find(tsk => tsk.id === expandedTaskId)!;
                                                    setSelectedActionTask(t);
                                                    setActionModalVisible(true);
                                                }}
                                                isExpanded={true}
                                                onExpand={() => setExpandedTaskId(null)}
                                                onUpdateComment={onUpdateComment}
                                                onEditComment={onEditComment}
                                                onDeleteComment={onDeleteComment}
                                                onUpdateStages={onUpdateStages}
                                                quickMessages={quickMessages}
                                                isFullView={true}
                                                allTasks={tasks}
                                                leaveDays={leaveDays}
                                            />
                                        );
                                    })()}
                                </View>
                            ) : (
                                <>
                                    <FlatList
                                        data={(() => {
                                            const pairs: Task[][] = [];
                                            for (let i = 0; i < filteredTasks.length; i += 2) {
                                                pairs.push(filteredTasks.slice(i, i + 2));
                                            }
                                            return pairs.length === 0 ? [null] : pairs;
                                        })()}
                                        keyExtractor={(_, index) => String(index)}
                                        renderItem={({ item: pair }) => {
                                            if (pair === null) {
                                                return (
                                                    <View style={styles.cardRow}>
                                                        {[1, 2].map(i => (
                                                            <TouchableOpacity
                                                                key={`p${i}`}
                                                                style={[styles.taskCard, styles.taskCardLandscape, styles.placeholderCard]}
                                                                onPress={onAddTask}
                                                                activeOpacity={0.7}
                                                            >
                                                                <View style={styles.placeholderContent}>
                                                                    <MaterialIcons name="add-task" size={32} color="rgba(255,255,255,0.2)" />
                                                                    <Text style={styles.placeholderText}>NEW TASK</Text>
                                                                </View>
                                                            </TouchableOpacity>
                                                        ))}
                                                    </View>
                                                );
                                            }
                                            return (
                                                <View style={styles.cardRow}>
                                                    {pair.filter(t => t && t.id && t.forDate).map((task) => (
                                                        <TaskCard
                                                            key={`${task.id}-${task.forDate}`}
                                                            task={task}
                                                            onToggle={() => onToggleTask(task)}
                                                            onDelete={() => onDeleteTask(task)}
                                                            onEdit={() => onEditTask?.(task)}
                                                            isLandscape={true}
                                                            categories={categories}
                                                            dailyStartMinutes={dailyStartMinutes}
                                                            isPastTasksDisabled={isPastTasksDisabled}
                                                            onOpenMenu={() => {
                                                                setSelectedActionTask(task);
                                                                setActionModalVisible(true);
                                                            }}
                                                            isExpanded={expandedTaskId === task.id}
                                                            onExpand={() => {
                                                                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                                                setExpandedTaskId(expandedTaskId === task.id ? null : task.id);
                                                            }}
                                                            onUpdateComment={onUpdateComment}
                                                            onEditComment={onEditComment}
                                                            onDeleteComment={onDeleteComment}
                                                            onUpdateStages={onUpdateStages}
                                                            quickMessages={quickMessages}
                                                            allTasks={tasks}
                                                            leaveDays={leaveDays}
                                                        />
                                                    ))}
                                                    {pair.length === 1 && <View style={styles.cardPlaceholder} />}
                                                </View>
                                            );
                                        }}
                                        ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
                                        style={styles.scrollViewLandscape}
                                        contentContainerStyle={styles.scrollContentLandscape}
                                        showsVerticalScrollIndicator={false}
                                        keyboardShouldPersistTaps="handled"
                                    />

                                    <TouchableOpacity style={styles.addButtonLandscape} onPress={onAddTask} activeOpacity={0.8}>
                                        <MaterialIcons name="add" size={28} color="#000" />
                                    </TouchableOpacity>
                                </>
                            )}
                        </View>
                    </>
                ) : (
                    // PORTRAIT LAYOUT
                    <>
                        <FlatList
                            data={filteredTasks}
                            keyExtractor={(item) => String(item.id)}
                            renderItem={({ item: task }) => {
                                // Safety check: skip null/undefined tasks
                                if (!task || !task.id || !task.forDate) {
                                    return null;
                                }
                                return (
                                    <View style={{ paddingHorizontal: 16 }}>
                                        <TaskCard
                                            key={`${task.id}-${task.forDate}`}
                                            task={task}
                                            onToggle={() => onToggleTask(task)}
                                            onDelete={() => onDeleteTask(task)}
                                            onEdit={() => onEditTask?.(task)}
                                            isLandscape={false}
                                            categories={categories}
                                            dailyStartMinutes={dailyStartMinutes}
                                            isPastTasksDisabled={isPastTasksDisabled}
                                            onOpenMenu={() => {
                                                setSelectedActionTask(task);
                                                setActionModalVisible(true);
                                            }}
                                            isExpanded={expandedTaskId === task.id}
                                            onExpand={() => {
                                                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                                setExpandedTaskId(expandedTaskId === task.id ? null : task.id);
                                            }}
                                            onUpdateComment={onUpdateComment}
                                            onEditComment={onEditComment}
                                            onDeleteComment={onDeleteComment}
                                            onUpdateStages={onUpdateStages}
                                            quickMessages={quickMessages}
                                            allTasks={tasks}
                                            leaveDays={leaveDays}
                                        />
                                    </View>
                                );
                            }}
                            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
                            ListHeaderComponent={() => (
                                <View style={{ paddingBottom: 12 }}>
                                    <View style={[styles.headerCardPortrait, { flex: 0, minHeight: 0 }]}>
                                        {/* 1. View Toggle & Completion Count Row */}
                                        {onViewChange && (
                                            <View style={styles.toggleWithCountRowPortrait}>
                                                <View style={styles.viewToggleContainer}>
                                                    <TouchableOpacity
                                                        style={[
                                                            styles.viewToggleBtn,
                                                            activeView === 'timer' && styles.viewToggleBtnActive
                                                        ]}
                                                        onPress={() => onViewChange('timer')}
                                                        activeOpacity={0.7}
                                                    >
                                                        <MaterialIcons
                                                            name="timer"
                                                            size={14}
                                                            color={activeView === 'timer' ? '#fff' : 'rgba(255,255,255,0.4)'}
                                                        />
                                                        <Text style={[
                                                            styles.viewToggleText,
                                                            activeView === 'timer' && styles.viewToggleTextActive
                                                        ]}>TIMER</Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        style={[
                                                            styles.viewToggleBtn,
                                                            activeView === 'task' && styles.viewToggleBtnActive
                                                        ]}
                                                        onPress={() => onViewChange('task')}
                                                        activeOpacity={0.7}
                                                    >
                                                        <MaterialIcons
                                                            name="check-box"
                                                            size={14}
                                                            color={activeView === 'task' ? '#fff' : 'rgba(255,255,255,0.4)'}
                                                        />
                                                        <Text style={[
                                                            styles.viewToggleText,
                                                            activeView === 'task' && styles.viewToggleTextActive
                                                        ]}>TASK</Text>
                                                    </TouchableOpacity>
                                                </View>
                                                {/* Completion Count & Collapse Button */}
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                    <View style={styles.completionCountBadge}>
                                                        <Text style={styles.completionCountText}>
                                                            {completedCount}/{completedCount + pendingCount + inProgressCount}
                                                        </Text>
                                                    </View>

                                                    <TouchableOpacity
                                                        style={styles.headerCollapseBtnTop}
                                                        onPress={() => {
                                                            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                                            setIsPortraitHeaderExpanded(!isPortraitHeaderExpanded);
                                                        }}
                                                        activeOpacity={0.7}
                                                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                                    >
                                                        <MaterialIcons
                                                            name={isPortraitHeaderExpanded ? "keyboard-arrow-up" : "keyboard-arrow-down"}
                                                            size={22}
                                                            color="rgba(255,255,255,0.6)"
                                                        />
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        )}

                                        {/* 2. Date Controls Row */}
                                        <View style={styles.dateControlRowPortrait}>
                                            <TouchableOpacity
                                                style={styles.dateLandscapeRow}
                                                onPress={() => {
                                                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                                    if (showCalendar) {
                                                        // Close Calendar and Collapse Header
                                                        setShowCalendar(false);
                                                        setIsPortraitHeaderExpanded(false);
                                                    } else {
                                                        // Open Calendar and Expand Header
                                                        if (!isPortraitHeaderExpanded) {
                                                            setViewDate(new Date());
                                                        }
                                                        setShowCalendar(true);
                                                        setIsPortraitHeaderExpanded(true);
                                                    }
                                                }}
                                                activeOpacity={0.7}
                                            >
                                                <MaterialIcons name="calendar-today" size={14} color="#fff" />
                                                <Text style={styles.dateLandscapeText}>
                                                    {isToday ? `  ${dayName}, ${dayNum} ${monthName}` : `  ${dateLabel} ${monthName}`}
                                                </Text>
                                                <MaterialIcons
                                                    name={showCalendar ? "keyboard-arrow-up" : "keyboard-arrow-down"}
                                                    size={16}
                                                    color="rgba(255,255,255,0.5)"
                                                    style={{ marginLeft: 4 }}
                                                />
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                style={[styles.todayNavBtn, showLive && { backgroundColor: 'rgba(255, 61, 0, 0.08)', borderColor: 'rgba(255, 61, 0, 0.2)' }]}
                                                onPress={() => setShowLive(!showLive)}
                                                activeOpacity={0.7}
                                            >
                                                <MaterialIcons name="sensors" size={12} color={showLive ? "#FF3D00" : "#FF3D00"} />
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                style={[styles.todayNavBtn, isToday && styles.todayNavBtnActive]}
                                                onPress={() => {
                                                    const start = getStartOfLogicalDay(new Date(), dailyStartMinutes);
                                                    onDateChange(start);
                                                    setViewDate(start);
                                                }}
                                                activeOpacity={0.7}
                                            >
                                                <MaterialIcons name="today" size={12} color={isToday ? "#4CAF50" : "rgba(255,255,255,0.4)"} />
                                                <View style={styles.todayLabelBlock}>
                                                    <Text style={[styles.todayNavText, isToday && styles.todayNavTextActive, { marginLeft: 0 }]}>TODAY</Text>
                                                    <Text style={[styles.todayRangeLabel, isToday && styles.todayRangeLabelActive]}>({formatDailyStartRangeCompact(dailyStartMinutes)})</Text>
                                                </View>
                                            </TouchableOpacity>
                                        </View>

                                        {/* 3. Calendar (Always visible if toggled on) */}
                                        {isPortraitHeaderExpanded ? (
                                            <>
                                                {showCalendar ? (
                                                    <View style={styles.portraitCalendarContainer}>
                                                        {renderCalendar()}
                                                    </View>
                                                ) : (
                                                    <>
                                                        {/* Stats Grid */}
                                                        <View style={styles.compactStatsGrid}>
                                                            <View style={styles.compactStatRow}>
                                                                <View style={styles.compactStatItem}>
                                                                    <Text style={styles.compactStatLabel}>PENDING</Text>
                                                                    <Text style={styles.compactStatValue}>{pendingCount}</Text>
                                                                </View>
                                                                <View style={styles.compactStatItem}>
                                                                    <Text style={styles.compactStatLabel}>IN PROGRESS</Text>
                                                                    <Text style={styles.compactStatValue}>{inProgressCount}</Text>
                                                                </View>
                                                            </View>
                                                        </View>

                                                        {/* Filters Section */}
                                                        <View style={styles.filtersSection}>
                                                            <View style={styles.filterHeaderRow}>
                                                                <Text style={styles.filterHeaderLabel}>FILTERS</Text>
                                                                <TouchableOpacity
                                                                    style={[styles.backlogHeaderBtn, showBacklog && styles.backlogHeaderBtnActive]}
                                                                    onPress={() => setShowBacklog(!showBacklog)}
                                                                    activeOpacity={0.7}
                                                                >
                                                                    <MaterialIcons
                                                                        name={showBacklog ? "event-note" : "event-busy"}
                                                                        size={14}
                                                                        color={showBacklog ? "#4CAF50" : "rgba(255,255,255,0.4)"}
                                                                    />
                                                                    <Text style={[styles.backlogHeaderBtnText, showBacklog && styles.backlogHeaderBtnTextActive]}>
                                                                        BACKLOG
                                                                    </Text>
                                                                </TouchableOpacity>
                                                            </View>

                                                            {/* Category Filter */}
                                                            <View style={styles.expandableFilterContainer}>
                                                                <TouchableOpacity
                                                                    style={styles.expandableHeader}
                                                                    onPress={() => setIsCategoryExpanded(!isCategoryExpanded)}
                                                                    activeOpacity={0.7}
                                                                >
                                                                    <View style={styles.expandableHeaderLeft}>
                                                                        <MaterialIcons
                                                                            name={filterCategoryIds.length === 0 ? 'category' : (categories.find(c => c.id === filterCategoryIds[0])?.icon || 'category')}
                                                                            size={16}
                                                                            color={filterCategoryIds.length === 0 ? 'rgba(255,255,255,0.4)' : (categories.find(c => c.id === filterCategoryIds[0])?.color || '#fff')}
                                                                        />
                                                                        <Text style={styles.expandableHeaderText}>
                                                                            {filterCategoryIds.length === 0 ? ' Category (All)' : filterCategoryIds.length === 1 ? ` ${categories.find(c => c.id === filterCategoryIds[0])?.name}` : ` ${filterCategoryIds.length} categories`}
                                                                        </Text>
                                                                    </View>
                                                                    <MaterialIcons
                                                                        name={isCategoryExpanded ? "expand-less" : "expand-more"}
                                                                        size={20}
                                                                        color="rgba(255,255,255,0.3)"
                                                                    />
                                                                </TouchableOpacity>

                                                                {isCategoryExpanded && (
                                                                    <View style={styles.expandedContent}>
                                                                        <TouchableOpacity
                                                                            style={[styles.miniChip, filterCategoryIds.length === 0 && styles.miniChipActive]}
                                                                            onPress={() => setFilterCategoryIds([])}
                                                                        >
                                                                            <Text style={[styles.miniChipText, filterCategoryIds.length === 0 && styles.miniChipTextActive]}>All</Text>
                                                                        </TouchableOpacity>
                                                                        {categories.map(cat => {
                                                                            const isSelected = filterCategoryIds.includes(cat.id);
                                                                            return (
                                                                                <TouchableOpacity
                                                                                    key={cat.id}
                                                                                    style={[
                                                                                        styles.miniChip,
                                                                                        isSelected && { backgroundColor: `${cat.color}20`, borderColor: cat.color }
                                                                                    ]}
                                                                                    onPress={() => {
                                                                                        setFilterCategoryIds(prev => prev.includes(cat.id) ? prev.filter(id => id !== cat.id) : [...prev, cat.id]);
                                                                                    }}
                                                                                >
                                                                                    <MaterialIcons name={cat.icon} size={10} color={isSelected ? cat.color : 'rgba(255,255,255,0.4)'} />
                                                                                    <Text style={[styles.miniChipText, isSelected && { color: cat.color }]}> {cat.name}</Text>
                                                                                </TouchableOpacity>
                                                                            );
                                                                        })}
                                                                    </View>
                                                                )}
                                                            </View>

                                                            {/* Status Filter */}
                                                            <View style={styles.expandableFilterContainer}>
                                                                <TouchableOpacity
                                                                    style={styles.expandableHeader}
                                                                    onPress={() => setIsStatusExpanded(!isStatusExpanded)}
                                                                    activeOpacity={0.7}
                                                                >
                                                                    <View style={styles.expandableHeaderLeft}>
                                                                        <MaterialIcons name="tune" size={16} color={filterStatus === 'All' ? 'rgba(255,255,255,0.4)' : '#fff'} />
                                                                        <Text style={styles.expandableHeaderText}>
                                                                            {filterStatus === 'All' ? ' Status' : ` ${filterStatus}`}
                                                                        </Text>
                                                                    </View>
                                                                    <MaterialIcons
                                                                        name={isStatusExpanded ? "expand-less" : "expand-more"}
                                                                        size={20}
                                                                        color="rgba(255,255,255,0.3)"
                                                                    />
                                                                </TouchableOpacity>

                                                                {isStatusExpanded && (
                                                                    <View style={styles.expandedContent}>
                                                                        {['All', 'Pending', 'In Progress', 'Completed'].map(status => (
                                                                            <TouchableOpacity
                                                                                key={status}
                                                                                style={[styles.miniChip, filterStatus === status && styles.miniChipActive]}
                                                                                onPress={() => setFilterStatus(status)}
                                                                            >
                                                                                <Text style={[styles.miniChipText, filterStatus === status && styles.miniChipTextActive]}>{status}</Text>
                                                                            </TouchableOpacity>
                                                                        ))}
                                                                    </View>
                                                                )}
                                                            </View>
                                                        </View>

                                                        {/* Footer: Detailed Reports */}
                                                        <View style={styles.leftPanelFooterRow}>
                                                            {onSettings && (
                                                                <TouchableOpacity
                                                                    style={styles.settingsIconBtn}
                                                                    onPress={onSettings}
                                                                    activeOpacity={0.7}
                                                                >
                                                                    <MaterialIcons name="settings" size={20} color="rgba(255,255,255,0.7)" />
                                                                </TouchableOpacity>
                                                            )}
                                                            <TouchableOpacity
                                                                style={styles.detailedReportsBtn}
                                                                onPress={() => {/* TODO: Add reports popup */ }}
                                                            >
                                                                <Text style={styles.detailedReportsText}>DETAILED REPORTS</Text>
                                                                <MaterialIcons name="chevron-right" size={20} color="rgba(255,255,255,0.5)" />
                                                            </TouchableOpacity>
                                                        </View>
                                                    </>
                                                )}
                                            </>
                                        ) : null}

                                    </View>
                                </View>
                            )}
                            ListEmptyComponent={() => (
                                <View style={{ gap: 16, paddingHorizontal: 16 }}>
                                    {[1, 2].map(i => (
                                        <TouchableOpacity
                                            key={`p${i}`}
                                            style={[styles.taskCard, styles.placeholderCard]}
                                            onPress={onAddTask}
                                            activeOpacity={0.7}
                                        >
                                            <View style={styles.placeholderContent}>
                                                <MaterialIcons name="add-task" size={32} color="rgba(255,255,255,0.2)" />
                                                <Text style={styles.placeholderText}>NEW TASK</Text>
                                            </View>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                            contentContainerStyle={[styles.scrollContent, { paddingHorizontal: 0 }]}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                        />

                        {/* FAB */}
                        <TouchableOpacity
                            style={[styles.addButton, !isLandscape && styles.addButtonPortrait]}
                            onPress={onAddTask}
                            activeOpacity={0.8}
                        >
                            <MaterialIcons name="add" size={28} color="#000" />
                        </TouchableOpacity>
                    </>
                )
                }

                <TaskActionModal
                    visible={actionModalVisible}
                    task={selectedActionTask}
                    onClose={() => setActionModalVisible(false)}
                    onDelete={onDeleteTask}
                    onUpdate={(t) => {
                        onEditTask?.(t);
                        setActionModalVisible(false);
                    }}
                    onAddComment={(t, c) => onUpdateComment?.(t, c)}
                    onPin={(t) => {
                        onPinTask?.(t);
                        setActionModalVisible(false);
                    }}
                />
            </SafeAreaView >
        </LinearGradient >
    );
}

// Task Card Component
interface TaskCardProps {
    task: Task;
    onToggle: () => void;
    onDelete: () => void;
    onEdit?: () => void;
    isLandscape: boolean;
    categories: Category[];
    /** Daily start (minutes from midnight). Used so isPast matches 06:00–06:00 logical day. */
    dailyStartMinutes?: number;
    isPastTasksDisabled?: boolean;
    onOpenMenu: () => void;
    isExpanded: boolean;
    onExpand: () => void;
    onUpdateComment?: (task: Task, comment: string) => void;
    onEditComment?: (task: Task, commentId: number, newText: string) => void;
    onDeleteComment?: (task: Task, commentId: number) => void;
    onUpdateStages?: (task: Task, stages: TaskStage[]) => void;
    isFullView?: boolean;
    quickMessages?: QuickMessage[];
    /** Original tasks array for accessing full recurrence data */
    allTasks?: Task[];
    leaveDays?: string[];
}

// Draggable Stages List Props
interface DraggableStagesListProps {
    stages: TaskStage[];
    onReorder: (newStages: TaskStage[]) => void;
    onSetStageStatus: (stageId: number, status: StageStatus) => void;
    onDeleteStage: (stageId: number) => void;
}

// Draggable Stages List Component
function DraggableStagesList({ stages, onReorder, onSetStageStatus, onDeleteStage }: DraggableStagesListProps) {
    const [data, setData] = useState<TaskStage[]>(stages);
    const [popupVisible, setPopupVisible] = useState(false);
    const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
    const [selectedStage, setSelectedStage] = useState<TaskStage | null>(null);

    useEffect(() => {
        setData(stages);
    }, [stages]);

    const handleCirclePress = useCallback((stage: TaskStage, event: any) => {
        const { pageX, pageY } = event.nativeEvent;
        setSelectedStage(stage);
        setPopupPosition({ x: pageX, y: pageY });
        setPopupVisible(true);
        Haptics.selectionAsync();
    }, []);

    const handleSelectStatus = useCallback((status: StageStatus) => {
        if (selectedStage) {
            onSetStageStatus(selectedStage.id, status);
        }
        setPopupVisible(false);
        setSelectedStage(null);
    }, [selectedStage, onSetStageStatus]);

    const handleClosePopup = useCallback(() => {
        setPopupVisible(false);
        setSelectedStage(null);
    }, []);

    // Get circle style based on status
    const getCircleStyle = (stage: TaskStage, isActive: boolean) => {
        const status = stage.status || 'Upcoming';

        if (isActive) {
            return [
                styles.stageOrderCircle,
                { backgroundColor: 'rgba(0,0,0,0.08)', borderColor: 'rgba(0,0,0,0.15)' }
            ];
        }

        switch (status) {
            case 'Done':
                return [styles.stageOrderCircle, styles.stageOrderCircleCompleted];
            case 'Process':
                return [styles.stageOrderCircle, styles.stageOrderCircleProcess];
            case 'Undone':
                return [styles.stageOrderCircle, styles.stageOrderCircleUncompleted];
            default: // Upcoming
                return [styles.stageOrderCircle, styles.stageOrderCircleUpcoming];
        }
    };

    const renderItem = useCallback(
        ({ item, drag, isActive, getIndex }: RenderItemParams<TaskStage>) => {
            const index = getIndex?.() ?? 0;
            const orderNumber = index + 1;
            const status = item.status || 'Upcoming';
            const isDone = status === 'Done';

            return (
                <View style={[styles.portraitStageItem, isActive && styles.stageItemDragging]}>
                    {/* Drag handle: long-press to drag */}
                    <TouchableOpacity
                        style={styles.stageDragHandle}
                        onLongPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                            drag();
                        }}
                        delayLongPress={180}
                        activeOpacity={0.7}
                    >
                        <MaterialIcons
                            name="drag-indicator"
                            size={16}
                            color={isActive ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.3)"}
                        />
                    </TouchableOpacity>

                    {/* Combined Order/Completion Circle */}
                    <TouchableOpacity
                        style={getCircleStyle(item, isActive)}
                        onPress={(event) => handleCirclePress(item, event)}
                        disabled={isActive}
                        activeOpacity={0.7}
                    >
                        <Text style={[
                            styles.stageOrderText,
                            (status === 'Done' || status === 'Undone') && { color: '#fff' },
                            isActive && styles.stageOrderTextDragging
                        ]}>
                            {orderNumber}
                        </Text>
                    </TouchableOpacity>

                    {/* Stage Text */}
                    <Text style={[
                        styles.portraitStageText,
                        isDone && styles.stageTextCompleted,
                        isActive && styles.stageTextDragging
                    ]}>
                        {item.text}
                    </Text>

                    {/* Delete Button */}
                    <TouchableOpacity
                        onPress={() => {
                            Alert.alert(
                                'Delete Stage',
                                `Are you sure you want to delete "${item.text}"?`,
                                [
                                    { text: 'Cancel', style: 'cancel' },
                                    {
                                        text: 'Delete',
                                        style: 'destructive',
                                        onPress: () => onDeleteStage(item.id)
                                    }
                                ]
                            );
                        }}
                        style={styles.deleteStageBtn}
                        disabled={isActive}
                        activeOpacity={0.7}
                    >
                        <MaterialIcons
                            name="delete-outline"
                            size={16}
                            color={isActive ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.25)"}
                        />
                    </TouchableOpacity>
                </View>
            );
        },
        [onDeleteStage, handleCirclePress, getCircleStyle]
    );

    return (
        <>
            <DraggableFlatList
                data={data}
                keyExtractor={(item) => String(item.id)}
                renderItem={renderItem}
                onDragBegin={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                }}
                onDragEnd={({ data: next }) => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setData(next);
                    onReorder(next);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                }}
                autoscrollThreshold={80}
                autoscrollSpeed={90}
                activationDistance={12}
                nestedScrollEnabled={true}
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 40 }}
            />
            <StageActionPopup
                visible={popupVisible}
                position={popupPosition}
                onSelectStatus={handleSelectStatus}
                onClose={handleClosePopup}
                currentStatus={selectedStage?.status || 'Upcoming'}
            />
        </>
    );
}

const getStatusConfig = (status: Task['status'], isPast: boolean = false) => {
    switch (status) {
        case 'In Progress':
            return { label: isPast ? 'UN DONE' : 'IN PROGRESS', color: '#00E5FF', bgColor: 'rgba(0,229,255,0.1)' };
        case 'Completed':
            return { label: 'COMPLETED', color: '#4CAF50', bgColor: 'rgba(76,175,80,0.15)' };
        default:
            return { label: isPast ? 'UN COMPLETE' : 'PENDING', color: 'rgba(255,255,255,0.5)', bgColor: 'rgba(255,255,255,0.08)' };
    }
};

const getPriorityConfig = (priority: Task['priority']) => {
    switch (priority) {
        case 'High':
            return { color: '#FF5252', icon: 'priority-high' as const };
        case 'Medium':
            return { color: '#FFB74D', icon: 'remove' as const };
        default:
            return { color: 'rgba(255,255,255,0.4)', icon: 'keyboard-arrow-down' as const };
    }
};

function TaskCard({
    task,
    onToggle,
    onDelete,
    onEdit,
    isLandscape,
    categories,
    dailyStartMinutes = DEFAULT_DAILY_START_MINUTES,
    isPastTasksDisabled,
    onOpenMenu,
    isExpanded,
    onExpand,
    onUpdateComment,
    onEditComment,
    onDeleteComment,
    onUpdateStages,
    isFullView,
    quickMessages,
    allTasks,
    leaveDays,
}: TaskCardProps) {
    const [commentText, setCommentText] = useState('');
    const [stageText, setStageText] = useState('');
    const [activeRightTab, setActiveRightTab] = useState<'comments' | 'stages'>('stages');
    const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
    // Safety check: ensure task has status property
    const taskStatus = task?.status || 'Pending';
    const isCompleted = taskStatus === 'Completed';
    const isInProgress = taskStatus === 'In Progress';

    const handleAddStage = () => {
        if (!stageText.trim()) return;
        const nowIso = new Date().toISOString();

        // Generate a stable stage id (avoid collisions within the task)
        const existingIds = new Set((task.stages || []).map(s => s.id));
        let stageId = Date.now();
        while (existingIds.has(stageId)) stageId += 1;

        const newStage: TaskStage = {
            id: stageId,
            text: stageText.trim(),
            isCompleted: false,
            status: 'Upcoming',
            createdAt: nowIso,
            // 6-to-6 day: start at beginning of logical day (e.g. 06:00), not 00:00
            startTimeMinutes: dailyStartMinutes,
            durationMinutes: 180,
        };
        const updatedStages = [...(task.stages || []), newStage];
        onUpdateStages?.(task, updatedStages);
        setStageText('');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const handleSetStageStatus = (stageId: number, status: StageStatus) => {
        const updatedStages = (task.stages || []).map(s =>
            s.id === stageId ? { ...s, status, isCompleted: status === 'Done' } : s
        );
        onUpdateStages?.(task, updatedStages);
        Haptics.selectionAsync();
    };

    const handleDeleteStage = (stageId: number) => {
        const updatedStages = (task.stages || []).filter(s => s.id !== stageId);
        onUpdateStages?.(task, updatedStages);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    };

    const handleReorderStages = (newStages: TaskStage[]) => {
        onUpdateStages?.(task, newStages);
    };

    // Safety check: ensure task exists and has required properties
    if (!task || !task.id || !task.forDate) {
        return null;
    }

    const logicalToday = getLogicalDate(new Date(), dailyStartMinutes);
    const isPast = task.forDate < logicalToday && !task.isBacklog;
    const isLocked = isPast && isPastTasksDisabled;

    const category = categories.find(c => c.id === task.categoryId);
    const categoryColor = category?.color || '#fff';
    const statusConfig = getStatusConfig(taskStatus, isPast);
    const priorityConfig = getPriorityConfig(task.priority);

    const content = (
        <>
            {isExpanded && !isLandscape && !isFullView && (
                <View style={styles.portraitHeaderActions}>
                    {!task.isBacklog && (
                        isCompleted ? (
                            <TouchableOpacity
                                style={styles.completedCheckIcon}
                                onPress={isLocked ? undefined : onToggle}
                                activeOpacity={0.6}
                            >
                                <MaterialIcons name="task-alt" size={28} color="#4CAF50" />
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={styles.checkboxContainer}
                                onPress={isLocked ? undefined : onToggle}
                                activeOpacity={0.6}
                            >
                                <View style={styles.statusButtonBezel}>
                                    <View
                                        style={[
                                            styles.statusButtonTrack,
                                            isInProgress && styles.statusButtonActive
                                        ]}
                                    >
                                        <View style={styles.statusButtonInteriorShadow} pointerEvents="none" />
                                        <View style={styles.statusButtonTopRim} pointerEvents="none" />
                                        {isInProgress && (
                                            <MaterialIcons name="play-circle" size={16} color="#00E5FF" />
                                        )}
                                    </View>
                                </View>
                            </TouchableOpacity>
                        )
                    )}
                    <TouchableOpacity
                        style={styles.portraitCloseBtnStatic}
                        onPress={onExpand}
                        activeOpacity={0.7}
                    >
                        <MaterialIcons name="close" size={20} color="rgba(255,255,255,0.4)" />
                    </TouchableOpacity>
                </View>
            )}

            {isFullView && !isLandscape && (
                <TouchableOpacity
                    style={styles.fullViewCloseBtn}
                    onPress={onExpand}
                    activeOpacity={0.7}
                >
                    <MaterialIcons name="close" size={24} color="rgba(255,255,255,0.4)" />
                </TouchableOpacity>
            )}

            {/* Progress indicator for completed */}
            {isCompleted && (
                <View style={styles.completedFillContainer}>
                    <View style={styles.completedFill} />
                </View>
            )}

            <LinearGradient
                colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0.2)', 'transparent']}
                style={styles.cardInset}
                pointerEvents="none"
            />

            {task.isPinned && (
                <View style={[styles.pinIconContainer, isLandscape ? styles.pinIconContainerLandscape : styles.pinIconContainerPortrait]}>
                    <MaterialIcons
                        name="local-offer"
                        size={10}
                        color="#fff"
                    />
                </View>
            )}

            <View style={[
                styles.cardContent,
                isFullView && isLandscape && { display: 'none' },
                isExpanded && !isLandscape && { alignItems: 'flex-start', paddingRight: 110 }
            ]}>
                <View style={styles.cardLeft}>
                    {/* Category + Status Row */}
                    <View style={styles.topStatusRow}>
                        <View style={[styles.priorityBadge, { borderColor: `${categoryColor}40`, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                            {isExpanded && (
                                <MaterialIcons name={category?.icon || 'folder'} size={10} color={categoryColor} />
                            )}
                            <Text style={[styles.priorityBadgeText, { color: categoryColor }]}>
                                {category?.name.toUpperCase() || 'GENERAL'}
                            </Text>
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: statusConfig.bgColor }]}>
                            <Text style={[styles.statusText, { color: statusConfig.color }]}>
                                {statusConfig.label}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.titleRow}>
                        <View style={styles.titleTextWrapper}>
                            <Text
                                style={[styles.taskTitle, isCompleted && styles.taskTitleCompleted]}
                                numberOfLines={isExpanded ? undefined : 1}
                                ellipsizeMode="tail"
                            >
                                {task.title}
                            </Text>
                        </View>
                        <View style={[styles.categoryBadge, { backgroundColor: `${priorityConfig.color}15`, borderColor: `${priorityConfig.color}30` }]}>
                            <MaterialIcons name={priorityConfig.icon} size={10} color={priorityConfig.color} />
                            {isExpanded && (
                                <Text style={[styles.categoryBadgeText, { color: priorityConfig.color }]} numberOfLines={1} ellipsizeMode="tail">
                                    {task.priority.toUpperCase()}
                                </Text>
                            )}
                        </View>
                        {(task.comments?.length ?? 0) > 0 && !isExpanded && (
                            <View style={[styles.categoryBadge, { backgroundColor: 'rgba(255,255,255,0.05)', marginLeft: 8, flexShrink: 0 }]}>
                                <MaterialIcons name="chat" size={10} color="rgba(255,255,255,0.6)" />
                            </View>
                        )}
                    </View>

                    {/* Show streak stars: list mode = 10 stars + gray + count; expanded mode = all stars visible, no count icon */}
                    {(task.recurrence || task.recurrenceInstances) ? (() => {
                        const originalTask = allTasks ? (findOriginalRecurringTask(allTasks, task) || task) : task;
                        const isExpandedMode = isExpanded || isFullView;
                        const minDates = isExpandedMode ? 50 : 10;
                        const rawRecent = getRecentRecurringDatesStatus(originalTask, dailyStartMinutes, minDates, leaveDays);
                        const recentDates = [...rawRecent].sort((a, b) => b.date.localeCompare(a.date));
                        const maxStars = 10;
                        const visibleDates = recentDates.slice(0, maxStars);
                        const remainingCount = recentDates.length > maxStars ? recentDates.length - maxStars : 0;
                        const grayStarColor = 'rgba(255,255,255,0.25)';
                        const displayItems: (typeof visibleDates[0] | null)[] = [...visibleDates];
                        if (!isExpandedMode) {
                            while (displayItems.length < maxStars) displayItems.push(null);
                        }
                        const itemsToShow = isExpandedMode ? recentDates : displayItems;

                        return (
                            <>
                                <View style={[
                                    styles.streakContainer,
                                    !isExpandedMode && styles.streakContainerSingleLine
                                ]}>
                                    {itemsToShow.map((dateStatus: (typeof recentDates[0]) | null, index: number) => {
                                        if (dateStatus && dateStatus.status === 'Leave') {
                                            return (
                                                <View key={dateStatus ? `${dateStatus.date}-${index}` : `gray-${index}`} style={styles.streakStar}>
                                                    <View style={{
                                                        width: isExpandedMode ? 16 : 14,
                                                        height: isExpandedMode ? 16 : 14,
                                                        borderRadius: 8,
                                                        borderWidth: 1,
                                                        borderColor: 'rgba(255,255,255,0.3)',
                                                        alignItems: 'center',
                                                        justifyContent: 'center'
                                                    }}>
                                                        <Text style={{
                                                            fontSize: isExpandedMode ? 9 : 8,
                                                            color: 'rgba(255,255,255,0.5)',
                                                            fontWeight: '700'
                                                        }}>H</Text>
                                                    </View>
                                                </View>
                                            );
                                        }
                                        const starColor = dateStatus
                                            ? (dateStatus.status === 'Completed' ? '#4CAF50' : dateStatus.status === 'In Progress' ? '#FFB74D' : '#FF5252')
                                            : grayStarColor;
                                        return (
                                            <View key={dateStatus ? `${dateStatus.date}-${index}` : `gray-${index}`} style={styles.streakStar}>
                                                <MaterialIcons
                                                    name="star-outline"
                                                    size={isExpandedMode ? 16 : 14}
                                                    color={starColor}
                                                />
                                            </View>
                                        );
                                    })}
                                    {!isExpandedMode && remainingCount > 0 && (
                                        <View style={styles.streakRemainingBadge}>
                                            <Text style={styles.streakRemainingBadgeText}>+{remainingCount}</Text>
                                        </View>
                                    )}
                                </View>
                                {/* Show description in expanded mode for recurring tasks */}
                                {isExpanded && task.description && (
                                    <View style={isExpanded && !isLandscape ? { maxHeight: 100, width: '100%', marginTop: 8 } : { marginTop: 4 }}>
                                        {isExpanded && !isLandscape ? (
                                            <ScrollView
                                                style={{ flexGrow: 0 }}
                                                showsVerticalScrollIndicator={true}
                                                nestedScrollEnabled={true}
                                            >
                                                <Text style={[styles.taskDescription, styles.taskDescriptionExpanded]}>
                                                    {task.description}
                                                </Text>
                                            </ScrollView>
                                        ) : (
                                            <Text style={styles.taskDescription} numberOfLines={isExpanded ? undefined : 1}>
                                                {task.description}
                                            </Text>
                                        )}
                                    </View>
                                )}
                            </>
                        );
                    })() : task.description ? (
                        <View style={isExpanded && !isLandscape ? { maxHeight: 100, width: '100%' } : undefined}>
                            {isExpanded && !isLandscape ? (
                                <ScrollView
                                    style={{ flexGrow: 0 }}
                                    showsVerticalScrollIndicator={true}
                                    nestedScrollEnabled={true}
                                >
                                    <Text style={[styles.taskDescription, styles.taskDescriptionExpanded]}>
                                        {task.description}
                                    </Text>
                                </ScrollView>
                            ) : (
                                <Text style={styles.taskDescription} numberOfLines={1}>
                                    {task.description}
                                </Text>
                            )}
                        </View>
                    ) : null}
                </View>

                {!task.isBacklog && !(isExpanded && !isLandscape) && (
                    <View style={{ width: 42, alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative', overflow: 'visible', alignSelf: 'flex-start', marginTop: 8 }}>
                        {isCompleted ? (
                            <TouchableOpacity
                                style={styles.completedCheckIcon}
                                onPress={isLocked ? undefined : onToggle}
                                activeOpacity={0.6}
                            >
                                <MaterialIcons name="task-alt" size={28} color="#4CAF50" />
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={styles.checkboxContainer}
                                onPress={isLocked ? undefined : onToggle}
                                activeOpacity={0.6}
                            >
                                <View style={[
                                    styles.checkbox,
                                    isInProgress && styles.checkboxActive
                                ]}>
                                    {isInProgress && (
                                        <MaterialIcons name="hourglass-empty" size={16} color="#00E5FF" />
                                    )}
                                </View>
                            </TouchableOpacity>
                        )}
                        {/* Stage counts: numbers only, below tick box - absolute so tick stays centered */}
                        {!isFullView && (
                            <View style={[styles.progressCountRow, { position: 'absolute', top: 42, left: 0, right: 0, marginTop: 2, justifyContent: 'center' }]}>
                                <Text style={styles.progressCountText}>{task.stages?.length || 0}</Text>
                                <Text style={styles.progressCountText}>/</Text>
                                <Text style={[styles.progressCountText, { color: '#4CAF50' }]}>
                                    {task.stages?.filter(s => s && s.status === 'Done').length || 0}
                                </Text>
                                <Text style={styles.progressCountText}>/</Text>
                                <Text style={[styles.progressCountText, { color: '#FF5252' }]}>
                                    {task.stages?.filter(s => s && s.status === 'Undone').length || 0}
                                </Text>
                            </View>
                        )}
                    </View>
                )}
            </View>

            {isFullView && isLandscape ? (
                <View style={styles.fullViewLandscapeLayout}>
                    {/* LEFT COLUMN: TASK DETAILS */}
                    <View style={styles.fullViewLeftCol}>
                        <View style={styles.topStatusRow}>
                            <View style={[styles.priorityBadge, { borderColor: `${categoryColor}40`, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                                <MaterialIcons name={category?.icon || 'folder'} size={10} color={categoryColor} />
                                <Text style={[styles.priorityBadgeText, { color: categoryColor }]}>
                                    {category?.name.toUpperCase() || 'GENERAL'}
                                </Text>
                            </View>
                            <View style={[styles.statusBadge, { backgroundColor: statusConfig.bgColor }]}>
                                <Text style={[styles.statusText, { color: statusConfig.color }]}>
                                    {statusConfig.label}
                                </Text>
                            </View>
                        </View>

                        <Text style={[styles.taskTitle, { fontSize: 24, marginBottom: 8 }, isCompleted && styles.taskTitleCompleted]}>
                            {task.title}
                        </Text>

                        <View style={[styles.categoryBadge, { backgroundColor: `${priorityConfig.color}15`, borderColor: `${priorityConfig.color}30`, alignSelf: 'flex-start', marginBottom: 16 }]}>
                            <MaterialIcons name={priorityConfig.icon} size={12} color={priorityConfig.color} />
                            <Text style={[styles.categoryBadgeText, { color: priorityConfig.color, fontSize: 10 }]}>
                                {task.priority.toUpperCase()}
                            </Text>
                        </View>

                        {/* Show streak stars for recurring tasks, description for non-recurring in full view */}
                        {/* Full view (landscape): show all streak stars, no count icon */}
                        {(task.recurrence || task.recurrenceInstances) ? (() => {
                            const originalTask = allTasks ? (findOriginalRecurringTask(allTasks, task) || task) : task;
                            const rawRecent = getRecentRecurringDatesStatus(originalTask, dailyStartMinutes, 50, leaveDays);
                            const recentDates = [...rawRecent].sort((a, b) => b.date.localeCompare(a.date));

                            return (
                                <>
                                    <View style={[styles.streakContainer, { marginBottom: task.description ? 12 : 16 }]}>
                                        {recentDates.map((dateStatus, index) => {
                                            if (dateStatus.status === 'Leave') {
                                                return (
                                                    <View key={`${dateStatus.date}-${index}`} style={styles.streakStar}>
                                                        <View style={{
                                                            width: 16,
                                                            height: 16,
                                                            borderRadius: 8,
                                                            borderWidth: 1,
                                                            borderColor: 'rgba(255,255,255,0.3)',
                                                            alignItems: 'center',
                                                            justifyContent: 'center'
                                                        }}>
                                                            <Text style={{
                                                                fontSize: 9,
                                                                color: 'rgba(255,255,255,0.5)',
                                                                fontWeight: '700'
                                                            }}>H</Text>
                                                        </View>
                                                    </View>
                                                );
                                            }
                                            const starColor = dateStatus.status === 'Completed' ? '#4CAF50' : dateStatus.status === 'In Progress' ? '#FFB74D' : '#FF5252';
                                            return (
                                                <View key={`${dateStatus.date}-${index}`} style={styles.streakStar}>
                                                    <MaterialIcons
                                                        name="star-outline"
                                                        size={16}
                                                        color={starColor}
                                                    />
                                                </View>
                                            );
                                        })}
                                    </View>
                                    {/* Show description in full view for recurring tasks */}
                                    {task.description && (
                                        <ScrollView style={styles.fullViewDescScroll} showsVerticalScrollIndicator={false}>
                                            <Text style={[styles.taskDescriptionExpanded, { fontSize: 13, color: 'rgba(255,255,255,0.4)' }]}>
                                                {task.description}
                                            </Text>
                                        </ScrollView>
                                    )}
                                </>
                            );
                        })() : task.description ? (
                            <ScrollView style={styles.fullViewDescScroll} showsVerticalScrollIndicator={false}>
                                <Text style={[styles.taskDescriptionExpanded, { fontSize: 13, color: 'rgba(255,255,255,0.4)' }]}>
                                    {task.description}
                                </Text>
                            </ScrollView>
                        ) : null}

                        <View style={styles.metaDivider} />

                        <View style={styles.fullViewMetaSection}>
                            <View style={styles.metaRow}>
                                <Text style={styles.metaLabel}>CREATED AT</Text>
                                <Text style={styles.metaValue}>
                                    {new Date(task.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </Text>
                            </View>
                            {task.startedAt && (
                                <View style={styles.metaRow}>
                                    <Text style={styles.metaLabel}>STARTED AT</Text>
                                    <Text style={styles.metaValue}>
                                        {new Date(task.startedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </Text>
                                </View>
                            )}
                            {task.completedAt && (
                                <View style={styles.metaRow}>
                                    <Text style={styles.metaLabel}>COMPLETED AT</Text>
                                    <Text style={styles.metaValue}>
                                        {new Date(task.completedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </Text>
                                </View>
                            )}
                            <View style={styles.metaRow}>
                                <Text style={styles.metaLabel}>LAST UPDATED</Text>
                                <Text style={styles.metaValue}>
                                    {new Date(task.updatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </Text>
                            </View>
                        </View>

                        {/* COMPACT FOOTER (BOTTOM-LEFT) */}
                        <View style={styles.fullViewCompactFooter}>
                            <TouchableOpacity
                                style={styles.fullViewBackBtnCompact}
                                onPress={onExpand}
                                activeOpacity={0.7}
                            >
                                <MaterialIcons name="close" size={20} color="#000" />
                            </TouchableOpacity>

                            {!task.isBacklog && (
                                <TouchableOpacity
                                    style={[styles.fullViewToggleBtnCompact, isCompleted && styles.fullViewToggleBtnCompleted]}
                                    onPress={isLocked ? undefined : onToggle}
                                    activeOpacity={0.7}
                                >
                                    <MaterialIcons
                                        name={isCompleted ? "task-alt" : (isInProgress ? "play-circle" : "radio-button-unchecked")}
                                        size={14}
                                        color={isCompleted ? "#4CAF50" : (isInProgress ? "#00E5FF" : "rgba(255,255,255,0.5)")}
                                    />
                                    <Text style={[styles.fullViewToggleTextCompact, isCompleted && { color: '#4CAF50' }]}>
                                        {isCompleted ? 'DONE' : (isInProgress ? 'IN PROGRESS' : 'MARK COMPLETE')}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>

                    {/* RIGHT COLUMN: COMMENTS */}
                    <View style={styles.fullViewRightCol}>
                        {/* Tab Toggle */}
                        <View style={styles.landscapeTabToggle}>
                            <TouchableOpacity
                                style={[styles.landscapeTab, activeRightTab === 'stages' && styles.landscapeTabActive]}
                                onPress={() => {
                                    setActiveRightTab('stages');
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                }}
                            >
                                <Text style={[styles.landscapeTabText, activeRightTab === 'stages' && styles.landscapeTabTextActive]}>STAGES</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.landscapeTab, activeRightTab === 'comments' && styles.landscapeTabActive]}
                                onPress={() => {
                                    setActiveRightTab('comments');
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                }}
                            >
                                <Text style={[styles.landscapeTabText, activeRightTab === 'comments' && styles.landscapeTabTextActive]}>COMMENTS</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.fullViewRightColHeader}>
                            {activeRightTab === 'comments' ? (
                                <>
                                    <View style={styles.inlineAddComment}>
                                        <TextInput
                                            style={styles.inlineCommentInput}
                                            placeholder={editingCommentId != null ? "Edit comment..." : "Add a comment..."}
                                            placeholderTextColor="rgba(255,255,255,0.3)"
                                            value={commentText}
                                            onChangeText={setCommentText}
                                            multiline
                                        />
                                        {editingCommentId != null && (
                                            <TouchableOpacity
                                                style={[styles.portraitCloseBtnStatic, { marginBottom: 0 }]}
                                                onPress={() => { setEditingCommentId(null); setCommentText(''); }}
                                            >
                                                <MaterialIcons name="close" size={18} color="rgba(255,255,255,0.6)" />
                                            </TouchableOpacity>
                                        )}
                                        <TouchableOpacity
                                            style={[styles.inlineSendBtn, !commentText.trim() && styles.inlineSendBtnDisabled]}
                                            onPress={() => {
                                                if (commentText.trim()) {
                                                    if (editingCommentId != null && onEditComment) {
                                                        onEditComment(task, editingCommentId, commentText.trim());
                                                        setEditingCommentId(null);
                                                        setCommentText('');
                                                    } else {
                                                        onUpdateComment?.(task, commentText.trim());
                                                        setCommentText('');
                                                    }
                                                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                                }
                                            }}
                                            disabled={!commentText.trim()}
                                        >
                                            <MaterialIcons name={editingCommentId != null ? "check" : "send"} size={18} color={commentText.trim() ? "#000" : "rgba(0,0,0,0.2)"} />
                                        </TouchableOpacity>
                                    </View>

                                    {/* Quick Messages (Landscape) - hide when editing */}
                                    {editingCommentId == null && (
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.quickMessagesScroll, { marginTop: 4, marginBottom: 4 }]}>
                                            {(quickMessages || []).map((msg) => (
                                                <TouchableOpacity
                                                    key={msg.id}
                                                    style={[styles.quickMessageChip, { borderColor: `${msg.color}30` }]}
                                                    onPress={() => {
                                                        onUpdateComment?.(task, msg.text);
                                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                    }}
                                                >
                                                    <Text style={[styles.quickMessageText, { color: msg.color }]}>{msg.text}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </ScrollView>
                                    )}
                                </>
                            ) : (
                                <View style={styles.inlineAddComment}>
                                    <TextInput
                                        style={styles.inlineCommentInput}
                                        placeholder="Add a stage..."
                                        placeholderTextColor="rgba(255,255,255,0.3)"
                                        value={stageText}
                                        onChangeText={setStageText}
                                        onSubmitEditing={handleAddStage}
                                    />
                                    <TouchableOpacity
                                        style={[styles.inlineSendBtn, !stageText.trim() && styles.inlineSendBtnDisabled]}
                                        onPress={handleAddStage}
                                        disabled={!stageText.trim()}
                                    >
                                        <MaterialIcons name="add" size={20} color={stageText.trim() ? "#000" : "rgba(0,0,0,0.2)"} />
                                    </TouchableOpacity>
                                </View>
                            )}
                            <View style={styles.expandedDivider} />
                        </View>

                        <View style={styles.fullViewCommentListWrapper}>
                            {activeRightTab === 'comments' ? (
                                task.comments && task.comments.length > 0 ? (
                                    <ScrollView
                                        style={styles.fullViewCommentScroll}
                                        showsVerticalScrollIndicator={true}
                                        nestedScrollEnabled={true}
                                        keyboardShouldPersistTaps="handled"
                                        scrollEventThrottle={16}
                                        bounces={true}
                                        alwaysBounceVertical={true}
                                        overScrollMode="always"
                                        contentContainerStyle={{ paddingBottom: 60 }}
                                    >
                                        {task.comments.map((comment) => (
                                            <View key={comment.id} style={styles.commentCard}>
                                                <View style={styles.commentCardTop}>
                                                    <Text style={styles.inlineCommentTime}>
                                                        {new Date(comment.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase()}
                                                    </Text>
                                                </View>
                                                <Text style={[styles.inlineCommentText, styles.commentCardChat]}>
                                                    {comment.text}
                                                </Text>
                                                <View style={styles.commentCardFooter}>
                                                    <View style={styles.commentCardActions}>
                                                        {onEditComment && (
                                                            <TouchableOpacity
                                                                style={styles.commentCardActionBtn}
                                                                onPress={() => {
                                                                    setEditingCommentId(comment.id);
                                                                    setCommentText(comment.text);
                                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                                }}
                                                            >
                                                                <MaterialIcons name="edit" size={14} color="rgba(255,255,255,0.5)" />
                                                            </TouchableOpacity>
                                                        )}
                                                        {onDeleteComment && (
                                                            <TouchableOpacity
                                                                style={styles.commentCardActionBtn}
                                                                onPress={() => {
                                                                    Alert.alert(
                                                                        'Delete comment',
                                                                        'Remove this comment?',
                                                                        [
                                                                            { text: 'Cancel', style: 'cancel' },
                                                                            {
                                                                                text: 'Delete',
                                                                                style: 'destructive',
                                                                                onPress: () => {
                                                                                    onDeleteComment(task, comment.id);
                                                                                    if (editingCommentId === comment.id) {
                                                                                        setEditingCommentId(null);
                                                                                        setCommentText('');
                                                                                    }
                                                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                                                                },
                                                                            },
                                                                        ]
                                                                    );
                                                                }}
                                                            >
                                                                <MaterialIcons name="delete-outline" size={14} color="rgba(255,82,82,0.9)" />
                                                            </TouchableOpacity>
                                                        )}
                                                    </View>
                                                </View>
                                            </View>
                                        ))}
                                    </ScrollView>
                                ) : (
                                    <View style={styles.noCommentsContainer}>
                                        <MaterialIcons name="chat-bubble-outline" size={32} color="rgba(255,255,255,0.1)" />
                                        <Text style={styles.noCommentsText}>No comments yet</Text>
                                    </View>
                                )
                            ) : (
                                (task.stages || []).length > 0 ? (
                                    <View style={{ flex: 1 }}>
                                        {/* Progress Bar - Static (Outside ScrollView) */}
                                        <View style={{ marginBottom: 12, paddingHorizontal: 4 }}>
                                            <View style={[styles.metaRow, { marginBottom: 0 }]}>
                                                <Text style={[styles.metaLabel, { width: 'auto', marginRight: 12 }]}>PROGRESS</Text>
                                                <View style={styles.stagesProgressWrapper}>
                                                    <View style={[styles.stagesProgressBar, { width: `${(task.stages?.length || 0) > 0 ? (task.stages?.filter(s => s && s.status === 'Done').length || 0) / (task.stages?.length || 0) * 100 : 0}%` }]} />
                                                </View>
                                                <Text style={[styles.sectionSubtitle, { marginLeft: 12 }]}>
                                                    {task.stages?.filter(s => s && s.status === 'Done').length || 0} / {task.stages?.length || 0}
                                                </Text>
                                            </View>
                                            <View style={styles.progressCountRow}>
                                                <Text style={styles.progressCountText}>
                                                    {task.stages?.length || 0} total
                                                </Text>
                                                <Text style={styles.progressCountText}>·</Text>
                                                <Text style={[styles.progressCountText, { color: '#4CAF50' }]}>
                                                    {task.stages?.filter(s => s && s.status === 'Done').length || 0} done
                                                </Text>
                                                <Text style={styles.progressCountText}>·</Text>
                                                <Text style={[styles.progressCountText, { color: '#FF5252' }]}>
                                                    {task.stages?.filter(s => s && s.status === 'Undone').length || 0} undone
                                                </Text>
                                            </View>
                                        </View>
                                        {/* Stages List - Draggable */}
                                        <DraggableStagesList
                                            stages={task.stages || []}
                                            onReorder={handleReorderStages}
                                            onSetStageStatus={handleSetStageStatus}
                                            onDeleteStage={handleDeleteStage}
                                        />
                                    </View>
                                ) : (
                                    <View style={styles.noStagesContainer}>
                                        <MaterialIcons name="format-list-bulleted" size={32} color="rgba(255,255,255,0.1)" />
                                        <Text style={styles.noStagesText}>No stages yet</Text>
                                    </View>
                                )
                            )}
                        </View>
                    </View>
                </View>
            ) : isExpanded && (
                <View style={[styles.cardExpandedContent, { paddingHorizontal: 0 }]}>
                    {/* Tab Toggle (Universal Header) */}
                    <View style={[styles.landscapeTabToggle, { marginTop: 8, marginBottom: 8 }]}>
                        <TouchableOpacity
                            style={[styles.landscapeTab, activeRightTab === 'stages' && styles.landscapeTabActive]}
                            onPress={() => {
                                setActiveRightTab('stages');
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }}
                        >
                            <Text style={[styles.landscapeTabText, activeRightTab === 'stages' && styles.landscapeTabTextActive]}>STAGES</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.landscapeTab, activeRightTab === 'comments' && styles.landscapeTabActive]}
                            onPress={() => {
                                setActiveRightTab('comments');
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }}
                        >
                            <Text style={[styles.landscapeTabText, activeRightTab === 'comments' && styles.landscapeTabTextActive]}>COMMENTS</Text>
                        </TouchableOpacity>
                    </View>

                    {activeRightTab === 'stages' ? (
                        /* Stages Section (Portrait) */
                        <View style={{ flex: 1, paddingHorizontal: 16, overflow: 'hidden' }}>
                            {/* Stage Input - same as comment input */}
                            <View style={styles.inlineAddComment}>
                                <TextInput
                                    style={styles.inlineCommentInput}
                                    placeholder="Add a stage..."
                                    placeholderTextColor="rgba(255,255,255,0.3)"
                                    value={stageText}
                                    onChangeText={setStageText}
                                    onSubmitEditing={handleAddStage}
                                />
                                <TouchableOpacity
                                    style={[styles.inlineSendBtn, !stageText.trim() && styles.inlineSendBtnDisabled]}
                                    onPress={handleAddStage}
                                    disabled={!stageText.trim()}
                                >
                                    <MaterialIcons name="add" size={18} color={stageText.trim() ? "#000" : "rgba(0,0,0,0.2)"} />
                                </TouchableOpacity>
                            </View>

                            {/* Progress Bar */}
                            {(task.stages || []).length > 0 && (
                                <View style={{ marginTop: 8, marginBottom: 8 }}>
                                    <View style={[styles.metaRow, { marginBottom: 4 }]}>
                                        <Text style={[styles.metaLabel, { width: 'auto', marginRight: 8, fontSize: 9 }]}>PROGRESS</Text>
                                        <View style={[styles.stagesProgressWrapper, { flex: 1 }]}>
                                            <View style={[styles.stagesProgressBar, { width: `${(task.stages?.filter(s => s && s.status === 'Done').length || 0) / (task.stages?.length || 1) * 100}%` }]} />
                                        </View>
                                        <Text style={[styles.sectionSubtitle, { marginLeft: 8, fontSize: 10 }]}>
                                            {task.stages?.filter(s => s && s.status === 'Done').length || 0}/{task.stages?.length || 0}
                                        </Text>
                                    </View>
                                    <View style={styles.progressCountRow}>
                                        <Text style={styles.progressCountText}>
                                            {task.stages?.length || 0} total
                                        </Text>
                                        <Text style={styles.progressCountText}>·</Text>
                                        <Text style={[styles.progressCountText, { color: '#4CAF50' }]}>
                                            {task.stages?.filter(s => s && s.status === 'Done').length || 0} done
                                        </Text>
                                        <Text style={styles.progressCountText}>·</Text>
                                        <Text style={[styles.progressCountText, { color: '#FF5252' }]}>
                                            {task.stages?.filter(s => s && s.status === 'Undone').length || 0} undone
                                        </Text>
                                    </View>
                                </View>
                            )}

                            <View style={styles.expandedDivider} />

                            {/* Stages List */}
                            {(task.stages || []).length > 0 ? (
                                <DraggableStagesList
                                    stages={task.stages || []}
                                    onReorder={handleReorderStages}
                                    onSetStageStatus={handleSetStageStatus}
                                    onDeleteStage={handleDeleteStage}
                                />
                            ) : (
                                <View style={[styles.noStagesContainer, { flex: 1 }]}>
                                    <MaterialIcons name="format-list-bulleted" size={48} color="rgba(255,255,255,0.05)" />
                                    <Text style={styles.noStagesText}>No stages yet</Text>
                                </View>
                            )}
                        </View>
                    ) : (
                        /* Comments Section (Portrait) */
                        <View style={{ flex: 1, paddingHorizontal: 16, overflow: 'hidden' }}>
                            <View style={styles.inlineAddComment}>
                                <TextInput
                                    style={styles.inlineCommentInput}
                                    placeholder={editingCommentId != null ? "Edit comment..." : "Add a comment..."}
                                    placeholderTextColor="rgba(255,255,255,0.3)"
                                    value={commentText}
                                    onChangeText={setCommentText}
                                    multiline
                                />
                                {editingCommentId != null && (
                                    <TouchableOpacity
                                        style={[styles.portraitCloseBtnStatic, { marginBottom: 0 }]}
                                        onPress={() => { setEditingCommentId(null); setCommentText(''); }}
                                    >
                                        <MaterialIcons name="close" size={18} color="rgba(255,255,255,0.6)" />
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity
                                    style={[styles.inlineSendBtn, !commentText.trim() && styles.inlineSendBtnDisabled]}
                                    onPress={() => {
                                        if (commentText.trim()) {
                                            if (editingCommentId != null && onEditComment) {
                                                onEditComment(task, editingCommentId, commentText.trim());
                                                setEditingCommentId(null);
                                                setCommentText('');
                                            } else {
                                                onUpdateComment?.(task, commentText.trim());
                                                setCommentText('');
                                            }
                                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                        }
                                    }}
                                    disabled={!commentText.trim()}
                                >
                                    <MaterialIcons name={editingCommentId != null ? "check" : "send"} size={18} color={commentText.trim() ? "#000" : "rgba(0,0,0,0.2)"} />
                                </TouchableOpacity>
                            </View>

                            {/* Quick Messages (Portrait) - hide when editing */}
                            {editingCommentId == null && (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickMessagesScroll}>
                                    {(quickMessages || []).map((msg) => (
                                        <TouchableOpacity
                                            key={msg.id}
                                            style={[styles.quickMessageChip, { borderColor: `${msg.color}30` }]}
                                            onPress={() => {
                                                onUpdateComment?.(task, msg.text);
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                            }}
                                        >
                                            <Text style={[styles.quickMessageText, { color: msg.color }]}>{msg.text}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            )}

                            <View style={styles.expandedDivider} />

                            {/* Comments List */}
                            {task.comments && task.comments.length > 0 ? (
                                <ScrollView
                                    style={[styles.inlineCommentsList, { minHeight: 0, flex: 1, overflow: 'hidden' }]}
                                    showsVerticalScrollIndicator={true}
                                    nestedScrollEnabled={true}
                                    keyboardShouldPersistTaps="handled"
                                    scrollEventThrottle={16}
                                    bounces={true}
                                    alwaysBounceVertical={true}
                                    overScrollMode="always"
                                    contentContainerStyle={{ paddingBottom: 40 }}
                                >
                                    {task.comments.map((comment) => (
                                        <View key={comment.id} style={styles.commentCard}>
                                            <View style={styles.commentCardTop}>
                                                <Text style={styles.inlineCommentTime}>
                                                    {new Date(comment.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase()}
                                                </Text>
                                            </View>
                                            <Text style={[styles.inlineCommentText, styles.commentCardChat]}>
                                                {comment.text}
                                            </Text>
                                            <View style={styles.commentCardFooter}>
                                                <View style={styles.commentCardActions}>
                                                    {onEditComment && (
                                                        <TouchableOpacity
                                                            style={styles.commentCardActionBtn}
                                                            onPress={() => {
                                                                setEditingCommentId(comment.id);
                                                                setCommentText(comment.text);
                                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                            }}
                                                        >
                                                            <MaterialIcons name="edit" size={14} color="rgba(255,255,255,0.5)" />
                                                        </TouchableOpacity>
                                                    )}
                                                    {onDeleteComment && (
                                                        <TouchableOpacity
                                                            style={styles.commentCardActionBtn}
                                                            onPress={() => {
                                                                Alert.alert(
                                                                    'Delete comment',
                                                                    'Remove this comment?',
                                                                    [
                                                                        { text: 'Cancel', style: 'cancel' },
                                                                        {
                                                                            text: 'Delete',
                                                                            style: 'destructive',
                                                                            onPress: () => {
                                                                                onDeleteComment(task, comment.id);
                                                                                if (editingCommentId === comment.id) {
                                                                                    setEditingCommentId(null);
                                                                                    setCommentText('');
                                                                                }
                                                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                                                            },
                                                                        },
                                                                    ]
                                                                );
                                                            }}
                                                        >
                                                            <MaterialIcons name="delete-outline" size={14} color="rgba(255,82,82,0.9)" />
                                                        </TouchableOpacity>
                                                    )}
                                                </View>
                                            </View>
                                        </View>
                                    ))}
                                </ScrollView>
                            ) : (
                                <View style={[styles.noCommentsContainer, { flex: 1, marginTop: 40 }]}>
                                    <MaterialIcons name="chat-bubble-outline" size={48} color="rgba(255,255,255,0.05)" />
                                    <Text style={styles.noCommentsText}>No comments yet</Text>
                                </View>
                            )}
                        </View>
                    )}
                </View>
            )}
        </>

    );

    if (isFullView || isExpanded) {
        return (
            <View
                style={[
                    styles.taskCardBezel,
                    isLandscape && styles.taskCardBezelLandscape,
                    isLocked && { opacity: 0.5 },
                ]}
            >
                <View style={[styles.taskCardOuterBoundaryHighlight, isLandscape && styles.taskCardOuterBoundaryHighlightLandscape]} />
                <View
                    style={[
                        styles.taskCardTrack,
                        isInProgress && styles.taskCardActive,
                        isCompleted && styles.taskCardCompleted,
                        isLandscape && styles.taskCardTrackLandscape,
                        isExpanded && styles.taskCardExpanded,
                        isFullView && styles.taskCardFullView,
                        (isPast && !isCompleted) && { backgroundColor: 'rgba(255, 82, 82, 0.15)' },
                        isExpanded && !isLandscape && {
                            height: (() => {
                                const descLength = task.description?.length || 0;
                                const estimatedLines = Math.ceil(descLength / 45);
                                const descHeight = Math.min(estimatedLines * 18, 100);

                                if (activeRightTab === 'stages') {
                                    const stageCount = task.stages?.length || 0;
                                    const visibleStages = Math.min(Math.max(stageCount, 2), 5);
                                    const stageHeight = 44;
                                    const headerSpace = 210 + descHeight;
                                    const calculatedHeight = headerSpace + (visibleStages * stageHeight);
                                    return Math.min(Math.max(calculatedHeight, 300 + descHeight), height * 0.85);
                                } else {
                                    const commentCount = task.comments?.length || 0;
                                    const visibleComments = Math.min(Math.max(commentCount, 5), 12);
                                    const commentHeight = 28;
                                    const headerSpace = 200 + descHeight;
                                    const calculatedHeight = headerSpace + (visibleComments * commentHeight);
                                    return Math.min(Math.max(calculatedHeight, 340 + descHeight), height * 0.85);
                                }
                            })(),
                            maxHeight: height * 0.88,
                            minHeight: 280,
                        }
                    ]}
                >
                    <View style={[styles.taskCardInteriorShadow, isLandscape && styles.taskCardInteriorShadowLandscape]} pointerEvents="none" />
                    <View style={[styles.taskCardTopRim, isLandscape && styles.taskCardTopRimLandscape]} pointerEvents="none" />
                    {content}
                </View>
            </View>
        );
    }

    return (
        <View
            style={[
                styles.taskCardBezel,
                isLandscape && styles.taskCardBezelLandscape,
                isLocked && { opacity: 0.5 },
            ]}
        >
            <View style={[styles.taskCardOuterBoundaryHighlight, isLandscape && styles.taskCardOuterBoundaryHighlightLandscape]} />
            <TouchableOpacity
                key={task.id}
                activeOpacity={(isLocked || task.isBacklog) ? 1 : 0.7}
                onPress={(isLocked) ? undefined : onExpand}
                onLongPress={isLocked ? undefined : onOpenMenu}
                style={[
                    styles.taskCardTrack,
                    isInProgress && styles.taskCardActive,
                    isCompleted && styles.taskCardCompleted,
                    isLandscape && styles.taskCardTrackLandscape,
                    (isPast && !isCompleted) && { backgroundColor: 'rgba(255, 82, 82, 0.15)' },
                ]}
                delayLongPress={400}
            >
                <View style={[styles.taskCardInteriorShadow, isLandscape && styles.taskCardInteriorShadowLandscape]} pointerEvents="none" />
                <View style={[styles.taskCardTopRim, isLandscape && styles.taskCardTopRimLandscape]} pointerEvents="none" />
                {content}
            </TouchableOpacity>
        </View>
    );
}

