const sqlite3 = require('sqlite3').verbose();
const path = require('path');

let db;
let dbInitialized = false;

async function getDb() {
  if (dbInitialized) return db;

  return new Promise((resolve, reject) => {
    const dbPath = path.join(__dirname, '../database.sqlite');
    db = new sqlite3.Database(dbPath, async (err) => {
      if (err) {
        return reject(err);
      }

      // Create schema
      const schemaQuery = `
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
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
          created_at DATETIME DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS semesters (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          created_at DATETIME DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS courses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          semester_id INTEGER,
          created_at DATETIME DEFAULT (datetime('now')),
          FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS lectures (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          course_id INTEGER,
          title TEXT,
          summary_content TEXT,
          author_user_id INTEGER,
          is_public INTEGER DEFAULT 0,
          likes INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT (datetime('now')),
          FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
          FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS flashcards (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          course_id INTEGER,
          lecture_id INTEGER,
          question_text TEXT,
          correct_answer TEXT,
          distractors TEXT,
          next_review_date DATETIME,
          easiness_factor REAL DEFAULT 2.5,
          interval INTEGER DEFAULT 0,
          repetitions INTEGER DEFAULT 0,
          appearance_index INTEGER,
          learning_status TEXT DEFAULT 'pending',
          author_user_id INTEGER,
          is_public INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT (datetime('now')),
          FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
          FOREIGN KEY (lecture_id) REFERENCES lectures(id) ON DELETE CASCADE,
          FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS calendar_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          moodle_course_id TEXT,
          title TEXT,
          event_date DATETIME,
          is_completed INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT (datetime('now')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
      `;
      
      db.exec(schemaQuery, (err) => {
        if (err) return reject(err);
        dbInitialized = true;
        resolve(db);
      });
    });
  });
}

async function queryAll(sql, params = []) {
  if (!dbInitialized) await getDb();
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function queryOne(sql, params = []) {
  if (!dbInitialized) await getDb();
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function execute(sql, params = []) {
  if (!dbInitialized) await getDb();
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastId: this.lastID, changes: this.changes });
    });
  });
}

async function runTransaction(callback) {
  if (!dbInitialized) await getDb();
  
  await execute('BEGIN TRANSACTION');
  try {
    const txContext = {
      execute: execute,
      queryOne: queryOne,
      queryAll: queryAll
    };
    await callback(txContext);
    await execute('COMMIT');
  } catch (err) {
    await execute('ROLLBACK');
    throw err;
  }
}

module.exports = {
  getDb,
  queryAll,
  queryOne,
  execute,
  runTransaction
};
