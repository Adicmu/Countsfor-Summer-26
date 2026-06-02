"""SQLAlchemy instance — imported by app.py and models.py.

Kept in its own module to avoid circular imports between the Flask app and
the model definitions.
"""
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()
