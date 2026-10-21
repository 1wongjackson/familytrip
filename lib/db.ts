import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { customAlphabet } from "nanoid";
import { DayPlanSchema, type DayPlan } from "./plan-schema";
import type { Answer, Budget, Member, PlanLive, Role, StoredPlan, Trip, Vote, VoteChoice } from "./types";

const DB_PATH = process.env.FAMILYTRIP_DB ?? path.join(process.cwd(), "data", "familytrip.db");

// Reuse one connection across dev hot reloads.
const globalForDb = globalThis as unknown as { familyTripDb?: Database.Database };

export function db(): Database.Database {
  if (!globalForDb.familyTripDb) {
    if (DB_PATH !== ":memory:") fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const conn = new Database(DB_PATH);
    conn.pragma("journal_mode = WAL");
    conn.pragma("foreign_keys = ON");
    migrate(conn);
    globalForDb.familyTripDb = conn;
  }
  return globalForDb.familyTripDb;
}

function migrate(conn: Database.Database) {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS trips (
      slug TEXT PRIMARY KEY,
      destination TEXT NOT NULL,
      date TEXT NOT NULL,
      hotel_area TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      agreed_plan_id INTEGER,
      agreed_at INTEGER,
      generating_since INTEGER
    );
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_slug TEXT NOT NULL REFERENCES trips(slug),
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      age INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS answers (
      member_id INTEGER PRIMARY KEY REFERENCES members(id),
      energy INTEGER NOT NULL,
      must_do TEXT NOT NULL,
      must_avoid TEXT NOT NULL,
      food TEXT NOT NULL,
      max_travel_minutes INTEGER NOT NULL,
      budget TEXT NOT NULL,
      submitted_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_slug TEXT NOT NULL REFERENCES trips(slug),
      round INTEGER NOT NULL,
      idx INTEGER NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS votes (
      member_id INTEGER NOT NULL REFERENCES members(id),
      plan_id INTEGER NOT NULL REFERENCES plans(id),
      choice TEXT NOT NULL,
      comment TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (member_id, plan_id)
    );
  `);
  // Added with the live checks.
  const planCols = conn.prepare("PRAGMA table_info(plans)").all() as { name: string }[];
  if (!planCols.some((c) => c.name === "live")) conn.exec("ALTER TABLE plans ADD COLUMN live TEXT");
}

const slugId = customAlphabet("abcdefghjkmnpqrstuvwxyz23456789", 8);

export interface NewTrip {
  destination: string;
  date: string;
  hotelArea: string;
  members: { name: string; role: Role; age: number }[];
}

export function createTrip(input: NewTrip, slug: string = slugId()): string {
  const conn = db();
  conn.transaction(() => {
    conn
      .prepare("INSERT INTO trips (slug, destination, date, hotel_area, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(slug, input.destination, input.date, input.hotelArea, Date.now());
    const addMember = conn.prepare("INSERT INTO members (trip_slug, name, role, age) VALUES (?, ?, ?, ?)");
    for (const m of input.members) addMember.run(slug, m.name, m.role, m.age);
  })();
  return slug;
}

interface TripRow {
  slug: string;
  destination: string;
  date: string;
  hotel_area: string;
  created_at: number;
  agreed_plan_id: number | null;
  agreed_at: number | null;
  generating_since: number | null;
}

export function getTrip(slug: string): (Trip & { generatingSince: number | null }) | null {
  const row = db().prepare("SELECT * FROM trips WHERE slug = ?").get(slug) as TripRow | undefined;
  if (!row) return null;
  return {
    slug: row.slug,
    destination: row.destination,
    date: row.date,
    hotelArea: row.hotel_area,
    createdAt: row.created_at,
    agreedPlanId: row.agreed_plan_id,
    agreedAt: row.agreed_at,
    generatingSince: row.generating_since,
  };
}

export function getMembers(slug: string): Member[] {
  return db()
    .prepare("SELECT id, name, role, age FROM members WHERE trip_slug = ? ORDER BY id")
    .all(slug) as Member[];
}

export function getAnswers(slug: string): Answer[] {
  const rows = db()
    .prepare(
      `SELECT a.* FROM answers a JOIN members m ON m.id = a.member_id WHERE m.trip_slug = ? ORDER BY a.member_id`,
    )
    .all(slug) as {
    member_id: number;
    energy: number;
    must_do: string;
    must_avoid: string;
    food: string;
    max_travel_minutes: number;
    budget: Budget;
    submitted_at: number;
  }[];
  return rows.map((r) => ({
    memberId: r.member_id,
    energy: r.energy,
    mustDo: r.must_do,
    mustAvoid: r.must_avoid,
    food: r.food,
    maxTravelMinutes: r.max_travel_minutes,
    budget: r.budget,
    submittedAt: r.submitted_at,
  }));
}

export function saveAnswer(a: Omit<Answer, "submittedAt">) {
  db()
    .prepare(
      `INSERT INTO answers (member_id, energy, must_do, must_avoid, food, max_travel_minutes, budget, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(member_id) DO UPDATE SET energy = excluded.energy, must_do = excluded.must_do,
         must_avoid = excluded.must_avoid, food = excluded.food,
         max_travel_minutes = excluded.max_travel_minutes, budget = excluded.budget,
         submitted_at = excluded.submitted_at`,
    )
    .run(a.memberId, a.energy, a.mustDo, a.mustAvoid, a.food, a.maxTravelMinutes, a.budget, Date.now());
}

export function getPlans(slug: string): StoredPlan[] {
  const rows = db()
    .prepare("SELECT id, round, idx, data, live FROM plans WHERE trip_slug = ? ORDER BY round, idx")
    .all(slug) as { id: number; round: number; idx: number; data: string; live: string | null }[];
  return rows.map((r) => ({
    id: r.id,
    round: r.round,
    idx: r.idx,
    data: DayPlanSchema.parse(JSON.parse(r.data)),
    live: r.live ? (JSON.parse(r.live) as PlanLive) : null,
  }));
}

export function savePlans(slug: string, round: number, plans: DayPlan[], live: PlanLive[] | null) {
  const conn = db();
  const insert = conn.prepare(
    "INSERT INTO plans (trip_slug, round, idx, data, live, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  conn.transaction(() => {
    plans.forEach((p, idx) =>
      insert.run(slug, round, idx, JSON.stringify(p), live?.[idx] ? JSON.stringify(live[idx]) : null, Date.now()),
    );
  })();
}

export function getVotes(slug: string): Vote[] {
  const rows = db()
    .prepare(
      `SELECT v.member_id, v.plan_id, v.choice, v.comment FROM votes v
       JOIN plans p ON p.id = v.plan_id WHERE p.trip_slug = ?`,
    )
    .all(slug) as { member_id: number; plan_id: number; choice: VoteChoice; comment: string }[];
  return rows.map((r) => ({ memberId: r.member_id, planId: r.plan_id, choice: r.choice, comment: r.comment }));
}

export function saveVote(v: Vote) {
  db()
    .prepare(
      `INSERT INTO votes (member_id, plan_id, choice, comment) VALUES (?, ?, ?, ?)
       ON CONFLICT(member_id, plan_id) DO UPDATE SET choice = excluded.choice, comment = excluded.comment`,
    )
    .run(v.memberId, v.planId, v.choice, v.comment);
}

// Only one phone may generate at a time; a stale lock (crash) expires after 5 min.
const LOCK_TTL_MS = 5 * 60 * 1000;

export function tryLockGeneration(slug: string): boolean {
  const res = db()
    .prepare(
      "UPDATE trips SET generating_since = ? WHERE slug = ? AND (generating_since IS NULL OR generating_since < ?)",
    )
    .run(Date.now(), slug, Date.now() - LOCK_TTL_MS);
  return res.changes === 1;
}

export function unlockGeneration(slug: string) {
  db().prepare("UPDATE trips SET generating_since = NULL WHERE slug = ?").run(slug);
}

export function isGenerating(generatingSince: number | null): boolean {
  return generatingSince !== null && generatingSince >= Date.now() - LOCK_TTL_MS;
}

export function agree(slug: string, planId: number) {
  db()
    .prepare("UPDATE trips SET agreed_plan_id = ?, agreed_at = ? WHERE slug = ? AND agreed_plan_id IS NULL")
    .run(planId, Date.now(), slug);
}

// Saves a plan rearranged on the map.
export function updatePlan(planId: number, data: DayPlan, live: PlanLive | null) {
  db()
    .prepare("UPDATE plans SET data = ?, live = ? WHERE id = ?")
    .run(JSON.stringify(data), live ? JSON.stringify(live) : null, planId);
}
