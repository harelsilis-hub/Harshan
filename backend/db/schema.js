const { Pool } = require('pg');
require('dotenv').config();

let pool;
let dbInitialized = false;

async function getDb() {
  if (dbInitialized) return pool;

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Typical for Render PostgreSQL
  });

  // Create schema
  const schemaQuery = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE,
      password TEXT,
      university TEXT,
      degree TEXT,
      year INTEGER,
      semester INTEGER,
      leaderboard_name TEXT,
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      current_streak INTEGER DEFAULT 0,
      last_review_date TEXT,
      streak_freezes INTEGER DEFAULT 0,
      reputation INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS semesters (
      id SERIAL PRIMARY KEY,
      name TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS courses (
      id SERIAL PRIMARY KEY,
      name TEXT,
      semester_id INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lectures (
      id SERIAL PRIMARY KEY,
      course_id INTEGER,
      title TEXT,
      summary_content TEXT,
      author_user_id INTEGER,
      is_public INTEGER DEFAULT 0,
      likes INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS flashcards (
      id SERIAL PRIMARY KEY,
      course_id INTEGER,
      lecture_id INTEGER,
      question_text TEXT,
      correct_answer TEXT,
      distractors TEXT,
      next_review_date TIMESTAMP,
      easiness_factor REAL DEFAULT 2.5,
      interval INTEGER DEFAULT 0,
      repetitions INTEGER DEFAULT 0,
      appearance_index INTEGER,
      learning_status TEXT DEFAULT 'pending',
      author_user_id INTEGER,
      is_public INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (lecture_id) REFERENCES lectures(id) ON DELETE CASCADE,
      FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      moodle_course_id TEXT,
      title TEXT,
      event_date TIMESTAMP,
      is_completed INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `;
  
  await pool.query(schemaQuery);
  dbInitialized = true;
  return pool;
}

// Utility to convert SQLite '?' placeholders to Postgres '$1, $2'
function convertQuery(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function queryAll(sql, params = []) {
  if (!dbInitialized) await getDb();
  const pgSql = convertQuery(sql);
  const result = await pool.query(pgSql, params);
  return result.rows;
}

async function queryOne(sql, params = []) {
  if (!dbInitialized) await getDb();
  const pgSql = convertQuery(sql);
  const result = await pool.query(pgSql, params);
  return result.rows[0];
}

async function execute(sql, params = [], client = pool) {
  if (!dbInitialized && client === pool) await getDb();
  
  let pgSql = convertQuery(sql);
  
  // Postgres doesn't return last insert ID automatically.
  // If it's an insert, append RETURNING id to match SQLite's lastId behavior.
  const isInsert = pgSql.trim().toUpperCase().startsWith('INSERT');
  if (isInsert && !pgSql.toUpperCase().includes('RETURNING')) {
    pgSql += ' RETURNING id';
  }

  const result = await client.query(pgSql, params);
  
  let lastId = null;
  if (isInsert && result.rows.length > 0) {
    lastId = result.rows[0].id;
  }

  return { lastId, changes: result.rowCount };
}

async function runTransaction(callback) {
  if (!dbInitialized) await getDb();
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Provide a transaction context that uses this specific client
    const txContext = {
      execute: async (sql, params = []) => execute(sql, params, client),
      queryOne: async (sql, params = []) => {
        const pgSql = convertQuery(sql);
        const result = await client.query(pgSql, params);
        return result.rows[0];
      },
      queryAll: async (sql, params = []) => {
        const pgSql = convertQuery(sql);
        const result = await client.query(pgSql, params);
        return result.rows;
      }
    };
    
    await callback(txContext);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  getDb,
  queryAll,
  queryOne,
  execute,
  runTransaction
};
