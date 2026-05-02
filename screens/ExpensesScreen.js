import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput, Modal, FlatList, ScrollView as RNScrollView } from 'react-native';
import { db } from '../firebase';
import { collection, addDoc, query, where, getDocs, orderBy, deleteDoc, doc, getDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { BarChart, LineChart } from 'react-native-chart-kit';
import { Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useSwipeTabNavigation } from '../hooks/useSwipeTabNavigation';
import { LinearGradient } from 'expo-linear-gradient';
import { useOffline } from '../context/OfflineContext';
import { saveExpenseOffline, getExpensesOffline, updateExpenseOffline, deleteExpenseOffline, clearAllExpensesOffline, clearAllOfflineData, trackDeletedExpenseOffline, getDeletedExpensesOffline, saveBudgetOffline, getBudgetOffline, clearBudgetOffline } from '../utils/offlineStorage';
import { RefreshControl } from 'react-native';

const screenWidth = Dimensions.get('window').width;

export default function ExpensesScreen() {
  const { isOfflineMode } = useOffline();
  const { user } = useAuth();
  const userId = user?.uid;

  // Existing states
  const [expenses, setExpenses] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState('expense');
  const [description, setDescription] = useState('');
  const [chartData, setChartData] = useState({ labels: [], datasets: [{ data: [] }] });
  const [lineData, setLineData] = useState({ labels: [], datasets: [{ data: [] }] });

  // Budget states
  const [budgetModalVisible, setBudgetModalVisible] = useState(false);
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetPeriod, setBudgetPeriod] = useState('monthly'); // 'weekly' or 'monthly'
  const [currentBudget, setCurrentBudget] = useState(null); // { amount, period, remaining, lastReset }
  const [remainingBudget, setRemainingBudget] = useState(0);

  const categories = ['Food', 'Transport', 'Entertainment', 'Books', 'Rent', 'Other'];
  const [refreshing, setRefreshing] = useState(false);

  // Disable swiping screen when model open
  const isModalOpen = modalVisible || budgetModalVisible;
  const panResponder = useSwipeTabNavigation(!isModalOpen);

  // ---------- Helper: Get start date of current period ----------
  const getPeriodStartDate = (period) => {
    const now = new Date();
    if (period === 'weekly') {
      // Monday of current week
      const day = now.getDay();
      const diff = (day === 0 ? 6 : day - 1); // adjust Sunday (0) to Monday
      const start = new Date(now);
      start.setDate(now.getDate() - diff);
      start.setHours(0, 0, 0, 0);
      return start;
    } else { // monthly
      return new Date(now.getFullYear(), now.getMonth(), 1);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadBudget(), fetchExpenses()]);
    setRefreshing(false);
  };

  const getChartWidth = () => {
    const categoriesCount = chartData.labels.length;
    if (categoriesCount === 0) return screenWidth - 60;
    // Each bar + spacing: adjust factor as needed (e.g., 100 per category)
    const minWidth = screenWidth - 60;
    const dynamicWidth = categoriesCount * 100;
    return Math.max(minWidth, dynamicWidth);
  };

  // ---------- Load budget from Firestore ----------
  const loadBudget = async () => {
    if (!userId) return;
    if (isOfflineMode) {
      const offlineBudget = await getBudgetOffline();
      if (offlineBudget) {
        setCurrentBudget(offlineBudget);
        setRemainingBudget(offlineBudget.remaining || offlineBudget.amount);
      } else {
        setCurrentBudget(null);
        setRemainingBudget(0);
      }
      return;
    }
    const budgetRef = doc(db, 'budgets', userId);
    const budgetSnap = await getDoc(budgetRef);
    if (budgetSnap.exists()) {
      const data = budgetSnap.data();
      const lastReset = data.lastReset?.toDate ? data.lastReset.toDate() : new Date(data.lastReset);
      const periodStart = getPeriodStartDate(data.period);
      // Check if we need to reset budget (new week/month)
      if (lastReset < periodStart) {
        // Reset remaining to full amount
        const newRemaining = data.amount;
        await updateDoc(budgetRef, {
          remaining: newRemaining,
          lastReset: periodStart,
        });
        setCurrentBudget({ ...data, remaining: newRemaining, lastReset: periodStart });
        setRemainingBudget(newRemaining);
      } else {
        setCurrentBudget(data);
        setRemainingBudget(data.remaining || data.amount);
      }
    } else {
      setCurrentBudget(null);
      setRemainingBudget(0);
    }
  };

  // ---------- Save / update / remove budget ----------
  const saveBudget = async () => {
    if (!budgetAmount || isNaN(parseFloat(budgetAmount))) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    const amountNum = parseFloat(budgetAmount);
    const periodStart = getPeriodStartDate(budgetPeriod);
    const budgetData = {
      userId,
      amount: amountNum,
      period: budgetPeriod,
      remaining: amountNum,
      lastReset: periodStart,
      updatedAt: new Date(),
    };
    try {
      if (isOfflineMode) {
        await saveBudgetOffline(budgetData);
        setCurrentBudget(budgetData);
        setRemainingBudget(amountNum);
      } else {
        const budgetRef = doc(db, 'budgets', userId);
        await setDoc(budgetRef, budgetData);
        setCurrentBudget(budgetData);
        setRemainingBudget(amountNum);
      }
      setBudgetModalVisible(false);
      Alert.alert('Success', `Budget set to ₱${amountNum} ${budgetPeriod}`);
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const removeBudget = async () => {
    Alert.alert(
      'Remove Budget',
      'Are you sure you want to remove your budget? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              if (isOfflineMode) {
                await clearBudgetOffline();
                setCurrentBudget(null);
                setRemainingBudget(0);
                Alert.alert('Success', 'Budget removed (offline).');
              } else {
                const budgetRef = doc(db, 'budgets', userId);
                await deleteDoc(budgetRef);
                setCurrentBudget(null);
                setRemainingBudget(0);
                Alert.alert('Success', 'Budget removed.');
              }
            } catch (error) {
              Alert.alert('Error', error.message);
            }
          }
        }
      ]
    );
  };

  // ---------- Recalculate remaining based on period expenses ----------
  const recalcRemaining = async () => {
    if (!currentBudget) return;
    const startDate = getPeriodStartDate(currentBudget.period);
    let spent = 0;
    if (isOfflineMode) {
      const offlineExpenses = await getExpensesOffline();
      spent = offlineExpenses
        .filter(e =>
          e.type === 'expense' &&
          new Date(e.date) >= startDate
        )
        .reduce((sum, e) => sum + (e.amount || 0), 0);
    } else {
      const q = query(
        collection(db, 'expenses'),
        where('userId', '==', userId),
        where('type', '==', 'expense'),
        where('date', '>=', startDate.toISOString())
      );
      const snapshot = await getDocs(q);
      spent = snapshot.docs.reduce(
        (sum, doc) => sum + (doc.data().amount || 0),
        0
      );
    }
    const newRemaining = currentBudget.amount - spent;
    const finalRemaining = newRemaining < 0 ? 0 : newRemaining;

    setRemainingBudget(finalRemaining);
    if (isOfflineMode) {
      const updatedBudget = {
        ...currentBudget,
        remaining: finalRemaining,
      };
      await saveBudgetOffline(updatedBudget);
      setCurrentBudget(updatedBudget);
    } else {
      const budgetRef = doc(db, 'budgets', userId);
      await updateDoc(budgetRef, { remaining: finalRemaining });
      setCurrentBudget({ ...currentBudget, remaining: finalRemaining });
    }
  };

  // ---------- Fetch expenses and update charts ----------
  const fetchExpenses = async () => {
    if (!userId) return;
    if (isOfflineMode) {
      const offlineExpenses = await getExpensesOffline();
      setExpenses(offlineExpenses);
      prepareCharts(offlineExpenses);
      await recalcRemaining();
      return;
    }
    const q = query(collection(db, 'expenses'), where('userId', '==', userId), orderBy('date', 'desc'));
    const querySnapshot = await getDocs(q);
    const expensesList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(e => e.type); // ensure type exists
    setExpenses(expensesList);
    prepareCharts(expensesList);
    await recalcRemaining(); // update remaining after loading expenses
  };

  const prepareCharts = (expensesList) => {
    const validExpenses = expensesList.filter(e => e && e.type);
    const spendingByCat = {};
    validExpenses.filter(e => e.type === 'expense').forEach(exp => {
      spendingByCat[exp.category] = (spendingByCat[exp.category] || 0) + (exp.amount || 0);
    });
    const labels = Object.keys(spendingByCat);
    const data = Object.values(spendingByCat);
    setChartData({ labels, datasets: [{ data: data.length ? data : [0] }] });

    const monthlyData = {};
    expensesList.forEach(exp => {
      const date = new Date(exp.date);
      const monthYear = `${date.getMonth()+1}/${date.getFullYear()}`;
      if (!monthlyData[monthYear]) monthlyData[monthYear] = { expense: 0, saving: 0 };
      if (exp.type === 'expense') monthlyData[monthYear].expense += exp.amount;
      else monthlyData[monthYear].saving += exp.amount;
    });
    const months = Object.keys(monthlyData).slice(-6);
    const expenseData = months.map(m => monthlyData[m].expense);
    const savingData = months.map(m => monthlyData[m].saving);
    setLineData({
      labels: months,
      datasets: [{ data: expenseData, color: () => '#ff4d4d' }, { data: savingData, color: () => '#4c9aff' }]
    });
  };

  const addExpense = async () => {
    if (!amount || !category) {
      Alert.alert('Error', 'Please enter amount and category');
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount)) {
      Alert.alert('Error', 'Amount must be a number');
      return;
    }
    // If expense, check if it exceeds remaining budget (optional warning)
    if (type === 'expense' && currentBudget && parsedAmount > remainingBudget) {
      Alert.alert('Budget Alert', 'This expense exceeds your remaining budget. Proceed anyway?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'OK', onPress: () => performAddExpense(parsedAmount) }
      ]);
    } else {
      performAddExpense(parsedAmount);
    }
  };

  const performAddExpense = async (parsedAmount) => {
    const expenseData = {
      userId,
      amount: parsedAmount,
      category,
      type,
      description,
      date: new Date().toISOString(),
    };
    try {
      if (isOfflineMode) {
        await saveExpenseOffline(expenseData);
      } else {
        await addDoc(collection(db, 'expenses'), expenseData);
      }
      setModalVisible(false);
      setAmount('');
      setCategory('');
      setDescription('');
      await fetchExpenses();
    } catch (error) {
      Alert.alert('Error', `Failed to save: ${error.message}`);
    }
  };

  const deleteExpense = async (id) => {
    if (isOfflineMode) {
      const expenseToDelete = expenses.find(e => e.id === id);
      if (expenseToDelete) {
        await trackDeletedExpenseOffline(expenseToDelete);
        await deleteExpenseOffline(id);
      }
    } else {
      await deleteDoc(doc(db, 'expenses', id));
    }
    await fetchExpenses();
  };

  const deleteAllExpenses = () => {
    Alert.alert(
      'Delete All Expenses',
      'Are you sure you want to delete ALL your expenses? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              if (isOfflineMode) {
                const currentExpenses = await getExpensesOffline();
                for (const exp of currentExpenses) {
                  await trackDeletedExpenseOffline(exp);
                }
                await clearAllExpensesOffline();
                setExpenses([]);
                prepareCharts([]);
              } else {
                // Firestore: batch delete all user's expenses
                const q = query(collection(db, 'expenses'), where('userId', '==', userId));
                const snapshot = await getDocs(q);
                const batch = writeBatch(db);
                snapshot.docs.forEach(doc => {
                  batch.delete(doc.ref);
                });
                await batch.commit();
                await fetchExpenses(); // refresh
              }
              Alert.alert('Success', 'All expenses have been deleted.');
            } catch (error) {
              Alert.alert('Error', error.message);
            }
          }
        }
      ]
    );
  };

  // Load data on mount
  useEffect(() => {
    if (userId) {
      loadBudget();
      fetchExpenses();
    }
  }, [userId, isOfflineMode]);
  
  const totalSpending = expenses.filter(e => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0);
  const totalSavings = expenses.filter(e => e.type === 'saving').reduce((sum, e) => sum + e.amount, 0);

  return (
    <ScrollView style={styles.container} {...panResponder.panHandlers} contentContainerStyle={{ paddingBottom: 80 }} refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#00A300']} />
      }
    >
      {/* Budget Card */}
      {currentBudget ? (
        <LinearGradient
          colors={['#e8f5e9', '#ffffff']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.budgetCard}
        >
          <View style={styles.budgetRow}>
            <Text style={styles.budgetLabel}>Budget ({currentBudget.period})</Text>
            <View style={styles.budgetActions}>
              <TouchableOpacity onPress={() => setBudgetModalVisible(true)} style={styles.budgetActionBtn}>
                <Ionicons name="pencil" size={20} color="#666" />
              </TouchableOpacity>
              <TouchableOpacity onPress={removeBudget} style={styles.budgetActionBtn}>
                <Ionicons name="trash-outline" size={20} color="#ff4444" />
              </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.budgetAmount}>₱{currentBudget.amount}</Text>
          <Text style={[styles.remainingText, remainingBudget < 0 ? styles.overBudget : styles.underBudget]}>
            Remaining: ₱{remainingBudget.toFixed(2)}
          </Text>
          {remainingBudget < 0 && <Text style={styles.warning}>⚠️ Over budget!</Text>}
        </LinearGradient>
      ) : (
        <TouchableOpacity style={styles.setBudgetBtn} onPress={() => setBudgetModalVisible(true)}>
          <Ionicons name="wallet-outline" size={24} color="white" />
          <Text style={styles.setBudgetText}> Set Budget</Text>
        </TouchableOpacity>
      )}

      <View style={styles.summary}>
        <LinearGradient
          colors={['#fff0f0', '#ffffff']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <Text style={styles.cardTitle}>Total Spending</Text>
          <Text style={styles.cardValueNegative}>₱{totalSpending.toFixed(2)}</Text>
        </LinearGradient>
        <LinearGradient
          colors={['#e8f5e9', '#ffffff']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <Text style={styles.cardTitle}>Total Savings</Text>
          <Text style={styles.cardValue}>₱{totalSavings.toFixed(2)}</Text>
        </LinearGradient>
      </View>

      <TouchableOpacity style={styles.deleteAllBtn} onPress={deleteAllExpenses}>
        <Ionicons name="trash-bin" size={20} color="white" />
        <Text style={styles.deleteAllText}>Delete All Expenses</Text>
      </TouchableOpacity>

      <Text style={styles.chartTitle} >Spending by Category</Text>
        {chartData.labels.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={true} style={{ marginVertical: 8 }}>
            <BarChart
              data={chartData}
              width={getChartWidth()}      // ← dynamic width
              height={220}
              fromZero={true}
              chartConfig={{
                backgroundColor: '#fff',
                backgroundGradientFrom: '#fff',
                backgroundGradientTo: '#fff',
                decimalPlaces: 0,
                color: (opacity = 1) => `#00A300`,
                labelColor: () => '#333',
                propsForBackgroundLines: { strokeDasharray: '', stroke: '#e0e0e0' },
                style: { borderRadius: 16 },
                yAxisLabel: '₱',
                yAxisSuffix: '',
              }}
              style={styles.chart}
              verticalLabelRotation={0}   // optional: keep horizontal labels
              showValuesOnTopOfBars={true}
            />
          </ScrollView>
        ) : <Text>No expense data yet</Text>}

      <Text style={styles.chartTitle}>Spending vs Savings Trend</Text>
      {lineData.labels.length > 0 ? (
        <LineChart
          data={lineData}
          width={screenWidth - 60}
          height={220}
          bezier
          fromZero={true}
          chartConfig={{
            backgroundColor: '#fff',
            backgroundGradientFrom: '#fff',
            backgroundGradientTo: '#fff',
            decimalPlaces: 0,
            color: (opacity = 1, index) => index === 0 ? '#ff4d4d' : '#4c9aff',
            labelColor: () => '#333',
            propsForBackgroundLines: { strokeDasharray: '', stroke: '#e0e0e0' },
            yAxisLabel: '₱',
            yAxisSuffix: '',
          }}
          style={styles.chart}
          formatYLabel={(yLabel) => `${Number(yLabel).toFixed(0)}`}
        />
      ) : <Text>No trend data</Text>}

      <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}>
        <Ionicons name="add" size={24} color="white" />
        <Text style={styles.addButtonText}>Add Transaction</Text>
      </TouchableOpacity>

      <Text style={styles.historyTitle}>Recent Transactions</Text>
      {expenses.map(item => (
        <LinearGradient
          key={item.id}
          colors={item.type === 'saving' 
            ? ['#e8f5e9', '#c8e6c9']  // green gradient for savings
            : ['#ffebee', '#ffcdd2']   // red gradient for expenses
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.transactionItem}
        >
          <View>
            <Text style={styles.transactionCat}>{item.category}</Text>
            <Text>{item.description}</Text>
            <Text style={{ fontSize: 12 }}>{new Date(item.date).toLocaleDateString()}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[styles.transactionAmount, item.type === 'expense' ? styles.expense : styles.saving]}>
              ₱{item.amount}
            </Text>
            <TouchableOpacity onPress={() => deleteExpense(item.id)}>
              <Ionicons name="trash" size={20} color="red" />
            </TouchableOpacity>
          </View>
        </LinearGradient>
      ))}

      {/* Add Transaction Modal */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setModalVisible(false)}>
          <TouchableOpacity style={styles.modalContent} activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Add Transaction</Text>
            <TextInput style={styles.input} placeholder="Amount" keyboardType="numeric" value={amount} onChangeText={setAmount} />
            <View style={styles.typeSelector}>
              <TouchableOpacity style={[styles.typeBtn, type === 'expense' && styles.activeType]} onPress={() => setType('expense')}><Text>Expense</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.typeBtn, type === 'saving' && styles.activeType]} onPress={() => setType('saving')}><Text>Savings</Text></TouchableOpacity>
            </View>
            <FlatList horizontal data={categories} renderItem={({item}) => 
              <TouchableOpacity style={[styles.catChip, category === item && styles.selectedCat]} onPress={() => setCategory(item)}>
                <Text style={category === item && styles.selectedCatText}>{item}</Text>
              </TouchableOpacity>
            } keyExtractor={item => item} showsHorizontalScrollIndicator={false} />
            <TextInput style={styles.input} placeholder="Description" value={description} onChangeText={setDescription} />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}><Text>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={addExpense}><Text style={{color:'#fff'}}>Save</Text></TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Budget Setting Modal */}
      <Modal visible={budgetModalVisible} transparent animationType="fade" onRequestClose={() => setBudgetModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setBudgetModalVisible(false)}>
          <TouchableOpacity style={styles.modalContent} activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Set Budget</Text>
            <TextInput style={styles.input} placeholder="Budget Amount" keyboardType="numeric" value={budgetAmount} onChangeText={setBudgetAmount} />
            <View style={styles.typeSelector}>
              <TouchableOpacity style={[styles.typeBtn, budgetPeriod === 'weekly' && styles.activeType]} onPress={() => setBudgetPeriod('weekly')}><Text>Weekly</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.typeBtn, budgetPeriod === 'monthly' && styles.activeType]} onPress={() => setBudgetPeriod('monthly')}><Text>Monthly</Text></TouchableOpacity>
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setBudgetModalVisible(false)}><Text>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveBudget}><Text style={{color:'#fff'}}>Save Budget</Text></TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 20 },
  budgetCard: { padding: 15, borderRadius: 12, marginBottom: 20, elevation: 3 },
  budgetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  budgetLabel: { fontSize: 16, color: '#666' },
  budgetAmount: { fontSize: 28, fontWeight: 'bold', color: '#00A300', marginVertical: 5 },
  remainingText: { fontSize: 18, fontWeight: '500' },
  underBudget: { color: 'green' },
  overBudget: { color: 'red' },
  warning: { color: 'red', marginTop: 5, fontWeight: 'bold' },
  setBudgetBtn: { backgroundColor: '#4c9aff', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 14, borderRadius: 10, marginBottom: 20 },
  setBudgetText: { color: '#fff', fontWeight: 'bold', marginLeft: 8, fontSize: 16 },
  summary: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  card: { padding: 15, borderRadius: 10, width: '48%', alignItems: 'center', elevation: 2 },
  cardTitle: { fontSize: 14, color: '#666' },
  cardValue: { fontSize: 22, fontWeight: 'bold', color: '#00A300' },
  cardValueNegative: { fontSize: 22, fontWeight: 'bold', color: '#ff4d4d' },
  chartTitle: { fontSize: 18, fontWeight: 'bold', marginVertical: 10 },
  chart: { marginVertical: 8, borderRadius: 16 },
  addButton: { backgroundColor: '#00A300', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 12, borderRadius: 8, marginVertical: 15 },
  addButtonText: { color: '#fff', fontWeight: 'bold', marginLeft: 8 },
  historyTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  transactionItem: { padding: 12, borderRadius: 8, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  transactionCat: { fontWeight: 'bold' },
  transactionAmount: { fontSize: 16, fontWeight: 'bold', marginRight: 10 },
  expense: { color: 'red' },
  saving: { color: 'green' },
  modalView: { backgroundColor: 'white', margin: 20, padding: 20, borderRadius: 10, top: '25%', gap: 12 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 8, marginBottom: 10, color: '#000' },
  typeSelector: { flexDirection: 'row', marginBottom: 10, gap: 8 },
  typeBtn: { flex: 1, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#ddd', borderRadius: 8 },
  activeType: { backgroundColor: '#00A30020', borderColor: '#00A300' },
  catChip: { padding: 8, backgroundColor: '#eee', borderRadius: 20, marginRight: 8, marginBottom: 8 },
  selectedCat: { backgroundColor: '#00A300' },
  selectedCatText: { color: '#fff' },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, gap: 10 },
  cancelBtn: { padding: 10, backgroundColor: '#ccc', borderRadius: 8, flex: 1, alignItems: 'center' },
  saveBtn: { padding: 10, backgroundColor: '#00A300', borderRadius: 8, flex: 1, alignItems: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '85%', maxWidth: 400 },
  deleteAllBtn: { backgroundColor: '#ff4444', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 12, borderRadius: 8, marginTop: 20, marginBottom: 10 },
  deleteAllText: { color: 'white', fontWeight: 'bold', marginLeft: 8 },
  budgetActions: { flexDirection: 'row', gap: 12 },
  budgetActionBtn: { padding: 4 },
});