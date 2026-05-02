import AsyncStorage from '@react-native-async-storage/async-storage';

const EXPENSES_KEY = '@offline_expenses';
const GOALS_KEY = '@offline_goals';
const DELETED_EXPENSES_KEY = '@offline_deleted_expenses';
const DELETED_GOALS_KEY = '@offline_deleted_goals';
const BUDGET_KEY = '@offline_budget';
const BUDGET_DELETED_KEY = '@offline_budget_deleted';


// Get count of offline items (for UI)
export const getOfflineExpensesCount = async () => {
  const expenses = await getExpensesOffline();
  return expenses.length;
};

export const getOfflineGoalsCount = async () => {
  const goals = await getGoalsOffline();
  return goals.length;
};

// Clear all offline data (after successful sync)
export const clearAllOfflineData = async () => {
  await AsyncStorage.multiRemove([EXPENSES_KEY, GOALS_KEY, BUDGET_KEY, BUDGET_DELETED_KEY]);
};

// Preload Firestore data into AsyncStorage (when going online → offline)
export const preloadOfflineData = async (expenses, goals) => {
  await AsyncStorage.setItem(EXPENSES_KEY, JSON.stringify(expenses));
  await AsyncStorage.setItem(GOALS_KEY, JSON.stringify(goals));
};

// ---------- Expenses ----------
export const saveExpenseOffline = async (expense) => {
  try {
    const existing = await getExpensesOffline();
    const newExpense = { ...expense, id: Date.now().toString() }; // simple ID
    await AsyncStorage.setItem(EXPENSES_KEY, JSON.stringify([newExpense, ...existing]));
    return newExpense;
  } catch (error) {
    console.error('Save expense offline error', error);
    throw error;
  }
};

export const getExpensesOffline = async () => {
  try {
    const data = await AsyncStorage.getItem(EXPENSES_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Get expenses offline error', error);
    return [];
  }
};

export const deleteExpenseOffline = async (expenseId) => {
  try {
    const existing = await getExpensesOffline();
    const filtered = existing.filter(exp => exp.id !== expenseId);
    await AsyncStorage.setItem(EXPENSES_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Delete expense offline error', error);
    throw error;
  }
};

export const updateExpenseOffline = async (expenseId, updates) => {
  try {
    const existing = await getExpensesOffline();
    const updated = existing.map(exp =>
      exp.id === expenseId ? { ...exp, ...updates } : exp
    );
    await AsyncStorage.setItem(EXPENSES_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Update expense offline error', error);
    throw error;
  }
};

export const clearAllExpensesOffline = async () => {
  await AsyncStorage.setItem(EXPENSES_KEY, JSON.stringify([]));
};

export const trackDeletedExpenseOffline = async (expenseData) => {
  try {
    // Remove temporary local id if present
    const { id, ...data } = expenseData;
    const existing = await getDeletedExpensesOffline();
    existing.push(data);
    await AsyncStorage.setItem(DELETED_EXPENSES_KEY, JSON.stringify(existing));
  } catch (error) {
    console.error('Track deleted expense error', error);
  }
};

export const getDeletedExpensesOffline = async () => {
  const data = await AsyncStorage.getItem(DELETED_EXPENSES_KEY);
  return data ? JSON.parse(data) : [];
};

export const clearDeletedExpensesOffline = async () => {
  await AsyncStorage.setItem(DELETED_EXPENSES_KEY, JSON.stringify([]));
};

// ---------- Goals ----------
export const saveGoalOffline = async (goal) => {
  try {
    const existing = await getGoalsOffline();
    const newGoal = { ...goal, id: Date.now().toString(), currentAmount: 0 };
    await AsyncStorage.setItem(GOALS_KEY, JSON.stringify([newGoal, ...existing]));
    return newGoal;
  } catch (error) {
    console.error('Save goal offline error', error);
    throw error;
  }
};

export const getGoalsOffline = async () => {
  try {
    const data = await AsyncStorage.getItem(GOALS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Get goals offline error', error);
    return [];
  }
};

export const updateGoalOffline = async (goalId, currentAmount) => {
  try {
    const existing = await getGoalsOffline();
    const updated = existing.map(goal =>
      goal.id === goalId ? { ...goal, currentAmount } : goal
    );
    await AsyncStorage.setItem(GOALS_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Update goal offline error', error);
    throw error;
  }
};

export const deleteGoalOffline = async (goalId) => {
  try {
    const existing = await getGoalsOffline();
    const filtered = existing.filter(goal => goal.id !== goalId);
    await AsyncStorage.setItem(GOALS_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Delete goal offline error', error);
    throw error;
  }
};

export const clearAllGoalsOffline = async () => {
  await AsyncStorage.setItem(GOALS_KEY, JSON.stringify([]));
};

export const trackDeletedGoalOffline = async (goalData) => {
  try {
    const { id, ...data } = goalData;
    const existing = await getDeletedGoalsOffline();
    existing.push(data);
    await AsyncStorage.setItem(DELETED_GOALS_KEY, JSON.stringify(existing));
  } catch (error) {
    console.error('Track deleted goal error', error);
  }
};

export const getDeletedGoalsOffline = async () => {
  const data = await AsyncStorage.getItem(DELETED_GOALS_KEY);
  return data ? JSON.parse(data) : [];
};

export const clearDeletedGoalsOffline = async () => {
  await AsyncStorage.setItem(DELETED_GOALS_KEY, JSON.stringify([]));
};

// ---------- Budget ----------
export const saveBudgetOffline = async (budgetData) => {
  await AsyncStorage.setItem(BUDGET_KEY, JSON.stringify(budgetData));
  await AsyncStorage.setItem(BUDGET_DELETED_KEY, 'false');
};

export const getBudgetOffline = async () => {
  const data = await AsyncStorage.getItem(BUDGET_KEY);
  return data ? JSON.parse(data) : null;
};

export const clearBudgetOffline = async () => {
  await AsyncStorage.removeItem(BUDGET_KEY);
  await AsyncStorage.setItem(BUDGET_DELETED_KEY, 'true');
};

export const wasBudgetDeletedOffline = async () => {
  const deleted = await AsyncStorage.getItem(BUDGET_DELETED_KEY);
  return deleted === 'true';
};

export const clearBudgetDeletedFlag = async () => {
  await AsyncStorage.setItem(BUDGET_DELETED_KEY, 'false');
};

export const preloadBudgetOffline = async (budgetData) => {
  if (budgetData) {
    await saveBudgetOffline(budgetData);
  } else {
    await clearBudgetOffline(); // no budget in cloud → clear local
  }
};