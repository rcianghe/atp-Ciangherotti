importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// Configuración de tu proyecto Firebase
firebase.initializeApp({
  apiKey: "AIzaSyA237FUvmXmEXDuhs7Mz2c0...", // Tómala de Firebase Project Settings
  authDomain: "chat-app-accc3.firebaseapp.com",
  projectId: "chat-app-accc3",
  storageBucket: "chat-app-accc3.firebasestorage.app",
  messagingSenderId: "240530471180",
  appId: "1:240530471180:web:58db290f9c..."
});

const messaging = firebase.messaging();

// Manejar notificaciones en segundo plano (pantalla bloqueada / app cerrada)
messaging.onBackgroundMessage(function(payload) {
  const notificationTitle = payload.notification?.title || 'Club Tenis Estadio Quilicura';
  const notificationOptions = {
    body: payload.notification?.body || '¡Hay novedades en el ranking/escalerilla!',
    icon: '/icon-192.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
