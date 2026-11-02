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

const stagePopupStyles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    popup: {
        position: 'absolute',
        backgroundColor: 'rgba(30, 30, 30, 0.98)',
        borderRadius: 14,
        paddingVertical: 6,
        minWidth: 140,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 10,
        gap: 10,
    },
    optionActive: {
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    optionText: {
        fontSize: 13,
        fontWeight: '600',
    },
    separator: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.08)',
        marginHorizontal: 10,
    },
    futureToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        gap: 6,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.06)',
        marginTop: 4,
    },
    syncBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 0.5,
        borderColor: 'rgba(255,255,255,0.1)',
        gap: 5,
    },
    syncBadgeAll: {
        backgroundColor: 'rgba(33, 150, 243, 0.08)',
        borderColor: 'rgba(33, 150, 243, 0.2)',
    },
    syncBadgeFuture: {
        backgroundColor: 'rgba(76, 175, 80, 0.08)',
        borderColor: 'rgba(76, 175, 80, 0.2)',
    },
    futureToggleText: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.4)',
        fontWeight: '700',
        letterSpacing: 0.2,
    },
    futureToggleActive: {
        color: '#4CAF50',
    },
    futureToggleAll: {
        color: '#2196F3',
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

    const popupWidth = 140;
    const popupHeight = showFutureToggle ? 220 : 180;
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
                    {statusOrder.map((status, index) => {
                        const config = STAGE_STATUS_CONFIG[status];
                        const isActive = currentStatus === status;
                        return (
                            <React.Fragment key={status}>
                                {index > 0 && <View style={stagePopupStyles.separator} />}
                                <TouchableOpacity
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
                                    <MaterialIcons name={config.icon} size={18} color={config.color} />
                                    <Text style={[stagePopupStyles.optionText, { color: config.color }]}>
                                        {config.label}
                                    </Text>
                                    {isActive && (
                                        <MaterialIcons
                                            name="check"
                                            size={16}
                                            color={config.color}
                                            style={{ marginLeft: 'auto' }}
                                        />
                                    )}
                                </TouchableOpacity>
                            </React.Fragment>
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
                                    color={syncMode === 'all' ? "#2196F3" : syncMode === 'future' ? "#4CAF50" : "rgba(255,255,255,0.4)"}
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
