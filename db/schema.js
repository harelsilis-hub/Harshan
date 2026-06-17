require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

let dbInitialized = false;

// Helper to convert SQLite ? placeholders to Postgres $1, $2, etc.
function convertPlaceholders(sql) {
  let index = 1;
  return sql.replace(/\?/g, () => `$${index++}`);
}

// Helper to fix SQLite specific syntax
function fixSqliteSyntax(sql) {
  return sql
    .replace(/datetime\('now'\)/ig, 'NOW()')
    .replace(/AUTOINCREMENT/ig, 'SERIAL')
    .replace(/DATETIME/ig, 'TIMESTAMP')
    .replace(/INTEGER PRIMARY KEY SERIAL/ig, 'SERIAL PRIMARY KEY'); // just in case
}

async function getDb() {
  if (dbInitialized) return pool;

  // Create schema
  const schemaQuery = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE,
      password TEXT,
      university TEXT,
      year INTEGER,
      semester INTEGER,
      leaderboard_name TEXT,
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      current_streak INTEGER DEFAULT 0,
      last_review_date TEXT,
      streak_freezes INTEGER DEFAULT 0,
      reputation INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS semesters (
      id SERIAL PRIMARY KEY,
      name TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS courses (
      id SERIAL PRIMARY KEY,
      name TEXT,
      semester_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
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
      created_at TIMESTAMP DEFAULT NOW(),
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
      created_at TIMESTAMP DEFAULT NOW(),
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
      created_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `;
  
  await pool.query(schemaQuery);
  dbInitialized = true;
  return pool;
}

async function queryAll(sql, params = []) {
  const convertedSql = convertPlaceholders(fixSqliteSyntax(sql));
  const res = await pool.query(convertedSql, params);
  return res.rows;
}

async function queryOne(sql, params = []) {
  const convertedSql = convertPlaceholders(fixSqliteSyntax(sql));
  const res = await pool.query(convertedSql, params);
  return res.rows.length > 0 ? res.rows[0] : null;
}

async function execute(sql, params = []) {
  let convertedSql = convertPlaceholders(fixSqliteSyntax(sql));
  
  // To simulate last_insert_rowid()
  const isInsert = convertedSql.trim().toUpperCase().startsWith('INSERT');
  if (isInsert && !convertedSql.toUpperCase().includes('RETURNING ID')) {
    convertedSql += ' RETURNING id';
  }

  const res = await pool.query(convertedSql, params);
  
  return { 
    lastId: isInsert && res.rows.length > 0 ? res.rows[0].id : null, 
    changes: res.rowCount 
  };
}

async function runTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Create an execution context specifically for this transaction client
    const txContext = {
      execute: async (sql, params = []) => {
        let convertedSql = convertPlaceholders(fixSqliteSyntax(sql));
        const isInsert = convertedSql.trim().toUpperCase().startsWith('INSERT');
        if (isInsert && !convertedSql.toUpperCase().includes('RETURNING ID')) {
          convertedSql += ' RETURNING id';
        }
        const res = await client.query(convertedSql, params);
        return { 
          lastId: isInsert && res.rows.length > 0 ? res.rows[0].id : null, 
          changes: res.rowCount 
        };
      },
      queryOne: async (sql, params = []) => {
        const convertedSql = convertPlaceholders(fixSqliteSyntax(sql));
        const res = await client.query(convertedSql, params);
        return res.rows.length > 0 ? res.rows[0] : null;
      },
      queryAll: async (sql, params = []) => {
        const convertedSql = convertPlaceholders(fixSqliteSyntax(sql));
        const res = await client.query(convertedSql, params);
        return res.rows;
      }
    };

    // We pass the transaction context into the callback
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
