// Official cert domains + exam weights (F16). Read-only: rows come from the
// seed (db/seed/nca-genl.json _domain_weights), never from client writes.
import type { Domain } from '@llmstudy/shared';
import type { Db } from './db';

/** All domains, heaviest exam weight first (name breaks ties deterministically). */
export function listDomains(db: Db): Domain[] {
  return db
    .prepare('SELECT cert_path, name, weight FROM domains ORDER BY weight DESC, name')
    .all() as Domain[];
}

/** Exam weight (percent) by domain name — the F17/F16 lookup for dashboards. */
export function weightByDomain(db: Db): Map<string, number> {
  return new Map(listDomains(db).map((d) => [d.name, d.weight]));
}
