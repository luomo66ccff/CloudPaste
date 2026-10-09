import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const pastes = pgTable("pastes", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull().default("Untitled"),
  content: text("content").notNull(),
  contentType: text("content_type").notNull().default("markdown"),
  language: text("language"),
  visibility: text("visibility").notNull().default("unlisted"),
  status: text("status").notNull().default("normal"),
  editTokenHash: text("edit_token_hash").notNull(),
  deleteTokenHash: text("delete_token_hash"),
  passwordHash: text("password_hash"),
  burnAfterRead: boolean("burn_after_read").notNull().default(false),
  burnedAt: timestamp("burned_at", { withTimezone: true }),
  hiddenAt: timestamp("hidden_at", { withTimezone: true }),
  expireAt: timestamp("expire_at", { withTimezone: true }),
  viewCount: integer("view_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull().default(0),
    resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("rate_limits_reset_at_idx").on(table.resetAt)],
);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    reason: text("reason").notNull(),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("reports_slug_idx").on(table.slug)],
);

export type Paste = typeof pastes.$inferSelect;
export type Report = typeof reports.$inferSelect;
