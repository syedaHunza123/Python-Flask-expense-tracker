"""
Expense Tracker Web Application
Backend: Python Flask + SQLite
Theme: Clean White & Light Blue Financial Dashboard
Currency: Pakistani Rupee (PKR - Rs.)
"""

import os
import sqlite3
import csv
import io
from datetime import datetime, date, timedelta
from flask import Flask, render_template, request, jsonify, redirect, url_for, Response, send_file

# Initialize Flask application
app = Flask(__name__)
app.secret_key = os.urandom(24)

# Database configuration
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DB_PATH = os.path.join(BASE_DIR, 'database.db')

EXPENSE_CATEGORIES = [
    'Food',
    'Shopping',
    'Transport',
    'Education',
    'Bills',
    'Health',
    'Entertainment',
    'Other'
]

INCOME_CATEGORIES = [
    'Salary',
    'Freelance',
    'Business',
    'Investments',
    'Allowance',
    'Gifts',
    'Other'
]


def get_db_connection():
    """Create and return a database connection with row access by column name."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    # Enable foreign keys
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """Initialize database tables for transactions and budgets."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Create Transactions Table (stores both Income and Expenses)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
            category TEXT NOT NULL,
            amount REAL NOT NULL CHECK(amount > 0),
            description TEXT,
            date TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Create Budgets Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS budgets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL,
            amount REAL NOT NULL CHECK(amount > 0),
            month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
            year INTEGER NOT NULL CHECK(year >= 2000),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(category, month, year)
        )
    """)

    # Create indexes for optimal query performance
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_trans_date ON transactions(date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_trans_type ON transactions(type)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_trans_cat ON transactions(category)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_budget_m_y ON budgets(month, year)")

    conn.commit()
    conn.close()


# Ensure DB is created at startup
init_db()


# Jinja Template Filters
@app.template_filter('pkr')
def format_pkr(value):
    """Format numeric value as PKR currency (e.g., Rs. 25,000.00)."""
    try:
        val = float(value or 0)
        return f"Rs. {val:,.2f}"
    except (ValueError, TypeError):
        return "Rs. 0.00"


@app.template_filter('pkr_short')
def format_pkr_short(value):
    """Format numeric value as compact PKR without decimals if whole."""
    try:
        val = float(value or 0)
        if val.is_integer():
            return f"Rs. {int(val):,}"
        return f"Rs. {val:,.2f}"
    except (ValueError, TypeError):
        return "Rs. 0"


# Context Processor to pass active date & categories to all templates
@app.context_processor
def inject_global_data():
    today = date.today()
    return {
        'current_year': today.year,
        'current_month': today.month,
        'today_date': today.strftime('%Y-%m-%d'),
        'expense_categories': EXPENSE_CATEGORIES,
        'income_categories': INCOME_CATEGORIES
    }


# ==========================================
# PAGE ROUTES
# ==========================================

@app.route('/')
def index():
    """Render the landing / overview page."""
    return render_template('index.html', active_page='home')


@app.route('/dashboard')
def dashboard_page():
    """Render the main Financial Dashboard."""
    return render_template('dashboard.html', active_page='dashboard')


@app.route('/transactions')
def transactions_page():
    """Render the Transaction Management page."""
    return render_template('transactions.html', active_page='transactions')


@app.route('/budget')
def budget_page():
    """Render the Budget Management page."""
    return render_template('budget.html', active_page='budget')


@app.route('/reports')
def reports_page():
    """Render the Reports and Analytics page."""
    return render_template('reports.html', active_page='reports')


# ==========================================
# REST API ENDPOINTS
# ==========================================

# 1. DASHBOARD SUMMARY API
@app.route('/api/dashboard-summary', methods=['GET'])
def get_dashboard_summary():
    """
    Returns high-level statistics, current month summary,
    income vs expenses trend, recent transactions, and category breakdown.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    today = date.today()
    current_year = today.year
    current_month = today.month
    month_str = f"{current_year}-{current_month:02d}"

    # Overall Totals (All-time)
    cursor.execute("""
        SELECT 
            COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS total_income,
            COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS total_expense
        FROM transactions
    """)
    overall = cursor.fetchone()
    total_income = float(overall['total_income'])
    total_expenses = float(overall['total_expense'])
    total_balance = total_income - total_expenses

    # Current Month Totals
    cursor.execute("""
        SELECT 
            COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS month_income,
            COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS month_expense
        FROM transactions
        WHERE strftime('%Y-%m', date) = ?
    """, (month_str,))
    month_data = cursor.fetchone()
    month_income = float(month_data['month_income'])
    month_expense = float(month_data['month_expense'])
    month_savings = month_income - month_expense
    savings_rate = (month_savings / month_income * 100) if month_income > 0 else 0

    # Monthly Trend (Past 6 Months)
    # Generate labels for past 6 months
    monthly_trend = []
    for i in range(5, -1, -1):
        # Calculate year and month for offset
        d = today.replace(day=1) - timedelta(days=i * 28)
        # normalize to first of that month
        target_year = d.year
        target_month = d.month
        target_key = f"{target_year}-{target_month:02d}"
        target_label = datetime(target_year, target_month, 1).strftime('%b %Y')

        cursor.execute("""
            SELECT 
                COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS inc,
                COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS exp
            FROM transactions
            WHERE strftime('%Y-%m', date) = ?
        """, (target_key,))
        row = cursor.fetchone()
        monthly_trend.append({
            'period': target_key,
            'label': target_label,
            'income': float(row['inc']),
            'expense': float(row['exp'])
        })

    # Expense Breakdown by Category for Current Month
    cursor.execute("""
        SELECT category, COALESCE(SUM(amount), 0) as total
        FROM transactions
        WHERE type = 'expense' AND strftime('%Y-%m', date) = ?
        GROUP BY category
        ORDER BY total DESC
    """, (month_str,))
    cat_rows = cursor.fetchall()
    categories_breakdown = [{'category': row['category'], 'total': float(row['total'])} for row in cat_rows]

    # If no expenses this month, fetch all-time expense breakdown for preview
    if not categories_breakdown:
        cursor.execute("""
            SELECT category, COALESCE(SUM(amount), 0) as total
            FROM transactions
            WHERE type = 'expense'
            GROUP BY category
            ORDER BY total DESC
        """)
        categories_breakdown = [{'category': row['category'], 'total': float(row['total'])} for row in cursor.fetchall()]

    # Recent Transactions (Last 8)
    cursor.execute("""
        SELECT id, type, category, amount, description, date 
        FROM transactions 
        ORDER BY date DESC, id DESC 
        LIMIT 8
    """)
    recent = [dict(row) for row in cursor.fetchall()]

    # Current Month Budget Overview
    cursor.execute("""
        SELECT COALESCE(SUM(amount), 0) as total_budget
        FROM budgets
        WHERE month = ? AND year = ?
    """, (current_month, current_year))
    b_row = cursor.fetchone()
    current_month_budget = float(b_row['total_budget'])

    budget_remaining = current_month_budget - month_expense if current_month_budget > 0 else 0
    budget_usage_percent = (month_expense / current_month_budget * 100) if current_month_budget > 0 else 0

    conn.close()

    return jsonify({
        'status': 'success',
        'data': {
            'total_balance': total_balance,
            'total_income': total_income,
            'total_expenses': total_expenses,
            'month_income': month_income,
            'month_expense': month_expense,
            'month_savings': month_savings,
            'savings_rate': round(savings_rate, 1),
            'current_month_budget': current_month_budget,
            'budget_remaining': budget_remaining,
            'budget_usage_percent': round(budget_usage_percent, 1),
            'monthly_trend': monthly_trend,
            'category_breakdown': categories_breakdown,
            'recent_transactions': recent
        }
    })


# 2. TRANSACTIONS CRUD API
@app.route('/api/transactions', methods=['GET'])
def get_transactions():
    """
    Get transactions with search, filters (type, category, date range), and sorting.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    type_filter = request.args.get('type', '').strip()
    category_filter = request.args.get('category', '').strip()
    search = request.args.get('search', '').strip()
    start_date = request.args.get('start_date', '').strip()
    end_date = request.args.get('end_date', '').strip()
    sort_by = request.args.get('sort_by', 'date_desc').strip()

    query = "SELECT id, type, category, amount, description, date, created_at FROM transactions WHERE 1=1"
    params = []

    if type_filter and type_filter in ('income', 'expense'):
        query += " AND type = ?"
        params.append(type_filter)

    if category_filter:
        query += " AND category = ?"
        params.append(category_filter)

    if search:
        query += " AND (description LIKE ? OR category LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%"])

    if start_date:
        query += " AND date >= ?"
        params.append(start_date)

    if end_date:
        query += " AND date <= ?"
        params.append(end_date)

    # Sorting
    sort_clauses = {
        'date_desc': 'ORDER BY date DESC, id DESC',
        'date_asc': 'ORDER BY date ASC, id ASC',
        'amount_desc': 'ORDER BY amount DESC, date DESC',
        'amount_asc': 'ORDER BY amount ASC, date DESC'
    }
    query += " " + sort_clauses.get(sort_by, 'ORDER BY date DESC, id DESC')

    cursor.execute(query, params)
    rows = cursor.fetchall()
    transactions = [dict(row) for row in rows]

    # Calculate filtered summary metrics
    total_income = sum(t['amount'] for t in transactions if t['type'] == 'income')
    total_expense = sum(t['amount'] for t in transactions if t['type'] == 'expense')
    net_balance = total_income - total_expense

    conn.close()

    return jsonify({
        'status': 'success',
        'count': len(transactions),
        'summary': {
            'total_income': total_income,
            'total_expense': total_expense,
            'net_balance': net_balance
        },
        'transactions': transactions
    })


@app.route('/api/transactions', methods=['POST'])
def add_transaction():
    """Add a new income or expense transaction."""
    data = request.get_json() or request.form

    trans_type = data.get('type', '').strip().lower()
    category = data.get('category', '').strip()
    amount_str = data.get('amount')
    description = data.get('description', '').strip()
    trans_date = data.get('date', '').strip()

    # Validations
    if trans_type not in ('income', 'expense'):
        return jsonify({'status': 'error', 'message': 'Type must be either income or expense.'}), 400

    if not category:
        return jsonify({'status': 'error', 'message': 'Category is required.'}), 400

    try:
        amount = float(amount_str)
        if amount <= 0:
            raise ValueError()
    except (TypeError, ValueError):
        return jsonify({'status': 'error', 'message': 'Please enter a valid positive amount.'}), 400

    if not trans_date:
        trans_date = date.today().strftime('%Y-%m-%d')
    else:
        try:
            datetime.strptime(trans_date, '%Y-%m-%d')
        except ValueError:
            return jsonify({'status': 'error', 'message': 'Date must be formatted as YYYY-MM-DD.'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO transactions (type, category, amount, description, date)
        VALUES (?, ?, ?, ?, ?)
    """, (trans_type, category, amount, description, trans_date))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()

    return jsonify({
        'status': 'success',
        'message': f"{trans_type.capitalize()} of Rs. {amount:,.2f} added successfully!",
        'id': new_id
    }), 201


@app.route('/api/transactions/<int:trans_id>', methods=['GET'])
def get_single_transaction(trans_id):
    """Retrieve details of a single transaction."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, type, category, amount, description, date FROM transactions WHERE id = ?", (trans_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        return jsonify({'status': 'error', 'message': 'Transaction not found.'}), 404

    return jsonify({'status': 'success', 'transaction': dict(row)})


@app.route('/api/transactions/<int:trans_id>', methods=['PUT', 'POST'])
def update_transaction(trans_id):
    """Update an existing transaction."""
    data = request.get_json() or request.form

    trans_type = data.get('type', '').strip().lower()
    category = data.get('category', '').strip()
    amount_str = data.get('amount')
    description = data.get('description', '').strip()
    trans_date = data.get('date', '').strip()

    if trans_type not in ('income', 'expense'):
        return jsonify({'status': 'error', 'message': 'Type must be either income or expense.'}), 400

    if not category:
        return jsonify({'status': 'error', 'message': 'Category is required.'}), 400

    try:
        amount = float(amount_str)
        if amount <= 0:
            raise ValueError()
    except (TypeError, ValueError):
        return jsonify({'status': 'error', 'message': 'Please enter a valid positive amount.'}), 400

    if not trans_date:
        return jsonify({'status': 'error', 'message': 'Date is required.'}), 400
    try:
        datetime.strptime(trans_date, '%Y-%m-%d')
    except ValueError:
        return jsonify({'status': 'error', 'message': 'Invalid date format.'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE transactions
        SET type = ?, category = ?, amount = ?, description = ?, date = ?
        WHERE id = ?
    """, (trans_type, category, amount, description, trans_date, trans_id))
    rows_affected = cursor.rowcount
    conn.commit()
    conn.close()

    if rows_affected == 0:
        return jsonify({'status': 'error', 'message': 'Transaction not found.'}), 404

    return jsonify({'status': 'success', 'message': 'Transaction updated successfully!'})


@app.route('/api/transactions/<int:trans_id>', methods=['DELETE'])
@app.route('/api/transactions/<int:trans_id>/delete', methods=['POST'])
def delete_transaction(trans_id):
    """Delete a transaction."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM transactions WHERE id = ?", (trans_id,))
    rows_affected = cursor.rowcount
    conn.commit()
    conn.close()

    if rows_affected == 0:
        return jsonify({'status': 'error', 'message': 'Transaction not found.'}), 404

    return jsonify({'status': 'success', 'message': 'Transaction deleted successfully!'})


# 3. BUDGET MANAGEMENT API
@app.route('/api/budgets', methods=['GET'])
def get_budgets():
    """
    Get budgets for specified month and year, alongside actual spend, remaining balance,
    percentage utilized, and warning flags.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        month = int(request.args.get('month', date.today().month))
        year = int(request.args.get('year', date.today().year))
    except ValueError:
        month = date.today().month
        year = date.today().year

    month_str = f"{year}-{month:02d}"

    # Fetch all budgets set for this month and year
    cursor.execute("""
        SELECT id, category, amount, month, year 
        FROM budgets 
        WHERE month = ? AND year = ?
        ORDER BY category ASC
    """, (month, year))
    budget_rows = cursor.fetchall()
    budgets_dict = {row['category']: {'id': row['id'], 'amount': float(row['amount'])} for row in budget_rows}

    # Fetch actual expenses for this month grouped by category
    cursor.execute("""
        SELECT category, COALESCE(SUM(amount), 0) as spent
        FROM transactions
        WHERE type = 'expense' AND strftime('%Y-%m', date) = ?
        GROUP BY category
    """, (month_str,))
    spend_rows = cursor.fetchall()
    spend_dict = {row['category']: float(row['spent']) for row in spend_rows}

    # Total month spending across all categories
    total_spent_month = sum(spend_dict.values())

    # Build response per category
    category_budgets = []
    total_budgeted = 0.0

    for cat in EXPENSE_CATEGORIES:
        budget_info = budgets_dict.get(cat, None)
        budget_amt = budget_info['amount'] if budget_info else 0.0
        budget_id = budget_info['id'] if budget_info else None
        spent_amt = spend_dict.get(cat, 0.0)
        remaining = budget_amt - spent_amt if budget_amt > 0 else -spent_amt
        percentage = (spent_amt / budget_amt * 100) if budget_amt > 0 else 0.0

        if budget_amt > 0:
            total_budgeted += budget_amt
            if spent_amt > budget_amt:
                status = 'exceeded'
            elif percentage >= 85:
                status = 'warning'
            else:
                status = 'normal'
        else:
            status = 'unbudgeted' if spent_amt > 0 else 'none'

        category_budgets.append({
            'id': budget_id,
            'category': cat,
            'budget_amount': budget_amt,
            'spent_amount': spent_amt,
            'remaining_amount': remaining,
            'percentage': round(percentage, 1),
            'status': status
        })

    # Overall Monthly Budget Summary
    total_remaining = total_budgeted - total_spent_month if total_budgeted > 0 else 0
    total_percentage = (total_spent_month / total_budgeted * 100) if total_budgeted > 0 else 0

    conn.close()

    return jsonify({
        'status': 'success',
        'month': month,
        'year': year,
        'month_name': datetime(year, month, 1).strftime('%B %Y'),
        'summary': {
            'total_budgeted': total_budgeted,
            'total_spent': total_spent_month,
            'total_remaining': total_remaining,
            'total_percentage': round(total_percentage, 1),
            'status': 'exceeded' if (total_budgeted > 0 and total_spent_month > total_budgeted) else ('warning' if total_percentage >= 85 else 'normal')
        },
        'budgets': category_budgets
    })


@app.route('/api/budgets', methods=['POST'])
def save_budget():
    """Create or update a category budget for a specific month and year."""
    data = request.get_json() or request.form

    category = data.get('category', '').strip()
    amount_str = data.get('amount')
    month_str = data.get('month')
    year_str = data.get('year')

    if not category or category not in EXPENSE_CATEGORIES:
        return jsonify({'status': 'error', 'message': 'Please select a valid expense category.'}), 400

    try:
        amount = float(amount_str)
        if amount <= 0:
            raise ValueError()
    except (TypeError, ValueError):
        return jsonify({'status': 'error', 'message': 'Please enter a valid positive budget amount.'}), 400

    try:
        month = int(month_str) if month_str else date.today().month
        year = int(year_str) if year_str else date.today().year
        if not (1 <= month <= 12) or year < 2000:
            raise ValueError()
    except (TypeError, ValueError):
        return jsonify({'status': 'error', 'message': 'Invalid month or year.'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    # Insert or replace budget entry
    cursor.execute("""
        INSERT INTO budgets (category, amount, month, year)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(category, month, year) DO UPDATE SET
            amount = excluded.amount,
            created_at = CURRENT_TIMESTAMP
    """, (category, amount, month, year))

    conn.commit()
    conn.close()

    return jsonify({
        'status': 'success',
        'message': f"Budget for {category} set to Rs. {amount:,.2f} for {datetime(year, month, 1).strftime('%B %Y')}!"
    })


@app.route('/api/budgets/<int:budget_id>', methods=['DELETE'])
def delete_budget(budget_id):
    """Delete a budget entry."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM budgets WHERE id = ?", (budget_id,))
    rows_affected = cursor.rowcount
    conn.commit()
    conn.close()

    if rows_affected == 0:
        return jsonify({'status': 'error', 'message': 'Budget record not found.'}), 404

    return jsonify({'status': 'success', 'message': 'Budget deleted successfully.'})


# 4. REPORTS & ANALYTICS API
@app.route('/api/reports', methods=['GET'])
def get_reports_data():
    """
    Generate detailed analytics and report data for:
    - Daily (past 30 days)
    - Weekly (past 12 weeks)
    - Monthly (all months of selected year)
    - Yearly (past 5 years)
    """
    timeframe = request.args.get('timeframe', 'monthly').strip().lower()
    selected_year = request.args.get('year', date.today().year, type=int)
    selected_month = request.args.get('month', date.today().month, type=int)

    conn = get_db_connection()
    cursor = conn.cursor()

    chart_labels = []
    income_dataset = []
    expense_dataset = []

    if timeframe == 'daily':
        # Last 30 days daily report
        today = date.today()
        start_date = today - timedelta(days=29)

        cursor.execute("""
            SELECT 
                date,
                COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
                COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expense
            FROM transactions
            WHERE date >= ? AND date <= ?
            GROUP BY date
            ORDER BY date ASC
        """, (start_date.strftime('%Y-%m-%d'), today.strftime('%Y-%m-%d')))
        data_map = {row['date']: row for row in cursor.fetchall()}

        curr = start_date
        while curr <= today:
            d_str = curr.strftime('%Y-%m-%d')
            lbl = curr.strftime('%d %b')
            row = data_map.get(d_str)
            chart_labels.append(lbl)
            income_dataset.append(float(row['income']) if row else 0.0)
            expense_dataset.append(float(row['expense']) if row else 0.0)
            curr += timedelta(days=1)

        summary_clause = "WHERE date >= ? AND date <= ?"
        summary_params = (start_date.strftime('%Y-%m-%d'), today.strftime('%Y-%m-%d'))

    elif timeframe == 'weekly':
        # Last 8 weeks
        today = date.today()
        start_date = today - timedelta(weeks=8)

        cursor.execute("""
            SELECT 
                strftime('%Y-W%W', date) as week_num,
                MIN(date) as week_start,
                COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
                COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expense
            FROM transactions
            WHERE date >= ? AND date <= ?
            GROUP BY week_num
            ORDER BY week_num ASC
        """, (start_date.strftime('%Y-%m-%d'), today.strftime('%Y-%m-%d')))
        rows = cursor.fetchall()

        for r in rows:
            chart_labels.append(f"Week {r['week_num'].split('-W')[-1]} ({datetime.strptime(r['week_start'], '%Y-%m-%d').strftime('%b %d')})")
            income_dataset.append(float(r['income']))
            expense_dataset.append(float(r['expense']))

        summary_clause = "WHERE date >= ? AND date <= ?"
        summary_params = (start_date.strftime('%Y-%m-%d'), today.strftime('%Y-%m-%d'))

    elif timeframe == 'yearly':
        # Past 5 years
        current_y = date.today().year
        start_y = current_y - 4

        cursor.execute("""
            SELECT 
                strftime('%Y', date) as yr,
                COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
                COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expense
            FROM transactions
            WHERE CAST(strftime('%Y', date) AS INTEGER) BETWEEN ? AND ?
            GROUP BY yr
            ORDER BY yr ASC
        """, (start_y, current_y))
        data_map = {int(row['yr']): row for row in cursor.fetchall()}

        for y in range(start_y, current_y + 1):
            chart_labels.append(str(y))
            row = data_map.get(y)
            income_dataset.append(float(row['income']) if row else 0.0)
            expense_dataset.append(float(row['expense']) if row else 0.0)

        summary_clause = "WHERE CAST(strftime('%Y', date) AS INTEGER) BETWEEN ? AND ?"
        summary_params = (start_y, current_y)

    else:
        # Default: Monthly for selected year (12 months: Jan - Dec)
        cursor.execute("""
            SELECT 
                strftime('%m', date) as mo,
                COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
                COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expense
            FROM transactions
            WHERE strftime('%Y', date) = ?
            GROUP BY mo
            ORDER BY mo ASC
        """, (str(selected_year),))
        data_map = {int(row['mo']): row for row in cursor.fetchall()}

        for m in range(1, 13):
            month_name = datetime(selected_year, m, 1).strftime('%b')
            chart_labels.append(month_name)
            row = data_map.get(m)
            income_dataset.append(float(row['income']) if row else 0.0)
            expense_dataset.append(float(row['expense']) if row else 0.0)

        summary_clause = "WHERE strftime('%Y', date) = ?"
        summary_params = (str(selected_year),)

    # Category Breakdown for this specific report timeframe
    cursor.execute(f"""
        SELECT 
            category, 
            COALESCE(SUM(amount), 0) as total,
            COUNT(*) as tx_count
        FROM transactions
        {summary_clause} AND type = 'expense'
        GROUP BY category
        ORDER BY total DESC
    """, summary_params)
    cat_rows = cursor.fetchall()
    category_analysis = [
        {'category': r['category'], 'total': float(r['total']), 'count': int(r['tx_count'])}
        for r in cat_rows
    ]

    # Category breakdown for Income
    cursor.execute(f"""
        SELECT 
            category, 
            COALESCE(SUM(amount), 0) as total,
            COUNT(*) as tx_count
        FROM transactions
        {summary_clause} AND type = 'income'
        GROUP BY category
        ORDER BY total DESC
    """, summary_params)
    income_cat_rows = cursor.fetchall()
    income_category_analysis = [
        {'category': r['category'], 'total': float(r['total']), 'count': int(r['tx_count'])}
        for r in income_cat_rows
    ]

    total_period_income = sum(income_dataset)
    total_period_expense = sum(expense_dataset)
    net_period_savings = total_period_income - total_period_expense
    savings_rate = (net_period_savings / total_period_income * 100) if total_period_income > 0 else 0

    top_expense_category = category_analysis[0]['category'] if category_analysis else 'None'
    top_expense_amount = category_analysis[0]['total'] if category_analysis else 0.0

    conn.close()

    return jsonify({
        'status': 'success',
        'timeframe': timeframe,
        'summary': {
            'total_income': total_period_income,
            'total_expense': total_period_expense,
            'net_savings': net_period_savings,
            'savings_rate': round(savings_rate, 1),
            'top_expense_category': top_expense_category,
            'top_expense_amount': top_expense_amount
        },
        'chart': {
            'labels': chart_labels,
            'income': income_dataset,
            'expense': expense_dataset
        },
        'category_analysis': category_analysis,
        'income_category_analysis': income_category_analysis
    })


# 5. CSV EXPORT ENDPOINT
@app.route('/api/export-csv')
def export_csv():
    """Export all transactions or filtered transactions to CSV file."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT date, type, category, description, amount 
        FROM transactions 
        ORDER BY date DESC, id DESC
    """)
    rows = cursor.fetchall()
    conn.close()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['Date', 'Type', 'Category', 'Description', 'Amount (PKR)'])

    for row in rows:
        writer.writerow([
            row['date'],
            row['type'].capitalize(),
            row['category'],
            row['description'] or '',
            f"{row['amount']:.2f}"
        ])

    output.seek(0)
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment;filename=expense_tracker_export_{date.today().strftime('%Y%m%d')}.csv"}
    )


if __name__ == '__main__':
    # Run the server on port 5000 with debug mode enabled for local development
    print("=" * 60)
    print("  Expense Tracker Web Application running!")
    print("  Access dashboard at: http://127.0.0.1:5000")
    print("=" * 60)
    app.run(host='0.0.0.0', port=5000, debug=True)
