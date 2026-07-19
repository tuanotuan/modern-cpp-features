export const PROGRESS_VERSION = 1 as const;
export const MAX_DUE_REVIEWS = 5;

export type Rating = "again" | "hard" | "good" | "easy";

export type Review = {
  questionId: string;
  reviewedOn: string;
  rating: Rating;
  nextDueOn: string;
};

export type PracticeProgress = {
  version: typeof PROGRESS_VERSION;
  reviews: Review[];
};

export const EMPTY_PROGRESS: PracticeProgress = {
  version: PROGRESS_VERSION,
  reviews: [],
};

const intervalDays: Record<Rating, number> = {
  again: 1,
  hard: 2,
  good: 4,
  easy: 7,
};

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function nextDueDate(dateKey: string, rating: Rating): string {
  return addDays(dateKey, intervalDays[rating]);
}

export function selectDailyQuestion(
  questionIds: string[],
  dateKey: string,
): string | null {
  if (questionIds.length === 0) return null;

  const sortedIds = [...questionIds].sort();
  let hash = 2166136261;
  for (const character of dateKey) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return sortedIds[(hash >>> 0) % sortedIds.length];
}

export function latestReviews(reviews: Review[]): Map<string, Review> {
  const latest = new Map<string, Review>();
  for (const review of reviews) {
    const previous = latest.get(review.questionId);
    if (!previous || previous.reviewedOn <= review.reviewedOn) {
      latest.set(review.questionId, review);
    }
  }
  return latest;
}

export function buildDailyQueue(
  questionIds: string[],
  reviews: Review[],
  dateKey: string,
): string[] {
  const primary = selectDailyQuestion(questionIds, dateKey);
  if (!primary) return [];

  const latest = latestReviews(reviews);
  const due = questionIds
    .filter((id) => id !== primary)
    .map((id) => latest.get(id))
    .filter((review): review is Review => Boolean(review))
    .filter(
      (review) =>
        review.nextDueOn <= dateKey && review.reviewedOn !== dateKey,
    )
    .sort(
      (left, right) =>
        left.nextDueOn.localeCompare(right.nextDueOn) ||
        left.questionId.localeCompare(right.questionId),
    )
    .slice(0, MAX_DUE_REVIEWS)
    .map((review) => review.questionId);

  return [primary, ...due];
}

export function recordReview(
  progress: PracticeProgress,
  questionId: string,
  rating: Rating,
  dateKey: string,
): PracticeProgress {
  const withoutSameDayReview = progress.reviews.filter(
    (review) =>
      !(review.questionId === questionId && review.reviewedOn === dateKey),
  );

  return {
    version: PROGRESS_VERSION,
    reviews: [
      ...withoutSameDayReview,
      {
        questionId,
        reviewedOn: dateKey,
        rating,
        nextDueOn: nextDueDate(dateKey, rating),
      },
    ],
  };
}

export function mergeProgress(
  ...progressSets: PracticeProgress[]
): PracticeProgress {
  const reviews = new Map<string, Review>();
  for (const progress of progressSets) {
    for (const review of progress.reviews) {
      reviews.set(`${review.questionId}:${review.reviewedOn}`, review);
    }
  }

  return {
    version: PROGRESS_VERSION,
    reviews: [...reviews.values()].sort(
      (left, right) =>
        left.reviewedOn.localeCompare(right.reviewedOn) ||
        left.questionId.localeCompare(right.questionId),
    ),
  };
}

export function reviewsForCloudSync(
  reviews: Review[],
  recentLimit = 500,
): Review[] {
  const newestFirst = [...reviews].sort(
    (left, right) =>
      right.reviewedOn.localeCompare(left.reviewedOn) ||
      left.questionId.localeCompare(right.questionId),
  );
  const selected = new Map<string, Review>();

  newestFirst.slice(0, recentLimit).forEach((review) => {
    selected.set(`${review.questionId}:${review.reviewedOn}`, review);
  });
  latestReviews(reviews).forEach((review) => {
    selected.set(`${review.questionId}:${review.reviewedOn}`, review);
  });

  return [...selected.values()];
}

export function calculateStreak(reviews: Review[], today: string): number {
  const reviewedDates = new Set(reviews.map((review) => review.reviewedOn));
  let cursor = reviewedDates.has(today) ? today : addDays(today, -1);
  let streak = 0;

  while (reviewedDates.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

export function parseProgress(raw: string | null): PracticeProgress {
  if (!raw) return EMPTY_PROGRESS;

  try {
    const value = JSON.parse(raw) as Partial<PracticeProgress>;
    if (value.version !== PROGRESS_VERSION || !Array.isArray(value.reviews)) {
      return EMPTY_PROGRESS;
    }

    const reviews = value.reviews.filter(
      (review): review is Review =>
        typeof review === "object" &&
        review !== null &&
        typeof review.questionId === "string" &&
        typeof review.reviewedOn === "string" &&
        ["again", "hard", "good", "easy"].includes(review.rating) &&
        typeof review.nextDueOn === "string",
    );

    return { version: PROGRESS_VERSION, reviews };
  } catch {
    return EMPTY_PROGRESS;
  }
}
