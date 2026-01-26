import React, { useRef, useEffect } from 'react';
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

export interface StageActionPopupProps {
    visible: boolean;
    position: { x: number; y: number };
    onSelectStatus: (status: StageStatus) => void;
    onClose: () => void;
    currentStatus: StageStatus;
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
});

export default function StageActionPopup({ visible, position, onSelectStatus, onClose, currentStatus }: StageActionPopupProps) {
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.8)).current;

    useEffect(() => {
        if (visible) {
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
    const popupHeight = 180;
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
                                        onSelectStatus(status);
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
                </Animated.View>
            </TouchableOpacity>
        </Modal>
    );
}
