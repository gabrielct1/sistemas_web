from flask import render_template, request, redirect, url_for, session, jsonify, current_app
from models import db, User, PomodoroConfig, PomodoroSession
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timezone, timedelta
from main import app

@app.route('/')
def index():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    return render_template('index.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form['email']
        password = request.form['password']
        
        user = User.query.filter_by(email=email).first()
        if user and check_password_hash(user.password_hash, password):
            session['user_id'] = user.id
            return redirect(url_for('index'))
        return render_template('login.html', error='Email ou senha incorretos', email=email)
    
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        email = request.form['email']
        password = request.form['password']
        
        if User.query.filter_by(email=email).first():
            return render_template('register.html', error='Email já cadastrado', email=email)

        if len(password) < 6:
            return render_template('register.html', error='A senha deve ter pelo menos 6 caracteres', email=email)

        user = User(
            email=email,
            password_hash=generate_password_hash(password)
        )
        db.session.add(user)
        db.session.commit()
        
        # Cria com a configuração padrão (usando 25, 5 e 15)
        config = PomodoroConfig(user_id=user.id)
        db.session.add(config)
        db.session.commit()
        
        return redirect(url_for('login'))
    
    return render_template('register.html')

@app.route('/logout')
def logout():
    session.pop('user_id', None)
    return redirect(url_for('login'))

@app.route('/config', methods=['GET', 'POST'])
def config():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    if request.method == 'POST':
        user_config = PomodoroConfig.query.filter_by(user_id=session['user_id']).first()
        user_config.work_time = int(request.form.get('work_time', user_config.work_time))
        user_config.short_break = int(request.form.get('short_break', user_config.short_break))
        user_config.long_break = int(request.form.get('long_break', user_config.long_break))
        user_config.pomodoros_until_long_break = int(request.form.get('pomodoros_until_long_break', user_config.pomodoros_until_long_break))
        user_config.music_enabled = 'music_enabled' in request.form
        db.session.commit()
        return redirect(url_for('index'))

    return redirect(url_for('index'))

@app.route('/api/config')
def get_config():
    if 'user_id' not in session:
        return jsonify({'error': 'Não autenticado'}), 401
    
    config = PomodoroConfig.query.filter_by(user_id=session['user_id']).first()
    return jsonify({
        'work_time': config.work_time,
        'short_break': config.short_break,
        'long_break': config.long_break,
        'pomodoros_until_long_break': config.pomodoros_until_long_break,
        'music_enabled': config.music_enabled
    })

@app.route('/api/session/start', methods=['POST'])
def start_session():
    if 'user_id' not in session:
        return jsonify({'error': 'Não autenticado'}), 401
    
    data = request.json or {}
    session_obj = PomodoroSession(
        user_id=session['user_id'],
        session_type=data.get('session_type'),
        duration=None
    )
    db.session.add(session_obj)
    db.session.commit()
    
    return jsonify({'session_id': session_obj.id})

@app.route('/api/session/complete/<int:session_id>', methods=['POST'])
def complete_session(session_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Não autenticado'}), 401
    
    session_obj = db.session.get(PomodoroSession, session_id)
    if session_obj and session_obj.user_id == session['user_id']:
            # permitir passar tempo parcial (em minutos) no corpo da requisição
        data = request.get_json(silent=True) or {}
        elapsed = data.get('elapsed_minutes')
        session_obj.end_time = datetime.now(timezone.utc)
        try:
            if elapsed is not None:
                # sessão parcial: gravar duração parcial e marcar como não-completa
                session_obj.duration = int(elapsed)
                session_obj.completed = False
            else:
                # sessão completa: calcular duração a partir dos timestamps
                if session_obj.start_time and session_obj.end_time:
                    # Garantir que ambos sejam offset-aware (SQLite retorna naive)
                    start = session_obj.start_time
                    end = session_obj.end_time
                    if start.tzinfo is None:
                        start = start.replace(tzinfo=timezone.utc)
                    if end.tzinfo is None:
                        end = end.replace(tzinfo=timezone.utc)
                    delta = end - start
                    session_obj.duration = int(delta.total_seconds() // 60)
                session_obj.completed = True
        except Exception:
            try:
                current_app.logger.exception("Erro ao processar finalização de sessão %s", session_id)
            except Exception:
                pass
        db.session.commit()
        return jsonify({'success': True})
    
    return jsonify({'error': 'Sessão não encontrada'}), 404

@app.route('/relatorio')
def relatorio():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    return redirect(url_for('index'))


@app.route('/api/config', methods=['POST'])
def save_config_api():
    if 'user_id' not in session:
        return jsonify({'error': 'Não autenticado'}), 401

    user_config = PomodoroConfig.query.filter_by(user_id=session['user_id']).first()
    data = request.get_json() or {}
    try:
        user_config.work_time = int(data.get('work_time', user_config.work_time))
        user_config.short_break = int(data.get('short_break', user_config.short_break))
        user_config.long_break = int(data.get('long_break', user_config.long_break))
        user_config.pomodoros_until_long_break = int(data.get('pomodoros_until_long_break', user_config.pomodoros_until_long_break))
        user_config.music_enabled = bool(data.get('music_enabled', user_config.music_enabled))
        db.session.commit()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': 'Falha ao salvar configurações', 'detail': str(e)}), 400


@app.route('/api/report')
def api_report():
    if 'user_id' not in session:
        return jsonify({'error': 'Não autenticado'}), 401
    sessions = PomodoroSession.query.filter(
        PomodoroSession.user_id == session['user_id'],
        PomodoroSession.session_type == 'work',
        PomodoroSession.duration != None
    ).order_by(PomodoroSession.start_time.desc()).all()

    sessions_data = [
        {
            'id': s.id,
            'start_time': s.start_time.isoformat() if s.start_time else None,
            'duration': s.duration,
            'completed': bool(s.completed)
        }
        for s in sessions
    ]

    # Total geral
    total_minutes = sum((s.duration or 0) for s in sessions)

    # Agregar por data (YYYY-MM-DD) para o frontend do modal
    # Suporte opcional para agrupamento por data local do usuário: o cliente pode enviar
    # `tz_offset` (em minutos, valor retornado por `new Date().getTimezoneOffset()`)
    # que é usado para converter as timestamps UTC para data local antes de agrupar.
    tz_offset = None
    try:
        tz_offset = request.args.get('tz_offset')
        if tz_offset is not None:
            tz_offset = int(tz_offset)
    except Exception:
        tz_offset = None

    def _date_key(dt):
        if not dt:
            return 'unknown'
        # Se dt é timezone-aware, converter para naive primeiro
        if dt.tzinfo is not None:
            dt = dt.replace(tzinfo=None)
        if tz_offset is None:
            return dt.date().isoformat()
        # t z_offset is minutes: UTC - local
        local_dt = dt - timedelta(minutes=tz_offset)
        return local_dt.date().isoformat()

    daily_map = {}
    for s in sessions:
        # Usar end_time quando disponível (momento em que a sessão foi registrada)
        ref_time = s.end_time or s.start_time
        if ref_time:
            date_key = _date_key(ref_time)
        else:
            date_key = 'unknown'

        daily_map.setdefault(date_key, []).append(s.duration or 0)

    daily_list = []
    for date_key, durations in daily_map.items():
        total = sum(durations) if durations else 0
        count = len(durations) if durations else 0

        daily_list.append({
            'date': date_key,
            'total_minutes': total,
            'sessions': count,
        })

    # Ordenar por data (desc)
    daily_list.sort(key=lambda x: x['date'], reverse=True)

    # Média geral por dia (média do tempo focado por dia)
    if len(daily_list) > 0:
        soma_por_dia = sum(d['total_minutes'] for d in daily_list)
        media_geral = int(round(float(soma_por_dia) / len(daily_list)))
    else:
        media_geral = 0

    # Calcular total e sessões completas para o dia local do usuário (se tz_offset fornecido)
    today_total = 0
    today_completed = 0
    try:
        now_utc = datetime.now(timezone.utc)
        if tz_offset is None:
            # considerar dia baseado em UTC por padrão
            local_today = now_utc.date()
            def _to_local_date(dt):
                if not dt:
                    return None
                if dt.tzinfo is not None:
                    dt = dt.replace(tzinfo=None)
                return dt.date()
        else:
            local_today = (now_utc - timedelta(minutes=tz_offset)).date()
            def _to_local_date(dt):
                if not dt:
                    return None
                if dt.tzinfo is not None:
                    dt = dt.replace(tzinfo=None)
                return (dt - timedelta(minutes=tz_offset)).date()

        for s in sessions:
            ref_time = s.end_time or s.start_time
            d = _to_local_date(ref_time)
            if d == local_today:
                today_total += (s.duration or 0)
                if s.completed:
                    today_completed += 1
    except Exception:
        today_total = 0
        today_completed = 0

    return jsonify({
        'sessions': sessions_data,
        'total_minutes': total_minutes,
        'daily': daily_list,
        'media_geral': media_geral,
        'today_total_minutes': today_total,
        'today_completed': today_completed
    })