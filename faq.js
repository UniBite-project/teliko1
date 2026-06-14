(() => {
    'use strict';

    const API_URL = 'faq.php';
    const containerSelector = '.faq-questions-column';

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function attachAccordionEvents() {
        document.querySelectorAll('.faq-question').forEach((question) => {
            if (question.getAttribute('onclick')) return;
            question.addEventListener('click', () => {
                question.parentElement?.classList.toggle('active');
            });
        });
    }

    function renderFaqs(faqs) {
        const container = document.querySelector(containerSelector);
        if (!container || !Array.isArray(faqs) || faqs.length === 0) {
            attachAccordionEvents();
            return;
        }

        container.innerHTML = faqs.map((item, index) => `
            <div class="faq-item">
                <div class="faq-question" role="button" tabindex="0" aria-expanded="false">
                    <span>${index + 1}. ${escapeHtml(item.question)}</span>
                    <span class="faq-arrow">▼</span>
                </div>
                <div class="faq-answer">${escapeHtml(item.answer)}</div>
            </div>
        `).join('');

        document.querySelectorAll('.faq-question').forEach((question) => {
            question.addEventListener('click', () => toggleQuestion(question));
            question.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleQuestion(question);
                }
            });
        });
    }

    function toggleQuestion(question) {
        const item = question.parentElement;
        const isActive = item?.classList.toggle('active');
        question.setAttribute('aria-expanded', String(Boolean(isActive)));
    }

    async function loadFaqs() {
        const response = await fetch(`${API_URL}?action=list`, {
            headers: { 'Accept': 'application/json' },
        });
        const data = await response.json();
        if (!response.ok || !data.ok) {
            throw new Error(data.message || 'Δεν φορτώθηκαν οι ερωτήσεις.');
        }
        renderFaqs(data.faqs);
    }

    document.addEventListener('DOMContentLoaded', () => {
        loadFaqs().catch(() => attachAccordionEvents());
    });
})();
