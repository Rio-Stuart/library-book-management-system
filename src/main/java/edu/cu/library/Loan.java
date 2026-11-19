package edu.cu.library;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

public record Loan(
        long id,
        String bookId,
        String title,
        String studentUid,
        String studentName,
        LocalDate issuedOn,
        LocalDate dueOn,
        LocalDate returnedOn,
        BigDecimal fine,
        boolean finePaid,
        int renewedCount
) {
    private static final BigDecimal DAILY_FINE = new BigDecimal("5.00");

    public Loan(long id, String bookId, String title, String studentUid, String studentName,
                LocalDate issuedOn, LocalDate dueOn, LocalDate returnedOn, BigDecimal fine) {
        this(id, bookId, title, studentUid, studentName, issuedOn, dueOn, returnedOn, fine, false, 0);
    }

    public BigDecimal calculateFine(LocalDate returnDate) {
        long overdueDays = Math.max(0, ChronoUnit.DAYS.between(dueOn, returnDate));
        return DAILY_FINE.multiply(BigDecimal.valueOf(overdueDays));
    }
}
