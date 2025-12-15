// src/lib/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// TODO: replace with your project's config from Firebase console
const firebaseConfig = {
  apiKey: "AIzaSyAqLIrrvZqJ1Oy7Ot_9WKNTjQQZTod2FbI",
  authDomain: "digitaltwincell.firebaseapp.com",
  projectId: "digitaltwincell",
  storageBucket: "digitaltwincell.firebasestorage.app",
  messagingSenderId: "958981538408",
  appId: "1:958981538408:web:4fc1ac9c8306265f7071dd",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
