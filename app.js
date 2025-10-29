class MaganteOTC {
    constructor() {
        this.apiBase = 'https://magnate-otc-2.onrender.com';
        this.currentUser = null;
        this.token = localStorage.getItem('magante_token');
        this.isOnline = true; // Устанавливаем true по умолчанию после успешного входа
        
        this.init();
    }

    async init() {
        console.log('🔧 Инициализация Magante OTC...');
        
        // Проверяем авторизацию при загрузке
        if (this.token) {
            console.log('🔑 Найден токен, проверяем валидность...');
            await this.validateToken();
        } else {
            console.log('🔑 Токен не найден, проверяем статус API...');
            await this.checkAPIStatus();
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
                console.log('🔐 Попытка входа:', login);
                this.login(login, password);
            });
        }

        // Создание сделки
        const dealForm = document.getElementById('dealForm');
        if (dealForm) {
            dealForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const amount = document.getElementById('dealAmount').value;
                const description = document.getElementById('dealDescription').value;
                const paymentMethod = document.getElementById('dealPaymentMethod').value;
                console.log('💼 Создание сделки:', { amount, description, paymentMethod });
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
                console.log('🎫 Создание тикета:', { subject, message });
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
            console.log('🌐 Проверка статуса API...');
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch(`${this.apiBase}/api/health`, {
                method: 'GET',
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json',
                }
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                this.isOnline = true;
                this.showAPIStatus();
                console.log('✅ API онлайн');
                return true;
            } else {
                this.isOnline = false;
                this.showAPIStatus();
                console.log('❌ API ответ не OK');
                return false;
            }
        } catch (error) {
            console.error('❌ Ошибка проверки API:', error);
            this.isOnline = false;
            this.showAPIStatus();
            return false;
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
                this.isOnline = true; // API работает, устанавливаем true
                this.showDashboard();
                this.showToast('✅ Автоматический вход выполнен', 'success');
                console.log('✅ Токен валиден, пользователь:', profile.username);
                return true;
            } else {
                // Токен невалидный
                console.log('❌ Токен невалиден');
                localStorage.removeItem('magante_token');
                this.token = null;
                this.currentUser = null;
                await this.checkAPIStatus();
                return false;
            }
        } catch (error) {
            console.error('❌ Ошибка проверки токена:', error);
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
            
            // После успешного входа API точно онлайн
            this.isOnline = true;
            this.showAPIStatus();

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

            const data = await response.json();

            if (response.ok) {
                this.currentUser = data.user;
                this.token = data.token;
                localStorage.setItem('magante_token', this.token);
                this.isOnline = true; // Убедимся что статус онлайн
                this.showDashboard();
                this.showToast('✅ Успешный вход! Добро пожаловать в Magante OTC!', 'success');
                console.log('✅ Успешный вход, пользователь:', data.user.username);
                return true;
            } else {
                throw new Error(data.error || 'Ошибка входа');
            }
        } catch (error) {
            console.error('❌ Ошибка входа:', error);
            this.showToast(error.message, 'error');
            return false;
        } finally {
            this.showLoading(false);
        }
    }

    async createDeal(amount, description, paymentMethod) {
        try {
            if (!this.token) {
                throw new Error('Требуется авторизация');
            }

            this.showLoading(true);

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

            const data = await response.json();

            if (response.ok) {
                this.showToast('✅ Сделка создана успешно!', 'success');
                await this.loadUserDeals(); // Ждем загрузку сделок
                // Очищаем форму
                document.getElementById('dealForm').reset();
                console.log('✅ Сделка создана:', data.id);
                return data;
            } else {
                throw new Error(data.error || 'Ошибка при создании сделки');
            }
        } catch (error) {
            console.error('❌ Ошибка создания сделки:', error);
            this.showToast(error.message, 'error');
            return null;
        } finally {
            this.showLoading(false);
        }
    }

    async loadUserDeals() {
        try {
            if (!this.token) {
                console.log('❌ Нет токена для загрузки сделок');
                return;
            }

            console.log('📊 Загрузка сделок пользователя...');
            const response = await fetch(`${this.apiBase}/api/deals/my`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Accept': 'application/json'
                }
            });

            if (response.ok) {
                const deals = await response.json();
                this.displayDeals(deals);
                console.log('✅ Сделки загружены:', deals.length, 'шт');
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
            if (!this.token) {
                console.log('❌ Нет токена для загрузки профиля');
                return;
            }

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
                console.log('✅ Профиль загружен:', profile.username);
            } else {
                console.log('❌ Ошибка загрузки профиля');
            }
        } catch (error) {
            console.error('❌ Ошибка загрузки профиля:', error);
            this.displayProfile(this.currentUser);
        }
    }

    async createTicket(subject, message) {
        try {
            if (!this.token) {
                throw new Error('Требуется авторизация');
            }

            this.showLoading(true);

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

            const data = await response.json();

            if (response.ok) {
                this.showToast('✅ Тикет создан успешно! Мы ответим вам в ближайшее время.', 'success');
                await this.loadUserTickets(); // Ждем загрузку тикетов
                // Очищаем форму и скрываем
                document.getElementById('newTicketForm').reset();
                this.hideCreateTicket();
                console.log('✅ Тикет создан:', data.id);
                return data;
            } else {
                throw new Error(data.error || 'Ошибка при создании тикета');
            }
        } catch (error) {
            console.error('❌ Ошибка создания тикета:', error);
            this.showToast(error.message, 'error');
            return false;
        } finally {
            this.showLoading(false);
        }
    }

    async loadUserTickets() {
        try {
            if (!this.token) {
                console.log('❌ Нет токена для загрузки тикетов');
                return;
            }

            console.log('🎫 Загрузка тикетов пользователя...');
            const response = await fetch(`${this.apiBase}/api/tickets/my`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Accept': 'application/json'
                }
            });

            if (response.ok) {
                const tickets = await response.json();
                this.displayTickets(tickets);
                console.log('✅ Тикеты загружены:', tickets.length, 'шт');
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
            console.log('❌ Контейнер dealsList не найден');
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
            console.log('ℹ️ Нет сделок для отображения');
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
        
        console.log('✅ Сделки отображены:', deals.length, 'шт');
    }

    displayTickets(tickets) {
        const container = document.getElementById('ticketsList');
        if (!container) {
            console.log('❌ Контейнер ticketsList не найден');
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
            console.log('ℹ️ Нет тикетов для отображения');
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
        
        console.log('✅ Тикеты отображены:', tickets.length, 'шт');
    }

    displayProfile(profile) {
        const container = document.getElementById('profileInfo');
        if (!container) {
            console.log('❌ Контейнер profileInfo не найден');
            return;
        }

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
        
        console.log('✅ Профиль отображен');
    }

    updateUserBalance(balance) {
        const balanceElement = document.getElementById('userBalance');
        if (balanceElement) {
            balanceElement.textContent = `Баланс: ${balance} RUB`;
            console.log('✅ Баланс обновлен:', balance);
        }
    }

    showDashboard() {
        console.log('🏠 Показ дашборда...');
        
        // Скрываем главный экран и форму входа
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
        
        // Загружаем данные
        this.loadUserDeals();
        this.loadUserTickets();
        this.loadProfile();
        
        // Показываем раздел сделок по умолчанию
        this.showSection('dealsSection');
        
        console.log('✅ Дашборд показан');
    }

    showSection(sectionName) {
        console.log('📁 Переключение на раздел:', sectionName);
        
        // Скрываем все разделы
        const sections = ['dealsSection', 'createDealSection', 'ticketsSection', 'createTicketForm', 'profileSection', 'adminSection'];
        sections.forEach(section => {
            const element = document.getElementById(section);
            if (element) element.style.display = 'none';
        });

        // Показываем выбранный раздел
        const targetSection = document.getElementById(sectionName);
        if (targetSection) {
            targetSection.style.display = 'block';
            console.log('✅ Раздел показан:', sectionName);
        } else {
            console.log('❌ Раздел не найден:', sectionName);
        }

        // Обновляем активное состояние в навигации
        const navLinks = document.querySelectorAll('.list-group-item');
        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('onclick')?.includes(sectionName)) {
                link.classList.add('active');
            }
        });

        // Загружаем данные если нужно
        if (sectionName === 'dealsSection') {
            this.loadUserDeals();
        } else if (sectionName === 'ticketsSection') {
            this.loadUserTickets();
        } else if (sectionName === 'profileSection') {
            this.loadProfile();
        }
    }

    showCreateTicket() {
        console.log('📝 Показ формы создания тикета');
        document.getElementById('ticketsList').style.display = 'none';
        document.getElementById('createTicketForm').style.display = 'block';
    }

    hideCreateTicket() {
        console.log('📝 Скрытие формы создания тикета');
        document.getElementById('ticketsList').style.display = 'block';
        document.getElementById('createTicketForm').style.display = 'none';
    }

    showLoading(show) {
        const loader = document.getElementById('loadingOverlay');
        if (loader) {
            loader.style.display = show ? 'flex' : 'none';
            console.log(show ? '🔄 Показать загрузку' : '✅ Скрыть загрузку');
        }
    }

    showToast(message, type = 'info') {
        console.log('📢 Toast:', type, message);
        
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
        console.log('🚪 Выход из системы...');
        this.currentUser = null;
        this.token = null;
        localStorage.removeItem('magante_token');
        
        document.getElementById('dashboard').style.display = 'none';
        document.getElementById('loginNav').style.display = 'block';
        document.getElementById('logoutNav').style.display = 'none';
        document.querySelector('.hero-section').style.display = 'block';
        
        this.showToast('Вы вышли из системы', 'info');
        console.log('✅ Выход выполнен');
    }

    // Вспомогательные методы
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
    } else {
        console.error('❌ MaganteOTC не инициализирован');
    }
}

function showLogin() {
    console.log('🔐 Показ формы входа');
    document.querySelector('.hero-section').style.display = 'none';
    document.getElementById('loginSection').style.display = 'block';
    document.getElementById('dashboard').style.display = 'none';
}

function logout() {
    if (window.maganteOTC) {
        window.maganteOTC.logout();
    } else {
        console.error('❌ MaganteOTC не инициализирован');
    }
}

function showCreateTicket() {
    if (window.maganteOTC) {
        window.maganteOTC.showCreateTicket();
    } else {
        console.error('❌ MaganteOTC не инициализирован');
    }
}

function hideCreateTicket() {
    if (window.maganteOTC) {
        window.maganteOTC.hideCreateTicket();
    } else {
        console.error('❌ MaganteOTC не инициализирован');
    }
}

function loadUserDeals() {
    if (window.maganteOTC) {
        window.maganteOTC.loadUserDeals();
    } else {
        console.error('❌ MaganteOTC не инициализирован');
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Загрузка DOM завершена, инициализация MaganteOTC...');
    window.maganteOTC = new MaganteOTC();
});
