// Firebase конфигурация
const firebaseConfig = {
  apiKey: "AIzaSyDwThKq3joH0dwjtyRjO2DCKZEfjO0CuxM",
  authDomain: "slooooooypok.firebaseapp.com",
  databaseURL: "https://slooooooypok-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "slooooooypok",
  storageBucket: "slooooooypok.firebasestorage.app",
  messagingSenderId: "998753576801",
  appId: "1:998753576801:web:8ae89d9b637940aab1c720"
};

// Инициализация
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();
