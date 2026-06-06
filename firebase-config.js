// js/firebase-config.js
'use strict';

const firebaseConfig = {
  apiKey:            "AIzaSyAma_g6BhL8nuM2kqECH7fEJjLooyvh-iE",
  authDomain:        "smart-reception-6f909.firebaseapp.com",
  projectId:         "smart-reception-6f909",
  storageBucket:     "smart-reception-6f909.firebasestorage.app",
  messagingSenderId: "1068812724582",
  appId:             "1:1068812724582:web:5654dde3c5d60ed90680a7",
  measurementId:     "G-Q3P1N67VNL"
};

firebase.initializeApp(firebaseConfig);

const db   = firebase.firestore();
const auth = firebase.auth();

db.settings({ ignoreUndefinedProperties: true });

// ============================================================
//  EmailJS 設定
//  EmailJS Dashboard → Account → Public Key に差し替えてください
// ============================================================
const EMAILJS_CONFIG = {
  publicKey:        "YOUR_EMAILJS_PUBLIC_KEY",
  serviceId:        "YOUR_EMAILJS_SERVICE_ID",
  templateInvite:   "template_invite",
  templateReminder: "template_reminder",
  templateCheckin:  "template_checkin",
  templateCheckout: "template_checkout",
  templateAlert:    "template_alert",
  templateApproval: "template_approval"
};
