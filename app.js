// Mock API для демонстрации (без бэкенда)
class MockAPI {
    constructor() {
        this.users = JSON.parse(localStorage.getItem('mock_users')) || {};
        this.deals = JSON.parse(localStorage.getItem('mock_deals')) || {};
        this.tickets = JSON.parse(localStorage.getItem('mock_tickets')) || {};
    }

    saveData() {
        localStorage.setItem('mock_users', JSON.stringify(this.users));
        localStorage.setItem('mock_deals', JSON.stringify(this.deals));
        localStorage.setItem('mock_tickets', JSON.stringify(this.tickets));
    }

    async login(login, password) {
        // В реальном приложении здесь будет запрос к бэкенду
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const user = Object.values(this.users).find(u => u.web_login === login && u.web_password === password);
        if (user) {
            const token = btoa(JSON.stringify({ user_id: user.user_id, timestamp: Date.now() }));
            localStorage.setItem('magante_token', token);
            return { token, user };
        }
        throw new Error('Неверный логин или пароль');
    }

    async createDeal(userId, amount, description, paymentMethod) {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const dealId = 'deal_' + Date.now();
        const deal = {
            id: dealId,
            amount: amount,
            description: description,
            seller_id: userId,
            buyer_id: null,
            status: 'active',
            payment_method: paymentMethod,
            source: 'web',
            created_at: new Date().toISOString()
        };
        
        this.deals[dealId] = deal;
        this.saveData();
        
        return deal;
    }

    async getUserDeals(userId) {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        return Object.values(this.deals).filter(deal => 
            deal.seller_id === userId || deal.buyer_id === userId
        ).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    async createTicket(userId, subject, message) {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const ticketId = 'ticket_' + Date.now();
        const ticket = {
            id: ticketId,
            user_id: userId,
            subject: subject,
            message: message,
            status: 'open',
            created_at: new Date().toISOString()
        };
        
        this.tickets[ticketId] = ticket;
        this.saveData();
        
        return ticket;
    }

    async getUserTickets(userId) {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        return Object.values(this.tickets).filter(ticket => 
            ticket.user_id === userId
        ).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    // Инициализация тестовых данных
    initTestData() {
        if (Object.keys(this.users).length === 0) {
            this.users[123456789] = {
                user_id: 123456789,
                username: 'test_user',
                ton_wallet: 'UQTEST123456789',
                card_details: '5536913996855484',
                balance: 1000,
                successful_deals: 5,
                lang: 'ru',
                is_admin: true,
                web_login: 'testuser',
                web_password: 'testpass123'
            };
            this.saveData();
        }
    }
}

class MaganteOTC {
    constructor() {
        this.api = new MockAPI();
        this.api.initTestData();
        this.currentUser = null;
        this.token = null;
    }

    async login(login, password) {
        try {
            this.showLoading(true);
            const result = await this.api.login(login, password);
            
            this.currentUser = result.user;
            this.token = result.token;
            
            this.showDashboard();
            this.showToast('Успешный вход', 'success');
            return true;
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
            const deal = await this.api.createDeal(this.currentUser.user_id, amount, description, paymentMethod);
            
            this.showToast('Сделка создана успешно!', 'success');
            this.loadUserDeals();
            return deal;
        } catch (error) {
            this.showToast(error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async loadUserDeals() {
        try {
            this.showLoading(true);
            const deals = await this.api.getUserDeals(this.currentUser.user_id);
            this.displayDeals(deals);
        } catch (error) {
            this.showToast('Ошибка загрузки сделок', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async createTicket(subject, message) {
        try {
            this.showLoading(true);
            await this.api.createTicket(this.currentUser.user_id, subject, message);
            
            this.showToast('Тикет создан успешно!', 'success');
            this.loadUserTickets();
            return true;
        } catch (error) {
            this.showToast(error.message, 'error');
            return false;
        } finally {
            this.showLoading(false);
        }
    }

    async loadUserTickets() {
        try {
            this.showLoading(true);
            const tickets = await this.api.getUserTickets(this.currentUser.user_id);
            this.displayTickets(tickets);
        } catch (error) {
            this.showToast('Ошибка загрузки тикетов', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    displayDeals(deals) {
        const container = document.getElementById('dealsList');
        if (!deals || deals.length === 0) {
            container.innerHTML = `
                <div class="col-12">
                    <div class="alert alert-info">
                        <i class="fas fa-info-circle"></i> У вас пока нет сделок
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = deals.map(deal => {
            const statusClass = this.getStatusClass(deal.status);
            const statusText = this.getStatusText(deal.status);
            const paymentMethod = this.getPaymentMethodText(deal.payment_method);
            
            return `
                <div class="col-md-6 mb-3">
                    <div class="card feature-card deal-card ${statusClass}">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-start mb-2">
                                <h5 class="card-title">Сделка #${deal.id.slice(-8)}</h5>
                                <span class="badge bg-${this.getStatusColor(deal.status)}">${statusText}</span>
                            </div>
                            <p class="card-text">${deal.description}</p>
                            <div class="deal-info">
                                <p><strong>Сумма:</strong> ${deal.amount} ${paymentMethod}</p>
                                <p><strong>Статус:</strong> ${statusText}</p>
                                <p><strong>Создана:</strong> ${new Date(deal.created_at).toLocaleDateString()}</p>
                                <p><strong>Источник:</strong> ${deal.source === 'web' ? '🌐 Веб' : '🤖 Бот'}</p>
                            </div>
                            ${deal.buyer_id ? `<p><strong>Покупатель:</strong> ID ${deal.buyer_id}</p>` : ''}
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
                <div class="alert alert-info">
                    <i class="fas fa-info-circle"></i> У вас пока нет тикетов
                </div>
            `;
            return;
        }

        container.innerHTML = tickets.map(ticket => {
            return `
                <div class="card mb-3">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <h5 class="card-title">${ticket.subject}</h5>
                            <span class="badge bg-${this.getTicketStatusColor(ticket.status)}">${ticket.status}</span>
                        </div>
                        <p class="card-text">${ticket.message}</p>
                        <div class="ticket-meta">
                            <small class="text-muted">
                                <i class="fas fa-calendar"></i> Создан: ${new Date(ticket.created_at).toLocaleDateString()}
                            </small>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    getStatusClass(status) {
        const classes = {
            'completed': 'deal-completed',
            'cancelled': 'deal-cancelled',
            'active': ''
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
        
        this.loadUserDeals();
        this.loadUserTickets();
        this.loadProfile();
        
        if (this.currentUser && this.currentUser.is_admin) {
            document.getElementById('adminLink').style.display = 'block';
        }
    }

    loadProfile() {
        const container = document.getElementById('profileInfo');
        container.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <h5 class="card-title">Информация о профиле</h5>
                    <div class="row">
                        <div class="col-md-6">
                            <p><strong>ID пользователя:</strong> ${this.currentUser.user_id}</p>
                            <p><strong>Баланс:</strong> ${this.currentUser.balance} RUB</p>
                            <p><strong>Успешные сделки:</strong> ${this.currentUser.successful_deals}</p>
                        </div>
                        <div class="col-md-6">
                            <p><strong>Язык:</strong> ${this.currentUser.lang}</p>
                            <p><strong>TON кошелек:</strong> ${this.currentUser.ton_wallet || 'Не указан'}</p>
                            <p><strong>Карта:</strong> ${this.currentUser.card_details || 'Не указана'}</p>
                        </div>
                    </div>
                    <div class="mt-3">
                        <button class="btn btn-outline-primary btn-sm" onclick="app.showToast('Для изменения данных используйте Telegram бота', 'info')">
                            <i class="fas fa-edit"></i> Изменить данные
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    showLoading(show) {
        // Простая реализация индикатора загрузки
        if (show) {
            document.body.style.opacity = '0.7';
            document.body.style.pointerEvents = 'none';
        } else {
            document.body.style.opacity = '1';
            document.body.style.pointerEvents = 'auto';
        }
    }

    showToast(message, type = 'info') {
        const toast = document.getElementById('liveToast');
        const toastTitle = document.getElementById('toastTitle');
        const toastMessage = document.getElementById('toastMessage');
        
        const titles = {
            'success': 'Успех',
            'error': 'Ошибка',
            'info': 'Информация',
            'warning': 'Предупреждение'
        };
        
        toastTitle.textContent = titles[type] || 'Уведомление';
        toastMessage.textContent = message;
        
        // Изменение цвета тоста в зависимости от типа
        toast.className = `toast ${type === 'error' ? 'bg-danger text-white' : type === 'success' ? 'bg-success text-white' : ''}`;
        
        const bsToast = new bootstrap.Toast(toast);
        bsToast.show();
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
    document.getElementById(sectionName + 'Section').style.display = 'block';
    
    // Обновить активную ссылку в навигации
    document.querySelectorAll('.list-group-item').forEach(item => {
        item.classList.remove('active');
    });
    event.target.classList.add('active');
}

function showCreateTicket() {
    document.getElementById('createTicketForm').style.display = 'block';
    document.getElementById('ticketsList').style.display = 'none';
}

function hideCreateTicket() {
    document.getElementById('createTicketForm').style.display = 'none';
    document.getElementById('ticketsList').style.display = 'block';
}

function logout() {
    app.logout();
}

// Админ функции (заглушки)
function loadAllDeals() {
    app.showToast('Функция в разработке', 'info');
}

function loadAllTickets() {
    app.showToast('Функция в разработке', 'info');
}

function loadUsers() {
    app.showToast('Функция в разработке', 'info');
}

// Обработчики событий
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const login = document.getElementById('login').value;
    const password = document.getElementById('password').value;
    await app.login(login, password);
});

document.getElementById('createDealForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('dealAmount').value);
    const description = document.getElementById('dealDescription').value;
    const paymentMethod = document.getElementById('dealPaymentMethod').value;
    
    if (amount <= 0) {
        app.showToast('Сумма должна быть больше 0', 'error');
        return;
    }
    
    if (!description.trim()) {
        app.showToast('Введите описание сделки', 'error');
        return;
    }
    
    await app.createDeal(amount, description, paymentMethod);
    document.getElementById('createDealForm').reset();
    showSection('deals');
});

document.getElementById('newTicketForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const subject = document.getElementById('ticketSubject').value;
    const message = document.getElementById('ticketMessage').value;
    
    if (!subject.trim() || !message.trim()) {
        app.showToast('Заполните все поля', 'error');
        return;
    }
    
    const success = await app.createTicket(subject, message);
    if (success) {
        document.getElementById('newTicketForm').reset();
        hideCreateTicket();
    }
});

// Проверка авторизации при загрузке
window.addEventListener('load', () => {
    const token = localStorage.getItem('magante_token');
    if (token) {
        try {
            // В реальном приложении здесь будет проверка токена через API
            const tokenData = JSON.parse(atob(token));
            const testUser = Object.values(app.api.users)[0]; // Берем первого пользователя для демо
            if (testUser) {
                app.currentUser = testUser;
                app.token = token;
                app.showDashboard();
            }
        } catch (e) {
            localStorage.removeItem('magante_token');
        }
    }
    
    // Показать тестовые данные для демонстрации
    console.log('Тестовый логин:', 'testuser');
    console.log('Тестовый пароль:', 'testpass123');
});
