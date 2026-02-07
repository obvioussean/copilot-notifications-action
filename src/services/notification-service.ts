import { getOctokit } from '@actions/github';
import * as core from '@actions/core';
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
    // Supports both API URLs (api.github.com/repos/owner/repo/issues/123)
    // and web URLs (github.com/owner/repo/pull/123) after toHtmlUrl conversion
    const match = /\/([^/]+)\/([^/]+)\/(issues|pulls?|pull)\/(\d+)/.exec(url);
    if (!match) return null;
    const [, owner, repo, , num] = match;
    return { owner, repo, number: Number(num) };
  }

  // The notifications API only returns API URLs for subject.url (e.g.
  // https://api.github.com/repos/owner/repo/issues/123). There is no html_url
  // on the subject object. We convert to web URLs via string replacement to
  // avoid an extra API call per notification.
  private toHtmlUrl(apiUrl: string): string {
    return apiUrl
      .replace('https://api.github.com/repos/', 'https://github.com/')
      .replace('/pulls/', '/pull/');
  }

  async fetchNotifications(): Promise<Notification[]> {
    try {
      const response = await this.octokit.rest.activity.listNotificationsForAuthenticatedUser({
        all: false,
        participating: false,
        per_page: 100,
      });

      return (response.data as Notification[]).map((n) => ({
        ...n,
        subject: {
          ...n.subject,
          url: n.subject.url ? this.toHtmlUrl(n.subject.url) : n.subject.url,
        },
      }));
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

  async enrichWithCreationDates<T extends Notification>(notifications: T[]): Promise<T[]> {
    const enrichable = notifications
      .map((n) => ({ notification: n, parsed: this.parseSubjectUrl(n.subject.url) }))
      .filter((entry): entry is { notification: T; parsed: RepoIdentifier } =>
        entry.parsed !== null &&
        (entry.notification.subject.type === 'Issue' || entry.notification.subject.type === 'PullRequest')
      );

    if (enrichable.length === 0) return notifications;

    // Build a single GraphQL query to fetch all creation dates at once
    const fragments = enrichable.map((entry, i) => {
      const { owner, repo, number } = entry.parsed;
      if (entry.notification.subject.type === 'Issue') {
        return `n${i}: repository(owner: "${owner}", name: "${repo}") { issue(number: ${number}) { createdAt } }`;
      }
      return `n${i}: repository(owner: "${owner}", name: "${repo}") { pullRequest(number: ${number}) { createdAt } }`;
    });

    const query = `query { ${fragments.join('\n')} }`;

    try {
      const result = await this.octokit.graphql<Record<string, { issue?: { createdAt: string }; pullRequest?: { createdAt: string } }>>(query);

      const createdAtMap = new Map<Notification, string>();
      enrichable.forEach((entry, i) => {
        const node = result[`n${i}`];
        const createdAt = node?.issue?.createdAt ?? node?.pullRequest?.createdAt;
        if (createdAt) {
          createdAtMap.set(entry.notification, createdAt);
        }
      });

      return notifications.map((n) => {
        const createdAt = createdAtMap.get(n);
        return createdAt ? { ...n, subject_created_at: createdAt } : n;
      });
    } catch {
      // Fall back gracefully if GraphQL fails
      return notifications;
    }
  }

  async markAsRead(notifications: Notification[]): Promise<void> {
    for (const notification of notifications) {
      try {
        await this.octokit.rest.activity.markThreadAsRead({
          thread_id: parseInt(notification.id, 10),
        });
      } catch (error) {
        core.warning(`Failed to mark notification ${notification.id} as read: ${error}`);
      }
    }
  }
}
