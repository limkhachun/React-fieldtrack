// src/services/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database"; // 🟢 引入实时数据库
import { getStorage } from "firebase/storage";

console.log("Vite 读取的 API Key:", import.meta.env.VITE_FIREBASE_API_KEY);
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL, // 🟢 对应 .env 中的 URL
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};
 
// 初始化实例
const app = initializeApp(firebaseConfig);

// 导出供全项目使用
export const auth = getAuth(app);
export const db = getFirestore(app);      // Firestore
export const rtdb = getDatabase(app);    // Realtime Database (用于 Live Tracking)
export const storage = getStorage(app);