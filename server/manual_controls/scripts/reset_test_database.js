// Rebuilds the test database from the real one: the recipes, ingredients
// and other reference data copied across, everything else emptied (see
// services/testDatabase.js). The real database is only read.
//
//   node manual_controls/scripts/reset_test_database.js
//
// Run from the server folder.
import "dotenv/config";

import { resetTestDatabase } from "../../services/testDatabase.js";

const result = await resetTestDatabase();
console.log(`Test database "${result.to}" rebuilt from "${result.from}":`);
for (const [name, count] of Object.entries(result.copied)) console.log(`  ${name}: ${count}`);
process.exit(0);
