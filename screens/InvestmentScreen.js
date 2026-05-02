import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Alert, ScrollView, Linking, Dimensions, Image, ActivityIndicator, RefreshControl } from 'react-native';
import { db } from '../firebase';
import { collection, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { uploadToCloudinary } from '../utils/cloudinary';
import { useSwipeTabNavigation } from '../hooks/useSwipeTabNavigation';
import { useOffline } from '../context/OfflineContext';

const { width } = Dimensions.get('window');

export default function InvestmentScreen() {
  const { user, role } = useAuth();
  const userId = user?.uid;
  const { isOfflineMode } = useOffline();
  const [contents, setContents] = useState([]);
  const [adminModal, setAdminModal] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('article');
  const [body, setBody] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [thumbnail, setThumbnail] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [contentImages, setContentImages] = useState([]); // article inline images
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState({
    question: '',
    options: ['', '', '', ''],
    correct: '',
    image: null
  });
  const [selectedContent, setSelectedContent] = useState(null);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  //Disable swipe gesture when modal open
  const isModalOpen = adminModal || selectedContent !== null || selectedArticle !== null;
  const panResponder = useSwipeTabNavigation(!isModalOpen);

  useEffect(() => {
    if (!isOfflineMode) {
      fetchContents();
    }
  }, [isOfflineMode]);

  useEffect(() => {
    fetchContents();
    (async () => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow access to your photos to add images.');
      }
    })();
  }, []);

  const fetchContents = async () => {
    const snapshot = await getDocs(collection(db, 'investmentContent'));
    setContents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchContents();  // existing fetch function
    setRefreshing(false);
  }, []);

  const pickImage = async (setter) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
    });
    if (!result.canceled) {
      setter(result.assets[0].uri);
    }
  };

  const addContentImage = async () => {
    const uri = await new Promise((resolve) => {
      ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
      }).then(result => {
        if (!result.canceled) resolve(result.assets[0].uri);
        else resolve(null);
      });
    });
    if (uri) {
      setContentImages([...contentImages, uri]);
    }
  };

  const addQuizQuestion = async () => {
    if (!currentQuestion.question || !currentQuestion.correct) {
      Alert.alert('Error', 'Enter question and correct answer');
      return;
    }
    let imageUrl = null;
    if (currentQuestion.image) {
      setUploading(true);
      try {
        imageUrl = await uploadToCloudinary(currentQuestion.image);
      } catch (err) {
        Alert.alert('Upload Error', err.message);
        setUploading(false);
        return;
      }
      setUploading(false);
    }
    setQuizQuestions([...quizQuestions, {
      ...currentQuestion,
      options: currentQuestion.options.filter(o => o !== ''),
      image: imageUrl
    }]);
    setCurrentQuestion({
      question: '',
      options: ['', '', '', ''],
      correct: '',
      image: null
    });
  };

  const saveContent = async () => {
    if (!title) {
      Alert.alert('Error', 'Title is required');
      return;
    }
    if (type === 'article' && !body) {
      Alert.alert('Error', 'Article body required');
      return;
    }
    if (type === 'video' && !videoUrl) {
      Alert.alert('Error', 'Video URL required');
      return;
    }
    if (type === 'quiz' && quizQuestions.length === 0) {
      Alert.alert('Error', 'Add at least one question');
      return;
    }

    setUploading(true);
    try {
      // Upload thumbnail if provided
      let thumbnailUrl = null;
      if (thumbnail) {
        thumbnailUrl = await uploadToCloudinary(thumbnail);
      }

      // Upload article content images
      let uploadedContentImages = [];
      if (type === 'article' && contentImages.length > 0) {
        for (let imgUri of contentImages) {
          const url = await uploadToCloudinary(imgUri);
          uploadedContentImages.push(url);
        }
      }

      const contentData = {
        title,
        type,
        description: description || '',
        createdAt: new Date().toISOString(),
        createdBy: userId,
        thumbnail: thumbnailUrl,
        ...(type === 'article' && { body, contentImages: uploadedContentImages }),
        ...(type === 'video' && { videoUrl }),
        ...(type === 'quiz' && { questions: quizQuestions }),
      };
      await addDoc(collection(db, 'investmentContent'), contentData);
      Alert.alert('Success', 'Content created!');
      resetForm();
      fetchContents();
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setAdminModal(false);
    setTitle('');
    setDescription('');
    setBody('');
    setVideoUrl('');
    setThumbnail(null);
    setContentImages([]);
    setQuizQuestions([]);
  };

  const deleteContent = async (id) => {
    Alert.alert(
      'Delete Content',
      'Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteDoc(doc(db, 'investmentContent', id));
            fetchContents();
          }
        }
      ]
    );
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'article': return 'document-text-outline';
      case 'video': return 'videocam-outline';
      case 'quiz': return 'help-circle-outline';
      default: return 'apps-outline';
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'article': return '#2196F3';
      case 'video': return '#FF9800';
      case 'quiz': return '#4CAF50';
      default: return '#00A300';
    }
  };

  const renderContent = ({ item }) => (
    <TouchableOpacity
      activeOpacity={0.7}
      style={styles.contentCard}
      onPress={() => {
        if (item.type === 'article') setSelectedArticle(item);
        else if (item.type === 'video') Linking.openURL(item.videoUrl);
        else if (item.type === 'quiz') setSelectedContent(item);
      }}
    >
      <View style={styles.cardHeader}>
        {item.thumbnail ? (
          <Image source={{ uri: item.thumbnail }} style={styles.thumbnail} />
        ) : (
          <View style={[styles.typeIconContainer, { backgroundColor: getTypeColor(item.type) + '20' }]}>
            <Ionicons name={getTypeIcon(item.type)} size={24} color={getTypeColor(item.type)} />
          </View>
        )}
        <View style={styles.cardTitleContainer}>
          <Text style={styles.contentTitle}>{item.title || 'Untitled'}</Text>
          {item.description ? <Text style={styles.descriptionText}>{item.description}</Text> : null}
          <View style={styles.badgeRow}>
            <View style={[styles.typeBadge, { backgroundColor: getTypeColor(item.type) + '10' }]}>
              <Text style={[styles.typeBadgeText, { color: getTypeColor(item.type) }]}>{item.type.toUpperCase()}</Text>
            </View>
          </View>
        </View>
        {role === 'admin' && (
          <TouchableOpacity onPress={() => deleteContent(item.id)} style={styles.deleteBtn}>
            <Ionicons name="trash-outline" size={20} color="#ff4444" />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );

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
    <View style={styles.container} {...panResponder.panHandlers}>
      {role === 'admin' && (
        <LinearGradient
          colors={['#FF9800', '#F57C00']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.adminBtnGradient}
        >
          <TouchableOpacity style={styles.adminBtn} onPress={() => setAdminModal(true)}>
            <Ionicons name="add-circle" size={28} color="white" />
            <Text style={styles.adminBtnText}> Create Learning Content</Text>
          </TouchableOpacity>
        </LinearGradient>
      )}

      <FlatList
        data={contents}
        renderItem={renderContent}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#00A300']} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="school-outline" size={80} color="#ccc" />
            <Text style={styles.emptyTitle}>No investment content yet</Text>
            <Text style={styles.emptySubtitle}>Check back later for new articles, videos, and quizzes!</Text>
            {role === 'admin' && (
              <TouchableOpacity style={styles.emptyAdminBtn} onPress={() => setAdminModal(true)}>
                <Text style={styles.emptyAdminBtnText}>+ Create First Content</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />

      {/* Admin Create Modal */}
      <Modal visible={adminModal} animationType="slide" transparent onRequestClose={() => setAdminModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setAdminModal(false)}>
          <TouchableOpacity style={styles.modalContentLarge} activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <ScrollView showsVerticalScrollIndicator={true}>
              {/* Removed redundant <View style={styles.modalContainer}> */}
              <Text style={styles.modalTitle}>✨ Create Investment Content</Text>
              <TextInput placeholder="Title" placeholderTextColor="#999" value={title} onChangeText={setTitle} style={styles.input} />
              <TextInput placeholder="Short description (optional)" placeholderTextColor="#999" value={description} onChangeText={setDescription} style={styles.input} />

              {/* Thumbnail picker */}
              <TouchableOpacity style={styles.imagePickerBtn} onPress={() => pickImage(setThumbnail)}>
                <Ionicons name="image-outline" size={20} color="#00A300" />
                <Text style={styles.imagePickerText}>{thumbnail ? 'Change Thumbnail' : 'Add Thumbnail (optional)'}</Text>
              </TouchableOpacity>
              {thumbnail && <Image source={{ uri: thumbnail }} style={styles.previewImage} />}

              <View style={styles.typeSelect}>
                <TouchableOpacity style={[styles.typeOption, type === 'article' && styles.activeTypeOption]} onPress={() => setType('article')}>
                  <Ionicons name="document-text-outline" size={20} color={type === 'article' ? '#fff' : '#00A300'} />
                  <Text style={[styles.typeOptionText, type === 'article' && styles.activeTypeText]}>Article</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.typeOption, type === 'video' && styles.activeTypeOption]} onPress={() => setType('video')}>
                  <Ionicons name="videocam-outline" size={20} color={type === 'video' ? '#fff' : '#00A300'} />
                  <Text style={[styles.typeOptionText, type === 'video' && styles.activeTypeText]}>Video</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.typeOption, type === 'quiz' && styles.activeTypeOption]} onPress={() => setType('quiz')}>
                  <Ionicons name="help-circle-outline" size={20} color={type === 'quiz' ? '#fff' : '#00A300'} />
                  <Text style={[styles.typeOptionText, type === 'quiz' && styles.activeTypeText]}>Quiz</Text>
                </TouchableOpacity>
              </View>

              {type === 'article' && (
                <>
                  <TextInput placeholder="Article body" placeholderTextColor="#999" multiline style={[styles.input, styles.textArea]} value={body} onChangeText={setBody} />
                  <TouchableOpacity style={styles.imagePickerBtn} onPress={addContentImage}>
                    <Ionicons name="add-circle-outline" size={20} color="#00A300" />
                    <Text style={styles.imagePickerText}>Add Image to Article</Text>
                  </TouchableOpacity>
                  <View style={styles.imageRow}>
                    {contentImages.map((img, idx) => (
                      <Image key={idx} source={{ uri: img }} style={styles.previewImageSmall} />
                    ))}
                  </View>
                </>
              )}

              {type === 'video' && (
                <TextInput placeholder="Video URL (YouTube, Vimeo, etc.)" placeholderTextColor="#999" value={videoUrl} onChangeText={setVideoUrl} style={styles.input} />
              )}

              {type === 'quiz' && (
                <>
                  <Text style={styles.sectionTitle}>📝 Build Your Quiz</Text>
                  <View style={styles.quizBuilder}>
                    <TextInput placeholder="Question" placeholderTextColor="#999" value={currentQuestion.question} onChangeText={(t) => setCurrentQuestion({ ...currentQuestion, question: t })} style={styles.input} />
                    <TouchableOpacity style={styles.imagePickerBtnSmall} onPress={() => pickImage((uri) => setCurrentQuestion({ ...currentQuestion, image: uri }))}>
                      <Ionicons name="image-outline" size={16} color="#00A300" />
                      <Text style={styles.imagePickerTextSmall}>{currentQuestion.image ? 'Change Question Image' : 'Add Image to Question (optional)'}</Text>
                    </TouchableOpacity>
                    {currentQuestion.image && <Image source={{ uri: currentQuestion.image }} style={styles.previewImageSmall} />}
                    {currentQuestion.options.map((opt, idx) => (
                      <TextInput key={idx} placeholder={`Option ${idx+1}`} placeholderTextColor="#999" value={opt} onChangeText={(t) => {
                        const newOpts = [...currentQuestion.options];
                        newOpts[idx] = t;
                        setCurrentQuestion({ ...currentQuestion, options: newOpts });
                      }} style={[styles.input, styles.optionInput]} />
                    ))}
                    <TextInput placeholder="Correct answer (exact match)" placeholderTextColor="#999" value={currentQuestion.correct} onChangeText={(t) => setCurrentQuestion({ ...currentQuestion, correct: t })} style={styles.input} />
                    <TouchableOpacity style={styles.addQuestionBtn} onPress={addQuizQuestion} disabled={uploading}>
                      {uploading ? <ActivityIndicator size="small" color="#00A300" /> : (
                        <>
                          <Ionicons name="add-circle-outline" size={20} color="#00A300" />
                          <Text style={styles.addQuestionBtnText}>Add Question</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    {quizQuestions.length > 0 && (
                      <View style={styles.questionList}>
                        <Text style={styles.questionListTitle}>📋 Added Questions ({quizQuestions.length})</Text>
                        {quizQuestions.map((q, idx) => (
                          <Text key={idx} style={styles.questionListItem}>{idx+1}. {q.question}</Text>
                        ))}
                      </View>
                    )}
                  </View>
                </>
              )}

              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.cancelBtn} onPress={resetForm}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={saveContent} disabled={uploading}>
                  {uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Publish Content</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Quiz Modal */}
      {selectedContent && (
        <Modal visible={true} animationType="slide" transparent onRequestClose={() => setSelectedContent(null)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSelectedContent(null)}>
            <TouchableOpacity style={styles.modalContentLarge} activeOpacity={1} onPress={(e) => e.stopPropagation()}>
              <ScrollView>
                <View style={styles.quizHeader}>
                  <Text style={styles.quizTitle}>{selectedContent.title}</Text>
                  <TouchableOpacity onPress={() => { setSelectedContent(null); setQuizAnswers({}); }}>
                    <Ionicons name="close-circle" size={32} color="#00A300" />
                  </TouchableOpacity>
                </View>
                {selectedContent.questions.map((q, idx) => (
                  <View key={idx} style={styles.quizQuestionCard}>
                    {q.image && <Image source={{ uri: q.image }} style={styles.questionImage} />}
                    <Text style={styles.questionText}>{idx+1}. {q.question}</Text>
                    {q.options.map((opt, optIdx) => (
                      <TouchableOpacity key={optIdx} style={[styles.quizOption, quizAnswers[`${idx}`] === opt && styles.selectedQuizOption]} onPress={() => setQuizAnswers({ ...quizAnswers, [idx]: opt })}>
                        <Text style={quizAnswers[`${idx}`] === opt ? styles.selectedOptionText : styles.optionText}>{opt}</Text>
                        {quizAnswers[`${idx}`] === opt && <Ionicons name="checkmark-circle" size={20} color="#fff" />}
                      </TouchableOpacity>
                    ))}
                    {quizAnswers[`${idx}`] && (
                      <View style={styles.feedbackContainer}>
                        <Text style={styles.feedbackText}>{quizAnswers[`${idx}`] === q.correct ? '✅ Correct!' : `❌ Incorrect. Correct: ${q.correct}`}</Text>
                      </View>
                    )}
                  </View>
                ))}
                <TouchableOpacity style={styles.closeQuizBtn} onPress={() => setSelectedContent(null)}>
                  <Text style={styles.closeQuizBtnText}>Close Quiz</Text>
                </TouchableOpacity>
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
      
      {/* Article Modal */}
      {selectedArticle && (
        <Modal visible={true} animationType="slide" transparent onRequestClose={() => setSelectedArticle(null)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSelectedArticle(null)}>
            <TouchableOpacity style={styles.modalContentLarge} activeOpacity={1} onPress={(e) => e.stopPropagation()}>
              <ScrollView>
                <View style={styles.articleHeader}>
                  <Text style={styles.articleTitle}>{selectedArticle.title}</Text>
                  <TouchableOpacity onPress={() => setSelectedArticle(null)}>
                    <Ionicons name="close-circle" size={32} color="#00A300" />
                  </TouchableOpacity>
                </View>
                {selectedArticle.description ? (
                  <Text style={styles.articleDescription}>{selectedArticle.description}</Text>
                ) : null}
                {selectedArticle.thumbnail && (
                  <Image source={{ uri: selectedArticle.thumbnail }} style={styles.articleThumbnail} />
                )}
                <Text style={styles.articleBody}>{selectedArticle.body}</Text>
                {selectedArticle.contentImages && selectedArticle.contentImages.length > 0 && (
                  <View style={styles.articleImagesContainer}>
                    <Text style={styles.imagesTitle}>📸 Images</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {selectedArticle.contentImages.map((imgUrl, idx) => (
                        <TouchableOpacity
                          key={idx}
                          onPress={() => Linking.openURL(imgUrl)}
                          activeOpacity={0.8}
                        >
                          <Image source={{ uri: imgUrl }} style={styles.articleImage} />
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
                <TouchableOpacity style={styles.closeArticleBtn} onPress={() => setSelectedArticle(null)}>
                  <Text style={styles.closeArticleBtnText}>Close</Text>
                </TouchableOpacity>
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  adminBtnGradient: { margin: 16, marginBottom: 8, borderRadius: 12, overflow: 'hidden', elevation: 3 },
  adminBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 14, backgroundColor: 'transparent' },
  adminBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16, marginLeft: 10 },
  listContainer: { padding: 16, paddingTop: 8 },
  contentCard: { backgroundColor: '#fff', borderRadius: 16, marginBottom: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  thumbnail: { width: 50, height: 50, borderRadius: 8, marginRight: 12 },
  typeIconContainer: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  cardTitleContainer: { flex: 1, flexShrink: 1 },
  contentTitle: { fontSize: 18, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 4 },
  descriptionText: { fontSize: 12, color: '#666', marginTop: 2, flexWrap: 'wrap', flexShrink: 1 },
  badgeRow: { flexDirection: 'row' },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, alignSelf: 'flex-start' },
  typeBadgeText: { fontSize: 10, fontWeight: '600' },
  deleteBtn: { padding: 8 },
  cardFooter: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f0f0f0', alignItems: 'flex-end' },
  viewText: { color: '#00A300', fontWeight: '500', fontSize: 14 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', color: '#555', marginTop: 16 },
  emptySubtitle: { fontSize: 14, color: '#888', textAlign: 'center', marginTop: 8, marginBottom: 24 },
  emptyAdminBtn: { backgroundColor: '#00A300', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 30 },
  emptyAdminBtnText: { color: '#fff', fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center' },
  modalScrollContainer: { flexGrow: 1, justifyContent: 'center', paddingVertical: 20 },
  modalContainer: { backgroundColor: '#fff', marginHorizontal: 20, borderRadius: 24, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 5 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 20, color: '#00A300' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 12, marginBottom: 16, fontSize: 16, color: '#000' },
  textArea: { height: 120, textAlignVertical: 'top' },
  typeSelect: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24, gap: 12 },
  typeOption: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 40, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#f9f9f9', gap: 6 },
  activeTypeOption: { backgroundColor: '#00A300', borderColor: '#00A300' },
  typeOptionText: { fontWeight: '500', color: '#333' },
  activeTypeText: { color: '#fff' },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginTop: 8, marginBottom: 12, color: '#333' },
  quizBuilder: { backgroundColor: '#f8f8f8', borderRadius: 16, padding: 12, marginBottom: 16 },
  optionInput: { marginBottom: 8 },
  addQuestionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, backgroundColor: '#f0f0f0', borderRadius: 40, marginTop: 8, gap: 6 },
  addQuestionBtnText: { color: '#00A300', fontWeight: '600' },
  questionList: { marginTop: 16, backgroundColor: '#fff', borderRadius: 12, padding: 12 },
  questionListTitle: { fontWeight: 'bold', marginBottom: 8, color: '#333' },
  questionListItem: { fontSize: 13, color: '#555', marginBottom: 4 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 40, backgroundColor: '#f0f0f0', alignItems: 'center' },
  cancelBtnText: { color: '#666', fontWeight: '500' },
  saveBtn: { flex: 1, paddingVertical: 12, borderRadius: 40, backgroundColor: '#00A300', alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: 'bold' },
  quizModalContainer: { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 24, padding: 20, marginVertical: 40 },
  quizHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  quizTitle: { fontSize: 20, fontWeight: 'bold', color: '#00A300', flex: 1 },
  quizQuestionCard: { backgroundColor: '#f9f9f9', borderRadius: 16, padding: 16, marginBottom: 16 },
  questionText: { fontSize: 16, fontWeight: '600', marginBottom: 12, color: '#1a1a1a' },
  quizOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 40, marginBottom: 8, borderWidth: 1, borderColor: '#e0e0e0' },
  selectedQuizOption: { backgroundColor: '#00A300', borderColor: '#00A300' },
  optionText: { color: '#333', fontSize: 14 },
  selectedOptionText: { color: '#fff', fontSize: 14, fontWeight: '500' },
  feedbackContainer: { marginTop: 12, padding: 12, backgroundColor: '#f0f0f0', borderRadius: 12 },
  feedbackText: { fontSize: 13, color: '#333' },
  closeQuizBtn: { backgroundColor: '#00A300', paddingVertical: 14, borderRadius: 40, alignItems: 'center', marginTop: 16 },
  closeQuizBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  imagePickerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f0f0', padding: 12, borderRadius: 40, marginBottom: 12, gap: 8 },
  imagePickerText: { color: '#00A300', fontWeight: '500' },
  imagePickerBtnSmall: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  imagePickerTextSmall: { fontSize: 12, color: '#00A300' },
  previewImage: { width: '100%', height: 150, borderRadius: 12, marginBottom: 12, resizeMode: 'cover' },
  previewImageSmall: { width: 80, height: 80, borderRadius: 8, marginRight: 8, marginBottom: 8 },
  questionImage: { width: '100%', height: 150, borderRadius: 12, marginBottom: 12, resizeMode: 'cover' },
  imageRow: { flexDirection: 'row', flexWrap: 'wrap' },
  articleModalContainer: { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 24, padding: 20, marginVertical: 40 },
  articleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  articleTitle: { fontSize: 24, fontWeight: 'bold', color: '#00A300', flex: 1 },
  articleDescription: { fontSize: 14, color: '#555', marginBottom: 16, fontStyle: 'italic' },
  articleThumbnail: { width: '100%', height: 200, borderRadius: 16, marginBottom: 16, resizeMode: 'cover' },
  articleBody: { fontSize: 16, lineHeight: 24, color: '#1a1a1a', marginBottom: 20 },
  articleImagesContainer: { marginBottom: 20 },
  imagesTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12, color: '#333' },
  articleImage: { width: 200, height: 200, borderRadius: 12, marginRight: 12, resizeMode: 'cover' },
  closeArticleBtn: { backgroundColor: '#00A300', paddingVertical: 14, borderRadius: 40, alignItems: 'center', marginTop: 8 },
  closeArticleBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContentLarge: { backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '90%', maxHeight: '80%' },
  offlineContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#f5f5f5' },
  offlineTitle: { fontSize: 24, fontWeight: 'bold', marginTop: 20, color: '#555' },
  offlineText: { fontSize: 16, textAlign: 'center', marginTop: 10, color: '#888' },
});