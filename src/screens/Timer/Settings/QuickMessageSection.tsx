import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    TextInput,
    Alert,
    LayoutAnimation,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { QuickMessage, COLOR_PRESETS, QUICK_MESSAGES_KEY } from '../../../constants/data';
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
    const [data, setData] = useState<QuickMessage[]>(quickMessages);

    useEffect(() => {
        setData(quickMessages);
    }, [quickMessages]);

    const handleSaveMessage = () => {
        if (!newMessageText.trim()) return;
        let updatedMessages: QuickMessage[];
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
                    AsyncStorage.setItem(QUICK_MESSAGES_KEY, JSON.stringify(updatedMessages)).catch((err) => console.error(err));
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
                                key={preset.hex}
                                style={[styles.catColorChip, selectedMessageColor === preset.hex && { borderColor: '#fff' }]}
                                onPress={() => setSelectedMessageColor(preset.hex)}
                            >
                                <View style={[styles.catColorInner, { backgroundColor: preset.hex }]} />
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    <View style={styles.categoryFormActions}>
                        <TouchableOpacity style={styles.categoryCancelBtn} onPress={() => setIsAddingMessage(false)}><Text style={styles.categoryCancelText}>CANCEL</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.categorySaveBtn} onPress={handleSaveMessage}><Text style={styles.categorySaveText}>{editingMessage ? 'UPDATE' : 'SAVE'}</Text></TouchableOpacity>
                    </View>
                </View>
            ) : (
                <DraggableFlatList
                    data={data}
                    keyExtractor={(item) => item.id}
                    scrollEnabled={false}
                    renderItem={({ item: msg, drag, isActive, getIndex }: RenderItemParams<QuickMessage>) => {
                        const index = getIndex?.() ?? 0;
                        const orderNumber = index + 1;
                        return (
                            <View style={[styles.categoryCardItem, isActive && styles.categoryCardDragging]}>
                                <TouchableOpacity
                                    style={styles.categoryCardDragHandle}
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
                                        color={isActive ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.3)'}
                                    />
                                </TouchableOpacity>
                                <View style={[styles.categoryOrderCircle, isActive && { backgroundColor: 'rgba(0,0,0,0.08)', borderColor: 'rgba(0,0,0,0.15)' }]}>
                                    <Text style={[styles.categoryOrderText, isActive && styles.categoryOrderTextDragging]}>
                                        {orderNumber}
                                    </Text>
                                </View>
                                <View style={[styles.categoryIconCircle, { backgroundColor: `${msg.color}20` }]}>
                                    <MaterialIcons name="chat-bubble" size={18} color={msg.color} />
                                </View>
                                <View style={styles.categoryInfo}>
                                    <Text style={[styles.categoryCardName, { color: msg.color }, isActive && styles.categoryCardNameDragging]} numberOfLines={1}>
                                        {msg.text}
                                    </Text>
                                    <View style={[styles.categoryColorPill, { backgroundColor: `${msg.color}15` }]}>
                                        <View style={[styles.colorDot, { backgroundColor: msg.color }]} />
                                        <Text style={[styles.categoryColorText, { color: msg.color }]}>{msg.color}</Text>
                                    </View>
                                </View>
                                <View style={styles.categoryActions}>
                                    <TouchableOpacity
                                        style={styles.actionBtn}
                                        onPress={() => startEditMessage(msg)}
                                        disabled={isActive}
                                        activeOpacity={0.7}
                                    >
                                        <MaterialIcons name="edit" size={18} color={isActive ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)'} />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.categoryCardDeleteBtn}
                                        onPress={() => handleDeleteMessage(msg.id)}
                                        disabled={isActive}
                                        activeOpacity={0.7}
                                    >
                                        <MaterialIcons name="delete-outline" size={16} color={isActive ? 'rgba(0,0,0,0.25)' : '#FF3B30'} />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        );
                    }}
                    onDragBegin={() => {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    }}
                    onDragEnd={({ data: next }) => {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        setData(next);
                        onQuickMessagesChange(next);
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        AsyncStorage.setItem(QUICK_MESSAGES_KEY, JSON.stringify(next)).catch((err) => console.error(err));
                    }}
                    autoscrollThreshold={80}
                    autoscrollSpeed={90}
                    activationDistance={12}
                    nestedScrollEnabled={true}
                    showsVerticalScrollIndicator={true}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{ paddingBottom: 40 }}
                />
            )}
        </View>
    );
}
