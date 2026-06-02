"""Flask app factory + dev entry point.

Run locally:
    cd backend
    python -m venv .venv && source .venv/bin/activate
    pip install -r requirements.txt
    cp .env.example .env   # then fill in GOOGLE_CLIENT_ID etc.
    python app.py          # http://localhost:5000

Run in production (Render):
    gunicorn --workers=2 --bind 0.0.0.0:$PORT 'backend.app:create_app()'
"""
import os

from flask import Flask, jsonify
from flask_cors import CORS

from .config import Config
from .db import db


def create_app(config_class=Config) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Database
    db.init_app(app)
    with app.app_context():
        # SQLAlchemy creates tables on first run. Use Alembic when the schema
        # starts changing meaningfully.
        from . import models  # noqa: F401 — register tables
        db.create_all()

    # CORS — cookies need explicit allow-list + credentials=True
    CORS(
        app,
        resources={r"/api/*": {"origins": app.config["FRONTEND_ORIGINS"]}},
        supports_credentials=True,
    )

    # Blueprints
    from .auth import bp as auth_bp
    from .flags import bp as flags_bp
    from .wishlist import bp as wishlist_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(flags_bp)
    app.register_blueprint(wishlist_bp)

    # Health check (Render pings this)
    @app.route("/health")
    def health():
        return jsonify(status="ok")

    # Friendly 404 in JSON shape
    @app.errorhandler(404)
    def not_found(_e):
        return jsonify(error="not_found", message="Route not found."), 404

    return app


if __name__ == "__main__":
    # Local dev only — production uses gunicorn via the Procfile.
    application = create_app()
    application.run(
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "5000")),
        debug=os.environ.get("FLASK_DEBUG", "1") == "1",
    )
