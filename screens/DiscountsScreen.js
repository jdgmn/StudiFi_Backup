import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Alert, Image, ActivityIndicator, ScrollView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { db, auth } from '../firebase';
import { collection, addDoc, query, orderBy, getDocs, deleteDoc, doc, updateDoc, arrayUnion, arrayRemove, getDoc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useSwipeTabNavigation } from '../hooks/useSwipeTabNavigation';
import { uploadToCloudinary } from '../utils/cloudinary';
import { useOffline } from '../context/OfflineContext';

// Cloudinary configuration
const CLOUDINARY_CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

export default function DiscountsScreen() {
  const { user, role, username, profilePicture } = useAuth();
  const userId = user?.uid;
  const { isOfflineMode } = useOffline();

  // Posts state
  const [posts, setPosts] = useState([]);
  const [filteredPosts, setFilteredPosts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMyPosts, setShowMyPosts] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Create post modal
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [store, setStore] = useState('');
  const [discountCode, setDiscountCode] = useState('');
  const [image, setImage] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Comments modal
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState(null);
  const [selectedPostTitle, setSelectedPostTitle] = useState('');
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);

  // Display full image
  const [fullImageVisible, setFullImageVisible] = useState(false);
  const [fullImageUrl, setFullImageUrl] = useState('');

  // Disable swipe gesture when modal open
  const isModalOpen = modalVisible || commentsModalVisible || fullImageVisible;
  const panResponder = useSwipeTabNavigation(!isModalOpen);

  // ---------- Fetch posts ----------
  useEffect(() => {
    if (isOfflineMode) return;
    const q = query(collection(db, 'discounts'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      setPosts(list);
    }, (error) => {
      console.error("Real-time error:", error);
      Alert.alert("Error", "Failed to load discounts in real-time");
    });
    return () => unsubscribe();
  }, [isOfflineMode]);

  useEffect(() => {
    let filtered = [...posts];
    if (searchQuery.trim() !== '') {
      const lower = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.title?.toLowerCase().includes(lower) ||
        p.store?.toLowerCase().includes(lower) ||
        p.description?.toLowerCase().includes(lower)
      );
    }
    if (showMyPosts && userId) {
      filtered = filtered.filter(p => p.userId === userId);
    }
    setFilteredPosts(filtered);
  }, [searchQuery, posts, showMyPosts, userId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshing(false);
  }, []);

  // ---------- Cloudinary upload ----------
  const uploadToCloudinaryLocal = async (uri) => {
    const data = new FormData();
    data.append('file', {
      uri: uri,
      type: 'image/jpeg',
      name: 'upload.jpg',
    });
    data.append('upload_preset', UPLOAD_PRESET);
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: 'POST', body: data, headers: { 'Content-Type': 'multipart/form-data' } }
    );
    const result = await response.json();
    if (result.error) throw new Error(result.error.message);
    return result.secure_url;
  };

  const addPost = async () => {
    if (!title || !description) {
      Alert.alert('Error', 'Title and description are required');
      return;
    }
    let imageUrl = null;
    if (image) {
      setUploading(true);
      try {
        imageUrl = await uploadToCloudinaryLocal(image);
      } catch (err) {
        Alert.alert('Upload Error', err.message);
        setUploading(false);
        return;
      }
      setUploading(false);
    }
    try {
      await addDoc(collection(db, 'discounts'), {
        title,
        description,
        store: store || '',
        discountCode: discountCode || '',
        imageUrl,
        userId,
        userName: username,                // username from AuthContext
        userProfilePic: profilePicture,    // <-- store profile picture URL
        createdAt: new Date().toISOString(),
        likes: [],
        dislikes: [],
        commentCount: 0,
      });
      Alert.alert('Success', 'Discount shared!');
      setModalVisible(false);
      setTitle('');
      setDescription('');
      setStore('');
      setDiscountCode('');
      setImage(null);
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const handleLike = async (postId, currentLikes, currentDislikes) => {
    if (!userId) return;
    const userLiked = currentLikes.includes(userId);
    const userDisliked = currentDislikes.includes(userId);
    const postRef = doc(db, 'discounts', postId);
    if (userLiked) {
      await updateDoc(postRef, { likes: arrayRemove(userId) });
    } else {
      await updateDoc(postRef, {
        likes: arrayUnion(userId),
        dislikes: userDisliked ? arrayRemove(userId) : currentDislikes,
      });
    }
    
  };

  const handleDislike = async (postId, currentLikes, currentDislikes) => {
    if (!userId) return;
    const userLiked = currentLikes.includes(userId);
    const userDisliked = currentDislikes.includes(userId);
    const postRef = doc(db, 'discounts', postId);
    if (userDisliked) {
      await updateDoc(postRef, { dislikes: arrayRemove(userId) });
    } else {
      await updateDoc(postRef, {
        dislikes: arrayUnion(userId),
        likes: userLiked ? arrayRemove(userId) : currentLikes,
      });
    }
    
  };

  const deletePost = async (postId, postUserId) => {
    const isAdmin = role === 'admin';
    if (postUserId !== userId && !isAdmin) {
      Alert.alert('Error', 'You can only delete your own posts');
      return;
    }
    await deleteDoc(doc(db, 'discounts', postId));
  };

  // ---------- Comments ----------
  const loadComments = async (postId) => {
    setLoadingComments(true);
    const q = query(collection(db, 'discounts', postId, 'comments'), orderBy('createdAt', 'asc'));
    const snapshot = await getDocs(q);
    const commentsList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    setComments(commentsList);
    setLoadingComments(false);
  };

  const addComment = async () => {
    if (!newComment.trim()) return;
    try {
      await addDoc(collection(db, 'discounts', selectedPostId, 'comments'), {
        text: newComment.trim(),
        userId,
        userName: username,                // username from AuthContext
        userProfilePic: profilePicture,    // <-- store profile picture URL
        createdAt: new Date().toISOString(),
      });
      const postRef = doc(db, 'discounts', selectedPostId);
      const postSnap = await getDoc(postRef);
      const currentCount = postSnap.data()?.commentCount || 0;
      await updateDoc(postRef, { commentCount: currentCount + 1 });
      setNewComment('');
      loadComments(selectedPostId);
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const deleteComment = async (commentId, commentUserId) => {
    const isAdmin = role === 'admin';
    if (commentUserId !== userId && !isAdmin) {
      Alert.alert('Error', 'You can only delete your own comments');
      return;
    }
    await deleteDoc(doc(db, 'discounts', selectedPostId, 'comments', commentId));
    const postRef = doc(db, 'discounts', selectedPostId);
    const postSnap = await getDoc(postRef);
    const currentCount = postSnap.data()?.commentCount || 0;
    await updateDoc(postRef, { commentCount: Math.max(0, currentCount - 1) });
    loadComments(selectedPostId);
  };

  // ---------- Image picker ----------
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.5,
    });
    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  // ---------- Render each post ----------
  const renderPost = ({ item }) => {
    const likesCount = item.likes?.length || 0;
    const dislikesCount = item.dislikes?.length || 0;
    const userLiked = item.likes?.includes(userId);
    const userDisliked = item.dislikes?.includes(userId);
    const isAdmin = role === 'admin';
    const commentCount = item.commentCount || 0;

    return (
      <View style={styles.postCard} {...panResponder.panHandlers}>
        <View style={styles.postHeader}>
          <View style={styles.userInfo}>
            {item.userProfilePic ? (
              <Image source={{ uri: item.userProfilePic }} style={styles.avatarSmall} />
            ) : (
              <View style={styles.avatarPlaceholderSmall}>
                <Text style={styles.avatarPlaceholderTextSmall}>
                  {(item.userName || '?')[0].toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={styles.userName}>{item.userName || 'User'}</Text>
          </View>
          {(item.userId === userId || role === 'admin') && (
            <TouchableOpacity onPress={() => deletePost(item.id, item.userId)}>
              <Ionicons name="trash" size={20} color="red" />
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.postTitle}>{item.title}</Text>
        {item.store ? <Text style={styles.store}>Store: {item.store}</Text> : null}
        {item.imageUrl && (
          <TouchableOpacity onPress={() => {
            setFullImageUrl(item.imageUrl);
            setFullImageVisible(true);
          }}>
            <Image source={{ uri: item.imageUrl }} style={styles.postImage} />
          </TouchableOpacity>
        )}
        <Text style={styles.description}>{item.description}</Text>
        {item.discountCode ? (
          <View style={styles.codeBox}>
            <Text style={styles.code}>Code: {item.discountCode}</Text>
          </View>
        ) : null}

        <View style={styles.likeDislikeRow}>
          <TouchableOpacity style={styles.likeBtn} onPress={() => handleLike(item.id, item.likes || [], item.dislikes || [])}>
            <Ionicons name={userLiked ? 'thumbs-up' : 'thumbs-up-outline'} size={22} color="#00A300" />
            <Text style={styles.likeCount}>{likesCount}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dislikeBtn} onPress={() => handleDislike(item.id, item.likes || [], item.dislikes || [])}>
            <Ionicons name={userDisliked ? 'thumbs-down' : 'thumbs-down-outline'} size={22} color="#ff4444" />
            <Text style={styles.dislikeCount}>{dislikesCount}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.commentBtn} onPress={() => {
            setSelectedPostId(item.id);
            setSelectedPostTitle(item.title);
            setCommentsModalVisible(true);
            loadComments(item.id);
          }}>
            <Ionicons name="chatbubble-outline" size={22} color="#4c9aff" />
            <Text style={styles.commentCount}>{commentCount}</Text>
          </TouchableOpacity>
        </View>

        {isAdmin && (
          <TouchableOpacity style={styles.adminDeleteBtn} onPress={() => deletePost(item.id, item.userId)}>
            <Text style={styles.adminDeleteText}>Admin Delete</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (isOfflineMode) {
    return (
      <View style={styles.offlineContainer}>
        <Ionicons name="cloud-offline-outline" size={80} color="#888" />
        <Text style={styles.offlineTitle}>Offline Mode</Text>
        <Text style={styles.offlineText}>
          Discounts are not available offline. Turn off offline mode in Profile to use this feature.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#666" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search discounts..."
          placeholderTextColor="#888"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Filter toggles */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterButton, !showMyPosts && styles.activeFilter]}
          onPress={() => setShowMyPosts(false)}
        >
          <Text style={[styles.filterText, !showMyPosts && styles.activeFilterText]}>All Posts</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, showMyPosts && styles.activeFilter]}
          onPress={() => setShowMyPosts(true)}
        >
          <Text style={[styles.filterText, showMyPosts && styles.activeFilterText]}>My Posts</Text>
        </TouchableOpacity>
      </View>

      {/* Create post button */}
      <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)}>
        <Ionicons name="add-circle" size={24} color="white" />
        <Text style={styles.addBtnText}> Share Discount</Text>
      </TouchableOpacity>

      <FlatList
        data={filteredPosts}
        renderItem={renderPost}
        keyExtractor={item => item.id}
        ListEmptyComponent={<Text style={styles.empty}>No discounts yet. Be the first to share!</Text>}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#00A300']} />
        }
      />

      {/* Create Post Modal */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setModalVisible(false)}>
          <TouchableOpacity style={styles.modalContentLarge} activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <ScrollView>
              <Text style={styles.modalTitle}>Share a Discount</Text>
              <TextInput placeholder="Title *" value={title} onChangeText={setTitle} style={styles.input} />
              <TextInput placeholder="Store Name" value={store} onChangeText={setStore} style={styles.input} />
              <TextInput placeholder="Discount Code" value={discountCode} onChangeText={setDiscountCode} style={styles.input} />
              <TextInput placeholder="Description *" value={description} onChangeText={setDescription} multiline style={[styles.input, { height: 80 }]} />
              <TouchableOpacity style={styles.imagePickerBtn} onPress={pickImage}>
                <Ionicons name="image" size={20} color="#00A300" />
                <Text> {image ? 'Change Image' : 'Add Image (optional)'}</Text>
              </TouchableOpacity>
              {image && <Image source={{ uri: image }} style={styles.previewImage} />}
              {uploading && <ActivityIndicator size="small" color="#00A300" />}
              <View style={styles.modalButtons}>
                <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.cancelBtn}><Text>Cancel</Text></TouchableOpacity>
                <TouchableOpacity onPress={addPost} style={styles.saveBtn}><Text style={{ color: '#fff' }}>Share</Text></TouchableOpacity>
              </View>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Comments Modal */}
      <Modal visible={commentsModalVisible} animationType="fade" transparent onRequestClose={() => setCommentsModalVisible(false)}>
        <TouchableOpacity
          style={styles.commentsModalOverlay}
          activeOpacity={1}
          onPress={() => setCommentsModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.commentsModalContent}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.commentsModalTitle}>Comments on "{selectedPostTitle}"</Text>
            {loadingComments ? (
              <ActivityIndicator size="large" color="#00A300" />
            ) : (
              <FlatList
                data={comments}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                  <View style={styles.commentItem}>
                    <View style={styles.commentHeader}>
                      <View style={styles.commentUserInfo}>
                        {item.userProfilePic ? (
                          <Image source={{ uri: item.userProfilePic }} style={styles.avatarTiny} />
                        ) : (
                          <View style={styles.avatarPlaceholderTiny}>
                            <Text style={styles.avatarPlaceholderTextTiny}>
                              {(item.userName || '?')[0].toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <Text style={styles.commentUser}>{item.userName}</Text>
                      </View>
                      {(item.userId === userId || role === 'admin') && (
                        <TouchableOpacity onPress={() => deleteComment(item.id, item.userId)}>
                          <Ionicons name="trash" size={18} color="red" />
                        </TouchableOpacity>
                      )}
                    </View>
                    <Text style={styles.commentText}>{item.text}</Text>
                    <Text style={styles.commentDate}>
                      {new Date(item.createdAt).toLocaleString()}
                    </Text>
                  </View>
                )}
                ListEmptyComponent={<Text style={styles.emptyComments}>No comments yet.</Text>}
              />
            )}
            <View style={styles.addCommentRow}>
              <TextInput
                style={styles.commentInput}
                placeholder="Write a comment..."
                placeholderTextColor="#888"
                value={newComment}
                onChangeText={setNewComment}
              />
              <TouchableOpacity style={styles.postCommentBtn} onPress={addComment}>
                <Ionicons name="send" size={22} color="#00A300" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.closeCommentsBtn}
              onPress={() => {
                setCommentsModalVisible(false);
                setComments([]);
                setNewComment('');
              }}
            >
              <Text style={styles.closeCommentsText}>Close</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Full-screen Image Modal */}
      <Modal visible={fullImageVisible} transparent animationType="fade" onRequestClose={() => setFullImageVisible(false)}>
        <TouchableOpacity style={styles.fullImageOverlay} activeOpacity={1} onPress={() => setFullImageVisible(false)}>
          <Image source={{ uri: fullImageUrl }} style={styles.fullImage} resizeMode="contain" />
          <TouchableOpacity style={styles.closeFullImageBtn} onPress={() => setFullImageVisible(false)}>
            <Ionicons name="close-circle" size={40} color="#fff" />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f5f5f5' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 10, marginBottom: 15, borderWidth: 1, borderColor: '#ddd' },
  searchInput: { flex: 1, paddingVertical: 10, marginLeft: 8, color: '#000' },
  filterRow: { flexDirection: 'row', marginBottom: 15, justifyContent: 'space-between' },
  filterButton: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: '#eee', marginHorizontal: 5, borderRadius: 8 },
  activeFilter: { backgroundColor: '#00A300' },
  filterText: { fontWeight: 'bold', color: '#333' },
  activeFilterText: { color: '#fff' },
  addBtn: { backgroundColor: '#00A300', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 12, borderRadius: 8, marginBottom: 20 },
  addBtnText: { color: '#fff', fontWeight: 'bold' },
  postCard: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 12, elevation: 2 },
  postHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  userInfo: { flexDirection: 'row', alignItems: 'center' },
  avatarSmall: { width: 30, height: 30, borderRadius: 15, marginRight: 8 },
  avatarPlaceholderSmall: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#ccc', justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  avatarPlaceholderTextSmall: { fontSize: 14, fontWeight: 'bold', color: '#fff' },
  userName: { fontWeight: 'bold', fontSize: 14, color: '#333' },
  postTitle: { fontSize: 18, fontWeight: 'bold', color: '#000', marginBottom: 4 },
  store: { fontWeight: '500', color: '#4c9aff', marginBottom: 5 },
  description: { color: '#333', marginVertical: 8 },
  postImage: { width: '100%', height: 200, borderRadius: 8, marginVertical: 8, resizeMode: 'cover' },
  codeBox: { backgroundColor: '#e0f7fa', padding: 8, borderRadius: 6, marginVertical: 8 },
  code: { fontWeight: 'bold', color: '#00695c' },
  likeDislikeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  likeBtn: { flexDirection: 'row', alignItems: 'center', marginRight: 16 },
  dislikeBtn: { flexDirection: 'row', alignItems: 'center', marginRight: 16 },
  likeCount: { marginLeft: 5, fontWeight: 'bold', color: '#00A300' },
  dislikeCount: { marginLeft: 5, fontWeight: 'bold', color: '#ff4444' },
  commentBtn: { flexDirection: 'row', alignItems: 'center' },
  commentCount: { marginLeft: 5, color: '#4c9aff', fontWeight: 'bold' },
  adminDeleteBtn: { marginTop: 8, backgroundColor: '#ff4444', padding: 6, borderRadius: 6, alignItems: 'center' },
  adminDeleteText: { color: '#fff', fontSize: 12 },
  empty: { textAlign: 'center', marginTop: 50, color: '#888' },
  modalScrollContainer: { flexGrow: 1, justifyContent: 'center', paddingVertical: 50 },
  modalView: { backgroundColor: 'white', margin: 20, padding: 20, borderRadius: 10 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, color: '#000' },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 8, marginBottom: 10, color: '#000' },
  imagePickerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 8, marginBottom: 10, backgroundColor: '#f0f0f0' },
  previewImage: { width: '100%', height: 150, borderRadius: 8, marginBottom: 10 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 },
  cancelBtn: { padding: 10, backgroundColor: '#ccc', borderRadius: 8, flex: 1, marginRight: 10, alignItems: 'center' },
  saveBtn: { padding: 10, backgroundColor: '#00A300', borderRadius: 8, flex: 1, alignItems: 'center' },
  commentsModalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  commentsModalContent: { width: '90%', maxHeight: '80%', backgroundColor: '#fff', borderRadius: 10, padding: 20 },
  commentsModalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  commentItem: { marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 8 },
  commentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  commentUserInfo: { flexDirection: 'row', alignItems: 'center' },
  avatarTiny: { width: 24, height: 24, borderRadius: 12, marginRight: 8 },
  avatarPlaceholderTiny: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#ccc', justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  avatarPlaceholderTextTiny: { fontSize: 12, fontWeight: 'bold', color: '#fff' },
  commentUser: { fontWeight: 'bold', color: '#00A300' },
  commentText: { fontSize: 14, color: '#333' },
  commentDate: { fontSize: 10, color: '#888', marginTop: 4 },
  emptyComments: { textAlign: 'center', marginVertical: 20, color: '#888' },
  addCommentRow: { flexDirection: 'row', alignItems: 'center', marginTop: 15, borderTopWidth: 1, borderTopColor: '#ddd', paddingTop: 10 },
  commentInput: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 20, paddingHorizontal: 15, paddingVertical: 8, marginRight: 10, color: '#000' },
  postCommentBtn: { padding: 8 },
  closeCommentsBtn: { marginTop: 15, padding: 10, backgroundColor: '#00A300', borderRadius: 8, alignItems: 'center' },
  closeCommentsText: { color: '#fff', fontWeight: 'bold' },
  fullImageOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  fullImage: { width: '100%', height: '100%' },
  closeFullImageBtn: { position: 'absolute', top: 40, right: 20, backgroundColor: 'transparent', borderRadius: 20, padding: 5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContentLarge: { backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '90%', maxHeight: '80%' },
  commentsModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  commentsModalContent: { width: '90%', maxHeight: '80%', backgroundColor: '#fff', borderRadius: 10, padding: 20 },
  offlineContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#f5f5f5' },
  offlineTitle: { fontSize: 24, fontWeight: 'bold', marginTop: 20, color: '#555' },
  offlineText: { fontSize: 16, textAlign: 'center', marginTop: 10, color: '#888' },
});