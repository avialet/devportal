declare module 'sql.js' {
  interface Database {
    run(sql: string, params?: (string | number | null)[]): void;
    exec(sql: string): { columns: string[]; values: unknown[][] }[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }

  interface Statement {
    bind(params?: (string | number | null)[]): boolean;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): void;
  }

  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number>) => Database;
  }

  export type { Database, Statement, SqlJsStatic };
  export default function initSqlJs(config?: Record<string, unknown>): Promise<SqlJsStatic>;
}
