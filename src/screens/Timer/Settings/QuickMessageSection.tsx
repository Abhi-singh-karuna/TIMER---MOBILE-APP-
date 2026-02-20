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
import { LinearGradient } from 'expo-linear-gradient';
import Slider from '@react-native-community/slider';
import { QuickMessage, COLOR_PRESETS, QUICK_MESSAGES_KEY } from '../../../constants/data';
import { styles } from './styles';
import { QuickMessageSectionProps } from './types';

// Helper to convert hue (0-360) to Hex (Full Saturation/Value)
const hsvToHex = (h: number) => {
    const hNorm = h / 360;
    const s = 0.85; // Vibrant
    const v = 0.95; // Bright

    let r, g, b;
    let i = Math.floor(hNorm * 6);
    let f = hNorm * 6 - i;
    let p = v * (1 - s);
    let q = v * (1 - s * f);
    let t = v * (1 - s * (1 - f));

    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
        default: r = v, g = t, b = p;
    }

    const toHex = (x: number) => {
        const hex = Math.round(x * 255).toString(16);
        return hex.padStart(2, '0');
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
};

export default function QuickMessageSection({
    isLandscape,
    quickMessages,
    onQuickMessagesChange,
}: QuickMessageSectionProps) {
    const [editingMessage, setEditingMessage] = useState<QuickMessage | null>(null);
    const [isAddingMessage, setIsAddingMessage] = useState(false);
    const [newMessageText, setNewMessageText] = useState('');
    const [selectedMessageColor, setSelectedMessageColor] = useState('#00E5FF');
    const [messageHue, setMessageHue] = useState(190); // Default cyan hue
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
                { id: Date.now().toString(), text: newMessageText, color: selectedMessageColor, isEnabled: true },
            ];
        }

        const sortedMessages = [...updatedMessages].sort((a, b) => {
            if (a.isEnabled === false && b.isEnabled !== false) return 1;
            if (a.isEnabled !== false && b.isEnabled === false) return -1;
            return 0;
        });

        onQuickMessagesChange(sortedMessages);
        setIsAddingMessage(false);
        setEditingMessage(null);
        setNewMessageText('');
        AsyncStorage.setItem(QUICK_MESSAGES_KEY, JSON.stringify(sortedMessages)).catch((err) => console.error(err));
    };

    const handleToggleMessage = async (id: string) => {
        const updatedMessages = quickMessages.map(msg =>
            msg.id === id ? { ...msg, isEnabled: msg.isEnabled === false ? true : false } : msg
        );

        const sortedMessages = [...updatedMessages].sort((a, b) => {
            if (a.isEnabled === false && b.isEnabled !== false) return 1;
            if (a.isEnabled !== false && b.isEnabled === false) return -1;
            return 0;
        });

        onQuickMessagesChange(sortedMessages);
        try {
            await AsyncStorage.setItem(QUICK_MESSAGES_KEY, JSON.stringify(sortedMessages));
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } catch (err) { console.error(err); }
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
        setMessageHue(0); // Approximate
        setIsAddingMessage(true);
    };

    const startAddMessage = () => {
        setEditingMessage(null);
        setNewMessageText('');
        setSelectedMessageColor('#00E5FF');
        setMessageHue(190);
        setIsAddingMessage(true);
    };

    return (
        <View style={styles.categoriesSection}>
            <View style={[styles.categoriesHeader, isLandscape && { marginTop: 4, marginBottom: 12 }]}>
                <Text style={isLandscape ? [styles.sectionTitleLandscape, { marginBottom: 0 }] : styles.sectionTitle}>
                    QUICK MESSAGES
                </Text>
                <TouchableOpacity style={styles.addCategoryBtn} onPress={startAddMessage}>
                    <MaterialIcons name="add" size={20} color="#FFFFFF" /><Text style={styles.addCategoryBtnText}>ADD NEW</Text>
                </TouchableOpacity>
            </View>
            {isAddingMessage ? (
                <View style={styles.categoryForm}>
                    <View style={styles.categoryInputContainer}>
                        <View style={[styles.categoryIconCircle, { backgroundColor: '#000', borderColor: `${selectedMessageColor}40` }]}>
                            <MaterialIcons name="chat-bubble-outline" size={18} color={selectedMessageColor} />
                        </View>
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
                    <View style={[styles.sliderContainer, { marginTop: 8, marginBottom: 16 }]}>
                        <View style={styles.sliderTrackBg}>
                            <LinearGradient
                                colors={['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000']}
                                start={{ x: 0, y: 0.5 }}
                                end={{ x: 1, y: 0.5 }}
                                style={styles.hueGradient}
                            />
                            <View style={styles.sliderTrenchShadow} />
                        </View>
                        <Slider
                            style={styles.hueSlider}
                            minimumValue={0}
                            maximumValue={360}
                            step={1}
                            value={messageHue}
                            onValueChange={(val) => {
                                setMessageHue(val);
                                setSelectedMessageColor(hsvToHex(val));
                            }}
                            minimumTrackTintColor="transparent"
                            maximumTrackTintColor="transparent"
                            thumbTintColor="#fff"
                        />
                    </View>
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
                            <View style={[
                                styles.settingsCardBezelExtraSmall,
                                { backgroundColor: `${msg.color}10` },
                                isActive && [
                                    styles.categoryBezelDragging,
                                    {
                                        backgroundColor: `${msg.color}25`,
                                        borderColor: msg.color,
                                        overflow: 'visible',
                                        zIndex: 1000,
                                        shadowColor: msg.color,
                                        shadowOpacity: 0.8,
                                        shadowRadius: 20,
                                        shadowOffset: { width: 0, height: 12 }
                                    }
                                ]
                            ]}>
                                <View style={[styles.settingsCardTrackUnified, isActive && { overflow: 'visible' }]}>
                                    <View style={[
                                        styles.categoryCardItem,
                                        isActive && styles.categoryCardDragging,
                                        msg.isEnabled === false && { opacity: 0.4 }
                                    ]}>
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
                                                size={18}
                                                color={isActive ? '#FFFFFF' : 'rgba(255,255,255,0.25)'}
                                            />
                                        </TouchableOpacity>
                                        <View style={[styles.categoryOrderCircle, { backgroundColor: '#000', borderColor: `${msg.color}40` }]}>
                                            <Text style={[styles.categoryOrderText, isActive && styles.categoryOrderTextDragging, { color: msg.color }]}>
                                                {orderNumber}
                                            </Text>
                                        </View>
                                        <View style={[styles.categoryIconCircle, { backgroundColor: '#000', borderColor: `${msg.color}30` }]}>
                                            <MaterialIcons name="chat-bubble-outline" size={18} color={msg.color} />
                                        </View>
                                        <View style={styles.categoryInfo}>
                                            <Text style={[styles.categoryCardName, isActive && styles.categoryCardNameDragging]} numberOfLines={1}>
                                                {msg.text}
                                            </Text>
                                        </View>
                                        <View style={styles.categoryActions}>
                                            <TouchableOpacity
                                                onPress={() => {
                                                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                                    handleToggleMessage(msg.id);
                                                }}
                                                style={[
                                                    styles.customSwitch,
                                                    {
                                                        marginRight: 8,
                                                        scaleX: 0.85,
                                                        scaleY: 0.85,
                                                        backgroundColor: msg.isEnabled !== false ? `${msg.color}25` : 'rgba(255,255,255,0.06)',
                                                        borderColor: msg.isEnabled !== false ? `${msg.color}40` : 'rgba(255,255,255,0.1)',
                                                        borderWidth: 1.5,
                                                        padding: 0,
                                                        justifyContent: 'center',
                                                        paddingHorizontal: 2,
                                                    }
                                                ]}
                                                disabled={isActive}
                                            >
                                                <View style={[
                                                    styles.switchKnob,
                                                    msg.isEnabled !== false ? {
                                                        backgroundColor: msg.color,
                                                        transform: [{ translateX: 18 }],
                                                        shadowColor: msg.color,
                                                        shadowOpacity: 1,
                                                        shadowRadius: 8,
                                                        shadowOffset: { width: 0, height: 0 },
                                                        elevation: 8,
                                                    } : {
                                                        backgroundColor: 'rgba(255,255,255,0.3)',
                                                        transform: [{ translateX: 0 }],
                                                    }
                                                ]} />
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.actionBtn, { backgroundColor: 'transparent', borderWidth: 0 }]}
                                                onPress={() => startEditMessage(msg)}
                                                disabled={isActive}
                                                activeOpacity={0.7}
                                            >
                                                <MaterialIcons name="edit" size={16} color={isActive ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.5)'} />
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.categoryCardDeleteBtn, { backgroundColor: 'transparent', borderWidth: 0 }]}
                                                onPress={() => handleDeleteMessage(msg.id)}
                                                disabled={isActive}
                                                activeOpacity={0.7}
                                            >
                                                <MaterialIcons name="delete-outline" size={16} color="#FF3B30" />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </View>
                                <View style={[
                                    styles.settingsCardOuterGlowExtraSmall,
                                    isActive && {
                                        shadowOpacity: 1,
                                        shadowRadius: 35,
                                        shadowColor: msg.color,
                                        opacity: 1,
                                        backgroundColor: `${msg.color}15`
                                    }
                                ]} pointerEvents="none" />
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
