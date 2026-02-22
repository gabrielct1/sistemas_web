# CSI606-2025-02 - Trabalho Final

## Aluno: Gabriel da Cunha Torres
## Matrícula: 23.1.8017

---

### Resumo

Este trabalho consiste no desenvolvimento de um sistema web baseado no método de estudos Pomodoro. A aplicação permite que o usuário se cadastre, faça login e utilize um timer configurável para ciclos de foco e descanso. O sistema conta também com música ambiente de fundo, relatório de sessões e uma interface minimalista, pensada para eliminar distrações durante o estudo.

---

### 1. Funcionalidades implementadas

- **Autenticação de usuários:** cadastro, login e logout.
- **Timer Pomodoro interativo:** contagem regressiva com suporte a ciclos de trabalho, pausa curta e pausa longa.
- **Configurações personalizadas:** o usuário pode definir a duração do tempo de foco, pausa curta e pausa longa. As configurações são salvas por usuário no banco de dados.
- **Música ambiente:** opção de ativar/desativar música lo-fi de fundo durante as sessões de estudo.
- **Relatório de estudos:** exibição na página principal (via modal) com total de minutos estudados, média diária, total do dia e histórico agrupado por data.
- **API REST:** endpoints JSON para leitura e salvamento de configurações (`/api/config`), início (`/api/session/start`) e finalização (`/api/session/complete/<id>`) de sessões, e geração de relatório (`/api/report`).

---

### 2. Funcionalidades previstas e não implementadas

De modo geral, tudo que foi proposto no escopo inicial foi implementado. A única exceção foi uma melhoria desejada no módulo de relatórios: havia interesse em torná-lo mais completo, com suporte a agregações mais detalhadas, uso de tags para categorizar sessões e outros recursos de análise, mas isso não foi realizado.

---

### 3. Outras funcionalidades implementadas

- **Sessões parciais:** quando o usuário interrompe um timer antes do fim, o tempo decorrido é registrado com `completed = False`, sem perder o progresso parcial. Progresso parcial não conta como sessão feita, apenas para tempo de foco.
- **Configuração automática padrão:** ao criar uma conta, um registro de configuração com os valores padrão do Pomodoro (25/5/15 minutos) é gerado automaticamente.

---

### 4. Principais desafios e dificuldades

- **Compatibilidade de datas:** o SQLite retorna datetimes sem informação de fuso horário, enquanto o Python utiliza objetos aware com `timezone.utc`. Foi necessário normalizar os dois formatos antes de realizar cálculos de duração.
- **Registro de sessões parciais:** modelar o fluxo de início/fim de sessão de forma que sessões interrompidas também fossem salvas exigiu ajustes no modelo e na lógica de finalização.
- **Precisão do timer:** o tempo no frontend era controlado via `setInterval`, que não é preciso — uma sessão de 25 minutos podia durar mais do que 25 minutos reais.

---

### 5. Instruções para instalação e execução

**Pré-requisitos:** Python 3.8+ instalado.

```bash
# 1. Clone o repositório ou acesse a pasta do projeto
cd sistemas_web

# 2. Instale as dependências
pip install flask flask-sqlalchemy werkzeug

# 3. Execute a aplicação
python3 main.py
```

Acesse em: [http://127.0.0.1:5000](http://127.0.0.1:5000)

O banco de dados SQLite (`pomodoro.db`) é criado automaticamente na pasta `instance/` na primeira execução.

---

### 6. Referências

- [Flask – Documentação oficial](https://flask.palletsprojects.com/)
- [Flask-SQLAlchemy – Documentação oficial](https://flask-sqlalchemy.palletsprojects.com/)
- [Werkzeug – Utilitários de segurança](https://werkzeug.palletsprojects.com/)
- [Técnica Pomodoro – Wikipedia](https://pt.wikipedia.org/wiki/T%C3%A9cnica_Pomodoro)
- [Lofi Girl – Referência de música ambiente](https://lofigirl.com/)
