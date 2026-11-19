# Library Book Management and Fine Calculation System

An enterprise-ready university library circulation and fine management system built with **Java 17 / 26**, **Spring Boot**, **JDBC**, **H2 Database**, and a responsive **Modern Web Dashboard**.

---

## Key Features

1. **Circulation Dashboard**:
   - Real-time KPI statistics: Total Books, Available vs. On Loan, Registered Borrowers, Active Loans, Overdue Counter, and Total Fines (Collected vs. Pending).
   - Top 5 Most Borrowed Books leaderboard.
   - Live activity stream of recent loan issues and returns.
   - Quick action shortcuts for desk operators.

2. **Catalog Management**:
   - Multi-field search across Book ID, Title, Author, Category, and ISBN.
   - Category filtering (Computer Science, Software Engineering, AI & Data Science, Systems & Networks, Mathematics, Science & General).
   - Availability filtering (Available Only vs. On Loan).
   - Full CRUD: Add new titles, edit existing books, delete books (with active loan safety constraints).
   - Instant "Issue" button from catalog rows for available copies.

3. **Student Borrower Directory**:
   - Registered student borrowers with University UID, Name, Email, Department, and Phone.
   - Real-time search across all student fields.
   - Full CRUD: Register student, edit profile, and remove accounts (with active loan guards).
   - One-click **View History** shortcut that jumps directly into the student's circulation record with a personalized profile banner.

4. **Circulation, Renewals & Fine Calculation**:
   - 14-day standard lending period.
   - **Loan Renewal**: Extend active loans by an additional 14 days directly from the desk (up to 2 renewals per loan).
   - **Dynamic Interactive Return Dialog**: Live fine calculation preview showing overdue duration and ₹5.00/day fine formula.
   - **Fine Settlement**: Mark overdue fines as paid/settled with receipt confirmation.
   - Status tabs: All Loans, Active Loans, Overdue Only, and Returned History.

5. **Reports & Data Export**:
   - Instant CSV exports for **Books Catalog**, **Student Directory**, and **Circulation History**.
   - Print-optimized stylesheet for audit summaries (`window.print()`).

6. **Modern Web UI & Accessibility**:
   - Built with modern web standards (Semantic HTML5, CSS custom properties, responsive container layouts).
   - Accessible `<dialog closedby="any">` modals with backdrop blur and light-dismiss fallbacks.
   - Sortable table columns with ARIA live announcements.
   - Light and Dark mode theme switch with `localStorage` persistence.
   - Toast notification feedback system.

---

## How to Run on Windows

1. Install Java 17 or later and ensure `java -version` works in your terminal.
2. Double-click `Start-Library.bat`.
3. Open [http://localhost:8080](http://localhost:8080) in your web browser.
4. Press `Ctrl+C` in the terminal to stop the application.

If building from source with Maven:
```sh
mvn clean package
java -jar target/library-book-system-1.0.0.jar
```
Or run directly in development mode:
```sh
mvn spring-boot:run
```

---

## Technical Architecture & Java Concepts

| Concept | Implementation in Project |
| :--- | :--- |
| **Java Records & Domain Modeling** | `Book.java`, `Student.java`, and `Loan.java` records with compact encapsulation and fine calculation logic |
| **Direct JDBC Data Access** | `BookRepository.java` uses `Connection`, `PreparedStatement`, and `ResultSet` to query and filter catalog books |
| **Spring JDBC & Declarative Transactions** | `LibraryService.java` manages student registration, loan issuing, renewals, returns, fine payments, and ACID transactions using `JdbcTemplate` and `@Transactional` |
| **REST API Controller** | `LibraryController.java` exposes RESTful endpoints for dashboard stats, catalog, students, circulation, and CSV streaming |
| **Relational Database & Migrations** | `src/main/resources/schema.sql` and `src/main/resources/data.sql` with safe `IF NOT EXISTS` and `MERGE INTO` scripts for H2 |
| **Modern Frontend & Accessible Overlays** | `static/index.html`, `static/styles.css`, and `static/app.js` with responsive layouts, native `<dialog>`, sortable tables, and dark theme |
