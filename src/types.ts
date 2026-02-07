export interface Notification {
  id: string;
  repository: {
    full_name: string;
    html_url: string;
  };
  subject: {
    title: string;
    url: string;
    type: string;
  };
  reason: string;
  unread: boolean;
  updated_at: string;
  last_read_at: string | null;
  url: string;
  subject_created_at?: string;
}

export interface AnalyzedNotification extends Notification {
  importance: number;
  summary: string;
  actionRequired: string;
}

export interface DMMessage {
  recipient: string;
  subject: string;
  body: string;
}
