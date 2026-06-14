(() => {
    'use strict';

    const API_URL = 'account.php';

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value ?? '-';
    };

    function formatDate(value) {
        if (!value) return '-';
        return new Intl.DateTimeFormat('el-GR', { dateStyle: 'medium' })
            .format(new Date(String(value).replace(' ', 'T')));
    }

    function firstLetter(profile) {
        const source = profile.full_name || profile.username || 'U';
        return source.trim().charAt(0).toUpperCase();
    }

    function renderProfile(profile) {
        setText('profileAvatarLetter', firstLetter(profile));
        setText('profileNameDisplay', profile.full_name || profile.username);
        setText('profileRoleSub', profile.role === 'admin' ? 'Διαχειριστής UniBite' : 'Φοιτητής UniBite');
        setText('profilePoints', Number(profile.points || 0));
        setText('profileOffered', Number(profile.offered_portions || 0));
        setText('profileReceived', Number(profile.received_portions || 0));
        setText('profileUsername', profile.username);
        setText('profileEmail', profile.email);
        setText('profileAM', profile.university_id);
        setText('profileDept', profile.department || '-');
        setText('profileRegDate', formatDate(profile.created_at));
    }

    async function requestJson(url, options = {}) {
        const response = await fetch(url, {
            headers: { 'Accept': 'application/json', ...(options.headers || {}) },
            ...options,
        });
        const data = await response.json();
        if (!response.ok || !data.ok) {
            throw new Error(data.message || 'Κάτι πήγε στραβά.');
        }
        return data;
    }

    async function loadProfile() {
        const data = await requestJson(`${API_URL}?action=profile`);
        renderProfile(data.profile);
    }

    window.confirmDeleteAccount = async function confirmDeleteAccount() {
        const ok = confirm('Είσαι σίγουρος/η ότι θέλεις οριστική διαγραφή λογαριασμού; Η ενέργεια δεν αναιρείται.');
        if (!ok) return;

        try {
            const data = await requestJson(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete' }),
            });
            alert(data.message || 'Ο λογαριασμός διαγράφηκε.');
            window.location.href = 'login.html';
        } catch (error) {
            alert(error.message);
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        loadProfile().catch((error) => {
            console.error(error);
            setText('profileNameDisplay', 'Αδυναμία φόρτωσης προφίλ');
        });
    });
})();
