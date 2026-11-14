// Import Firebase modules from CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Your exact Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDks20cfXpql66IJ2pMfpszJabvuAa0Ws0",
  authDomain: "edu-verifications.firebaseapp.com",
  projectId: "edu-verifications",
  storageBucket: "edu-verifications.firebasestorage.app",
  messagingSenderId: "953154584149",
  appId: "1:953154584149:web:0ed8cea2cb3302613cdedc"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Handle Login Form Submission
const loginForm = document.getElementById("login-form");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    try {
      // 1. Sign in with Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Fetch user role from Firestore 'users' collection
      const userDocRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        const userData = userDoc.data();
        const role = userData.role;

        // 3. Redirect based on role
        if (role === "super_admin") {
          window.location.href = "admin-dashboard.html"; // Adjust to your admin page
        } else if (role === "clerk") {
          window.location.href = "clerk-dashboard.html"; // Adjust to your clerk page
        } else {
          alert("Access denied: Unrecognized user role.");
        }
      } else {
        alert("User record not found in database.");
      }
    } catch (error) {
      console.error("Login Error:", error.message);
      alert("Login failed: " + error.message);
    }
  });
}

