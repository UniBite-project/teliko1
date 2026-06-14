/* ============================================================
   UniBite – Cook Dashboard  |  s.js
   fetch() API + live timers + modal view + full UX
   ============================================================ */

'use strict';

/* ══════════════════════════════════════════════════════════════
   1. ΣΤΑΘΕΡΕΣ & ΚΑΤΑΣΤΑΣΗ
══════════════════════════════════════════════════════════════ */
const ALLERGEN_LABELS = {
    'gluten':      'Gluten',       'milk':        'Milk',
    'eggs':        'Eggs',         'fish':        'Fish',
    'peanuts':     'Peanuts',      'soybeans':    'Soybeans',
    'tree-nuts':   'Tree Nuts',    'sesame':      'Sesame',
    'celery':      'Celery',       'mustard':     'Mustard',
    'sulfites':    'Sulfites',     'lupin':       'Lupin',
    'molluscs':    'Molluscs',     'crustaceans': 'Crustaceans'
};

const REQUESTS_VISIBLE = 3; // αρχικά ορατά αιτήματα

let editingListingId = null;  // null → create mode, value → edit mode
let pendingFile      = null;  // αρχείο σε αναμονή μεταφόρτωσης

/* DOM refs – γεμίζουν στο DOMContentLoaded */
let DOM = {};

/* ══════════════════════════════════════════════════════════════
   2. ΕΚΚΙΝΗΣΗ
══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

    DOM = {
        form:           document.getElementById('listingForm'),
        titleInput:     document.getElementById('titleInput'),
        locationInput:  document.getElementById('locationInput'),
        timeInput:      document.getElementById('timeInput'),
        notesTextarea:  document.getElementById('notesInput'),
        counterValue:   document.getElementById('counterValue'),
        counterMinus:   document.getElementById('counterMinus'),
        counterPlus:    document.getElementById('counterPlus'),
        allergenCBs:    document.querySelectorAll('.allergen-item input[type="checkbox"]'),
        saveBtn:        document.getElementById('saveBtn'),
        clearBtn:       document.getElementById('clearBtn'),
        uploadBox:      document.getElementById('uploadBox'),
        listingPanel:   document.getElementById('listingPanel'),
        listingsLoading: document.getElementById('listingsLoading'),
        listingCounterText: document.getElementById('listingCounterText'),
        requestsPanel:  document.getElementById('requestsPanel'),
        requestsList:   document.getElementById('requestsList'),
        requestsBadge:  document.getElementById('requestsBadge'),
        viewAllLink:    document.getElementById('viewAllLink'),
        panelTitle:     document.getElementById('panelTitle'),
    };

    initCounter();
    initUpload();
    initFormEvents();
    initListingPanel();
    initRequestsPanel();

    /* Φόρτωση δεδομένων από server */
    loadListings();
    loadRequests();

    /* Live ενημέρωση χρόνων κάθε 30 δευτερόλεπτα */
    updateLiveTimes();

    setInterval(updateLiveTimes, 30000);
});

/* ══════════════════════════════════════════════════════════════
   3. COUNTER
══════════════════════════════════════════════════════════════ */
function initCounter() {
    DOM.counterMinus.addEventListener('click', () => {
        const v = getPortions();
        if (v > 1) DOM.counterValue.textContent = v - 1;
    });
    DOM.counterPlus.addEventListener('click', () => {
        const v = getPortions();
        if (v < 999) DOM.counterValue.textContent = v + 1;
    });
}
function getPortions()  { return parseInt(DOM.counterValue.textContent, 10) || 1; }
function setPortions(n) {
    let v = parseInt(n, 10);
    if (isNaN(v) || v < 1) v = 1;
    if (v > 999) v = 999;
    DOM.counterValue.textContent = v;
}

/* ══════════════════════════════════════════════════════════════
   4. UPLOAD / DRAG & DROP
══════════════════════════════════════════════════════════════ */
function initUpload() {
    const fi = document.createElement('input');
    fi.type = 'file';
    fi.accept = 'image/png,image/jpeg,image/gif';
    fi.style.display = 'none';
    document.body.appendChild(fi);
    DOM.fileInput = fi;

    DOM.uploadBox.addEventListener('click', () => fi.click());
    DOM.uploadBox.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); }
    });

    fi.addEventListener('change', e => {
        if (e.target.files[0]) previewFile(e.target.files[0]);
        fi.value = '';
    });

    DOM.uploadBox.addEventListener('dragover', e => {
        e.preventDefault();
        DOM.uploadBox.classList.add('dragover');
    });
    DOM.uploadBox.addEventListener('dragleave', () => DOM.uploadBox.classList.remove('dragover'));
    DOM.uploadBox.addEventListener('drop', e => {
        e.preventDefault();
        DOM.uploadBox.classList.remove('dragover');
        const f = e.dataTransfer.files[0];
        if (f && f.type.startsWith('image/')) previewFile(f);
    });
}

function previewFile(file) {
    const allowed = ['image/png', 'image/jpeg', 'image/gif'];
    if (!allowed.includes(file.type)) {
        showToast('Επιτρέπονται μόνο εικόνες PNG, JPG ή GIF.', 'error');
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        showToast('Η εικόνα υπερβαίνει τα 5 MB.', 'error');
        return;
    }
    pendingFile = file;
    const reader = new FileReader();
    reader.onload = ev => {
        DOM.uploadBox.innerHTML = `
            <img src="${ev.target.result}" alt="Προεπισκόπηση"
                 style="max-height:120px;border-radius:8px;object-fit:cover;margin-bottom:.5rem;">
            <div class="upload-text">${escHtml(file.name)}</div>
            <div class="upload-hint">Κάνε κλικ για αλλαγή</div>`;
    };
    reader.readAsDataURL(file);
}

function resetUploadBox() {
    pendingFile = null;
    DOM.uploadBox.innerHTML = `
        <svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <div class="upload-title">Μεταφόρτωση φωτογραφίας</div>
        <div class="upload-text">Κάνε drag &amp; drop ή πάτησε για επιλογή</div>
        <div class="upload-hint">PNG, JPG, GIF (max 5MB)</div>`;
}

/* ══════════════════════════════════════════════════════════════
   5. ΦΟΡΜΑ – CREATE / UPDATE
══════════════════════════════════════════════════════════════ */
function initFormEvents() {
    DOM.form.addEventListener('submit', handleFormSubmit);
    DOM.clearBtn.addEventListener('click', () => resetForm());
}

async function handleFormSubmit(e) {
    e.preventDefault();

    const title    = DOM.titleInput.value.trim();
    const location = DOM.locationInput.value.trim();
    const time     = DOM.timeInput.value;
    const portions = getPortions();

    if (!title)    { showToast('Συμπλήρωσε τίτλο αγγελίας.', 'error');      DOM.titleInput.focus();    return; }
    if (!location) { showToast('Συμπλήρωσε τοποθεσία παραλαβής.', 'error'); DOM.locationInput.focus(); return; }
    if (!time)     { showToast('Συμπλήρωσε ώρα παραλαβής.', 'error');       DOM.timeInput.focus();     return; }
    if (portions < 1) { showToast('Η ποσότητα πρέπει να είναι τουλάχιστον 1.', 'error'); return; }

    const allergens = [...DOM.allergenCBs].filter(cb => cb.checked).map(cb => cb.value).join(',');

    const fd = new FormData();
    fd.append('title',           title);
    fd.append('pickup_location', location);
    fd.append('pickup_time',     time);
    fd.append('total_portions',  portions);
    fd.append('allergens',       allergens);
    fd.append('description',     DOM.notesTextarea.value.trim());
    if (pendingFile) fd.append('image', pendingFile);

    const isEdit = !!editingListingId;
    if (isEdit) fd.append('listing_id', editingListingId);
    const url = isEdit ? 'cook.php?action=update_listing' : 'cook.php?action=create_listing';

    DOM.saveBtn.disabled = true;
    DOM.saveBtn.textContent = 'Αποθήκευση…';

    try {
        const res  = await fetch(url, { method: 'POST', body: fd });
        const data = await res.json();
        if (data.success) {
            showToast(isEdit ? 'Η αγγελία ενημερώθηκε!' : 'Η αγγελία δημιουργήθηκε!', 'success');
            resetForm();
            loadListings();
        } else {
            showToast(data.message || 'Κάτι πήγε στραβά.', 'error');
        }
    } catch {
        showToast('Σφάλμα σύνδεσης με τον server.', 'error');
    } finally {
        DOM.saveBtn.disabled = false;
        DOM.saveBtn.textContent = editingListingId ? 'Ενημέρωση' : 'Αποθήκευση';
    }
}

function resetForm() {
    editingListingId = null;
    DOM.form.reset();
    setPortions(1);
    resetUploadBox();
    DOM.allergenCBs.forEach(cb => cb.checked = false);
    DOM.panelTitle.innerHTML = 'Δημιουργία / Επεξεργασία<br>Αγγελίας';
    DOM.saveBtn.textContent  = 'Αποθήκευση';
    DOM.saveBtn.disabled     = false;
}

/* ══════════════════════════════════════════════════════════════
   6. ΑΓΓΕΛΙΕΣ – LOAD & RENDER
══════════════════════════════════════════════════════════════ */
function initListingPanel() {
    DOM.listingPanel.addEventListener('click', handleListingClick);
}

async function loadListings() {
    try {
        const res  = await fetch('cook.php?action=get_listings');
        const data = await res.json();
        if (data.success) {
            renderListings(data.listings);
        } else {
            showListingsError(data.message || 'Αδυναμία φόρτωσης αγγελιών.');
        }
    } catch {
        showListingsError('Σφάλμα σύνδεσης με τον server.');
    }
}

function showListingsError(msg) {
    DOM.listingPanel.querySelectorAll('.listing-card, .panel-loading, .panel-empty')
        .forEach(el => el.remove());
    DOM.listingPanel.insertAdjacentHTML('beforeend',
        `<p class="panel-empty">${escHtml(msg)}</p>`);
    showToast(msg, 'error');
}

function renderListings(listings) {
    DOM.listingPanel.querySelectorAll('.listing-card, .panel-loading, .panel-empty')
        .forEach(el => el.remove());

    if (DOM.listingCounterText) {
        const strong = DOM.listingCounterText.querySelector('strong');
        if (strong) strong.textContent = listings.length;
    }

    if (!listings.length) {
        DOM.listingPanel.insertAdjacentHTML('beforeend',
            '<p class="panel-empty">Δεν υπάρχουν αγγελίες. Δημιούργησε την πρώτη σου!</p>');
        return;
    }

    const headerRow = DOM.listingPanel.querySelector('.listing-header-row');
    [...listings].reverse().forEach(l => {
        if (headerRow) {
            headerRow.insertAdjacentHTML('afterend', buildListingCard(l));
        } else {
            DOM.listingPanel.insertAdjacentHTML('beforeend', buildListingCard(l));
        }
    });
}

function buildListingCard(l) {
    /* ── ΣΥΝΔΥΑΣΜΟΣ ΠΡΟΒΛΗΜΑΤΟΣ 3: Ενοποίηση Ολοκληρώθηκε & Ανενεργής λόγω Soft Delete / Λήξης ── */
    let statusLabel = 'Ενεργή';
    let statusClass = 'status-active';
    const available = parseInt(l.available_portions, 10) || 0;

    if (l.status === 'inactive' || l.status === 'deleted') {
        statusLabel = 'Ολοκληρώθηκε';
        statusClass = 'status-completed'; // Κοινή κλάση CSS για λήξη/soft-delete
    }

    /* Expiry badge */
    let expiryHTML = '';
    if (l.expires_at && l.status === 'active') {
        const expiry = calcExpiry(l.expires_at);
        expiryHTML = `
            <div class="expiry-badge${expiry.expired ? ' expired' : ''}">
                <svg class="expiry-icon" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                <span class="expiry-text" data-expires="${escHtml(l.expires_at)}">${escHtml(expiry.text)}</span>
            </div>`;
    }

    /* Allergen tags */
    const allergens = l.allergens ? l.allergens.split(',').filter(Boolean) : [];
    const maxTags   = 3;
    let tagsHTML    = allergens.slice(0, maxTags)
                        .map(a => `<span class="tag-badge">${escHtml(ALLERGEN_LABELS[a] || a)}</span>`).join('');
    if (allergens.length > maxTags) {
        tagsHTML += `<span class="tag-badge tag-more">+${allergens.length - maxTags}</span>`;
    }
    if (!allergens.length) {
        tagsHTML = `<span class="tag-badge">Χωρίς αλλεργιογόνα</span>`;
    }

    /* Thumbnail */
    const thumb = l.image_path
        ? `<img src="${escHtml(l.image_path)}" alt="${escHtml(l.title)}">`
        : `<span style="font-size:2rem">🍽️</span>`;

    /* ── ΔΙΟΡΘΩΣΗ ΠΡΟΒΛΗΜΑΤΟΣ 2: Αποφυγή του "μερίδαμερίδες" ── */
    const suffix = available === 1 ? 'α' : 'ες';
    const activeSuffix = available === 1 ? 'η' : 'ες';
    const portionsText = available > 0
        ? `${available} μερίδ${suffix} διαθέσιμ${activeSuffix} από ${l.total_portions}`
        : `0 μερίδες διαθέσιμες από ${l.total_portions}`;

    const pickupDisplay = formatPickupTime(l.pickup_time);

    return `
<div class="listing-card" data-listing-id="${escHtml(String(l.listing_id))}" data-status="${escHtml(l.status)}">
    <div class="thumbnail-container">
        <div class="listing-thumbnail">${thumb}</div>
        ${expiryHTML}
    </div>
    <div class="listing-main">
        <div class="listing-title-row">
            <h3 class="listing-card-title">${escHtml(l.title)}</h3>
            <span class="status-badge ${statusClass}">${statusLabel}</span>
        </div>
        <div class="listing-meta">
            <div class="meta-item">
                <svg class="meta-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/>
                    <circle cx="12" cy="10" r="3"/>
                </svg>
                <span>${escHtml(l.pickup_location)}</span>
            </div>
            <div class="meta-item">
                <svg class="meta-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                </svg>
                <span>${escHtml(pickupDisplay)}</span>
            </div>
            <div class="meta-item qty-row">
                <span>Ποσότητα: <span class="meta-qty">${escHtml(portionsText)}</span></span>
            </div>
        </div>
        <div class="listing-tags">${tagsHTML}</div>
    </div>
    <div class="listing-actions">
        <button class="opt-btn opt-edit" data-action="edit" title="Επεξεργασία" aria-label="Επεξεργασία αγγελίας">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
        </button>
        <button class="opt-btn opt-delete" data-action="delete" title="Διαγραφή" aria-label="Διαγραφή αγγελίας">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
        </button>
        <button class="opt-btn opt-view-bottom" data-action="view" title="Προβολή" aria-label="Προβολή αγγελίας">
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
            </svg>
        </button>
    </div>
</div>`;
}

function handleListingClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const card = btn.closest('.listing-card');
    if (!card) return;
    const id  = card.dataset.listingId;
    const act = btn.dataset.action;

    if (act === 'edit')   editListing(id);
    if (act === 'delete') deleteListing(id);
    if (act === 'view')   viewListing(id);
}

async function editListing(id) {
    try {
        const res  = await fetch(`cook.php?action=get_listing&id=${encodeURIComponent(id)}`);
        const data = await res.json();
        if (!data.success) {
            showToast(data.message || 'Αδυναμία φόρτωσης αγγελίας.', 'error');
            return;
        }
        const l = data.listing;

        pendingFile      = null;
        editingListingId = id;

        DOM.titleInput.value    = l.title || '';
        DOM.locationInput.value = l.pickup_location || '';
        DOM.timeInput.value     = extractTimeHHMM(l.pickup_time);
        DOM.notesTextarea.value = l.description || '';
        setPortions(l.total_portions || 1);

        const allergenArr = l.allergens ? l.allergens.split(',').filter(Boolean) : [];
        DOM.allergenCBs.forEach(cb => { cb.checked = allergenArr.includes(cb.value); });

        if (l.image_path) {
            DOM.uploadBox.innerHTML = `
                <img src="${escHtml(l.image_path)}" alt="Προεπισκόπηση"
                     style="max-height:120px;border-radius:8px;object-fit:cover;margin-bottom:.5rem;">
                <div class="upload-text">Υπάρχουσα φωτογραφία</div>
                <div class="upload-hint">Κάνε κλικ για αλλαγή</div>`;
        } else {
            resetUploadBox();
        }

        DOM.panelTitle.innerHTML = 'Επεξεργασία<br>Αγγελίας';
        DOM.saveBtn.textContent  = 'Ενημέρωση';
        DOM.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        DOM.titleInput.focus();
    } catch {
        showToast('Σφάλμα σύνδεσης με τον server.', 'error');
    }
}

async function deleteListing(id) {
    if (!confirm('Θέλεις σίγουρα να διαγράψεις αυτή την αγγελία;')) return;
    try {
        const res  = await fetch('cook.php?action=delete_listing', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ listing_id: id })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Η αγγελία διαγράφηκε.', 'success');
            if (editingListingId === id) resetForm();
            loadListings();
            loadRequests();
        } else {
            showToast(data.message || 'Αδυναμία διαγραφής.', 'error');
        }
    } catch {
        showToast('Σφάλμα σύνδεσης με τον server.', 'error');
    }
}

async function viewListing(id) {
    try {
        const res  = await fetch(`cook.php?action=get_listing&id=${encodeURIComponent(id)}`);
        const data = await res.json();
        if (!data.success) {
            showToast(data.message || 'Αδυναμία φόρτωσης αγγελίας.', 'error');
            return;
        }
        showListingModal(data.listing);
    } catch {
        showToast('Σφάλμα σύνδεσης με τον server.', 'error');
    }
}

function showListingModal(l) {
    closeListingModal();

    const allergens = l.allergens ? l.allergens.split(',').filter(Boolean) : [];
    const allergenHTML = allergens.length
        ? `<div class="ub-modal-row"><strong>Αλλεργιογόνα:</strong>
            <div class="ub-modal-tags">
                ${allergens.map(a => `<span class="ub-modal-tag">${escHtml(ALLERGEN_LABELS[a] || a)}</span>`).join('')}
            </div></div>`
        : '';

    const thumbHTML = l.image_path
        ? `<img src="${escHtml(l.image_path)}" class="ub-modal-img" alt="${escHtml(l.title)}">`
        : `<div class="ub-modal-img ub-modal-img-placeholder">🍽️</div>`;

    const pickupDisplay = formatPickupTime(l.pickup_time) || '—';

    const overlay = document.createElement('div');
    overlay.className = 'ub-modal-overlay';
    overlay.innerHTML = `
        <div class="ub-modal-box" role="dialog" aria-modal="true" aria-label="${escHtml(l.title)}">
            <h3 class="ub-modal-title">${escHtml(l.title)}</h3>
            ${thumbHTML}
            <div class="ub-modal-row"><strong>📍 Τοποθεσία:</strong> ${escHtml(l.pickup_location)}</div>
            <div class="ub-modal-row"><strong>🕐 Ώρα παραλαβής:</strong> ${escHtml(pickupDisplay)}</div>
            <div class="ub-modal-row"><strong>🍽️ Μερίδες:</strong> ${escHtml(String(l.available_portions))}/${escHtml(String(l.total_portions))} διαθέσιμες</div>
            ${allergenHTML}
            ${l.description ? `<div class="ub-modal-row"><strong>📝 Σημειώσεις:</strong> ${escHtml(l.description)}</div>` : ''}
            <button class="ub-modal-close-btn" type="button">Κλείσιμο</button>
        </div>`;

    overlay.addEventListener('click', e => {
        if (e.target === overlay) closeListingModal();
    });
    overlay.querySelector('.ub-modal-box').addEventListener('click', e => e.stopPropagation());
    overlay.querySelector('.ub-modal-close-btn').addEventListener('click', closeListingModal);
    document.addEventListener('keydown', handleModalEsc);

    document.body.appendChild(overlay);
}

function handleModalEsc(e) {
    if (e.key === 'Escape') closeListingModal();
}

function closeListingModal() {
    document.querySelector('.ub-modal-overlay')?.remove();
    document.removeEventListener('keydown', handleModalEsc);
}

/* ══════════════════════════════════════════════════════════════
   7. ΑΙΤΗΜΑΤΑ – LOAD & RENDER
══════════════════════════════════════════════════════════════ */
function initRequestsPanel() {
    DOM.requestsPanel.addEventListener('click', handleRequestClick);

    DOM.viewAllLink.addEventListener('click', e => {
        e.preventDefault();
        DOM.requestsList.querySelectorAll('.request-card.ub-hidden').forEach(c => {
            c.classList.remove('ub-hidden');
            c.style.display = '';
        });
        DOM.viewAllLink.style.display = 'none';
    });
}

async function loadRequests() {
    try {
        const res  = await fetch('cook.php?action=get_requests');
        const data = await res.json();
        if (data.success) {
            renderRequests(data.requests);
        } else {
            showRequestsError(data.message || 'Αδυναμία φόρτωσης αιτημάτων.');
        }
    } catch {
        showRequestsError('Σφάλμα σύνδεσης με τον server.');
    }
}

function showRequestsError(msg) {
    DOM.requestsList.innerHTML = `<p class="panel-empty">${escHtml(msg)}</p>`;
    DOM.viewAllLink.style.display = 'none';
    if (DOM.requestsBadge) DOM.requestsBadge.textContent = '0';
    showToast(msg, 'error');
}

function renderRequests(requests) {
    DOM.requestsList.innerHTML = '';

    const pending = requests.filter(r => r.status === 'pending').length;
    if (DOM.requestsBadge) DOM.requestsBadge.textContent = pending;

    if (!requests.length) {
        DOM.requestsList.innerHTML = '<p class="panel-empty">Δεν υπάρχουν αιτήματα.</p>';
        DOM.viewAllLink.style.display = 'none';
        return;
    }

    requests.forEach((r, i) => {
        const html = buildRequestCard(r);
        const tmp  = document.createElement('div');
        tmp.innerHTML = html.trim();
        const card = tmp.firstElementChild;
        if (i >= REQUESTS_VISIBLE) {
            card.classList.add('ub-hidden');
            card.style.display = 'none';
        }
        DOM.requestsList.appendChild(card);
    });

    DOM.viewAllLink.style.display = requests.length > REQUESTS_VISIBLE ? 'inline-block' : 'none';
}

function buildRequestCard(r) {
    const initials = (r.requester_name || 'Άγνωστος')
        .trim().split(/\s+/).map(n => n[0] || '').join('').substring(0, 2).toUpperCase();
    const time = r.requested_at ? timeAgo(r.requested_at) : '';

    /* ── ΔΙΟΡΘΩΣΗ ΠΡΟΒΛΗΜΑΤΟΣ 1: Εμφάνιση Παρελήφθη / Απών όταν r.status === 'approved' ── */
    let actionsHTML = '';
    if (r.status === 'pending') {
        actionsHTML = `
            <button class="btn-req btn-accept" data-action="approve" data-id="${escHtml(String(r.request_id))}" title="Αποδοχή">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                <span>Αποδοχή</span>
            </button>
            <button class="btn-req btn-reject" data-action="reject" data-id="${escHtml(String(r.request_id))}" title="Απόρριψη">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                <span>Απόρριψη</span>
            </button>`;
    } else if (r.status === 'approved') {
        actionsHTML = `
            <button class="btn-req btn-received" data-action="received" data-id="${escHtml(String(r.request_id))}" title="Παρελήφθη">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                <span>Παρελήφθη</span>
            </button>
            <button class="btn-req btn-absent" data-action="absent" data-id="${escHtml(String(r.request_id))}" title="Δεν εμφανίστηκε">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                <span>Απών</span>
            </button>`;
    } else {
        const stMap = {
            received: { text: '✓ Παρελήφθη',       cls: 'ub-status-received' },
            rejected: { text: '✗ Απορρίφθηκε',      cls: 'ub-status-rejected' },
            absent:   { text: '⚠ Δεν εμφανίστηκε', cls: 'ub-status-absent'   },
        };
        const st = stMap[r.status] || { text: r.status, cls: 'ub-status-default' };
        actionsHTML = `<span class="ub-final-status ${st.cls}">${escHtml(st.text)}</span>`;
    }

    /* ── ΔΙΟΡΘΩΣΗ ΠΡΟΒΛΗΜΑΤΟΣ 2: Αποφυγή του "μερίδαμερίδες" στο αίτημα ── */
    const reqPortions = parseInt(r.requested_portions, 10) || 1;
    const reqPortionsText = `${reqPortions} μερίδ${reqPortions === 1 ? 'α' : 'ες'}`;

    return `
<div class="request-card" data-id="${escHtml(String(r.request_id))}" data-status="${escHtml(r.status)}">
    <div class="request-profile">
        <div class="user-avatar">${escHtml(initials)}</div>
        <div class="user-meta">
            <span class="user-name">${escHtml(r.requester_name || 'Άγνωστος')}</span>
            <span class="request-time" data-requested-at="${escHtml(r.requested_at || '')}">
                <svg class="meta-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                ${escHtml(time)}
            </span>
        </div>
    </div>
    <div class="request-details">
        <div class="request-target">
            <span class="details-label">Αγγελία</span>
            <span class="details-value">${escHtml(r.title || '—')}</span>
        </div>
        <div class="request-qty">
            <span class="details-label">Ζητούμενες μερίδες</span>
            <span class="portions-badge">${escHtml(reqPortionsText)}</span>
        </div>
    </div>
    <div class="request-actions">${actionsHTML}</div>
</div>`;
}

function handleRequestClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    const statusMap = { approve: 'approved', reject: 'rejected', received: 'received', absent: 'absent' };
    if (statusMap[action]) updateRequest(id, statusMap[action], btn);
}

async function updateRequest(requestId, newStatus, btn) {
    const confirmMsgs = {
        approved: 'Αποδοχή αιτήματος;',
        rejected: 'Απόρριψη αιτήματος;',
        received: 'Επιβεβαίωση παραλαβής;',
        absent:   'Σήμανση ως «Δεν εμφανίστηκε»;'
    };
    if (!confirm(confirmMsgs[newStatus] || 'Επιβεβαίωση;')) return;

    const card = btn?.closest('.request-card');
    card?.querySelectorAll('button').forEach(b => b.disabled = true);

    try {
        const res  = await fetch('cook.php?action=update_request', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ request_id: requestId, status: newStatus })
        });
        const data = await res.json();
        if (data.success) {
            const toastMsgs = {
                approved: 'Το αίτημα εγκρίθηκε!',
                rejected: 'Το αίτημα απορρίφθηκε.',
                received: 'Η παραλαβή καταχωρήθηκε!',
                absent:   'Η μη εμφάνιση καταχωρήθηκε.'
            };
            showToast(toastMsgs[newStatus] || 'Ενημερώθηκε.', 'success');
            
            /* Live re-fetch */
            loadRequests();
            loadListings(); 
        } else {
            showToast(data.message || 'Αδυναμία ενημέρωσης.', 'error');
            card?.querySelectorAll('button').forEach(b => b.disabled = false);
        }
    } catch {
        showToast('Σφάλμα σύνδεσης με τον server.', 'error');
        card?.querySelectorAll('button').forEach(b => b.disabled = false);
    }
}

/* ══════════════════════════════════════════════════════════════
   8. LIVE ΧΡΟΝΟΙ (setInterval κάθε 30 δευτ.)
══════════════════════════════════════════════════════════════ */
function updateLiveTimes() {
    document.querySelectorAll('.expiry-text').forEach(el => {
        const expiresAt = el.dataset.expires;
        if (!expiresAt) return;
        const expiry = calcExpiry(expiresAt);
        el.textContent = expiry.text;
        const badge = el.closest('.expiry-badge');
        if (badge) badge.classList.toggle('expired', expiry.expired);
    });

    document.querySelectorAll('.request-time[data-requested-at]').forEach(el => {
        const at = el.dataset.requestedAt;
        if (!at) return;
        const svg = el.querySelector('svg');
        el.textContent = '';
        if (svg) el.appendChild(svg);
        el.appendChild(document.createTextNode(' ' + timeAgo(at)));
    });
}

/* ══════════════════════════════════════════════════════════════
   9. ΒΟΗΘΗΤΙΚΕΣ ΣΥΝΑΡΤΗΣΕΙΣ
══════════════════════════════════════════════════════════════ */

function parseMysqlDatetime(str) {
    if (!str) return null;
    const parts = String(str).split(/[- :T]/);
    if (parts.length < 3) return null;
    return new Date(
        parts[0],
        parts[1] - 1, 
        parts[2],
        parts[3] || 0,
        parts[4] || 0,
        parts[5] || 0
    );
}

function extractTimeHHMM(str) {
    if (!str) return '';
    const d = parseMysqlDatetime(str);
    if (!d) return '';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
}

function formatPickupTime(str) {
    return extractTimeHHMM(str);
}

function calcExpiry(expiresAtStr) {
    const expiry = parseMysqlDatetime(expiresAtStr);
    if (!expiry) return { expired: false, text: '' };

    const diff = expiry.getTime() - Date.now();
    if (diff <= 0) return { expired: true, text: 'Έληξε' };

    const hrs  = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);

    if (hrs > 0) return { expired: false, text: `Λήγει σε ${hrs} ώρ${hrs === 1 ? 'α' : 'ες'}` };
    return { expired: false, text: `Λήγει σε ${mins} λεπτά` };
}

function timeAgo(dateStr) {
    const d = parseMysqlDatetime(dateStr);
    if (!d) return '';
    const diff = Date.now() - d.getTime();
    if (diff < 0) return 'Μόλις τώρα';

    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);

    if (mins  < 1)  return 'Μόλις τώρα';
    if (mins  < 60) return `Πριν ${mins} λεπτ${mins === 1 ? 'ό' : 'ά'}`;
    if (hours < 24) return `Πριν ${hours} ώρ${hours === 1 ? 'α' : 'ες'}`;
    return `Πριν ${days} μέρ${days === 1 ? 'α' : 'ες'}`;
}

function escHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function showToast(msg, type = 'success') {
    document.querySelector('.unibite-toast')?.remove();
    const t = document.createElement('div');
    t.className = `unibite-toast unibite-toast-${type}`;
    t.setAttribute('role', 'status');
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
        t.classList.remove('show');
        setTimeout(() => t.remove(), 300);
    }, 3200);
}