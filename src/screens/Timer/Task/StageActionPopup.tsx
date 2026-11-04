import React, { useRef, useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    Animated,
    useWindowDimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { StageStatus } from '../../../constants/data';

type SyncMode = 'none' | 'all' | 'future';

export interface StageActionPopupProps {
    visible: boolean;
    position: { x: number; y: number };
    onSelectStatus: (status: StageStatus, syncMode: SyncMode) => void;
    onClose: () => void;
    currentStatus: StageStatus;
    showFutureToggle?: boolean;
    initialSyncMode?: SyncMode;
}

const STAGE_STATUS_CONFIG: Record<StageStatus, { icon: keyof typeof MaterialIcons.glyphMap; color: string; label: string }> = {
    Upcoming: { icon: 'schedule', color: '#8E8E93', label: 'Upcoming' },
    Process: { icon: 'play-circle-fill', color: '#FFB74D', label: 'In Process' },
    Done: { icon: 'check-circle', color: '#4CAF50', label: 'Done' },
    Undone: { icon: 'cancel', color: '#FF5252', label: 'Undone' },
};

// Deep style: raised card, status rows with a sunken socket + raised dome (same disc as the timeline bars)
const STATUS_DISC_COLOR: Record<StageStatus, string> = {
    Upcoming: '#9AA1AE',
    Process: '#FFB74D',
    Done: '#7BE18A',
    Undone: '#FF8A8A',
};
const STATUS_DISC_ICON: Record<StageStatus, keyof typeof MaterialIcons.glyphMap> = {
    Upcoming: 'schedule',
    Process: 'schedule',
    Done: 'check',
    Undone: 'close',
};

const stagePopupStyles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    popup: {
        position: 'absolute',
        width: 138,
        padding: 6,
        gap: 2,
        borderRadius: 18,
        backgroundColor: '#14171B',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.7,
        shadowRadius: 18,
        elevation: 24,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -2px 0 rgba(0,0,0,0.35)',
    },
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 32,
        paddingHorizontal: 6,
        borderRadius: 14,
        gap: 8,
    },
    optionActive: {
        backgroundColor: '#1D2128',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.55,
        shadowRadius: 5,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -2px 0 rgba(0,0,0,0.3)',
    },
    socket: {
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.4)',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.65), 0 1px 0 rgba(255,255,255,0.08)',
    },
    dome: {
        width: 17,
        height: 17,
        borderRadius: 8.5,
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -2px 0 rgba(0,0,0,0.25), 0 2px 3px rgba(0,0,0,0.55)',
    },
    optionText: {
        flex: 1,
        fontSize: 11.5,
        fontWeight: '700',
        letterSpacing: 0.2,
        color: 'rgba(255,255,255,0.88)',
    },
    optionTextActive: {
        color: '#FFFFFF',
        fontWeight: '800',
    },
    checkChip: {
        width: 16,
        height: 16,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0B0C0F',
        boxShadow: 'inset 0 2px 3px rgba(0,0,0,0.8)',
    },
    futureToggle: {
        alignItems: 'center',
        marginTop: 2,
        paddingTop: 6,
        paddingBottom: 2,
        borderTopWidth: 2,
        borderTopColor: 'rgba(0,0,0,0.5)',
    },
    syncBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: 14,
        backgroundColor: '#0B0C0F',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8), 0 1px 0 rgba(255,255,255,0.06)',
        gap: 5,
    },
    syncBadgeAll: {
        backgroundColor: '#0D1A2A',
    },
    syncBadgeFuture: {
        backgroundColor: '#0F2214',
    },
    futureToggleText: {
        fontSize: 9,
        color: 'rgba(255,255,255,0.55)',
        fontWeight: '800',
        letterSpacing: 0.6,
    },
    futureToggleActive: {
        color: '#7BE18A',
    },
    futureToggleAll: {
        color: '#64B5F6',
    },
});

export default function StageActionPopup({ visible, position, onSelectStatus, onClose, currentStatus, showFutureToggle, initialSyncMode }: StageActionPopupProps) {
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.8)).current;
    const [syncMode, setSyncMode] = useState<SyncMode>('none');

    useEffect(() => {
        if (visible) {
            setSyncMode(initialSyncMode || 'none');
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 150,
                    useNativeDriver: true,
                }),
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    friction: 8,
                    tension: 100,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            fadeAnim.setValue(0);
            scaleAnim.setValue(0.8);
        }
    }, [visible, fadeAnim, scaleAnim]);

    if (!visible) return null;

    const popupWidth = 138;
    const popupHeight = showFutureToggle ? 186 : 148;
    const padding = 12;

    let adjustedX = position.x - popupWidth / 2;
    let adjustedY = position.y + 10;

    if (adjustedX + popupWidth > screenWidth - padding) {
        adjustedX = screenWidth - popupWidth - padding;
    }
    if (adjustedX < padding) {
        adjustedX = padding;
    }
    if (adjustedY + popupHeight > screenHeight - padding) {
        adjustedY = position.y - popupHeight - 15;
    }
    if (adjustedY < padding) {
        adjustedY = padding;
    }

    const statusOrder: StageStatus[] = ['Upcoming', 'Process', 'Done', 'Undone'];

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            onRequestClose={onClose}
            supportedOrientations={['portrait', 'landscape']}
            statusBarTranslucent={true}
        >
            <TouchableOpacity
                style={stagePopupStyles.overlay}
                activeOpacity={1}
                onPress={onClose}
            >
                <Animated.View
                    style={[
                        stagePopupStyles.popup,
                        {
                            left: adjustedX,
                            top: adjustedY,
                            opacity: fadeAnim,
                            transform: [{ scale: scaleAnim }],
                        },
                    ]}
                >
                    {statusOrder.map((status) => {
                        const config = STAGE_STATUS_CONFIG[status];
                        const isActive = currentStatus === status;
                        return (
                            <TouchableOpacity
                                key={status}
                                style={[
                                    stagePopupStyles.option,
                                    isActive && stagePopupStyles.optionActive,
                                ]}
                                onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    onSelectStatus(status, syncMode);
                                }}
                                activeOpacity={0.7}
                            >
                                <View style={stagePopupStyles.socket}>
                                    <View style={[stagePopupStyles.dome, { backgroundColor: STATUS_DISC_COLOR[status] }]}>
                                        <MaterialIcons name={STATUS_DISC_ICON[status]} size={11} color="#0A0C10" />
                                    </View>
                                </View>
                                <Text style={[stagePopupStyles.optionText, isActive && stagePopupStyles.optionTextActive]}>
                                    {config.label}
                                </Text>
                                {isActive && (
                                    <View style={stagePopupStyles.checkChip}>
                                        <MaterialIcons name="check" size={11} color={STATUS_DISC_COLOR[status]} />
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })}

                    {showFutureToggle && (
                        <View style={stagePopupStyles.futureToggle}>
                            <View style={[
                                stagePopupStyles.syncBadge,
                                syncMode === 'all' && stagePopupStyles.syncBadgeAll,
                                syncMode === 'future' && stagePopupStyles.syncBadgeFuture
                            ]}>
                                <MaterialIcons
                                    name={syncMode === 'all' ? "sync" : syncMode === 'future' ? "update" : "query-builder"}
                                    size={12}
                                    color={syncMode === 'all' ? "#64B5F6" : syncMode === 'future' ? "#7BE18A" : "rgba(255,255,255,0.45)"}
                                />
                                <Text style={[
                                    stagePopupStyles.futureToggleText,
                                    syncMode === 'all' && stagePopupStyles.futureToggleAll,
                                    syncMode === 'future' && stagePopupStyles.futureToggleActive
                                ]}>
                                    {syncMode === 'all' ? 'Sync All' : syncMode === 'future' ? 'Sync Future' : 'Local Only'}
                                </Text>
                            </View>
                        </View>
                    )}
                </Animated.View>
            </TouchableOpacity>
        </Modal>
    );
}
