"""initial_schema

Revision ID: f187b420f5c0
Revises: 
Create Date: 2026-09-09 15:39:25.480864

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f187b420f5c0'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema safely checking table existence."""
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing_tables = set(insp.get_table_names())

    if 'users' not in existing_tables:
        op.create_table('users',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('username', sa.String(length=50), nullable=False),
            sa.Column('email', sa.String(length=120), nullable=False),
            sa.Column('password_hash', sa.String(length=255), nullable=False),
            sa.Column('avatar', sa.String(length=255), nullable=True),
            sa.Column('coins', sa.Integer(), nullable=True),
            sa.Column('level', sa.Integer(), nullable=True),
            sa.Column('rating', sa.Integer(), nullable=True),
            sa.Column('rank', sa.String(length=30), nullable=True),
            sa.Column('highest_rank', sa.String(length=30), nullable=True),
            sa.Column('welcome_bonus_claimed', sa.Boolean(), nullable=True),
            sa.Column('xp', sa.Integer(), nullable=True),
            sa.Column('wins', sa.Integer(), nullable=True),
            sa.Column('losses', sa.Integer(), nullable=True),
            sa.Column('current_streak', sa.Integer(), nullable=True),
            sa.Column('best_streak', sa.Integer(), nullable=True),
            sa.Column('last_daily_bonus', sa.DateTime(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('last_seen', sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
        op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)
        op.create_index(op.f('ix_users_username'), 'users', ['username'], unique=True)

    if 'coin_transactions' not in existing_tables:
        op.create_table('coin_transactions',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('amount', sa.Integer(), nullable=False),
            sa.Column('balance_after', sa.Integer(), nullable=False),
            sa.Column('transaction_type', sa.String(length=50), nullable=False),
            sa.Column('reference_id', sa.String(length=100), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_coin_transactions_created_at'), 'coin_transactions', ['created_at'], unique=False)
        op.create_index(op.f('ix_coin_transactions_id'), 'coin_transactions', ['id'], unique=False)
        op.create_index(op.f('ix_coin_transactions_reference_id'), 'coin_transactions', ['reference_id'], unique=False)
        op.create_index(op.f('ix_coin_transactions_transaction_type'), 'coin_transactions', ['transaction_type'], unique=False)
        op.create_index(op.f('ix_coin_transactions_user_id'), 'coin_transactions', ['user_id'], unique=False)

    if 'friendships' not in existing_tables:
        op.create_table('friendships',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('requester_id', sa.Integer(), nullable=False),
            sa.Column('receiver_id', sa.Integer(), nullable=False),
            sa.Column('status', sa.String(length=20), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['receiver_id'], ['users.id'], ),
            sa.ForeignKeyConstraint(['requester_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_friendships_id'), 'friendships', ['id'], unique=False)

    if 'rooms' not in existing_tables:
        op.create_table('rooms',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('room_code', sa.String(length=8), nullable=False),
            sa.Column('player1_id', sa.Integer(), nullable=False),
            sa.Column('player2_id', sa.Integer(), nullable=True),
            sa.Column('status', sa.String(length=30), nullable=True),
            sa.Column('is_private', sa.Boolean(), nullable=True),
            sa.Column('entry_fee', sa.Integer(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('expires_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['player1_id'], ['users.id'], ),
            sa.ForeignKeyConstraint(['player2_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_rooms_id'), 'rooms', ['id'], unique=False)
        op.create_index(op.f('ix_rooms_room_code'), 'rooms', ['room_code'], unique=True)

    if 'tournaments' not in existing_tables:
        op.create_table('tournaments',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('name', sa.String(length=100), nullable=True),
            sa.Column('status', sa.String(length=30), nullable=True),
            sa.Column('max_players', sa.Integer(), nullable=True),
            sa.Column('current_players', sa.Integer(), nullable=True),
            sa.Column('winner_id', sa.Integer(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('started_at', sa.DateTime(), nullable=True),
            sa.Column('finished_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['winner_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_tournaments_id'), 'tournaments', ['id'], unique=False)

    if 'chat_messages' not in existing_tables:
        op.create_table('chat_messages',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('room_id', sa.Integer(), nullable=False),
            sa.Column('sender_id', sa.Integer(), nullable=True),
            sa.Column('message', sa.String(length=500), nullable=False),
            sa.Column('is_system', sa.Boolean(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['room_id'], ['rooms.id'], ),
            sa.ForeignKeyConstraint(['sender_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_chat_messages_id'), 'chat_messages', ['id'], unique=False)

    if 'games' not in existing_tables:
        op.create_table('games',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('room_id', sa.Integer(), nullable=False),
            sa.Column('player1_id', sa.Integer(), nullable=False),
            sa.Column('player2_id', sa.Integer(), nullable=False),
            sa.Column('player1_word_length', sa.Integer(), nullable=False),
            sa.Column('player2_word_length', sa.Integer(), nullable=False),
            sa.Column('winner_id', sa.Integer(), nullable=True),
            sa.Column('status', sa.String(length=30), nullable=True),
            sa.Column('started_at', sa.DateTime(), nullable=True),
            sa.Column('ended_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['player1_id'], ['users.id'], ),
            sa.ForeignKeyConstraint(['player2_id'], ['users.id'], ),
            sa.ForeignKeyConstraint(['room_id'], ['rooms.id'], ),
            sa.ForeignKeyConstraint(['winner_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_games_id'), 'games', ['id'], unique=False)

    if 'tournament_participants' not in existing_tables:
        op.create_table('tournament_participants',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('tournament_id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('seed', sa.Integer(), nullable=True),
            sa.Column('status', sa.String(length=30), nullable=True),
            sa.Column('eliminated', sa.Boolean(), nullable=True),
            sa.Column('placement', sa.Integer(), nullable=True),
            sa.Column('coins_awarded', sa.Integer(), nullable=True),
            sa.Column('xp_awarded', sa.Integer(), nullable=True),
            sa.Column('joined_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['tournament_id'], ['tournaments.id'], ),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_tournament_participants_id'), 'tournament_participants', ['id'], unique=False)
        op.create_index(op.f('ix_tournament_participants_tournament_id'), 'tournament_participants', ['tournament_id'], unique=False)
        op.create_index(op.f('ix_tournament_participants_user_id'), 'tournament_participants', ['user_id'], unique=False)

    if 'guesses' not in existing_tables:
        op.create_table('guesses',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('game_id', sa.Integer(), nullable=False),
            sa.Column('player_id', sa.Integer(), nullable=False),
            sa.Column('letter', sa.String(length=20), nullable=False),
            sa.Column('is_full_word', sa.Boolean(), nullable=True),
            sa.Column('result', sa.Boolean(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['game_id'], ['games.id'], ),
            sa.ForeignKeyConstraint(['player_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_guesses_id'), 'guesses', ['id'], unique=False)

    if 'tournament_matches' not in existing_tables:
        op.create_table('tournament_matches',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('tournament_id', sa.Integer(), nullable=False),
            sa.Column('round', sa.Integer(), nullable=False),
            sa.Column('match_number', sa.Integer(), nullable=False),
            sa.Column('player1_id', sa.Integer(), nullable=True),
            sa.Column('player2_id', sa.Integer(), nullable=True),
            sa.Column('winner_id', sa.Integer(), nullable=True),
            sa.Column('room_code', sa.String(length=8), nullable=True),
            sa.Column('game_id', sa.Integer(), nullable=True),
            sa.Column('status', sa.String(length=30), nullable=True),
            sa.Column('next_match_id', sa.Integer(), nullable=True),
            sa.Column('next_match_slot', sa.Integer(), nullable=True),
            sa.Column('checkin_deadline', sa.DateTime(), nullable=True),
            sa.Column('is_forfeit', sa.Boolean(), nullable=True),
            sa.Column('started_at', sa.DateTime(), nullable=True),
            sa.Column('finished_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['game_id'], ['games.id'], ),
            sa.ForeignKeyConstraint(['player1_id'], ['users.id'], ),
            sa.ForeignKeyConstraint(['player2_id'], ['users.id'], ),
            sa.ForeignKeyConstraint(['tournament_id'], ['tournaments.id'], ),
            sa.ForeignKeyConstraint(['winner_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_tournament_matches_id'), 'tournament_matches', ['id'], unique=False)
        op.create_index(op.f('ix_tournament_matches_tournament_id'), 'tournament_matches', ['tournament_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema safely checking table existence."""
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing_tables = set(insp.get_table_names())

    if 'tournament_matches' in existing_tables:
        op.drop_index(op.f('ix_tournament_matches_tournament_id'), table_name='tournament_matches')
        op.drop_index(op.f('ix_tournament_matches_id'), table_name='tournament_matches')
        op.drop_table('tournament_matches')
    if 'guesses' in existing_tables:
        op.drop_index(op.f('ix_guesses_id'), table_name='guesses')
        op.drop_table('guesses')
    if 'tournament_participants' in existing_tables:
        op.drop_index(op.f('ix_tournament_participants_user_id'), table_name='tournament_participants')
        op.drop_index(op.f('ix_tournament_participants_tournament_id'), table_name='tournament_participants')
        op.drop_index(op.f('ix_tournament_participants_id'), table_name='tournament_participants')
        op.drop_table('tournament_participants')
    if 'games' in existing_tables:
        op.drop_index(op.f('ix_games_id'), table_name='games')
        op.drop_table('games')
    if 'chat_messages' in existing_tables:
        op.drop_index(op.f('ix_chat_messages_id'), table_name='chat_messages')
        op.drop_table('chat_messages')
    if 'tournaments' in existing_tables:
        op.drop_index(op.f('ix_tournaments_id'), table_name='tournaments')
        op.drop_table('tournaments')
    if 'rooms' in existing_tables:
        op.drop_index(op.f('ix_rooms_room_code'), table_name='rooms')
        op.drop_index(op.f('ix_rooms_id'), table_name='rooms')
        op.drop_table('rooms')
    if 'friendships' in existing_tables:
        op.drop_index(op.f('ix_friendships_id'), table_name='friendships')
        op.drop_table('friendships')
    if 'coin_transactions' in existing_tables:
        op.drop_index(op.f('ix_coin_transactions_user_id'), table_name='coin_transactions')
        op.drop_index(op.f('ix_coin_transactions_transaction_type'), table_name='coin_transactions')
        op.drop_index(op.f('ix_coin_transactions_reference_id'), table_name='coin_transactions')
        op.drop_index(op.f('ix_coin_transactions_id'), table_name='coin_transactions')
        op.drop_index(op.f('ix_coin_transactions_created_at'), table_name='coin_transactions')
        op.drop_table('coin_transactions')
    if 'users' in existing_tables:
        op.drop_index(op.f('ix_users_username'), table_name='users')
        op.drop_index(op.f('ix_users_id'), table_name='users')
        op.drop_index(op.f('ix_users_email'), table_name='users')
        op.drop_table('users')
