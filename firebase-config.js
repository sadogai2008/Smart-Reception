// js/firebase-config.js
// ============================================================
//  ★ ここにご自身のFirebaseプロジェクト設定を貼り付けてください
//  Firebase Console → プロジェクト設定 → マイアプリ → CDN
// ============================================================

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Firebase 初期化
firebase.initializeApp(firebaseConfig);

// グローバルに公開
const db = firebase.firestore();
const auth = firebase.auth();

// Firestore タイムスタンプ設定
db.settings({ ignoreUndefinedProperties: true });

// ============================================================
//  EmailJS 設定
//  EmailJS Dashboard → Account → Public Key
// ============================================================
const EMAILJS_CONFIG = {
  publicKey:          "YOUR_EMAILJS_PUBLIC_KEY",
  serviceId:          "YOUR_EMAILJS_SERVICE_ID",
  templateInvite:     "template_invite",
  templateReminder:   "template_reminder",
  templateCheckin:    "template_checkin",
  templateCheckout:   "template_checkout",
  templateAlert:      "template_alert",
  templateApproval:   "template_approval"
};
