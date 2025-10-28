from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import jwt
import datetime
import os
import logging

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Секретный ключ из переменных окружения
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-12345')

def get_db_connection():
    """Создание подключения к базе данных"""
    db_path = os.path.join(os.path.dirname(__file__), 'bot_data.db')
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Инициализация базы данных"""
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
    
    conn.commit()
    conn.close()
    logger.info("Database initialized")

@app.route('/')
def home():
    return jsonify({
        "message": "Magante OTC API is running", 
        "status": "active",
        "timestamp": datetime.datetime.now().isoformat()
    })

@app.route('/api/health')
def health_check():
    return jsonify({"status": "healthy"})

@app.route('/api/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        login = data.get('login')
        password = data.get('password')
        
        logger.info(f"Login attempt for: {login}")
        
        if not login or not password:
            return jsonify({'error': 'Login and password required'}), 400
        
        conn = get_db_connection()
        user = conn.execute(
            'SELECT * FROM users WHERE web_login = ? AND web_password = ?',
            (login, password)
        ).fetchone()
        conn.close()
        
        if user:
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
            
            logger.info(f"Successful login for user: {user['user_id']}")
            return jsonify({
                'token': token,
                'user': user_data
            })
        
        logger.warning(f"Failed login attempt for: {login}")
        return jsonify({'error': 'Неверный логин или пароль'}), 401
        
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/deals', methods=['POST'])
def create_deal():
    try:
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
        
        logger.info(f"Deal created: {deal_id} by user: {user_id}")
        
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
        logger.error(f"Create deal error: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/deals/my', methods=['GET'])
def get_user_deals():
    try:
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
        
        return jsonify(deals_list)
        
    except Exception as e:
        logger.error(f"Get deals error: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/profile', methods=['GET'])
def get_profile():
    try:
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
        logger.error(f"Get profile error: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

# Инициализация базы данных при запуске
with app.app_context():
    init_db()
    logger.info("Application initialized")

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
