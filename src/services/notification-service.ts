import { getOctokit } from '@actions/github';
import { Notification } from '../types.js';

export class NotificationService {
  private octokit: ReturnType<typeof getOctokit>;

  constructor(token: string) {
    this.octokit = getOctokit(token);
  }

  async fetchNotifications(): Promise<Notification[]> {
    try {
      const response = await this.octokit.rest.activity.listNotificationsForAuthenticatedUser({
        all: false,
        participating: false,
        per_page: 100,
      });

      return response.data as Notification[];
    } catch (error) {
      throw new Error(`Failed to fetch notifications: ${error}`);
    }
  }

  filterMentions(notifications: Notification[]): Notification[] {
    return notifications.filter((notification) => {
      // Filter for mentions and unread items
      const isMention = notification.reason === 'mention' || notification.reason === 'team_mention';
      const isUnread = notification.unread;
      
      // Also include items where user is directly assigned or review requested
      const isAssigned = notification.reason === 'assign';
      const isReviewRequested = notification.reason === 'review_requested';

      return isUnread && (isMention || isAssigned || isReviewRequested);
    });
  }

  async checkIfUserResponded(notification: Notification): Promise<boolean> {
    // This would require checking if the user has commented on the issue/PR
    // For now, we'll rely on the unread status
    // Future enhancement: Parse the thread and check for user's comments
    return false;
  }
}
