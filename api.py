from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import jwt
import datetime
import os
import logging
import uuid
import requests
import asyncio
import aiohttp

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Секретный ключ из переменных окружения
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', '06844ad5ba404a9009ae3a10d55e9ee1')

# Конфигурация бота
BOT_TOKEN = "8085343203:AAHjHIaGKGvxQi4ENzKfR_9ce1JbYdhnuZM"
BOT_API_URL = f"https://api.telegram.org/bot{BOT_TOKEN}"

def get_db_connection():
    """Создание подключения к базе данных"""
    db_path = os.path.join(os.path.dirname(__file__), 'bot_data.db')
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Инициализация базы данных"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Создаем таблицы если они не существуют
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                username TEXT,
                ton_wallet TEXT,
                card_details TEXT,
                balance REAL DEFAULT 0.0,
                successful_deals INTEGER DEFAULT 0,
                lang TEXT DEFAULT 'ru',
                granted_by INTEGER,
                is_admin INTEGER DEFAULT 0,
                web_login TEXT UNIQUE,
                web_password TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS deals (
                deal_id TEXT PRIMARY KEY,
                amount REAL,
                description TEXT,
                seller_id INTEGER,
                buyer_id INTEGER,
                status TEXT DEFAULT 'active',
                payment_method TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                source TEXT DEFAULT 'bot'
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS tickets (
                id TEXT PRIMARY KEY,
                user_id INTEGER,
                subject TEXT NOT NULL,
                message TEXT NOT NULL,
                status TEXT DEFAULT 'open',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (user_id)
            )
        ''')
        
        # Создаем тестового пользователя при инициализации
        try:
            cursor.execute('''
                INSERT OR IGNORE INTO users 
                (user_id, username, ton_wallet, card_details, balance, successful_deals, lang, is_admin, web_login, web_password)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                123456789, 'test_user', 'UQTEST123456789', '5536913996855484', 
                1000.0, 5, 'ru', 1, 'testuser', 'testpass123'
            ))
            logger.info("✅ Тестовый пользователь создан при инициализации")
        except Exception as e:
            logger.warning(f"Тестовый пользователь уже существует: {e}")
        
        conn.commit()
        conn.close()
        logger.info("✅ База данных инициализирована")
    except Exception as e:
        logger.error(f"❌ Ошибка инициализации базы данных: {e}")

async def send_telegram_message_async(chat_id, text, reply_markup=None):
    """Асинхронная отправка сообщения через Telegram Bot API"""
    try:
        url = f"{BOT_API_URL}/sendMessage"
        payload = {
            'chat_id': chat_id,
            'text': text,
            'parse_mode': 'HTML'
        }
        
        if reply_markup:
            payload['reply_markup'] = reply_markup
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, timeout=10) as response:
                if response.status == 200:
                    logger.info(f"✅ Сообщение отправлено пользователю {chat_id}")
                    return True
                else:
                    error_text = await response.text()
                    logger.error(f"❌ Ошибка отправки сообщения пользователю {chat_id}: {error_text}")
                    return False
    except Exception as e:
        logger.error(f"❌ Ошибка отправки Telegram сообщения: {e}")
        return False

def send_telegram_message(chat_id, text, reply_markup=None):
    """Синхронная обертка для отправки сообщения через Telegram Bot API"""
    try:
        url = f"{BOT_API_URL}/sendMessage"
        payload = {
            'chat_id': chat_id,
            'text': text,
            'parse_mode': 'HTML'
        }
        
        if reply_markup:
            payload['reply_markup'] = reply_markup
        
        response = requests.post(url, json=payload, timeout=10)
        if response.status_code == 200:
            logger.info(f"✅ Сообщение отправлено пользователю {chat_id}")
            return True
        else:
            logger.error(f"❌ Ошибка отправки сообщения пользователю {chat_id}: {response.text}")
            return False
    except Exception as e:
        logger.error(f"❌ Ошибка отправки Telegram сообщения: {e}")
        return False

def get_payment_method_emoji(method):
    """Получение эмодзи для метода оплаты"""
    emojis = {
        'ton': '💎',
        'sbp': '💳', 
        'stars': '⭐'
    }
    return emojis.get(method, '💰')

def get_payment_method_text(method):
    """Получение текста для метода оплаты"""
    texts = {
        'ton': 'TON',
        'sbp': 'СБП',
        'stars': 'Stars'
    }
    return texts.get(method, method.upper())

async def notify_deal_creation_to_bot(user_id, deal_data):
    """Уведомление бота о создании сделки через веб-интерфейс"""
    try:
        deal_id = deal_data['id']
        amount = deal_data['amount']
        description = deal_data['description']
        payment_method = deal_data['payment_method']
        
        # Формируем ссылку для бота
        deal_link = f"https://t.me/magnate_otc_bot?start={deal_id}"
        
        # Получаем информацию о пользователе
        conn = get_db_connection()
        user = conn.execute(
            'SELECT username, balance FROM users WHERE user_id = ?',
            (user_id,)
        ).fetchone()
        conn.close()
        
        username = user['username'] if user and user['username'] else f"user_{user_id}"
        
        # Формируем сообщение для пользователя
        user_message = f"""
✅ <b>Сделка создана через веб-кабинет!</b>

{get_payment_method_emoji(payment_method)} <b>Сумма:</b> {amount} {get_payment_method_text(payment_method)}
📝 <b>Описание:</b> {description}

🔗 <b>Ссылка для покупателя:</b>
<code>{deal_link}</code>

📋 <b>Статус:</b> Активна
👤 <b>Продавец:</b> {username}

Отправьте эту ссылку покупателю для оплаты.
"""
        
        # Отправляем сообщение пользователю
        user_success = await send_telegram_message_async(user_id, user_message)
        
        # Формируем сообщение для админов
        admin_message = f"""
🌐 <b>Новая сделка через веб-кабинет</b>

🆔 <b>ID сделки:</b> <code>{deal_id}</code>
👤 <b>Продавец:</b> {username} (ID: {user_id})
{get_payment_method_emoji(payment_method)} <b>Сумма:</b> {amount} {get_payment_method_text(payment_method)}
📝 <b>Описание:</b> {description}

🔗 <b>Ссылка:</b> <code>{deal_link}</code>
"""
        
        # Получаем всех админов и отправляем им уведомления
        conn = get_db_connection()
        admins = conn.execute(
            'SELECT user_id FROM users WHERE is_admin = 1'
        ).fetchall()
        conn.close()
        
        admin_notifications = []
        for admin in admins:
            admin_id = admin['user_id']
            if admin_id != user_id:  # Не отправляем уведомление самому себе если он админ
                success = await send_telegram_message_async(admin_id, admin_message)
                admin_notifications.append((admin_id, success))
        
        logger.info(f"📤 Уведомления о сделке {deal_id}: пользователь - {user_success}, админов - {len(admin_notifications)}")
        
        return {
            'user_notified': user_success,
            'admins_notified': len([x for x in admin_notifications if x[1]]),
            'deal_link': deal_link
        }
        
    except Exception as e:
        logger.error(f"❌ Ошибка уведомления бота о создании сделки: {e}")
        return {
            'user_notified': False,
            'admins_notified': 0,
            'error': str(e)
        }

async def sync_deal_with_bot(deal_id):
    """Полная синхронизация сделки с ботом"""
    try:
        conn = get_db_connection()
        deal = conn.execute(
            'SELECT * FROM deals WHERE deal_id = ?',
            (deal_id,)
        ).fetchone()
        
        if not deal:
            conn.close()
            return False
            
        seller_id = deal['seller_id']
        user = conn.execute(
            'SELECT username FROM users WHERE user_id = ?',
            (seller_id,)
        ).fetchone()
        conn.close()
        
        username = user['username'] if user and user['username'] else f"user_{seller_id}"
        
        # Формируем данные для синхронизации
        sync_data = {
            'deal_id': deal_id,
            'amount': deal['amount'],
            'description': deal['description'],
            'seller_id': seller_id,
            'seller_username': username,
            'buyer_id': deal['buyer_id'],
            'status': deal['status'],
            'payment_method': deal['payment_method'],
            'source': deal['source'],
            'created_at': deal['created_at']
        }
        
        # Здесь можно добавить дополнительную логику синхронизации с ботом
        # Например, обновление внутренних структур данных бота
        
        logger.info(f"✅ Сделка {deal_id} синхронизирована с ботом")
        return True
        
    except Exception as e:
        logger.error(f"❌ Ошибка синхронизации сделки {deal_id} с ботом: {e}")
        return False

@app.route('/')
def home():
    return jsonify({
        "message": "Magante OTC API is running", 
        "status": "active",
        "timestamp": datetime.datetime.now().isoformat(),
        "version": "1.0"
    })

@app.route('/api/health', methods=['GET'])
def health_check():
    try:
        conn = get_db_connection()
        conn.execute('SELECT 1')
        conn.close()
        return jsonify({
            "status": "healthy", 
            "database": "connected",
            "timestamp": datetime.datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({
            "status": "unhealthy", 
            "database": "disconnected",
            "error": str(e)
        }), 500

@app.route('/api/create-test-user', methods=['POST'])
def create_test_user():
    """Гарантированное создание тестового пользователя"""
    try:
        conn = get_db_connection()
        
        # Удаляем если существует
        conn.execute('DELETE FROM users WHERE user_id = 123456789 OR web_login = "testuser"')
        
        # Создаем заново
        conn.execute('''
            INSERT INTO users 
            (user_id, username, ton_wallet, card_details, balance, successful_deals, lang, is_admin, web_login, web_password)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            123456789, 'test_user', 'UQTEST123456789', '5536913996855484', 
            1000.0, 5, 'ru', 1, 'testuser', 'testpass123'
        ))
        
        conn.commit()
        
        # Проверяем создание
        user = conn.execute(
            'SELECT * FROM users WHERE web_login = "testuser" AND web_password = "testpass123"'
        ).fetchone()
        conn.close()
        
        if user:
            logger.info("✅ Тестовый пользователь успешно создан через API")
            return jsonify({
                "status": "success",
                "message": "✅ ТЕСТОВЫЙ ПОЛЬЗОВАТЕЛЬ УСПЕШНО СОЗДАН!",
                "login": "testuser", 
                "password": "testpass123",
                "note": "Теперь можно входить на сайт https://barizhka.github.io/magnate-otc"
            })
        else:
            logger.error("❌ Не удалось создать тестового пользователя")
            return jsonify({
                "status": "error", 
                "message": "❌ Не удалось создать пользователя в базе данных"
            }), 500
            
    except Exception as e:
        logger.error(f"❌ Ошибка создания тестового пользователя: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/check-users', methods=['GET'])
def check_users():
    """Проверка всех пользователей в базе"""
    try:
        conn = get_db_connection()
        users = conn.execute('SELECT user_id, username, web_login, web_password, balance, is_admin FROM users').fetchall()
        conn.close()
        
        users_list = []
        for user in users:
            users_list.append({
                'id': user['user_id'],
                'username': user['username'],
                'login': user['web_login'],
                'password': user['web_password'],
                'balance': user['balance'],
                'is_admin': bool(user['is_admin'])
            })
        
        logger.info(f"📊 Проверка пользователей: найдено {len(users_list)} пользователей")
        return jsonify({
            'total_users': len(users_list),
            'users': users_list
        })
    except Exception as e:
        logger.error(f"❌ Ошибка проверки пользователей: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/login', methods=['POST', 'OPTIONS'])
def login():
    """Авторизация пользователя"""
    if request.method == 'OPTIONS':
        return '', 200
        
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        login = data.get('login')
        password = data.get('password')
        
        logger.info(f"🔐 Попытка входа: {login}")
        
        if not login or not password:
            return jsonify({'error': 'Login and password required'}), 400
        
        conn = get_db_connection()
        user = conn.execute(
            'SELECT * FROM users WHERE web_login = ? AND web_password = ?',
            (login, password)
        ).fetchone()
        conn.close()
        
        if user:
            # Создаем JWT токен
            token_payload = {
                'user_id': user['user_id'],
                'username': user['username'],
                'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
            }
            token = jwt.encode(token_payload, app.config['SECRET_KEY'], algorithm='HS256')
            
            user_data = {
                'user_id': user['user_id'],
                'username': user['username'] or f"user_{user['user_id']}",
                'ton_wallet': user['ton_wallet'] or '',
                'card_details': user['card_details'] or '',
                'balance': float(user['balance'] or 0),
                'successful_deals': user['successful_deals'] or 0,
                'lang': user['lang'] or 'ru',
                'is_admin': bool(user['is_admin']),
                'web_login': user['web_login']
            }
            
            logger.info(f"✅ Успешный вход пользователя: {user['user_id']}")
            return jsonify({
                'token': token,
                'user': user_data
            })
        
        logger.warning(f"❌ Неудачная попытка входа: {login}")
        return jsonify({'error': 'Неверный логин или пароль'}), 401
        
    except Exception as e:
        logger.error(f"❌ Ошибка входа: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/deals', methods=['POST', 'OPTIONS'])
def create_deal():
    """Создание новой сделки"""
    if request.method == 'OPTIONS':
        return '', 200
        
    try:
        # Проверка авторизации
        token = request.headers.get('Authorization', '')
        if not token.startswith('Bearer '):
            return jsonify({'error': 'Token required'}), 401
            
        token = token.replace('Bearer ', '')
        
        try:
            payload = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
            user_id = payload['user_id']
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
        
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        amount = data.get('amount')
        description = data.get('description')
        payment_method = data.get('payment_method')
        
        if not all([amount, description, payment_method]):
            return jsonify({'error': 'Missing required fields'}), 400
        
        # Создаем ID сделки
        deal_id = f"web_{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}_{user_id}"
        
        conn = get_db_connection()
        conn.execute('''
            INSERT INTO deals (deal_id, amount, description, seller_id, status, payment_method, source)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            deal_id,
            float(amount),
            description,
            user_id,
            'active',
            payment_method,
            'web'
        ))
        conn.commit()
        conn.close()
        
        logger.info(f"✅ Сделка создана: {deal_id} пользователем: {user_id}")
        
        # Формируем данные сделки для уведомления
        deal_data = {
            'id': deal_id,
            'amount': amount,
            'description': description,
            'payment_method': payment_method,
            'status': 'active',
            'source': 'web'
        }
        
        # Уведомляем бота о создании сделки (асинхронно)
        import threading
        def notify_bot_async():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                result = loop.run_until_complete(notify_deal_creation_to_bot(user_id, deal_data))
                logger.info(f"📤 Результат уведомления бота: {result}")
            finally:
                loop.close()
        
        thread = threading.Thread(target=notify_bot_async)
        thread.start()
        
        # Синхронизируем сделку с ботом
        sync_result = asyncio.run(sync_deal_with_bot(deal_id))
        
        # Формируем ссылку для ответа
        deal_link = f"https://t.me/magnate_otc_bot?start={deal_id}"
        
        return jsonify({
            'id': deal_id,
            'amount': amount,
            'description': description,
            'status': 'active',
            'payment_method': payment_method,
            'source': 'web',
            'deal_link': deal_link,
            'message': 'Сделка успешно создана. Уведомление отправлено в Telegram бот.',
            'bot_sync': sync_result
        })
        
    except Exception as e:
        logger.error(f"❌ Ошибка создания сделки: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/deals/my', methods=['GET'])
def get_user_deals():
    """Получение сделок пользователя"""
    try:
        # Проверка авторизации
        token = request.headers.get('Authorization', '')
        if not token.startswith('Bearer '):
            return jsonify({'error': 'Token required'}), 401
            
        token = token.replace('Bearer ', '')
        
        try:
            payload = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
            user_id = payload['user_id']
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
        
        conn = get_db_connection()
        deals = conn.execute('''
            SELECT * FROM deals 
            WHERE seller_id = ? OR buyer_id = ?
            ORDER BY created_at DESC
        ''', (user_id, user_id)).fetchall()
        conn.close()
        
        deals_list = []
        for deal in deals:
            deal_link = f"https://t.me/magnate_otc_bot?start={deal['deal_id']}"
            deals_list.append({
                'id': deal['deal_id'],
                'amount': float(deal['amount']),
                'description': deal['description'],
                'seller_id': deal['seller_id'],
                'buyer_id': deal['buyer_id'],
                'status': deal['status'],
                'payment_method': deal['payment_method'],
                'source': deal['source'],
                'created_at': deal['created_at'],
                'deal_link': deal_link
            })
        
        logger.info(f"📊 Загружено {len(deals_list)} сделок для пользователя {user_id}")
        return jsonify(deals_list)
        
    except Exception as e:
        logger.error(f"❌ Ошибка получения сделок: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/profile', methods=['GET'])
def get_profile():
    """Получение профиля пользователя"""
    try:
        # Проверка авторизации
        token = request.headers.get('Authorization', '')
        if not token.startswith('Bearer '):
            return jsonify({'error': 'Token required'}), 401
            
        token = token.replace('Bearer ', '')
        
        try:
            payload = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
            user_id = payload['user_id']
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
        
        conn = get_db_connection()
        user = conn.execute(
            'SELECT * FROM users WHERE user_id = ?',
            (user_id,)
        ).fetchone()
        conn.close()
        
        if user:
            user_data = {
                'user_id': user['user_id'],
                'username': user['username'] or f"user_{user['user_id']}",
                'ton_wallet': user['ton_wallet'] or '',
                'card_details': user['card_details'] or '',
                'balance': float(user['balance'] or 0),
                'successful_deals': user['successful_deals'] or 0,
                'lang': user['lang'] or 'ru',
                'is_admin': bool(user['is_admin']),
                'web_login': user['web_login']
            }
            return jsonify(user_data)
        
        return jsonify({'error': 'User not found'}), 404
        
    except Exception as e:
        logger.error(f"❌ Ошибка получения профиля: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/tickets', methods=['POST', 'OPTIONS'])
def create_ticket():
    """Создание тикета"""
    if request.method == 'OPTIONS':
        return '', 200
        
    try:
        # Проверка авторизации
        token = request.headers.get('Authorization', '')
        if not token.startswith('Bearer '):
            return jsonify({'error': 'Token required'}), 401
            
        token = token.replace('Bearer ', '')
        
        try:
            payload = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
            user_id = payload['user_id']
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
        
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        subject = data.get('subject')
        message = data.get('message')
        
        if not subject or not message:
            return jsonify({'error': 'Subject and message required'}), 400
        
        ticket_id = f"ticket_{uuid.uuid4().hex[:8]}"
        
        conn = get_db_connection()
        conn.execute('''
            INSERT INTO tickets (id, user_id, subject, message, status)
            VALUES (?, ?, ?, ?, ?)
        ''', (ticket_id, user_id, subject, message, 'open'))
        conn.commit()
        
        # Получаем данные пользователя
        user = conn.execute(
            'SELECT username FROM users WHERE user_id = ?',
            (user_id,)
        ).fetchone()
        conn.close()
        
        logger.info(f"✅ Тикет создан: {ticket_id} пользователем: {user_id}")
        
        # Отправляем уведомление админам
        admin_message = f"""
🎫 <b>Новый тикет создан через веб-кабинет!</b>

🆔 <b>ID:</b> <code>{ticket_id}</code>
👤 <b>Пользователь:</b> {user['username'] if user else user_id}
📌 <b>Тема:</b> {subject}
📝 <b>Сообщение:</b> {message}

💬 <b>Статус:</b> Открыт
"""
        
        # Получаем всех админов и отправляем им уведомления
        conn = get_db_connection()
        admins = conn.execute(
            'SELECT user_id FROM users WHERE is_admin = 1'
        ).fetchall()
        conn.close()
        
        admin_count = 0
        for admin in admins:
            if send_telegram_message(admin['user_id'], admin_message):
                admin_count += 1
        
        return jsonify({
            'id': ticket_id,
            'subject': subject,
            'message': message,
            'status': 'open',
            'created_at': datetime.datetime.now().isoformat(),
            'admins_notified': admin_count,
            'message': f'Тикет успешно создан. Уведомлено {admin_count} администраторов.'
        })
        
    except Exception as e:
        logger.error(f"❌ Ошибка создания тикета: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/tickets/my', methods=['GET'])
def get_user_tickets():
    """Получение тикетов пользователя"""
    try:
        # Проверка авторизации
        token = request.headers.get('Authorization', '')
        if not token.startswith('Bearer '):
            return jsonify({'error': 'Token required'}), 401
            
        token = token.replace('Bearer ', '')
        
        try:
            payload = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
            user_id = payload['user_id']
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
        
        conn = get_db_connection()
        tickets = conn.execute('''
            SELECT * FROM tickets 
            WHERE user_id = ?
            ORDER BY created_at DESC
        ''', (user_id,)).fetchall()
        conn.close()
        
        tickets_list = []
        for ticket in tickets:
            tickets_list.append({
                'id': ticket['id'],
                'subject': ticket['subject'],
                'message': ticket['message'],
                'status': ticket['status'],
                'created_at': ticket['created_at']
            })
        
        logger.info(f"📊 Загружено {len(tickets_list)} тикетов для пользователя {user_id}")
        return jsonify(tickets_list)
        
    except Exception as e:
        logger.error(f"❌ Ошибка получения тикетов: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/sync-from-bot', methods=['POST'])
def sync_from_bot():
    """Синхронизация данных из бота"""
    try:
        data = request.get_json()
        users = data.get('users', [])
        deals = data.get('deals', [])
        
        conn = get_db_connection()
        
        # Синхронизация пользователей
        for user_data in users:
            conn.execute('''
                INSERT OR REPLACE INTO users 
                (user_id, username, ton_wallet, card_details, balance, successful_deals, lang, is_admin, web_login, web_password)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                user_data['user_id'],
                user_data.get('username', ''),
                user_data.get('ton_wallet', ''),
                user_data.get('card_details', ''),
                user_data.get('balance', 0),
                user_data.get('successful_deals', 0),
                user_data.get('lang', 'ru'),
                user_data.get('is_admin', 0),
                user_data.get('web_login'),
                user_data.get('web_password')
            ))
        
        # Синхронизация сделок
        for deal_data in deals:
            conn.execute('''
                INSERT OR REPLACE INTO deals 
                (deal_id, amount, description, seller_id, buyer_id, status, payment_method, source)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                deal_data['deal_id'],
                deal_data['amount'],
                deal_data['description'],
                deal_data['seller_id'],
                deal_data.get('buyer_id'),
                deal_data.get('status', 'active'),
                deal_data.get('payment_method'),
                deal_data.get('source', 'bot')
            ))
        
        conn.commit()
        conn.close()
        
        logger.info(f"✅ Синхронизировано: {len(users)} пользователей, {len(deals)} сделок")
        return jsonify({
            "message": f"Синхронизировано: {len(users)} пользователей, {len(deals)} сделок",
            "status": "success"
        })
        
    except Exception as e:
        logger.error(f"❌ Ошибка синхронизации: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/sync-to-bot', methods=['POST'])
def sync_to_bot():
    """Синхронизация данных с ботом"""
    try:
        data = request.get_json()
        deal_id = data.get('deal_id')
        
        if not deal_id:
            return jsonify({'error': 'deal_id required'}), 400
        
        # Синхронизируем конкретную сделку с ботом
        sync_result = asyncio.run(sync_deal_with_bot(deal_id))
        
        return jsonify({
            "message": f"Сделка {deal_id} синхронизирована с ботом",
            "status": "success" if sync_result else "error",
            "sync_result": sync_result
        })
        
    except Exception as e:
        logger.error(f"❌ Ошибка синхронизации с ботом: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/notify-deal-created', methods=['POST'])
def notify_deal_created():
    """Уведомление о создании сделки через бота"""
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        deal_id = data.get('deal_id')
        amount = data.get('amount')
        description = data.get('description')
        payment_method = data.get('payment_method')
        
        if not all([user_id, deal_id, amount, description, payment_method]):
            return jsonify({'error': 'Missing required fields'}), 400
        
        deal_data = {
            'id': deal_id,
            'amount': amount,
            'description': description,
            'payment_method': payment_method
        }
        
        # Уведомляем бота о создании сделки
        result = asyncio.run(notify_deal_creation_to_bot(user_id, deal_data))
        
        return jsonify({
            "status": "success",
            "message": "Уведомление отправлено в бот",
            "result": result
        })
            
    except Exception as e:
        logger.error(f"❌ Ошибка отправки уведомления: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/reset-database', methods=['POST'])
def reset_database():
    """Полный сброс базы данных (только для разработки)"""
    try:
        conn = get_db_connection()
        
        # Удаляем все таблицы
        conn.execute('DROP TABLE IF EXISTS users')
        conn.execute('DROP TABLE IF EXISTS deals')
        conn.execute('DROP TABLE IF EXISTS tickets')
        
        # Пересоздаем таблицы
        conn.execute('''
            CREATE TABLE users (
                user_id INTEGER PRIMARY KEY,
                username TEXT,
                ton_wallet TEXT,
                card_details TEXT,
                balance REAL DEFAULT 0.0,
                successful_deals INTEGER DEFAULT 0,
                lang TEXT DEFAULT 'ru',
                granted_by INTEGER,
                is_admin INTEGER DEFAULT 0,
                web_login TEXT UNIQUE,
                web_password TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.execute('''
            CREATE TABLE deals (
                deal_id TEXT PRIMARY KEY,
                amount REAL,
                description TEXT,
                seller_id INTEGER,
                buyer_id INTEGER,
                status TEXT DEFAULT 'active',
                payment_method TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                source TEXT DEFAULT 'bot'
            )
        ''')
        
        conn.execute('''
            CREATE TABLE tickets (
                id TEXT PRIMARY KEY,
                user_id INTEGER,
                subject TEXT NOT NULL,
                message TEXT NOT NULL,
                status TEXT DEFAULT 'open',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (user_id)
            )
        ''')
        
        # Создаем тестового пользователя
        conn.execute('''
            INSERT INTO users 
            (user_id, username, ton_wallet, card_details, balance, successful_deals, lang, is_admin, web_login, web_password)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            123456789, 'test_user', 'UQTEST123456789', '5536913996855484', 
            1000.0, 5, 'ru', 1, 'testuser', 'testpass123'
        ))
        
        conn.commit()
        conn.close()
        
        logger.info("✅ База данных полностью пересоздана")
        return jsonify({
            "status": "success",
            "message": "✅ База данных полностью пересоздана!",
            "login": "testuser",
            "password": "testpass123"
        })
        
    except Exception as e:
        logger.error(f"❌ Ошибка сброса базы данных: {e}")
        return jsonify({'error': str(e)}), 500

# Инициализация базы данных при запуске
with app.app_context():
    init_db()
    logger.info("🚀 Magante OTC API успешно запущен!")

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
