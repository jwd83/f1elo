import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";

let sqlPromise;

export async function loadDatabase() {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({
      locateFile: () => wasmUrl,
    });
  }

  const SQL = await sqlPromise;
  const response = await fetch(`${import.meta.env.BASE_URL}f1elo.sqlite`);

  if (!response.ok) {
    throw new Error(`Could not load f1elo.sqlite (${response.status})`);
  }

  const buffer = await response.arrayBuffer();
  return new SQL.Database(new Uint8Array(buffer));
}

export function queryRows(db, sql, params = []) {
  const statement = db.prepare(sql);
  const rows = [];

  try {
    statement.bind(params);
    while (statement.step()) {
      rows.push(statement.getAsObject());
    }
  } finally {
    statement.free();
  }

  return rows;
}
