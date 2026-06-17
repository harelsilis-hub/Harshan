const { getDb, execute } = require('./db/schema');

async function migrate() {
  await getDb();
  try {
    console.log("Adding appearance_index...");
    execute('ALTER TABLE flashcards ADD COLUMN appearance_index INTEGER;');
  } catch(e) { console.error("Could not add appearance_index:", e.message); }
  
  try {
    console.log("Adding learning_status...");
    execute("ALTER TABLE flashcards ADD COLUMN learning_status TEXT DEFAULT 'pending';");
  } catch(e) { console.error("Could not add learning_status:", e.message); }

  console.log("Migration complete!");
}

migrate();
