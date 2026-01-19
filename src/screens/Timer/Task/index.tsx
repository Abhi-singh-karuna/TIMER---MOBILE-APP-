import * as React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { MaterialIcons } from '@expo/vector-icons';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { Category, Task, TaskStage, QuickMessage } from '../../../constants/data';
import TaskActionModal from '../../../components/TaskActionModal';
import * as Haptics from 'expo-haptics';

const { width, height } = Dimensions.get('window');

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
        gap: 8,
        marginBottom: 8,
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
        paddingBottom: 250,
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

    // Task Card
    taskCard: {
        marginBottom: 16,
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
        paddingVertical: 8,
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
    },
    taskTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#fff',
        marginRight: 8,
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
        borderRadius: 6,
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
    inlineCommentTime: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.25)',
        fontWeight: '700',
    },
    inlineCommentText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.85)',
        lineHeight: 16,
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
    },
    checkboxContainer: {
        width: 42,
        height: 42,
        alignItems: 'center',
        justifyContent: 'center',
    },
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
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 2,
    },
    dayCircle: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayCirclePortrait: {
        width: 26,
        height: 26,
        borderRadius: 13,
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
    viewToggleContainer: {
        flex: 1,
        flexDirection: 'row',
        gap: 4,
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 10,
        padding: 3,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.06)',
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
    onUpdateComment?: (task: Task, comment: string) => void;
    onUpdateStages?: (task: Task, stages: TaskStage[]) => void;
    quickMessages?: QuickMessage[];
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
    onUpdateComment,
    onUpdateStages,
    quickMessages,
}: TaskListProps) {
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const isLandscape = screenWidth > screenHeight;

    useEffect(() => {
        if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
            UIManager.setLayoutAnimationEnabledExperimental(true);
        }
    }, []);

    const [filterCategoryId, setFilterCategoryId] = useState<string>('All');
    const [filterStatus, setFilterStatus] = useState<string>('All');
    const [isCategoryExpanded, setIsCategoryExpanded] = useState(false);
    const [isStatusExpanded, setIsStatusExpanded] = useState(false);
    const [showCalendar, setShowCalendar] = useState(false);
    const [showFiltersPortrait, setShowFiltersPortrait] = useState(false);
    const [viewDate, setViewDate] = useState(new Date());
    const [showBacklog, setShowBacklog] = useState(false);
    const [actionModalVisible, setActionModalVisible] = useState(false);
    const [selectedActionTask, setSelectedActionTask] = useState<Task | null>(null);
    const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);

    const slideAnim = useRef(new Animated.Value(0)).current;
    const fadeAnim = useRef(new Animated.Value(1)).current;

    // Format date for comparison
    const formatDate = (date: Date) => {
        return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    };

    // Filter tasks by selected date OR backlog status
    const dateFilteredTasks = tasks.filter(t =>
        showBacklog ? !!t.isBacklog : (t.forDate === formatDate(selectedDate) && !t.isBacklog)
    );

    // Apply category and status filters
    const filteredTasks = dateFilteredTasks.filter(t => {
        const matchesCategory = filterCategoryId === 'All' || t.categoryId === filterCategoryId;
        const matchesStatus = filterStatus === 'All' || t.status === filterStatus;
        return matchesCategory && matchesStatus;
    });

    // Calculate analytics
    const completedCount = dateFilteredTasks.filter(t => t.status === 'Completed').length;
    const totalCount = dateFilteredTasks.length;
    const pendingCount = dateFilteredTasks.filter(t => t.status === 'Pending').length;
    const inProgressCount = dateFilteredTasks.filter(t => t.status === 'In Progress').length;

    // Get current date info
    const dayName = DAYS[selectedDate.getDay()].toUpperCase();
    const dayNum = selectedDate.getDate();
    const monthName = MONTHS[selectedDate.getMonth()].toUpperCase();

    const isToday = formatDate(selectedDate) === formatDate(new Date());
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
                        const isTodayDate = item.currentMonth &&
                            item.day === new Date().getDate() &&
                            viewDate.getMonth() === new Date().getMonth() &&
                            viewDate.getFullYear() === new Date().getFullYear();

                        const isSelected = item.currentMonth &&
                            item.day === selectedDate.getDate() &&
                            viewDate.getMonth() === selectedDate.getMonth() &&
                            viewDate.getFullYear() === selectedDate.getFullYear();

                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const selectedDateObj = new Date(selectedDate);
                        selectedDateObj.setHours(0, 0, 0, 0);
                        const isPastSelection = isSelected && selectedDateObj < today;

                        return (
                            <TouchableOpacity
                                key={index}
                                style={styles.dayCell}
                                onPress={() => {
                                    if (item.currentMonth) {
                                        const newSelected = new Date(viewDate.getFullYear(), viewDate.getMonth(), item.day);
                                        onDateChange(newSelected);
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
                            </TouchableOpacity>
                        );
                    })}
                </Animated.View>
            </View>
        );
    };

    // Render task cards
    const renderTaskCards = () => {
        if (filteredTasks.length === 0) {
            const renderPlaceholder = (key: string) => (
                <TouchableOpacity
                    key={key}
                    style={[
                        styles.placeholderCard,
                        isLandscape && styles.taskCardLandscape
                    ]}
                    onPress={onAddTask}
                    activeOpacity={0.7}
                >
                    <View style={styles.placeholderContent}>
                        <MaterialIcons
                            name="add-task"
                            size={32}
                            color="rgba(255,255,255,0.2)"
                        />
                        <Text style={styles.placeholderText}>NEW TASK</Text>
                    </View>
                </TouchableOpacity>
            );

            if (isLandscape) {
                return (
                    <>
                        <View style={styles.cardRow}>
                            {renderPlaceholder('p1')}
                            {renderPlaceholder('p2')}
                        </View>
                        <View style={styles.cardRow}>
                            {renderPlaceholder('p3')}
                            {renderPlaceholder('p4')}
                        </View>
                    </>
                );
            }

            return (
                <View style={{ gap: 16 }}>
                    {renderPlaceholder('p1')}
                    {renderPlaceholder('p2')}
                </View>
            );
        }

        if (isLandscape) {
            const pairs: Task[][] = [];
            for (let i = 0; i < filteredTasks.length; i += 2) {
                pairs.push(filteredTasks.slice(i, i + 2));
            }
            return pairs.map((pair, index) => (
                <View key={index} style={styles.cardRow}>
                    {pair.map((task) => (
                        <TaskCard
                            key={task.id}
                            task={task}
                            onToggle={() => onToggleTask(task)}
                            onDelete={() => onDeleteTask(task)}
                            onEdit={() => onEditTask?.(task)}
                            isLandscape={true}
                            categories={categories}
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
                            onUpdateStages={onUpdateStages}
                            quickMessages={quickMessages}
                        />
                    ))}
                    {pair.length === 1 && <View style={styles.cardPlaceholder} />}
                </View>
            ));
        }

        return filteredTasks.map((task) => (
            <TaskCard
                key={task.id}
                task={task}
                onToggle={() => onToggleTask(task)}
                onDelete={() => onDeleteTask(task)}
                onEdit={() => onEditTask?.(task)}
                isLandscape={false}
                categories={categories}
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
                onUpdateStages={onUpdateStages}
                quickMessages={quickMessages}
            />
        ));
    };

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
                                            <Text style={[styles.dateLandscapeText, !isToday && { color: '#fff', fontSize: 16 }]}>
                                                {isToday ? `  ${dayName}, ${dayNum} ${monthName}` : `  ${dateLabel} ${monthName}`}
                                            </Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[styles.todayNavBtn, isToday && styles.todayNavBtnActive]}
                                            onPress={() => {
                                                const today = new Date();
                                                onDateChange(today);
                                                setViewDate(today);
                                            }}
                                            activeOpacity={0.7}
                                        >
                                            <MaterialIcons name="today" size={12} color={isToday ? "#4CAF50" : "rgba(255,255,255,0.4)"} />
                                            <Text style={[styles.todayNavText, isToday && styles.todayNavTextActive]}>TODAY</Text>
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

                                                {/* Category Filter */}
                                                <View style={styles.expandableFilterContainer}>
                                                    <TouchableOpacity
                                                        style={styles.expandableHeader}
                                                        onPress={() => setIsCategoryExpanded(!isCategoryExpanded)}
                                                        activeOpacity={0.7}
                                                    >
                                                        <View style={styles.expandableHeaderLeft}>
                                                            <MaterialIcons
                                                                name={filterCategoryId === 'All' ? 'category' : (categories.find(c => c.id === filterCategoryId)?.icon || 'category')}
                                                                size={16}
                                                                color={filterCategoryId === 'All' ? 'rgba(255,255,255,0.4)' : (categories.find(c => c.id === filterCategoryId)?.color || '#fff')}
                                                            />
                                                            <Text style={styles.expandableHeaderText}>
                                                                {filterCategoryId === 'All' ? ' Category' : ` ${categories.find(c => c.id === filterCategoryId)?.name}`}
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
                                                                style={[styles.miniChip, filterCategoryId === 'All' && styles.miniChipActive]}
                                                                onPress={() => setFilterCategoryId('All')}
                                                            >
                                                                <Text style={[styles.miniChipText, filterCategoryId === 'All' && styles.miniChipTextActive]}>All</Text>
                                                            </TouchableOpacity>
                                                            {categories.map(cat => (
                                                                <TouchableOpacity
                                                                    key={cat.id}
                                                                    style={[
                                                                        styles.miniChip,
                                                                        filterCategoryId === cat.id && { backgroundColor: `${cat.color}20`, borderColor: cat.color }
                                                                    ]}
                                                                    onPress={() => setFilterCategoryId(cat.id)}
                                                                >
                                                                    <MaterialIcons name={cat.icon} size={10} color={filterCategoryId === cat.id ? cat.color : 'rgba(255,255,255,0.4)'} />
                                                                    <Text style={[styles.miniChipText, filterCategoryId === cat.id && { color: cat.color }]}> {cat.name}</Text>
                                                                </TouchableOpacity>
                                                            ))}
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
                                    <TaskCard
                                        task={tasks.find(t => t.id === expandedTaskId)!}
                                        onToggle={() => onToggleTask(tasks.find(t => t.id === expandedTaskId)!)}
                                        onDelete={() => onDeleteTask(tasks.find(t => t.id === expandedTaskId)!)}
                                        onEdit={() => onEditTask?.(tasks.find(t => t.id === expandedTaskId)!)}
                                        isLandscape={true}
                                        categories={categories}
                                        isPastTasksDisabled={isPastTasksDisabled}
                                        onOpenMenu={() => {
                                            const t = tasks.find(tsk => tsk.id === expandedTaskId)!;
                                            setSelectedActionTask(t);
                                            setActionModalVisible(true);
                                        }}
                                        isExpanded={true}
                                        onExpand={() => setExpandedTaskId(null)}
                                        onUpdateComment={onUpdateComment}
                                        onUpdateStages={onUpdateStages}
                                        quickMessages={quickMessages}
                                        isFullView={true}
                                    />
                                </View>
                            ) : (
                                <>
                                    <ScrollView
                                        style={styles.scrollViewLandscape}
                                        contentContainerStyle={styles.scrollContentLandscape}
                                        showsVerticalScrollIndicator={false}
                                        nestedScrollEnabled={true}
                                        keyboardShouldPersistTaps="handled"
                                    >
                                        {renderTaskCards()}
                                    </ScrollView>

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
                        <View style={[styles.headerCardPortrait, { flex: 0, minHeight: 0 }]}>
                            <View style={styles.headerMainRowPortrait}>
                                <TouchableOpacity
                                    style={styles.dateSelectorPillPortrait}
                                    onPress={() => {
                                        if (!showCalendar) setViewDate(new Date());
                                        setShowCalendar(!showCalendar);
                                    }}
                                    activeOpacity={0.7}
                                >
                                    <View style={styles.datePillLeft}>
                                        <MaterialIcons name="calendar-today" size={13} color="#fff" />
                                        <Text style={styles.dateSelectorTextPortrait}> {dayName}, {dayNum} {monthName}</Text>
                                    </View>
                                    <MaterialIcons
                                        name={showCalendar ? "keyboard-arrow-up" : "keyboard-arrow-down"}
                                        size={16}
                                        color="rgba(255,255,255,0.3)"
                                    />
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.todayBtnPortrait, isToday && styles.todayBtnActivePortrait]}
                                    onPress={() => {
                                        const today = new Date();
                                        onDateChange(today);
                                        setViewDate(today);
                                    }}
                                    activeOpacity={0.7}
                                >
                                    <MaterialIcons name="today" size={12} color={isToday ? "#4CAF50" : "rgba(255,255,255,0.4)"} />
                                    <Text style={[styles.todayBtnTextPortrait, isToday && styles.todayBtnTextActivePortrait]}>TODAY</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[
                                        styles.headerIconBtnPortrait,
                                        { marginLeft: 6 },
                                        showFiltersPortrait && styles.headerIconBtnActivePortrait,
                                        (filterCategoryId !== 'All' || filterStatus !== 'All' || showBacklog) && { borderColor: 'rgba(255,255,255,0.3)' }
                                    ]}
                                    onPress={() => {
                                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                        setShowFiltersPortrait(!showFiltersPortrait);
                                    }}
                                    activeOpacity={0.7}
                                >
                                    <MaterialIcons
                                        name="filter-alt"
                                        size={18}
                                        color={showFiltersPortrait ? "#fff" : (filterCategoryId !== 'All' || filterStatus !== 'All' || showBacklog ? "#fff" : "rgba(255,255,255,0.7)")}
                                    />
                                </TouchableOpacity>
                            </View>

                            {showFiltersPortrait && (
                                <View style={styles.portraitFiltersContainer}>
                                    <ScrollView
                                        horizontal
                                        showsHorizontalScrollIndicator={false}
                                        contentContainerStyle={styles.portraitFiltersScroll}
                                        style={{ flexGrow: 0 }}
                                    >
                                        <TouchableOpacity
                                            style={[styles.miniChip, showBacklog && styles.miniChipActive]}
                                            onPress={() => setShowBacklog(!showBacklog)}
                                        >
                                            <MaterialIcons name="archive" size={10} color={showBacklog ? "#4CAF50" : "rgba(255,255,255,0.4)"} />
                                            <Text style={[styles.miniChipText, showBacklog && styles.miniChipTextActive]}> Backlog</Text>
                                        </TouchableOpacity>

                                        <View style={styles.filterDividerPortrait} />

                                        <TouchableOpacity
                                            style={[styles.miniChip, filterCategoryId === 'All' && styles.miniChipActive]}
                                            onPress={() => setFilterCategoryId('All')}
                                        >
                                            <Text style={[styles.miniChipText, filterCategoryId === 'All' && styles.miniChipTextActive]}>All Cat</Text>
                                        </TouchableOpacity>
                                        {categories.map(cat => (
                                            <TouchableOpacity
                                                key={cat.id}
                                                style={[
                                                    styles.miniChip,
                                                    filterCategoryId === cat.id && { backgroundColor: `${cat.color}20`, borderColor: cat.color }
                                                ]}
                                                onPress={() => setFilterCategoryId(cat.id)}
                                            >
                                                <MaterialIcons name={cat.icon} size={10} color={filterCategoryId === cat.id ? cat.color : 'rgba(255,255,255,0.4)'} />
                                                <Text style={[styles.miniChipText, filterCategoryId === cat.id && { color: cat.color }]}> {cat.name}</Text>
                                            </TouchableOpacity>
                                        ))}

                                        <View style={styles.filterDividerPortrait} />

                                        {['All', 'Pending', 'In Progress', 'Completed'].map(status => (
                                            <TouchableOpacity
                                                key={status}
                                                style={[styles.miniChip, filterStatus === status && styles.miniChipActive]}
                                                onPress={() => setFilterStatus(status)}
                                            >
                                                <Text style={[styles.miniChipText, filterStatus === status && styles.miniChipTextActive]}>{status}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                </View>
                            )}

                            {showCalendar && (
                                <View style={styles.portraitCalendarContainer}>
                                    {renderCalendar()}
                                </View>
                            )}
                        </View>

                        <View style={styles.separatorContainer}>
                            <LinearGradient
                                colors={['transparent', 'rgba(255,255,255,0.2)', 'transparent']}
                                start={{ x: 0, y: 0.5 }}
                                end={{ x: 1, y: 0.5 }}
                                style={styles.separator}
                            />
                        </View>

                        <ScrollView
                            style={styles.scrollView}
                            contentContainerStyle={styles.scrollContent}
                            showsVerticalScrollIndicator={false}
                            scrollEnabled={true}
                            nestedScrollEnabled={true}
                            keyboardShouldPersistTaps="handled"
                        >
                            {renderTaskCards()}
                        </ScrollView>

                        {/* FAB */}
                        <TouchableOpacity
                            style={[styles.addButton, !isLandscape && styles.addButtonPortrait]}
                            onPress={onAddTask}
                            activeOpacity={0.8}
                        >
                            <MaterialIcons name="add" size={28} color="#000" />
                        </TouchableOpacity>
                    </>
                )}

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
                />
            </SafeAreaView>
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
    isPastTasksDisabled?: boolean;
    onOpenMenu: () => void;
    isExpanded: boolean;
    onExpand: () => void;
    onUpdateComment?: (task: Task, comment: string) => void;
    onUpdateStages?: (task: Task, stages: TaskStage[]) => void;
    isFullView?: boolean;
    quickMessages?: QuickMessage[];
}

// Draggable Stages List Props
interface DraggableStagesListProps {
    stages: TaskStage[];
    onReorder: (newStages: TaskStage[]) => void;
    onToggleStage: (stageId: number) => void;
    onDeleteStage: (stageId: number) => void;
}

// Draggable Stages List Component
function DraggableStagesList({ stages, onReorder, onToggleStage, onDeleteStage }: DraggableStagesListProps) {
    const [data, setData] = useState<TaskStage[]>(stages);

    useEffect(() => {
        setData(stages);
    }, [stages]);

    const renderItem = useCallback(
        ({ item, drag, isActive, getIndex }: RenderItemParams<TaskStage>) => {
            const index = getIndex?.() ?? 0;
            const orderNumber = index + 1;

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
                        style={[
                            styles.stageOrderCircle,
                            item.isCompleted && styles.stageOrderCircleCompleted,
                            isActive && !item.isCompleted && {
                                backgroundColor: 'rgba(0,0,0,0.08)',
                                borderColor: 'rgba(0,0,0,0.15)'
                            }
                        ]}
                        onPress={() => {
                            Haptics.selectionAsync();
                            onToggleStage(item.id);
                        }}
                        disabled={isActive}
                        activeOpacity={0.7}
                    >
                        <Text style={[
                            styles.stageOrderText,
                            item.isCompleted && { color: '#fff' },
                            isActive && !item.isCompleted && styles.stageOrderTextDragging
                        ]}>
                            {orderNumber}
                        </Text>
                    </TouchableOpacity>

                    {/* Stage Text */}
                    <Text style={[
                        styles.portraitStageText,
                        item.isCompleted && styles.stageTextCompleted,
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
        [onDeleteStage, onToggleStage]
    );

    return (
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
    );
}

const getStatusConfig = (status: Task['status']) => {
    switch (status) {
        case 'In Progress':
            return { label: 'IN PROGRESS', color: '#00E5FF', bgColor: 'rgba(0,229,255,0.1)' };
        case 'Completed':
            return { label: 'COMPLETED', color: '#4CAF50', bgColor: 'rgba(76,175,80,0.15)' };
        default:
            return { label: 'PENDING', color: 'rgba(255,255,255,0.5)', bgColor: 'rgba(255,255,255,0.08)' };
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
    isPastTasksDisabled,
    onOpenMenu,
    isExpanded,
    onExpand,
    onUpdateComment,
    onUpdateStages,
    isFullView,
    quickMessages,
}: TaskCardProps) {
    const [commentText, setCommentText] = useState('');
    const [stageText, setStageText] = useState('');
    const [activeRightTab, setActiveRightTab] = useState<'comments' | 'stages'>('stages');
    const isCompleted = task.status === 'Completed';
    const isInProgress = task.status === 'In Progress';

    const handleAddStage = () => {
        if (!stageText.trim()) return;
        const newStage: TaskStage = {
            id: Date.now(),
            text: stageText.trim(),
            isCompleted: false,
            createdAt: new Date().toISOString(),
        };
        const updatedStages = [...(task.stages || []), newStage];
        onUpdateStages?.(task, updatedStages);
        setStageText('');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const handleToggleStage = (stageId: number) => {
        const updatedStages = (task.stages || []).map(s =>
            s.id === stageId ? { ...s, isCompleted: !s.isCompleted } : s
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

    const today = new Date().toISOString().split('T')[0];
    const isPast = task.forDate < today && !task.isBacklog;
    const isLocked = isPast && isPastTasksDisabled;

    const category = categories.find(c => c.id === task.categoryId);
    const categoryColor = category?.color || '#fff';
    const categoryIcon = category?.icon || 'folder';

    const statusConfig = getStatusConfig(task.status);
    const priorityConfig = getPriorityConfig(task.priority);

    const cardStyle = [
        styles.taskCard,
        isInProgress && styles.taskCardActive,
        isCompleted && styles.taskCardCompleted,
        isLandscape && styles.taskCardLandscape,
        isLocked && { opacity: 0.5 },
        isExpanded && styles.taskCardExpanded,
        isFullView && styles.taskCardFullView
    ];

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
                                <MaterialIcons name="check-circle" size={28} color="#4CAF50" />
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

            <View style={[
                styles.cardContent,
                isFullView && isLandscape && { display: 'none' },
                isExpanded && !isLandscape && { alignItems: 'flex-start' }
            ]}>
                <View style={styles.cardLeft}>
                    {/* Status Row */}
                    <View style={styles.topStatusRow}>
                        <View style={[styles.statusBadge, { backgroundColor: statusConfig.bgColor }]}>
                            <Text style={[styles.statusText, { color: statusConfig.color }]}>
                                {statusConfig.label}
                            </Text>
                        </View>
                        <View style={[styles.priorityBadge, { borderColor: `${priorityConfig.color}40` }]}>
                            <Text style={[styles.priorityBadgeText, { color: priorityConfig.color }]}>
                                {task.priority.toUpperCase()}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.titleRow}>
                        <Text
                            style={[styles.taskTitle, isCompleted && styles.taskTitleCompleted]}
                            numberOfLines={isExpanded ? undefined : 1}
                        >
                            {task.title}
                        </Text>
                        <View style={[styles.categoryBadge, { backgroundColor: `${categoryColor}15`, borderColor: `${categoryColor}30` }]}>
                            <MaterialIcons name={categoryIcon} size={10} color={categoryColor} />
                            <Text style={[styles.categoryBadgeText, { color: categoryColor }]}>
                                {category?.name.toUpperCase() || 'GENERAL'}
                            </Text>
                        </View>
                        {(task.comments?.length ?? 0) > 0 && !isExpanded && (
                            <View style={[styles.categoryBadge, { backgroundColor: 'rgba(255,255,255,0.05)', marginLeft: 8 }]}>
                                <MaterialIcons name="chat" size={10} color="rgba(255,255,255,0.6)" />
                            </View>
                        )}
                    </View>

                    {task.description && (
                        <Text style={[styles.taskDescription, isExpanded && styles.taskDescriptionExpanded]} numberOfLines={isExpanded ? undefined : 1}>
                            {task.description}
                        </Text>
                    )}
                </View>

                {!task.isBacklog && !(isExpanded && !isLandscape) && (
                    isCompleted ? (
                        <TouchableOpacity
                            style={styles.completedCheckIcon}
                            onPress={isLocked ? undefined : onToggle}
                            activeOpacity={0.6}
                        >
                            <MaterialIcons name="check-circle" size={28} color="#4CAF50" />
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
                    )
                )}
            </View>

            {isFullView && isLandscape ? (
                <View style={styles.fullViewLandscapeLayout}>
                    {/* LEFT COLUMN: TASK DETAILS */}
                    <View style={styles.fullViewLeftCol}>
                        <View style={styles.topStatusRow}>
                            <View style={[styles.statusBadge, { backgroundColor: statusConfig.bgColor }]}>
                                <Text style={[styles.statusText, { color: statusConfig.color }]}>
                                    {statusConfig.label}
                                </Text>
                            </View>
                            <View style={[styles.priorityBadge, { borderColor: `${priorityConfig.color}40` }]}>
                                <Text style={[styles.priorityBadgeText, { color: priorityConfig.color }]}>
                                    {task.priority.toUpperCase()}
                                </Text>
                            </View>
                        </View>

                        <Text style={[styles.taskTitle, { fontSize: 24, marginBottom: 8 }, isCompleted && styles.taskTitleCompleted]}>
                            {task.title}
                        </Text>

                        <View style={[styles.categoryBadge, { backgroundColor: `${categoryColor}15`, borderColor: `${categoryColor}30`, alignSelf: 'flex-start', marginBottom: 16 }]}>
                            <MaterialIcons name={categoryIcon} size={12} color={categoryColor} />
                            <Text style={[styles.categoryBadgeText, { color: categoryColor, fontSize: 10 }]}>
                                {category?.name.toUpperCase() || 'GENERAL'}
                            </Text>
                        </View>

                        {task.description && (
                            <ScrollView style={styles.fullViewDescScroll} showsVerticalScrollIndicator={false}>
                                <Text style={[styles.taskDescriptionExpanded, { fontSize: 13, color: 'rgba(255,255,255,0.4)' }]}>
                                    {task.description}
                                </Text>
                            </ScrollView>
                        )}

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
                                        name={isCompleted ? "check" : (isInProgress ? "hourglass-empty" : "radio-button-unchecked")}
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
                                            placeholder="Add a comment..."
                                            placeholderTextColor="rgba(255,255,255,0.3)"
                                            value={commentText}
                                            onChangeText={setCommentText}
                                            multiline
                                        />
                                        <TouchableOpacity
                                            style={[styles.inlineSendBtn, !commentText.trim() && styles.inlineSendBtnDisabled]}
                                            onPress={() => {
                                                if (commentText.trim()) {
                                                    onUpdateComment?.(task, commentText.trim());
                                                    setCommentText('');
                                                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                                }
                                            }}
                                            disabled={!commentText.trim()}
                                        >
                                            <MaterialIcons name="send" size={18} color={commentText.trim() ? "#000" : "rgba(0,0,0,0.2)"} />
                                        </TouchableOpacity>
                                    </View>

                                    {/* Quick Messages (Landscape) */}
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
                                            <View key={comment.id} style={styles.inlineCommentItem}>
                                                <Text style={styles.inlineCommentText}>
                                                    <Text style={styles.inlineCommentTime}>
                                                        {new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase()} •{" "}
                                                    </Text>
                                                    {comment.text}
                                                </Text>
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
                                        <View style={[styles.metaRow, { marginBottom: 12, paddingHorizontal: 4 }]}>
                                            <Text style={[styles.metaLabel, { width: 'auto', marginRight: 12 }]}>PROGRESS</Text>
                                            <View style={styles.stagesProgressWrapper}>
                                                <View style={[styles.stagesProgressBar, { width: `${(task.stages?.length || 0) > 0 ? (task.stages?.filter(s => s.isCompleted).length || 0) / (task.stages?.length || 0) * 100 : 0}%` }]} />
                                            </View>
                                            <Text style={[styles.sectionSubtitle, { marginLeft: 12 }]}>
                                                {task.stages?.filter(s => s.isCompleted).length} / {task.stages?.length}
                                            </Text>
                                        </View>
                                        {/* Stages List - Draggable */}
                                        <DraggableStagesList
                                            stages={task.stages || []}
                                            onReorder={handleReorderStages}
                                            onToggleStage={handleToggleStage}
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
                                <View style={[styles.metaRow, { marginTop: 8, marginBottom: 8 }]}>
                                    <Text style={[styles.metaLabel, { width: 'auto', marginRight: 8, fontSize: 9 }]}>PROGRESS</Text>
                                    <View style={[styles.stagesProgressWrapper, { flex: 1 }]}>
                                        <View style={[styles.stagesProgressBar, { width: `${(task.stages?.filter(s => s.isCompleted).length || 0) / (task.stages?.length || 1) * 100}%` }]} />
                                    </View>
                                    <Text style={[styles.sectionSubtitle, { marginLeft: 8, fontSize: 10 }]}>
                                        {task.stages?.filter(s => s.isCompleted).length}/{task.stages?.length}
                                    </Text>
                                </View>
                            )}

                            <View style={styles.expandedDivider} />

                            {/* Stages List */}
                            {(task.stages || []).length > 0 ? (
                                <DraggableStagesList
                                    stages={task.stages || []}
                                    onReorder={handleReorderStages}
                                    onToggleStage={handleToggleStage}
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
                                    placeholder="Add a comment..."
                                    placeholderTextColor="rgba(255,255,255,0.3)"
                                    value={commentText}
                                    onChangeText={setCommentText}
                                    multiline
                                />
                                <TouchableOpacity
                                    style={[styles.inlineSendBtn, !commentText.trim() && styles.inlineSendBtnDisabled]}
                                    onPress={() => {
                                        if (commentText.trim()) {
                                            onUpdateComment?.(task, commentText.trim());
                                            setCommentText('');
                                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                        }
                                    }}
                                    disabled={!commentText.trim()}
                                >
                                    <MaterialIcons name="send" size={18} color={commentText.trim() ? "#000" : "rgba(0,0,0,0.2)"} />
                                </TouchableOpacity>
                            </View>

                            {/* Quick Messages (Portrait) */}
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
                                        <View key={comment.id} style={styles.inlineCommentItem}>
                                            <Text style={styles.inlineCommentText}>
                                                <Text style={styles.inlineCommentTime}>
                                                    {new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase()} •{" "}
                                                </Text>
                                                {comment.text}
                                            </Text>
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
                    cardStyle,
                    isExpanded && !isLandscape && {
                        // Dynamic height based on active tab content
                        height: (() => {
                            if (activeRightTab === 'stages') {
                                // Stages: min 2, max 5 visible
                                const stageCount = task.stages?.length || 0;
                                const visibleStages = Math.min(Math.max(stageCount, 2), 5);
                                const stageHeight = 44;
                                const headerSpace = 200; // tabs, input, progress bar, padding
                                const calculatedHeight = headerSpace + (visibleStages * stageHeight);
                                return Math.min(Math.max(calculatedHeight, 280), height * 0.75);
                            } else {
                                // Comments: min 5, max 12 visible
                                const commentCount = task.comments?.length || 0;
                                const visibleComments = Math.min(Math.max(commentCount, 5), 12);
                                const commentHeight = 28; // each comment line ~28px
                                const headerSpace = 180; // tabs, input, predefined messages (fixed ~60px)
                                const calculatedHeight = headerSpace + (visibleComments * commentHeight);
                                return Math.min(Math.max(calculatedHeight, 320), height * 0.75);
                            }
                        })(),
                        maxHeight: height * 0.78,
                        minHeight: 280,
                    }
                ]}
            >
                {content}
            </View>
        );
    }

    return (
        <TouchableOpacity
            key={task.id}
            activeOpacity={(isLocked || task.isBacklog) ? 1 : 0.7}
            onPress={(isLocked) ? undefined : onExpand}
            onLongPress={isLocked ? undefined : onOpenMenu}
            style={cardStyle}
            delayLongPress={400}
        >
            {content}
        </TouchableOpacity>
    );
}

