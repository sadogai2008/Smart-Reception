// app.js — 共通ロジック・認証・ユーティリティ
'use strict';

// ============================================================
//  定数
// ============================================================
const ROLES = {
  ADMIN:        'admin',
  EMPLOYEE:     'employee',
  RECEPTIONIST: 'receptionist',
  DEPARTMENT:   'department'
};

const RESERVATION_STATUS = {
  PENDING:     'pending',
  CONFIRMED:   'confirmed',
  CHECKED_IN:  'checked_in',
  CHECKED_OUT: 'checked_out',
  CANCELLED:   'cancelled',
  REJECTED:    'rejected'
};

const BADGE_STATUS = {
  AVAILABLE: 'available',
  IN_USE:    'in_use',
  RETURNED:  'returned',
  LOST:      'lost'
};

const WALKIN_STATUS = {
  PENDING:    'pending',
  APPROVED:   'approved',
  REJECTED:   'rejected',
  CHECKED_IN: 'checked_in'
};

// ============================================================
//  グローバル状態
// ============================================================
let currentUser    = null;
let currentProfile = null;
let unsubscribers  = [];

// ============================================================
//  テーマ即時反映（DOMContentLoaded前に実行）
// ============================================================
(function () {
  if (localStorage.getItem('theme') === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();

// ============================================================
//  認証
// ============================================================
function initAuth(requiredRoles, onReady) {
  auth.onAuthStateChanged(async user => {
    if (!user) {
      window.location.href = 'login.html';
      return;
    }
    try {
      const snap = await db.collection('users').doc(user.uid).get();
      if (!snap.exists) {
        await auth.signOut();
        window.location.href = 'login.html';
        return;
      }
      const profile = snap.data();
      if (!profile.isActive) {
        showToast('このアカウントは無効化されています。', 'error');
        await auth.signOut();
        window.location.href = 'login.html';
        return;
      }
      if (requiredRoles && requiredRoles.length > 0 && !requiredRoles.includes(profile.role)) {
        showToast('この画面へのアクセス権限がありません。', 'error');
        window.location.href = 'index.html';
        return;
      }
      currentUser    = user;
      currentProfile = profile;
      db.collection('users').doc(user.uid).update({
        lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(() => {});
      if (typeof onReady === 'function') onReady(user, profile);
    } catch (err) {
      console.error('Auth error:', err);
      window.location.href = 'login.html';
    }
  });
}

async function signOut() {
  unsubscribers.forEach(fn => fn());
  unsubscribers = [];
  await auth.signOut();
  window.location.href = 'login.html';
}

// ============================================================
//  セキュリティ
// ============================================================
function sanitize(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generateToken(length = 32) {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

function generateId() {
  return generateToken(16);
}

// ============================================================
//  バリデーション
// ============================================================
const VALIDATORS = {
  required: (v) => v !== null && v !== undefined && String(v).trim().length > 0,
  maxLen:   (v, n) => String(v).length <= n,
  minLen:   (v, n) => String(v).length >= n,
  email:    (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  phone:    (v) => !v || /^[\d\-\+\(\)\s]{7,20}$/.test(v),
  url:      (v) => !v || /^https?:\/\/.+/.test(v),
  alphaNum: (v) => /^[a-zA-Z0-9_-]+$/.test(v),
  noScript: (v) => !/<script|javascript:|on\w+=/i.test(v),
};

function validateField(value, rules) {
  const errors = [];
  if (rules.required && !VALIDATORS.required(value))  errors.push('必須項目です');
  if (value && rules.email    && !VALIDATORS.email(value))    errors.push('メールアドレスの形式が正しくありません');
  if (value && rules.phone    && !VALIDATORS.phone(value))    errors.push('電話番号の形式が正しくありません');
  if (value && rules.maxLen   && !VALIDATORS.maxLen(value, rules.maxLen))   errors.push(`${rules.maxLen}文字以内で入力してください`);
  if (value && rules.minLen   && !VALIDATORS.minLen(value, rules.minLen))   errors.push(`${rules.minLen}文字以上で入力してください`);
  if (value && !VALIDATORS.noScript(value)) errors.push('使用できない文字が含まれています');
  return errors;
}

function validateForm(fields) {
  let valid = true;
  const allErrors = {};
  for (const [fieldId, rules] of Object.entries(fields)) {
    const el = document.getElementById(fieldId);
    if (!el) continue;
    const errors = validateField(el.value, rules);
    if (errors.length > 0) {
      valid = false;
      el.classList.add('form-control--error');
      let errEl = el.parentElement.querySelector('.form-error');
      if (!errEl) {
        errEl = document.createElement('div');
        errEl.className = 'form-error';
        el.parentElement.appendChild(errEl);
      }
      errEl.textContent = errors[0];
    } else {
      el.classList.remove('form-control--error');
      const errEl = el.parentElement.querySelector('.form-error');
      if (errEl) errEl.textContent = '';
    }
    allErrors[fieldId] = errors;
  }
  return { valid, errors: allErrors };
}

// ============================================================
//  日付ユーティリティ
// ============================================================
function formatDate(ts) {
  if (!ts) return '-';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatDateTime(ts) {
  if (!ts) return '-';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatTime(ts) {
  if (!ts) return '-';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return firebase.firestore.Timestamp.fromDate(d);
}

function todayEnd() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return firebase.firestore.Timestamp.fromDate(d);
}

function tomorrowStart() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return firebase.firestore.Timestamp.fromDate(d);
}

function tomorrowEnd() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(23, 59, 59, 999);
  return firebase.firestore.Timestamp.fromDate(d);
}

function isoToTimestamp(isoStr) {
  return firebase.firestore.Timestamp.fromDate(new Date(isoStr));
}

function calcStayDuration(checkinTs, checkoutTs) {
  if (!checkinTs || !checkoutTs) return '-';
  const inMs  = checkinTs.toDate  ? checkinTs.toDate().getTime()  : new Date(checkinTs).getTime();
  const outMs = checkoutTs.toDate ? checkoutTs.toDate().getTime() : new Date(checkoutTs).getTime();
  const min   = Math.round((outMs - inMs) / 60000);
  return `${Math.floor(min / 60)}時間${min % 60}分`;
}

// ============================================================
//  ログ記録
// ============================================================
async function writeLog(action, category, targetId, targetType, detail = {}) {
  try {
    await db.collection('logs').add({
      action, category, targetId, targetType, detail,
      userId:    currentUser ? currentUser.uid : 'anonymous',
      userName:  currentProfile ? currentProfile.displayName : 'anonymous',
      userAgent: navigator.userAgent,
      ipHint:    '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) { console.warn('Log write failed:', e); }
}

// ============================================================
//  通知
// ============================================================
async function createNotification(type, title, message, relatedId, targetRole = null, targetUserId = null) {
  try {
    await db.collection('notifications').add({
      type, title, message, relatedId,
      targetRole, targetUserId,
      isRead:    false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) { console.warn('Notification create failed:', e); }
}

// ============================================================
//  EmailJS
// ============================================================
function initEmailJS() {
  if (typeof emailjs !== 'undefined' && EMAILJS_CONFIG.publicKey !== 'YOUR_EMAILJS_PUBLIC_KEY') {
    emailjs.init(EMAILJS_CONFIG.publicKey);
  }
}

async function sendEmail(templateId, params) {
  if (typeof emailjs === 'undefined') {
    console.warn('EmailJS not loaded');
    return;
  }
  if (EMAILJS_CONFIG.publicKey === 'YOUR_EMAILJS_PUBLIC_KEY') {
    console.info('[Demo] Email would be sent:', templateId, params);
    return { demo: true };
  }
  return emailjs.send(EMAILJS_CONFIG.serviceId, templateId, params);
}

async function sendInviteEmail(reservation) {
  const settings = await getSettings();
  const qrUrl = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}walkin.html?token=${reservation.qrToken}&id=${reservation.id}`;
  return sendEmail(EMAILJS_CONFIG.templateInvite, {
    to_email:   reservation.visitorEmail,
    to_name:    reservation.visitorName,
    visit_date: formatDateTime(reservation.visitDate),
    department: reservation.departmentName || '',
    employee:   reservation.employeeName || '',
    purpose:    reservation.purpose || '',
    qr_url:     qrUrl,
    facility:   settings.facilityName || 'Smart Reception',
    address:    settings.address || '',
    floor:      settings.floor || ''
  });
}

async function sendReminderEmail(reservation) {
  const settings = await getSettings();
  const qrUrl = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}walkin.html?token=${reservation.qrToken}&id=${reservation.id}`;
  return sendEmail(EMAILJS_CONFIG.templateReminder, {
    to_email:   reservation.visitorEmail,
    to_name:    reservation.visitorName,
    visit_date: formatDateTime(reservation.visitDate),
    department: reservation.departmentName || '',
    employee:   reservation.employeeName || '',
    qr_url:     qrUrl,
    facility:   settings.facilityName || 'Smart Reception'
  });
}

async function sendCheckinEmail(checkin, employeeEmail) {
  return sendEmail(EMAILJS_CONFIG.templateCheckin, {
    to_email:        employeeEmail,
    visitor_name:    checkin.visitorName,
    visitor_company: checkin.visitorCompany,
    checkin_time:    formatDateTime(checkin.checkinAt),
    badge_number:    checkin.badgeId,
    receptionist:    checkin.receptionistName || '',
    department:      checkin.departmentName || ''
  });
}

async function sendCheckoutEmail(checkin, employeeEmail) {
  return sendEmail(EMAILJS_CONFIG.templateCheckout, {
    to_email:        employeeEmail,
    visitor_name:    checkin.visitorName,
    visitor_company: checkin.visitorCompany,
    checkout_time:   formatDateTime(checkin.checkoutAt),
    stay_duration:   calcStayDuration(checkin.checkinAt, checkin.checkoutAt)
  });
}

async function sendOverstayAlert(checkin, employeeEmail) {
  return sendEmail(EMAILJS_CONFIG.templateAlert, {
    to_email:        employeeEmail,
    visitor_name:    checkin.visitorName,
    visitor_company: checkin.visitorCompany,
    checkin_time:    formatDateTime(checkin.checkinAt),
    badge_number:    checkin.badgeId,
    hours_elapsed:   calcStayDuration(checkin.checkinAt, { toDate: () => new Date() })
  });
}

async function sendApprovalEmail(walkIn, approved, reason = '') {
  return sendEmail(EMAILJS_CONFIG.templateApproval, {
    to_email:   walkIn.email || '',
    to_name:    walkIn.name,
    status:     approved ? '承認されました' : '拒否されました',
    reason:     reason,
    department: walkIn.departmentName || ''
  });
}

// ============================================================
//  前日リマインドスケジューラ
// ============================================================
async function runReminderScheduler() {
  try {
    const snap = await db.collection('reservations')
      .where('visitDate', '>=', tomorrowStart())
      .where('visitDate', '<=', tomorrowEnd())
      .where('status', 'in', [RESERVATION_STATUS.PENDING, RESERVATION_STATUS.CONFIRMED])
      .get();

    for (const doc of snap.docs) {
      const r = doc.data();
      if (r.reminderSentAt) continue;
      try {
        await sendReminderEmail({ ...r, id: doc.id });
        await doc.ref.update({ reminderSentAt: firebase.firestore.FieldValue.serverTimestamp() });
        await writeLog('reminder_sent', 'email', doc.id, 'reservation', { visitorName: r.visitorName });
      } catch (e) {
        console.warn('Reminder send failed:', e);
      }
    }
  } catch (e) {
    console.warn('Reminder scheduler error:', e);
  }
}

// ============================================================
//  未退館アラートスケジューラ（3時間以上在館）
// ============================================================
async function runOverstayChecker() {
  try {
    const thresholdMs = 3 * 60 * 60 * 1000;
    const snap = await db.collection('checkins').where('status', '==', 'in').get();

    for (const doc of snap.docs) {
      const c = doc.data();
      if (!c.checkinAt) continue;
      const checkinMs = c.checkinAt.toDate ? c.checkinAt.toDate().getTime() : new Date(c.checkinAt).getTime();
      if (Date.now() - checkinMs < thresholdMs) continue;

      const lastAlertMs = c.lastAlertSentAt
        ? (c.lastAlertSentAt.toDate ? c.lastAlertSentAt.toDate().getTime() : new Date(c.lastAlertSentAt).getTime())
        : 0;
      if (Date.now() - lastAlertMs < 60 * 60 * 1000) continue;

      try {
        if (c.employeeId) {
          const empSnap = await db.collection('employees').doc(c.employeeId).get();
          if (empSnap.exists) {
            await sendOverstayAlert(c, empSnap.data().email);
          }
        }
        await doc.ref.update({ lastAlertSentAt: firebase.firestore.FieldValue.serverTimestamp() });
        await writeLog('overstay_alert', 'alert', doc.id, 'checkin', { visitorName: c.visitorName });
      } catch (e) {
        console.warn('Overstay alert failed:', e);
      }
    }
  } catch (e) {
    console.warn('Overstay checker error:', e);
  }
}

// ============================================================
//  設定取得
// ============================================================
let _settingsCache = null;
async function getSettings() {
  if (_settingsCache) return _settingsCache;
  try {
    const snap = await db.collection('settings').doc('global').get();
    _settingsCache = snap.exists ? snap.data() : {};
  } catch { _settingsCache = {}; }
  return _settingsCache;
}

// ============================================================
//  QRコード生成
// ============================================================
function generateQRCode(containerId, data, size = 200) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  if (typeof QRCode !== 'undefined') {
    new QRCode(el, {
      text:         JSON.stringify(data),
      width:        size,
      height:       size,
      colorDark:    '#0a0f1e',
      colorLight:   '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });
  }
}

// ============================================================
//  トースト通知
// ============================================================
function showToast(message, type = 'info', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  toast.innerHTML = `<span class="toast__icon">${icons[type] || 'ℹ'}</span><span class="toast__msg">${sanitize(message)}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast--show'));
  setTimeout(() => {
    toast.classList.remove('toast--show');
    setTimeout(() => toast.remove(), 400);
  }, duration);
}

// ============================================================
//  モーダル
// ============================================================
function openModal(id) {
  const m = document.getElementById(id);
  if (m) { m.classList.add('modal--open'); document.body.style.overflow = 'hidden'; }
}
function closeModal(id) {
  const m = document.getElementById(id);
  if (m) { m.classList.remove('modal--open'); document.body.style.overflow = ''; }
}
function closeAllModals() {
  document.querySelectorAll('.modal--open').forEach(m => m.classList.remove('modal--open'));
  document.body.style.overflow = '';
}

document.addEventListener('click', e => {
  if (e.target.classList.contains('modal')) closeAllModals();
});

// ============================================================
//  ローディング
// ============================================================
function showLoading(msg = '処理中...') {
  let el = document.getElementById('global-loading');
  if (!el) {
    el = document.createElement('div');
    el.id = 'global-loading';
    el.innerHTML = `<div class="loading-inner"><div class="loading-spinner"></div><p>${sanitize(msg)}</p></div>`;
    document.body.appendChild(el);
  } else {
    const p = el.querySelector('p');
    if (p) p.textContent = msg;
  }
  el.style.display = 'flex';
}
function hideLoading() {
  const el = document.getElementById('global-loading');
  if (el) el.style.display = 'none';
}

// ============================================================
//  CSV出力
// ============================================================
function exportCSV(data, filename) {
  if (!data || !data.length) { showToast('データがありません', 'warning'); return; }
  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => {
    const v = String(row[h] === null || row[h] === undefined ? '' : row[h]).replace(/"/g, '""');
    return `"${v}"`;
  }).join(','));
  const bom  = '\uFEFF';
  const csv  = bom + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
//  部署一覧取得
// ============================================================
let _deptCache = null;
async function getDepartments() {
  if (_deptCache) return _deptCache;
  const snap = await db.collection('departments').where('isActive', '==', true).orderBy('name').get();
  _deptCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return _deptCache;
}

async function populateDepartmentSelect(selectId, placeholder = '部署を選択') {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = `<option value="">${placeholder}</option>`;
  const depts = await getDepartments();
  depts.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = d.name;
    sel.appendChild(opt);
  });
}

// ============================================================
//  社員一覧取得
// ============================================================
async function getEmployeesByDept(deptId) {
  const snap = await db.collection('employees')
    .where('departmentId', '==', deptId)
    .where('isActive', '==', true)
    .orderBy('name').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function populateEmployeeSelect(selectId, deptId, placeholder = '担当者を選択') {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = `<option value="">${placeholder}</option>`;
  if (!deptId) return;
  const emps = await getEmployeesByDept(deptId);
  emps.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.id;
    opt.textContent = e.name;
    sel.appendChild(opt);
  });
}

// ============================================================
//  入館証取得
// ============================================================
async function getAvailableBadge() {
  const snap = await db.collection('badges')
    .where('status', '==', BADGE_STATUS.AVAILABLE)
    .orderBy('badgeNumber')
    .limit(1).get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// ============================================================
//  ナビゲーション初期化
// ============================================================
function initNav() {
  const userNameEl = document.getElementById('nav-user-name');
  const userRoleEl = document.getElementById('nav-user-role');
  if (userNameEl && currentProfile) userNameEl.textContent = currentProfile.displayName || '';
  if (userRoleEl && currentProfile) {
    const roleLabels = {
      admin:        'システム管理者',
      employee:     '社員',
      receptionist: '受付担当者',
      department:   '部署担当者'
    };
    userRoleEl.textContent = roleLabels[currentProfile.role] || '';
  }

  document.querySelectorAll('[data-roles]').forEach(el => {
    const allowed = el.getAttribute('data-roles').split(',').map(s => s.trim());
    if (currentProfile && !allowed.includes(currentProfile.role)) {
      el.style.display = 'none';
    }
  });

  document.querySelectorAll('.js-signout').forEach(btn => {
    btn.addEventListener('click', () => signOut());
  });

  const current = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav__link').forEach(link => {
    const href = link.getAttribute('href') || '';
    if (href === current || href === './' + current) link.classList.add('nav__link--active');
    else link.classList.remove('nav__link--active');
  });
}

// ============================================================
//  リアルタイム通知バッジ
// ============================================================
function initNotificationBadge() {
  if (!currentUser) return;
  const q = db.collection('notifications')
    .where('isRead', '==', false)
    .where('targetUserId', '==', currentUser.uid);
  const unsub = q.onSnapshot(snap => {
    const badge = document.getElementById('notif-badge');
    if (badge) {
      badge.textContent = snap.size;
      badge.style.display = snap.size > 0 ? 'inline-flex' : 'none';
    }
  });
  unsubscribers.push(unsub);
}

// ============================================================
//  モバイルナビ
// ============================================================
function initMobileNav() {
  const hamburger = document.getElementById('hamburger');
  const sidebar   = document.getElementById('sidebar');
  const overlay   = document.getElementById('sidebar-overlay');
  if (!hamburger) return;
  hamburger.addEventListener('click', () => {
    sidebar.classList.toggle('sidebar--open');
    overlay.classList.toggle('sidebar-overlay--show');
  });
  overlay.addEventListener('click', () => {
    sidebar.classList.remove('sidebar--open');
    overlay.classList.remove('sidebar-overlay--show');
  });
}

// ============================================================
//  テーマ切替
// ============================================================
function initThemeToggle() {
  const saved = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next    = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  });
}

// ============================================================
//  時計
// ============================================================
function startClock() {
  const el = document.getElementById('topbar-clock');
  if (!el) return;
  const tick = () => el.textContent = new Date().toLocaleTimeString('ja-JP', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  tick();
  setInterval(tick, 1000);
}

// ============================================================
//  タブ共通初期化
// ============================================================
function initTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('tab--active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('tab-panel--active'));
      btn.classList.add('tab--active');
      const panel = document.getElementById('tab-' + btn.dataset.tab);
      if (panel) panel.classList.add('tab-panel--active');
    });
  });
}

// ============================================================
//  DOMContentLoaded
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initEmailJS();
});
