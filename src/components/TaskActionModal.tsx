import * as React from 'react';
import { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    TextInput,
    Dimensions,
    Platform,
    KeyboardAvoidingView,
    useWindowDimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Task } from '../constants/data';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface TaskActionModalProps {
    visible: boolean;
    task: Task | null;
    onClose: () => void;
    onDelete: (task: Task) => void;
    onUpdate: (task: Task) => void;
    onAddComment: (task: Task, comment: string) => void;
}

export default function TaskActionModal({
    visible,
    task,
    onClose,
    onDelete,
    onUpdate,
    onAddComment,
}: TaskActionModalProps) {
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const isLandscape = screenWidth > screenHeight;

    const [commentMode, setCommentMode] = useState(false);
    const [commentText, setCommentText] = useState('');

    if (!task) return null;

    const handleCommentSubmit = () => {
        if (commentText.trim()) {
            onAddComment(task, commentText.trim());
            setCommentText('');
            setCommentMode(false);
            onClose();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            supportedOrientations={['portrait', 'landscape']}
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                {Platform.OS !== 'web' && <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />}
                <View style={styles.dimLayer} />

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.keyboardView}
                >
                    <View style={[
                        styles.modal,
                        isLandscape && !commentMode && styles.modalLandscape,
                        commentMode && styles.modalComment
                    ]}>
                        {commentMode ? (
                            <View style={styles.commentContainer}>
                                <View style={styles.header}>
                                    <Text style={styles.commentTitle}>ADD COMMENT</Text>
                                    <TouchableOpacity onPress={() => {
                                        setCommentMode(false);
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    }}>
                                        <MaterialIcons name="close" size={24} color="rgba(255,255,255,0.4)" />
                                    </TouchableOpacity>
                                </View>
                                <TextInput
                                    style={styles.commentInput}
                                    placeholder="Write your comment here..."
                                    placeholderTextColor="rgba(255,255,255,0.3)"
                                    value={commentText}
                                    onChangeText={setCommentText}
                                    multiline
                                    autoFocus
                                />
                                <TouchableOpacity
                                    style={styles.actionBtnPrimary}
                                    onPress={handleCommentSubmit}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.actionBtnTextPrimary}>SAVE COMMENT</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={styles.menuContainer}>
                                <Text style={styles.title}>Task Actions</Text>
                                <Text style={styles.subtitle}>Select an action for this task.</Text>
                                <Text style={styles.taskInfo}>{task.title.toUpperCase()} – {task.isBacklog ? 'BACKLOG' : task.forDate}</Text>

                                <View style={styles.buttonContainer}>
                                    <TouchableOpacity
                                        style={styles.actionBtnPrimary}
                                        onPress={() => {
                                            onUpdate(task);
                                            onClose();
                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={styles.actionBtnTextPrimary}>UPDATE TASK</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={styles.actionBtnSecondary}
                                        onPress={() => {
                                            setCommentMode(true);
                                            setCommentText('');
                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={styles.actionBtnTextSecondary}>ADD COMMENT</Text>
                                    </TouchableOpacity>

                                    <View style={[styles.bottomButtonRow, isLandscape && styles.bottomButtonRowLandscape]}>
                                        <TouchableOpacity
                                            onPress={onClose}
                                            style={styles.cancelBtn}
                                            activeOpacity={0.7}
                                        >
                                            <Text style={styles.cancelText}>CANCEL</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => {
                                                onDelete(task);
                                                onClose();
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                            }}
                                            style={styles.deleteBtn}
                                            activeOpacity={0.7}
                                        >
                                            <Text style={styles.deleteText}>DELETE</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        )}
                    </View>
                </KeyboardAvoidingView>
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
        backgroundColor: 'rgba(0,0,0,0.7)',
    },
    keyboardView: {
        width: '100%',
        alignItems: 'center',
    },
    modal: {
        width: SCREEN_WIDTH * 0.88,
        maxWidth: 380,
        backgroundColor: '#000',
        borderRadius: 32,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        overflow: 'hidden',
    },
    modalLandscape: {
        width: 450,
        maxWidth: '90%',
    },
    modalComment: {
        width: SCREEN_WIDTH * 0.92,
        maxWidth: 400,
    },
    menuContainer: {
        paddingTop: 28,
        paddingBottom: 24,
        paddingHorizontal: 24,
        alignItems: 'center',
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
    taskInfo: {
        fontSize: 12,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.35)',
        textAlign: 'center',
        letterSpacing: 1.5,
        marginBottom: 28,
    },
    buttonContainer: {
        width: '100%',
        gap: 12,
    },
    bottomButtonRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 4,
    },
    bottomButtonRowLandscape: {
        marginTop: 0,
    },
    actionBtnPrimary: {
        width: '100%',
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
        backgroundColor: '#fff',
    },
    actionBtnTextPrimary: {
        fontSize: 13,
        fontWeight: '800',
        color: '#000',
        letterSpacing: 1.5,
    },
    actionBtnSecondary: {
        width: '100%',
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    actionBtnTextSecondary: {
        fontSize: 13,
        fontWeight: '700',
        color: '#fff',
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
    commentContainer: {
        padding: 24,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    commentTitle: {
        fontSize: 14,
        fontWeight: '800',
        color: '#fff',
        letterSpacing: 1.5,
    },
    commentInput: {
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 16,
        padding: 16,
        color: '#fff',
        fontSize: 16,
        minHeight: 120,
        textAlignVertical: 'top',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        marginBottom: 20,
    },
});
