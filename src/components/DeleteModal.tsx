import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    Platform,
    Dimensions,
    useWindowDimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Timer } from '../constants/data';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface DeleteModalProps {
    visible: boolean;
    timer: Timer | null;
    onCancel: () => void;
    onReset: () => void;
    onUpdate: () => void;
    onDelete: () => void;
    onPin: (timer: Timer) => void;
}

export default function DeleteModal({ visible, timer, onCancel, onReset, onUpdate, onDelete, onPin }: DeleteModalProps) {
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const isLandscape = screenWidth > screenHeight;
    if (!timer) return null;

    const handleDelete = () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        onDelete();
    };

    const handleCancel = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onCancel();
    };

    const handlePin = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPin(timer);
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            supportedOrientations={['portrait', 'landscape']}
            onRequestClose={handleCancel}
        >
            <View style={styles.overlay}>
                {Platform.OS !== 'web' && <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />}
                <View style={styles.dimLayer} />

                <View style={[styles.modal, isLandscape && styles.modalLandscape]}>
                    {/* Title */}
                    <Text style={styles.title}>Timer Actions</Text>

                    {/* Subtitle */}
                    <Text style={styles.subtitle}>Select an action for this timer.</Text>
                    <Text style={styles.timerInfo}>{timer.title.toUpperCase()} – {timer.total}</Text>

                    {/* Buttons */}
                    <View style={styles.buttonContainer}>
                        <TouchableOpacity
                            onPress={handlePin}
                            style={styles.pinBtn}
                            activeOpacity={0.7}
                        >
                            <View style={styles.pinBtnContent}>
                                <MaterialIcons
                                    name={timer.isPinned ? "push-pin" : "push-pin"}
                                    size={18}
                                    color="#fff"
                                    style={{ transform: [{ rotate: timer.isPinned ? '0deg' : '45deg' }] }}
                                />
                                <Text style={[styles.pinBtnText, timer.isPinned && { color: '#fff' }]}>
                                    {timer.isPinned ? 'UNPIN TIMER' : 'PIN TIMER'}
                                </Text>
                            </View>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                onUpdate();
                            }}
                            style={styles.updateOptionBtn}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.updateOptionText}>UPDATE TIMER</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                onReset();
                            }}
                            style={styles.resetBtn}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.resetText}>RESET TIMER</Text>
                        </TouchableOpacity>

                        <View style={[styles.buttonRow, isLandscape && styles.buttonRowLandscape]}>
                            <TouchableOpacity onPress={handleCancel} style={styles.cancelBtn} activeOpacity={0.7}>
                                <Text style={styles.cancelText}>CANCEL</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn} activeOpacity={0.7}>
                                <Text style={styles.deleteText}>DELETE</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    dimLayer: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.8)',
    },

    modal: {
        width: SCREEN_WIDTH * 0.85,
        maxWidth: 380,
        backgroundColor: '#000000',
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        paddingTop: 28,
        paddingBottom: 24,
        paddingHorizontal: 24,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOpacity: 0.5,
                shadowRadius: 30,
                shadowOffset: { width: 0, height: 15 },
            },
        }),
    },

    modalLandscape: {
        width: '70%',
        maxWidth: 500,
        paddingTop: 20,
        paddingBottom: 20,
    },

    buttonContainer: {
        width: '100%',
        gap: 12,
    },

    buttonRowLandscape: {
        marginTop: 0,
    },

    title: {
        fontSize: 24,
        fontWeight: '600',
        color: '#fff',
        textAlign: 'center',
        marginBottom: 12,
    },

    subtitle: {
        fontSize: 15,
        color: 'rgba(255,255,255,0.6)',
        textAlign: 'center',
        marginBottom: 4,
    },

    timerInfo: {
        fontSize: 12,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.35)',
        textAlign: 'center',
        letterSpacing: 1.5,
        marginBottom: 28,
    },

    buttonRow: {
        flexDirection: 'row',
        gap: 12,
    },

    pinBtn: {
        width: '100%',
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },

    pinBtnContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },

    pinBtnText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#fff',
        letterSpacing: 1.5,
    },

    resetBtn: {
        width: '100%',
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },

    resetText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#fff',
        letterSpacing: 1.5,
    },

    updateOptionBtn: {
        width: '100%',
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
        backgroundColor: '#fff',
    },

    updateOptionText: {
        fontSize: 13,
        fontWeight: '800',
        color: '#000',
        letterSpacing: 1.5,
    },

    cancelBtn: {
        flex: 1,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.15)',
        paddingVertical: 14,
        alignItems: 'center',
    },

    cancelText: {
        fontSize: 13,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.6)',
        letterSpacing: 1.5,
    },

    deleteBtn: {
        flex: 1,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: 'rgba(255,60,80,0.5)',
        paddingVertical: 14,
        alignItems: 'center',
    },

    deleteText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#FF3C50',
        letterSpacing: 1.5,
    },
});
