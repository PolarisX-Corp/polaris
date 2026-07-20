import type { AdapterAccountType } from "next-auth/adapters";
import {
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import type { UIMessage } from "ai";

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

export const conversations = pgTable("conversation", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("新しいチャット"),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
});

export type MessageRole = "user" | "assistant" | "system";

export const messages = pgTable("message", {
  id: text("id").primaryKey(),
  conversationId: text("conversationId")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").$type<MessageRole>().notNull(),
  parts: jsonb("parts").$type<UIMessage["parts"]>().notNull(),
  modelId: text("modelId"),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});

export type ReceiptType = "input" | "retrieval" | "proposal" | "parse_guard";
export type Boundary = "support-only" | "review-only" | "effect-bearing";

export const receipts = pgTable("receipt", {
  id: text("id").primaryKey(),
  conversationId: text("conversationId")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  messageId: text("messageId"),
  receiptType: text("receiptType").$type<ReceiptType>().notNull(),
  boundary: text("boundary").$type<Boundary>().notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});

export type McpConnectionStatus = "connected" | "pending" | "disconnected";

export const mcpConnections = pgTable(
  "mcp_connection",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    serverUrl: text("serverUrl").notNull(),
    accessTokenEnc: text("accessTokenEnc"),
    refreshTokenEnc: text("refreshTokenEnc"),
    expiresAt: timestamp("expiresAt", { mode: "date" }),
    clientInfo: jsonb("clientInfo"),
    codeVerifier: text("codeVerifier"),
    status: text("status").$type<McpConnectionStatus>().notNull().default("pending"),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.serverUrl)],
);
