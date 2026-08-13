importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyA237FUvmXmEXDuhs7Mz2cO1TV6kmEsqo0",
  authDomain: "chat-app-accc3.firebaseapp.com",
  projectId: "chat-app-accc3",
  storageBucket: "chat-app-accc3.firebasestorage.app",
  messagingSenderId: "240530471180",
  appId: "1:240530471180:web:58db290f9ce9b430f6b129"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  console.log('Mensaje recibido en segundo plano:', payload);
  const notificationTitle = payload.notification?.title || 'Club de Tenis Quilicura';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: '/icon-192.png'
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
});
