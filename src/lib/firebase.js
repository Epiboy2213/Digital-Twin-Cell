// src/lib/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAqLIrrvZqJ1Oy7Ot_9WKNTjQQZTod2FbI",
  authDomain: "digitaltwincell.firebaseapp.com",
  projectId: "digitaltwincell",
  storageBucket: "digitaltwincell.firebasestorage.app",
  messagingSenderId: "958981538408",
  appId: "1:958981538408:web:4fc1ac9c8306265f7071dd",
  // measurementId: "G-T4VJB6Z2GY", // ถ้าไม่ได้ใช้ Analytics ไม่จำเป็นต้องใส่
};

// init app
const app = initializeApp(firebaseConfig);

// --- Auth --- //
export const auth = getAuth(app);

// Google provider สำหรับ Sign in with Google
export const googleProvider = new GoogleAuthProvider();

// --- Firestore --- //
export const db = getFirestore(app);
