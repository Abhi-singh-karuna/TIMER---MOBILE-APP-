import { StyleSheet, Platform } from 'react-native';

export const styles = StyleSheet.create({
    container: {
        flex: 1,
    },

    safeArea: {
        flex: 1,
    },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 16,
        paddingHorizontal: 24,
        paddingBottom: 16,
    },

    headerLandscape: {
        paddingTop: 8,
        paddingBottom: 8,
    },

    backButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },

    headerTitle: {
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 2,
        color: '#fff',
    },

    headerSpacer: {
        width: 44,
    },

    content: {
        flex: 1,
    },

    scrollContent: {
        padding: 24,
        paddingBottom: 40,
    },

    section: {
        marginBottom: 24,
    },

    sectionTitle: {
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 2,
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 12,
    },

    sectionTitleLandscape: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 2,
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 10,
    },

    landscapeContainer: {
        flex: 1,
        flexDirection: 'row',
        paddingVertical: 12,
        gap: 25,
    },

    leftSidebarCard: {
        backgroundColor: 'transparent',
        paddingVertical: 12,
        paddingHorizontal: 8,
        justifyContent: 'flex-start',
    },

    sidebarSectionTitle: {
        fontSize: 9,
        fontWeight: '900',
        color: 'rgba(255,255,255,0.25)',
        letterSpacing: 2,
        marginBottom: 8,
        paddingLeft: 4,
        textTransform: 'uppercase',
    },

    sidebarPreviewWrapper: {
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        minHeight: 140,
    },

    sidebarNavSection: {
        flex: 1,
        marginTop: 10,
        marginBottom: 50,
    },

    sidebarButtonsScroll: {
        paddingBottom: 20,
    },

    sidebarButtonsList: {
        gap: 4,
    },

    sidebarIconLabelContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },

    rightContentCard: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        display: 'flex',
    },

    sectionDivider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.06)',
        marginVertical: 12,
        width: '100%',
    },

    sidebarButtonRow: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 9,
        paddingHorizontal: 12,
        borderRadius: 12,
        backgroundColor: 'transparent',
    },

    sidebarButtonRowActive: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
    },

    sidebarButtonText: {
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },

    sidebarButtonTextActive: {
        color: '#FFFFFF',
    },

    sidebarButtonTextInactive: {
        color: 'rgba(255,255,255,0.35)',
    },

    activeIndicatorSmall: {
        width: 5,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: '#FFFFFF',
        shadowColor: '#FFFFFF',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 3,
    },

    smallBackButton: {
        position: 'absolute',
        bottom: 12,
        left: 16,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },

    permanentPreviewHeader: {
        padding: 16,
        paddingBottom: 0,
        backgroundColor: 'rgba(0,0,0,0.2)',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },

    rightContentScroll: {
        flex: 1,
    },

    rightContentScrollPadding: {
        paddingHorizontal: 20,
        paddingVertical: 16,
    },

    // ========== Phone Preview Styles ==========
    phoneFrameContainer: {
        marginBottom: 20,
    },

    phoneFrameContainerLandscape: {
        marginBottom: 0,
    },

    phoneFrame: {
        backgroundColor: '#1A1A1A',
        borderRadius: 38,
        padding: 6,
        borderWidth: 1.5,
        borderColor: '#333',
        alignSelf: 'center',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOpacity: 0.6,
                shadowRadius: 15,
                shadowOffset: { width: 0, height: 10 },
            },
            android: { elevation: 12 }
        }),
    },

    phoneInternalFrame: {
        backgroundColor: '#000',
        borderRadius: 32,
        overflow: 'hidden',
        position: 'relative',
    },

    previewScroll: {
        flexGrow: 0,
    },

    previewCard: {
        overflow: 'hidden',
    },

    landscapePreview: {
        height: 160,
        flexDirection: 'row',
        position: 'relative',
        backgroundColor: '#000',
    },

    previewGlow: {
        position: 'absolute',
        top: -50,
        left: -50,
        width: 150,
        height: 150,
        borderRadius: 75,
        opacity: 0.15,
        shadowRadius: 100,
        shadowOpacity: 1,
        elevation: 10,
    },

    previewFiller: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: '35%',
    },

    previewLeftSection: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingLeft: 16,
        paddingBottom: 16,
        zIndex: 10,
    },

    previewSliderTrack: {
        width: 32,
        height: 120,
        backgroundColor: 'rgba(255,255,255,0.12)',
        borderRadius: 16,
        alignItems: 'center',
        paddingTop: 4,
        marginRight: 12,
    },

    previewSliderHandle: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOpacity: 0.5,
                shadowRadius: 2,
                shadowOffset: { width: 0, height: 1 },
            },
            android: { elevation: 3 }
        }),
    },

    previewSliderText: {
        fontSize: 7,
        fontWeight: '800',
        marginTop: 6,
        letterSpacing: 0.8,
    },

    previewPlayButton: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },

    previewCancelButton: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },

    previewTimerSection: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingRight: 16,
        paddingTop: 10,
    },

    previewLabelContainer: {
        position: 'absolute',
        top: 24,
        right: 16,
        zIndex: 20,
    },

    labelPill: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 10,
        opacity: 0.9,
    },

    previewTimerLabelAlt: {
        fontSize: 9,
        fontWeight: '900',
        color: '#000',
        letterSpacing: 1.2,
    },

    previewTimerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 15,
    },

    previewTimerText: {
        fontSize: 38,
        fontWeight: '800',
        letterSpacing: -1.8,
        fontVariant: ['tabular-nums'],
    },

    previewTimerTextLandscape: {
        fontSize: 34,
    },

    pagination: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 16,
    },

    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: 'rgba(255,255,255,0.25)',
        marginHorizontal: 5,
    },

    // ========== Color Picker Card Styles ==========
    colorPickerCard: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },

    colorPickerCardLandscape: {
        backgroundColor: 'transparent',
        borderWidth: 0,
        padding: 0,
        paddingHorizontal: 4,
        marginBottom: 8,
    },

    colorPickerHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },

    colorPickerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },

    colorPickerTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.9)',
        marginLeft: 10,
    },

    colorPickerTitleLandscape: {
        fontSize: 13,
        marginLeft: 8,
    },

    currentColorBadge: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.2)',
    },

    colorScrollerContent: {
        paddingRight: 16,
        paddingVertical: 4,
    },

    colorChip: {
        padding: 4,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: 'transparent',
        marginRight: 12,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOpacity: 0.2,
                shadowRadius: 3,
                shadowOffset: { width: 0, height: 2 },
            },
            android: { elevation: 2 }
        }),
    },

    colorChipSelected: {
        borderColor: 'rgba(255,255,255,0.5)',
    },

    colorChipSwatch: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOpacity: 0.3,
                shadowRadius: 3,
                shadowOffset: { width: 0, height: 2 },
            },
        }),
    },

    // ========== Sound Section Styles ==========
    soundSection: {
        marginBottom: 8,
    },

    soundSectionLandscape: {
        marginBottom: 4,
    },

    soundOptionsRow: {
        flexDirection: 'row',
        gap: 12,
    },

    soundCard: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.05)',
        position: 'relative',
    },

    soundCardLandscape: {
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderColor: 'transparent',
        padding: 12,
    },

    soundCardSelected: {
        backgroundColor: 'rgba(255,255,255,0.08)',
    },

    soundIconContainer: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 6,
    },

    soundName: {
        fontSize: 12,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.7)',
        marginBottom: 12,
    },

    previewButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },

    selectedIndicator: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // ========== Repetition Section Styles ==========
    repetitionSection: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },

    repetitionSectionLandscape: {
        backgroundColor: 'transparent',
        borderWidth: 0,
        padding: 0,
        paddingHorizontal: 4,
    },

    repetitionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },

    repetitionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },

    repetitionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.9)',
        marginLeft: 10,
    },

    repetitionValue: {
        fontSize: 16,
        fontWeight: '700',
        color: '#FFFFFF',
    },

    repetitionOptionsRow: {
        flexDirection: 'row',
        gap: 8,
    },

    repetitionPill: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },

    repetitionPillSelected: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },

    repetitionPillText: {
        fontSize: 14,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.6)',
    },

    repetitionPillTextSelected: {
        color: '#FFFFFF',
    },

    // ========== Reset Button Styles ==========
    resetButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        borderRadius: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.3)',
    },

    resetButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#FFFFFF',
        marginLeft: 8,
    },

    landscapeResetButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 14,
        borderRadius: 14,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
        marginTop: 20,
    },

    // ========== About Styles ==========
    aboutCard: {
        padding: 20,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },

    aboutText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 4,
    },

    aboutSubtext: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.5)',
    },

    aboutContainerLandscape: {
        paddingHorizontal: 4,
    },

    aboutHeaderLandscape: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        paddingTop: 4,
    },

    aboutIconContainer: {
        width: 60,
        height: 60,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },

    aboutTextMain: {
        fontSize: 18,
        fontWeight: '800',
        color: '#fff',
        letterSpacing: 0.5,
    },

    aboutTextSub: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.4)',
        marginTop: 2,
    },

    aboutDescription: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.5)',
        lineHeight: 20,
        marginBottom: 24,
        paddingHorizontal: 4,
    },

    aboutDivider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginBottom: 16,
    },

    aboutFooterText: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.3)',
        textAlign: 'center',
    },

    aboutFooterRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 8,
    },

    aboutHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },

    sidebarContent: {
        flex: 1,
    },

    // ========== Category Management Styles ==========
    categoriesSection: {
        flex: 1,
    },

    categoriesHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },

    addCategoryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },

    addCategoryBtnText: {
        fontSize: 10,
        fontWeight: '800',
        color: '#FFFFFF',
        marginLeft: 4,
    },

    categoriesList: {
        // Gap removed to rely on item padding for tighter spacing
    },

    categoryItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 4,
    },

    categoryIconCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },

    categoryInfo: {
        flex: 1,
    },

    categoryNameText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 4,
    },

    categoryColorPill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        alignSelf: 'flex-start',
    },

    colorDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginRight: 6,
    },

    categoryColorText: {
        fontSize: 10,
        fontWeight: '600',
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    },

    categoryActions: {
        flexDirection: 'row',
        gap: 8,
    },

    actionBtn: {
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.03)',
        alignItems: 'center',
        justifyContent: 'center',
    },

    categoryForm: {
        paddingVertical: 8,
    },

    categoryInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },

    inputLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: 'rgba(255,255,255,0.3)',
        letterSpacing: 1,
        marginBottom: 6,
    },

    categoryInput: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },

    iconsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 20,
    },

    iconPickerItem: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1.5,
        borderColor: 'transparent',
    },

    catColorChip: {
        width: 32,
        height: 32,
        borderRadius: 16,
        padding: 3,
        borderWidth: 2,
        borderColor: 'transparent',
        marginRight: 10,
    },

    catColorInner: {
        flex: 1,
        borderRadius: 13,
    },

    categoryFormActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 12,
        marginTop: 24,
    },

    categoryCancelBtn: {
        paddingVertical: 10,
        paddingHorizontal: 16,
    },

    categoryCancelText: {
        fontSize: 12,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.4)',
    },

    categorySaveBtn: {
        backgroundColor: '#FFFFFF',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 12,
    },

    categorySaveText: {
        fontSize: 12,
        fontWeight: '800',
        color: '#000',
    },

    // ========== General/Behavior Styles ==========
    generalTabContainer: {
        flex: 1,
    },

    behaviorList: {
        marginTop: 8,
    },

    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
    },

    settingInfo: {
        flex: 1,
        marginRight: 20,
    },

    settingLabel: {
        fontSize: 14,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 2,
    },

    settingDescription: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.4)',
        lineHeight: 14,
    },

    customSwitch: {
        width: 44,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.1)',
        padding: 2,
    },

    customSwitchActive: {
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
    },

    switchKnob: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,1)',
    },

    switchKnobActive: {
        backgroundColor: '#FFFFFF',
        transform: [{ translateX: 20 }],
    },
});
