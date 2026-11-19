package edu.cu.library;

public record Book(
        String id,
        String title,
        String author,
        String category,
        String isbn,
        String shelfLocation,
        Integer publishedYear,
        boolean available
) {
    public Book(String id, String title, String author, boolean available) {
        this(id, title, author, "Computer Science", "", "Rack A1", 2024, available);
    }
}
