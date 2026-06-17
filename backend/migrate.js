const { getDb, execute } = require('./db/schema');

async function migrate() {
  await getDb();
  
  const migrations = [
    { name: "Adding appearance_index", sql: "ALTER TABLE flashcards ADD COLUMN appearance_index INTEGER;" },
    { name: "Adding learning_status", sql: "ALTER TABLE flashcards ADD COLUMN learning_status TEXT DEFAULT 'pending';" },
    { name: "Adding degree to users", sql: "ALTER TABLE users ADD COLUMN degree TEXT;" },
    
    // Multi-tenancy and Community Migrations
    { name: "Adding user_id to semesters", sql: "ALTER TABLE semesters ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;" },
    { name: "Adding user_id to courses", sql: "ALTER TABLE courses ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;" },
    { name: "Renaming author_user_id to user_id in lectures", sql: "ALTER TABLE lectures RENAME COLUMN author_user_id TO user_id;" },
    { name: "Renaming is_public to is_shared in lectures", sql: "ALTER TABLE lectures RENAME COLUMN is_public TO is_shared;" },
    { name: "Adding file_path to lectures", sql: "ALTER TABLE lectures ADD COLUMN file_path TEXT;" },
    { name: "Renaming author_user_id to user_id in flashcards", sql: "ALTER TABLE flashcards RENAME COLUMN author_user_id TO user_id;" },
    { name: "Renaming is_public to is_shared in flashcards", sql: "ALTER TABLE flashcards RENAME COLUMN is_public TO is_shared;" }
  ];

  for (const m of migrations) {
    try {
      console.log(`${m.name}...`);
      await execute(m.sql);
    } catch(e) {
      console.error(`Could not run: ${m.name}`, e.message);
    }
  }

  console.log("Migration complete!");
}

migrate();
