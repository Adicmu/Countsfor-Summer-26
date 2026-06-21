"""One-shot database bootstrap for Render pre-deploy.

Render runs this once before gunicorn starts so workers do not race on
ALTER TABLE and the web process can bind to $PORT immediately.
"""
from .app import create_app, init_database


def main() -> None:
    app = create_app(bootstrap_db=False)
    logs = init_database(app)
    for line in logs:
        print(line)
    print("Database bootstrap OK")


if __name__ == "__main__":
    main()
