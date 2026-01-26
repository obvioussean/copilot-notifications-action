import { CopilotClient } from '@github/copilot-sdk';
import { Notification, AnalyzedNotification } from '../types.js';

export class CopilotService {
  private client: CopilotClient;

  constructor(token: string) {
    // Store token for potential future use if needed
    // CopilotClient authentication is handled via environment or CLI
    this.client = new CopilotClient();
  }

  async analyzeNotifications(
    notifications: Notification[]
  ): Promise<AnalyzedNotification[]> {
    const analyzed: AnalyzedNotification[] = [];

    for (const notification of notifications) {
      try {
        const analysis = await this.analyzeNotification(notification);
        analyzed.push({
          ...notification,
          ...analysis,
        });
      } catch (error) {
        console.error(`Failed to analyze notification ${notification.id}:`, error);
        // Add with default values if analysis fails
        analyzed.push({
          ...notification,
          importance: 3,
          summary: notification.subject.title,
          actionRequired: 'Review and respond',
        });
      }
    }

    return analyzed;
  }

  private async analyzeNotification(notification: Notification): Promise<{
    importance: number;
    summary: string;
    actionRequired: string;
  }> {
    const prompt = `Analyze this GitHub notification and determine:
1. Importance level (1-5, where 5 is most important)
2. A brief summary
3. What action is required from the user

Notification details:
- Repository: ${notification.repository.full_name}
- Type: ${notification.subject.type}
- Title: ${notification.subject.title}
- Reason: ${notification.reason}

Respond in JSON format:
{
  "importance": <number>,
  "summary": "<brief summary>",
  "actionRequired": "<specific action needed>"
}`;

    // Create a fresh session for each notification
    const session = await this.client.createSession({
      systemMessage: {
        mode: 'replace',
        content: 'You are a helpful assistant that analyzes GitHub notifications to determine their importance and required actions. Always respond with valid JSON.',
      },
    });

    try {
      // Register a no-op event handler to ensure events are processed
      session.on(() => {});
      
      const response = await session.sendAndWait({ prompt }, 120000);
      
      if (!response || !response.data?.content) {
        throw new Error('No response from Copilot');
      }

      const parsed = JSON.parse(response.data.content);
      
      return {
        importance: Math.min(5, Math.max(1, parsed.importance || 3)),
        summary: parsed.summary || notification.subject.title,
        actionRequired: parsed.actionRequired || 'Review and respond',
      };
    } finally {
      await session.destroy();
    }
  }

  async cleanup() {
    await this.client.stop();
  }
}
