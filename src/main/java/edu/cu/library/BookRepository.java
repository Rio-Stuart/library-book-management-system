package edu.cu.library;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import javax.sql.DataSource;
import org.springframework.jdbc.UncategorizedSQLException;
import org.springframework.stereotype.Repository;

@Repository
public class BookRepository {
    private static final String SEARCH_BASE = """
            SELECT id, title, author, category, isbn, shelf_location, published_year, available
            FROM books
            WHERE (LOCATE(?, LOWER(id)) > 0 OR LOCATE(?, LOWER(title)) > 0
               OR LOCATE(?, LOWER(author)) > 0 OR LOCATE(?, LOWER(COALESCE(isbn, ''))) > 0
               OR LOCATE(?, LOWER(COALESCE(category, ''))) > 0)
            """;

    private final DataSource dataSource;

    public BookRepository(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    public List<Book> search(String query) {
        return search(query, null);
    }

    public List<Book> search(String query, String category) {
        String term = query == null ? "" : query.strip().toLowerCase(Locale.ROOT);
        boolean hasCategory = category != null && !category.isBlank() && !category.equalsIgnoreCase("ALL");
        String sql = SEARCH_BASE + (hasCategory ? " AND LOWER(category) = ? " : "") + " ORDER BY title, id";

        List<Book> books = new ArrayList<>();
        // Traditional JDBC: manage the connection, parameters, and result mapping explicitly.
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, term);
            statement.setString(2, term);
            statement.setString(3, term);
            statement.setString(4, term);
            statement.setString(5, term);
            if (hasCategory) {
                statement.setString(6, category.strip().toLowerCase(Locale.ROOT));
            }

            try (ResultSet rows = statement.executeQuery()) {
                while (rows.next()) {
                    books.add(mapBook(rows));
                }
            }
        } catch (SQLException exception) {
            throw new UncategorizedSQLException("Search books", sql, exception);
        }
        return books;
    }

    public Optional<Book> findById(String id) {
        String sql = "SELECT id, title, author, category, isbn, shelf_location, published_year, available FROM books WHERE id = ?";
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, id.strip().toUpperCase(Locale.ROOT));
            try (ResultSet rows = statement.executeQuery()) {
                if (rows.next()) {
                    return Optional.of(mapBook(rows));
                }
            }
        } catch (SQLException exception) {
            throw new UncategorizedSQLException("Find book by ID", sql, exception);
        }
        return Optional.empty();
    }

    public List<String> categories() {
        String sql = "SELECT DISTINCT category FROM books WHERE category IS NOT NULL AND category <> '' ORDER BY category";
        List<String> list = new ArrayList<>();
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql);
             ResultSet rows = statement.executeQuery()) {
            while (rows.next()) {
                list.add(rows.getString(1));
            }
        } catch (SQLException exception) {
            throw new UncategorizedSQLException("List categories", sql, exception);
        }
        return list;
    }

    private static Book mapBook(ResultSet rows) throws SQLException {
        int year = rows.getInt("published_year");
        Integer publishedYear = rows.wasNull() ? null : year;
        return new Book(
                rows.getString("id"),
                rows.getString("title"),
                rows.getString("author"),
                rows.getString("category") != null ? rows.getString("category") : "General",
                rows.getString("isbn") != null ? rows.getString("isbn") : "",
                rows.getString("shelf_location") != null ? rows.getString("shelf_location") : "A1",
                publishedYear,
                rows.getBoolean("available")
        );
    }
}
