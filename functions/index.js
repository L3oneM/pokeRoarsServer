const functions = require('firebase-functions');
const express = require('express');
const { db } = require('./utils/admin');
const app = express();
const FBauth = require('./utils/FBauth');

const cors = require('cors');
app.use(cors());

const {
  getAllRoars,
  postOneRoar,
  getRoar,
  commentOnRoar,
  likeRoar,
  unlikeRoar,
  deleteRoar
} = require('./handlers/roars');

const {
  signup,
  login,
  uploadImage,
  addUserDetails,
  getAuthenticatedUser,
  getUserDetails,
  markNotificationsRead
} = require('./handlers/users');

// OK
app.get('/roars', getAllRoars);
// OK
app.post('/roar', FBauth, postOneRoar);
app.get('/roar/:roarId', getRoar);
// OK
app.post('/roar/:roarId/comment', FBauth, commentOnRoar);
// OK
app.get('/roar/:roarId/like', FBauth, likeRoar);
// OK
app.get('/roar/:roarId/unlike', FBauth, unlikeRoar);
// OK
app.delete('/roar/:roarId', FBauth, deleteRoar);

app.post('/user', FBauth, addUserDetails);
// OK
app.get('/user', FBauth, getAuthenticatedUser);
// OK
app.post('/signup', signup);
// OK
app.post('/login', login);

app.post('/user/image', FBauth, uploadImage);
// OK
app.get('/user/:handle', getUserDetails);
// OK
app.post('/notifications', FBauth, markNotificationsRead);

exports.api = functions.region('europe-west1').https.onRequest(app);

exports.createNotificationOnLike = functions
  .region('europe-west1')
  .firestore.document('likes/{id}')
  .onCreate(snapshot => {
    return db
      .doc(`/roars/${snapshot.data().roarId}`)
      .get()
      .then(doc => {
        if (
          doc.exists &&
          doc.data().userHandle !== snapshot.data().userHandle
        ) {
          return db.doc(`/notifications/${snapshot.id}`).set({
            createdAt: new Date().toISOString(),
            recipient: doc.data().userHandle,
            sender: snapshot.data().userHandle,
            type: 'like',
            read: false,
            roarId: doc.id
          });
        }
      })
      .catch(err => console.error(err));
  });

exports.deleteNotificationOnUnlike = functions
  .region('europe-west1')
  .firestore.document('likes/{id}')
  .onDelete(snapshot => {
    return db
      .doc(`/notifications/${snapshot.id}`)
      .delete()
      .catch(err => {
        console.error(err);
        return;
      });
  });

exports.createNoticationOnComment = functions
  .region('europe-west1')
  .firestore.document('comment/{id}')
  .onCreate(snapshot => {
    return db
      .doc(`/roars/${snapshot.data().roarId}`)
      .get()
      .then(doc => {
        if (
          doc.exists &&
          doc.data().userHandle !== snapshot.data().userHandle
        ) {
          return db.doc(`/notifications/${snapshot.id}`).set({
            createAt: new Date().toISOString(),
            recipient: doc.data().userHandle,
            sender: snapshot.data().userHandle,
            type: 'comment',
            read: false,
            sreamId: doc.id
          });
        }
      })
      .catch(err => {
        console.error(err);
        return;
      });
  });

exports.onUserImageChange = functions
  .region('europe-west1')
  .firestore.document('/users/{userId}')
  .onUpdate(change => {
    if (change.before.data().imageUrl !== change.after.data().imageUrl) {
      let batch = db.batch();
      return db
        .collection('roars')
        .where('userHandle', '==', change.before.data().handle)
        .get()
        .then(data => {
          data.forEach(doc => {
            const roar = db.doc(`/roars/${doc.id}`);
            batch.update(roar, { userImage: change.after.data().imageUrl });
          });
          return batch.commit();
        });
    } else {
      return true;
    }
  });

exports.onSreamDelete = functions
  .region('europe-west1')
  .firestore.document('/roars/{roarId}')
  .onDelete((snapshot, context) => {
    const roarId = context.params.roarId;
    const batch = db.batch();
    return db
      .collection('comments')
      .where('roarId', '==', roarId)
      .get()
      .then(data => {
        data.forEach(doc => {
          batch.delete(db.doc(`/comments/${doc.id}`));
        });
        return db.collection('likes').where('roarId', '==', roarId);
      })
      .then(data => {
        data.forEach(doc => {
          batch.delete(db.doc(`/likes/${doc.id}`));
        });
        return db
          .collection('notifications')
          .where('roarId', '==', roarId)
          .get();
      })
      .then(data => {
        data.forEach(doc => {
          batch.delete(db.doc(`/notifications/${doc.id}`));
        });
        return batch.commit();
      })
      .catch(err => {
        console.error(err);
      });
  });
