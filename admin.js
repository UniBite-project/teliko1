(function () {
    'use strict';

    // ── ROLE GUARD ──
    const loggedUser = localStorage.getItem('unibite_user');
    const userRole   = localStorage.getItem('unibite_role');
    if (!loggedUser) { window.location.href = 'admin.html'; return; }
    if (userRole !== 'admin') { window.location.href = 'window.html'; return; }

    // ── HELPERS ──
    function formatDate(iso) {
        const d = new Date(iso);
        const p = n => String(n).padStart(2, '0');
        return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
    }

    function getAdStatus(ad) {
        const expiry = new Date(new Date(ad.createdAt).getTime() + 48 * 3600000);
        if (Date.now() >= expiry.getTime()) return 'deleted';
        if (ad.available_portions <= 0) return 'inactive';
        return 'active';
    }

    function statusBadge(status) {
        switch (status) {
            case 'active':   return '<span class="badge badge-active">Active</span>';
            case 'inactive': return '<span class="badge badge-inactive">Inactive</span>';
            default:         return '<span class="badge badge-deleted">Expired</span>';
        }
    }

    function rankClass(i) {
        return i === 0 ? 'rank-num gold' : i === 1 ? 'rank-num silver' : i === 2 ? 'rank-num bronze' : 'rank-num';
    }

    // ── DATA ──
    let adsData = [
        { id: 101, title: 'Pasta Bolognese',           chef: 'Christos Drelias',   available_portions: 4, total_portions: 6,  createdAt: new Date(Date.now() - 16 * 3600000).toISOString(),       rating: 4.6 },
        { id: 102, title: 'Spetzofai (traditional)',   chef: 'Eleni Papadaki',     available_portions: 2, total_portions: 3,  createdAt: new Date(Date.now() - 3  * 3600000).toISOString(),       rating: 4.7 },
        { id: 103, title: 'Green Bean Stew',           chef: 'Maria Konstantinou', available_portions: 0, total_portions: 3,  createdAt: new Date(Date.now() - 24 * 3600000).toISOString(),       rating: 4.5 },
        { id: 104, title: 'Oven-Roasted Chicken',      chef: 'Christos Drelias',   available_portions: 1, total_portions: 4,  createdAt: new Date(Date.now() - 50 * 3600000).toISOString(),       rating: 4.7 },
        { id: 105, title: "Mom's Pastitsio",           chef: 'Giannis Papadopoulos', available_portions: 0, total_portions: 5, createdAt: new Date(Date.now() - 30 * 24 * 3600000).toISOString(), rating: 4.9 },
        { id: 106, title: 'Gemista (stuffed veg)',     chef: 'Giannis Papadopoulos', available_portions: 0, total_portions: 4, createdAt: new Date(Date.now() - 60 * 3600000).toISOString(),       rating: 4.4 },
        { id: 107, title: 'Lentil Soup',               chef: 'Maria Konstantinou', available_portions: 0, total_portions: 6,  createdAt: new Date(Date.now() - 10 * 24 * 3600000).toISOString(),  rating: 4.5 },
        { id: 108, title: 'Meatballs with Rice',       chef: 'Andreas Georgiou',   available_portions: 0, total_portions: 4,  createdAt: new Date(Date.now() - 40 * 24 * 3600000).toISOString(),  rating: 4.2 },
        { id: 109, title: 'Moussaka',                  chef: 'Nikos Karagiannis',  available_portions: 0, total_portions: 6,  createdAt: new Date(Date.now() - 15 * 24 * 3600000).toISOString(),  rating: 4.8 }
    ];

    function portionsGiven(ad) { return ad.total_portions - ad.available_portions; }

    function computeLeaderboard() {
        const map = {};
        adsData.forEach(ad => {
            const g = portionsGiven(ad);
            if (g > 0) map[ad.chef] = (map[ad.chef] || 0) + g;
        });
        return Object.entries(map)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
    }

    function computeTopMeals() {
        return adsData
            .filter(ad => typeof ad.rating === 'number')
            .slice().sort((a, b) => b.rating - a.rating)
            .slice(0, 5);
    }

    function computeTotalSharesLastMonth() {
        const cutoff = Date.now() - 30 * 24 * 3600000;
        return adsData.reduce((sum, ad) => {
            return new Date(ad.createdAt).getTime() >= cutoff ? sum + portionsGiven(ad) : sum;
        }, 0);
    }

    // ── RENDER: OVERVIEW ──
    function renderOverview() {
        const lb = computeLeaderboard();
        const tm = computeTopMeals();

        setText('statSharesMonth', computeTotalSharesLastMonth());
        setText('statTopDonor',   lb.length ? lb[0].name : '—');
        setText('statTopRating',  tm.length ? `${tm[0].title} · ${tm[0].rating.toFixed(1)}/5` : '—');

        let active = 0, deleted = 0;
        adsData.forEach(ad => {
            const s = getAdStatus(ad);
            if (s === 'active') active++;
            else if (s === 'deleted') deleted++;
        });
        setText('statTotalAds',   adsData.length);
        setText('statActiveAds',  active);
        setText('statDeletedAds', deleted);

        const recent = adsData.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
        document.getElementById('recentAdsBody').innerHTML = recent.map(ad => `
            <tr>
                <td style="color:var(--text-muted)">#${ad.id}</td>
                <td>${ad.title}</td>
                <td>${ad.chef}</td>
                <td style="color:var(--text-muted)">${formatDate(ad.createdAt)}</td>
                <td>${statusBadge(getAdStatus(ad))}</td>
            </tr>`).join('');
    }

    // ── RENDER: LEADERBOARD ──
    function renderLeaderboard() {
        const lb = computeLeaderboard();
        document.getElementById('leaderboardBody').innerHTML = lb.length
            ? lb.map((u, i) => `<tr>
                <td><span class="${rankClass(i)}">${i + 1}</span></td>
                <td>${u.name}</td>
                <td>${u.count} portions</td>
              </tr>`).join('')
            : '<tr class="empty-row"><td colspan="3">No data yet</td></tr>';

        const tm = computeTopMeals();
        document.getElementById('topMealsBody').innerHTML = tm.length
            ? tm.map(m => `<tr>
                <td>${m.title}</td>
                <td style="color:var(--text-muted)">${m.chef}</td>
                <td><span class="rating">${m.rating.toFixed(1)} <span class="rating-star">&#9733;</span></span></td>
              </tr>`).join('')
            : '<tr class="empty-row"><td colspan="3">No ratings yet</td></tr>';
    }

    // ── RENDER: ALL ADS ──
    function renderAllAds() {
        const filter = document.getElementById('adsFilter').value;
        const sorted = adsData.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const list   = sorted.filter(ad => filter === 'all' || getAdStatus(ad) === filter);

        document.getElementById('allAdsBody').innerHTML = list.length
            ? list.map(ad => `<tr>
                <td style="color:var(--text-muted)">#${ad.id}</td>
                <td>${ad.title}</td>
                <td>${ad.chef}</td>
                <td style="color:var(--text-muted)">${formatDate(ad.createdAt)}</td>
                <td>${statusBadge(getAdStatus(ad))}</td>
                <td style="display:flex;gap:6px;flex-wrap:wrap;">
                    <button class="btn-view"  onclick="window.adminViewAd(${ad.id})">View info</button>
                    <button class="btn-delete" onclick="window.adminDeleteAd(${ad.id})">Delete</button>
                </td>
              </tr>`).join('')
            : '<tr class="empty-row"><td colspan="6">No listings match this filter</td></tr>';
    }

    function renderAll() { renderOverview(); renderLeaderboard(); renderAllAds(); }

    // ── HELPERS ──
    function setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    // ── VIEW AD INFO ──
    window.adminViewAd = function (id) {
        const ad = adsData.find(a => a.id === id);
        if (!ad) return;
        const status = getAdStatus(ad);
        document.getElementById('infoTitle').textContent = ad.title;
        document.getElementById('infoBody').innerHTML = `
            <div class="detail-row"><span class="detail-label">ID</span><span class="detail-val">#${ad.id}</span></div>
            <div class="detail-row"><span class="detail-label">Chef</span><span class="detail-val">${ad.chef}</span></div>
            <div class="detail-row"><span class="detail-label">Created</span><span class="detail-val">${formatDate(ad.createdAt)}</span></div>
            <div class="detail-row"><span class="detail-label">Portions</span><span class="detail-val">${portionsGiven(ad)} / ${ad.total_portions} shared</span></div>
            <div class="detail-row"><span class="detail-label">Rating</span><span class="detail-val">${ad.rating ? ad.rating.toFixed(1) + ' ★' : '—'}</span></div>
            <div class="detail-row"><span class="detail-label">Status</span><span class="detail-val">${statusBadge(status)}</span></div>
        `;
        openModal('infoModal');
    };

    // ── DELETE AD ──
    window.adminDeleteAd = function (id) {
        const ad = adsData.find(a => a.id === id);
        if (!ad) return;
        if (!confirm(`Delete listing "${ad.title}" (#${ad.id})? This cannot be undone.`)) return;
        adsData = adsData.filter(a => a.id !== id);
        renderAll();
        showAlert('Listing deleted', `Listing #${id} has been removed from the database.`, '&#128465;');
    };

    // ── MODAL HELPERS ──
    function openModal(id) { document.getElementById(id).classList.add('open'); }
    function closeModal(id) { document.getElementById(id).classList.remove('open'); }

    window.showAlert = function (title, body, icon) {
        document.getElementById('alertTitle').textContent = title;
        document.getElementById('alertBody').textContent  = body;
        document.getElementById('alertIcon').innerHTML    = icon || '&#128161;';
        openModal('alertModal');
    };

    document.getElementById('alertClose').addEventListener('click', () => closeModal('alertModal'));
    document.getElementById('infoClose').addEventListener('click',  () => closeModal('infoModal'));

    document.getElementById('alertModal').addEventListener('click', e => {
        if (e.target === document.getElementById('alertModal')) closeModal('alertModal');
    });
    document.getElementById('infoModal').addEventListener('click', e => {
        if (e.target === document.getElementById('infoModal')) closeModal('infoModal');
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') { closeModal('alertModal'); closeModal('infoModal'); }
    });

    // ── NAVIGATION ──
    const pages   = ['overview', 'leaderboard', 'ads'];
    const labels  = { overview: 'Overview', leaderboard: 'Leaderboard', ads: 'Manage Listings' };

    function switchPage(pageId) {
        pages.forEach(p => {
            const el = document.getElementById(`page-${p}`);
            if (el) el.classList.toggle('visible', p === pageId);
        });
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === pageId);
        });
        const lbl = document.getElementById('topbarPageLabel');
        if (lbl) lbl.textContent = labels[pageId] || '';
    }

    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function () {
            const page = this.dataset.page;
            if (page === 'logout') {
                localStorage.removeItem('unibite_user');
                localStorage.removeItem('unibite_role');
                window.location.href = 'admin.html';
                return;
            }
            switchPage(page);
            closeSidebar();
        });
    });

    // ── HAMBURGER / MOBILE SIDEBAR ──
    const sidebar   = document.getElementById('sidebar');
    const overlay   = document.getElementById('overlay');
    const hamburger = document.getElementById('hamburgerBtn');

    function openSidebar()  { sidebar.classList.add('open');  overlay.classList.add('show'); }
    function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('show'); }

    hamburger.addEventListener('click', () => {
        sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
    });
    overlay.addEventListener('click', closeSidebar);

    // ── FILTER LISTENER ──
    document.getElementById('adsFilter').addEventListener('change', renderAllAds);

    // ── INIT ──
    renderAll();
    switchPage('overview');
})();