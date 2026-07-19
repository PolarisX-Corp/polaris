export type ActivitySource = "receipt";

export type ActivityRecord = {
  id: string;
  source: ActivitySource;
  kind: string;
  boundary?: string;
  messageId?: string | null;
  createdAt: string; // ISO8601
  summary: string;
  details: { label: string; value: string }[];
};
