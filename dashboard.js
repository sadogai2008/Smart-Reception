// js/dashboard.js
'use strict';

// ============================================================
//  初期化
// ============================================================
initAuth([ROLES.ADMIN, ROLES.EMPLOYEE, ROLES.RECEPTIONIST, ROLES.DEPARTMENT], onReady);

function onReady(user, profile) {
  initNav();
  initNotificationBadge();
  startClock();
  setTodayDate();
  loadStats();
  listenTodayReservations();
  listenInhouse();
  loadMonthlyChart();
  initReservationForm();
  initMobileNav();
  initThemeToggle();
}

// ============================================================
//  時計
// ============================================================
function startClock() {
  const el = document.getElementById('topbar-clock');
  function tick() {
    const now = new Date();
    el.textContent = now.toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  }
  tick();
  setInterval(tick, 1000);
}

function setTodayDate() {
  const el = document.getElementById('today-date');
  el.textContent = new Date().toLocaleDateString('ja-JP', {
    year:'numeric', month:'long', day:'numeric', weekday:'long'
  });
}

// ============================================================
//  統計
// ============================================================
async function loadStats() {
  // 本日の予約数
  const todaySnap = await db.collection('reservations')
    .where('visitDate', '>=', todayStart())
    .where('visitDate', '<=', todayEnd())
    .get();
  document.getElementById('stat-scheduled').textContent = todaySnap.size;

  // 本日来訪済み
  const visitedCount = todaySnap.docs.filter(d => [
    RESERVATION_STATUS.CHECKED_IN, RESERVATION_STATUS.CHECKED_OUT
  ].includes(d.data().status)).length;
  document.getElementById('stat-visited').textContent = visitedCount;

  // 今月
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
  const monthSnap = await db.collection('reservations')
    .where('visitDate', '>=', firebase.firestore.Timestamp.fromDate(monthStart))
    .get();
  document.getElementById('stat-monthly').textContent = monthSnap.size;

  // 承認待ち（当日受付）
  const pendingSnap = await db.collection('walkIns')
    .where('status', '==', WALKIN_STATUS.PENDING).get();
  document.getElementById('stat-pending').textContent = pendingSnap.size;
}

// ============================================================
//  本日予約リスト（リアルタイム）
// ============================================================
function listenTodayReservations() {
  const tbody = document.getElementById('today-reservation-list');
  const q = db.collection('reservations')
    .where('visitDate', '>=', todayStart())
    .where('visitDate', '<=', todayEnd())
    .orderBy('visitDate');

  const unsub = q.onSnapshot(snap => {
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--color-text-3);">本日の予約はありません</td></tr>';
      return;
    }
    tbody.innerHTML = snap.docs.map(d => {
      const r = d.data();
      const statusLabels = {
        pending:'予約済', confirmed:'確認済', checked_in:'入館中',
        checked_out:'退館済', cancelled:'キャンセル', rejected:'拒否'
      };
      return `<tr class="fade-in">
        <td><strong>${sanitize(r.visitorName)}</strong></td>
        <td>${sanitize(r.visitorCompany)}</td>
        <td>${formatTime(r.visitDate)}</td>
        <td>${sanitize(r.departmentName || '-')}</td>
        <td><span class="badge badge--${r.status}">${statusLabels[r.status] || r.status}</span></td>
      </tr>`;
    }).join('');
    // 在館数更新
    const inCount = snap.docs.filter(d => d.data().status === RESERVATION_STATUS.CHECKED_IN).length;
    document.getElementById('stat-inhouse').textContent = inCount;
  });
  unsubscribers.push(unsub);
}

// ============================================================
//  在館者リスト（リアルタイム）
// ============================================================
function listenInhouse() {
  const tbody = document.getElementById('inhouse-list');
  const q = db.collection('checkins')
    .where('status', '==', 'in')
    .orderBy('checkinAt', 'desc');

  const unsub = q.onSnapshot(snap => {
    document.getElementById('stat-inhouse').textContent = snap.size;
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="4" style="padding:24px;text-align:center;color:var(--color-text-3);">現在在館者はいません</td></tr>';
      return;
    }
    tbody.innerHTML = snap.docs.map(d => {
      const c = d.data();
      return `<tr class="fade-in">
        <td><strong>${sanitize(c.visitorName)}</strong><br><small style="color:var(--color-text-3)">${sanitize(c.visitorCompany)}</small></td>
        <td><span class="badge badge--gold">${sanitize(c.badgeId || '-')}</span></td>
        <td>${formatTime(c.checkinAt)}</td>
        <td>${sanitize(c.departmentName || '-')}</td>
      </tr>`;
    }).join('');
  });
  unsubscribers.push(unsub);
}

// ============================================================
//  月間グラフ
// ============================================================
async function loadMonthlyChart() {
  const chartEl = document.getElementById('monthly-chart');
  const labelsEl = document.getElementById('monthly-chart-labels');
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const startOf = firebase.firestore.Timestamp.fromDate(new Date(year, month, 1, 0, 0, 0));
  const endOf   = firebase.firestore.Timestamp.fromDate(new Date(year, month, daysInMonth, 23, 59, 59));

  const snap = await db.collection('reservations')
    .where('visitDate', '>=', startOf)
    .where('visitDate', '<=', endOf)
    .get();

  const counts = Array(daysInMonth).fill(0);
  snap.docs.forEach(d => {
    const visitDate = d.data().visitDate;
    if (visitDate) {
      const day = (visitDate.toDate ? visitDate.toDate() : new Date(visitDate)).getDate();
      counts[day - 1]++;
    }
  });

  const max = Math.max(...counts, 1);
  chartEl.innerHTML = counts.map((c, i) => {
    const h = Math.round((c / max) * 120);
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">
      <span style="font-size:10px;color:var(--color-text-3)">${c > 0 ? c : ''}</span>
      <div style="flex:1;width:100%;background:var(--color-navy-3);border-radius:4px 4px 0 0;height:${h}px;min-height:2px;transition:background .2s;" onmouseover="this.style.background='var(--color-gold)'" onmouseout="this.style.background='var(--color-navy-3)'"></div>
    </div>`;
  }).join('');

  // 5日ごとにラベル
  const labelHtml = counts.map((_, i) => {
    if ((i + 1) % 5 === 0 || i === 0) {
      return `<span style="font-size:10px;color:var(--color-text-3);flex:1;text-align:center">${i+1}</span>`;
    }
    return `<span style="flex:1"></span>`;
  }).join('');
  labelsEl.innerHTML = labelHtml;

  // CSV出力
  document.getElementById('btn-export-monthly').addEventListener('click', () => {
    const rows = snap.docs.map(d => {
      const r = d.data();
      return {
        '予約ID':     d.id,
        '氏名':       r.visitorName,
        '会社':       r.visitorCompany,
        '部署':       r.departmentName,
        '担当者':     r.employeeName,
        '来訪日時':   formatDateTime(r.visitDate),
        '状態':       r.status,
        '目的':       r.purpose
      };
    });
    exportCSV(rows, `来訪者_${year}${String(month+1).padStart(2,'0')}.csv`);
  });
}

// ============================================================
//  予約フォーム
// ============================================================
function initReservationForm() {
  const btnNew = document.getElementById('btn-new-reservation');
  const navNew = document.getElementById('nav-new-reservation');
  if (btnNew) btnNew.addEventListener('click', openReservationModal);
  if (navNew) navNew.addEventListener('click', e => { e.preventDefault(); openReservationModal(); });

  const deptSel = document.getElementById('r-department');
  if (deptSel) {
    deptSel.addEventListener('change', async () => {
      await populateEmployeeSelect('r-employee', deptSel.value);
    });
  }

  const submitBtn = document.getElementById('btn-submit-reservation');
  if (submitBtn) submitBtn.addEventListener('click', submitReservation);
}

async function openReservationModal() {
  await populateDepartmentSelect('r-department');
  document.getElementById('r-employee').innerHTML = '<option value="">担当者を選択</option>';
  // デフォルト日時（現在+1時間）
  const dt = new Date(Date.now() + 3600000);
  const iso = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0,16);
  document.getElementById('r-date').value = iso;
  openModal('modal-reservation');
}

async function submitReservation() {
  const name    = document.getElementById('r-visitor-name').value.trim();
  const company = document.getElementById('r-company').value.trim();
  const email   = document.getElementById('r-email').value.trim();
  const phone   = document.getElementById('r-phone').value.trim();
  const deptId  = document.getElementById('r-department').value;
  const empId   = document.getElementById('r-employee').value;
  const dateStr = document.getElementById('r-date').value;
  const count   = parseInt(document.getElementById('r-count').value) || 1;
  const purpose = document.getElementById('r-purpose').value.trim();
  const notes   = document.getElementById('r-notes').value.trim();

  if (!name || !company || !email || !deptId || !empId || !dateStr || !purpose) {
    showToast('必須項目をすべて入力してください。', 'warning');
    return;
  }

  showLoading('予約を登録中...');

  try {
    const depts = await getDepartments();
    const dept  = depts.find(d => d.id === deptId);
    const emps  = await getEmployeesByDept(deptId);
    const emp   = emps.find(e => e.id === empId);

    const qrToken = generateToken(32);
    const reservationData = {
      visitorName:    name,
      visitorCompany: company,
      visitorEmail:   email,
      visitorPhone:   phone,
      departmentId:   deptId,
      departmentName: dept ? dept.name : '',
      employeeId:     empId,
      employeeName:   emp ? emp.name : '',
      visitDate:      isoToTimestamp(dateStr),
      numberOfVisitors: count,
      purpose,
      notes,
      status:         RESERVATION_STATUS.PENDING,
      qrToken,
      createdAt:      firebase.firestore.FieldValue.serverTimestamp(),
      createdBy:      currentUser.uid
    };

    const docRef = await db.collection('reservations').add(reservationData);

    // ログ
    await writeLog('reservation_created', 'reservation', docRef.id, 'reservation', { visitorName: name });

    // 通知
    await createNotification('arrival', '新規来訪予約', `${name}様（${company}）の予約が登録されました`, docRef.id);

    // メール送信
    try {
      await sendInviteEmail({ ...reservationData, id: docRef.id });
      showToast('予約を登録しました。招待メールを送信しました。', 'success');
    } catch (mailErr) {
      console.warn('Mail error:', mailErr);
      showToast('予約を登録しました（メール送信に失敗しました）。', 'warning');
    }

    // QRプレビュー
    closeModal('modal-reservation');
    document.getElementById('qr-visitor-name-label').textContent = `${name} 様`;
    generateQRCode('qr-preview', {
      visitorId: docRef.id,
      reservationId: docRef.id,
      securityToken: qrToken
    }, 180);
    openModal('modal-qr');

    // フォームリセット
    document.getElementById('reservation-form').reset();
    loadStats();

  } catch (err) {
    console.error(err);
    showToast('予約登録に失敗しました: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
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
//  テーマ
// ============================================================
function initThemeToggle() {
  const saved = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  });
}

// テーマ即時反映
(function() {
  if (localStorage.getItem('theme') === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
