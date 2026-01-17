import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    TextInput,
    Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
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
                            <TouchableOpacity key={preset.value} style={[styles.catColorChip, selectedCategoryColor === preset.value && { borderColor: '#fff' }]} onPress={() => setSelectedCategoryColor(preset.value)}>
                                <View style={[styles.catColorInner, { backgroundColor: preset.value }]} />
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    <View style={styles.categoryFormActions}>
                        <TouchableOpacity style={styles.categoryCancelBtn} onPress={() => setIsAddingCategory(false)}><Text style={styles.categoryCancelText}>CANCEL</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.categorySaveBtn} onPress={handleSaveCategory}><Text style={styles.categorySaveText}>{editingCategory ? 'UPDATE' : 'SAVE'}</Text></TouchableOpacity>
                    </View>
                </View>
            ) : (
                <View style={styles.categoriesList}>
                    {categories.map((cat, index) => (
                        <React.Fragment key={cat.id}>
                            <View style={styles.categoryItem}>
                                <View style={styles.categoryIconCircle}><MaterialIcons name={cat.icon} size={20} color={cat.color} /></View>
                                <View style={styles.categoryInfo}>
                                    <Text style={styles.categoryNameText}>{cat.name}</Text>
                                    <View style={[styles.categoryColorPill, { backgroundColor: `${cat.color}15` }]}>
                                        <View style={[styles.colorDot, { backgroundColor: cat.color }]} /><Text style={[styles.categoryColorText, { color: cat.color }]}>{cat.color}</Text>
                                    </View>
                                </View>
                                <View style={styles.categoryActions}>
                                    <TouchableOpacity style={styles.actionBtn} onPress={() => startEditCategory(cat)}><MaterialIcons name="edit" size={18} color="rgba(255,255,255,0.4)" /></TouchableOpacity>
                                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleDeleteCategory(cat.id)}><MaterialIcons name="delete" size={18} color="#FF3B30" /></TouchableOpacity>
                                </View>
                            </View>
                            {index < categories.length - 1 && <View style={styles.sectionDivider} />}
                        </React.Fragment>
                    ))}
                </View>
            )}
        </View>
    );
}
