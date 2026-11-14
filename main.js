import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, query, orderBy, limit, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 1. PASTE YOUR FIREBASE CONFIG KEYS HERE
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// 2. SET YOUR SUPER ADMIN EMAIL HERE
const SUPER_ADMIN_EMAIL = "admin@eduverifications.com";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Secondary app instance so Super Admin can create staff without getting logged out
const secondaryApp = initializeApp(firebaseConfig, "Secondary");
const secondaryAuth = getAuth(secondaryApp);

let currentUserData = { role: "staff", shop: "Unknown" };

// --- LOGIN & LOGOUT ---
window.login = async function() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errorEl = document.getElementById("loginError");
  errorEl.textContent = "";

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    errorEl.textContent = "Login failed: " + error.message;
  }
};

window.logout = async function() {
  await signOut(auth);
};

// --- ROLE DETECTION (SUPER ADMIN VS SUB-ADMIN) ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    document.getElementById("loginSection").classList.add("hidden");
    document.getElementById("dashboardSection").classList.remove("hidden");
    document.getElementById("logoutBtn").classList.remove("hidden");

    if (user.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
      currentUserData = { role: "Super Admin", shop: "HQ / All Shops" };
      document.getElementById("superAdminPanel").classList.remove("hidden");
    } else {
      document.getElementById("superAdminPanel").classList.add("hidden");
      const staffDoc = await getDoc(doc(db, "staff", user.uid));
      if (staffDoc.exists()) {
        currentUserData = { role: "Shop Staff", shop: staffDoc.data().shop };
      } else {
        currentUserData = { role: "Shop Staff", shop: "Unassigned" };
      }
    }

    document.getElementById("userRoleDisplay").textContent = `Role: ${currentUserData.role}`;
    document.getElementById("userShopDisplay").textContent = `Shop: ${currentUserData.shop}`;
    
    loadRecentTransactions();
  } else {
    document.getElementById("loginSection").classList.remove("hidden");
    document.getElementById("dashboardSection").classList.add("hidden");
    document.getElementById("logoutBtn").classList.add("hidden");
  }
});

// --- ANTI-REUSE FORMULA: VERIFY & LOCK M-PESA CODE ACROSS ALL SHOPS ---
window.verifyTransaction = async function() {
  const rawCode = document.getElementById("mpesaCode").value.trim().toUpperCase();
  const amount = document.getElementById("amountPaid").value.trim();
  const customer = document.getElementById("customerName").value.trim() || "N/A";

  // Validate 10-character M-Pesa format
  const codeRegex = /^[A-Z0-9]{10}$/;
  if (!codeRegex.test(rawCode)) {
    showStatus("INVALID FORMAT: M-Pesa code must be exactly 10 letters/numbers.", "reject");
    return;
  }

  if (!amount || Number(amount) <= 0) {
    showStatus("Please enter a valid KES amount.", "reject");
    return;
  }

  try {
    // Use the exact M-Pesa code as the Document ID in Firestore.
    // This guarantees global uniqueness across every shop instantly.
    const txRef = doc(db, "transactions", rawCode);
    const txSnap = await getDoc(txRef);

    if (txSnap.exists()) {
      // DUPLICATE DETECTED -> AUTOMATICALLY REJECT
      const existing = txSnap.data();
      const usedDate = existing.timestamp ? existing.timestamp.toDate().toLocaleString() : "Earlier";
      showStatus(
        `REJECTED! Code ${rawCode} was ALREADY USED at ${existing.shop} (KES ${existing.amount}) on ${usedDate} by ${existing.verifiedBy}.`,
        "reject"
      );
      return;
    }

    // NEW CODE -> RECORD AND LOCK IT IMMEDIATELY
    await setDoc(txRef, {
      code: rawCode,
      amount: Number(amount),
      customer: customer,
      shop: currentUserData.shop,
      verifiedBy: auth.currentUser.email,
      timestamp: serverTimestamp()
    });

    showStatus(`VERIFIED & SAVED! Code ${rawCode} (KES ${amount}) recorded for ${currentUserData.shop}.`, "success");
    
    document.getElementById("mpesaCode").value = "";
    document.getElementById("amountPaid").value = "";
    document.getElementById("customerName").value = "";

  } catch (error) {
    showStatus("System Error: " + error.message, "reject");
  }
};

function showStatus(message, type) {
  const statusBox = document.getElementById("statusBox");
  statusBox.textContent = message;
  statusBox.className = "status-box " + (type === "success" ? "status-success" : "status-reject");
}

// --- SUPER ADMIN: CREATE SUB-ADMIN ACCOUNTS ---
window.createSubAdmin = async function() {
  if (auth.currentUser.email.toLowerCase() !== SUPER_ADMIN_EMAIL.toLowerCase()) return;

  const email = document.getElementById("newStaffEmail").value.trim();
  const password = document.getElementById("newStaffPassword").value;
  const shop = document.getElementById("newStaffShop").value.trim();
  const msgEl = document.getElementById("adminMsg");

  if (!email || password.length < 6 || !shop) {
    msgEl.textContent = "Please fill all fields (Password min 6 chars).";
    return;
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const newUid = userCredential.user.uid;

    await setDoc(doc(db, "staff", newUid), {
      email: email,
      shop: shop,
      role: "clerk",
      createdAt: serverTimestamp()
    });

    await signOut(secondaryAuth);
    msgEl.textContent = `Staff account created for ${email} (${shop})!`;
    document.getElementById("newStaffEmail").value = "";
    document.getElementById("newStaffPassword").value = "";
    document.getElementById("newStaffShop").value = "";
  } catch (error) {
    msgEl.textContent = "Error: " + error.message;
  }
};

// --- REAL-TIME TRANSACTION LOGS ---
function loadRecentTransactions() {
  const q = query(collection(db, "transactions"), orderBy("timestamp", "desc"), limit(50));
  onSnapshot(q, (snapshot) => {
    const tbody = document.getElementById("logsTableBody");
    tbody.innerHTML = "";
    snapshot.forEach((doc) => {
      const data = doc.data();
      const timeStr = data.timestamp ? data.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "...";
      const row = `<tr>
        <td><strong>${data.code}</strong></td>
        <td>KES ${data.amount}</td>
        <td>${data.shop}</td>
        <td>${data.verifiedBy.split('@')[0]}</td>
        <td>${timeStr}</td>
      </tr>`;
      tbody.innerHTML += row;
    });
  });
}

window.filterLogs = function() {
  const filter = document.getElementById("searchCode").value.toUpperCase();
  const rows = document.getElementById("logsTableBody").getElementsByTagName("tr");
  for (let row of rows) {
    const codeText = row.cells[0].textContent;
    row.style.display = codeText.includes(filter) ? "" : "none";
  }
};

