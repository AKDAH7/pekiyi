/** Postgres unique-constraint violation (also when wrapped by Drizzle). */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  for (let current = error; current instanceof Object; ) {
    if ("code" in current && current.code === "23505") {
      return (
        constraint === undefined ||
        ("constraint_name" in current && current.constraint_name === constraint)
      );
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

/** Postgres foreign-key violation, e.g. deleting a model that orders still use. */
export function isForeignKeyViolation(error: unknown): boolean {
  for (let current = error; current instanceof Object; ) {
    if ("code" in current && current.code === "23503") return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}
