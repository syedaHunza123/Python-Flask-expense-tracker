/**
 * FinTrack - Expense Tracker Web Application
 * Frontend JavaScript: API Integration, Chart.js Visualizations, Modals, Forms & Toasts
 * Currency: Pakistani Rupee (PKR - Rs.)
 */

// Category and Icon Configuration
const CATEGORY_CONFIG = {
    expense: {
        'Food': { icon: 'fa-utensils', color: '#f97316' },
        'Shopping': { icon: 'fa-bag-shopping', color: '#ec4899' },
        'Transport': { icon: 'fa-car', color: '#0ea5e9' },
        'Education': { icon: 'fa-graduation-cap', color: '#8b5cf6' },
        'Bills': { icon: 'fa-bolt', color: '#eab308' },
        'Health': { icon: 'fa-heart-pulse', color: '#ef4444' },
        'Entertainment': { icon: 'fa-film', color: '#06b6d4' },
        'Other': { icon: 'fa-tags', color: '#64748b' }
    },
    income: {
        'Salary': { icon: 'fa-money-bill-wave', color: '#10b981' },
        'Freelance': { icon: 'fa-laptop-code', color: '#0284c7' },
        'Business': { icon: 'fa-briefcase', color: '#3b82f6' },
        'Investments': { icon: 'fa-arrow-trend-up', color: '#8b5cf6' },
        'Allowance': { icon: 'fa-hand-holding-dollar', color: '#14b8a6' },
        'Gifts': { icon: 'fa-gift', color: '#f43f5e' },
        'Other': { icon: 'fa-receipt', color: '#64748b' }
    }
};

// Palettes for Charts
const CHART_COLORS = [
    '#0284c7', '#10b981', '#f59e0b', '#ef4444', 
    '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', 
    '#f97316', '#64748b'
];

// Global Chart References to prevent memory leak / duplicate renders
let dashTrendChartInstance = null;
let dashDonutChartInstance = null;
let reportsTrendChartInstance = null;
let reportsExpDonutInstance = null;
let reportsIncDonutInstance = null;

// Global state for pending delete action
let pendingDeleteId = null;
let pendingDeleteType = 'transaction'; // 'transaction' or 'budget'


/* ========================================================
   CURRENCY & DATE FORMATTING
   ======================================================== */

/**
 * Format any number as PKR currency (Rs. X,XXX.XX)
 */
function formatPKR(val, withDecimals = true) {
    if (val === null || val === undefined || isNaN(val)) return 'Rs. 0.00';
    const num = Number(val);
    const options = {
        minimumFractionDigits: withDecimals ? 2 : 0,
        maximumFractionDigits: withDecimals ? 2 : 0
    };
    return 'Rs. ' + num.toLocaleString('en-PK', options);
}

/**
 * Format YYYY-MM-DD date string into human friendly format (e.g. 15 Oct, 2026)
 */
function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        }
        return dateStr;
    } catch (e) {
        return dateStr;
    }
}


/* ========================================================
   TOAST NOTIFICATION SYSTEM
   ======================================================== */

function showToast(type, title, message, duration = 4000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconClass = 'fa-circle-info';
    if (type === 'success') iconClass = 'fa-circle-check';
    if (type === 'error') iconClass = 'fa-circle-xmark';
    if (type === 'warning') iconClass = 'fa-triangle-exclamation';

    toast.innerHTML = `
        <div class="toast-icon"><i class="fa-solid ${iconClass}"></i></div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()" aria-label="Close notification">
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(50px)';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}


/* ========================================================
   MODAL WINDOW CONTROLS
   ======================================================== */

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = '';
    }
}

// Close modals when clicking backdrop or pressing Escape
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal-backdrop')) {
        closeModal(e.target.id);
    }
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop.show').forEach(m => closeModal(m.id));
    }
});


/* ========================================================
   TRANSACTION MODAL & CRUD
   ======================================================== */

/**
 * Open Modal to Add a new transaction (Income or Expense)
 */
function openAddModal(type = 'expense') {
    const form = document.getElementById('transactionForm');
    if (form) form.reset();

    document.getElementById('transId').value = '';
    document.getElementById('transactionModalTitle').textContent = `Add New ${type === 'income' ? 'Income' : 'Expense'}`;
    document.getElementById('saveTransBtnText').textContent = 'Save Transaction';

    // Set Type radio
    if (type === 'income') {
        document.getElementById('typeIncome').checked = true;
    } else {
        document.getElementById('typeExpense').checked = true;
    }

    // Set Today's Date
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('transDate').value = today;

    // Populate categories
    handleTypeChange(type);

    openModal('transactionModal');
}

/**
 * Handle type switch in modal: updates category select options and icon
 */
function handleTypeChange(selectedType) {
    const categorySelect = document.getElementById('transCategory');
    if (!categorySelect) return;

    categorySelect.innerHTML = '';
    const categories = CATEGORY_CONFIG[selectedType] || {};

    Object.keys(categories).forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        categorySelect.appendChild(opt);
    });

    const iconBadge = document.getElementById('modalTypeIcon');
    if (iconBadge) {
        if (selectedType === 'income') {
            iconBadge.style.background = 'linear-gradient(135deg, #d1fae5, #a7f3d0)';
            iconBadge.style.color = 'var(--color-success)';
            iconBadge.innerHTML = '<i class="fa-solid fa-arrow-trend-up"></i>';
        } else {
            iconBadge.style.background = 'linear-gradient(135deg, #fee2e2, #fecaca)';
            iconBadge.style.color = 'var(--color-danger)';
            iconBadge.innerHTML = '<i class="fa-solid fa-arrow-trend-down"></i>';
        }
    }
}

/**
 * Open Modal to Edit an existing transaction
 */
async function openEditModal(transId) {
    try {
        const response = await fetch(`/api/transactions/${transId}`);
        const result = await response.json();

        if (result.status !== 'success') {
            showToast('error', 'Error', result.message || 'Transaction could not be retrieved.');
            return;
        }

        const trans = result.transaction;
        document.getElementById('transId').value = trans.id;
        document.getElementById('transactionModalTitle').textContent = 'Edit Transaction';
        document.getElementById('saveTransBtnText').textContent = 'Update Transaction';

        if (trans.type === 'income') {
            document.getElementById('typeIncome').checked = true;
        } else {
            document.getElementById('typeExpense').checked = true;
        }

        handleTypeChange(trans.type);

        document.getElementById('transAmount').value = trans.amount;
        document.getElementById('transCategory').value = trans.category;
        document.getElementById('transDate').value = trans.date;
        document.getElementById('transDesc').value = trans.description || '';

        openModal('transactionModal');
    } catch (err) {
        showToast('error', 'Network Error', 'Failed to communicate with backend.');
    }
}

/**
 * Handle Transaction Form Submit (Add or Update)
 */
async function handleTransactionSubmit(event) {
    event.preventDefault();

    const saveBtn = document.getElementById('saveTransBtn');
    saveBtn.disabled = true;

    const transId = document.getElementById('transId').value;
    const isEdit = Boolean(transId);

    const type = document.querySelector('input[name="transType"]:checked').value;
    const category = document.getElementById('transCategory').value;
    const amount = parseFloat(document.getElementById('transAmount').value);
    const date = document.getElementById('transDate').value;
    const description = document.getElementById('transDesc').value.trim();

    // Validation
    if (!amount || amount <= 0) {
        showToast('error', 'Validation Error', 'Please enter a valid positive amount in PKR.');
        saveBtn.disabled = false;
        return;
    }
    if (!category) {
        showToast('error', 'Validation Error', 'Please choose a category.');
        saveBtn.disabled = false;
        return;
    }
    if (!date) {
        showToast('error', 'Validation Error', 'Please select a date.');
        saveBtn.disabled = false;
        return;
    }

    const payload = { type, category, amount, date, description };

    try {
        const url = isEdit ? `/api/transactions/${transId}` : '/api/transactions';
        const method = isEdit ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const resData = await response.json();

        if (response.ok && resData.status === 'success') {
            closeModal('transactionModal');
            showToast('success', isEdit ? 'Updated!' : 'Success!', resData.message);

            // Dynamically refresh active page
            if (typeof initDashboard === 'function' && document.getElementById('totalBalanceVal')) {
                initDashboard();
            }
            if (typeof loadTransactionsTable === 'function' && document.getElementById('transactionsTable')) {
                loadTransactionsTable();
            }
            if (typeof loadBudgetsData === 'function' && document.getElementById('categoryBudgetsContainer')) {
                loadBudgetsData();
            }
            if (typeof loadReportsData === 'function' && document.getElementById('reportsTrendChart')) {
                loadReportsData();
            }
        } else {
            showToast('error', 'Submission Failed', resData.message || 'Check your input.');
        }
    } catch (err) {
        showToast('error', 'Server Error', 'Failed to save transaction.');
    } finally {
        saveBtn.disabled = false;
    }
}

/**
 * Prompt Confirmation Modal Before Deleting
 */
function promptDeleteTransaction(id, desc, amount) {
    pendingDeleteId = id;
    pendingDeleteType = 'transaction';

    const msg = document.getElementById('deleteConfirmMessage');
    msg.textContent = `Are you sure you want to permanently delete this transaction (${desc || 'No description'}) of ${formatPKR(amount)}?`;

    openModal('deleteConfirmModal');
}

/**
 * Execute Confirmed Delete
 */
document.getElementById('confirmDeleteBtn')?.addEventListener('click', async function() {
    if (!pendingDeleteId) return;

    this.disabled = true;

    try {
        let url = '';
        if (pendingDeleteType === 'transaction') {
            url = `/api/transactions/${pendingDeleteId}`;
        } else if (pendingDeleteType === 'budget') {
            url = `/api/budgets/${pendingDeleteId}`;
        }

        const response = await fetch(url, { method: 'DELETE' });
        const data = await response.json();

        closeModal('deleteConfirmModal');

        if (response.ok && data.status === 'success') {
            showToast('success', 'Deleted!', data.message);

            if (document.getElementById('totalBalanceVal')) initDashboard();
            if (document.getElementById('transactionsTable')) loadTransactionsTable();
            if (document.getElementById('categoryBudgetsContainer')) loadBudgetsData();
            if (document.getElementById('reportsTrendChart')) loadReportsData();
        } else {
            showToast('error', 'Delete Failed', data.message);
        }
    } catch (err) {
        showToast('error', 'Error', 'Failed to communicate with database.');
    } finally {
        this.disabled = false;
        pendingDeleteId = null;
    }
});


/* ========================================================
   BUDGET MANAGEMENT
   ======================================================== */

function openBudgetModal(category = '', amount = 0, month = null, year = null) {
    const today = new Date();
    document.getElementById('budgetCategory').value = category || 'Food';
    document.getElementById('budgetAmount').value = (amount && amount > 0) ? amount : '';
    document.getElementById('budgetMonth').value = month || (today.getMonth() + 1);
    document.getElementById('budgetYear').value = year || today.getFullYear();

    openModal('budgetModal');
}

async function handleBudgetSubmit(event) {
    event.preventDefault();

    const category = document.getElementById('budgetCategory').value;
    const amount = parseFloat(document.getElementById('budgetAmount').value);
    const month = parseInt(document.getElementById('budgetMonth').value);
    const year = parseInt(document.getElementById('budgetYear').value);

    if (!amount || amount <= 0) {
        showToast('error', 'Validation Error', 'Please enter a valid positive budget amount.');
        return;
    }

    try {
        const response = await fetch('/api/budgets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category, amount, month, year })
        });

        const data = await response.json();

        if (response.ok && data.status === 'success') {
            closeModal('budgetModal');
            showToast('success', 'Budget Saved!', data.message);

            if (document.getElementById('categoryBudgetsContainer')) {
                loadBudgetsData();
            }
            if (document.getElementById('totalBalanceVal')) {
                initDashboard();
            }
        } else {
            showToast('error', 'Error', data.message);
        }
    } catch (err) {
        showToast('error', 'Network Error', 'Failed to save budget.');
    }
}

/**
 * Fetch and Render Budgets on Budget Management Page
 */
async function loadBudgetsData() {
    const container = document.getElementById('categoryBudgetsContainer');
    if (!container) return;

    const month = document.getElementById('budgetMonthSelect').value;
    const year = document.getElementById('budgetYearSelect').value;

    try {
        const response = await fetch(`/api/budgets?month=${month}&year=${year}`);
        const result = await response.json();

        if (result.status !== 'success') {
            showToast('error', 'Error', 'Failed to fetch budgets.');
            return;
        }

        const summary = result.summary;
        const budgets = result.budgets;

        // Populate Summary Cards
        document.getElementById('budgetTotalAllocated').textContent = formatPKR(summary.total_budgeted);
        document.getElementById('budgetTotalSpent').textContent = formatPKR(summary.total_spent);
        document.getElementById('budgetTotalRemaining').textContent = formatPKR(summary.total_remaining);
        document.getElementById('budgetMonthLabel').textContent = `${result.month_name}`;

        const usageBadge = document.getElementById('overallBudgetUsageBadge');
        usageBadge.textContent = `${summary.total_percentage}% Used`;

        const spentBar = document.getElementById('overallSpentProgressBar');
        const remBar = document.getElementById('overallRemainingProgressBar');

        const spentWidth = Math.min(summary.total_percentage, 100);
        spentBar.style.width = `${spentWidth}%`;
        remBar.style.width = `${Math.max(100 - spentWidth, 0)}%`;

        const alertBox = document.getElementById('budgetExceededAlert');
        const alertTitle = document.getElementById('budgetWarningTitle');
        const alertMsg = document.getElementById('budgetWarningText');

        if (summary.status === 'exceeded') {
            usageBadge.className = 'badge badge-danger';
            spentBar.className = 'progress-bar-fill fill-red';
            alertBox.classList.remove('d-none');
            alertBox.className = 'alert-box-warning';
            alertBox.style.backgroundColor = '#fef2f2';
            alertBox.style.borderColor = '#fecaca';
            alertBox.style.color = '#991b1b';
            alertTitle.textContent = 'Critical Alert: Overall Monthly Budget Exceeded!';
            alertMsg.textContent = `You have exceeded your total planned budget by ${formatPKR(Math.abs(summary.total_remaining))}. Consider cutting discretionary expenses.`;
        } else if (summary.status === 'warning') {
            usageBadge.className = 'badge badge-warning';
            spentBar.className = 'progress-bar-fill fill-accent';
            alertBox.classList.remove('d-none');
            alertTitle.textContent = 'Budget Warning: Approaching Total Limit';
            alertMsg.textContent = `You have utilized ${summary.total_percentage}% of your allocated monthly budget. Only ${formatPKR(summary.total_remaining)} remains.`;
        } else {
            usageBadge.className = 'badge badge-success';
            spentBar.className = 'progress-bar-fill fill-green';
            alertBox.classList.add('d-none');
        }

        // Render Category Cards
        container.innerHTML = '';
        budgets.forEach(b => {
            const catConfig = CATEGORY_CONFIG.expense[b.category] || { icon: 'fa-tags', color: '#0284c7' };
            const card = document.createElement('div');
            card.className = 'cat-budget-card';

            let statusClass = 'status-normal';
            let statusBadge = '<span class="badge badge-success">On Track</span>';

            if (b.status === 'exceeded') {
                statusClass = 'status-exceeded';
                statusBadge = '<span class="badge badge-danger"><i class="fa-solid fa-triangle-exclamation"></i> Exceeded</span>';
            } else if (b.status === 'warning') {
                statusClass = 'status-warning';
                statusBadge = '<span class="badge badge-warning"><i class="fa-solid fa-bell"></i> Near Limit</span>';
            } else if (b.status === 'unbudgeted') {
                statusBadge = '<span class="badge badge-warning">No Limit Set</span>';
            } else if (b.status === 'none') {
                statusBadge = '<span class="badge badge-light-blue">Not Set</span>';
            }

            const fillWidth = Math.min(b.percentage, 100);

            card.innerHTML = `
                <div class="cat-budget-header">
                    <div class="cat-budget-title">
                        <div class="cat-budget-icon" style="color: ${catConfig.color}; background-color: ${catConfig.color}15;">
                            <i class="fa-solid ${catConfig.icon}"></i>
                        </div>
                        <span>${b.category}</span>
                    </div>
                    ${statusBadge}
                </div>

                <div class="cat-budget-amounts">
                    <div>
                        <span class="text-muted" style="font-size: 0.72rem; text-transform: uppercase;">Spent</span>
                        <div style="font-weight: 700; color: ${b.status === 'exceeded' ? 'var(--color-danger)' : 'var(--text-main)'};">
                            ${formatPKR(b.spent_amount)}
                        </div>
                    </div>
                    <div class="text-right">
                        <span class="text-muted" style="font-size: 0.72rem; text-transform: uppercase;">Budget Limit</span>
                        <div style="font-weight: 700;">
                            ${b.budget_amount > 0 ? formatPKR(b.budget_amount) : '<span class="text-muted">Not Set</span>'}
                        </div>
                    </div>
                </div>

                <div class="cat-budget-percent-wrap">
                    <span>${b.budget_amount > 0 ? `${b.percentage}% Used` : 'Spend without limit'}</span>
                    <span style="color: ${b.remaining_amount < 0 ? 'var(--color-danger)' : 'var(--color-success)'}">
                        ${b.budget_amount > 0 ? (b.remaining_amount < 0 ? `Over by ${formatPKR(Math.abs(b.remaining_amount))}` : `Rem: ${formatPKR(b.remaining_amount)}`) : ''}
                    </span>
                </div>

                <div class="cat-progress-track">
                    <div class="cat-progress-bar ${statusClass}" style="width: ${fillWidth}%;"></div>
                </div>

                <div class="cat-budget-footer">
                    <button class="btn btn-outline-primary btn-sm" onclick="openBudgetModal('${b.category}', ${b.budget_amount || 0}, ${month}, ${year})">
                        <i class="fa-solid fa-pen"></i> ${b.budget_amount > 0 ? 'Adjust' : 'Set Budget'}
                    </button>
                    ${b.id ? `
                        <button class="action-icon-btn delete-btn" title="Remove Limit" onclick="promptDeleteBudget(${b.id}, '${b.category}')">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    ` : ''}
                </div>
            `;

            container.appendChild(card);
        });

    } catch (err) {
        showToast('error', 'Error', 'Unable to load budget information.');
    }
}

function promptDeleteBudget(id, category) {
    pendingDeleteId = id;
    pendingDeleteType = 'budget';

    const msg = document.getElementById('deleteConfirmMessage');
    msg.textContent = `Are you sure you want to remove the budget cap for "${category}"?`;

    openModal('deleteConfirmModal');
}


/* ========================================================
   DASHBOARD DATA & CHARTS
   ======================================================== */

async function initDashboard() {
    try {
        const response = await fetch('/api/dashboard-summary');
        const res = await response.json();

        if (res.status !== 'success') {
            showToast('error', 'Dashboard Error', 'Could not fetch dashboard summary.');
            return;
        }

        const data = res.data;

        // 1. Metric Cards
        document.getElementById('totalBalanceVal').textContent = formatPKR(data.total_balance);
        document.getElementById('totalIncomeVal').textContent = formatPKR(data.total_income);
        document.getElementById('monthIncomeVal').textContent = formatPKR(data.month_income);
        document.getElementById('totalExpenseVal').textContent = formatPKR(data.total_expenses);
        document.getElementById('monthExpenseVal').textContent = formatPKR(data.month_expense);
        document.getElementById('monthSavingsVal').textContent = formatPKR(data.month_savings);

        const savingsBadge = document.getElementById('savingsRateBadge');
        if (savingsBadge) {
            savingsBadge.className = data.savings_rate >= 0 ? 'badge badge-success' : 'badge badge-danger';
            savingsBadge.innerHTML = `<i class="fa-solid fa-piggy-bank"></i> ${data.savings_rate}% Rate`;
        }

        const savingsBar = document.getElementById('savingsBarFill');
        if (savingsBar) {
            savingsBar.style.width = `${Math.min(Math.max(data.savings_rate, 0), 100)}%`;
        }

        // Monthly Summary Widget
        if (document.getElementById('sumMonthIncome')) {
            document.getElementById('sumMonthIncome').textContent = formatPKR(data.month_income);
            document.getElementById('sumMonthExpense').textContent = formatPKR(data.month_expense);
            document.getElementById('sumMonthSavings').textContent = formatPKR(data.month_savings);
            document.getElementById('sumMonthBudget').textContent = data.current_month_budget > 0 ? formatPKR(data.current_month_budget) : 'Not Set';
        }

        // 2. Budget Alert Banner
        const banner = document.getElementById('dashboardBudgetBanner');
        if (banner) {
            if (data.current_month_budget > 0) {
                banner.classList.remove('d-none');
                document.getElementById('budgetSpentText').textContent = `${formatPKR(data.month_expense)} spent`;
                document.getElementById('budgetTotalText').textContent = `of ${formatPKR(data.current_month_budget)} limit`;

                const fillBar = document.getElementById('budgetBannerBar');
                const fillPct = Math.min(data.budget_usage_percent, 100);
                fillBar.style.width = `${fillPct}%`;

                if (data.month_expense > data.current_month_budget) {
                    banner.className = 'budget-alert-banner exceeded';
                    fillBar.className = 'meter-bar-fill exceeded';
                    document.getElementById('budgetBannerTitle').textContent = 'Warning: Monthly Budget Exceeded!';
                    document.getElementById('budgetBannerDesc').textContent = `You have spent ${formatPKR(data.month_expense - data.current_month_budget)} above your monthly limit.`;
                } else if (data.budget_usage_percent >= 80) {
                    banner.className = 'budget-alert-banner warning';
                    fillBar.className = 'meter-bar-fill warning';
                    document.getElementById('budgetBannerTitle').textContent = 'Caution: Close to Budget Limit';
                    document.getElementById('budgetBannerDesc').textContent = `${data.budget_usage_percent}% of monthly budget used. ${formatPKR(data.budget_remaining)} left.`;
                } else {
                    banner.className = 'budget-alert-banner';
                    fillBar.className = 'meter-bar-fill';
                    document.getElementById('budgetBannerTitle').textContent = 'Monthly Budget on Track';
                    document.getElementById('budgetBannerDesc').textContent = `${data.budget_usage_percent}% used. Safe to spend ${formatPKR(data.budget_remaining)}.`;
                }
            } else {
                banner.classList.add('d-none');
            }
        }

        // 3. Render Trend Chart (Past 6 Months)
        renderDashboardTrendChart(data.monthly_trend);

        // 4. Render Category Breakdown Doughnut
        renderDashboardCategoryDonut(data.category_breakdown);

        // 5. Render Recent Transactions Table
        renderRecentTransactions(data.recent_transactions);

    } catch (err) {
        showToast('error', 'Dashboard Error', 'Failed to render dashboard.');
    }
}

/**
 * Render 6 Months Income vs Expense Comparative Bar Chart
 */
function renderDashboardTrendChart(trendData) {
    const canvas = document.getElementById('incomeVsExpenseChart');
    if (!canvas) return;

    if (dashTrendChartInstance) {
        dashTrendChartInstance.destroy();
    }

    const labels = trendData.map(d => d.label);
    const incomeVals = trendData.map(d => d.income);
    const expenseVals = trendData.map(d => d.expense);

    const ctx = canvas.getContext('2d');
    dashTrendChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Income (PKR)',
                    data: incomeVals,
                    backgroundColor: '#10b981',
                    borderRadius: 6,
                    barPercentage: 0.6,
                    categoryPercentage: 0.7
                },
                {
                    label: 'Expense (PKR)',
                    data: expenseVals,
                    backgroundColor: '#ef4444',
                    borderRadius: 6,
                    barPercentage: 0.6,
                    categoryPercentage: 0.7
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e293b',
                    padding: 12,
                    titleFont: { size: 13, family: 'Inter' },
                    bodyFont: { size: 12, family: 'Inter' },
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${formatPKR(context.parsed.y)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { family: 'Inter', size: 11 }, color: '#64748b' }
                },
                y: {
                    grid: { color: '#f1f5f9' },
                    ticks: {
                        font: { family: 'Inter', size: 11 },
                        color: '#64748b',
                        callback: function(val) {
                            if (val >= 1000) return 'Rs. ' + (val / 1000) + 'k';
                            return 'Rs. ' + val;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Render Category Breakdown Doughnut Chart on Dashboard
 */
function renderDashboardCategoryDonut(categories) {
    const canvas = document.getElementById('categoryDonutChart');
    const legendList = document.getElementById('dashboardCategoryList');
    if (!canvas || !legendList) return;

    if (dashDonutChartInstance) {
        dashDonutChartInstance.destroy();
    }

    if (!categories || categories.length === 0) {
        canvas.style.display = 'none';
        legendList.innerHTML = `
            <div class="empty-state-mini">
                <i class="fa-solid fa-chart-pie"></i>
                <p>No expense data logged yet</p>
            </div>
        `;
        return;
    }

    canvas.style.display = 'block';
    const labels = categories.map(c => c.category);
    const totals = categories.map(c => c.total);
    const sumTotal = totals.reduce((a, b) => a + b, 0);

    const colors = categories.map((c, i) => {
        const conf = CATEGORY_CONFIG.expense[c.category];
        return conf ? conf.color : CHART_COLORS[i % CHART_COLORS.length];
    });

    const ctx = canvas.getContext('2d');
    dashDonutChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: totals,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#ffffff',
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e293b',
                    padding: 10,
                    callbacks: {
                        label: function(context) {
                            const val = context.parsed;
                            const pct = ((val / sumTotal) * 100).toFixed(1);
                            return ` ${context.label}: ${formatPKR(val)} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });

    // Populate Custom Legend List
    legendList.innerHTML = '';
    categories.forEach((cat, index) => {
        const color = colors[index];
        const pct = sumTotal > 0 ? ((cat.total / sumTotal) * 100).toFixed(1) : 0;
        const conf = CATEGORY_CONFIG.expense[cat.category] || { icon: 'fa-tags' };

        const item = document.createElement('div');
        item.className = 'category-legend-item';
        item.innerHTML = `
            <div class="cat-legend-label">
                <span class="cat-color-dot" style="background-color: ${color};"></span>
                <span>${cat.category}</span>
                <span class="text-muted" style="font-size: 0.72rem;">(${pct}%)</span>
            </div>
            <span class="cat-legend-val">${formatPKR(cat.total)}</span>
        `;
        legendList.appendChild(item);
    });
}

/**
 * Render Recent Transactions Table Rows
 */
function renderRecentTransactions(transactions) {
    const tbody = document.getElementById('recentTransBody');
    if (!tbody) return;

    if (!transactions || transactions.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-5">
                    <div class="empty-state-mini">
                        <i class="fa-solid fa-receipt"></i>
                        <p>No transactions recorded yet.</p>
                        <button class="btn btn-primary btn-sm mt-2" onclick="openAddModal('expense')">
                            Add First Transaction
                        </button>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = '';
    transactions.forEach(t => {
        const typeConf = CATEGORY_CONFIG[t.type] || {};
        const catConf = typeConf[t.category] || { icon: 'fa-tags', color: '#64748b' };
        const isExp = t.type === 'expense';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div class="category-tag">
                    <i class="fa-solid ${catConf.icon}" style="color: ${catConf.color};"></i>
                    <span>${t.category}</span>
                </div>
            </td>
            <td>
                <span class="font-weight-500">${t.description || '<span class="text-muted">—</span>'}</span>
            </td>
            <td>
                <span class="text-muted" style="font-size: 0.8rem;">${formatDate(t.date)}</span>
            </td>
            <td>
                <span class="type-pill ${t.type}">${t.type}</span>
            </td>
            <td class="text-right">
                <span class="table-amount ${isExp ? 'text-danger' : 'text-success'}">
                    ${isExp ? '-' : '+'}${formatPKR(t.amount)}
                </span>
            </td>
            <td class="text-center">
                <div class="table-actions">
                    <button class="action-icon-btn" title="Edit" onclick="openEditModal(${t.id})">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button class="action-icon-btn delete-btn" title="Delete" onclick="promptDeleteTransaction(${t.id}, '${escapeQuotes(t.description)}', ${t.amount})">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}


/* ========================================================
   TRANSACTIONS MANAGEMENT PAGE
   ======================================================== */

async function loadTransactionsTable() {
    const tbody = document.getElementById('transactionsTableBody');
    if (!tbody) return;

    const search = document.getElementById('searchInput')?.value.trim() || '';
    const type = document.getElementById('typeFilter')?.value || '';
    const category = document.getElementById('categoryFilter')?.value || '';
    const sortBy = document.getElementById('sortFilter')?.value || 'date_desc';
    const startDate = document.getElementById('startDateFilter')?.value || '';
    const endDate = document.getElementById('endDateFilter')?.value || '';

    const params = new URLSearchParams({
        search, type, category, sort_by: sortBy,
        start_date: startDate, end_date: endDate
    });

    try {
        const response = await fetch(`/api/transactions?${params.toString()}`);
        const data = await response.json();

        if (data.status !== 'success') {
            showToast('error', 'Error', 'Failed to retrieve transactions.');
            return;
        }

        // Summary pills
        document.getElementById('filteredCount').textContent = data.count;
        document.getElementById('filteredIncome').textContent = formatPKR(data.summary.total_income);
        document.getElementById('filteredExpense').textContent = formatPKR(data.summary.total_expense);
        document.getElementById('filteredNet').textContent = formatPKR(data.summary.net_balance);

        const emptyState = document.getElementById('emptyTransactionsState');
        const table = document.getElementById('transactionsTable');

        if (data.count === 0) {
            tbody.innerHTML = '';
            table.classList.add('d-none');
            emptyState.classList.remove('d-none');
            return;
        }

        table.classList.remove('d-none');
        emptyState.classList.add('d-none');
        tbody.innerHTML = '';

        data.transactions.forEach(t => {
            const isExp = t.type === 'expense';
            const catMap = CATEGORY_CONFIG[t.type] || {};
            const catConf = catMap[t.category] || { icon: 'fa-tags', color: '#64748b' };

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <span style="font-weight: 500;">${formatDate(t.date)}</span>
                </td>
                <td>
                    <span class="type-pill ${t.type}">${t.type}</span>
                </td>
                <td>
                    <div class="category-tag">
                        <i class="fa-solid ${catConf.icon}" style="color: ${catConf.color};"></i>
                        <span>${t.category}</span>
                    </div>
                </td>
                <td>
                    <span>${t.description || '<span class="text-muted">—</span>'}</span>
                </td>
                <td class="text-right">
                    <span class="table-amount ${isExp ? 'text-danger' : 'text-success'}">
                        ${isExp ? '-' : '+'}${formatPKR(t.amount)}
                    </span>
                </td>
                <td class="text-center">
                    <div class="table-actions">
                        <button class="action-icon-btn" title="Edit" onclick="openEditModal(${t.id})">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button class="action-icon-btn delete-btn" title="Delete" onclick="promptDeleteTransaction(${t.id}, '${escapeQuotes(t.description)}', ${t.amount})">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (err) {
        showToast('error', 'Error', 'Failed to communicate with transactions ledger.');
    }
}

/**
 * Quick Preset Date Filters
 */
function setPresetDateRange(preset, btn) {
    document.querySelectorAll('.preset-pill').forEach(p => p.classList.remove('active'));
    if (btn) btn.classList.add('active');

    const startInput = document.getElementById('startDateFilter');
    const endInput = document.getElementById('endDateFilter');
    const today = new Date();

    const formatDateVal = d => d.toISOString().split('T')[0];

    if (preset === 'today') {
        const str = formatDateVal(today);
        startInput.value = str;
        endInput.value = str;
    } else if (preset === 'this_week') {
        const dayOfWeek = today.getDay() || 7; // Monday = 1
        const monday = new Date(today);
        monday.setDate(today.getDate() - dayOfWeek + 1);
        startInput.value = formatDateVal(monday);
        endInput.value = formatDateVal(today);
    } else if (preset === 'this_month') {
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        startInput.value = formatDateVal(firstDay);
        endInput.value = formatDateVal(today);
    } else if (preset === 'this_year') {
        const firstDay = new Date(today.getFullYear(), 0, 1);
        startInput.value = formatDateVal(firstDay);
        endInput.value = formatDateVal(today);
    } else {
        // all
        startInput.value = '';
        endInput.value = '';
    }

    loadTransactionsTable();
}

function resetAllFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('typeFilter').value = '';
    document.getElementById('categoryFilter').value = '';
    document.getElementById('sortFilter').value = 'date_desc';
    document.getElementById('startDateFilter').value = '';
    document.getElementById('endDateFilter').value = '';

    document.querySelectorAll('.preset-pill').forEach(p => p.classList.remove('active'));
    document.querySelector('.preset-pill')?.classList.add('active');

    loadTransactionsTable();
}


/* ========================================================
   REPORTS & ANALYTICS
   ======================================================== */

async function loadReportsData() {
    const canvas = document.getElementById('reportsTrendChart');
    if (!canvas) return;

    const timeframe = typeof currentReportTimeframe !== 'undefined' ? currentReportTimeframe : 'monthly';
    const year = document.getElementById('reportYearSelect')?.value || new Date().getFullYear();

    try {
        const response = await fetch(`/api/reports?timeframe=${timeframe}&year=${year}`);
        const result = await response.json();

        if (result.status !== 'success') {
            showToast('error', 'Error', 'Could not load analytics report.');
            return;
        }

        const summary = result.summary;
        const chartData = result.chart;

        // Update Summary Cards
        document.getElementById('reportTotalIncome').textContent = formatPKR(summary.total_income);
        document.getElementById('reportTotalExpense').textContent = formatPKR(summary.total_expense);
        document.getElementById('reportNetSavings').textContent = formatPKR(summary.net_savings);
        document.getElementById('reportSavingsRate').textContent = `${summary.savings_rate}% Savings Rate`;
        document.getElementById('reportTopCategory').textContent = summary.top_expense_category;
        document.getElementById('reportTopAmount').textContent = formatPKR(summary.top_expense_amount);

        // 1. Render Main Trend Chart (Line / Bar)
        if (reportsTrendChartInstance) {
            reportsTrendChartInstance.destroy();
        }

        const ctx = canvas.getContext('2d');
        reportsTrendChartInstance = new Chart(ctx, {
            type: timeframe === 'daily' ? 'line' : 'bar',
            data: {
                labels: chartData.labels,
                datasets: [
                    {
                        label: 'Income (PKR)',
                        data: chartData.income,
                        backgroundColor: timeframe === 'daily' ? 'rgba(16, 185, 129, 0.15)' : '#10b981',
                        borderColor: '#10b981',
                        borderWidth: 2,
                        tension: 0.3,
                        fill: timeframe === 'daily',
                        borderRadius: 4
                    },
                    {
                        label: 'Expenses (PKR)',
                        data: chartData.expense,
                        backgroundColor: timeframe === 'daily' ? 'rgba(239, 68, 68, 0.15)' : '#ef4444',
                        borderColor: '#ef4444',
                        borderWidth: 2,
                        tension: 0.3,
                        fill: timeframe === 'daily',
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { font: { family: 'Inter', size: 12 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(c) {
                                return ` ${c.dataset.label}: ${formatPKR(c.parsed.y)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { family: 'Inter', size: 11 }, color: '#64748b' }
                    },
                    y: {
                        grid: { color: '#f1f5f9' },
                        ticks: {
                            font: { family: 'Inter', size: 11 },
                            color: '#64748b',
                            callback: function(v) {
                                if (v >= 1000) return 'Rs. ' + (v / 1000) + 'k';
                                return 'Rs. ' + v;
                            }
                        }
                    }
                }
            }
        });

        // 2. Render Expense Distribution Doughnut
        renderReportsDoughnut(
            'reportsExpenseDonut',
            'reportExpenseLegend',
            result.category_analysis,
            summary.total_expense,
            CATEGORY_CONFIG.expense
        );

        // 3. Render Income Distribution Doughnut
        renderReportsDoughnut(
            'reportsIncomeDonut',
            'reportIncomeLegend',
            result.income_category_analysis,
            summary.total_income,
            CATEGORY_CONFIG.income
        );

        // 4. Render Category Table
        renderReportCategoryTable(result.category_analysis, summary.total_expense);

    } catch (err) {
        showToast('error', 'Error', 'Failed to load report analytics.');
    }
}

function renderReportsDoughnut(canvasId, legendId, categories, totalSum, configMap) {
    const canvas = document.getElementById(canvasId);
    const legend = document.getElementById(legendId);
    if (!canvas || !legend) return;

    let chartRef = (canvasId === 'reportsExpenseDonut') ? reportsExpDonutInstance : reportsIncDonutInstance;
    if (chartRef) chartRef.destroy();

    if (!categories || categories.length === 0) {
        canvas.style.display = 'none';
        legend.innerHTML = '<div class="empty-state-mini"><i class="fa-solid fa-chart-pie"></i><p>No data recorded</p></div>';
        return;
    }

    canvas.style.display = 'block';
    const labels = categories.map(c => c.category);
    const amounts = categories.map(c => c.total);
    const colors = categories.map((c, i) => {
        const conf = configMap[c.category];
        return conf ? conf.color : CHART_COLORS[i % CHART_COLORS.length];
    });

    const ctx = canvas.getContext('2d');
    const newChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: amounts,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(c) {
                            const val = c.parsed;
                            const pct = totalSum > 0 ? ((val / totalSum) * 100).toFixed(1) : 0;
                            return ` ${c.label}: ${formatPKR(val)} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });

    if (canvasId === 'reportsExpenseDonut') {
        reportsExpDonutInstance = newChart;
    } else {
        reportsIncDonutInstance = newChart;
    }

    // Populate Legend
    legend.innerHTML = '';
    categories.forEach((cat, index) => {
        const color = colors[index];
        const pct = totalSum > 0 ? ((cat.total / totalSum) * 100).toFixed(1) : 0;
        const item = document.createElement('div');
        item.className = 'category-legend-item';
        item.innerHTML = `
            <div class="cat-legend-label">
                <span class="cat-color-dot" style="background-color: ${color};"></span>
                <span>${cat.category}</span>
                <span class="text-muted" style="font-size: 0.72rem;">(${pct}%)</span>
            </div>
            <span class="cat-legend-val">${formatPKR(cat.total)}</span>
        `;
        legend.appendChild(item);
    });
}

function renderReportCategoryTable(categories, totalExpense) {
    const tbody = document.getElementById('reportCategoryTableBody');
    if (!tbody) return;

    if (!categories || categories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-muted">No expense entries found for this range.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    categories.forEach(c => {
        const conf = CATEGORY_CONFIG.expense[c.category] || { icon: 'fa-tags', color: '#0284c7' };
        const pct = totalExpense > 0 ? ((c.total / totalExpense) * 100).toFixed(1) : 0;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div class="category-tag">
                    <i class="fa-solid ${conf.icon}" style="color: ${conf.color};"></i>
                    <span>${c.category}</span>
                </div>
            </td>
            <td class="text-center">
                <span class="badge badge-light-blue">${c.count} transactions</span>
            </td>
            <td class="text-right">
                <strong>${formatPKR(c.total)}</strong>
            </td>
            <td>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <div class="cat-progress-track" style="flex: 1;">
                        <div class="cat-progress-bar status-normal" style="width: ${pct}%; background-color: ${conf.color};"></div>
                    </div>
                    <span style="font-size: 0.75rem; font-weight: 600; min-width: 40px; text-align: right;">${pct}%</span>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}


/* ========================================================
   GLOBAL UI INTERACTIONS (Sidebar & Date)
   ======================================================== */

function escapeQuotes(str) {
    if (!str) return '';
    return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', function() {
    // Topbar Live Date
    const dateEl = document.getElementById('headerCurrentDate');
    if (dateEl) {
        const now = new Date();
        dateEl.textContent = now.toLocaleDateString('en-GB', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    }

    // Mobile Sidebar Toggle
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const toggleBtn = document.getElementById('sidebarToggleBtn');
    const closeBtn = document.getElementById('sidebarCloseBtn');

    if (toggleBtn && sidebar && overlay) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.add('open');
            overlay.classList.add('active');
        });
    }

    if (closeBtn && sidebar && overlay) {
        closeBtn.addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
        });
    }

    if (overlay && sidebar) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
        });
    }
});
