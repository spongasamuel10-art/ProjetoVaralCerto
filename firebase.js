import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, onValue, set, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyB_XFnOJnRahnnjPTtxTTUQD2ndR455KGo",
  authDomain: "projeto-varal-ca245.firebaseapp.com",
  databaseURL: "https://projeto-varal-ca245-default-rtdb.firebaseio.com",
  projectId: "projeto-varal-ca245",
  storageBucket: "projeto-varal-ca245.firebasestorage.app",
  messagingSenderId: "92894492584",
  appId: "1:92894492584:web:8bd7f22faf80307b098f9d",
  measurementId: "G-Q97HHHGR3P"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export { db, ref, onValue, set, update };