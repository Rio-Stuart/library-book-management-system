package edu.cu.library;

public record Student(
        String uid,
        String name,
        String email,
        String department,
        String phone
) {
    public Student(String uid, String name) {
        this(uid, name, "", "Computer Science & Engineering", "");
    }
}
