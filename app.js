class MaganteOTC {
    constructor() {
        this.apiBase = 'https://magnate-otc-2.onrender.com';
        this.currentUser = null;
        this.token = localStorage.getItem('magante_token');
        this.isOnline = false;
        
        this.init();
    }

    async init() {
        // Проверяем авторизацию при загрузке
        if (this.token) {
            await this.validateToken();
        } else {
            await this.checkAPIStatus();
        }
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Логин форма
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const login = document.getElementById('login').value;
                const password = document.getElementById('password').value;
                this.login(login, password);
            });
        }

        // Создание сделки
        const dealForm = document.getElementById('dealForm');
        if (dealForm) {
            dealForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const amount = document.getElementById('amount').value;
                const description = document.getElementById('description').value;
                const paymentMethod = document.getElementById('paymentMethod').value;
                this.createDeal(amount, description, paymentMethod);
            });
        }

        // Создание тикета
        const ticketForm = document.getElementById('ticketForm');
        if (ticketForm) {
            ticketForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const subject = document.getElementById('ticketSubject').value;
                const message = document.getElementById('ticketMessage').value;
                this.createTicket(subject, message);
            });
        }

        // Выход
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }
    }

    async checkAPIStatus() {
        try {
            console.log('Checking API status...');
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(`${this.apiBase}/api/health`, {
                method: 'GET',
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json',
                }
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const data = await response.json();
                this.isOnline = true;
                this.showAPIStatus();
                console.log('API is online');
                return true;
            } else {
                this.isOnline = false;
                this.showAPIStatus();
                console.log('API response not OK');
                return false;
            }
        } catch (error) {
            console.error('API check failed:', error);
            this.isOnline = false;
            this.showAPIStatus();
            return false;
        }
    }

    async validateToken() {
        try {
            const response = await fetch(`${this.apiBase}/api/profile`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Accept': 'application/json'
                }
            });

            if (response.ok) {
                const profile = await response.json();
                this.currentUser = profile;
                this.isOnline = true;
                this.showDashboard();
                this.showToast('✅ Автоматический вход выполнен', 'success');
                return true;
            } else {
                // Токен невалидный
                localStorage.removeItem('magante_token');
                this.token = null;
                this.currentUser = null;
                this.checkAPIStatus();
                return false;
            }
        } catch (error) {
            console.error('Token validation failed:', error);
            this.isOnline = false;
            this.showAPIStatus();
            return false;
        }
    }

    showAPIStatus() {
        const statusElement = document.getElementById('apiStatus');
        if (statusElement) {
            if (this.isOnline) {
                statusElement.innerHTML = '<span class="badge bg-success"><i class="fas fa-check me-1"></i>API онлайн</span>';
            } else {
                statusElement.innerHTML = '<span class="badge bg-warning"><i class="fas fa-exclamation-triangle me-1"></i>API офлайн</span>';
            }
        }
    }

    async login(login, password) {
        try {
            this.showLoading(true);
            
            if (!this.isOnline) {
                throw new Error('Сервер временно недоступен. Попробуйте позже.');
            }

            const response = await fetch(`${this.apiBase}/api/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    login: login.trim(),
                    password: password.trim()
                })
            });

            const data = await response.json();

            if (response.ok) {
                this.currentUser = data.user;
                this.token = data.token;
                localStorage.setItem('magante_token', this.token);
                this.showDashboard();
                this.showToast('✅ Успешный вход! Добро пожаловать в Magante OTC!', 'success');
                return true;
            } else {
                throw new Error(data.error || 'Ошибка входа');
            }
        } catch (error) {
            this.showToast(error.message, 'error');
            return false;
        } finally {
            this.showLoading(false);
        }
    }

    async createDeal(amount, description, paymentMethod) {
        try {
            this.showLoading(true);

            if (!this.token) {
                throw new Error('Требуется авторизация');
            }

            const response = await fetch(`${this.apiBase}/api/deals`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    amount: parseFloat(amount),
                    description: description.trim(),
                    payment_method: paymentMethod
                })
            });

            const data = await response.json();

            if (response.ok) {
                this.showToast('✅ Сделка создана успешно!', 'success');
                this.loadUserDeals();
                // Очищаем форму
                document.getElementById('dealForm').reset();
                return data;
            } else {
                throw new Error(data.error || 'Ошибка при создании сделки');
            }
        } catch (error) {
            this.showToast(error.message, 'error');
            return null;
        } finally {
            this.showLoading(false);
        }
    }

    async loadUserDeals() {
        try {
            if (!this.token) {
                return;
            }

            const response = await fetch(`${this.apiBase}/api/deals/my`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Accept': 'application/json'
                }
            });

            if (response.ok) {
                const deals = await response.json();
                this.displayDeals(deals);
            } else {
                throw new Error('Ошибка загрузки сделок');
            }
        } catch (error) {
            console.error('Error loading deals:', error);
            this.showToast('Ошибка загрузки сделок', 'error');
            this.displayDeals([]);
        }
    }

    async loadProfile() {
        try {
            if (!this.token) {
                return;
            }

            const response = await fetch(`${this.apiBase}/api/profile`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Accept': 'application/json'
                }
            });

            if (response.ok) {
                const profile = await response.json();
                this.displayProfile(profile);
                this.updateUserBalance(profile.balance);
            }
        } catch (error) {
            console.error('Profile load error:', error);
            this.displayProfile(this.currentUser);
        }
    }

    async createTicket(subject, message) {
        try {
            this.showLoading(true);

            if (!this.token) {
                throw new Error('Требуется авторизация');
            }

            const response = await fetch(`${this.apiBase}/api/tickets`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    subject: subject.trim(),
                    message: message.trim()
                })
            });

            const data = await response.json();

            if (response.ok) {
                this.showToast('✅ Тикет создан успешно! Мы ответим вам в ближайшее время.', 'success');
                this.loadUserTickets();
                // Очищаем форму
                document.getElementById('ticketForm').reset();
                return data;
            } else {
                throw new Error(data.error || 'Ошибка при создании тикета');
            }
        } catch (error) {
            this.showToast(error.message, 'error');
            return false;
        } finally {
            this.showLoading(false);
        }
    }

    async loadUserTickets() {
        try {
            if (!this.token) {
                return;
            }

            const response = await fetch(`${this.apiBase}/api/tickets/my`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Accept': 'application/json'
                }
            });

            if (response.ok) {
                const tickets = await response.json();
                this.displayTickets(tickets);
            } else {
                throw new Error('Ошибка загрузки тикетов');
            }
        } catch (error) {
            console.error('Error loading tickets:', error);
            this.showToast('Ошибка загрузки тикетов', 'error');
            this.displayTickets([]);
        }
    }

    displayDeals(deals) {
        const container = document.getElementById('dealsList');
        if (!container) return;

        if (!deals || deals.length === 0) {
            container.innerHTML = `
                <div class="col-12">
                    <div class="alert alert-info text-center py-4">
                        <i class="fas fa-info-circle fa-2x mb-3"></i>
                        <h5>У вас пока нет сделок</h5>
                        <p class="text-muted mb-0">Создайте первую сделку во вкладке "Создать сделку"</p>
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = deals.map(deal => {
            const statusClass = this.getStatusClass(deal.status);
            const statusText = this.getStatusText(deal.status);
            const statusColor = this.getStatusColor(deal.status);
            const paymentMethod = this.getPaymentMethodText(deal.payment_method);
            const createdDate = new Date(deal.created_at).toLocaleDateString('ru-RU');
            const isWebDeal = deal.source === 'web';
            
            return `
                <div class="col-md-6 mb-4">
                    <div class="card feature-card deal-card ${statusClass} h-100">
                        <div class="card-body d-flex flex-column">
                            <div class="d-flex justify-content-between align-items-start mb-3">
                                <h5 class="card-title mb-0">
                                    <i class="fas fa-exchange-alt me-2"></i>
                                    Сделка #${deal.id ? deal.id.slice(-8) : 'N/A'}
                                </h5>
                                <div>
                                    <span class="badge bg-${statusColor} me-1">${statusText}</span>
                                    <span class="badge bg-${isWebDeal ? 'info' : 'secondary'}">${isWebDeal ? '🌐 Веб' : '🤖 Бот'}</span>
                                </div>
                            </div>
                            
                            <p class="card-text flex-grow-1">${deal.description || 'Описание отсутствует'}</p>
                            
                            <div class="deal-info mt-auto">
                                <div class="row small">
                                    <div class="col-6">
                                        <strong class="text-muted">Сумма:</strong><br>
                                        <span class="fw-bold text-dark fs-6">${deal.amount} ${paymentMethod}</span>
                                    </div>
                                    <div class="col-6">
                                        <strong class="text-muted">Статус:</strong><br>
                                        <span class="badge bg-${statusColor}">${statusText}</span>
                                    </div>
                                </div>
                                <div class="row small mt-2">
                                    <div class="col-6">
                                        <strong class="text-muted">Создана:</strong><br>
                                        ${createdDate}
                                    </div>
                                    <div class="col-6">
                                        <strong class="text-muted">ID:</strong><br>
                                        <code class="small">${deal.id ? deal.id.slice(-12) : 'N/A'}</code>
                                    </div>
                                </div>
                                ${deal.buyer_id ? `
                                    <div class="mt-2 pt-2 border-top">
                                        <small class="text-muted"><strong>Покупатель:</strong> ID ${deal.buyer_id}</small>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    displayTickets(tickets) {
        const container = document.getElementById('ticketsList');
        if (!container) return;

        if (!tickets || tickets.length === 0) {
            container.innerHTML = `
                <div class="alert alert-info text-center py-4">
                    <i class="fas fa-ticket-alt fa-2x mb-3"></i>
                    <h5>У вас пока нет тикетов</h5>
                    <p class="text-muted mb-0">Создайте первый тикет для обращения в поддержку</p>
                </div>
            `;
            return;
        }

        container.innerHTML = tickets.map(ticket => {
            const statusColor = this.getTicketStatusColor(ticket.status);
            const createdDate = new Date(ticket.created_at).toLocaleDateString('ru-RU');
            
            return `
                <div class="card mb-3">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start mb-3">
                            <h5 class="card-title mb-0">
                                <i class="fas fa-ticket-alt me-2"></i>
                                ${ticket.subject}
                            </h5>
                            <span class="badge bg-${statusColor}">${this.getTicketStatusText(ticket.status)}</span>
                        </div>
                        <p class="card-text">${ticket.message}</p>
                        <div class="ticket-meta">
                            <small class="text-muted">
                                <i class="fas fa-calendar me-1"></i>
                                Создан: ${createdDate}
                                <span class="ms-3">
                                    <i class="fas fa-hashtag me-1"></i>
                                    ID: ${ticket.id ? ticket.id.slice(-8) : 'N/A'}
                                </span>
                            </small>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    displayProfile(profile) {
        const container = document.getElementById('profileInfo');
        if (!container) return;

        if (!profile) {
            container.innerHTML = `
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    Не удалось загрузить данные профиля
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="card">
                <div class="card-header bg-primary text-white">
                    <h5 class="card-title mb-0">
                        <i class="fas fa-user me-2"></i>
                        Информация о профиле
                    </h5>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-6">
                            <div class="mb-3">
                                <label class="form-label text-muted small mb-1">ID пользователя</label>
                                <p class="mb-0 fw-bold fs-5">${profile.user_id || profile.id || 'N/A'}</p>
                            </div>
                            <div class="mb-3">
                                <label class="form-label text-muted small mb-1">Имя пользователя</label>
                                <p class="mb-0 fw-bold">${profile.username || 'N/A'}</p>
                            </div>
                            <div class="mb-3">
                                <label class="form-label text-muted small mb-1">Баланс</label>
                                <p class="mb-0 fw-bold text-success fs-5">${profile.balance || 0} RUB</p>
                            </div>
                            <div class="mb-3">
                                <label class="form-label text-muted small mb-1">Успешные сделки</label>
                                <p class="mb-0 fw-bold fs-5">${profile.successful_deals || 0}</p>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="mb-3">
                                <label class="form-label text-muted small mb-1">Статус</label>
                                <p class="mb-0">
                                    ${profile.is_admin ? 
                                        '<span class="badge bg-danger fs-6"><i class="fas fa-crown me-1"></i>Администратор</span>' : 
                                        '<span class="badge bg-secondary fs-6"><i class="fas fa-user me-1"></i>Пользователь</span>'
                                    }
                                </p>
                            </div>
                            <div class="mb-3">
                                <label class="form-label text-muted small mb-1">Язык</label>
                                <p class="mb-0 fw-bold">${profile.lang === 'ru' ? '🇷🇺 Русский' : '🇺🇸 English'}</p>
                            </div>
                            <div class="mb-3">
                                <label class="form-label text-muted small mb-1">TON кошелек</label>
                                <p class="mb-0 font-monospace small bg-light p-2 rounded">${profile.ton_wallet || '<span class="text-muted">Не указан</span>'}</p>
                            </div>
                            <div class="mb-3">
                                <label class="form-label text-muted small mb-1">Банковская карта</label>
                                <p class="mb-0 font-monospace small bg-light p-2 rounded">${profile.card_details || '<span class="text-muted">Не указана</span>'}</p>
                            </div>
                        </div>
                    </div>
                    <div class="mt-4 p-3 bg-light rounded">
                        <small class="text-muted">
                            <i class="fas fa-info-circle me-1"></i>
                            Для изменения данных используйте Telegram бота @magnate_otc_bot
                        </small>
                    </div>
                </div>
            </div>
        `;
    }

    updateUserBalance(balance) {
        const balanceElement = document.getElementById('userBalance');
        if (balanceElement) {
            balanceElement.textContent = `Баланс: ${balance} RUB`;
        }
    }

    getStatusClass(status) {
        const classes = {
            'completed': 'deal-completed',
            'cancelled': 'deal-cancelled',
            'confirmed': 'deal-confirmed',
            'seller_sent': 'deal-sent'
        };
        return classes[status] || '';
    }

    getStatusText(status) {
        const texts = {
            'active': 'Активна',
            'confirmed': 'Подтверждена',
            'completed': 'Завершена',
            'cancelled': 'Отменена',
            'seller_sent': 'Отправлено'
        };
        return texts[status] || status;
    }

    getTicketStatusText(status) {
        const texts = {
            'open': 'Открыт',
            'in_progress': 'В работе',
            'closed': 'Закрыт'
        };
        return texts[status] || status;
    }

    getPaymentMethodText(method) {
        const texts = {
            'ton': 'TON',
            'sbp': 'RUB',
            'stars': 'XTR'
        };
        return texts[method] || method;
    }

    getStatusColor(status) {
        const colors = {
            'active': 'primary',
            'confirmed': 'success',
            'completed': 'success',
            'cancelled': 'danger',
            'seller_sent': 'warning'
        };
        return colors[status] || 'secondary';
    }

    getTicketStatusColor(status) {
        const colors = {
            'open': 'warning',
            'in_progress': 'info',
            'closed': 'success'
        };
        return colors[status] || 'secondary';
    }

    showDashboard() {
        document.querySelector('.hero-section').style.display = 'none';
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        document.getElementById('loginNav').style.display = 'none';
        document.getElementById('logoutNav').style.display = 'block';
        
        // Загружаем данные
        this.loadUserDeals();
        this.loadUserTickets();
        this.loadProfile();
        
        // Показываем админ-панель если пользователь админ
        if (this.currentUser && this.currentUser.is_admin) {
            const adminLink = document.getElementById('adminLink');
            if (adminLink) adminLink.style.display = 'block';
        }
        
        // Показываем раздел сделок по умолчанию
        this.showSection('deals');
    }

    showSection(sectionName) {
        // Скрываем все разделы
        const sections = ['deals', 'createDeal', 'tickets', 'createTicket', 'profile', 'admin'];
        sections.forEach(section => {
            const element = document.getElementById(section);
            if (element) element.style.display = 'none';
        });

        // Показываем выбранный раздел
        const targetSection = document.getElementById(sectionName);
        if (targetSection) targetSection.style.display = 'block';

        // Обновляем активное состояние в навигации
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('onclick')?.includes(sectionName)) {
                link.classList.add('active');
            }
        });

        // Загружаем данные если нужно
        if (sectionName === 'deals') {
            this.loadUserDeals();
        } else if (sectionName === 'tickets') {
            this.loadUserTickets();
        } else if (sectionName === 'profile') {
            this.loadProfile();
        }
    }

    showLoading(show) {
        const loader = document.getElementById('loadingOverlay');
        if (loader) {
            loader.style.display = show ? 'flex' : 'none';
        }
    }

    showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toastContainer') || (() => {
            const container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'toast-container position-fixed top-0 end-0 p-3';
            document.body.appendChild(container);
            return container;
        })();

        const toastId = 'toast-' + Date.now();
        const icon = {
            'success': 'fa-check-circle',
            'error': 'fa-exclamation-circle',
            'warning': 'fa-exclamation-triangle',
            'info': 'fa-info-circle'
        }[type] || 'fa-info-circle';

        const bgClass = {
            'success': 'bg-success',
            'error': 'bg-danger',
            'warning': 'bg-warning',
            'info': 'bg-info'
        }[type] || 'bg-info';

        const toastHtml = `
            <div id="${toastId}" class="toast ${bgClass} text-white" role="alert">
                <div class="toast-header ${bgClass} text-white">
                    <i class="fas ${icon} me-2"></i>
                    <strong class="me-auto">${this.getToastTitle(type)}</strong>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast"></button>
                </div>
                <div class="toast-body">
                    ${message}
                </div>
            </div>
        `;

        toastContainer.insertAdjacentHTML('beforeend', toastHtml);
        
        const toastElement = document.getElementById(toastId);
        const toast = new bootstrap.Toast(toastElement, { delay: 5000 });
        toast.show();

        toastElement.addEventListener('hidden.bs.toast', () => {
            toastElement.remove();
        });
    }

    getToastTitle(type) {
        const titles = {
            'success': 'Успех',
            'error': 'Ошибка',
            'info': 'Информация',
            'warning': 'Предупреждение'
        };
        return titles[type] || 'Уведомление';
    }

    logout() {
        this.currentUser = null;
        this.token = null;
        localStorage.removeItem('magante_token');
        
        document.getElementById('dashboard').style.display = 'none';
        document.getElementById('loginNav').style.display = 'block';
        document.getElementById('logoutNav').style.display = 'none';
        document.querySelector('.hero-section').style.display = 'block';
        
        this.showToast('Вы вышли из системы', 'info');
    }

    // Админ функции
    async loadAllDeals() {
        this.showToast('Функционал админ-панели находится в разработке', 'info');
    }

    async loadAllTickets() {
        this.showToast('Функционал админ-панели находится в разработке', 'info');
    }

    async loadUsers() {
        this.showToast('Функционал админ-панели находится в разработке', 'info');
    }
}

// Глобальные функции для onclick атрибутов
function showSection(sectionName) {
    if (window.maganteOTC) {
        window.maganteOTC.showSection(sectionName);
    }
}

function logout() {
    if (window.maganteOTC) {
        window.maganteOTC.logout();
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    window.maganteOTC = new MaganteOTC();
});
