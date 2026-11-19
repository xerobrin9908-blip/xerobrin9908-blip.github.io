import { app, auth, db } from "./firebase.js";
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
import { collection, getDocs, query, where, doc, updateDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const $ = s => document.querySelector(s);
const functions = getFunctions(app);
const getTokenStatus = httpsCallable(functions, "getSharedTokenStatus");
const setSharedToken = httpsCallable(functions, "setSharedToken");
const deleteSharedToken = httpsCallable(functions, "deleteSharedToken");
let user = null, items = [];

$("#signIn").onclick = async () => {
  try { await signInWithEmailAndPassword(auth, $("#email").value.trim(), $("#password").value); $("#status").textContent = "Вход выполнен. Проверяю права…"; }
  catch (e) { $("#status").textContent = friendlyError(e); }
};
$("#signUp").onclick = async () => {
  try { await createUserWithEmailAndPassword(auth, $("#email").value.trim(), $("#password").value); $("#status").textContent = "Аккаунт создан. Для доступа админа добавь его UID в admins через Firebase Console."; }
  catch (e) { $("#status").textContent = friendlyError(e); }
};
$("#signOut").onclick = () => signOut(auth);
$("#reload").onclick = loadQueue;
$("#saveToken").onclick = async () => {
  const token = $("#sharedToken").value;
  if (!token.trim()) { $("#tokenStatus").textContent = "Сначала введи токен."; return; }
  $("#saveToken").disabled = true;
  try {
    await setSharedToken({ token });
    $("#sharedToken").value = "";
    $("#tokenStatus").textContent = "Общий токен сохранён в зашифрованном виде.";
    await refreshTokenStatus();
  } catch (e) { $("#tokenStatus").textContent = friendlyError(e); }
  finally { $("#saveToken").disabled = false; }
};
$("#clearToken").onclick = async () => {
  if (!confirm("Удалить общий токен для всех администраторов?")) return;
  $("#clearToken").disabled = true;
  try { await deleteSharedToken(); $("#tokenStatus").textContent = "Общий токен удалён."; await refreshTokenStatus(); }
  catch (e) { $("#tokenStatus").textContent = friendlyError(e); }
  finally { $("#clearToken").disabled = false; }
};

function friendlyError(e) {
  const code = e?.code || "";
  if (code.includes("permission-denied") || code.includes("unauthenticated")) return "Нет доступа. Проверь вход и права администратора.";
  if (code.includes("not-found") || code.includes("unavailable")) return "Серверная функция недоступна. Сначала разверни Firebase Functions.";
  return e?.message || "Произошла ошибка.";
}
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

async function refreshTokenStatus() {
  try {
    const result = await getTokenStatus();
    const configured = !!result.data?.configured;
    $("#tokenDot").classList.toggle("on", configured);
    $("#tokenState").textContent = configured ? "Общий токен настроен" : "Токен ещё не добавлен";
  } catch (e) {
    $("#tokenDot").classList.remove("on");
    $("#tokenState").textContent = "Не удалось проверить токен";
    $("#tokenStatus").textContent = friendlyError(e);
  }
}

async function loadQueue() {
  if (!user) return;
  $("#reload").disabled = true;
  try {
    const snap = await getDocs(query(collection(db, "submissions"), where("status", "==", "pending")));
    items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  } catch (e) {
    $("#queue").innerHTML = '<div class="empty">Нет доступа к очереди. Проверь права администратора.</div>';
    $("#status").textContent = friendlyError(e);
  } finally { $("#reload").disabled = false; }
}

function render() {
  $("#queue").innerHTML = items.length ? items.map(x =>
    '<article class="item"><div class="row" style="justify-content:space-between"><div><h3>' + esc(x.config?.name) + '</h3><div class="muted">' + esc(x.config?.type) + ' · ' + esc(x.config?.author) + ' · ' + esc(x.uid) + '</div></div><span class="muted">PENDING</span></div><pre>' + esc(JSON.stringify(x.config?.data, null, 2)) + '</pre><div class="actions"><button class="primary" data-action="approve" data-id="' + esc(x.id) + '">Одобрить</button><button class="danger" data-action="reject" data-id="' + esc(x.id) + '">Отклонить</button></div></article>'
  ).join("") : '<div class="empty">Очередь пуста — новых заявок нет.</div>';
}

$("#queue").addEventListener("click", async e => {
  const b = e.target.closest("[data-action]");
  if (!b) return;
  b.disabled = true;
  const item = items.find(x => x.id === b.dataset.id);
  if (!item) return;
  try {
    if (b.dataset.action === "approve") {
      await addDoc(collection(db, "configs"), { ...item.config, status: "approved", createdAt: serverTimestamp(), stats: { likes: 0, dislikes: 0, downloads: 0 } });
      await updateDoc(doc(db, "submissions", item.id), { status: "approved" });
    } else await updateDoc(doc(db, "submissions", item.id), { status: "rejected" });
    items = items.filter(x => x.id !== item.id);
    render();
  } catch (err) { b.disabled = false; $("#status").textContent = "Ошибка модерации: " + friendlyError(err); }
});

onAuthStateChanged(auth, async u => {
  user = u;
  $("#authPanel").classList.toggle("hidden", !!u);
  $("#dashboard").classList.toggle("hidden", !u);
  $("#signOut").classList.toggle("hidden", !u);
  if (!u) {
    $("#queue").innerHTML = "";
    $("#status").textContent = "";
    return;
  }
  $("#identity").textContent = u.email + " · UID: " + u.uid;
  await Promise.all([refreshTokenStatus(), loadQueue()]);
});
