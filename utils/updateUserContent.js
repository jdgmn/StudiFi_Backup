import { db } from '../firebase';
import { collection, query, where, getDocs, writeBatch } from 'firebase/firestore';

/**
 * Update all discount posts and comments by a user.
 * @param {string} userId - The user's UID.
 * @param {object} updates - The fields to update, e.g., { userName: 'NewName' } or { userProfilePic: 'url' }.
 */
export const updateUserDiscountContent = async (userId, updates) => {
  if (!userId) return;

  // Get all discount posts by this user
  const postsQuery = query(collection(db, 'discounts'), where('userId', '==', userId));
  const postsSnap = await getDocs(postsQuery);

  for (const postDoc of postsSnap.docs) {
    const batch = writeBatch(db);
    // Update the post itself
    batch.update(postDoc.ref, updates);

    // Update all comments under this post where commenter is the user
    const commentsQuery = query(
      collection(db, 'discounts', postDoc.id, 'comments'),
      where('userId', '==', userId)
    );
    const commentsSnap = await getDocs(commentsQuery);
    commentsSnap.docs.forEach(commentDoc => {
      batch.update(commentDoc.ref, updates);
    });

    await batch.commit(); // commit batch for each post (separate batches to avoid large transactions)
  }
};