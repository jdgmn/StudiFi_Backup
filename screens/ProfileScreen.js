import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput, Modal, ActivityIndicator, Image, Switch } from 'react-native';
import { signOut, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, updateDoc, collection, getDocs, query, where, getDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useSwipeTabNavigation } from '../hooks/useSwipeTabNavigation';
import * as ImagePicker from 'expo-image-picker';
import { uploadToCloudinary } from '../utils/cloudinary';
import { useOffline } from '../context/OfflineContext';
import { preloadOfflineData, getOfflineExpensesCount, getOfflineGoalsCount, clearAllOfflineData, preloadBudgetOffline } from '../utils/offlineStorage';
import { syncOfflineToCloud } from '../utils/syncOfflineToCloud';
import { updateUserDiscountContent } from '../utils/updateUserContent';

export default function ProfileScreen() {
  const { isOfflineMode, toggleOfflineMode } = useOffline();
  const { user, role, username, profilePicture, refreshUserData } = useAuth();
  const userId = user?.uid;
  const email = user?.email;
  const [syncing, setSyncing] = useState(false);
  const [offlineCounts, setOfflineCounts] = useState({ expenses: 0, goals: 0 });

  // Edit states
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [newUsername, setNewUsername] = useState(username || '');
  const [uploading, setUploading] = useState(false);

  // Password change states
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Disable swipe gesture when modal opan
  const isModalOpen = editModalVisible || passwordModalVisible;
  const panResponder = useSwipeTabNavigation(!isModalOpen);

  // Helper to load offline 
  const loadOfflineCounts = async () => {
    const expenses = await getOfflineExpensesCount();
    const goals = await getOfflineGoalsCount();
    setOfflineCounts({ expenses, goals });
  };

  const preloadOfflineDataFromCloud = async () => {
    setSyncing(true);
    try {
      const expensesQuery = query(collection(db, 'expenses'), where('userId', '==', userId));
      const goalsQuery = query(collection(db, 'goals'), where('userId', '==', userId));
      const budgetRef = doc(db, 'budgets', userId);
      const [expSnapshot, goalsSnapshot, budgetSnap] = await Promise.all([
        getDocs(expensesQuery),
        getDocs(goalsQuery),
        getDoc(budgetRef)
      ]);
      const expenses = expSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const goals = goalsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const budgetData = budgetSnap.exists() ? budgetSnap.data() : null;
      await preloadOfflineData(expenses, goals);
      await preloadBudgetOffline(budgetData);
      await toggleOfflineMode(true);
      Alert.alert('Offline Mode Enabled', 'Your data has been saved for offline use.');
    } catch (error) {
      Alert.alert('Error', 'Failed to preload data for offline mode.');
      console.error(error);
    } finally {
      setSyncing(false);
    }
  };

  // Handle toggle offline mode with preload / sync
  const handleToggleOffline = async (value) => {
    if (value === isOfflineMode) return;

    if (value === true) {
      // Switching to offline mode – check for existing unsynced data
      const existingExpenses = await getOfflineExpensesCount();
      const existingGoals = await getOfflineGoalsCount();
      if (existingExpenses > 0 || existingGoals > 0) {
        Alert.alert(
          'Unsynced Data Found',
          `You have ${existingExpenses} expense(s) and ${existingGoals} goal(s) saved offline. Enabling offline mode will replace them with the current cloud data. Continue?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Continue', onPress: preloadOfflineDataFromCloud }
          ]
        );
      } else {
        await preloadOfflineDataFromCloud();
      }
    } else {
      // Switching to online mode – ask to sync
      const expensesCount = await getOfflineExpensesCount();
      const goalsCount = await getOfflineGoalsCount();
      if (expensesCount > 0 || goalsCount > 0) {
        Alert.alert(
          'Sync Offline Data?',
          `You have ${expensesCount} expense(s) and ${goalsCount} goal(s) saved locally. Upload them to the cloud?`,
          [
            { text: 'Discard Changes', style: 'destructive', onPress: async () => {
              await clearAllOfflineData();
              await toggleOfflineMode(false);
              Alert.alert('Offline Mode Disabled', 'Local changes were discarded.');
            }},
            { text: 'Upload to Cloud', onPress: async () => {
              setSyncing(true);
              try {
                await syncOfflineToCloud(userId);
                await toggleOfflineMode(false);
                Alert.alert('Success', 'Your offline data has been uploaded to the cloud.');
              } catch (error) {
                Alert.alert('Sync Failed', error.message);
              } finally {
                setSyncing(false);
              }
            }},
            { text: 'Cancel', style: 'cancel' },
          ]
        );
      } else {
        await toggleOfflineMode(false);
        Alert.alert('Offline Mode Disabled');
      }
    }
  };

  // Manual sync button (for safety)
  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const { expensesCount, goalsCreated, goalsUpdated, deletedExpensesCount, deletedGoalsCount } = await syncOfflineToCloud(userId);
      Alert.alert('Sync Complete', `Uploaded ${expensesCount} expenses, ${goalsCreated} new goals, updated ${goalsUpdated} goals. Deleted ${deletedExpensesCount} expenses and ${deletedGoalsCount} goals from cloud.`);
    } catch (error) {
      Alert.alert('Sync Failed', error.message);
    } finally {
      setSyncing(false);
    }
  };

  // Load counts when component mounts
  React.useEffect(() => {
    if (isOfflineMode) {
      loadOfflineCounts();
    }
  }, [isOfflineMode]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const pickProfilePicture = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled) {
      setUploading(true);
      try {
        const imageUrl = await uploadToCloudinary(result.assets[0].uri);
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, { profilePictureUrl: imageUrl });
        await updateUserDiscountContent(userId, { userProfilePic: imageUrl });
        await refreshUserData();
        Alert.alert('Success', 'Profile picture updated');
      } catch (error) {
        Alert.alert('Upload Error', error.message);
      } finally {
        setUploading(false);
      }
    }
  };

  const updateUsername = async () => {
    if (!newUsername.trim()) {
      Alert.alert('Error', 'Username cannot be empty');
      return;
    }
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, { username: newUsername.trim() });
      await updateUserDiscountContent(userId, { userName: newUsername.trim() });
      await refreshUserData();
      setEditModalVisible(false);
      Alert.alert('Success', 'Username updated');
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const changePassword = async () => {
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      Alert.alert('Error', 'Please fill all password fields');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      Alert.alert('Error', 'New passwords do not match');
      return;
    }
    setPasswordLoading(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      Alert.alert('Success', 'Password updated. Please login again.');
      await handleLogout(); // force re-login
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setPasswordLoading(false);
      setPasswordModalVisible(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    }
  };

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <View style={styles.profileCard}>
        {/* Profile picture (unchanged) */}
        <TouchableOpacity onPress={pickProfilePicture} disabled={uploading} style={styles.avatarContainer}>
          {profilePicture ? (
            <Image source={{ uri: profilePicture }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarPlaceholderText}>
                {username ? username.charAt(0).toUpperCase() : '?'}
              </Text>
            </View>
          )}
          {uploading && <ActivityIndicator style={styles.avatarOverlay} size="small" color="#fff" />}
          <View style={styles.editIconOverlay}>
            <Text style={styles.editIcon}>✏️</Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{email}</Text>

        <Text style={styles.label}>Username</Text>
        <View style={styles.usernameRow}>
          <Text style={styles.value}>{username}</Text>
          <TouchableOpacity onPress={() => setEditModalVisible(true)}>
            <Text style={styles.editLink}>Edit</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Role</Text>
        <Text style={[styles.value, role === 'admin' ? styles.admin : styles.user]}>
          {role?.toUpperCase() || 'USER'}
        </Text>

        {/* Offline Mode Toggle */}
        <View style={styles.offlineToggleRow}>
          <Text style={styles.offlineToggleLabel}>Offline Mode</Text>
          <Switch
            value={isOfflineMode}
            onValueChange={handleToggleOffline}
            disabled={syncing}
            trackColor={{ false: '#767577', true: '#00A300' }}
            thumbColor={isOfflineMode ? '#fff' : '#f4f3f4'}
          />
        </View>
        {syncing && <ActivityIndicator style={{ marginVertical: 10 }} />}
        {isOfflineMode && (offlineCounts.expenses > 0 || offlineCounts.goals > 0) && (
          <TouchableOpacity style={styles.syncButton} onPress={handleManualSync}>
            <Text style={styles.syncButtonText}>Sync Offline Data to Cloud</Text>
          </TouchableOpacity>
        )}
        {isOfflineMode && (
          <Text style={styles.offlineNote}>
            ⚡ Offline mode active: Expenses & Goals work locally. Discounts, Invest & cloud sync disabled.
          </Text>
        )}

        <TouchableOpacity style={styles.changePasswordBtn} onPress={() => setPasswordModalVisible(true)}>
          <Text style={styles.changePasswordText}>Change Password</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Edit Username Modal */}
      <Modal visible={editModalVisible} transparent animationType="fade" onRequestClose={() => setEditModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setEditModalVisible(false)}>
          <TouchableOpacity style={styles.modalContent} activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Change Username</Text>
            <TextInput style={styles.input} placeholder="New username" value={newUsername} onChangeText={setNewUsername} autoCapitalize="none" />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditModalVisible(false)}><Text>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={updateUsername}><Text style={styles.saveBtnText}>Save</Text></TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Change Password Modal */}
      <Modal visible={passwordModalVisible} transparent animationType="fade" onRequestClose={() => setPasswordModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setPasswordModalVisible(false)}>
          <TouchableOpacity style={styles.modalContent} activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Change Password</Text>
            <TextInput style={styles.input} placeholder="Current Password" secureTextEntry value={currentPassword} onChangeText={setCurrentPassword} />
            <TextInput style={styles.input} placeholder="New Password" secureTextEntry value={newPassword} onChangeText={setNewPassword} />
            <TextInput style={styles.input} placeholder="Confirm New Password" secureTextEntry value={confirmNewPassword} onChangeText={setConfirmNewPassword} />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setPasswordModalVisible(false)}><Text>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={changePassword} disabled={passwordLoading}>
                {passwordLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Update</Text>}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f5f5f5', justifyContent: 'center' },
  profileCard: { backgroundColor: '#fff', padding: 25, borderRadius: 15, elevation: 3, alignItems: 'center' },
  avatarContainer: { position: 'relative', marginBottom: 20 },
  avatar: { width: 100, height: 100, borderRadius: 50, borderWidth: 2, borderColor: '#00A300' },
  avatarPlaceholder: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#ccc', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#00A300' },
  avatarPlaceholderText: { fontSize: 40, fontWeight: 'bold', color: '#fff' },
  editIconOverlay: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#fff', borderRadius: 15, padding: 4 },
  editIcon: { fontSize: 14 },
  avatarOverlay: { position: 'absolute', top: '50%', left: '50%', marginLeft: -10, marginTop: -10 },
  label: { fontSize: 14, color: '#666', marginTop: 15, alignSelf: 'flex-start' },
  value: { fontSize: 18, fontWeight: '500', marginTop: 5, alignSelf: 'flex-start' },
  usernameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginTop: 5 },
  editLink: { color: '#00A300', fontSize: 14, fontWeight: '500' },
  admin: { color: '#ff9800' },
  user: { color: '#4c9aff' },
  changePasswordBtn: { marginTop: 20, paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#e0e0e0', borderRadius: 8 },
  changePasswordText: { color: '#333', fontWeight: '500' },
  logoutBtn: { backgroundColor: '#4c9aff', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 20, width: '100%' },
  logoutText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '85%', maxWidth: 400 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, marginBottom: 15, color: '#000' },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  cancelBtn: { flex: 1, padding: 10, backgroundColor: '#ccc', borderRadius: 8, alignItems: 'center' },
  saveBtn: { flex: 1, padding: 10, backgroundColor: '#00A300', borderRadius: 8, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: 'bold' },
  syncButton: { backgroundColor: '#4c9aff', padding: 10, borderRadius: 8, alignItems: 'center', marginTop: 10, width: '100%' },
  syncButtonText: { color: '#fff', fontWeight: 'bold' },
  offlineToggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginTop: 20, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#eee' },
  offlineToggleLabel: { fontSize: 16, fontWeight: '500' },
  offlineNote: { fontSize: 12, color: '#666', marginTop: 8, textAlign: 'center', fontStyle: 'italic' },
});