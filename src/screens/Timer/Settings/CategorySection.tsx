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
import { Category, CATEGORIES_KEY, COLOR_PRESETS } from '../../../constants/data';
import { styles } from './styles';
import { CategorySectionProps, CATEGORY_ICONS } from './types';

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

export default function CategorySection({
    isLandscape,
    categories,
    onCategoriesChange,
}: CategorySectionProps) {
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [selectedCategoryColor, setSelectedCategoryColor] = useState('#FFFFFF');
    const [categoryHue, setCategoryHue] = useState(0);
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
            updatedCategories = [...categories, { id: Date.now().toString(), name: newCategoryName, color: selectedCategoryColor, icon: selectedCategoryIcon, isEnabled: true }];
        }

        // Sort: enabled (undefined or true) first, then disabled (false).
        const sortedCategories = [...updatedCategories].sort((a, b) => {
            if (a.isEnabled === false && b.isEnabled !== false) return 1;
            if (a.isEnabled !== false && b.isEnabled === false) return -1;
            return 0;
        });

        onCategoriesChange(sortedCategories);
        try {
            await AsyncStorage.setItem(CATEGORIES_KEY, JSON.stringify(sortedCategories));
            setIsAddingCategory(false);
            setEditingCategory(null);
            setNewCategoryName('');
        } catch (err) { console.error(err); }
    };

    const handleToggleCategory = async (id: string) => {
        const updatedCategories = categories.map(cat =>
            cat.id === id ? { ...cat, isEnabled: cat.isEnabled === false ? true : false } : cat
        );

        // Sort: enabled (undefined or true) first, then disabled (false).
        const sortedCategories = [...updatedCategories].sort((a, b) => {
            if (a.isEnabled === false && b.isEnabled !== false) return 1;
            if (a.isEnabled !== false && b.isEnabled === false) return -1;
            return 0;
        });

        onCategoriesChange(sortedCategories);
        try {
            await AsyncStorage.setItem(CATEGORIES_KEY, JSON.stringify(sortedCategories));
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
        // Try to estimate hue from hex (approximation for the slider)
        setCategoryHue(0);
        setSelectedCategoryIcon(cat.icon);
        setIsAddingCategory(true);
    };

    const startAddCategory = () => {
        setEditingCategory(null);
        setNewCategoryName('');
        setSelectedCategoryColor('#FFFFFF');
        setCategoryHue(0);
        setSelectedCategoryIcon('category');
        setIsAddingCategory(true);
    };

    return (
        <View style={styles.categoriesSection}>
            <View style={[styles.categoriesHeader, isLandscape && { marginTop: 4, marginBottom: 12 }]}>
                <Text style={isLandscape ? [styles.sectionTitleLandscape, { marginBottom: 0 }] : styles.sectionTitle}>
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
                                <MaterialIcons name={icon} size={16} color={selectedCategoryIcon === icon ? selectedCategoryColor : 'rgba(255,255,255,0.4)'} />
                            </TouchableOpacity>
                        ))}
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
                            value={categoryHue}
                            onValueChange={(val) => {
                                setCategoryHue(val);
                                setSelectedCategoryColor(hsvToHex(val));
                            }}
                            minimumTrackTintColor="transparent"
                            maximumTrackTintColor="transparent"
                            thumbTintColor="#fff"
                        />
                    </View>
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
                            <View style={[
                                styles.settingsCardBezelExtraSmall,
                                { backgroundColor: `${cat.color}10` }, // Soft glassmorphic tint
                                isActive && [
                                    styles.categoryBezelDragging,
                                    {
                                        backgroundColor: `${cat.color}25`,
                                        borderColor: cat.color,
                                        overflow: 'visible',
                                        zIndex: 1000,
                                        // Themed shadow for iOS
                                        shadowColor: cat.color,
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
                                        cat.isEnabled === false && { opacity: 0.4 }
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
                                        <View style={[styles.categoryOrderCircle, { backgroundColor: '#000000', borderColor: `${cat.color}40` }]}>
                                            <Text style={[styles.categoryOrderText, isActive && styles.categoryOrderTextDragging, { color: cat.color }]}>
                                                {orderNumber}
                                            </Text>
                                        </View>
                                        <View style={[styles.categoryIconCircle, { backgroundColor: '#000000', borderColor: `${cat.color}30` }]}>
                                            <MaterialIcons name={cat.icon} size={18} color={cat.color} />
                                        </View>
                                        <View style={styles.categoryInfo}>
                                            <Text style={[styles.categoryCardName, isActive && styles.categoryCardNameDragging]} numberOfLines={1}>
                                                {cat.name}
                                            </Text>
                                        </View>
                                        <View style={styles.categoryActions}>
                                            <TouchableOpacity
                                                onPress={() => {
                                                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                                    handleToggleCategory(cat.id);
                                                }}
                                                style={[
                                                    styles.customSwitch,
                                                    {
                                                        marginRight: 8,
                                                        scaleX: 0.85,
                                                        scaleY: 0.85,
                                                        backgroundColor: cat.isEnabled !== false ? `${cat.color}25` : 'rgba(255,255,255,0.06)',
                                                        borderColor: cat.isEnabled !== false ? `${cat.color}40` : 'rgba(255,255,255,0.1)',
                                                        borderWidth: 1.5,
                                                        padding: 0, // Remove padding to use justifyContent for centering
                                                        justifyContent: 'center',
                                                        paddingHorizontal: 2, // Only horizontal padding for start/end gap
                                                    }
                                                ]}
                                                disabled={isActive}
                                            >
                                                <View style={[
                                                    styles.switchKnob,
                                                    cat.isEnabled !== false ? {
                                                        backgroundColor: cat.color,
                                                        transform: [{ translateX: 18 }], // Adjusted for new padding
                                                        shadowColor: cat.color,
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
                                                onPress={() => startEditCategory(cat)}
                                                disabled={isActive}
                                                activeOpacity={0.7}
                                            >
                                                <MaterialIcons name="edit" size={16} color={isActive ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.5)'} />
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.categoryCardDeleteBtn, { backgroundColor: 'transparent', borderWidth: 0 }]}
                                                onPress={() => handleDeleteCategory(cat.id)}
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
                                        shadowColor: cat.color,
                                        opacity: 1,
                                        backgroundColor: `${cat.color}15`
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
