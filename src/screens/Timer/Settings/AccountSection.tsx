import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    Image,
    ScrollView,
    StyleSheet as RNStyleSheet,
} from 'react-native';
import { MaterialIcons, AntDesign } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { AppOwnership } from 'expo-constants';

import { styles } from './styles';
import {
    configureGoogleSignIn,
    signInWithGoogle,
    signOutGoogle,
    getCurrentUser,
} from '../../../services/GoogleDriveService';
import {
    LAST_SYNC_TIMESTAMP_KEY,
} from '../../../constants/data';

interface AccountSectionProps {
    isLandscape: boolean;
    onBack?: () => void;
}

export default function AccountSection({ isLandscape, onBack }: AccountSectionProps) {
    const [loading, setLoading] = useState(false);
    const [user, setUser] = useState<any>(null);
    const [lastSyncDisplay, setLastSyncDisplay] = useState<string>('Never');

    useEffect(() => {
        configureGoogleSignIn();
        const checkUserStatus = async () => {
            if (Constants.appOwnership === AppOwnership.Expo) {
                return;
            }

            const userInfo = await getCurrentUser();
            if (userInfo) setUser(userInfo);

            const last = await AsyncStorage.getItem(LAST_SYNC_TIMESTAMP_KEY);
            if (last) setLastSyncDisplay(new Date(last).toLocaleString());
        };
        checkUserStatus();
    }, []);

    const handleSignIn = async () => {
        if (Constants.appOwnership === AppOwnership.Expo) {
            Alert.alert('Not Supported', 'Cloud Sync requires a native builds.');
            return;
        }
        setLoading(true);
        try {
            const userInfo = await signInWithGoogle();
            if (userInfo) {
                setUser(userInfo);
            }
        } catch (error: any) {
            Alert.alert('Sign In Error', error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSignOut = async () => {
        Alert.alert('Sign Out', 'Sign out of your Google account?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Sign Out',
                style: 'destructive',
                onPress: async () => {
                    await signOutGoogle();
                    setUser(null);
                }
            }
        ]);
    };

    const renderUserInfo = () => {
        if (!user) {
            return (
                <View style={localStyles.premiumAccountContainer}>
                    <View style={[localStyles.premiumGlassPanel, isLandscape && localStyles.premiumGlassPanelLandscape]}>
                        <View style={{ alignItems: 'center' }}>
                            <View style={localStyles.premiumGlowIconContainer}>
                                <View style={localStyles.premiumIconGlow} />
                                <MaterialIcons name="cloud-off" size={40} color="rgba(255,255,255,0.6)" />
                            </View>
                            <Text style={localStyles.premiumTitle}>Offline Backup</Text>
                            <Text style={localStyles.premiumSubtitle}>
                                Secure your timers and tasks in the cloud. Login with Google to sync across all your devices seamlessly.
                            </Text>
                            
                            <TouchableOpacity
                                style={localStyles.premiumLoginButton}
                                onPress={handleSignIn}
                                disabled={loading}
                                activeOpacity={0.85}
                            >
                                {loading ? (
                                    <ActivityIndicator size="small" color="#000" />
                                ) : (
                                    <>
                                        <View style={localStyles.premiumGoogleIconWrap}>
                                            <AntDesign name="google" size={20} color="#EA4335" />
                                        </View>
                                        <Text style={localStyles.premiumLoginButtonText}>Login with Google</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            );
        }

        const { user: googleUser } = user;
        return (
            <View style={localStyles.premiumAccountContainer}>
                <View style={[localStyles.premiumGlassPanel, isLandscape && localStyles.premiumGlassPanelLandscape]}>
                    <View style={localStyles.premiumProfileHeader}>
                        <View style={localStyles.premiumAvatarContainer}>
                            <View style={localStyles.premiumAvatarGlow} />
                            {googleUser.photo ? (
                                <Image source={{ uri: googleUser.photo }} style={localStyles.premiumAvatar} />
                            ) : (
                                <View style={[localStyles.premiumAvatar, { backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }]}>
                                    <Text style={{ fontSize: 24, fontWeight: '700', color: '#fff' }}>
                                        {googleUser.givenName?.[0] || googleUser.email?.[0]}
                                    </Text>
                                </View>
                            )}
                        </View>
                        <View style={localStyles.premiumUserInfo}>
                            <Text style={localStyles.premiumName}>{googleUser.name}</Text>
                            <Text style={localStyles.premiumEmail}>{googleUser.email}</Text>
                        </View>
                    </View>

                    <View style={localStyles.premiumStatusCard}>
                        <View style={localStyles.premiumStatusRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <MaterialIcons name="sync" size={16} color="rgba(255,255,255,0.4)" style={{ marginRight: 8 }} />
                                <Text style={localStyles.premiumStatusLabel}>Sync Status</Text>
                            </View>
                            <Text style={localStyles.premiumStatusValue}>{lastSyncDisplay}</Text>
                        </View>
                    </View>

                    <TouchableOpacity 
                        style={localStyles.premiumSignOutBtn} 
                        onPress={handleSignOut}
                        activeOpacity={0.7}
                    >
                        <MaterialIcons name="logout" size={18} color="#FF5050" />
                        <Text style={localStyles.premiumSignOutText}>Sign Out</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    const renderHeader = () => {
        if (isLandscape && !user) return null;
        
        const photo = user?.user?.photo;
        const displayName = user?.user?.name;
        const initials = user?.user?.givenName?.[0] || user?.user?.email?.[0] || '?';
        const headerHeight = !user ? (isLandscape ? 40 : 120) : (isLandscape ? 180 : 300);

        return (
            <View style={[
                localStyles.headerContainer, 
                isLandscape && localStyles.headerContainerLandscape,
                { height: headerHeight }
            ]}>
                <LinearGradient
                    colors={['rgba(255,255,255,0.05)', 'rgba(0,0,0,0.4)']}
                    style={[localStyles.headerGradient, isLandscape && localStyles.headerGradientLandscape]}
                >
                    {!isLandscape && (
                        <View style={localStyles.headerTopRow}>
                            <TouchableOpacity 
                                style={localStyles.headerIconButton} 
                                onPress={onBack}
                                activeOpacity={0.7}
                            >
                                <MaterialIcons name="chevron-left" size={30} color="#fff" />
                            </TouchableOpacity>
                            <View style={{ width: 44 }} />
                        </View>
                    )}

                    {user && (
                        <>
                            <View style={[localStyles.avatarWrapperCentered, isLandscape && localStyles.avatarWrapperCenteredLandscape]}>
                                <View style={[localStyles.avatarGlow, isLandscape && localStyles.avatarGlowLandscape]} />
                                {photo ? (
                                    <Image source={{ uri: photo }} style={[localStyles.avatarImageCentered, isLandscape && localStyles.avatarImageCenteredLandscape]} />
                                ) : (
                                    <View style={[localStyles.avatarImageCentered, localStyles.avatarPlaceholderLarge, isLandscape && localStyles.avatarImageCenteredLandscape, { borderWidth: 0 }]}>
                                        <Text style={[localStyles.avatarTextLarge, isLandscape && { fontSize: 32 }]}>{initials}</Text>
                                    </View>
                                )}
                                <TouchableOpacity style={localStyles.editIconOverlay} activeOpacity={0.8}>
                                    <MaterialIcons name="edit" size={14} color="#fff" />
                                </TouchableOpacity>
                            </View>

                            <Text style={[localStyles.userNameCentered, isLandscape && { fontSize: 22 }]}>{displayName}</Text>
                            <Text style={localStyles.userEmailCentered}>{user?.user?.email}</Text>
                        </>
                    )}
                </LinearGradient>
            </View>
        );
    };

    return (
        <ScrollView
            style={isLandscape ? localStyles.containerLandscape : localStyles.containerPortrait}
            contentContainerStyle={!isLandscape && localStyles.scrollContentPortrait}
            showsVerticalScrollIndicator={false}
        >
            {renderHeader()}
            <View style={!isLandscape && localStyles.contentPadding}>
                {user && (
                    <Text style={isLandscape ? styles.sectionTitleLandscape : styles.sectionTitle}>
                        ACCOUNT & SYNC
                    </Text>
                )}
                {renderUserInfo()}
            </View>
        </ScrollView>
    );
}

const localStyles = RNStyleSheet.create({
    containerPortrait: { flex: 1, backgroundColor: '#000' },
    containerLandscape: { flex: 1 },
    scrollContentPortrait: { paddingBottom: 40 },
    contentPadding: { paddingHorizontal: 16 },
    
    headerContainer: {
        height: 300,
        backgroundColor: '#000',
        overflow: 'hidden',
        marginBottom: 10,
    },
    headerContainerLandscape: {
        height: 180,
        borderRadius: 20,
        marginTop: 10,
    },
    headerGradient: {
        flex: 1,
        paddingTop: 0,
        alignItems: 'center',
    },
    headerGradientLandscape: {
        paddingTop: 10,
    },
    headerTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        paddingHorizontal: 20,
        paddingTop: 50,
        marginBottom: 10,
    },
    headerIconButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#1C1C1E',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 13,
        fontWeight: '900',
        letterSpacing: 4,
        color: 'rgba(255,255,255,0.8)',
        textTransform: 'uppercase',
    },
    avatarWrapperCentered: {
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    avatarWrapperCenteredLandscape: {
        marginBottom: 15,
    },
    avatarGlow: {
        position: 'absolute',
        width: 140,
        height: 140,
        borderRadius: 70,
        backgroundColor: 'rgba(90, 80, 255, 0.3)',
        opacity: 0.6,
    },
    avatarGlowLandscape: {
        width: 120,
        height: 120,
        borderRadius: 60,
    },
    avatarImageCentered: {
        width: 110,
        height: 110,
        borderRadius: 55,
        borderWidth: 3,
        borderColor: '#1A1A1A',
    },
    avatarImageCenteredLandscape: {
        width: 90,
        height: 90,
        borderRadius: 45,
    },
    editIconOverlay: {
        position: 'absolute',
        bottom: 5,
        right: 5,
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#4A80F0',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#121212',
    },
    userNameCentered: {
        fontSize: 26,
        fontWeight: '800',
        color: '#fff',
        marginBottom: 4,
        textAlign: 'center',
    },
    userEmailCentered: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.4)',
        fontWeight: '500',
        marginBottom: 16,
        textAlign: 'center',
    },
    avatarPlaceholderLarge: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarTextLarge: {
        fontSize: 40,
        fontWeight: '800',
        color: '#fff',
        opacity: 0.9,
    },

    premiumAccountContainer: {
        flex: 1,
        width: '100%',
        alignItems: 'center',
    },
    premiumGlassPanel: {
        width: '100%',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 32,
        padding: 30,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.5,
        shadowRadius: 40,
        elevation: 15,
    },
    premiumGlassPanelLandscape: {
        padding: 24,
        borderRadius: 24,
    },
    premiumGlowIconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
        position: 'relative',
    },
    premiumIconGlow: {
        position: 'absolute',
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        opacity: 0.3,
    },
    premiumTitle: {
        fontSize: 28,
        fontWeight: '900',
        color: '#fff',
        marginBottom: 12,
        letterSpacing: -0.5,
        textAlign: 'center',
    },
    premiumSubtitle: {
        fontSize: 15,
        color: 'rgba(255, 255, 255, 0.5)',
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 32,
        paddingHorizontal: 10,
    },
    premiumLoginButton: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        height: 56,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 28,
        width: '100%',
        shadowColor: '#fff',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 8,
    },
    premiumLoginButtonText: {
        color: '#000',
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: 0.2,
    },
    premiumGoogleIconWrap: {
        width: 24,
        height: 24,
        marginRight: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    
    // Authenticated Premium Styles
    premiumProfileHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
        marginBottom: 32,
    },
    premiumAvatarContainer: {
        position: 'relative',
        marginRight: 20,
    },
    premiumAvatarGlow: {
        position: 'absolute',
        top: -10,
        left: -10,
        right: -10,
        bottom: -10,
        borderRadius: 40,
        backgroundColor: 'rgba(80, 120, 255, 0.1)',
    },
    premiumAvatar: {
        width: 72,
        height: 72,
        borderRadius: 36,
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    premiumUserInfo: {
        flex: 1,
    },
    premiumName: {
        fontSize: 22,
        fontWeight: '800',
        color: '#fff',
        marginBottom: 4,
    },
    premiumEmail: {
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.4)',
    },
    premiumStatusCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 20,
        padding: 16,
        width: '100%',
        marginBottom: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    premiumStatusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    premiumStatusLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: 'rgba(255, 255, 255, 0.5)',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    premiumStatusValue: {
        fontSize: 13,
        fontWeight: '800',
        color: '#fff',
    },
    premiumSignOutBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        width: '100%',
        borderRadius: 16,
        backgroundColor: 'rgba(255, 80, 80, 0.08)',
        marginTop: 10,
    },
    premiumSignOutText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#FF5050',
        marginLeft: 8,
    },
});
