// js/reception.js
'use strict';

let selectedReservation = null;
let pendingBadge        = null;
let qrStream            = null;
let qrScanActive        = false;

// ============================================================
//  初期化
// ============================================================
initAuth([ROLES.ADMIN, ROLES.RECEPTIONIST], onReady);

function onReady(user, profile) {
  initNav();
  startClock();
  initMobileNav();
  initThemeToggle();
  initTabs();
  initQRScanner();
  initSearch();
  listenTodayReservations();
  listenWalkIns();
  listenInhouse();
  listenCheckoutHistory();
  initCheckout();
  initEmergency();
}

function startClock() {
  const el = document.getElementById('topbar-clock');
  if (!el) return;
  const tick = () => el.textContent = new Date().toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' });
  tick(); setInterval(tick, 1000);
}

// ============================================================
//  タブ
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
//  QRスキャナー
// ============================================================
function initQRScanner() {
  const btn = document.getElementById('btn-toggle-cam');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (qrScanActive) stopQR();
    else startQR();
  });
}

async function startQR() {
  try {
    const video  = document.getElementById('qr-video');
    const scanner = document.getElementById('qr-scanner');
    qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = qrStream;
    await video.play();
    scanner.style.display = 'block';
    qrScanActive = true;
    document.getElementById('btn-toggle-cam').textContent = 'カメラ停止';
    scanLoop(video);
  } catch (e) {
    showToast('カメラの起動に失敗しました: ' + e.message, 'error');
  }
}

function stopQR() {
  if (qrStream) { qrStream.getTracks().forEach(t => t.stop()); qrStream = null; }
  const scanner = document.getElementById('qr-scanner');
  if (scanner) scanner.style.display = 'none';
  qrScanActive = false;
  const btn = document.getElementById('btn-toggle-cam');
  if (btn) btn.textContent = 'カメラ起動';
}

function scanLoop(video) {
  if (!qrScanActive) return;
  const canvas = document.createElement('canvas');
  const ctx    = canvas.getContext('2d');
  canvas.width = video.videoWidth || 300;
  canvas.height = video.videoHeight || 300;
  ctx.drawImage(video, 0, 0);
  try {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // jsQR ライブラリが利用可能なら使用
    if (typeof jsQR !== 'undefined') {
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code) {
        stopQR();
        handleQRData(code.data);
        return;
      }
    }
  } catch (e) { /* ignore */ }
  requestAnimationFrame(() => scanLoop(video));
}

async function handleQRData(rawData) {
  try {
    const data = JSON.parse(rawData);
    if (!data.reservationId || !data.securityToken) {
      showToast('無効なQRコードです。', 'error'); return;
    }
    await loadReservationByToken(data.reservationId, data.securityToken);
  } catch {
    showToast('QRコードの読み取りに失敗しました。', 'error');
  }
}

async function loadReservationByToken(reservationId, token) {
  showLoading('来訪者情報を確認中...');
  try {
    const snap = await db.collection('reservations').doc(reservationId).get();
    if (!snap.exists) { showToast('予約が見つかりません。', 'error'); return; }
    const r = snap.data();
    if (r.qrToken !== token) { showToast('QRコードが無効です。', 'error'); return; }
    if (r.status === RESERVATION_STATUS.CHECKED_IN) { showToast('この来訪者は既に入館中です。', 'warning'); return; }
    if (r.status === RESERVATION_STATUS.CHECKED_OUT) { showToast('この来訪者は既に退館済みです。', 'warning'); return; }
    showVisitorDetail({ id: snap.id, ...r });
  } catch (err) {
    showToast('エラーが発生しました: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

// ============================================================
//  来訪者検索
// ============================================================
function initSearch() {
  const input = document.getElementById('search-visitor');
  if (!input) return;
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => searchVisitor(input.value.trim()), 400);
  });
}

async function searchVisitor(query) {
  if (!query) return;
  showLoading('検索中...');
  try {
    // 氏名前方一致検索
    const nameSnap = await db.collection('reservations')
      .where('visitDate', '>=', todayStart())
      .where('visitDate', '<=', todayEnd())
      .where('visitorName', '>=', query)
      .where('visitorName', '<=', query + '\uf8ff')
      .limit(5).get();

    if (!nameSnap.empty) {
      const r = nameSnap.docs[0];
      showVisitorDetail({ id: r.id, ...r.data() });
    } else {
      showToast('来訪者が見つかりません。', 'warning');
    }
  } catch (err) {
    showToast('検索エラー: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

// ============================================================
//  来訪者詳細表示
// ============================================================
function showVisitorDetail(reservation) {
  selectedReservation = reservation;
  document.getElementById('vi-name').textContent    = reservation.visitorName || '-';
  document.getElementById('vi-company').textContent = reservation.visitorCompany || '-';
  document.getElementById('vi-dept').textContent    = reservation.departmentName || '-';
  document.getElementById('vi-emp').textContent     = reservation.employeeName || '-';
  document.getElementById('vi-date').textContent    = formatDateTime(reservation.visitDate);
  document.getElementById('vi-purpose').textContent = reservation.purpose || '-';

  const detailEl = document.getElementById('checkin-detail');
  detailEl.classList.add('checkin-detail--show');
  detailEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

  document.getElementById('btn-issue-badge').onclick = () => issueBadge(reservation);
  document.getElementById('btn-cancel-checkin').onclick = () => {
    detailEl.classList.remove('checkin-detail--show');
    selectedReservation = null;
  };
}

// ============================================================
//  入館証発行
// ============================================================
async function issueBadge(reservation) {
  showLoading('入館証を確認中...');
  try {
    const badge = await getAvailableBadge();
    if (!badge) {
      showToast('利用可能な入館証がありません。', 'error');
      return;
    }
    pendingBadge = badge;
    document.getElementById('badge-number-display').textContent = badge.badgeNumber;
    document.getElementById('badge-visitor-name').textContent   = reservation.visitorName + ' 様';
    openModal('modal-badge');

    document.getElementById('btn-confirm-badge').onclick = () => confirmCheckin(reservation, badge);
  } catch (err) {
    showToast('入館証取得エラー: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

async function confirmCheckin(reservation, badge) {
  showLoading('入館処理中...');
  try {
    const batch = db.batch();
    const now   = firebase.firestore.FieldValue.serverTimestamp();

    // checkins ドキュメント作成
    const checkinRef = db.collection('checkins').doc();
    const checkinData = {
      reservationId:  reservation.id,
      visitorName:    reservation.visitorName,
      visitorCompany: reservation.visitorCompany,
      visitorEmail:   reservation.visitorEmail || '',
      departmentId:   reservation.departmentId,
      departmentName: reservation.departmentName || '',
      employeeId:     reservation.employeeId,
      employeeName:   reservation.employeeName || '',
      badgeId:        badge.badgeNumber,
      badgeDocId:     badge.id,
      checkinAt:      now,
      checkoutAt:     null,
      status:         'in',
      receptionistId:   currentUser.uid,
      receptionistName: currentProfile.displayName || '',
      isWalkIn:       false,
      createdAt:      now
    };
    batch.set(checkinRef, checkinData);

    // 予約ステータス更新
    batch.update(db.collection('reservations').doc(reservation.id), {
      status:    RESERVATION_STATUS.CHECKED_IN,
      checkinId: checkinRef.id,
      updatedAt: now
    });

    // 入館証ステータス更新
    batch.update(db.collection('badges').doc(badge.id), {
      status:            BADGE_STATUS.IN_USE,
      currentCheckinId:  checkinRef.id,
      currentVisitorName:reservation.visitorName,
      issuedAt:          now,
      updatedAt:         now
    });

    await batch.commit();

    // ログ・通知
    await writeLog('checkin', 'checkin', checkinRef.id, 'checkin', {
      visitorName: reservation.visitorName, badge: badge.badgeNumber
    });
    await createNotification('checkin', '入館通知', `${reservation.visitorName}様が入館されました（${badge.badgeNumber}）`, checkinRef.id);

    // 担当者へメール
    if (reservation.employeeId) {
      try {
        const empSnap = await db.collection('employees').doc(reservation.employeeId).get();
        if (empSnap.exists) {
          await sendCheckinEmail(
            { ...checkinData, checkinAt: new Date() },
            empSnap.data().email
          );
        }
      } catch (e) { console.warn('Mail error:', e); }
    }

    closeModal('modal-badge');
    document.getElementById('checkin-detail').classList.remove('checkin-detail--show');
    selectedReservation = null;
    pendingBadge        = null;
    showToast(`${reservation.visitorName}様の入館処理が完了しました。入館証: ${badge.badgeNumber}`, 'success');

  } catch (err) {
    showToast('入館処理エラー: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

// ============================================================
//  本日予約リスト
// ============================================================
function listenTodayReservations() {
  const tbody = document.getElementById('today-list');
  const q = db.collection('reservations')
    .where('visitDate', '>=', todayStart())
    .where('visitDate', '<=', todayEnd())
    .orderBy('visitDate');

  const unsub = q.onSnapshot(snap => {
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--color-text-3);">本日の予約はありません</td></tr>';
      return;
    }
    tbody.innerHTML = snap.docs.map(d => {
      const r = d.data();
      const statusLabels = {
        pending:'予約済', confirmed:'確認済', checked_in:'入館中',
        checked_out:'退館済', cancelled:'キャンセル', rejected:'拒否'
      };
      const canCheckin = r.status === RESERVATION_STATUS.PENDING || r.status === RESERVATION_STATUS.CONFIRMED;
      return `<tr class="fade-in">
        <td><strong>${sanitize(r.visitorName)}</strong></td>
        <td>${sanitize(r.visitorCompany)}</td>
        <td>${formatTime(r.visitDate)}</td>
        <td>${sanitize(r.departmentName || '-')}</td>
        <td><span class="badge badge--${r.status}">${statusLabels[r.status] || r.status}</span></td>
        <td>
          ${canCheckin
            ? `<button class="btn btn--gold btn--sm" onclick="showVisitorDetail(${JSON.stringify({id:d.id,...r}).replace(/"/g,'&quot;')})">受付</button>`
            : '—'
          }
        </td>
      </tr>`;
    }).join('');
  });
  unsubscribers.push(unsub);
}

// ============================================================
//  当日受付一覧（リアルタイム）
// ============================================================
function listenWalkIns() {
  const listEl    = document.getElementById('walkin-list');
  const countEl   = document.getElementById('walkin-count');
  const q = db.collection('walkIns')
    .where('status', '==', WALKIN_STATUS.PENDING)
    .orderBy('submittedAt');

  const unsub = q.onSnapshot(snap => {
    if (countEl) countEl.textContent = snap.size + '件';
    if (snap.empty) {
      listEl.innerHTML = `<div class="empty-state"><div class="empty-state__icon">📋</div><p class="empty-state__title">承認待ちはありません</p></div>`;
      return;
    }
    listEl.innerHTML = snap.docs.map(d => {
      const w = d.data();
      return `<div class="approval-card fade-in">
        <div class="approval-card__header">
          <div>
            <div class="approval-card__name">${sanitize(w.name)}</div>
            <div style="color:var(--color-text-3);font-size:13px;">${sanitize(w.company)}</div>
          </div>
          <span class="badge badge--pending">承認待ち</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px;">
          <div><span style="color:var(--color-text-3);">訪問部署: </span>${sanitize(w.departmentName || '-')}</div>
          <div><span style="color:var(--color-text-3);">訪問相手: </span>${sanitize(w.hostName || '-')}</div>
          <div><span style="color:var(--color-text-3);">用件: </span>${sanitize(w.purpose || '-')}</div>
          <div><span style="color:var(--color-text-3);">申請時刻: </span>${formatTime(w.submittedAt)}</div>
        </div>
        <div style="display:flex;gap:12px;margin-top:16px;">
          <button class="btn btn--success btn--sm" onclick="approveWalkIn('${d.id}')">✓ 承認して入館処理</button>
          <button class="btn btn--danger btn--sm" onclick="rejectWalkIn('${d.id}')">✕ 拒否</button>
        </div>
      </div>`;
    }).join('');
  });
  unsubscribers.push(unsub);
}

async function approveWalkIn(walkInId) {
  showLoading('処理中...');
  try {
    const snap = await db.collection('walkIns').doc(walkInId).get();
    if (!snap.exists) return;
    const w = snap.data();

    const badge = await getAvailableBadge();
    if (!badge) { showToast('利用可能な入館証がありません。', 'error'); return; }

    const batch = db.batch();
    const now   = firebase.firestore.FieldValue.serverTimestamp();
    const checkinRef = db.collection('checkins').doc();

    batch.set(checkinRef, {
      walkInId:       walkInId,
      visitorName:    w.name,
      visitorCompany: w.company,
      visitorEmail:   w.email || '',
      departmentId:   w.departmentId || '',
      departmentName: w.departmentName || '',
      employeeName:   w.hostName || '',
      badgeId:        badge.badgeNumber,
      badgeDocId:     badge.id,
      checkinAt:      now,
      checkoutAt:     null,
      status:         'in',
      receptionistId:   currentUser.uid,
      receptionistName: currentProfile.displayName || '',
      isWalkIn:       true,
      createdAt:      now
    });

    batch.update(db.collection('walkIns').doc(walkInId), {
      status:      WALKIN_STATUS.CHECKED_IN,
      checkinId:   checkinRef.id,
      respondedAt: now,
      respondedBy: currentUser.uid
    });

    batch.update(db.collection('badges').doc(badge.id), {
      status:            BADGE_STATUS.IN_USE,
      currentCheckinId:  checkinRef.id,
      currentVisitorName:w.name,
      issuedAt:          now,
      updatedAt:         now
    });

    await batch.commit();
    await writeLog('walkin_approved', 'checkin', checkinRef.id, 'checkin', { visitorName: w.name });
    showToast(`${w.name}様を承認しました。入館証: ${badge.badgeNumber}`, 'success');
  } catch (err) {
    showToast('処理エラー: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

async function rejectWalkIn(walkInId) {
  if (!confirm('この来訪を拒否しますか？')) return;
  try {
    await db.collection('walkIns').doc(walkInId).update({
      status:      WALKIN_STATUS.REJECTED,
      respondedAt: firebase.firestore.FieldValue.serverTimestamp(),
      respondedBy: currentUser.uid
    });
    showToast('来訪を拒否しました。', 'info');
  } catch (err) {
    showToast('エラー: ' + err.message, 'error');
  }
}

// ============================================================
//  在館管理（リアルタイム）
// ============================================================
function listenInhouse() {
  const tbody = document.getElementById('inhouse-table');
  const q = db.collection('checkins').where('status', '==', 'in').orderBy('checkinAt', 'desc');

  const unsub = q.onSnapshot(snap => {
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--color-text-3);">現在在館者はいません</td></tr>';
      return;
    }
    tbody.innerHTML = snap.docs.map(d => {
      const c = d.data();
      return `<tr class="fade-in">
        <td><strong>${sanitize(c.visitorName)}</strong></td>
        <td>${sanitize(c.visitorCompany)}</td>
        <td><span class="badge badge--gold">${sanitize(c.badgeId || '-')}</span></td>
        <td>${sanitize(c.departmentName || '-')}</td>
        <td>${formatTime(c.checkinAt)}</td>
        <td>
          <button class="btn btn--outline btn--sm" onclick="processCheckout('${d.id}','${sanitize(c.visitorName)}')">退館処理</button>
        </td>
      </tr>`;
    }).join('');
  });
  unsubscribers.push(unsub);
}

// ============================================================
//  退館処理
// ============================================================
function initCheckout() {
  const btn = document.getElementById('btn-checkout');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const badgeNum = document.getElementById('checkout-badge').value.trim().toUpperCase();
    if (!badgeNum) { showToast('入館証番号を入力してください。', 'warning'); return; }
    await checkoutByBadge(badgeNum);
  });
}

async function checkoutByBadge(badgeNumber) {
  showLoading('退館処理中...');
  try {
    // checkins から入館証番号で検索
    const snap = await db.collection('checkins')
      .where('badgeId', '==', badgeNumber)
      .where('status', '==', 'in')
      .limit(1).get();

    if (snap.empty) {
      showToast(`入館証 ${badgeNumber} は使用されていません。`, 'warning');
      return;
    }
    const checkinDoc = snap.docs[0];
    await processCheckout(checkinDoc.id, checkinDoc.data().visitorName);
    document.getElementById('checkout-badge').value = '';
  } catch (err) {
    showToast('退館処理エラー: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

async function processCheckout(checkinId, visitorName) {
  if (!confirm(`${visitorName}様の退館処理を行いますか？`)) return;
  showLoading('退館処理中...');
  try {
    const checkinSnap = await db.collection('checkins').doc(checkinId).get();
    if (!checkinSnap.exists) { showToast('チェックイン記録が見つかりません。', 'error'); return; }
    const checkin = checkinSnap.data();
    const now = firebase.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();

    batch.update(db.collection('checkins').doc(checkinId), {
      status:     'out',
      checkoutAt: now
    });

    // 入館証を返却済みに
    if (checkin.badgeDocId) {
      batch.update(db.collection('badges').doc(checkin.badgeDocId), {
        status:            BADGE_STATUS.AVAILABLE,
        currentCheckinId:  null,
        currentVisitorName:null,
        returnedAt:        now,
        updatedAt:         now
      });
    }

    // 予約がある場合ステータス更新
    if (checkin.reservationId) {
      batch.update(db.collection('reservations').doc(checkin.reservationId), {
        status:    RESERVATION_STATUS.CHECKED_OUT,
        updatedAt: now
      });
    }

    await batch.commit();
    await writeLog('checkout', 'checkin', checkinId, 'checkin', { visitorName: checkin.visitorName });
    await createNotification('checkout', '退館通知', `${checkin.visitorName}様が退館されました`, checkinId);

    // 担当者へメール
    if (checkin.employeeId) {
      try {
        const empSnap = await db.collection('employees').doc(checkin.employeeId).get();
        if (empSnap.exists) {
          await sendCheckoutEmail(
            { ...checkin, checkoutAt: new Date() },
            empSnap.data().email
          );
        }
      } catch (e) { console.warn('Mail error:', e); }
    }

    showToast(`${visitorName}様の退館処理が完了しました。`, 'success');
  } catch (err) {
    showToast('退館処理エラー: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

// ============================================================
//  退館履歴
// ============================================================
function listenCheckoutHistory() {
  const tbody = document.getElementById('checkout-history');
  const q = db.collection('checkins')
    .where('status', '==', 'out')
    .where('checkinAt', '>=', todayStart())
    .orderBy('checkinAt', 'desc');

  const unsub = q.onSnapshot(snap => {
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--color-text-3);">退館履歴はありません</td></tr>';
      return;
    }
    tbody.innerHTML = snap.docs.map(d => {
      const c = d.data();
      let stay = '-';
      if (c.checkinAt && c.checkoutAt) {
        const inMs  = c.checkinAt.toDate  ? c.checkinAt.toDate().getTime()  : new Date(c.checkinAt).getTime();
        const outMs = c.checkoutAt.toDate ? c.checkoutAt.toDate().getTime() : new Date(c.checkoutAt).getTime();
        const min   = Math.round((outMs - inMs) / 60000);
        stay = `${Math.floor(min/60)}時間${min % 60}分`;
      }
      return `<tr class="fade-in">
        <td>${sanitize(c.visitorName)}</td>
        <td>${sanitize(c.visitorCompany)}</td>
        <td>${sanitize(c.badgeId || '-')}</td>
        <td>${formatTime(c.checkinAt)}</td>
        <td>${formatTime(c.checkoutAt)}</td>
        <td>${stay}</td>
      </tr>`;
    }).join('');
  });
  unsubscribers.push(unsub);
}

// ============================================================
//  緊急モード
// ============================================================
function initEmergency() {
  const btn = document.getElementById('btn-emergency');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    await loadEmergencyList();
    openModal('modal-emergency');
  });

  const csvBtn = document.getElementById('btn-emergency-csv');
  if (csvBtn) csvBtn.addEventListener('click', exportEmergencyCSV);

  const exportBtn = document.getElementById('btn-export-inhouse');
  if (exportBtn) exportBtn.addEventListener('click', exportEmergencyCSV);
}

let emergencyData = [];
async function loadEmergencyList() {
  const tbody = document.getElementById('emergency-list');
  const snap  = await db.collection('checkins').where('status', '==', 'in').orderBy('checkinAt').get();
  emergencyData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (snap.empty) {
    tbody.innerHTML = '<tr><td colspan="6" style="padding:24px;text-align:center;">現在在館者はいません</td></tr>';
    return;
  }
  tbody.innerHTML = emergencyData.map(c => `<tr>
    <td><strong>${sanitize(c.visitorName)}</strong></td>
    <td>${sanitize(c.visitorCompany)}</td>
    <td>${sanitize(c.badgeId || '-')}</td>
    <td>${formatTime(c.checkinAt)}</td>
    <td>${sanitize(c.departmentName || '-')}</td>
    <td>${sanitize(c.employeeName || '-')}</td>
  </tr>`).join('');
}

function exportEmergencyCSV() {
  const rows = emergencyData.map(c => ({
    '氏名':       c.visitorName,
    '会社':       c.visitorCompany,
    '入館証':     c.badgeId || '-',
    '入館時刻':   formatDateTime(c.checkinAt),
    '部署':       c.departmentName || '-',
    '担当者':     c.employeeName || '-'
  }));
  exportCSV(rows, `緊急在館者一覧_${new Date().toLocaleDateString('ja-JP').replace(/\//g,'-')}.csv`);
}

// ============================================================
//  モバイルナビ・テーマ
// ============================================================
function initMobileNav() {
  const h = document.getElementById('hamburger');
  const s = document.getElementById('sidebar');
  const o = document.getElementById('sidebar-overlay');
  if (!h) return;
  h.addEventListener('click', () => { s.classList.toggle('sidebar--open'); o.classList.toggle('sidebar-overlay--show'); });
  o.addEventListener('click', () => { s.classList.remove('sidebar--open'); o.classList.remove('sidebar-overlay--show'); });
}

function initThemeToggle() {
  if (localStorage.getItem('theme') === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const n = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', n);
    localStorage.setItem('theme', n);
  });
}
