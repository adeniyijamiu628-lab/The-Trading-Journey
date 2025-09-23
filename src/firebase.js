// firebase.js
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyA7qNPbWQ3q7VGeT90jdf9v00U9Y_m7Yac",
  authDomain: "trading-journey-bf121.firebaseapp.com",
  projectId: "trading-journey-bf121",
  storageBucket: "trading-journey-bf121.appspot.com",
  messagingSenderId: "66382156898",
  appId: "1:66382156898:web:1bcf97b8a62fc7d8e52d3b",
  measurementId: "G-DN53W685VQ",
};

// ✅ Only initialize once
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Export services
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);
