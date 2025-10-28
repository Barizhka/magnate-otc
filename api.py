from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import jwt
import datetime
import os
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', '06844ad5ba404a9009ae3a10d55e9ee1')

def get_db_connection():
    db_path = os.path.join(os.path.dirname(__file__), 'bot_data.db')
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
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
        
        # Создаем тестового пользователя при инициализации
        cursor.execute('''
            INSERT OR IGNORE INTO users 
            (user_id, username, ton_wallet, card_details, balance, successful_deals, lang, is_admin, web_login, web_password)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            123456789, 'test_user', 'UQTEST123456789', '5536913996855484', 
            1000.0, 5, 'ru', 1, 'testuser', 'testpass123'
        ))
        
        conn.commit()
        conn.close()
        logger.info("Database initialized with test user")
    except Exception as e:
        logger.error(f"Database init error: {e}")

@app.route('/')
def home():
    return jsonify({"message": "Magante OTC API", "status": "active"})

@app.route('/api/health')
def health_check():
    return jsonify({"status": "healthy"})

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
        
        # Проверяем
        user = conn.execute(
            'SELECT * FROM users WHERE web_login = "testuser" AND web_password = "testpass123"'
        ).fetchone()
        conn.close()
        
        if user:
            return jsonify({
                "status": "success",
                "message": "✅ ПОЛЬЗОВАТЕЛЬ СОЗДАН!",
                "login": "testuser", 
                "password": "testpass123",
                "note": "Теперь можно входить на сайт"
            })
        else:
            return jsonify({"status": "error", "message": "Не удалось создать пользователя"}), 500
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/check-users', methods=['GET'])
def check_users():
    """Проверка пользователей в базе"""
    try:
        conn = get_db_connection()
        users = conn.execute('SELECT user_id, username, web_login, web_password FROM users').fetchall()
        conn.close()
        
        users_list = []
        for user in users:
            users_list.append({
                'id': user['user_id'],
                'username': user['username'],
                'login': user['web_login'],
                'password': user['web_password']
            })
        
        return jsonify({
            'total_users': len(users_list),
            'users': users_list
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        login = data.get('login')
        password = data.get('password')
        
        logger.info(f"Login attempt: {login}")
        
        conn = get_db_connection()
        user = conn.execute(
            'SELECT * FROM users WHERE web_login = ? AND web_password = ?',
            (login, password)
        ).fetchone()
        conn.close()
        
        if user:
            token = jwt.encode({
                'user_id': user['user_id'],
                'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
            }, app.config['SECRET_KEY'], algorithm='HS256')
            
            return jsonify({
                'token': token,
                'user': {
                    'user_id': user['user_id'],
                    'username': user['username'],
                    'balance': user['balance'],
                    'is_admin': user['is_admin'],
                    'web_login': user['web_login']
                }
            })
        
        return jsonify({'error': 'Неверный логин или пароль'}), 401
        
    except Exception as e:
        logger.error(f"Login error: {e}")
        return jsonify({'error': 'Server error'}), 500

# Остальные endpoint'ы (deals, profile, sync-from-bot) остаются без изменений

with app.app_context():
    init_db()
    logger.info("🚀 API started")

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
