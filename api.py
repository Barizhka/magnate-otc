from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import jwt
import datetime
import os
import logging
import uuid

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Секретный ключ из переменных окружения
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', '06844ad5ba404a9009ae3a10d55e9ee1')

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
        users = conn.execute('SELECT user_id, username, web_login, web_password, balance FROM users').fetchall()
        conn.close()
        
        users_list = []
        for user in users:
            users_list.append({
                'id': user['user_id'],
                'username': user['username'],
                'login': user['web_login'],
                'password': user['web_password'],
                'balance': user['balance']
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
        
        return jsonify({
            'id': deal_id,
            'amount': amount,
            'description': description,
            'status': 'active',
            'payment_method': payment_method,
            'source': 'web',
            'message': 'Сделка успешно создана'
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
            deals_list.append({
                'id': deal['deal_id'],
                'amount': float(deal['amount']),
                'description': deal['description'],
                'seller_id': deal['seller_id'],
                'buyer_id': deal['buyer_id'],
                'status': deal['status'],
                'payment_method': deal['payment_method'],
                'source': deal['source'],
                'created_at': deal['created_at']
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
        conn.close()
        
        logger.info(f"✅ Тикет создан: {ticket_id} пользователем: {user_id}")
        
        return jsonify({
            'id': ticket_id,
            'subject': subject,
            'message': message,
            'status': 'open',
            'created_at': datetime.datetime.now().isoformat(),
            'message': 'Тикет успешно создан'
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
