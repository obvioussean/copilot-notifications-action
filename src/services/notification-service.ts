import { getOctokit } from '@actions/github';
import { Notification } from '../types.js';

interface RepoIdentifier {
  owner: string;
  repo: string;
  number: number;
}

export class NotificationService {
  private octokit: ReturnType<typeof getOctokit>;

  constructor(token: string) {
    this.octokit = getOctokit(token);
  }

  private parseSubjectUrl(url: string): RepoIdentifier | null {
    // Supports URLs like: https://api.github.com/repos/owner/repo/issues/123 or .../pulls/123
    const match = /repos\/([^/]+)\/([^/]+)\/(issues|pulls)\/(\d+)/.exec(url);
    if (!match) return null;
    const [, owner, repo, , num] = match;
    return { owner, repo, number: Number(num) };
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
      const isUnread = notification.unread;
      
      // Direct @mention of the user
      const isDirectMention = notification.reason === 'mention';
      
      // Team mentions (e.g., @org/copilot-code-review)
      const isTeamMention = notification.reason === 'team_mention';
      
      // Items where user is directly assigned or review requested
      const isAssigned = notification.reason === 'assign';
      const isReviewRequested = notification.reason === 'review_requested';
      
      return isUnread && (isDirectMention || isTeamMention || isAssigned || isReviewRequested);
    });
  }

  async filterUnresponded(
    notifications: Notification[],
    username: string
  ): Promise<Notification[]> {
    const results: Notification[] = [];

    for (const notification of notifications) {
      const responded = await this.checkIfUserResponded(notification, username);
      if (!responded) {
        results.push(notification);
      }
    }

    return results;
  }

  async checkIfUserResponded(notification: Notification, username: string): Promise<boolean> {
    const subject = notification.subject;
    const parsed = this.parseSubjectUrl(subject.url);

    if (!parsed) return false;

    const { owner, repo, number } = parsed;

    if (subject.type === 'Issue') {
      // Check issue comments for user's participation
      const comments = await this.octokit.paginate(this.octokit.rest.issues.listComments, {
        owner,
        repo,
        issue_number: number,
        per_page: 100,
      });

      return comments.some((comment) => comment.user?.login === username);
    }

    if (subject.type === 'PullRequest') {
      // Check PR reviews and review comments
      const [reviews, reviewComments, issueComments] = await Promise.all([
        this.octokit.paginate(this.octokit.rest.pulls.listReviews, {
          owner,
          repo,
          pull_number: number,
          per_page: 100,
        }),
        this.octokit.paginate(this.octokit.rest.pulls.listReviewComments, {
          owner,
          repo,
          pull_number: number,
          per_page: 100,
        }),
        this.octokit.paginate(this.octokit.rest.issues.listComments, {
          owner,
          repo,
          issue_number: number,
          per_page: 100,
        }),
      ]);

      return (
        reviews.some((r) => r.user?.login === username) ||
        reviewComments.some((c) => c.user?.login === username) ||
        issueComments.some((c) => c.user?.login === username)
      );
    }

    // Other notification types: fall back to unread status only
    return false;
  }
}
