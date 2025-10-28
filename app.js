class MaganteOTC {
    constructor() {
        // Замените на ваш URL от Render после деплоя
        this.apiBase = 'https://magnate-otc-api.onrender.com';
        this.currentUser = null;
        this.token = localStorage.getItem('magante_token');
        this.isOnline = false;
        
        // Проверяем доступность API при инициализации
        this.checkAPIStatus();
    }

    async checkAPIStatus() {
        try {
            const response = await fetch(`${this.apiBase}/api/health`);
            if (response.ok) {
                this.isOnline = true;
                console.log('✅ API подключен');
            } else {
                this.isOnline = false;
                console.warn('⚠️ API недоступен');
            }
        } catch (error) {
            this.isOnline = false;
            console.error('❌ Ошибка подключения к API:', error);
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
                this.showToast('✅ Успешный вход!', 'success');
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
            this.showLoading(true);

            if (!this.token) {
                throw new Error('Требуется авторизация');
            }

            const response = await fetch(`${this.apiBase}/api/deals/my`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const deals = await response.json();
                this.displayDeals(deals);
            } else {
                throw new Error('Ошибка загрузки сделок');
            }
        } catch (error) {
            this.showToast('Ошибка загрузки сделок', 'error');
            this.displayDeals([]);
        } finally {
            this.showLoading(false);
        }
    }

    async loadProfile() {
        try {
            if (!this.token) {
                return;
            }

            const response = await fetch(`${this.apiBase}/api/profile`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const profile = await response.json();
                this.displayProfile(profile);
            }
        } catch (error) {
            console.error('Profile load error:', error);
            this.displayProfile(this.currentUser);
        }
    }

    async createTicket(subject, message) {
        try {
            this.showLoading(true);

            // Временная реализация - сохранение в localStorage
            const tickets = JSON.parse(localStorage.getItem('user_tickets')) || [];
            const newTicket = {
                id: 'ticket_' + Date.now(),
                subject: subject,
                message: message,
                status: 'open',
                created_at: new Date().toISOString(),
                user_id: this.currentUser.user_id
            };
            
            tickets.push(newTicket);
            localStorage.setItem('user_tickets', JSON.stringify(tickets));
            
            this.showToast('✅ Тикет создан успешно!', 'success');
            this.loadUserTickets();
            return true;
        } catch (error) {
            this.showToast('Ошибка при создании тикета', 'error');
            return false;
        } finally {
            this.showLoading(false);
        }
    }

    async loadUserTickets() {
        try {
            // Временная реализация - загрузка из localStorage
            const tickets = JSON.parse(localStorage.getItem('user_tickets')) || [];
            const userTickets = tickets.filter(ticket => ticket.user_id === this.currentUser.user_id);
            this.displayTickets(userTickets);
        } catch (error) {
            this.showToast('Ошибка загрузки тикетов', 'error');
            this.displayTickets([]);
        }
    }

    displayDeals(deals) {
        const container = document.getElementById('dealsList');
        if (!deals || deals.length === 0) {
            container.innerHTML = `
                <div class="col-12">
                    <div class="alert alert-info text-center">
                        <i class="fas fa-info-circle me-2"></i>
                        У вас пока нет сделок
                        <br>
                        <small class="text-muted">Создайте первую сделку во вкладке "Создать сделку"</small>
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
            
            return `
                <div class="col-md-6 mb-4">
                    <div class="card feature-card deal-card ${statusClass} h-100">
                        <div class="card-body d-flex flex-column">
                            <div class="d-flex justify-content-between align-items-start mb-3">
                                <h5 class="card-title mb-0">
                                    <i class="fas fa-exchange-alt me-2"></i>
                                    Сделка #${deal.id.slice(-8)}
                                </h5>
                                <span class="badge bg-${statusColor}">${statusText}</span>
                            </div>
                            
                            <p class="card-text flex-grow-1">${deal.description}</p>
                            
                            <div class="deal-info mt-auto">
                                <div class="row small text-muted">
                                    <div class="col-6">
                                        <strong>Сумма:</strong><br>
                                        <span class="fw-bold text-dark">${deal.amount} ${paymentMethod}</span>
                                    </div>
                                    <div class="col-6">
                                        <strong>Статус:</strong><br>
                                        ${statusText}
                                    </div>
                                </div>
                                <div class="row small text-muted mt-2">
                                    <div class="col-6">
                                        <strong>Создана:</strong><br>
                                        ${createdDate}
                                    </div>
                                    <div class="col-6">
                                        <strong>Источник:</strong><br>
                                        ${deal.source === 'web' ? '🌐 Веб' : '🤖 Бот'}
                                    </div>
                                </div>
                                ${deal.buyer_id ? `
                                    <div class="mt-2">
                                        <small><strong>Покупатель:</strong> ID ${deal.buyer_id}</small>
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
        if (!tickets || tickets.length === 0) {
            container.innerHTML = `
                <div class="alert alert-info text-center">
                    <i class="fas fa-info-circle me-2"></i>
                    У вас пока нет тикетов
                    <br>
                    <small class="text-muted">Создайте первый тикет для обращения в поддержку</small>
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
                            <span class="badge bg-${statusColor}">${ticket.status}</span>
                        </div>
                        <p class="card-text">${ticket.message}</p>
                        <div class="ticket-meta">
                            <small class="text-muted">
                                <i class="fas fa-calendar me-1"></i>
                                Создан: ${createdDate}
                                <span class="ms-3">
                                    <i class="fas fa-hashtag me-1"></i>
                                    ID: ${ticket.id.slice(-8)}
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
                <div class="card-header">
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
                                <p class="mb-0 fw-bold">${profile.user_id}</p>
                            </div>
                            <div class="mb-3">
                                <label class="form-label text-muted small mb-1">Баланс</label>
                                <p class="mb-0 fw-bold text-success">${profile.balance} RUB</p>
                            </div>
                            <div class="mb-3">
                                <label class="form-label text-muted small mb-1">Успешные сделки</label>
                                <p class="mb-0 fw-bold">${profile.successful_deals}</p>
                            </div>
                            <div class="mb-3">
                                <label class="form-label text-muted small mb-1">Статус</label>
                                <p class="mb-0">
                                    ${profile.is_admin ? 
                                        '<span class="badge bg-danger">👑 Администратор</span>' : 
                                        '<span class="badge bg-secondary">👤 Пользователь</span>'
                                    }
                                </p>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="mb-3">
                                <label class="form-label text-muted small mb-1">Язык</label>
                                <p class="mb-0 fw-bold">${profile.lang === 'ru' ? '🇷🇺 Русский' : '🇺🇸 English'}</p>
                            </div>
                            <div class="mb-3">
                                <label class="form-label text-muted small mb-1">TON кошелек</label>
                                <p class="mb-0 font-monospace small">${profile.ton_wallet || '<span class="text-muted">Не указан</span>'}</p>
                            </div>
                            <div class="mb-3">
                                <label class="form-label text-muted small mb-1">Банковская карта</label>
                                <p class="mb-0">${profile.card_details || '<span class="text-muted">Не указана</span>'}</p>
                            </div>
                            <div class="mb-3">
                                <label class="form-label text-muted small mb-1">Логин веб-кабинета</label>
                                <p class="mb-0 font-monospace small">${profile.web_login || '<span class="text-muted">Не установлен</span>'}</p>
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

    getStatusClass(status) {
        const classes = {
            'completed': 'deal-completed',
            'cancelled': 'deal-cancelled',
            'active': '',
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
        
        // Показываем статус подключения
        this.showConnectionStatus();
        
        // Загружаем данные
        this.loadUserDeals();
        this.loadUserTickets();
        this.loadProfile();
        
        // Показываем админ-панель если пользователь админ
        if (this.currentUser && this.currentUser.is_admin) {
            document.getElementById('adminLink').style.display = 'block';
        }
    }

    showConnectionStatus() {
        // Добавляем индикатор статуса в навигацию
        let statusIndicator = document.getElementById('connectionStatus');
        if (!statusIndicator) {
            statusIndicator = document.createElement('div');
            statusIndicator.id = 'connectionStatus';
            statusIndicator.className = 'navbar-text ms-3';
            document.querySelector('.navbar-nav').appendChild(statusIndicator);
        }
        
        statusIndicator.innerHTML = `
            <small class="${this.isOnline ? 'text-success' : 'text-warning'}">
                <i class="fas fa-circle ${this.isOnline ? 'text-success' : 'text-warning'}"></i>
                ${this.isOnline ? 'API онлайн' : 'API офлайн'}
            </small>
        `;
    }

    showLoading(show) {
        const loader = document.getElementById('loadingIndicator');
        if (!loader && show) {
            // Создаем индикатор загрузки
            const loaderHtml = `
                <div id="loadingIndicator" class="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center" style="background: rgba(0,0,0,0.5); z-index: 9999;">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Загрузка...</span>
                    </div>
                    <span class="ms-2 text-white">Загрузка...</span>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', loaderHtml);
        } else if (loader && !show) {
            loader.remove();
        }
    }

    showToast(message, type = 'info') {
        // Создаем или находим контейнер для тостов
        let toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toastContainer';
            toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
            document.body.appendChild(toastContainer);
        }

        const toastId = 'toast-' + Date.now();
        const bgClass = {
            'success': 'bg-success',
            'error': 'bg-danger',
            'warning': 'bg-warning',
            'info': 'bg-info'
        }[type] || 'bg-info';

        const toastHtml = `
            <div id="${toastId}" class="toast ${bgClass} text-white" role="alert">
                <div class="toast-header ${bgClass} text-white">
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
        const toast = new bootstrap.Toast(toastElement, { delay: 4000 });
        toast.show();

        // Удаляем toast из DOM после скрытия
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
        
        // Очищаем статус подключения
        const statusIndicator = document.getElementById('connectionStatus');
        if (statusIndicator) {
            statusIndicator.remove();
        }
        
        this.showToast('Вы вышли из системы', 'info');
    }

    // Админ функции (заглушки для будущей реализации)
    async loadAllDeals() {
        this.showToast('Админ-панель в разработке', 'info');
    }

    async loadAllTickets() {
        this.showToast('Админ-панель в разработке', 'info');
    }

    async loadUsers() {
        this.showToast('Админ-панель в разработке', 'info');
    }
}

// Глобальные функции для взаимодействия с HTML
const app = new MaganteOTC();

function showLogin() {
    document.querySelector('.hero-section').style.display = 'none';
    document.getElementById('loginSection').style.display = 'block';
    document.getElementById('dashboard').style.display = 'none';
}

function showSection(sectionName) {
    // Скрыть все секции
    document.querySelectorAll('#dashboard .col-md-9 > div').forEach(section => {
        section.style.display = 'none';
    });
    
    // Показать выбранную секцию
    const targetSection = document.getElementById(sectionName + 'Section');
    if (targetSection) {
        targetSection.style.display = 'block';
    }
    
    // Обновить активную ссылку в навигации
    document.querySelectorAll('.list-group-item').forEach(item => {
        item.classList.remove('active');
    });
    event.target.classList.add('active');

    // Обновляем данные при переключении секций
    if (sectionName === 'deals') {
        app.loadUserDeals();
    } else if (sectionName === 'tickets') {
        app.loadUserTickets();
    } else if (sectionName === 'profile') {
        app.loadProfile();
    }
}

function showCreateTicket() {
    document.getElementById('createTicketForm').style.display = 'block';
    document.getElementById('ticketsList').style.display = 'none';
}

function hideCreateTicket() {
    document.getElementById('createTicketForm').style.display = 'none';
    document.getElementById('ticketsList').style.display = 'block';
    document.getElementById('newTicketForm').reset();
}

function logout() {
    app.logout();
}

// Админ функции
function loadAllDeals() {
    app.loadAllDeals();
}

function loadAllTickets() {
    app.loadAllTickets();
}

function loadUsers() {
    app.loadUsers();
}

// Обработчики событий
document.addEventListener('DOMContentLoaded', function() {
    // Обработчик формы входа
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const login = document.getElementById('login').value;
            const password = document.getElementById('password').value;
            
            if (!login.trim() || !password.trim()) {
                app.showToast('Заполните все поля', 'error');
                return;
            }
            
            await app.login(login, password);
        });
    }

    // Обработчик формы создания сделки
    const createDealForm = document.getElementById('createDealForm');
    if (createDealForm) {
        createDealForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const amount = document.getElementById('dealAmount').value;
            const description = document.getElementById('dealDescription').value;
            const paymentMethod = document.getElementById('dealPaymentMethod').value;
            
            if (!amount || amount <= 0) {
                app.showToast('Введите корректную сумму', 'error');
                return;
            }
            
            if (!description.trim()) {
                app.showToast('Введите описание сделки', 'error');
                return;
            }
            
            const result = await app.createDeal(amount, description, paymentMethod);
            if (result) {
                createDealForm.reset();
            }
        });
    }

    // Обработчик формы создания тикета
    const newTicketForm = document.getElementById('newTicketForm');
    if (newTicketForm) {
        newTicketForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const subject = document.getElementById('ticketSubject').value;
            const message = document.getElementById('ticketMessage').value;
            
            if (!subject.trim() || !message.trim()) {
                app.showToast('Заполните все поля', 'error');
                return;
            }
            
            const success = await app.createTicket(subject, message);
            if (success) {
                newTicketForm.reset();
                hideCreateTicket();
            }
        });
    }

    // Показываем тестовые данные для отладки
    showDebugInfo();
});

// Функция для отображения отладочной информации
function showDebugInfo() {
    // Добавляем информацию об API в форму входа
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        const debugInfo = document.createElement('div');
        debugInfo.className = 'mt-3 p-2 bg-light rounded small';
        debugInfo.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                <span>Статус API:</span>
                <span class="badge ${app.isOnline ? 'bg-success' : 'bg-warning'}">
                    ${app.isOnline ? 'онлайн' : 'офлайн'}
                </span>
            </div>
            <div class="mt-1">
                <small class="text-muted">URL: ${app.apiBase}</small>
            </div>
        `;
        loginForm.appendChild(debugInfo);
    }
}

// Проверка авторизации при загрузке
window.addEventListener('load', () => {
    const token = localStorage.getItem('magante_token');
    if (token && app.currentUser) {
        app.showDashboard();
    }
    
    // Периодическая проверка статуса API
    setInterval(() => {
        app.checkAPIStatus();
    }, 30000); // Каждые 30 секунд
});

// Глобальные функции для отладки
window.debugApp = function() {
    console.log('=== DEBUG INFO ===');
    console.log('Current User:', app.currentUser);
    console.log('Token:', app.token ? 'Present' : 'Missing');
    console.log('API Online:', app.isOnline);
    console.log('API Base:', app.apiBase);
    console.log('Local Storage Token:', localStorage.getItem('magante_token'));
    console.log('==================');
};
