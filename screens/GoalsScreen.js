import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { db } from '../firebase';
import { collection, addDoc, query, where, getDocs, updateDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { ProgressBar } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useSwipeTabNavigation } from '../hooks/useSwipeTabNavigation';
import { LinearGradient } from 'expo-linear-gradient';
import { useOffline } from '../context/OfflineContext';
import { saveGoalOffline, getGoalsOffline, updateGoalOffline, deleteGoalOffline, clearAllGoalsOffline, trackDeletedGoalOffline, getDeletedGoalsOffline, clearDeletedGoalsOffline, clearAllOfflineData } from '../utils/offlineStorage';
import { RefreshControl } from 'react-native';

export default function GoalsScreen() {
  const { user } = useAuth();
  const userId = user?.uid;

  // All state declarations first
  const [goals, setGoals] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [contributionModal, setContributionModal] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [contributionAmount, setContributionAmount] = useState('');

  // Disable swipe gesture when modal open
  const isModalOpen = modalVisible || contributionModal;
  const panResponder = useSwipeTabNavigation(!isModalOpen);

  // Offline storage
  const { isOfflineMode } = useOffline();

  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchGoals();
  }, [isOfflineMode]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchGoals();
    setRefreshing(false);
  };

  const fetchGoals = async () => {
    if (isOfflineMode) {
      const offlineGoals = await getGoalsOffline();
      setGoals(offlineGoals);
      return;
    }
    const q = query(collection(db, 'goals'), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    const goalsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setGoals(goalsList);
  };

  const addGoal = async () => {
    if (!title || !targetAmount) return Alert.alert('Error', 'Please fill all fields');
    if (isOfflineMode) {
      await saveGoalOffline({ title, targetAmount: parseFloat(targetAmount) });
    } else {
      await addDoc(collection(db, 'goals'), {
        userId, title, targetAmount: parseFloat(targetAmount), currentAmount: 0, createdAt: new Date().toISOString(),
      });
    }
    setModalVisible(false);
    setTitle('');
    setTargetAmount('');
    fetchGoals();
  };

  const addContribution = async () => {
    if (!contributionAmount) return Alert.alert('Error', 'Enter amount');
    const newAmount = selectedGoal.currentAmount + parseFloat(contributionAmount);
    if (newAmount > selectedGoal.targetAmount) return Alert.alert('Error', 'Exceeds goal target');
    if (isOfflineMode) {
      await updateGoalOffline(selectedGoal.id, newAmount);
    } else {
      await updateDoc(doc(db, 'goals', selectedGoal.id), { currentAmount: newAmount });
    }
    setContributionModal(false);
    setContributionAmount('');
    fetchGoals();
  };

  const deleteGoal = async (id) => {
    Alert.alert(
      'Delete Goal',
      'Are you sure you want to delete this goal?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          if (isOfflineMode) {
            const goalToDelete = goals.find(g => g.id === id);
            if (goalToDelete) {
              await trackDeletedGoalOffline(goalToDelete);
              await deleteGoalOffline(id);
            }
          } else {
            await deleteDoc(doc(db, 'goals', id));
          }
          fetchGoals();
        }}
      ]
    );
  };

  const deleteAllGoals = () => {
    Alert.alert(
      'Delete All Goals',
      'Are you sure you want to delete ALL your goals? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              if (isOfflineMode) {
                const currentGoals = await getGoalsOffline();
                for (const goal of currentGoals) {
                  await trackDeletedGoalOffline(goal);
                }
                await clearAllGoalsOffline();
                setGoals([]);
              } else {
                const q = query(collection(db, 'goals'), where('userId', '==', userId));
                const snapshot = await getDocs(q);
                const batch = writeBatch(db);
                snapshot.docs.forEach(doc => {
                  batch.delete(doc.ref);
                });
                await batch.commit();
                await fetchGoals();
              }
              Alert.alert('Success', 'All goals have been deleted.');
            } catch (error) {
              Alert.alert('Error', error.message);
            }
          }
        }
      ]
    );
  };

  const renderGoal = ({ item }) => {
    const progress = item.currentAmount / item.targetAmount;
    const isReached = item.currentAmount >= item.targetAmount;
    const remaining = item.targetAmount - item.currentAmount;
    const gradientColors = isReached 
      ? ['#e8f5e9', '#c8e6c9', '#81c784'] // green gradient
      : ['#ffebee', '#ffcdd2', '#e57373']; // red gradient

    return (
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.goalCard}
      >
        <View style={styles.goalHeader}>
          <Text style={styles.goalTitle}>{item.title}</Text>
          <TouchableOpacity onPress={() => deleteGoal(item.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="trash-outline" size={22} color="#ff4444" />
          </TouchableOpacity>
        </View>
        <Text style={styles.goalAmounts}>
          Target: ₱{item.targetAmount.toFixed(2)} | Saved: ₱{item.currentAmount.toFixed(2)}
        </Text>
        <Text style={styles.remainingText}>
          Remaining: ₱{remaining.toFixed(2)}
        </Text>
        <ProgressBar progress={progress} color="#00A300" style={styles.progressBar} />
        {!isReached && (
          <TouchableOpacity style={styles.contributeBtn} onPress={() => { setSelectedGoal(item); setContributionModal(true); }}>
            <Text style={styles.contributeBtnText}>Add Money</Text>
          </TouchableOpacity>
        )}
        {isReached && (
          <View style={styles.reachedContainer}>
            <Text style={styles.reachedText}>🎉 Goal Achieved! 🎉</Text>
          </View>
        )}
      </LinearGradient>
    );
  };

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <TouchableOpacity style={styles.addGoalBtn} onPress={() => setModalVisible(true)}>
        <Ionicons name="add-circle" size={24} color="white" />
        <Text style={styles.addBtnText}> Create New Goal</Text>
      </TouchableOpacity>
      
      <FlatList
        data={goals}
        renderItem={renderGoal}
        keyExtractor={item => item.id}
        ListEmptyComponent={<Text style={styles.empty}>No goals yet. Add one!</Text>}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#00A300']} />
        }
      />

      {/* Add Goal Modal */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setModalVisible(false)}>
          <TouchableOpacity style={styles.modalContent} activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>New Goal</Text>
            <TextInput placeholder="Goal Title" value={title} onChangeText={setTitle} style={styles.input} />
            <TextInput placeholder="Target Amount" keyboardType="numeric" value={targetAmount} onChangeText={setTargetAmount} style={styles.input} />
            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.cancelBtn}><Text>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={addGoal} style={styles.saveBtn}><Text style={{color:'#fff'}}>Create</Text></TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <TouchableOpacity style={styles.deleteAllBtn} onPress={deleteAllGoals}>
        <Ionicons name="trash-bin" size={20} color="white" />
        <Text style={styles.deleteAllText}>Delete All Goals</Text>
      </TouchableOpacity>

      {/* Contribution Modal */}
      <Modal visible={contributionModal} transparent animationType="fade" onRequestClose={() => setContributionModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setContributionModal(false)}>
          <TouchableOpacity style={styles.modalContent} activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Add to {selectedGoal?.title}</Text>
            <TextInput placeholder="Amount" keyboardType="numeric" value={contributionAmount} onChangeText={setContributionAmount} style={styles.input} />
            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={() => setContributionModal(false)} style={styles.cancelBtn}><Text>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={addContribution} style={styles.saveBtn}><Text style={{color:'#fff'}}>Add</Text></TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f5f5f5' },
  addGoalBtn: { backgroundColor: '#00A300', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 12, borderRadius: 8, marginBottom: 20 },
  addBtnText: { color: '#fff', fontWeight: 'bold' },
  goalCard: { padding: 15, borderRadius: 10, marginBottom: 12, elevation: 2 },
  goalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap' },
  goalTitle: { fontSize: 18, fontWeight: 'bold', flex: 1, flexShrink: 1, marginRight: 8, color: '#1a1a1a' },
  goalAmounts: { fontSize: 14, color: '#1a1a1a' },
  progressBar: { height: 10, borderRadius: 5, marginVertical: 10 },
  contributeBtn: { backgroundColor: '#4c9aff', padding: 8, borderRadius: 6, alignItems: 'center', marginTop: 8 },
  contributeBtnText: { color: '#fff', fontWeight: 'bold' },
  empty: { textAlign: 'center', marginTop: 50, color: '#888' },
  modalView: { backgroundColor: 'white', margin: 20, padding: 20, borderRadius: 10, top: '30%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 8, marginBottom: 10, color: '#000' },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, gap: 10 },
  cancelBtn: { padding: 10, backgroundColor: '#ccc', borderRadius: 8, flex: 1, alignItems: 'center' },
  saveBtn: { padding: 10, backgroundColor: '#00A300', borderRadius: 8, flex: 1, alignItems: 'center' },
  remainingText: { fontSize: 14, fontWeight: '600', color: '#1a1a1a', marginTop: 4 },
  reachedContainer: { marginTop: 8, alignItems: 'center' },
  reachedText: { fontWeight: 'bold', color: '#006800', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '85%', maxWidth: 400 },
  deleteAllBtn: { backgroundColor: '#ff4444', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 12, borderRadius: 8, marginTop: 20, marginBottom: 10 },
  deleteAllText: { marginLeft: 8, color: 'white', fontWeight: 'bold' },
});