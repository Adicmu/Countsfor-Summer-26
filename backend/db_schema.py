"""Tables that must exist before auth can persist across sessions."""

REQUIRED_TABLES = frozenset({
    "users",
    "flags",
    "wishlist_items",
    "password_reset_tokens",
    "user_minors",
    "directory_entries",
})
