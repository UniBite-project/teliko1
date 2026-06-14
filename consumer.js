(() => {
    'use strict';

    const API_URL = 'consumer.php';
    const PATRAS_CENTER = [38.2466, 21.7346];

    let map = null;
    let markerLayer = null;

    const els = {
        active: () => document.getElementById('activeListingsContainer'),
        exhausted: () => document.getElementById('exhaustedListingsContainer'),
        activeCount: () => document.getElementById('activeCount'),
        exhaustedCount: () => document.getElementById('exhaustedCount'),
    };

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function formatDateTime(value) {
        if (!value) return '-';
        return new Intl.DateTimeFormat('el-GR', {
            dateStyle: 'short',
            timeStyle: 'short',
        }).format(new Date(String(value).replace(' ', 'T')));
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

    async function loadListings() {
        const data = await requestJson(`${API_URL}?action=listings`);
        renderListings(data.listings || []);
        renderMap(data.listings || []);
    }

    function createCard(listing) {
        const isExhausted = Number(listing.available_portions) <= 0 || listing.status === 'inactive';
        const image = listing.image_path || 'images/default-food.jpg';
        const rating = Number(listing.chef_rating || 0).toFixed(1);

        return `
            <div class="consumer-listing-card ${isExhausted ? 'exhausted' : ''}" data-listing-id="${Number(listing.listing_id)}">
                <img src="${escapeHtml(image)}" alt="${escapeHtml(listing.title)}" onerror="this.src='logo.jpeg'">
                <div class="consumer-listing-info">
                    <div>
                        <h4>${escapeHtml(listing.title)}</h4>
                        <p>${escapeHtml(listing.description || 'Χωρίς περιγραφή')}</p>
                        <p><strong>Μάγειρας:</strong> ${escapeHtml(listing.chef_name)} · ⭐ ${rating}</p>
                        <p><strong>Παραλαβή:</strong> ${escapeHtml(listing.pickup_location)} · ${formatDateTime(listing.pickup_time)}</p>
                        ${listing.allergens ? `<p><strong>Αλλεργιογόνα:</strong> ${escapeHtml(listing.allergens)}</p>` : ''}
                    </div>
                    <div class="consumer-listing-footer">
                        <span class="consumer-portions-badge ${isExhausted ? 'exhausted-badge' : 'active-badge'}">
                            ${Number(listing.available_portions)} / ${Number(listing.total_portions || listing.available_portions)} μερίδες
                        </span>
                        <button class="consumer-reserve-btn" ${isExhausted ? 'disabled' : ''} data-reserve-id="${Number(listing.listing_id)}">
                            ${isExhausted ? 'Εξαντλήθηκε' : 'Δέσμευση'}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    function emptyState(text) {
        return `
            <div class="consumer-empty">
                <div class="empty-emoji">🍽️</div>
                <p>${escapeHtml(text)}</p>
            </div>
        `;
    }

    function renderListings(listings) {
        const active = listings.filter((item) => Number(item.available_portions) > 0 && item.status !== 'inactive');
        const exhausted = listings.filter((item) => Number(item.available_portions) <= 0 || item.status === 'inactive');

        els.active().innerHTML = active.length ? active.map(createCard).join('') : emptyState('Δεν υπάρχουν ενεργές αγγελίες αυτή τη στιγμή.');
        els.exhausted().innerHTML = exhausted.length ? exhausted.map(createCard).join('') : emptyState('Δεν υπάρχουν εξαντλημένες αγγελίες.');

        els.activeCount().textContent = String(active.length);
        els.exhaustedCount().textContent = String(exhausted.length);

        document.querySelectorAll('[data-reserve-id]').forEach((button) => {
            button.addEventListener('click', () => reserveListing(Number(button.dataset.reserveId)));
        });
    }

    function initMap() {
        if (!window.L || !document.getElementById('studentMap')) return;
        if (map) return;
        map = L.map('studentMap').setView(PATRAS_CENTER, 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);
        markerLayer = L.layerGroup().addTo(map);
    }

    function renderMap(listings) {
        initMap();
        if (!map || !markerLayer) return;

        markerLayer.clearLayers();
        const bounds = [];

        listings.forEach((listing) => {
            const lat = Number(listing.latitude);
            const lng = Number(listing.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

            const isExhausted = Number(listing.available_portions) <= 0 || listing.status === 'inactive';
            const marker = L.marker([lat, lng]).addTo(markerLayer);
            marker.bindPopup(`
                <strong>${escapeHtml(listing.title)}</strong><br>
                ${escapeHtml(listing.pickup_location)}<br>
                Μερίδες: ${Number(listing.available_portions)}<br>
                ${isExhausted ? '<em>Εξαντλήθηκε</em>' : `<button onclick="window.reserveListing(${Number(listing.listing_id)})">Δέσμευση</button>`}
            `);
            bounds.push([lat, lng]);
        });

        if (bounds.length) {
            map.fitBounds(bounds, { padding: [30, 30] });
        }
    }

    async function reserveListing(listingId) {
        try {
            const data = await requestJson(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'reserve', listing_id: listingId, portions: 1 }),
            });
            alert(data.message || 'Το αίτημα στάλθηκε.');
            await loadListings();
        } catch (error) {
            alert(error.message);
        }
    }

    window.reserveListing = reserveListing;

    document.addEventListener('DOMContentLoaded', () => {
        initMap();
        loadListings().catch((error) => {
            els.active().innerHTML = emptyState(error.message);
            els.exhausted().innerHTML = emptyState('Αδυναμία φόρτωσης δεδομένων.');
        });
    });
})();
