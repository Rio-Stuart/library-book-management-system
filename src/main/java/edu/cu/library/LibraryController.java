package edu.cu.library;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class LibraryController {
    private final BookRepository books;
    private final LibraryService library;

    public LibraryController(BookRepository books, LibraryService library) {
        this.books = books;
        this.library = library;
    }

    @GetMapping("/dashboard")
    public Map<String, Object> dashboard() {
        return library.dashboardStats();
    }

    @GetMapping("/books")
    public List<Book> books(@RequestParam(name = "query", defaultValue = "") String query,
                            @RequestParam(name = "category", required = false) String category) {
        return books.search(query, category);
    }

    @GetMapping("/books/categories")
    public List<String> categories() {
        return books.categories();
    }

    @PostMapping("/books")
    @ResponseStatus(HttpStatus.CREATED)
    public Book addBook(@RequestBody BookRequest book) {
        return library.addBook(book.id(), book.title(), book.author(), book.category(),
                book.isbn(), book.shelfLocation(), book.publishedYear());
    }

    @PutMapping("/books/{id}")
    public Book updateBook(@PathVariable("id") String id, @RequestBody BookRequest book) {
        return library.updateBook(id, book.title(), book.author(), book.category(),
                book.isbn(), book.shelfLocation(), book.publishedYear());
    }

    @DeleteMapping("/books/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteBook(@PathVariable("id") String id) {
        library.deleteBook(id);
    }

    @GetMapping("/students")
    public List<Student> students(@RequestParam(name = "query", defaultValue = "") String query) {
        return library.students(query);
    }

    @PostMapping("/students")
    @ResponseStatus(HttpStatus.CREATED)
    public Student register(@RequestBody StudentRequest student) {
        return library.registerStudent(student.uid(), student.name(), student.email(),
                student.department(), student.phone());
    }

    @PutMapping("/students/{uid}")
    public Student updateStudent(@PathVariable("uid") String uid, @RequestBody StudentRequest student) {
        return library.updateStudent(uid, student.name(), student.email(),
                student.department(), student.phone());
    }

    @DeleteMapping("/students/{uid}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteStudent(@PathVariable("uid") String uid) {
        library.deleteStudent(uid);
    }

    @GetMapping("/loans")
    public List<Loan> loans(@RequestParam(name = "studentUid", required = false) String studentUid,
                            @RequestParam(name = "status", required = false) String status) {
        return library.loans(studentUid, status);
    }

    @PostMapping("/loans")
    @ResponseStatus(HttpStatus.CREATED)
    public Loan issue(@RequestBody NewLoan loan) {
        return library.issue(loan.bookId(), loan.studentUid(), loan.issuedOn());
    }

    @PostMapping("/loans/{id}/return")
    public Loan returnBook(@PathVariable("id") long id, @RequestBody BookReturn request) {
        return library.returnBook(id, request.returnedOn());
    }

    @PostMapping("/loans/{id}/renew")
    public Loan renewLoan(@PathVariable("id") long id) {
        return library.renewLoan(id);
    }

    @PostMapping("/loans/{id}/pay-fine")
    public Loan payFine(@PathVariable("id") long id) {
        return library.payFine(id);
    }

    @GetMapping("/export/books.csv")
    public ResponseEntity<byte[]> exportBooks() {
        StringBuilder csv = new StringBuilder("ID,Title,Author,Category,ISBN,Shelf,Year,Available\n");
        for (Book b : books.search("")) {
            csv.append(escapeCsv(b.id())).append(",")
               .append(escapeCsv(b.title())).append(",")
               .append(escapeCsv(b.author())).append(",")
               .append(escapeCsv(b.category())).append(",")
               .append(escapeCsv(b.isbn())).append(",")
               .append(escapeCsv(b.shelfLocation())).append(",")
               .append(b.publishedYear() != null ? b.publishedYear() : "").append(",")
               .append(b.available() ? "Yes" : "No").append("\n");
        }
        return fileDownload(csv.toString(), "library_books.csv");
    }

    @GetMapping("/export/students.csv")
    public ResponseEntity<byte[]> exportStudents() {
        StringBuilder csv = new StringBuilder("UID,Name,Email,Department,Phone\n");
        for (Student s : library.students()) {
            csv.append(escapeCsv(s.uid())).append(",")
               .append(escapeCsv(s.name())).append(",")
               .append(escapeCsv(s.email())).append(",")
               .append(escapeCsv(s.department())).append(",")
               .append(escapeCsv(s.phone())).append("\n");
        }
        return fileDownload(csv.toString(), "library_students.csv");
    }

    @GetMapping("/export/loans.csv")
    public ResponseEntity<byte[]> exportLoans() {
        StringBuilder csv = new StringBuilder("Loan ID,Book ID,Book Title,Student UID,Student Name,Issued On,Due On,Returned On,Fine,Fine Paid,Renewals\n");
        for (Loan l : library.loans(null)) {
            csv.append(l.id()).append(",")
               .append(escapeCsv(l.bookId())).append(",")
               .append(escapeCsv(l.title())).append(",")
               .append(escapeCsv(l.studentUid())).append(",")
               .append(escapeCsv(l.studentName())).append(",")
               .append(l.issuedOn()).append(",")
               .append(l.dueOn()).append(",")
               .append(l.returnedOn() != null ? l.returnedOn().toString() : "").append(",")
               .append(l.fine() != null ? l.fine().toString() : "0.00").append(",")
               .append(l.finePaid() ? "Paid" : "Pending").append(",")
               .append(l.renewedCount()).append("\n");
        }
        return fileDownload(csv.toString(), "library_loans.csv");
    }

    private static ResponseEntity<byte[]> fileDownload(String content, String filename) {
        byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                .body(bytes);
    }

    private static String escapeCsv(String value) {
        if (value == null) return "";
        if (value.contains(",") || value.contains("\"") || value.contains("\n")) {
            return "\"" + value.replace("\"", "\"\"") + "\"";
        }
        return value;
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> invalidOperation(ResponseStatusException exception) {
        return ResponseEntity.status(exception.getStatusCode()).body(Map.of("message", exception.getReason()));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, String>> invalidRequest() {
        return ResponseEntity.badRequest().body(Map.of("message", "Enter valid fields and dates in YYYY-MM-DD format."));
    }

    public record BookRequest(String id, String title, String author, String category,
                              String isbn, String shelfLocation, Integer publishedYear) {}
    public record StudentRequest(String uid, String name, String email, String department, String phone) {}
    public record NewLoan(String bookId, String studentUid, LocalDate issuedOn) {}
    public record BookReturn(LocalDate returnedOn) {}
}
