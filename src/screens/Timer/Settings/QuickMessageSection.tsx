import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    TextInput,
    Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { QuickMessage, COLOR_PRESETS } from '../../../constants/data';
import { styles } from './styles';
import { QuickMessageSectionProps } from './types';

export default function QuickMessageSection({
    isLandscape,
    quickMessages,
    onQuickMessagesChange,
}: QuickMessageSectionProps) {
    const [editingMessage, setEditingMessage] = useState<QuickMessage | null>(null);
    const [isAddingMessage, setIsAddingMessage] = useState(false);
    const [newMessageText, setNewMessageText] = useState('');
    const [selectedMessageColor, setSelectedMessageColor] = useState('#00E5FF');

    const handleSaveMessage = () => {
        if (!newMessageText.trim()) return;
        let updatedMessages;
        if (editingMessage) {
            updatedMessages = quickMessages.map(msg =>
                msg.id === editingMessage.id
                    ? { ...msg, text: newMessageText, color: selectedMessageColor }
                    : msg
            );
        } else {
            updatedMessages = [
                ...quickMessages,
                { id: Date.now().toString(), text: newMessageText, color: selectedMessageColor },
            ];
        }
        onQuickMessagesChange(updatedMessages);
        setIsAddingMessage(false);
        setEditingMessage(null);
        setNewMessageText('');
    };

    const handleDeleteMessage = (id: string) => {
        Alert.alert("Delete Message", "Are you sure you want to delete this quick message?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete", style: "destructive", onPress: () => {
                    const updatedMessages = quickMessages.filter(msg => msg.id !== id);
                    onQuickMessagesChange(updatedMessages);
                }
            }
        ]);
    };

    const startEditMessage = (msg: QuickMessage) => {
        setEditingMessage(msg);
        setNewMessageText(msg.text);
        setSelectedMessageColor(msg.color);
        setIsAddingMessage(true);
    };

    const startAddMessage = () => {
        setEditingMessage(null);
        setNewMessageText('');
        setSelectedMessageColor('#00E5FF');
        setIsAddingMessage(true);
    };

    return (
        <View style={styles.categoriesSection}>
            <View style={[styles.categoriesHeader, isLandscape && { marginTop: 4, marginBottom: 12 }]}>
                <Text style={isLandscape ? [styles.sectionTitleLandscape, { marginBottom: 0 }] : styles.inputLabel}>
                    QUICK MESSAGES
                </Text>
                <TouchableOpacity style={styles.addCategoryBtn} onPress={startAddMessage}>
                    <MaterialIcons name="add" size={20} color="#FFFFFF" /><Text style={styles.addCategoryBtnText}>ADD NEW</Text>
                </TouchableOpacity>
            </View>
            {isAddingMessage ? (
                <View style={styles.categoryForm}>
                    <View style={styles.categoryInputContainer}>
                        <View style={[styles.colorDot, { backgroundColor: selectedMessageColor, width: 24, height: 24, borderRadius: 12 }]} />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={styles.inputLabel}>MESSAGE TEXT</Text>
                            <TextInput
                                style={styles.categoryInput}
                                value={newMessageText}
                                onChangeText={setNewMessageText}
                                placeholder="Enter message..."
                                placeholderTextColor="rgba(255,255,255,0.2)"
                                autoFocus
                            />
                        </View>
                    </View>
                    <Text style={styles.inputLabel}>PICK COLOR</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 8 }}>
                        {COLOR_PRESETS.map(preset => (
                            <TouchableOpacity
                                key={preset.value}
                                style={[styles.catColorChip, selectedMessageColor === preset.value && { borderColor: '#fff' }]}
                                onPress={() => setSelectedMessageColor(preset.value)}
                            >
                                <View style={[styles.catColorInner, { backgroundColor: preset.value }]} />
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    <View style={styles.categoryFormActions}>
                        <TouchableOpacity style={styles.categoryCancelBtn} onPress={() => setIsAddingMessage(false)}><Text style={styles.categoryCancelText}>CANCEL</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.categorySaveBtn} onPress={handleSaveMessage}><Text style={styles.categorySaveText}>{editingMessage ? 'UPDATE' : 'SAVE'}</Text></TouchableOpacity>
                    </View>
                </View>
            ) : (
                <View style={styles.categoriesList}>
                    {quickMessages.map((msg, index) => (
                        <React.Fragment key={msg.id}>
                            <View style={styles.categoryItem}>
                                <View style={[styles.categoryIconCircle, { backgroundColor: `${msg.color}20` }]}>
                                    <MaterialIcons name="chat-bubble" size={18} color={msg.color} />
                                </View>
                                <View style={styles.categoryInfo}>
                                    <Text style={[styles.categoryNameText, { color: msg.color }]}>{msg.text}</Text>
                                    <View style={[styles.categoryColorPill, { backgroundColor: `${msg.color}15` }]}>
                                        <View style={[styles.colorDot, { backgroundColor: msg.color }]} /><Text style={[styles.categoryColorText, { color: msg.color }]}>{msg.color}</Text>
                                    </View>
                                </View>
                                <View style={styles.categoryActions}>
                                    <TouchableOpacity style={styles.actionBtn} onPress={() => startEditMessage(msg)}><MaterialIcons name="edit" size={18} color="rgba(255,255,255,0.4)" /></TouchableOpacity>
                                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleDeleteMessage(msg.id)}><MaterialIcons name="delete" size={18} color="#FF3B30" /></TouchableOpacity>
                                </View>
                            </View>
                            {index < quickMessages.length - 1 && <View style={styles.sectionDivider} />}
                        </React.Fragment>
                    ))}
                </View>
            )}
        </View>
    );
}
