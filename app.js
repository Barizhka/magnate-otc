class MaganteOTC {
    constructor() {
        this.apiBase = 'https://magnate-otc-2.onrender.com';
        this.currentUser = null;
        this.token = localStorage.getItem('magante_token');
        
        console.log('🚀 Magante OTC инициализирован');
        
        this.init();
    }

    async init() {
        if (this.token) {
            console.log('🔄 Попытка автоматического входа...');
            const success = await this.validateToken();
            if (!success) {
                this.showLoginForm();
            }
        } else {
            this.showLoginForm();
        }
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        console.log('🔧 Настройка обработчиков событий...');
        
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
        const dealForm = document.getElementById('createDealForm');
        if (dealForm) {
            dealForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const amount = document.getElementById('dealAmount').value;
                const description = document.getElementById('dealDescription').value;
                const paymentMethod = document.getElementById('dealPaymentMethod').value;
                this.createDeal(amount, description, paymentMethod);
            });
        }

        // Создание тикета
        const ticketForm = document.getElementById('newTicketForm');
        if (ticketForm) {
            ticketForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const subject = document.getElementById('ticketSubject').value;
                const message = document.getElementById('ticketMessage').value;
                this.createTicket(subject, message);
            });
        }
    }

    async validateToken() {
        try {
            console.log('🔐 Проверка токена...');
            const response = await fetch(`${this.apiBase}/api/profile`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Accept': 'application/json'
                }
            });

            if (response.ok) {
                const profile = await response.json();
                this.currentUser = profile;
                this.showDashboard();
                console.log('✅ Автоматический вход выполнен:', profile.username);
                return true;
            } else {
                console.log('❌ Токен невалиден');
                localStorage.removeItem('magante_token');
                this.token = null;
                return false;
            }
        } catch (error) {
            console.error('❌ Ошибка проверки токена:', error);
            return false;
        }
    }

    async login(login, password) {
        try {
            this.showLoading(true);
            console.log('🔐 Отправка запроса на вход...');

            const response = await fetch(`${this.apiBase}/api/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ 
                    login: login.trim(),
                    password: password.trim()
                })
            });

            console.log('📡 Ответ сервера:', response.status);

            const data = await response.json();
            console.log('📦 Данные ответа:', data);

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
            console.error('❌ Ошибка входа:', error);
            this.showToast(error.message, 'error');
            return false;
        } finally {
            this.showLoading(false); // ВАЖНО: убираем загрузку в finally
        }
    }

    async createDeal(amount, description, paymentMethod) {
        try {
            this.showLoading(true);
            console.log('💼 Создание сделки...');

            const response = await fetch(`${this.apiBase}/api/deals`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`,
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    amount: parseFloat(amount),
                    description: description.trim(),
                    payment_method: paymentMethod
                })
            });

            console.log('📡 Ответ создания сделки:', response.status);

            const data = await response.json();
            console.log('📦 Данные сделки:', data);

            if (response.ok) {
                this.showToast('✅ Сделка создана! Ссылка отправлена в Telegram бот.', 'success');
                document.getElementById('createDealForm').reset();
                // Переключаемся на список сделок и обновляем
                this.showSection('dealsSection');
                return data;
            } else {
                throw new Error(data.error || 'Ошибка при создании сделки');
            }
        } catch (error) {
            console.error('❌ Ошибка создания сделки:', error);
            this.showToast(error.message, 'error');
            return null;
        } finally {
            this.showLoading(false); // ВАЖНО: убираем загрузку
        }
    }

    async loadUserDeals() {
        try {
            console.log('📊 Загрузка сделок...');
            const response = await fetch(`${this.apiBase}/api/deals/my`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Accept': 'application/json'
                }
            });

            console.log('📡 Ответ загрузки сделок:', response.status);

            if (response.ok) {
                const deals = await response.json();
                this.displayDeals(deals);
                console.log('✅ Сделки загружены:', deals.length);
            } else {
                throw new Error('Ошибка загрузки сделок');
            }
        } catch (error) {
            console.error('❌ Ошибка загрузки сделок:', error);
            this.showToast('Ошибка загрузки сделок', 'error');
            this.displayDeals([]);
        }
    }

    async loadProfile() {
        try {
            console.log('👤 Загрузка профиля...');
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
                console.log('✅ Профиль загружен');
            }
        } catch (error) {
            console.error('❌ Ошибка загрузки профиля:', error);
        }
    }

    async createTicket(subject, message) {
        try {
            this.showLoading(true);
            console.log('🎫 Создание тикета...');

            const response = await fetch(`${this.apiBase}/api/tickets`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`,
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    subject: subject.trim(),
                    message: message.trim()
                })
            });

            console.log('📡 Ответ создания тикета:', response.status);

            const data = await response.json();

            if (response.ok) {
                this.showToast('✅ Тикет создан!', 'success');
                document.getElementById('newTicketForm').reset();
                this.hideCreateTicket();
                // Обновляем список тикетов
                this.loadUserTickets();
                return data;
            } else {
                throw new Error(data.error || 'Ошибка при создании тикета');
            }
        } catch (error) {
            console.error('❌ Ошибка создания тикета:', error);
            this.showToast(error.message, 'error');
            return false;
        } finally {
            this.showLoading(false); // ВАЖНО: убираем загрузку
        }
    }

    async loadUserTickets() {
        try {
            console.log('🎫 Загрузка тикетов...');
            const response = await fetch(`${this.apiBase}/api/tickets/my`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Accept': 'application/json'
                }
            });

            console.log('📡 Ответ загрузки тикетов:', response.status);

            if (response.ok) {
                const tickets = await response.json();
                this.displayTickets(tickets);
                console.log('✅ Тикеты загружены:', tickets.length);
            } else {
                throw new Error('Ошибка загрузки тикетов');
            }
        } catch (error) {
            console.error('❌ Ошибка загрузки тикетов:', error);
            this.showToast('Ошибка загрузки тикетов', 'error');
            this.displayTickets([]);
        }
    }

    displayDeals(deals) {
        const container = document.getElementById('dealsList');
        if (!container) {
            console.error('❌ Контейнер dealsList не найден!');
            return;
        }

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
            const dealLink = `https://t.me/magnate_otc_bot?start=${deal.id}`;
            return `
                <div class="col-md-6 mb-4">
                    <div class="card feature-card h-100">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-start mb-3">
                                <h5 class="card-title mb-0">
                                    <i class="fas fa-exchange-alt me-2"></i>
                                    Сделка #${deal.id?.slice(-8) || 'N/A'}
                                </h5>
                                <span class="badge bg-${this.getStatusColor(deal.status)}">
                                    ${this.getStatusText(deal.status)}
                                </span>
                            </div>
                            <p class="card-text">${deal.description || 'Описание отсутствует'}</p>
                            <div class="deal-info">
                                <div class="row small">
                                    <div class="col-6">
                                        <strong>Сумма:</strong><br>
                                        <span class="fw-bold">${deal.amount} ${this.getPaymentMethodText(deal.payment_method)}</span>
                                    </div>
                                    <div class="col-6">
                                        <strong>Статус:</strong><br>
                                        <span class="badge bg-${this.getStatusColor(deal.status)}">${this.getStatusText(deal.status)}</span>
                                    </div>
                                </div>
                                <div class="row small mt-2">
                                    <div class="col-6">
                                        <strong>Создана:</strong><br>
                                        ${new Date(deal.created_at).toLocaleDateString('ru-RU')}
                                    </div>
                                    <div class="col-6">
                                        <strong>ID:</strong><br>
                                        <code class="small">${deal.id?.slice(-12) || 'N/A'}</code>
                                    </div>
                                </div>
                                ${deal.status === 'active' ? `
                                    <div class="mt-3">
                                        <strong>🔗 Ссылка для покупателя:</strong>
                                        <div class="input-group input-group-sm mt-1">
                                            <input type="text" class="form-control" value="${dealLink}" readonly>
                                            <button class="btn btn-outline-secondary" type="button" onclick="copyToClipboard('${dealLink}')">
                                                <i class="fas fa-copy"></i>
                                            </button>
                                        </div>
                                        <small class="text-muted">Отправьте эту ссылку покупателю</small>
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
        if (!container) {
            console.error('❌ Контейнер ticketsList не найден!');
            return;
        }

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

        container.innerHTML = tickets.map(ticket => `
            <div class="card mb-3">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-3">
                        <h5 class="card-title mb-0">
                            <i class="fas fa-ticket-alt me-2"></i>
                            ${ticket.subject}
                        </h5>
                        <span class="badge bg-${this.getTicketStatusColor(ticket.status)}">
                            ${this.getTicketStatusText(ticket.status)}
                        </span>
                    </div>
                    <p class="card-text">${ticket.message}</p>
                    <small class="text-muted">
                        <i class="fas fa-calendar me-1"></i>
                        Создан: ${new Date(ticket.created_at).toLocaleDateString('ru-RU')}
                    </small>
                </div>
            </div>
        `).join('');
    }

    displayProfile(profile) {
        const container = document.getElementById('profileInfo');
        if (!container) {
            console.error('❌ Контейнер profileInfo не найден!');
            return;
        }

        container.innerHTML = `
            <div class="card">
                <div class="card-header bg-primary text-white">
                    <h5 class="card-title mb-0">
                        <i class="fas fa-user me-2"></i>
                        Профиль
                    </h5>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-6">
                            <p><strong>ID:</strong> ${profile.user_id}</p>
                            <p><strong>Имя:</strong> ${profile.username}</p>
                            <p><strong>Баланс:</strong> <span class="text-success">${profile.balance} RUB</span></p>
                            <p><strong>Сделки:</strong> ${profile.successful_deals}</p>
                        </div>
                        <div class="col-md-6">
                            <p><strong>Статус:</strong> ${profile.is_admin ? '<span class="badge bg-danger">Администратор</span>' : '<span class="badge bg-secondary">Пользователь</span>'}</p>
                            <p><strong>TON кошелек:</strong> ${profile.ton_wallet || 'Не указан'}</p>
                            <p><strong>Карта:</strong> ${profile.card_details || 'Не указана'}</p>
                        </div>
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

    showDashboard() {
        console.log('🏠 Показ дашборда...');
        
        // Скрываем все секции
        document.querySelector('.hero-section').style.display = 'none';
        document.getElementById('loginSection').style.display = 'none';
        
        // Показываем дашборд
        document.getElementById('dashboard').style.display = 'block';
        
        // Обновляем навигацию
        document.getElementById('loginNav').style.display = 'none';
        document.getElementById('logoutNav').style.display = 'block';
        
        // Показываем админ-панель если пользователь админ
        if (this.currentUser && this.currentUser.is_admin) {
            const adminLink = document.getElementById('adminLink');
            if (adminLink) adminLink.style.display = 'block';
        }
        
        // Загружаем начальные данные
        this.loadUserDeals();
        this.loadProfile();
        
        console.log('✅ Дашборд показан');
    }

    showLoginForm() {
        console.log('🔐 Показ формы входа...');
        document.querySelector('.hero-section').style.display = 'block';
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('dashboard').style.display = 'none';
        document.getElementById('loginNav').style.display = 'block';
        document.getElementById('logoutNav').style.display = 'none';
    }

    showSection(sectionName) {
        console.log('📁 Переключение на раздел:', sectionName);
        
        // Скрываем все основные разделы (с суффиксом Section)
        const sections = ['dealsSection', 'createDealSection', 'ticketsSection', 'profileSection', 'adminSection'];
        sections.forEach(section => {
            const element = document.getElementById(section);
            if (element) {
                element.style.display = 'none';
                console.log('✅ Скрыт раздел:', section);
            }
        });

        // Скрываем форму создания тикета если она открыта
        const createTicketForm = document.getElementById('createTicketForm');
        if (createTicketForm) createTicketForm.style.display = 'none';
        
        // Показываем список тикетов по умолчанию
        const ticketsList = document.getElementById('ticketsList');
        if (ticketsList) {
            ticketsList.style.display = 'block';
        }

        // Показываем выбранный раздел
        const targetSection = document.getElementById(sectionName);
        if (targetSection) {
            targetSection.style.display = 'block';
            console.log('✅ Показан раздел:', sectionName);
        } else {
            console.log('❌ Целевой раздел не найден:', sectionName);
        }

        // Обновляем активные кнопки в навигации
        const navLinks = document.querySelectorAll('.list-group-item');
        navLinks.forEach(link => {
            link.classList.remove('active');
            // Сравниваем без учета регистра и суффиксов
            const linkOnClick = link.getAttribute('onclick') || '';
            if (linkOnClick.includes(sectionName.replace('Section', ''))) {
                link.classList.add('active');
            }
        });

        // Загружаем данные при переключении
        switch(sectionName) {
            case 'dealsSection':
                this.loadUserDeals();
                break;
            case 'ticketsSection':
                this.loadUserTickets();
                break;
            case 'profileSection':
                this.loadProfile();
                break;
        }
    }

    showCreateTicket() {
        console.log('📝 Показ формы создания тикета');
        // Скрываем список тикетов
        const ticketsList = document.getElementById('ticketsList');
        if (ticketsList) ticketsList.style.display = 'none';
        
        // Показываем форму создания тикета
        const createTicketForm = document.getElementById('createTicketForm');
        if (createTicketForm) createTicketForm.style.display = 'block';
    }

    hideCreateTicket() {
        console.log('📝 Скрытие формы создания тикета');
        // Показываем список тикетов
        const ticketsList = document.getElementById('ticketsList');
        if (ticketsList) ticketsList.style.display = 'block';
        
        // Скрываем форму создания тикета
        const createTicketForm = document.getElementById('createTicketForm');
        if (createTicketForm) createTicketForm.style.display = 'none';
    }

    showLoading(show) {
        const loader = document.getElementById('loadingOverlay');
        if (loader) {
            loader.style.display = show ? 'flex' : 'none';
        }
    }

    showToast(message, type = 'info') {
        // Простой toast без Bootstrap
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 5px;
            color: white;
            z-index: 10000;
            max-width: 300px;
            word-wrap: break-word;
        `;
        
        const bgColors = {
            'success': '#28a745',
            'error': '#dc3545', 
            'warning': '#ffc107',
            'info': '#17a2b8'
        };
        
        toast.style.backgroundColor = bgColors[type] || bgColors.info;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 5000);
    }

    logout() {
        console.log('🚪 Выход...');
        this.currentUser = null;
        this.token = null;
        localStorage.removeItem('magante_token');
        this.showLoginForm();
        this.showToast('Вы вышли из системы', 'info');
    }

    // Вспомогательные методы
    getStatusText(status) {
        const texts = {
            'active': 'Активна',
            'confirmed': 'Подтверждена',
            'completed': 'Завершена',
            'cancelled': 'Отменена'
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
            'cancelled': 'danger'
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
}

// Глобальные функции - ОБНОВЛЕНЫ для работы с правильными ID
function showSection(sectionName) {
    // Добавляем суффикс Section к именам разделов
    let actualSectionName = sectionName;
    if (!sectionName.endsWith('Section')) {
        actualSectionName = sectionName + 'Section';
    }
    
    if (window.maganteOTC) {
        window.maganteOTC.showSection(actualSectionName);
    } else {
        console.error('MaganteOTC не инициализирован');
    }
}

function showLogin() {
    document.querySelector('.hero-section').style.display = 'none';
    document.getElementById('loginSection').style.display = 'block';
}

function logout() {
    if (window.maganteOTC) {
        window.maganteOTC.logout();
    }
}

function showCreateTicket() {
    if (window.maganteOTC) {
        window.maganteOTC.showCreateTicket();
    }
}

function hideCreateTicket() {
    if (window.maganteOTC) {
        window.maganteOTC.hideCreateTicket();
    }
}

function loadUserDeals() {
    if (window.maganteOTC) {
        window.maganteOTC.loadUserDeals();
    }
}

// Функция для копирования ссылки сделки
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        if (window.maganteOTC) {
            window.maganteOTC.showToast('Ссылка скопирована в буфер обмена!', 'success');
        }
    }).catch(err => {
        console.error('Ошибка копирования: ', err);
    });
}

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 DOM загружен, запуск MaganteOTC...');
    window.maganteOTC = new MaganteOTC();
});
