CREATE TABLE "mcp_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"serverUrl" text NOT NULL,
	"accessTokenEnc" text,
	"refreshTokenEnc" text,
	"expiresAt" timestamp,
	"clientInfo" jsonb,
	"codeVerifier" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_connection_userId_serverUrl_unique" UNIQUE("userId","serverUrl")
);
--> statement-breakpoint
CREATE TABLE "receipt" (
	"id" text PRIMARY KEY NOT NULL,
	"conversationId" text NOT NULL,
	"messageId" text,
	"receiptType" text NOT NULL,
	"boundary" text NOT NULL,
	"payload" jsonb NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mcp_connection" ADD CONSTRAINT "mcp_connection_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_conversationId_conversation_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;