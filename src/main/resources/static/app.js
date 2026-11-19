// =============================================================================
// Library Desk - Advanced Library Book Management & Fine Calculation System
// =============================================================================

const byId = (id) => document.getElementById(id);
const currencyFormatter = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });
const dateFormatter = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "UTC" });
const textCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

let currentView = "dashboard";
let selectedLoan = null;
let editingBookId = null;
let editingStudentUid = null;
let noticeTimer = null;
let cachedStudents = [];
let cachedBooks = [];
let activeSort = { col: null, direction: "ascending" };

// --- DATE & FORMATTING HELPERS ---
function today() {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function formatDate(isoDate) {
    if (!isoDate) return "-";
    return dateFormatter.format(new Date(isoDate));
}

function formatMoney(amount) {
    if (amount === null || amount === undefined) return "₹0.00";
    return currencyFormatter.format(amount);
}

function calculateDaysBetween(startIso, endIso) {
    const start = new Date(startIso);
    const end = new Date(endIso);
    const diffMs = end - start;
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// --- NOTIFICATION & TOAST ---
function notice(message, isError = false) {
    const box = byId("notice");
    box.textContent = message;
    box.classList.toggle("error", isError);
    box.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { box.hidden = true; }, 6000);
}

// --- API CLIENT ---
async function api(path, options = {}) {
    const config = {
        headers: { "Content-Type": "application/json" },
        ...options
    };
    if (config.body && typeof config.body === "object" && !(config.body instanceof FormData)) {
        config.body = JSON.stringify(config.body);
    }
    const res = await fetch("/api/" + path, config);
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.message || `Request failed with status ${res.status}`);
    }
    return data;
}

// --- THEME MANAGEMENT ---
function initTheme() {
    const saved = localStorage.getItem("library-theme") || 
                  (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(saved);
    byId("theme-toggle").addEventListener("click", () => {
        const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
        setTheme(next);
    });
}

function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("library-theme", theme);
    byId("theme-sun").hidden = theme === "dark";
    byId("theme-moon").hidden = theme !== "dark";
}

// --- NAVIGATION ---
async function navigate(view, params = {}) {
    currentView = view;
    document.querySelectorAll("main > section").forEach((sec) => {
        sec.hidden = sec.id !== view;
    });
    document.querySelectorAll("nav button").forEach((btn) => {
        if (btn.dataset.view === view) {
            btn.setAttribute("aria-current", "page");
        } else {
            btn.removeAttribute("aria-current");
        }
    });

    try {
        if (view === "dashboard") await loadDashboard();
        if (view === "catalog") await loadCatalog();
        if (view === "students") await loadStudents();
        if (view === "loans") await loadLoans(params.studentUid);
    } catch (err) {
        notice(err.message, true);
    }
}

// --- 1. DASHBOARD CONTROLLER ---
async function loadDashboard() {
    const stats = await api("dashboard");
    byId("stat-total-books").textContent = stats.totalBooks;
    byId("stat-books-meta").textContent = `${stats.availableBooks} available · ${stats.onLoanBooks} on loan`;
    byId("stat-total-students").textContent = stats.totalStudents;
    byId("stat-active-loans").textContent = stats.activeLoans;
    byId("stat-overdue-loans").textContent = stats.overdueLoans;
    byId("stat-fines-collected").textContent = formatMoney(stats.finesCollected);
    byId("stat-fines-pending").textContent = `Pending: ${formatMoney(stats.pendingFines)}`;

    // Update navigation counter pills
    byId("nav-books-count").textContent = stats.totalBooks;
    byId("nav-students-count").textContent = stats.totalStudents;
    const overduePill = byId("nav-loans-overdue");
    if (stats.overdueLoans > 0) {
        overduePill.hidden = false;
        overduePill.textContent = `${stats.overdueLoans} overdue`;
    } else {
        overduePill.hidden = true;
    }

    // Top Borrowed Books
    const topContainer = byId("top-books-list");
    if (stats.topBooks && stats.topBooks.length > 0) {
        topContainer.innerHTML = stats.topBooks.map((b) => `
            <div class="top-book-item">
                <div class="top-book-info">
                    <h4>${escapeHtml(b.TITLE)}</h4>
                    <p>${escapeHtml(b.AUTHOR)} (${escapeHtml(b.ID)})</p>
                </div>
                <span class="borrow-badge">${b.BORROW_COUNT} ${b.BORROW_COUNT === 1 ? 'loan' : 'loans'}</span>
            </div>
        `).join("");
    } else {
        topContainer.innerHTML = `<p class="text-muted" style="padding: 16px 0;">No borrowing activity recorded yet.</p>`;
    }

    // Recent Circulation Table
    const recentRows = byId("dashboard-recent-rows");
    if (stats.recentActivity && stats.recentActivity.length > 0) {
        recentRows.innerHTML = stats.recentActivity.map((item) => {
            let statusBadge = "";
            if (item.RETURNED_ON) {
                statusBadge = `<span class="badge badge-returned">Returned</span>`;
            } else if (item.DUE_ON < today()) {
                statusBadge = `<span class="badge badge-overdue">Overdue</span>`;
            } else {
                statusBadge = `<span class="badge badge-loan">Active</span>`;
            }

            return `
                <tr>
                    <td>
                        <strong>${escapeHtml(item.TITLE)}</strong>
                        <span class="cell-meta">${escapeHtml(item.NAME)} (${escapeHtml(item.STUDENT_UID)})</span>
                    </td>
                    <td>
                        <span>Due: ${formatDate(item.DUE_ON)}</span>
                        <span class="cell-meta">Issued: ${formatDate(item.ISSUED_ON)}</span>
                    </td>
                    <td>${statusBadge}</td>
                </tr>
            `;
        }).join("");
    } else {
        recentRows.innerHTML = `<tr><td colspan="3" class="text-muted" style="text-align:center; padding: 24px;">No circulation activity.</td></tr>`;
    }
}

// --- 2. CATALOG CONTROLLER ---
async function loadCategories() {
    const categories = await api("books/categories");
    const select = byId("catalog-category-filter");
    const current = select.value;
    select.innerHTML = `<option value="">All Categories</option>` +
        categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    if (categories.includes(current)) select.value = current;
}

async function loadCatalog() {
    await loadCategories();
    const query = byId("catalog-query").value.trim();
    const category = byId("catalog-category-filter").value;
    const availability = byId("catalog-availability-filter").value;

    let url = `books?query=${encodeURIComponent(query)}`;
    if (category) url += `&category=${encodeURIComponent(category)}`;
    const books = await api(url);
    cachedBooks = books;

    // Filter by availability client-side
    let filtered = books;
    if (availability === "AVAILABLE") {
        filtered = books.filter((b) => b.available);
    } else if (availability === "ON_LOAN") {
        filtered = books.filter((b) => !b.available);
    }

    const tbody = byId("book-rows");
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-muted" style="text-align:center; padding: 32px;">No books match your criteria.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map((b) => {
        const badge = b.available 
            ? `<span class="badge badge-available">Available</span>`
            : `<span class="badge badge-loan">On Loan</span>`;

        return `
            <tr data-id="${escapeHtml(b.id)}">
                <td><strong>${escapeHtml(b.id)}</strong></td>
                <td>
                    <strong>${escapeHtml(b.title)}</strong>
                    <span class="cell-meta">${escapeHtml(b.author)} ${b.isbn ? '· ISBN ' + escapeHtml(b.isbn) : ''}</span>
                </td>
                <td><span class="badge badge-category">${escapeHtml(b.category)}</span></td>
                <td>
                    <span>${escapeHtml(b.shelfLocation || '-')}</span>
                    <span class="cell-meta">${b.publishedYear || ''}</span>
                </td>
                <td>${badge}</td>
                <td class="td-actions">
                    <div class="action-group">
                        ${b.available ? `<button type="button" class="btn btn-sm btn-primary action-issue" data-id="${escapeHtml(b.id)}">Issue</button>` : ''}
                        <button type="button" class="btn btn-sm btn-secondary action-edit" data-id="${escapeHtml(b.id)}">Edit</button>
                        <button type="button" class="btn btn-sm btn-danger action-delete" data-id="${escapeHtml(b.id)}">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");

    // Wire actions
    tbody.querySelectorAll(".action-issue").forEach((btn) => {
        btn.addEventListener("click", () => openIssueDialog(btn.dataset.id));
    });
    tbody.querySelectorAll(".action-edit").forEach((btn) => {
        btn.addEventListener("click", () => openEditBook(btn.dataset.id));
    });
    tbody.querySelectorAll(".action-delete").forEach((btn) => {
        btn.addEventListener("click", () => confirmDeleteBook(btn.dataset.id));
    });
}

function openAddBook() {
    editingBookId = null;
    const form = byId("book-form");
    form.reset();
    form.elements.id.readOnly = false;
    byId("book-dialog-title").textContent = "Add New Book";
    byId("btn-save-book").textContent = "Add Book";
    byId("book-dialog").showModal();
}

function openEditBook(id) {
    const book = cachedBooks.find((b) => b.id === id);
    if (!book) return;
    editingBookId = id;
    const form = byId("book-form");
    form.elements.id.value = book.id;
    form.elements.id.readOnly = true;
    form.elements.title.value = book.title;
    form.elements.author.value = book.author;
    form.elements.category.value = book.category || "Computer Science";
    form.elements.publishedYear.value = book.publishedYear || 2024;
    form.elements.isbn.value = book.isbn || "";
    form.elements.shelfLocation.value = book.shelfLocation || "";

    byId("book-dialog-title").textContent = `Edit Book: ${book.id}`;
    byId("btn-save-book").textContent = "Save Changes";
    byId("book-dialog").showModal();
}

async function confirmDeleteBook(id) {
    const book = cachedBooks.find((b) => b.id === id);
    const title = book ? `"${book.title}" (${id})` : id;
    if (!confirm(`Are you sure you want to delete ${title} from the catalog? This will remove its historical records.`)) {
        return;
    }
    try {
        await api(`books/${encodeURIComponent(id)}`, { method: "DELETE" });
        notice(`Book ${id} was deleted.`);
        await loadCatalog();
        await loadDashboard();
    } catch (err) {
        notice(err.message, true);
    }
}

// --- 3. STUDENTS CONTROLLER ---
async function loadStudents() {
    const query = byId("student-query").value.trim();
    const students = await api(`students?query=${encodeURIComponent(query)}`);
    cachedStudents = students;

    const tbody = byId("student-rows");
    if (students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-muted" style="text-align:center; padding: 32px;">No registered students found.</td></tr>`;
        return;
    }

    tbody.innerHTML = students.map((s) => `
        <tr data-uid="${escapeHtml(s.uid)}">
            <td><strong>${escapeHtml(s.uid)}</strong></td>
            <td><strong>${escapeHtml(s.name)}</strong></td>
            <td>
                <span>${escapeHtml(s.department || 'Computer Science & Engineering')}</span>
                <span class="cell-meta">${escapeHtml(s.email || '-')} ${s.phone ? '· ' + escapeHtml(s.phone) : ''}</span>
            </td>
            <td class="td-actions">
                <div class="action-group">
                    <button type="button" class="btn btn-sm btn-primary action-history" data-uid="${escapeHtml(s.uid)}">View History</button>
                    <button type="button" class="btn btn-sm btn-secondary action-edit-student" data-uid="${escapeHtml(s.uid)}">Edit</button>
                    <button type="button" class="btn btn-sm btn-danger action-delete-student" data-uid="${escapeHtml(s.uid)}">Delete</button>
                </div>
            </td>
        </tr>
    `).join("");

    tbody.querySelectorAll(".action-history").forEach((btn) => {
        btn.addEventListener("click", () => navigate("loans", { studentUid: btn.dataset.uid }));
    });
    tbody.querySelectorAll(".action-edit-student").forEach((btn) => {
        btn.addEventListener("click", () => openEditStudent(btn.dataset.uid));
    });
    tbody.querySelectorAll(".action-delete-student").forEach((btn) => {
        btn.addEventListener("click", () => confirmDeleteStudent(btn.dataset.uid));
    });
}

function openRegisterStudent() {
    editingStudentUid = null;
    const form = byId("student-form");
    form.reset();
    form.elements.uid.readOnly = false;
    byId("student-dialog-title").textContent = "Register Student";
    byId("btn-save-student").textContent = "Register Student";
    byId("student-dialog").showModal();
}

function openEditStudent(uid) {
    const student = cachedStudents.find((s) => s.uid === uid);
    if (!student) return;
    editingStudentUid = uid;
    const form = byId("student-form");
    form.elements.uid.value = student.uid;
    form.elements.uid.readOnly = true;
    form.elements.name.value = student.name;
    form.elements.department.value = student.department || "Computer Science & Engineering";
    form.elements.email.value = student.email || "";
    form.elements.phone.value = student.phone || "";

    byId("student-dialog-title").textContent = `Edit Student: ${student.uid}`;
    byId("btn-save-student").textContent = "Save Changes";
    byId("student-dialog").showModal();
}

async function confirmDeleteStudent(uid) {
    const student = cachedStudents.find((s) => s.uid === uid);
    const label = student ? `"${student.name}" (${uid})` : uid;
    if (!confirm(`Are you sure you want to remove ${label}? This cannot be undone.`)) {
        return;
    }
    try {
        await api(`students/${encodeURIComponent(uid)}`, { method: "DELETE" });
        notice(`Student ${uid} was removed.`);
        await loadStudents();
        await loadDashboard();
    } catch (err) {
        notice(err.message, true);
    }
}

// --- 4. LOANS & CIRCULATION CONTROLLER ---
let currentLoanFilter = "ALL";

async function loadLoans(targetStudentUid = null) {
    const [allStudents, allBooks] = await Promise.all([api("students"), api("books")]);
    cachedStudents = allStudents;
    cachedBooks = allBooks;

    const studentSelect = byId("history-student");
    const prevSelectVal = targetStudentUid !== null ? targetStudentUid : studentSelect.value;
    studentSelect.innerHTML = `<option value="">All Students</option>` +
        allStudents.map((s) => `<option value="${escapeHtml(s.uid)}">${escapeHtml(s.uid)} · ${escapeHtml(s.name)}</option>`).join("");
    studentSelect.value = prevSelectVal || "";

    const selectedUid = studentSelect.value;
    const banner = byId("student-history-banner");
    if (selectedUid) {
        const student = allStudents.find((s) => s.uid === selectedUid);
        if (student) {
            banner.hidden = false;
            byId("profile-avatar").textContent = student.name.slice(0, 2).toUpperCase();
            byId("profile-name").textContent = student.name;
            byId("profile-details").textContent = `${student.uid} · ${student.department || 'CSE'} · ${student.email || 'No email'}`;
        }
    } else {
        banner.hidden = true;
    }

    let url = `loans?`;
    if (selectedUid) url += `studentUid=${encodeURIComponent(selectedUid)}&`;
    if (currentLoanFilter !== "ALL") url += `status=${encodeURIComponent(currentLoanFilter)}`;
    const loans = await api(url);

    const tbody = byId("loan-rows");
    if (loans.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-muted" style="text-align:center; padding: 32px;">No loan records found for this filter.</td></tr>`;
        return;
    }

    tbody.innerHTML = loans.map((loan) => {
        let statusHtml = "";
        let actionsHtml = "";

        if (loan.returnedOn) {
            const isFinePaid = loan.finePaid;
            const hasFine = loan.fine && parseFloat(loan.fine) > 0;
            statusHtml = `
                <span class="badge badge-returned">Returned</span>
                ${hasFine ? `
                    <span class="cell-meta text-danger">Fine: ${formatMoney(loan.fine)}</span>
                    <span class="cell-meta ${isFinePaid ? 'text-success' : 'text-danger'}">${isFinePaid ? '✓ Fine Paid' : '⚠ Fine Unpaid'}</span>
                ` : `<span class="cell-meta text-success">Returned On Time (₹0.00)</span>`}
            `;
            if (hasFine && !isFinePaid) {
                actionsHtml = `<button type="button" class="btn btn-sm btn-primary action-pay-fine" data-id="${loan.id}">Settle Fine</button>`;
            }
        } else {
            const isOverdue = loan.dueOn < today();
            const overdueDays = isOverdue ? calculateDaysBetween(loan.dueOn, today()) : 0;
            statusHtml = `
                <span class="badge ${isOverdue ? 'badge-overdue' : 'badge-loan'}">${isOverdue ? `Overdue (${overdueDays}d)` : 'Active (On Loan)'}</span>
                <span class="cell-meta">Renewals: ${loan.renewedCount}/2</span>
                ${isOverdue ? `<span class="cell-meta text-danger">Est. Fine: ${formatMoney(overdueDays * 5.0)}</span>` : ''}
            `;
            actionsHtml = `
                <button type="button" class="btn btn-sm btn-primary action-return" data-id="${loan.id}">Return</button>
                ${loan.renewedCount < 2 ? `<button type="button" class="btn btn-sm btn-secondary action-renew" data-id="${loan.id}" title="Extend due date by 14 days">+14d Renew</button>` : ''}
            `;
        }

        return `
            <tr data-loan-id="${loan.id}">
                <td>#${loan.id}</td>
                <td>
                    <strong>${escapeHtml(loan.title)}</strong>
                    <span class="cell-meta">ID: ${escapeHtml(loan.bookId)}</span>
                </td>
                <td>
                    <strong>${escapeHtml(loan.studentName)}</strong>
                    <span class="cell-meta">${escapeHtml(loan.studentUid)}</span>
                </td>
                <td>
                    <span>Due: <strong>${formatDate(loan.dueOn)}</strong></span>
                    <span class="cell-meta">Issued: ${formatDate(loan.issuedOn)}</span>
                    ${loan.returnedOn ? `<span class="cell-meta">Returned: ${formatDate(loan.returnedOn)}</span>` : ''}
                </td>
                <td>${statusHtml}</td>
                <td class="td-actions">
                    <div class="action-group">
                        ${actionsHtml}
                    </div>
                </td>
            </tr>
        `;
    }).join("");

    tbody.querySelectorAll(".action-return").forEach((btn) => {
        btn.addEventListener("click", () => openReturnDialog(loans.find((l) => l.id == btn.dataset.id)));
    });
    tbody.querySelectorAll(".action-renew").forEach((btn) => {
        btn.addEventListener("click", () => handleRenewLoan(btn.dataset.id));
    });
    tbody.querySelectorAll(".action-pay-fine").forEach((btn) => {
        btn.addEventListener("click", () => openPayFineDialog(loans.find((l) => l.id == btn.dataset.id)));
    });
}

async function handleRenewLoan(loanId) {
    try {
        const renewed = await api(`loans/${loanId}/renew`, { method: "POST" });
        notice(`Loan #${loanId} renewed! New due date: ${formatDate(renewed.dueOn)} (Renewals: ${renewed.renewedCount}/2).`);
        await loadLoans();
        await loadDashboard();
    } catch (err) {
        notice(err.message, true);
    }
}

// --- ISSUE BOOK DIALOG ---
function openIssueDialog(preselectedBookId = "") {
    const form = byId("issue-form");
    form.reset();
    
    // Populate available books
    const bookSelect = form.elements.bookId;
    const availableBooks = cachedBooks.filter((b) => b.available);
    bookSelect.innerHTML = `<option value="">Select an available book</option>` +
        availableBooks.map((b) => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.id)} · ${escapeHtml(b.title)}</option>`).join("");
    if (preselectedBookId) bookSelect.value = preselectedBookId;

    // Populate students
    const studentSelect = form.elements.studentUid;
    studentSelect.innerHTML = `<option value="">Select a student borrower</option>` +
        cachedStudents.map((s) => `<option value="${escapeHtml(s.uid)}">${escapeHtml(s.uid)} · ${escapeHtml(s.name)}</option>`).join("");

    form.elements.issuedOn.value = today();
    form.elements.issuedOn.max = today();
    updateIssueDuePreview();

    form.elements.issuedOn.addEventListener("change", updateIssueDuePreview);
    byId("issue-dialog").showModal();
}

function updateIssueDuePreview() {
    const form = byId("issue-form");
    const issuedIso = form.elements.issuedOn.value;
    if (issuedIso) {
        const issueDate = new Date(issuedIso);
        issueDate.setDate(issueDate.getDate() + 14);
        byId("issue-preview-due").value = formatDate(issueDate.toISOString().slice(0, 10)) + " (14 days)";
    }
}

// --- RETURN BOOK & LIVE FINE CALCULATOR ---
function openReturnDialog(loan) {
    selectedLoan = loan;
    byId("return-book-title").textContent = loan.title;
    byId("return-meta").textContent = `${loan.bookId} · Borrower: ${loan.studentName} (${loan.studentUid})`;
    byId("return-issued-on").textContent = formatDate(loan.issuedOn);
    byId("return-due-on").textContent = formatDate(loan.dueOn);

    const input = byId("return-date-input");
    input.min = loan.issuedOn;
    input.max = today();
    input.value = today();

    updateFineCalculator();
    byId("return-dialog").showModal();
}

function updateFineCalculator() {
    if (!selectedLoan) return;
    const returnDateIso = byId("return-date-input").value;
    const dueIso = selectedLoan.dueOn;
    
    let overdueDays = 0;
    if (returnDateIso > dueIso) {
        overdueDays = calculateDaysBetween(dueIso, returnDateIso);
    }
    const fineAmount = overdueDays * 5.0;

    byId("fine-overdue-days").textContent = overdueDays > 0 ? `${overdueDays} days late` : "0 days (On time)";
    byId("fine-amount-preview").textContent = formatMoney(fineAmount);
    byId("fine-preview-card").style.borderColor = overdueDays > 0 ? "#f87171" : "#a7f3d0";
    byId("fine-preview-card").style.backgroundColor = overdueDays > 0 ? "var(--danger-bg)" : "var(--success-bg)";
    byId("fine-preview-card").style.color = overdueDays > 0 ? "var(--danger-text)" : "var(--success-text)";
}

// --- PAY / SETTLE FINE DIALOG ---
function openPayFineDialog(loan) {
    selectedLoan = loan;
    byId("pay-fine-book-title").textContent = loan.title;
    byId("pay-fine-student").textContent = `Borrower: ${loan.studentName} (${loan.studentUid})`;
    byId("pay-fine-amount").textContent = formatMoney(loan.fine);
    byId("pay-fine-dialog").showModal();
}

// --- UTILITY: TABLE SORTING (Modern Web Guidance Compliant) ---
function initSortableTable(tableId, dataProvider) {
    const table = byId(tableId);
    if (!table) return;

    table.querySelectorAll("th button.th-sort").forEach((btn) => {
        btn.addEventListener("click", () => {
            const th = btn.closest("th");
            const col = btn.dataset.col;
            const currentDir = th.getAttribute("aria-sort");
            const newDir = currentDir === "ascending" ? "descending" : "ascending";

            table.querySelectorAll("th").forEach((t) => t.removeAttribute("aria-sort"));
            th.setAttribute("aria-sort", newDir);

            activeSort = { col, direction: newDir };
            sortAndReorderTable(table, col, newDir);

            // Announce sort state to screen readers
            const announcer = byId("table-status-announcer");
            announcer.textContent = `Sorted by ${btn.textContent.trim()} ${newDir}`;
        });
    });
}

function sortAndReorderTable(table, col, direction) {
    const tbody = table.tBodies[0];
    const rows = Array.from(tbody.rows);
    const factor = direction === "ascending" ? 1 : -1;

    rows.sort((a, b) => {
        const textA = a.textContent.trim();
        const textB = b.textContent.trim();
        return factor * textCollator.compare(textA, textB);
    });

    // Reorder DOM rows in place
    for (const row of rows) {
        if ('moveBefore' in tbody) {
            tbody.moveBefore(row, null);
        } else {
            tbody.appendChild(row);
        }
    }
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// --- EVENT LISTENERS INITIALIZATION ---
function initEvents() {
    // Navigation
    document.querySelectorAll("nav button").forEach((btn) => {
        btn.addEventListener("click", () => navigate(btn.dataset.view));
    });

    // Dashboard Quick Actions
    byId("btn-quick-issue")?.addEventListener("click", () => {
        navigate("loans");
        openIssueDialog();
    });
    byId("btn-quick-add-book")?.addEventListener("click", () => {
        navigate("catalog");
        openAddBook();
    });
    byId("btn-quick-add-student")?.addEventListener("click", () => {
        navigate("students");
        openRegisterStudent();
    });
    byId("btn-view-all-loans")?.addEventListener("click", () => navigate("loans"));
    byId("btn-view-catalog")?.addEventListener("click", () => navigate("catalog"));

    // Catalog filters
    byId("btn-open-add-book")?.addEventListener("click", openAddBook);
    byId("catalog-query")?.addEventListener("input", debounce(loadCatalog, 250));
    byId("catalog-category-filter")?.addEventListener("change", loadCatalog);
    byId("catalog-availability-filter")?.addEventListener("change", loadCatalog);

    // Students search
    byId("btn-open-register-student")?.addEventListener("click", openRegisterStudent);
    byId("student-query")?.addEventListener("input", debounce(loadStudents, 250));

    // Loans filters
    byId("btn-open-issue-dialog")?.addEventListener("click", () => openIssueDialog());
    byId("history-student")?.addEventListener("change", () => loadLoans());
    byId("btn-clear-student-filter")?.addEventListener("click", () => {
        byId("history-student").value = "";
        loadLoans();
    });

    document.querySelectorAll(".tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".tab-btn").forEach((b) => {
                b.classList.remove("active");
                b.setAttribute("aria-selected", "false");
            });
            btn.classList.add("active");
            btn.setAttribute("aria-selected", "true");
            currentLoanFilter = btn.dataset.loanFilter;
            loadLoans();
        });
    });

    // Dynamic return fine calculation on date change
    byId("return-date-input")?.addEventListener("input", updateFineCalculator);

    // Dialog close buttons
    document.querySelectorAll("[data-close-dialog]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const dlg = btn.closest("dialog");
            if (dlg) dlg.close();
        });
    });

    // Light-dismiss fallback for browsers without native closedby support
    if (!('closedBy' in HTMLDialogElement.prototype)) {
        document.querySelectorAll('dialog[closedby="any"]').forEach((dialog) => {
            dialog.addEventListener('click', (event) => {
                if (event.target !== dialog) return;
                const rect = dialog.getBoundingClientRect();
                const isInside = (
                    rect.top <= event.clientY && event.clientY <= rect.top + rect.height &&
                    rect.left <= event.clientX && event.clientX <= rect.left + rect.width
                );
                if (!isInside) dialog.close();
            });
        });
    }

    // FORM SUBMISSIONS
    // Save Book Form
    byId("book-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const payload = {
            id: form.elements.id.value.trim().toUpperCase(),
            title: form.elements.title.value.trim(),
            author: form.elements.author.value.trim(),
            category: form.elements.category.value,
            publishedYear: parseInt(form.elements.publishedYear.value, 10) || 2024,
            isbn: form.elements.isbn.value.trim(),
            shelfLocation: form.elements.shelfLocation.value.trim()
        };

        try {
            if (editingBookId) {
                await api(`books/${encodeURIComponent(editingBookId)}`, { method: "PUT", body: payload });
                notice(`Book "${payload.title}" updated successfully.`);
            } else {
                await api("books", { method: "POST", body: payload });
                notice(`Book "${payload.title}" added to catalog.`);
            }
            byId("book-dialog").close();
            await loadCatalog();
            await loadDashboard();
        } catch (err) {
            notice(err.message, true);
        }
    });

    // Register / Edit Student Form
    byId("student-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const payload = {
            uid: form.elements.uid.value.trim().toUpperCase(),
            name: form.elements.name.value.trim(),
            department: form.elements.department.value,
            email: form.elements.email.value.trim(),
            phone: form.elements.phone.value.trim()
        };

        try {
            if (editingStudentUid) {
                await api(`students/${encodeURIComponent(editingStudentUid)}`, { method: "PUT", body: payload });
                notice(`Student "${payload.name}" updated successfully.`);
            } else {
                await api("students", { method: "POST", body: payload });
                notice(`Student "${payload.name}" registered successfully.`);
            }
            byId("student-dialog").close();
            await loadStudents();
            await loadDashboard();
        } catch (err) {
            notice(err.message, true);
        }
    });

    // Issue Book Form
    byId("issue-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const payload = {
            bookId: form.elements.bookId.value,
            studentUid: form.elements.studentUid.value,
            issuedOn: form.elements.issuedOn.value
        };

        try {
            const loan = await api("loans", { method: "POST", body: payload });
            notice(`Book issued to ${loan.studentName}. Due on ${formatDate(loan.dueOn)}.`);
            byId("issue-dialog").close();
            await loadLoans();
            await loadDashboard();
        } catch (err) {
            notice(err.message, true);
        }
    });

    // Return Book Form
    byId("return-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!selectedLoan) return;
        const form = e.currentTarget;
        const payload = { returnedOn: form.elements.returnedOn.value };

        try {
            const loan = await api(`loans/${selectedLoan.id}/return`, { method: "POST", body: payload });
            const fineNotice = loan.fine && parseFloat(loan.fine) > 0 ? ` Overdue fine: ${formatMoney(loan.fine)}.` : " No fine.";
            notice(`Book "${loan.title}" returned successfully.${fineNotice}`);
            byId("return-dialog").close();
            await loadLoans();
            await loadDashboard();
        } catch (err) {
            notice(err.message, true);
        }
    });

    // Settle Fine Form
    byId("pay-fine-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!selectedLoan) return;

        try {
            const loan = await api(`loans/${selectedLoan.id}/pay-fine`, { method: "POST" });
            notice(`Fine of ${formatMoney(loan.fine)} cleared for loan #${loan.id}.`);
            byId("pay-fine-dialog").close();
            await loadLoans();
            await loadDashboard();
        } catch (err) {
            notice(err.message, true);
        }
    });

    // Initialize Sortable Tables
    initSortableTable("books-table");
    initSortableTable("students-table");
}

function debounce(fn, ms) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

// --- BOOTSTRAP ---
document.addEventListener("DOMContentLoaded", async () => {
    initTheme();
    initEvents();
    await navigate("dashboard");
});
