const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbDir = path.join(__dirname, '../data');
const dbPath = path.join(dbDir, 'harshan.sqlite');

let db;

async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();

  // Ensure data directory exists
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  let dbExists = fs.existsSync(dbPath);

  if (dbExists) {
    const filebuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(filebuffer);
  } else {
    db = new SQL.Database();
    
    // Create schema
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS semesters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS courses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        semester_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (semester_id) REFERENCES semesters(id)
      );

      CREATE TABLE IF NOT EXISTS lectures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER,
        title TEXT,
        summary_content TEXT,
        author_user_id INTEGER,
        is_public INTEGER DEFAULT 0,
        likes INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (course_id) REFERENCES courses(id),
        FOREIGN KEY (author_user_id) REFERENCES users(id)
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
        author_user_id INTEGER,
        is_public INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (course_id) REFERENCES courses(id),
        FOREIGN KEY (lecture_id) REFERENCES lectures(id),
        FOREIGN KEY (author_user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS calendar_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        moodle_course_id TEXT,
        title TEXT,
        event_date DATETIME,
        is_completed INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);
    
    saveDb();
  }

  return db;
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

function queryAll(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const results = queryAll(sql, params);
  return results.length > 0 ? results[0] : null;
}

function execute(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  db.run(sql, params);
  
  // sql.js doesn't easily provide lastInsertRowid natively across all wrappers
  // so we query it if this is an insert
  let lastInsertRowid = null;
  let changes = 0;
  
  if (sql.trim().toUpperCase().startsWith('INSERT')) {
      const res = queryOne('SELECT last_insert_rowid() AS id');
      if (res) lastInsertRowid = res.id;
  }
  
  if (sql.trim().toUpperCase().startsWith('UPDATE') || sql.trim().toUpperCase().startsWith('DELETE')) {
      const res = queryOne('SELECT changes() AS changes');
      if (res) changes = res.changes;
  }
  
  saveDb();
  return { lastId: lastInsertRowid, changes };
}

module.exports = {
  getDb,
  queryAll,
  queryOne,
  execute
};
