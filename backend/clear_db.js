const { getDb, execute } = require('./db/schema');

async function clear() {
  await getDb();
  execute('DELETE FROM calendar_events');
  console.log('Cleared calendar events!');
}
clear();
