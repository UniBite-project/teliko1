(() => {
    'use strict';

    const API_URL = 'home.php';

    const $ = (selector) => document.querySelector(selector);

    function showCustomAlert(title, message, icon = '💡') {
        const modal = $('#customAlertModal');
        if (!modal) {
            alert(`${title}\n${message}`);
            return;
        }
        $('#modalAlertIcon').textContent = icon;
        $('#modalAlertTitle').textContent = title;
        $('#modalAlertMessage').textContent = message;
        modal.classList.add('show');
        modal.style.display = 'flex';
    }

    window.closeCustomAlert = function closeCustomAlert() {
        const modal = $('#customAlertModal');
        if (modal) {
            modal.classList.remove('show');
            modal.style.display = 'none';
        }
    };

    function setupSidebar() {
        const btn = $('#hamburgerBtn');
        const sidebar = $('#sidebarMenu');
        const overlay = $('#overlay');
        const main = $('#mainContent');

        const toggleMenu = () => {
            sidebar?.classList.toggle('open');
            overlay?.classList.toggle('active');
            main?.classList.toggle('shifted');
        };

        btn?.addEventListener('click', toggleMenu);
        overlay?.addEventListener('click', toggleMenu);
    }

    async function fetchSummary() {
        const response = await fetch(`${API_URL}?action=summary`, {
            headers: { 'Accept': 'application/json' },
        });
        const data = await response.json();
        if (!response.ok || !data.ok) {
            throw new Error(data.message || 'Αποτυχία φόρτωσης αρχικής.');
        }
        return data;
    }

    function renderUserControls(data) {
        const user = data.user;
        const stats = data.stats || {};
        const adminLink = $('#sidebarAdminLink');
        if (adminLink) {
            adminLink.style.display = data.can_access_admin ? 'flex' : 'none';
        }

        const box = $('.navbar-right-controls');
        if (box) {
            const name = user.full_name || user.username;
            box.innerHTML = `
                <div class="user-mini-card" style="display:flex;gap:10px;align-items:center;font-size:13px;">
                    <strong>${escapeHtml(name)}</strong>
                    <span title="Πόντοι">⭐ ${Number(user.points || 0)}</span>
                    <span title="Μοιρασμένες μερίδες">🍽️ ${Number(stats.portions_shared || 0)}</span>
                </div>
            `;
        }
    }

    function setupLogout() {
        const link = $('#logoutLink');
        link?.addEventListener('click', async (event) => {
            event.preventDefault();
            try {
                await fetch(`${API_URL}?action=logout`, { method: 'POST' });
            } finally {
                localStorage.removeItem('unibiteUser');
                window.location.href = link.getAttribute('href') || 'login.html';
            }
        });
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    document.addEventListener('DOMContentLoaded', async () => {
        setupSidebar();
        setupLogout();

        try {
            const data = await fetchSummary();
            renderUserControls(data);
        } catch (error) {
            showCustomAlert('Προσοχή', error.message, '⚠️');
        }
    });
})();
