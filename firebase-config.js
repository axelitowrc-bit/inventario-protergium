import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyDu29stjRNzEHUCon1oQZtFw-cPH8_bG6E",
    authDomain: "protergium-inventario.firebaseapp.com",
    projectId: "protergium-inventario",
    storageBucket: "protergium-inventario.firebasestorage.app",
    messagingSenderId: "532731703541",
    appId: "1:532731703541:web:5434acce83ce9640c9d5bc"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
