import { collection, addDoc, query, where, getDocs, updateDoc, doc, deleteDoc, writeBatch, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { getExpensesOffline, getGoalsOffline, clearAllOfflineData, getDeletedExpensesOffline, getDeletedGoalsOffline, clearDeletedExpensesOffline, clearDeletedGoalsOffline, getBudgetOffline, wasBudgetDeletedOffline, clearBudgetDeletedFlag } from './offlineStorage';

// Helper: delete expense by exact data match
const deleteExpenseByData = async (userId, expense) => {
  const q = query(
    collection(db, 'expenses'),
    where('userId', '==', userId),
    where('amount', '==', expense.amount),
    where('category', '==', expense.category),
    where('type', '==', expense.type),
    where('date', '==', expense.date)
  );
  const snapshot = await getDocs(q);
  const batch = writeBatch(db);
  snapshot.docs.forEach(docSnap => {
    batch.delete(docSnap.ref);
  });
  await batch.commit();
};

// Helper: delete goal by exact data match
const deleteGoalByData = async (userId, goal) => {
  const q = query(
    collection(db, 'goals'),
    where('userId', '==', userId),
    where('title', '==', goal.title),
    where('targetAmount', '==', goal.targetAmount)
  );
  const snapshot = await getDocs(q);
  const batch = writeBatch(db);
  snapshot.docs.forEach(docSnap => {
    batch.delete(docSnap.ref);
  });
  await batch.commit();
};

// Expense duplicate check
const expenseExists = async (userId, expense) => {
  const q = query(
    collection(db, 'expenses'),
    where('userId', '==', userId),
    where('amount', '==', expense.amount),
    where('category', '==', expense.category),
    where('type', '==', expense.type),
    where('date', '==', expense.date)
  );
  const snapshot = await getDocs(q);
  return !snapshot.empty;
};

export const syncOfflineToCloud = async (userId) => {
  if (!userId) throw new Error('User not authenticated');

  const offlineExpenses = await getExpensesOffline();
  const offlineGoals = await getGoalsOffline();

  let uploadedExpenses = 0;
  let updatedGoals = 0;
  let createdGoals = 0;

  // Upload non‑duplicate expenses
  for (const exp of offlineExpenses) {
    const exists = await expenseExists(userId, exp);
    if (!exists) {
      const { id, ...expenseData } = exp;
      await addDoc(collection(db, 'expenses'), {
        ...expenseData,
        userId,
      });
      uploadedExpenses++;
    }
  }

  // Sync goals: take the MAX currentAmount
  for (const goal of offlineGoals) {
    const q = query(
      collection(db, 'goals'),
      where('userId', '==', userId),
      where('title', '==', goal.title),
      where('targetAmount', '==', goal.targetAmount)
    );
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const cloudGoal = snapshot.docs[0];
      const cloudAmount = cloudGoal.data().currentAmount || 0;
      const offlineAmount = goal.currentAmount || 0;
      if (offlineAmount > cloudAmount) {
        await updateDoc(doc(db, 'goals', cloudGoal.id), { currentAmount: offlineAmount });
      }
      updatedGoals++;
    } else {
      const { id, ...goalData } = goal;
      await addDoc(collection(db, 'goals'), {
        ...goalData,
        userId,
        currentAmount: goal.currentAmount || 0,
      });
      createdGoals++;
    }
  }

  const offlineBudget = await getBudgetOffline();
  const budgetDeleted = await wasBudgetDeletedOffline();
  if (budgetDeleted) {
    await deleteDoc(doc(db, 'budgets', userId));
    await clearBudgetDeletedFlag();
  } else if (offlineBudget) {
    const budgetRef = doc(db, 'budgets', userId);
    await setDoc(budgetRef, offlineBudget);
    await clearBudgetDeletedFlag();
  }

  const deletedExpenses = await getDeletedExpensesOffline();
  for (const expData of deletedExpenses) {
    await deleteExpenseByData(userId, expData);
  }
  await clearDeletedExpensesOffline();

  const deletedGoals = await getDeletedGoalsOffline();
  for (const goalData of deletedGoals) {
    await deleteGoalByData(userId, goalData);
  }
  await clearDeletedGoalsOffline();

  await clearAllOfflineData();
  return {
    expensesCount: uploadedExpenses,
    goalsCreated: createdGoals,
    goalsUpdated: updatedGoals,
    deletedExpensesCount: deletedExpenses.length,
    deletedGoalsCount: deletedGoals.length,
  };
};