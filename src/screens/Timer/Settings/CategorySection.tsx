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
import { Category, CATEGORIES_KEY, COLOR_PRESETS } from '../../../constants/data';
import { styles } from './styles';
import { CategorySectionProps, CATEGORY_ICONS } from './types';

export default function CategorySection({
    isLandscape,
    categories,
    onCategoriesChange,
}: CategorySectionProps) {
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [selectedCategoryColor, setSelectedCategoryColor] = useState('#FFFFFF');
    const [selectedCategoryIcon, setSelectedCategoryIcon] = useState<keyof typeof MaterialIcons.glyphMap>('category');
    const [data, setData] = useState<Category[]>(categories);

    useEffect(() => {
        setData(categories);
    }, [categories]);

    const handleSaveCategory = async () => {
        if (!newCategoryName.trim()) return;
        let updatedCategories;
        if (editingCategory) {
            updatedCategories = categories.map(cat => cat.id === editingCategory.id ? { ...cat, name: newCategoryName, color: selectedCategoryColor, icon: selectedCategoryIcon } : cat);
        } else {
            updatedCategories = [...categories, { id: Date.now().toString(), name: newCategoryName, color: selectedCategoryColor, icon: selectedCategoryIcon }];
        }
        onCategoriesChange(updatedCategories);
        try {
            await AsyncStorage.setItem(CATEGORIES_KEY, JSON.stringify(updatedCategories));
            setIsAddingCategory(false);
            setEditingCategory(null);
            setNewCategoryName('');
        } catch (err) { console.error(err); }
    };

    const handleDeleteCategory = (id: string) => {
        Alert.alert("Delete Category", "Are you sure you want to delete this category?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete", style: "destructive", onPress: async () => {
                    const updatedCategories = categories.filter(cat => cat.id !== id);
                    onCategoriesChange(updatedCategories);
                    try { await AsyncStorage.setItem(CATEGORIES_KEY, JSON.stringify(updatedCategories)); } catch (err) { console.error(err); }
                }
            }
        ]);
    };

    const startEditCategory = (cat: Category) => {
        setEditingCategory(cat);
        setNewCategoryName(cat.name);
        setSelectedCategoryColor(cat.color);
        setSelectedCategoryIcon(cat.icon);
        setIsAddingCategory(true);
    };

    const startAddCategory = () => {
        setEditingCategory(null);
        setNewCategoryName('');
        setSelectedCategoryColor('#FFFFFF');
        setSelectedCategoryIcon('category');
        setIsAddingCategory(true);
    };

    return (
        <View style={styles.categoriesSection}>
            <View style={[styles.categoriesHeader, isLandscape && { marginTop: 4, marginBottom: 12 }]}>
                <Text style={isLandscape ? [styles.sectionTitleLandscape, { marginBottom: 0 }] : styles.inputLabel}>
                    MANAGE CATEGORIES
                </Text>
                <TouchableOpacity style={styles.addCategoryBtn} onPress={startAddCategory}>
                    <MaterialIcons name="add" size={20} color="#FFFFFF" /><Text style={styles.addCategoryBtnText}>ADD NEW</Text>
                </TouchableOpacity>
            </View>
            {isAddingCategory ? (
                <View style={styles.categoryForm}>
                    <View style={styles.categoryInputContainer}>
                        <MaterialIcons name={selectedCategoryIcon} size={20} color={selectedCategoryColor} />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={styles.inputLabel}>CATEGORY NAME</Text>
                            <TextInput style={styles.categoryInput} value={newCategoryName} onChangeText={setNewCategoryName} placeholder="Enter name..." placeholderTextColor="rgba(255,255,255,0.2)" autoFocus />
                        </View>
                    </View>
                    <Text style={styles.inputLabel}>SELECT ICON</Text>
                    <View style={styles.iconsGrid}>
                        {CATEGORY_ICONS.map(icon => (
                            <TouchableOpacity key={icon} style={[styles.iconPickerItem, selectedCategoryIcon === icon && { backgroundColor: `${selectedCategoryColor}30`, borderColor: selectedCategoryColor }]} onPress={() => setSelectedCategoryIcon(icon)}>
                                <MaterialIcons name={icon} size={20} color={selectedCategoryIcon === icon ? selectedCategoryColor : 'rgba(255,255,255,0.4)'} />
                            </TouchableOpacity>
                        ))}
                    </View>
                    <Text style={styles.inputLabel}>PICK COLOR</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 8 }}>
                        {COLOR_PRESETS.map(preset => (
                            <TouchableOpacity key={preset.hex} style={[styles.catColorChip, selectedCategoryColor === preset.hex && { borderColor: '#fff' }]} onPress={() => setSelectedCategoryColor(preset.hex)}>
                                <View style={[styles.catColorInner, { backgroundColor: preset.hex }]} />
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    <View style={styles.categoryFormActions}>
                        <TouchableOpacity style={styles.categoryCancelBtn} onPress={() => setIsAddingCategory(false)}><Text style={styles.categoryCancelText}>CANCEL</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.categorySaveBtn} onPress={handleSaveCategory}><Text style={styles.categorySaveText}>{editingCategory ? 'UPDATE' : 'SAVE'}</Text></TouchableOpacity>
                    </View>
                </View>
            ) : (
                <DraggableFlatList
                    data={data}
                    keyExtractor={(item) => item.id}
                    scrollEnabled={false}
                    renderItem={({ item: cat, drag, isActive, getIndex }: RenderItemParams<Category>) => {
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
                                <View style={styles.categoryIconCircle}>
                                    <MaterialIcons name={cat.icon} size={20} color={cat.color} />
                                </View>
                                <View style={styles.categoryInfo}>
                                    <Text style={[styles.categoryCardName, isActive && styles.categoryCardNameDragging]} numberOfLines={1}>
                                        {cat.name}
                                    </Text>
                                    <View style={[styles.categoryColorPill, { backgroundColor: `${cat.color}15` }]}>
                                        <View style={[styles.colorDot, { backgroundColor: cat.color }]} />
                                        <Text style={[styles.categoryColorText, { color: cat.color }]}>{cat.color}</Text>
                                    </View>
                                </View>
                                <View style={styles.categoryActions}>
                                    <TouchableOpacity
                                        style={styles.actionBtn}
                                        onPress={() => startEditCategory(cat)}
                                        disabled={isActive}
                                        activeOpacity={0.7}
                                    >
                                        <MaterialIcons name="edit" size={18} color={isActive ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)'} />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.categoryCardDeleteBtn}
                                        onPress={() => handleDeleteCategory(cat.id)}
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
                        onCategoriesChange(next);
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        AsyncStorage.setItem(CATEGORIES_KEY, JSON.stringify(next)).catch((err) => console.error(err));
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
