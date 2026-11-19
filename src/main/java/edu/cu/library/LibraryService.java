package edu.cu.library;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
public class LibraryService {
    private static final int LOAN_DAYS = 14;
    private static final int MAX_RENEWALS = 2;

    private static final String LOAN_DETAILS = """
            SELECT l.id, l.book_id, b.title, l.student_uid, s.name, l.issued_on,
                   l.due_on, l.returned_on, l.fine, l.fine_paid, l.renewed_count
            FROM loans l
            JOIN books b ON b.id = l.book_id
            JOIN students s ON s.uid = l.student_uid
            """;

    private static final RowMapper<Loan> LOAN_MAPPER = (row, index) -> new Loan(
            row.getLong("id"),
            row.getString("book_id"),
            row.getString("title"),
            row.getString("student_uid"),
            row.getString("name"),
            row.getObject("issued_on", LocalDate.class),
            row.getObject("due_on", LocalDate.class),
            row.getObject("returned_on", LocalDate.class),
            row.getBigDecimal("fine"),
            row.getBoolean("fine_paid"),
            row.getInt("renewed_count")
    );

    private static final RowMapper<Student> STUDENT_MAPPER = (row, index) -> new Student(
            row.getString("uid"),
            row.getString("name"),
            row.getString("email") != null ? row.getString("email") : "",
            row.getString("department") != null ? row.getString("department") : "Computer Science & Engineering",
            row.getString("phone") != null ? row.getString("phone") : ""
    );

    private final JdbcTemplate jdbc;

    public LibraryService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Book addBook(String id, String title, String author) {
        return addBook(id, title, author, "Computer Science", "", "Rack A1", 2024);
    }

    public Book addBook(String id, String title, String author, String category,
                        String isbn, String shelfLocation, Integer publishedYear) {
        String cleanId = identifier(id, "Book ID");
        String cleanTitle = required(title, "Title", 150);
        String cleanAuthor = required(author, "Author", 150);
        String cleanCategory = optional(category, 60, "Computer Science");
        String cleanIsbn = optional(isbn, 30, "");
        String cleanShelf = optional(shelfLocation, 30, "Rack A1");
        int year = publishedYear != null && publishedYear > 1000 && publishedYear <= 2100 ? publishedYear : 2024;

        Book book = new Book(cleanId, cleanTitle, cleanAuthor, cleanCategory, cleanIsbn, cleanShelf, year, true);
        try {
            jdbc.update("""
                    INSERT INTO books (id, title, author, category, isbn, shelf_location, published_year, available)
                    VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)
                    """,
                    book.id(), book.title(), book.author(), book.category(), book.isbn(),
                    book.shelfLocation(), book.publishedYear());
        } catch (DuplicateKeyException exception) {
            throw new ResponseStatusException(CONFLICT, "This book ID already exists.");
        }
        return book;
    }

    public Book updateBook(String id, String title, String author, String category,
                           String isbn, String shelfLocation, Integer publishedYear) {
        String bookId = identifier(id, "Book ID");
        String cleanTitle = required(title, "Title", 150);
        String cleanAuthor = required(author, "Author", 150);
        String cleanCategory = optional(category, 60, "Computer Science");
        String cleanIsbn = optional(isbn, 30, "");
        String cleanShelf = optional(shelfLocation, 30, "Rack A1");
        int year = publishedYear != null && publishedYear > 1000 && publishedYear <= 2100 ? publishedYear : 2024;

        int updated = jdbc.update("""
                UPDATE books SET title = ?, author = ?, category = ?, isbn = ?, shelf_location = ?, published_year = ?
                WHERE id = ?
                """, cleanTitle, cleanAuthor, cleanCategory, cleanIsbn, cleanShelf, year, bookId);

        if (updated == 0) {
            throw new ResponseStatusException(NOT_FOUND, "Book was not found.");
        }
        boolean available = jdbc.queryForObject("SELECT available FROM books WHERE id = ?", Boolean.class, bookId);
        return new Book(bookId, cleanTitle, cleanAuthor, cleanCategory, cleanIsbn, cleanShelf, year, available);
    }

    @Transactional
    public void deleteBook(String id) {
        String bookId = identifier(id, "Book ID");
        Boolean onLoan = jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM loans WHERE book_id = ? AND returned_on IS NULL)",
                Boolean.class, bookId);
        if (Boolean.TRUE.equals(onLoan)) {
            throw new ResponseStatusException(CONFLICT, "Cannot delete book because it is currently on loan.");
        }
        jdbc.update("DELETE FROM loans WHERE book_id = ?", bookId);
        int deleted = jdbc.update("DELETE FROM books WHERE id = ?", bookId);
        if (deleted == 0) {
            throw new ResponseStatusException(NOT_FOUND, "Book was not found.");
        }
    }

    public Student registerStudent(String uid, String name) {
        return registerStudent(uid, name, "", "Computer Science & Engineering", "");
    }

    public Student registerStudent(String uid, String name, String email, String department, String phone) {
        String cleanUid = identifier(uid, "Student UID");
        String cleanName = required(name, "Name", 150);
        String cleanEmail = optional(email, 120, "");
        String cleanDept = optional(department, 80, "Computer Science & Engineering");
        String cleanPhone = optional(phone, 25, "");

        Student student = new Student(cleanUid, cleanName, cleanEmail, cleanDept, cleanPhone);
        try {
            jdbc.update("INSERT INTO students (uid, name, email, department, phone) VALUES (?, ?, ?, ?, ?)",
                    student.uid(), student.name(), student.email(), student.department(), student.phone());
        } catch (DuplicateKeyException exception) {
            throw new ResponseStatusException(CONFLICT, "This student UID is already registered.");
        }
        return student;
    }

    public Student updateStudent(String uid, String name, String email, String department, String phone) {
        String studentUid = identifier(uid, "Student UID");
        String cleanName = required(name, "Name", 150);
        String cleanEmail = optional(email, 120, "");
        String cleanDept = optional(department, 80, "Computer Science & Engineering");
        String cleanPhone = optional(phone, 25, "");

        int updated = jdbc.update("""
                UPDATE students SET name = ?, email = ?, department = ?, phone = ?
                WHERE uid = ?
                """, cleanName, cleanEmail, cleanDept, cleanPhone, studentUid);

        if (updated == 0) {
            throw new ResponseStatusException(NOT_FOUND, "Student was not found.");
        }
        return new Student(studentUid, cleanName, cleanEmail, cleanDept, cleanPhone);
    }

    @Transactional
    public void deleteStudent(String uid) {
        String studentUid = identifier(uid, "Student UID");
        Boolean activeLoan = jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM loans WHERE student_uid = ? AND returned_on IS NULL)",
                Boolean.class, studentUid);
        if (Boolean.TRUE.equals(activeLoan)) {
            throw new ResponseStatusException(CONFLICT, "Cannot delete student with active book loans.");
        }
        jdbc.update("DELETE FROM loans WHERE student_uid = ?", studentUid);
        int deleted = jdbc.update("DELETE FROM students WHERE uid = ?", studentUid);
        if (deleted == 0) {
            throw new ResponseStatusException(NOT_FOUND, "Student was not found.");
        }
    }

    public List<Student> students() {
        return students(null);
    }

    public List<Student> students(String query) {
        if (query == null || query.isBlank()) {
            return jdbc.query("SELECT uid, name, email, department, phone FROM students ORDER BY name, uid", STUDENT_MAPPER);
        }
        String term = "%" + query.strip().toLowerCase(Locale.ROOT) + "%";
        return jdbc.query("""
                SELECT uid, name, email, department, phone FROM students
                WHERE LOWER(uid) LIKE ? OR LOWER(name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(department) LIKE ?
                ORDER BY name, uid
                """, STUDENT_MAPPER, term, term, term, term);
    }

    public List<Loan> loans(String studentUid, String status) {
        StringBuilder sql = new StringBuilder(LOAN_DETAILS);
        boolean hasStudent = studentUid != null && !studentUid.isBlank();
        boolean hasStatus = status != null && !status.isBlank() && !status.equalsIgnoreCase("ALL");

        if (hasStudent || hasStatus) {
            sql.append(" WHERE ");
            boolean first = true;
            if (hasStudent) {
                sql.append(" l.student_uid = ? ");
                first = false;
            }
            if (hasStatus) {
                if (!first) sql.append(" AND ");
                if (status.equalsIgnoreCase("ACTIVE")) {
                    sql.append(" l.returned_on IS NULL ");
                } else if (status.equalsIgnoreCase("OVERDUE")) {
                    sql.append(" l.returned_on IS NULL AND l.due_on < CURRENT_DATE ");
                } else if (status.equalsIgnoreCase("RETURNED")) {
                    sql.append(" l.returned_on IS NOT NULL ");
                }
            }
        }

        sql.append(" ORDER BY CASE WHEN l.returned_on IS NULL THEN 0 ELSE 1 END, l.id DESC");

        if (hasStudent) {
            return jdbc.query(sql.toString(), LOAN_MAPPER, identifier(studentUid, "Student UID"));
        } else {
            return jdbc.query(sql.toString(), LOAN_MAPPER);
        }
    }

    public List<Loan> loans(String studentUid) {
        return loans(studentUid, null);
    }

    @Transactional
    public Loan issue(String bookId, String studentUid, LocalDate issuedOn) {
        String book = identifier(bookId, "Book ID");
        String student = identifier(studentUid, "Student UID");
        validateDate(issuedOn, "Issue date");

        if (!jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM students WHERE uid = ?)", Boolean.class, student)) {
            throw new ResponseStatusException(NOT_FOUND, "Student UID was not found.");
        }
        int updated = jdbc.update("UPDATE books SET available = FALSE WHERE id = ? AND available = TRUE", book);
        if (updated == 0) {
            if (!jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM books WHERE id = ?)", Boolean.class, book)) {
                throw new ResponseStatusException(NOT_FOUND, "Book ID was not found.");
            }
            throw new ResponseStatusException(CONFLICT, "This book is already on loan.");
        }

        jdbc.update("INSERT INTO loans (book_id, student_uid, issued_on, due_on, fine_paid, renewed_count) VALUES (?, ?, ?, ?, FALSE, 0)",
                book, student, issuedOn, issuedOn.plusDays(LOAN_DAYS));
        return jdbc.queryForObject(LOAN_DETAILS + " WHERE l.book_id = ? AND l.returned_on IS NULL",
                LOAN_MAPPER, book);
    }

    @Transactional
    public Loan returnBook(long loanId, LocalDate returnedOn) {
        validateDate(returnedOn, "Return date");
        Loan loan = loanById(loanId);
        if (returnedOn.isBefore(loan.issuedOn())) {
            throw new ResponseStatusException(BAD_REQUEST, "Return date cannot be before the issue date.");
        }
        BigDecimal calculatedFine = loan.calculateFine(returnedOn);
        boolean autoPaid = calculatedFine.compareTo(BigDecimal.ZERO) == 0;
        int updated = jdbc.update(
                "UPDATE loans SET returned_on = ?, fine = ?, fine_paid = ? WHERE id = ? AND returned_on IS NULL",
                returnedOn, calculatedFine, autoPaid, loanId);
        if (updated == 0) {
            throw new ResponseStatusException(CONFLICT, "This loan has already been returned.");
        }
        jdbc.update("UPDATE books SET available = TRUE WHERE id = ?", loan.bookId());
        return loanById(loanId);
    }

    @Transactional
    public Loan renewLoan(long loanId) {
        Loan loan = loanById(loanId);
        if (loan.returnedOn() != null) {
            throw new ResponseStatusException(BAD_REQUEST, "Cannot renew a book that has already been returned.");
        }
        if (loan.renewedCount() >= MAX_RENEWALS) {
            throw new ResponseStatusException(BAD_REQUEST, "Maximum renewal limit (" + MAX_RENEWALS + ") reached for this loan.");
        }
        LocalDate newDueOn = loan.dueOn().plusDays(LOAN_DAYS);
        jdbc.update("UPDATE loans SET due_on = ?, renewed_count = renewed_count + 1 WHERE id = ?",
                newDueOn, loanId);
        return loanById(loanId);
    }

    @Transactional
    public Loan payFine(long loanId) {
        Loan loan = loanById(loanId);
        if (loan.returnedOn() == null) {
            throw new ResponseStatusException(BAD_REQUEST, "Cannot pay fine on an open loan.");
        }
        if (loan.fine() == null || loan.fine().compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(BAD_REQUEST, "No fine is outstanding for this loan.");
        }
        jdbc.update("UPDATE loans SET fine_paid = TRUE WHERE id = ?", loanId);
        return loanById(loanId);
    }

    public Map<String, Object> dashboardStats() {
        int totalBooks = jdbc.queryForObject("SELECT COUNT(*) FROM books", Integer.class);
        int availableBooks = jdbc.queryForObject("SELECT COUNT(*) FROM books WHERE available = TRUE", Integer.class);
        int onLoanBooks = totalBooks - availableBooks;
        int totalStudents = jdbc.queryForObject("SELECT COUNT(*) FROM students", Integer.class);
        int activeLoans = jdbc.queryForObject("SELECT COUNT(*) FROM loans WHERE returned_on IS NULL", Integer.class);
        int overdueLoans = jdbc.queryForObject(
                "SELECT COUNT(*) FROM loans WHERE returned_on IS NULL AND due_on < CURRENT_DATE",
                Integer.class);
        BigDecimal totalFinesCollected = jdbc.queryForObject(
                "SELECT COALESCE(SUM(fine), 0) FROM loans WHERE returned_on IS NOT NULL AND fine_paid = TRUE",
                BigDecimal.class);
        BigDecimal pendingFines = jdbc.queryForObject(
                "SELECT COALESCE(SUM(fine), 0) FROM loans WHERE returned_on IS NOT NULL AND fine_paid = FALSE",
                BigDecimal.class);

        List<Map<String, Object>> topBooks = jdbc.queryForList("""
                SELECT b.id, b.title, b.author, COUNT(l.id) AS borrow_count
                FROM loans l
                JOIN books b ON b.id = l.book_id
                GROUP BY b.id, b.title, b.author
                ORDER BY borrow_count DESC, b.title
                LIMIT 5
                """);

        List<Map<String, Object>> recentActivity = jdbc.queryForList("""
                SELECT l.id, l.book_id, b.title, l.student_uid, s.name,
                       l.issued_on, l.due_on, l.returned_on, l.fine, l.fine_paid
                FROM loans l
                JOIN books b ON b.id = l.book_id
                JOIN students s ON s.uid = l.student_uid
                ORDER BY l.id DESC
                LIMIT 8
                """);

        return Map.of(
                "totalBooks", totalBooks,
                "availableBooks", availableBooks,
                "onLoanBooks", onLoanBooks,
                "totalStudents", totalStudents,
                "activeLoans", activeLoans,
                "overdueLoans", overdueLoans,
                "finesCollected", totalFinesCollected,
                "pendingFines", pendingFines,
                "topBooks", topBooks,
                "recentActivity", recentActivity
        );
    }

    private Loan loanById(long loanId) {
        return jdbc.query(LOAN_DETAILS + " WHERE l.id = ?", LOAN_MAPPER, loanId)
                .stream().findFirst()
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Loan was not found."));
    }

    private static String identifier(String value, String label) {
        String normalized = required(value, label, 40).toUpperCase(Locale.ROOT);
        return required(normalized, label, 40);
    }

    private static String required(String value, String label, int maxLength) {
        if (value == null || value.isBlank() || value.strip().length() > maxLength) {
            throw new ResponseStatusException(BAD_REQUEST, label + " must contain 1 to " + maxLength + " characters.");
        }
        return value.strip();
    }

    private static String optional(String value, int maxLength, String fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        String stripped = value.strip();
        return stripped.length() > maxLength ? stripped.substring(0, maxLength) : stripped;
    }

    private static void validateDate(LocalDate date, String label) {
        if (date == null || date.isBefore(LocalDate.of(1900, 1, 1)) || date.isAfter(LocalDate.now())) {
            throw new ResponseStatusException(BAD_REQUEST, label + " must be between 1900 and today.");
        }
    }
}
